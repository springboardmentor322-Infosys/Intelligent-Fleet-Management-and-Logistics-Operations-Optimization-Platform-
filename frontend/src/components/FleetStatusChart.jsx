
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const COLORS = {
  Active: "#20B486",
  Idle: "#6485F5",
  Maintenance: "#F59E42",
};

export default function FleetStatusChart({
  active = 0,
  idle = 0,
  maintenance = 0,
}) {
  const data = [
    { name: "Active", value: active },
    { name: "Idle", value: idle },
    { name: "Maintenance", value: maintenance },
  ];

  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="fleet-chart-panel">
      <div className="fleet-chart-heading">
        <div>
          <h2>Fleet Distribution</h2>
          <p>Vehicle status breakdown</p>
        </div>
        <span className="fleet-chart-total">{total} Vehicles</span>
      </div>

      {total === 0 ? (
        <div className="fleet-chart-empty">
          No vehicle data available yet.
        </div>
      ) : (
        <div className="fleet-chart-content">
          <div className="fleet-chart-donut">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.filter((item) => item.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="65%"
                  outerRadius="88%"
                  paddingAngle={4}
                  stroke="none"
                >
                  {data
                    .filter((item) => item.value > 0)
                    .map((item) => (
                      <Cell
                        key={item.name}
                        fill={COLORS[item.name]}
                      />
                    ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>

            <div className="fleet-chart-center">
              <strong>{total}</strong>
              <span>Vehicles</span>
            </div>
          </div>

          <div className="fleet-chart-legend">
            {data.map((item) => (
              <div className="fleet-chart-legend-row" key={item.name}>
                <span
                  className="fleet-chart-dot"
                  style={{ backgroundColor: COLORS[item.name] }}
                />
                <span>{item.name}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
