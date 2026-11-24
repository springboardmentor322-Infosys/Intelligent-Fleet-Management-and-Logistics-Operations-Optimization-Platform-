
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

import "./DashboardCharts.css";

const COLORS = {
  blue: "#4169F5",
  green: "#19B88A",
  orange: "#F59E38",
  red: "#EF6464",
  purple: "#9467EF",
  gray: "#94A3B8",
};

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="dashboard-chart-card">
      <div className="dashboard-chart-header">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="dashboard-chart-content">
        {children}
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="dashboard-chart-empty">
      No data available yet.
    </div>
  );
}

export default function DashboardCharts({ overview }) {
  if (!overview) {
    return (
      <div className="dashboard-charts-loading">
        Loading analytics...
      </div>
    );
  }

  const totalVehicles = Number(overview.total_vehicles || 0);
  const availableVehicles = Number(overview.available_vehicles || 0);
  const vehiclesOnTrip = Number(overview.vehicles_on_trip || 0);
  const maintenanceVehicles = Number(
    overview.vehicles_in_maintenance || 0
  );

  const unassignedVehicles = Number(
    overview.unassigned_vehicles || 0
  );

  const totalDrivers = Number(overview.total_drivers || 0);
  const availableDrivers = Number(overview.available_drivers || 0);
  const driversOnTrip = Number(overview.drivers_on_trip || 0);

  const totalTrips = Number(overview.total_trips || 0);
  const activeTrips = Number(overview.active_trips || 0);
  const completedTrips = Number(overview.completed_trips || 0);
  const cancelledTrips = Number(overview.cancelled_trips || 0);

  // VEHICLE UTILIZATION

  const vehicleData = [
    { name: "Available", value: availableVehicles, color: COLORS.blue },
    { name: "On Trip", value: vehiclesOnTrip, color: COLORS.green },
    {
      name: "Maintenance",
      value: maintenanceVehicles,
      color: COLORS.orange,
    },
  ];

  const otherVehicles = Math.max(
    totalVehicles -
      availableVehicles -
      vehiclesOnTrip -
      maintenanceVehicles,
    0
  );

  if (otherVehicles > 0) {
    vehicleData.push({
      name: "Other",
      value: otherVehicles,
      color: COLORS.gray,
    });
  }

  // TRIP PERFORMANCE

  const tripData = [
    { name: "Completed", trips: completedTrips, fill: COLORS.green },
    { name: "Active", trips: activeTrips, fill: COLORS.blue },
    { name: "Cancelled", trips: cancelledTrips, fill: COLORS.red },
  ];

  const otherTrips = Math.max(
    totalTrips -
      completedTrips -
      activeTrips -
      cancelledTrips,
    0
  );

  if (otherTrips > 0) {
    tripData.push({
      name: "Other",
      trips: otherTrips,
      fill: COLORS.gray,
    });
  }

  // DRIVER AVAILABILITY

  const otherDrivers = Math.max(
    totalDrivers - availableDrivers - driversOnTrip,
    0
  );

  const driverData = [
    { name: "Available", value: availableDrivers, color: COLORS.green },
    { name: "On Trip", value: driversOnTrip, color: COLORS.blue },
    { name: "Other", value: otherDrivers, color: COLORS.purple },
  ].filter((item) => item.value > 0);

  // VEHICLE ASSIGNMENT

  const assignedVehicles = Math.max(
    totalVehicles - unassignedVehicles,
    0
  );

  const allocationData = [
    { name: "Assigned", vehicles: assignedVehicles, fill: COLORS.blue },
    {
      name: "Unassigned",
      vehicles: unassignedVehicles,
      fill: COLORS.orange,
    },
  ];

  const utilizationRate =
    totalVehicles > 0
      ? Math.round((vehiclesOnTrip / totalVehicles) * 100)
      : 0;

  return (
    <section className="dashboard-analytics">

      <div className="dashboard-analytics-heading">
        <div>
          <span className="dashboard-section-label">
            ANALYTICS & INSIGHTS
          </span>
          <h2>Fleet Analytics</h2>
          <p>Monitor fleet performance and operational efficiency.</p>
        </div>

        <div className="dashboard-analytics-badge">
          Live Overview
        </div>
      </div>

      <div className="dashboard-charts-grid">

        {/* VEHICLE UTILIZATION */}

        <ChartCard
          title="Vehicle Utilization"
          subtitle="Distribution of registered vehicles"
        >
          {totalVehicles > 0 ? (
            <>
              <div className="dashboard-donut">
                <ResponsiveContainer width="100%" height={175}>
                  <PieChart>
                    <Pie
                      data={vehicleData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={68}
                      paddingAngle={4}
                    >
                      {vehicleData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={entry.color}
                        />
                      ))}
                    </Pie>

                    <Tooltip />
                    <Legend verticalAlign="bottom" />
                  </PieChart>
                </ResponsiveContainer>

                <div className="dashboard-donut-center">
                  <strong>{totalVehicles}</strong>
                  <span>Vehicles</span>
                </div>
              </div>

              <div className="dashboard-chart-insight">
                <strong>{utilizationRate}%</strong>
                <span>Vehicles currently on trips</span>
              </div>
            </>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        {/* TRIP PERFORMANCE */}

        <ChartCard
          title="Trip Performance"
          subtitle="Breakdown of trip statuses"
        >
          {totalTrips > 0 ? (
            <ResponsiveContainer width="100%" height={175}>
              <BarChart
                data={tripData}
                margin={{ top: 15, right: 10, left: -20, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#E8EDF5"
                />

                <XAxis
                  dataKey="name"
                  tick={{ fill: "#718096", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />

                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "#718096", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />

                <Tooltip />

                <Bar
                  dataKey="trips"
                  name="Trips"
                  radius={[7, 7, 0, 0]}
                  barSize={48}
                >
                  {tripData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={entry.fill}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}

          <div className="dashboard-chart-insight">
            <strong>{totalTrips}</strong>
            <span>Total recorded trips</span>
          </div>
        </ChartCard>

        {/* DRIVER AVAILABILITY */}

        <ChartCard
          title="Driver Availability"
          subtitle="Current driver status distribution"
        >
          {totalDrivers > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={175}>
                <PieChart>
                  <Pie
                    data={driverData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={68}
                    paddingAngle={4}
                  >
                    {driverData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={entry.color}
                      />
                    ))}
                  </Pie>

                  <Tooltip />
                  <Legend verticalAlign="bottom" />
                </PieChart>
              </ResponsiveContainer>

              <div className="dashboard-chart-insight">
                <strong>{totalDrivers}</strong>
                <span>Registered drivers</span>
              </div>
            </>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        {/* VEHICLE ASSIGNMENT */}

        <ChartCard
          title="Fleet Allocation"
          subtitle="Vehicle assignment overview"
        >
          {totalVehicles > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={175}>
                <BarChart
                  data={allocationData}
                  margin={{ top: 20, right: 15, left: -20, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#E8EDF5"
                  />

                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#718096", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "#718096", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <Tooltip />

                  <Bar
                    dataKey="vehicles"
                    name="Vehicles"
                    radius={[7, 7, 0, 0]}
                    barSize={45}
                  >
                    {allocationData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={entry.fill}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="dashboard-chart-insight">
                <strong>{assignedVehicles}</strong>
                <span>Vehicles with assigned drivers</span>
              </div>
            </>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

      </div>
    </section>
  );
}
