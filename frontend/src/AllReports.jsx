
import React, { useEffect, useMemo, useState } from "react";
import "./AllReports.css";

const API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:8000";

const REPORT_TYPES = [
  { id: "fleet", label: "Fleet Utilization" },
  { id: "fuel", label: "Fuel Consumption" },
  { id: "drivers", label: "Driver Performance" },
  { id: "delivery", label: "Delivery Performance" },
  { id: "maintenance", label: "Maintenance" },
];

const getArray = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const getNumber = (...values) => {
  for (const value of values) {
    const number = Number(value);
    if (value !== null && value !== undefined && value !== "" &&
        Number.isFinite(number)) {
      return number;
    }
  }
  return 0;
};

const getDate = (item) =>
  item?.scheduled_at ||
  item?.scheduled_date ||
  item?.created_at ||
  item?.date ||
  item?.delivery_date ||
  item?.actual_service_date ||
  item?.recorded_at ||
  "";

const getStatus = (item) =>
  String(item?.status || item?.delivery_status || "Unknown")
    .toLowerCase()
    .replaceAll("_", " ");

const getId = (item) =>
  item?.id ?? item?.vehicle_id ?? item?.driver_id ?? "-";

const getVehicleName = (item) =>
  item?.registration_number ||
  item?.vehicle_registration ||
  item?.vehicle_number ||
  `Vehicle #${item?.vehicle_id ?? "-"}`;

const getDriverName = (item) =>
  item?.driver_name ||
  item?.name ||
  item?.full_name ||
  `Driver #${item?.driver_id ?? "-"}`;

const formatMoney = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(getNumber(value));

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN");
};

const getMetrics = (title, value, subtitle = "") => ({
  title,
  value,
  subtitle,
});

function AllReports({ token }) {
  const [activeReport, setActiveReport] = useState("fleet");

  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [trips, setTrips] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [fuelRecords, setFuelRecords] = useState([]);
  const [maintenanceData, setMaintenanceData] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch actual backend data
  const fetchData = async () => {
    setLoading(true);
    setError("");

    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const request = async (endpoint) => {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(
          `${endpoint} returned ${response.status}`
        );
      }

      return response.json();
    };

    try {
      const results = await Promise.allSettled([
        request("/vehicles/"),
        request("/drivers/"),
        request("/trips/"),
        request("/shipments/"),
        request("/fuel/records"),
        request("/maintenance/reports"),
      ]);

      const failed = [];

      const readResult = (result, name) => {
        if (result.status === "fulfilled") {
          return result.value;
        }
        failed.push(name);
        console.error(`${name} report error:`, result.reason);
        return null;
      };

      const vehicleData = readResult(results[0], "Vehicles");
      const driverData = readResult(results[1], "Drivers");
      const tripData = readResult(results[2], "Trips");
      const shipmentData = readResult(results[3], "Shipments");
      const fuelData = readResult(results[4], "Fuel");
      const maintenance = readResult(results[5], "Maintenance");

      setVehicles(getArray(vehicleData));
      setDrivers(getArray(driverData));
      setTrips(getArray(tripData));
      setShipments(getArray(shipmentData));
      setFuelRecords(getArray(fuelData));
      setMaintenanceData(maintenance);

      setLastUpdated(new Date());

      if (failed.length === 6) {
        setError("Unable to retrieve report data. Check your backend connection and API permissions.");
      } else if (failed.length > 0) {
        setError(
          `Some report data could not be loaded: ${failed.join(", ")}. Other reports may still be available.`
        );
      }
    } catch (err) {
      console.error(err);
      setError("Unable to load reports. Please check your backend connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  // Apply common date and search filters
  const filterRecords = (records) => {
    return records.filter((item) => {
      const recordDate = getDate(item);

      if (startDate && recordDate) {
        if (new Date(recordDate) < new Date(`${startDate}T00:00:00`)) {
          return false;
        }
      }

      if (endDate && recordDate) {
        if (new Date(recordDate) > new Date(`${endDate}T23:59:59`)) {
          return false;
        }
      }

      if (searchTerm) {
        const text = JSON.stringify(item).toLowerCase();
        if (!text.includes(searchTerm.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  };

  const report = useMemo(() => {
    const filteredVehicles = filterRecords(vehicles);
    const filteredDrivers = filterRecords(drivers);
    const filteredTrips = filterRecords(trips);
    const filteredShipments = filterRecords(shipments);
    const filteredFuel = filterRecords(fuelRecords);

    const maintenanceRecords = getArray(maintenanceData?.records);
    const filteredMaintenance = filterRecords(maintenanceRecords);

    switch (activeReport) {
      // --------------------------------
      // FLEET UTILIZATION REPORT
      // --------------------------------
      case "fleet": {
        const total = filteredVehicles.length;

        const available = filteredVehicles.filter(
          (v) => getStatus(v) === "available"
        ).length;

        const underMaintenance = filteredVehicles.filter(
          (v) => getStatus(v) === "maintenance"
        ).length;

        const assigned = filteredVehicles.filter(
          (v) => ["assigned", "on trip", "in use"].includes(getStatus(v))
        ).length;

        const inactive = filteredVehicles.filter(
          (v) => getStatus(v) === "inactive"
        ).length;

        const activeFleet = total - inactive;

        const utilization = activeFleet
          ? (assigned / activeFleet) * 100
          : 0;

        const rows = filteredVehicles.map((v) => ({
          "Vehicle ID": getId(v),
          "Registration Number": getVehicleName(v),
          "Vehicle Type": v.vehicle_type || v.type || "-",
          Status: getStatus(v),
        }));

        return {
          title: "Fleet Utilization Report",
          description: "Analysis of vehicle availability and fleet usage.",
          metrics: [
            getMetrics("Total Vehicles", total),
            getMetrics("Available", available),
            getMetrics("Assigned / In Use", assigned),
            getMetrics("Under Maintenance", underMaintenance),
            getMetrics("Fleet Utilization", `${utilization.toFixed(2)}%`),
          ],
          rows,
        };
      }

      // --------------------------------
      // FUEL CONSUMPTION REPORT
      // --------------------------------
      case "fuel": {
        const totalLitres = filteredFuel.reduce(
          (sum, item) =>
            sum + getNumber(
              item.quantity,
              item.litres,
              item.fuel_quantity,
              item.quantity_litres
            ),
          0
        );

        const totalExpense = filteredFuel.reduce(
          (sum, item) =>
            sum + getNumber(
              item.total_cost,
              item.amount,
              item.cost,
              item.fuel_cost
            ),
          0
        );

        const averagePrice = totalLitres
          ? totalExpense / totalLitres
          : 0;

        const vehicleTotals = {};

        filteredFuel.forEach((item) => {
          const vehicle = getVehicleName(item);

          if (!vehicleTotals[vehicle]) {
            vehicleTotals[vehicle] = {
              litres: 0,
              expense: 0,
              transactions: 0,
            };
          }

          vehicleTotals[vehicle].litres += getNumber(
            item.quantity,
            item.litres,
            item.fuel_quantity,
            item.quantity_litres
          );

          vehicleTotals[vehicle].expense += getNumber(
            item.total_cost,
            item.amount,
            item.cost,
            item.fuel_cost
          );

          vehicleTotals[vehicle].transactions += 1;
        });

        const rows = Object.entries(vehicleTotals).map(
          ([vehicle, data]) => ({
            "Vehicle Number": vehicle,
            "Fuel Consumed (L)": data.litres.toFixed(2),
            "Total Expense": formatMoney(data.expense),
            Transactions: data.transactions,
          })
        );

        return {
          title: "Fuel Consumption Report",
          description: "Vehicle-wise fuel usage and expenditure.",
          metrics: [
            getMetrics("Total Fuel Consumed", `${totalLitres.toFixed(2)} L`),
            getMetrics("Total Fuel Expense", formatMoney(totalExpense)),
            getMetrics("Average Price / Litre", formatMoney(averagePrice)),
            getMetrics("Fuel Transactions", filteredFuel.length),
          ],
          rows,
        };
      }

      // --------------------------------
      // DRIVER PERFORMANCE REPORT
      // --------------------------------
      case "drivers": {
        const completedTrips = filteredTrips.filter(
          (t) => getStatus(t) === "completed"
        );

        const activeTrips = filteredTrips.filter(
          (t) => ["assigned", "in progress"].includes(getStatus(t))
        );

        const cancelledTrips = filteredTrips.filter(
          (t) => getStatus(t) === "cancelled"
        );

        const rows = filteredDrivers.map((driver) => {
          const driverId = driver.id ?? driver.driver_id;

          const driverTrips = filteredTrips.filter(
            (trip) => String(trip.driver_id) === String(driverId)
          );

          const completed = driverTrips.filter(
            (trip) => getStatus(trip) === "completed"
          ).length;

          const ongoing = driverTrips.filter(
            (trip) => ["assigned", "in progress"].includes(getStatus(trip))
          ).length;

          const cancelled = driverTrips.filter(
            (trip) => getStatus(trip) === "cancelled"
          ).length;

          return {
            "Driver ID": driverId ?? "-",
            "Driver Name": getDriverName(driver),
            "Total Trips": driverTrips.length,
            "Completed Trips": completed,
            "Ongoing Trips": ongoing,
            "Cancelled Trips": cancelled,
            "Completion Rate": driverTrips.length
              ? `${((completed / driverTrips.length) * 100).toFixed(2)}%`
              : "0%",
          };
        });

        return {
          title: "Driver Performance Report",
          description: "Driver-wise trip completion and operational performance.",
          metrics: [
            getMetrics("Total Drivers", filteredDrivers.length),
            getMetrics("Completed Trips", completedTrips.length),
            getMetrics("Ongoing Trips", activeTrips.length),
            getMetrics("Cancelled Trips", cancelledTrips.length),
          ],
          rows,
        };
      }

      // --------------------------------
      // DELIVERY PERFORMANCE REPORT
      // --------------------------------
      case "delivery": {
        const completed = filteredShipments.filter((s) =>
          ["delivered", "completed"].includes(getStatus(s))
        );

        const delayed = filteredShipments.filter((s) =>
          ["delayed", "late"].includes(getStatus(s))
        );

        const pending = filteredShipments.filter((s) =>
          ["pending", "assigned", "in transit", "in progress"].includes(
            getStatus(s)
          )
        );

        const cancelled = filteredShipments.filter(
          (s) => getStatus(s) === "cancelled"
        );

        const total = filteredShipments.length;

        const deliveryRate = total
          ? (completed.length / total) * 100
          : 0;

        const rows = filteredShipments.map((s) => ({
          "Shipment ID": getId(s),
          "Origin": s.origin || s.source || "-",
          "Destination": s.destination || "-",
          "Driver ID": s.driver_id ?? "-",
          "Trip ID": s.trip_id ?? "-",
          "Delivery Date": formatDate(
            s.delivery_date || s.delivered_at || s.created_at
          ),
          Status: getStatus(s),
        }));

        return {
          title: "Delivery Performance Report",
          description: "Shipment delivery status and delivery success analysis.",
          metrics: [
            getMetrics("Total Shipments", total),
            getMetrics("Successful Deliveries", completed.length),
            getMetrics("Delayed Deliveries", delayed.length),
            getMetrics("Pending Deliveries", pending.length),
            getMetrics("Delivery Success Rate", `${deliveryRate.toFixed(2)}%`),
          ],
          rows,
        };
      }

      // --------------------------------
      // MAINTENANCE REPORT
      // --------------------------------
      case "maintenance": {
        const scheduled = filteredMaintenance.filter(
          (m) => getStatus(m) === "scheduled"
        );

        const completed = filteredMaintenance.filter(
          (m) => getStatus(m) === "completed"
        );

        const pending = filteredMaintenance.filter((m) =>
          ["scheduled", "in progress"].includes(getStatus(m))
        );

        const overdue = filteredMaintenance.filter((m) => {
          if (getStatus(m) !== "scheduled" || !m.scheduled_date) {
            return false;
          }

          const scheduledDate = new Date(m.scheduled_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          return scheduledDate < today;
        });

        const estimatedCost = filteredMaintenance.reduce(
          (sum, m) => sum + getNumber(m.estimated_cost),
          0
        );

        const actualCost = completed.reduce(
          (sum, m) =>
            sum + getNumber(m.actual_cost, m.estimated_cost),
          0
        );

        const rows = filteredMaintenance.map((m) => ({
          "Maintenance ID": m.id,
          "Vehicle ID": m.vehicle_id,
          "Maintenance Type": m.maintenance_type || "-",
          "Scheduled Date": formatDate(m.scheduled_date),
          "Actual Service Date": formatDate(m.actual_service_date),
          "Estimated Cost": formatMoney(m.estimated_cost),
          "Actual Cost": formatMoney(m.actual_cost),
          Status: getStatus(m),
        }));

        return {
          title: "Maintenance Report",
          description: "Maintenance schedules, completion status and expenses.",
          metrics: [
            getMetrics("Total Records", filteredMaintenance.length),
            getMetrics("Scheduled", scheduled.length),
            getMetrics("Completed", completed.length),
            getMetrics("Pending", pending.length),
            getMetrics("Overdue", overdue.length),
            getMetrics("Estimated Expenses", formatMoney(estimatedCost)),
            getMetrics("Actual Expenses", formatMoney(actualCost)),
          ],
          rows,
        };
      }

      default:
        return { title: "", description: "", metrics: [], rows: [] };
    }
  }, [
    activeReport,
    vehicles,
    drivers,
    trips,
    shipments,
    fuelRecords,
    maintenanceData,
    startDate,
    endDate,
    searchTerm,
  ]);

  // Export report data as CSV (Excel-compatible)
  const exportExcel = () => {
    if (!report.rows.length) {
      alert("No report records available to export.");
      return;
    }

    const headers = Object.keys(report.rows[0]);

    const escapeCSV = (value) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;

    const csv = [
      headers.map(escapeCSV).join(","),
      ...report.rows.map((row) =>
        headers.map((header) => escapeCSV(row[header])).join(",")
      ),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${activeReport}_report.csv`;
    link.click();

    URL.revokeObjectURL(url);
  };

  // Print the report or save it as PDF
  const exportPDF = () => {
    if (!report.rows.length) {
      alert("No report records available to export.");
      return;
    }

    window.print();
  };

  const resetFilters = () => {
    setStartDate("");
    setEndDate("");
    setSearchTerm("");
  };

  const activeLabel =
    REPORT_TYPES.find((item) => item.id === activeReport)?.label;

  if (loading) {
    return (
      <div className="all-reports-page">
        <div className="reports-loading">
          <div className="reports-spinner"></div>
          <p>Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="all-reports-page">

      <div className="reports-header">
        <div>
          <h1>All Reports</h1>
          <p>
            Generate and analyse reports across your fleet operations.
          </p>
          {lastUpdated && (
            <span className="reports-updated">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>

        <button
          className="reports-refresh"
          onClick={fetchData}
          disabled={loading}
        >
          ↻ Refresh Data
        </button>
      </div>

      {error && (
        <div className="reports-error">
          {error}
        </div>
      )}

      {/* Report categories */}
      <div className="report-tabs">
        {REPORT_TYPES.map((type) => (
          <button
            key={type.id}
            className={
              activeReport === type.id
                ? "report-tab active"
                : "report-tab"
            }
            onClick={() => setActiveReport(type.id)}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* Report information */}
      <div className="report-content">

        <div className="report-title-row">
          <div>
            <h2>{report.title}</h2>
            <p>{report.description}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="report-filters">

          <div className="report-filter">
            <label>Start Date</label>
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="report-filter">
            <label>End Date</label>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="report-filter report-search">
            <label>Search Records</label>
            <input
              type="text"
              placeholder="Search vehicle, driver, status..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button
            className="report-reset"
            onClick={resetFilters}
          >
            Reset Filters
          </button>

        </div>

        {/* Summary cards */}
        <div className="report-metrics">
          {report.metrics.map((metric, index) => (
            <div className="report-metric-card" key={index}>
              <span>{metric.title}</span>
              <h3>{metric.value}</h3>
              {metric.subtitle && <small>{metric.subtitle}</small>}
            </div>
          ))}
        </div>

        {/* Report table */}
        <div className="report-table-section">

          <div className="report-table-header">
            <div>
              <h3>{activeLabel} Details</h3>
              <span>
                {report.rows.length} records
              </span>
            </div>

            <div className="report-export-buttons">
              <button
                className="export-excel"
                onClick={exportExcel}
              >
                ↓ Export Excel
              </button>

              <button
                className="export-pdf"
                onClick={exportPDF}
              >
                ↓ Export PDF
              </button>
            </div>
          </div>

          <div className="report-table-wrapper">
            {report.rows.length > 0 ? (
              <table className="report-table">
                <thead>
                  <tr>
                    {Object.keys(report.rows[0]).map((heading) => (
                      <th key={heading}>{heading}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {report.rows.map((row, index) => (
                    <tr key={index}>
                      {Object.values(row).map((value, cellIndex) => (
                        <td key={cellIndex}>{value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="report-empty">
                <p>No records found for the selected filters.</p>
              </div>
            )}
          </div>

        </div>

        <div className="report-footer">
          <span>FleetFlow | Operational Reports</span>
          <span>{report.rows.length} records displayed</span>
        </div>

      </div>
    </div>
  );
}

export default AllReports;
