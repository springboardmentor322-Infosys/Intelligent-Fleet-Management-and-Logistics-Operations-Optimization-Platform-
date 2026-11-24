
import { useMemo, useState } from "react";
import {
  Users,
  Truck,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Navigation,
  Search,
  RefreshCw,
  Eye,
  Trash2,
  Activity,
  Route,
  CalendarDays,
  X,
  ArrowLeft,
} from "lucide-react";

// Adjust this import path if DriverLocationsMap is stored elsewhere.
import DriverLocationsMap from "./DriverLocationsMap";

export default function DriversDirectory({
  drivers = [],
  vehicles = [],
  trips = [],
  driverLocations = [],
  loading = false,
  error = "",
  onRefresh,
  onRemoveDriver,
  removingDriverId,
}) {
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [regionFilter, setRegionFilter] = useState("All");
  const [vehicleFilter, setVehicleFilter] = useState("All");

  const safeDrivers = Array.isArray(drivers) ? drivers : [];
  const safeVehicles = Array.isArray(vehicles) ? vehicles : [];
  const safeTrips = Array.isArray(trips) ? trips : [];
  const safeLocations = Array.isArray(driverLocations)
    ? driverLocations
    : [];

  const getName = (driver) =>
    driver.full_name ||
    driver.name ||
    driver.user?.full_name ||
    driver.user?.name ||
    `Driver ${driver.id}`;

  const getEmail = (driver) =>
    driver.email || driver.user?.email || "";

  const getVehicle = (driver) => {
    const assigned = safeVehicles.find(
      (v) =>
        String(v.assigned_driver_id ?? v.driver_id ?? "") ===
          String(driver.id)
    );

    if (assigned) return assigned;

    const id = driver.assigned_vehicle_id ?? driver.vehicle_id;

    return safeVehicles.find(
      (v) => String(v.id) === String(id)
    ) || null;
  };

  const getVehicleName = (vehicle) =>
    vehicle
      ? vehicle.registration_number ||
        vehicle.reg_number ||
        vehicle.registration ||
        vehicle.reg ||
        `Vehicle ${vehicle.id}`
      : "Unassigned";

  const getDriverTrips = (driver) =>
    safeTrips.filter(
      (trip) =>
        String(trip.driver_id ?? trip.driverId ?? "") ===
        String(driver.id)
    );

  const getActiveTrip = (driver) =>
    getDriverTrips(driver).find((trip) =>
      [
        "assigned",
        "in_progress",
        "in progress",
        "in_transit",
        "ongoing",
        "started",
      ].includes(String(trip.status || "").toLowerCase())
    );

  const getLocationObject = (driver) => {
    const vehicle = getVehicle(driver);

    return safeLocations.find(
      (loc) =>
        String(loc.driver_id ?? loc.driverId ?? "") ===
          String(driver.id) ||
        (vehicle &&
          String(loc.vehicle_id ?? loc.vehicleId ?? "") ===
            String(vehicle.id))
    );
  };

  const getLocation = (driver) => {
    const loc = getLocationObject(driver);

    if (!loc) return "—";

    return (
      loc.address ||
      loc.location_name ||
      (loc.latitude != null && loc.longitude != null
        ? `${loc.latitude}, ${loc.longitude}`
        : "—")
    );
  };

  const getStatus = (driver) => {
    const trip = getActiveTrip(driver);

    if (trip) {
      const status = String(trip.status || "").toLowerCase();

      if (status === "assigned") return "On Route";

      return "On Route";
    }

    const status = String(driver.status || "").toLowerCase();

    if (["on_trip", "on trip", "in_progress"].includes(status))
      return "On Route";

    if (status.includes("delay")) return "Delayed";

    if (status.includes("stop")) return "At Stop";

    if (
      ["off_duty", "off duty", "inactive"].includes(status)
    )
      return "Off Duty";

    if (
      ["available", "active", "idle"].includes(status) ||
      !status
    )
      return "Off Duty";

    return "Off Duty";
  };

  const getStatusClass = (status) => {
    const classes = {
      "On Route": "route",
      "At Stop": "stop",
      Delayed: "delayed",
      "Off Duty": "off",
    };

    return classes[status] || "off";
  };

  const getRegion = (driver) => {
    const loc = getLocationObject(driver);

    return (
      driver.region ||
      driver.state ||
      loc?.region ||
      loc?.state ||
      "Unknown"
    );
  };

  const getSpeed = (driver) => {
    const loc = getLocationObject(driver);

    const speed = loc?.speed ?? driver.speed;

    return speed != null ? `${speed} km/h` : "—";
  };

  const getTripDestination = (driver) => {
    const trip = getActiveTrip(driver);

    return (
      trip?.destination ||
      trip?.destination_address ||
      "—"
    );
  };

  const getTripNumber = (trip) =>
    trip?.trip_number || (trip ? `TRP-${trip.id}` : "—");

  const formatDate = (value) => {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const selectedDriver = safeDrivers.find(
    (d) => String(d.id) === String(selectedDriverId)
  );

  const counts = useMemo(() => {
    const result = {
      "On Route": 0,
      "At Stop": 0,
      Delayed: 0,
      "Off Duty": 0,
    };

    safeDrivers.forEach((driver) => {
      result[getStatus(driver)]++;
    });

    return result;
  }, [safeDrivers, safeTrips]);

  const filteredDrivers = safeDrivers.filter((driver) => {
    const search = searchTerm.toLowerCase();

    const vehicle = getVehicle(driver);
    const status = getStatus(driver);

    const matchesSearch =
      getName(driver).toLowerCase().includes(search) ||
      getEmail(driver).toLowerCase().includes(search) ||
      String(driver.id).includes(search) ||
      getVehicleName(vehicle).toLowerCase().includes(search);

    const matchesStatus =
      statusFilter === "All" || status === statusFilter;

    const matchesRegion =
      regionFilter === "All" ||
      getRegion(driver) === regionFilter;

    const matchesVehicle =
      vehicleFilter === "All" ||
      (vehicle
        ? getVehicleName(vehicle) === vehicleFilter
        : vehicleFilter === "Unassigned");

    return (
      matchesSearch &&
      matchesStatus &&
      matchesRegion &&
      matchesVehicle
    );
  });

  const regions = [
    ...new Set(
      safeDrivers.map(getRegion).filter((r) => r !== "Unknown")
    ),
  ];

  const vehicleOptions = [
    ...new Set(
      safeDrivers.map((d) => {
        const v = getVehicle(d);
        return v ? getVehicleName(v) : "Unassigned";
      })
    ),
  ];

  const activityItems = useMemo(() => {
    return safeTrips
      .filter((trip) =>
        trip.updated_at ||
        trip.started_at ||
        trip.created_at ||
        trip.completed_at
      )
      .map((trip) => {
        const driver = safeDrivers.find(
          (d) =>
            String(d.id) ===
            String(trip.driver_id ?? trip.driverId)
        );

        return {
          id: trip.id,
          driver: driver ? getName(driver) : "Unknown driver",
          trip: getTripNumber(trip),
          status: String(trip.status || "").toLowerCase(),
          time:
            trip.updated_at ||
            trip.started_at ||
            trip.created_at ||
            trip.completed_at,
        };
      })
      .sort(
        (a, b) => new Date(b.time) - new Date(a.time)
      )
      .slice(0, 5);
  }, [safeTrips, safeDrivers]);

  // DRIVER PROFILE
  if (selectedDriver) {
    const vehicle = getVehicle(selectedDriver);
    const activeTrip = getActiveTrip(selectedDriver);
    const driverTrips = getDriverTrips(selectedDriver);

    return (
      <section className="panel fleet-panel drivers-directory">

        <div className="drivers-profile-header">
          <button
            className="drivers-back-button"
            onClick={() => setSelectedDriverId(null)}
          >
            <ArrowLeft size={17} /> Back to Drivers
          </button>

          <div>
            <h2>{getName(selectedDriver)}</h2>
            <p>Driver ID: {selectedDriver.id}</p>
          </div>
        </div>

        {error && <div className="drivers-error">{error}</div>}

        <div className="drivers-profile-grid">
          <div className="drivers-profile-card">
            <h3>Personal Information</h3>

            <ProfileField label="Full Name" value={getName(selectedDriver)} />
            <ProfileField label="Email" value={getEmail(selectedDriver)} />
            <ProfileField
              label="Phone Number"
              value={selectedDriver.phone_number || selectedDriver.phone}
            />
            <ProfileField
              label="Licence Number"
              value={selectedDriver.license_number || selectedDriver.licence_number}
            />
            <ProfileField
              label="Licence Expiry"
              value={selectedDriver.license_expiry}
            />
            <ProfileField
              label="Status"
              value={getStatus(selectedDriver)}
            />
          </div>

          <div className="drivers-profile-card">
            <h3>Current Assignment</h3>

            <ProfileField
              label="Assigned Vehicle"
              value={getVehicleName(vehicle)}
            />
            <ProfileField
              label="Vehicle Type"
              value={vehicle?.vehicle_type || vehicle?.type}
            />
            <ProfileField
              label="Current Location"
              value={getLocation(selectedDriver)}
            />
            <ProfileField
              label="Current Trip"
              value={getTripNumber(activeTrip)}
            />
            <ProfileField
              label="Trip Status"
              value={activeTrip?.status || "No Active Trip"}
            />
          </div>
        </div>

        <div className="drivers-profile-card drivers-trip-history">
          <h3>Trip History</h3>

          {driverTrips.length === 0 ? (
            <p>No trip records available.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>TRIP ID</th>
                    <th>ORIGIN</th>
                    <th>DESTINATION</th>
                    <th>STATUS</th>
                  </tr>
                </thead>

                <tbody>
                  {driverTrips.map((trip) => (
                    <tr key={trip.id}>
                      <td>{getTripNumber(trip)}</td>
                      <td>{trip.origin || "—"}</td>
                      <td>{trip.destination || "—"}</td>
                      <td>{trip.status || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    );
  }

  // MAIN DIRECTORY
  return (
    <section className="drivers-directory">

      {/* HEADER */}
      <div className="drivers-main-header">
        <div>
          <h2>Driver Management</h2>
          <p>Monitor driver availability, assignments and live operations.</p>
        </div>

        <button
          className="primary-button drivers-refresh"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={16} />
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && <div className="drivers-error">{error}</div>}

      {/* STATISTICS */}
      <div className="drivers-stats-grid">

        <StatCard
          title="Total Drivers"
          value={safeDrivers.length}
          caption="Registered drivers"
          icon={Users}
          color="blue"
        />

        <StatCard
          title="On Route"
          value={counts["On Route"]}
          caption="Currently on trips"
          icon={Navigation}
          color="green"
        />

        <StatCard
          title="At Stop"
          value={counts["At Stop"]}
          caption="Stopped drivers"
          icon={MapPin}
          color="blue"
        />

        <StatCard
          title="Delayed"
          value={counts.Delayed}
          caption="Delayed drivers"
          icon={AlertTriangle}
          color="orange"
        />

        <StatCard
          title="Off Duty"
          value={counts["Off Duty"]}
          caption="Not currently on route"
          icon={Clock}
          color="gray"
        />

      </div>

      {/* MAP AND OVERVIEW */}
      <div className="drivers-monitoring-grid">

        <div className="drivers-map-panel">
          <div className="drivers-section-heading">
            <div>
              <h3>Live Driver Tracking</h3>
              <p>Monitor available GPS locations</p>
            </div>

            <span className="drivers-live-indicator">
              <i /> GPS Locations
            </span>
          </div>

          {safeLocations.length > 0 ? (
            <div className="drivers-map-container">
              <DriverLocationsMap locations={safeLocations} />
            </div>
          ) : (
            <div className="drivers-map-empty">
              <MapPin size={34} />
              <strong>No GPS locations available</strong>
              <span>Driver locations will appear when GPS data is received.</span>
            </div>
          )}

          <div className="drivers-map-legend">
            {[
              ["On Route", "route"],
              ["At Stop", "stop"],
              ["Delayed", "delayed"],
              ["Off Duty", "off"],
            ].map(([label, color]) => (
              <span key={label}>
                <i className={`legend-${color}`} />
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* STATUS OVERVIEW */}
        <div className="drivers-side-panels">

          <div className="drivers-overview-panel">
            <h3>Driver Status Overview</h3>

            <div className="drivers-chart-layout">
              <div
                className="drivers-donut"
                style={{
                  "--route": counts["On Route"],
                  "--stop": counts["At Stop"],
                  "--delayed": counts.Delayed,
                  "--off": counts["Off Duty"],
                  "--total": Math.max(safeDrivers.length, 1),
                }}
              >
                <div>
                  <strong>{safeDrivers.length}</strong>
                  <span>Drivers</span>
                </div>
              </div>

              <div className="drivers-chart-legend">
                {[
                  ["On Route", "route"],
                  ["At Stop", "stop"],
                  ["Delayed", "delayed"],
                  ["Off Duty", "off"],
                ].map(([label, color]) => (
                  <div key={label}>
                    <i className={`legend-${color}`} />
                    <span>{label}</span>
                    <strong>{counts[label]}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RECENT ACTIVITY */}
          <div className="drivers-activity-panel">
            <div className="drivers-section-heading">
              <h3>Recent Trip Activity</h3>
              <Activity size={19} />
            </div>

            {activityItems.length === 0 ? (
              <p className="drivers-muted">
                No timestamped trip activity available.
              </p>
            ) : (
              activityItems.map((item) => (
                <div className="drivers-activity-item" key={item.id}>
                  <span className="activity-dot" />
                  <div>
                    <strong>{item.driver}</strong>
                    <span>{item.trip} · {item.status.replaceAll("_", " ")}</span>
                  </div>
                  <time>{formatDate(item.time)}</time>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* DRIVER TABLE */}
      <div className="drivers-table-panel">

        <div className="drivers-section-heading">
          <div>
            <h3>All Drivers</h3>
            <p>Driver assignments and operational status</p>
          </div>

          <span className="drivers-record-count">
            {filteredDrivers.length} records
          </span>
        </div>

        {/* FILTERS */}
        <div className="drivers-toolbar">

          <div className="drivers-search">
            <Search size={17} />
            <input
              type="search"
              placeholder="Search driver, vehicle or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="On Route">On Route</option>
            <option value="At Stop">At Stop</option>
            <option value="Delayed">Delayed</option>
            <option value="Off Duty">Off Duty</option>
          </select>

          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
          >
            <option value="All">All Regions</option>
            {regions.map((region) => (
              <option key={region}>{region}</option>
            ))}
          </select>

          <select
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
          >
            <option value="All">All Vehicles</option>
            {vehicleOptions.map((vehicle) => (
              <option key={vehicle}>{vehicle}</option>
            ))}
          </select>

        </div>

        {loading ? (
          <div className="drivers-empty-state">
            Loading drivers...
          </div>
        ) : filteredDrivers.length === 0 ? (
          <div className="drivers-empty-state">
            <Users size={35} />
            <h3>No drivers found</h3>
            <p>Try changing your search or filters.</p>
          </div>
        ) : (

          <div className="table-scroll">
            <table className="drivers-data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>DRIVER NAME</th>
                  <th>VEHICLE NO.</th>
                  <th>CURRENT TRIP</th>
                  <th>CURRENT LOCATION</th>
                  <th>SPEED</th>
                  <th>STATUS</th>
                  <th>NEXT STOP</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>

              <tbody>
                {filteredDrivers.map((driver, index) => {
                  const vehicle = getVehicle(driver);
                  const trip = getActiveTrip(driver);
                  const status = getStatus(driver);
                  const loc = getLocationObject(driver);

                  return (
                    <tr key={driver.id}>
                      <td>{index + 1}</td>

                      <td>
                        <div className="drivers-name-cell">
                          <div className="drivers-avatar">
                            {getName(driver).charAt(0).toUpperCase()}
                          </div>

                          <div>
                            <strong>{getName(driver)}</strong>
                            <span>ID: {driver.id}</span>
                          </div>
                        </div>
                      </td>

                      <td>{getVehicleName(vehicle)}</td>

                      <td>{getTripNumber(trip)}</td>

                      <td>
                        <span className="drivers-location-cell">
                          <MapPin size={14} />
                          {getLocation(driver)}
                        </span>
                      </td>

                      <td>{getSpeed(driver)}</td>

                      <td>
                        <span className={`drivers-status-pill ${getStatusClass(status)}`}>
                          <i />
                          {status}
                        </span>
                      </td>

                      <td>{getTripDestination(driver)}</td>

                      <td>
                        <div className="drivers-actions">

                          <button
                            type="button"
                            title="View driver profile"
                            onClick={() => setSelectedDriverId(driver.id)}
                          >
                            <Eye size={16} />
                          </button>

                          {loc?.latitude != null && loc?.longitude != null && (
                            <button
                              type="button"
                              title="View location on Google Maps"
                              onClick={() =>
                                window.open(
                                  `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`,
                                  "_blank",
                                  "noopener,noreferrer"
                                )
                              }
                            >
                              <MapPin size={16} />
                            </button>
                          )}

                          <button
                            type="button"
                            title="Remove driver"
                            disabled={
                              !onRemoveDriver ||
                              removingDriverId === driver.id
                            }
                            onClick={() => onRemoveDriver?.(driver)}
                          >
                            {removingDriverId === driver.id
                              ? "..."
                              : <Trash2 size={16} />}
                          </button>

                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="drivers-table-footer">
          <span>
            Showing <strong>{filteredDrivers.length}</strong> of{" "}
            <strong>{safeDrivers.length}</strong> drivers
          </span>

          <button
            type="button"
            onClick={() => {
              setSearchTerm("");
              setStatusFilter("All");
              setRegionFilter("All");
              setVehicleFilter("All");
            }}
          >
            Reset Filters
          </button>
        </div>

      </div>
    </section>
  );
}

function StatCard({ title, value, caption, icon: Icon, color }) {
  return (
    <div className="drivers-stat-card">
      <div className={`drivers-stat-icon ${color}`}>
        <Icon size={22} />
      </div>

      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{caption}</small>
      </div>
    </div>
  );
}

function ProfileField({ label, value }) {
  return (
    <div className="drivers-profile-field">
      <span className="drivers-profile-label">{label}</span>
      <strong className="drivers-profile-value">
        {value ?? "—"}
      </strong>
    </div>
  );
}
