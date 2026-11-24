import { useEffect, useState, useCallback } from "react";
import {
  getMaintenanceReports,
  getVehicles,
} from "../api";

import {
  FileText,
  RefreshCw,
  IndianRupee,
  Wrench,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Filter,
  X,
  FileSpreadsheet,
  Download,
} from "lucide-react";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

import "./MaintenanceReports.css";

const initialFilters = {
  vehicle_id: "",
  maintenance_type: "",
  status: "",
  start_date: "",
  end_date: "",
};

const categories = [
  ["engine servicing", "Engine Servicing"],
  ["oil change", "Oil Change"],
  ["tyre replacement", "Tyre Replacement"],
  ["brake inspection", "Brake Inspection"],
  ["general servicing", "General Servicing"],
  ["unexpected repairs", "Unexpected Repairs"],
];

function MaintenanceReports({ token }) {
  const [reports, setReports] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadVehicles = useCallback(async () => {
    try {
        const data = await getVehicles(token);

        setVehicles(
        Array.isArray(data)
            ? data
            : data?.items || data?.vehicles || []
        );
    } catch (err) {
        console.error("Vehicle loading failed:", err);
    }
    }, [token]);

    const loadReports = useCallback(async (appliedFilters) => {
    setLoading(true);
    setError("");

    try {
        const data = await getMaintenanceReports(
        token,
        appliedFilters
        );

        setReports(
        Array.isArray(data)
            ? data
            : data?.items || data?.records || data?.reports || []
        );
    } catch (err) {
        setError(
        err.message || "Unable to load maintenance reports."
        );
    } finally {
        setLoading(false);
    }
    }, [token]);

  useEffect(() => {
    if (!token) return;

    const timeoutId = setTimeout(() => {
        loadVehicles();
        loadReports(initialFilters);
    }, 0);

    return () => clearTimeout(timeoutId);
    }, [token, loadVehicles, loadReports]);

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

    loadReports(filters);
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    loadReports(initialFilters);
  };

  const money = (amount) =>
    `₹${Number(amount || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    })}`;

  const formatDate = (date) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-IN");
  };

  const getStatus = (record) =>
    (record.maintenance_status || record.status || "")
      .toLowerCase();

  const completed = reports.filter(
    (r) => getStatus(r) === "completed"
  );

  const scheduled = reports.filter(
    (r) => getStatus(r) === "scheduled"
  );

  const inProgress = reports.filter(
    (r) => getStatus(r) === "in_progress"
  );

  const overdue = reports.filter(
    (r) =>
      getStatus(r) === "scheduled" &&
      r.scheduled_date &&
      new Date(r.scheduled_date) <
        new Date(new Date().toDateString())
  );

  const pendingCount = scheduled.length + inProgress.length;

  const totalExpenses = reports.reduce(
    (sum, record) =>
      sum +
      Number(
        record.actual_cost ??
        record.estimated_cost ??
        0
      ),
    0
  );

  const vehicleName = (id) => {
    const vehicle = vehicles.find(
      (v) => Number(v.id) === Number(id)
    );

    return (
      vehicle?.registration_number ||
      vehicle?.registration_no ||
      vehicle?.reg ||
      `Vehicle #${id}`
    );
  };
    const exportPDF = () => {
    if (!reports.length) {
        setError("No maintenance records available to export.");
        return;
    }

    const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
    });

    doc.setFontSize(18);
    doc.text("FleetFlow - Maintenance Report", 14, 18);

    doc.setFontSize(10);
    doc.text(
        `Generated on: ${new Date().toLocaleDateString("en-IN")}`,
        14,
        26
    );

    doc.text(`Total Records: ${reports.length}`, 14, 32);
    doc.text(`Total Maintenance Expenses: ${money(totalExpenses)}`, 14, 38);

    autoTable(doc, {
        startY: 45,
        head: [[
        "Vehicle",
        "Category",
        "Scheduled Date",
        "Actual Date",
        "Estimated Cost",
        "Actual Cost",
        "Status",
        ]],
        body: reports.map((record) => [
        vehicleName(record.vehicle_id),
        record.maintenance_type || "—",
        formatDate(record.scheduled_date),
        formatDate(record.actual_service_date),
        money(record.estimated_cost),
        record.actual_cost == null
            ? "—"
            : money(record.actual_cost),
        getStatus(record).replaceAll("_", " "),
        ]),
        styles: {
        fontSize: 8,
        cellPadding: 3,
        },
        headStyles: {
        fillColor: [35, 75, 120],
        },
        theme: "grid",
    });

    doc.save("FleetFlow_Maintenance_Report.pdf");
    };

    const exportExcel = () => {
        if (!reports.length) {
            setError("No maintenance records available to export.");
            return;
        }

        const excelData = reports.map((record) => ({
            "Maintenance ID": record.id,
            "Vehicle Registration": vehicleName(record.vehicle_id),
            "Vehicle ID": record.vehicle_id,
            "Maintenance Category": record.maintenance_type,
            "Description": record.description || "—",
            "Scheduled Date": record.scheduled_date || "",
            "Actual Service Date": record.actual_service_date || "",
            "Service Centre": record.service_center || "—",
            "Estimated Cost (INR)": Number(record.estimated_cost || 0),
            "Actual Cost (INR)": record.actual_cost == null
            ? ""
            : Number(record.actual_cost),
            "Status": getStatus(record),
        }));

        const worksheet = XLSX.utils.json_to_sheet(excelData);

        worksheet["!cols"] = [
            { wch: 15 },
            { wch: 22 },
            { wch: 12 },
            { wch: 22 },
            { wch: 40 },
            { wch: 16 },
            { wch: 18 },
            { wch: 28 },
            { wch: 20 },
            { wch: 18 },
            { wch: 16 },
        ];

        const workbook = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "Maintenance Records"
        );

        // Add summary worksheet

        const summaryData = [
            ["FleetFlow Maintenance Report"],
            ["Generated On", new Date().toLocaleDateString("en-IN")],
            ["Total Records", reports.length],
            ["Total Expenses (INR)", totalExpenses],
            ["Completed Records", completed.length],
            ["Scheduled Records", scheduled.length],
            ["In Progress Records", inProgress.length],
            ["Overdue Records", overdue.length],
        ];

        const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);

        summarySheet["!cols"] = [
            { wch: 28 },
            { wch: 25 },
        ];

        XLSX.utils.book_append_sheet(
            workbook,
            summarySheet,
            "Report Summary"
        );

        XLSX.writeFile(
            workbook,
            "FleetFlow_Maintenance_Report.xlsx"
        );
        };

    

  return (
    <div className="maintenance-reports-page">

      <div className="reports-header">
        <div>
            <p>
            Analyse vehicle servicing activities, maintenance
            expenses and service completion records.
            </p>
        </div>

        <div className="reports-header-actions">

            <button
            className="reports-export-btn pdf"
            onClick={exportPDF}
            disabled={loading || reports.length === 0}
            >
            <Download size={16} />
            Export PDF
            </button>

            <button
            className="reports-export-btn excel"
            onClick={exportExcel}
            disabled={loading || reports.length === 0}
            >
            <FileSpreadsheet size={16} />
            Export Excel
            </button>

            <button
            className="reports-refresh-btn"
            onClick={() => loadReports(filters)}
            disabled={loading}
            >
            <RefreshCw size={16} />
            Refresh
            </button>

        </div>
        </div>

      {error && (
        <div className="reports-error">
          {error}
          <button onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* REPORT SUMMARY */}

      <div className="reports-summary-grid">

        <div className="reports-summary-card">
          <div className="reports-card-top">
            <span>Total Expenses</span>
            <IndianRupee className="expense-icon" />
          </div>
          <h2>{money(totalExpenses)}</h2>
          <p>Maintenance expenditure</p>
        </div>

        <div className="reports-summary-card">
          <div className="reports-card-top">
            <span>Completed</span>
            <CheckCircle2 className="completed-icon" />
          </div>
          <h2>{completed.length}</h2>
          <p>Completed maintenance jobs</p>
        </div>

        <div className="reports-summary-card">
          <div className="reports-card-top">
            <span>Pending</span>
            <Clock className="pending-icon" />
          </div>
          <h2>{pendingCount}</h2>
          <p>Scheduled and in-progress jobs</p>
        </div>

        <div className="reports-summary-card">
          <div className="reports-card-top">
            <span>Overdue</span>
            <AlertTriangle className="report-overdue-icon" />
          </div>
          <h2>{overdue.length}</h2>
          <p>Service dates exceeded</p>
        </div>

      </div>

      {/* FILTERS */}

      <section className="reports-panel">

        <div className="reports-panel-heading">
          <div>
            <h2>
              <Filter size={19} />
              Filter Reports
            </h2>
            <p>Choose criteria to generate maintenance reports.</p>
          </div>
        </div>

        <form onSubmit={applyFilters}>

          <div className="reports-filter-grid">

            <label>
              Vehicle
              <select
                name="vehicle_id"
                value={filters.vehicle_id}
                onChange={handleFilter}
              >
                <option value="">All Vehicles</option>

                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.registration_number ||
                      vehicle.registration_no ||
                      vehicle.reg ||
                      `Vehicle #${vehicle.id}`}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Maintenance Category
              <select
                name="maintenance_type"
                value={filters.maintenance_type}
                onChange={handleFilter}
              >
                <option value="">All Categories</option>

                {categories.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Status
              <select
                name="status"
                value={filters.status}
                onChange={handleFilter}
              >
                <option value="">All Statuses</option>
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>

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

          </div>

          <div className="reports-filter-actions">
            <button type="submit" className="reports-apply-btn">
              <Filter size={15} />
              Apply Filters
            </button>

            <button
              type="button"
              className="reports-reset-btn"
              onClick={resetFilters}
            >
              <X size={15} />
              Reset
            </button>
          </div>

        </form>
      </section>

      {/* REPORT TABLE */}

      <section className="reports-panel">

        <div className="reports-panel-heading">
          <div>
            <h2>
              <FileText size={19} />
              Maintenance Records
            </h2>
            <p>
              {reports.length} records found
            </p>
          </div>

          <Wrench size={22} />
        </div>

        {loading ? (
          <div className="reports-empty">
            Loading reports...
          </div>
        ) : reports.length === 0 ? (
          <div className="reports-empty">
            <FileText size={30} />
            <h3>No reports found</h3>
            <p>Try changing the selected filters.</p>
          </div>
        ) : (
          <div className="reports-table-wrapper">

            <table className="reports-table">
              <thead>
                <tr>
                  <th>VEHICLE</th>
                  <th>CATEGORY</th>
                  <th>SCHEDULED DATE</th>
                  <th>ACTUAL SERVICE DATE</th>
                  <th>ESTIMATED COST</th>
                  <th>ACTUAL COST</th>
                  <th>STATUS</th>
                </tr>
              </thead>

              <tbody>
                {reports.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <strong>
                        {vehicleName(record.vehicle_id)}
                      </strong>
                    </td>

                    <td>{record.maintenance_type}</td>

                    <td>
                      {formatDate(record.scheduled_date)}
                    </td>

                    <td>
                      {formatDate(record.actual_service_date)}
                    </td>

                    <td>
                      {money(record.estimated_cost)}
                    </td>

                    <td>
                      {record.actual_cost == null
                        ? "—"
                        : money(record.actual_cost)}
                    </td>

                    <td>
                      <span
                        className={`report-status ${getStatus(record)}`}
                      >
                        {getStatus(record).replaceAll("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

          </div>
        )}

      </section>

    </div>
  );
}

export default MaintenanceReports;
