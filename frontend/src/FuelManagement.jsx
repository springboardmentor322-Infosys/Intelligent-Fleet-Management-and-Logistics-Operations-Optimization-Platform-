import { useEffect, useState } from "react";

const FUEL_TYPES = ["Diesel", "Petrol", "CNG", "LPG"];

function todayString() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function money(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const EMPTY_FORM = {
  vehicle_id: "",
  fuel_type: "Diesel",
  quantity_litres: "",
  price_per_litre: "",
  refuel_date: todayString(),
};

const EMPTY_FILTERS = {
  vehicle_id: "",
  fuel_type: "",
  start_date: "",
  end_date: "",
};

function FuelManagement({ apiRequest, vehicles, loadVehicles }) {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  function buildQuery(activeFilters) {
    const params = new URLSearchParams();

    Object.entries(activeFilters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });

    const text = params.toString();
    return text ? `?${text}` : "";
  }

  async function loadAll(activeFilters = filters) {
    try {
      const query = buildQuery(activeFilters);

      const [recordData, summaryData] = await Promise.all([
        apiRequest(`/fuel-records${query}`),
        apiRequest(`/fuel-records/summary${query}`),
      ]);

      setRecords(Array.isArray(recordData) ? recordData : []);
      setSummary(summaryData);
    } catch (error) {
      setNotice(error.message);
    }
  }

  useEffect(() => {
    loadVehicles();
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPreview =
    Number(form.quantity_litres) > 0 && Number(form.price_per_litre) > 0
      ? Number(form.quantity_litres) * Number(form.price_per_litre)
      : 0;

  function handleVehicleChange(vehicleId) {
    const vehicle = vehicles.find((item) => String(item.id) === vehicleId);

    setForm({
      ...form,
      vehicle_id: vehicleId,
      fuel_type:
        vehicle && FUEL_TYPES.includes(vehicle.fuel_type)
          ? vehicle.fuel_type
          : form.fuel_type,
    });
  }

  async function saveFuelRecord(event) {
    event.preventDefault();
    setNotice("");

    if (!form.vehicle_id) {
      setNotice("Please select a vehicle.");
      return;
    }

    setSaving(true);

    try {
      await apiRequest("/fuel-records", {
        method: "POST",
        body: JSON.stringify({
          vehicle_id: Number(form.vehicle_id),
          fuel_type: form.fuel_type,
          quantity_litres: Number(form.quantity_litres),
          price_per_litre: Number(form.price_per_litre),
          refuel_date: form.refuel_date,
        }),
      });

      setNotice("Fuel record saved successfully.");
      setForm({ ...EMPTY_FORM });
      setShowForm(false);
      await loadAll();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSaving(false);
    }
  }

  function applyFilters(event) {
    event.preventDefault();
    loadAll(filters);
  }

  function clearFilters() {
    setFilters({ ...EMPTY_FILTERS });
    loadAll({ ...EMPTY_FILTERS });
  }

  const highestCostId = summary?.vehicles?.[0]?.vehicle_id;

  return (
    <>
      {notice && <div className="message">{notice}</div>}

      <section className="stats-grid">
        <article className="stat-card">
          <span className="stat-icon">⛽</span>
          <h3>Total Fuel Used</h3>
          <strong>{summary ? summary.fleet_total_litres : "-"}</strong>
          <p>Litres (selected filters)</p>
        </article>

        <article className="stat-card">
          <span className="stat-icon">💰</span>
          <h3>Total Fuel Cost</h3>
          <strong>₹{summary ? money(summary.fleet_total_cost) : "-"}</strong>
          <p>Selected filters</p>
        </article>

        <article className="stat-card">
          <span className="stat-icon">🧾</span>
          <h3>Fuel Entries</h3>
          <strong>{records.length}</strong>
          <p>Refuelling records</p>
        </article>
      </section>

      <section className="content-section">
        <div className="page-header">
          <div>
            <h2>Fuel Management</h2>
            <p>Record refuelling and monitor fuel expenses.</p>
          </div>

          <button type="button" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Close Form" : "+ Add Fuel Record"}
          </button>
        </div>

        {showForm && (
          <form className="vehicle-form" onSubmit={saveFuelRecord}>
            <h3>Add Fuel Record</h3>

            <label>
              Vehicle
              <select
                value={form.vehicle_id}
                onChange={(e) => handleVehicleChange(e.target.value)}
                required
              >
                <option value="">Select vehicle</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.vehicle_number} ({vehicle.vehicle_type})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Fuel Type
              <select
                value={form.fuel_type}
                onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}
              >
                {FUEL_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Quantity (litres)
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.quantity_litres}
                onChange={(e) =>
                  setForm({ ...form, quantity_litres: e.target.value })
                }
                required
              />
            </label>

            <label>
              Price per Litre
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.price_per_litre}
                onChange={(e) =>
                  setForm({ ...form, price_per_litre: e.target.value })
                }
                required
              />
            </label>

            <label>
              Refuelling Date
              <input
                type="date"
                max={todayString()}
                value={form.refuel_date}
                onChange={(e) => setForm({ ...form, refuel_date: e.target.value })}
                required
              />
            </label>

            <label>
              Total Expenditure
              <input type="text" value={`₹${money(totalPreview)}`} readOnly />
            </label>

            <div className="form-actions">
              <button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Fuel Record"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm({ ...EMPTY_FORM });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <form className="vehicle-form" onSubmit={applyFilters}>
          <h3>Filters</h3>

          <label>
            Vehicle
            <select
              value={filters.vehicle_id}
              onChange={(e) =>
                setFilters({ ...filters, vehicle_id: e.target.value })
              }
            >
              <option value="">All vehicles</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.vehicle_number}
                </option>
              ))}
            </select>
          </label>

          <label>
            Fuel Type
            <select
              value={filters.fuel_type}
              onChange={(e) =>
                setFilters({ ...filters, fuel_type: e.target.value })
              }
            >
              <option value="">All fuel types</option>
              {FUEL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label>
            From Date
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) =>
                setFilters({ ...filters, start_date: e.target.value })
              }
            />
          </label>

          <label>
            To Date
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) =>
                setFilters({ ...filters, end_date: e.target.value })
              }
            />
          </label>

          <div className="form-actions">
            <button type="submit">Apply Filters</button>
            <button type="button" onClick={clearFilters}>
              Clear
            </button>
          </div>
        </form>
      </section>

      <section className="content-section">
        <div className="page-header">
          <div>
            <h2>Vehicle-wise Fuel Analysis</h2>
            <p>
              Fuel efficiency uses the distance of completed trips and is shown
              only where distance and fuel data are both available.
            </p>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Fuel Used (L)</th>
                <th>Fuel Cost</th>
                <th>Distance (km)</th>
                <th>Efficiency (km/L)</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.vehicles || []).map((item) => (
                <tr key={item.vehicle_id}>
                  <td>{item.vehicle_number}</td>
                  <td>{item.total_litres}</td>
                  <td>₹{money(item.total_cost)}</td>
                  <td>{item.distance_km || "-"}</td>
                  <td>{item.efficiency_km_per_litre ?? "-"}</td>
                  <td>
                    {item.vehicle_id === highestCostId &&
                    summary.vehicles.length > 1
                      ? "Highest fuel expense"
                      : ""}
                  </td>
                </tr>
              ))}

              {(summary?.vehicles || []).length === 0 && (
                <tr>
                  <td colSpan="6">No fuel data for the selected filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="content-section">
        <div className="page-header">
          <div>
            <h2>Fuel History</h2>
            <p>All refuelling transactions.</p>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Fuel Type</th>
                <th>Quantity (L)</th>
                <th>Price / L</th>
                <th>Refuelling Date</th>
                <th>Total Expenditure</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{record.vehicle_number}</td>
                  <td>{record.fuel_type}</td>
                  <td>{record.quantity_litres}</td>
                  <td>₹{money(record.price_per_litre)}</td>
                  <td>{record.refuel_date}</td>
                  <td>₹{money(record.total_cost)}</td>
                </tr>
              ))}

              {records.length === 0 && (
                <tr>
                  <td colSpan="6">No fuel records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export default FuelManagement;