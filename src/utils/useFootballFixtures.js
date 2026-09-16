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
    // `id` (11 septembre 2026) — l'id numérique api-football était déjà présent sur la réponse
    // backend (`t.id`) mais jamais recopié ici, donc jamais disponible côté fixture pour composer
    // une compo par id direct : MatchDetailPage.jsx devait deviner l'équipe par correspondance de
    // NOM (dictionnaire ESPN_FOOTBALL, Big Five seulement, jamais construit pour Brésil/Grèce/
    // Arabie/Portugal/coupes d'Europe) — cause racine des compos manquantes sur ces championnats.
    id: t?.id ?? null,
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
    // Minute live (13 septembre 2026) — le backend la renvoie déjà, jamais recopiée ici jusqu'ici :
    // la fiche match retombait toujours sur le fallback "LIVE" générique (MatchDetailPage.jsx) au
    // lieu d'afficher la vraie minute, contrairement à WorldMapPage.jsx qui a son propre mapping et
    // l'inclut déjà.
    elapsed: m.elapsed ?? null,
    venue: { name: 'À définir', city: '', capacity: 0 },
    weather: { icon: '⚽', temp: 0, condition: '—', wind: 0, humidity: 0 },
    home: mapFdTeam(m.home),
    away: mapFdTeam(m.away),
    h2h: m.h2h || [],
  };
}

let _fdFixtures = null;
let _fdLoaded = false;
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
    // Exclu league==='bresil' (12 septembre 2026, bug matchs en double signalé par l'utilisateur) —
    // /api/fd/matches bundle en réalité les 5 grands championnats ET le Brésil (cf. commentaire de la
    // route côté server.js), mais useBresilFixtures() ci-dessous récupère déjà le Brésil séparément
    // via /api/fd/bresil (prefixe fdbr_, celui utilisé par les alertes/le règlement). Sans ce filtre,
    // chaque match brésilien apparaissait deux fois dans useFootballFixtures() — une fois en fd_xxx
    // (ici), une fois en fdbr_xxx (dédié) — visible notamment dans le menu déroulant "autres matchs"
    // de MatchDetailPage.jsx.
    _fdFixtures = (d.matches || []).filter(m => m.league !== 'bresil').map(mapFdMatch);
  } catch {
    _fdFixtures = _fdFixtures || [];
  }
  _fdFetching = false;
  _fdLoaded = true;
  notifyFd();
}

let _fdPollTimer = null;
function useFdFixtures() {
  const [fixtures, setFixtures] = useState(_fdFixtures || []);
  const [loaded, setLoaded] = useState(_fdLoaded);

  useEffect(() => {
    const update = (f) => { setFixtures(f); setLoaded(true); };
    _fdListeners.add(update);
    if (_fdFixtures) { setFixtures(_fdFixtures); setLoaded(true); }
    else if (!_fdFetching) fetchAndApplyFd();
    if (!_fdPollTimer) _fdPollTimer = setInterval(fetchAndApplyFd, LIVE_FIXTURES_POLL_MS);
    return () => {
      _fdListeners.delete(update);
      if (_fdListeners.size === 0 && _fdPollTimer) { clearInterval(_fdPollTimer); _fdPollTimer = null; }
    };
  }, []);

  return { fixtures, loaded };
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
    // Minute live (13 septembre 2026) — le backend la renvoie déjà, jamais recopiée ici jusqu'ici :
    // la fiche match retombait toujours sur le fallback "LIVE" générique (MatchDetailPage.jsx) au
    // lieu d'afficher la vraie minute, contrairement à WorldMapPage.jsx qui a son propre mapping et
    // l'inclut déjà.
    elapsed: m.elapsed ?? null,
    venue: { name: 'À définir', city: '', capacity: 0 },
    weather: { icon: '⚽', temp: 0, condition: '—', wind: 0, humidity: 0 },
    home: mapFdTeam(m.home),
    away: mapFdTeam(m.away),
    h2h: m.h2h || [],
  };
}

let _brFixtures = null;
let _brLoaded = false;
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
  _brLoaded = true;
  notifyBr();
}

let _brPollTimer = null;
function useBresilFixtures() {
  const [fixtures, setFixtures] = useState(_brFixtures || []);
  const [loaded, setLoaded] = useState(_brLoaded);

  useEffect(() => {
    const update = (f) => { setFixtures(f); setLoaded(true); };
    _brListeners.add(update);
    if (_brFixtures) { setFixtures(_brFixtures); setLoaded(true); }
    else if (!_brFetching) fetchAndApplyBr();
    if (!_brPollTimer) _brPollTimer = setInterval(fetchAndApplyBr, LIVE_FIXTURES_POLL_MS);
    return () => {
      _brListeners.delete(update);
      if (_brListeners.size === 0 && _brPollTimer) { clearInterval(_brPollTimer); _brPollTimer = null; }
    };
  }, []);

  return { fixtures, loaded };
}

// ── Grèce Super League (live, api-football) — 8 septembre 2026 ───────────────
// Même schéma que Brasileirão ci-dessus : source isolée /api/football/grece, jamais passée par
// football-data.org (contrairement au Brésil, migré depuis FD), préfixe grc_ dédié.
function mapGrMatch(m) {
  return {
    id: `grc_${m.id}`,
    league: 'grece',
    round: m.round || '',
    date: m.date,
    status: m.status || 'STATUS_SCHEDULED',
    // Minute live (13 septembre 2026) — le backend la renvoie déjà, jamais recopiée ici jusqu'ici :
    // la fiche match retombait toujours sur le fallback "LIVE" générique (MatchDetailPage.jsx) au
    // lieu d'afficher la vraie minute, contrairement à WorldMapPage.jsx qui a son propre mapping et
    // l'inclut déjà.
    elapsed: m.elapsed ?? null,
    venue: { name: 'À définir', city: '', capacity: 0 },
    weather: { icon: '⚽', temp: 0, condition: '—', wind: 0, humidity: 0 },
    home: mapFdTeam(m.home),
    away: mapFdTeam(m.away),
    h2h: m.h2h || [],
  };
}

let _grFixtures = null;
let _grLoaded = false;
let _grFetching = false;
let _grListeners = new Set();

function notifyGr() {
  _grListeners.forEach(fn => fn(_grFixtures));
}

async function fetchAndApplyGr() {
  if (_grFetching) return;
  _grFetching = true;
  try {
    const d = await fetch('/api/football/grece').then(r => r.json());
    _grFixtures = (d.matches || []).map(mapGrMatch);
  } catch {
    _grFixtures = _grFixtures || [];
  }
  _grFetching = false;
  _grLoaded = true;
  notifyGr();
}

let _grPollTimer = null;
function useGreceFixtures() {
  const [fixtures, setFixtures] = useState(_grFixtures || []);
  const [loaded, setLoaded] = useState(_grLoaded);

  useEffect(() => {
    const update = (f) => { setFixtures(f); setLoaded(true); };
    _grListeners.add(update);
    if (_grFixtures) { setFixtures(_grFixtures); setLoaded(true); }
    else if (!_grFetching) fetchAndApplyGr();
    if (!_grPollTimer) _grPollTimer = setInterval(fetchAndApplyGr, LIVE_FIXTURES_POLL_MS);
    return () => {
      _grListeners.delete(update);
      if (_grListeners.size === 0 && _grPollTimer) { clearInterval(_grPollTimer); _grPollTimer = null; }
    };
  }, []);

  return { fixtures, loaded };
}

// ── Arabie Saoudite Pro League (live, api-football) — 8 septembre 2026 ───────
// Même schéma que la Grèce ci-dessus, préfixe arb_ dédié.
function mapArMatch(m) {
  return {
    id: `arb_${m.id}`,
    league: 'arabie',
    round: m.round || '',
    date: m.date,
    status: m.status || 'STATUS_SCHEDULED',
    // Minute live (13 septembre 2026) — le backend la renvoie déjà, jamais recopiée ici jusqu'ici :
    // la fiche match retombait toujours sur le fallback "LIVE" générique (MatchDetailPage.jsx) au
    // lieu d'afficher la vraie minute, contrairement à WorldMapPage.jsx qui a son propre mapping et
    // l'inclut déjà.
    elapsed: m.elapsed ?? null,
    venue: { name: 'À définir', city: '', capacity: 0 },
    weather: { icon: '⚽', temp: 0, condition: '—', wind: 0, humidity: 0 },
    home: mapFdTeam(m.home),
    away: mapFdTeam(m.away),
    h2h: m.h2h || [],
  };
}

let _arFixtures = null;
let _arLoaded = false;
let _arFetching = false;
let _arListeners = new Set();

function notifyAr() {
  _arListeners.forEach(fn => fn(_arFixtures));
}

async function fetchAndApplyAr() {
  if (_arFetching) return;
  _arFetching = true;
  try {
    const d = await fetch('/api/football/arabie').then(r => r.json());
    _arFixtures = (d.matches || []).map(mapArMatch);
  } catch {
    _arFixtures = _arFixtures || [];
  }
  _arFetching = false;
  _arLoaded = true;
  notifyAr();
}

let _arPollTimer = null;
function useArabieFixtures() {
  const [fixtures, setFixtures] = useState(_arFixtures || []);
  const [loaded, setLoaded] = useState(_arLoaded);

  useEffect(() => {
    const update = (f) => { setFixtures(f); setLoaded(true); };
    _arListeners.add(update);
    if (_arFixtures) { setFixtures(_arFixtures); setLoaded(true); }
    else if (!_arFetching) fetchAndApplyAr();
    if (!_arPollTimer) _arPollTimer = setInterval(fetchAndApplyAr, LIVE_FIXTURES_POLL_MS);
    return () => {
      _arListeners.delete(update);
      if (_arListeners.size === 0 && _arPollTimer) { clearInterval(_arPollTimer); _arPollTimer = null; }
    };
  }, []);

  return { fixtures, loaded };
}

// ── Portugal Primeira Liga (live, api-football) — 9 septembre 2026 ───────────
// Même schéma que la Grèce/l'Arabie ci-dessus, préfixe por_ dédié.
function mapPtMatch(m) {
  return {
    id: `por_${m.id}`,
    league: 'portugal',
    round: m.round || '',
    date: m.date,
    status: m.status || 'STATUS_SCHEDULED',
    // Minute live (13 septembre 2026) — le backend la renvoie déjà, jamais recopiée ici jusqu'ici :
    // la fiche match retombait toujours sur le fallback "LIVE" générique (MatchDetailPage.jsx) au
    // lieu d'afficher la vraie minute, contrairement à WorldMapPage.jsx qui a son propre mapping et
    // l'inclut déjà.
    elapsed: m.elapsed ?? null,
    venue: { name: 'À définir', city: '', capacity: 0 },
    weather: { icon: '⚽', temp: 0, condition: '—', wind: 0, humidity: 0 },
    home: mapFdTeam(m.home),
    away: mapFdTeam(m.away),
    h2h: m.h2h || [],
  };
}

let _ptFixtures = null;
let _ptLoaded = false;
let _ptFetching = false;
let _ptListeners = new Set();

function notifyPt() {
  _ptListeners.forEach(fn => fn(_ptFixtures));
}

async function fetchAndApplyPt() {
  if (_ptFetching) return;
  _ptFetching = true;
  try {
    const d = await fetch('/api/football/portugal').then(r => r.json());
    _ptFixtures = (d.matches || []).map(mapPtMatch);
  } catch {
    _ptFixtures = _ptFixtures || [];
  }
  _ptFetching = false;
  _ptLoaded = true;
  notifyPt();
}

let _ptPollTimer = null;
function usePortugalFixtures() {
  const [fixtures, setFixtures] = useState(_ptFixtures || []);
  const [loaded, setLoaded] = useState(_ptLoaded);

  useEffect(() => {
    const update = (f) => { setFixtures(f); setLoaded(true); };
    _ptListeners.add(update);
    if (_ptFixtures) { setFixtures(_ptFixtures); setLoaded(true); }
    else if (!_ptFetching) fetchAndApplyPt();
    if (!_ptPollTimer) _ptPollTimer = setInterval(fetchAndApplyPt, LIVE_FIXTURES_POLL_MS);
    return () => {
      _ptListeners.delete(update);
      if (_ptListeners.size === 0 && _ptPollTimer) { clearInterval(_ptPollTimer); _ptPollTimer = null; }
    };
  }, []);

  return { fixtures, loaded };
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
    elapsed: m.elapsed ?? null,
    venue: { name: 'À définir', city: '', capacity: 0 },
    weather: { icon: '⚽', temp: 0, condition: '—', wind: 0, humidity: 0 },
    home: mapFdTeam(m.home),
    away: mapFdTeam(m.away),
    h2h: m.h2h || [],
  });

  let fixtures = null;
  let loadedFlag = false;
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
    loadedFlag = true;
    notify();
  }

  return function useEuCupFixtures() {
    const [state, setState] = useState(fixtures || []);
    const [loaded, setLoaded] = useState(loadedFlag);
    useEffect(() => {
      const update = (f) => { setState(f); setLoaded(true); };
      listeners.add(update);
      if (fixtures) { setState(fixtures); setLoaded(true); }
      else if (!fetching) fetchAndApply();
      if (!pollTimer) pollTimer = setInterval(fetchAndApply, LIVE_FIXTURES_POLL_MS);
      return () => {
        listeners.delete(update);
        if (listeners.size === 0 && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      };
    }, []);
    return { fixtures: state, loaded };
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
  const { fixtures: fd, loaded: fdLoaded } = useFdFixtures();
  const { fixtures: br, loaded: brLoaded } = useBresilFixtures();
  const { fixtures: gr, loaded: grLoaded } = useGreceFixtures();
  const { fixtures: ar, loaded: arLoaded } = useArabieFixtures();
  const { fixtures: pt, loaded: ptLoaded } = usePortugalFixtures();
  const { fixtures: europa, loaded: europaLoaded } = useEuropaFixtures();
  const { fixtures: conference, loaded: conferenceLoaded } = useConferenceFixtures();
  const { fixtures: champions, loaded: championsLoaded } = useChampionsFixtures();
  const liveLeagues = new Set([...fd.map(f => f.league), ...br.map(f => f.league), ...gr.map(f => f.league), ...ar.map(f => f.league), ...pt.map(f => f.league), ...europa.map(f => f.league), ...conference.map(f => f.league), ...champions.map(f => f.league)]);
  const staticFixtures = FIXTURES.filter(f => !liveLeagues.has(f.league));
  // Fix 13 septembre 2026 — `loading` ne dépendait que de `cdmLoaded` (CDM = compétition terminée
  // depuis longtemps, prochaine édition en 2030, son fetch est minuscule et se termine quasi
  // instantanément). Résultat : dès que la CDM avait fini de charger, MatchDetailPage.jsx considérait
  // TOUT comme chargé et affichait "Match introuvable" si un des 8 autres flux (5 grands
  // championnats/Brésil/Grèce/Arabie/Portugal/3 coupes d'Europe — bien plus lourds à charger, surtout
  // en production où /api/fd/matches traite 6 championnats par requête) n'avait pas encore livré ses
  // données. Cas réel signalé : clic sur Alaves-Valencia (La Liga) depuis Running → "Match
  // introuvable" transitoire, imperceptible en local (latence quasi nulle) mais bien réel en
  // production. `loading` attend désormais que LES 9 sources aient fini leur 1er chargement.
  const loading = !cdmLoaded || !fdLoaded || !brLoaded || !grLoaded || !arLoaded || !ptLoaded || !europaLoaded || !conferenceLoaded || !championsLoaded;
  return { fixtures: [...staticFixtures, ...fd, ...br, ...gr, ...ar, ...pt, ...europa, ...conference, ...champions, ...cdm], loading };
}
