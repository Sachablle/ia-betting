import { useState, useEffect } from 'react';
import { useFixtures } from '../utils/useFixtures';
import USMap from '../components/USMap';
import BasketballMatchRow from '../components/BasketballMatchRow';
import BasketballLeagueGroup from '../components/BasketballLeagueGroup';
import { cachedFetch } from '../utils/fetchCache';

function WNBALeagueGroup({ games, loading }) {
  const [collapsed, setCollapsed] = useState(() => sessionStorage.getItem('league_open_wnba') !== 'open');
  const toggle = () => setCollapsed(c => { const next = !c; sessionStorage.setItem('league_open_wnba', next ? 'closed' : 'open'); return next; });
  return (
    <section className="league-group" style={{ borderRadius: 10, overflow: 'hidden', marginBottom: '1.5rem', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #e11d48 0%, transparent 100%)' }} />
      <div className="league-header">
      <button className="league-header-toggle" onClick={toggle}>
        <div className="league-header-left">
          <img src="https://cdn.nba.com/logos/leagues/logo-wnba.svg" alt="WNBA" className="league-flag" style={{ width: 26, height: 26, objectFit: 'contain' }} onError={e => { e.target.style.display='none'; }} />
          <span className="league-name">WNBA</span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }}>USA</span>
        </div>
        <div className="league-header-right">
          <span className={`league-chevron ${collapsed ? '' : 'open'}`}>▾</span>
        </div>
      </button>
      </div>
      {!collapsed && (
        <div className="league-matches">
          {loading && <div className="match-loading">Chargement…</div>}
          {!loading && games.length === 0 && <div className="match-loading">Aucun match dans les 4 prochains jours.</div>}
          {games.map(g => <BasketballMatchRow key={g.id} fixture={g} />)}
        </div>
      )}
    </section>
  );
}

function NBALeagueGroup({ games, loading }) {
  const [collapsed, setCollapsed] = useState(() => sessionStorage.getItem('league_open_nba') !== 'open');
  const toggle = () => setCollapsed(c => { const next = !c; sessionStorage.setItem('league_open_nba', next ? 'closed' : 'open'); return next; });
  return (
    <section className="league-group" style={{ borderRadius: 10, overflow: 'hidden', marginBottom: '1.5rem', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #c9082a 0%, transparent 100%)' }} />
      <div className="league-header">
      <button className="league-header-toggle" onClick={toggle}>
        <div className="league-header-left">
          <img src="https://cdn.nba.com/logos/leagues/logo-nba.svg" alt="NBA" className="league-flag" style={{ width: 26, height: 26, objectFit: 'contain' }} />
          <span className="league-name">NBA</span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }}>USA</span>
        </div>
        <div className="league-header-right">
          <span className={`league-chevron ${collapsed ? '' : 'open'}`}>▾</span>
        </div>
      </button>
      </div>
      {!collapsed && (
        <div className="league-matches">
          {loading && <div className="match-loading">Chargement…</div>}
          {!loading && games.length === 0 && <div className="match-loading">Aucun match dans les 4 prochains jours.</div>}
          {games.map(g => <BasketballMatchRow key={g.id} fixture={g} />)}
        </div>
      )}
    </section>
  );
}

const EURO_LEAGUES = ['acb', 'lnb', 'bbl', 'legaa'];

function useEuroGames(leagueId) {
  const [games, setGames]     = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let timer;
    const load = () => {
      cachedFetch(`/api/euro/${leagueId}/scoreboard`, 20_000)
        .then(d => {
          setGames(d.games || []);
          setLoading(false);
          const hasLive = (d.games || []).some(g => g.status === 'STATUS_IN_PROGRESS');
          timer = setTimeout(load, hasLive ? 30_000 : 5 * 60_000);
        })
        .catch(() => { setLoading(false); timer = setTimeout(load, 60_000); });
    };
    load();
    return () => clearTimeout(timer);
  }, [leagueId]);
  return { games, loading };
}

function EuroLeagueGroup({ leagueId, games, loading }) {
  const { BBALL_LEAGUES } = { BBALL_LEAGUES: [
    { id: 'acb',   name: 'ACB',           flag: '🇪🇸', accent: '#c60b1e' },
    { id: 'lnb',   name: 'Betclic Élite', flag: '🇫🇷', accent: '#002395' },
    { id: 'bbl',   name: 'BBL',           flag: '🇩🇪', accent: '#333333' },
    { id: 'legaa', name: 'Lega A',        flag: '🇮🇹', accent: '#009246' },
  ]};
  const cfg = BBALL_LEAGUES.find(l => l.id === leagueId) || {};
  const [collapsed, setCollapsed] = useState(() => sessionStorage.getItem(`league_open_${leagueId}`) === 'closed');
  const toggle = () => setCollapsed(c => { const next = !c; sessionStorage.setItem(`league_open_${leagueId}`, next ? 'closed' : 'open'); return next; });
  const now = new Date();
  const filtered = games.filter(g =>
    g.status !== 'STATUS_FINAL' && (new Date(g.date) - now) < 5 * 24 * 3600_000
  );
  return (
    <section className="league-group" style={{ borderRadius: 10, overflow: 'hidden', marginBottom: '1.5rem', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${cfg.accent} 0%, transparent 100%)` }} />
      <div className="league-header">
        <button className="league-header-toggle" onClick={toggle}>
          <div className="league-header-left">
            <span style={{ fontSize: 22 }}>{cfg.flag}</span>
            <span className="league-name">{cfg.name}</span>
          </div>
          <div className="league-header-right">
            <span className={`league-chevron ${collapsed ? '' : 'open'}`}>▾</span>
          </div>
        </button>
      </div>
      {!collapsed && (
        <div className="league-matches">
          {loading && <div className="match-loading">Chargement…</div>}
          {!loading && filtered.length === 0 && <div className="match-loading">Aucun match dans les 5 prochains jours.</div>}
          {filtered.map(g => <BasketballMatchRow key={g.id} fixture={{ ...g, league: leagueId }} />)}
        </div>
      )}
    </section>
  );
}

export default function BasketballPage() {
  const [globeOpen, setGlobeOpen] = useState(false);
  const [games, setGames]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [wnbaGames, setWnbaGames] = useState([]);
  const [wnbaLoading, setWnbaLoading] = useState(true);
  const [elScores, setElScores]   = useState({});
  const fixtures = useFixtures();
  const acb   = useEuroGames('acb');
  const lnb   = useEuroGames('lnb');
  const bbl   = useEuroGames('bbl');
  const legaa = useEuroGames('legaa');

  useEffect(() => {
    let timer;
    const load = () => {
      cachedFetch('/api/nba/scoreboard', 20_000)
        .then(d => {
          const gs = d.games || [];
          setGames(gs);
          setLoading(false);
          const hasLive = gs.some(g => g.status === 'STATUS_IN_PROGRESS');
          timer = setTimeout(load, hasLive ? 30_000 : 5 * 60_000);
        })
        .catch(() => { setLoading(false); timer = setTimeout(load, 60_000); });
    };
    load();
    return () => clearTimeout(timer);
  }, []);

  // WNBA live scoreboard
  useEffect(() => {
    let timer;
    const load = () => {
      cachedFetch('/api/wnba/scoreboard', 20_000)
        .then(d => {
          const gs = d.games || [];
          setWnbaGames(gs);
          setWnbaLoading(false);
          const hasLive = gs.some(g => g.status === 'STATUS_IN_PROGRESS');
          timer = setTimeout(load, hasLive ? 30_000 : 5 * 60_000);
        })
        .catch(() => { setWnbaLoading(false); timer = setTimeout(load, 60_000); });
    };
    load();
    return () => clearTimeout(timer);
  }, []);

  // Scores live Euroleague via API officielle
  useEffect(() => {
    let timer;
    const loadEl = () => {
      cachedFetch('/api/euroleague/scoreboard', 20_000)
        .then(d => {
          const map = {};
          for (const g of d.games || []) {
            map[g.gameCode] = g;
          }
          setElScores(map);
          const hasLive = (d.games || []).some(g => g.status === 'STATUS_IN_PROGRESS');
          timer = setTimeout(loadEl, hasLive ? 30_000 : 5 * 60_000);
        })
        .catch(() => { timer = setTimeout(loadEl, 60_000); });
    };
    loadEl();
    return () => clearTimeout(timer);
  }, []);


  const now = new Date();
  const KEEP_MS     = 48 * 60 * 60 * 1000;
  const UPCOMING_MS =  5 * 24 * 60 * 60 * 1000;

  const allNba = [...games]
    .filter(g => {
      if (g.home.name === 'TBD' || g.away.name === 'TBD') return false;
      const done = g.status === 'STATUS_FINAL';
      if (done) return (now - new Date(g.date)) < KEEP_MS;
      if (g.status === 'STATUS_SCHEDULED') return (new Date(g.date) - now) < UPCOMING_MS;
      return true;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const nbaUpcoming  = allNba.filter(g => g.status !== 'STATUS_FINAL');
  const nbaCompleted = allNba.filter(g => g.status === 'STATUS_FINAL');

  const allWnba = [...wnbaGames]
    .filter(g => {
      if (g.home.name === 'TBD' || g.away.name === 'TBD') return false;
      const done = g.status === 'STATUS_FINAL';
      if (done) return (now - new Date(g.date)) < KEEP_MS;
      if (g.status === 'STATUS_SCHEDULED') return (new Date(g.date) - now) < KEEP_MS;
      return true;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const wnbaUpcoming  = allWnba.filter(g => g.status !== 'STATUS_FINAL');
  const wnbaCompleted = allWnba.filter(g => g.status === 'STATUS_FINAL');

  const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000; // 3h fenêtre live Euroleague

  const isElDone = (f) => f.round?.includes('Terminé') || (now - new Date(f.date)) > LIVE_WINDOW_MS;

  // Merge scores live depuis l'API EL dans les fixtures statiques
  const withElScore = (f) => {
    const live = f.elGameCode ? elScores[f.elGameCode] : null;
    if (!live) return f;
    return {
      ...f,
      home: { ...f.home, score: live.localScore },
      away: { ...f.away, score: live.roadScore },
      status: live.status,
    };
  };

  const allEl = fixtures
    .filter(f => f.league === 'euroleague')
    .filter(f => !isElDone(f) || (now - new Date(f.date)) < KEEP_MS)
    .map(withElScore)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const elUpcoming  = allEl.filter(f => !isElDone(f));
  const elCompleted = allEl.filter(f =>  isElDone(f));

  const acbCompleted   = acb.games.filter(g => g.status === 'STATUS_FINAL' && (now - new Date(g.date)) < KEEP_MS).map(g => ({ ...g, league: 'acb' }));
  const lnbCompleted   = lnb.games.filter(g => g.status === 'STATUS_FINAL' && (now - new Date(g.date)) < KEEP_MS).map(g => ({ ...g, league: 'lnb' }));
  const bblCompleted   = bbl.games.filter(g => g.status === 'STATUS_FINAL' && (now - new Date(g.date)) < KEEP_MS).map(g => ({ ...g, league: 'bbl' }));
  const legaaCompleted = legaa.games.filter(g => g.status === 'STATUS_FINAL' && (now - new Date(g.date)) < KEEP_MS).map(g => ({ ...g, league: 'legaa' }));
  const euroCompleted  = [...acbCompleted, ...lnbCompleted, ...bblCompleted, ...legaaCompleted].sort((a, b) => new Date(b.date) - new Date(a.date));

  const euroTotal = [...acb.games, ...lnb.games, ...bbl.games, ...legaa.games].filter(g => g.status !== 'STATUS_FINAL').length;
  const totalUpcoming  = nbaUpcoming.length + wnbaUpcoming.length + elUpcoming.length + euroTotal;
  const totalCompleted = nbaCompleted.length + wnbaCompleted.length + elCompleted.length + euroCompleted.length;

  const [terminesOpen, setTerminesOpen] = useState(() => sessionStorage.getItem('league_open_termines') === 'open');
  const toggleTermines = () => setTerminesOpen(o => {
    const next = !o;
    sessionStorage.setItem('league_open_termines', next ? 'open' : 'closed');
    return next;
  });

  return (
    <div className={`page basketball-page${globeOpen ? ' globe-open' : ''}`}>
      <div className="page-header">
        <div className="basketball-title-block">
        </div>
      </div>

      <div className="basketball-top-zone" />


      <div className="matches-column">
        <NBALeagueGroup games={nbaUpcoming} loading={loading} />
        <WNBALeagueGroup games={wnbaUpcoming} loading={wnbaLoading} />
        <BasketballLeagueGroup leagueId="euroleague" fixtures={elUpcoming} />
        <EuroLeagueGroup leagueId="acb"   games={acb.games}   loading={acb.loading}   />
        <EuroLeagueGroup leagueId="lnb"   games={lnb.games}   loading={lnb.loading}   />
        <EuroLeagueGroup leagueId="bbl"   games={bbl.games}   loading={bbl.loading}   />
        <EuroLeagueGroup leagueId="legaa" games={legaa.games} loading={legaa.loading} />

        {/* ── TERMINÉS ── */}
        {totalCompleted > 0 && (
          <>
            <div style={{ marginTop: 'calc(1.5rem - 0.5cm)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={toggleTermines}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.35rem 0.75rem', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  border: terminesOpen ? '1px solid rgba(156,163,175,0.6)' : '1px solid var(--border)',
                  background: terminesOpen ? 'rgba(156,163,175,0.1)' : 'transparent',
                  color: terminesOpen ? '#9ca3af' : 'var(--text-dim)',
                }}
              >
                Terminés
                <span style={{ fontSize: 9, fontWeight: 800, minWidth: 14, height: 14, borderRadius: 7, background: 'rgba(156,163,175,0.15)', color: '#9ca3af', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{totalCompleted}</span>
                <svg style={{ transform: terminesOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
            {terminesOpen && (
              <div className="league-matches matches-compact" style={{ marginTop: '0.5rem' }}>
                {nbaCompleted.map(g => <BasketballMatchRow key={g.id} fixture={g} />)}
                {wnbaCompleted.map(g => <BasketballMatchRow key={g.id} fixture={g} />)}
                {elCompleted.map(f => <BasketballMatchRow key={f.id} fixture={f} />)}
                {euroCompleted.map(g => <BasketballMatchRow key={g.id} fixture={g} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
