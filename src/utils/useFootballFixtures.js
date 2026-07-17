import { useState, useEffect } from 'react';
import { FIXTURES } from './fixtures';

// Module-level singleton — one fetch per app session, shared across all pages
let _cdmFixtures = null;
let _fetching = false;
let _cdmLoaded = false;
let _listeners = new Set();

function notify() {
  _listeners.forEach(fn => fn(_cdmFixtures));
}

// Stats équipe pas encore disponibles pour les sélections nationales (CDM) —
// valeurs neutres pour que StatBar/FormStrip s'affichent sans planter.
const NEUTRAL_TEAM_STATS = {
  goalsFor: 0, goalsAgainst: 0, xG: 0, xGA: 0,
  shotsPerGame: 0, shotsOnTarget: 0, possession: 0,
  form: [], upcoming: [],
};

function mapTeam(t) {
  return { name: t?.name, short: t?.short, logoId: t?.logo, score: t?.score ?? null, ...NEUTRAL_TEAM_STATS };
}

function mapGame(g) {
  return {
    id: `fdcdm_${g.id}`,
    league: 'cdm',
    round: g.round || '',
    date: g.date,
    status: g.status,
    venue: { name: 'À définir', city: '', capacity: 0 },
    weather: { icon: '🌍', temp: 0, condition: '—', wind: 0, humidity: 0 },
    home: mapTeam(g.home),
    away: mapTeam(g.away),
    h2h: [],
  };
}

async function fetchAndApply() {
  if (_fetching) return;
  _fetching = true;
  try {
    const d = await fetch('/api/fd/worldcup').then(r => r.json());
    _cdmFixtures = (d.games || []).map(mapGame);
  } catch {
    _cdmFixtures = _cdmFixtures || [];
  }
  _fetching = false;
  _cdmLoaded = true;
  notify();
}

function useCdmFixtures() {
  const [fixtures, setFixtures] = useState(_cdmFixtures || []);
  const [loaded, setLoaded] = useState(_cdmLoaded);

  useEffect(() => {
    const update = (f) => { setFixtures(f); setLoaded(true); };
    _listeners.add(update);
    if (_cdmFixtures) { setFixtures(_cdmFixtures); setLoaded(true); }
    else if (!_fetching) fetchAndApply();
    return () => _listeners.delete(update);
  }, []);

  return { fixtures, loaded };
}

// ── 5 grands championnats (live, football-data.org) ──────────────────────────

// Stats avancées (xG, tirs, possession) pas fournies par football-data.org —
// neutres en attendant un upgrade api-football Pro (cf. project_xg_upgrade).
const NEUTRAL_ADV_STATS = { xG: 0, xGA: 0, shotsPerGame: 0, shotsOnTarget: 0, possession: 0, upcoming: [] };

function mapFdTeam(t) {
  return {
    name: t?.name, short: t?.short, logoId: t?.logoId, score: null,
    position: t?.position ?? null, points: t?.points ?? null, played: t?.played ?? 0,
    wins: t?.wins ?? 0, draws: t?.draws ?? 0, losses: t?.losses ?? 0,
    goalsFor: t?.goalsFor ?? 0, goalsAgainst: t?.goalsAgainst ?? 0,
    form: t?.form || [],
    ...NEUTRAL_ADV_STATS,
  };
}

function mapFdMatch(m) {
  return {
    id: `fd_${m.id}`,
    league: m.league,
    round: m.round || '',
    date: m.date,
    status: 'STATUS_SCHEDULED',
    venue: { name: 'À définir', city: '', capacity: 0 },
    weather: { icon: '⚽', temp: 0, condition: '—', wind: 0, humidity: 0 },
    home: mapFdTeam(m.home),
    away: mapFdTeam(m.away),
    h2h: m.h2h || [],
  };
}

let _fdFixtures = null;
let _fdFetching = false;
let _fdListeners = new Set();

function notifyFd() {
  _fdListeners.forEach(fn => fn(_fdFixtures));
}

async function fetchAndApplyFd() {
  if (_fdFetching) return;
  _fdFetching = true;
  try {
    const d = await fetch('/api/fd/matches').then(r => r.json());
    _fdFixtures = (d.matches || []).map(mapFdMatch);
  } catch {
    _fdFixtures = _fdFixtures || [];
  }
  _fdFetching = false;
  notifyFd();
}

function useFdFixtures() {
  const [fixtures, setFixtures] = useState(_fdFixtures || []);

  useEffect(() => {
    _fdListeners.add(setFixtures);
    if (_fdFixtures) setFixtures(_fdFixtures);
    else if (!_fdFetching) fetchAndApplyFd();
    return () => _fdListeners.delete(setFixtures);
  }, []);

  return fixtures;
}

// ── Brasileirão (live, football-data.org BSA) — 17 juillet 2026 ──────────────
// Isolé de _fdFixtures/useFdFixtures (5 grands championnats) : source séparée /api/fd/bresil,
// même prefixe fdbr_ que generateBackgroundAlerts (server.js) et WorldMapPage pour que le
// fixtureId d'une alerte pointe bien vers le même match ici.
function mapBrMatch(m) {
  return {
    id: `fdbr_${m.id}`,
    league: 'bresil',
    round: m.round || '',
    date: m.date,
    status: 'STATUS_SCHEDULED',
    venue: { name: 'À définir', city: '', capacity: 0 },
    weather: { icon: '⚽', temp: 0, condition: '—', wind: 0, humidity: 0 },
    home: mapFdTeam(m.home),
    away: mapFdTeam(m.away),
    h2h: m.h2h || [],
  };
}

let _brFixtures = null;
let _brFetching = false;
let _brListeners = new Set();

function notifyBr() {
  _brListeners.forEach(fn => fn(_brFixtures));
}

async function fetchAndApplyBr() {
  if (_brFetching) return;
  _brFetching = true;
  try {
    const d = await fetch('/api/fd/bresil').then(r => r.json());
    _brFixtures = (d.matches || []).map(mapBrMatch);
  } catch {
    _brFixtures = _brFixtures || [];
  }
  _brFetching = false;
  notifyBr();
}

function useBresilFixtures() {
  const [fixtures, setFixtures] = useState(_brFixtures || []);

  useEffect(() => {
    _brListeners.add(setFixtures);
    if (_brFixtures) setFixtures(_brFixtures);
    else if (!_brFetching) fetchAndApplyBr();
    return () => _brListeners.delete(setFixtures);
  }, []);

  return fixtures;
}

// FIXTURES (statiques) + 5 championnats (live, football-data.org) + CDM (live) + Brasileirão (live)
// Pour une ligue donnée, les fixtures live remplacent les statiques dès qu'elles
// sont disponibles (sinon fallback statique, ex: hors-saison).
export function useFootballFixtures() {
  const { fixtures: cdm, loaded: cdmLoaded } = useCdmFixtures();
  const fd = useFdFixtures();
  const br = useBresilFixtures();
  const liveLeagues = new Set([...fd.map(f => f.league), ...br.map(f => f.league)]);
  const staticFixtures = FIXTURES.filter(f => !liveLeagues.has(f.league));
  return { fixtures: [...staticFixtures, ...fd, ...br, ...cdm], loading: !cdmLoaded };
}
