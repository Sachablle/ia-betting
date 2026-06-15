import { useState, useEffect } from 'react';
import { LEAGUES } from '../utils/fixtures';
import { useFootballFixtures } from '../utils/useFootballFixtures';
import LeagueGroup from '../components/LeagueGroup';
import MatchRow from '../components/MatchRow';
import WorldMap from '../components/WorldMap';

const FINAL_STATUSES = new Set(['STATUS_FULL_TIME', 'STATUS_FINAL', 'STATUS_FT', 'STATUS_AFTER_EXTRA_TIME', 'STATUS_AFTER_PENALTIES']);
const KEEP_MS = 48 * 60 * 60 * 1000;

const normName = s => (s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/^(as |ogc |fc |afc |sc |rc |vfb |vfl |1\. fsv |1\. fc |stade )/i, '')
  .trim();

function TerminesLeagues({ completed }) {
  const [openLeagues, setOpenLeagues] = useState({});
  const toggle = id => setOpenLeagues(s => ({ ...s, [id]: !s[id] }));

  const groups = LEAGUES
    .map(league => ({ league, matches: completed.filter(f => f.league === league.id) }))
    .filter(({ matches }) => matches.length > 0);

  return (
    <div style={{ marginTop: '0.5rem' }}>
      {groups.map(({ league, matches }) => {
        const open = !!openLeagues[league.id];
        return (
          <div key={league.id} style={{ marginBottom: '0.25rem', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <button
              onClick={() => toggle(league.id)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', padding: '0.45rem 0.9rem', background: 'var(--bg-card)', cursor: 'pointer', border: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: 13 }}>{league.flag}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-sub)' }}>{league.name}</span>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99, background: 'rgba(255,255,255,0.08)', color: 'var(--text-dim)' }}>{matches.length}</span>
              </div>
              <svg style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--text-dim)', flexShrink: 0 }} width="9" height="9" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {open && (
              <div className="league-matches matches-compact">
                {matches.map(f => <MatchRow key={f.id} fixture={f} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function FootballPage() {
  const [globeOpen, setGlobeOpen]     = useState(false);
  const [fbScores, setFbScores]       = useState([]);
  const [terminesOpen, setTerminesOpen] = useState(() => sessionStorage.getItem('fb_termines') === 'open');

  useEffect(() => {
    let timer;
    const load = () => {
      fetch('/api/football/scoreboard')
        .then(r => r.json())
        .then(d => {
          const games = d.games || [];
          setFbScores(games);
          const hasLive = games.some(g => g.status === 'STATUS_IN_PROGRESS');
          timer = setTimeout(load, hasLive ? 30_000 : 5 * 60_000);
        })
        .catch(() => { timer = setTimeout(load, 60_000); });
    };
    load();
    return () => clearTimeout(timer);
  }, []);

  const now = new Date();
  const FIXTURES = useFootballFixtures();

  // Injecte les scores ESPN dans les fixtures statiques
  const enriched = FIXTURES.map(f => {
    const espn = fbScores.find(g => {
      if (g.league !== f.league) return false;
      const hn = normName(g.home.name), fn = normName(f.home.name);
      const an = normName(g.away.name), fn2 = normName(f.away.name);
      const homeMatch = hn === fn || hn.includes(fn) || fn.includes(hn);
      const awayMatch = an === fn2 || an.includes(fn2) || fn2.includes(an);
      return homeMatch && awayMatch;
    });
    if (!espn) return f;
    return {
      ...f,
      status: espn.status,
      statusDetail: espn.statusDetail,
      home: { ...f.home, score: espn.home.score },
      away: { ...f.away, score: espn.away.score },
    };
  });

  const isFinal = f => FINAL_STATUSES.has(f.status);

  const upcoming  = enriched.filter(f => !isFinal(f));

  // Terminés = fixtures statiques terminées + tous les matchs ESPN terminés (48h)
  const completedStatic = enriched.filter(f => isFinal(f) && (now - new Date(f.date)) < KEEP_MS);
  const completedEspn   = fbScores
    .filter(g => isFinal(g) && (now - new Date(g.date)) < KEEP_MS)
    .filter(g => !completedStatic.some(f => f.league === g.league &&
      normName(g.home.name) === normName(f.home.name) && normName(g.away.name) === normName(f.away.name)))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(g => ({
      ...g,
      home: { ...g.home, logoId: g.home.logo },
      away: { ...g.away, logoId: g.away.logo },
    }));
  const completed = [...completedStatic, ...completedEspn];

  const toggleTermines = () => setTerminesOpen(o => {
    const next = !o;
    sessionStorage.setItem('fb_termines', next ? 'open' : 'closed');
    return next;
  });

  const leagueGroups = LEAGUES
    .map(league => ({ league, fixtures: upcoming.filter(f => f.league === league.id) }))
    .sort((a, b) => (b.fixtures.length > 0 ? 1 : 0) - (a.fixtures.length > 0 ? 1 : 0));

  return (
    <div className={`page football-page${globeOpen ? ' globe-open' : ''}`}>
      <div className="page-header">
        <div className="football-title-block">
        </div>
      </div>

      <div className="football-top-zone" />


      <div className="matches-column">
        {leagueGroups.map(({ league, fixtures }) => (
          <LeagueGroup key={league.id} leagueId={league.id} fixtures={fixtures} />
        ))}

        {completed.length > 0 && (
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
                <span style={{ fontSize: 9, fontWeight: 800, minWidth: 14, height: 14, borderRadius: 7, background: 'rgba(156,163,175,0.15)', color: '#9ca3af', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{completed.length}</span>
                <svg style={{ transform: terminesOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
            {terminesOpen && (
              <TerminesLeagues completed={completed} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
