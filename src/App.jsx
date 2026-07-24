import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom';
import LeftNav from './components/LeftNav';
import StarField from './components/StarField';
import DashboardPage from './pages/DashboardPage';
import { syncSettlements, syncBackgroundAlerts, syncGameTotalAlerts, syncBasketballResultAlerts, syncFootballAlerts } from './utils/syncAlerts';
import { loadFromCloud } from './utils/cloudStorage';
import { cachedFetch } from './utils/fetchCache';

const ALERT_KEY = 'nba_prop_alerts';

// Caches par-fixture (proj_/lines_/eu_props_/prob_) qui s'accumulent indéfiniment
// et finissent par remplir le quota localStorage — l'écriture des nouvelles
// alertes échoue alors silencieusement (QuotaExceededError avalée par try/catch).
// Purge automatique au démarrage si le stockage dépasse ~4 Mo : ces caches se
// régénèrent normalement à la prochaine visite de la page du match concerné.
function purgeStaleFixtureCaches() {
  try {
    let total = 0;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      keys.push(k);
      total += (localStorage.getItem(k) || '').length;
    }
    if (total < 1_500_000) return;
    const PREFIXES = ['proj_', 'lines_', 'eu_props_', 'prob_'];
    keys.forEach(k => {
      if (PREFIXES.some(p => k.startsWith(p))) localStorage.removeItem(k);
    });
  } catch {}
}
purgeStaleFixtureCaches();

function purgeAlerts() {
  try {
    const raw = JSON.parse(localStorage.getItem(ALERT_KEY) || '[]');
    const now = Date.now();
    const valid = raw.filter(a => {
      if (!a.player || !a.fixtureDate || !a.stat || a.line == null || !['over','under'].includes(a.direction)) return false;
      const t = new Date(a.fixtureDate).getTime();
      if (isNaN(t)) return false;
      const status = a.status || 'pending';
      if (status === 'pending') return t > now;
      // won/lost/void alimentent l'historique de Backtesting (lecture directe de cette même clé) —
      // ne jamais les purger sur l'âge. Bug trouvé le 6 juillet 2026 : ce filtre stripait localement
      // les résultats basket de plus de 7 jours, puis syncBackgroundAlerts repoussait ce tableau
      // tronqué vers MongoDB, effaçant silencieusement l'historique de backtesting.
      if (['won', 'lost', 'void'].includes(status)) return true;
      return t > now - 7 * 24 * 3600 * 1000;
    });
    if (valid.length !== raw.length) {
      localStorage.setItem(ALERT_KEY, JSON.stringify(valid));
      return true;
    }
  } catch {}
  return false;
}

const FB_ALERT_KEYS = ['fb_btts_alerts', 'fb_total_alerts', 'fb_result_alerts', 'fb_dc_btts_alerts', 'fb_dc_ou_alerts'];
const FB_ALERT_EVENTS = ['fb_btts_alerts_updated', 'fb_total_alerts_updated', 'fb_result_alerts_updated'];

function useAlertCount() {
  const [counts, setCounts] = useState({ total: 0, basket: 0, foot: 0 });
  const refresh = () => {
    let basket = 0;
    try {
      purgeAlerts();
      const raw = JSON.parse(localStorage.getItem(ALERT_KEY) || '[]');
      const now = Date.now();
      // Mirror groupAlerts logic: group by player+date+direction, keep highest status
      // A pending alert is invisible if the same fingerprint has an accepted/rejected version
      const STATUS_RANK = { accepted: 2, rejected: 1, pending: 0 };
      const byKey = {};
      for (const a of raw) {
        if (!a.player || !a.stat || a.line == null || !['over','under'].includes(a.direction)) continue;
        const t = new Date(a.fixtureDate).getTime();
        if (isNaN(t) || t <= now) continue;
        const dateKey = new Date(a.fixtureDate).toISOString().slice(0, 10);
        const key = `${a.player}__${dateKey}__${a.stat}__${a.direction}`;
        const cur = byKey[key];
        const rank = s => STATUS_RANK[s ?? 'pending'] ?? 0;
        if (!cur || rank(a.status) > rank(cur.status)) byKey[key] = a;
      }
      basket = Object.values(byKey).filter(a => (a.status || 'pending') === 'pending').length;
      // nba_game_total_alerts, basketball_result_alerts, basketball_spread_alerts partagent le
      // même format simple (status + date) — basketball_result/spread manquaient ici depuis leur
      // création (19 juin/9 juillet), le badge ne comptait jamais leurs alertes pending (trouvé
      // le 14 juillet sur une alerte spread Écart H2H invisible dans le badge).
      ['nba_game_total_alerts', 'basketball_result_alerts', 'basketball_spread_alerts'].forEach(key => {
        try {
          const arr = JSON.parse(localStorage.getItem(key) || '[]');
          basket += arr.filter(a => {
            if ((a.status || 'pending') !== 'pending') return false;
            const t = new Date(a.date).getTime();
            return isNaN(t) || t > now;
          }).length;
        } catch {}
      });
    } catch { basket = 0; }

    let foot = 0;
    try {
      const now = Date.now();
      FB_ALERT_KEYS.forEach(key => {
        const raw = JSON.parse(localStorage.getItem(key) || '[]');
        foot += raw.filter(a => {
          if ((a.status || 'pending') !== 'pending') return false;
          const t = new Date(a.fixtureDate).getTime();
          if (isNaN(t)) return false;
          return t > now;
        }).length;
      });
    } catch {}

    setCounts({ total: basket + foot, basket, foot });
  };
  useEffect(() => {
    refresh();
    window.addEventListener('nba_alerts_updated', refresh);
    FB_ALERT_EVENTS.forEach(e => window.addEventListener(e, refresh));
    const tick = setInterval(refresh, 60_000);

    const syncAll = () => {
      syncSettlements();
      syncBackgroundAlerts();
      syncGameTotalAlerts();
      syncBasketballResultAlerts();
      syncFootballAlerts();
    };

    const cloudSync = () => loadFromCloud().then(() => { refresh(); syncAll(); window.dispatchEvent(new Event('cloud_synced')); });
    cloudSync();

    // SSE : dès qu'un autre appareil modifie MongoDB, on recharge immédiatement. Garde-fou anti-
    // boucle (12 juillet 2026) : une écriture locale (ex. accepter une alerte) peut elle-même
    // déclencher ce SSE en écho — sans throttle, ça repart en cloudSync → syncBackgroundAlerts →
    // dispatch 'nba_alerts_updated' → enrichUnibet → écriture → SSE → cloudSync → ... en boucle
    // quasi immédiate, saturant le thread JS (app qui semble figée, plus aucun clic ne répond —
    // incident constaté sur l'acceptation d'une alerte props WNBA). Un SSE qui arrive à moins de
    // 3s du précédent est ignoré : la synchro suivante (tick 2min, ou le prochain vrai événement
    // distant) rattrapera de toute façon l'état.
    const es = new EventSource('/api/sync-events');
    let lastSseSync = 0;
    es.onmessage = () => {
      const now = Date.now();
      if (now - lastSseSync < 3000) return;
      lastSseSync = now;
      cloudSync();
    };

    const syncTick = setInterval(cloudSync, 2 * 60_000);

    // Resynchro à la reprise de focus (20 juillet 2026) — les navigateurs (Safari en particulier)
    // suspendent ou ralentissent fortement les timers d'un onglet/fenêtre resté en arrière-plan
    // pendant longtemps, donc le syncTick 2min peut ne quasiment jamais se déclencher tant que la
    // fenêtre n'est pas au premier plan. Sans ça, un onglet longtemps délaissé restait figé sur un
    // état périmé (ex: statut "accepted" alors que déjà réglé void côté serveur, cas récurrent
    // Jessica Shepard) jusqu'à un rechargement manuel — même throttle 3s que le SSE pour éviter un
    // appel en double si le focus revient juste après un cycle déjà en cours.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastSseSync < 3000) return;
      lastSseSync = now;
      cloudSync();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      window.removeEventListener('nba_alerts_updated', refresh);
      FB_ALERT_EVENTS.forEach(e => window.removeEventListener(e, refresh));
      clearInterval(tick);
      clearInterval(syncTick);
      es.close();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);
  return counts;
}

const importMatchDetail     = () => import('./pages/MatchDetailPage');
const importBasketballDetail = () => import('./pages/BasketballDetailPage');
const importMlbDetail       = () => import('./pages/MlbDetailPage');
const importPlaceBet        = () => import('./pages/PlaceBetPage');
const importRunning         = () => import('./pages/RunningPage');
const importBacktesting     = () => import('./pages/BacktestingPage');
const importWorldMap        = () => import('./pages/WorldMapPage');
const importDatabaseMap     = () => import('./pages/DatabaseMapPage');
const importPlayerLines     = () => import('./pages/PlayerLinesPage');
const importOutrights       = () => import('./pages/OutrightsPage');

const MatchDetailPage      = lazy(importMatchDetail);
const BasketballDetailPage = lazy(importBasketballDetail);
const MlbDetailPage        = lazy(importMlbDetail);
const PlaceBetPage         = lazy(importPlaceBet);
const RunningPage          = lazy(importRunning);
const BacktestingPage      = lazy(importBacktesting);
const WorldMapPage         = lazy(importWorldMap);
const DatabaseMapPage      = lazy(importDatabaseMap);
const PlayerLinesPage      = lazy(importPlayerLines);
const OutrightsPage        = lazy(importOutrights);
const UtilisationPage      = lazy(() => import('./pages/UtilisationPage'));
const AnalyserPage         = lazy(() => import('./pages/AnalyserPage'));
const SportsPage           = lazy(() => import('./pages/SportsPage'));

// Précharge les pages les plus visitées dès que le navigateur est idle

if (typeof requestIdleCallback !== 'undefined') {
  requestIdleCallback(() => {
    importPlaceBet(); importRunning(); importBacktesting(); importWorldMap();
    importDatabaseMap(); importOutrights(); importMatchDetail(); importBasketballDetail();
  });
}

function BasketballDetailRoute() {
  const { id } = useParams();
  return <BasketballDetailPage key={id} />;
}

function PlayerLinesRoute() {
  const { id, playerName } = useParams();
  return <PlayerLinesPage key={`${id}_${playerName}`} />;
}

// Préchargement au survol d'un lien
export function preloadPage(path) {
  if (path.includes('placebet'))   importPlaceBet();
  else if (path.includes('running'))    importRunning();
  else if (path.includes('backtesting')) importBacktesting();
  else if (path.includes('carte'))      importWorldMap();
  else if (path.includes('effectif'))   importDatabaseMap();
  else if (path.includes('/player/'))   importPlayerLines();
  else if (path.includes('outrights'))  importOutrights();
  else if (path.includes('basketball')) importBasketballDetail();
  else if (path.includes('football'))   importMatchDetail();
}

function PageLoader() {
  return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.08)', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
    </div>
  );
}

function StatsHolo() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (location.pathname !== '/analyser') return null;

  const options = [
    { sport: 'foot',   label: 'Football',   color: '#15803d', bar: 'linear-gradient(90deg,#15803d,#16a34a)' },
    { sport: 'basket', label: 'Basketball', color: '#c2731a', bar: 'linear-gradient(90deg,#c2731a,#d97706)' },
  ];

  return (
    <div ref={ref} style={{ position: 'fixed', top: '5.25rem', right: '1.5rem', zIndex: 9999 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Stats avancées"
        style={{
          width: 38, height: 38, borderRadius: 10,
          background: open ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${open ? '#60a5fa' : 'rgba(255,255,255,0.2)'}`,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(8px)', transition: 'all 0.2s',
          boxShadow: open ? '0 0 16px rgba(96,165,250,0.25)' : 'none',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <rect x="2" y="12" width="3" height="6" rx="1" fill={open ? '#60a5fa' : '#ffffff'}/>
          <rect x="8.5" y="7" width="3" height="11" rx="1" fill={open ? '#60a5fa' : '#ffffff'}/>
          <rect x="15" y="3" width="3" height="15" rx="1" fill={open ? '#60a5fa' : '#ffffff'}/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 0, right: 46,
          background: 'rgba(10,15,30,0.75)',
          backdropFilter: 'blur(24px)',
          border: 'none',
          borderRadius: 14, padding: '0.5rem',
          display: 'flex', flexDirection: 'column', gap: '0.5rem',
          minWidth: 160,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          animation: 'holoIn 0.18s ease',
        }}>
          {options.map(o => (
            <button key={o.sport} onClick={() => { navigate(`/analyser?sport=${o.sport}`); setOpen(false); }} style={{
              background: 'transparent',
              border: `1px solid ${o.color}`,
              borderRadius: 8, padding: '0.35rem 0.65rem',
              cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity='0.75'}
            onMouseLeave={e => e.currentTarget.style.opacity='1'}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: o.color }}>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// Warm-up backend au démarrage — déclenche les premiers fetches en parallèle
// pour que les caches backend soient chauds avant le 1er clic utilisateur.
const _STARTUP_WARMED = { done: false };
function _warmupOnStartup() {
  if (_STARTUP_WARMED.done) return;
  _STARTUP_WARMED.done = true;
  // Endpoints les plus demandés — ne consomme pas de quotas API (ESPN + foot-data.org cachés 30min)
  cachedFetch('/api/nba/scoreboard', 20_000).catch(() => {});
  cachedFetch('/api/wnba/scoreboard', 20_000).catch(() => {});
  cachedFetch('/api/fd/worldcup', 30_000).catch(() => {});
  cachedFetch('/api/fd/matches', 30_000).catch(() => {});
  cachedFetch('/api/odds', 30_000).catch(() => {});
  cachedFetch('/api/nba/standings', 6 * 3_600_000).catch(() => {});
  cachedFetch('/api/wnba/standings', 6 * 3_600_000).catch(() => {});
}

export default function App() {
  const alertCounts = useAlertCount();
  useEffect(() => { _warmupOnStartup(); }, []);
  return (
    <BrowserRouter>
      <ScrollToTop />
      <div className="app-layout">
        <StarField />
        <StatsHolo />
        <div className="app-body">
        <LeftNav alertCounts={alertCounts} />
        <main className="app-main" style={{ paddingTop: '4.5rem' }}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/sports" element={<Navigate to="/carte" replace />} />
              <Route path="/football/:id" element={<MatchDetailPage />} />
              <Route path="/mlb/:id" element={<MlbDetailPage />} />
              <Route path="/basketball/:id" element={<BasketballDetailRoute />} />
              <Route path="/basketball/:id/player/:playerName" element={<PlayerLinesRoute />} />
              <Route path="/placebet" element={<PlaceBetPage />} />
              <Route path="/running" element={<RunningPage />} />
              <Route path="/analyser" element={<Navigate to="/backtesting" replace />} />
              <Route path="/database/effectif" element={<DatabaseMapPage />} />
              <Route path="/utilisation" element={<UtilisationPage />} />
              <Route path="/backtesting" element={<BacktestingPage />} />
              <Route path="/outrights" element={<OutrightsPage />} />
              <Route path="/carte" element={<WorldMapPage />} />
            </Routes>
          </Suspense>
        </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

