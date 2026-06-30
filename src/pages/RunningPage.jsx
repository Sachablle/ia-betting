import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BBALL_FIXTURES } from '../utils/basketball';
import { syncBackgroundAlerts, syncSettlements, syncGameTotalAlerts, syncBballPinnacleAlerts, syncOddsDrift, syncFootballAlerts, resolveCompletedFootballAlerts, postAcceptedAlertReliably, FB_DC_BTTS_KEY, FB_DC_OU_KEY } from '../utils/syncAlerts';
import { setItem as cloudSet } from '../utils/cloudStorage';
import { cachedFetch } from '../utils/fetchCache';

const ALERT_KEY      = 'nba_prop_alerts';
const GAME_TOTAL_KEY = 'nba_game_total_alerts';
const BBALL_PINNACLE_KEY = 'bball_pinnacle_alerts';
const FB_BTTS_KEY    = 'fb_btts_alerts';
const FB_TOTAL_KEY   = 'fb_total_alerts';
const FB_RESULT_KEY  = 'fb_result_alerts';
const FB_PINNACLE_KEY = 'fb_pinnacle_alerts';
const STAT_LABEL     = { pts: 'Pts', reb: 'Reb', ast: 'Ast', total: 'Total', btts: 'BTTS', result: 'Résultat', pinnacle_edge: 'Pinnacle', dc_btts: 'DC+BTTS', dc_ou: 'DC+1.5' };

// Ligues football — affichées dans les mêmes "MatchGroup" compacts que le basket
const FB_LEAGUES = new Set(['cdm', 'ligue1', 'pl', 'laliga', 'bundes', 'seriea']);
const FB_LEAGUE_LABEL = { cdm: 'CDM', ligue1: 'L1', pl: 'PL', laliga: 'Liga', bundes: 'BL', seriea: 'SA' };

const IN_GAME = s => s === 'STATUS_IN_PROGRESS' || s === 'STATUS_END_PERIOD' || s === 'STATUS_HALFTIME' || s === 'STATUS_END_OF_PERIOD';

// ── Prefetch au hover (même logique que BasketballMatchRow / MatchRow) ────────
const _EU_LEAGUES = new Set(['acb','lnb','bbl','legaa','euroleague']);
const _ESPN_NBA_RUN = {
  'Atlanta Hawks':1,'Boston Celtics':2,'New Orleans Pelicans':3,'Chicago Bulls':4,
  'Cleveland Cavaliers':5,'Dallas Mavericks':6,'Denver Nuggets':7,'Detroit Pistons':8,
  'Golden State Warriors':9,'Houston Rockets':10,'Indiana Pacers':11,'LA Clippers':12,
  'Los Angeles Lakers':13,'Miami Heat':14,'Milwaukee Bucks':15,'Minnesota Timberwolves':16,
  'Brooklyn Nets':17,'New York Knicks':18,'Orlando Magic':19,'Philadelphia 76ers':20,
  'Phoenix Suns':21,'Portland Trail Blazers':22,'Sacramento Kings':23,'San Antonio Spurs':24,
  'Oklahoma City Thunder':25,'Utah Jazz':26,'Washington Wizards':27,'Toronto Raptors':28,
  'Memphis Grizzlies':29,'Charlotte Hornets':30,
};
const _ESPN_WNBA_RUN = {
  'Atlanta Dream':20,'Chicago Sky':19,'Connecticut Sun':18,'Dallas Wings':3,
  'Golden State Valkyries':129689,'Indiana Fever':5,'Las Vegas Aces':17,
  'Los Angeles Sparks':6,'Minnesota Lynx':8,'New York Liberty':9,
  'Phoenix Mercury':11,'Portland Fire':132052,'Seattle Storm':14,
  'Toronto Tempo':131935,'Washington Mystics':16,
};
const _prefetchedRunning = new Set();
function _prefetchMatchData(league, homeTeam, awayTeam) {
  const key = `${league}__${homeTeam}__${awayTeam}`;
  if (_prefetchedRunning.has(key)) return;
  _prefetchedRunning.add(key);
  if (FB_LEAGUES.has(league)) {
    import('./MatchDetailPage').catch(() => {});
    cachedFetch('/api/odds', 30_000).catch(() => {});
    if (league === 'cdm') cachedFetch('/api/fd/worldcup', 30_000).catch(() => {});
    else cachedFetch(`/api/football/standings/${league}`, 30 * 60_000).catch(() => {});
  } else {
    import('./BasketballDetailPage').catch(() => {});
    if (league === 'wnba') {
      const hId = _ESPN_WNBA_RUN[homeTeam], aId = _ESPN_WNBA_RUN[awayTeam];
      if (hId) { cachedFetch(`/api/wnba/players/${hId}`, 3_600_000).catch(() => {}); cachedFetch(`/api/wnba/teamschedule/${hId}`, 300_000).catch(() => {}); }
      if (aId) { cachedFetch(`/api/wnba/players/${aId}`, 3_600_000).catch(() => {}); cachedFetch(`/api/wnba/teamschedule/${aId}`, 300_000).catch(() => {}); }
    } else if (!_EU_LEAGUES.has(league)) {
      const hId = _ESPN_NBA_RUN[homeTeam], aId = _ESPN_NBA_RUN[awayTeam];
      if (hId) { cachedFetch(`/api/nba/players/${hId}`, 3_600_000).catch(() => {}); cachedFetch(`/api/nba/teamschedule/${hId}`, 300_000).catch(() => {}); }
      if (aId) { cachedFetch(`/api/nba/players/${aId}`, 3_600_000).catch(() => {}); cachedFetch(`/api/nba/teamschedule/${aId}`, 300_000).catch(() => {}); }
    }
  }
}

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

// Convertit une alerte total O/U (PlaceBetPage / GAME_TOTAL_KEY) en objet "groupe"
// compatible avec groupByMatch + AlertCard (même forme que groupAlerts pour les props).
function totalAlertToGroup(a) {
  return {
    key: `total__${a.id}`, type: 'game_total',
    player: 'Total points', team: null, fixture: `${a.home} vs ${a.away}`,
    fixtureDate: a.date, homeTeam: a.home || null, awayTeam: a.away || null,
    homeShort: a.homeShort || null, awayShort: a.awayShort || null,
    eventId: a.eventId || null, league: a.league || 'nba',
    stats: [{
      stat: 'total', direction: a.direction, line: a.line,
      estimate: a.estimated, probability: a.prob,
      unibetOdds: a.unibetOdds, betclicOdds: a.betclicOdds, winamaxOdds: a.winamaxOdds,
      acceptedUnibetOdds: a.acceptedUnibetOdds ?? null,
      acceptedBetclicOdds: a.acceptedBetclicOdds ?? null,
      acceptedWinamaxOdds: a.acceptedWinamaxOdds ?? null,
    }],
    maxProb: a.prob || 0, ids: [a.id],
    status: a.status || 'pending', acceptedAt: a.acceptedAt || 0,
    acceptedBookmaker: a.acceptedBookmaker || null,
  };
}

// Convertit une alerte "Value Bet vs Pinnacle" basket (bball_pinnacle_alerts, WNBA Total
// uniquement) en objet "groupe" — même structure que totalAlertToGroup, mais stat: 'pinnacle_edge'
// + market: 'totals' pour réutiliser le badge cyan partagé avec le foot (cf AlertCard ci-dessous).
function bballPinnacleAlertToGroup(a) {
  return {
    key: `bpin__${a.id}`, type: 'basketball_pinnacle_edge',
    player: 'Value Bet vs Pinnacle', team: null, fixture: `${a.home} vs ${a.away}`,
    fixtureDate: a.date, homeTeam: a.home || null, awayTeam: a.away || null,
    homeShort: a.homeShort || null, awayShort: a.awayShort || null,
    eventId: a.eventId || null, league: a.league || 'wnba',
    stats: [{
      stat: 'pinnacle_edge', market: 'totals', direction: a.direction, line: a.line,
      estimate: null, probability: a.prob,
      unibetOdds: a.unibetOdds, betclicOdds: a.betclicOdds, winamaxOdds: null,
      pinnacleOdds: a.pinnacleOdds,
      acceptedUnibetOdds: a.acceptedUnibetOdds ?? null,
      acceptedBetclicOdds: a.acceptedBetclicOdds ?? null,
      acceptedWinamaxOdds: null,
    }],
    maxProb: a.prob || 0, ids: [a.id],
    status: a.status || 'pending', acceptedAt: a.acceptedAt || 0,
    acceptedBookmaker: a.acceptedBookmaker || null,
  };
}

// Convertit une alerte football (fb_btts_alerts / fb_total_alerts / fb_result_alerts) en objet
// "groupe" compatible avec groupByMatch + AlertCard — même principe que totalAlertToGroup.
function footballAlertToGroup(a) {
  const isBtts          = a.type === 'football_btts';
  const isResult        = a.type === 'football_result';
  const isPinnacle      = a.type === 'football_pinnacle_edge';
  const isDcBtts        = a.type === 'football_dc_btts';
  const isDcOu          = a.type === 'football_dc_ou';
  const isPinnacleTotal = isPinnacle && a.market === 'totals';
  const isLineless = isBtts || isResult || isDcBtts || (isPinnacle && !isPinnacleTotal);
  const DC_DIR = { '1x': '1X', 'x2': 'X2', '12': '12' };
  return {
    key: `fb__${a.id}`, type: a.type,
    player: isBtts ? 'Les deux équipes marquent' : isResult ? 'Résultat 1X2' : isPinnacle ? 'Value Bet vs Pinnacle'
      : isDcBtts ? `DC ${DC_DIR[a.direction] ?? a.direction} & BTTS` : isDcOu ? `DC ${DC_DIR[a.direction] ?? a.direction} & +1.5` : 'Total buts',
    team: null, fixture: isBtts ? a.fixture : `${a.home} vs ${a.away}`,
    fixtureDate: a.fixtureDate,
    homeTeam: isBtts ? a.homeTeam : a.home, awayTeam: isBtts ? a.awayTeam : a.away,
    homeShort: isBtts ? null : (a.homeShort || null),
    awayShort: isBtts ? null : (a.awayShort || null),
    eventId: a.fixtureId || a.eventId || null,
    league: a.league || 'cdm',
    stats: [{
      stat: isBtts ? 'btts' : isResult ? 'result' : isPinnacle ? 'pinnacle_edge' : isDcBtts ? 'dc_btts' : isDcOu ? 'dc_ou' : 'total',
      market: isPinnacle ? (a.market || 'h2h') : null,
      direction: isBtts ? 'yes' : a.direction,
      line: isLineless ? null : a.line,
      estimate: isLineless ? null : a.estimated,
      probability: a.probability,
      unibetOdds: a.unibetOdds, betclicOdds: a.betclicOdds, winamaxOdds: a.winamaxOdds,
      pinnacleOdds: isPinnacle ? a.pinnacleOdds : null,
      acceptedUnibetOdds: a.acceptedUnibetOdds ?? null,
      acceptedBetclicOdds: a.acceptedBetclicOdds ?? null,
      acceptedWinamaxOdds: a.acceptedWinamaxOdds ?? null,
    }],
    maxProb: a.probability || 0, ids: [a.id],
    status: a.status || 'pending', acceptedAt: a.acceptedAt || 0,
    acceptedBookmaker: a.acceptedBookmaker || null,
  };
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
      pairKey: [homeKey, awayKey].sort().join('__'),
    };
    map[mk].alerts.push(g);
    // Garder l'eventId le plus récent/valide
    if (g.eventId && !map[mk].eventId) map[mk].eventId = g.eventId;
  }
  const groups = Object.values(map);
  // Même paire d'équipes plusieurs fois (série best-of) → afficher la date en plus de l'heure,
  // sinon deux matchs différents (ex. Game 2 / Game 3 d'une finale) sont indiscernables.
  const pairCounts = {};
  for (const grp of groups) pairCounts[grp.pairKey] = (pairCounts[grp.pairKey] || 0) + 1;
  for (const grp of groups) grp.showDate = pairCounts[grp.pairKey] > 1;
  // Trie par sport (foot d'abord, basket ensuite), puis par date dans chaque groupe.
  return groups.sort((a, b) => {
    const aFoot = FB_LEAGUES.has(a.league) ? 0 : 1;
    const bFoot = FB_LEAGUES.has(b.league) ? 0 : 1;
    if (aFoot !== bFoot) return aFoot - bFoot;
    return new Date(a.fixtureDate) - new Date(b.fixtureDate);
  });
}

// ── Hook scores live ──────────────────────────────────────────────────────────
function useLiveScores(matchGroups) {
  const [scores, setScores] = useState({});
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!matchGroups.length) { setScores({}); setLoaded(true); return; }

    const doFetch = async () => {
      const result = {};
      const byLeague = {};
      for (const m of matchGroups) {
        if (!byLeague[m.league]) byLeague[m.league] = [];
        byLeague[m.league].push(m);
      }

      for (const [league, matches] of Object.entries(byLeague)) {
        try {
          // CDM : live scores via /api/fd/worldcup, matché par id (fdcdm_${g.id})
          if (league === 'cdm') {
            const d = await fetch('/api/fd/worldcup').then(r => r.ok ? r.json() : null).catch(() => null);
            const games = d?.games || [];
            for (const m of matches) {
              const gid = String(m.eventId || '').replace('fdcdm_', '');
              const g = games.find(g => String(g.id) === gid);
              if (g) result[m.matchKey] = {
                homeScore: g.home?.score ?? null,
                awayScore: g.away?.score ?? null,
                homeLogo: g.home?.logo || null,
                awayLogo: g.away?.logo || null,
                status: g.status,
                statusDetail: g.round || '',
              };
            }
            continue;
          }
          // Les 5 grands championnats n'ont pas encore de source de scores live
          if (FB_LEAGUES.has(league)) continue;

          const EU = ['acb','lnb','bbl','legaa'];
          const url = league === 'wnba' ? '/api/wnba/scoreboard'
            : EU.includes(league) ? `/api/euro/${league}/scoreboard`
            : '/api/nba/scoreboard';
          const d = await fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
          const games = d?.games || [];
          for (const m of matches) {
            const g = games.find(g => {
              const norm = s => (s||'').toLowerCase().replace(/[^a-z]/g,'');
              const teamMatch = (norm(g.home?.short) === norm(m.homeShort) || norm(g.home?.name).includes(norm(m.homeTeam||'').slice(0,4)))
                  && (norm(g.away?.short) === norm(m.awayShort) || norm(g.away?.name).includes(norm(m.awayTeam||'').slice(0,4)));
              if (!teamMatch) return false;
              if (m.fixtureDate && g.date) {
                const diff = Math.abs(new Date(g.date).getTime() - new Date(m.fixtureDate).getTime());
                if (diff > 24 * 3600_000) return false;
              }
              return true;
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
      setLoaded(true);
    };

    doFetch();
    timerRef.current = setInterval(doFetch, 30_000);
    return () => clearInterval(timerRef.current);
  }, [matchGroups.map(m => m.matchKey).join(',')]);

  return { scores, loaded };
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
  const isLive = IN_GAME(status);
  const isDone = status === 'STATUS_FINAL';

  const label = isDone ? 'Terminé'
    : isLive ? (statusDetail || 'Live')
    : 'À venir';

  const color = isDone ? '#4ade80' : isLive ? '#ffffff' : 'var(--text-dim)';
  const bg    = isDone ? 'rgba(74,222,128,0.1)' : isLive ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)';

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
    </div>
  );
}

// ── Carte alerte joueur ───────────────────────────────────────────────────────
function AlertCard({ group, playerStats, onDismiss }) {
  const navigate = useNavigate();
  const s = group.stats[0];
  const bk = group.acceptedBookmaker;
  const acceptedOdds = bk === 'unibet' ? (s?.acceptedUnibetOdds ?? s?.unibetOdds)
    : bk === 'betclic' ? (s?.acceptedBetclicOdds ?? s?.betclicOdds) : null;
  const bkColor = bk === 'unibet' ? '#1db954' : bk === 'betclic' ? '#e0292e' : '#e5e7eb';

  const goToMatch = () => {
    if (FB_LEAGUES.has(group.league)) {
      if (group.eventId) navigate(`/football/${group.eventId}`);
      return;
    }
    const EU = ['acb','lnb','bbl','legaa'];
    const isEuroLg = EU.includes(group.league) || group.league === 'euroleague';
    // NBA/WNBA : la page de match utilise le scoreboard ESPN live (fixture.id = eventId ESPN),
    // donc on navigue directement avec cet id — exactement comme BasketballMatchRow/PlaceBetPage.
    // Le résoudre vers une fixture statique (basketball.js) chargeait une AUTRE fixture (id, date,
    // short d'équipe différents → "NYK"/"SAS" au lieu de "NY"/"SA"), donc un autre cache de cotes
    // (`bball_odds_${fixture.id}`) et un autre snapshot de projections → % et lignes différents
    // de ceux affichés dans "Analyse Props" pour le même match (cf. divergence Dylan Harper, 8 juin).
    // Seules les ligues EU (fixtures statiques basketball.js / api-sports) ont besoin de résolution.
    const resolveId = () => {
      const staticMatch = BBALL_FIXTURES.find(f => String(f.id) === String(group.eventId));
      if (staticMatch) return staticMatch.id;
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
    const id = isEuroLg ? resolveId() : group.eventId;
    let path = group.league === 'wnba' ? `/basketball/${id}?league=wnba&props=1`
      : EU.includes(group.league) ? `/basketball/${id}?league=${group.league}&props=1`
      : `/basketball/${id}?props=1`;
    navigate(path);
  };

  return (
    <div
      onClick={goToMatch}
      style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, cursor: 'pointer', overflow: 'hidden', transition: 'background 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; _prefetchMatchData(group.league, group.homeTeam, group.awayTeam); }}
      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.75rem' }}>
        <span style={{ fontSize: 12, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.player}</span>
        {s && s.stat === 'btts' ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', flexShrink: 0 }}>✓ BTTS</span>
        ) : s && s.stat === 'result' ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24', flexShrink: 0 }}>
            🏆 {s.direction === 'draw' ? 'Nul' : s.direction === 'home' ? (group.homeShort || group.homeTeam) : (group.awayShort || group.awayTeam)}
          </span>
        ) : s && s.stat === 'pinnacle_edge' && s.market === 'totals' ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#22d3ee', flexShrink: 0 }}>
            💎 {s.direction === 'over' ? '▲' : '▼'} {s.line}
          </span>
        ) : s && s.stat === 'pinnacle_edge' ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#22d3ee', flexShrink: 0 }}>
            💎 {s.direction === 'draw' ? 'Nul' : s.direction === 'home' ? (group.homeShort || group.homeTeam) : (group.awayShort || group.awayTeam)}
          </span>
        ) : s && (
          <span style={{ fontSize: 11, fontWeight: 700, color: s.direction === 'over' ? '#4ade80' : '#f87171', flexShrink: 0 }}>
            {s.direction === 'over' ? '▲' : '▼'} {s.line} {STAT_LABEL[s.stat] ?? s.stat}
          </span>
        )}
        {acceptedOdds && bk && (
          <span style={{ fontSize: 10, fontWeight: 700, color: bkColor, flexShrink: 0 }}>{acceptedOdds.toFixed(2)}</span>
        )}
        <span style={{ fontSize: 10, fontWeight: 800, color: '#60a5fa', minWidth: 28, textAlign: 'right' }}>{group.maxProb}%</span>
        <button
          onClick={e => { e.stopPropagation(); onDismiss(group.ids, group); }}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, padding: '0 0 0 4px', lineHeight: 1 }}
        >×</button>
      </div>
    </div>
  );
}

// Logo équipe avec fallback initiales
function TeamLogo({ logo, short, name, size = 40, league = 'nba' }) {
  const [err, setErr] = useState(false);
  const normS = normShort(short).toLowerCase();
  const fallback = normS ? (
    ['acb','lnb','bbl','legaa','euroleague'].includes(league) || FB_LEAGUES.has(league)
      ? null
      : `https://a.espncdn.com/i/teamlogos/${league === 'wnba' ? 'wnba' : 'nba'}/500/scoreboard/${normS}.png`
  ) : null;
  const src = logo || fallback;
  const initials = (short || name || '?').slice(0, 3).toUpperCase();

  if (!src || err) {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.28, fontWeight: 800, color: 'var(--text-dim)', flexShrink: 0 }}>
        {initials}
      </div>
    );
  }
  return (
    <img src={src} alt={short} onError={() => setErr(true)}
      style={{ width: size, height: size, objectFit: 'contain', borderRadius: '50%', flexShrink: 0 }} />
  );
}

// ── Groupe par match ──────────────────────────────────────────────────────────
function MatchGroup({ match, scoreData, liveStats, onDismiss }) {
  const { homeShort, awayShort, homeTeam, awayTeam, alerts, league, fixtureDate, showDate } = match;
  const hasScores = (scoreData?.homeScore > 0 || scoreData?.awayScore > 0);
  const isLive = IN_GAME(scoreData?.status)
    || (scoreData?.status === 'STATUS_SCHEDULED' && hasScores);
  const isDone = scoreData?.status === 'STATUS_FINAL';
  const isScheduled = !isLive && !isDone;
  const [open, setOpen] = useState(false);
  useEffect(() => { if (isLive) setOpen(true); }, [isLive]);

  const hasScore = scoreData?.homeScore != null && scoreData?.awayScore != null;
  const leagueLabel = { nba: 'NBA', wnba: 'WNBA', acb: 'ACB', lnb: 'LNB', bbl: 'BBL', legaa: 'Lega A', euroleague: 'EL', ...FB_LEAGUE_LABEL }[league] || league?.toUpperCase();
  const matchTime = fixtureDate ? new Date(fixtureDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
  // Même paire d'équipes plusieurs fois (série best-of) → date en plus de l'heure pour les distinguer
  const matchDatePrefix = showDate && fixtureDate ? `${new Date(fixtureDate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ` : '';
  // Liseret par sport : vert foot, orange basket — distingue les deux d'un coup d'œil dans la liste
  const isFootball = FB_LEAGUES.has(league);
  const sportBorder = isFootball ? 'rgba(74,222,128,0.3)' : 'rgba(251,146,60,0.3)';
  const sportBg = isFootball ? 'rgba(74,222,128,0.03)' : 'rgba(251,146,60,0.03)';

  // ── Version liste compacte (pas encore live) ──
  if (isScheduled) {
    return (
      <div style={{ borderRadius: 10, border: `1px solid ${sportBorder}`, overflow: 'hidden', background: sportBg }}>
        <button
          onClick={() => setOpen(o => !o)}
          onMouseEnter={() => _prefetchMatchData(league, homeTeam, awayTeam)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <TeamLogo logo={scoreData?.homeLogo} short={normShort(homeShort)} name={homeTeam} size={28} league={league} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{homeShort || homeTeam}</span>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.12)', borderRadius: 3, padding: '1px 5px' }}>{leagueLabel}</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{matchDatePrefix}{matchTime}</span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{awayShort || awayTeam}</span>
          <TeamLogo logo={scoreData?.awayLogo} short={normShort(awayShort)} name={awayTeam} size={28} league={league} />
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

  // ── Version carré (live ou terminé) — liseret par sport, le score/badge garde le code couleur live/terminé ──
  return (
    <div style={{ borderRadius: 12, border: `1px solid ${sportBorder}`, overflow: 'hidden', background: sportBg }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', minHeight: 110 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', flex: 1 }}>
          <TeamLogo logo={scoreData?.homeLogo} short={normShort(homeShort)} name={homeTeam} size={44} />
          <span style={{ fontSize: 10, fontWeight: 700 }}>{homeShort || homeTeam}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.1rem', minWidth: 90, flexShrink: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.12)', borderRadius: 3, padding: '1px 6px' }}>{leagueLabel}</span>
          {hasScore ? (
            <span style={{ fontSize: 16, fontWeight: 900, color: isLive ? '#ffffff' : '#4ade80', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.05em', lineHeight: 1 }}>
              {scoreData.homeScore} – {scoreData.awayScore}
            </span>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)' }}>vs</span>
          )}
          <MatchStatusBadge scoreData={scoreData} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', flex: 1 }}>
          <TeamLogo logo={scoreData?.awayLogo} short={normShort(awayShort)} name={awayTeam} size={44} />
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
  const [rawTotalAlerts, setRawTotalAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(GAME_TOTAL_KEY) || '[]'); } catch { return []; }
  });
  const [bttsAlerts, setBttsAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(FB_BTTS_KEY) || '[]'); } catch { return []; }
  });
  const [fbTotalAlerts, setFbTotalAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(FB_TOTAL_KEY) || '[]'); } catch { return []; }
  });
  const [fbResultAlerts, setFbResultAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(FB_RESULT_KEY) || '[]'); } catch { return []; }
  });
  const [fbPinnacleAlerts, setFbPinnacleAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(FB_PINNACLE_KEY) || '[]'); } catch { return []; }
  });
  const [dcBttsAlerts, setDcBttsAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(FB_DC_BTTS_KEY) || '[]'); } catch { return []; }
  });
  const [dcOuAlerts, setDcOuAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(FB_DC_OU_KEY) || '[]'); } catch { return []; }
  });
  const [bballPinnacleAlerts, setBballPinnacleAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(BBALL_PINNACLE_KEY) || '[]'); } catch { return []; }
  });

  useEffect(() => {
    // Resynchronise % et projections sur le modèle live + dédoublonne les entrées
    // legacy (cf. syncAlerts.js) — sans ça, "Running" affichait des % figés au clic
    // au lieu de ceux du modèle en direct visible sur Analyse Props.
    const reloadFromStorage = () => {
      try { setRawAlerts(JSON.parse(localStorage.getItem(ALERT_KEY) || '[]')); } catch {}
      try { setRawTotalAlerts(JSON.parse(localStorage.getItem(GAME_TOTAL_KEY) || '[]')); } catch {}
      try { setBballPinnacleAlerts(JSON.parse(localStorage.getItem(BBALL_PINNACLE_KEY) || '[]')); } catch {}
    };
    const reloadFootball = () => {
      try { setBttsAlerts(JSON.parse(localStorage.getItem(FB_BTTS_KEY) || '[]')); } catch {}
      try { setFbTotalAlerts(JSON.parse(localStorage.getItem(FB_TOTAL_KEY) || '[]')); } catch {}
      try { setFbResultAlerts(JSON.parse(localStorage.getItem(FB_RESULT_KEY) || '[]')); } catch {}
      try { setFbPinnacleAlerts(JSON.parse(localStorage.getItem(FB_PINNACLE_KEY) || '[]')); } catch {}
      try { setDcBttsAlerts(JSON.parse(localStorage.getItem(FB_DC_BTTS_KEY) || '[]')); } catch {}
      try { setDcOuAlerts(JSON.parse(localStorage.getItem(FB_DC_OU_KEY) || '[]')); } catch {}
    };
    window.addEventListener('nba_alerts_updated', reloadFromStorage);
    window.addEventListener('fb_btts_alerts_updated', reloadFootball);
    window.addEventListener('fb_total_alerts_updated', reloadFootball);
    window.addEventListener('fb_result_alerts_updated', reloadFootball);
    window.addEventListener('fb_pinnacle_alerts_updated', reloadFootball);
    window.addEventListener('fb_dc_btts_alerts_updated', reloadFootball);
    window.addEventListener('fb_dc_ou_alerts_updated', reloadFootball);
    window.addEventListener('bball_pinnacle_alerts_updated', reloadFromStorage);
    syncBackgroundAlerts().then(reloadFromStorage);
    syncGameTotalAlerts().then(reloadFromStorage);
    syncBballPinnacleAlerts().then(reloadFromStorage);
    syncOddsDrift().then(reloadFromStorage);
    syncFootballAlerts().then(reloadFootball);
    const syncTimer = setInterval(() => {
      syncBackgroundAlerts().then(reloadFromStorage);
      syncGameTotalAlerts().then(reloadFromStorage);
      syncBballPinnacleAlerts().then(reloadFromStorage);
      syncOddsDrift().then(reloadFromStorage);
      syncFootballAlerts().then(reloadFootball);
    }, 2 * 60 * 1000);

    // Filet de rattrapage : renvoie au backend les alertes accepted qui n'auraient pas
    // été synchronisées (POST raté à l'acceptation) — sinon elles ne sont jamais settle.
    try {
      const existing = JSON.parse(localStorage.getItem(ALERT_KEY) || '[]');
      existing.filter(a => a.status === 'accepted').forEach(a => postAcceptedAlertReliably(a));
    } catch {}
    syncSettlements().then(reloadFromStorage);

    // Règlement BTTS/O-U football (CDM uniquement, cf. resolveCompletedFootballAlerts)
    try {
      const btts = JSON.parse(localStorage.getItem(FB_BTTS_KEY) || '[]');
      resolveCompletedFootballAlerts(btts, alerts => { cloudSet(FB_BTTS_KEY, JSON.stringify(alerts)); setBttsAlerts(alerts); });
      const fbTotal = JSON.parse(localStorage.getItem(FB_TOTAL_KEY) || '[]');
      resolveCompletedFootballAlerts(fbTotal, alerts => { cloudSet(FB_TOTAL_KEY, JSON.stringify(alerts)); setFbTotalAlerts(alerts); });
      const fbResult = JSON.parse(localStorage.getItem(FB_RESULT_KEY) || '[]');
      resolveCompletedFootballAlerts(fbResult, alerts => { cloudSet(FB_RESULT_KEY, JSON.stringify(alerts)); setFbResultAlerts(alerts); });
      const fbPinnacle = JSON.parse(localStorage.getItem(FB_PINNACLE_KEY) || '[]');
      resolveCompletedFootballAlerts(fbPinnacle, alerts => { cloudSet(FB_PINNACLE_KEY, JSON.stringify(alerts)); setFbPinnacleAlerts(alerts); });
      const dcBtts = JSON.parse(localStorage.getItem(FB_DC_BTTS_KEY) || '[]');
      resolveCompletedFootballAlerts(dcBtts, alerts => { cloudSet(FB_DC_BTTS_KEY, JSON.stringify(alerts)); setDcBttsAlerts(alerts); });
      const dcOu = JSON.parse(localStorage.getItem(FB_DC_OU_KEY) || '[]');
      resolveCompletedFootballAlerts(dcOu, alerts => { cloudSet(FB_DC_OU_KEY, JSON.stringify(alerts)); setDcOuAlerts(alerts); });
    } catch {}
    // basketball_pinnacle_edge (WNBA) se règle côté serveur (runAutoSettle, totalsToCheck) — pas
    // de résolution client séparée nécessaire, syncSettlements() ci-dessus suffit (BBALL_PINNACLE_KEY
    // est dans SETTLEABLE_KEYS).

    const onCloudSynced = () => { reloadFromStorage(); reloadFootball(); };
    window.addEventListener('cloud_synced', onCloudSynced);

    return () => {
      window.removeEventListener('nba_alerts_updated', reloadFromStorage);
      window.removeEventListener('fb_btts_alerts_updated', reloadFootball);
      window.removeEventListener('fb_total_alerts_updated', reloadFootball);
      window.removeEventListener('fb_result_alerts_updated', reloadFootball);
      window.removeEventListener('fb_pinnacle_alerts_updated', reloadFootball);
      window.removeEventListener('fb_dc_btts_alerts_updated', reloadFootball);
      window.removeEventListener('fb_dc_ou_alerts_updated', reloadFootball);
      window.removeEventListener('bball_pinnacle_alerts_updated', reloadFromStorage);
      window.removeEventListener('cloud_synced', onCloudSynced);
      clearInterval(syncTimer);
    };
  }, []);

  const groups = groupAlerts(rawAlerts);
  const acceptedGroups = groups.filter(g => g.status === 'accepted');
  const acceptedTotalGroups = rawTotalAlerts.filter(a => a.status === 'accepted').map(totalAlertToGroup);
  const acceptedBballPinnacle = bballPinnacleAlerts.filter(a => a.status === 'accepted').map(bballPinnacleAlertToGroup);
  const acceptedBtts = bttsAlerts.filter(a => a.status === 'accepted');
  const acceptedFbTotal = fbTotalAlerts.filter(a => a.status === 'accepted');
  const acceptedFbResult = fbResultAlerts.filter(a => a.status === 'accepted');
  const acceptedFbPinnacle = fbPinnacleAlerts.filter(a => a.status === 'accepted');
  const dedupFootballDC = arr => { const seen = new Set(); return arr.filter(a => { const k = `${(a.fixtureDate||'').slice(0,10)}__${(a.home||'').toLowerCase()}__${(a.away||'').toLowerCase()}__${a.type}__${a.direction}`; if (seen.has(k)) return false; seen.add(k); return true; }); };
  const acceptedDcBtts = dedupFootballDC(dcBttsAlerts.filter(a => a.status === 'accepted'));
  const acceptedDcOu   = dedupFootballDC(dcOuAlerts.filter(a => a.status === 'accepted'));
  const footballGroups = [...acceptedBtts.map(footballAlertToGroup), ...acceptedFbTotal.map(footballAlertToGroup), ...acceptedFbResult.map(footballAlertToGroup), ...acceptedFbPinnacle.map(footballAlertToGroup), ...acceptedDcBtts.map(footballAlertToGroup), ...acceptedDcOu.map(footballAlertToGroup)];
  const allAcceptedGroups = [...acceptedGroups, ...acceptedTotalGroups, ...acceptedBballPinnacle, ...footballGroups];
  const matchGroups = groupByMatch(allAcceptedGroups);
  const liveStats = useLiveBoxscore(acceptedGroups);
  const { scores: scoreData, loaded: scoresLoaded } = useLiveScores(matchGroups);

  // Indique à LeftNav si un match est vraiment en cours (pas juste terminé)
  useEffect(() => {
    const isInProgress = (s, sd) => IN_GAME(s)
      || (s === 'STATUS_SCHEDULED' && (sd?.homeScore > 0 || sd?.awayScore > 0));
    const hasInProgress = matchGroups.some(m => isInProgress(scoreData[m.matchKey]?.status, scoreData[m.matchKey]));
    localStorage.setItem('running_has_live', hasInProgress ? '1' : '0');
  }, [matchGroups, scoreData]);

  const dismiss = (ids, group) => {
    if (group?.type === 'game_total') {
      const idSet = new Set(ids);
      const updated = rawTotalAlerts.map(a => idSet.has(a.id) ? { ...a, status: 'void' } : a);
      try { cloudSet(GAME_TOTAL_KEY, JSON.stringify(updated)); } catch {}
      setRawTotalAlerts(updated);
      return;
    }
    if (group?.type === 'football_btts') { dismissBtts(group.ids[0]); return; }
    if (group?.type === 'football_total') { dismissFbTotal(group.ids[0]); return; }
    if (group?.type === 'football_result') { dismissFbResult(group.ids[0]); return; }
    if (group?.type === 'football_pinnacle_edge') { dismissFbPinnacle(group.ids[0]); return; }
    if (group?.type === 'football_dc_btts') { dismissDcBtts(group.ids[0]); return; }
    if (group?.type === 'football_dc_ou')   { dismissDcOu(group.ids[0]);   return; }
    if (group?.type === 'basketball_pinnacle_edge') { dismissBballPinnacle(group.ids[0]); return; }
    const idSet = new Set(ids);
    const gTime = group?.fixtureDate ? new Date(group.fixtureDate).getTime() : null;
    const gStat = group?.stats?.[0]?.stat;
    const gDir  = group?.stats?.[0]?.direction;
    const updated = rawAlerts.map(a => {
      if (idSet.has(a.id)) return { ...a, status: 'void', userDismissed: true };
      // Void les copies avec un ID différent mais même empreinte (date UTC à cheval sur minuit)
      if (group && a.status === 'accepted' && gStat && gDir &&
          a.player === group.player && a.stat === gStat && a.direction === gDir &&
          gTime && Math.abs(new Date(a.fixtureDate).getTime() - gTime) < 48 * 3600_000)
        return { ...a, status: 'void', userDismissed: true };
      return a;
    });
    try { cloudSet(ALERT_KEY, JSON.stringify(updated)); } catch {}
    setRawAlerts(updated);
  };

  const dismissBtts = (id) => {
    const updated = bttsAlerts.filter(a => a.id !== id);
    try { cloudSet(FB_BTTS_KEY, JSON.stringify(updated)); } catch {}
    setBttsAlerts(updated);
  };
  const dismissFbTotal = (id) => {
    const updated = fbTotalAlerts.filter(a => a.id !== id);
    try { cloudSet(FB_TOTAL_KEY, JSON.stringify(updated)); } catch {}
    setFbTotalAlerts(updated);
  };
  const dismissFbResult = (id) => {
    const updated = fbResultAlerts.filter(a => a.id !== id);
    try { cloudSet(FB_RESULT_KEY, JSON.stringify(updated)); } catch {}
    setFbResultAlerts(updated);
  };
  const dismissFbPinnacle = (id) => {
    const updated = fbPinnacleAlerts.filter(a => a.id !== id);
    try { cloudSet(FB_PINNACLE_KEY, JSON.stringify(updated)); } catch {}
    setFbPinnacleAlerts(updated);
  };
  const dismissBballPinnacle = (id) => {
    const updated = bballPinnacleAlerts.filter(a => a.id !== id);
    try { cloudSet(BBALL_PINNACLE_KEY, JSON.stringify(updated)); } catch {}
    setBballPinnacleAlerts(updated);
  };
  const dismissDcBtts = (id) => {
    const updated = dcBttsAlerts.filter(a => a.id !== id);
    try { cloudSet(FB_DC_BTTS_KEY, JSON.stringify(updated)); } catch {}
    setDcBttsAlerts(updated);
  };
  const dismissDcOu = (id) => {
    const updated = dcOuAlerts.filter(a => a.id !== id);
    try { cloudSet(FB_DC_OU_KEY, JSON.stringify(updated)); } catch {}
    setDcOuAlerts(updated);
  };

  const total = allAcceptedGroups.length;

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
        const isActive = (s, sd) => IN_GAME(s) || s === 'STATUS_FINAL'
          || (s === 'STATUS_SCHEDULED' && (sd?.homeScore > 0 || sd?.awayScore > 0));
        // Par défaut tout va en bas ; les matchs confirmés live/terminés montent en haut
        const liveGroups      = matchGroups.filter(m =>  scoresLoaded && isActive(scoreData[m.matchKey]?.status, scoreData[m.matchKey]));
        const scheduledGroups = matchGroups.filter(m => !scoresLoaded || !isActive(scoreData[m.matchKey]?.status, scoreData[m.matchKey]));
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {liveGroups.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-start' }}>
                {liveGroups.map(m => (
                  <div key={m.matchKey} style={{ width: 300, flexShrink: 0 }}>
                    <MatchGroup match={m} scoreData={scoreData[m.matchKey] || null} liveStats={liveStats} onDismiss={dismiss} />
                  </div>
                ))}
              </div>
            )}
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
