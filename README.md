# FleetFlow – Fleet Management System

A full-stack fleet management platform to manage vehicles, drivers, shipments and trips, with GPS tracking and route calculation.

## Features
- JWT login with protected API endpoints
- Vehicle and driver management, with a driver dashboard
- Shipment creation, listing and status updates
- Trip scheduling linked to shipments, vehicles and drivers
- Live GPS map with real-time location updates over WebSockets
- Route distance and ETA calculation using OSRM

## Tech Stack
- **Frontend:** React, Vite, JavaScript (JSX), CSS
- **Backend:** Python, FastAPI, SQLAlchemy, Alembic, WebSockets
- **Database:** PostgreSQL
- **Tools:** Docker Compose, OSRM public routing service

## Project Structure
```
FleetFlow/
├── backend/    # FastAPI app, models, auth, Alembic migrations
├── frontend/   # React app (Vite)
└── docker-compose.yml
```

## Setup

### 1. Backend
Create a `backend/.env` file with your own database settings (never commit it), then run from the project root:
```
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
cd ..
.\backend\venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --port 8010 --reload
```
API docs: http://127.0.0.1:8010/docs

### 2. Frontend
```
cd frontend
npm install
npm run dev
```
App: http://localhost:5173

## Status
- **Milestone 1:** Completed
- **Milestone 2:** Shipment tracking, GPS tracking, route calculation and real-time monitoring are implemented.
- GPS coordinates may include simulated data and are not from real GPS hardware.
- ETA is based on OSRM route estimates, not live traffic data.

## Author
Chandana Chemuru  
GitHub: [chandanachemuru9-png](https://github.com/chandanachemuru9-png)  
LinkedIn: https://www.linkedin.com/in/chemuru-chandana-28a5a22a7
