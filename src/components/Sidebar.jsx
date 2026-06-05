import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

function countPendingAlerts() {
  const now = Date.now();
  let n = 0;
  try {
    const props = JSON.parse(localStorage.getItem('nba_prop_alerts') || '[]');
    n += props.filter(a => (a.status || 'pending') === 'pending'
      && new Date(a.fixtureDate).getTime() > now
      && ['over','under'].includes(a.direction)).length;
  } catch {}
  try {
    const totals = JSON.parse(localStorage.getItem('nba_game_total_alerts') || '[]');
    n += totals.filter(a => {
      if ((a.status || 'pending') !== 'pending') return false;
      const t = new Date(a.date).getTime();
      return isNaN(t) || t > now;
    }).length;
  } catch {}
  return n;
}

function useAlertCount() {
  const [count, setCount] = useState(() => countPendingAlerts());
  useEffect(() => {
    const sync = () => setCount(countPendingAlerts());
    window.addEventListener('nba_alerts_updated', sync);
    const id = setInterval(sync, 2000);
    return () => { window.removeEventListener('nba_alerts_updated', sync); clearInterval(id); };
  }, []);
  return count;
}

function DatabaseGroup() {
  const location = useLocation();
  const isUnder = location.pathname.startsWith('/database');
  const [open, setOpen] = useState(isUnder);

  return (
    <div className="sidebar-group">
      <button className="sidebar-group-header" onClick={() => setOpen(o => !o)}>
        <span>Data base</span>
        <svg
          className={`sidebar-chevron ${open ? 'open' : ''}`}
          width="12" height="12" viewBox="0 0 12 12" fill="none"
        >
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <div className={`sidebar-group-body ${open ? 'open' : ''}`}>
        <NavLink
          to="/database/effectif"
          className={({ isActive }) => `sidebar-league-item sidebar-sub-link ${isActive ? 'active' : ''}`}
        >
          Effectif
        </NavLink>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const alertCount = useAlertCount();
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-text">Dashboard</span>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/sports" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">🏟️</span>
          Sports
        </NavLink>
        <NavLink to="/placebet" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">🎯</span>
          <span>Alertes</span>
          {alertCount > 0 && (
            <span style={{
              marginLeft: 'auto', minWidth: 18, height: 18, padding: '0 5px',
              borderRadius: 9, background: '#f47c20', color: '#fff',
              fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {alertCount}
            </span>
          )}
        </NavLink>
      </nav>

      <DatabaseGroup />

      <div className="sidebar-bottom">
        <NavLink to="/utilisation" className={({ isActive }) => `sidebar-util-link ${isActive ? 'active' : ''}`} title="Utilisation">
          <svg width="18" height="18" viewBox="0 0 15 15" fill="none">
            <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.2"/>
            <line x1="7.5" y1="6" x2="7.5" y2="11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <circle cx="7.5" cy="4" r="0.8" fill="currentColor"/>
          </svg>
        </NavLink>
      </div>
    </aside>
  );
}
