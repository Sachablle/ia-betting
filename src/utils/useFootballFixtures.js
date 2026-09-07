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

// Sondage périodique (3 septembre 2026) — avant ce fix, chaque source de fixtures live de ce fichier
// ne se chargeait qu'UNE FOIS par session de navigateur (singleton module-level, jamais rafraîchi
// tant que la page n'est pas rechargée entièrement) : un match passant "programmé" → "en direct"
// restait figé indéfiniment dans un onglet resté ouvert, contrairement au NBA/WNBA (déjà sondés en
// direct). Cas réel : Real Sociedad-Celta affiché encore "21:00" alors que le match était déjà en
// cours depuis longtemps. Un seul minuteur partagé par source (pas un par composant abonné),
// démarré au 1er abonné et arrêté au dernier — même intervalle que le sondage 60s déjà utilisé côté
// Carte du Monde pour la même raison.
const LIVE_FIXTURES_POLL_MS = 60_000;
let _cdmPollTimer = null;
function useCdmFixtures() {
  const [fixtures, setFixtures] = useState(_cdmFixtures || []);
  const [loaded, setLoaded] = useState(_cdmLoaded);

  useEffect(() => {
    const update = (f) => { setFixtures(f); setLoaded(true); };
    _listeners.add(update);
    if (_cdmFixtures) { setFixtures(_cdmFixtures); setLoaded(true); }
    else if (!_fetching) fetchAndApply();
    if (!_cdmPollTimer) _cdmPollTimer = setInterval(fetchAndApply, LIVE_FIXTURES_POLL_MS);
    return () => {
      _listeners.delete(update);
      if (_listeners.size === 0 && _cdmPollTimer) { clearInterval(_cdmPollTimer); _cdmPollTimer = null; }
    };
  }, []);

  return { fixtures, loaded };
}

// ── 5 grands championnats (live, football-data.org) ──────────────────────────

// Stats avancées (xG, tirs, possession) pas fournies par football-data.org —
// neutres en attendant un upgrade api-football Pro (cf. project_xg_upgrade).
const NEUTRAL_ADV_STATS = { xG: 0, xGA: 0, shotsPerGame: 0, shotsOnTarget: 0, possession: 0, upcoming: [] };

function mapFdTeam(t) {
  return {
    name: t?.name, short: t?.short, logoId: t?.logoId, score: t?.score ?? null,
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
    // Auparavant toujours 'STATUS_SCHEDULED' en dur — /api/fd/matches ne renvoyait jamais que des
    // matchs à venir, donc c'était toujours vrai. Fix 29 août 2026 : la route inclut désormais aussi
    // les matchs récemment terminés (fixe "Match introuvable" sur la fiche match), avec leur vrai
    // statut (`STATUS_IN_PROGRESS`/`STATUS_FINAL`) — il faut le lire au lieu de l'écraser, sinon un
    // match terminé s'affiche encore comme "à venir".
    status: m.status || 'STATUS_SCHEDULED',
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

let _fdPollTimer = null;
function useFdFixtures() {
  const [fixtures, setFixtures] = useState(_fdFixtures || []);

  useEffect(() => {
    _fdListeners.add(setFixtures);
    if (_fdFixtures) setFixtures(_fdFixtures);
    else if (!_fdFetching) fetchAndApplyFd();
    if (!_fdPollTimer) _fdPollTimer = setInterval(fetchAndApplyFd, LIVE_FIXTURES_POLL_MS);
    return () => {
      _fdListeners.delete(setFixtures);
      if (_fdListeners.size === 0 && _fdPollTimer) { clearInterval(_fdPollTimer); _fdPollTimer = null; }
    };
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
    status: m.status || 'STATUS_SCHEDULED',
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

let _brPollTimer = null;
function useBresilFixtures() {
  const [fixtures, setFixtures] = useState(_brFixtures || []);

  useEffect(() => {
    _brListeners.add(setFixtures);
    if (_brFixtures) setFixtures(_brFixtures);
    else if (!_brFetching) fetchAndApplyBr();
    if (!_brPollTimer) _brPollTimer = setInterval(fetchAndApplyBr, LIVE_FIXTURES_POLL_MS);
    return () => {
      _brListeners.delete(setFixtures);
      if (_brListeners.size === 0 && _brPollTimer) { clearInterval(_brPollTimer); _brPollTimer = null; }
    };
  }, []);

  return fixtures;
}

// ── Coupes européennes de clubs (live, api-football) — 23 juillet 2026 ────────
// Même schéma que Brasileirão ci-dessus : source séparée /api/football/eucup/<comp>/matches,
// même préfixe que generateBackgroundAlerts (server.js) et WorldMapPage. Factory réutilisée pour
// Europa League, Conference League et Ligue des Champions (3 instances indépendantes, même code).
const EU_CUP_PREFIX = { europa: 'afel', conference: 'afcl', champions: 'afch' };

function makeEuCupFixturesHook(compKey) {
  const prefix = EU_CUP_PREFIX[compKey];
  const mapMatch = m => ({
    id: `${prefix}_${m.id}`,
    league: compKey,
    round: m.round || '',
    date: m.date,
    status: m.status || 'STATUS_SCHEDULED',
    venue: { name: 'À définir', city: '', capacity: 0 },
    weather: { icon: '⚽', temp: 0, condition: '—', wind: 0, humidity: 0 },
    home: mapFdTeam(m.home),
    away: mapFdTeam(m.away),
    h2h: m.h2h || [],
  });

  let fixtures = null;
  let fetching = false;
  let pollTimer = null;
  const listeners = new Set();
  const notify = () => listeners.forEach(fn => fn(fixtures));

  async function fetchAndApply() {
    if (fetching) return;
    fetching = true;
    try {
      const d = await fetch(`/api/football/eucup/${compKey}/matches`).then(r => r.json());
      fixtures = (d.matches || []).map(mapMatch);
    } catch {
      fixtures = fixtures || [];
    }
    fetching = false;
    notify();
  }

  return function useEuCupFixtures() {
    const [state, setState] = useState(fixtures || []);
    useEffect(() => {
      listeners.add(setState);
      if (fixtures) setState(fixtures);
      else if (!fetching) fetchAndApply();
      if (!pollTimer) pollTimer = setInterval(fetchAndApply, LIVE_FIXTURES_POLL_MS);
      return () => {
        listeners.delete(setState);
        if (listeners.size === 0 && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      };
    }, []);
    return state;
  };
}

const useEuropaFixtures    = makeEuCupFixturesHook('europa');
const useConferenceFixtures = makeEuCupFixturesHook('conference');
const useChampionsFixtures  = makeEuCupFixturesHook('champions');

// FIXTURES (statiques) + 5 championnats (live, football-data.org) + CDM (live) + Brasileirão (live)
// + coupes européennes de clubs (live, api-football)
// Pour une ligue donnée, les fixtures live remplacent les statiques dès qu'elles
// sont disponibles (sinon fallback statique, ex: hors-saison).
export function useFootballFixtures() {
  const { fixtures: cdm, loaded: cdmLoaded } = useCdmFixtures();
  const fd = useFdFixtures();
  const br = useBresilFixtures();
  const europa = useEuropaFixtures();
  const conference = useConferenceFixtures();
  const champions = useChampionsFixtures();
  const liveLeagues = new Set([...fd.map(f => f.league), ...br.map(f => f.league), ...europa.map(f => f.league), ...conference.map(f => f.league), ...champions.map(f => f.league)]);
  const staticFixtures = FIXTURES.filter(f => !liveLeagues.has(f.league));
  return { fixtures: [...staticFixtures, ...fd, ...br, ...europa, ...conference, ...champions, ...cdm], loading: !cdmLoaded };
}
