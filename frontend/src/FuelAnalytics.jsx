
import { useEffect, useState, useCallback } from "react";

import {
  getFuelRecords,
  getFuelSummary,
  getVehicleFuelAnalytics,
  createFuelRecord,
  getVehicles,
} from "./api";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

import {
  IndianRupee,
  Receipt,
  Gauge,
  Plus,
  RefreshCw,
  X,
  Truck,
  CalendarDays,
  Droplets,
  Filter,
} from "lucide-react";

import "./FuelAnalytics.css";

const COLORS = [
  "#3977d5",
  "#16a085",
  "#e69a35",
  "#9b6bd3",
  "#e05b65",
  "#38a6bd",
];

function FuelAnalytics({ token }) {
  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [vehicleAnalytics, setVehicleAnalytics] = useState([]);
  const [vehicles, setVehicles] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState("");

  const [form, setForm] = useState({
    vehicle_id: "",
    fuel_type: "diesel",
    quantity_litres: "",
    price_per_litre: "",
    odometer_reading_km: "",
    refuelled_at: new Date().toISOString().slice(0, 16),
  });

  // LOAD FUEL DATA

  const loadFuelData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
        const [
        summaryData,
        recordData,
        analyticsData,
        vehicleData,
        ] = await Promise.all([
        getFuelSummary(token),
        getFuelRecords(token, vehicleFilter),
        getVehicleFuelAnalytics(token),
        getVehicles(token),
        ]);

        setSummary(summaryData);

        setRecords(
        Array.isArray(recordData) ? recordData : []
        );

        setVehicleAnalytics(
        Array.isArray(analyticsData) ? analyticsData : []
        );

        setVehicles(
        Array.isArray(vehicleData)
            ? vehicleData
            : vehicleData?.items || vehicleData?.vehicles || []
        );
    } catch (err) {
        setError(err.message || "Unable to load fuel analytics.");
    } finally {
        setLoading(false);
    }
    }, [token, vehicleFilter]);

  useEffect(() => {
    if (!token) return;

    const timeoutId = window.setTimeout(() => {
        loadFuelData();
    }, 0);

    return () => {
        window.clearTimeout(timeoutId);
    };
    }, [token, loadFuelData]);

  // FORM HANDLING

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const totalCost =
    Number(form.quantity_litres || 0) *
    Number(form.price_per_litre || 0);

  const selectedVehicle = vehicles.find(
    (vehicle) => String(vehicle.id) === String(form.vehicle_id)
  );

  const handleVehicleChange = (e) => {
    const vehicle = vehicles.find(
      (v) => String(v.id) === e.target.value
    );

    setForm((previous) => ({
      ...previous,
      vehicle_id: e.target.value,
      fuel_type: vehicle?.fuel_type || "diesel",
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setMessage("");

    if (!form.vehicle_id) {
      setError("Please select a vehicle.");
      return;
    }

    if (
      !form.quantity_litres ||
      !form.price_per_litre ||
      totalCost <= 0
    ) {
      setError("Enter valid fuel quantity and price.");
      return;
    }

    setSaving(true);

    try {
      await createFuelRecord(token, {
        vehicle_id: Number(form.vehicle_id),
        fuel_type: form.fuel_type,
        quantity_litres: Number(form.quantity_litres),
        price_per_litre: Number(form.price_per_litre),
        odometer_reading_km:
          form.odometer_reading_km === ""
            ? null
            : Number(form.odometer_reading_km),
        refuelled_at: new Date(form.refuelled_at).toISOString(),
      });

      setMessage("Fuel record added successfully.");

      setForm({
        vehicle_id: "",
        fuel_type: "diesel",
        quantity_litres: "",
        price_per_litre: "",
        odometer_reading_km: "",
        refuelled_at: new Date().toISOString().slice(0, 16),
      });

      setShowForm(false);

      await loadFuelData();
    } catch (err) {
      setError(err.message || "Unable to save fuel record.");
    } finally {
      setSaving(false);
    }
  };

  // FORMATTERS

  const money = (value) =>
    `₹${Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const number = (value) =>
    Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    });

  const formatDate = (value) =>
    value
      ? new Date(value).toLocaleDateString("en-IN")
      : "—";

  const fuelExpenseData = vehicleAnalytics.map((vehicle) => ({
    name: vehicle.registration_number,
    expense: Number(vehicle.total_fuel_expense || 0),
  }));

  const fuelConsumptionData = vehicleAnalytics.map((vehicle) => ({
    name: vehicle.registration_number,
    consumption: Number(vehicle.total_fuel_consumed || 0),
  }));

  const fuelTypeData = Object.values(
    records.reduce((acc, record) => {
      const type = record.fuel_type || "Other";

      if (!acc[type]) {
        acc[type] = { name: type, value: 0 };
      }

      acc[type].value += Number(record.quantity_litres || 0);

      return acc;
    }, {})
  );

  return (
    <div className="fuel-page">

      {/* HEADER */}

      <div className="fuel-header">
        <div>
          <span className="settings-eyebrow">
          <p>
            Monitor fuel consumption, expenditure and
            vehicle-wise fuel performance.
          </p>
          </span>
        </div>

        <div className="fuel-header-actions">
          <button
            className="fuel-refresh-btn"
            onClick={loadFuelData}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            className="fuel-add-btn"
            onClick={() => setShowForm(true)}
          >
            <Plus size={17} />
            Add Fuel Record
          </button>
        </div>
      </div>

      {/* NOTIFICATIONS */}

      {error && (
        <div className="fuel-notice error">
          <span>{error}</span>
          <button onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}

      {message && (
        <div className="fuel-notice success">
          <span>{message}</span>
          <button onClick={() => setMessage("")}>
            <X size={17} />
          </button>
        </div>
      )}

      {/* ADD FUEL FORM */}

      {showForm && (
        <section className="fuel-form-panel">

          <div className="fuel-form-heading">
            <div>
              <h2>Add Fuel Record</h2>
              <p>Enter the vehicle refuelling details.</p>
            </div>

            <button
              onClick={() => setShowForm(false)}
              className="fuel-close-btn"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit}>

            <div className="fuel-form-grid">

              <label>
                Vehicle Registration Number

                <select
                  name="vehicle_id"
                  value={form.vehicle_id}
                  onChange={handleVehicleChange}
                  required
                >
                  <option value="">Select Vehicle</option>

                  {vehicles.map((vehicle) => (
                    <option
                      key={vehicle.id}
                      value={vehicle.id}
                    >
                      {vehicle.registration_number}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Fuel Type

                <input
                  type="text"
                  name="fuel_type"
                  value={form.fuel_type}
                  readOnly
                />
              </label>

              <label>
                Fuel Quantity (Litres)

                <input
                  type="number"
                  name="quantity_litres"
                  min="0.01"
                  step="0.01"
                  value={form.quantity_litres}
                  onChange={handleChange}
                  placeholder="Enter quantity"
                  required
                />
              </label>

              <label>
                Price per Litre (₹)

                <input
                  type="number"
                  name="price_per_litre"
                  min="0.01"
                  step="0.01"
                  value={form.price_per_litre}
                  onChange={handleChange}
                  placeholder="Enter price"
                  required
                />
              </label>

              <label>
                Odometer Reading (km)

                <input
                  type="number"
                  name="odometer_reading_km"
                  min="0"
                  step="0.1"
                  value={form.odometer_reading_km}
                  onChange={handleChange}
                  placeholder="Optional"
                />
              </label>

              <label>
                Refuelling Date & Time

                <input
                  type="datetime-local"
                  name="refuelled_at"
                  value={form.refuelled_at}
                  onChange={handleChange}
                  required
                />
              </label>

            </div>

            <div className="fuel-cost-preview">
              <div>
                <span>Selected Vehicle</span>
                <strong>
                  {selectedVehicle?.registration_number || "Not selected"}
                </strong>
              </div>

              <div>
                <span>Calculated Total Expenditure</span>
                <strong>{money(totalCost)}</strong>
              </div>
            </div>

            <div className="fuel-form-actions">
              <button
                type="button"
                className="fuel-cancel-btn"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="fuel-save-btn"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Fuel Record"}
              </button>
            </div>

          </form>
        </section>
      )}

      {loading ? (
        <div className="fuel-loading">
          Loading fuel analytics...
        </div>
      ) : (
        <>

          {/* SUMMARY CARDS */}

          <section className="fuel-summary-grid">

            <FuelSummaryCard
              icon={<Droplets />}
              title="Total Fuel Consumed"
              value={`${number(summary?.total_fuel_consumed)} L`}
              color="blue"
            />

            <FuelSummaryCard
              icon={<IndianRupee />}
              title="Total Fuel Expenses"
              value={money(summary?.total_fuel_expense)}
              color="green"
            />

            <FuelSummaryCard
              icon={<Gauge />}
              title="Average Fuel Price"
              value={`${money(summary?.average_fuel_price)}/L`}
              color="purple"
            />

            <FuelSummaryCard
              icon={<Receipt />}
              title="Refuelling Records"
              value={number(summary?.total_refuelling_records)}
              color="orange"
            />

          </section>

          {/* VEHICLE FILTER */}

          <section className="fuel-filter-panel">
            <div>
              <h2>
                <Filter size={18} />
                Fuel History Filters
              </h2>
              <p>View refuelling records for a selected vehicle.</p>
            </div>

            <select
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
            >
              <option value="">All Vehicles</option>

              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.registration_number}
                </option>
              ))}
            </select>
          </section>

          {/* CHARTS */}

          <section className="fuel-charts-grid">

            <div className="fuel-chart-card">
              <div className="fuel-chart-heading">
                <h3>Vehicle-wise Fuel Consumption</h3>
                <p>Total litres consumed by each vehicle.</p>
              </div>

              {fuelConsumptionData.length === 0 ? (
                <p className="fuel-empty">
                  No fuel consumption data available.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={fuelConsumptionData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip
                      formatter={(value) => [
                        `${number(value)} L`,
                        "Fuel Consumed",
                      ]}
                    />
                    <Bar
                      dataKey="consumption"
                      name="Fuel Consumed"
                      fill="#3977d5"
                      radius={[5, 5, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="fuel-chart-card">
              <div className="fuel-chart-heading">
                <h3>Vehicle-wise Fuel Expenses</h3>
                <p>Compare fuel expenditure across vehicles.</p>
              </div>

              {fuelExpenseData.length === 0 ? (
                <p className="fuel-empty">
                  No expense data available.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={fuelExpenseData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip
                      formatter={(value) => [
                        money(value),
                        "Fuel Expense",
                      ]}
                    />
                    <Bar
                      dataKey="expense"
                      name="Fuel Expense"
                      fill="#16a085"
                      radius={[5, 5, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="fuel-chart-card">
              <div className="fuel-chart-heading">
                <h3>Fuel Type Distribution</h3>
                <p>Distribution of recorded fuel consumption.</p>
              </div>

              {fuelTypeData.length === 0 ? (
                <p className="fuel-empty">
                  No fuel records available.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={fuelTypeData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="48%"
                      outerRadius={90}
                      label
                    >
                      {fuelTypeData.map((entry, index) => (
                        <Cell
                          key={entry.name}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>

                    <Tooltip
                      formatter={(value) => [
                        `${number(value)} L`,
                        "Consumption",
                      ]}
                    />

                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

          </section>

          {/* VEHICLE ANALYTICS TABLE */}

          <section className="fuel-table-section">
            <div className="fuel-section-heading">
              <div>
                <h2>
                  <Truck size={19} />
                  Vehicle-wise Fuel Analytics
                </h2>
                <p>
                  Fuel consumption and expenditure for registered vehicles.
                </p>
              </div>
            </div>

            <div className="fuel-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Vehicle Number</th>
                    <th>Fuel Type</th>
                    <th>Total Consumption</th>
                    <th>Total Expenses</th>
                    <th>Records</th>
                    <th>Efficiency</th>
                  </tr>
                </thead>

                <tbody>
                  {vehicleAnalytics.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="fuel-empty">
                        No vehicle analytics available.
                      </td>
                    </tr>
                  ) : (
                    vehicleAnalytics.map((vehicle) => (
                      <tr key={vehicle.vehicle_id}>
                        <td>
                          <strong>{vehicle.registration_number}</strong>
                        </td>
                        <td>
                          <span className="fuel-type-badge">
                            {vehicle.fuel_type}
                          </span>
                        </td>
                        <td>
                          {number(vehicle.total_fuel_consumed)} L
                        </td>
                        <td>
                          <strong>
                            {money(vehicle.total_fuel_expense)}
                          </strong>
                        </td>
                        <td>{vehicle.refuelling_count}</td>
                        <td>
                          {vehicle.average_efficiency != null
                            ? `${number(vehicle.average_efficiency)} km/L`
                            : "Insufficient data"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* REFUELLING HISTORY */}

          <section className="fuel-table-section">
            <div className="fuel-section-heading">
              <div>
                <h2>
                  <CalendarDays size={19} />
                  Refuelling History
                </h2>
                <p>Complete history of recorded fuel transactions.</p>
              </div>

              <span className="fuel-record-count">
                {records.length} Records
              </span>
            </div>

            <div className="fuel-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Fuel Type</th>
                    <th>Quantity</th>
                    <th>Price / Litre</th>
                    <th>Total Cost</th>
                    <th>Odometer</th>
                    <th>Refuelling Date</th>
                  </tr>
                </thead>

                <tbody>
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="fuel-empty">
                        No fuel records found. Add your first fuel record.
                      </td>
                    </tr>
                  ) : (
                    records.map((record) => {
                      const vehicle = vehicles.find(
                        (v) => v.id === record.vehicle_id
                      );

                      return (
                        <tr key={record.id}>
                          <td>
                            <strong>
                              {vehicle?.registration_number ||
                                `Vehicle #${record.vehicle_id}`}
                            </strong>
                          </td>

                          <td>{record.fuel_type}</td>

                          <td>
                            {number(record.quantity_litres)} L
                          </td>

                          <td>
                            {money(record.price_per_litre)}
                          </td>

                          <td>
                            <strong>
                              {money(record.total_cost)}
                            </strong>
                          </td>

                          <td>
                            {record.odometer_reading_km != null
                              ? `${number(record.odometer_reading_km)} km`
                              : "—"}
                          </td>

                          <td>{formatDate(record.refuelled_at)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

        </>
      )}
    </div>
  );
}

function FuelSummaryCard({ icon, title, value, color }) {
  return (
    <div className="fuel-summary-card">
      <div className="fuel-card-top">
        <span>{title}</span>

        <span className={`fuel-card-icon ${color}`}>
          {icon}
        </span>
      </div>

      <h2>{value ?? 0}</h2>
    </div>
  );
}

export default FuelAnalytics;
