import Icon from "../Icons.jsx";

export default function Landing({ onLogin }) {
  const features = [
    ["vehicles", "Vehicle Management", "Register, monitor and manage your entire fleet."],
    ["drivers", "Driver Management", "Manage driver details and assign vehicles."],
    ["tracking", "Real-Time Tracking", "Track vehicles and shipments in real time."],
    ["analytics", "Analytics & Reports", "Gain insights to improve efficiency."],
  ];
  return (
    <div className="landing">
      <header className="landing-nav">
        <h2 className="logo"><span className="logo-mark">F</span><b>Fleet<span>Flow</span></b></h2>
        <button className="secondary-button" onClick={onLogin}>Login</button>
      </header>
      <section className="hero">
        <div className="hero-inner">
          <span className="hero-eyebrow">Fleet management &amp; logistics</span>
          <h1>Move Smarter. <span>Manage Further.</span></h1>
          <p>
            FleetFlow is a centralized fleet management and logistics platform
            to monitor vehicles, manage drivers and optimize operations.
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={onLogin}>Get Started →</button>
          </div>
        </div>
      </section>
      <section className="feature-grid">
        {features.map(([icon, t, d]) => (
          <article className="panel feature-card" key={t}>
            <span className="card-icon"><Icon name={icon} size={22} /></span>
            <h3>{t}</h3><p>{d}</p>
          </article>
        ))}
      </section>
      <p className="landing-foot">© FleetFlow · Intelligent Fleet Management and Logistics Platform</p>
    </div>
  );
}
