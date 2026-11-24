
const API_BASE_URL = "http://127.0.0.1:8000";

export async function apiRequest(path, { token, ...options } = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
  const detail = data?.detail;

  const message = Array.isArray(detail)
    ? detail
        .map((item) => item.msg || JSON.stringify(item))
        .join("; ")
    : typeof detail === "string"
      ? detail
      : detail
        ? JSON.stringify(detail)
        : `Request failed with status ${response.status}`;

  const error = new Error(message);
  error.status = response.status;

  throw error;
}

  return data;
}

export async function login(email, password) {
  const body = new URLSearchParams({
    username: email,
    password,
  });

  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.detail || "Login failed");
  }

  return data;
}




export async function registerUser({
  full_name,
  email,
  password,
  role,
  license_number,
  license_expiry,
  phone_number,
}) {
  const body = {
    full_name,
    email,
    password,
    role,
  };

  if (role === "driver") {
  body.license_number = license_number || null;
  body.license_expiry = license_expiry || null;
  body.phone_number = phone_number || null;
}

  return apiRequest("/users/", {
    method: "POST",
    body: JSON.stringify(body),
  });
}


export async function getPendingApprovals(token) {
  return apiRequest("/users/pending", {
    method: "GET",
    token,
  });
}


export async function updateApprovalStatus(token, userId, decision) {
  return apiRequest(
    `/users/${userId}/approval?decision=${encodeURIComponent(decision)}`,
    {
      method: "PATCH",
      token,
    }
  );
}

export async function requestPasswordReset(email) {
  return apiRequest("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}


export async function resetPassword(email, token, new_password) {
  return apiRequest("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ email, token, new_password }),
  });
}


export async function getVehicles(token) {
  return apiRequest("/vehicles/", {
    method: "GET",
    token,
  });
}

export async function getDrivers(token) {
  return apiRequest("/drivers/", {
    method: "GET",
    token,
  });
}

export async function deleteDriver(token, driverId) {
  return apiRequest(`/drivers/${driverId}`, {
    method: "DELETE",
    token,
  });
}

export async function deleteVehicle(token, vehicleId) {
  return apiRequest(`/vehicles/${vehicleId}`, {
    method: "DELETE",
    token,
  });
}

export async function getTrips(token) {
  return apiRequest("/trips/", {
    method: "GET",
    token,
  });
}

export async function getMyTrips(token) {
  return apiRequest("/trips/my-trips", {
    method: "GET",
    token,
  });
}

export async function updateTripStatus(token, tripId, status) {
  return apiRequest(`/trips/${tripId}/status`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ status }),
  });
}

export async function getSelectedDriverTrips(token, driverId) {
  return apiRequest(`/trips/by-driver/${driverId}`, {
    method: "GET",
    token,
  });
}

export async function updateSelectedDriverTripStatus(
  token,
  driverId,
  tripId,
  status
) {
  return apiRequest(
    `/trips/by-driver/${driverId}/${tripId}/status`,
    {
      method: "PATCH",
      token,
      body: JSON.stringify({ status }),
    }
  );
}

export async function cancelTrip(token, tripId) {
  return apiRequest(`/trips/${tripId}/cancel`, {
    method: "PATCH",
    token,
  });
}

export async function completeTrip(token, tripId) {
  return apiRequest(`/trips/${tripId}/complete`, {
    method: "PATCH",
    token,
  });
}

export async function createTrip(token, trip) {
  return apiRequest("/trips/", {
    method: "POST",
    token,
    body: JSON.stringify(trip),
  });
}

export async function getMyDriverProfile(token) {
  return apiRequest("/drivers/me", {
    method: "GET",
    token,
  });
}

export async function assignDriver(token, vehicleId, driverId) {
  return apiRequest(
    `/vehicles/${vehicleId}/assign-driver/${driverId}`,
    {
      method: "PUT",
      token,
    }
  );
}

export async function unassignDriver(token, vehicleId) {
  return apiRequest(`/vehicles/${vehicleId}/assign-driver`, {
    method: "DELETE",
    token,
  });
}


export async function updateMyDriverLocation(token, location) {
  return apiRequest("/driver-locations/me", {
    method: "PUT",
    token,
    body: JSON.stringify({
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
    }),
  });
}

export async function getMyDriverLocation(token) {
  return apiRequest("/driver-locations/me", {
    method: "GET",
    token,
  });
}

export async function getSelectedDriverLocation(token, driverId) {
  return apiRequest(`/driver-locations/by-driver/${driverId}`, {
    method: "GET",
    token,
  });
}

export async function updateSelectedDriverLocation(token, driverId, location) {
  return apiRequest(`/driver-locations/by-driver/${driverId}`, {
    method: "PUT",
    token,
    body: JSON.stringify({
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
    }),
  });
}

export async function getAllDriverLocations(token) {
  return apiRequest("/driver-locations/", {
    method: "GET",
    token,
  });
}


export async function getShipments(token) {
  return apiRequest("/shipments/", {
    method: "GET",
    token,
  });
}

export async function createShipment(token, shipment) {
  return apiRequest("/shipments/", {
    method: "POST",
    token,
    body: JSON.stringify(shipment),
  });
}

export async function trackShipment(trackingNumber) {
  return apiRequest(
    `/shipments/track/${encodeURIComponent(trackingNumber)}`,
    {
      method: "GET",
    }
  );
}

export async function getShipment(token, shipmentId) {
  return apiRequest(`/shipments/${shipmentId}`, {
    method: "GET",
    token,
  });
}


export async function deleteShipment(token, shipmentId) {
  return apiRequest(`/shipments/${shipmentId}`, {
    method: "DELETE",
    token,
  });
}

export async function updateShipmentStatus(
  token,
  shipmentId,
  status,
  notes = null
) {
  return apiRequest(`/shipments/${shipmentId}/status`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ status, notes }),
  });
}

export async function getShipmentHistory(token, shipmentId) {
  return apiRequest(`/shipments/${shipmentId}/history`, {
    method: "GET",
    token,
  });
}


export const startTripSimulation = (token, tripId) =>
  apiRequest(`/trips/${tripId}/start-simulation`, {
    token,
    method: "POST",
  });

export const updateSimulatedTripLocation = (token, tripId, location) =>
  apiRequest(`/driver-locations/by-trip/${tripId}/simulation`, {
    token,
    method: "PUT",
    body: JSON.stringify(location),
  });

export const stopTripSimulation = (token, tripId) =>
  apiRequest(`/trips/${tripId}/stop-simulation`, {
    token,
    method: "POST",
  });


// ===============================
// MAINTENANCE MANAGEMENT APIs
// ===============================

export async function getMaintenanceRecords(token) {
  return apiRequest("/maintenance/", {
    method: "GET",
    token,
  });
}

export async function createMaintenance(token, maintenance) {
  return apiRequest("/maintenance/", {
    method: "POST",
    token,
    body: JSON.stringify(maintenance),
  });
}

export async function updateMaintenance(token, maintenanceId, updates) {
  return apiRequest(`/maintenance/${maintenanceId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(updates),
  });
}

export async function getMaintenanceSummary(token) {
  return apiRequest("/maintenance/summary", {
    method: "GET",
    token,
  });
}

export async function getVehicleMaintenanceHistory(token, vehicleId) {
  return apiRequest(`/maintenance/vehicles/${vehicleId}/history`, {
    method: "GET",
    token,
  });
}

export async function getMaintenanceAlerts(token, daysAhead = 7) {
  return apiRequest(
    `/maintenance/alerts?days_ahead=${daysAhead}`,
    {
      method: "GET",
      token,
    }
  );
}

// Maintenance Reports
export async function getMaintenanceReports(token, filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== "" && value !== null && value !== undefined) {
      params.append(key, value);
    }
  });

  const query = params.toString();

  return apiRequest(
    `/maintenance/reports${query ? `?${query}` : ""}`,
    {
      method: "GET",
      token,
    }
  );
}
// Operational Analytics
export async function getAnalytics(token, filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== "" && value !== null && value !== undefined) {
      params.append(key, value);
    }
  });

  const query = params.toString();

  return apiRequest(
    `/analytics/overview${query ? `?${query}` : ""}`,
    {
      method: "GET",
      token,
    }
  );
}
// Assign an existing trip to a shipment
export async function assignShipmentToTrip(
  token,
  shipmentId,
  tripId
) {
  return apiRequest(
    `/shipments/${shipmentId}/assign-trip?trip_id=${tripId}`,
    {
      method: "PATCH",
      token,
    }
  );
}


// ===============================
// FUEL ANALYTICS APIs
// ===============================

export async function createFuelRecord(token, fuelRecord) {
  return apiRequest("/fuel/records", {
    method: "POST",
    token,
    body: JSON.stringify(fuelRecord),
  });
}

export async function getFuelRecords(token, vehicleId = null) {
  const params = new URLSearchParams();

  if (
    vehicleId !== null &&
    vehicleId !== undefined &&
    vehicleId !== ""
  ) {
    params.append("vehicle_id", vehicleId);
  }

  const query = params.toString();

  return apiRequest(
    `/fuel/records${query ? `?${query}` : ""}`,
    {
      method: "GET",
      token,
    }
  );
}

export async function getFuelSummary(token) {
  return apiRequest("/fuel/summary", {
    method: "GET",
    token,
  });
}

export async function getVehicleFuelAnalytics(token) {
  return apiRequest("/fuel/vehicle-analytics", {
    method: "GET",
    token,
  });
}
