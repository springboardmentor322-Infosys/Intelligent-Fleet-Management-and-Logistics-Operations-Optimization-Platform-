
import { useEffect, useMemo, useState, useRef, useCallback, } from "react";
import { formatISTTimestamp } from "./utils/dateUtils";
import {
  apiRequest,
  login,
  registerUser,
  getPendingApprovals,
  updateApprovalStatus,
  requestPasswordReset,
  resetPassword,
  getDrivers,
  getTrips,
  assignDriver,
  unassignDriver,
  getMyDriverProfile,
  getAllDriverLocations,
  startTripSimulation,
  stopTripSimulation,
  deleteDriver,
  deleteVehicle,

} from "./api";

import DriverGpsTracker from "./DriverGpsTracker";

import {
  Activity, Bell, Bus, CheckCircle2, ChevronDown, CircleHelp,
  ClipboardList, Fuel, LayoutDashboard, LogOut, MapPin, Menu, Plus,
  Search, Settings, ShieldCheck, SlidersHorizontal, Truck, User,
  Users, UserCheck, Wrench, X, ArrowUpRight, ChartNoAxesCombined,
  Settings as SettingsIcon, Moon, Sun,
} from "lucide-react";
import "./App.css";
import "./Shipments.css";
import Shipments from "./Shipments";
import "./TripsRoutes.css";
import TripsRoutes from "./TripsRoutes";
import { jwtDecode } from "jwt-decode";
import LandingPage from "./LandingPage";

import DriverLocationsMap from "./DriverLocationsMap";
import DriversDirectory from "./DriversDirectory";
import SharedDriverWorkspace from "./SharedDriverWorkspace";
import MaintenancePage from "./maintenance/MaintenancePage";
import Analytics from "./analytics/Analytics";
import FuelAnalytics from "./FuelAnalytics";
import SettingsPage from "./Settings";
import DashboardCharts from "./DashboardCharts";
import AllReports from "./AllReports";

function ApprovalRequests({
  pendingApprovals,
  approvalLoading,
  approvalError,
  approvalMessage,
  handleApproval,
  loadPendingApprovals,
}) {
  return (
    <section className="approval-page">
      <div className="approval-page-header">
        <div>
          <span className="settings-eyebrow">
            <p>Review registrations awaiting administrator approval.</p>
          </span> 
        </div>

        <button
          className="secondary-button"
          onClick={() => loadPendingApprovals()}
          disabled={approvalLoading}
        >
          Refresh
        </button>
      </div>

      {approvalMessage && (
        <p className="success-message">{approvalMessage}</p>
      )}

      {approvalError && (
        <p className="error-message">{approvalError}</p>
      )}

      {approvalLoading ? (
        <p>Loading approval requests...</p>
      ) : pendingApprovals.length === 0 ? (
        <div className="approval-empty-state">
          <CheckCircle2 size={32} />
          <h3>No pending requests</h3>
          <p>There are no registrations awaiting approval.</p>
        </div>
      ) : (
        <div className="approval-table-wrapper">
          <table className="approval-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {pendingApprovals.map((user) => (
                <tr key={user.id}>
                  <td>{user.full_name}</td>
                  <td>{user.email}</td>
                  <td>
                    {user.role
                      ?.replaceAll("_", " ")
                      .replace(/\b\w/g, (letter) =>
                        letter.toUpperCase()
                      )}
                  </td>
                  <td>
                    <div className="approval-actions">
                      <button
                        className="approval-approve-button"
                        onClick={() =>
                          handleApproval(user.id, "approved")
                        }
                        disabled={approvalLoading}
                      >
                        Approve
                      </button>

                      <button
                        className="approval-reject-button"
                        onClick={() =>
                          handleApproval(user.id, "rejected")
                        }
                        disabled={approvalLoading}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function App() {
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [assigningVehicleId, setAssigningVehicleId] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [overview, setOverview] = useState(null);
  const [simulatingTripId, setSimulatingTripId] = useState(null);
  const [startingTripId, setStartingTripId] = useState(null);
  const [simulationError, setSimulationError] = useState("");
  const [simulationNotice, setSimulationNotice] = useState("");
  const [trackingTrips, setTrackingTrips] = useState([]);
  const [, setTrackingTripsError] = useState("");
  const [removingDriverId, setRemovingDriverId] = useState(null);
  const [removingVehicleId, setRemovingVehicleId] = useState(null);

  const simulationTimerRef = useRef(null);
  const simulationTripRef = useRef(null);
  const [token, setToken] = useState(
    () => sessionStorage.getItem("fleetflow_token") || ""
  );
  const [userRole, setUserRole] = useState(() => {
    const savedToken = sessionStorage.getItem("fleetflow_token");

    if (!savedToken) return "";

    try {
      return jwtDecode(savedToken).role || "";
    } catch {
      sessionStorage.removeItem("fleetflow_token");
      return "";
    }
  });

  const [userEmail, setUserEmail] = useState(() => {
    const savedToken = sessionStorage.getItem("fleetflow_token");

    if (!savedToken) return "";

    try {
      return jwtDecode(savedToken).email || "";
    } catch {
      return "";
    }
  });

  // Theme management
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("fleetflow_theme") === "dark"
  );

  // Toggle between light and dark mode
  const toggleTheme = () => {
    setDarkMode((prev) => {
      const newMode = !prev;
      localStorage.setItem("fleetflow_theme", newMode ? "dark" : "light");
      return newMode;
    });
  };

  // Apply theme globally
  useEffect(() => {
    document.body.classList.toggle("dark-mode", darkMode);
  }, [darkMode]);

console.log("Current FleetFlow role:", userRole);
  const [myTrips, setMyTrips] = useState([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [tripsError, setTripsError] = useState("");
  const [updatingTripId, setUpdatingTripId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [email, setEmail] = useState("");
  const [page, setPage] = useState("landing");
  const [password, setPassword] = useState("");
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [notice, setNotice] = useState("");
  
const [resetEmail, setResetEmail] = useState("");
const [resetToken, setResetToken] = useState("");
const [resetNewPassword, setResetNewPassword] = useState("");
const [resetMessage, setResetMessage] = useState("");
const [resetError, setResetError] = useState("");
const [resetLoading, setResetLoading] = useState(false);
const sharedDriverHistoryPushed = useRef(false);

const [unassignConfirmVehicle, setUnassignConfirmVehicle] = useState(null);
  
const [pendingApprovals, setPendingApprovals] = useState([]);
const [approvalLoading, setApprovalLoading] = useState(false);
const [approvalError, setApprovalError] = useState("");
const [approvalMessage, setApprovalMessage] = useState("");

const [signupName, setSignupName] = useState("");
const [signupEmail, setSignupEmail] = useState("");
const [signupPassword, setSignupPassword] = useState("");
const [signupRole, setSignupRole] = useState("driver");
const [signupLicenseNumber, setSignupLicenseNumber] = useState("");
const [signupLicenseExpiry, setSignupLicenseExpiry] = useState("");
const [signupPhoneNumber, setSignupPhoneNumber] = useState("");
const [signupLoading, setSignupLoading] = useState(false);
const [signupError, setSignupError] = useState("");
const [signupSuccess, setSignupSuccess] = useState("");
const [driverView, setDriverView] = useState("trips");
const [driverProfile, setDriverProfile] = useState(null);
const [profileLoading, setProfileLoading] = useState(false);
const [profileError, setProfileError] = useState("");
const [driverLocations, setDriverLocations] = useState([]);
const [locationsLoading, setLocationsLoading] = useState(false);
const [locationsError, setLocationsError] = useState("");
const [selectedTripId, setSelectedTripId] = useState(null);
const validDriverIds = new Set(
  drivers.map(driver => Number(driver.id))
);

const visibleDriverLocations = driverLocations.filter(
  location => validDriverIds.has(Number(location.driver_id))
);

const handleStartSimulation = async (trip) => {
  setSimulationError("");
  setSimulationNotice("");

  if (
    !Array.isArray(trip.selected_route_coordinates) ||
    trip.selected_route_coordinates.length < 2
  ) {
    setSimulationError(
      "This trip does not have enough saved route coordinates to simulate."
    );
    return;
  }

  if (simulatingTripId !== null || startingTripId !== null) {
    return;
  }

  setStartingTripId(trip.id);

  try {
    // Start the backend simulation.
    await startTripSimulation(token, trip.id);

    setTrackingTrips((previous) =>
      previous.map((item) =>
        item.id === trip.id
          ? { ...item, status: "in_progress" }
          : item
      )
    );

    // Mark this trip as being simulated.
    setSimulatingTripId(trip.id);

    simulationTripRef.current = trip;

    setSimulationNotice(
      "Trip simulation started successfully."
    );

  } catch (error) {
    simulationTripRef.current = null;
    setSimulatingTripId(null);

    setSimulationError(
      error.message || "Unable to start trip simulation."
    );

  } finally {
    setStartingTripId(null);
  }
};


const handleStopSimulation = async (trip) => {
  try {
    await stopTripSimulation(token, trip.id);

    if (simulationTimerRef.current !== null) {
      window.clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }

    simulationTripRef.current = null;

    setSimulatingTripId(null);
    setSimulationError("");
    setSimulationNotice("Trip simulation stopped.");

  } catch (error) {
    setSimulationError(
      error.message || "Unable to stop trip simulation."
    );
  }
};


  const [form, setForm] = useState({
  reg: "",
  make: "",
  model: "",
  year: new Date().getFullYear(),
  capacity: "",
  insuranceExpiry: "",
  vehicleType: "truck",
  fuelType: "diesel",
  fuelCapacity: "",
  fuelEfficiency: "",
});

const roleNavGroups = {
  administrator: [
    {
      title: "WORKSPACE",
      items: [
        { label: "Dashboard", icon: LayoutDashboard },
        { label: "Fleet Management", icon: Truck },
        { label: "Drivers", icon: Users },
        { label: "Trips & Routes", icon: MapPin },
        { label: "Shipments", icon: ClipboardList },
      ],
    },
    {
      title: "OPERATIONS",
      items: [
        { label: "Maintenance", icon: Wrench },
        { label: "Fuel Analytics", icon: Fuel },
        { label: "Live Tracking", icon: Activity },
        { label: "Analytics", icon: ChartNoAxesCombined },
      ],
    },
    {
      title: "ADMINISTRATION",
      items: [
        { label: "Approval Requests", icon: UserCheck },
        { label: "All Reports", icon: ClipboardList },
      ],
    },
  ],

  fleet_manager: [
    {
      title: "WORKSPACE",
      items: [
        { label: "Dashboard", icon: LayoutDashboard },
        { label: "Fleet Management", icon: Truck },
        { label: "Drivers", icon: Users },
        { label: "Trips & Routes", icon: MapPin },
        { label: "Shipments", icon: ClipboardList },
      ],
    },
    {
      title: "OPERATIONS",
      items: [
        { label: "Maintenance", icon: Wrench },
        { label: "Fuel Analytics", icon: Fuel },
        { label: "Live Tracking", icon: Activity },
        { label: "Analytics", icon: ChartNoAxesCombined },
      ],
    },
  ],

  dispatcher: [
    {
      title: "WORKSPACE",
      items: [
        { label: "Dashboard", icon: LayoutDashboard },
        { label: "Trips & Routes", icon: MapPin },
        { label: "Shipments", icon: ClipboardList },
      ],
    },
    {
      title: "OPERATIONS",
      items: [
        { label: "Live Tracking", icon: Activity },
      ],
    },
  ],
};

const normalizedRole = {
  admin: "administrator",
  fleetmanager: "fleet_manager",
  fleet_manager: "fleet_manager",
  dispatcher: "dispatcher",
  driver: "driver",
}[userRole?.toLowerCase().replace(/[\s-]/g, "")] 
  || userRole?.toLowerCase();

const visibleNavGroups = roleNavGroups[normalizedRole] ?? [];


const loadPendingApprovals = useCallback(async () => {
  setApprovalLoading(true);
  setApprovalError("");

  try {
    const data = await getPendingApprovals(token);

    setPendingApprovals(
      Array.isArray(data) ? data : []
    );
  } catch (error) {
    setApprovalError(
      error.message || "Failed to load approval requests."
    );
  } finally {
    setApprovalLoading(false);
  }
}, [token]);

useEffect(() => {
  if (!token || activeNav !== "Approval Requests") {
    return;
  }

  let cancelled = false;

  async function fetchApprovals() {
    try {
      const data = await getPendingApprovals(token);

      if (!cancelled) {
        setPendingApprovals(
          Array.isArray(data) ? data : []
        );
        setApprovalError("");
      }
    } catch (error) {
      if (!cancelled) {
        setApprovalError(
          error.message || "Failed to load approval requests."
        );
      }
    }
  }

  fetchApprovals();

  return () => {
    cancelled = true;
  };
}, [token, activeNav]);

async function handleApproval(userId, decision) {
  setApprovalError("");
  setApprovalMessage("");

  try {
    await updateApprovalStatus(token, userId, decision);

    setApprovalMessage(
      decision === "approved"
        ? "User approved successfully."
        : "User rejected successfully."
    );

    await loadPendingApprovals();
  } catch (error) {
    setApprovalError(error.message || "Could not update approval status.");
  }
}
 
async function handleLogin(event) {
  event.preventDefault();
  setApiError("");

  try {
    const result = await login(email, password);
    const decodedToken = jwtDecode(result.access_token);

    if (!decodedToken.role) {
      throw new Error("User role was not found in the login token.");
    }

    sessionStorage.setItem("fleetflow_token", result.access_token);
    setUserRole(decodedToken.role);
    setUserEmail(decodedToken.email || "");
    setToken(result.access_token);
    setPassword("");
  } catch (error) {
    setApiError(error.message || "Login failed.");
  }
}

const handleSignup = async (e) => {
  e.preventDefault();
  setSignupError("");
  setSignupSuccess("");
  setSignupLoading(true);

  try {
    const signupData = {
      full_name: signupName.trim(),
      email: signupEmail.trim(),
      password: signupPassword,
      role: signupRole,
    };

    if (signupRole === "driver") {
      const isSharedDriver =
        signupEmail.trim().toLowerCase() === "driver@gmail.com";

      signupData.license_number = isSharedDriver
        ? null
        : signupLicenseNumber.trim();

      signupData.license_expiry = isSharedDriver
        ? null
        : signupLicenseExpiry;

      signupData.phone_number = isSharedDriver
        ? null
        : signupPhoneNumber.trim();
    }

    await registerUser(signupData);

    setEmail(signupEmail.trim());
    setSignupName("");
    setSignupEmail("");
    setSignupPassword("");
    setSignupLicenseNumber("");
    setSignupLicenseExpiry("");
    setSignupPhoneNumber("");
    setSignupRole("driver");

    if (signupRole === "driver") {
      setSignupSuccess("Account created successfully. Please sign in.");
      setPage("signin");
    } else {
      setSignupSuccess(
        "Signup request submitted. Your account is awaiting Administrator approval. You can sign in after approval."
      );
    }
  } catch (error) {
    const message = error.message;

    setSignupError(
      typeof message === "string"
        ? message
        : JSON.stringify(message ?? error)
    );
  } finally {
    setSignupLoading(false);
  }
};


function handleLogout() {
  sessionStorage.removeItem("fleetflow_token");
  setToken("");
  setUserRole("");
  setMyTrips([]);
  setOverview(null);
  setVehicles([]);
  setApiError("");
  setTripsError("");
}

  
const loadDashboard = useCallback(async (
  authToken = token,
  role = userRole
) => {
  if (!authToken || !role) return;

  // Drivers must not load the fleet manager dashboard.
  if (role === "driver") {
    setOverview(null);
    setVehicles([]);
    setApiError("");
    setLoading(false);
    return;
  }

  setLoading(true);
  setApiError("");

  try {
    const [summary, records] = await Promise.all([
      apiRequest("/dashboard/overview", {
        token: authToken,
      }),
      apiRequest("/dashboard/vehicles", {
        token: authToken,
      }),
    ]);

    setOverview(summary);

    setVehicles(
      records
        .filter((v) => v.status?.toLowerCase() !== "inactive")
        .map((v) => ({
          id: v.id,
          assigned_driver_id: v.assigned_driver_id,
          reg: v.registration_number,
          type: v.vehicle_type
            ? v.vehicle_type
                .split("_")
                .map(
                  (word) =>
                    word.charAt(0).toUpperCase() +
                    word.slice(1)
                )
                .join(" ")
            : "Truck",
          model: `${v.make} ${v.model}`,
          driver: v.assigned_driver_name || "Unassigned",
          status: {
            available: "Idle",
            on_trip: "Active",
            maintenance: "Maintenance",
          }[v.status] || v.status,
          fuel: v.fuel_type
            ? `${v.fuel_type.charAt(0).toUpperCase()}${v.fuel_type.slice(1)}`
            : "—",
          capacity: `${v.capacity_kg.toLocaleString()} kg`,
        }))
    );
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem("fleetflow_token");

      setToken("");
      setUserRole("");
      setApiError("");

      setNotice("Your session has expired. Please sign in again.");
      return;
    }

    setApiError(
      error.message || "Unable to load dashboard data."
    );
  } finally {
    setLoading(false);
  }
}, [token, userRole]);


const loadDrivers = useCallback(async () => {
  if (!token || !["administrator", "fleet_manager"].includes(normalizedRole)) {
    return;
  }

  setDriversLoading(true);

  try {
    const records = await getDrivers(token);

    setDrivers(
      Array.isArray(records)
        ? records.filter(
            (driver) => driver.status?.toLowerCase() !== "inactive"
          )
        : []
    );
  } catch (error) {
    setAssignmentError(error.message || "Unable to load drivers.");
  } finally {
    setDriversLoading(false);
  }
}, [token, normalizedRole]);



async function handleAssignDriver(vehicleId) {
  if (!selectedDriverId) {
    setAssignmentError("Please select a driver first.");
    return;
  }

  setAssignmentLoading(true);
  setAssignmentError("");
  setNotice("");

  try {
    await assignDriver(token, vehicleId, Number(selectedDriverId));
    setNotice("Driver assigned successfully.");
    setAssigningVehicleId(null);
    setSelectedDriverId("");
    await loadDashboard(token, normalizedRole);
  } catch (error) {
    setAssignmentError(error.message || "Unable to assign driver.");
  } finally {
    setAssignmentLoading(false);
  }
}


async function handleUnassignDriver(vehicleId) {
  setAssignmentLoading(true);
  setAssignmentError("");
  setNotice("");

  try {
    await unassignDriver(token, vehicleId);

    setNotice("Driver unassigned successfully.");
    setUnassignConfirmVehicle(null);

    await loadDashboard(token, normalizedRole);
  } catch (error) {
    setAssignmentError(
      error.message || "Unable to unassign driver."
    );
  } finally {
    setAssignmentLoading(false);
  }
}

async function handleRemoveDriver(driver) {
  const driverName =
    driver.full_name || driver.name || `Driver ${driver.id}`;

  const confirmed = window.confirm(
    `Are you sure you want to remove ${driverName} from the active fleet?`
  );

  if (!confirmed) return;

  setRemovingDriverId(driver.id);
  setAssignmentError("");
  setNotice("");

  try {
    await deleteDriver(token, driver.id);

    setNotice(`${driverName} was removed successfully.`);

    await Promise.all([
      loadDrivers(),
      loadDashboard(token, normalizedRole),
    ]);
  } catch (error) {
    setAssignmentError(
      error.message || "Unable to remove this driver."
    );
  } finally {
    setRemovingDriverId(null);
  }
}

async function handleRemoveVehicle(vehicle) {
  const vehicleName = vehicle.reg || `Vehicle ${vehicle.id}`;

  const confirmed = window.confirm(
    `Are you sure you want to remove vehicle ${vehicleName} from the active fleet?`
  );

  if (!confirmed) return;

  setRemovingVehicleId(vehicle.id);
  setAssignmentError("");
  setNotice("");

  try {
    await deleteVehicle(token, vehicle.id);

    setNotice(`Vehicle ${vehicleName} was removed successfully.`);

    await Promise.all([
      loadDashboard(token, normalizedRole),
      loadDrivers(),
    ]);
  } catch (error) {
    setAssignmentError(
      error.message || "Unable to remove this vehicle."
    );
  } finally {
    setRemovingVehicleId(null);
  }
}

const loadMyTrips = useCallback(async (authToken = token) => {
  if (!authToken) return;

  setTripsLoading(true);
  setTripsError("");

  try {
    const records = await apiRequest("/trips/my-trips", {
      token: authToken,
    });

    setMyTrips(records);
  } catch (error) {
    setTripsError(error.message || "Unable to load your trips.");

    if (
      error.message?.includes("401") ||
      error.message?.toLowerCase().includes("not authenticated")
    ) {
      sessionStorage.removeItem("fleetflow_token");
      setToken("");
      setUserRole("");
    }
  } finally {
    setTripsLoading(false);
  }
}, [token]);

async function updateMyTripStatus(tripId, newStatus) {
  setTripsError("");
  setUpdatingTripId(tripId);

  try {
    await apiRequest(`/trips/${tripId}/status`, {
      method: "PATCH",
      token,
      body: JSON.stringify({
        status: newStatus,
      }),
    });

    await loadMyTrips(token);
    setNotice(
      newStatus === "in_progress"
        ? "Trip started successfully."
        : "Trip completed successfully."
    );
  } catch (error) {
    setTripsError(error.message || "Unable to update trip status.");
  } finally {
    setUpdatingTripId(null);
  }
}

const loadDriverLocations = async (authToken) => {
  setLocationsLoading(true);
  setLocationsError("");

  try {
    const locations = await getAllDriverLocations(authToken);
    setDriverLocations(Array.isArray(locations) ? locations : []);
  } catch (error) {
    setLocationsError(
      error.message || "Unable to load driver locations."
    );
  } finally {
    setLocationsLoading(false);
  }
};
useEffect(() => {
  if (
    !token ||
    !["Drivers", "Live Tracking", "Fleet Map"].includes(activeNav)
  ) {
    return;
  }

  let cancelled = false;

  async function fetchDriverLocations() {
    try {
      const locations = await getAllDriverLocations(token);

      if (!cancelled) {
        setDriverLocations(
          Array.isArray(locations) ? locations : []
        );
        setLocationsError("");
      }
    } catch (error) {
      if (!cancelled) {
        setLocationsError(
          error.message || "Unable to load driver locations."
        );
      }
    }
  }

  fetchDriverLocations();

  return () => {
    cancelled = true;
  };
}, [token, activeNav]);

useEffect(() => {
  if (
    !token ||
    !["Live Tracking", "Drivers", "Fleet Map"].includes(activeNav)
  ) {
    return;
  }

  let cancelled = false;

  async function loadTrackingTrips() {
    try {
      const result = await getTrips(token);

      if (cancelled) return;

      console.log("Trips API response:", result);

      const trips = Array.isArray(result)
        ? result
        : Array.isArray(result?.items)
          ? result.items
          : Array.isArray(result?.trips)
            ? result.trips
            : [];

      setTrackingTrips(trips);
      setTrackingTripsError("");
    } catch (error) {
      if (cancelled) return;

      console.error("Unable to load trips for tracking:", error);

      setTrackingTripsError(
        error.message || "Unable to load trips."
      );

      setTrackingTrips([]);
    }
  }

  loadTrackingTrips();

  return () => {
    cancelled = true;
  };
}, [token, activeNav]);

useEffect(() => {
  return () => {
    if (simulationTimerRef.current !== null) {
      window.clearInterval(simulationTimerRef.current);
    }
  };
}, []);

useEffect(() => {
  if (!token || !["Live Tracking", "Fleet Map"].includes(activeNav)) {
    return;
  }

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

      // Keep the connection alive.
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
      } catch (error) {
        console.error("Invalid driver location WebSocket message:", error);
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
}, [token, activeNav]);

useEffect(() => {
  const isSharedDriver =
    token &&
    userRole === "driver" &&
    userEmail?.trim().toLowerCase() === "driver@gmail.com";

  if (!isSharedDriver) {
    sharedDriverHistoryPushed.current = false;
    return;
  }

  // Create an in-app browser history entry.
  // This ensures Back returns to FleetFlow instead of leaving the app.
  if (!sharedDriverHistoryPushed.current) {
    window.history.pushState(
      { fleetflowSharedDriver: true },
      "",
      window.location.href
    );

    sharedDriverHistoryPushed.current = true;
  }

  function handleBrowserBack() {
    sharedDriverHistoryPushed.current = false;

    handleLogout();
    setPage("landing");
  }

  window.addEventListener("popstate", handleBrowserBack);

  return () => {
    window.removeEventListener("popstate", handleBrowserBack);
  };
}, [token, userRole, userEmail]);

useEffect(() => {
  if (!token || !userRole) return;

  let cancelled = false;

  const loadInitialData = async () => {
    try {
      if (userRole === "driver") {
        await loadMyTrips(token);
      } else {
        await loadDashboard(token, userRole);
      }

      if (
        !cancelled &&
        ["administrator", "fleet_manager"].includes(userRole)
      ) {
        await loadDrivers();
      }
    } catch (error) {
      console.error("Error loading initial dashboard data:", error);
    }
  };

  const timeoutId = window.setTimeout(() => {
    if (!cancelled) {
      loadInitialData();
    }
  }, 0);

  return () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
  };
}, [token, userRole, loadMyTrips, loadDashboard, loadDrivers]);



useEffect(() => {
  function handleBrowserNavigation(event) {
    const previousPage = event.state?.fleetFlowPage;

    setActiveNav(previousPage || "Dashboard");
    setMobileMenu(false);
    setNotice("");
  }

  window.addEventListener("popstate", handleBrowserNavigation);

  return () => {
    window.removeEventListener("popstate", handleBrowserNavigation);
  };
}, []);

  
const totalCount = overview?.total_vehicles ?? vehicles.length;
console.log("Dashboard overview:", overview);
console.log("Dashboard vehicles:", vehicles);
console.log("Dashboard total:", totalCount);
const activeCount = overview?.vehicles_on_trip ?? 0;
const maintenanceCount = overview?.vehicles_in_maintenance ?? 0;
const unassignedCount = overview?.unassigned_vehicles ?? 0;

  const filteredVehicles = useMemo(() => vehicles.filter(v => {
    const term = search.toLowerCase();
    const matchesSearch = [v.reg, v.type, v.model, v.driver]
      .some(value => value.toLowerCase().includes(term));
    return matchesSearch &&
      (statusFilter === "All" || v.status === statusFilter) &&
      (typeFilter === "All" || v.type === typeFilter);
  }), [vehicles, search, statusFilter, typeFilter]);

  
  
  async function addVehicle(event) {
    event.preventDefault();
    setApiError("");
    setNotice("");

    if (!token && page === "signin") {
      setApiError("Please sign in before registering a vehicle.");
      return;
    }

    const payload = {
  registration_number: form.reg.trim().toUpperCase(),
  make: form.make.trim(),
  model: form.model.trim(),
  manufacturing_year: Number(form.year),
  capacity_kg: Number(form.capacity),
  insurance_expiry: form.insuranceExpiry,
  vehicle_type: form.vehicleType,
  fuel_type: form.fuelType,
  fuel_capacity: form.fuelCapacity
    ? Number(form.fuelCapacity)
    : null,
  fuel_efficiency: form.fuelEfficiency
    ? Number(form.fuelEfficiency)
    : null,
};

    if (
      !payload.registration_number ||
      !payload.make ||
      !payload.model ||
      !payload.manufacturing_year ||
      !payload.capacity_kg ||
      !payload.insurance_expiry
    ) {
      setApiError("Please fill in all required vehicle details.");
      return;
    }

    try {
      setLoading(true);

      await apiRequest("/vehicles/", {
        method: "POST",
        token,
        body: JSON.stringify(payload),
      });

      await loadDashboard(token);

      setForm({
        reg: "",
        make: "",
        model: "",
        year: new Date().getFullYear(),
        capacity: "",
        insuranceExpiry: "",
      });

      setShowForm(false);
      setNotice("Vehicle registered successfully.");
    } catch (error) {
      setApiError(
        typeof error.message === "string"
          ? error.message
          : JSON.stringify(error.message)
      );
    
    } finally {
      setLoading(false);
    }
  }



function navigate(label) {
  console.log("Sidebar clicked:", label);

  setActiveNav(label);
  setMobileMenu(false);

  window.history.pushState(
    { fleetFlowPage: label },
    "",
    `#${encodeURIComponent(label.toLowerCase().replaceAll(" ", "-"))}`
  );

  setNotice("");
}

  
  if (!token && page === "landing") {
    return (
      <div className="landing-page">
        <header className="landing-header">
          <a
            className="landing-brand"
            href="#home"
            onClick={(e) => {
              e.preventDefault();
              setPage("landing");
            }}
          >
            <span className="landing-brand-icon">
              <Truck size={25} />
            </span>
            <span>
              <strong>FleetFlow</strong>
              <small>LOGISTICS PLATFORM</small>
            </span>
          </a>

          <nav className="landing-nav">
            <a href="#features">Features</a>
            <a href="#about">About</a>
            <button
              className="landing-signin"
              onClick={() => setPage("signin")}
            >
              Sign In
            </button>
            <button
              className="primary-button"
              onClick={() => setPage("signup")}
            >
              Get Started
            </button>
          </nav>
        </header>

        <main>
          <section className="landing-hero" id="home">
            <div className="landing-hero-content">
              <span className="landing-badge">
                INTELLIGENT FLEET MANAGEMENT
              </span>

              <h1>
                Smarter logistics.
                <br />
                <span>Smoother journeys.</span>
              </h1>

              <p>
                Manage vehicles, coordinate drivers, and streamline
                trip operations from one unified fleet management
                platform.
              </p>

              <div className="landing-actions">
                <button
                  className="primary-button landing-primary"
                  onClick={() => setPage("signup")}
                >
                  Get Started <ArrowUpRight size={18} />
                </button>

                <button
                  className="secondary-button"
                  onClick={() => setPage("signin")}
                >
                  Sign In to FleetFlow
                </button>
              </div>

              <div className="landing-highlights">
                <span><CheckCircle2 size={17} /> Vehicle management</span>
                <span><CheckCircle2 size={17} /> Driver coordination</span>
                <span><CheckCircle2 size={17} /> Trip visibility</span>
              </div>
            </div>
          </section>

          <section className="landing-features" id="features">
            <div className="landing-section-heading">
              <span>ONE PLATFORM. BETTER CONTROL.</span>
              <h2>Everything your fleet needs</h2>
              <p>
                Bring your essential logistics operations together
                in one place.
              </p>
            </div>

            <div className="landing-feature-grid">
              <article className="landing-feature-card">
                <span><Truck size={24} /></span>
                <h3>Fleet Management</h3>
                <p>
                  Register vehicles and monitor their availability
                  and operational status.
                </p>
              </article>

              <article className="landing-feature-card">
                <span><Users size={24} /></span>
                <h3>Driver Management</h3>
                <p>
                  Maintain driver information and coordinate
                  vehicle assignments.
                </p>
              </article>

              <article className="landing-feature-card">
                <span><MapPin size={24} /></span>
                <h3>Trip Management</h3>
                <p>
                  Organize trips and follow their operational
                  progress.
                </p>
              </article>
            </div>
          </section>

          <section className="landing-bottom-cta" id="about">
            <div>
              <h2>Bring your fleet operations together.</h2>
              <p>
                Get started with FleetFlow and manage your
                logistics in one place.
              </p>
            </div>
            <button
              className="primary-button"
              onClick={() => setPage("signup")}
            >
              Join FleetFlow <ArrowUpRight size={18} />
            </button>
          </section>
        </main>

        <footer className="landing-footer">
          <strong>FleetFlow</strong>
          <span>Intelligent Fleet Management and Logistics Operations</span>
        </footer>
      </div>
    );
  }



if (!token && page === "forgot-password") {
  async function handleForgotPassword(e) {
    e.preventDefault();
    setResetError("");
    setResetMessage("");
    setResetLoading(true);

    try {
      const result = await requestPasswordReset(resetEmail);
      setResetMessage(
        result.message ||
          "If an eligible account exists, OTP instructions have been sent."
      );
      setResetToken("");
      setResetNewPassword("");
    } catch (error) {
      setResetError(
        error.message || "Unable to request password reset."
      );
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleForgotPassword}>
        <div className="login-logo">
          <Truck size={30} />
        </div>

        <h1>Forgot Password?</h1>
        <p>
          Enter your registered email address to request a
          six-digit password-reset OTP.
        </p>

        <label htmlFor="reset-email">Email address</label>
        <input
          id="reset-email"
          type="email"
          value={resetEmail}
          onChange={(e) => setResetEmail(e.target.value)}
          autoComplete="email"
          required
        />

        {resetMessage && (
          <p className="login-success">{resetMessage}</p>
        )}

        {resetError && (
          <p className="login-error">{resetError}</p>
        )}

        <button
          className="primary-button login-submit"
          type="submit"
          disabled={resetLoading}
        >
          {resetLoading ? "Sending..." : "Send OTP"}
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setResetMessage("");
            setResetError("");
            setPage("reset-password");
          }}
        >
          Enter OTP
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setResetMessage("");
            setResetError("");
            setPage("signin");
          }}
        >
          Back to Sign In
        </button>
      </form>
    </div>
  );
}



if (!token && page === "reset-password") {
  async function handleResetPassword(e) {
    e.preventDefault();
    setResetError("");
    setResetMessage("");
    setResetLoading(true);

    try {
      const result = await resetPassword(
        resetEmail,
        resetToken,
        resetNewPassword
      );

      setResetMessage(result.message);
      setResetToken("");
      setResetNewPassword("");
    } catch (error) {
      setResetError(
        error.message || "Unable to reset password."
      );
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleResetPassword}>
        <div className="login-logo">
          <Truck size={30} />
        </div>

        <h1>Reset Password</h1>
        <p>
          Enter your registered email, six-digit OTP, and new password.
        </p>

        <label htmlFor="confirm-reset-email">Email address</label>
        <input
          id="confirm-reset-email"
          type="email"
          value={resetEmail}
          onChange={(e) => setResetEmail(e.target.value)}
          autoComplete="email"
          required
        />

        <label htmlFor="confirm-reset-token">Six-digit OTP</label>
        <input
          id="confirm-reset-token"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          value={resetToken}
          onChange={(e) =>
            setResetToken(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          placeholder="Enter 6-digit OTP"
          required
        />

        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={resetNewPassword}
          onChange={(e) => setResetNewPassword(e.target.value)}
          minLength={8}
          maxLength={128}
          required
        />

        {resetMessage && (
          <p className="login-success">{resetMessage}</p>
        )}

        {resetError && (
          <p className="login-error">{resetError}</p>
        )}

        {resetMessage ? (
          <div className="reset-success-state">
            <h2>Password reset successful!</h2>
            <button
              type="button"
              className="primary-button login-submit"
              onClick={() => {
                setEmail(resetEmail);
                setPassword("");
                setResetMessage("");
                setResetError("");
                setResetToken("");
                setResetNewPassword("");
                setPage("signin");
              }}
            >
              Return to Sign In
            </button>
          </div>
        ) : (
          <>
            <button
              className="primary-button login-submit"
              type="submit"
              disabled={resetLoading}
            >
              {resetLoading ? "Resetting..." : "Reset Password"}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setResetMessage("");
                setResetError("");
                setPage("forgot-password");
              }}
            >
              Back to Forgot Password
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() => setPage("signin")}
            >
              Back to Sign In
            </button>
          </>
        )}
      </form>
    </div>
  );
}

if (!token && page === "landing") {
  return (
    <LandingPage
      onLogin={() => setPage("signin")}
      onGetStarted={() => setPage("signup")}
    />
  );
}
  
if (!token && page === "signup") {
  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSignup}>
        <div className="login-logo">
          <Truck size={30} />
        </div>

        <h1>Create your account</h1>
        <p>Register on FleetFlow.</p>

        <label htmlFor="signup-name">Full name</label>
        <input
          id="signup-name"
          type="text"
          value={signupName}
          onChange={(e) => setSignupName(e.target.value)}
          placeholder="Enter your full name"
          required
        />

        <label htmlFor="signup-email">Email address</label>
        <input
          id="signup-email"
          type="email"
          value={signupEmail}
          onChange={(e) => setSignupEmail(e.target.value)}
          placeholder="Enter your email"
          required
        />

        <label htmlFor="signup-password">Password</label>
        <input
          id="signup-password"
          type="password"
          value={signupPassword}
          onChange={(e) => setSignupPassword(e.target.value)}
          placeholder="Create a password"
          minLength={8}
          required
        />

        <label htmlFor="signup-role">Register as</label>
        <select
          id="signup-role"
          value={signupRole}
          onChange={(e) => setSignupRole(e.target.value)}
          required
        >
          <option value="driver">Driver</option>
          <option value="fleet_manager">Fleet Manager</option>
          <option value="dispatcher">Dispatcher</option>
        </select>

        {signupRole === "driver" && (
          <>
            <label htmlFor="signup-license">Driving license number</label>
            <input
              id="signup-license"
              type="text"
              value={signupLicenseNumber}
              onChange={(e) => setSignupLicenseNumber(e.target.value)}
              placeholder="Enter your license number"
              maxLength={50}
              required={signupEmail.trim().toLowerCase() !== "driver@gmail.com"}
            />

            <label htmlFor="signup-license-expiry">License expiry date</label>
            <input
              id="signup-license-expiry"
              type="date"
              value={signupLicenseExpiry}
              onChange={(e) => setSignupLicenseExpiry(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              required={signupEmail.trim().toLowerCase() !== "driver@gmail.com"}
            />

            <label htmlFor="signup-phone">Phone number</label>
            <input
              id="signup-phone"
              type="tel"
              value={signupPhoneNumber}
              onChange={(e) => setSignupPhoneNumber(e.target.value)}
              placeholder="Enter your phone number"
              maxLength={20}
              required={signupEmail.trim().toLowerCase() !== "driver@gmail.com"}
            />
          </>
        )}  

  {signupRole !== "driver" && (
    <p>
      Your registration will be submitted for Administrator approval.
      You can sign in after your account is approved.
    </p>
  )}

  {signupError && (
    <p className="login-error">{signupError}</p>
  )}

  {signupSuccess && (
    <p className="login-success">{signupSuccess}</p>
  )}

  <button
    className="primary-button login-submit"
    type="submit"
    disabled={signupLoading}
  >
    {signupLoading
      ? "Submitting..."
      : signupRole === "driver"
        ? "Create account"
        : "Submit registration"}
  </button>

  <button
    type="button"
    className="secondary-button"
    onClick={() => setPage("signin")}
  >
    Already registered? Sign In
  </button>

  <button
    type="button"
    className="secondary-button"
    onClick={() => setPage("landing")}
  >
    Back to Home
  </button>
</form>
    </div>
  );
}

  if (!token) {
    return (
      <div className="login-page">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="login-logo">
            <Truck size={30} />
          </div>

          <h1>Welcome to FleetFlow</h1>
          <p>Sign in to manage your fleet operations.</p>

          <label htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your registered email"
            required
          />

          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
          />

          <div className="forgot-password-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setResetEmail(email);
                setResetMessage("");
                setResetError("");
                setPage("forgot-password");
            }}
        >
          Forgot Password?
    </button>
</div>

          {apiError && (
            <p className="login-error">{String(apiError)}</p>
          )}

          <button
            className="primary-button login-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  
if (token && !userRole) {
  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Loading FleetFlow...</h1>
        <p>Preparing your workspace.</p>
      </div>
    </div>
  );
}

if (
  userRole === "driver" &&
  userEmail?.trim().toLowerCase() === "driver@gmail.com"
) {
  return (
    <SharedDriverWorkspace
      token={token}
      onLogout={handleLogout}
    />
  );
}

if (userRole === "driver") {
  const activeTrips = myTrips.filter(
    (trip) =>
      trip.status === "assigned" ||
      trip.status === "in_progress"
  );

  const completedTrips = myTrips.filter(
    (trip) => trip.status === "completed"
  );

  
  return (
    <div className="app-shell driver-app-shell">
      <aside className="sidebar driver-sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">
            <Truck size={24} />
          </span>
          <span>
            <strong>FleetFlow</strong>
            <small>DRIVER WORKSPACE</small>
          </span>
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>

        <button
          type="button"
          className={`nav-item ${driverView === "trips" ? "active" : ""}`}
          onClick={() => {
            setDriverView("trips");
setNotice("");
          }}
        >
          <MapPin size={18} />
          <span>My Trips</span>
        </button>

        <div className="sidebar-section-label">ACCOUNT</div>

        
<button
  type="button"
  className={`nav-item ${driverView === "profile" ? "active" : ""}`}
  
onClick={async () => {
  setDriverView("profile");
  setNotice("");
  setProfileError("");
  setProfileLoading(true);

  try {
    const profile = await getMyDriverProfile(token);
    setDriverProfile(profile);
  } catch (error) {
    setProfileError(error.message || "Unable to load your profile.");
  } finally {
    setProfileLoading(false);
  }
}}

>
  <Users size={18} />
  <span>My Profile</span>
</button>


        <button
          type="button"
          className="nav-item"
          onClick={() => {
            setNotice("Trip history is available in My Trips for now.");
          }}
        >
          <ClipboardList size={18} />
          <span>Trip History</span>
        </button>

        <div className="driver-sidebar-bottom">
          <div className="driver-account">
            <span className="driver-avatar">
              <User size={18} />
            </span>
            <span>
              <strong>Driver Account</strong>
              <small>Driver</small>
            </span>
          </div>

          <button
            type="button"
            className="nav-item"
            onClick={() => {
              sessionStorage.removeItem("fleetflow_token");
              setToken("");
              setUserRole("");
              setMyTrips([]);
              setPage("signin");
            }}
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <main className="main-area driver-main-area">
        <header className="topbar">
          <div className="topbar-left">
            <Truck size={24} />
            <strong>FleetFlow</strong>
            <span className="breadcrumb">Driver Workspace</span>
          </div>


          <button
            className="secondary-button"
            onClick={() => {
              sessionStorage.removeItem("fleetflow_token");
              setToken("");
              setUserRole("");
              setMyTrips([]);
              setPage("signin");
            }}
          >
            Sign Out
          </button>
        </header>

        <div className="page-content">
          
<div className="page-heading">
  <div>
    <div className="eyebrow">
      <span className="eyebrow-line" />
      DRIVER WORKSPACE
    </div>
    <h1>{driverView === "profile" ? "My Profile" : "My Trips"}</h1>
    <p>
      {driverView === "profile"
        ? "View your driver account details."
        : "View your assigned trips and update their progress."}
    </p>
  </div>

  {driverView === "trips" && (
    <button
      className="secondary-button"
      onClick={() => loadMyTrips(token)}
      disabled={tripsLoading}
    >
      {tripsLoading ? "Refreshing..." : "Refresh Trips"}
    </button>
  )}
</div>

{driverView === "trips" && (
  <section className="panel" style={{ padding: 24, marginBottom: 24 }}>
    <div className="panel-heading">
      <div>
        <h2>Live GPS Tracking</h2>
        <p>Share your current location with the fleet operations team.</p>
      </div>
      <MapPin size={24} />
    </div>

    <DriverGpsTracker
      token={token}
      activeTrip={myTrips.find((trip) => trip.status === "in_progress") || null}
    />
  </section>
)}

  

{driverView === "trips" && (
  <>      
<section className="metrics-grid" id="driver-trips">
  <Metric
    title="Total Trips"
    value={myTrips.length}
    caption="Trips assigned to you"
    icon={MapPin}
    tone="blue"
  />

  <Metric
    title="Active Trips"
    value={activeTrips.length}
    caption="Assigned or in progress"
    icon={Truck}
    tone="green"
  />

  <Metric
    title="Completed Trips"
    value={completedTrips.length}
    caption="Successfully completed"
    icon={CheckCircle2}
    tone="purple"
  />
</section>


          {tripsError && (
            <div className="notice">
              <span>{tripsError}</span>
              <button onClick={() => setTripsError("")}>
                <X size={16} />
              </button>
            </div>
          )}

          {notice && (
            <div className="notice">
              <span>{notice}</span>
              <button onClick={() => setNotice("")}>
                <X size={16} />
              </button>
            </div>
          )}

          {tripsLoading && myTrips.length === 0 && (
            <div className="panel" style={{ padding: 24 }}>
              Loading your trips...
            </div>
          )}

          {!tripsLoading &&
            !tripsError &&
            myTrips.length === 0 && (
              <div className="panel" style={{ padding: 28 }}>
                <MapPin size={32} />
                <h2>No trips assigned yet</h2>
                <p>
                  Your assigned trips will appear here when
                  they are created by the fleet operations team.
                </p>
              </div>
            )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 20,
              marginTop: 24,
            }}
          >
            {myTrips.map((trip) => (
              <article
                className="panel"
                key={trip.id}
                style={{ padding: 22 }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <strong>Trip #{trip.id}</strong>

                  <span
                    className={`status-pill status-${
                      trip.status === "in_progress"
                        ? "active"
                        : trip.status
                    }`}
                  >
                    <i />
                    {trip.status.replaceAll("_", " ")}
                  </span>
                </div>

                <div style={{ marginTop: 24 }}>
                  <p style={{ marginBottom: 6 }}>
                    <MapPin size={16} /> Origin
                  </p>
                  <h3>{trip.origin}</h3>

                  <p style={{ marginTop: 18, marginBottom: 6 }}>
                    <MapPin size={16} /> Destination
                  </p>
                  <h3>{trip.destination}</h3>
                </div>

                {trip.description && (
                  <p style={{ marginTop: 16 }}>
                    {trip.description}
                  </p>
                )}

                <div style={{ marginTop: 18 }}>
                  <p>
                    <strong>Vehicle ID:</strong> {trip.vehicle_id}
                  </p>
                  <p>
                    <strong>Scheduled:</strong>{" "}
                    {new Date(trip.scheduled_at).toLocaleString()}
                  </p>
                </div>

                {trip.status === "assigned" && (
                  <button
                    className="primary-button"
                    style={{ marginTop: 20, width: "100%" }}
                    disabled={updatingTripId === trip.id}
                    onClick={() =>
                      updateMyTripStatus(
                        trip.id,
                        "in_progress"
                      )
                    }
                  >
                    {updatingTripId === trip.id
                      ? "Updating..."
                      : "Start Trip"}
                  </button>
                )}

                {trip.status === "in_progress" && (
                  <button
                    className="primary-button"
                    style={{ marginTop: 20, width: "100%" }}
                    disabled={updatingTripId === trip.id}
                    onClick={() =>
                      updateMyTripStatus(
                        trip.id,
                        "completed"
                      )
                    }
                  >
                    {updatingTripId === trip.id
                      ? "Updating..."
                      : "Complete Trip"}
                  </button>
                )}

                {trip.status === "completed" && (
                  <p style={{ marginTop: 20 }}>
                    <CheckCircle2 size={17} /> Trip completed
                  </p>
                )}

                {trip.status === "cancelled" && (
                  <p style={{ marginTop: 20 }}>
                    This trip has been cancelled.
                  </p>
                )}
              </article>
            ))}
          </div>

          <footer className="page-footer">
            <span>
              FleetFlow · Driver Workspace
            </span>
            <span>Connected to your FleetFlow account</span>
          </footer>
          </>
          )}
          
{driverView === "profile" && (
  <section className="panel" style={{ padding: 28 }}>
    <div className="panel-heading">
      <div>
        <h2>My Profile</h2>
        <p>Your personal and licence information</p>
      </div>
      <User size={28} />
    </div>

    {profileLoading && <p>Loading your profile...</p>}

    {profileError && (
      <p role="alert" style={{ color: "#dc2626" }}>
        {profileError}
      </p>
    )}

    {!profileLoading && !profileError && driverProfile && (
      <div className="profile-details">
        <div>
          <strong>Full Name</strong>
          <p>{driverProfile.full_name}</p>
        </div>

        <div>
          <strong>Email Address</strong>
          <p>{driverProfile.email}</p>
        </div>

        <div>
          <strong>Phone Number</strong>
          <p>{driverProfile.phone_number}</p>
        </div>

        <div>
          <strong>Licence Number</strong>
          <p>{driverProfile.license_number}</p>
        </div>

        <div>
          <strong>Licence Expiry Date</strong>
          <p>{driverProfile.license_expiry}</p>
        </div>

        <div>
          <strong>Driver Status</strong>
          <p>{driverProfile.status}</p>
        </div>
      </div>
    )}
  </section>
)}

        </div>
      </main>
    </div>
  );
}

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Truck size={23} /></div>
          <div><strong>FleetFlow</strong><span>LOGISTICS PLATFORM</span></div>
          <button className="mobile-close" onClick={() => setMobileMenu(false)}><X /></button>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-select">
          <div className="workspace-icon"><ShieldCheck size={18} /></div>
          <div><strong>Operations HQ</strong><span>Fleet workspace</span></div>
          <ChevronDown size={15} />
        </div>

        {visibleNavGroups.map(group => (
          <div className="nav-group" key={group.title}>
            <p className="nav-heading">{group.title}</p>
            {group.items.map(({ label, icon: Icon }) => (
              <button key={label}
                className={`nav-link ${activeNav === label ? "nav-active" : ""}`}
                onClick={() => navigate(label)}>
                <Icon size={18} strokeWidth={1.8} />
                <span>{label}</span>
                {label === "Live Tracking" && <span className="nav-dot" />}
              </button>
            ))}
          </div>
        ))}

        
<div className="sidebar-bottom">
  <button
    className="nav-link"
    onClick={() => navigate("Settings")}
  >
    <Settings size={18} />
    <span>Settings</span>
  </button>

  <div className="profile-card">
    <div className="avatar">
      {(email || "U").trim().charAt(0).toUpperCase()}
    </div>

    <div className="profile-text">
      <strong>{email || "Logged-in User"}</strong>
      <span>
        {{
          administrator: "Administrator",
          admin: "Administrator",
          fleet_manager: "Fleet Manager",
          fleetmanager: "Fleet Manager",
          dispatcher: "Dispatcher",
          driver: "Driver",
        }[userRole?.toLowerCase()] || "User"}
      </span>
    </div>

    <ChevronDown size={15} />
  </div>
</div>

            
      </aside>

      {mobileMenu && <button className="mobile-overlay" onClick={() => setMobileMenu(false)} aria-label="Close menu" />}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu /></button>
            <span className="breadcrumb">Workspace</span><span className="breadcrumb-slash">/</span><strong>{activeNav}</strong>
          </div>
          <div className="topbar-right">
            <span className="system-status">
              <span /> All systems operational
            </span>

            {activeNav === "Settings" && (
              <button
                className="theme-toggle-button"
                onClick={toggleTheme}
                title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                aria-label="Toggle theme"
              >
                {darkMode ? "☀️" : "🌙"}
              </button>
            )}

            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() => setNotice("You're all caught up on notifications.")}
            >
              <Bell size={19} />
              <i />
            </button>

            {(email || "U").trim().charAt(0).toUpperCase()}
          </div>
          
            <button
              className="logout-button"
              onClick={handleLogout}
          >
              <LogOut size={16} />
              Logout
            </button>

        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> FLEET OPERATIONS</div>
              <h1>{activeNav === "Dashboard" ? "Fleet Overview" : activeNav}</h1>
              <p>Schedule trips and monitor their current status.</p>
            </div>
            
{(normalizedRole === "administrator" ||
  normalizedRole === "fleet_manager") &&
  activeNav === "Fleet Management" && (
  <button
    className="primary-button"
    onClick={() => {
      setShowForm(true);
      setNotice("");
    }}
  >
    <Plus size={18} /> Register Vehicle
  </button>
)}

          </div>

          
{activeNav === "Approval Requests" ? (
  <ApprovalRequests
    pendingApprovals={pendingApprovals}
    approvalLoading={approvalLoading}
    approvalError={approvalError}
    approvalMessage={approvalMessage}
    handleApproval={handleApproval}
    loadPendingApprovals={loadPendingApprovals}
  />
) : activeNav === "Shipments" ? (
  <Shipments token={token} role={userRole} />
) : activeNav === "Trips & Routes" ? (
  <TripsRoutes
    token={token}
    simulatingTripId={simulatingTripId}
    startingTripId={startingTripId}
    simulationError={simulationError}
    onStartSimulation={handleStartSimulation}
    onStopSimulation={handleStopSimulation}
  />
) : activeNav === "Maintenance" ? (
  <MaintenancePage token={token} />
) : activeNav === "Fuel Analytics" ? (
  <FuelAnalytics
    token={token}
    vehicles={vehicles}
  />
) : activeNav === "Analytics" ? (
  <Analytics token={token} />
) : activeNav === "Settings" ? (
  <SettingsPage
    email={email}
    userRole={userRole}
  />
) : activeNav === "All Reports" ? (
  <AllReports token={token} />
) : (
  <div className="dashboard-content">

      {assignmentError && (
  <div className="notice">
    <span>{assignmentError}</span>
    <button
      type="button"
      onClick={() => setAssignmentError("")}
    >
      <X size={16} />
    </button>
  </div>
)}

          {apiError && (
            <div className="notice">
              <span>{apiError}</span>
              <button onClick={() => setApiError("")}>
                <X size={16} />
              </button>
            </div>
          )}

          {loading && (
            <div className="notice">
              <span>Loading dashboard data...</span>
            </div>
          )}

          {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice("")}><X size={16} /></button></div>}

      
{(normalizedRole === "administrator" ||
  normalizedRole === "fleet_manager") && (
  <>
    {activeNav === "Dashboard" && (
      <>
        <section className="metrics-grid">
          <Metric
            title="Total Vehicles"
            value={totalCount}
            caption="Registered fleet assets"
            icon={Truck}
            tone="blue"
          />

          <Metric
            title="Active Vehicles"
            value={activeCount}
            caption="Currently operational"
            icon={CheckCircle2}
            tone="green"
          />

          <Metric
            title="In Maintenance"
            value={maintenanceCount}
            caption="Service required"
            icon={Wrench}
            tone="orange"
          />

          <Metric
            title="Unassigned Drivers"
            value={unassignedCount}
            caption="Need vehicle assignment"
            icon={Users}
            tone="purple"
          />
        </section>

        <DashboardCharts overview={overview} />
      </>
    )}
  </>
)}

      
          <section className="operations-grid">
            {activeNav === "Fleet Management" && (
  <div className="panel fleet-panel">
              <div className="panel-heading">
                <div>
                  <h2>Fleet Registry</h2>
                  <p>
                    Registered vehicles and current operational status
                  </p>
                </div>
                
                <button
                  className="secondary-button"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("All");
                    setTypeFilter("All");
                  }}
                >
                  <SlidersHorizontal size={16} /> Reset filters
                </button>
              </div>

              <div className="table-controls">
                <div className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="Search vehicles"
                    placeholder="Search registration, driver..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="All">All statuses</option>
                  <option>Active</option>
                  <option>Idle</option>
                  <option>Maintenance</option>
                </select>

                <select
                  aria-label="Filter by vehicle type"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="All">All types</option>
                  <option>Truck</option>
                  <option>Van</option>
                </select>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>VEHICLE</th>
                      <th>DRIVER</th>
                      <th>CAPACITY</th>
                      <th>STATUS</th>
                      <th>FUEL</th>
{["administrator", "fleet_manager"].includes(normalizedRole) && (
  <th>ACTION</th>
)}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVehicles.map((v) => (
                      <tr key={v.id}>
                        <td>
                          <div className="vehicle-cell">
                            <div className="vehicle-icon">
                              {v.type === "Truck" ? (
                                <Truck size={18} />
                              ) : (
                                <Bus size={18} />
                              )}
                            </div>
                            <div>
                              <strong>{v.reg}</strong>
                              <span>{v.model}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className={
                              v.driver === "Unassigned"
                                ? "unassigned"
                                : "driver-name"
                            }
                          >
                            {v.driver}
                          </span>
                        </td>
                        <td>{v.capacity || "—"}</td>
                        <td>
                          <span
                            className={`status-pill status-${v.status.toLowerCase()}`}
                          >
                            <i />
                            {v.status}
                          </span>
                        </td>
                        
<td>{v.fuel}</td>

{["administrator", "fleet_manager"].includes(normalizedRole) && (
  <td>
    <div className="vehicle-action-buttons">
      {v.assigned_driver_id ? (
        <button
          type="button"
          className="secondary-button"
          disabled={assignmentLoading}
          onClick={() => {
            setAssignmentError("");
            setUnassignConfirmVehicle(v);
          }}
        >
          Unassign Driver
        </button>
      ) : (
        <button
          type="button"
          className="primary-button"
          disabled={assignmentLoading}
          onClick={() => {
            setAssignmentError("");
            setSelectedDriverId("");
            setAssigningVehicleId(v.id);
          }}
        >
          Assign Driver
        </button>
      )}

      <button
        type="button"
        className="driver-delete-button"
        title="Remove vehicle"
        aria-label={`Remove vehicle ${v.reg}`}
        disabled={removingVehicleId === v.id || assignmentLoading}
        onClick={() => handleRemoveVehicle(v)}
      >
        {removingVehicleId === v.id ? (
          <span className="delete-loading">...</span>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="m19 6-1 14H6L5 6" />
            <path d="M10 11v5M14 11v5" />
          </svg>
        )}
      </button>
    </div>
  </td>
)}

                      </tr>
                    ))}

                    {filteredVehicles.length === 0 && (
                      <tr>
                        <td
  colSpan={["administrator", "fleet_manager"].includes(normalizedRole) ? 6 : 5}
  className="empty-state"
>
                          No vehicles match your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="table-footer">
                <span>
                  Showing <strong>{filteredVehicles.length}</strong> of{" "}
                  <strong>{vehicles.length}</strong> vehicles
                </span>
                <span>Live database records</span>
              </div>
            
            </div>
            )}

          {activeNav === "Drivers" && (
            <DriversDirectory
              drivers={drivers}
              vehicles={vehicles}
              trips={trackingTrips}
              driverLocations={driverLocations}
              loading={driversLoading}
              error={locationsError}
              removingDriverId={removingDriverId}
              onAssignDriver={handleAssignDriver}
              onUnassignDriver={handleUnassignDriver}
              onRemoveDriver={handleRemoveDriver}
              onRefresh={() => {
                loadDrivers();
                loadDashboard(token, normalizedRole);
                loadDriverLocations(token);
              }}
            />
          )}


        
{activeNav === "Live Tracking" && (
  <div className="panel fleet-panel live-tracking-panel">

    

    {simulationError && (
      <div className="notice">{simulationError}</div>
    )}

    {simulationNotice && (
      <div className="notice simulation-notice">
        <span>{simulationNotice}</span>
        <button
          type="button"
          onClick={() => setSimulationNotice("")}
          aria-label="Dismiss notification"
        >
          <X size={16} />
        </button>
      </div>
    )}
    
    <div className="live-tracking-refresh">
      <button
        type="button"
        className="primary-button"
        disabled={locationsLoading}
        onClick={() => loadDriverLocations(token)}
      >
        {locationsLoading ? "Refreshing..." : "Refresh Locations"}
      </button>
    </div>

    {locationsError && (
      <div className="notice">{locationsError}</div>
    )}

    <div className="live-tracking-map">
      <DriverLocationsMap
        locations={visibleDriverLocations}
        trips={trackingTrips}
        selectedTripId={selectedTripId}
        onSelectTrip={setSelectedTripId}
      />
    </div>

    <div className="live-tracking-trip-section">
      <h3>Trip Tracking</h3>
      <p>Select a trip to display its travelled and remaining route.</p>

      <div className="tracking-trip-grid">
        {trackingTrips.map(trip => {
          const selected = Number(selectedTripId) === Number(trip.id);

          const location = visibleDriverLocations.find(
            item => Number(item.driver_id) === Number(trip.driver_id)
          );

          const progress = Number(location?.progress_percentage || 0);

          return (
            <div
              key={trip.id}
              className={`tracking-trip-card ${selected ? "selected" : ""}`}
            >
              <div className="tracking-trip-card-header">
                <strong>Trip #{trip.id}</strong>

                <span className={`trip-status ${trip.status}`}>
                  {trip.status.replace("_", " ")}
                </span>
              </div>

              <div className="tracking-trip-route">
                <span>{trip.origin}</span>
                <span className="route-arrow">→</span>
                <span>{trip.destination}</span>
              </div>

              <div className="tracking-trip-details">
                <span>Driver #{trip.driver_id}</span>
                <span>
                  {location ? "Location available" : "Awaiting location"}
                </span>
              </div>

              {trip.status === "in_progress" && (
                <div className="tracking-card-progress">
                  <div className="route-progress-track">
                    <div
                      className="route-progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <small>{progress.toFixed(1)}% completed</small>
                </div>
              )}

              <div className="tracking-trip-actions">
                <button
                  type="button"
                  className={selected ? "secondary-button" : "primary-button"}
                  onClick={() => setSelectedTripId(
                    selected ? null : trip.id
                  )}
                >
                  {selected ? "Hide Route" : "View Journey"}
                </button>

                {["assigned", "in_progress"].includes(trip.status) && (
                  simulatingTripId === trip.id ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => handleStopSimulation(trip)}
                    >
                      Pause
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary-button"
                      disabled={
                        startingTripId !== null ||
                        simulatingTripId !== null
                      }
                      onClick={() => handleStartSimulation(trip)}
                    >
                      {startingTripId === trip.id
                        ? "Starting..."
                        : "Start Simulation"}
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>

    <div className="live-tracking-table">
      <h3>Driver Locations</h3>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>DRIVER ID</th>
              <th>LATITUDE</th>
              <th>LONGITUDE</th>
              <th>SOURCE</th>
              <th>LAST UPDATED</th>
            </tr>
          </thead>

          <tbody>
            {visibleDriverLocations.map(location => (
              <tr key={location.driver_id}>
                <td>{location.driver_id}</td>
                <td>{location.latitude}</td>
                <td>{location.longitude}</td>
                <td>
                  {location.is_simulated ? "Simulated" : "Live GPS"}
                </td>
                <td>
                  {location.updated_at
                    ? formatISTTimestamp(location.updated_at)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

  </div>
)}



            {activeNav === "Dashboard" && (
  <div className="right-column">

              

              <div className="panel quick-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Quick Actions</h2>
                    <p>Common fleet operations</p>
                  </div>
                </div>

                {(normalizedRole === "administrator" ||
                  normalizedRole === "fleet_manager") && (
                  <button
                    className="quick-action"
                    onClick={() => {
                      setShowForm(true);
                      setNotice("");
                    }}
                  >
                    <span className="quick-icon quick-blue">
                      <Plus size={18} />
                    </span>
                    <span>
                      <strong>Register a vehicle</strong>
                      <small>Add an asset to your fleet</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                )}

                <button
                  className="quick-action"
                  onClick={() => navigate("Maintenance")}
                >
                  <span className="quick-icon quick-orange">
                    <Wrench size={18} />
                  </span>
                  <span>
                    <strong>Maintenance</strong>
                    <small>Review service requirements</small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>

                {normalizedRole === "administrator" && (
                  <button
                    className="quick-action"
                    onClick={() => navigate("Approval Requests")}
                  >
                    <span className="quick-icon quick-purple">
                      <UserCheck size={18} />
                    </span>
                    <span>
                      <strong>Approval requests</strong>
                      <small>Review pending registrations</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                )}
              </div>
            </div>
            )}
          </section>
          </div>
      )}

      {normalizedRole === "dispatcher" && (
        <section className="operations-grid">
          <div className="panel quick-panel">
            <div className="panel-heading">
              <div>
                <h2>Dispatch Operations</h2>
                <p>Coordinate trips, shipments, and deliveries.</p>
              </div>
            </div>

            <button
              className="quick-action"
              onClick={() => navigate("Trips & Routes")}
            >
              <span className="quick-icon quick-blue">
                <MapPin size={18} />
              </span>
              <span>
                <strong>Trips & Routes</strong>
                <small>Open trip and route operations</small>
              </span>
              <ArrowUpRight size={16} />
            </button>

            <button
              className="quick-action"
              onClick={() => navigate("Shipments")}
            >
              <span className="quick-icon quick-purple">
                <ClipboardList size={18} />
              </span>
              <span>
                <strong>Shipments</strong>
                <small>Manage delivery progress</small>
              </span>
              <ArrowUpRight size={16} />
            </button>

            <button
              className="quick-action"
              onClick={() => navigate("Live Tracking")}
            >
              <span className="quick-icon quick-orange">
                <Activity size={18} />
              </span>
              <span>
                <strong>Live Tracking</strong>
                <small>Open vehicle tracking</small>
              </span>
              <ArrowUpRight size={16} />
            </button>

            
          </div>
        </section>
      
      )}

      {normalizedRole !== "administrator" &&
        normalizedRole !== "fleet_manager" &&
        normalizedRole !== "dispatcher" && (
          <div className="panel">
            <h2>Dashboard unavailable</h2>
            <p>Your account role does not have a dashboard configured.</p>
          </div>
        )}

          
                    <footer className="page-footer">
            {/* Keep your existing footer content here */}
          </footer>
        </div>
        
        </main>
        


{/* Assign Driver Modal */}
{assigningVehicleId !== null && (
  <div
    className="modal-overlay"
    onClick={() => {
      if (!assignmentLoading) {
        setAssigningVehicleId(null);
        setSelectedDriverId("");
        setAssignmentError("");
      }
    }}
  >
    <div
      className="assignment-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-modal-title"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="assignment-modal-icon">
        <Truck size={24} />
      </div>

      <h2 id="assign-modal-title">Assign Driver</h2>

      <p>
        Select an available driver for{" "}
        <strong>
          {vehicles.find((v) => v.id === assigningVehicleId)?.reg}
        </strong>.
      </p>

      <label
        className="assignment-field-label"
        htmlFor="driver-select"
      >
        Available drivers
      </label>

      <select
        id="driver-select"
        className="assignment-driver-select"
        value={selectedDriverId}
        onChange={(e) => setSelectedDriverId(e.target.value)}
        disabled={assignmentLoading}
      >
        <option value="">Choose a driver</option>

        {drivers
          .filter((driver) => {
            const isAvailable =
              driver.status?.toLowerCase() === "available";

            const isAssignedElsewhere = vehicles.some(
              (vehicle) => vehicle.assigned_driver_id === driver.id
            );

            return isAvailable && !isAssignedElsewhere;
          })
          .map((driver) => (
            <option key={driver.id} value={driver.id}>
              Driver #{driver.id} — {driver.license_number}
            </option>
          ))}
      </select>

      {drivers.filter((driver) => {
        const isAvailable =
          driver.status?.toLowerCase() === "available";

        const isAssignedElsewhere = vehicles.some(
          (vehicle) => vehicle.assigned_driver_id === driver.id
        );

        return isAvailable && !isAssignedElsewhere;
      }).length === 0 && (
        <p className="assignment-help">
          No available, unassigned drivers were found.
        </p>
      )}

      {assignmentError && (
        <p className="assignment-inline-error" role="alert">
          {assignmentError}
        </p>
      )}

      <div className="assignment-modal-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={assignmentLoading}
          onClick={() => {
            setAssigningVehicleId(null);
            setSelectedDriverId("");
            setAssignmentError("");
          }}
        >
          Cancel
        </button>

        <button
          type="button"
          className="primary-button"
          disabled={assignmentLoading || !selectedDriverId}
          onClick={() => handleAssignDriver(assigningVehicleId)}
        >
          {assignmentLoading ? "Assigning..." : "Assign Driver"}
        </button>
      </div>
    </div>
  </div>
)}


{/* Unassign Driver Confirmation Modal */}
{unassignConfirmVehicle && (
  <div
    className="modal-overlay"
    onClick={() => {
      if (!assignmentLoading) {
        setUnassignConfirmVehicle(null);
        setAssignmentError("");
      }
    }}
  >
    <div
      className="assignment-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unassign-modal-title"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="assignment-modal-icon assignment-warning-icon">
        <Users size={24} />
      </div>

      <h2 id="unassign-modal-title">Unassign Driver</h2>

      <p>
        Are you sure you want to unassign the driver from vehicle{" "}
        <strong>{unassignConfirmVehicle.reg}</strong>?
      </p>

      <p className="assignment-help">
        The vehicle will no longer have this driver assigned to it.
      </p>

      {assignmentError && (
        <p className="assignment-inline-error" role="alert">
          {assignmentError}
        </p>
      )}

      <div className="assignment-modal-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={assignmentLoading}
          onClick={() => {
            setUnassignConfirmVehicle(null);
            setAssignmentError("");
          }}
        >
          Cancel
        </button>

        <button
          type="button"
          className="danger-button"
          disabled={assignmentLoading}
          onClick={() =>
            handleUnassignDriver(unassignConfirmVehicle.id)
          }
        >
          {assignmentLoading ? "Unassigning..." : "Unassign Driver"}
        </button>
      </div>
    </div>
  </div>
)}


      {showForm &&
  (normalizedRole === "administrator" ||
  normalizedRole === "fleet_manager") && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <form className="vehicle-modal" onSubmit={addVehicle}>
            <div className="modal-heading"><div><div className="eyebrow">FLEET MANAGEMENT</div><h2>Register a vehicle</h2><p>Add a vehicle to your fleet registry.</p></div><button type="button" className="icon-button" onClick={() => setShowForm(false)} aria-label="Close"><X /></button></div>
            
            <label>
              Registration number *
              <input
                required
                placeholder="e.g. KL01AB1234"
                value={form.reg}
                onChange={(e) =>
                  setForm({ ...form, reg: e.target.value })
                }
              />
            </label>

            <div className="form-row">
              <label>
                Vehicle make *
                <input
                  required
                  placeholder="e.g. Tata"
                  value={form.make}
                  onChange={(e) =>
                    setForm({ ...form, make: e.target.value })
                  }
                />
              </label>

              <label>
                Vehicle model *
                <input
                  required
                  placeholder="e.g. Ace"
                  value={form.model}
                  onChange={(e) =>
                    setForm({ ...form, model: e.target.value })
                  }
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                Manufacturing year *
                <input
                  required
                  type="number"
                  min="1900"
                  max={new Date().getFullYear() + 1}
                  value={form.year}
                  onChange={(e) =>
                    setForm({ ...form, year: e.target.value })
                  }
                />
              </label>

              <label>
                Load capacity (kg) *
                <input
                  required
                  type="number"
                  min="1"
                  placeholder="e.g. 750"
                  value={form.capacity}
                  onChange={(e) =>
                    setForm({ ...form, capacity: e.target.value })
                  }
                />
              </label>
            </div>

            <label>
              Insurance expiry date *
              <input
                required
                type="date"
                value={form.insuranceExpiry}
                onChange={(e) =>
                  setForm({
                    ...form,
                    insuranceExpiry: e.target.value,
                  })
                }
              />
            </label>

            
            <div className="form-row">
              <label>
                Vehicle type *
                <select
                  required
                  value={form.vehicleType}
                  onChange={(e) =>
                    setForm({ ...form, vehicleType: e.target.value })
                  }
                >
                  <option value="truck">Truck</option>
                  <option value="van">Van</option>
                  <option value="pickup">Pickup</option>
                  <option value="light_commercial">Light Commercial Vehicle</option>
                  <option value="refrigerated">Refrigerated Vehicle</option>
                  <option value="tanker">Tanker</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label>
                Fuel type *
                <select
                  required
                  value={form.fuelType}
                  onChange={(e) =>
                    setForm({ ...form, fuelType: e.target.value })
                  }
                >
                  <option value="diesel">Diesel</option>
                  <option value="petrol">Petrol</option>
                  <option value="cng">CNG</option>
                  <option value="electric">Electric</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </label>
            </div>

            <div className="form-row">
              <label>
                Fuel capacity (litres or kWh)
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  placeholder="e.g. 60"
                  value={form.fuelCapacity}
                  onChange={(e) =>
                    setForm({ ...form, fuelCapacity: e.target.value })
                  }
                />
              </label>

              <label>
                Fuel efficiency (km/litre or km/kWh)
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  placeholder="e.g. 12"
                  value={form.fuelEfficiency}
                  onChange={(e) =>
                    setForm({ ...form, fuelEfficiency: e.target.value })
                  }
                />
              </label>
            </div>

                        <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary-button"
                disabled={loading}
              >
                <Plus size={17} />
                {loading ? "Saving..." : "Add vehicle"}
              </button>
            </div>

            <p className="form-disclaimer">
              Vehicle details are saved to the FleetFlow database.
            </p>
          </form>
        </div>
      )}
    </div>
  );
}

function Metric({ title, value, caption, icon: Icon, tone }) {
  return <div className="metric-card"><div className="metric-top"><span>{title}</span><span className={`metric-icon tone-${tone}`}><Icon size={19} /></span></div><div className="metric-value">{value}</div><div className="metric-caption">{caption}</div></div>;
}

function StatusRow({ label, count, total, tone }) {
  return <div className="status-row"><span className={`status-dot dot-${tone}`} /><span className="status-row-label">{label}</span><div className="mini-track"><div className={`mini-fill fill-${tone}`} style={{ width: `${total ? count / total * 100 : 0}%` }} /></div><strong>{count}</strong></div>;
}

export default App;
