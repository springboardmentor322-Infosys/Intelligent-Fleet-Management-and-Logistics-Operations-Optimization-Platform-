
import {
  Truck,
  MapPin,
  Route,
  Package,
  ArrowRight,
  ShieldCheck,
  Clock3,
  Leaf,
  UserRound,
} from "lucide-react";
import "./LandingPage.css";

export default function LandingPage({ onLogin, onGetStarted }) {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <a className="landing-brand" href="#home" aria-label="FleetFlow home">
          <Truck size={30} strokeWidth={2.5} />
          <span>Fleet<span>Flow</span></span>
        </a>

        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
        </nav>

        <button className="landing-login" onClick={onLogin}>
          <UserRound size={17} />
          Login
        </button>
      </header>

      <main>
        <section className="landing-hero" id="home">
          <div className="landing-hero-content">
            <p className="landing-eyebrow">
              SMARTER LOGISTICS. GREATER EFFICIENCY.
            </p>

            <h1>
              Complete Fleet Management, <span>Simplified.</span>
            </h1>

            <p className="landing-description">
              Track your vehicles, manage drivers, optimize routes and monitor
              shipments — all in one powerful platform.
            </p>

            <div className="landing-actions">
              <button className="landing-primary" onClick={onGetStarted}>
                Get Started <ArrowRight size={18} />
              </button>

              <a className="landing-secondary" href="#features">
                Explore Features
              </a>
            </div>
          </div>
        </section>

        <section className="landing-features" id="features">
          <article className="landing-feature">
            <div className="landing-feature-icon blue">
              <Truck size={25} />
            </div>
            <div>
              <h3>Fleet Management</h3>
              <p>Keep track of vehicles, maintenance and assignments.</p>
            </div>
          </article>

          <article className="landing-feature">
            <div className="landing-feature-icon purple">
              <MapPin size={25} />
            </div>
            <div>
              <h3>Live GPS Tracking</h3>
              <p>View the latest driver locations and fleet movements.</p>
            </div>
          </article>

          <article className="landing-feature">
            <div className="landing-feature-icon teal">
              <Route size={25} />
            </div>
            <div>
              <h3>Route Optimization</h3>
              <p>Support efficient routes and better trip coordination.</p>
            </div>
          </article>

          <article className="landing-feature">
            <div className="landing-feature-icon orange">
              <Package size={25} />
            </div>
            <div>
              <h3>Shipment Monitoring</h3>
              <p>Keep delivery information organized in one place.</p>
            </div>
          </article>
        </section>

        <section className="landing-about" id="about">
          <div className="landing-about-copy">
            <p className="landing-eyebrow">WHY FLEETFLOW?</p>
            <h2>Built for Smarter Logistics Operations</h2>
            <p>
              From fleet visibility to driver coordination, FleetFlow brings
              essential logistics operations together in one workspace.
            </p>

            <ul>
              <li><ShieldCheck size={19} /> Centralized fleet information</li>
              <li><Clock3 size={19} /> Easier operational coordination</li>
              <li><Leaf size={19} /> A focus on efficient operations</li>
            </ul>

            <button className="landing-outline" onClick={onGetStarted}>
              Explore FleetFlow <ArrowRight size={17} />
            </button>
          </div>

          <div className="landing-about-image">
            <img
              src="https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&w=1200&q=85"
              alt="Freight trucks ready for logistics operations"
              loading="lazy"
            />
            <div className="landing-image-caption">
              <Truck size={22} />
              <div>
                <strong>One connected fleet</strong>
                <span>Vehicles. Drivers. Deliveries.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-cta" id="contact">
          <div>
            <p className="landing-eyebrow">READY TO GET STARTED?</p>
            <h2>Take control of your fleet operations.</h2>
            <p>Bring your logistics workflow into one connected workspace.</p>
          </div>

          <button className="landing-primary" onClick={onGetStarted}>
            Get Started <ArrowRight size={18} />
          </button>
        </section>
      </main>

      <footer className="landing-footer">
        <a className="landing-brand" href="#home">
          <Truck size={25} />
          <span>Fleet<span>Flow</span></span>
        </a>
        <p>Smarter Logistics. Greater Efficiency.</p>
        <span>FleetFlow Logistics Platform</span>
      </footer>
    </div>
  );
}
