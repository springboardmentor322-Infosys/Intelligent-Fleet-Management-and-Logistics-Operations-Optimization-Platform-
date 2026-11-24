
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getDrivers,
  getVehicles,
  getSelectedDriverTrips,
  updateSelectedDriverTripStatus,
  getAllDriverLocations,
  assignDriver,
  unassignDriver,
} from "./api";

import SharedDriverGpsTracker from "./SharedDriverGpsTracker";
import DriverLocationsMap from "./DriverLocationsMap";

function SharedDriverWorkspace({ token, onLogout }) {
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [allTrips, setAllTrips] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const selectedDriver = useMemo(
    () =>
      drivers.find(
        (driver) => Number(driver.id) === Number(selectedDriverId)
      ) || null,
    [drivers, selectedDriverId]
  );
  const [view, setView] = useState("overview");
  const [driverLocations, setDriverLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState("");

  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [updatingTripId, setUpdatingTripId] = useState(null);
  const [search, setSearch] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [assignmentLoading, setAssignmentLoading] = useState(false);

  // Exclude inactive drivers from all driver-facing dashboard views.
  const activeDrivers = useMemo(
    () =>
      drivers.filter(
        (driver) =>
          (driver.status || "").toLowerCase() !== "inactive"
      ),
    [drivers]
  );

  const assignedVehicle = useMemo(
    () =>
      vehicles.find(
        (vehicle) =>
          Number(vehicle.assigned_driver_id) ===
          Number(selectedDriverId)
      ) || null,
    [vehicles, selectedDriverId]
  );

  const activeTrip =
    trips.find((trip) => trip.status === "in_progress") || null;

  const activeTripsCount = allTrips.filter(
    (trip) =>
      trip.status === "assigned" || trip.status === "in_progress"
  ).length;

  const completedTripsCount = allTrips.filter(
    (trip) => trip.status === "completed"
  ).length;

  const availableVehicles = vehicles.filter(
    (vehicle) => vehicle.status === "available"
  ).length;

  const vehiclesOnTrip = vehicles.filter(
    (vehicle) => vehicle.status === "on_trip"
  ).length;

    const driverStatusCounts = [
      {
        label: "Available",
        count: activeDrivers.filter((d) => d.status === "available").length,
        color: "#16a34a",
      },
      {
        label: "On Trip",
        count: activeDrivers.filter((d) => d.status === "on_trip").length,
        color: "#2563eb",
      },
      {
        label: "Off Duty",
        count: activeDrivers.filter((d) => d.status === "off_duty").length,
        color: "#f59e0b",
      },
      {
        label: "Delayed",
        count: activeDrivers.filter((d) => d.status === "delayed").length,
        color: "#dc2626",
      },
    ];

  const vehicleStatusCounts = [
    {
      label: "Available",
      count: availableVehicles,
      color: "#16a34a",
    },
    {
      label: "On Trip",
      count: vehiclesOnTrip,
      color: "#2563eb",
    },
    {
      label: "Maintenance",
      count: vehicles.filter(
        (v) => v.status === "maintenance"
      ).length,
      color: "#f59e0b",
    },
  ];

  const tripStatusCounts = [
    {
      label: "Assigned",
      count: allTrips.filter((t) => t.status === "assigned").length,
      color: "#f59e0b",
    },
    {
      label: "In Progress",
      count: allTrips.filter((t) => t.status === "in_progress").length,
      color: "#2563eb",
    },
    {
      label: "Completed",
      count: completedTripsCount,
      color: "#16a34a",
    },
    {
      label: "Cancelled",
      count: allTrips.filter((t) => t.status === "cancelled").length,
      color: "#dc2626",
    },
  ];

  const filteredDrivers = activeDrivers.filter((driver) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;

    const vehicle = vehicles.find(
      (v) =>
        Number(v.assigned_driver_id) === Number(driver.id)
    );

    return [
      driver.full_name,
      String(driver.id),
      driver.phone_number,
      vehicle?.registration_number,
    ].some((value) =>
      String(value || "").toLowerCase().includes(term)
    );
  });

  async function loadDriverLocations() {
    setLocationsLoading(true);
    setLocationsError("");

    try {
        const result = await getAllDriverLocations(token);

        setDriverLocations(
        Array.isArray(result) ? result : []
        );
    } catch (err) {
        setLocationsError(
        err.message || "Unable to load fleet driver locations."
        );
    } finally {
        setLocationsLoading(false);
    }
    }

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [driverData, vehicleData] = await Promise.all([
        getDrivers(token),
        getVehicles(token),
      ]);

      const driverList = Array.isArray(driverData) ? driverData : [];
      const vehicleList = Array.isArray(vehicleData) ? vehicleData : [];

      setDrivers(driverList);
      setVehicles(vehicleList);

      // Load trips for every driver to calculate fleet-wide statistics.
      const activeDriverList = driverList.filter(
        (driver) =>
          (driver.status || "").toLowerCase() !== "inactive"
      );

      const tripResults = await Promise.all(
        activeDriverList.map(async (driver) => {
          try {
            const result = await getSelectedDriverTrips(
              token,
              driver.id
            );

            return Array.isArray(result) ? result : [];
          } catch {
            return [];
          }
        })
      );

      setAllTrips(tripResults.flat());

      setSelectedDriverId((currentId) => {
        const stillExists = driverList.some(
          (driver) => Number(driver.id) === Number(currentId)
        );

        return stillExists ? currentId : null;
      });
    } catch (err) {
      setError(err.message || "Unable to load fleet information.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const timer = window.setTimeout(() => {
        loadWorkspace();
    }, 0);

    return () => window.clearTimeout(timer);
    }, [token, loadWorkspace]);

  useEffect(() => {
    if (!token || view !== "map") return;

    let socket;
    let reconnectTimer;
    let heartbeatTimer;
    let cancelled = false;

    function connect() {
        if (cancelled) return;

        const protocol =
        window.location.protocol === "https:" ? "wss:" : "ws:";

        const wsUrl =
        `${protocol}//localhost:8000/driver-locations/ws` +
        `?token=${encodeURIComponent(token)}`;

        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
        if (cancelled) {
            socket.close();
            return;
        }

        heartbeatTimer = window.setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) {
            socket.send("ping");
            }
        }, 25000);
        };

        socket.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);

            if (
            message.type !== "driver_location_updated" ||
            !message.location
            ) {
            return;
            }

            const updated = message.location;

            setDriverLocations((previous) => {
            const index = previous.findIndex(
                (item) =>
                Number(item.driver_id) === Number(updated.driver_id)
            );

            if (index === -1) {
                return [...previous, updated];
            }

            return previous.map((item) =>
                Number(item.driver_id) === Number(updated.driver_id)
                ? { ...item, ...updated }
                : item
            );
            });
        } catch (err) {
            console.error("Invalid driver location message:", err);
        }
        };

        socket.onclose = () => {
        window.clearInterval(heartbeatTimer);

        if (!cancelled) {
            reconnectTimer = window.setTimeout(connect, 3000);
        }
        };

        socket.onerror = () => {
        socket.close();
        };
    }

    connect();

    return () => {
        cancelled = true;
        window.clearTimeout(reconnectTimer);
        window.clearInterval(heartbeatTimer);

        if (socket) {
        socket.onclose = null;
        socket.close();
        }
    };
    }, [token, view]);

  useEffect(() => {
    let cancelled = false;

    async function loadDriverTrips() {
      if (!token || !selectedDriverId) {
        setTrips([]);
        return;
      }

      setTripsLoading(true);

      try {
        const result = await getSelectedDriverTrips(
          token,
          selectedDriverId
        );

        if (!cancelled) {
          setTrips(Array.isArray(result) ? result : []);
        }
      } catch (err) {
        if (!cancelled) {
          setTrips([]);
          setError(
            err.message || "Unable to load this driver's trips."
          );
        }
      } finally {
        if (!cancelled) setTripsLoading(false);
      }
    }

    loadDriverTrips();

    return () => {
      cancelled = true;
    };
  }, [token, selectedDriverId]);

  async function refreshTrips() {
    if (!selectedDriverId) return;

    setTripsLoading(true);
    setError("");

    try {
      const result = await getSelectedDriverTrips(
        token,
        selectedDriverId
      );

      setTrips(Array.isArray(result) ? result : []);
      await loadWorkspace();
    } catch (err) {
      setError(err.message || "Unable to refresh trips.");
    } finally {
      setTripsLoading(false);
    }
  }

  async function updateTripStatus(tripId, newStatus) {
    if (!selectedDriverId) return;

    setUpdatingTripId(tripId);
    setError("");
    setNotice("");

    try {
      await updateSelectedDriverTripStatus(
        token,
        selectedDriverId,
        tripId,
        newStatus
      );

      const result = await getSelectedDriverTrips(
        token,
        selectedDriverId
      );

      setTrips(Array.isArray(result) ? result : []);

      const [driverData, vehicleData] = await Promise.all([
        getDrivers(token),
        getVehicles(token),
      ]);

      setDrivers(Array.isArray(driverData) ? driverData : []);
      setVehicles(Array.isArray(vehicleData) ? vehicleData : []);

      const tripResults = await Promise.all(
        (Array.isArray(driverData) ? driverData : [])
          .filter(
            (driver) =>
              (driver.status || "").toLowerCase() !== "inactive"
          )
          .map(
          async (driver) => {
            try {
              const data = await getSelectedDriverTrips(
                token,
                driver.id
              );
              return Array.isArray(data) ? data : [];
            } catch {
              return [];
            }
          }
        )
      );

      setAllTrips(tripResults.flat());

      setNotice(
        newStatus === "in_progress"
          ? "Trip started successfully."
          : "Trip completed successfully."
      );
    } catch (err) {
      setError(err.message || "Unable to update trip status.");
    } finally {
      setUpdatingTripId(null);
    }
  }

  async function updateDriverTripStatus(driverId, tripId, newStatus) {
    if (!driverId || !tripId) return;

    setUpdatingTripId(tripId);
    setError("");
    setNotice("");

    try {
        await updateSelectedDriverTripStatus(
        token,
        driverId,
        tripId,
        newStatus
        );

        const result = await getSelectedDriverTrips(token, driverId);
        const updatedDriverTrips = Array.isArray(result) ? result : [];

        setAllTrips((currentTrips) => [
        ...currentTrips.filter(
            (trip) => Number(trip.driver_id) !== Number(driverId)
        ),
        ...updatedDriverTrips,
        ]);

        if (Number(selectedDriverId) === Number(driverId)) {
        setTrips(updatedDriverTrips);
        }

        setNotice(
        newStatus === "in_progress"
            ? "Trip started successfully."
            : "Trip status updated successfully."
        );
    } catch (err) {
        setError(err.message || "Unable to update trip status.");
    } finally {
        setUpdatingTripId(null);
    }
    }

async function handleAssignVehicle() {
  if (!selectedDriverId || !selectedVehicleId) {
    setError("Please select a vehicle.");
    return;
  }

  setAssignmentLoading(true);
  setError("");
  setNotice("");

  try {
    await assignDriver(
      token,
      Number(selectedVehicleId),
      Number(selectedDriverId)
    );

    setNotice("Vehicle assigned successfully.");
    setSelectedVehicleId("");

    await loadWorkspace();
  } catch (err) {
    setError(err.message || "Unable to assign vehicle.");
  } finally {
    setAssignmentLoading(false);
  }
}

async function handleUnassignVehicle() {
  if (!assignedVehicle) return;

  const confirmed = window.confirm(
    `Unassign ${assignedVehicle.registration_number} from ${selectedDriver.full_name}?`
  );

  if (!confirmed) return;

  setAssignmentLoading(true);
  setError("");
  setNotice("");

  try {
    await unassignDriver(token, assignedVehicle.id);

    setNotice("Vehicle unassigned successfully.");

    await loadWorkspace();
  } catch (err) {
    setError(err.message || "Unable to unassign vehicle.");
  } finally {
    setAssignmentLoading(false);
  }
}

  function openDriver(driverId) {
    setSelectedDriverId(driverId);
    setView("profile");
    setNotice("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function backToOverview() {
    setView("overview");
    setSelectedDriverId(null);
    setTrips([]);
    setNotice("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <p>Loading Fleet Operations Dashboard...</p>
      </main>
    );
  }

    return (
    <div style={styles.appShell}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarBrand}>
          <div style={styles.brandIcon}>F</div>
          <div>
            <strong>FLEETFLOW</strong>
            <span style={{ display: "block", fontSize: "10px", color: "#94a3b8" }}>
              DRIVER OPERATIONS
            </span>
          </div>
        </div>

        <p style={styles.sidebarLabel}>WORKSPACE</p>

        <nav style={styles.sidebarNav}>
          <button
            type="button"
            style={{
              ...styles.navButton,
              ...(view === "overview" ? styles.navButtonActive : {}),
            }}
            onClick={backToOverview}
          >
            <span>▦</span> Overview
          </button>

          <button
            type="button"
            style={{
                ...styles.navButton,
                ...(view === "map" ? styles.navButtonActive : {}),
            }}
            onClick={() => {
                setView("map");
                loadDriverLocations();
            }}
          >
            <span>📍</span> Fleet Map
          </button>

          <button
            type="button"
            style={{
              ...styles.navButton,
              ...(view === "profile" ? styles.navButtonActive : {}),
            }}
            onClick={() => {
              if (selectedDriver) setView("profile");
              else setView("overview");
            }}
          >
            <span>♙</span> Driver Profile
          </button>
        </nav>

      </aside>

      <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>
            FLEETFLOW / DRIVER OPERATIONS
          </p>

          <h1 style={styles.heading}>
            {view === "overview"
              ? "Fleet Operations Dashboard"
              : view === "map"
                ? "Fleet-Wide Driver Map"
                : "Driver Profile"}
          </h1>

          <p style={styles.subtitle}>
            {view === "overview"
              ? "Monitor your drivers, vehicles and logistics operations."
              : view === "map"
                ? "View the latest available GPS locations of all drivers."
                : "View driver information, assigned vehicle, trips and simulated GPS tracking."}
            </p>
        </div>

        <div style={styles.headerActions}>
          {view === "profile" && (
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={backToOverview}
            >
              ← Back to Fleet Overview
            </button>
          )}

          <button
            type="button"
            style={styles.refreshButton}
            onClick={loadWorkspace}
          >
            Refresh Dashboard
          </button>

          <button
            type="button"
            style={styles.logoutButton}
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
      </header>

      {error && <div style={styles.error}>{error}</div>}
      {notice && <div style={styles.notice}>{notice}</div>}

      {view === "overview" && (
        <>
          <section style={styles.metrics}>
            <Metric title="Total Drivers" value={activeDrivers.length} />
            <Metric title="Total Vehicles" value={vehicles.length} />
            <Metric title="Available Vehicles" value={availableVehicles} />
            <Metric title="Vehicles On Trip" value={vehiclesOnTrip} />
            <Metric title="Active Trips" value={activeTripsCount} />
            <Metric title="Completed Trips" value={completedTripsCount} />
          </section>

                    <section style={styles.overviewLayout}>
            {/* DRIVER DIRECTORY */}
            <section style={styles.panel}>
              <div style={styles.directoryHeader}>
                <div>
                  <h2 style={styles.sectionTitle}>Driver Directory</h2>
                  <p style={styles.muted}>
                    Select a driver to view their profile and trip details.
                  </p>
                </div>

                <span style={styles.countBadge}>
                  {activeDrivers.length} Drivers
                </span>
              </div>

              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search drivers..."
                style={styles.searchInput}
              />

              {filteredDrivers.length === 0 ? (
                <p style={styles.muted}>
                    {drivers.length === 0
                    ? "No driver profiles are available."
                    : "No drivers match your search."}
                </p>
                ) : (
                <div style={styles.directoryTable}>
                    <div style={styles.directoryTableHeader}>
                    <span>Name</span>
                    <span>Assigned Vehicle</span>
                    <span>Trips</span>
                    <span>Status</span>
                    </div>

                    {filteredDrivers.map((driver) => {
                    const vehicle = vehicles.find(
                        (v) =>
                        Number(v.assigned_driver_id) === Number(driver.id)
                    );

                    const driverTrips = allTrips.filter(
                        (trip) =>
                        Number(trip.driver_id) === Number(driver.id)
                    );

                    return (
                        <button
                        type="button"
                        key={driver.id}
                        style={styles.directoryTableRow}
                        onClick={() => openDriver(driver.id)}
                        >
                        <div style={styles.tableDriverName}>
                            <strong style={styles.tableDriverNameStrong}>
                            {driver.full_name || "Unnamed Driver"}
                            </strong>

                            <span style={styles.mutedSmall}>
                            Driver #{driver.id}
                            {driver.phone_number
                                ? ` · ${driver.phone_number}`
                                : ""}
                            </span>
                        </div>

                        <span style={styles.tableVehicle}>
                            {vehicle?.registration_number || "Not assigned"}
                        </span>

                        <span style={styles.tableTrips}>
                            {driverTrips.length}
                        </span>

                        <span
                            style={{
                            ...styles.status,
                            ...(driver.status === "available"
                                ? styles.availableStatus
                                : driver.status === "on_trip"
                                ? styles.activeStatus
                                : styles.otherStatus),
                            }}
                        >
                            {(driver.status || "Unknown").replaceAll("_", " ")}
                        </span>
                        </button>
                    );
                    })}
                </div>
                )}
            </section>

            {/* DASHBOARD CHARTS */}
            <section style={styles.compactChartColumn}>
              <DriverDonutChart
                data={driverStatusCounts}
                total={activeDrivers.length}
            />

            <ChartCard
                title="Vehicle Status"
                data={vehicleStatusCounts}
                total={vehicles.length}
            />

            <ChartCard
                title="Trip Status"
                data={tripStatusCounts}
                total={allTrips.length}
            />
            </section>
        </section>
        </>
      )}

      {view === "map" && (
        <section style={styles.panel}>
            <div style={styles.directoryHeader}>
            <div>
                <h2 style={styles.sectionTitle}>All Driver Locations</h2>
                <p style={styles.muted}>
                Fleet-wide GPS locations, including live and simulated positions.
                </p>
            </div>

            <button
                type="button"
                style={styles.refreshButton}
                onClick={loadDriverLocations}
                disabled={locationsLoading}
            >
                {locationsLoading ? "Refreshing..." : "Refresh Locations"}
            </button>
            </div>

            {locationsError && (
            <div style={styles.error}>{locationsError}</div>
            )}

            {locationsLoading && driverLocations.length === 0 ? (
            <p style={styles.muted}>Loading driver locations...</p>
            ) : (
            <DriverLocationsMap
              locations={driverLocations.filter((location) =>
                activeDrivers.some(
                  (driver) =>
                    Number(driver.id) === Number(location.driver_id)
                )
              )}
            />
            )}

            <div style={{ marginTop: "28px" }}>
            <h2 style={styles.sectionTitle}>Driver Trip Management</h2>
            <p style={styles.muted}>
                Start assigned trips and manage GPS simulation for drivers whose
                trips are in progress.
            </p>

            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                    <tr>
                    <th style={styles.tableHeader}>Driver</th>
                    <th style={styles.tableHeader}>Vehicle</th>
                    <th style={styles.tableHeader}>Trip</th>
                    <th style={styles.tableHeader}>Status</th>
                    <th style={styles.tableHeader}>Actions</th>
                    </tr>
                </thead>

                <tbody>
                    {activeDrivers.map((driver) => {
                    const driverTrips = allTrips.filter(
                        (trip) =>
                        Number(trip.driver_id) === Number(driver.id)
                    );

                    const activeTripForDriver =
                        driverTrips.find(
                        (trip) => trip.status === "in_progress"
                        ) || null;

                    const assignedTripForDriver =
                        driverTrips.find(
                        (trip) => trip.status === "assigned"
                        ) || null;

                    const displayedTrip =
                        activeTripForDriver || assignedTripForDriver;

                    const vehicle = vehicles.find(
                        (item) =>
                        Number(item.assigned_driver_id) ===
                        Number(driver.id)
                    );

                    return (
                        <tr key={driver.id}>
                        <td style={styles.tableCell}>
                            {driver.name ||
                            driver.full_name ||
                            driver.email ||
                            `Driver ${driver.id}`}
                        </td>

                        <td style={styles.tableCell}>
                            {vehicle?.registration_number ||
                            vehicle?.registration_no ||
                            "Not assigned"}
                        </td>

                        <td style={styles.tableCell}>
                            {displayedTrip
                            ? `${displayedTrip.origin} → ${displayedTrip.destination}`
                            : "No active trip"}
                        </td>

                        <td style={styles.tableCell}>
                            {displayedTrip
                            ? displayedTrip.status.replace("_", " ")
                            : "—"}
                        </td>

                        <td style={styles.tableCell}>
                            {assignedTripForDriver && !activeTripForDriver && (
                            <button
                                type="button"
                                style={styles.refreshButton}
                                disabled={updatingTripId === assignedTripForDriver.id}
                                onClick={() =>
                                updateDriverTripStatus(
                                    driver.id,
                                    assignedTripForDriver.id,
                                    "in_progress"
                                )
                                }
                            >
                                {updatingTripId === assignedTripForDriver.id
                                ? "Starting..."
                                : "Start Trip"}
                            </button>
                            )}

                            {activeTripForDriver && (
                            <SharedDriverGpsTracker
                                key={`${driver.id}-${activeTripForDriver.id}`}
                                token={token}
                                driverId={driver.id}
                                activeTrip={activeTripForDriver}
                            />
                            )}

                            {!assignedTripForDriver &&
                            !activeTripForDriver && (
                                <span style={styles.muted}>
                                No assigned or ongoing trip
                                </span>
                            )}
                        </td>
                        </tr>
                    );
                    })}
                </tbody>
                </table>
            </div>
            </div>
        </section>
        )}

      {view === "profile" && selectedDriver && (
        <>
          <section style={styles.profileHero}>
            <div style={styles.profileIdentity}>
              <div style={styles.largeAvatar}>
                {(selectedDriver.full_name || "D")
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div>
                <p style={styles.eyebrow}>DRIVER DETAILS</p>
                <h2 style={styles.profileName}>
                  {selectedDriver.full_name}
                </h2>
                <p style={styles.muted}>
                  Driver ID: {selectedDriver.id}
                </p>
              </div>
            </div>

            <span
              style={{
                ...styles.status,
                ...(selectedDriver.status === "available"
                  ? styles.availableStatus
                  : selectedDriver.status === "on_trip"
                    ? styles.activeStatus
                    : styles.otherStatus),
              }}
            >
              {(selectedDriver.status || "Unknown").replaceAll("_", " ")}
            </span>
          </section>

          <section style={styles.metrics}>
            <Metric title="Total Trips" value={trips.length} />
            <Metric
              title="Active Trips"
              value={trips.filter(
                (t) =>
                  t.status === "assigned" ||
                  t.status === "in_progress"
              ).length}
            />
            <Metric
              title="Completed Trips"
              value={trips.filter(
                (t) => t.status === "completed"
              ).length}
            />
            <Metric
              title="Driver Status"
              value={selectedDriver.status || "Unknown"}
            />
          </section>

          <section style={styles.twoColumns}>
            <article style={styles.panel}>
              <h2 style={styles.sectionTitle}>Personal Information</h2>

              <Info label="Full Name" value={selectedDriver.full_name} />
              <Info label="Driver ID" value={selectedDriver.id} />
              <Info
                label="Phone Number"
                value={selectedDriver.phone_number}
              />
              <Info
                label="Licence Number"
                value={selectedDriver.license_number}
              />
              <Info
                label="Licence Expiry"
                value={selectedDriver.license_expiry}
              />
              <Info
                label="Status"
                value={selectedDriver.status}
              />
            </article>

            <article style={styles.panel}>
              <h2 style={styles.sectionTitle}>Assigned Vehicle</h2>

              {assignedVehicle ? (
                <>
                  <h3 style={styles.vehicleName}>
                    {assignedVehicle.registration_number}
                  </h3>
                  <Info
                    label="Vehicle"
                    value={`${assignedVehicle.make || ""} ${assignedVehicle.model || ""}`}
                  />
                  <Info label="Vehicle ID" value={assignedVehicle.id} />
                  <Info
                    label="Type"
                    value={assignedVehicle.vehicle_type}
                  />
                  <Info
                    label="Fuel"
                    value={assignedVehicle.fuel_type}
                  />
                  <Info
                    label="Status"
                    value={assignedVehicle.status}
                  />
                </>
              ) : (
                <p style={styles.muted}>
                  No vehicle is currently assigned to this driver.
                </p>
              )}
            </article>
          </section>

          <section style={styles.panel}>
            <div style={styles.directoryHeader}>
                <div>
                <h2 style={styles.sectionTitle}>Vehicle Assignment</h2>
                <p style={styles.muted}>
                    Manage the vehicle assigned to {selectedDriver.full_name}.
                </p>
                </div>

                <span style={styles.status}>
                {assignedVehicle ? "Assigned" : "Unassigned"}
                </span>
            </div>

            {assignedVehicle ? (
                <div style={styles.assignmentCard}>
                <div>
                    <strong style={styles.assignmentVehicleName}>
                    {assignedVehicle.registration_number}
                    </strong>
                    <p style={styles.muted}>
                    {assignedVehicle.make || ""}{" "}
                    {assignedVehicle.model || ""}
                    </p>
                </div>

                <button
                    type="button"
                    style={styles.dangerButton}
                    disabled={assignmentLoading}
                    onClick={handleUnassignVehicle}
                >
                    {assignmentLoading ? "Processing..." : "Unassign Vehicle"}
                </button>
                </div>
            ) : (
                <div style={styles.assignmentForm}>
                <div style={{ flex: 1 }}>
                    <label style={styles.fieldLabel}>
                    Select Available Vehicle
                    </label>

                    <select
                    value={selectedVehicleId}
                    onChange={(event) =>
                        setSelectedVehicleId(event.target.value)
                    }
                    style={styles.assignmentSelect}
                    >
                    <option value="">Choose a vehicle</option>

                    {vehicles
                        .filter(
                        (vehicle) =>
                            vehicle.status === "available" &&
                            !vehicle.assigned_driver_id
                        )
                        .map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.registration_number} -{" "}
                            {vehicle.make || ""} {vehicle.model || ""}
                        </option>
                        ))}
                    </select>
                </div>

                <button
                    type="button"
                    style={styles.assignButton}
                    disabled={!selectedVehicleId || assignmentLoading}
                    onClick={handleAssignVehicle}
                >
                    {assignmentLoading ? "Assigning..." : "Assign Vehicle"}
                </button>
                </div>
            )}

            {vehicles.filter(
                (vehicle) =>
                vehicle.status === "available" &&
                !vehicle.assigned_driver_id
            ).length === 0 && !assignedVehicle && (
                <p style={styles.muted}>
                No available vehicles at the moment.
                </p>
            )}
            </section>

          <section style={styles.panel}>
            <h2 style={styles.sectionTitle}>Simulated GPS Tracking</h2>
            <p style={styles.muted}>
              Simulates this driver's movement along their active trip
              route. No physical device location is used.
            </p>

            <SharedDriverGpsTracker
                key={selectedDriver.id}
                token={token}
                driverId={selectedDriver.id}
                activeTrip={activeTrip}
                showControls={false}
            />
          </section>

          <section style={styles.panel}>
            <div style={styles.directoryHeader}>
              <div>
                <h2 style={styles.sectionTitle}>Trip Details</h2>
                <p style={styles.muted}>
                  Trips assigned to {selectedDriver.full_name}.
                </p>
              </div>

              <button
                type="button"
                style={styles.refreshButton}
                onClick={refreshTrips}
                disabled={tripsLoading}
              >
                {tripsLoading ? "Refreshing..." : "Refresh Trips"}
              </button>
            </div>

            {tripsLoading && (
              <p style={styles.muted}>Loading trips...</p>
            )}

            {!tripsLoading && trips.length === 0 && (
              <p style={styles.muted}>
                No trips have been assigned to this driver yet.
              </p>
            )}

            <div style={styles.tripGrid}>
              {trips.map((trip) => (
                <article key={trip.id} style={styles.tripCard}>
                  <div style={styles.tripHeader}>
                    <h3>Trip #{trip.id}</h3>

                    <span
                      style={{
                        ...styles.status,
                        ...(trip.status === "in_progress"
                          ? styles.activeStatus
                          : trip.status === "completed"
                            ? styles.completedStatus
                            : trip.status === "cancelled"
                              ? styles.cancelledStatus
                              : styles.assignedStatus),
                      }}
                    >
                      {(trip.status || "unknown").replaceAll("_", " ")}
                    </span>
                  </div>

                  <Info label="Origin" value={trip.origin} />
                  <Info label="Destination" value={trip.destination} />
                  <Info label="Vehicle ID" value={trip.vehicle_id} />
                  <Info
                    label="Scheduled"
                    value={
                      trip.scheduled_at
                        ? new Date(trip.scheduled_at).toLocaleString()
                        : "Not available"
                    }
                  />

                  {trip.estimated_duration_minutes && (
                    <Info
                      label="Estimated Duration"
                      value={`${trip.estimated_duration_minutes} minutes`}
                    />
                  )}

                  {trip.description && (
                    <p>{trip.description}</p>
                  )}

                  {trip.status === "assigned" && (
                    <button
                      type="button"
                      style={styles.actionButton}
                      disabled={updatingTripId === trip.id}
                      onClick={() =>
                        updateTripStatus(trip.id, "in_progress")
                      }
                    >
                      {updatingTripId === trip.id
                        ? "Updating..."
                        : "Start Trip"}
                    </button>
                  )}

                  {trip.status === "in_progress" && (
                    <button
                      type="button"
                      style={styles.actionButton}
                      disabled={updatingTripId === trip.id}
                      onClick={() =>
                        updateTripStatus(trip.id, "completed")
                      }
                    >
                      {updatingTripId === trip.id
                        ? "Updating..."
                        : "Complete Trip"}
                    </button>
                  )}

                  {trip.status === "completed" && (
                    <p style={styles.completedText}>Trip completed</p>
                  )}

                  {trip.status === "cancelled" && (
                    <p style={styles.muted}>
                      This trip has been cancelled.
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {view === "profile" && !selectedDriver && (
        <section style={styles.panel}>
          <p style={styles.muted}>
            This driver profile could not be found.
          </p>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={backToOverview}
          >
            ← Back to Fleet Overview
          </button>
        </section>
      )}

      <footer style={styles.footer}>
        FleetFlow · Shared Driver Operations
      </footer>
    </main>
    </div>
  );
}

function Metric({ title, value }) {
  return (
    <article style={styles.metricCard}>
      <p style={styles.metricTitle}>{title}</p>
      <h2 style={styles.metricValue}>{value}</h2>
    </article>
  );
}

function Info({ label, value }) {
  return (
    <p style={styles.infoRow}>
      <strong>{label}:</strong>{" "}
      {value === null || value === undefined || value === ""
        ? "Not available"
        : value}
    </p>
  );
}

function DriverDonutChart({ data, total }) {
  const validData = data.filter((item) => item.count > 0);

  let currentPercentage = 0;

  const segments = validData.map((item) => {
    const percentage = total > 0 ? (item.count / total) * 100 : 0;

    const segment = {
      ...item,
      start: currentPercentage,
      end: currentPercentage + percentage,
    };

    currentPercentage += percentage;
    return segment;
  });

  const gradient =
    total > 0
      ? `conic-gradient(${segments
          .map(
            (item) =>
              `${item.color} ${item.start}% ${item.end}%`
          )
          .join(", ")})`
      : "#e2e8f0";

  return (
    <article style={styles.chartCard}>
      <div style={styles.chartHeader}>
        <h3>Driver Status</h3>
        <strong>{total} Drivers</strong>
      </div>

      <div style={styles.donutLayout}>
        <div
          style={{
            ...styles.donut,
            background: gradient,
          }}
        >
          <div style={styles.donutHole}>
            <strong>{total}</strong>
            <span>Total Drivers</span>
          </div>
        </div>

        <div style={styles.donutLegend}>
          {data.map((item) => (
            <div key={item.label} style={styles.legendItem}>
              <span
                style={{
                  ...styles.legendDot,
                  background: item.color,
                }}
              />
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function ChartCard({ title, data, total }) {
  return (
    <article style={styles.chartCard}>
      <div style={styles.chartHeader}>
        <h3>{title}</h3>
        <strong>{total} Total</strong>
      </div>

      {data.map((item) => {
        const percentage =
          total > 0 ? (item.count / total) * 100 : 0;

        return (
          <div key={item.label} style={styles.chartItem}>
            <div style={styles.chartLabelRow}>
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </div>

            <div style={styles.barBackground}>
              <div
                style={{
                  ...styles.barFill,
                  width: `${percentage}%`,
                  background: item.color,
                }}
              />
            </div>
          </div>
        );
      })}
    </article>
  );
}

const styles = {
  page: {
    height: "100vh",
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "18px 22px",
    background: "#f3f6fb",
    color: "#172033",
    fontFamily: "Arial, sans-serif",
    overflowY: "auto",
  },
  appShell: {
    display: "grid",
    gridTemplateColumns: "220px minmax(0, 1fr)",
    height: "100vh",
    width: "100%",
    overflow: "hidden",
    background: "#f3f6fb",
  },
  sidebar: {
    background: "#ffffff",
    borderRight: "1px solid #e2e8f0",
    padding: "18px 12px",
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    boxSizing: "border-box",
  },
  sidebarBrand: {
    display: "flex",
    alignItems: "center",
    gap: "11px",
    padding: "4px 8px 30px",
  },
  brandIcon: {
    width: "38px",
    height: "38px",
    borderRadius: "9px",
    background: "#2563eb",
    color: "#ffffff",
    display: "grid",
    placeItems: "center",
    fontSize: "21px",
    fontWeight: "bold",
  },
  sidebarLabel: {
    color: "#94a3b8",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "1px",
    paddingLeft: "10px",
    marginBottom: "12px",
  },
  sidebarNav: {
    display: "grid",
    gap: "7px",
  },
  navButton: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    padding: "12px",
    border: "none",
    borderRadius: "8px",
    background: "transparent",
    color: "#475569",
    textAlign: "left",
    fontSize: "14px",
    cursor: "pointer",
  },
  navButtonActive: {
    background: "#eff6ff",
    color: "#1d4ed8",
    fontWeight: "700",
  },
  sidebarBottom: {
    marginTop: "auto",
    paddingTop: "20px",
    borderTop: "1px solid #e2e8f0",
  },
  sidebarLogout: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    padding: "12px",
    border: "none",
    borderRadius: "8px",
    background: "transparent",
    color: "#dc2626",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "10px",
    marginBottom: "16px",
  },
  headerActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
  },
  eyebrow: {
    color: "#2563eb",
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "1.4px",
    marginBottom: "8px",
  },
  heading: {
    margin: "5px 0",
    fontSize: "22px",
  },
  subtitle: {
    color: "#64748b",
    margin: 0,
    fontSize: "13px",
    lineHeight: 1.4,
  },
  panel: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "22px",
    marginBottom: "20px",
    minWidth: 0,
    boxSizing: "border-box",
  },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))",
    gap: "14px",
    marginBottom: "22px",
  },
  metricCard: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "9px",
    padding: "12px",
    minWidth: 0,
  },
  metricTitle: {
    color: "#64748b",
    margin: 0,
    fontSize: "12px",
  },
  metricValue: {
    margin: "7px 0 0",
    fontSize: "22px",
    textTransform: "capitalize",
    overflowWrap: "anywhere",
  },
  overviewLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.65fr) minmax(280px, 0.9fr)",
    gap: "20px",
    alignItems: "start",
    marginBottom: "20px",
  },
  compactChartColumn: {
    display: "grid",
    gap: "16px",
    minWidth: 0,
  },
  chartCard: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    padding: "12px",
  },
  donut: {
    width: "130px",
    height: "130px",
    minWidth: "130px",
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
  },
  donutHole: {
    width: "86px",
    height: "86px",
    borderRadius: "50%",
    background: "#ffffff",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    gap: "3px",
    boxSizing: "border-box",
  },
  donutLayout: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    gap: "12px",
    flexWrap: "wrap",
  },
  donutLegend: {
    display: "grid",
    gap: "7px",
    minWidth: "110px",
  },
  legendItem: {
    display: "grid",
    gridTemplateColumns: "10px 1fr auto",
    alignItems: "center",
    gap: "8px",
    fontSize: "13px",
  },
  legendDot: {
    width: "9px",
    height: "9px",
    borderRadius: "50%",
  },
  chartHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px",
    fontSize: "13px",
  },
  chartItem: {
    marginBottom: "17px",
  },
  chartLabelRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "7px",
    fontSize: "14px",
  },
  barBackground: {
    height: "9px",
    background: "#e9eef5",
    borderRadius: "20px",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: "20px",
    transition: "width 0.3s ease",
  },
  directoryHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "14px",
    marginBottom: "18px",
  },
  directoryTable: {
  width: "100%",
  display: "grid",
  gap: "6px",
},

directoryTableHeader: {
  display: "grid",
  gridTemplateColumns: "minmax(140px, 1.5fr) minmax(130px, 1.3fr) 65px minmax(90px, 0.8fr)",
  alignItems: "center",
  gap: "12px",
  padding: "10px 14px",
  color: "#64748b",
  fontSize: "12px",
  fontWeight: "600",
  borderBottom: "1px solid #e2e8f0",
},

directoryTableRow: {
  display: "grid",
  gridTemplateColumns: "minmax(140px, 1.5fr) minmax(130px, 1.3fr) 65px minmax(90px, 0.8fr)",
  alignItems: "center",
  gap: "12px",
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 14px",
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  color: "#172033",
  textAlign: "left",
  cursor: "pointer",
},

tableDriverName: {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  minWidth: 0,
},

tableDriverNameStrong: {
  fontSize: "13px",
  fontWeight: "600",
},

tableVehicle: {
  fontSize: "13px",
  fontWeight: "500",
  color: "#334155",
},

tableTrips: {
  fontSize: "13px",
  fontWeight: "500",
  textAlign: "center",
},
  sectionTitle: {
    marginTop: 0,
    marginBottom: "8px",
  },
  muted: {
    color: "#64748b",
    lineHeight: 1.5,
  },
  mutedSmall: {
    display: "block",
    color: "#64748b",
    fontSize: "12px",
    marginTop: "5px",
  },
  countBadge: {
    background: "#eff6ff",
    color: "#1d4ed8",
    borderRadius: "20px",
    padding: "8px 13px",
    fontSize: "13px",
    fontWeight: "700",
  },
  searchInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    marginBottom: "16px",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    fontSize: "14px",
  },
  directoryList: {
    display: "grid",
    gap: "7px",
  },
  driverRow: {
    display: "grid",
    gridTemplateColumns: "38px minmax(100px, 1.3fr) minmax(100px, 1fr) 55px auto 14px",
    alignItems: "center",
    gap: "8px",
    padding: "9px",
    width: "100%",
    boxSizing: "border-box",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "9px",
    textAlign: "center",
    cursor: "pointer",
    color: "#172033",
  },
  avatar: {
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "#dbeafe",
    color: "#1d4ed8",
    fontSize: "15px",
    fontWeight: "700",
    flexShrink: 0,
  },
  driverRowInfo: {
    minWidth: 0,
  },
  driverRowVehicle: {
    minWidth: 0,
  },
  driverRowTrips: {
    textAlign: "center",
  },
  arrow: {
    color: "#2563eb",
    fontSize: "22px",
  },
  status: {
    display: "inline-block",
    padding: "6px 11px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: "700",
    textTransform: "capitalize",
    whiteSpace: "nowrap",
  },
  availableStatus: {
    background: "#dcfce7",
    color: "#166534",
  },
  activeStatus: {
    background: "#dbeafe",
    color: "#1d4ed8",
  },
  otherStatus: {
    background: "#f1f5f9",
    color: "#475569",
  },
  assignedStatus: {
    background: "#fef3c7",
    color: "#92400e",
  },
  completedStatus: {
    background: "#dbeafe",
    color: "#1d4ed8",
  },
  cancelledStatus: {
    background: "#fee2e2",
    color: "#991b1b",
  },
  profileHero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "18px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "24px",
    marginBottom: "22px",
  },
  profileIdentity: {
    display: "flex",
    alignItems: "center",
    gap: "18px",
  },
  largeAvatar: {
    width: "68px",
    height: "68px",
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "#dbeafe",
    color: "#1d4ed8",
    fontSize: "28px",
    fontWeight: "700",
  },
  profileName: {
    margin: "5px 0",
    fontSize: "25px",
  },
  twoColumns: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "20px",
    marginBottom: "20px",
  },
  infoRow: {
    margin: "13px 0",
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  },
  vehicleName: {
    color: "#1d4ed8",
    marginTop: "16px",
  },
  tripGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "18px",
  },
  tripCard: {
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    padding: "20px",
    minWidth: 0,
  },
  tripHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "10px",
    marginBottom: "16px",
  },
  actionButton: {
    width: "100%",
    padding: "11px",
    marginTop: "14px",
    border: "none",
    borderRadius: "7px",
    background: "#2563eb",
    color: "#ffffff",
    fontWeight: "700",
    cursor: "pointer",
  },
  refreshButton: {
    padding: "10px 16px",
    border: "1px solid #cbd5e1",
    borderRadius: "7px",
    background: "#ffffff",
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "10px 16px",
    border: "1px solid #cbd5e1",
    borderRadius: "7px",
    background: "#ffffff",
    cursor: "pointer",
  },
    logoutButton: {
    padding: "10px 16px",
    border: "1px solid #bfdbfe",
    borderRadius: "7px",
    background: "#eff6ff",
    color: "#1d4ed8",
    cursor: "pointer",
    fontWeight: "600",
  },
  error: {
    padding: "12px",
    marginBottom: "18px",
    borderRadius: "8px",
    background: "#fee2e2",
    color: "#991b1b",
  },
  notice: {
    padding: "12px",
    marginBottom: "18px",
    borderRadius: "8px",
    background: "#dcfce7",
    color: "#166534",
  },
  completedText: {
    color: "#15803d",
    fontWeight: "700",
  },
  footer: {
    textAlign: "center",
    padding: "20px",
    color: "#64748b",
    fontSize: "13px",
  },
  tableHeader: {
    padding: "12px",
    textAlign: "left",
    borderBottom: "1px solid #ddd",
    whiteSpace: "nowrap",
  },

  tableCell: {
    padding: "12px",
    borderBottom: "1px solid #eee",
    verticalAlign: "top",
  },
    // Vehicle assignment styles
  assignmentCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
    padding: "18px",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    background: "#f8fafc",
  },

  assignmentVehicleName: {
    fontSize: "16px",
    color: "#1e3a8a",
  },

  assignmentForm: {
    display: "flex",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: "14px",
    padding: "18px",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    background: "#f8fafc",
  },

  fieldLabel: {
    display: "block",
    fontSize: "13px",
    fontWeight: "600",
    color: "#475569",
    marginBottom: "8px",
  },

  assignmentSelect: {
    width: "100%",
    minWidth: "220px",
    boxSizing: "border-box",
    padding: "11px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: "7px",
    background: "#ffffff",
    fontSize: "14px",
    color: "#172033",
  },

  assignButton: {
    padding: "11px 20px",
    border: "none",
    borderRadius: "7px",
    background: "#2563eb",
    color: "#ffffff",
    fontWeight: "600",
    cursor: "pointer",
  },

  dangerButton: {
    padding: "11px 18px",
    border: "1px solid #fecaca",
    borderRadius: "7px",
    background: "#fff1f2",
    color: "#dc2626",
    fontWeight: "600",
    cursor: "pointer",
  },
};

export default SharedDriverWorkspace;
