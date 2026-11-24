import { useEffect, useState, useCallback } from "react";
import {
  getAnalytics,
  getVehicles,
  getDrivers,
} from "../api";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

import {
  Truck,
  Activity,
  Wrench,
  RefreshCw,
  TrendingUp,
  PackageCheck,
  Route,
  AlertTriangle,
  Filter,
  X,
} from "lucide-react";

import "./Analytics.css";

const COLORS = [
  "#3977d5",
  "#16a085",
  "#e69a35",
  "#9b6bd3",
  "#e05b65",
];

const initialFilters = {
  start_date: "",
  end_date: "",
  vehicle_id: "",
  driver_id: "",
};

function Analytics({ token }) {
  const [data, setData] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);

  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async (appliedFilters = filters, showLoading = true) => {
    if (showLoading) {
        setLoading(true);
        setError("");
    }

    try {
        const result = await getAnalytics(token, appliedFilters);
        setError("");
        setData(result);
    } catch (err) {
        setError(err.message || "Unable to load analytics.");
    } finally {
        if (showLoading) {
        setLoading(false);
        }
    }
    }, [token, filters]);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const fetchInitialData = async () => {
        try {
        const result = await getAnalytics(token, initialFilters);

        if (!cancelled) {
            setData(result);
            setError("");
        }
        } catch (err) {
        if (!cancelled) {
            setError(err.message || "Unable to load analytics.");
        }
        } finally {
        if (!cancelled) {
            setLoading(false);
        }
        }

        try {
        const [vehicleData, driverData] = await Promise.all([
            getVehicles(token),
            getDrivers(token),
        ]);

        if (!cancelled) {
            setVehicles(
            Array.isArray(vehicleData)
                ? vehicleData
                : vehicleData?.items || vehicleData?.vehicles || []
            );

            setDrivers(
            Array.isArray(driverData)
                ? driverData
                : driverData?.items || driverData?.drivers || []
            );
        }
        } catch (err) {
        console.error("Unable to load filter data:", err);
        }
    };

    fetchInitialData();

    return () => {
        cancelled = true;
    };
    }, [token]);

  const handleFilter = (e) => {
    const { name, value } = e.target;

    setFilters((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const applyFilters = (e) => {
    e.preventDefault();

    if (
      filters.start_date &&
      filters.end_date &&
      filters.start_date > filters.end_date
    ) {
      setError("Start date cannot be later than end date.");
      return;
    }

    loadAnalytics(filters);
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    loadAnalytics(initialFilters);
  };

  const money = (value) =>
    `₹${Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    })}`;

  const fleet = data?.fleet || {};
  const trips = data?.trips || {};
  const deliveries = data?.deliveries || {};
  const maintenance = data?.maintenance || {};
  const distance = data?.distance || {};

  const tripChartData = [
    { name: "Completed", value: trips.completed || 0 },
    { name: "Assigned", value: trips.assigned || 0 },
    { name: "In Progress", value: trips.in_progress || 0 },
    { name: "Delayed", value: trips.delayed || 0 },
    { name: "Cancelled", value: trips.cancelled || 0 },
  ];

  const maintenanceChartData = [
    { name: "Completed", value: maintenance.completed || 0 },
    { name: "Scheduled", value: maintenance.scheduled || 0 },
    { name: "In Progress", value: maintenance.in_progress || 0 },
    { name: "Overdue", value: maintenance.overdue || 0 },
  ];

  return (
    <div className="analytics-page">

      {/* HEADER */}

      <div className="analytics-header">
        <div>
          <span className="settings-eyebrow">
          <p>
            Monitor fleet utilisation, trip efficiency,
            driver performance and maintenance activities.
          </p>
          </span>
        </div>

        <button
          className="analytics-refresh"
          onClick={() => loadAnalytics()}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="analytics-error">
          <span>{error}</span>
          <button onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* FILTERS */}

      <section className="analytics-filter-panel">
        <div className="analytics-section-heading">
          <h2>
            <Filter size={18} />
            Analytics Filters
          </h2>
          <p>Filter operational performance by selected criteria.</p>
        </div>

        <form onSubmit={applyFilters}>
          <div className="analytics-filter-grid">

            <label>
              From Date
              <input
                type="date"
                name="start_date"
                value={filters.start_date}
                onChange={handleFilter}
              />
            </label>

            <label>
              To Date
              <input
                type="date"
                name="end_date"
                value={filters.end_date}
                onChange={handleFilter}
              />
            </label>

            <label>
              Vehicle
              <select
                name="vehicle_id"
                value={filters.vehicle_id}
                onChange={handleFilter}
              >
                <option value="">All Vehicles</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registration_number || `Vehicle #${v.id}`}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Driver
              <select
                name="driver_id"
                value={filters.driver_id}
                onChange={handleFilter}
              >
                <option value="">All Drivers</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name || `Driver #${d.id}`}
                  </option>
                ))}
              </select>
            </label>

          </div>

          <div className="analytics-filter-actions">
            <button type="submit" className="analytics-apply">
              Apply Filters
            </button>

            <button
              type="button"
              className="analytics-reset"
              onClick={resetFilters}
            >
              Reset
            </button>
          </div>
        </form>
      </section>

      {loading ? (
        <div className="analytics-loading">
          Loading operational analytics...
        </div>
      ) : data ? (
        <>
          {/* FLEET SUMMARY */}

          <section className="analytics-section">
            <div className="analytics-section-heading">
              <h2>Fleet Overview</h2>
              <p>Current fleet availability and utilisation.</p>
            </div>

            <div className="analytics-summary-grid">

              <SummaryCard
                icon={<Truck />}
                title="Total Vehicles"
                value={fleet.total_vehicles}
                subtitle="Registered operational fleet"
                color="blue"
              />

              <SummaryCard
                icon={<Activity />}
                title="Vehicles On Trip"
                value={fleet.vehicles_on_trip}
                subtitle="Currently in operation"
                color="green"
              />

              <SummaryCard
                icon={<Truck />}
                title="Available Vehicles"
                value={fleet.available_vehicles}
                subtitle="Ready for assignment"
                color="purple"
              />

              <SummaryCard
                icon={<Wrench />}
                title="Under Maintenance"
                value={fleet.under_maintenance}
                subtitle="Currently being serviced"
                color="orange"
              />

              <SummaryCard
                icon={<TrendingUp />}
                title="Fleet Utilisation"
                value={`${fleet.fleet_utilisation || 0}%`}
                subtitle="Vehicles currently on trips"
                color="teal"
              />

            </div>
          </section>

          {/* TRIP AND DELIVERY SUMMARY */}

          <section className="analytics-section">
            <div className="analytics-section-heading">
              <h2>Trip & Delivery Performance</h2>
              <p>Monitor trip execution and delivery outcomes.</p>
            </div>

            <div className="analytics-summary-grid">

              <SummaryCard
                icon={<Route />}
                title="Total Trips"
                value={trips.total}
                subtitle="Trips in selected period"
                color="blue"
              />

              <SummaryCard
                icon={<PackageCheck />}
                title="Successful Deliveries"
                value={deliveries.successful}
                subtitle="Delivered shipments"
                color="green"
              />

              <SummaryCard
                icon={<TrendingUp />}
                title="Delivery Rate"
                value={`${deliveries.delivery_rate || 0}%`}
                subtitle="Successful deliveries / shipments"
                color="purple"
              />

              <SummaryCard
                icon={<AlertTriangle />}
                title="Delayed Deliveries"
                value={deliveries.delayed}
                subtitle="Delayed shipment records"
                color="orange"
              />

              <SummaryCard
                icon={<Activity />}
                title="On-Time Delivery"
                value={`${deliveries.on_time_rate || 0}%`}
                subtitle="On-time among delivered shipments"
                color="teal"
              />

            </div>
          </section>

          {/* CHARTS */}

          <section className="analytics-charts-grid">

            <div className="analytics-chart-card">
              <div className="analytics-chart-heading">
                <h3>Vehicle Utilisation</h3>
                <p>Distribution by current vehicle status</p>
              </div>

              {fleet.total_vehicles === 0 ? (
                <p className="analytics-no-data">No vehicle data available.</p>
              ) : (
                <ResponsiveContainer width="100%" height={290}>
                  <PieChart>
                    <Pie
                      data={fleet.vehicle_status || []}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="48%"
                      outerRadius={95}
                      label
                    >
                      {(fleet.vehicle_status || []).map((entry, index) => (
                        <Cell
                          key={entry.name}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="analytics-chart-card">
              <div className="analytics-chart-heading">
                <h3>Trip Performance</h3>
                <p>Trips grouped by operational status</p>
              </div>

              <ResponsiveContainer width="100%" height={290}>
                <BarChart data={tripChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey="value"
                    name="Trips"
                    fill="#3977d5"
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="analytics-chart-card">
              <div className="analytics-chart-heading">
                <h3>Driver Performance</h3>
                <p>Completed trips and delivery outcomes</p>
              </div>

              {(data.drivers || []).length === 0 ? (
                <p className="analytics-no-data">
                  No driver trip data available.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={data.drivers}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="driver_name"
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={65}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="completed_trips"
                      name="Completed Trips"
                      fill="#3977d5"
                    />
                    <Bar
                      dataKey="successful_deliveries"
                      name="Successful Deliveries"
                      fill="#16a085"
                    />
                    <Bar
                      dataKey="delayed_deliveries"
                      name="Delayed Deliveries"
                      fill="#e05b65"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="analytics-chart-card">
              <div className="analytics-chart-heading">
                <h3>Maintenance Analytics</h3>
                <p>Maintenance records by status</p>
              </div>

              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={maintenanceChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey="value"
                    name="Maintenance Jobs"
                    fill="#9b6bd3"
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>

              <div className="analytics-expense">
                <span>Total Maintenance Expenses</span>
                <strong>{money(maintenance.total_expenses)}</strong>
              </div>
            </div>

          </section>

          {/* DISTANCE ANALYTICS */}

          <section className="analytics-chart-card analytics-distance-card">
            <div className="analytics-chart-heading">
              <h3>Vehicle-wise Distance Travelled</h3>
              <p>
                Total fleet distance:{" "}
                <strong>
                  {Number(distance.total_distance_km || 0).toLocaleString("en-IN")} km
                </strong>
              </p>
            </div>

            {(distance.vehicles || []).length === 0 ? (
              <p className="analytics-no-data">
                No recorded route distances available.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={330}>
                <BarChart data={distance.vehicles}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="registration_number" />
                  <YAxis />
                  <Tooltip
                    formatter={(value) => [`${value} km`, "Distance"]}
                  />
                  <Bar
                    dataKey="distance_km"
                    name="Distance"
                    fill="#16a085"
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>

          {/* OPERATIONAL INSIGHTS */}

          <section className="analytics-insights-panel">
            <div className="analytics-section-heading">
              <h2>
                <AlertTriangle size={20} />
                Operational Insights
              </h2>
              <p>
                Potential operational issues identified from available records.
              </p>
            </div>

            {(data.insights || []).length === 0 ? (
              <div className="analytics-no-insights">
                <PackageCheck size={25} />
                <span>
                  No operational warnings identified in the selected period.
                </span>
              </div>
            ) : (
              <div className="analytics-insights-list">
                {data.insights.map((insight, index) => (
                  <div
                    className="analytics-insight"
                    key={`${insight.title}-${index}`}
                  >
                    <AlertTriangle size={20} />
                    <div>
                      <strong>{insight.title}</strong>
                      <p>{insight.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

    </div>
  );
}

function SummaryCard({ icon, title, value, subtitle, color }) {
  return (
    <div className="analytics-summary-card">
      <div className="analytics-card-top">
        <span>{title}</span>
        <span className={`analytics-icon ${color}`}>
          {icon}
        </span>
      </div>
      <h2>{value ?? 0}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

export default Analytics;
