# FleetFlow
### Move Smarter. Manage Better. Deliver Faster.

**An Intelligent Fleet Management & Logistics Operations Platform**

## 1. About FleetFlow

Managing a fleet involves much more than keeping track of vehicles. It means coordinating drivers, planning delivery routes, monitoring shipments, maintaining vehicles, managing fuel expenses, and ensuring that daily operations run smoothly.

**FleetFlow brings all these activities together in one centralized platform.**

It is designed to help logistics companies and fleet operators manage their transportation activities with greater visibility, organization, and control.

From registering a vehicle to tracking a shipment and reviewing delivery performance, FleetFlow provides a connected workspace for every stage of fleet operations.

## 2. What Makes FleetFlow Useful?

FleetFlow connects the major parts of transportation management instead of keeping them in separate systems.

- **One Fleet Workspace:** Manage vehicles, drivers, and fleet activities from a central dashboard.
- **Connected Delivery Operations:** Organize shipments, schedules, routes, and delivery progress.
- **Location Visibility:** View vehicle positions and GPS location history.
- **Smarter Planning:** Calculate routes, travel distances, and estimated arrival times.
- **Vehicle Care:** Organize maintenance schedules, service records, and inspections.
- **Operational Insights:** Understand fuel expenses, attendance, delivery performance, and fleet activity through reports.

## 3. Explore the Platform

### Fleet Overview – Your Operations at a Glance

Get a centralized view of fleet activities and important operational information.

- Vehicle and driver management.
- Fleet activity overview.
- Vehicle status monitoring.
- Operational dashboards.
- Maintenance and inspection information.

### Driver Management – Keep Your Team Connected

Manage driver information and coordinate driver-related activities.

- Create and manage driver profiles.
- Connect drivers with their vehicles.
- Manage driver accounts and access permissions.
- Record attendance.
- Review delivery performance.
- Maintain driver activity history.

### Shipment Management – From Scheduling to Delivery

Organize shipment information and follow its progress through the delivery process.

- Create and manage shipments.
- Schedule deliveries.
- Update shipment statuses.
- Review shipment history.
- Monitor delivery progress.
- Track estimated arrival times.

### Route Planning – Plan Every Journey

Plan transportation routes using geographic locations and routing information.

- Calculate travel distances.
- Estimate journey durations.
- View routes on interactive maps.
- Explore available alternative routes.
- Calculate and save shipment ETAs.

### GPS Tracking – See Where Your Fleet Is

View vehicle locations and follow location updates through the tracking interface.

- Display vehicle locations on maps.
- Review GPS location history.
- View live simulated GPS updates.
- Receive location updates through WebSockets.
- Connect vehicle and shipment tracking information.

### Maintenance Management – Take Care of Your Vehicles

Keep vehicle servicing and inspection records organized.

- Create maintenance records.
- Schedule vehicle servicing.
- Record service costs and dates.
- Track upcoming maintenance dates.
- Record vehicle inspections.
- Review vehicle maintenance history.

### Fuel Management – Understand Fuel Expenses

Maintain organized fuel records for better expense visibility.

- Record fuel purchases.
- Track fuel quantity and cost.
- Save odometer readings.
- Record full-tank refills.
- Calculate fuel efficiency using recorded readings.
- Review fuel-related reports.

### Attendance and Driver Performance

Manage driver attendance and review delivery-related performance.

- Record present, absent, and leave status.
- View attendance history.
- Review delivery performance.
- Analyze on-time deliveries using recorded ETAs.
- Generate driver performance reports.

### Analytics and Reports – Turn Records into Insights

Use operational data to understand fleet activities and support better decisions.

Available reporting areas include:

- Fleet analytics.
- Fuel purchase reports.
- Driver performance.
- Delivery performance.
- Maintenance summaries.
- Vehicle inspection reports.

Export reports in PDF and Excel formats.

### Notifications and Background Tasks

Keep operational activities organized through in-app notifications and scheduled processing.

- Maintenance reminders.
- In-app alerts.
- Scheduled maintenance scans.
- Background task processing.

## 4. User Roles and Responsibilities

FleetFlow provides role-based access so each person can work with the information relevant to their responsibilities.

| Role | Main Responsibilities |
|---|---|
| Administrator | Manage users, drivers, vehicles, and overall fleet operations. |
| Fleet Manager | Coordinate fleet resources, drivers, maintenance, and operational records. |
| Dispatcher | Coordinate shipments, routes, vehicle information, and delivery activities. |
| Driver | View assigned shipments, linked vehicle details, attendance, and personal driving information. |

Access permissions are enforced by the backend, keeping protected operations available only to authorized users.

## 5. Technology Behind FleetFlow

FleetFlow uses a modern technology stack to connect its user interface, business logic, database, and background services.

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React + Vite | Interactive user interface |
| Backend | Python + FastAPI | Application logic and APIs |
| Database | PostgreSQL | Store application information |
| ORM | SQLAlchemy | Database interaction |
| Migrations | Alembic | Database schema management |
| Authentication | JWT | Secure user authentication |
| API Requests | Axios | Frontend and backend communication |
| Live Updates | WebSockets | Real-time location updates |
| Background Tasks | Celery | Scheduled and asynchronous processing |
| Message Broker | Redis | Background task communication |
| Maps and Routing | OpenStreetMap + OSRM | Geographic and route information |
| Containerization | Docker | Database and service setup |

## 6. How FleetFlow Is Organized

The project uses a modular structure that separates the frontend, backend, database models, and application services.

```text
FleetFlow/
│
├── backend/
│   ├── app/
│   │   ├── api/          # Application endpoints
│   │   ├── core/         # Configuration and security
│   │   ├── models/       # Database models
│   │   ├── schemas/      # Data validation
│   │   ├── services/     # Business logic
│   │   └── tasks/        # Background tasks
│   │
│   ├── alembic/          # Database migrations
│   ├── tests/            # Backend tests
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── public/
│   ├── src/              # React application
│   ├── package.json
│   └── vite.config.js
│
├── docker-compose.yml
├── .gitignore
└── README.md
```

## 7. Getting Started with FleetFlow

Follow these steps to set up FleetFlow on your Windows development environment.

### Step 1 – Install the Required Tools

Make sure you have installed:

- Python 3.11
- Node.js and npm
- Docker Desktop
- Visual Studio Code
- Git

### Step 2 – Get the Project

Open PowerShell and clone the repository:

```powershell
git clone <repository-url>
cd FleetFlow
```

### Step 3 – Start the Database Services

From the project root:

```powershell
docker compose up -d postgres redis
```

### Step 4 – Prepare the Backend

Open the backend directory:

```powershell
cd backend
```

Create a Python virtual environment:

```powershell
py -3.11 -m venv .venv
```

Activate it:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install the Python packages:

```powershell
pip install -r requirements.txt
```

### Step 5 – Configure the Backend

Create a file named `backend/.env` and add your database connection and application secret:

```env
DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@127.0.0.1:5433/fleetflow
SECRET_KEY=YOUR_SECURE_SECRET_KEY
DEBUG=development
```

Replace the example values with your actual configuration.

### Step 6 – Prepare the Database

Run the database migrations:

```powershell
python -m alembic upgrade head
```

Check the current migration:

```powershell
python -m alembic current
```

### Step 7 – Launch the Backend

Start the FastAPI server:

```powershell
python -m uvicorn app.main:app --reload
```

Backend address:

`http://127.0.0.1:8000`

Interactive API documentation:

`http://127.0.0.1:8000/docs`

### Step 8 – Launch the Frontend

Open a second PowerShell terminal and navigate to the frontend:

```powershell
cd frontend
```

Install frontend dependencies:

```powershell
npm ci
```

Start the development server:

```powershell
npm run dev
```

Open FleetFlow in your browser:

`http://localhost:5173`

## 8. Database Management

FleetFlow uses PostgreSQL to organize its application data and Alembic to manage database changes.

Useful commands:

```powershell
python -m alembic current
python -m alembic upgrade head
python -m alembic history
```

## 9. Testing the Application

### Backend

Run backend tests from the `backend` directory:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

### Frontend

Run the frontend checks from the `frontend` directory:

```powershell
npm run lint
npm run build
```

## 10. Background Services

FleetFlow uses Celery and Redis for background processing and scheduled maintenance reminders.

Start Redis:

```powershell
docker compose up -d redis
```

Start the background worker and scheduler:

```powershell
docker compose --profile background up -d --build celery-worker celery-beat
```

## 11. The FleetFlow Experience

A typical fleet operation can be managed through the following workflow:

1. **Register:** Add vehicles and driver information to the platform.
2. **Organize:** Create shipments and schedule delivery activities.
3. **Plan:** Calculate delivery routes and estimated arrival times.
4. **Track:** View vehicle locations and shipment progress.
5. **Maintain:** Record servicing, inspections, and fuel purchases.
6. **Analyze:** Review attendance, delivery performance, and fleet reports.

Each stage connects with the others, helping teams coordinate their daily transportation activities from one place.

## 12. Project Vision

FleetFlow aims to make fleet operations more connected, organized, and data-driven.

By bringing fleet administration, shipment coordination, route planning, GPS tracking, maintenance, and analytics into a unified platform, FleetFlow gives logistics teams a shared place to manage their transportation operations.

**FleetFlow – Move Smarter. Manage Better. Deliver Faster.**
