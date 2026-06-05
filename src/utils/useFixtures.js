import { useState, useEffect } from 'react';
import { BBALL_FIXTURES } from './basketball';

const ESPN_SHORT = { SA: 'SAS', NY: 'NYK', GS: 'GSW', NO: 'NOP', UT: 'UTA' };
const norm = a => ESPN_SHORT[a?.toUpperCase()] || a?.toUpperCase() || '';

const ROUND_FR = [
  [/nba\s*finals/i,                       'Finales NBA'],
  [/west.*finals|western.*finals/i,        'Finales Conf. Ouest'],
  [/east.*finals|eastern.*finals/i,        'Finales Conf. Est'],
  [/conference\s*finals/i,                 'Finales Conf.'],
  [/second\s*round|semifinals/i,           'Demi-Finales Conf.'],
  [/first\s*round/i,                       'Premier Tour'],
];

function mapRoundFr(note) {
  for (const [re, label] of ROUND_FR) {
    if (re.test(note)) return label;
  }
  return note;
}

function findTeamData(short) {
  for (const f of BBALL_FIXTURES) {
    if (f.home?.short === short) return f.home;
    if (f.away?.short === short) return f.away;
  }
  return null;
}

function makeAutoFixture(upcoming, patches) {
  const h2h = patches
    .filter(p =>
      (p.home === upcoming.home && p.away === upcoming.away) ||
      (p.home === upcoming.away && p.away === upcoming.home)
    )
    .map(p => ({
      date: p.date.slice(0, 10),
      home: p.home, away: p.away,
      scoreHome: p.homeScore, scoreAway: p.awayScore,
    }));

  const prefix   = mapRoundFr(upcoming.note);
  const round    = upcoming.gameNum ? `${prefix} – Game ${upcoming.gameNum}` : prefix;
  const homeData = findTeamData(upcoming.home);
  const awayData = findTeamData(upcoming.away);

  return {
    id:     `espn_${upcoming.espnId}`,
    league: 'nba',
    home:   { ...(homeData || {}), name: upcoming.homeName, short: upcoming.home, logoId: upcoming.home.toLowerCase(), score: null },
    away:   { ...(awayData || {}), name: upcoming.awayName, short: upcoming.away, logoId: upcoming.away.toLowerCase(), score: null },
    date:   upcoming.date,
    round,
    h2h,
    venue:  upcoming.venue || null,
    _auto:  true,
  };
}

// Module-level singleton — one fetch per app session, shared across all pages
let _patched = null;
let _fetching = false;
let _listeners = new Set();

function notify() {
  _listeners.forEach(fn => fn(_patched));
}

async function fetchAndApply() {
  if (_fetching) return;
  _fetching = true;
  try {
    const [nbaRes, elRes] = await Promise.all([
      fetch('/api/nba/playoff-patch').then(r => r.json()).catch(() => ({ patches: [] })),
      fetch('/api/euroleague/scoreboard').then(r => r.json()).catch(() => ({ games: [] })),
    ]);
    const elByCode = {};
    for (const g of elRes.games || []) {
      if (g.gameCode) elByCode[g.gameCode] = g;
    }
    const patches  = nbaRes.patches  || [];
    const upcoming = nbaRes.upcoming || [];

    _patched = BBALL_FIXTURES.map(f => {
      if (f.league === 'nba')        return applyNbaPatch(f, patches);
      if (f.league === 'euroleague') return applyElPatch(f, elByCode);
      return f;
    });

    // Ajoute les fixtures PO non encore présentes dans basketball.js
    for (const u of upcoming) {
      const alreadyExists = _patched.some(f => {
        const fHome = norm(f.home?.short);
        const fAway = norm(f.away?.short);
        return fHome === u.home && fAway === u.away &&
          Math.abs(new Date(f.date).getTime() - new Date(u.date).getTime()) < 6 * 3600 * 1000;
      });
      if (!alreadyExists) _patched.push(makeAutoFixture(u, patches));
    }
  } catch {}
  _fetching = false;
  notify();
}

function applyNbaPatch(f, patches) {
  const homeAbbr = norm(f.home?.short);
  const awayAbbr = norm(f.away?.short);
  const fixtureMs = new Date(f.date).getTime();

  const match = patches.find(p =>
    p.home === homeAbbr && p.away === awayAbbr &&
    Math.abs(new Date(p.date).getTime() - fixtureMs) < 30 * 3600 * 1000
  );
  if (!match) return f;

  const prefix = f.round.split('–')[0].trim();
  // Game number: ESPN series data often missing → fall back to fixture round
  const gNum = match.gameNum || (f.round.match(/game\s*(\d+)/i)?.[1] ? parseInt(f.round.match(/game\s*(\d+)/i)[1]) : null);
  const gameTag = gNum ? ` G${gNum}` : '';
  const winner = match.homeScore > match.awayScore ? homeAbbr : awayAbbr;
  const loser  = winner === homeAbbr ? awayAbbr : homeAbbr;

  // Series wins: ESPN competitors often empty → parse seriesSummary ("Series tied 2-2", "SA leads series 1-0")
  let wW = match.seriesWins[winner];
  let lW = match.seriesWins[loser];
  if (wW == null || lW == null) {
    const summary = match.seriesSummary || '';
    const tied  = summary.match(/tied\s+(\d+)-(\d+)/i);
    const leads = summary.match(/(\S+)\s+leads.*?(\d+)-(\d+)/i);
    if (tied) {
      wW = tied[1]; lW = tied[2];
    } else if (leads) {
      const leader = norm(leads[1]);
      wW = leader === winner ? leads[2] : leads[3];
      lW = leader === winner ? leads[3] : leads[2];
    } else {
      wW = '?'; lW = '?';
    }
  }
  const round = `${prefix} – Terminée${gameTag} (${winner} ${wW}-${lW})`;

  const dateStr = match.date.slice(0, 10);
  const newEntry = { date: dateStr, home: homeAbbr, away: awayAbbr, scoreHome: match.homeScore, scoreAway: match.awayScore };
  const h2h = f.h2h?.some(h => h.date === dateStr) ? f.h2h : [...(f.h2h || []), newEntry];

  return {
    ...f,
    home: { ...f.home, score: match.homeScore },
    away: { ...f.away, score: match.awayScore },
    round,
    h2h,
  };
}

function applyElPatch(f, elByCode) {
  if (!f.elGameCode) return f;
  const g = elByCode[f.elGameCode];
  if (!g) return f;

  const isFinal = g.status === 'STATUS_FINAL';
  const isLive  = g.status === 'STATUS_IN_PROGRESS';
  if (!isFinal && !isLive) return f;

  const homeScore = g.localScore ?? null;
  const awayScore = g.roadScore  ?? null;

  let round = f.round;
  if (isFinal && !round.includes('Terminé')) {
    const prefix = round.split('–')[0].trim();
    const winner = homeScore > awayScore ? f.home.short : f.away.short;
    round = `${prefix} – Terminée (${winner} ${homeScore}-${awayScore})`;
  }

  return {
    ...f,
    home:   { ...f.home, score: homeScore },
    away:   { ...f.away, score: awayScore },
    status: g.status,
    round,
  };
}

export function useFixtures() {
  const [fixtures, setFixtures] = useState(_patched || BBALL_FIXTURES);

  useEffect(() => {
    _listeners.add(setFixtures);
    if (_patched) setFixtures(_patched);
    else if (!_fetching) fetchAndApply();
    return () => _listeners.delete(setFixtures);
  }, []);

  return fixtures;
}

export function useFixture(id) {
  const fixtures = useFixtures();
  return fixtures.find(f => f.id === id) || null;
}

export function useFixturesByLeague(leagueId) {
  const fixtures = useFixtures();
  return fixtures.filter(f => f.league === leagueId);
}
