
import { useEffect, useState } from "react";
import {
  User,
  ShieldCheck,
  Bell,
  SlidersHorizontal,
  Info,
  Save,
  LockKeyhole,
  Mail,
  Phone,
  RotateCcw,
} from "lucide-react";

import { requestPasswordReset, resetPassword } from "./api";
import "./Settings.css";

const DEFAULT_NOTIFICATIONS = {
  emailNotifications: true,
  tripUpdates: true,
  maintenanceAlerts: true,
  systemAnnouncements: true,
};

const DEFAULT_PREFERENCES = {
  theme: "Light",
  language: "English",
  dateFormat: "DD/MM/YYYY",
};

function getStoredValue(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? { ...fallback, ...JSON.parse(stored) } : fallback;
  } catch {
    return fallback;
  }
}

function getRoleName(role) {
  const roles = {
    administrator: "Administrator",
    admin: "Administrator",
    fleet_manager: "Fleet Manager",
    fleetmanager: "Fleet Manager",
    dispatcher: "Dispatcher",
    driver: "Driver",
  };

  return roles[role?.toLowerCase()] || "User";
}

export default function Settings({ email = "", userRole = "" }) {
  const [activeSection, setActiveSection] = useState("My Profile");

  const [profile, setProfile] = useState(() =>
    getStoredValue("fleetflow-profile", {
      fullName: "",
      phoneNumber: "",
    })
  );

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");

  const [notifications, setNotifications] = useState(() =>
    getStoredValue("fleetflow-notifications", DEFAULT_NOTIFICATIONS)
  );

  const [preferences, setPreferences] = useState(() =>
    getStoredValue("fleetflow-preferences", DEFAULT_PREFERENCES)
  );

  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityMessage, setSecurityMessage] = useState("");
  const [securityError, setSecurityError] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const sections = [
    { name: "My Profile", icon: User },
    { name: "Account Security", icon: ShieldCheck },
    { name: "Notifications", icon: Bell },
    { name: "Account Information", icon: Info },
  ];

  const roleName = getRoleName(userRole);

  useEffect(() => {
    localStorage.setItem(
      "fleetflow-notifications",
      JSON.stringify(notifications)
    );
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem(
      "fleetflow-preferences",
      JSON.stringify(preferences)
    );
  }, [preferences]);

  const handleProfileChange = (e) => {
    setProfile({
      ...profile,
      [e.target.name]: e.target.value,
    });
  };

  const saveProfile = () => {
    localStorage.setItem("fleetflow-profile", JSON.stringify(profile));
    setEditingProfile(false);
    setProfileMessage(
      "Profile information saved in this browser."
    );
  };

  const handleNotificationChange = (name) => {
    setNotifications((previous) => ({
      ...previous,
      [name]: !previous[name],
    }));
  };

  const handlePreferenceChange = (name, value) => {
    setPreferences((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handlePasswordReset = async () => {
  if (!email) {
    setSecurityError(true);
    setSecurityMessage("Email address is unavailable.");
    return;
  }

  try {
    setSecurityLoading(true);
    setSecurityMessage("");
    setSecurityError(false);

    await requestPasswordReset(email);

    setOtpSent(true);
    setResetOtp("");
    setNewPassword("");
    setConfirmNewPassword("");

    setSecurityMessage(
      "OTP sent successfully. Check your registered email."
    );
  } catch (error) {
    setSecurityError(true);
    setSecurityMessage(
      error.message || "Unable to request password reset."
    );
  } finally {
    setSecurityLoading(false);
  }
};


const handleConfirmPasswordReset = async (e) => {
  e.preventDefault();

  if (!resetOtp.trim() || !newPassword || !confirmNewPassword) {
    setSecurityError(true);
    setSecurityMessage("Please fill in all the fields.");
    return;
  }

  if (newPassword.length < 8) {
    setSecurityError(true);
    setSecurityMessage(
      "Password must contain at least 8 characters."
    );
    return;
  }

  if (newPassword !== confirmNewPassword) {
    setSecurityError(true);
    setSecurityMessage("Passwords do not match.");
    return;
  }

  try {
    setSecurityLoading(true);
    setSecurityMessage("");
    setSecurityError(false);

    await resetPassword(
      email,
      resetOtp.trim(),
      newPassword
    );

    setSecurityMessage(
      "Password changed successfully! Please log in using your new password."
    );

    setOtpSent(false);
    setResetOtp("");
    setNewPassword("");
    setConfirmNewPassword("");

  } catch (error) {
    setSecurityError(true);
    setSecurityMessage(
      error.message || "Password reset failed. Please check your OTP."
    );
  } finally {
    setSecurityLoading(false);
  }
};

  const resetPreferences = () => {
    setPreferences(DEFAULT_PREFERENCES);
  };

  return (
    <div className="fleet-settings">

      {/* HEADER */}

      <div className="settings-header">
        <div>
          <span className="settings-eyebrow">
            <p>Manage your account, security and application preferences.</p>
          </span>

          
        </div>
      </div>

      {/* SETTINGS NAVIGATION */}

      <div className="settings-layout">

        <aside className="settings-sidebar">
          <h4>GENERAL SETTINGS</h4>

          <div className="settings-nav">
            {sections.map((section) => {
              const Icon = section.icon;

              return (
                <button
                  key={section.name}
                  className={
                    activeSection === section.name
                      ? "settings-nav-item active"
                      : "settings-nav-item"
                  }
                  onClick={() => {
                    setActiveSection(section.name);
                    setProfileMessage("");
                    setSecurityMessage("");
                  }}
                >
                  <Icon size={18} />
                  <span>{section.name}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* CONTENT */}

        <main className="settings-content">

          {/* MY PROFILE */}

          {activeSection === "My Profile" && (
            <section className="settings-card">

              <div className="settings-card-heading">
                <div>
                  <h3>My Profile</h3>
                  <p>
                    View and manage your personal information.
                  </p>
                </div>

                {!editingProfile && (
                  <button
                    className="settings-primary-button"
                    onClick={() => {
                      setEditingProfile(true);
                      setProfileMessage("");
                    }}
                  >
                    Edit Profile
                  </button>
                )}
              </div>

              <div className="settings-profile-avatar">
                {(profile.fullName || email || "U")
                  .trim()
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div className="settings-form-grid">

                <div className="settings-field">
                  <label>Full Name</label>

                  <input
                    type="text"
                    name="fullName"
                    placeholder="Enter your name"
                    value={profile.fullName}
                    onChange={handleProfileChange}
                    disabled={!editingProfile}
                  />
                </div>

                <div className="settings-field">
                  <label>Email Address</label>

                  <input
                    type="email"
                    value={email}
                    disabled
                  />
                </div>

                <div className="settings-field">
                  <label>Phone Number</label>

                  <input
                    type="tel"
                    name="phoneNumber"
                    placeholder="Enter your phone number"
                    value={profile.phoneNumber}
                    onChange={handleProfileChange}
                    disabled={!editingProfile}
                  />
                </div>

                <div className="settings-field">
                  <label>Role</label>

                  <input
                    type="text"
                    value={roleName}
                    disabled
                  />
                </div>

              </div>

              {editingProfile && (
                <div className="settings-form-actions">

                  <button
                    className="settings-primary-button"
                    onClick={saveProfile}
                  >
                    <Save size={15} />
                    Save Changes
                  </button>

                  <button
                    className="settings-secondary-button"
                    onClick={() => setEditingProfile(false)}
                  >
                    Cancel
                  </button>

                </div>
              )}

              {profileMessage && (
                <div className="settings-success-message">
                  {profileMessage}
                </div>
              )}

              

            </section>
          )}

          
          {/* ACCOUNT SECURITY */}

          {activeSection === "Account Security" && (
            <section className="settings-card">

              <div className="settings-card-heading">
                <div>
                  <h3>Account Security</h3>
                  <p>
                    Manage your password and keep your account secure.
                  </p>
                </div>

                <ShieldCheck size={25} color="#3265e9" />
              </div>

              <div className="settings-security-box">
                <div className="settings-security-icon">
                  <LockKeyhole size={23} />
                </div>

                <div>
                  <h4>Password Management</h4>
                  <p>
                    Request a password reset OTP to your registered
                    email address.
                  </p>
                </div>
              </div>

              <div className="settings-field settings-email-field">
                <label>Registered Email Address</label>

                <input
                  type="email"
                  value={email}
                  disabled
                />
              </div>

              <button
                type="button"
                className="settings-primary-button"
                onClick={handlePasswordReset}
                disabled={securityLoading || !email}
              >
                <LockKeyhole size={15} />

                {securityLoading
                  ? "Sending Request..."
                  : otpSent
                    ? "Resend OTP"
                    : "Request Password Reset"}
              </button>

              {/* OTP AND NEW PASSWORD FORM */}

              {otpSent && (
                <form
                  className="settings-reset-form"
                  onSubmit={handleConfirmPasswordReset}
                >
                  <h4>Verify OTP & Change Password</h4>

                  <p>
                    Enter the OTP sent to your registered email
                    address and create your new password.
                  </p>

                  <div className="settings-form-grid">

                    <div className="settings-field">
                      <label>Verification OTP</label>

                      <input
                        type="text"
                        value={resetOtp}
                        onChange={(e) => setResetOtp(e.target.value)}
                        placeholder="Enter OTP"
                        maxLength={6}
                        autoComplete="one-time-code"
                        required
                      />
                    </div>

                    <div className="settings-field">
                      <label>New Password</label>

                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        autoComplete="new-password"
                        required
                      />
                    </div>

                    <div className="settings-field">
                      <label>Confirm New Password</label>

                      <input
                        type="password"
                        value={confirmNewPassword}
                        onChange={(e) =>
                          setConfirmNewPassword(e.target.value)
                        }
                        placeholder="Re-enter new password"
                        autoComplete="new-password"
                        required
                      />
                    </div>

                  </div>

                  <div className="settings-form-actions">
                    <button
                      type="submit"
                      className="settings-primary-button"
                      disabled={securityLoading}
                    >
                      {securityLoading
                        ? "Updating Password..."
                        : "Confirm Password Reset"}
                    </button>
                  </div>

                </form>
              )}

              {securityMessage && (
                <div
                  className={
                    securityError
                      ? "settings-error-message"
                      : "settings-success-message"
                  }
                >
                  {securityMessage}
                </div>
              )}

            </section>
          )}


          {/* NOTIFICATIONS */}

          {activeSection === "Notifications" && (
            <section className="settings-card">

              <div className="settings-card-heading">
                <div>
                  <h3>Notifications</h3>
                  <p>
                    Choose which notifications you want to receive.
                  </p>
                </div>

                <Bell size={24} color="#3265e9" />
              </div>

              <div className="settings-toggle-list">

                {[
                  {
                    key: "emailNotifications",
                    title: "Email Notifications",
                    description:
                      "Receive account-related email notifications.",
                  },
                  {
                    key: "tripUpdates",
                    title: "Trip Updates",
                    description:
                      "Receive updates about trip assignments and status.",
                  },
                  {
                    key: "maintenanceAlerts",
                    title: "Maintenance Alerts",
                    description:
                      "Receive vehicle maintenance reminders and alerts.",
                  },
                  {
                    key: "systemAnnouncements",
                    title: "System Announcements",
                    description:
                      "Receive important FleetFlow announcements.",
                  },
                ].map((item) => (
                  <div
                    className="settings-toggle-item"
                    key={item.key}
                  >
                    <div>
                      <h4>{item.title}</h4>
                      <p>{item.description}</p>
                    </div>

                    <label className="settings-switch">
                      <input
                        type="checkbox"
                        checked={notifications[item.key]}
                        onChange={() =>
                          handleNotificationChange(item.key)
                        }
                      />

                      <span className="settings-slider" />
                    </label>
                  </div>
                ))}

              </div>

              

            </section>
          )}


          {/* ACCOUNT INFORMATION */}

          {activeSection === "Account Information" && (
            <section className="settings-card">

              <div className="settings-card-heading">
                <div>
                  <h3>Account Information</h3>
                  <p>
                    Your account information and assigned access role.
                  </p>
                </div>

                <Info size={24} color="#3265e9" />
              </div>

              <div className="settings-account-list">

                <div className="settings-account-row">
                  <span>Account Name</span>
                  <strong>
                    {profile.fullName || "Not available"}
                  </strong>
                </div>

                <div className="settings-account-row">
                  <span>Email Address</span>
                  <strong>{email || "Not available"}</strong>
                </div>

                <div className="settings-account-row">
                  <span>Account Role</span>
                  <strong>{roleName}</strong>
                </div>

                <div className="settings-account-row">
                  <span>Account Status</span>

                  <strong className="settings-auth-status">
                    Authenticated session
                  </strong>
                </div>

              </div>

            </section>
          )}

        </main>

      </div>
    </div>
  );
}
