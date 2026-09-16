import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { preloadPage } from '../App';

function useHasLiveAlerts() {
  const [hasLive, setHasLive] = useState(false);
  useEffect(() => {
    const check = () => {
      // RunningPage écrit '1' si match vraiment en cours, '0' si terminé
      const flag = localStorage.getItem('running_has_live');
      if (flag !== null) { setHasLive(flag === '1'); return; }
      // Fallback si RunningPage pas ouvert : fenêtre 3h sur les alertes acceptées
      try {
        const raw = JSON.parse(localStorage.getItem('nba_prop_alerts') || '[]');
        const now = Date.now();
        const live = raw.some(a =>
          a.status === 'accepted' &&
          a.fixtureDate &&
          new Date(a.fixtureDate).getTime() < now &&
          new Date(a.fixtureDate).getTime() > now - 3 * 3600_000
        );
        setHasLive(live);
      } catch { setHasLive(false); }
    };
    check();
    const t = setInterval(check, 5_000);
    return () => clearInterval(t);
  }, []);
  return hasLive;
}

const NAV_SECTIONS = [
  {
    label: 'Navigation',
    items: [
      { to: '/dashboard',   icon: '◈', label: 'Dashboard',   sub: 'Vue d\'ensemble' },
      { to: '/carte',       icon: '⬡', label: 'Sports',       sub: 'Championnats' },
      { to: '/database/effectif', icon: '▤', label: 'Base de données', sub: 'Championnats' },
    ],
  },
  {
    label: 'Betting',
    items: [
      { to: '/backtesting', icon: '◉', label: 'Backtesting',  sub: 'Statistiques' },
      { to: '/placebet',    icon: '◎', label: 'Alertes',      sub: 'Value bets' },
      { to: '/outrights',   icon: '★', label: 'Outrights',    sub: 'Longterme' },
    ],
  },
];

function AlertesGroup({ alertCounts, isLinkActive }) {
  const location = useLocation();
  const navigate = useNavigate();
  const hasLive = useHasLiveAlerts();
  const isOnAlertes = location.pathname === '/placebet' || location.pathname === '/running';
  const [open, setOpen] = useState(false);

  useEffect(() => { if (hasLive) setOpen(true); }, [hasLive]);
  useEffect(() => { if (!isOnAlertes) setOpen(false); }, [location.pathname]);

  const { total, basket, foot } = alertCounts;
  // Orange = basket (défaut .topbar-badge), vert = foot, dégradé = les deux en attente
  const badgeStyle = basket > 0 && foot > 0
    ? { background: 'linear-gradient(90deg, #f59e0b 50%, #22c55e 50%)' }
    : foot > 0
      ? { background: '#22c55e' }
      : undefined;

  return (
    <div>
      <div
        className={`left-nav-link${isOnAlertes ? ' active' : ''}`}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span
          className="left-nav-name"
          style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, cursor: 'pointer' }}
          onClick={() => navigate('/placebet')}
        >
          Alertes
          {total > 0 && <span className="topbar-badge" style={badgeStyle}>{total}</span>}
          {alertCounts.outright > 0 && <span className="topbar-badge" style={{ background: '#60a5fa' }}>{alertCounts.outright}</span>}
        </span>
        <button
          onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center', color: 'inherit' }}
        >
          <svg style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} width="9" height="9" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
      {open && (
        <div style={{ paddingLeft: '0.75rem' }}>
          <NavLink
            to="/running"
            className={({ isActive }) => `left-nav-link${isActive ? ' active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', flexShrink: 0 }} />
            <span className="left-nav-name" style={{ color: '#60a5fa', fontSize: 12 }}>Running</span>
          </NavLink>
        </div>
      )}
    </div>
  );
}

function SportsGroup({ isLinkActive }) {
  const location = useLocation();
  const isOnSports = location.pathname === '/sports';
  const [open, setOpen] = useState(isOnSports);

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={`left-nav-link${isOnSports ? ' active' : ''}`}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span className="left-nav-name">Sports</span>
        <svg style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} width="9" height="9" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div style={{ paddingLeft: '0.75rem' }}>
          <NavLink to="/sports?sport=football" className={() => `left-nav-link${isLinkActive('/sports?sport=football') ? ' active' : ''}`}>
            <span className="left-nav-name">⚽ Football</span>
          </NavLink>
          <NavLink to="/sports?sport=basketball" className={() => `left-nav-link${isLinkActive('/sports?sport=basketball') ? ' active' : ''}`}>
            <span className="left-nav-name">🏀 Basketball</span>
          </NavLink>
        </div>
      )}
    </div>
  );
}

function AnalyserCards() {
  const navigate = useNavigate();
  const location = useLocation();
  const active = new URLSearchParams(location.search).get('sport');
  const cards = [
    { sport: 'foot',   icon: '⚽', label: 'Paris Foot',       color: '#22c55e' },
    { sport: 'basket', icon: '🏀', label: 'Paris Basketball',  color: '#f97316' },
  ];
  return (
    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '2.5rem' }}>
      {cards.map(c => {
        const isActive = location.pathname === '/analyser' && active === c.sport;
        return (
          <button
            key={c.sport}
            onClick={() => navigate(`/analyser?sport=${c.sport}`)}
            style={{
              position: 'relative', overflow: 'hidden', flex: 1,
              background: isActive ? 'rgba(255,255,255,0.05)' : 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 10, padding: '0.5rem 0.4rem',
              cursor: 'pointer', textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem',
              transition: 'background 0.15s',
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: c.color, borderRadius: '10px 10px 0 0' }} />
            <span style={{ fontSize: 18 }}>{c.icon}</span>
            <span style={{ fontSize: 9, fontWeight: 600, color: isActive ? c.color : 'var(--text-sub)', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
              {c.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function LeftNav({ alertCounts = { total: 0, basket: 0, foot: 0, outright: 0 } }) {
  const location = useLocation();
  const isLinkActive = (to) => {
    const [path, query] = to.split('?');
    // /carte est actif aussi sur les pages match football/basketball
    if (to === '/carte' && (location.pathname.startsWith('/football/') || location.pathname.startsWith('/basketball/'))) return true;
    if (location.pathname !== path) return false;
    if (!query) return true;
    return location.search === '?' + query || location.search.includes(query);
  };
  return (
    <aside className="left-nav">

      {/* Logo */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        padding: '0.5rem 0.5rem 1.5rem',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        marginBottom: 'calc(4.5rem)',
      }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <defs>
            <linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#facc15"/>
              <stop offset="100%" stopColor="#f97316"/>
            </linearGradient>
          </defs>
          {/* ticket — bordure seule */}
          <path d="M3 7 Q3 4 6 4 L22 4 Q25 4 25 7 Q22 7 22 9 Q22 11 25 11 Q25 14 22 14 Q22 16 25 16 Q25 24 22 24 L6 24 Q3 24 3 21 Q6 21 6 19 Q6 17 3 17 Q3 14 6 14 Q6 12 3 12 Q3 9 6 9 Q6 7 3 7Z" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4"/>
          {/* éclair */}
          <path d="M15.5 6.5 L11 15 L14.5 15 L12.5 21.5 L18 13 L14.5 13 Z" fill="url(#tg)" strokeLinejoin="round"/>
        </svg>
        <span className="topbar-logo-text" style={{ letterSpacing: '0.12em', fontStyle: 'italic', marginLeft: '0.1cm', whiteSpace: 'nowrap' }}>IA BETTING</span>
      </div>

      {NAV_SECTIONS.map(section => (
        <div key={section.label} style={{ marginBottom: '3.5rem' }}>
          <div style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.12em', color: '#60a5fa',
            padding: '0 0.5rem', marginBottom: '0.9rem',
          }}>
            {section.label}
          </div>
          {section.items.map(({ to, icon, label, sub }) => {
            if (to === '/sports') return <SportsGroup key={to} isLinkActive={isLinkActive} />;
            if (to === '/placebet') return <AlertesGroup key={to} alertCounts={alertCounts} isLinkActive={isLinkActive} />;
            return (
              <NavLink
                key={to}
                to={to}
                state={to === '/carte' ? { fromNav: true } : undefined}
                className={({ isActive: routerActive }) => `left-nav-link${(routerActive || isLinkActive(to)) ? ' active' : ''}`}
                onMouseEnter={() => preloadPage(to)}
              >
                <span className="left-nav-name" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                  {label}
                </span>
              </NavLink>
            );
          })}
        </div>
      ))}
      {/* Utilisation — bas de nav */}
      <div style={{ marginTop: 'auto', paddingTop: '0.75rem', paddingBottom: '0.3cm', marginRight: '-0.9rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <NavLink
          to="/utilisation"
          title="Utilisation"
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 8,
            color: isActive ? 'var(--green)' : 'rgba(255,255,255,0.3)',
            background: isActive ? 'var(--green-bg)' : 'transparent',
            transition: 'color 0.15s, background 0.15s',
          })}
        >
          <svg width="13" height="13" viewBox="0 0 15 15" fill="none">
            <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.2"/>
            <line x1="7.5" y1="6" x2="7.5" y2="11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <circle cx="7.5" cy="4" r="0.8" fill="currentColor"/>
          </svg>
        </NavLink>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
        {/* Règles du moteur (9 septembre 2026, demande explicite) — même principe que le lien
            Calibration Near-Miss juste après : artifact externe, pas une route interne, lien fixe
            tant que l'artifact est republié sur le même file_path. */}
        <a
          href="https://claude.ai/code/artifact/774719be-da83-4a72-b59b-8382c76d9f5c"
          target="_blank"
          rel="noopener noreferrer"
          title="Règles du moteur"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: 8,
            color: 'rgba(255,255,255,0.3)',
            background: 'transparent',
            transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--green)'; e.currentTarget.style.background = 'var(--green-bg)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M10 12.5A2.5 2.5 0 1 0 10 7.5a2.5 2.5 0 0 0 0 5Z" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10 2.5v1.8M10 15.7v1.8M17.5 10h-1.8M4.3 10H2.5M15.1 4.9l-1.27 1.27M6.16 13.84l-1.27 1.27M15.1 15.1l-1.27-1.27M6.16 6.16 4.9 4.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </a>
        {/* Calibration Near-Miss (3 septembre 2026, demande explicite) — page d'analyse publiée en
            artifact (pas une route interne à l'app), donc lien externe nouvel onglet plutôt qu'un
            NavLink. URL fixe : republier l'artifact avec le même file_path garde ce lien valide. */}
        <a
          href="https://claude.ai/code/artifact/cbca9df2-4675-40f0-bfbb-1155ced8e36b"
          target="_blank"
          rel="noopener noreferrer"
          title="Calibration Near-Miss"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: 8,
            color: 'rgba(255,255,255,0.3)',
            background: 'transparent',
            transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--green)'; e.currentTarget.style.background = 'var(--green-bg)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M2 15 L7 9 L11 12 L18 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="18" cy="4" r="1.8" fill="currentColor"/>
          </svg>
        </a>
      </div>
      </div>
    </aside>
  );
}
