"""support standalone driver profiles

Revision ID: 1df04d5712cb
Revises: edf3eb36368a
Create Date: 2026-10-30 15:17:13.413692

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "1df04d5712cb"
down_revision: Union[str, Sequence[str], None] = "edf3eb36368a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add the new name column as nullable temporarily.
    op.add_column(
        "drivers",
        sa.Column("full_name", sa.String(length=100), nullable=True),
    )

    # 2. Copy names from the existing linked user accounts.
    op.execute(
        sa.text(
            """
            UPDATE drivers
            SET full_name = users.full_name
            FROM users
            WHERE drivers.user_id = users.id
            """
        )
    )

    # 3. Ensure every existing driver received a name.
    op.alter_column(
        "drivers",
        "full_name",
        existing_type=sa.String(length=100),
        nullable=False,
    )

    # 4. Allow new driver profiles without individual user accounts.
    op.alter_column(
        "drivers",
        "user_id",
        existing_type=sa.Integer(),
        existing_nullable=False,
        nullable=True,
    )


def downgrade() -> None:
    # Do not discard standalone driver profiles during downgrade.
    connection = op.get_bind()

    standalone_drivers = connection.execute(
        sa.text(
            "SELECT COUNT(*) FROM drivers WHERE user_id IS NULL"
        )
    ).scalar_one()

    if standalone_drivers:
        raise RuntimeError(
            "Cannot downgrade: standalone driver profiles exist. "
            "Link them to user accounts before downgrading."
        )

    # Restore the original user_id requirement.
    op.alter_column(
        "drivers",
        "user_id",
        existing_type=sa.Integer(),
        existing_nullable=True,
        nullable=False,
    )

    # Remove the name column introduced by this migration.
    op.drop_column("drivers", "full_name")