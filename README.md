# FleetFlow – Intelligent Fleet Management System

FleetFlow is a web-based fleet management platform designed to simplify vehicle operations, driver management, trip monitoring, maintenance scheduling, fuel tracking, and operational analytics.

The system provides a centralized interface for managing fleet activities and monitoring operational performance. It is developed using React, FastAPI, and PostgreSQL, with Redis and Celery supporting background processing.

## Key Features

- **Authentication and Role-Based Access:** Secure login and access control for Admin, Manager, Dispatcher, and Driver roles.
- **Fleet Management:** Manage vehicles, drivers, and fleet information.
- **Driver Assignment:** Assign drivers and vehicles to trips while considering availability.
- **Trip Management:** Create trips and monitor their progress.
- **Shipment Management:** Manage shipments, delivery statuses, and tracking information.
- **Vehicle Tracking:** Monitor vehicle location information.
- **Maintenance Management:** Schedule vehicle maintenance and maintain service records.
- **Maintenance Alerts:** Identify upcoming and overdue maintenance activities.
- **Fuel Analytics:** Record fuel transactions and analyze consumption and expenses.
- **Operating Cost Analysis:** Monitor fleet operating expenses.
- **Fleet Performance Analytics:** View operational metrics and fleet performance.
- **Reports:** Generate maintenance and delivery reports in PDF and Excel formats.
- **Background Processing:** Use Celery and Redis for scheduled and background tasks.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | React.js, Vite |
| Backend | Python, FastAPI |
| Database | PostgreSQL |
| ORM | SQLAlchemy |
| Database Migrations | Alembic |
| Authentication | JWT |
| Background Tasks | Celery |
| Message Broker | Redis |
| Version Control | Git and GitHub |
| Deployment | Render (planned) |

## Project Architecture

The application follows a frontend-backend architecture.

- **Frontend:** React provides the user interface and communicates with backend APIs.
- **Backend:** FastAPI handles application logic, authentication, authorization, and API requests.
- **Database:** PostgreSQL stores application records.
- **Background Processing:** Celery workers execute background tasks using Redis as the message broker.

## Project Structure

```text
FleetFlow/
│
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── models/
│   ├── routers/
│   ├── schemas/
│   ├── services/
│   └── ...
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── ...
│
├── .gitignore
└── README.md
```

*The folder structure above is illustrative; refer to the actual repository for the complete structure.*

## Installation and Local Setup

### Prerequisites

Install the following before running the project:

- Python
- Node.js and npm
- PostgreSQL
- Redis

### 1. Clone the Repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd <YOUR_PROJECT_FOLDER>
```

### 2. Backend Setup

Open a terminal in the backend directory:

```bash
cd backend
```

Create and activate a virtual environment:

```bash
python -m venv venv
```

Windows:

```bash
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

### 3. Configure Backend Environment Variables

Create a `.env` file inside the backend directory.

Configure the required values using your local database and application settings:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fleetflow_db
DB_USER=postgres
DB_PASSWORD=YOUR_POSTGRES_PASSWORD

JWT_SECRET_KEY=YOUR_SECRET_KEY
```

Add the Redis and Celery environment variables required by your existing backend configuration.

**Security:** Never commit `.env` files, database passwords, JWT secrets, or other credentials to GitHub.

### 4. Start the Backend

From the backend directory:

```bash
uvicorn main:app --reload
```

Backend API:

```text
http://127.0.0.1:8000
```

API documentation:

```text
http://127.0.0.1:8000/docs
```

### 5. Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend normally runs at:

```text
http://localhost:5173
```

### 6. Redis and Celery

Start Redis, the Celery worker, and Celery Beat using the commands and configuration already provided in the project.

Keep the required services running while testing background jobs.

## Database Migrations

FleetFlow uses Alembic for database schema migrations.

Run migration commands from the backend directory:

```bash
alembic upgrade head
```

## Deployment

Cloud deployment is planned using Render.

The deployment process includes:

1. Render PostgreSQL database.
2. FastAPI backend Web Service.
3. React frontend Static Site.
4. Redis service.
5. Celery Background Worker.
6. Celery Beat Background Worker.
7. Final online testing and validation.

Cloud deployment will be marked complete after all services are deployed and tested successfully.

## Security

- Authentication uses JWT.
- Role-based permissions are enforced by backend APIs.
- Environment variables are used for sensitive configuration.
- Secret files and generated files are excluded through `.gitignore`.

## Project Status

| Milestone | Status |
|---|---|
| Milestone 1 – Core Setup and Fleet Management | Completed |
| Milestone 2 – Shipment Tracking and Route Management | Completed |
| Milestone 3 – Maintenance and Analytics | Completed |
| Milestone 4 – Testing, Deployment and Documentation | In Progress |

## Author

**Kogila Prasanna**

B.Tech Final-Year Project

**Project:** FleetFlow – Intelligent Fleet Management System