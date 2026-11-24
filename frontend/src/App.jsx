import { useState, useEffect } from "react";
import "./App.css";
import GPSTracking from "./GPSTracking";
import "leaflet/dist/leaflet.css";
import DriverDashboard from "./DriverDashboard";
import MaintenancePage from "./MaintenancePage";
import DriverAssignment from "./DriverAssignment";
import MaintenanceAlerts from "./MaintenanceAlerts";
import FuelManagement from "./FuelManagement";
import MaintenanceReports from "./MaintenanceReports";
const API_URL = "http://127.0.0.1:8010";

const EMPTY_VEHICLE = {
  vehicle_number: "",
  vehicle_type: "Truck",
  capacity: 10,
  status: "Active",
  driver_id: "",
  fuel_type: "",
};

const EMPTY_DRIVER = {
  full_name: "",
  phone: "",
  license_number: "",
};

function App() {
  const [activePage, setActivePage] = useState("Dashboard");

  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [showShipmentForm, setShowShipmentForm] = useState(false);
  const [trips, setTrips] = useState([]);
  const [showTripForm, setShowTripForm] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loggedIn, setLoggedIn] = useState(
    Boolean(localStorage.getItem("access_token")),
  );

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);

  const [vehicleForm, setVehicleForm] = useState({
    ...EMPTY_VEHICLE,
  });

  const [showDriverForm, setShowDriverForm] = useState(false);

  const [driverForm, setDriverForm] = useState({
    ...EMPTY_DRIVER,
  });
  const [editingDriver, setEditingDriver] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const token = () => localStorage.getItem("access_token");
  const [routeResult, setRouteResult] = useState(null);

  // API REQUEST HELPER
  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        ...options.headers,
      },
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      localStorage.removeItem("access_token");
      setLoggedIn(false);
      setVehicles([]);
      setDrivers([]);

      throw new Error("Session expired. Please log in again.");
    }

    if (!response.ok) {
      throw new Error(data.detail || data.message || "Request failed.");
    }

    return data;
  }

  // LOGIN
  async function handleLogin(event) {
    event.preventDefault();

    setMessage("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || "Login failed.");
      }

      localStorage.setItem("access_token", data.access_token);

      setLoggedIn(true);
      setPassword("");
      setMessage("Login successful!");

      await loadVehicles();
      await loadDrivers();
      await loadShipments();
      await loadTrips();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  // LOGOUT
  function handleLogout() {
    localStorage.removeItem("access_token");

    setLoggedIn(false);
    setVehicles([]);
    setDrivers([]);

    setEmail("");
    setPassword("");
    setMessage("");

    setActivePage("Dashboard");
  }

  // LOAD VEHICLES
  async function loadVehicles() {
    try {
      const data = await apiRequest("/vehicles");
      setVehicles(data);
    } catch (error) {
      setMessage(error.message);
    }
  }

  // LOAD DRIVERS
  async function loadDrivers() {
    try {
      const data = await apiRequest("/drivers");
      setDrivers(data);
    } catch (error) {
      setMessage(error.message);
    }
  }
  async function loadShipments() {
    try {
      const data = await apiRequest("/shipments");
      setShipments(Array.isArray(data) ? data : []);
    } catch (error) {
      setMessage("Could not load shipments. Please try again.");
    }
  }
  // LOAD TRIPS
  async function loadTrips() {
    try {
      const data = await apiRequest("/trips");
      console.log("Trips received from backend:", data);
      setTrips(Array.isArray(data) ? data : []);
    } catch (error) {
      setMessage(error.message || "Could not load trips.");
    }
  }

  // LOAD DATA WHEN APPLICATION OPENS
  useEffect(() => {
    if (localStorage.getItem("access_token")) {
      loadVehicles();
      loadDrivers();
      loadShipments();
      loadTrips();
    }
  }, []);

  // OPEN VEHICLE REGISTRATION FORM
  function openVehicleForm() {
    setEditingVehicle(null);

    setVehicleForm({
      ...EMPTY_VEHICLE,
    });

    setShowVehicleForm(true);
    setMessage("");
  }

  // EDIT VEHICLE
  function handleEditVehicle(vehicle) {
    setEditingVehicle(vehicle);

    setVehicleForm({
      vehicle_number: vehicle.vehicle_number || "",
      vehicle_type: vehicle.vehicle_type || "Truck",
      capacity: vehicle.capacity ?? 10,
      status: vehicle.status || "Active",

      driver_id: vehicle.driver_id != null ? String(vehicle.driver_id) : "",

      fuel_type: vehicle.fuel_type || "",
    });

    setShowVehicleForm(true);
    setMessage("");
  }

  // REGISTER OR UPDATE VEHICLE
  async function saveVehicle(event) {
    event.preventDefault();
    setMessage("");

    const payload = {
      vehicle_number: vehicleForm.vehicle_number.trim(),

      vehicle_type: vehicleForm.vehicle_type,

      capacity: Number(vehicleForm.capacity),

      status: vehicleForm.status,

      driver_id: vehicleForm.driver_id ? Number(vehicleForm.driver_id) : null,

      fuel_type: vehicleForm.fuel_type || null,
    };

    if (
      !payload.vehicle_number ||
      !payload.vehicle_type ||
      !Number.isFinite(payload.capacity) ||
      payload.capacity <= 0
    ) {
      setMessage("Please enter valid vehicle details.");
      return;
    }

    setLoading(true);

    try {
      if (editingVehicle) {
        await apiRequest(`/vehicles/${editingVehicle.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });

        setMessage("Vehicle updated successfully!");
      } else {
        await apiRequest("/vehicles", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        setMessage("Vehicle registered successfully!");
      }

      setShowVehicleForm(false);
      setEditingVehicle(null);

      setVehicleForm({
        ...EMPTY_VEHICLE,
      });

      await loadVehicles();
      await loadDrivers();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }
  function handleEditDriver(driver) {
    setEditingDriver(driver);

    setDriverForm({
      full_name: driver.full_name,
      phone: driver.phone,
      license_number: driver.license_number,
    });

    setShowDriverForm(true);
    setMessage("");
  }

  // ADD DRIVER
  async function addDriver(event) {
    event.preventDefault();
    setMessage("");

    const payload = {
      full_name: driverForm.full_name.trim(),
      phone: driverForm.phone.trim(),
      license_number: driverForm.license_number.trim(),
    };

    if (!payload.full_name || !payload.phone || !payload.license_number) {
      setMessage("Please complete all driver fields.");
      return;
    }

    setLoading(true);

    try {
      const result = await apiRequest(
        editingDriver ? `/drivers/${editingDriver.id}` : "/drivers",
        {
          method: editingDriver ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      );

      setMessage(
        result.message ||
          (editingDriver
            ? "Driver updated successfully!"
            : "Driver added successfully!"),
      );

      setEditingDriver(null);
      setDriverForm({ ...EMPTY_DRIVER });
      setShowDriverForm(false);

      await loadDrivers();
      await loadVehicles();
    } catch (error) {
      setMessage(error.message || "Failed to add driver.");
    } finally {
      setLoading(false);
    }
  }

  // DASHBOARD STATISTICS
  const totalVehicles = vehicles.length;

  const activeVehicles = vehicles.filter(
    (vehicle) => vehicle.status === "Active" || vehicle.status === "Assigned",
  ).length;

  const maintenanceVehicles = vehicles.filter(
    (vehicle) => vehicle.status === "In Maintenance",
  ).length;

  const unassignedVehicles = vehicles.filter(
    (vehicle) => vehicle.driver_id == null && !vehicle.driver,
  ).length;

  // VEHICLE SEARCH AND FILTER
  const filteredVehicles = vehicles.filter((vehicle) => {
    const text = search.toLowerCase();

    const matchesSearch =
      (vehicle.vehicle_number || "").toLowerCase().includes(text) ||
      (vehicle.vehicle_type || "").toLowerCase().includes(text);

    const matchesStatus =
      statusFilter === "All" || vehicle.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // SIDEBAR MENU ITEMS
  const menuItems = [
    "Dashboard",
    "Fleet Management",
    "Driver Management",
    "Driver Dashboard",
    "Shipments",
    "Trip Scheduling",
    "GPS Tracking",
    "Route Planning",
    "Maintenance",
    "Driver Assignment",
    "Maintenance Alerts",
    "Maintenance Reports",
    "Fuel Management",
  ];
  // VEHICLE REGISTRATION AND EDITING FORM
  function renderVehicleForm() {
    return (
      <form className="vehicle-form" onSubmit={saveVehicle}>
        <h3>{editingVehicle ? "Update Vehicle" : "Register Vehicle"}</h3>

        <label>
          Registration Number
          <input
            type="text"
            value={vehicleForm.vehicle_number}
            onChange={(event) =>
              setVehicleForm({
                ...vehicleForm,
                vehicle_number: event.target.value,
              })
            }
            required
          />
        </label>

        <label>
          Vehicle Type
          <select
            value={vehicleForm.vehicle_type}
            onChange={(event) =>
              setVehicleForm({
                ...vehicleForm,
                vehicle_type: event.target.value,
              })
            }
          >
            <option value="Truck">Truck</option>
            <option value="Van">Van</option>
            <option value="Car">Car</option>
            <option value="Bus">Bus</option>
            <option value="Trailer">Trailer</option>
          </select>
        </label>

        <label>
          Capacity
          <input
            type="number"
            min="1"
            value={vehicleForm.capacity}
            onChange={(event) =>
              setVehicleForm({
                ...vehicleForm,
                capacity: event.target.value,
              })
            }
            required
          />
        </label>

        <label>
          Status
          <select
            value={vehicleForm.status}
            onChange={(event) =>
              setVehicleForm({
                ...vehicleForm,
                status: event.target.value,
              })
            }
          >
            <option value="Active">Active</option>
            <option value="Assigned">Assigned</option>
            <option value="In Maintenance">In Maintenance</option>
            <option value="Inactive">Inactive</option>
          </select>
        </label>

        <label>
          Fuel Type
          <select
            value={vehicleForm.fuel_type}
            onChange={(event) =>
              setVehicleForm({
                ...vehicleForm,
                fuel_type: event.target.value,
              })
            }
          >
            <option value="">Not specified</option>
            <option value="Diesel">Diesel</option>
            <option value="Petrol">Petrol</option>
            <option value="CNG">CNG</option>
            <option value="LPG">LPG</option>
          </select>
        </label>

        <label>
          Assign Driver
          <select
            value={vehicleForm.driver_id}
            onChange={(event) =>
              setVehicleForm({
                ...vehicleForm,
                driver_id: event.target.value,
              })
            }
          >
            <option value="">Not Assigned</option>

            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.full_name}
              </option>
            ))}
          </select>
        </label>

        <div className="form-actions">
          <button type="submit" disabled={loading}>
            {loading
              ? "Saving..."
              : editingVehicle
                ? "Save Changes"
                : "Register Vehicle"}
          </button>

          <button
            type="button"
            onClick={() => {
              setShowVehicleForm(false);
              setEditingVehicle(null);

              setVehicleForm({
                ...EMPTY_VEHICLE,
              });

              setMessage("");
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  // DASHBOARD
  function renderDashboard() {
    return (
      <>
        <section className="welcome-banner">
          <p className="eyebrow">FLEET MANAGEMENT SYSTEM</p>

          <h1>Welcome to FleetFlow</h1>

          <p>
            Manage vehicles, monitor availability, and organize your fleet from
            one place.
          </p>
        </section>

        <section className="stats-grid">
          <article className="stat-card">
            <span className="stat-icon">🚚</span>
            <h3>Total Vehicles</h3>
            <strong>{totalVehicles}</strong>
            <p>Registered vehicles</p>
          </article>

          <article className="stat-card">
            <span className="stat-icon">✅</span>
            <h3>Active Vehicles</h3>
            <strong>{activeVehicles}</strong>
            <p>Currently active</p>
          </article>

          <article className="stat-card">
            <span className="stat-icon">🔧</span>
            <h3>In Maintenance</h3>
            <strong>{maintenanceVehicles}</strong>
            <p>Vehicles under maintenance</p>
          </article>

          <article className="stat-card">
            <span className="stat-icon">🚗</span>
            <h3>Unassigned Vehicles</h3>
            <strong>{unassignedVehicles}</strong>
            <p>Vehicles without a driver</p>
          </article>
        </section>

        <section className="content-section">
          <div className="page-header">
            <h2>Fleet Overview</h2>

            <button
              type="button"
              onClick={() => {
                loadVehicles();
                loadDrivers();
              }}
            >
              Refresh
            </button>
          </div>

          <div className="table-controls">
            <input
              type="text"
              placeholder="Search vehicles..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Assigned">Assigned</option>
              <option value="In Maintenance">In Maintenance</option>
              <option value="Inactive">Inactive</option>
            </select>

            <button type="button" onClick={openVehicleForm}>
              + Register Vehicle
            </button>
          </div>

          {showVehicleForm && renderVehicleForm()}

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Registration</th>
                  <th>Vehicle Type</th>
                  <th>Capacity</th>
                  <th>Status</th>
                  <th>Driver</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredVehicles.map((vehicle) => (
                  <tr key={vehicle.id}>
                    <td>{vehicle.vehicle_number}</td>

                    <td>{vehicle.vehicle_type}</td>

                    <td>{vehicle.capacity}</td>

                    <td>{vehicle.status}</td>

                    <td>
                      {vehicle.driver ||
                        drivers.find(
                          (driver) => driver.id === vehicle.driver_id,
                        )?.full_name ||
                        "Not Assigned"}
                    </td>

                    <td>
                      <button
                        type="button"
                        onClick={() => handleEditVehicle(vehicle)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredVehicles.length === 0 && (
                  <tr>
                    <td colSpan="6">No vehicles found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  }
  // SHIPMENT MANAGEMENT
  function renderShipmentManagement() {
    return (
      <section className="content-section">
        <div className="page-header">
          <div>
            <h1>Shipment Management</h1>
            <p>Create and track your shipments.</p>
          </div>

          <button
            type="button"
            onClick={() => setShowShipmentForm(!showShipmentForm)}
          >
            {showShipmentForm ? "Cancel" : "+ Add Shipment"}
          </button>
        </div>

        {showShipmentForm && (
          <form
            className="vehicle-form"
            onSubmit={async (event) => {
              event.preventDefault();

              const formData = new FormData(event.currentTarget);

              const shipment = {
                shipment_number: formData.get("shipment_number"),
                pickup_location: formData.get("pickup_location"),
                delivery_location: formData.get("delivery_location"),
                vehicle_id: Number(formData.get("vehicle_id")),
                driver_id: Number(formData.get("driver_id")),
              };

              try {
                await apiRequest("/shipments", {
                  method: "POST",
                  body: JSON.stringify(shipment),
                });

                setMessage("Shipment created successfully!");
                setShowShipmentForm(false);
                await loadShipments();
              } catch (error) {
                setMessage(error.message || "Failed to create shipment.");
              }
            }}
          >
            <label>
              Shipment Number
              <input
                name="shipment_number"
                placeholder="e.g. SHP-1003"
                required
              />
            </label>

            <label>
              Pickup Location
              <input
                name="pickup_location"
                placeholder="e.g. Tirupati"
                required
              />
            </label>

            <label>
              Delivery Location
              <input
                name="delivery_location"
                placeholder="e.g. Hyderabad"
                required
              />
            </label>

            <label>
              Vehicle
              <select name="vehicle_id" required defaultValue="">
                <option value="" disabled>
                  Select vehicle
                </option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.vehicle_number}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Driver
              <select name="driver_id" required defaultValue="">
                <option value="" disabled>
                  Select driver
                </option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.full_name}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit">Create Shipment</button>
          </form>
        )}

        <div className="table-wrapper">
          <h2>All Shipments</h2>

          <table>
            <thead>
              <tr>
                <th>Shipment Number</th>
                <th>Pickup</th>
                <th>Delivery</th>
                <th>Status</th>
                <th>Vehicle ID</th>
                <th>Driver ID</th>
              </tr>
            </thead>

            <tbody>
              {shipments.map((shipment) => (
                <tr key={shipment.id}>
                  <td>{shipment.shipment_number}</td>
                  <td>{shipment.pickup_location}</td>
                  <td>{shipment.delivery_location}</td>
                  <td>{shipment.status}</td>
                  <td>{shipment.vehicle_id}</td>
                  <td>{shipment.driver_id}</td>
                </tr>
              ))}

              {shipments.length === 0 && (
                <tr>
                  <td colSpan="6">No shipments found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }
  // TRIP MANAGEMENT
  function renderTripManagement() {
    async function handleScheduleTrip(event) {
      event.preventDefault();

      const formData = new FormData(event.currentTarget);

      const trip = {
        trip_number: formData.get("trip_number"),
        shipment_id: Number(formData.get("shipment_id")),
        vehicle_id: Number(formData.get("vehicle_id")),
        driver_id: Number(formData.get("driver_id")),
        start_location: formData.get("start_location"),
        destination: formData.get("destination"),
      };

      try {
        const result = await apiRequest("/trips", {
          method: "POST",
          body: JSON.stringify(trip),
        });

        setMessage(result.message || "Trip scheduled successfully!");
        event.currentTarget.reset();
        await loadTrips();
      } catch (error) {
        setMessage(error.message || "Could not schedule trip.");
      }
    }

    return (
      <section className="content-section">
        <div className="page-header">
          <div>
            <h1>Trip Scheduling</h1>
            <p>Schedule and manage fleet trips.</p>
          </div>

          <button type="button" onClick={() => setShowTripForm(!showTripForm)}>
            {showTripForm ? "Cancel" : "+ Schedule Trip"}
          </button>
        </div>

        {showTripForm && (
          <form className="vehicle-form" onSubmit={handleScheduleTrip}>
            <label>
              Trip Number
              <input name="trip_number" placeholder="TRIP-1002" required />
            </label>

            <label>
              Shipment ID
              <select name="shipment_id" required defaultValue="">
                <option value="" disabled>
                  Select shipment
                </option>
                {shipments.map((shipment) => (
                  <option key={shipment.id} value={shipment.id}>
                    {shipment.shipment_number} (ID: {shipment.id})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Vehicle
              <select name="vehicle_id" required defaultValue="">
                <option value="" disabled>
                  Select vehicle
                </option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.vehicle_number} (ID: {vehicle.id})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Driver
              <select name="driver_id" required defaultValue="">
                <option value="" disabled>
                  Select driver
                </option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.full_name} (ID: {driver.id})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Starting Location
              <input name="start_location" required />
            </label>

            <label>
              Destination
              <input name="destination" required />
            </label>

            <button type="submit">Save Trip</button>
          </form>
        )}

        <div className="table-container">
          <h2>Scheduled Trips</h2>

          <table>
            <thead>
              <tr>
                <th>Trip Number</th>
                <th>Shipment ID</th>
                <th>Vehicle ID</th>
                <th>Driver ID</th>
                <th>Start</th>
                <th>Destination</th>
                <th>ETA</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {trips.length === 0 ? (
                <tr>
                  <td colSpan="7">No trips found.</td>
                </tr>
              ) : (
                trips.map((trip) => (
                  <tr key={trip.id}>
                    <td>{trip.trip_number}</td>
                    <td>{trip.shipment_id}</td>
                    <td>{trip.vehicle_id}</td>
                    <td>{trip.driver_id}</td>
                    <td>{trip.start_location}</td>
                    <td>{trip.destination}</td>
                    <td>{trip.eta || "Not calculated"}</td>
                    <td>
                      {trip.status}
                      <select
                        value={trip.status}
                        onChange={async (e) => {
                          try {
                            await apiRequest(
                              `/trips/${trip.id}/status?status=${encodeURIComponent(e.target.value)}`,
                              { method: "PUT" },
                            );
                            setMessage("Trip status updated successfully!");
                            await loadTrips();
                          } catch (error) {
                            setMessage(
                              error.message || "Could not update trip status.",
                            );
                          }
                        }}
                      >
                        <option value="Scheduled">Scheduled</option>
                        <option value="In Transits">In Progress</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  // DRIVER MANAGEMENT
  function renderDriverManagement() {
    return (
      <section className="content-section">
        <div className="page-header">
          <div>
            <h1>Driver Management</h1>

            <p>Register and manage your fleet drivers.</p>
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={() => {
                setShowDriverForm(!showDriverForm);
                setMessage("");
              }}
            >
              {showDriverForm ? "Cancel" : "+ Add Driver"}
            </button>

            <button type="button" onClick={loadDrivers}>
              Refresh Drivers
            </button>
          </div>
        </div>

        {showDriverForm && (
          <form className="vehicle-form" onSubmit={addDriver}>
            <h3>{editingDriver ? "Edit Driver" : "Register New Driver"}</h3>

            <label>
              Full Name
              <input
                type="text"
                value={driverForm.full_name}
                onChange={(event) =>
                  setDriverForm({
                    ...driverForm,
                    full_name: event.target.value,
                  })
                }
                minLength="2"
                required
              />
            </label>

            <label>
              Phone Number
              <input
                type="tel"
                value={driverForm.phone}
                onChange={(event) =>
                  setDriverForm({
                    ...driverForm,
                    phone: event.target.value,
                  })
                }
                minLength="10"
                maxLength="20"
                required
              />
            </label>

            <label>
              License Number
              <input
                type="text"
                value={driverForm.license_number}
                onChange={(event) =>
                  setDriverForm({
                    ...driverForm,
                    license_number: event.target.value,
                  })
                }
                minLength="3"
                required
              />
            </label>

            <div className="form-actions">
              <button type="submit" disabled={loading}>
                {loading
                  ? "Saving..."
                  : editingDriver
                    ? "Update Driver"
                    : "Save Driver"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowDriverForm(false);

                  setDriverForm({
                    ...EMPTY_DRIVER,
                  });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Driver Name</th>
                <th>Phone</th>
                <th>License Number</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {drivers.map((driver) => (
                <tr key={driver.id}>
                  <td>{driver.id}</td>
                  <td>{driver.full_name}</td>
                  <td>{driver.phone}</td>
                  <td>{driver.license_number}</td>
                  <td>{driver.status}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleEditDriver(driver)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}

              {drivers.length === 0 && (
                <tr>
                  <td colSpan="5">No drivers found. Add a driver to begin.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }
  // LOGIN SCREEN
  if (!loggedIn) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>FleetFlow</h1>

          <p>Fleet Management &amp; Logistics Tracking</p>

          {message && <div className="message">{message}</div>}

          <form onSubmit={handleLogin}>
            <label>
              Email Address
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
              />
            </label>

            <button type="submit" disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // MAIN APPLICATION LAYOUT
  return (
    <div className="app-container">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h2>🚚 FleetFlow</h2>
          <p>Fleet Management</p>
        </div>

        <nav>
          {menuItems.map((item) => (
            <button
              key={item}
              type="button"
              className={activePage === item ? "active" : ""}
              onClick={() => {
                setActivePage(item);
                setMessage("");

                if (item === "Driver Management") {
                  loadDrivers();
                }

                if (item === "Shipments" || item === "Trip Scheduling") {
                  loadShipments();
                  loadTrips();
                  loadVehicles();
                  loadDrivers();
                }

                if (item === "Dashboard" || item === "Fleet Management") {
                  loadVehicles();
                }
              }}
            >
              {item}
            </button>
          ))}
        </nav>

        <button type="button" className="logout-button" onClick={handleLogout}>
          Log Out
        </button>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        <header className="top-header">
          <div>
            <h2>{activePage}</h2>
            <p>FleetFlow Management Platform</p>
          </div>

          <button type="button" onClick={handleLogout}>
            Log Out
          </button>
        </header>

        {/* SUCCESS AND ERROR MESSAGES */}
        {message && <div className="message">{message}</div>}

        {/* PAGE ROUTING */}
        {activePage === "Dashboard" || activePage === "Fleet Management" ? (
          renderDashboard()
        ) : activePage === "Driver Dashboard" ? (
          <DriverDashboard />
        ) : activePage === "Driver Management" ? (
          renderDriverManagement()
        ) : activePage === "Shipments" ? (
          renderShipmentManagement()
        ) : activePage === "Trip Scheduling" ? (
          renderTripManagement()
        ) : activePage === "Maintenance" ? (
          <MaintenancePage
            apiRequest={apiRequest}
            vehicles={vehicles}
            loadVehicles={loadVehicles}
          />
        ) : activePage === "Driver Assignment" ? (
          <DriverAssignment
            apiRequest={apiRequest}
            drivers={drivers}
            vehicles={vehicles}
            loadDrivers={loadDrivers}
            loadVehicles={loadVehicles}
            loadTrips={loadTrips}
          />
        ) : activePage === "Maintenance Alerts" ? (
          <MaintenanceAlerts apiRequest={apiRequest} />
        ) : activePage === "Maintenance Reports" ? (
          <MaintenanceReports
            apiRequest={apiRequest}
            apiUrl={API_URL}
            vehicles={vehicles}
          />
        ) : activePage === "Fuel Management" ? (
          <FuelManagement
            apiRequest={apiRequest}
            vehicles={vehicles}
            loadVehicles={loadVehicles}
          />
        ) : activePage === "Route Planning" ? (
          <section className="placeholder-section">
            <h2>Route Planning</h2>
            <p>Calculate route distance and estimated travel time.</p>

            <form
              onSubmit={async (event) => {
                event.preventDefault();

                const formData = new FormData(event.currentTarget);
                const start = formData.get("start");
                const destination = formData.get("destination");

                try {
                  const response = await fetch(
                    `${API_URL}/route/estimate?start=${encodeURIComponent(start)}&destination=${encodeURIComponent(destination)}`,
                    {
                      headers: {
                        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
                      },
                    },
                  );

                  const data = await response.json();

                  if (!response.ok) {
                    alert(data.detail || "Could not calculate route.");
                    return;
                  }

                  setRouteResult(data);
                } catch {
                  alert("Could not connect to the backend.");
                }
              }}
            >
              <input
                name="start"
                placeholder="Starting location (e.g. Tirupati)"
                required
              />

              <input
                name="destination"
                placeholder="Destination (e.g. Chennai)"
                required
              />

              <button type="submit">Calculate Route</button>
            </form>
            {routeResult && (
              <div className="route-result">
                <h3>Route Estimate</h3>
                <p>Starting Location: {routeResult.start}</p>
                <p>Destination: {routeResult.destination}</p>
                <p>Estimated Travel Time: {routeResult.eta}</p>
              </div>
            )}
          </section>
        ) : activePage === "GPS Tracking" ? (
          <GPSTracking />
        ) : (
          <section className="placeholder-section">
            <h2>{activePage}</h2>
            <p>This module is planned for a future development step.</p>
          </section>
        )}

        {/* FOOTER */}
        <footer className="page-footer">
          FleetFlow - Fleet Management and Logistics Platform
        </footer>
      </main>
    </div>
  );
}

export default App;