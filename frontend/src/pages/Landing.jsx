export default function Landing({ onLogin }) {
  const features = [
    ["Vehicle Management", "Register, monitor and manage your entire fleet."],
    ["Driver Management", "Manage driver details and assign vehicles."],
    ["Real-Time Tracking", "Track vehicles and shipments in real time."],
    ["Analytics & Reports", "Gain insights to improve efficiency."],
  ];
  return (
    <div className="landing">
      <header className="landing-nav">
        <h2 className="logo">Fleet<span>Flow</span></h2>
        <button className="primary-button" onClick={onLogin}>Login</button>
      </header>
      <section className="hero">
        <h1>Move Smarter. <span>Manage Further.</span></h1>
        <p>
          FleetFlow is a centralized fleet management and logistics platform
          to monitor vehicles, manage drivers and optimize operations.
        </p>
        <button className="primary-button" onClick={onLogin}>Get Started →</button>
      </section>
      <section className="feature-grid">
        {features.map(([t, d]) => (
          <article className="panel" key={t}><h3>{t}</h3><p>{d}</p></article>
        ))}
      </section>
    </div>
  );
}
