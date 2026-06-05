const CACHE_TTL = 5 * 60 * 1000;

let _footballMatches = null;
let _footballTs = 0;

// ── football-data.org (TEST) ──────────────────────────────────────────────────

let _fdMatches = null;
let _fdTs = 0;

export async function fetchFdMatches() {
  if (_fdMatches && Date.now() - _fdTs < CACHE_TTL) {
    return { matches: _fdMatches, source: 'cache' };
  }
  const resp = await fetch('/api/fd/matches');
  if (!resp.ok) return null;
  const { matches } = await resp.json();
  if (!matches?.length) return null;
  _fdMatches = matches;
  _fdTs = Date.now();
  return { matches, source: 'api' };
}

export async function fetchFdMatchById(id) {
  if (_fdMatches) {
    const found = _fdMatches.find(m => m.id === id);
    if (found) return found;
  }
  const result = await fetchFdMatches();
  return result?.matches?.find(m => m.id === id) ?? null;
}

// ── API-Football ──────────────────────────────────────────────────────────────

export async function fetchFootballMatches() {
  if (_footballMatches && Date.now() - _footballTs < CACHE_TTL) {
    return { matches: _footballMatches, source: 'cache' };
  }
  const resp = await fetch('/api/football/matches');
  if (!resp.ok) return null;
  const { matches } = await resp.json();
  _footballMatches = matches;
  _footballTs = Date.now();
  return { matches, source: 'api' };
}

export async function fetchFootballMatchById(id) {
  if (_footballMatches) {
    const found = _footballMatches.find(m => m.id === id);
    if (found) return found;
  }
  const result = await fetchFootballMatches();
  return result?.matches?.find(m => m.id === id) ?? null;
}

export async function fetchH2H(homeId, awayId) {
  const resp = await fetch(`/api/football/h2h/${homeId}/${awayId}`);
  if (!resp.ok) return [];
  const { h2h } = await resp.json();
  return h2h || [];
}

// ── The Odds API (cotes bookmakers) ──────────────────────────────────────────

const SPORT_TO_LEAGUE = {
  soccer_france_ligue1:          'ligue1',
  soccer_epl:                    'pl',
  soccer_spain_la_liga:          'laliga',
  soccer_germany_bundesliga:     'bundes',
  soccer_italy_serie_a:          'seriea',
  soccer_netherlands_eredivisie: 'eredivisie',
};

let _oddsMatches = null;
let _oddsTs = 0;

function abbrev(name) {
  const parts = name.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.map(w => w[0].toUpperCase()).join('').slice(0, 4);
}

function normalizeOddsMatch(raw) {
  return {
    id: raw.id,
    league: SPORT_TO_LEAGUE[raw.sportKey] || 'unknown',
    round: '',
    date: raw.commenceTime,
    venue: null,
    weather: null,
    markets: raw.markets || {},
    isLive: true,
    home: { name: raw.homeTeam, short: abbrev(raw.homeTeam), logoId: null, position: null, points: null, form: [], upcoming: [] },
    away: { name: raw.awayTeam, short: abbrev(raw.awayTeam), logoId: null, position: null, points: null, form: [], upcoming: [] },
    h2h: [],
  };
}

export async function fetchOdds() {
  if (_oddsMatches && Date.now() - _oddsTs < CACHE_TTL) {
    return { matches: _oddsMatches, source: 'cache' };
  }
  const resp = await fetch('/api/odds');
  if (!resp.ok) return null;
  const { matches } = await resp.json();
  _oddsMatches = matches.map(normalizeOddsMatch);
  _oddsTs = Date.now();
  return { matches: _oddsMatches, source: 'api' };
}
