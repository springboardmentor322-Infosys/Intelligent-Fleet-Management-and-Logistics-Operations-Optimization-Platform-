import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, getStoredToken, initials, setStoredToken } from './api';
import AuthScreen from './components/AuthScreen';
import FleetMap from './components/FleetMap';
import Tilt3DCard from './components/Tilt3DCard';
import WorkspaceSubpages from './components/WorkspaceSubpages';
import {
  ConfirmDialog,
  ProfileDialog,
  RecordFormDialog,
  SearchDialog,
  SignOutDialog,
  TeamDialog
} from './components/Modals';

const BREADCRUMBS = {
  overview: 'Overview',
  tracking: 'Live GPS Tracking',
  routes: 'Route Optimization',
  vehicles: 'Vehicles',
  trips: 'Trips & routes',
  shipments: 'Shipments',
  drivers: 'Drivers',
  'driver-profile': 'Drivers / Driver Profile',
  maintenance: 'Maintenance',
  reports: 'Reports',
  notifications: 'Notifications',
  settings: 'Settings'
};

class WorkspaceErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unexpected rendering error' };
  }
  componentDidCatch() {}
  render() {
    if (this.state.hasError) {
      return (
        <div className="panel padded-panel" style={{ margin: '18px 0' }}>
          <span className="dialog-kicker">WORKSPACE RECOVERY</span>
          <h2>Section encountered a display issue</h2>
          <p style={{ color: '#6b776e', margin: '6px 0 14px' }}>{this.state.message}</p>
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              this.setState({ hasError: false, message: '' });
              this.props.onReset?.();
            }}
          >
            Reload Overview
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [token, setToken] = useState(() => getStoredToken());
  const [activeUser, setActiveUser] = useState(null);
  const [state, setState] = useState({
    vehicles: [],
    trips: [],
    shipments: [],
    drivers: [],
    maintenance: [],
    locationPings: [],
    summary: {},
    settings: null
  });
  const [currentPage, setCurrentPage] = useState('overview');
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [transitionPreset, setTransitionPreset] = useState('cube-forward');
  const [pageAnimKey, setPageAnimKey] = useState(0);
  const [workspaceArriving, setWorkspaceArriving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState('All');

  // WebSocket real-time state
  const [wsConnected, setWsConnected] = useState(false);
  const [wsLog, setWsLog] = useState([]);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  // Modals & notifications
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef(null);
  const [formDialog, setFormDialog] = useState({ open: false, kind: null, vehicleId: '' });
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [teamRefreshSignal, setTeamRefreshSignal] = useState(0);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [signoutDialogOpen, setSignoutDialogOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [confirmState, setConfirmState] = useState(null);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 3000);
  }, []);

  const askConfirm = useCallback((title, message, action = 'Continue') => {
    return new Promise((resolve) => {
      setConfirmState({ title, message, action, resolve });
    });
  }, []);

  const resolveConfirm = (accepted) => {
    const resolver = confirmState?.resolve;
    setConfirmState(null);
    if (resolver) resolver(accepted);
  };

  const signOut = useCallback(
    async (callApi = true) => {
      if (callApi && token) {
        try {
          await apiRequest('/api/auth/logout', { method: 'POST' }, token);
        } catch {}
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setToken('');
      setStoredToken('');
      setActiveUser(null);
    },
    [token]
  );

  const refreshDashboard = useCallback(
    async (overrideToken = token) => {
      if (!overrideToken) return;
      try {
        const data = await apiRequest('/api/dashboard', {}, overrideToken);
        setState({
          vehicles: Array.isArray(data?.vehicles) ? data.vehicles : [],
          trips: Array.isArray(data?.trips) ? data.trips : [],
          shipments: Array.isArray(data?.shipments) ? data.shipments : [],
          drivers: Array.isArray(data?.drivers) ? data.drivers : [],
          maintenance: Array.isArray(data?.maintenance) ? data.maintenance : [],
          locationPings: Array.isArray(data?.locationPings) ? data.locationPings : [],
          summary: data?.summary && typeof data.summary === 'object' ? data.summary : {},
          settings: data?.settings ?? null
        });
      } catch (err) {
        if (err.message.includes('sign in')) {
          signOut(false);
          return;
        }
        showToast('Could not connect to the FleetFlow Python backend.');
      }
    },
    [token, signOut, showToast]
  );

  // Authenticated WebSocket connection with automatic reconnection
  useEffect(() => {
    if (!activeUser || !token) return;

    let cancelled = false;

    const connectWs = () => {
      if (cancelled) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const backendHost =
        window.location.port === '5173'
          ? `${window.location.hostname}:8000`
          : window.location.host;
      const wsUrl = `${protocol}//${backendHost}/ws/tracking?token=${encodeURIComponent(token)}`;

      try {
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          if (!cancelled) setWsConnected(true);
        };

        socket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            const nowStr = new Date().toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });

            if (msg.type === 'GPS_UPDATE' && msg.payload?.vehicle) {
              const updatedV = msg.payload.vehicle;
              const updatedT = msg.payload.trip;
              const updatedShps = msg.payload.shipments || [];

              setState((prev) => ({
                ...prev,
                vehicles: prev.vehicles.map((v) => (v.id === updatedV.id ? updatedV : v)),
                trips: updatedT
                  ? prev.trips.map((t) => (t.id === updatedT.id ? updatedT : t))
                  : prev.trips,
                shipments: updatedShps.length
                  ? prev.shipments.map((s) => updatedShps.find((u) => u.id === s.id) || s)
                  : prev.shipments
              }));

              setWsLog((prev) => [
                {
                  type: 'GPS_PING',
                  summary: `${updatedV.id} @ ${Number(updatedV.lat).toFixed(4)}, ${Number(updatedV.lng).toFixed(4)} (${updatedV.speed} km/h)`,
                  time: nowStr
                },
                ...prev.slice(0, 12)
              ]);
            } else if (
              ['SHIPMENT_UPDATE', 'TRIP_CREATED', 'TRIP_UPDATED', 'ROUTE_UPDATED'].includes(msg.type)
            ) {
              refreshDashboard();
              setWsLog((prev) => [
                {
                  type: msg.type,
                  summary:
                    msg.payload?.shipment?.id ||
                    msg.payload?.trip?.id ||
                    'Fleet telemetry updated',
                  time: nowStr
                },
                ...prev.slice(0, 12)
              ]);
            }
          } catch {}
        };

        socket.onclose = () => {
          if (!cancelled) {
            setWsConnected(false);
            reconnectTimerRef.current = setTimeout(connectWs, 3000);
          }
        };

        socket.onerror = () => {
          socket.close();
        };
      } catch {
        setWsConnected(false);
      }
    };

    connectWs();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [activeUser, token, refreshDashboard]);

  const enterWorkspace = useCallback(
    (user, nextToken) => {
      setActiveUser(user);
      setToken(nextToken);
      document.body.dataset.role = user.role;
      setCurrentPage('overview');
      setPageAnimKey((k) => k + 1);
      setWorkspaceArriving(true);
      setTimeout(() => setWorkspaceArriving(false), 800);
      refreshDashboard(nextToken);
    },
    [refreshDashboard]
  );

  useEffect(() => {
    if (!token) return;
    apiRequest('/api/auth/me', {}, token)
      .then((res) => {
        enterWorkspace(res.user, token);
      })
      .catch(() => {
        setToken('');
        setStoredToken('');
        setActiveUser(null);
      });
  }, []);

  useEffect(() => {
    if (!activeUser) return;
    const interval = setInterval(() => refreshDashboard(), 30000);
    return () => clearInterval(interval);
  }, [activeUser, refreshDashboard]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (activeUser) setSearchDialogOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeUser]);

  const PAGE_ORDER = [
    'overview',
    'tracking',
    'routes',
    'vehicles',
    'trips',
    'shipments',
    'drivers',
    'driver-profile',
    'reports',
    'notifications',
    'maintenance',
    'settings'
  ];
  const EDIT_PRESETS = ['cube-forward', 'dolly-zoom', 'card-flip', 'swing-door'];

  const navigateTo = (page) => {
    if (page === 'team') {
      if (activeUser?.role === 'admin') {
        setTeamDialogOpen(true);
      } else {
        showToast('Team access is for administrators.');
      }
      setSidebarOpen(false);
      return;
    }
    if (page === 'settings' && activeUser?.role !== 'admin') {
      showToast('Settings are for administrators.');
      setSidebarOpen(false);
      return;
    }
    if (page === currentPage) {
      setSidebarOpen(false);
      return;
    }
    const oldIdx = PAGE_ORDER.indexOf(currentPage);
    const newIdx = PAGE_ORDER.indexOf(page);
    const preset =
      page === 'overview'
        ? 'cube-back'
        : newIdx > oldIdx
        ? EDIT_PRESETS[(newIdx + pageAnimKey) % EDIT_PRESETS.length]
        : 'cube-back';

    setTransitionPreset(preset);
    setCurrentPage(page);
    setPageAnimKey((k) => k + 1);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenDriverProfile = (driverId) => {
    if (!driverId) {
      navigateTo('drivers');
      return;
    }
    setSelectedDriverId(driverId);
    navigateTo('driver-profile');
  };

  const cycleVehicleStatus = async (vehicle) => {
    const next = {
      Available: 'On route',
      'On route': 'In service',
      'In service': 'Available'
    };
    try {
      await apiRequest(
        `/api/vehicles/${encodeURIComponent(vehicle.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: next[vehicle.status] || 'Available' })
        },
        token
      );
      await refreshDashboard();
      showToast(`${vehicle.name} status updated.`);
    } catch (err) {
      showToast(err.message);
    }
  };

  const deleteVehicle = async (id) => {
    const ok = await askConfirm(
      'Remove this vehicle?',
      'This will remove the vehicle from the workspace fleet.',
      'Remove vehicle'
    );
    if (!ok) return;
    try {
      await apiRequest(`/api/vehicles/${encodeURIComponent(id)}`, { method: 'DELETE' }, token);
      await refreshDashboard();
      showToast('Vehicle removed from your fleet.');
    } catch (err) {
      showToast(err.message);
    }
  };

  const exportCsv = () => {
    const rows = [
      ['Vehicle', 'Registration', 'Driver', 'Status', 'Fuel', 'Speed (km/h)', 'Coordinates', 'Location', 'Next service'],
      ...state.vehicles.map((v) => [
        v.name,
        v.plate,
        v.driver,
        v.status,
        `${v.fuel}%`,
        v.speed ?? 0,
        `${v.lat ?? ''}, ${v.lng ?? ''}`,
        v.location,
        v.service
      ])
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = 'fleetflow-vehicle-report.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('Your fleet report is ready.');
  };

  if (!activeUser) {
    return (
      <>
        <AuthScreen onAuthenticated={enterWorkspace} onToast={showToast} />
        <div className={`toast ${toast ? 'show' : ''}`} role="status">
          {toast}
        </div>
      </>
    );
  }

  const role = activeUser.role;
  const isAdmin = role === 'admin';
  const isManager = ['admin', 'fleet_manager'].includes(role);
  const isDispatcher = ['admin', 'fleet_manager', 'dispatcher'].includes(role);

  const roleDisplayName =
    {
      admin: 'Administrator',
      fleet_manager: 'Fleet Manager',
      dispatcher: 'Dispatcher',
      driver: 'Driver'
    }[role] || 'FleetFlow member';

  const summary = state.summary || {};
  const averageFuel = state.vehicles.length
    ? Math.round(
        state.vehicles.reduce((total, v) => total + Number(v.fuel || 0), 0) /
          state.vehicles.length
      )
    : 0;
  const fuelUsed = 100 - averageFuel;
  const totalTrips = state.trips.length;
  const activePercent = summary.fleet ? Math.round((summary.active / summary.fleet) * 100) : 0;
  const notificationCount =
    state.trips.filter((t) => t.status === 'Delayed').length +
    state.maintenance.filter((m) => m.status !== 'Complete').length +
    state.vehicles.filter((v) => v.fuel < 40).length;

  const todayFormatted = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
    .format(new Date())
    .toUpperCase();

  const heroCopy = {
    admin: {
      subtitle: 'The whole operation, in one clear view.',
      kicker: 'ADMIN CONTROL ROOM · LIVE TELEMATICS',
      title: 'A better view of the whole fleet.',
      text: 'People, vehicles, GPS telemetry and shipments, all under control.',
      tripTitle: 'Organization dispatch',
      tripDesc: 'All active routes across your workspace.'
    },
    fleet_manager: {
      subtitle: 'Here’s what is happening across your routes today.',
      kicker: 'FLEET MANAGER · LIVE DISPATCH',
      title: 'Your fleet is making moves.',
      text: 'Every vehicle, every route, all moving together.',
      tripTitle: 'Operations in motion',
      tripDesc: 'Live routes and deliveries across your fleet.'
    },
    dispatcher: {
      subtitle: 'Your dispatch queue and assigned journeys.',
      kicker: 'DISPATCH DESK · LIVE',
      title: 'Keep every delivery on course.',
      text: 'Assign routes, coordinate drivers and keep people informed.',
      tripTitle: 'Dispatch queue',
      tripDesc: 'Journeys that need active coordination.'
    },
    driver: {
      subtitle: 'Your assigned vehicle and current delivery.',
      kicker: 'DRIVER VIEW · LIVE',
      title: 'Ready for the road ahead?',
      text: 'Your assigned route and delivery updates are right here.',
      tripTitle: 'My delivery',
      tripDesc: 'Your assigned route and delivery progress.'
    }
  }[role] || {
    subtitle: 'Here’s what’s happening across your fleet today.',
    kicker: 'FLEETFLOW LIVE',
    title: 'Your fleet is making moves.',
    text: 'Every vehicle, every route, all moving together.',
    tripTitle: 'Trips in progress',
    tripDesc: 'Your active deliveries, at a glance.'
  };

  const filteredOverviewVehicles = state.vehicles.filter(
    (v) => vehicleFilter === 'All' || v.status === vehicleFilter
  );

  const completedShare = state.trips.length
    ? Math.round(((summary.deliveries || 0) / state.trips.length) * 100)
    : 0;

  return (
    <>
      <div
        className={`app-shell role-${role === 'fleet_manager' ? 'manager' : role} ${
          workspaceArriving ? 'workspace-arrive' : ''
        }`}
      >
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} id="sidebar">
          <a
            className="brand"
            href="#overview"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('overview');
            }}
            aria-label="FleetFlow home"
          >
            <span className="brand-mark">
              <svg viewBox="0 0 32 32" aria-hidden="true">
                <path d="M5 22.5 12.5 7l4.2 9 3-5 7.3 11.5H5Z" />
                <path d="M4 25h24" />
              </svg>
            </span>
            <span>
              fleet<span className="brand-light">flow</span>
            </span>
          </a>

          <div className="workspace">
            <span className="workspace-icon">N</span>
            <span className="workspace-copy">
              <b>{state.settings?.company || 'Northstar Logistics'}</b>
              <small>Operations workspace</small>
            </span>
            <span className="chevron">⌄</span>
          </div>

          <div className="nav-label">WORKSPACE</div>
          <nav className="navigation" aria-label="Main navigation">
            <a
              className={`nav-link ${currentPage === 'overview' ? 'active' : ''}`}
              href="#overview"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('overview');
              }}
            >
              <span className="nav-icon">▦</span>Overview
            </a>
            <a
              className={`nav-link ${currentPage === 'tracking' ? 'active' : ''}`}
              href="#tracking"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('tracking');
              }}
            >
              <span className="nav-icon">◎</span>Live Tracking
              <span className="nav-count">{wsConnected ? 'WS' : '—'}</span>
            </a>
            <a
              className={`nav-link ${currentPage === 'routes' ? 'active' : ''}`}
              href="#routes"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('routes');
              }}
            >
              <span className="nav-icon">⑂</span>Route Optimizer
            </a>
            <a
              className={`nav-link ${currentPage === 'vehicles' ? 'active' : ''}`}
              href="#vehicles"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('vehicles');
              }}
            >
              <span className="nav-icon">▰</span>Vehicles
              <span className="nav-count">{String(state.vehicles.length).padStart(2, '0')}</span>
            </a>
            <a
              className={`nav-link ${currentPage === 'trips' ? 'active' : ''}`}
              href="#trips"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('trips');
              }}
            >
              <span className="nav-icon">↗</span>Trips &amp; routes
            </a>
            <a
              className={`nav-link ${currentPage === 'shipments' ? 'active' : ''}`}
              href="#shipments"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('shipments');
              }}
            >
              <span className="nav-icon">▣</span>Shipments
              <span className="nav-count">{(state.shipments || []).length}</span>
            </a>
            <a
              className={`nav-link ${['drivers', 'driver-profile'].includes(currentPage) ? 'active' : ''}`}
              href="#drivers"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('drivers');
              }}
            >
              <span className="nav-icon">♙</span>Drivers
            </a>
            {isManager && (
              <a
                className={`nav-link ${currentPage === 'reports' ? 'active' : ''}`}
                href="#reports"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo('reports');
                }}
              >
                <span className="nav-icon">▤</span>Reports
              </a>
            )}
            <a
              className={`nav-link ${currentPage === 'notifications' ? 'active' : ''}`}
              href="#notifications"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('notifications');
              }}
            >
              <span className="nav-icon">♧</span>Notifications
              <span className="nav-count">{notificationCount}</span>
            </a>
            {isAdmin && (
              <a
                className="nav-link"
                href="#team"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo('team');
                }}
              >
                <span className="nav-icon">♙</span>Team access
              </a>
            )}
          </nav>

          <div className="nav-label tools-label">MANAGE</div>
          <nav className="navigation">
            {isManager && (
              <a
                className={`nav-link ${currentPage === 'maintenance' ? 'active' : ''}`}
                href="#maintenance"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo('maintenance');
                }}
              >
                <span className="nav-icon">⚙</span>Maintenance
                <span className="tiny-dot" />
              </a>
            )}
            {isAdmin && (
              <a
                className={`nav-link ${currentPage === 'settings' ? 'active' : ''}`}
                href="#settings"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo('settings');
                }}
              >
                <span className="nav-icon">⊙</span>Settings
              </a>
            )}
          </nav>

          <div className="sidebar-bottom">
            <div className="help-card">
              <span className="help-spark">✳</span>
              <b>Need a hand?</b>
              <p>Our support team is one click away.</p>
              <a href="mailto:support@fleetflow.example">
                Visit help centre <span>↗</span>
              </a>
            </div>
            <button
              className="profile"
              type="button"
              onClick={() => setProfileDialogOpen(true)}
            >
              <span className="avatar">{initials(activeUser.name)}</span>
              <span>
                <b>{activeUser.name}</b>
                <small>{roleDisplayName}</small>
              </span>
              <span className="profile-menu">•••</span>
            </button>
          </div>
        </aside>

        <main className="main-area" onClick={() => sidebarOpen && setSidebarOpen(false)}>
          <header className="topbar">
            <button
              className="mobile-menu"
              type="button"
              aria-label="Open navigation"
              onClick={(e) => {
                e.stopPropagation();
                setSidebarOpen((prev) => !prev);
              }}
            >
              ☰
            </button>
            <div className="breadcrumbs">
              Workspace <span>/</span> <b>{BREADCRUMBS[currentPage] || currentPage}</b>
            </div>
            <div className="top-actions">
              <div className="status-live">
                <i />
                {wsConnected ? 'GPS WebSocket Live' : 'All systems operational'}
              </div>
              <button
                className="search-trigger"
                type="button"
                aria-label="Search vehicles, trips and drivers"
                onClick={() => setSearchDialogOpen(true)}
              >
                <span>⌕</span>
                <span>Search anything</span>
                <kbd>Ctrl K</kbd>
              </button>
              <button
                className="icon-button bell"
                type="button"
                aria-label="Notifications"
                onClick={() => navigateTo('notifications')}
              >
                ♧<i />
              </button>
              <button
                className="account-chip"
                type="button"
                aria-label="Open account profile"
                onClick={() => setProfileDialogOpen(true)}
              >
                <span className="top-avatar">{initials(activeUser.name)}</span>
                <span>
                  <b>{activeUser.name}</b>
                  <small>{roleDisplayName}</small>
                </span>
                <i>⌄</i>
              </button>
            </div>
          </header>

          <section className="content" id="page-content">
            <WorkspaceErrorBoundary onReset={() => navigateTo('overview')}>
            <div key={pageAnimKey} className="page-smooth-enter">
              {currentPage === 'overview' ? (
                <div id="overview-content">
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">
                        <span className="sun-icon">☀</span> <span>{todayFormatted}</span>
                      </div>
                      <h1>
                        {isManager ? 'Good morning' : 'Welcome back'}, {activeUser.name}{' '}
                        <span className="wave">✳</span>
                      </h1>
                      <p className="subtitle">{heroCopy.subtitle}</p>
                    </div>
                    <div className="heading-actions">
                      <button
                        className="button button-outline"
                        type="button"
                        onClick={() => navigateTo('tracking')}
                      >
                        <span>◎</span> Live GPS Console
                      </button>
                      <button
                        className="button button-outline"
                        type="button"
                        onClick={exportCsv}
                      >
                        <span>↓</span> Export report
                      </button>
                      {isDispatcher && (
                        <button
                          className="button button-primary"
                          type="button"
                          onClick={() => setFormDialog({ open: true, kind: 'trip', vehicleId: '' })}
                        >
                          <span>＋</span> New trip
                        </button>
                      )}
                    </div>
                  </div>

                  <Tilt3DCard as="section" className="role-hero" maxTilt={3.5}>
                    <div className="role-hero-copy">
                      <span className="role-hero-kicker">{heroCopy.kicker}</span>
                      <h2>{heroCopy.title}</h2>
                      <p>{heroCopy.text}</p>
                      <div className="hero-badges">
                        <span>
                          <i />
                          <b>{summary.active ?? 0}</b> vehicles on the road
                        </span>
                        <span className="hero-divider">·</span>
                        <span>Bengaluru dispatch</span>
                      </div>
                      <button
                        className="hero-vehicle-action"
                        type="button"
                        onClick={() => navigateTo('routes')}
                      >
                        Open Route Optimizer <span>↗</span>
                      </button>
                    </div>
                    <div className="road-scene route-console" aria-label="Fleet route activity">
                      <div className="route-map-lines">
                        <i />
                        <i />
                        <i />
                        <i />
                      </div>
                      <svg className="route-path" viewBox="0 0 600 240" aria-hidden="true">
                        <path d="M22 190 C120 188 105 110 216 120 S340 204 407 130 S495 42 578 54" />
                        <path
                          className="route-path-highlight"
                          d="M22 190 C120 188 105 110 216 120 S340 204 407 130 S495 42 578 54"
                        />
                      </svg>
                      <span className="route-node route-node-start">DEPOT</span>
                      <span className="route-node route-node-mid">NORTH</span>
                      <button
                        className="dashboard-vehicle-link"
                        type="button"
                        aria-label="Open Live GPS Tracking"
                        onClick={() => navigateTo('tracking')}
                      >
                        <span className="fleet-transition-truck">
                          <i className="truck-cargo" />
                          <i className="truck-cab">
                            <b />
                          </i>
                          <i className="truck-wheel wheel-a" />
                          <i className="truck-wheel wheel-b" />
                        </span>
                      </button>
                      <div className="scene-route-tag">
                        <span className="live-dot" /> ACTIVE VEHICLES{' '}
                        <b>{String(summary.active ?? 0).padStart(2, '0')}</b>
                      </div>
                    </div>
                  </Tilt3DCard>

                  <div className="metric-grid">
                    <Tilt3DCard as="article" className="metric-card">
                      <div className="metric-top">
                        <span>Total vehicles</span>
                        <span className="metric-icon green">▰</span>
                      </div>
                      <div className="metric-main">
                        <strong>{summary.fleet ?? 0}</strong>
                        <span className="trend neutral">
                          In <em>workspace</em>
                        </span>
                      </div>
                      <div className="metric-note">
                        {new Set(state.vehicles.map((v) => v.type).filter(Boolean)).size} vehicle
                        types · GPS equipped
                      </div>
                      <div className="mini-bars" aria-hidden="true">
                        {[36, 55, 47, 72, 62, 82, 100, 76, 88, 68, 94, 100].map((h, i) => (
                          <i key={i} style={{ height: `${h}%` }} />
                        ))}
                      </div>
                    </Tilt3DCard>

                    <Tilt3DCard as="article" className="metric-card">
                      <div className="metric-top">
                        <span>On the road</span>
                        <span className="metric-icon blue">↗</span>
                      </div>
                      <div className="metric-main">
                        <strong>{summary.active ?? 0}</strong>
                        <span className="trend neutral">
                          Live <em>GPS stream</em>
                        </span>
                      </div>
                      <div className="metric-note">
                        <span className="live-dot" /> Vehicles currently in transit
                      </div>
                      <div className="metric-progress">
                        <div>
                          <span>Active fleet</span>
                          <b>{activePercent}%</b>
                        </div>
                        <div className="progress-track">
                          <i style={{ width: `${activePercent}%` }} />
                        </div>
                      </div>
                    </Tilt3DCard>

                    <Tilt3DCard as="article" className="metric-card">
                      <div className="metric-top">
                        <span>Completed deliveries</span>
                        <span className="metric-icon amber">✓</span>
                      </div>
                      <div className="metric-main">
                        <strong>
                          <span>{summary.deliveries ?? 0}</span>
                          <small className="of-total"> / {totalTrips}</small>
                        </strong>
                        <span className="trend neutral">
                          Saved <em>trip records</em>
                        </span>
                      </div>
                      <div className="metric-note">Delivery status from assigned trips</div>
                      <div className="delivery-visual">
                        <div className="delivery-track">
                          <i
                            style={{
                              width: `${
                                totalTrips
                                  ? Math.min(100, Math.round(((summary.deliveries || 0) / totalTrips) * 100))
                                  : 0
                              }%`
                            }}
                          />
                        </div>
                        <div className="delivery-caption">
                          <span>Completed</span>
                          <b>
                            {summary.deliveries ?? 0} of {totalTrips}
                          </b>
                        </div>
                      </div>
                    </Tilt3DCard>

                    <Tilt3DCard as="article" className="metric-card fuel-metric">
                      <div className="metric-top">
                        <span>Average fuel used</span>
                        <span className="metric-icon purple">⌁</span>
                      </div>
                      <div className="metric-main">
                        <strong>
                          <span>{fuelUsed}</span>
                          <small className="percent">%</small>
                        </strong>
                        <span className="trend neutral">
                          Fleet <em>average</em>
                        </span>
                      </div>
                      <div className="metric-note">Estimated from current fuel readings</div>
                      <div className="fuel-gauge">
                        <i style={{ width: `${fuelUsed}%` }} />
                      </div>
                    </Tilt3DCard>
                  </div>

                  {/* Role-aware extra band */}
                  {role === 'admin' && (
                    <div className="role-extra-band">
                      <Tilt3DCard as="article" maxTilt={4}>
                        <span>Active shipments</span>
                        <b>{(state.shipments || []).length}</b>
                        <small>{summary.shipmentsDelayed ?? 0} delayed alert(s)</small>
                        <button type="button" onClick={() => navigateTo('shipments')}>
                          Track shipments →
                        </button>
                      </Tilt3DCard>
                      <Tilt3DCard as="article" maxTilt={4}>
                        <span>Service queue</span>
                        <b>{summary.maintenanceDue ?? 0}</b>
                        <small>Vehicles needing attention</small>
                        <button type="button" onClick={() => navigateTo('maintenance')}>
                          Review schedule →
                        </button>
                      </Tilt3DCard>
                      <Tilt3DCard as="article" maxTilt={4}>
                        <span>Trip completion</span>
                        <b>
                          {completedShare}
                          <span>%</span>
                        </b>
                        <small>Share of recorded trips delivered</small>
                        <i className="health-mark">✳</i>
                      </Tilt3DCard>
                    </div>
                  )}

                  {role === 'fleet_manager' && (
                    <div className="role-extra-band">
                      <Tilt3DCard as="article" className="manager-note" maxTilt={4}>
                        <span>Dispatch focus</span>
                        <b>{summary.active ?? 0} vehicles on active routes</b>
                        <small>Monitor live GPS pins and recalculated ETAs.</small>
                        <button type="button" onClick={() => navigateTo('tracking')}>
                          Open Live GPS Map →
                        </button>
                      </Tilt3DCard>
                      <Tilt3DCard as="article" className="manager-note" maxTilt={4}>
                        <span>Shipment workflow</span>
                        <b>{(state.shipments || []).length} tracked manifests</b>
                        <small>Monitor Created → Assigned → In Transit → Delivered.</small>
                        <button type="button" onClick={() => navigateTo('shipments')}>
                          Open Shipments →
                        </button>
                      </Tilt3DCard>
                    </div>
                  )}

                  {role === 'dispatcher' && (
                    <div className="role-extra-band">
                      <Tilt3DCard as="article" className="dispatch-note" maxTilt={4}>
                        <span>Route queue</span>
                        <b>
                          {state.trips.filter((t) => !['Delivered', 'Cancelled'].includes(t.status)).length}{' '}
                          journeys in progress
                        </b>
                        <small>Evaluate traffic-avoidance routes &amp; update ETAs.</small>
                        <button type="button" onClick={() => navigateTo('routes')}>
                          Open Route Optimizer →
                        </button>
                      </Tilt3DCard>
                      <Tilt3DCard as="article" className="dispatch-note" maxTilt={4}>
                        <span>Available drivers</span>
                        <b>
                          {state.drivers.filter((d) => d.status === 'Available').length} ready for
                          assignment
                        </b>
                        <small>Inspect driver profiles, licenses &amp; vehicle links.</small>
                        <button type="button" onClick={() => navigateTo('drivers')}>
                          View drivers →
                        </button>
                      </Tilt3DCard>
                    </div>
                  )}

                  {role === 'driver' && (
                    <div className="role-extra-band">
                      <Tilt3DCard as="article" className="driver-note" maxTilt={4}>
                        <span>Next delivery</span>
                        <b>
                          {state.trips[0]
                            ? `${state.trips[0].from} → ${state.trips[0].to}`
                            : 'No trip assigned'}
                        </b>
                        <small>
                          {state.trips[0]
                            ? `${state.trips[0].id} · ETA ${state.trips[0].eta}`
                            : 'Your dispatcher will add a route here.'}
                        </small>
                        <button type="button" onClick={() => navigateTo('trips')}>
                          View my trips →
                        </button>
                      </Tilt3DCard>
                      <Tilt3DCard as="article" className="driver-note" maxTilt={4}>
                        <span>Assigned vehicle</span>
                        <b>{state.vehicles[0] ? state.vehicles[0].name : 'No vehicle assigned'}</b>
                        <small>
                          {state.vehicles[0]
                            ? `${state.vehicles[0].plate} · ${state.vehicles[0].speed ?? 0} km/h`
                            : 'Your vehicle details will appear here.'}
                        </small>
                        <button type="button" onClick={() => navigateTo('vehicles')}>
                          View vehicle →
                        </button>
                      </Tilt3DCard>
                    </div>
                  )}

                  {/* Feature 8: Live ETA Calculation & Delivery Progress Overview Strip */}
                  <section className="panel padded-panel" style={{ marginTop: '16px' }}>
                    <div className="panel-heading" style={{ padding: '0 0 12px 0' }}>
                      <div>
                        <h2>Live ETA Calculation &amp; Shipment Progress</h2>
                        <p>Real-time remaining distance, estimated arrival times, and delay threshold status.</p>
                      </div>
                      <a
                        className="text-link"
                        href="#shipments"
                        onClick={(e) => {
                          e.preventDefault();
                          navigateTo('shipments');
                        }}
                      >
                        Open Delivery &amp; ETA Console <span>→</span>
                      </a>
                    </div>
                    <div className="delayed-cards-row">
                      {(state.shipments || []).slice(0, 4).map((shp) => {
                        const tr = state.trips.find((t) => t.id === shp.tripId);
                        const pct = shp.status === 'Delivered' ? 100 : shp.status === 'Created' ? 0 : (tr?.progress ?? 50);
                        const remKm = Number(Math.max(0, (tr?.distanceKm || 16.4) * (1 - pct / 100)).toFixed(1));
                        const delayed = shp.status === 'Delayed';
                        return (
                          <div
                            key={shp.id}
                            className="panel"
                            style={{ padding: '12px 14px', cursor: 'pointer', borderColor: delayed ? '#fdba74' : undefined }}
                            onClick={() => navigateTo('shipments')}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <b>{shp.id} · {shp.origin} → {shp.destination}</b>
                              <span className={`status-pill ${delayed ? 'delayed' : 'available'}`}>
                                {delayed ? 'Delayed' : shp.status === 'Delivered' ? 'Delivered' : 'On Time'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#5a675f', marginBottom: '6px' }}>
                              <span>Remaining: <b>{remKm} km</b></span>
                              <span>ETA: <b>{shp.eta}</b> ({pct}%)</span>
                            </div>
                            <div className="eta-animated-bar-track" style={{ height: '6px' }}>
                              <div
                                className={`eta-animated-bar-fill ${delayed ? 'is-delayed' : ''}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <div className="section-grid">
                    <section className="panel trips-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>{heroCopy.tripTitle}</h2>
                          <p>{heroCopy.tripDesc}</p>
                        </div>
                        <a
                          className="text-link"
                          href="#trips"
                          onClick={(e) => {
                            e.preventDefault();
                            navigateTo('trips');
                          }}
                        >
                          View all <span>→</span>
                        </a>
                      </div>
                      <div className="trip-list">
                        {!state.trips.length ? (
                          <div className="empty-state">
                            No trips yet. Create a trip to get started.
                          </div>
                        ) : (
                          state.trips.slice(0, 4).map((trip) => (
                            <div className="trip-row" key={trip.id}>
                              <span className="trip-route-icon">↗</span>
                              <div>
                                <div className="trip-copy">
                                  <b>{trip.from}</b>
                                  <span>→</span>
                                  <b>{trip.to}</b>
                                </div>
                                <div className="trip-meta">
                                  {trip.id} &nbsp;·&nbsp; {trip.driver} &nbsp;·&nbsp; ETA {trip.eta}
                                </div>
                              </div>
                              <span className="trip-status">
                                <span
                                  className={`status-pill ${
                                    trip.status === 'Delayed' ? 'delayed' : ''
                                  }`}
                                >
                                  {trip.status}
                                </span>
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="panel-footer">
                        <span>
                          <i className="live-dot" /> {wsConnected ? 'WebSocket streaming live' : 'Updating live'}
                        </span>
                        <span>Synced with GPS telematics</span>
                      </div>
                    </section>

                    <FleetMap
                      vehicles={state.vehicles}
                      trips={state.trips}
                      activeCount={summary.active ?? 0}
                      availableCount={summary.available ?? 0}
                      wsConnected={wsConnected}
                      onNavigate={navigateTo}
                      onToast={showToast}
                      isVisible={currentPage === 'overview'}
                    />
                  </div>

                  <section className="panel vehicle-panel">
                    <div className="panel-heading vehicle-heading">
                      <div>
                        <h2>{role === 'driver' ? 'My assigned vehicle' : 'Fleet overview'}</h2>
                        <p>
                          {role === 'driver'
                            ? 'Current status, fuel and service details for your assignment.'
                            : 'Review current vehicle status, live GPS coordinates, fuel level and service dates.'}
                        </p>
                      </div>
                      <div className="table-actions">
                        <label className="filter-select">
                          <span>All vehicles</span>
                          <select
                            aria-label="Filter vehicles"
                            value={vehicleFilter}
                            onChange={(e) => setVehicleFilter(e.target.value)}
                          >
                            <option value="All">All vehicles</option>
                            <option>On route</option>
                            <option>Available</option>
                            <option>In service</option>
                          </select>
                          <i>⌄</i>
                        </label>
                        {isManager && (
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => setFormDialog({ open: true, kind: 'vehicle', vehicleId: '' })}
                          >
                            ＋ Add vehicle
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>VEHICLE</th>
                            <th>DRIVER</th>
                            <th>STATUS</th>
                            <th>FUEL</th>
                            <th>LIVE GPS LOCATION</th>
                            <th>NEXT SERVICE</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {!filteredOverviewVehicles.length ? (
                            <tr>
                              <td colSpan={7} className="empty-state">
                                No vehicles match this filter.
                              </td>
                            </tr>
                          ) : (
                            filteredOverviewVehicles.slice(0, 5).map((vehicle) => (
                              <tr
                                key={vehicle.id}
                                className="vehicle-row"
                                title="Click to change vehicle status"
                                onClick={(e) => {
                                  if (e.target.closest('[data-delete]')) return;
                                  if (isDispatcher) cycleVehicleStatus(vehicle);
                                }}
                              >
                                <td className="vehicle-cell">
                                  <span
                                    className="vehicle-thumb"
                                    style={{ background: vehicle.color || '#e8eee8' }}
                                  >
                                    {vehicle.type === 'Truck' ? '▰' : '▱'}
                                  </span>
                                  <span>
                                    {vehicle.name}
                                    <small>{vehicle.plate}</small>
                                  </span>
                                </td>
                                <td>
                                  <span className="driver-cell">
                                    <i className="driver-avatar">{initials(vehicle.driver)}</i>
                                    {vehicle.driver}
                                  </span>
                                </td>
                                <td>
                                  <span className="status-pill table-status">{vehicle.status}</span>
                                </td>
                                <td>
                                  <span className={`fuel-cell ${vehicle.fuel < 40 ? 'low' : ''}`}>
                                    <i className="fuel-track">
                                      <i style={{ width: `${Number(vehicle.fuel) || 0}%` }} />
                                    </i>
                                    <span>{Number(vehicle.fuel) || 0}%</span>
                                  </span>
                                </td>
                                <td className="location-cell">
                                  {vehicle.location}
                                  <small style={{ display: 'block', color: '#7c8880' }}>
                                    {Number(vehicle.speed || 0).toFixed(1)} km/h
                                  </small>
                                </td>
                                <td className="service-date">{vehicle.service}</td>
                                <td>
                                  {isAdmin && (
                                    <button
                                      className="row-menu"
                                      type="button"
                                      data-delete={vehicle.id}
                                      aria-label={`Remove ${vehicle.name}`}
                                      onClick={() => deleteVehicle(vehicle.id)}
                                    >
                                      •••
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="vehicle-footer">
                      <span>
                        Showing {Math.min(5, filteredOverviewVehicles.length)} of{' '}
                        {filteredOverviewVehicles.length} vehicles
                      </span>
                      <a
                        href="#vehicles"
                        onClick={(e) => {
                          e.preventDefault();
                          navigateTo('vehicles');
                        }}
                      >
                        View all vehicles <span>→</span>
                      </a>
                    </div>
                  </section>

                  <footer className="page-footer">
                    <span>© 2026 FleetFlow</span>
                    <span>Built for the people who keep things moving.</span>
                    <span>
                      Made with care <b>♥</b> in Bengaluru
                    </span>
                  </footer>
                </div>
              ) : (
                <div id="subpage-content">
                  <WorkspaceSubpages
                    page={currentPage}
                    state={state}
                    activeUser={activeUser}
                    token={token}
                    wsConnected={wsConnected}
                    wsLog={wsLog}
                    selectedDriverId={selectedDriverId}
                    onSelectDriver={handleOpenDriverProfile}
                    onOpenForm={(kind, vehicleId = '') =>
                      setFormDialog({ open: true, kind, vehicleId })
                    }
                    onCycleVehicleStatus={cycleVehicleStatus}
                    onDeleteVehicle={deleteVehicle}
                    onExportCsv={exportCsv}
                    onRefresh={() => refreshDashboard()}
                    onSettingsUpdated={(updated) =>
                      setState((prev) => ({ ...prev, settings: updated }))
                    }
                    onToast={showToast}
                  />
                </div>
              )}
            </div>
            </WorkspaceErrorBoundary>
          </section>
        </main>
      </div>

      <div className={`toast ${toast ? 'show' : ''}`} role="status">
        {toast}
      </div>

      <RecordFormDialog
        open={formDialog.open}
        kind={formDialog.kind}
        vehicleId={formDialog.vehicleId}
        state={state}
        token={token}
        onClose={() => setFormDialog({ open: false, kind: null, vehicleId: '' })}
        onSuccess={async (kind) => {
          await refreshDashboard();
          if (kind === 'member') setTeamRefreshSignal((s) => s + 1);
        }}
        onToast={showToast}
      />

      <TeamDialog
        open={teamDialogOpen}
        activeUser={activeUser}
        token={token}
        refreshSignal={teamRefreshSignal}
        onClose={() => setTeamDialogOpen(false)}
        onOpenAddMember={() => setFormDialog({ open: true, kind: 'member', vehicleId: '' })}
        onAskConfirm={askConfirm}
        onToast={showToast}
      />

      <ProfileDialog
        open={profileDialogOpen}
        user={activeUser}
        token={token}
        onClose={() => setProfileDialogOpen(false)}
        onUserUpdated={(updatedUser) => {
          setActiveUser(updatedUser);
          refreshDashboard();
        }}
        onRequestSignOut={() => setSignoutDialogOpen(true)}
        onToast={showToast}
      />

      <SignOutDialog
        open={signoutDialogOpen}
        onCancel={() => setSignoutDialogOpen(false)}
        onConfirm={async () => {
          setSignoutDialogOpen(false);
          await signOut();
          showToast('You have signed out safely.');
        }}
      />

      <ConfirmDialog config={confirmState} onResolve={resolveConfirm} />

      <SearchDialog
        open={searchDialogOpen}
        state={state}
        onClose={() => setSearchDialogOpen(false)}
        onSelectPage={navigateTo}
      />
    </>
  );
}
