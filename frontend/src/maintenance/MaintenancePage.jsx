
import { useState } from "react";
import { Wrench, Bell, FileText } from "lucide-react";

import Maintenance from "./Maintenance";
import MaintenanceAlerts from "./MaintenanceAlerts";
import MaintenanceReports from "./MaintenanceReports";

import "./MaintenancePage.css";

function MaintenancePage({ token }) {
  const [activeTab, setActiveTab] = useState("maintenance");

  const tabs = [
    {
      id: "maintenance",
      label: "Maintenance",
      icon: Wrench,
    },
    {
      id: "alerts",
      label: "Maintenance Alerts",
      icon: Bell,
    },
    {
      id: "reports",
      label: "Maintenance Reports",
      icon: FileText,
    },
  ];

  return (
    <div className="maintenance-main-page">

      <div className="maintenance-main-header">
        <div>
          <span className="settings-eyebrow">
          <p>
            Manage vehicle servicing, maintenance alerts,
            service history and maintenance reports.
          </p>
          </span>
        </div>
      </div>

      <div className="maintenance-main-tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              className={
                activeTab === tab.id
                  ? "maintenance-main-tab active"
                  : "maintenance-main-tab"
              }
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="maintenance-main-content">

        {activeTab === "maintenance" && (
          <Maintenance token={token} />
        )}

        {activeTab === "alerts" && (
          <MaintenanceAlerts token={token} />
        )}

        {activeTab === "reports" && (
          <MaintenanceReports token={token} />
        )}

      </div>

    </div>
  );
}

export default MaintenancePage;
