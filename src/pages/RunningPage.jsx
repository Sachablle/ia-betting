import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BBALL_FIXTURES } from '../utils/basketball';

const ALERT_KEY      = 'nba_prop_alerts';
const GAME_TOTAL_KEY = 'nba_game_total_alerts';
const STAT_LABEL     = { pts: 'Pts', reb: 'Reb', ast: 'Ast' };

// ── Groupement alertes ────────────────────────────────────────────────────────
function groupAlerts(raw) {
  const map = {};
  for (const a of raw) {
    const dateKey = new Date(a.fixtureDate).toISOString().slice(0, 10);
    const key = `${a.player}__${dateKey}__${a.stat}__${a.direction}`;
    if (!map[key]) {
      map[key] = {
        key, player: a.player, team: a.team, fixture: a.fixture,
        fixtureDate: a.fixtureDate, homeTeam: a.homeTeam || null,
        awayTeam: a.awayTeam || null, homeShort: a.homeShort || null,
        awayShort: a.awayShort || null, eventId: a.eventId || null,
        league: a.league || 'nba', stats: [], maxProb: 0, ids: [],
        status: a.status || 'pending', acceptedAt: 0,
        acceptedBookmaker: a.acceptedBookmaker || null,
      };
    }
    const entry = {
      stat: a.stat, direction: a.direction, line: a.line,
      estimate: a.estimate, probability: a.probability,
      unibetOdds: a.unibetOdds, betclicOdds: a.betclicOdds, winamaxOdds: a.winamaxOdds,
      acceptedUnibetOdds: a.acceptedUnibetOdds ?? null,
      acceptedBetclicOdds: a.acceptedBetclicOdds ?? null,
      acceptedWinamaxOdds: a.acceptedWinamaxOdds ?? null,
    };
    if (!map[key].stats.find(s => `${s.stat}__${s.direction}` === `${a.stat}__${a.direction}`))
      map[key].stats.push(entry);
    map[key].maxProb = Math.max(map[key].maxProb, a.probability || 0);
    map[key].ids.push(a.id);
    if (a.acceptedAt) map[key].acceptedAt = Math.max(map[key].acceptedAt, a.acceptedAt);
    if (a.acceptedBookmaker && !map[key].acceptedBookmaker) map[key].acceptedBookmaker = a.acceptedBookmaker;
  }
  return Object.values(map);
}

// Normalise les abréviations ESPN courtes → standard NBA
const ESPN_NORM = { SA:'SAS', NY:'NYK', GS:'GSW', NO:'NOP', UT:'UTA', LA:'LAC' };
const normShort = s => { const u = (s||'').toUpperCase(); return ESPN_NORM[u] || u; };
const normTeam  = s => (s||'').toLowerCase().replace(/[^a-z]/g,'');

// Regroupe les alertes par match
function groupByMatch(acceptedGroups) {
  const map = {};
  for (const g of acceptedGroups) {
    // Clé normalisée : noms d'équipes lowercased pour absorber SAS/SA, NYK/NY, etc.
    const homeKey = normTeam(g.homeTeam) || normShort(g.homeShort);
    const awayKey = normTeam(g.awayTeam) || normShort(g.awayShort);
    const mk = `${homeKey}__${awayKey}__${(g.fixtureDate||'').slice(0,10)}`;
    if (!map[mk]) map[mk] = {
      matchKey: mk, league: g.league,
      homeShort: normShort(g.homeShort), awayShort: normShort(g.awayShort),
      homeTeam: g.homeTeam, awayTeam: g.awayTeam,
      fixtureDate: g.fixtureDate, eventId: g.eventId, alerts: [],
    };
    map[mk].alerts.push(g);
    // Garder l'eventId le plus récent/valide
    if (g.eventId && !map[mk].eventId) map[mk].eventId = g.eventId;
  }
  return Object.values(map).sort((a, b) => new Date(a.fixtureDate) - new Date(b.fixtureDate));
}

// ── Hook scores live ──────────────────────────────────────────────────────────
function useLiveScores(matchGroups) {
  const [scores, setScores] = useState({});
  const timerRef = useRef(null);

  useEffect(() => {
    if (!matchGroups.length) { setScores({}); return; }

    const doFetch = async () => {
      const result = {};
      const byLeague = {};
      for (const m of matchGroups) {
        if (!byLeague[m.league]) byLeague[m.league] = [];
        byLeague[m.league].push(m);
      }

      for (const [league, matches] of Object.entries(byLeague)) {
        try {
          const EU = ['acb','lnb','bbl','legaa'];
          const url = league === 'wnba' ? '/api/wnba/scoreboard'
            : EU.includes(league) ? `/api/euro/${league}/scoreboard`
            : '/api/nba/scoreboard';
          const d = await fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
          const games = d?.games || [];
          for (const m of matches) {
            const g = games.find(g => {
              const norm = s => (s||'').toLowerCase().replace(/[^a-z]/g,'');
              return (norm(g.home?.short) === norm(m.homeShort) || norm(g.home?.name).includes(norm(m.homeTeam||'').slice(0,4)))
                  && (norm(g.away?.short) === norm(m.awayShort) || norm(g.away?.name).includes(norm(m.awayTeam||'').slice(0,4)));
            });
            if (g) result[m.matchKey] = {
              homeScore: g.home?.score ?? null,
              awayScore: g.away?.score ?? null,
              homeLogo: g.home?.logo || null,
              awayLogo: g.away?.logo || null,
              status: g.status,
              statusDetail: g.statusDetail || '',
            };
          }
        } catch {}
      }
      setScores(result);
    };

    doFetch();
    timerRef.current = setInterval(doFetch, 30_000);
    return () => clearInterval(timerRef.current);
  }, [matchGroups.map(m => m.matchKey).join(',')]);

  return scores;
}

// ── Hook stats joueurs live ───────────────────────────────────────────────────
function useLiveBoxscore(acceptedGroups) {
  const [liveStats, setLiveStats] = useState({});
  const NBA_WNBA = new Set(['nba', 'wnba']);
  const keys = acceptedGroups.filter(g => NBA_WNBA.has(g.league)).map(g => g.key).join(',');

  useEffect(() => {
    const now = Date.now();
    const active = acceptedGroups.filter(g => {
      if (!NBA_WNBA.has(g.league)) return false;
      const t = new Date(g.fixtureDate).getTime();
      return t > 0 && now > t - 3600_000 && now < t + 6 * 3600_000;
    });
    if (!active.length) { setLiveStats({}); return; }

    const doFetch = async () => {
      const result = {};
      const byMatch = {};
      for (const g of active) {
        const mk = `${g.homeShort||''}__${g.awayShort||''}`;
        if (!byMatch[mk]) byMatch[mk] = { ...g, alerts: [] };
        byMatch[mk].alerts.push(g);
      }
      for (const match of Object.values(byMatch)) {
        try {
          const base = match.league === 'wnba' ? '/api/wnba' : '/api/nba';
          const bs = await fetch(`${base}/boxscore?date=${encodeURIComponent(match.fixtureDate)}&home=${match.homeShort}&away=${match.awayShort}`)
            .then(r => r.ok ? r.json() : null).catch(() => null);
          if (!bs || bs.error) continue;
          const allPlayers = Object.entries(bs)
            .filter(([k]) => !['gameId','status','homeScore','awayScore','error'].includes(k))
            .flatMap(([,ps]) => ps || []);
          const ln = n => n?.split(' ').pop()?.toLowerCase();
          for (const g of match.alerts) {
            const p = allPlayers.find(p => p.name === g.player || ln(p.name) === ln(g.player));
            if (p?.stats) result[g.key] = p.stats;
          }
        } catch {}
      }
      setLiveStats(result);
    };

    doFetch();
    const t = setInterval(doFetch, 30_000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  return liveStats;
}

// ── Statut match ──────────────────────────────────────────────────────────────
function MatchStatusBadge({ scoreData }) {
  if (!scoreData) return null;
  const { status, statusDetail, homeScore, awayScore } = scoreData;
  const isLive = status === 'STATUS_IN_PROGRESS';
  const isDone = status === 'STATUS_FINAL';

  const label = isDone ? 'Terminé'
    : isLive ? (statusDetail || 'Live')
    : 'À venir';

  const color = isDone ? '#4ade80' : isLive ? '#f97316' : 'var(--text-dim)';
  const bg    = isDone ? 'rgba(74,222,128,0.1)' : isLive ? 'rgba(249,115,22,0.1)' : 'rgba(255,255,255,0.05)';

  return (
    <span style={{ fontSize: 9, fontWeight: 700, color, background: bg, border: `1px solid ${color}44`, borderRadius: 4, padding: '1px 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
      {isLive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f97316', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />}
      {label}
    </span>
  );
}

// ── Stat live joueur ──────────────────────────────────────────────────────────
function LiveStatRow({ group, playerStats }) {
  if (!playerStats || !group.stats?.length) return null;
  const s = group.stats[0];
  if (!s?.stat || s.line == null) return null;
  const val = playerStats[s.stat];
  if (val == null) return null;
  const onTrack = s.direction === 'over' ? val >= s.line : val <= s.line;
  const c = onTrack ? '#4ade80' : '#f87171';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.1rem 0.75rem 0.25rem', fontSize: 10 }}>
      <span style={{ color: 'var(--text-dim)' }}>📊 {STAT_LABEL[s.stat]} :</span>
      <span style={{ fontWeight: 800, color: c }}>{val} / {s.line}</span>
      <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: c, padding: '1px 5px', borderRadius: 3, background: `${c}15`, border: `1px solid ${c}44` }}>
        {onTrack ? 'ON TRACK ✓' : 'AT RISK ✗'}
      </span>
    </div>
  );
}

// ── Carte alerte joueur ───────────────────────────────────────────────────────
function AlertCard({ group, playerStats, onDismiss }) {
  const navigate = useNavigate();
  const s = group.stats[0];
  const bk = group.acceptedBookmaker;
  const acceptedOdds = bk === 'unibet' ? (s?.acceptedUnibetOdds ?? s?.unibetOdds)
    : bk === 'betclic' ? (s?.acceptedBetclicOdds ?? s?.betclicOdds)
    : bk === 'winamax' ? (s?.acceptedWinamaxOdds ?? s?.winamaxOdds) : null;
  const bkColor = bk === 'unibet' ? '#1db954' : bk === 'betclic' ? '#e0292e' : '#e5e7eb';

  const goToMatch = () => {
    const EU = ['acb','lnb','bbl','legaa'];
    // Résoudre l'ID statique si eventId ESPN ne correspond à aucun fixture statique
    const resolveId = () => {
      const staticMatch = BBALL_FIXTURES.find(f => String(f.id) === String(group.eventId));
      if (staticMatch) return staticMatch.id;
      // Fallback : chercher par noms d'équipes + date la plus proche
      const norm = s => (s||'').toLowerCase().replace(/[^a-z]/g,'');
      const alertTs = group.fixtureDate ? new Date(group.fixtureDate).getTime() : 0;
      const candidates = BBALL_FIXTURES.filter(f =>
        norm(f.home?.name) === norm(group.homeTeam) &&
        norm(f.away?.name) === norm(group.awayTeam)
      );
      if (!candidates.length) return group.eventId;
      const best = alertTs
        ? candidates.reduce((a, b) =>
            Math.abs(new Date(a.date).getTime() - alertTs) <= Math.abs(new Date(b.date).getTime() - alertTs) ? a : b)
        : candidates[0];
      return best?.id || group.eventId;
    };
    const id = resolveId();
    let path = group.league === 'wnba' ? `/basketball/${id}?league=wnba&props=1`
      : EU.includes(group.league) ? `/basketball/${id}?league=${group.league}&props=1`
      : `/basketball/${id}?props=1`;
    navigate(path);
  };

  return (
    <div
      onClick={goToMatch}
      style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, cursor: 'pointer', overflow: 'hidden', transition: 'background 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.75rem' }}>
        <span style={{ fontSize: 12, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.player}</span>
        {s && (
          <span style={{ fontSize: 11, fontWeight: 700, color: s.direction === 'over' ? '#4ade80' : '#f87171', flexShrink: 0 }}>
            {s.direction === 'over' ? '▲' : '▼'} {s.line} {STAT_LABEL[s.stat] ?? s.stat}
          </span>
        )}
        {acceptedOdds && bk && (
          <span style={{ fontSize: 10, fontWeight: 700, color: bkColor, flexShrink: 0 }}>{acceptedOdds.toFixed(2)}</span>
        )}
        <span style={{ fontSize: 10, fontWeight: 800, color: '#60a5fa', minWidth: 28, textAlign: 'right' }}>{group.maxProb}%</span>
        <button
          onClick={e => { e.stopPropagation(); onDismiss(group.ids); }}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, padding: '0 0 0 4px', lineHeight: 1 }}
        >×</button>
      </div>
      {playerStats && <LiveStatRow group={group} playerStats={playerStats} />}
    </div>
  );
}

// Logo équipe avec fallback initiales
function TeamLogo({ logo, short, name, size = 40, league = 'nba' }) {
  const [err, setErr] = useState(false);
  const fallback = short ? (
    ['acb','lnb','bbl','legaa','euroleague'].includes(league)
      ? null
      : `https://a.espncdn.com/i/teamlogos/${league === 'wnba' ? 'wnba' : 'nba'}/500/scoreboard/${short.toLowerCase()}.png`
  ) : null;
  const src = logo || fallback;
  const initials = (short || name || '?').slice(0, 3).toUpperCase();

  if (!src || err) {
    return (
      <div style={{ width: size, height: size, borderRadius: 8, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.28, fontWeight: 800, color: 'var(--text-dim)', flexShrink: 0 }}>
        {initials}
      </div>
    );
  }
  return (
    <img src={src} alt={short} onError={() => setErr(true)}
      style={{ width: size, height: size, objectFit: 'contain', borderRadius: 8, flexShrink: 0 }} />
  );
}

// ── Groupe par match ──────────────────────────────────────────────────────────
function MatchGroup({ match, scoreData, liveStats, onDismiss }) {
  const { homeShort, awayShort, homeTeam, awayTeam, alerts, league, fixtureDate } = match;
  const hasScores = (scoreData?.homeScore > 0 || scoreData?.awayScore > 0);
  const isLive = scoreData?.status === 'STATUS_IN_PROGRESS'
    || (scoreData?.status === 'STATUS_SCHEDULED' && hasScores);
  const isDone = scoreData?.status === 'STATUS_FINAL';
  const isScheduled = !isLive && !isDone;
  const [open, setOpen] = useState(false);
  useEffect(() => { if (isLive) setOpen(true); }, [isLive]);

  const hasScore = scoreData?.homeScore != null && scoreData?.awayScore != null;
  const leagueLabel = { nba: 'NBA', wnba: 'WNBA', acb: 'ACB', lnb: 'LNB', bbl: 'BBL', legaa: 'Lega A', euroleague: 'EL' }[league] || league?.toUpperCase();
  const matchTime = fixtureDate ? new Date(fixtureDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

  // ── Version liste compacte (pas encore live) ──
  if (isScheduled) {
    return (
      <div style={{ borderRadius: 10, border: '1px solid rgba(96,165,250,0.15)', overflow: 'hidden', background: 'rgba(96,165,250,0.02)' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <TeamLogo logo={scoreData?.homeLogo} short={homeShort} name={homeTeam} size={28} league={league} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{homeShort || homeTeam}</span>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.12)', borderRadius: 3, padding: '1px 5px' }}>{leagueLabel}</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{matchTime}</span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{awayShort || awayTeam}</span>
          <TeamLogo logo={scoreData?.awayLogo} short={awayShort} name={awayTeam} size={28} league={league} />
          <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 4, flexShrink: 0 }}>{alerts.length}</span>
          <svg style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--text-dim)', flexShrink: 0 }} width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {open && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', padding: '0.3rem 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {alerts.map(g => <AlertCard key={g.key} group={g} playerStats={null} onDismiss={onDismiss} />)}
          </div>
        )}
      </div>
    );
  }

  // ── Version carré (live ou terminé) ──
  const accent = isLive ? 'rgba(249,115,22,0.3)' : 'rgba(74,222,128,0.2)';
  const accentBg = isLive ? 'rgba(249,115,22,0.04)' : 'rgba(74,222,128,0.02)';
  return (
    <div style={{ borderRadius: 12, border: `1px solid ${accent}`, overflow: 'hidden', background: accentBg }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', minHeight: 110 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', flex: 1 }}>
          <TeamLogo logo={scoreData?.homeLogo} short={homeShort} name={homeTeam} size={44} />
          <span style={{ fontSize: 10, fontWeight: 700 }}>{homeShort || homeTeam}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', minWidth: 90, flexShrink: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.12)', borderRadius: 3, padding: '1px 6px' }}>{leagueLabel}</span>
          {hasScore ? (
            <span style={{ fontSize: 20, fontWeight: 900, color: isLive ? '#f97316' : '#4ade80', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.05em', lineHeight: 1 }}>
              {scoreData.homeScore} – {scoreData.awayScore}
            </span>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)' }}>vs</span>
          )}
          <MatchStatusBadge scoreData={scoreData} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', flex: 1 }}>
          <TeamLogo logo={scoreData?.awayLogo} short={awayShort} name={awayTeam} size={44} />
          <span style={{ fontSize: 10, fontWeight: 700 }}>{awayShort || awayTeam}</span>
        </div>
        <span style={{ position: 'absolute', right: 10, top: 8, fontSize: 9, color: 'var(--text-dim)' }}>{alerts.length} pari{alerts.length > 1 ? 's' : ''}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', padding: '0.4rem 0' }}>
        {alerts.map(g => <AlertCard key={g.key} group={g} playerStats={liveStats[g.key] || null} onDismiss={onDismiss} />)}
      </div>
    </div>
  );
}

// ── Page Running ──────────────────────────────────────────────────────────────
export default function RunningPage() {
  const [rawAlerts, setRawAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ALERT_KEY) || '[]'); } catch { return []; }
  });

  useEffect(() => {
    fetch('/api/settlements').then(r => r.json()).then(settlements => {
      if (!settlements?.length) return;
      const raw = JSON.parse(localStorage.getItem(ALERT_KEY) || '[]');
      let changed = false;
      const updated = raw.map(a => {
        const s = settlements.find(x => x.id === a.id);
        if (!s || a.status === s.status) return a;
        changed = true;
        return { ...a, status: s.status, actualStat: s.actualStat ?? null };
      });
      if (changed) { localStorage.setItem(ALERT_KEY, JSON.stringify(updated)); setRawAlerts(updated); }
    }).catch(() => {});
  }, []);

  const groups = groupAlerts(rawAlerts);
  const acceptedGroups = groups.filter(g => g.status === 'accepted');
  const matchGroups = groupByMatch(acceptedGroups);
  const liveStats = useLiveBoxscore(acceptedGroups);
  const scoreData = useLiveScores(matchGroups);

  // Indique à LeftNav si un match est vraiment en cours (pas juste terminé)
  useEffect(() => {
    const isInProgress = (s, sd) => s === 'STATUS_IN_PROGRESS'
      || (s === 'STATUS_SCHEDULED' && (sd?.homeScore > 0 || sd?.awayScore > 0));
    const hasInProgress = matchGroups.some(m => isInProgress(scoreData[m.matchKey]?.status, scoreData[m.matchKey]));
    localStorage.setItem('running_has_live', hasInProgress ? '1' : '0');
  }, [matchGroups, scoreData]);

  const dismiss = (ids) => {
    const idSet = new Set(ids);
    const updated = rawAlerts.map(a => idSet.has(a.id) ? { ...a, status: 'void' } : a);
    try { localStorage.setItem(ALERT_KEY, JSON.stringify(updated)); } catch {}
    setRawAlerts(updated);
  };

  const total = acceptedGroups.length;

  return (
    <div className="page placebet-page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#60a5fa', display: 'inline-block', boxShadow: '0 0 10px #60a5fa' }} />
        <h1 style={{ fontSize: 18, fontWeight: 800, color: '#60a5fa', margin: 0 }}>Running</h1>
        {total > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(96,165,250,0.15)', color: '#60a5fa', borderRadius: 10, padding: '2px 10px' }}>
            {total} pari{total > 1 ? 's' : ''}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-dim)' }}>Sync 30s</span>
      </div>

      {total === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, marginTop: '4rem' }}>
          Aucun pari accepté en cours.
        </div>
      ) : (() => {
        const isActive = (s, sd) => s === 'STATUS_IN_PROGRESS' || s === 'STATUS_FINAL'
          || (s === 'STATUS_SCHEDULED' && (sd?.homeScore > 0 || sd?.awayScore > 0));
        const liveGroups = matchGroups.filter(m => isActive(scoreData[m.matchKey]?.status, scoreData[m.matchKey]));
        const scheduledGroups = matchGroups.filter(m => !isActive(scoreData[m.matchKey]?.status, scoreData[m.matchKey]));
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
            {liveGroups.map(m => (
              <MatchGroup key={m.matchKey} match={m} scoreData={scoreData[m.matchKey] || null} liveStats={liveStats} onDismiss={dismiss} />
            ))}
            {scheduledGroups.length > 0 && (
              <div style={{ position: 'fixed', bottom: 24, left: 236, zIndex: 200, display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '0.4rem', maxWidth: '70vw' }}>
                {scheduledGroups.map(m => (
                  <div key={m.matchKey} style={{ width: 260 }}>
                    <MatchGroup match={m} scoreData={scoreData[m.matchKey] || null} liveStats={liveStats} onDismiss={dismiss} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
