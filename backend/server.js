import 'dotenv/config'; // r
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { readFileSync, writeFileSync, writeFile, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import { computeEstimate, calcStd, isConsistentStat, winsorizeRecent, getShotVolumeAnchor, probAtLeast, tCDF4, getRestFactor, getScheduleDensityFactor, isPlayoffRound, toDefCat } from './compute.js';
import { computeLambdas, computeBTTSProb, computeOUProb, compute1X2Probs } from './computeFootball.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR   = join(__dirname, 'cache');
const ODDS_CACHE_FILE = join(CACHE_DIR, 'odds.json');
const SNAPSHOT_FILE   = join(CACHE_DIR, 'projections-snapshot.json');
const LINES_FILE      = join(CACHE_DIR, 'player-lines-snapshot.json');
const EURO_LINEUPS_FILE    = join(CACHE_DIR, 'euro_lineups.json');
const WORLDCUP_CACHE_FILE  = join(CACHE_DIR, 'worldcup.json');
const FD_MATCHES_CACHE_FILE = join(CACHE_DIR, 'fd_matches.json');
const GAMELOGS_CACHE_FILE  = join(CACHE_DIR, 'gamelogs_cache.json');
const SCRAPER_BLOCK_FILE   = join(CACHE_DIR, 'scraper_blocks.json');
const OUTRIGHTS_CACHE_FILE = join(CACHE_DIR, 'outrights.json');
const OUTRIGHT_ATTEMPTS_FILE = join(CACHE_DIR, 'outright_attempts.json');

// Cache persistant gamelogs — survit aux redémarrages, jamais remplacé par moins de données
let _glPersist = {};
try { if (existsSync(GAMELOGS_CACHE_FILE)) _glPersist = JSON.parse(readFileSync(GAMELOGS_CACHE_FILE, 'utf8')); } catch {}
let _glSaveTimer = null;
function _saveGlPersist() {
  if (_glSaveTimer) clearTimeout(_glSaveTimer);
  _glSaveTimer = setTimeout(() => {
    _glSaveTimer = null;
    writeFile(GAMELOGS_CACHE_FILE, JSON.stringify(_glPersist), 'utf8', () => {});
  }, 2000);
}
function _updateGlCache(key, games) {
  const prev = _glPersist[key]?.games || [];
  if (games.length >= prev.length && games.length > 0) {
    _glPersist[key] = { games, updatedAt: Date.now() };
    _saveGlPersist();
    return games;
  }
  return prev.length > 0 ? prev : games;
}
const ACCEPTED_FILE        = join(CACHE_DIR, 'accepted_alerts.json');
const SETTLEMENTS_FILE     = join(CACHE_DIR, 'settlements.json');

let _acceptedAlerts = [];
let _settlements    = [];
try { if (existsSync(ACCEPTED_FILE))    _acceptedAlerts = JSON.parse(readFileSync(ACCEPTED_FILE,    'utf8')); } catch {}
try {
  if (existsSync(SETTLEMENTS_FILE)) {
    const raw = JSON.parse(readFileSync(SETTLEMENTS_FILE, 'utf8'));
    // Déduplique par id : garde seulement le dernier settlement pour chaque ID — les entrées
    // purge (pas d'id, juste player/date) sont préservées telles quelles, pas concernées par
    // ce dédoublonnage (bug corrigé 23 juin 2026 : elles étaient silencieusement supprimées à
    // chaque redémarrage car `if (s.id)` est faux pour elles).
    const dedup = {}; const purges = [];
    for (const s of raw) { if (s.id) dedup[s.id] = s; else if (s.purge) purges.push(s); }
    _settlements = [...Object.values(dedup), ...purges];
    if (_settlements.length < raw.length) writeFileSync(SETTLEMENTS_FILE, JSON.stringify(_settlements), 'utf8');
    // Retire de _acceptedAlerts les alertes déjà settlées
    const settled = new Set(_settlements.map(s => s.id));
    _acceptedAlerts = _acceptedAlerts.filter(a => !settled.has(a.id));
    writeFileSync(ACCEPTED_FILE, JSON.stringify(_acceptedAlerts), 'utf8');
  }
} catch {}
const _saveAccepted    = () => { try { writeFileSync(ACCEPTED_FILE,    JSON.stringify(_acceptedAlerts), 'utf8'); } catch {} };
const _saveSettlements = () => { try { writeFileSync(SETTLEMENTS_FILE, JSON.stringify(_settlements),    'utf8'); } catch {} };
const EURO_CUSTOM_PLAYERS_FILE = join(CACHE_DIR, 'euro_custom_players.json');
const EURO_PLAYER_TEAMS_FILE = join(CACHE_DIR, 'euro_player_teams.json');

// Map persistante : playerName → { league, teamId, teamName } — mis à jour via scraping props bookmakers
let _euroPlayerTeams = {};
try { if (existsSync(EURO_PLAYER_TEAMS_FILE)) _euroPlayerTeams = JSON.parse(readFileSync(EURO_PLAYER_TEAMS_FILE, 'utf8')); } catch {}
function _saveEuroPlayerTeams() {
  try { writeFileSync(EURO_PLAYER_TEAMS_FILE, JSON.stringify(_euroPlayerTeams), 'utf8'); } catch {}
}

// Compos EU persistantes — clé : `${league}_${teamId}`
let _euroLineups = {};
try {
  if (existsSync(EURO_LINEUPS_FILE)) _euroLineups = JSON.parse(readFileSync(EURO_LINEUPS_FILE, 'utf8'));
} catch {}
function _saveEuroLineups() {
  try { writeFileSync(EURO_LINEUPS_FILE, JSON.stringify(_euroLineups), 'utf8'); } catch {}
}
function _storeTeamLineup(league, teamId, starters, opponent, date, confirmed = false, outPlayers = []) {
  _euroLineups[`${league}_${teamId}`] = { starters, opponent, date, confirmed, outPlayers, savedAt: Date.now() };
  _saveEuroLineups();
}
const ODDS_TTL    = 30 * 60 * 1000; // 30 min

function _loadOddsCacheFromDisk() {
  try {
    if (existsSync(ODDS_CACHE_FILE)) {
      const parsed = JSON.parse(readFileSync(ODDS_CACHE_FILE, 'utf8'));
      if (parsed?.ts && parsed?.data) return parsed;
    }
  } catch {}
  return { data: null, ts: 0 };
}

function _saveOddsCacheToDisk(data) {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(ODDS_CACHE_FILE, JSON.stringify({ data, ts: Date.now() }), 'utf8');
  } catch (e) {
    console.error('Failed to save odds cache to disk:', e.message);
  }
}

let _oddsCache = _loadOddsCacheFromDisk();

// Stale-while-revalidate : évite de faire attendre une requête derrière un scrape
// (jitter anti-ban ~200ms-1.5s) quand on a déjà une réponse en cache, même expirée.
// Un Set de clés en cours de rafraîchissement empêche les refresh concurrents.
const _bgRefreshing = new Set();
function _refreshInBackground(key, refreshFn) {
  if (_bgRefreshing.has(key)) return;
  _bgRefreshing.add(key);
  Promise.resolve()
    .then(refreshFn)
    .catch(err => console.error(`Background refresh (${key}):`, err.message))
    .finally(() => _bgRefreshing.delete(key));
}

const app = express();
const PORT = process.env.PORT || 3001;

const THRESHOLD     = parseFloat(process.env.VALUE_THRESHOLD || '2') / 100;
const PINNACLE_EDGE_THRESHOLD = 0.20; // Seuil alertes diff Pinnacle — erreur de cote franche uniquement
const PINNACLE_MIN_ODDS = 1.60;       // Cote bookmaker minimum pour alertes Pinnacle
const BOOKMAKERS    = 'pinnacle,betfair_ex_eu,unibet_fr,betclic';
const REGIONS       = 'eu';
const MARKETS       = 'h2h,btts';
const ODDS_SPORTS   = [
  'soccer_france_ligue1', 'soccer_epl', 'soccer_spain_la_liga',
  'soccer_germany_bundesliga', 'soccer_italy_serie_a', 'soccer_netherlands_eredivisie',
];

// Alias noms d'équipes CDM — uniformise les variantes Unibet/Betclic/Winamax
// (ex: "Rép.Tchèque" vs "Tchéquie", "USA" vs "Etats-Unis") pour la fusion des cotes
const COUNTRY_ALIASES = {
  algeria: 'algerie', algerie: 'algerie',
  argentina: 'argentine', argentine: 'argentine',
  australia: 'australie', australie: 'australie',
  austria: 'autriche', autriche: 'autriche',
  belgium: 'belgique', belgique: 'belgique',
  bosniaherzegovina: 'bosnie', bosnieherzegovine: 'bosnie', bosnieherzeg: 'bosnie',
  brazil: 'bresil', bresil: 'bresil',
  capeverde: 'capvert', capvert: 'capvert',
  colombia: 'colombie', colombie: 'colombie',
  drcongo: 'congo', rdcongo: 'congo',
  croatia: 'croatie', croatie: 'croatie',
  czechia: 'tcheque', republiquetcheque: 'tcheque', reptcheque: 'tcheque', tchequie: 'tcheque',
  ecuador: 'equateur', equateur: 'equateur',
  england: 'angleterre', angleterre: 'angleterre',
  germany: 'allemagne', allemagne: 'allemagne',
  iraq: 'irak', irak: 'irak',
  ivorycoast: 'coteivoire', cotedivoire: 'coteivoire',
  japan: 'japon', japon: 'japon',
  mexico: 'mexique', mexique: 'mexique',
  morocco: 'maroc', maroc: 'maroc',
  netherlands: 'paysbas', paysbas: 'paysbas',
  newzealand: 'nouvellezelande', nouvellezelande: 'nouvellezelande', nllezelande: 'nouvellezelande',
  norway: 'norvege', norvege: 'norvege',
  saudiarabia: 'arabiesaoudite', arabiesaoudite: 'arabiesaoudite',
  scotland: 'ecosse', ecosse: 'ecosse',
  southafrica: 'afriquedusud', afriquedusud: 'afriquedusud',
  southkorea: 'coreedusud', coreedusud: 'coreedusud', coree: 'coreedusud',
  spain: 'espagne', espagne: 'espagne',
  sweden: 'suede', suede: 'suede',
  switzerland: 'suisse', suisse: 'suisse',
  tunisia: 'tunisie', tunisie: 'tunisie',
  turkiye: 'turquie', turquie: 'turquie', turkey: 'turquie',
  unitedstates: 'etatsunis', etatsunis: 'etatsunis', usa: 'etatsunis',
};

// Normalisation/fuzzy-matching de noms d'équipes — utilisé pour fusionner les cotes
// scrapées (Unibet/Betclic/Winamax) avec les fixtures (FD leagues + CDM)
const normTeam = s => {
  const base = (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(as|fc|sc|rc|ogc|afc|ac|stade|club|island|islands)\b/g, '')
    .replace(/\bst\b/g, 'saint')
    .replace(/[^a-z]/g, '');
  return COUNTRY_ALIASES[base] || base;
};
const fuzzy = (a, b) => {
  if (!a || !b) return false;
  const na = normTeam(a), nb = normTeam(b);
  return na.includes(nb) || nb.includes(na);
};

// ── Alertes football BTTS + Over/Under (Poisson) ─────────────────────────────
// Buts/équipe/match attendus — référence pour les facteurs attaque/défense
const FB_LEAGUE_AVG_GOALS = { ligue1: 1.35, pl: 1.45, laliga: 1.35, bundes: 1.55, seriea: 1.35 };
const CDM_AVG_GOALS = 1.30;
// Fallback si aucune stat CDM disponible (avgGF/avgGA normalement calculés dynamiquement
// sur le pool d'équipes programmées, cf section 4d) — anciennes moyennes observées (~17 sélections).
const CDM_AVG_GF = 2.15;
const CDM_AVG_GA = 0.78;
let _cdmPoolAvg = { avgGF: CDM_AVG_GF, avgGA: CDM_AVG_GA }; // mis à jour par generateBackgroundAlerts

// avgGF/avgGA figés par match dès sa 1ère génération (au lieu d'être recalculés à chaque
// cycle de 20min sur le pool courant) — évite qu'un match déjà suivi voie sa probabilité
// (BTTS/Total/Résultat) dériver fortement sans qu'aucune donnée du match lui-même ait changé
// (cf. cas Mexique-Corée du Sud BTTS 76%→18% en quelques heures, 19 juin 2026).
const CDM_FIXTURE_POOLAVG_FILE = join(CACHE_DIR, 'cdm_fixture_poolavg.json');
let _cdmFixturePoolAvg = {};
try { if (existsSync(CDM_FIXTURE_POOLAVG_FILE)) _cdmFixturePoolAvg = JSON.parse(readFileSync(CDM_FIXTURE_POOLAVG_FILE, 'utf8')); } catch {}
const _saveCdmFixturePoolAvg = () => { try { writeFileSync(CDM_FIXTURE_POOLAVG_FILE, JSON.stringify(_cdmFixturePoolAvg), 'utf8'); } catch {} };
function freezeCdmPoolAvg(fixtureId, avgGF, avgGA) {
  const existing = _cdmFixturePoolAvg[fixtureId];
  if (existing) return existing;
  const frozen = { avgGF, avgGA, frozenAt: Date.now() };
  _cdmFixturePoolAvg[fixtureId] = frozen;
  _saveCdmFixturePoolAvg();
  return frozen;
}
const FB_BTTS_ALERT_PROB = 0.68;
const FB_OU_ALERT_PROB   = 0.65;
const FB_RESULT_ALERT_PROB = 0.65; // par issue (home/draw/away), même seuil que BTTS/O-U — chaque issue est un pari oui/non indépendant
const FB_RESULT_MAX_PROB   = 0.75; // plafond de confiance 1X2 — le modèle Poisson sur stats qualifs/amicaux surestime les favoris
const FB_MIN_ODDS = 1.50; // cote mini sur la direction proposée (unibet/betclic — winamax exclu depuis le 22 juin)

// ── football-data.org (TEST) ──────────────────────────────────────────────────
const FD_KEY  = process.env.FD_API_KEY;
const FD_BASE = 'https://api.football-data.org/v4';
const FD_LEAGUES = [
  { code: 'FL1', key: 'ligue1' },
  { code: 'PL',  key: 'pl'     },
  { code: 'PD',  key: 'laliga' },
  { code: 'BL1', key: 'bundes' },
  { code: 'SA',  key: 'seriea' },
];

async function fdGet(path) {
  const resp = await fetch(`${FD_BASE}${path}`, { headers: { 'X-Auth-Token': FD_KEY } });
  if (!resp.ok) throw new Error(`football-data.org ${resp.status}: ${path}`);
  _captureFdQuota(resp);
  return resp.json();
}

// Cache persisté sur disque : survit aux redémarrages (--watch), même pattern
// que la CDM — un 429 transitoire ne vide plus l'affichage des 5 championnats.
let _fdCache = null;
let _fdCacheTs = 0;
let _fdErrorUntil = 0;
try {
  if (existsSync(FD_MATCHES_CACHE_FILE)) {
    const parsed = JSON.parse(readFileSync(FD_MATCHES_CACHE_FILE, 'utf8'));
    if (parsed?.matches) { _fdCache = { matches: parsed.matches, count: parsed.matches.length }; _fdCacheTs = parsed.ts || 0; }
  }
} catch {}

app.get('/api/fd/matches', async (req, res) => {
  if (!FD_KEY) return res.status(503).json({ error: 'FD_API_KEY not configured' });
  if (_fdCache && Date.now() - _fdCacheTs < 30 * 60 * 1000) return res.json(_fdCache);
  // FD limite à 10 req/min — si une tentative récente a échoué (429), on sert le cache
  // périmé (ou une liste vide) au lieu de re-tenter immédiatement et d'aggraver le 429
  if (Date.now() < _fdErrorUntil) return res.json(_fdCache || { matches: [], count: 0 });

  try {
    const allMatches = [];
    for (const league of FD_LEAGUES) {
      // Rate limit 10 req/min : les 2 requêtes par ligue (matches+standings) étaient lancées
      // en parallèle, avec seulement 200ms entre ligues — les 10 requêtes partaient en moins
      // d'1 seconde et saturaient tout le quota de la minute d'un coup. N'importe quel autre
      // appel FD (CDM, teamstats) tombant dans cette même minute se prenait un 429. Espacement
      // de chaque requête individuellement (pas juste entre ligues) pour laisser de la marge.
      const matchesRes = await fdGet(`/competitions/${league.code}/matches?status=SCHEDULED`);
      await new Promise(r => setTimeout(r, 600));
      const standingsRes = await fdGet(`/competitions/${league.code}/standings`);
      await new Promise(r => setTimeout(r, 600));

      // Classement : teamId → stats
      const table = standingsRes.standings?.find(s => s.type === 'TOTAL')?.table || [];
      const statsMap = {};
      for (const s of table) {
        statsMap[s.team.id] = {
          position:     s.position,
          points:       s.points,
          played:       s.playedGames,
          wins:         s.won,
          draws:        s.draw,
          losses:       s.lost,
          goalsFor:     s.goalsFor,
          goalsAgainst: s.goalsAgainst,
          form: (s.form || '').split('').filter(c => 'WDL'.includes(c)).slice(-5),
        };
      }

      // 5 prochains matchs
      const upcoming = (matchesRes.matches || []).slice(0, 5);
      for (const m of upcoming) {
        const hId = m.homeTeam.id;
        const aId = m.awayTeam.id;
        allMatches.push({
          id:      String(m.id),
          league:  league.key,
          round:   m.matchday ? `Journée ${m.matchday}` : '',
          date:    m.utcDate,
          venue:   null,
          weather: null,
          isLive:  true,
          home: { id: hId, name: m.homeTeam.name, short: m.homeTeam.tla || abbrev(m.homeTeam.name), logoId: m.homeTeam.crest, upcoming: [], ...(statsMap[hId] || {}) },
          away: { id: aId, name: m.awayTeam.name, short: m.awayTeam.tla || abbrev(m.awayTeam.name), logoId: m.awayTeam.crest, upcoming: [], ...(statsMap[aId] || {}) },
          h2h:     [],
          markets: {},
        });
      }
    }

    allMatches.sort((a, b) => new Date(a.date) - new Date(b.date));
    const result = { matches: allMatches, count: allMatches.length };
    _fdCache = result;
    _fdCacheTs = Date.now();
    try { writeFileSync(FD_MATCHES_CACHE_FILE, JSON.stringify({ matches: allMatches, ts: _fdCacheTs }), 'utf8'); } catch {}
    res.json(result);
  } catch (err) {
    console.error('football-data.org error:', err.message);
    _fdErrorUntil = Date.now() + 60 * 1000;
    res.json(_fdCache || { matches: [], count: 0 });
  }
});

// ── Coupe du Monde (football-data.org) ───────────────────────────────────────
// Cache persisté sur disque : survit aux redémarrages (--watch) pour éviter qu'un
// rate-limit FD (10 req/min, partagé avec /api/fd/matches) ne vide l'affichage CDM.
let _cdmCache = null, _cdmCacheTs = 0, _cdmErrorUntil = 0;
try {
  if (existsSync(WORLDCUP_CACHE_FILE)) {
    const parsed = JSON.parse(readFileSync(WORLDCUP_CACHE_FILE, 'utf8'));
    if (parsed?.games) { _cdmCache = { games: parsed.games }; _cdmCacheTs = parsed.ts || 0; }
  }
} catch {}
app.get('/api/fd/worldcup', async (req, res) => {
  if (!FD_KEY) return res.status(503).json({ error: 'FD_API_KEY not configured' });
  // Cache plus court (1min) si un match est en cours — pour suivre les buts en quasi
  // temps réel ; sinon 5min (réduit le délai de détection du passage en live, quota FD
  // 10 req/min largement assez large pour ça).
  const hasLive = _cdmCache?.games?.some(g => g.status === 'STATUS_IN_PROGRESS');
  const ttl = hasLive ? 60 * 1000 : 5 * 60 * 1000;
  if (_cdmCache && Date.now() - _cdmCacheTs < ttl) return res.json(_cdmCache);
  if (Date.now() < _cdmErrorUntil) return res.json(_cdmCache || { games: [] });
  try {
    const r = await fetch('https://api.football-data.org/v4/competitions/2000/matches?limit=30', { headers: { 'X-Auth-Token': FD_KEY } });
    if (!r.ok) throw new Error(`FD ${r.status}`);
    const d = await r.json();
    const FD_STATUS_MAP = {
      SCHEDULED: 'STATUS_SCHEDULED', TIMED: 'STATUS_SCHEDULED',
      // "LIVE" observé en direct sur l'API (23 juin 2026, Angleterre-Ghana) en plus de IN_PLAY/PAUSED —
      // pas documenté dans l'enum officiel FD mais bien renvoyé, sans ce mapping le match disparaît
      // du résultat (filtré comme POSTPONED/CANCELLED) et le cycle de refresh rapide live ne s'active jamais.
      IN_PLAY: 'STATUS_IN_PROGRESS', PAUSED: 'STATUS_IN_PROGRESS', LIVE: 'STATUS_IN_PROGRESS',
      EXTRA_TIME: 'STATUS_IN_PROGRESS', PENALTY_SHOOTOUT: 'STATUS_IN_PROGRESS',
      FINISHED: 'STATUS_FINAL', AWARDED: 'STATUS_FINAL',
    };
    const now = Date.now();
    const KEEP_MS = 48 * 3600_000;
    const games = (d.matches || [])
      .filter(m => {
        const mapped = FD_STATUS_MAP[m.status];
        if (!mapped) return false; // POSTPONED, CANCELLED, SUSPENDED
        if (mapped === 'STATUS_FINAL') return (now - new Date(m.utcDate).getTime()) < KEEP_MS;
        return true;
      })
      .slice(0, 20).map(m => ({
      id:     m.id,
      date:   m.utcDate,
      status: FD_STATUS_MAP[m.status],
      round:  m.stage?.replace(/_/g,' ') || m.matchday ? `J${m.matchday}` : '',
      home:   { name: m.homeTeam?.name, short: m.homeTeam?.shortName, logo: m.homeTeam?.crest, score: m.score?.fullTime?.home ?? null },
      away:   { name: m.awayTeam?.name, short: m.awayTeam?.shortName, logo: m.awayTeam?.crest, score: m.score?.fullTime?.away ?? null },
    }));
    _cdmCache = { games }; _cdmCacheTs = Date.now();
    try { writeFileSync(WORLDCUP_CACHE_FILE, JSON.stringify({ games, ts: _cdmCacheTs }), 'utf8'); } catch {}
    res.json(_cdmCache);
  } catch (err) {
    console.error('football-data.org worldcup error:', err.message);
    _cdmErrorUntil = Date.now() + 60 * 1000;
    res.json(_cdmCache || { games: [] });
  }
});

// ── API-Football ─────────────────────────────────────────────────────────────
const FOOTBALL_KEY  = process.env.FOOTBALL_API_KEY;
const FOOTBALL_MATCHES_ENABLED = process.env.FOOTBALL_MATCHES_ENABLED === 'true';
const FOOTBALL_BASE = 'https://v3.football.api-sports.io';
const FOOTBALL_LEAGUES = [
  { id: 61,  key: 'ligue1' },
  { id: 39,  key: 'pl'     },
  { id: 140, key: 'laliga' },
  { id: 78,  key: 'bundes' },
  { id: 135, key: 'seriea' },
];

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }));
app.use(express.json({ limit: '10mb' }));

// ── Helpers ──────────────────────────────────────────────────────────────────

function currentSeason() {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

function abbrev(name) {
  const parts = name.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.map(w => w[0]).join('').toUpperCase().slice(0, 4);
}

async function footballGet(path) {
  const resp = await fetch(`${FOOTBALL_BASE}${path}`, {
    headers: { 'x-apisports-key': FOOTBALL_KEY },
  });
  if (!resp.ok) throw new Error(`API-Football ${resp.status}: ${path}`);
  _captureFootballQuota(resp);
  return resp.json();
}

function removeVig(odds, type) {
  if (type === 'h2h') {
    const s = 1 / odds.home + 1 / odds.draw + 1 / odds.away;
    return { home: (1 / odds.home) / s, draw: (1 / odds.draw) / s, away: (1 / odds.away) / s };
  }
  if (type === 'btts') {
    const s = 1 / odds.yes + 1 / odds.no;
    return { yes: (1 / odds.yes) / s, no: (1 / odds.no) / s };
  }
  return null;
}

function normalizeBookmakerKey(key) {
  const MAP = { betfair_ex_eu: 'betfair', betfair_ex_uk: 'betfair', unibet_eu: 'unibet', unibet_fr: 'unibet', unibet: 'unibet', betclic: 'betclic', winamax_fr: 'winamax', winamax: 'winamax', pinnacle: 'pinnacle' };
  return MAP[key] || key;
}

function transformOddsApiResponse(events) {
  return events.map(event => {
    const markets = {};
    for (const bm of event.bookmakers) {
      const bmKey = normalizeBookmakerKey(bm.key);
      for (const market of bm.markets) {
        if (!markets[market.key]) markets[market.key] = { bookmakers: {} };
        if (!markets[market.key].bookmakers[bmKey]) {
          if (market.key === 'h2h') {
            const outcomes = Object.fromEntries(market.outcomes.map(o => [o.name, o.price]));
            markets[market.key].bookmakers[bmKey] = { home: outcomes[event.home_team], draw: outcomes['Draw'], away: outcomes[event.away_team] };
          } else if (market.key === 'btts') {
            const outcomes = Object.fromEntries(market.outcomes.map(o => [o.name.toLowerCase(), o.price]));
            markets[market.key].bookmakers[bmKey] = { yes: outcomes['yes'], no: outcomes['no'] };
          }
        }
      }
    }
    return { id: event.id, sportKey: event.sport_key, homeTeam: event.home_team, awayTeam: event.away_team, league: event.sport_title, commenceTime: event.commence_time, markets };
  });
}

// ── Cache ─────────────────────────────────────────────────────────────────────

let _fbCache = null;
let _fbCacheTs = 0;
const FB_TTL = 30 * 60 * 1000; // 30 min

// ── MongoDB userdata ─────────────────────────────────────────────────────────
let _mongoClient = null;
async function getMongoDb() {
  if (!process.env.MONGODB_URI) return null;
  if (!_mongoClient) {
    _mongoClient = new MongoClient(process.env.MONGODB_URI);
    await _mongoClient.connect();
  }
  return _mongoClient.db('ia-betting');
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));

// Données utilisateur synchronisées (alertes, paris, historique)
app.get('/api/userdata', async (req, res) => {
  try {
    const db = await getMongoDb();
    if (!db) return res.json({});
    const doc = await db.collection('userdata').findOne({ _id: 'main' });
    res.json(doc?.data || {});
  } catch (e) {
    console.error('[userdata GET]', e.message);
    res.json({});
  }
});

app.post('/api/userdata', async (req, res) => {
  try {
    const db = await getMongoDb();
    if (!db) return res.json({ ok: false, reason: 'no mongo' });
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ ok: false });
    await db.collection('userdata').updateOne(
      { _id: 'main' },
      { $set: { [`data.${key}`]: value, updatedAt: Date.now() } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[userdata POST]', e.message);
    res.status(500).json({ ok: false });
  }
});

// API-Football : matchs enrichis avec stats de classement
app.get('/api/football/matches', async (req, res) => {
  if (!FOOTBALL_KEY || !FOOTBALL_MATCHES_ENABLED) {
    return res.status(503).json({ error: 'FOOTBALL_API_KEY not configured' });
  }

  if (_fbCache && Date.now() - _fbCacheTs < FB_TTL) {
    return res.json(_fbCache);
  }

  try {
    const season = currentSeason();
    const allMatches = [];

    for (const league of FOOTBALL_LEAGUES) {
      const [fixturesRes, standingsRes] = await Promise.all([
        footballGet(`/fixtures?league=${league.id}&season=${season}&next=5`),
        footballGet(`/standings?league=${league.id}&season=${season}`),
      ]);

      // Map teamId → stats depuis classement
      const standingsArr = standingsRes.response?.[0]?.league?.standings?.[0] || [];
      const statsMap = {};
      for (const s of standingsArr) {
        statsMap[s.team.id] = {
          position:     s.rank,
          points:       s.points,
          played:       s.all.played,
          wins:         s.all.win,
          draws:        s.all.draw,
          losses:       s.all.lose,
          goalsFor:     s.all.goals.for,
          goalsAgainst: s.all.goals.against,
          form:         s.form.split('').filter(c => 'WDL'.includes(c)).slice(-5),
        };
      }

      for (const f of fixturesRes.response || []) {
        const hId = f.teams.home.id;
        const aId = f.teams.away.id;

        allMatches.push({
          id:      String(f.fixture.id),
          league:  league.key,
          round:   f.league.round || '',
          date:    f.fixture.date,
          venue:   f.fixture.venue?.name ? { name: f.fixture.venue.name, city: f.fixture.venue.city || '', capacity: null } : null,
          weather: null,
          isLive:  true,
          home: { id: hId, name: f.teams.home.name, short: abbrev(f.teams.home.name), logoId: hId, upcoming: [], ...(statsMap[hId] || {}) },
          away: { id: aId, name: f.teams.away.name, short: abbrev(f.teams.away.name), logoId: aId, upcoming: [], ...(statsMap[aId] || {}) },
          h2h:     [],
          markets: {},
        });
      }
    }

    allMatches.sort((a, b) => new Date(a.date) - new Date(b.date));
    const result = { matches: allMatches, count: allMatches.length };
    _fbCache = result;
    _fbCacheTs = Date.now();
    res.json(result);
  } catch (err) {
    console.error('API-Football error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// API-Football : H2H entre deux équipes
app.get('/api/football/h2h/:homeId/:awayId', async (req, res) => {
  if (!FOOTBALL_KEY) return res.status(503).json({ error: 'FOOTBALL_API_KEY not configured' });
  try {
    const { homeId, awayId } = req.params;
    const data = await footballGet(`/fixtures/headtohead?h2h=${homeId}-${awayId}&last=5`);
    const h2h = (data.response || [])
      .filter(f => f.goals.home != null && f.goals.away != null)
      .slice(0, 5)
      .map(f => ({
        date:      f.fixture.date.slice(0, 10),
        home:      f.teams.home.name,
        away:      f.teams.away.name,
        scoreHome: f.goals.home,
        scoreAway: f.goals.away,
      }));
    res.json({ h2h });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cotes foot — Unibet (scraping) + Betclic (scraping) + Winamax (scraping)
const _mergeFootballBookmaker = (allMatches, sourceOdds, bkKey) => {
  for (const s of sourceOdds) {
    if (!s.homeTeam || !s.awayTeam) continue;
    const existing = allMatches.find(m => fuzzy(m.homeTeam, s.homeTeam) && fuzzy(m.awayTeam, s.awayTeam));
    if (existing) {
      if (s.h2h) {
        if (!existing.markets.h2h) existing.markets.h2h = { bookmakers: {} };
        existing.markets.h2h.bookmakers[bkKey] = s.h2h;
      }
      if (s.btts) {
        if (!existing.markets.btts) existing.markets.btts = { bookmakers: {} };
        existing.markets.btts.bookmakers[bkKey] = s.btts;
      }
      if (s.totals) {
        if (!existing.markets.totals) existing.markets.totals = { bookmakers: {} };
        existing.markets.totals.bookmakers[bkKey] = s.totals;
      }
    } else {
      const markets = {};
      if (s.h2h)   markets.h2h    = { bookmakers: { [bkKey]: s.h2h } };
      if (s.btts)  markets.btts   = { bookmakers: { [bkKey]: s.btts } };
      if (s.totals) markets.totals = { bookmakers: { [bkKey]: s.totals } };
      allMatches.push({
        id: `${bkKey}_${s.homeTeam}_${s.awayTeam}`.replace(/\s/g, '_'),
        sportKey: 'soccer',
        homeTeam: s.homeTeam,
        awayTeam: s.awayTeam,
        commenceTime: s.commenceTime,
        markets,
      });
    }
  }
};

// Marque la tendance (hausse/baisse) de chaque cote par rapport au cache précédent
// — affichée en flèche ▲/▼ dans FootballOddsBox
const _computeOddsTrends = (newMatches, prevMatches) => {
  if (!prevMatches?.length) return;
  for (const m of newMatches) {
    const prev = prevMatches.find(p => fuzzy(p.homeTeam, m.homeTeam) && fuzzy(p.awayTeam, m.awayTeam));
    if (!prev) continue;
    for (const [marketType, market] of Object.entries(m.markets)) {
      const prevBks = prev.markets?.[marketType]?.bookmakers;
      if (!prevBks) continue;
      for (const [bk, odds] of Object.entries(market.bookmakers)) {
        const prevOdds = prevBks[bk];
        if (!prevOdds) continue;
        for (const [outcome, val] of Object.entries(odds)) {
          if (val !== null && typeof val === 'object') {
            // totals : { '1.5': { over, under }, '2.5': {...} }
            const prevLine = prevOdds[outcome];
            if (!prevLine) continue;
            for (const [side, sideVal] of Object.entries(val)) {
              const prevVal = prevLine[side];
              if (typeof sideVal !== 'number' || typeof prevVal !== 'number' || sideVal === prevVal) continue;
              market.trends ??= {};
              market.trends[bk] ??= {};
              market.trends[bk][outcome] ??= {};
              market.trends[bk][outcome][side] = sideVal > prevVal ? 'up' : 'down';
            }
          } else {
            const prevVal = prevOdds[outcome];
            if (typeof val !== 'number' || typeof prevVal !== 'number' || val === prevVal) continue;
            market.trends ??= {};
            market.trends[bk] ??= {};
            market.trends[bk][outcome] = val > prevVal ? 'up' : 'down';
          }
        }
      }
    }
  }
};

async function _refreshOddsCache() {
  const [ubOdds, bcOdds, wmOdds, pinOdds] = await Promise.all([
    fetchUnibetFootballOdds().catch(() => []),
    fetchBetclicOdds().catch(() => []),
    fetchWinamaxOdds().catch(() => []),
    fetchPinnacleAllFootball().catch(() => []),
  ]);

  _updateScraper('unibet_foot',  Array.isArray(ubOdds) && ubOdds.length > 0);
  _updateScraper('betclic_foot', Array.isArray(bcOdds) && bcOdds.length > 0);
  _updateScraper('winamax_foot', Array.isArray(wmOdds) && wmOdds.length > 0);
  // Pinnacle est passif par rapport au cycle (throttle interne 15min, retourne [] sans scraper
  // si trop tôt) — ne pas marquer "ok=false" sur un cycle simplement throttlé, seulement sur un
  // vrai échec de scraping. On distingue via _outrightAttempts.pinnacleFootCdm (mis à jour
  // uniquement quand une tentative réelle a eu lieu, pas sur un retour anticipé throttlé).
  if (Date.now() - _outrightAttempts.pinnacleFootCdm < 60_000) {
    _updateScraper('pinnacle_foot', Array.isArray(pinOdds) && pinOdds.length > 0);
  }

  const allMatches = [];
  _mergeFootballBookmaker(allMatches, ubOdds, 'unibet');
  _mergeFootballBookmaker(allMatches, bcOdds, 'betclic');
  _mergeFootballBookmaker(allMatches, wmOdds, 'winamax');
  _mergeFootballBookmaker(allMatches, pinOdds, 'pinnacle');

  _computeOddsTrends(allMatches, _oddsCache.data?.matches);

  // Gèle les cotes au coup d'envoi : un match toujours présent dans le scrape après son
  // commenceTime n'est plus pré-match mais live (in-play) — ses cotes deviennent erratiques
  // (ex: 1.00/40/100 quand un favori prend le large) et ne doivent plus écraser la dernière
  // capture pré-match. Avant ce fix, seul un match totalement *absent* du scrape était figé —
  // un match qui restait visible en live (cas Canada-Qatar, 19 juin 2026) continuait à être
  // rafraîchi indéfiniment avec des cotes in-play affichées comme si elles étaient pré-match.
  const prevMatches = _oddsCache.data?.matches || [];
  const now = Date.now();
  const frozenAllMatches = allMatches.map(m => {
    const kickoff = m.commenceTime ? new Date(m.commenceTime).getTime() : NaN;
    if (!Number.isFinite(kickoff) || kickoff > now) return m; // pas encore commencé (ou date inconnue) : cotes live normales
    const prev = prevMatches.find(p => fuzzy(p.homeTeam, m.homeTeam) && fuzzy(p.awayTeam, m.awayTeam));
    if (prev?.frozen) return prev; // déjà figé un cycle précédent : on garde la même capture
    if (prev) return { ...prev, frozen: true, frozenAt: now }; // 1ère détection post-coup d'envoi : figeles dernières cotes pré-match connues
    return { ...m, frozen: true, frozenAt: now }; // jamais vu avant le coup d'envoi (ex: redémarrage serveur en cours de match) : on figeles cotes live actuelles, mieux que rien
  });
  allMatches.length = 0;
  allMatches.push(...frozenAllMatches);

  // Conserve les cotes pré-match des matchs disparus du scrape (= passés en live/terminé)
  // pendant FROZEN_RETENTION_MS, marquées `frozen: true` pour affichage "cotes pré-match" côté front.
  // Ignoré si le scrape a totalement échoué (sinon tout le cache serait marqué figé à tort).
  const scrapeOk = ubOdds.length > 0 || bcOdds.length > 0 || wmOdds.length > 0;
  if (scrapeOk) {
    const FROZEN_RETENTION_MS = 3 * 60 * 60 * 1000; // 3h
    for (const prev of prevMatches) {
      // Un match futur (commenceTime pas encore atteint) disparu du scrape n'a pas "commencé" —
      // c'est juste une absence temporaire côté bookmaker (ligne pas encore postée, etc.), pas
      // un signal de coup d'envoi. Le marquer "frozen" serait trompeur (badge pré-match alors
      // qu'il s'agit d'un trou de données) ; on le laisse simplement disparaître de la liste
      // jusqu'à ce qu'il réapparaisse dans un scrape ultérieur.
      const prevKickoff = prev.commenceTime ? new Date(prev.commenceTime).getTime() : NaN;
      if (!Number.isFinite(prevKickoff) || prevKickoff > now) continue;
      const stillThere = allMatches.some(m => fuzzy(m.homeTeam, prev.homeTeam) && fuzzy(m.awayTeam, prev.awayTeam));
      if (stillThere) continue;
      const frozenAt = prev.frozenAt ?? now;
      if (now - frozenAt > FROZEN_RETENTION_MS) continue;
      allMatches.push({ ...prev, frozen: true, frozenAt });
    }
  }

  if (allMatches.length > 0) {
    allMatches.sort((a, b) => new Date(a.commenceTime) - new Date(b.commenceTime));
    const sources = [ubOdds.length ? 'unibet' : '', bcOdds.length ? 'betclic' : '', wmOdds.length ? 'winamax' : ''].filter(Boolean).join('+');
    const result = { matches: allMatches, count: allMatches.length, source: sources };
    _oddsCache = { data: result, ts: Date.now() };
    _saveOddsCacheToDisk(result);
    return result;
  }
  if (_oddsCache.data) return _oddsCache.data;
  return { matches: [], count: 0, source: 'none' };
}

app.get('/api/odds', async (req, res) => {
  const forceRefresh = req.query.refresh === '1';

  if (!forceRefresh && _oddsCache.data && Date.now() - _oddsCache.ts < ODDS_TTL) {
    return res.json(_oddsCache.data);
  }

  // Cache présent mais expiré : on le sert tel quel et on rafraîchit en arrière-plan
  // (évite de faire attendre l'utilisateur derrière le scraping + jitter anti-ban)
  if (!forceRefresh && _oddsCache.data) {
    _refreshInBackground('odds', _refreshOddsCache);
    return res.json(_oddsCache.data);
  }

  // Pas de cache du tout (cold start) ou refresh forcé explicitement : on attend le résultat
  try {
    return res.json(await _refreshOddsCache());
  } catch (err) {
    if (_oddsCache.data) return res.json(_oddsCache.data);
    res.status(500).json({ error: 'Failed to fetch odds', message: err.message });
  }
});

app.get('/api/outrights', async (req, res) => {
  try {
    if (req.query.refresh === '1') { _outrightsCache.ts = 0; _pinnacleOutrightsCache.ts = 0; _pmuOutrightsCache.ts = 0; }
    const [betclicData, pinnacleData, pmuData] = await Promise.all([getOutrights(), getPinnacleOutrights(), getPmuOutrights()]);

    // Fusionne les trois sources par équipe — books.pinnacle/pmu absents si la compétition
    // n'est pas couverte par cette source (Pinnacle : NBA seulement ; PMU : PL/Serie A/NBA/WNBA).
    const competitions = {};
    for (const [key, comp] of Object.entries(betclicData)) {
      const pinnMap = {};
      for (const t of (pinnacleData[key] || [])) pinnMap[normPinnacleTeam(t.name)] = t.odds;
      const pmuMap = {};
      for (const t of (pmuData[key] || [])) pmuMap[normPmuTeam(t.name)] = t.odds;

      competitions[key] = {
        label: comp.label, sport: comp.sport, updatedAt: comp.updatedAt,
        teams: comp.teams.map(t => {
          const books = { betclic: t.odds };
          const pinnOdds = pinnMap[normPinnacleTeam(t.name)];
          const pmuOdds = pmuMap[normPmuTeam(t.name)];
          if (pinnOdds != null) books.pinnacle = pinnOdds;
          if (pmuOdds != null) books.pmu = pmuOdds;
          return { name: t.name, books };
        }),
      };
    }

    const blockedUntil = Date.now() < _scraperBlockedUntil.betclic ? _scraperBlockedUntil.betclic : null;
    res.json({ competitions, blockedUntil });
  } catch (err) {
    res.json({ competitions: _outrightsCache.data || {}, blockedUntil: null });
  }
});

// The Odds API : alertes value bets
app.get('/api/alerts', async (req, res) => {
  const threshold = parseFloat(req.query.threshold) / 100 || PINNACLE_EDGE_THRESHOLD;
  const oddsResp = await fetch(`http://localhost:${PORT}/api/odds`);
  if (!oddsResp.ok) return res.status(503).json({ error: 'Could not fetch odds' });
  const { matches } = await oddsResp.json();
  const alerts = [];
  for (const match of matches) {
    for (const [marketType, market] of Object.entries(match.markets)) {
      if (!market?.bookmakers?.pinnacle) continue;
      const fairProbs = removeVig(market.bookmakers.pinnacle, marketType);
      if (!fairProbs) continue;
      for (const [bookie, odds] of Object.entries(market.bookmakers)) {
        if (bookie === 'pinnacle') continue;
        for (const outcome of Object.keys(fairProbs)) {
          if (!odds?.[outcome]) continue;
          const edge = odds[outcome] * fairProbs[outcome] - 1;
          if (edge >= threshold && odds[outcome] >= PINNACLE_MIN_ODDS) {
            alerts.push({ matchId: match.id, homeTeam: match.homeTeam, awayTeam: match.awayTeam, league: match.league, commenceTime: match.commenceTime, bookmaker: bookie, market: marketType, outcome, odds: odds[outcome], fairOdds: +(1 / fairProbs[outcome]).toFixed(2), fairProb: +(fairProbs[outcome] * 100).toFixed(1), edge: +(edge * 100).toFixed(1) });
          }
        }
      }
    }
  }
  alerts.sort((a, b) => b.edge - a.edge);
  res.json({ alerts, count: alerts.length });
});

// ── ESPN (NBA) — aucune clé requise ──────────────────────────────────────────
const ESPN_NBA        = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams';
const ESPN_ATHLETE    = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes';
const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const ESPN_WNBA          = 'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams';
const ESPN_WNBA_ATH      = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/wnba/athletes';
const ESPN_WNBA_SB       = 'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard';
const ESPN_WNBA_STATS    = 'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams';
const ESPN_WNBA_STANDING = 'https://site.api.espn.com/apis/v2/sports/basketball/wnba/standings';
const ESPN_WNBA_LEADERS  = 'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/leaders';
const ESPN_WNBA_CORE     = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/seasons/${new Date().getFullYear()}/types/2/athletes`;
const WNBA_SEASON        = new Date().getFullYear();
const now = new Date();
const ESPN_SEASON = now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
const _espnCache    = {};
const _ubMatchUrlCache = {};   // { `${league}_${normHome}_${normAway}` → matchPath }
const CACHE_6H      = 6 * 60 * 60 * 1000;
const CACHE_30MIN   = 30 * 60 * 1000;
const CACHE_5MIN    = 5 * 60 * 1000;

let _scoreboardCache = { data: null, ts: 0 };

function normalizeGame(ev) {
  try {
    const comp = ev.competitions[0];
    const home = comp.competitors.find(c => c.homeAway === 'home');
    const away = comp.competitors.find(c => c.homeAway === 'away');
    const recH = home?.records?.[0]?.summary || '';
    const recA = away?.records?.[0]?.summary || '';
    const [hw, hl] = recH.split('-').map(Number);
    const [aw, al] = recA.split('-').map(Number);
    const homeScore = home?.score != null ? parseInt(home.score) : null;
    const awayScore = away?.score != null ? parseInt(away.score) : null;
    const note         = comp.notes?.[0]?.headline || '';
    const seriesSummary = comp.series?.summary || '';
    return {
      id:           ev.id,
      date:         ev.date,
      status:       comp.status?.type?.name || 'STATUS_SCHEDULED',
      statusDetail: comp.status?.type?.shortDetail || comp.status?.type?.description || '',
      note,
      seriesSummary,
      venue:        { city: comp.venue?.address?.city || '', name: comp.venue?.fullName || '' },
      home: { name: home?.team?.displayName || '', short: home?.team?.abbreviation || '', logo: home?.team?.logo || '', score: isNaN(homeScore) ? 0 : homeScore, wins: hw || 0, losses: hl || 0 },
      away: { name: away?.team?.displayName || '', short: away?.team?.abbreviation || '', logo: away?.team?.logo || '', score: isNaN(awayScore) ? 0 : awayScore, wins: aw || 0, losses: al || 0 },
    };
  } catch {
    return null;
  }
}

// ── Playoff patch — auto-update scores/rounds for completed games ─────────────
const _patchCache = { data: null, ts: 0 };
app.get('/api/nba/playoff-patch', async (req, res) => {
  if (_patchCache.data && Date.now() - _patchCache.ts < CACHE_5MIN) return res.json(_patchCache.data);
  try {
    const seen = new Set();
    const allEvents = [];
    for (let i = -8; i <= 3; i++) {
      const dateStr = new Date(Date.now() + i * 86400000).toISOString().slice(0,10).replace(/-/g,'');
      const r = await fetch(`${ESPN_SCOREBOARD}?dates=${dateStr}&limit=50`);
      if (!r.ok) continue;
      for (const ev of (await r.json()).events || []) {
        if (seen.has(ev.id)) continue;
        seen.add(ev.id);
        allEvents.push(ev);
      }
    }
    const ESPN_NORM = { SA:'SAS', NY:'NYK', GS:'GSW', NO:'NOP', UT:'UTA' };
    const normAbbr = a => ESPN_NORM[a?.toUpperCase()] || a?.toUpperCase() || '';
    const patches = [];
    for (const ev of allEvents) {
      const g = normalizeGame(ev);
      if (!g) continue;
      if (!g.status.includes('STATUS_FINAL')) continue;
      const comp = ev.competitions?.[0];
      const series = comp?.series;
      const seriesTitle = series?.title || '';          // "Western Conference Finals - Game 3"
      const seriesSummary = series?.summary || '';      // "OKC leads, 2-1"
      const seriesWins = {};
      for (const sc of (series?.competitors || [])) {
        const abbr = normAbbr(sc.team?.abbreviation);
        if (abbr) seriesWins[abbr] = sc.wins || 0;
      }
      const gameNumMatch = seriesTitle.match(/Game\s*(\d+)/i);
      patches.push({
        espnId:        g.id,
        date:          g.date,
        home:          normAbbr(g.home.short),
        away:          normAbbr(g.away.short),
        homeName:      g.home.name,
        awayName:      g.away.name,
        homeScore:     g.home.score,
        awayScore:     g.away.score,
        seriesSummary,
        seriesWins,
        gameNum:       gameNumMatch ? parseInt(gameNumMatch[1]) : null,
      });
    }

    // Matchs à venir (playoffs uniquement) — génèrent des fixtures auto dans useFixtures
    const upcoming = [];
    for (const ev of allEvents) {
      const g = normalizeGame(ev);
      if (!g) continue;
      if (!g.status.includes('STATUS_SCHEDULED')) continue;
      const comp  = ev.competitions?.[0];
      const note  = comp?.notes?.[0]?.headline || comp?.series?.title || comp?.note || '';
      if (!note.match(/finals|round|playoff/i)) continue; // playoffs seulement
      const series = comp?.series;
      const seriesSummary = series?.summary || '';
      const gameNumMatch  = note.match(/Game\s*(\d+)/i);
      upcoming.push({
        espnId:       g.id,
        date:         g.date,
        home:         normAbbr(g.home.short),
        away:         normAbbr(g.away.short),
        homeName:     g.home.name,
        awayName:     g.away.name,
        note,
        seriesSummary,
        gameNum:      gameNumMatch ? parseInt(gameNumMatch[1]) : null,
        venue:        g.venue?.name ? { name: g.venue.name, city: g.venue.city } : null,
      });
    }

    const result = { patches, upcoming };
    _patchCache.data = result;
    _patchCache.ts = Date.now();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/nba/scoreboard', async (req, res) => {
  const hasLive = _scoreboardCache.data?.games?.some(g => g.status === 'STATUS_IN_PROGRESS');
  const ttl     = hasLive ? 30_000 : CACHE_5MIN;
  if (_scoreboardCache.data && Date.now() - _scoreboardCache.ts < ttl)
    return res.json(_scoreboardCache.data);
  try {
    const allEvents = [];
    // Today sans ?dates → scores live temps réel
    const todayResp = await fetch(`${ESPN_SCOREBOARD}?limit=50`);
    if (todayResp.ok) allEvents.push(...((await todayResp.json()).events || []));
    // J-1 à J+3 par date explicite (couvre les matchs du soir en heure locale US)
    for (let i = -1; i <= 3; i++) {
      const d = new Date(Date.now() + i * 86400000);
      const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
      const resp = await fetch(`${ESPN_SCOREBOARD}?dates=${dateStr}&limit=50`);
      if (!resp.ok) continue;
      allEvents.push(...((await resp.json()).events || []));
    }
    // Dédoublonnage par id
    const seen = new Set();
    const unique = allEvents.filter(ev => { if (seen.has(ev.id)) return false; seen.add(ev.id); return true; });
    const games = unique.map(normalizeGame).filter(Boolean);
    _scoreboardCache = { data: { games }, ts: Date.now() };
    _updateScraper('espn', games.length > 0);
    res.json({ games });
  } catch (err) {
    _updateScraper('espn', false);
    // Retourne le cache périmé plutôt qu'une erreur si ESPN est down
    if (_scoreboardCache.data) return res.json(_scoreboardCache.data);
    res.status(500).json({ error: err.message });
  }
});

// ── ESPN Soccer scoreboard — aucune clé requise ──────────────────────────────
const FB_ESPN_LEAGUES = { ligue1: 'fra.1', pl: 'eng.1', laliga: 'esp.1', bundes: 'ger.1', seriea: 'ita.1' };
let _fbScoreboardCache = { data: null, ts: 0 };

function normalizeFbGame(ev, leagueId) {
  try {
    const comp = ev.competitions[0];
    const homeC = comp.competitors.find(c => c.homeAway === 'home');
    const awayC = comp.competitors.find(c => c.homeAway === 'away');
    const status      = comp.status?.type?.name || 'STATUS_SCHEDULED';
    const statusDetail = comp.status?.type?.shortDetail || '';
    const homeScore = homeC?.score != null ? parseInt(homeC.score) : null;
    const awayScore = awayC?.score != null ? parseInt(awayC.score) : null;
    return {
      id: ev.id, league: leagueId, date: ev.date, status, statusDetail,
      home: { name: homeC?.team?.displayName || '', short: homeC?.team?.abbreviation || '',
              score: isNaN(homeScore) ? null : homeScore,
              logo: `https://a.espncdn.com/i/teamlogos/soccer/500/${homeC?.team?.id}.png`, espnId: homeC?.team?.id },
      away: { name: awayC?.team?.displayName || '', short: awayC?.team?.abbreviation || '',
              score: isNaN(awayScore) ? null : awayScore,
              logo: `https://a.espncdn.com/i/teamlogos/soccer/500/${awayC?.team?.id}.png`, espnId: awayC?.team?.id },
    };
  } catch { return null; }
}

app.get('/api/football/scoreboard', async (req, res) => {
  const hasLive = _fbScoreboardCache.data?.games?.some(g => g.status === 'STATUS_IN_PROGRESS');
  const ttl = hasLive ? 30_000 : CACHE_5MIN;
  if (_fbScoreboardCache.data && Date.now() - _fbScoreboardCache.ts < ttl)
    return res.json(_fbScoreboardCache.data);
  const games = [];
  for (const [leagueId, espnLeague] of Object.entries(FB_ESPN_LEAGUES)) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 10_000);
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${espnLeague}/scoreboard`, { signal: ac.signal });
      clearTimeout(t);
      if (!r.ok) continue;
      for (const ev of (await r.json()).events || []) {
        const g = normalizeFbGame(ev, leagueId);
        if (g) games.push(g);
      }
    } catch (e) { console.error(`ESPN Soccer ${espnLeague}:`, e.message); }
  }
  _fbScoreboardCache = { data: { games }, ts: Date.now() };
  res.json({ games });
});

async function fetchLastGame(playerId) {
  try {
    const resp = await fetch(`${ESPN_ATHLETE}/${playerId}/gamelog?season=${ESPN_SEASON}`);
    if (!resp.ok) return null;
    const json = await resp.json();

    // Labels are at root level
    const labels = json.labels || [];
    const get = (stats, label) => {
      const i = labels.indexOf(label);
      return i >= 0 ? parseFloat(stats[i]) : null;
    };

    // Collect every game entry across all seasonTypes/categories
    const allEntries = [];
    for (const st of (json.seasonTypes || [])) {
      for (const cat of (st.categories || [])) {
        if (cat.type === 'total') continue;
        for (const ev of (cat.events || [])) {
          const meta = (json.events || {})[ev.eventId];
          if (!meta?.gameDate) continue;
          allEntries.push({ stats: ev.stats || [], meta });
        }
      }
    }
    if (!allEntries.length) return null;

    // Sort by gameDate descending → first entry is the truly last game played
    allEntries.sort((a, b) => new Date(b.meta.gameDate) - new Date(a.meta.gameDate));
    const { stats, meta } = allEntries[0];

    const opponent    = meta?.opponent?.abbreviation || meta?.opponent?.displayName || '?';
    const atVs        = meta?.atVs === '@' ? '@' : 'vs';
    return {
      pts: get(stats, 'PTS'),
      reb: get(stats, 'REB'),
      ast: get(stats, 'AST'),
      opponent,
      atVs,
      gameDate: meta?.gameDate || null,
    };
  } catch { return null; }
}

async function fetchPlayerStats(playerId) {
  try {
    const resp = await fetch(`${ESPN_ATHLETE}/${playerId}/stats?season=${ESPN_SEASON}`);
    if (!resp.ok) return null;
    const json = await resp.json();
    const avgCat = json.categories?.find(c => c.name === 'averages');
    if (!avgCat) return null;
    const labels = avgCat.labels || [];
    // Trouve les stats de la saison courante
    const season = avgCat.statistics?.find(s => s.season?.year === ESPN_SEASON);
    if (!season) return null;
    const stats = season.stats || [];
    const get = (label) => {
      const i = labels.indexOf(label);
      return i >= 0 ? stats[i] : null;
    };
    const pts  = parseFloat(get('PTS'))  || null;
    const reb  = parseFloat(get('REB'))  || null;
    const ast  = parseFloat(get('AST'))  || null;
    const min  = parseFloat(get('MIN'))  || null;
    const threeRaw = get('3PT') || '';
    const tpm  = parseFloat(threeRaw.split('-')[0]) || null;
    if (!pts && !reb && !ast) return null;
    return { pts, reb, ast, tpm, min };
  } catch { return null; }
}

app.get('/api/nba/players/:teamId', async (req, res) => {
  const { teamId } = req.params;
  const cached = _espnCache[teamId];
  if (cached && Date.now() - cached.ts < CACHE_6H) return res.json(cached.data);

  try {
    const resp = await fetch(`${ESPN_NBA}/${teamId}/roster`);
    if (!resp.ok) throw new Error(`ESPN ${resp.status}`);
    const json = await resp.json();
    const athletes = json.athletes || [];

    // Fetch stats en parallèle pour tous les joueurs
    const statsArr = await Promise.all(athletes.map(p => fetchPlayerStats(p.id)));

    const players = athletes.map((p, i) => ({
      id:       p.id,
      name:     p.fullName,
      position: p.position?.abbreviation || '—',
      jersey:   p.jersey || '—',
      age:      p.age || null,
      headshot: p.headshot?.href || null,
      injury:   p.injuries?.length ? p.injuries[0].status : null,
      stats:    statsArr[i],
    })).sort((a, b) => (b.stats?.pts ?? -1) - (a.stats?.pts ?? -1));

    // Fetch le dernier match uniquement pour les 5 titulaires (top PPG)
    const starters = players.slice(0, 5);
    const lastGames = await Promise.all(starters.map(p => fetchLastGame(p.id)));
    starters.forEach((p, i) => { p.lastGame = lastGames[i]; });

    const result = { teamId, players };
    _espnCache[teamId] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ESPN Soccer (effectifs football) — aucune clé requise ────────────────────
const ESPN_SOCCER   = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const _espnFbCache  = {};  // `${league}:${teamId}` → { data, ts }

async function fetchEspnRoster(league, teamId) {
  const key = `${league}:${teamId}`;
  const hit = _espnFbCache[key];
  if (hit && Date.now() - hit.ts < CACHE_6H) return hit.data;

  const url  = `${ESPN_SOCCER}/${league}/teams/${teamId}/roster`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`ESPN soccer ${resp.status}`);
  const data = await resp.json();

  const players = (data.athletes || []).map(p => {
    const statsMap = {};
    try {
      for (const cat of p.statistics?.splits?.categories ?? [])
        for (const s of cat.stats) statsMap[s.name] = s.value;
    } catch {}
    const appearances   = statsMap.appearances  ?? 0;
    const subIns        = statsMap.subIns        ?? 0;
    const gamesStarted  = Math.max(0, appearances - subIns);
    return {
      id:           p.id,
      name:         p.displayName,
      shortName:    p.shortName,
      position:     p.position?.abbreviation ?? 'M',
      jerseyNumber: p.jersey ?? null,
      country:      p.citizenship ?? null,
      age:          p.age ?? null,
      appearances,
      gamesStarted,
      injury:       p.injuries?.length
                      ? (p.injuries[0].longComment || p.injuries[0].status || 'Blessé')
                      : null,
    };
  });

  const result = { teamId, players };
  _espnFbCache[key] = { data: result, ts: Date.now() };
  return result;
}

app.get('/api/football/squad/:league/:teamId', async (req, res) => {
  try {
    res.json(await fetchEspnRoster(req.params.league, req.params.teamId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ESPN Soccer — CDM 2026, sélections nationales (force attaque/défense) ────
// Nom (normalisé) → ESPN teamId (league fifa.world)
const ESPN_CDM = {
  algeria: 624, argentina: 202, australia: 628, austria: 474, belgium: 459,
  'bosnia-herzegovina': 452, brazil: 205, canada: 206, 'cape verde': 2597,
  colombia: 208, 'dr congo': 2850, croatia: 477, curacao: 11678,
  czechia: 450, ecuador: 209, egypt: 2620, england: 448, france: 478,
  germany: 481, ghana: 4469, haiti: 2654, iran: 469, iraq: 4375,
  'ivory coast': 4789, japan: 627, jordan: 2917, mexico: 203, morocco: 2869,
  netherlands: 449, 'new zealand': 2666, norway: 464, panama: 2659,
  paraguay: 210, portugal: 482, qatar: 4398, 'saudi arabia': 655,
  scotland: 580, senegal: 654, 'south africa': 467, 'south korea': 451,
  spain: 164, sweden: 466, switzerland: 475, tunisia: 659, turkiye: 465,
  'united states': 660, uruguay: 212, uzbekistan: 2570,
};

// ESPN teamId → confédération (pour les qualifs CDM, fifa.worldq.{conf})
const ESPN_CDM_CONF = {
  624: 'caf', 202: 'conmebol', 628: 'afc', 474: 'uefa', 459: 'uefa', 452: 'uefa',
  205: 'conmebol', 206: 'concacaf', 2597: 'caf', 208: 'conmebol', 2850: 'caf',
  477: 'uefa', 11678: 'concacaf', 450: 'uefa', 209: 'conmebol', 2620: 'caf',
  448: 'uefa', 478: 'uefa', 481: 'uefa', 4469: 'caf', 2654: 'concacaf',
  469: 'afc', 4375: 'afc', 4789: 'caf', 627: 'afc', 2917: 'afc', 203: 'concacaf',
  2869: 'caf', 449: 'uefa', 2666: 'ofc', 464: 'uefa', 2659: 'concacaf',
  210: 'conmebol', 482: 'uefa', 4398: 'afc', 655: 'afc', 580: 'uefa',
  654: 'caf', 467: 'caf', 451: 'afc', 164: 'uefa', 466: 'uefa', 475: 'uefa',
  659: 'caf', 465: 'uefa', 660: 'concacaf', 212: 'conmebol', 2570: 'afc',
};

// Alias noms football-data.org → clé ESPN_CDM
const CDM_NAME_ALIASES = {
  'korea republic': 'south korea',
  'ir iran': 'iran',
  'cote divoire': 'ivory coast',
  usa: 'united states',
  'czech republic': 'czechia',
  'congo dr': 'dr congo',
  'cabo verde': 'cape verde',
  'bosnia and herzegovina': 'bosnia-herzegovina',
};

function normCdmName(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s-]/g, '').replace(/\s+/g, ' ').trim();
}

function extractCdmResult(event, teamId, type) {
  const comp = event.competitions?.[0];
  if (!comp || comp.status?.type?.name !== 'STATUS_FULL_TIME') return null;
  const us   = comp.competitors?.find(c => String(c.team?.id) === String(teamId));
  const them = comp.competitors?.find(c => String(c.team?.id) !== String(teamId));
  if (!us || !them) return null;
  const gf = parseInt(us.score?.displayValue);
  const ga = parseInt(them.score?.displayValue);
  if (isNaN(gf) || isNaN(ga)) return null;
  return { date: event.date, gf, ga, opponent: them.team?.displayName || '', type };
}

async function fetchEspnSoccerSchedule(league, teamId) {
  try {
    const resp = await fetch(`${ESPN_SOCCER}/${league}/teams/${teamId}/schedule`);
    if (!resp.ok) return [];
    return (await resp.json()).events || [];
  } catch { return []; }
}

const _cdmStatsCache = {}; // espnId → { data, ts }
const CDM_STATS_TTL = 24 * 60 * 60 * 1000; // 24h

// Force attaque/défense d'une sélection — basé sur amicaux + qualifs + matchs CDM réels récents (ESPN, gratuit)
app.get('/api/football/cdm/teamstats/:name', async (req, res) => {
  const key = normCdmName(req.params.name);
  const espnId = ESPN_CDM[CDM_NAME_ALIASES[key] || key];
  if (!espnId) return res.status(404).json({ error: `Sélection inconnue: ${req.params.name}` });

  const cached = _cdmStatsCache[espnId];
  if (cached && Date.now() - cached.ts < CDM_STATS_TTL) return res.json(cached.data);

  try {
    const conf = ESPN_CDM_CONF[espnId];
    const [friendlies, qualifiers, worldcup] = await Promise.all([
      fetchEspnSoccerSchedule('fifa.friendly', espnId),
      conf ? fetchEspnSoccerSchedule(`fifa.worldq.${conf}`, espnId) : Promise.resolve([]),
      fetchEspnSoccerSchedule('fifa.world', espnId),
    ]);

    const results = [
      ...friendlies.map(ev => extractCdmResult(ev, espnId, 'friendly')),
      ...qualifiers.map(ev => extractCdmResult(ev, espnId, 'qualifier')),
      ...worldcup.map(ev => extractCdmResult(ev, espnId, 'worldcup')),
    ]
      .filter(Boolean)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 15);

    // Moyenne pondérée : matchs CDM réels (×1.5) > qualifs (×1.3) > amicaux (×0.85) —
    // une fois le tournoi commencé, les matchs de poule déjà joués sont la donnée la plus
    // représentative (effectif et forme actuels, adversaires de niveau CDM), donc le poids
    // le plus fort. Matchs récents (decay exponentiel, demi-vie 9 mois) pèsent plus que les vieux.
    const HALF_LIFE_DAYS = 270;
    const now = Date.now();
    let wSum = 0, gfSum = 0, gaSum = 0;
    for (const r of results) {
      const daysAgo = (now - new Date(r.date).getTime()) / 86400000;
      const recencyW = Math.pow(0.5, daysAgo / HALF_LIFE_DAYS);
      const typeW = r.type === 'worldcup' ? 1.5 : r.type === 'qualifier' ? 1.3 : 0.85;
      const w = recencyW * typeW;
      wSum += w;
      gfSum += r.gf * w;
      gaSum += r.ga * w;
    }

    const games = results.length;
    const goalsFor     = wSum ? gfSum / wSum : null;
    const goalsAgainst = wSum ? gaSum / wSum : null;
    const lastMatchDate = results[0]?.date ?? null;

    const result = { espnId, games, goalsFor, goalsAgainst, lastMatchDate, results };
    _cdmStatsCache[espnId] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Moyennes du pool CDM (avgGF/avgGA) — exposées pour que MatchDetailPage applique la même normalisation
// que le backend. Avec ?fixtureId=fdcdm_xxx : renvoie la valeur figée pour ce match (cf freezeCdmPoolAvg)
// si elle existe déjà, sinon le pool courant (1ère fois que ce match est consulté/généré).
app.get('/api/football/cdm/poolavg', (req, res) => {
  const { fixtureId } = req.query;
  if (fixtureId && _cdmFixturePoolAvg[fixtureId]) return res.json(_cdmFixturePoolAvg[fixtureId]);
  res.json(_cdmPoolAvg);
});

// Effectif d'une sélection CDM par nom (ex: Mexico, South Africa) — résout l'ID ESPN via ESPN_CDM
app.get('/api/football/cdm/squad/:name', async (req, res) => {
  const key = normCdmName(req.params.name);
  const espnId = ESPN_CDM[CDM_NAME_ALIASES[key] || key];
  if (!espnId) return res.status(404).json({ error: `Sélection inconnue: ${req.params.name}` });
  try {
    res.json(await fetchEspnRoster('fifa.world', espnId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── NBA Team Schedule ─────────────────────────────────────────────────────────
app.get('/api/nba/teamschedule/:teamId', async (req, res) => {
  const { teamId } = req.params;
  const cacheKey = `sched_${teamId}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return res.json(cached.data);

  try {
    const resp = await fetch(`${ESPN_NBA}/${teamId}/schedule`);
    if (!resp.ok) throw new Error(`ESPN ${resp.status}`);
    const json = await resp.json();

    const games = [];
    for (const event of (json.events || [])) {
      const comp = event.competitions?.[0];
      if (!comp) continue;
      const statusName = comp.status?.type?.name || '';
      if (!statusName.includes('STATUS_FINAL')) continue;

      const us   = comp.competitors?.find(c => String(c.id) === String(teamId));
      const them = comp.competitors?.find(c => String(c.id) !== String(teamId));
      if (!us || !them) continue;

      const ptsScored  = parseInt(us.score?.displayValue   ?? us.score)   || 0;
      const ptsAllowed = parseInt(them.score?.displayValue ?? them.score) || 0;
      if (ptsScored <= 0) continue;

      games.push({
        date:         event.date,
        isHome:       us.homeAway === 'home',
        ptsScored,
        ptsAllowed,
        opponentAbbr: them.team?.abbreviation || '?',
      });
    }

    // Sort descending by date, take last 30
    games.sort((a, b) => new Date(b.date) - new Date(a.date));
    const result = { teamId, games: games.slice(0, 30) };
    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/nba/h2h/:homeId', async (req, res) => {
  const { homeId } = req.params;
  const homeShort = (req.query.home || '').toUpperCase();
  const awayShort = (req.query.away || '').toUpperCase();
  if (!awayShort) return res.json({ h2h: [] });
  const cacheKey = `nba_h2h_${homeId}_${awayShort}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return res.json(cached.data);
  const ESPN_TO_ESPN = { SAS:'SA', NYK:'NY', GSW:'GS', NOP:'NO', UTA:'UT' };
  const ESPN_TO_STD  = { SA:'SAS', NY:'NYK', GS:'GSW', NO:'NOP', UT:'UTA' };
  const toEspn = a => ESPN_TO_ESPN[a] || a;
  const toStd  = a => ESPN_TO_STD[a]  || a;
  const awayEspn = toEspn(awayShort);
  try {
    const resp = await fetch(`${ESPN_NBA}/${homeId}/schedule`);
    if (!resp.ok) throw new Error(`ESPN NBA schedule ${resp.status}`);
    const json = await resp.json();
    const h2h = [];
    for (const event of (json.events || [])) {
      const comp = event.competitions?.[0];
      if (!comp || !comp.status?.type?.name?.includes('STATUS_FINAL')) continue;
      const us   = comp.competitors?.find(c => String(c.id) === String(homeId));
      const them = comp.competitors?.find(c => String(c.id) !== String(homeId));
      if (!us || !them) continue;
      if ((them.team?.abbreviation || '').toUpperCase() !== awayEspn) continue;
      const usScore   = parseInt(us.score?.displayValue   ?? us.score)   || 0;
      const themScore = parseInt(them.score?.displayValue ?? them.score) || 0;
      if (usScore <= 0) continue;
      const isHome = us.homeAway === 'home';
      h2h.push({
        date:      event.date?.slice(0, 10),
        home:      isHome ? homeShort      : toStd(awayEspn),
        away:      isHome ? toStd(awayEspn): homeShort,
        scoreHome: isHome ? usScore        : themScore,
        scoreAway: isHome ? themScore      : usScore,
      });
    }
    h2h.sort((a, b) => new Date(a.date) - new Date(b.date));
    const result = { h2h };
    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── NBA Player Game Log ───────────────────────────────────────────────────────
app.get('/api/nba/playergamelog/:playerId', async (req, res) => {
  const { playerId } = req.params;
  const cacheKey = `gl_${playerId}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return res.json(cached.data);

  try {
    const resp = await fetch(`${ESPN_ATHLETE}/${playerId}/gamelog?season=${ESPN_SEASON}`);
    if (!resp.ok) throw new Error(`ESPN ${resp.status}`);
    const json = await resp.json();

    const labels  = json.labels || [];
    const iPTS    = labels.indexOf('PTS');
    const iREB    = labels.indexOf('REB');
    const iAST    = labels.indexOf('AST');
    const iMIN    = labels.indexOf('MIN');
    const iFG     = labels.indexOf('FG');   // "fgm-fga" format
    const iFT     = labels.indexOf('FT');   // "ftm-fta" format
    const i3PT    = labels.indexOf('3PT');  // "3pm-3pa" format
    const iTO     = labels.indexOf('TO');
    const iSTL    = labels.indexOf('STL');
    const iBLK    = labels.indexOf('BLK');
    const iOREB   = labels.indexOf('OREB');
    const iDREB   = labels.indexOf('DREB');
    const iPF     = labels.indexOf('PF');
    const iPM     = labels.indexOf('+/-');

    const parseMadeAtt = (stats, idx) => {
      if (idx < 0) return { made: 0, att: 0 };
      const parts = String(stats[idx] ?? '').split('-');
      return parts.length === 2
        ? { made: parseInt(parts[0]) || 0, att: parseInt(parts[1]) || 0 }
        : { made: 0, att: 0 };
    };

    const eventsMap = json.events || {};
    const games = [];

    for (const st of (json.seasonTypes || [])) {
      for (const cat of (st.categories || [])) {
        if (cat.type === 'total') continue;
        for (const ev of (cat.events || [])) {
          const meta = eventsMap[ev.eventId];
          if (!meta?.gameDate) continue;

          const stats  = ev.stats || [];
          const pts    = iPTS  >= 0 ? parseFloat(stats[iPTS])  || 0 : 0;
          const reb    = iREB  >= 0 ? parseFloat(stats[iREB])  || 0 : 0;
          const ast    = iAST  >= 0 ? parseFloat(stats[iAST])  || 0 : 0;
          const minRaw = iMIN  >= 0 ? stats[iMIN] : '0';
          const min    = parseFloat(String(minRaw).split(':')[0]) || 0;
          const stl    = iSTL  >= 0 ? parseFloat(stats[iSTL])  || 0 : 0;
          const blk    = iBLK  >= 0 ? parseFloat(stats[iBLK])  || 0 : 0;
          const oreb   = iOREB >= 0 ? parseFloat(stats[iOREB]) || 0 : 0;
          const dreb   = iDREB >= 0 ? parseFloat(stats[iDREB]) || 0 : 0;
          const pf     = iPF   >= 0 ? parseFloat(stats[iPF])   || 0 : 0;
          const pm     = iPM   >= 0 ? parseFloat(stats[iPM])   || 0 : 0;
          const to     = iTO   >= 0 ? parseFloat(stats[iTO])   || 0 : 0;

          const fg  = parseMadeAtt(stats, iFG);
          const ft  = parseMadeAtt(stats, iFT);
          const tpt = parseMadeAtt(stats, i3PT);

          // Skip DNP
          if (pts === 0 && reb === 0 && min === 0) continue;

          // TS% = pts / (2 × (fga + 0.44 × fta))  — efficacité réelle au tir
          const tsDenom = 2 * (fg.att + 0.44 * ft.att);
          const tsPct   = tsDenom > 0 ? pts / tsDenom : null;

          games.push({
            date:  meta.gameDate,
            pts, reb, ast, min, to, stl, blk, oreb, dreb, pf, pm,
            fgm: fg.made,  fga: fg.att,
            ftm: ft.made,  fta: ft.att,
            fg3m: tpt.made, fg3a: tpt.att, tpm: tpt.made,
            tsPct,
            opponentAbbr: meta.opponent?.abbreviation || '?',
            isHome:       meta.atVs !== '@',
          });
        }
      }
    }

    // Sort descending by date, take 30 (capture full playoff run + recent regular season)
    games.sort((a, b) => new Date(b.date) - new Date(a.date));
    const result = { playerId, games: games.slice(0, 30) };
    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── NBA Stats (stats.nba.com) ─────────────────────────────────────────────────
const NBA_STATS_BASE = 'https://stats.nba.com/stats';
const NBA_SEASON     = '2025-26';
const NBA_STATS_HDR  = {
  'User-Agent':          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer':             'https://www.nba.com/',
  'Accept':              'application/json, text/plain, */*',
  'Accept-Language':     'en-US,en;q=0.9',
  'x-nba-stats-origin':  'stats',
  'x-nba-stats-token':   'true',
};

// ESPN team ID (notre app) → NBA Stats team ID (stats.nba.com)
const ESPN_TO_NBA_ID = {
  1:  1610612737, 2:  1610612738, 3:  1610612740, 4:  1610612741,
  5:  1610612739, 6:  1610612742, 7:  1610612743, 8:  1610612765,
  9:  1610612744, 10: 1610612745, 11: 1610612754, 12: 1610612746,
  13: 1610612747, 14: 1610612748, 15: 1610612749, 16: 1610612750,
  17: 1610612751, 18: 1610612752, 19: 1610612753, 20: 1610612755,
  21: 1610612756, 22: 1610612757, 23: 1610612758, 24: 1610612759,
  25: 1610612760, 26: 1610612762, 27: 1610612764, 28: 1610612761,
  29: 1610612763, 30: 1610612766,
};

async function nbaStatsGet(endpoint, timeoutMs = 10000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const resp = await fetch(`${NBA_STATS_BASE}/${endpoint}`, { headers: NBA_STATS_HDR, signal: ac.signal });
    if (!resp.ok) throw new Error(`stats.nba.com ${resp.status}: ${endpoint}`);
    return resp.json();
  } finally {
    clearTimeout(t);
  }
}

function parseNbaRows(json) {
  const rs = json.resultSets?.[0];
  if (!rs) return [];
  const h = rs.headers;
  return (rs.rowSet || []).map(row => {
    const obj = {};
    h.forEach((k, i) => { obj[k] = row[i]; });
    return obj;
  });
}

// Redistribution des minutes/stats vers les joueurs actifs quand un titulaire est Out
// (NBA playoffs, EU, WNBA) — share = part des minutes du joueur actif parmi les actifs
// Plafond +15% (resserré 19 juin 2026, était +25% — jugé trop généreux appliqué individuellement
// à chaque joueur du pool plutôt que mutualisé sur l'équipe) et pool limité aux 8 joueurs les
// plus utilisés (cf appelants, `slice(0,8)` — resserré de 12, qui couvrait quasi tout le roster).
function computeRedist(outPlayers, activePlayers) {
  const totalOutMin = outPlayers.reduce((s, p) => s + (p.stats?.min ?? 0), 0);
  if (!totalOutMin) return {};
  const totalActiveMin = activePlayers.reduce((s, p) => s + (p.stats?.min ?? 1), 0);
  if (!totalActiveMin) return {};
  const factors = {};
  activePlayers.forEach(p => {
    const share = (p.stats?.min ?? 0) / totalActiveMin;
    factors[String(p.id)] = Math.min(1.15, 1 + (share * totalOutMin) / Math.max(p.stats?.min ?? 1, 1));
  });
  return factors;
}

// GET /api/nba/leagueadvanced
// Retourne un objet keyed par PLAYER_NAME : { usg, ts }
async function getLeagueAdv() {
  const cacheKey = 'nba_league_adv';
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return cached.data;
  const json = await nbaStatsGet(
    `leaguedashplayerstats?Season=${NBA_SEASON}&SeasonType=Regular+Season&MeasureType=Advanced&PerMode=PerGame`
  );
  const rows = parseNbaRows(json);
  const data = {};
  for (const r of rows) {
    data[r.PLAYER_NAME] = {
      usg: r.USG_PCT != null ? +(r.USG_PCT * 100).toFixed(1) : null,
      ts:  r.TS_PCT  != null ? +(r.TS_PCT  * 100).toFixed(1) : null,
    };
  }
  _espnCache[cacheKey] = { data, ts: Date.now() };
  return data;
}

app.get('/api/nba/leagueadvanced', async (req, res) => {
  try { res.json(await getLeagueAdv()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/nba/teamdefbypos/:espnTeamId
// Retourne { G: 23.1, F: 18.4, C: 14.9 } = pts/game encaissés par position
app.get('/api/nba/teamdefbypos/:espnTeamId', async (req, res) => {
  const nbaTeamId = ESPN_TO_NBA_ID[Number(req.params.espnTeamId)];
  if (!nbaTeamId) return res.status(404).json({ error: 'Team not found' });

  const cacheKey = `nba_defpos_${req.params.espnTeamId}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return res.json(cached.data);

  try {
    const base = `leaguedashplayerstats?Season=${NBA_SEASON}&SeasonType=Regular+Season&MeasureType=Base&PerMode=PerGame&OpponentTeamID=${nbaTeamId}`;
    // 3 appels séquentiels pour éviter le rate-limit
    const gJson = await nbaStatsGet(`${base}&PlayerPosition=G`);
    await new Promise(r => setTimeout(r, 300));
    const fJson = await nbaStatsGet(`${base}&PlayerPosition=F`);
    await new Promise(r => setTimeout(r, 300));
    const cJson = await nbaStatsGet(`${base}&PlayerPosition=C`);

    const avgPts = (json) => {
      const rows = parseNbaRows(json);
      if (!rows.length) return null;
      return +(rows.reduce((s, r) => s + (r.PTS || 0), 0) / rows.length).toFixed(1);
    };

    const data = { G: avgPts(gJson), F: avgPts(fJson), C: avgPts(cJson) };
    _espnCache[cacheKey] = { data, ts: Date.now() };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── NBA Box Score (ESPN, cache 5 min pour rattraper corrections post-match) ────
const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary';

app.get('/api/nba/boxscore', async (req, res) => {
  const { date, home, away } = req.query;
  if (!date || !home || !away) return res.status(400).json({ error: 'date, home, away requis' });

  const cacheKey = `bs_${date}_${home}_${away}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_5MIN) return res.json(cached.data);

  try {
    // Convertir UTC → heure de l'Est (UTC-5) pour la date ESPN
    const dt  = new Date(date);
    const est = new Date(dt.getTime() - 5 * 60 * 60 * 1000);
    const ymd = est.toISOString().slice(0, 10).replace(/-/g, '');

    // 1. Scoreboard du jour → trouver l'event ID
    const sbResp = await fetch(`${ESPN_SCOREBOARD}?dates=${ymd}&limit=50`);
    if (!sbResp.ok) throw new Error(`ESPN scoreboard ${sbResp.status}`);
    const sbData = await sbResp.json();

    // ESPN utilise des abréviations courtes ('SA', 'NY', 'GS') vs les standards ('SAS', 'NYK', 'GSW')
    const ESPN_ABBR_MAP = { SAS:'SA', NYK:'NY', GSW:'GS', NOP:'NO', UTA:'UT' };
    const toEspn = a => ESPN_ABBR_MAP[a.toUpperCase()] || a.toUpperCase();
    const homeE = toEspn(home), awayE = toEspn(away);

    const game = (sbData.events || []).find(e => {
      const abbrs = (e.competitions?.[0]?.competitors || []).map(c => c.team?.abbreviation?.toUpperCase() || '');
      return abbrs.includes(homeE) && abbrs.includes(awayE);
    });

    if (!game) return res.status(404).json({ error: 'Match introuvable', date: ymd, home, away });

    // 2. Summary → box score
    const sumResp = await fetch(`${ESPN_SUMMARY}?event=${game.id}`);
    if (!sumResp.ok) throw new Error(`ESPN summary ${sumResp.status}`);
    const sumData = await sumResp.json();

    // 3. Parser les stats par équipe (clés = abréviations originales passées par le client)
    const ABBR_BACK = Object.fromEntries(Object.entries(ESPN_ABBR_MAP).map(([k,v]) => [v, k]));
    const toOrig = a => ABBR_BACK[a.toUpperCase()] || a.toUpperCase();

    // Scores d'équipe depuis les competitors ESPN
    const competitors = game.competitions?.[0]?.competitors || [];
    const homeComp = competitors.find(c => c.homeAway === 'home');
    const awayComp = competitors.find(c => c.homeAway === 'away');
    const result = {
      gameId: game.id,
      status: game.status?.type?.name,
      homeScore: homeComp?.score != null ? parseInt(homeComp.score) : null,
      awayScore: awayComp?.score != null ? parseInt(awayComp.score) : null,
    };
    for (const teamData of (sumData.boxscore?.players || [])) {
      const espnAbbr = teamData.team?.abbreviation?.toUpperCase();
      const abbr     = toOrig(espnAbbr);
      const group  = teamData.statistics?.[0];
      if (!group) continue;
      const labels = (group.labels || []).map(l => l.toLowerCase());

      result[abbr] = (group.athletes || []).map(a => {
        const vals = a.stats || [];
        const s = {};
        labels.forEach((l, i) => { s[l] = vals[i] ?? '—'; });
        return {
          id:       a.athlete?.id,
          name:     a.athlete?.displayName,
          position: a.athlete?.position?.abbreviation || '—',
          headshot: a.athlete?.headshot?.href || null,
          starter:  a.starter ?? false,
          dnp:      !!a.didNotPlay,
          stats: {
            min: s.min || '—',
            pts: parseFloat(s.pts) || 0,
            reb: parseFloat(s.reb) || 0,
            ast: parseFloat(s.ast) || 0,
            stl: parseFloat(s.stl) || 0,
            blk: parseFloat(s.blk) || 0,
            to:  parseFloat(s.to)  || 0,
            fg:  s.fg  || '—',
            tpm: s['3pt'] || '—',
            ft:  s.ft  || '—',
            pm:  s['+/-'] || '—',
          },
        };
      });
    }

    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    console.error('boxscore:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── WNBA ─────────────────────────────────────────────────────────────────────
const ESPN_WNBA_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/summary';
let _wnbaScoreboardCache = { data: null, ts: 0 };

app.get('/api/wnba/boxscore', async (req, res) => {
  const { date, home, away } = req.query;
  if (!date || !home || !away) return res.status(400).json({ error: 'date, home, away requis' });

  const cacheKey = `wnba_bs_${date}_${home}_${away}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_5MIN) return res.json(cached.data);

  try {
    // Convertir UTC → heure de l'Est (UTC-5) pour la date ESPN
    const dt  = new Date(date);
    const est = new Date(dt.getTime() - 5 * 60 * 60 * 1000);
    const ymd = est.toISOString().slice(0, 10).replace(/-/g, '');

    // 1. Scoreboard du jour → trouver l'event ID
    const sbResp = await fetch(`${ESPN_WNBA_SB}?dates=${ymd}&limit=50`);
    if (!sbResp.ok) throw new Error(`ESPN scoreboard ${sbResp.status}`);
    const sbData = await sbResp.json();

    const homeU = home.toUpperCase(), awayU = away.toUpperCase();
    const game = (sbData.events || []).find(e => {
      const abbrs = (e.competitions?.[0]?.competitors || []).map(c => c.team?.abbreviation?.toUpperCase() || '');
      return abbrs.includes(homeU) && abbrs.includes(awayU);
    });

    if (!game) return res.status(404).json({ error: 'Match introuvable', date: ymd, home, away });

    // 2. Summary → box score
    const sumResp = await fetch(`${ESPN_WNBA_SUMMARY}?event=${game.id}`);
    if (!sumResp.ok) throw new Error(`ESPN summary ${sumResp.status}`);
    const sumData = await sumResp.json();

    // Scores d'équipe depuis les competitors ESPN
    const competitors = game.competitions?.[0]?.competitors || [];
    const homeComp = competitors.find(c => c.homeAway === 'home');
    const awayComp = competitors.find(c => c.homeAway === 'away');
    const result = {
      gameId: game.id,
      status: game.status?.type?.name,
      homeScore: homeComp?.score != null ? parseInt(homeComp.score) : null,
      awayScore: awayComp?.score != null ? parseInt(awayComp.score) : null,
    };
    for (const teamData of (sumData.boxscore?.players || [])) {
      const abbr  = teamData.team?.abbreviation?.toUpperCase();
      const group = teamData.statistics?.[0];
      if (!group || !abbr) continue;
      const labels = (group.labels || []).map(l => l.toLowerCase());

      result[abbr] = (group.athletes || []).map(a => {
        const vals = a.stats || [];
        const s = {};
        labels.forEach((l, i) => { s[l] = vals[i] ?? '—'; });
        return {
          id:       a.athlete?.id,
          name:     a.athlete?.displayName,
          position: a.athlete?.position?.abbreviation || '—',
          headshot: a.athlete?.headshot?.href || null,
          starter:  a.starter ?? false,
          dnp:      !!a.didNotPlay,
          stats: {
            min: s.min || '—',
            pts: parseFloat(s.pts) || 0,
            reb: parseFloat(s.reb) || 0,
            ast: parseFloat(s.ast) || 0,
            stl: parseFloat(s.stl) || 0,
            blk: parseFloat(s.blk) || 0,
            to:  parseFloat(s.to)  || 0,
            fg:  s.fg  || '—',
            tpm: s['3pt'] || '—',
            ft:  s.ft  || '—',
            pm:  s['+/-'] || '—',
          },
        };
      });
    }

    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    console.error('wnba boxscore:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function fetchWNBAPlayerStats(playerId) {
  try {
    const resp = await fetch(`${ESPN_WNBA_ATH}/${playerId}/stats?season=${WNBA_SEASON}`);
    if (!resp.ok) return null;
    const json = await resp.json();
    const avgCat = json.categories?.find(c => c.name === 'averages');
    if (!avgCat) return null;
    const labels = avgCat.labels || [];
    const season = avgCat.statistics?.find(s => s.season?.year === WNBA_SEASON)
      || avgCat.statistics?.find(s => s.season?.year === WNBA_SEASON - 1)
      || avgCat.statistics?.[0];
    if (!season) return null;
    const stats = season.stats || [];
    const get = label => { const i = labels.indexOf(label); return i >= 0 ? stats[i] : null; };
    const pts = parseFloat(get('PTS')) || null;
    const reb = parseFloat(get('REB')) || null;
    const ast = parseFloat(get('AST')) || null;
    const min = parseFloat(get('MIN')) || null;
    const threeRaw = get('3PT') || '';
    const tpm = parseFloat(threeRaw.split('-')[0]) || null;
    if (!pts && !reb && !ast) return null;
    return { pts, reb, ast, tpm, min };
  } catch { return null; }
}

app.get('/api/wnba/scoreboard', async (req, res) => {
  const hasLive = _wnbaScoreboardCache.data?.games?.some(g => g.status === 'STATUS_IN_PROGRESS');
  const ttl = hasLive ? 30_000 : CACHE_5MIN;
  if (_wnbaScoreboardCache.data && Date.now() - _wnbaScoreboardCache.ts < ttl)
    return res.json(_wnbaScoreboardCache.data);
  try {
    const allEvents = [];
    const todayResp = await fetch(`${ESPN_WNBA_SB}?limit=50`);
    if (todayResp.ok) allEvents.push(...((await todayResp.json()).events || []));
    for (let i = -1; i <= 4; i++) {
      const d = new Date(Date.now() + i * 86400000);
      const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
      const resp = await fetch(`${ESPN_WNBA_SB}?dates=${dateStr}&limit=50`);
      if (!resp.ok) continue;
      allEvents.push(...((await resp.json()).events || []));
    }
    const seen = new Set();
    const unique = allEvents.filter(ev => { if (seen.has(ev.id)) return false; seen.add(ev.id); return true; });
    const games = unique.map(ev => { const g = normalizeGame(ev); return g ? { ...g, league: 'wnba' } : null; }).filter(Boolean);
    _wnbaScoreboardCache = { data: { games }, ts: Date.now() };
    res.json({ games });
  } catch (err) {
    if (_wnbaScoreboardCache.data) return res.json(_wnbaScoreboardCache.data);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/wnba/players/:teamId', async (req, res) => {
  const { teamId } = req.params;
  const cacheKey = `wnba_roster_${teamId}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return res.json(cached.data);
  try {
    const resp = await fetch(`${ESPN_WNBA}/${teamId}/roster`);
    if (!resp.ok) throw new Error(`ESPN WNBA ${resp.status}`);
    const json = await resp.json();
    const athletes = json.athletes || [];
    const statsArr = await Promise.all(athletes.map(p => fetchWNBAPlayerStats(p.id)));
    const players = athletes.map((p, i) => ({
      id:       p.id,
      name:     p.fullName,
      position: p.position?.abbreviation || '—',
      jersey:   p.jersey || '—',
      age:      p.age || null,
      headshot: p.headshot?.href || null,
      injury:   null, // rely on RotoWire only — ESPN WNBA injuries are stale
      stats:    statsArr[i],
    })).sort((a, b) => (b.stats?.pts ?? -1) - (a.stats?.pts ?? -1));
    const result = { teamId, players };
    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/wnba/teamschedule/:teamId', async (req, res) => {
  const { teamId } = req.params;
  const cacheKey = `wnba_sched_${teamId}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return res.json(cached.data);
  try {
    const resp = await fetch(`${ESPN_WNBA}/${teamId}/schedule`);
    if (!resp.ok) throw new Error(`ESPN WNBA ${resp.status}`);
    const json = await resp.json();
    const games = [];
    for (const event of (json.events || [])) {
      const comp = event.competitions?.[0];
      if (!comp) continue;
      if (!comp.status?.type?.name?.includes('STATUS_FINAL')) continue;
      const us   = comp.competitors?.find(c => String(c.id) === String(teamId));
      const them = comp.competitors?.find(c => String(c.id) !== String(teamId));
      if (!us || !them) continue;
      const ptsScored  = parseInt(us.score?.displayValue   ?? us.score)   || 0;
      const ptsAllowed = parseInt(them.score?.displayValue ?? them.score) || 0;
      if (ptsScored <= 0) continue;
      games.push({ date: event.date, isHome: us.homeAway === 'home', ptsScored, ptsAllowed, opponentAbbr: them.team?.abbreviation || '?' });
    }
    games.sort((a, b) => new Date(b.date) - new Date(a.date));
    const result = { teamId, games: games.slice(0, 30) };
    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/wnba/playergamelog/:playerId', async (req, res) => {
  const { playerId } = req.params;
  const cacheKey = `wnba_gl_${playerId}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return res.json(cached.data);
  try {
    const resp = await fetch(`${ESPN_WNBA_ATH}/${playerId}/gamelog?season=${WNBA_SEASON}`);
    if (!resp.ok) throw new Error(`ESPN WNBA ${resp.status}`);
    const json = await resp.json();
    const labels = json.labels || [];
    const iPTS = labels.indexOf('PTS'), iREB = labels.indexOf('REB'), iAST = labels.indexOf('AST');
    const iMIN = labels.indexOf('MIN'), iTO  = labels.indexOf('TO'),  iSTL = labels.indexOf('STL');
    const iBLK = labels.indexOf('BLK'), iPF  = labels.indexOf('PF');
    const iFG  = labels.indexOf('FG'),  iFT  = labels.indexOf('FT'),  i3PT = labels.indexOf('3PT');
    const parseMadeAtt = (stats, idx) => {
      if (idx < 0) return { made: 0, att: 0 };
      const parts = String(stats[idx] ?? '').split('-');
      return parts.length === 2 ? { made: parseInt(parts[0]) || 0, att: parseInt(parts[1]) || 0 } : { made: 0, att: 0 };
    };
    const eventsMap = json.events || {};
    const games = [];
    for (const st of (json.seasonTypes || [])) {
      for (const cat of (st.categories || [])) {
        if (cat.type === 'total') continue;
        for (const ev of (cat.events || [])) {
          const meta = eventsMap[ev.eventId];
          if (!meta?.gameDate) continue;
          const stats = ev.stats || [];
          const pts  = iPTS >= 0 ? parseFloat(stats[iPTS]) || 0 : 0;
          const reb  = iREB >= 0 ? parseFloat(stats[iREB]) || 0 : 0;
          const ast  = iAST >= 0 ? parseFloat(stats[iAST]) || 0 : 0;
          const min  = iMIN >= 0 ? parseFloat(String(stats[iMIN]).split(':')[0]) || 0 : 0;
          const to   = iTO  >= 0 ? parseFloat(stats[iTO])  || 0 : 0;
          const stl  = iSTL >= 0 ? parseFloat(stats[iSTL]) || 0 : 0;
          const blk  = iBLK >= 0 ? parseFloat(stats[iBLK]) || 0 : 0;
          const pf   = iPF  >= 0 ? parseFloat(stats[iPF])  || 0 : 0;
          if (pts === 0 && reb === 0 && min === 0) continue;
          const fg = parseMadeAtt(stats, iFG), ft = parseMadeAtt(stats, iFT), tpt = parseMadeAtt(stats, i3PT);
          const tsDenom = 2 * (fg.att + 0.44 * ft.att);
          games.push({
            date: meta.gameDate, pts, reb, ast, min, to, stl, blk, pf,
            fgm: fg.made, fga: fg.att, ftm: ft.made, fta: ft.att, fg3m: tpt.made, fg3a: tpt.att, tpm: tpt.made,
            oreb: 0, dreb: 0, pm: 0,
            tsPct: tsDenom > 0 ? pts / tsDenom : null,
            opponentAbbr: meta.opponent?.abbreviation || '?',
            isHome: meta.atVs !== '@',
          });
        }
      }
    }
    games.sort((a, b) => new Date(b.date) - new Date(a.date));
    const result = { playerId, games: games.slice(0, 30) };
    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/wnba/boxscore', async (req, res) => {
  const { date, home, away } = req.query;
  if (!date || !home || !away) return res.status(400).json({ error: 'date, home, away requis' });
  const cacheKey = `wnba_bs_${date}_${home}_${away}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_5MIN) return res.json(cached.data);
  try {
    const dt = new Date(date);
    const est = new Date(dt.getTime() - 4 * 60 * 60 * 1000);
    const ymd = est.toISOString().slice(0, 10).replace(/-/g, '');
    const sbResp = await fetch(`${ESPN_WNBA_SB}?dates=${ymd}&limit=50`);
    if (!sbResp.ok) throw new Error(`ESPN WNBA scoreboard ${sbResp.status}`);
    const sbData = await sbResp.json();
    const normAbbr = a => (a || '').toUpperCase();
    const game = (sbData.events || []).find(e => {
      const abbrs = (e.competitions?.[0]?.competitors || []).map(c => normAbbr(c.team?.abbreviation));
      return abbrs.includes(normAbbr(home)) && abbrs.includes(normAbbr(away));
    });
    if (!game) return res.status(404).json({ error: 'Match introuvable', date: ymd, home, away });
    const sumResp = await fetch(`${ESPN_WNBA_SUMMARY}?event=${game.id}`);
    if (!sumResp.ok) throw new Error(`ESPN WNBA summary ${sumResp.status}`);
    const sumData = await sumResp.json();
    const competitors = game.competitions?.[0]?.competitors || [];
    const homeComp = competitors.find(c => c.homeAway === 'home');
    const awayComp = competitors.find(c => c.homeAway === 'away');
    const result = {
      gameId: game.id,
      status: game.status?.type?.name,
      homeScore: homeComp?.score != null ? parseInt(homeComp.score) : null,
      awayScore: awayComp?.score != null ? parseInt(awayComp.score) : null,
    };
    for (const teamData of (sumData.boxscore?.players || [])) {
      const abbr = (teamData.team?.abbreviation || '').toUpperCase();
      const group = teamData.statistics?.[0];
      if (!group) continue;
      const labels = (group.labels || []).map(l => l.toLowerCase());
      result[abbr] = (group.athletes || []).map(a => {
        const vals = a.stats || [];
        const s = {};
        labels.forEach((l, i) => { s[l] = vals[i] ?? '—'; });
        return {
          id: a.athlete?.id, name: a.athlete?.displayName,
          position: a.athlete?.position?.abbreviation || '—',
          headshot: a.athlete?.headshot?.href || null,
          starter: a.starter ?? false, dnp: !!a.didNotPlay,
          stats: { min: s.min || '—', pts: parseFloat(s.pts) || 0, reb: parseFloat(s.reb) || 0, ast: parseFloat(s.ast) || 0, stl: parseFloat(s.stl) || 0, blk: parseFloat(s.blk) || 0, to: parseFloat(s.to) || 0, fg: s.fg || '—', tpm: s['3pt'] || '—', ft: s.ft || '—', pm: s['+/-'] || '—' },
        };
      });
    }
    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── NBA Team Stats ───────────────────────────────────────────────────────────
app.get('/api/nba/teamstats/:teamId', async (req, res) => {
  const { teamId } = req.params;
  const cacheKey = `nba_teamstats_${teamId}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return res.json(cached.data);
  try {
    const resp = await fetch(`${ESPN_NBA}/${teamId}/statistics?season=${ESPN_SEASON}`);
    if (!resp.ok) throw new Error(`ESPN NBA teamstats ${resp.status}`);
    const data = await resp.json();
    // ESPN returns results.stats.categories[].stats
    const categories = data.results?.stats?.categories || data.splits?.categories || [];
    const statsArr = categories.flatMap(c => c.stats || c.statistics || []);
    const get = (...keys) => {
      for (const k of keys) {
        const s = statsArr.find(s => s.name === k || s.abbreviation === k);
        if (s) return parseFloat(s.value ?? s.displayValue) || null;
      }
      return null;
    };
    let oppg = get('avgPointsAllowed', 'avgOpponentPoints');
    if (oppg == null) {
      try {
        const schedResp = await fetch(`${ESPN_NBA}/${teamId}/schedule`);
        if (schedResp.ok) {
          const schedJson = await schedResp.json();
          const ptsAllowed = [];
          for (const ev of (schedJson.events || [])) {
            const comp = ev.competitions?.[0];
            if (!comp?.status?.type?.name?.includes('STATUS_FINAL')) continue;
            const us   = comp.competitors?.find(c => String(c.id) === String(teamId));
            const them = comp.competitors?.find(c => String(c.id) !== String(teamId));
            if (!us || !them) continue;
            const pa = parseInt(them.score?.displayValue ?? them.score) || 0;
            if (pa > 0) ptsAllowed.push(pa);
          }
          if (ptsAllowed.length) oppg = ptsAllowed.reduce((a, b) => a + b, 0) / ptsAllowed.length;
        }
      } catch {}
    }
    const result = {
      ppg:  get('avgPoints'),
      oppg: oppg ? Math.round(oppg * 10) / 10 : null,
      rpg:  get('avgRebounds'),
      apg:  get('avgAssists'),
      fg:   get('fieldGoalPct'),
    };
    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WNBA Team Stats ──────────────────────────────────────────────────────────
app.get('/api/wnba/teamstats/:teamId', async (req, res) => {
  const { teamId } = req.params;
  const cacheKey = `wnba_teamstats_${teamId}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return res.json(cached.data);
  try {
    const resp = await fetch(`${ESPN_WNBA_STATS}/${teamId}/statistics?season=${WNBA_SEASON}`);
    if (!resp.ok) throw new Error(`ESPN WNBA teamstats ${resp.status}`);
    const data = await resp.json();
    // ESPN returns results.stats.categories[].stats
    const categories = data.results?.stats?.categories || data.splits?.categories || [];
    const statsArr = categories.flatMap(c => c.stats || c.statistics || []);
    const get = (...keys) => {
      for (const k of keys) {
        const s = statsArr.find(s => s.name === k || s.abbreviation === k);
        if (s) return parseFloat(s.value ?? s.displayValue) || null;
      }
      return null;
    };
    let oppg = get('avgPointsAllowed', 'avgOpponentPoints');
    if (oppg == null) {
      try {
        const schedResp = await fetch(`${ESPN_WNBA}/${teamId}/schedule`);
        if (schedResp.ok) {
          const schedJson = await schedResp.json();
          const ptsAllowed = [];
          for (const ev of (schedJson.events || [])) {
            const comp = ev.competitions?.[0];
            if (!comp?.status?.type?.name?.includes('STATUS_FINAL')) continue;
            const us   = comp.competitors?.find(c => String(c.id) === String(teamId));
            const them = comp.competitors?.find(c => String(c.id) !== String(teamId));
            if (!us || !them) continue;
            const pa = parseInt(them.score?.displayValue ?? them.score) || 0;
            if (pa > 0) ptsAllowed.push(pa);
          }
          if (ptsAllowed.length) oppg = ptsAllowed.reduce((a, b) => a + b, 0) / ptsAllowed.length;
        }
      } catch {}
    }
    const result = {
      ppg:  get('avgPoints'),
      oppg: oppg ? Math.round(oppg * 10) / 10 : null,
      rpg:  get('avgRebounds'),
      apg:  get('avgAssists'),
      fg:   get('fieldGoalPct'),
    };
    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/wnba/h2h/:homeId', async (req, res) => {
  const { homeId } = req.params;
  const awayShort = (req.query.away || '').toUpperCase();
  const homeShort = (req.query.home || '').toUpperCase();
  if (!awayShort) return res.json({ h2h: [] });
  const cacheKey = `wnba_h2h_${homeId}_${awayShort}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return res.json(cached.data);
  try {
    const currentYear = new Date().getFullYear();
    const seasons = [currentYear, currentYear - 1, currentYear - 2];
    const allEvents = (await Promise.all(
      seasons.map(s =>
        fetch(`${ESPN_WNBA}/${homeId}/schedule?season=${s}`)
          .then(r => r.ok ? r.json() : { events: [] })
          .then(j => j.events || [])
          .catch(() => [])
      )
    )).flat();
    const seen = new Set();
    const h2h = [];
    for (const event of allEvents) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      const comp = event.competitions?.[0];
      if (!comp || !comp.status?.type?.name?.includes('STATUS_FINAL')) continue;
      const us   = comp.competitors?.find(c => String(c.id) === String(homeId));
      const them = comp.competitors?.find(c => String(c.id) !== String(homeId));
      if (!us || !them) continue;
      if ((them.team?.abbreviation || '').toUpperCase() !== awayShort) continue;
      const usScore   = parseInt(us.score?.displayValue   ?? us.score)   || 0;
      const themScore = parseInt(them.score?.displayValue ?? them.score) || 0;
      if (usScore <= 0) continue;
      const isHome = us.homeAway === 'home';
      h2h.push({
        date:      event.date?.slice(0, 10),
        home:      isHome ? homeShort : awayShort,
        away:      isHome ? awayShort : homeShort,
        scoreHome: isHome ? usScore   : themScore,
        scoreAway: isHome ? themScore : usScore,
      });
    }
    h2h.sort((a, b) => new Date(b.date) - new Date(a.date));
    const result = { h2h };
    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── RotoWire WNBA Lineups + Injuries ─────────────────────────────────────────
const ROTO_WNBA_LINEUPS_URL  = 'https://www.rotowire.com/wnba/lineups.php';
const ROTO_WNBA_INJURIES_URL = 'https://www.rotowire.com/basketball/wnba-injuries.php';
const _wnbaLineupInjuries = {};
// RotoWire utilise des abréviations différentes d'ESPN pour certaines équipes WNBA
const ROTO_WNBA_ABBR = { LVA: 'LV', GSV: 'GS', WAS: 'WSH', NYL: 'NY', PHO: 'PHX' };
const normWnbaAbbr = a => ROTO_WNBA_ABBR[a?.toUpperCase()] || a?.toUpperCase() || '';

async function fetchRotoWireWNBALineups() {
  const ck = 'roto_wnba_html_all';
  const hit = _espnCache[ck];
  if (hit && Date.now() - hit.ts < 15 * 60 * 1000) return hit.data;

  const resp = await fetch(ROTO_WNBA_LINEUPS_URL, { headers: ROTO_HEADERS });
  if (!resp.ok) throw new Error(`RotoWire WNBA lineups ${resp.status}`);
  const html = await resp.text();
  const result = {};
  const boxes = html.split(/(?=<[^>]*class="lineup__box")/).slice(1);
  for (const box of boxes) {
    const homeMatch  = box.match(/data-team="(\w+)"[^>]*data-home="1"/);
    const visitMatch = box.match(/data-team="(\w+)"[^>]*data-home="0"/);
    if (!homeMatch || !visitMatch) continue;
    const homeAbbr  = normWnbaAbbr(homeMatch[1]);
    const visitAbbr = normWnbaAbbr(visitMatch[1]);
    const visitUl = box.match(/<ul class="lineup__list is-visit">([\s\S]*?)<\/ul>/)?.[1] || '';
    const homeUl  = box.match(/<ul class="lineup__list is-home">([\s\S]*?)<\/ul>/)?.[1]  || '';
    const STATUS_NORM_W = { 'out': 'Out', 'ofs': 'Out', 'doubtful': 'Questionable', 'questionable': 'Questionable', 'ques': 'Questionable', 'day-to-day': 'Questionable', 'gtd': 'Questionable', 'game-time decision': 'Questionable' };
    const parseList = (ulHtml, injuryOut) => {
      const cut = ulHtml.indexOf('lineup__title is-middle');
      const body = cut > -1 ? ulHtml.slice(0, cut) : ulHtml;
      const confirmed = /is-confirmed/.test(ulHtml);
      const names = [...body.matchAll(/<a title="([^"]+)"/g)].map(m => m[1]);
      if (cut > -1) {
        const mnpSection = ulHtml.slice(cut);
        for (const li of mnpSection.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
          const liHtml = li[1];
          const nameM = liHtml.match(/<a[^>]*title="([^"]+)"/);
          if (!nameM) continue;
          const injM = liHtml.match(/lineup__inj[^>]*>([^<]+)</i);
          if (!injM) continue;
          const raw = injM[1].trim().toLowerCase().split(/[\s-]/)[0];
          const status = STATUS_NORM_W[raw] || STATUS_NORM_W[injM[1].trim().toLowerCase()] || 'Questionable';
          const reason = injM[1].trim().replace(/^[^-]+-\s*/, '');
          injuryOut[nameM[1].trim()] = { status, reason };
        }
      }
      return names.length >= 5 ? { starters: names.map(n => ({ name: n })), status: confirmed ? 'Confirmé' : 'Probable' } : null;
    };
    const mnpMap = {};
    const visitData = parseList(visitUl, mnpMap);
    const homeData  = parseList(homeUl, mnpMap);
    if (visitData) result[visitAbbr] = { ...visitData, injuries: {} };
    if (homeData)  result[homeAbbr]  = { ...homeData,  injuries: {} };
    Object.assign(_wnbaLineupInjuries, mnpMap);
  }
  _espnCache[ck] = { data: result, ts: Date.now() };
  return result;
}

async function fetchRotoWireWNBAInjuries() {
  const ck = 'roto_wnba_injuries';
  const hit = _espnCache[ck];
  if (hit && Date.now() - hit.ts < 15 * 60 * 1000) return hit.data;
  const resp = await fetch('https://www.rotowire.com/wnba/tables/injury-report.php?team=ALL&pos=ALL', {
    headers: { ...ROTO_HEADERS, 'Referer': 'https://www.rotowire.com/wnba/injury-report.php', 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!resp.ok) throw new Error(`RotoWire WNBA injuries ${resp.status}`);
  const data = await resp.json();
  const STATUS_NORM = { 'out': 'Out', 'out for season': 'Out', 'ofs': 'Out', 'doubtful': 'Questionable', 'questionable': 'Questionable', 'game time decision': 'Questionable', 'gtd': 'Questionable', 'day-to-day': 'Questionable' };
  const result = {};
  for (const p of data) {
    const name   = p.player?.trim();
    const rawSt  = (p.status || '').toLowerCase().trim();
    const status = STATUS_NORM[rawSt];
    if (name && status) result[name] = { status, reason: p.injury || '', team: p.team || '' };
  }
  _espnCache[ck] = { data: result, ts: Date.now() };
  return result;
}

app.get('/api/wnba/injuries', async (req, res) => {
  try {
    const rotoInj = await fetchRotoWireWNBAInjuries().catch(() => ({}));
    await fetchRotoWireWNBALineups().catch(() => {});
    const merged = { ...rotoInj, ..._wnbaLineupInjuries };
    res.json(merged);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function _refreshWnbaProjectedLineup(date, home, away, ck) {
  const result = { starters: {}, source: 'none' };

  // 1. RotoWire WNBA lineups
  try {
    const all = await fetchRotoWireWNBALineups();
    const homeRoto = all[home.toUpperCase()];
    const awayRoto = all[away.toUpperCase()];
    if (homeRoto?.starters?.length) { result.starters[home.toUpperCase()] = homeRoto; result.source = 'rotowire'; }
    if (awayRoto?.starters?.length) { result.starters[away.toUpperCase()] = awayRoto; result.source = 'rotowire'; }
  } catch (e) { console.warn('RotoWire WNBA lineup:', e.message); }

  // 2. ESPN WNBA game summary — starters officiels (~1h avant tip-off)
  try {
    const dt  = new Date(date);
    const est = new Date(dt.getTime() - 4 * 3600 * 1000);
    const ymd = est.toISOString().slice(0, 10).replace(/-/g, '');
    const sbResp = await fetch(`${ESPN_WNBA_SB}?dates=${ymd}&limit=50`);
    if (sbResp.ok) {
      const sbData = await sbResp.json();
      const normA = a => (a || '').toUpperCase();
      const game = (sbData.events || []).find(e => {
        const abbrs = (e.competitions?.[0]?.competitors || []).map(c => normA(c.team?.abbreviation));
        return abbrs.includes(normA(home)) && abbrs.includes(normA(away));
      });
      if (game) {
        const sumResp = await fetch(`${ESPN_WNBA_SUMMARY}?event=${game.id}`);
        if (sumResp.ok) {
          const sumData = await sumResp.json();
          for (const td of (sumData.boxscore?.players || [])) {
            const abbr = (td.team?.abbreviation || '').toUpperCase();
            const group = td.statistics?.[0];
            if (!group) continue;
            const confirmed = (group.athletes || []).filter(a => a.starter).map(a => ({ name: a.athlete?.displayName, id: a.athlete?.id }));
            if (confirmed.length >= 5) { result.starters[abbr] = { starters: confirmed, status: 'Confirmé' }; result.source = 'espn'; }
          }
        }
      }
    }
  } catch (e) { console.warn('ESPN WNBA projected lineup:', e.message); }

  _espnCache[ck] = { data: result, ts: Date.now() };
  return result;
}

app.get('/api/wnba/projectedlineup', async (req, res) => {
  const { date, home, away } = req.query;
  if (!date || !home || !away) return res.status(400).json({ error: 'date, home, away requis' });
  const ck = `wnba_proj_${date.slice(0, 10)}_${home}_${away}`;
  const hit = _espnCache[ck];
  if (hit && Date.now() - hit.ts < 3 * 60 * 1000) return res.json(hit.data);

  if (hit) {
    _refreshInBackground(ck, () => _refreshWnbaProjectedLineup(date, home, away, ck));
    return res.json(hit.data);
  }

  res.json(await _refreshWnbaProjectedLineup(date, home, away, ck));
});

// Alias snapshot pour WNBA (même store partagé que NBA, IDs ESPN globalement uniques)
app.get('/api/wnba/projections-snapshot/:gameId', (req, res) => {
  const snap = _projectionsSnapshot[req.params.gameId];
  if (!snap) return res.json({ found: false, players: {} });
  res.json({ found: true, players: snap });
});

// Snapshot projections EU — même store, IDs api-sports.io uniques
app.get('/api/euro/:league/projections-snapshot/:gameId', (req, res) => {
  const snap = _projectionsSnapshot[req.params.gameId];
  if (!snap) return res.json({ found: false, players: {} });
  res.json({ found: true, players: snap });
});

// ── WNBA standings ────────────────────────────────────────────────────────────
const WNBA_TEAM_IDS = ['20','19','18','3','129689','5','17','6','8','9','11','132052','14','131935','16'];
const _fetchJ = (url, ms = 8000) => { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms); return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t)).then(r => r.json()); };
let _wnbaStandingsCache = { data: null, ts: 0 };
app.get('/api/wnba/standings', async (req, res) => {
  if (_wnbaStandingsCache.data && Date.now() - _wnbaStandingsCache.ts < CACHE_30MIN)
    return res.json(_wnbaStandingsCache.data);
  try {
    const d = await _fetchJ(`${ESPN_WNBA_STANDING}`);
    const parseTeam = e => {
      const team = e.team || {};
      const stats = {};
      (e.stats || []).forEach(s => { stats[s.name] = s.value; });
      return {
        abbr: team.abbreviation,
        name: team.displayName || team.name,
        logo: team.logos?.[0]?.href || null,
        wins:   Math.round(stats.wins   ?? 0),
        losses: Math.round(stats.losses ?? 0),
        pct:    stats.winPercent ?? null,
        gb:     stats.gamesBehind ?? null,
      };
    };
    const conferences = (d.children || []).map(conf => ({
      name: conf.name || conf.abbreviation || '',
      short: (conf.name || '').includes('Eastern') ? 'Est' : (conf.name || '').includes('Western') ? 'Ouest' : conf.abbreviation,
      teams: (conf.standings?.entries || []).map(parseTeam)
        .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
        .map((t, i) => ({ ...t, rank: i + 1 })),
    }));
    const standings = conferences.flatMap(c => c.teams)
      .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
      .map((t, i) => ({ ...t, rank: i + 1 }));
    const result = { standings, conferences };
    _wnbaStandingsCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    if (_wnbaStandingsCache.data) return res.json(_wnbaStandingsCache.data);
    res.status(500).json({ error: err.message });
  }
});

// ── WNBA scoring leaders ──────────────────────────────────────────────────────
// Fetch all 15 rosters → all player stats in parallel batches → sort by PTS
let _wnbaLeadersCache = { data: null, ts: 0 };
app.get('/api/wnba/leaders', async (req, res) => {
  if (_wnbaLeadersCache.data && Date.now() - _wnbaLeadersCache.ts < CACHE_30MIN)
    return res.json(_wnbaLeadersCache.data);
  try {
    const rosterResults = await Promise.all(
      WNBA_TEAM_IDS.map(id =>
        _fetchJ(`${ESPN_WNBA}/${id}/roster?season=${WNBA_SEASON}`)
          .catch(() => ({ athletes: [], team: {} }))
      )
    );
    const players = rosterResults.flatMap(d =>
      (d.athletes || []).map(a => ({
        id: a.id,
        name: a.displayName || a.fullName,
        photo: a.headshot?.href || `https://a.espncdn.com/i/headshots/wnba/players/full/${a.id}.png`,
        team: d.team?.abbreviation || '',
        position: a.position?.abbreviation || '',
      }))
    );
    const BATCH = 20;
    const withStats = [];
    for (let i = 0; i < players.length; i += BATCH) {
      const batch = players.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(p =>
        _fetchJ(`${ESPN_WNBA_CORE}/${p.id}/statistics/0`, 6000)
          .then(d => {
            const cats      = d.splits?.categories || [];
            const general   = cats.find(c => c.name === 'general');
            const offensive = cats.find(c => c.name === 'offensive');
            const get = (cat, abbr) => cat?.stats?.find(s => s.abbreviation === abbr)?.value ?? 0;
            const gp = get(general, 'GP');
            if (!gp || gp < 3) return null;
            const pts = get(offensive, 'PTS') / gp;
            if (!pts) return null;
            return {
              ...p,
              pts,
              reb: get(general, 'REB') / gp,
              ast: get(offensive, 'AST') / gp,
              tpm: get(offensive, '3PM') / gp,
            };
          }).catch(() => null)
      ));
      withStats.push(...results.filter(Boolean));
    }
    const toList = (arr, key) => arr
      .slice().sort((a, b) => b[key] - a[key]).slice(0, 5)
      .map((l, i) => ({
        rank: i + 1, id: l.id, name: l.name, photo: l.photo,
        team: l.team, position: l.position,
        displayValue: l[key] % 1 === 0 ? String(l[key]) : l[key].toFixed(1),
      }));
    // Classement complet (pas que le top 5) — pour pouvoir afficher le rang d'une joueuse
    // quelconque dans Analyse Props (22 juin 2026). Pas de photo : payload plus léger, seul le
    // top 5 (ci-dessus) en a besoin pour l'affichage.
    const toFullList = (arr, key) => arr
      .slice().sort((a, b) => b[key] - a[key])
      .map((l, i) => ({ rank: i + 1, id: l.id, name: l.name, team: l.team, value: l[key] }));
    const result = {
      pts: toList(withStats, 'pts'),
      reb: toList(withStats, 'reb'),
      ast: toList(withStats, 'ast'),
      tpm: toList(withStats, 'tpm'),
      full: {
        pts: toFullList(withStats, 'pts'),
        reb: toFullList(withStats, 'reb'),
        ast: toFullList(withStats, 'ast'),
        tpm: toFullList(withStats, 'tpm'),
      },
    };
    _wnbaLeadersCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    if (_wnbaLeadersCache.data) return res.json(_wnbaLeadersCache.data);
    res.status(500).json({ error: err.message });
  }
});

// ── NBA standings + leaders ───────────────────────────────────────────────────
const ESPN_NBA_STANDING_URL = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings';
const NBA_ESPN_SEASON       = new Date().getFullYear();
const ESPN_NBA_CORE_ATH     = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${NBA_ESPN_SEASON}/athletes`;
const ESPN_NBA_LEADERS_URL  = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${NBA_ESPN_SEASON}/types/2/leaders`;
const NBA_TEAM_ABBR = {
  1:'ATL',2:'BOS',3:'NOP',4:'CHI',5:'CLE',6:'DAL',7:'DEN',8:'DET',9:'GSW',
  10:'HOU',11:'IND',12:'LAC',13:'LAL',14:'MIA',15:'MIL',16:'MIN',17:'BKN',
  18:'NYK',19:'ORL',20:'PHI',21:'PHX',22:'POR',23:'SAC',24:'SAS',25:'OKC',
  26:'UTA',27:'WSH',28:'TOR',29:'MEM',30:'CHA',
};

let _nbaStandingsCache = { data: null, ts: 0 };
app.get('/api/nba/standings', async (req, res) => {
  if (_nbaStandingsCache.data && Date.now() - _nbaStandingsCache.ts < CACHE_30MIN)
    return res.json(_nbaStandingsCache.data);
  try {
    const d = await _fetchJ(ESPN_NBA_STANDING_URL);
    const parseTeam = e => {
      const team = e.team || {};
      const stats = {};
      (e.stats || []).forEach(s => { stats[s.name] = s.value; });
      return {
        abbr:   team.abbreviation,
        name:   team.displayName || team.name,
        logo:   team.logos?.[0]?.href || null,
        wins:   Math.round(stats.wins   ?? 0),
        losses: Math.round(stats.losses ?? 0),
        pct:    stats.winPercent  ?? null,
        gb:     stats.gamesBehind ?? null,
      };
    };
    const conferences = (d.children || []).map(conf => ({
      name:  conf.name || '',
      short: (conf.name || '').includes('Eastern') ? 'Est' : (conf.name || '').includes('Western') ? 'Ouest' : conf.abbreviation,
      teams: (conf.standings?.entries || []).map(parseTeam)
        .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
        .map((t, i) => ({ ...t, rank: i + 1 })),
    }));
    const standings = conferences.flatMap(c => c.teams)
      .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
      .map((t, i) => ({ ...t, rank: i + 1 }));
    const result = { standings, conferences };
    _nbaStandingsCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    if (_nbaStandingsCache.data) return res.json(_nbaStandingsCache.data);
    res.status(500).json({ error: err.message });
  }
});

let _nbaLeadersCache = { data: null, ts: 0 };
app.get('/api/nba/leaders', async (req, res) => {
  if (_nbaLeadersCache.data && Date.now() - _nbaLeadersCache.ts < CACHE_30MIN)
    return res.json(_nbaLeadersCache.data);
  try {
    // Scan complet de la ligue (30 équipes) plutôt que le top-5 curé par ESPN — même approche
    // que /api/wnba/leaders, pour exposer un classement complet (pas que le top 5) dans le
    // panneau "Analyse Props" (22 juin 2026). fetchPlayerStats() est le même helper déjà utilisé
    // pour les projections de /api/nba/players/:teamId — pas de nouveau point de scraping.
    const teamIds = Object.keys(NBA_TEAM_ABBR);
    const rosterResults = await Promise.all(
      teamIds.map(id => _fetchJ(`${ESPN_NBA}/${id}/roster`).catch(() => ({ athletes: [] })))
    );
    const players = rosterResults.flatMap((d, i) =>
      (d.athletes || []).map(a => ({
        id: a.id,
        name: a.fullName || a.displayName,
        photo: a.headshot?.href || `https://a.espncdn.com/i/headshots/nba/players/full/${a.id}.png`,
        team: NBA_TEAM_ABBR[teamIds[i]] || '',
      }))
    );
    const BATCH = 20;
    const withStats = [];
    for (let i = 0; i < players.length; i += BATCH) {
      const batch = players.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(p =>
        fetchPlayerStats(p.id).then(s => (s?.pts ? { ...p, pts: s.pts, reb: s.reb || 0, ast: s.ast || 0, tpm: s.tpm || 0 } : null)).catch(() => null)
      ));
      withStats.push(...results.filter(Boolean));
    }
    const toList = (arr, key) => arr
      .slice().sort((a, b) => b[key] - a[key]).slice(0, 5)
      .map((l, i) => ({ rank: i + 1, id: l.id, name: l.name, photo: l.photo, team: l.team, displayValue: l[key] % 1 === 0 ? String(l[key]) : l[key].toFixed(1) }));
    const toFullList = (arr, key) => arr
      .slice().sort((a, b) => b[key] - a[key])
      .map((l, i) => ({ rank: i + 1, id: l.id, name: l.name, team: l.team, value: l[key] }));
    const result = {
      pts: toList(withStats, 'pts'), reb: toList(withStats, 'reb'), ast: toList(withStats, 'ast'), tpm: toList(withStats, 'tpm'),
      full: { pts: toFullList(withStats, 'pts'), reb: toFullList(withStats, 'reb'), ast: toFullList(withStats, 'ast'), tpm: toFullList(withStats, 'tpm') },
    };
    _nbaLeadersCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    if (_nbaLeadersCache.data) return res.json(_nbaLeadersCache.data);
    res.status(500).json({ error: err.message });
  }
});

// ── ACB standings + leaders (scraping acb.com) ───────────────────────────────
let _acbStandingsCache = { data: null, ts: 0 };
let _acbLeadersCache   = { data: null, ts: 0 };
const ACB_CACHE_MS = 3 * 3600_000; // 3h
const ACB_ABBR = {
  'Real Madrid': 'MAD', 'Barça': 'BAR', 'Valencia Basket': 'VAL',
  'Kosner Baskonia': 'BAS', 'Asisa Joventut': 'JOV', 'La Laguna Tenerife': 'TEN',
  'La Laguna Tenerife CB': 'TEN', 'UCAM Murcia CB': 'MUR', 'UCAM Murcia': 'MUR',
  'Surne Bilbao Basket': 'BIL', 'Surne Bilbao': 'BIL',
  'Gran Canaria': 'GCA', 'Dreamland Gran Canaria': 'GCA',
  'MoraBanc Andorra': 'AND', 'Covirán Granada': 'GRA',
  'Casademont Zaragoza': 'ZAR', 'Río Breogán': 'BRE',
  'Recoletas Salud San Pablo Burgos': 'BUR', 'San Pablo Burgos': 'BUR',
  'Kids&Us Manresa': 'MAN', 'Bàsquet Girona': 'GIR',
  'Obradoiro CAB': 'OBR', 'Leyma Coruña': 'COR',
};

async function fetchAcbHtml(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const resp = await fetch(`https://www.acb.com${path}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
      signal: ctrl.signal,
    });
    return await resp.text();
  } finally {
    clearTimeout(t);
  }
}

// Extrait le nom d'équipe depuis l'URL du logo ACB
// Ex: ".../2526KosnerBaskoniaLogo.png" → "Kosner Baskonia"
// Ex: ".../2425UCAMMurciapositivo.png" → "UCAM Murcia"
function acbTeamFromLogo(url) {
  const m = (url || '').match(/\/\d{4}([A-Za-zÀ-ÿ&'_]+)\.\w+$/);
  if (!m) return '';
  const raw = m[1]
    .replace(/_/g, ' ')  // underscores → espaces avant le nettoyage
    .replace(/\s*(?:Logoweb|Logo|positivo|negativo|azul|negro|blanco|blanc|rojo|rouge|verde|grana|negre|blue|green|web|Color|Principal|Secundario|escudo|badge|crest)\s*$/i, '')
    .trim();
  return raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse les chunks RSC Next.js (self.__next_f.push([1,"..."])) pour extraire les stat cards ACB
function parseAcbNextChunks(html) {
  const chunks = [];
  const re = /self\.__next_f\.push\(\[1,"([\s\S]+?)"\]\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      // Unescape JSON string
      chunks.push(JSON.parse('"' + m[1] + '"'));
    } catch { /* chunk malformé, on ignore */ }
  }
  return chunks;
}

// Extrait le tableau JSON complet en équilibrant les brackets
function extractJsonArray(str, startIdx) {
  let depth = 0, i = startIdx;
  while (i < str.length) {
    if (str[i] === '[' || str[i] === '{') depth++;
    else if (str[i] === ']' || str[i] === '}') { depth--; if (depth === 0) return str.slice(startIdx, i + 1); }
    i++;
  }
  return null;
}

// api-sports.io teamId → ACB team slug
const ACB_TEAM_MAP = {
  2338: 'real-madrid-9',
  2341: 'valencia-basket-13',
  2331: 'kosner-baskonia-3',
  2336: 'ucam-murcia-12',
  2329: 'barca-2',
  2334: 'asisa-joventut-8',
  1695: 'surne-bilbao-4',
  2339: 'la-laguna-tenerife-28',
  2340: 'unicaja-14',
  1698: 'kidsandus-manresa-10',
  1120: 'rio-breogan-25',
  1139: 'basquet-girona-591',
  1699: 'recoletas-salud-san-pablo-burgos-549',
  1123: 'hiopos-lleida-658',
  2330: 'casademont-zaragoza-16',
  2335: 'morabanc-andorra-22',
  2333: 'dreamland-gran-canaria-5',
  1125: 'coviran-granada-592',
};

const ACB_POSITIONS = {
  'Base': 'PG', 'Escolta': 'SG', 'Alero': 'SF',
  'Ala-pívot': 'PF', 'Ala-Pívot': 'PF', 'Ala pívot': 'PF',
  'Pívot': 'C',
};

function normalizeAcbSlug(str) {
  return (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function parseAcbRoster(html) {
  const chunks = parseAcbNextChunks(html);
  for (const chunk of chunks) {
    if (!chunk.includes('currentRosterLite')) continue;
    const rlIdx = chunk.indexOf('"currentRosterLite":');
    if (rlIdx === -1) continue;
    const pMarker = '"players":[';
    const pIdx = chunk.indexOf(pMarker, rlIdx);
    if (pIdx === -1) continue;
    const arrStr = extractJsonArray(chunk, pIdx + pMarker.length - 1);
    if (!arrStr) continue;
    try {
      return JSON.parse(arrStr).map(p => ({
        id: p.id,
        firstName: p.firstName || '',
        lastName: p.lastName || '',
        name: p.nickname || `${p.firstName||''} ${p.lastName||''}`.trim(),
        jersey: p.shirtNumber || '—',
        position: ACB_POSITIONS[p.gameRole] || p.gameRole || '—',
        headshot: p.headshotImageUrl || null,
      }));
    } catch { continue; }
  }
  return [];
}

function parseAcbGamelog(html) {
  const chunks = parseAcbNextChunks(html);
  const marker = '"matches":[';
  for (const chunk of chunks) {
    if (!chunk.includes(marker)) continue;
    let from = 0;
    while (true) {
      const idx = chunk.indexOf(marker, from);
      if (idx === -1) break;
      const arrStr = extractJsonArray(chunk, idx + marker.length - 1);
      if (arrStr) {
        try {
          const arr = JSON.parse(arrStr);
          // Valide que c'est bien un gamelog (champ stats spécifique aux gamelogs joueur)
          if (Array.isArray(arr) && arr.length > 0 && arr[0]?.stats !== undefined) return arr;
        } catch {}
      }
      from = idx + marker.length;
    }
  }
  return [];
}

function extractAcbStatCard(chunks, cardKeyword) {
  for (const chunk of chunks) {
    if (!chunk.includes(`statistic-card-${cardKeyword}`)) continue;
    // Trouve le début du tableau "players"
    const marker = '"players":[';
    const idx = chunk.indexOf(marker);
    if (idx === -1) continue;
    const arrStr = extractJsonArray(chunk, idx + marker.length - 1);
    if (!arrStr) continue;
    try {
      const players = JSON.parse(arrStr);
      const toEntry = (p, i) => {
        const name = p?.player?.nickname || `${p?.firstName || ''} ${p?.lastName || ''}`.trim();
        const team = acbTeamFromLogo(p?.teamLogo);
        return { rank: i + 1, id: String(p?.player?.id || i), name, team, value: +p?.statValue || 0 };
      };
      // top5 garde la photo pour l'affichage ; full sert au lookup de rang dans Analyse Props
      // (22 juin 2026) — le classement complet est déjà dans la page scrapée, juste pas exposé avant.
      const top5 = players.slice(0, 5).map((p, i) => ({
        ...toEntry(p, i),
        photo: p?.playerImage || p?.player?.headshotImageUrl || null,
        displayValue: String(p?.statValue || ''),
      }));
      const full = players.map(toEntry);
      return { top5, full };
    } catch { continue; }
  }
  return { top5: [], full: [] };
}

app.get('/api/acb/standings', async (req, res) => {
  if (_acbStandingsCache.data && Date.now() - _acbStandingsCache.ts < ACB_CACHE_MS)
    return res.json(_acbStandingsCache.data);
  try {
    const cfg = EURO_LEAGUES.acb;
    const d = await bballFetch(`/standings?league=${cfg.id}&season=${cfg.season}`);
    const rows = (d.response || []).flat();
    const leaderWins = rows[0]?.games?.win?.total ?? 0;
    const teams = rows.map(r => {
      const w = r.games?.win?.total ?? 0;
      const l = r.games?.lose?.total ?? 0;
      const gp = w + l || 1;
      return {
        rank: r.position,
        abbr: ACB_ABBR[r.team.name] || r.team.name.replace(/\s+\w+$/, '').slice(0, 3).toUpperCase(),
        logo: r.team.logo || null,
        wins: w, losses: l,
        pct: +(w / gp).toFixed(3),
        gb: r.position === 1 ? 0 : +((leaderWins - w) / 2).toFixed(1),
      };
    });
    const result = { standings: teams, conferences: [] };
    _acbStandingsCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    if (_acbStandingsCache.data) return res.json(_acbStandingsCache.data);
    res.json({ standings: [], conferences: [] });
  }
});

app.get('/api/acb/leaders', async (req, res) => {
  if (_acbLeadersCache.data && Date.now() - _acbLeadersCache.ts < ACB_CACHE_MS)
    return res.json(_acbLeadersCache.data);
  try {
    const html = await fetchAcbHtml('/es/liga/estadisticas/estadisticas-de-jugador');
    const chunks = parseAcbNextChunks(html);
    const pts = extractAcbStatCard(chunks, 'points');
    const reb = extractAcbStatCard(chunks, 'rebounds');
    const ast = extractAcbStatCard(chunks, 'assists');
    const tpm = extractAcbStatCard(chunks, 'three');
    const result = {
      pts: pts.top5, reb: reb.top5, ast: ast.top5, tpm: tpm.top5,
      full: { pts: pts.full, reb: reb.full, ast: ast.full, tpm: tpm.full },
    };
    _acbLeadersCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    if (_acbLeadersCache.data) return res.json(_acbLeadersCache.data);
    res.status(500).json({ error: err.message });
  }
});

// ── Bzzoiro (Euroleague) ──────────────────────────────────────────────────────
const BZZ_KEY  = process.env.BZZOIRO_API_KEY;
const BZZ_BASE = 'https://sports.bzzoiro.com/basketball/api/v2';

// Semaphore — max 4 appels Bzzoiro simultanés pour éviter le throttling
let _bzzActive = 0;
const _bzzQueue = [];
function bzzRelease() {
  _bzzActive--;
  if (_bzzQueue.length > 0) _bzzQueue.shift()();
}
async function bzzFetch(path) {
  if (_bzzActive >= 4) await new Promise(res => _bzzQueue.push(res));
  _bzzActive++;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    try {
      const resp = await fetch(`${BZZ_BASE}${path}`, {
        headers: { 'Authorization': `Token ${BZZ_KEY}` },
        signal: ac.signal,
      });
      if (!resp.ok) throw new Error(`bzzoiro ${resp.status} — ${path}`);
      const data = await resp.json();
      _updateScraper('bzzoiro', true);
      return data;
    } finally { clearTimeout(t); }
  } catch(e) { _updateScraper('bzzoiro', false); throw e; }
  finally { bzzRelease(); }
}

// Notre code interne → bzzoiro team ID (Euroleague)
const BZZ_EL_TEAMS = {
  OLY: 37, FEN: 35, RMB: 41, VBC: 46, PAO: 47, BAR: 49, MUN: 50,
  ZAL: 42, TEL: 34, MIL: 38, MCO: 44, RED: 32, PAR: 43, BAS: 40, IST: 48,
};
const BZZ_EL_BY_ID = Object.fromEntries(Object.entries(BZZ_EL_TEAMS).map(([k, v]) => [v, k]));

let _elScoreboardCache = { data: null, ts: 0 };
const EL_API_BASE = 'https://api-live.euroleague.net/v2';
const EL_SEASON   = 'E2025';
const EL_HEADERS  = { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' };

// Mapping code interne → code EL API
const EL_CLUB_MAP = {
  FEN: 'ULK', OLY: 'OLY', RMB: 'MAD', VBC: 'PAM', PAO: 'PAN',
  BAR: 'BAR', MUN: 'MUN', ZAL: 'ZAL', TEL: 'TEL', MIL: 'MIL',
  MCO: 'MCO', RED: 'RED', PAR: 'PAR', BAS: 'BAS', IST: 'IST',
  ASV: 'ASV', HTA: 'HTA', PRS: 'PRS', DUB: 'DUB', VIR: 'VIR',
};
// Reverse map EL API code → code interne
const EL_CLUB_MAP_REV = Object.fromEntries(Object.entries(EL_CLUB_MAP).map(([k,v]) => [v,k]));

// ── RotoWire EuroLeague lineups (scraping HTML) ───────────────────────────────
// RotoWire EL abbreviation → notre code interne
const ROTO_EL_MAP = {
  FBB: 'FEN', OLY: 'OLY', RMB: 'RMB', VBC: 'VBC',
  PAO: 'PAO', BAR: 'BAR', MUN: 'MUN', MCO: 'MCO',
  TEL: 'TEL', MIL: 'MIL', ZAL: 'ZAL', PAR: 'PAR',
};

async function fetchRotoWireELLineups() {
  const ck = 'roto_el_html';
  const hit = _espnCache[ck];
  if (hit && Date.now() - hit.ts < 15 * 60 * 1000) return hit.data;

  const resp = await fetch('https://www.rotowire.com/euro/daily-lineups.php', { headers: ROTO_HEADERS });
  if (!resp.ok) throw new Error(`RotoWire EL ${resp.status}`);
  const html = await resp.text();

  const result = {};
  const boxes = html.split(/(?=<[^>]*class="lineup__box")/).slice(1);

  for (const box of boxes) {
    const abbrs = [...box.matchAll(/<div class="lineup__abbr">(\w+)<\/div>/g)].map(m => m[1]);
    if (abbrs.length < 2) continue;
    const [visitAbbr, homeAbbr] = abbrs;

    const visitUl = box.match(/<ul class="lineup__list is-visit">([\s\S]*?)<\/ul>/)?.[1] || '';
    const homeUl  = box.match(/<ul class="lineup__list is-home">([\s\S]*?)<\/ul>/)?.[1]  || '';

    const parseList = (ulHtml) => {
      const cut = ulHtml.indexOf('lineup__title is-middle');
      const body = cut > -1 ? ulHtml.slice(0, cut) : ulHtml;
      const confirmed = /is-confirmed/.test(ulHtml);
      const names = [...body.matchAll(/<a title="([^"]+)"/g)].map(m => m[1]);
      return names.length >= 5
        ? { starters: names.map(n => ({ name: n })), status: confirmed ? 'Confirmé' : 'Probable' }
        : null;
    };

    const visitKey = ROTO_EL_MAP[visitAbbr] || visitAbbr;
    const homeKey  = ROTO_EL_MAP[homeAbbr]  || homeAbbr;
    const visitData = parseList(visitUl);
    const homeData  = parseList(homeUl);
    if (visitData) result[visitKey] = visitData;
    if (homeData)  result[homeKey]  = homeData;
  }

  _espnCache[ck] = { data: result, ts: Date.now() };
  return result;
}

app.get('/api/euroleague/projectedlineup', async (req, res) => {
  const { home, away } = req.query;
  if (!home || !away) return res.status(400).json({ error: 'home, away requis' });
  try {
    const all = await fetchRotoWireELLineups();
    const homeData  = all[home.toUpperCase()];
    const awayData  = all[away.toUpperCase()];
    const starters  = {};
    if (homeData)  starters[home.toUpperCase()]  = homeData;
    if (awayData)  starters[away.toUpperCase()] = awayData;
    const source = (homeData || awayData) ? 'rotowire' : 'none';
    res.json({ starters, source });
  } catch (err) {
    console.warn('RotoWire EL:', err.message);
    res.json({ starters: {}, source: 'none' });
  }
});

app.get('/api/euroleague/scoreboard', async (req, res) => {
  const hasLive = _elScoreboardCache.data?.games?.some(g => g.status === 'STATUS_IN_PROGRESS');
  const ttl = hasLive ? 30_000 : CACHE_5MIN;
  if (_elScoreboardCache.data && Date.now() - _elScoreboardCache.ts < ttl)
    return res.json(_elScoreboardCache.data);
  try {
    const now = Date.now();
    const LIVE_WINDOW = 3 * 3600 * 1000;
    // Fetch all games for this season and filter to recent/upcoming window
    const [rsResp, poResp, ffResp] = await Promise.all([
      fetch(`${EL_API_BASE}/competitions/E/seasons/${EL_SEASON}/games?phaseTypeCode=RS&limit=500`, { headers: EL_HEADERS }),
      fetch(`${EL_API_BASE}/competitions/E/seasons/${EL_SEASON}/games?phaseTypeCode=PO&limit=100`, { headers: EL_HEADERS }),
      fetch(`${EL_API_BASE}/competitions/E/seasons/${EL_SEASON}/games?phaseTypeCode=FF&limit=20`,  { headers: EL_HEADERS }),
    ]);
    const allGames = [
      ...(rsResp.ok ? (await rsResp.json()).data || [] : []),
      ...(poResp.ok ? (await poResp.json()).data || [] : []),
      ...(ffResp.ok ? (await ffResp.json()).data || [] : []),
    ];
    const games = allGames
      .filter(g => {
        const t = new Date(g.utcDate).getTime();
        if (g.played) return (now - t) < 48 * 3600 * 1000;
        return (t - now) < 72 * 3600 * 1000;
      })
      .map(g => {
        const localCode = EL_CLUB_MAP_REV[g.local?.club?.code] || g.local?.club?.code;
        const roadCode  = EL_CLUB_MAP_REV[g.road?.club?.code]  || g.road?.club?.code;
        const localScore = g.local?.score ?? null;
        const roadScore  = g.road?.score  ?? null;
        const elapsed = now - new Date(g.utcDate).getTime();
        let status = 'STATUS_SCHEDULED';
        if (g.played) status = 'STATUS_FINAL';
        else if (elapsed >= 0 && elapsed < LIVE_WINDOW) status = 'STATUS_IN_PROGRESS';
        return {
          gameCode: g.gameCode,
          localCode, roadCode,
          localScore, roadScore,
          status,
          utcDate: g.utcDate,
        };
      });
    _elScoreboardCache = { data: { games }, ts: Date.now() };
    res.json({ games });
  } catch (err) {
    if (_elScoreboardCache.data) return res.json(_elScoreboardCache.data);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/euroleague/players/:teamCode', async (req, res) => {
  const { teamCode } = req.params;
  const code = teamCode.toUpperCase();
  const cacheKey = `bzz_el_players_${code}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return res.json(cached.data);
  try {
    const teamId = BZZ_EL_TEAMS[code];
    if (!teamId) return res.status(404).json({ error: `Team ${code} not in bzzoiro map` });
    const rosterData = await bzzFetch(`/players/?team=${teamId}&limit=50`);
    const rosterList = rosterData.results || [];
    // Fetch last 15 game logs per player (parallel) to compute season averages
    const logsArr = await Promise.all(
      rosterList.map(p =>
        bzzFetch(`/players/${p.id}/games/?limit=15`)
          .then(d => ({ id: p.id, games: d.results || [] }))
          .catch(() => ({ id: p.id, games: [] }))
      )
    );
    const logMap = {};
    logsArr.forEach(({ id, games }) => { logMap[id] = games; });
    const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    const round1 = v => v != null ? Math.round(v * 10) / 10 : null;
    const players = rosterList.map(p => {
      const games = logMap[p.id] || [];
      const pts = round1(avg(games.map(g => g.points)));
      const reb = round1(avg(games.map(g => g.rebounds)));
      const ast = round1(avg(games.map(g => g.assists)));
      return {
        id:       p.id,
        name:     p.name,
        position: p.position || '—',
        jersey:   p.jersey_number || '—',
        headshot: null,
        stats:    pts != null ? { pts, reb, ast } : null,
      };
    });
    const result = { teamCode: code, players };
    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/euroleague/playergamelog/:playerId', async (req, res) => {
  const { playerId } = req.params;
  const cacheKey = `bzz_el_gamelog_${playerId}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return res.json(cached.data);
  try {
    const data = await bzzFetch(`/players/${playerId}/games/?limit=15`);
    const games = (data.results || []).map(g => {
      const fgm  = g.field_goals_made      ?? 0;
      const fga  = g.field_goals_attempted ?? 0;
      const ftm  = g.free_throws_made      ?? 0;
      const fta  = g.free_throws_attempted ?? 0;
      const fg3m = g.three_pointers_made      ?? 0;
      const fg3a = g.three_pointers_attempted ?? 0;
      const pts  = g.points ?? 0;
      const tsPct = (fga + 0.44 * fta) > 0 ? +(pts / (2 * (fga + 0.44 * fta))).toFixed(3) : null;
      return {
        date:    g.event_date,
        opponent: g.opponent,
        opponentAbbr: BZZ_EL_BY_ID[g.opponent_team_id] || null,
        isHome:  g.is_home,
        starter: g.is_starter,
        min:     g.minutes != null ? parseFloat(g.minutes.toFixed(1)) : 0,
        pts, reb: g.rebounds ?? 0, ast: g.assists ?? 0,
        stl: g.steals ?? 0, blk: g.blocks ?? 0, to: g.turnovers ?? 0,
        fgm, fga, ftm, fta, fg3m, fg3a, tsPct,
        oreb: g.offensive_rebounds ?? null,
        dreb: g.defensive_rebounds ?? null,
        pm:   g.plus_minus != null ? String(g.plus_minus) : '—',
        fg:   fgm != null ? `${fgm}-${fga}` : '—',
        tpm:  fg3m != null ? `${fg3m}-${fg3a}` : '—',
        ft:   ftm != null ? `${ftm}-${fta}` : '—',
      };
    });
    const result = { playerId, games };
    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/euroleague/boxscore', async (req, res) => {
  const { date, home, away } = req.query;
  if (!date || !home || !away) return res.status(400).json({ error: 'date, home, away requis' });
  const cacheKey = `bzz_el_bs_${date}_${home}_${away}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_5MIN) return res.json(cached.data);
  try {
    const homeId = BZZ_EL_TEAMS[home.toUpperCase()];
    const awayId = BZZ_EL_TEAMS[away.toUpperCase()];
    // Search events by date ±1 day to handle timezone drift
    const dt = new Date(date);
    const from = new Date(dt.getTime() - 86400000).toISOString().slice(0, 10);
    const to   = new Date(dt.getTime() + 86400000).toISOString().slice(0, 10);
    const evData = await bzzFetch(`/events/?league=2&date_from=${from}&date_to=${to}&limit=50`);
    const ev = (evData.results || []).find(e => {
      const hid = e.home_team?.id;
      const aid = e.away_team?.id;
      return (hid === homeId && aid === awayId) || (hid === awayId && aid === homeId);
    });
    if (!ev) return res.status(404).json({ error: 'Match bzzoiro introuvable', home, away, from, to });
    const bs = await bzzFetch(`/events/${ev.id}/box-score/`);
    const transformBox = (box, teamShort) => (box || []).map(p => ({
      id:       p.player_id,
      name:     p.name,
      position: p.position || '—',
      starter:  p.is_starter ?? false,
      dnp:      p.minutes === 0 && !p.is_starter,
      stats: {
        min: p.minutes != null ? String(Math.round(p.minutes)) : '0',
        pts: p.points   ?? 0,
        reb: p.rebounds ?? 0,
        ast: p.assists  ?? 0,
        stl: p.steals   ?? 0,
        blk: p.blocks   ?? 0,
        to:  p.turnovers ?? 0,
        fg:  p.field_goals_made != null ? `${p.field_goals_made}-${p.field_goals_attempted}` : '—',
        tpm: p.three_pointers_made != null ? `${p.three_pointers_made}-${p.three_pointers_attempted}` : '—',
        ft:  p.free_throws_made != null ? `${p.free_throws_made}-${p.free_throws_attempted}` : '—',
        pm:  p.plus_minus != null ? String(p.plus_minus) : '—',
      },
    }));
    const result = { gameId: ev.id, status: ev.status };
    // Use our short codes as keys (not bzzoiro names)
    result[home.toUpperCase()] = transformBox(
      bs.home_team?.id === homeId ? bs.home_box : bs.away_box, home
    );
    result[away.toUpperCase()] = transformBox(
      bs.away_team?.id === awayId ? bs.away_box : bs.home_box, away
    );
    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Euroleague team schedule (pace / défense) via Buzzerbeater ────────────────
app.get('/api/euroleague/teamschedule/:teamCode', async (req, res) => {
  const code = req.params.teamCode.toUpperCase();
  const cacheKey = `bzz_el_sched_${code}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return res.json(cached.data);
  try {
    const teamId = BZZ_EL_TEAMS[code];
    if (!teamId) return res.status(404).json({ error: `Team ${code} not in EL map` });
    const now  = new Date();
    const from = new Date(now.getTime() - 60 * 86400000).toISOString().slice(0, 10);
    const to   = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    const data = await bzzFetch(`/events/?league=2&date_from=${from}&date_to=${to}&limit=60`);
    const games = (data.results || [])
      .filter(e => e.home_team?.id === teamId || e.away_team?.id === teamId)
      .map(e => {
        const isHome    = e.home_team?.id === teamId;
        const oppId     = isHome ? e.away_team?.id : e.home_team?.id;
        const teamScore = isHome ? e.home_score : e.away_score;
        const oppScore  = isHome ? e.away_score : e.home_score;
        return {
          date:          e.event_date || e.date,
          status:        e.status === 'finished' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED',
          isHome,
          opponentAbbr:  BZZ_EL_BY_ID[oppId] || String(oppId),
          ptsScored:  teamScore ?? null,
          ptsAllowed: oppScore  ?? null,
        };
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const result = { teamCode: code, games };
    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Championnats basket européens (ACB / LNB / BBL / Lega A) ─────────────────
const BBALL_KEY  = process.env.BASKETBALL_API_KEY;
const BBALL_BASE = 'https://v1.basketball.api-sports.io';

const EURO_LEAGUES = {
  acb:   { id: 117, season: '2025-2026', name: 'ACB',         country: 'ES', flag: '🇪🇸', accent: '#c60b1e' },
  lnb:   { id: 2,   season: '2025-2026', name: 'Betclic Élite', country: 'FR', flag: '🇫🇷', accent: '#002395' },
  bbl:   { id: 40,  season: '2025-2026', name: 'BBL',          country: 'DE', flag: '🇩🇪', accent: '#000000' },
  legaa: { id: 52,  season: '2025-2026', name: 'Lega A',        country: 'IT', flag: '🇮🇹', accent: '#009246' },
};

// Mapping salle → ville pour les ligues EU
const ARENA_CITIES = {
  // LNB
  'LDLC Arena': 'Lyon', 'Salle Gaston Medecin': 'Monaco', 'Adidas Arena': 'Paris',
  'Palais des Sports de Gerland': 'Lyon', 'Colisée de Pau': 'Pau',
  'Halle Maubeurre': 'Cholet', 'Palais des Sports Jean-Weille': 'Nancy',
  'Arena Loire': 'Trélazé', 'Palais des Sports': 'Dijon', 'Salle Wagram': 'Paris',
  'Arena du Pays d\'Aix': 'Aix-en-Provence', 'Palais des Sports de Beaublanc': 'Limoges',
  'Glaz Arena': 'Cesson-Sévigné', 'Palais des Sports Marcel-Cerdan': 'Levallois-Perret',
  'Stadium Nord': 'Villeneuve-d\'Ascq', 'Palais des Sports du Mans': 'Le Mans',
  'Kindarena': 'Rouen', 'Palais des Sports de Nantes-Rezé': 'Nantes',
  'Palais des Sports de Pau': 'Pau',
  // ACB
  'Palacio de Deportes de Murcia': 'Murcia', 'Movistar Arena': 'Madrid',
  'Palau Blaugrana': 'Barcelone', 'Fernando Buesa Arena': 'Vitoria',
  'Gran Canaria Arena': 'Las Palmas', 'Pabellon Fuente de San Luis': 'Valencia',
  'Multiusos Fontes do Sar': 'Saint-Jacques-de-Compostelle',
  'Polideportivo Estudiantes': 'Madrid', 'Wizink Center': 'Madrid',
  'Pabellon Arroyo': 'Burgos', 'Santiago Martin': 'Tenerife',
  'Nou Congost': 'Manresa', 'Palau Municipal d\'Esports de Badalona': 'Badalona',
  'Palau Sant Jordi': 'Barcelone',
  // BBL
  'Max-Schmeling Halle Berlin': 'Berlin', 'BMW Park': 'Munich',
  'Ratiopharm Arena': 'Ulm', 'EWE Arena': 'Oldenburg',
  'Ballsporthalle': 'Francfort', 'Rolandshalle': 'Braunschweig',
  'Süwag Energie Arena': 'Francfort', 'SAP Arena': 'Mannheim',
  'agentur.basketball Arena': 'Hambourg', 'Arena Trier': 'Trèves',
  'MagentaSport Arena': 'Munich', 'Rostock Seawolves Arena': 'Rostock',
  'Paul-Horn-Arena': 'Tübingen', 'Quarterback Immobilien Arena': 'Leipzig',
  // Lega A
  'Segafredo Arena': 'Bologne', 'Palasport': 'Venise', 'PalaDesio': 'Desio',
  'Paladozza': 'Bologne', 'Enerxenia Arena': 'Varese', 'Arena di Cremona': 'Crémone',
  'Pala Vitrifrigo': 'Pesaro', 'Mediolanum Forum': 'Milan',
  'Taliercio': 'Venise', 'Unipol Arena': 'Casalecchio di Reno',
  'Palasport Benedetto Brin': 'Trieste', 'BLM Group Arena': 'Trente',
};

function getArenaCity(venueName) {
  if (!venueName) return '';
  // Match exact ou partiel
  if (ARENA_CITIES[venueName]) return ARENA_CITIES[venueName];
  const key = Object.keys(ARENA_CITIES).find(k => venueName.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(venueName.toLowerCase().slice(0, 10)));
  return key ? ARENA_CITIES[key] : '';
}

const _euroCache = {};

// Cache id joueur ACB → prénom/nom, alimenté par /api/euro/acb/players/:teamId — permet de
// reconstruire le slug acb.com (prenom-nom-id) dans /playergamelog sans repasser par le roster
const _acbPlayerNames = {};

// Semaphore — max 5 appels api-sports.io basketball simultanés (rate limit/minute du plan Pro,
// déclenché en pratique dès ~15-18 requêtes lancées en même temps pour un roster complet)
let _bballActive = 0;
const _bballQueue = [];
function bballRelease() {
  _bballActive--;
  if (_bballQueue.length > 0) _bballQueue.shift()();
}
async function _bballFetchRaw(path) {
  if (_bballActive >= 5) await new Promise(res => _bballQueue.push(res));
  _bballActive++;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let resp;
    try {
      resp = await fetch(`${BBALL_BASE}${path}`, { headers: { 'x-apisports-key': BBALL_KEY }, signal: ctrl.signal });
    } finally { clearTimeout(timer); }
    if (!resp.ok) throw new Error(`bball-api ${resp.status} ${path}`);
    _captureBasketballApiQuota(resp);
    const data = await resp.json();
    const errCount = Array.isArray(data.errors) ? data.errors.length : Object.keys(data.errors || {}).length;
    if (errCount > 0) throw new Error(`bball-api errors ${JSON.stringify(data.errors)} — ${path}`);
    return data;
  } finally { bballRelease(); }
}
async function bballFetch(path, attempt = 0) {
  try {
    return await _bballFetchRaw(path);
  } catch (e) {
    if (/rateLimit/i.test(e.message) && attempt < 3) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      return bballFetch(path, attempt + 1);
    }
    throw e;
  }
}

// Map gameId → métadonnées (date, équipes) pour une ligue EU — sert à dater/enrichir
// les gamelogs joueur (l'endpoint /games/statistics/players ne renvoie que le game.id)
// Dédup les appels concurrents pour la même ligue (un roster entier déclenche N appels
// de gamelog en parallèle, qui verraient tous un cache vide en même temps sans ce verrou)
const _euroGamesMapInflight = {};
async function getEuroGamesMap(league) {
  const cfg = EURO_LEAGUES[league];
  const ck = `euro_games_map_${league}`;
  const hit = _euroCache[ck];
  if (hit && Date.now() - hit.ts < CACHE_6H) return hit.data;
  if (_euroGamesMapInflight[league]) return _euroGamesMapInflight[league];
  const p = (async () => {
    const d = await bballFetch(`/games?league=${cfg.id}&season=${cfg.season}`);
    const map = new Map();
    for (const g of (d.response || [])) {
      map.set(g.id, {
        date: g.date,
        status: normGameStatus(g.status),
        homeId: g.teams.home.id, awayId: g.teams.away.id,
        homeName: g.teams.home.name, awayName: g.teams.away.name,
      });
    }
    _euroCache[ck] = { data: map, ts: Date.now() };
    return map;
  })();
  _euroGamesMapInflight[league] = p;
  try { return await p; } finally { delete _euroGamesMapInflight[league]; }
}

const parseBballMinutes = t => {
  if (!t) return 0;
  const [m, s] = String(t).split(':').map(Number);
  return (m || 0) + (s || 0) / 60;
};

// Gamelog joueur depuis api-sports.io — remplace Bzzoiro pour LNB/BBL/Lega A (+ compléments ACB).
// Pas de steals/blocks/turnovers côté api-sports.io (absents de /games/statistics/players) → null.
async function bballPlayerGamelog(league, playerId) {
  const cacheKey = `bball_${league}_${playerId}`;
  try {
    const cfg = EURO_LEAGUES[league];
    const [statsData, gamesMap] = await Promise.all([
      bballFetch(`/games/statistics/players?player=${playerId}&season=${cfg.season}`),
      getEuroGamesMap(league),
    ]);
    const games = (statsData.response || [])
      .map(s => {
        const meta = gamesMap.get(s.game.id);
        if (!meta || meta.status !== 'STATUS_FINAL') return null;
        const isHome = meta.homeId === s.team.id;
        const min = parseBballMinutes(s.minutes);
        const fgm = s.field_goals?.total ?? null, fga = s.field_goals?.attempts ?? null;
        const tpmM = s.threepoint_goals?.total ?? null, tpmA = s.threepoint_goals?.attempts ?? null;
        const ftm = s.freethrows_goals?.total ?? null, fta = s.freethrows_goals?.attempts ?? null;
        return {
          date: meta.date,
          isHome,
          starter: s.type === 'starters',
          min: +min.toFixed(1),
          pts: s.points ?? 0,
          reb: s.rebounds?.total ?? 0,
          ast: s.assists ?? 0,
          stl: null, blk: null, to: null,
          fg: fgm != null ? `${fgm}-${fga}` : '—', fgm, fga,
          tpm: tpmM != null ? `${tpmM}-${tpmA}` : '—',
          ft: ftm != null ? `${ftm}-${fta}` : '—', ftm, fta,
          league: cfg.name,
          opponent: isHome ? meta.awayName : meta.homeName,
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    return _updateGlCache(cacheKey, games);
  } catch {
    return _glPersist[cacheKey]?.games || [];
  }
}

function normShort(name) {
  // Génère une abbréviaton 3 lettres depuis le nom
  const words = name.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1].slice(0, 2)).toUpperCase();
  return name.slice(0, 3).toUpperCase();
}

function normGameStatus(s) {
  if (!s) return 'STATUS_SCHEDULED';
  const sh = s.short || s;
  if (['FT', 'AOT'].includes(sh)) return 'STATUS_FINAL';
  if (['Q1','Q2','Q3','Q4','HT','OT'].includes(sh)) return 'STATUS_IN_PROGRESS';
  return 'STATUS_SCHEDULED';
}

// Scoreboard live : matchs 48h passés + 72h à venir
app.get('/api/euro/:league/scoreboard', async (req, res) => {
  const cfg = EURO_LEAGUES[req.params.league];
  if (!cfg) return res.status(404).json({ error: 'Unknown league' });
  const ck = `euro_sb_${req.params.league}`;
  const hit = _euroCache[ck];
  const hasLive = hit?.data?.games?.some(g => g.status === 'STATUS_IN_PROGRESS');
  if (hit && Date.now() - hit.ts < (hasLive ? 30_000 : CACHE_5MIN)) return res.json(hit.data);
  try {
    const d = await bballFetch(`/games?league=${cfg.id}&season=${cfg.season}`);
    const now = Date.now();
    const KEEP_MS = 48 * 3600_000;
    const AHEAD_MS = 72 * 3600_000;
    const games = (d.response || [])
      .filter(g => {
        const t = new Date(g.date).getTime();
        const done = normGameStatus(g.status) === 'STATUS_FINAL';
        return done ? (now - t) < KEEP_MS : (t - now) < AHEAD_MS;
      })
      .map(g => ({
        id:           g.id,
        date:         g.date,
        status:       normGameStatus(g.status),
        statusDetail: g.status?.long || '',
        league:       req.params.league,
        round:        g.week || '',
        venue:        g.venue ? { name: g.venue, city: getArenaCity(g.venue) } : null,
        home: {
          id:     g.teams.home.id,
          name:   g.teams.home.name,
          short:  normShort(g.teams.home.name),
          logo:   g.teams.home.logo,
          score:  g.scores?.home?.total ?? null,
        },
        away: {
          id:     g.teams.away.id,
          name:   g.teams.away.name,
          short:  normShort(g.teams.away.name),
          logo:   g.teams.away.logo,
          score:  g.scores?.away?.total ?? null,
        },
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const result = { games };
    _euroCache[ck] = { data: result, ts: Date.now() };
    res.json(result);

    // Pré-chauffe rosters + cotes en arrière-plan pour accélérer l'ouverture des pages
    const upcoming = games.filter(g => g.status === 'STATUS_SCHEDULED');
    setImmediate(async () => {
      const base = `http://localhost:${process.env.PORT || 3001}`;
      const league = req.params.league;
      for (const g of upcoming) {
        // Rosters
        for (const teamId of [g.home.id, g.away.id]) {
          const rck = `euro_players_${league}_${teamId}`;
          if (_euroCache[rck] && Date.now() - _euroCache[rck].ts < CACHE_6H) continue;
          try { await fetch(`${base}/api/euro/${league}/players/${teamId}`, { signal: AbortSignal.timeout(30000) }); } catch {}
        }
        // Cotes match
        const oddsKey = `bball_odds_${league}_${g.home.name}_${g.away.name}`;
        if (!_espnCache[oddsKey] || Date.now() - _espnCache[oddsKey].ts > 10 * 60_000) {
          try { await fetch(`${base}/api/basketball/odds?home=${encodeURIComponent(g.home.name)}&away=${encodeURIComponent(g.away.name)}&league=${league}&date=${encodeURIComponent(g.date)}`, { signal: AbortSignal.timeout(20000) }); } catch {}
        }
        // Props joueurs — ne pre-chauffe pas si un match live ou récent entre les mêmes équipes
        const pairLive = games.some(x =>
          x.id !== g.id &&
          ((x.home.name === g.home.name || x.home.name === g.away.name) &&
           (x.away.name === g.away.name || x.away.name === g.home.name)) &&
          (x.status === 'STATUS_IN_PROGRESS' || x.status === 'STATUS_SCHEDULED')
        );
        const propsKey = `bball_pprops3_${league}_${g.home.name}_${g.away.name}_${(g.date||'').slice(0,10)}`.toLowerCase().replace(/\s+/g,'_');
        if (!_espnCache[propsKey] && !pairLive) {
          try { await fetch(`${base}/api/basketball/player-props?league=${league}&home=${encodeURIComponent(g.home.name)}&away=${encodeURIComponent(g.away.name)}&date=${encodeURIComponent(g.date)}`, { signal: AbortSignal.timeout(30000) }); } catch {}
        }
      }

      // Auto-save compos depuis api-sports.io (type 'starters' du box-score) pour les matchs terminés.
      // Le nom renvoyé par /games/statistics/players n'est pas toujours dans le même ordre
      // (Nom Prénom) que celui du roster /players (Prénom Nom) pour la même équipe côté
      // api-sports.io (incohérence de la donnée source, pas systématique) — on relit le roster
      // pour ré-aligner sur le nom canonique par ID, sinon la compo éditable (homeNames/awayNames,
      // qui matche par nom exact contre le roster) ne reconnaît jamais ces joueurs.
      const finished = games.filter(g => g.status === 'STATUS_FINAL');
      for (const g of finished) {
        try {
          const bs = await bballFetch(`/games/statistics/players?id=${g.id}`);
          for (const [teamId, isHome] of [[g.home.id, true], [g.away.id, false]]) {
            const key = `${league}_${teamId}`;
            const existing = _euroLineups[key];
            if (existing?.date && new Date(existing.date).getTime() === new Date(g.date).getTime()) continue;
            const boxStarters = (bs.response || []).filter(s => s.team.id === teamId && s.type === 'starters');
            if (boxStarters.length < 5) continue;
            let nameById = {};
            try {
              const rosterD = await bballFetch(`/players?team=${teamId}&season=${cfg.season}`);
              nameById = Object.fromEntries((rosterD.response || []).map(p => [p.id, p.name]));
            } catch {}
            const starters = boxStarters.map(s => nameById[s.player?.id] || s.player?.name).filter(Boolean);
            if (starters.length >= 5) {
              _storeTeamLineup(league, teamId, starters, isHome ? g.away.name : g.home.name, g.date);
              _bgLog.push(`lineup saved ${league} team${teamId}: ${starters.slice(0,3).join(', ')}...`);
            }
          }
        } catch {}
      }
    });
  } catch (err) {
    if (_euroCache[ck]?.data) return res.json(_euroCache[ck].data);
    res.status(500).json({ error: err.message });
  }
});

// Détail d'un match (pour BasketballDetailPage)
app.get('/api/euro/:league/game/:gameId', async (req, res) => {
  const cfg = EURO_LEAGUES[req.params.league];
  if (!cfg) return res.status(404).json({ error: 'Unknown league' });
  const { gameId } = req.params;
  const ck = `euro_game_${gameId}`;
  const hit = _euroCache[ck];
  if (hit && Date.now() - hit.ts < CACHE_5MIN) return res.json(hit.data);
  try {
    const d = await bballFetch(`/games?id=${gameId}`);
    const g = d.response?.[0];
    if (!g) return res.status(404).json({ error: 'Game not found' });
    const result = {
      id:           g.id,
      date:         g.date,
      status:       normGameStatus(g.status),
      statusDetail: g.status?.long || '',
      league:       req.params.league,
      round:        g.week || '',
      venue:        g.venue ? { name: g.venue, city: '' } : null,
      home: { id: g.teams.home.id, name: g.teams.home.name, short: normShort(g.teams.home.name), logo: g.teams.home.logo, score: g.scores?.home?.total ?? null },
      away: { id: g.teams.away.id, name: g.teams.away.name, short: normShort(g.teams.away.name), logo: g.teams.away.logo, score: g.scores?.away?.total ?? null },
    };
    _euroCache[ck] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Roster par nom d'équipe (résout l'ID api-sports.io puis délègue à /players/:teamId) — utilisé par EffectifPage
app.get('/api/euro/:league/roster/byname/:teamName', async (req, res) => {
  const { league, teamName } = req.params;
  const cfg = EURO_LEAGUES[league];
  if (!cfg) return res.status(404).json({ error: 'Unknown league' });
  const name = decodeURIComponent(teamName);
  try {
    const td = await bballFetch(`/teams?league=${cfg.id}&season=${cfg.season}&search=${encodeURIComponent(name.split(' ')[0])}`);
    const team = (td.response || []).find(t => t.name === name) || (td.response || [])[0];
    if (!team) return res.status(404).json({ error: `Team not found: ${name}` });
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 20000);
    try {
      const resp = await fetch(`http://localhost:${process.env.PORT || 3001}/api/euro/${league}/players/${team.id}${req.query.refresh ? '?refresh=1' : ''}`, { signal: ac.signal });
      res.json(await resp.json());
    } finally { clearTimeout(timer); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Roster + stats saison depuis Bzzoiro
app.get('/api/euro/:league/players/:teamId', async (req, res) => {
  const { league, teamId } = req.params;
  const cfg = EURO_LEAGUES[league];
  if (!cfg) return res.status(404).json({ error: 'Unknown league' });
  const ck = `euro_players_${league}_${teamId}`;
  const hit = _euroCache[ck];
  if (!req.query.refresh && hit && hit.data?.players?.length > 0 && Date.now() - hit.ts < CACHE_6H) return res.json(hit.data);
  // Assure que le scoreboard est chargé (nécessaire pour l'auto-exclusion par gamelog)
  if (!_euroCache[`euro_sb_${league}`]) {
    try { await fetch(`http://localhost:${process.env.PORT || 3001}/api/euro/${league}/scoreboard`, { signal: AbortSignal.timeout(8000) }); } catch {}
  }
  try {
    // ACB : scraping acb.com (roster + gamelogs), pas Bzzoiro
    if (league === 'acb') {
      const slug = ACB_TEAM_MAP[Number(teamId)];
      if (!slug) return res.status(404).json({ error: `ACB team ${teamId} not mapped` });
      const rosterHtml = await fetchAcbHtml(`/es/liga/equipos/${slug}?editionId=90`);
      const roster = parseAcbRoster(rosterHtml);
      if (!roster.length) { _updateScraper('acb', false); return res.status(500).json({ error: 'ACB roster parse failed' }); }
      _updateScraper('acb', true);
      for (const p of roster) _acbPlayerNames[p.id] = { firstName: p.firstName, lastName: p.lastName };
      const avg = arr => arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : null;
      const r1  = v => v != null ? Math.round(v*10)/10 : null;
      const toMin = t => { if (!t) return 0; const [m,s]=(t||'0:0').split(':').map(Number); return m+(s||0)/60; };
      const players = await Promise.all(roster.map(async p => {
        try {
          const pgSlug = `${normalizeAcbSlug(p.firstName)}-${normalizeAcbSlug(p.lastName)}-${p.id}`;
          const glHtml = await fetchAcbHtml(`/es/liga/jugadores/${pgSlug}/partidos?editionId=90`);
          const matches = parseAcbGamelog(glHtml);
          const games = matches.filter(m => m.stats && toMin(m.stats.timePlayed) > 3);
          const last5 = games.slice(0, 5);
          const pts = r1(avg(games.map(g => g.stats.points ?? 0)));
          const reb = r1(avg(games.map(g => g.stats.rebounds ?? 0)));
          const ast = r1(avg(games.map(g => g.stats.assists ?? 0)));
          const tpm = r1(avg(games.map(g => g.stats.threePointersMade ?? 0)));
          const min = r1(avg(games.filter(g=>toMin(g.stats.timePlayed)>0).map(g=>toMin(g.stats.timePlayed))));
          const starterFrac = last5.length ? last5.filter(g=>toMin(g.stats.timePlayed)>=18).length/last5.length : 0;
          return {
            id: p.id, name: p.name, position: p.position, jersey: p.jersey, headshot: p.headshot,
            stats: pts != null ? { pts, reb: reb??0, ast: ast??0, tpm: tpm??0, min: min??0 } : null,
            starterFrac, recentActive: games.length,
          };
        } catch {
          return { id: p.id, name: p.name, position: p.position, jersey: p.jersey, headshot: p.headshot, stats: null, starterFrac: 0, recentActive: 0 };
        }
      }));
      players.sort((a,b)=>(b.stats?.pts??-1)-(a.stats?.pts??-1));
      const result = { teamId, players };
      if (players.length >= 1) _euroCache[ck] = { data: result, ts: Date.now() };
      return res.json(result);
    }
    // Roster + gamelogs depuis api-sports.io (LNB / BBL / Lega A)
    const cutoff75 = Date.now() - 75 * 24 * 3600_000;
    const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    const r1  = v => v != null ? Math.round(v * 10) / 10 : null;
    const pd = await bballFetch(`/players?team=${teamId}&season=${cfg.season}`);
    const roster = pd.response || [];
    const logsArr = await Promise.all(
      roster.map(p => bballPlayerGamelog(league, p.id).then(games => ({ id: p.id, games })))
    );
    const logMap = {};
    logsArr.forEach(({ id, games }) => { logMap[id] = games; });
    let players = roster.map(p => {
      const allGames = logMap[p.id] || [];
      const leagueGames = allGames.filter(g => (g.min || 0) > 3);
      // Activité récente (75 jours) pour détecter les joueurs inactifs/transférés
      const recentActive = allGames.filter(g => new Date(g.date).getTime() > cutoff75).length;
      const pts = r1(avg(leagueGames.map(g => g.pts ?? 0)));
      const reb = r1(avg(leagueGames.map(g => g.reb ?? 0)));
      const ast = r1(avg(leagueGames.map(g => g.ast ?? 0)));
      const tpm = r1(avg(leagueGames.map(g => parseTpmMade(g.tpm))));
      const min = r1(avg(leagueGames.filter(g => (g.min||0) > 0).map(g => g.min)));
      // Fraction de titularisations sur les 5 derniers matchs
      const last5 = leagueGames.slice(0, 5);
      const starterFrac = last5.length > 0 ? last5.filter(g => g.starter).length / last5.length : 0;
      return {
        id: p.id, name: p.name, position: p.position || '—', jersey: p.number || '—',
        headshot: null,
        stats: pts != null ? { pts, reb, ast, tpm: tpm ?? 0, min: min ?? 0 } : null,
        starterFrac,
        recentActive,
      };
    })
    .filter(p => p.recentActive > 0 || p.stats != null || p.name)
    .sort((a, b) => (b.stats?.pts ?? -1) - (a.stats?.pts ?? -1));

    // Merge custom players (overrides manuels — IDs api-sports.io)
    try {
      const customFile = existsSync(EURO_CUSTOM_PLAYERS_FILE) ? JSON.parse(readFileSync(EURO_CUSTOM_PLAYERS_FILE, 'utf8')) : {};
      const customs = customFile[`${league}_${teamId}`] || [];
      if (customs.length) {
        const existingIds = new Set(players.map(p => String(p.id)));
        for (const cp of customs) {
          if (existingIds.has(String(cp.id))) continue;
          try {
            const allGames = await bballPlayerGamelog(league, cp.id);
            const leagueGames = allGames.filter(g => (g.min || 0) > 3);
            const recentActive = allGames.filter(g => new Date(g.date).getTime() > cutoff75).length;
            const pts = r1(avg(leagueGames.map(g => g.pts ?? 0)));
            const reb = r1(avg(leagueGames.map(g => g.reb ?? 0)));
            const ast = r1(avg(leagueGames.map(g => g.ast ?? 0)));
            const tpm = r1(avg(leagueGames.map(g => parseTpmMade(g.tpm))));
            players.push({ id: cp.id, name: cp.name, position: cp.position||'—', jersey: cp.jersey||'—', headshot: null, stats: pts!=null?{pts,reb,ast,tpm:tpm??0}:null, starterFrac: 0, recentActive });
          } catch {}
        }
        players.sort((a,b)=>(b.stats?.pts??-1)-(a.stats?.pts??-1));
      }
    } catch {}
    const result = { teamId, players };
    if (players.length >= 1) _euroCache[ck] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Compositions confirmées depuis api-sports.io (disponibles ~1-2h avant tip-off)
// Note : api-sports.io basketball n'a pas d'endpoint /lineups (pré-match) — ceci ne peut donc
// renvoyer les titulaires qu'une fois le match terminé (via le box-score, champ type:'starters').
app.get('/api/euro/:league/lineups/:gameId', async (req, res) => {
  const { league, gameId } = req.params;
  if (!EURO_LEAGUES[league]) return res.status(404).json({ error: 'Unknown league' });
  const ck = `euro_lineups_${gameId}`;
  const hit = _euroCache[ck];
  if (hit && Date.now() - hit.ts < 10 * 60_000) return res.json(hit.data);
  try {
    const gamesMap = await getEuroGamesMap(league);
    const meta = gamesMap.get(Number(gameId));
    const bs = await bballFetch(`/games/statistics/players?id=${gameId}`);
    const toStarters = teamId => (bs.response || [])
      .filter(s => s.team.id === teamId && s.type === 'starters')
      .map(s => ({ id: s.player?.id, name: s.player?.name, position: '—', jersey: '—' }))
      .filter(p => p.name);
    const home = meta ? toStarters(meta.homeId) : [];
    const away = meta ? toStarters(meta.awayId) : [];
    const result = { confirmed: home.length > 0 && away.length > 0, home, away };
    _euroCache[ck] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    if (_euroCache[ck]?.data) return res.json(_euroCache[ck].data);
    res.json({ confirmed: false, home: [], away: [] });
  }
});

// Gamelog joueur — ACB via acb.com (scraping direct), autres ligues EU via Bzzoiro
app.get('/api/euro/:league/playergamelog/:playerId', async (req, res) => {
  const { playerId } = req.params;
  if (!EURO_LEAGUES[req.params.league]) return res.status(404).json({ error: 'Unknown league' });
  const ck = `euro_gl_${playerId}`;
  const hit = _euroCache[ck];
  if (hit && Date.now() - hit.ts < CACHE_6H) return res.json(hit.data);
  if (req.params.league === 'acb') {
    try {
      const info = _acbPlayerNames[playerId];
      if (!info) return res.json({ playerId, games: [] });
      const pgSlug = `${normalizeAcbSlug(info.firstName)}-${normalizeAcbSlug(info.lastName)}-${playerId}`;
      const glHtml = await fetchAcbHtml(`/es/liga/jugadores/${pgSlug}/partidos?editionId=90`);
      const matches = parseAcbGamelog(glHtml);
      const toMin = t => { if (!t) return 0; const [m, s] = (t || '0:0').split(':').map(Number); return m + (s || 0) / 60; };
      const games = matches.map(g => {
        const s = g.stats || {};
        const fgm = (s.twoPointersMade ?? 0) + (s.threePointersMade ?? 0);
        const fga = (s.twoPointersAttempted ?? 0) + (s.threePointersAttempted ?? 0);
        const min = toMin(s.timePlayed);
        return {
          date:    g.date,
          isHome:  !!g.isSelectedLocal,
          starter: min >= 18,
          min:     parseFloat(min.toFixed(1)),
          pts:     s.points ?? 0,
          reb:     s.rebounds ?? 0,
          ast:     s.assists ?? 0,
          stl:     s.steals ?? 0,
          blk:     s.blocks ?? 0,
          to:      s.turnovers ?? 0,
          fg:      `${fgm}-${fga}`,
          fgm, fga,
          tpm:     s.threePointersMade != null ? `${s.threePointersMade}-${s.threePointersAttempted}` : '—',
          ft:      s.freeThrowsMade != null ? `${s.freeThrowsMade}-${s.freeThrowsAttempted}` : '—',
          ftm:     s.freeThrowsMade ?? null, fta: s.freeThrowsAttempted ?? null,
          league:  'Liga ACB',
          opponent: g.isSelectedLocal ? (g.awayTeam?.shortName ?? null) : (g.homeTeam?.shortName ?? null),
        };
      });
      const result = { playerId, games };
      _euroCache[ck] = { data: result, ts: Date.now() };
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  try {
    const games = (await bballPlayerGamelog(req.params.league, playerId)).slice(0, 20);
    const result = { playerId, games };
    _euroCache[ck] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Dernière compo sauvegardée pour une équipe EU (réutilisée comme "probables" au prochain match)
app.get('/api/euro/:league/team-lineup/:teamId', (req, res) => {
  const { league, teamId } = req.params;
  const data = _euroLineups[`${league}_${teamId}`];
  if (!data) return res.json({ found: false });
  res.json({ found: true, ...data });
});

// Sauvegarde manuelle compo — appelé depuis le frontend quand 5 joueurs sont assignés
app.post('/api/euro/:league/team-lineup/:teamId', (req, res) => {
  const { league, teamId } = req.params;
  const { starters, opponent, date, confirmed, outPlayers } = req.body;
  if (!starters?.length) return res.status(400).json({ error: 'starters required' });
  _storeTeamLineup(league, teamId, starters, opponent || '', date || new Date().toISOString(), !!confirmed, Array.isArray(outPlayers) ? outPlayers : []);
  res.json({ ok: true });
});


// Schedule équipe pour modèle pace/défense
app.get('/api/euro/:league/teamschedule/:teamId', async (req, res) => {
  const { league, teamId } = req.params;
  const cfg = EURO_LEAGUES[league];
  if (!cfg) return res.status(404).json({ error: 'Unknown league' });
  const ck = `euro_sched_${league}_${teamId}`;
  const hit = _euroCache[ck];
  if (hit && Date.now() - hit.ts < CACHE_6H) return res.json(hit.data);
  try {
    const d = await bballFetch(`/games?league=${cfg.id}&season=${cfg.season}&team=${teamId}`);
    const games = (d.response || [])
      .filter(g => normGameStatus(g.status) === 'STATUS_FINAL')
      .map(g => {
        const isHome    = g.teams.home.id === Number(teamId);
        const ptsScored = isHome ? g.scores?.home?.total : g.scores?.away?.total;
        const ptsAllow  = isHome ? g.scores?.away?.total : g.scores?.home?.total;
        return {
          date:       g.date,
          isHome,
          ptsScored:  ptsScored ?? null,
          ptsAllowed: ptsAllow  ?? null,
          opponentId: isHome ? g.teams.away.id : g.teams.home.id,
        };
      })
      .filter(g => g.ptsScored != null)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const result = { teamId, games };
    _euroCache[ck] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Boxscore depuis Bzzoiro
// Boxscore depuis api-sports.io — pas de steals/blocks/turnovers/+- côté api (absents de
// /games/statistics/players) → null. Sans impact sur le règlement des alertes (pts/reb/ast/tpm only).
app.get('/api/euro/:league/boxscore', async (req, res) => {
  const { league } = req.params;
  const { date, home, away } = req.query;
  if (!EURO_LEAGUES[league] || !date || !home || !away) return res.status(400).json({ error: 'league, date, home, away requis' });
  const ck = `euro_bs_${league}_${date}_${home}_${away}`;
  const hit = _euroCache[ck];
  if (hit && Date.now() - hit.ts < CACHE_5MIN) return res.json(hit.data);
  try {
    const gamesMap = await getEuroGamesMap(league);
    const dt = new Date(date).getTime();
    let foundId = null, meta = null;
    for (const [gid, m] of gamesMap) {
      if (Math.abs(new Date(m.date).getTime() - dt) > 86400000) continue;
      const namesMatch = (sofaNameMatch(m.homeName, home) && sofaNameMatch(m.awayName, away)) ||
                          (sofaNameMatch(m.homeName, away) && sofaNameMatch(m.awayName, home));
      if (namesMatch) { foundId = gid; meta = m; break; }
    }
    if (!foundId || meta.status !== 'STATUS_FINAL') return res.json({ found: false });
    const bs = await bballFetch(`/games/statistics/players?id=${foundId}`);
    const transformBox = teamId => (bs.response || []).filter(s => s.team.id === teamId).map(s => {
      const min = parseBballMinutes(s.minutes);
      const fgm = s.field_goals?.total ?? null, fga = s.field_goals?.attempts ?? null;
      const tpmM = s.threepoint_goals?.total ?? null, tpmA = s.threepoint_goals?.attempts ?? null;
      const ftm = s.freethrows_goals?.total ?? null, fta = s.freethrows_goals?.attempts ?? null;
      return {
        id: s.player.id, name: s.player.name, position: '—',
        starter: s.type === 'starters', dnp: min === 0,
        stats: {
          min: String(Math.round(min)), pts: s.points ?? 0, reb: s.rebounds?.total ?? 0, ast: s.assists ?? 0,
          stl: null, blk: null, to: null,
          fg: fgm != null ? `${fgm}-${fga}` : '—',
          tpm: tpmM != null ? `${tpmM}-${tpmA}` : '—',
          ft: ftm != null ? `${ftm}-${fta}` : '—',
          pm: null,
        },
      };
    });
    const result = { gameId: foundId, status: 'STATUS_FINAL' };
    result[home.toUpperCase()] = transformBox(meta.homeId);
    result[away.toUpperCase()] = transformBox(meta.awayId);
    _euroCache[ck] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Lega A official lineups (legabasket.it) ──────────────────────────────────
let _legaaGamesXml = null;
let _legaaGamesXmlTs = 0;

async function getLegaAGames() {
  if (_legaaGamesXml && Date.now() - _legaaGamesXmlTs < 6 * 3600_000) return _legaaGamesXml;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch('https://www.legabasket.it/games.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0' }, signal: ctrl.signal
    });
    const xml = await resp.text();
    const games = [...xml.matchAll(/<loc>(https:\/\/www\.legabasket\.it\/game\/(\d+)\/([^<]+))<\/loc>/g)]
      .map(m => ({ url: m[1], id: m[2], slug: m[3] }));
    _legaaGamesXml = games;
    _legaaGamesXmlTs = Date.now();
    return games;
  } finally { clearTimeout(timer); }
}

async function fetchLegaALineup(homeTeam, awayTeam, date) {
  const games = await getLegaAGames();
  const normStr = s => (s || '').toLowerCase().replace(/[^a-z]/g, '');

  const keyWords = name => name.toLowerCase().split(/\s+/)
    .filter(w => w.length > 3)
    .map(w => w.replace(/[^a-z]/g, ''));

  const homeWords = keyWords(homeTeam);
  const awayWords = keyWords(awayTeam);

  // Uniquement les matchs récents (IDs élevés), dédupliqués, triés du plus récent
  const recentUniq = [...new Map(games.map(g => [g.id, g])).values()]
    .filter(g => parseInt(g.id) > 20000)
    .sort((a, b) => parseInt(b.id) - parseInt(a.id));

  const candidates = recentUniq.filter(g => {
    const slug = normStr(g.slug);
    return homeWords.some(w => slug.includes(w)) && awayWords.some(w => slug.includes(w));
  });
  // Prendre le plus récent (trié desc par ID = plus récent en premier)
  const match = candidates[0] || null;

  if (!match) return null;

  // Récupérer la page du match
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch(match.url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }, signal: ctrl.signal
    });
    const html = await resp.text();

    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>({.*?})<\/script>/s);
    if (!m) return null;

    const d = JSON.parse(m[1]);
    const scores = d?.props?.pageProps?.game?.scores;
    if (!scores) return null;

    const toStarters = rows => {
      const seen = new Set();
      return (rows || [])
        .filter(p => String(p.sf) === '1')
        .filter(p => { const k = `${p.player_name}${p.player_surname}`; if (seen.has(k)) return false; seen.add(k); return true; })
        .map(p => ({ name: `${p.player_name} ${p.player_surname}`, jersey: p.player_num }))
        .slice(0, 5);
    };

    // Déterminer quel côté (ht/vt) correspond au home passé en param
    // On compare la position dans le slug (normalisé sans séparateurs)
    const slugNorm = normStr(match.slug);
    const homePos = Math.min(...homeWords.map(w => { const i = slugNorm.indexOf(w); return i >= 0 ? i : Infinity; }));
    const awayPos = Math.min(...awayWords.map(w => { const i = slugNorm.indexOf(w); return i >= 0 ? i : Infinity; }));
    const firstIsHome = homePos <= awayPos;

    const homeStarters = toStarters(firstIsHome ? scores.ht?.rows : scores.vt?.rows);
    const awayStarters = toStarters(firstIsHome ? scores.vt?.rows : scores.ht?.rows);

    if (!homeStarters.length && !awayStarters.length) return null;

    return { confirmed: true, home: homeStarters, away: awayStarters, gameId: match.id };
  } finally { clearTimeout(timer); }
}

// ── SofaScore helpers ─────────────────────────────────────────────────────────
const SOFA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://www.sofascore.com/',
  'Origin': 'https://www.sofascore.com',
};

async function sofaFetch(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch(`https://api.sofascore.com/api/v1${path}`, { headers: SOFA_HEADERS, signal: ctrl.signal });
    if (!resp.ok) throw new Error(`sofascore ${resp.status}`);
    return resp.json();
  } finally { clearTimeout(timer); }
}

function sofaNameMatch(a, b) {
  const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ca = clean(a), cb = clean(b);
  if (ca === cb || ca.includes(cb) || cb.includes(ca)) return true;
  // Premier mot (ex: "Barcelona" ↔ "FC Barcelona")
  const wa = clean(a.split(/\s+/)[0]), wb = clean(b.split(/\s+/)[0]);
  return wa === wb && wa.length > 3;
}

// Compos probables/confirmées depuis SofaScore + Bzzoiro
app.get('/api/euro/:league/projectedlineup', async (req, res) => {
  const { league } = req.params;
  const cfg = EURO_LEAGUES[league];
  if (!cfg) return res.status(404).json({ error: 'Unknown league' });
  const { home, away, date } = req.query;
  if (!home || !away || !date) return res.status(400).json({ error: 'home, away, date requis' });

  const ck = `euro_proj_${league}_${home}_${away}_${date.slice(0, 10)}`;
  const hit = _euroCache[ck];
  if (hit && Date.now() - hit.ts < 15 * 60_000) return res.json(hit.data);

  const homeShort = normShort(home);
  const awayShort = normShort(away);

  // Résout les IDs api-sports.io des deux équipes (clé partagée avec team-lineup / auto-save)
  let homeId = null, awayId = null;
  try {
    const gamesMap = await getEuroGamesMap(league);
    const dt = new Date(date).getTime();
    for (const m of gamesMap.values()) {
      if (Math.abs(new Date(m.date).getTime() - dt) > 3 * 86400_000) continue;
      const isHomeFirst = sofaNameMatch(m.homeName, home);
      const isAwayFirst = sofaNameMatch(m.awayName, home);
      if (!isHomeFirst && !isAwayFirst) continue;
      if (isHomeFirst ? !sofaNameMatch(m.awayName, away) : !sofaNameMatch(m.homeName, away)) continue;
      homeId = isHomeFirst ? m.homeId : m.awayId;
      awayId = isHomeFirst ? m.awayId : m.homeId;
      break;
    }
  } catch {}

  // 0) Compo enregistrée manuellement et confirmée pour CE match — priorité absolue
  const homeKey = `${league}_${homeId ?? homeShort}`;
  const awayKey = `${league}_${awayId ?? awayShort}`;
  const savedHome = _euroLineups[homeKey];
  const savedAway = _euroLineups[awayKey];
  const savedDateMatch = (saved) => !saved?.date || Math.abs(new Date(saved.date) - new Date(date)) < 7 * 86400_000;
  if (savedHome?.confirmed && savedAway?.confirmed && savedHome?.starters?.length >= 5 && savedAway?.starters?.length >= 5 && savedDateMatch(savedHome) && savedDateMatch(savedAway)) {
    const result = {
      starters: {
        [homeShort]: { starters: savedHome.starters.map(n => ({ name: n })), status: 'Confirmé' },
        [awayShort]: { starters: savedAway.starters.map(n => ({ name: n })), status: 'Confirmé' },
      },
      source: 'saved', confirmed: true,
    };
    _euroCache[ck] = { data: result, ts: Date.now() };
    return res.json(result);
  }

  // 2) Lega A — starters officiels depuis legabasket.it (live + terminés). legabasket.it n'a de
  // vrais titulaires qu'une fois le match commencé — avant le coup d'envoi on laisse la cascade
  // continuer (sofascore/saved) pour rester en "Probable" plutôt que de figer une compo non vérifiée.
  if (league === 'legaa' && new Date(date).getTime() <= Date.now()) {
    try {
      const ld = await fetchLegaALineup(home, away, date);
      if (ld && ld.home.length >= 5 && ld.away.length >= 5) {
        const result = {
          starters: {
            [homeShort]: { starters: ld.home, status: 'Confirmé' },
            [awayShort]: { starters: ld.away, status: 'Confirmé' },
          },
          source: 'legabasket', confirmed: true,
        };
        _euroCache[ck] = { data: result, ts: Date.now() };
        return res.json(result);
      }
    } catch {}
  }

  // 3) SofaScore — probables (disponibles ~24h avant)
  try {
    const dt = new Date(date);
    const datesToTry = [0, -1, 1].map(d => new Date(dt.getTime() + d * 86400000).toISOString().slice(0, 10));
    let sofaResult = null;
    for (const d of datesToTry) {
      try {
        const evts = await sofaFetch(`/sport/basketball/scheduled-events/${d}`);
        const ev = (evts.events || []).find(e =>
          sofaNameMatch(e.homeTeam?.name || '', home) && sofaNameMatch(e.awayTeam?.name || '', away)
        );
        if (!ev) continue;
        const ld = await sofaFetch(`/event/${ev.id}/lineups`);
        const getStarters = side => ((ld[side]?.players || []).filter(p => !p.substitute).map(p => ({ name: p.player?.name || p.player?.shortName || '' })).filter(p => p.name));
        const hStarters = getStarters('home');
        const aStarters = getStarters('away');
        if (hStarters.length >= 5 && aStarters.length >= 5) {
          const confirmed = ld.confirmed === true;
          sofaResult = {
            starters: {
              [homeShort]: { starters: hStarters, status: confirmed ? 'Confirmé' : 'Probable' },
              [awayShort]: { starters: aStarters, status: confirmed ? 'Confirmé' : 'Probable' },
            },
            source: 'sofascore', confirmed,
          };
          break;
        }
      } catch {}
    }
    if (sofaResult) {
      _euroCache[ck] = { data: sofaResult, ts: Date.now() };
      return res.json(sofaResult);
    }
  } catch {}

  // 4) Compo probable depuis historique gamelog api-sports.io (titularisations + minutes récentes)
  if (homeId && awayId) {
    try {
      const [homeRoster, awayRoster] = await Promise.all([
        bballFetch(`/players?team=${homeId}&season=${cfg.season}`).then(d => d.response || []),
        bballFetch(`/players?team=${awayId}&season=${cfg.season}`).then(d => d.response || []),
      ]);
      const recentCutoff = Date.now() - 60 * 24 * 3600_000;
      const getStarters = async (roster) => {
        const top = roster.slice(0, 18);
        const scored = await Promise.all(
          top.map(p =>
            bballPlayerGamelog(league, p.id).then(games => {
              const lg = games.filter(g => new Date(g.date).getTime() > recentCutoff);
              const last5 = lg.slice(0, 5);
              const starts = last5.filter(g => g.starter).length;
              const ppg = last5.length ? last5.reduce((s, g) => s + (g.pts ?? 0), 0) / last5.length : 0;
              return { name: p.name, starts, ppg, played: last5.length };
            })
          )
        );
        return scored
          .filter(p => p.played > 0)
          .sort((a, b) => (b.starts - a.starts) || (b.ppg - a.ppg))
          .slice(0, 5)
          .map(p => ({ name: p.name }));
      };
      const [hStarters, aStarters] = await Promise.all([getStarters(homeRoster), getStarters(awayRoster)]);
      if (hStarters.length >= 5 && aStarters.length >= 5) {
        const result = {
          starters: {
            [homeShort]: { starters: hStarters, status: 'Probable' },
            [awayShort]: { starters: aStarters, status: 'Probable' },
          },
          source: 'gamelog', confirmed: false,
        };
        _euroCache[ck] = { data: result, ts: Date.now() };
        return res.json(result);
      }
    } catch {}
  }

  // Fallback final : compo reportée du dernier match connu, pas encore vérifiée pour CE match → Probable
  if ((savedHome?.starters?.length >= 5 && savedDateMatch(savedHome)) || (savedAway?.starters?.length >= 5 && savedDateMatch(savedAway))) {
    const result = { starters: {}, source: 'saved', confirmed: false };
    if (savedHome?.starters?.length >= 5 && savedDateMatch(savedHome)) {
      result.starters[homeShort] = { starters: savedHome.starters.map(n => ({ name: n })), status: savedHome.confirmed ? 'Confirmé' : 'Probable' };
    }
    if (savedAway?.starters?.length >= 5 && savedDateMatch(savedAway)) {
      result.starters[awayShort] = { starters: savedAway.starters.map(n => ({ name: n })), status: savedAway.confirmed ? 'Confirmé' : 'Probable' };
    }
    _euroCache[ck] = { data: result, ts: Date.now() };
    return res.json(result);
  }

  const fallback = { starters: {}, source: 'none' };
  _euroCache[ck] = { data: fallback, ts: Date.now() };
  res.json(fallback);
});

// H2H entre deux équipes (saison en cours + précédente)
app.get('/api/euro/:league/h2h/:homeId/:awayId', async (req, res) => {
  const { league, homeId, awayId } = req.params;
  const cfg = EURO_LEAGUES[league];
  if (!cfg) return res.status(404).json({ error: 'Unknown league' });
  const ck = `euro_h2h_${league}_${homeId}_${awayId}`;
  const hit = _euroCache[ck];
  if (hit && Date.now() - hit.ts < CACHE_6H) return res.json(hit.data);
  try {
    const [cur, prev] = await Promise.all([
      bballFetch(`/games?h2h=${homeId}-${awayId}&league=${cfg.id}&season=${cfg.season}`),
      bballFetch(`/games?h2h=${homeId}-${awayId}&league=${cfg.id}&season=${cfg.season.replace(/\d{4}$/, s => String(+s - 1))}`).catch(() => ({ response: [] })),
    ]);
    const toGame = g => {
      if (!g?.scores?.home?.total) return null;
      const home = g.teams.home.name;
      const away = g.teams.away.name;
      return { date: g.date.slice(0, 10), home, away, scoreHome: g.scores.home.total, scoreAway: g.scores.away.total };
    };
    const games = [...(cur.response || []), ...(prev.response || [])]
      .filter(g => normGameStatus(g.status) === 'STATUS_FINAL')
      .map(toGame).filter(Boolean)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 8);
    const result = { games };
    _euroCache[ck] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    if (_euroCache[ck]?.data) return res.json(_euroCache[ck].data);
    res.json({ games: [] });
  }
});

// Stats équipe saison depuis standings api-sports.io
app.get('/api/euro/:league/standings', async (req, res) => {
  const cfg = EURO_LEAGUES[req.params.league];
  if (!cfg) return res.status(404).json({ error: 'Unknown league' });
  const ck = `euro_standings_${req.params.league}`;
  const hit = _euroCache[ck];
  if (hit && Date.now() - hit.ts < CACHE_6H) return res.json(hit.data);
  try {
    const d = await bballFetch(`/standings?league=${cfg.id}&season=${cfg.season}`);
    const rows = (d.response || []).flat();
    const teams = rows.map(r => {
      const gp = r.games?.played || 1;
      const ppg  = r.points?.for     != null ? +(r.points.for     / gp).toFixed(1) : null;
      const oppg = r.points?.against  != null ? +(r.points.against / gp).toFixed(1) : null;
      return { id: r.team.id, name: r.team.name, position: r.position, wins: r.games?.win?.total ?? 0, losses: r.games?.lose?.total ?? 0, ppg, oppg };
    });
    const result = { teams };
    _euroCache[ck] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    if (_euroCache[ck]?.data) return res.json(_euroCache[ck].data);
    res.json({ teams: [] });
  }
});

// ── RotoWire HTML scraping ────────────────────────────────────────────────────
const ROTO_PAGE_URL = 'https://www.rotowire.com/basketball/nba-lineups.php';
const ROTO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
};
const ESPN_TO_STD = { SA:'SAS', NY:'NYK', GS:'GSW', NO:'NOP', UT:'UTA' };
const toStd = a => ESPN_TO_STD[a?.toUpperCase()] || a?.toUpperCase() || '';

// Stockage partagé des blessures extraites de la page lineups (MAY NOT PLAY)
const _lineupInjuries = {};

// Scrape la page RotoWire et retourne { [teamAbbr]: { starters, status } } pour tous les matchs du jour
async function fetchRotoWireAllLineups() {
  const ck = 'roto_html_all';
  const hit = _espnCache[ck];
  if (hit && Date.now() - hit.ts < 15 * 60 * 1000) return hit.data;

  const resp = await fetch(ROTO_PAGE_URL, { headers: ROTO_HEADERS });
  if (!resp.ok) throw new Error(`RotoWire HTML ${resp.status}`);
  const html = await resp.text();

  const result = {};

  // Découper par bloc lineup__box (un par match)
  const boxes = html.split(/(?=<[^>]*class="lineup__box")/).slice(1);

  for (const box of boxes) {
    // Identifier équipes home/visit via data-team + data-home
    const homeMatch  = box.match(/data-team="(\w+)"[^>]*data-home="1"/);
    const visitMatch = box.match(/data-team="(\w+)"[^>]*data-home="0"/);
    if (!homeMatch || !visitMatch) continue;
    const homeAbbr  = toStd(homeMatch[1]);
    const visitAbbr = toStd(visitMatch[1]);

    // Extraire les deux ul
    const visitUl = box.match(/<ul class="lineup__list is-visit">([\s\S]*?)<\/ul>/)?.[1] || '';
    const homeUl  = box.match(/<ul class="lineup__list is-home">([\s\S]*?)<\/ul>/)?.[1]  || '';

    const parseList = (ulHtml, injuryOut) => {
      // Tronquer avant "MAY NOT PLAY"
      const cut = ulHtml.indexOf('lineup__title is-middle');
      const body = cut > -1 ? ulHtml.slice(0, cut) : ulHtml;
      const confirmed = /is-confirmed/.test(ulHtml);
      const names = [...body.matchAll(/<a title="([^"]+)"/g)].map(m => m[1]);

      // Parser la section MAY NOT PLAY pour récupérer les blessés du match
      if (cut > -1) {
        const mnpSection = ulHtml.slice(cut);
        const STATUS_NORM = { 'out': 'Out', 'ofs': 'Out',
          'doubtful': 'Questionable', 'questionable': 'Questionable', 'ques': 'Questionable',
          'day-to-day': 'Questionable', 'gtd': 'Questionable', 'game-time decision': 'Questionable' };
        for (const li of mnpSection.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
          const liHtml = li[1];
          const nameM = liHtml.match(/<a[^>]*title="([^"]+)"/);
          if (!nameM) continue;
          const injM = liHtml.match(/lineup__inj[^>]*>([^<]+)</i);
          if (!injM) continue;
          const raw = injM[1].trim().toLowerCase().split(/[\s-]/)[0];
          const status = STATUS_NORM[raw] || STATUS_NORM[injM[1].trim().toLowerCase()] || 'Questionable';
          const reason = injM[1].trim().replace(/^[^-]+-\s*/, '');
          injuryOut[nameM[1].trim()] = { status, reason };
        }
      }

      return names.length >= 5
        ? { starters: names.map(n => ({ name: n })), status: confirmed ? 'Confirmé' : 'Probable' }
        : null;
    };

    const mnpMap = {};
    const visitData = parseList(visitUl, mnpMap);
    const homeData  = parseList(homeUl, mnpMap);
    if (visitData) result[visitAbbr] = { ...visitData, injuries: {} };
    if (homeData)  result[homeAbbr]  = { ...homeData,  injuries: {} };
    // Attacher les blessures au bon résultat (on les stocke globalement dans _lineupInjuries)
    Object.assign(_lineupInjuries, mnpMap);
  }

  _espnCache[ck] = { data: result, ts: Date.now() };
  return result;
}

// ── RotoWire NBA Injuries page ────────────────────────────────────────────────
async function fetchRotoWireInjuries() {
  const ck = 'roto_nba_injuries';
  const hit = _espnCache[ck];
  if (hit && Date.now() - hit.ts < 15 * 60 * 1000) return hit.data;

  const resp = await fetch('https://www.rotowire.com/basketball/tables/injury-report.php?team=ALL&pos=ALL', {
    headers: { ...ROTO_HEADERS, 'Referer': 'https://www.rotowire.com/basketball/nba-injuries.php', 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!resp.ok) throw new Error(`RotoWire injuries ${resp.status}`);
  const data = await resp.json();

  const STATUS_NORM = {
    'out': 'Out', 'ofs': 'Out', 'out for season': 'Out',
    'doubtful': 'Questionable', 'questionable': 'Questionable', 'ques': 'Questionable',
    'day-to-day': 'Questionable', 'day to day': 'Questionable',
    'game time decision': 'Questionable', 'game-time decision': 'Questionable', 'gtd': 'Questionable',
  };

  const result = {};
  for (const p of data) {
    const name   = p.player?.trim();
    const rawSt  = (p.status || '').toLowerCase().trim();
    const status = STATUS_NORM[rawSt];
    if (name && status) result[name] = { status, reason: p.injury || '', team: p.team || '' };
  }

  _espnCache[ck] = { data: result, ts: Date.now() };
  return result;
}

app.get('/api/nba/rotowire', async (req, res) => {
  try {
    const all = await fetchRotoWireAllLineups();
    _updateScraper('rotowire', all != null && Object.keys(all).length > 0);
    const { team } = req.query;
    res.json(team ? (all[toStd(team)] ?? null) : all);
  } catch (err) {
    _updateScraper('rotowire', false);
    console.warn('RotoWire:', err.message); res.json(null);
  }
});

// ── NBA Injuries — RotoWire injuries page + MAY NOT PLAY section ─────────────
app.get('/api/nba/injuries', async (req, res) => {
  try {
    // 1. RotoWire injuries page (15min cache)
    const rotoInj = await fetchRotoWireInjuries().catch(() => ({}));
    // 2. Lineups page MAY NOT PLAY section (populated as side-effect of lineup fetch)
    await fetchRotoWireAllLineups().catch(() => {});
    // Merge: rotoInj (full roster) overridden by lineup MAY NOT PLAY (match-specific)
    const merged = { ...rotoInj, ..._lineupInjuries };
    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Projected Lineup : RotoWire → ESPN confirmed (jour J) ────────────────────
async function _refreshNbaProjectedLineup(date, home, away, ck) {
  const ESPN_ABBR_MAP = { SAS:'SA', NYK:'NY', GSW:'GS', NOP:'NO', UTA:'UT' };
  const ABBR_BACK = Object.fromEntries(Object.entries(ESPN_ABBR_MAP).map(([k,v]) => [v,k]));
  const toEspn = a => ESPN_ABBR_MAP[a.toUpperCase()] || a.toUpperCase();
  const toOrig = a => ABBR_BACK[a.toUpperCase()] || a.toUpperCase();

  const result = { starters: {}, source: 'none' };

  // 1. RotoWire — scraping HTML (home + away en un seul appel)
  try {
    const all = await fetchRotoWireAllLineups();
    const homeRoto = all[toStd(home)];
    const awayRoto = all[toStd(away)];
    if (homeRoto?.starters?.length) { result.starters[toStd(home)] = homeRoto; result.source = 'rotowire'; }
    if (awayRoto?.starters?.length) { result.starters[toStd(away)] = awayRoto; result.source = 'rotowire'; }
  } catch (e) { console.warn('RotoWire lookup:', e.message); }

  // 2. ESPN game summary — starters officiels ~1h avant tip-off (override RotoWire si dispo)
  try {
    const dt  = new Date(date);
    const est = new Date(dt.getTime() - 5 * 3600 * 1000);
    const ymd = est.toISOString().slice(0, 10).replace(/-/g, '');
    const homeE = toEspn(home), awayE = toEspn(away);
    const sbResp = await fetch(`${ESPN_SCOREBOARD}?dates=${ymd}&limit=50`);
    if (sbResp.ok) {
      const sbData = await sbResp.json();
      const game = (sbData.events || []).find(e => {
        const abbrs = (e.competitions?.[0]?.competitors || []).map(c => c.team?.abbreviation?.toUpperCase() || '');
        return abbrs.includes(homeE) && abbrs.includes(awayE);
      });
      if (game) {
        const sumResp = await fetch(`${ESPN_SUMMARY}?event=${game.id}`);
        if (sumResp.ok) {
          const sumData = await sumResp.json();
          for (const td of (sumData.boxscore?.players || [])) {
            const abbr = toOrig(td.team?.abbreviation?.toUpperCase());
            const group = td.statistics?.[0];
            if (!group) continue;
            const confirmed = (group.athletes || [])
              .filter(a => a.starter)
              .map(a => ({ name: a.athlete?.displayName, id: a.athlete?.id }));
            if (confirmed.length >= 5) {
              result.starters[abbr] = { starters: confirmed, status: 'Confirmé' };
              result.source = 'espn';
            }
          }
        }
      }
    }
  } catch (e) { console.warn('ESPN projected lineup:', e.message); }

  _espnCache[ck] = { data: result, ts: Date.now() };
  return result;
}

app.get('/api/nba/projectedlineup', async (req, res) => {
  const { date, home, away } = req.query;
  if (!date || !home || !away) return res.status(400).json({ error: 'date, home, away requis' });

  const ck = `proj_${date.slice(0, 10)}_${home}_${away}`;
  const hit = _espnCache[ck];
  if (hit && Date.now() - hit.ts < 3 * 60 * 1000) return res.json(hit.data);

  if (hit) {
    _refreshInBackground(ck, () => _refreshNbaProjectedLineup(date, home, away, ck));
    return res.json(hit.data);
  }

  res.json(await _refreshNbaProjectedLineup(date, home, away, ck));
});

// ── Basketball Odds (scraping Betclic + Winamax + Unibet) ──────────────
app.get('/api/basketball/odds', async (req, res) => {
  let { home, away, league = 'nba', refresh, date } = req.query;
  if (!home || !away) return res.status(400).json({ error: 'home and away required' });

  const NBA_ABBR = { ATL:'Atlanta Hawks',BOS:'Boston Celtics',BKN:'Brooklyn Nets',CHA:'Charlotte Hornets',CHI:'Chicago Bulls',CLE:'Cleveland Cavaliers',DAL:'Dallas Mavericks',DEN:'Denver Nuggets',DET:'Detroit Pistons',GSW:'Golden State Warriors',HOU:'Houston Rockets',IND:'Indiana Pacers',LAC:'LA Clippers',LAL:'Los Angeles Lakers',MEM:'Memphis Grizzlies',MIA:'Miami Heat',MIL:'Milwaukee Bucks',MIN:'Minnesota Timberwolves',NOP:'New Orleans Pelicans',NYK:'New York Knicks',OKC:'Oklahoma City Thunder',ORL:'Orlando Magic',PHI:'Philadelphia 76ers',PHX:'Phoenix Suns',POR:'Portland Trail Blazers',SAC:'Sacramento Kings',SAS:'San Antonio Spurs',TOR:'Toronto Raptors',UTA:'Utah Jazz',WAS:'Washington Wizards' };
  if (league === 'nba') {
    // Le frontend envoie parfois les abréviations courtes ESPN (NY, SA, GS, NO, UT)
    // au lieu des codes standards NBA (NYK, SAS, GSW, NOP, UTA) — normaliser avant lookup
    const ESPN_SHORT_NORM = { SA: 'SAS', NY: 'NYK', GS: 'GSW', NO: 'NOP', UT: 'UTA' };
    const normNba = a => ESPN_SHORT_NORM[a?.toUpperCase()] || a?.toUpperCase();
    home = normNba(home);
    away = normNba(away);
    if (NBA_ABBR[home]) home = NBA_ABBR[home];
    if (NBA_ABBR[away]) away = NBA_ABBR[away];
  }

  const cacheKey = `bball_odds_${league}_${home}_${away}`;
  const cached = _espnCache[cacheKey];
  const matchStarted = date && new Date(date).getTime() < Date.now();

  // Match commencé : cotes figées — cache mémoire d'abord, snapshot disque en fallback (survit au redémarrage serveur)
  if (matchStarted && cached?.data) return res.json(cached.data);
  if (matchStarted && !cached?.data) {
    const snap = _linesSnapshot[cacheKey];
    if (snap?.data?.found) return res.json(snap.data);
  }

  if (!refresh && cached && Date.now() - cached.ts < 5 * 60 * 1000) return res.json(cached.data);

  const norm   = s => (s || '').toLowerCase().replace(/[^a-z]/g, '');
  const fuzzy  = (a, b) => { if (!a || !b) return false; const na = norm(a), nb = norm(b); return na.includes(nb) || nb.includes(na); };
  const lwrd   = s => (s || '').trim().split(' ').pop();
  const JUNK_OD = new Set(['bc', 'basket', 'basketball', 'beko', 'club']);
  const elKey = name => { const p = (name||'').trim().split(/\s+/); const last = p[p.length-1].toLowerCase(); return norm(JUNK_OD.has(last) && p.length>1 ? p.slice(0,-1).join('') : name); };
  const fuzzyPfx = (a, b, n=6) => { const na=norm(a), nb=norm(b); if(na.includes(nb)||nb.includes(na)) return true; if(na.length>=n&&nb.length>=n&&na.slice(0,n)===nb.slice(0,n)) return true; return false; };
  // EU team core : supprime préfixes/suffixes génériques (FC, UCAM, Basket...) avant comparaison
  const EU_PRE = new Set(['fc','ucam','bc','sk','sg','bbc','rb','la','bbl','olimpia','ea7','emporio','armani','germani','bertram','derthona','dolomiti','energia','umana','reyer','olidata','pompea','napolibasket']);
  const EU_SUF = new Set(['basket','baskets','basketball','beko','club','bc']);
  const euCore = n => { const ws = (n||'').toLowerCase().split(/[^a-z]+/).filter(Boolean); let s=0, e=ws.length; while(s<e-1 && EU_PRE.has(ws[s])) s++; while(e>s+1 && EU_SUF.has(ws[e-1])) e--; return ws.slice(s,e).join(''); };
  const EURO_BBALL = new Set(['acb','lnb','bbl','legaa']);
  const LEGAA_FR_IT2 = { venise:'venezia', bologne:'bologna', milan:'milano', naples:'napoli', trente:'trento', florence:'firenze', turin:'torino', genes:'genova' };
  const normLegaa2 = n => { let c=euCore(n); for(const [fr,it] of Object.entries(LEGAA_FR_IT2)) if(c.includes(fr)){c=c.replace(fr,it);break;} return c; };
  const matchTeam = (mName, ourName) => {
    if (league === 'euroleague') return fuzzyPfx(mName, elKey(ourName));
    if (league === 'legaa') { const ma=normLegaa2(mName),mb=normLegaa2(ourName); return ma.includes(mb)||mb.includes(ma)||(ma.length>=5&&mb.length>=5&&ma.slice(0,5)===mb.slice(0,5)); }
    if (EURO_BBALL.has(league)) {
      const ma = euCore(mName), mb = euCore(ourName);
      if (ma.includes(mb) || mb.includes(ma)) return true;
      return ma.length >= 5 && mb.length >= 5 && ma.slice(0,5) === mb.slice(0,5);
    }
    return fuzzy(mName, lwrd(ourName));
  };

  // Cache présent (même périmé) et match pas commencé : on le sert tel quel
  // et on rafraîchit en arrière-plan (évite le scraping + jitter sur le chemin de la requête)
  if (!refresh && cached?.data && !matchStarted) {
    _refreshInBackground(cacheKey, () => _refreshBasketballOdds(home, away, league, cacheKey, cached, matchStarted, matchTeam));
    return res.json(cached.data);
  }

  try {
    return res.json(await _refreshBasketballOdds(home, away, league, cacheKey, cached, matchStarted, matchTeam));
  } catch (err) {
    console.error('basketball odds:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Proba de victoire équipe — même modèle (computeTeamWinProb) que les alertes basketball_result
// en arrière-plan. Exposé pour que les pages détail (MatchDetailPage-like) affichent EXACTEMENT
// le même chiffre que l'alerte, au lieu d'une formule locale différente (19 juin 2026 — cf
// l'incohérence trouvée entre EarlyWin backend et le widget "Modèle 1X2" côté frontend).
app.post('/api/basketball/result', (req, res) => {
  const { homeGames, awayGames, gameDate, round, league, homePlayers, awayPlayers } = req.body || {};
  if (!homeGames?.length || !awayGames?.length || !gameDate) return res.status(400).json({ error: 'homeGames/awayGames/gameDate requis' });

  const isWNBA = league === 'wnba';
  const scaleF = (league && league !== 'nba' && league !== 'wnba') ? NBA_REF_BG / (EU_LEAGUE_CONST_BG[league] || NBA_REF_BG) : 1;
  const scaleGames   = arr => scaleF === 1 ? arr : arr.map(g => ({ ...g, ptsScored: (g.ptsScored || 0) * scaleF, ptsAllowed: (g.ptsAllowed || 0) * scaleF }));
  const scalePlayers = arr => scaleF === 1 ? (arr || []) : (arr || []).map(p => ({ ...p, stats: { ...p.stats, pts: (p.stats?.pts || 0) * scaleF } }));

  const homeOutPenalty = calcKeyPlayerOutPenalty(scalePlayers(homePlayers));
  const awayOutPenalty = calcKeyPlayerOutPenalty(scalePlayers(awayPlayers));

  const result = computeTeamWinProb({
    homeGames: scaleGames(homeGames), awayGames: scaleGames(awayGames),
    gameDate, round: round || '', isWNBA, homeOutPenalty, awayOutPenalty,
  });
  if (!result) return res.json({ error: 'insufficient data' });
  res.json({
    pHome: +(result.pHome * 100).toFixed(1), pAway: +(result.pAway * 100).toFixed(1),
    marginExpected: result.marginExpected, std: result.std,
  });
});

// Source unique Total O/U — même modèle (computeGameTotalFull) que les alertes game_total,
// pour que le widget "Modèle O/U" de la page détail affiche exactement le même chiffre que
// l'alerte (remplace l'ancien calcul local computeGameTotal du frontend, 22 juin 2026).
app.post('/api/basketball/total', (req, res) => {
  const { homeGames, awayGames, gameDate, round, league, refTotal, awayTeamKey } = req.body || {};
  if (!homeGames?.length || !awayGames?.length || !gameDate || !refTotal) return res.status(400).json({ error: 'homeGames/awayGames/gameDate/refTotal requis' });

  const isWNBA = league === 'wnba';
  const isEU = league && league !== 'nba' && league !== 'wnba';
  const avgPtsAllowed = isWNBA ? WNBA_TOTAL_LEAGUE_AVG : isEU ? (EU_LEAGUE_CONST_BG[league] || NBA_REF_BG) : NBA_REF_BG;
  const ouBaseline    = isWNBA ? WNBA_TOTAL_GAME_AVG   : isEU ? (EU_GAME_TOTAL_AVG[league] ?? avgPtsAllowed * 2) : NBA_TOTAL_GAME_AVG;

  // Tendance série en cours (cf. computeGameTotalFull) — awayTeamKey peut être un id (EU) ou
  // une abréviation ESPN (NBA/WNBA), on matche les deux champs possibles du schedule.
  const ESPN_SHORT_TO_STD = { SA:'SAS', NY:'NYK', GS:'GSW', NO:'NOP', UT:'UTA' };
  const normAbbr = a => ESPN_SHORT_TO_STD[a?.toUpperCase?.()] || a?.toUpperCase?.() || a;
  const h2hGames = awayTeamKey ? homeGames.filter(hg =>
    String(hg.opponentId) === String(awayTeamKey) || normAbbr(hg.opponentAbbr) === normAbbr(awayTeamKey)
  ) : [];

  const full = computeGameTotalFull({ homeGames, awayGames, avgPtsAllowed, ouBaseline, gameDate, round: round || '', refTotal, isWNBA, h2hGames });
  if (!full) return res.json({ error: 'insufficient data' });
  res.json({
    estimated: full.estimated, refTotal: full.refTotal, edge: full.edge, direction: full.direction, std: full.std,
    pOver: +(full.pOver * 100).toFixed(1), pUnder: +(full.pUnder * 100).toFixed(1),
    homeExpected: full.homeExpected, awayExpected: full.awayExpected, details: full.details,
  });
});

async function _refreshBasketballOdds(home, away, league, cacheKey, cached, matchStarted, matchTeam) {
  const [ubData, bcMatches, wmMatches] = await Promise.all([
    fetchUnibetBasketData(home, away, league).catch(() => null),
    fetchBetclicBasketOdds(league).catch(() => []),
    fetchWinamaxBasketOdds(league).catch(() => []),
  ]);

  _updateScraper('unibet', ubData != null && (
    ubData.h2h != null || ubData.totals != null ||
    Object.keys(ubData?.players ?? {}).length > 0 ||
    Object.keys(ubData?.perfLadders ?? {}).length > 0
  ));
  _updateScraper('betclic', Array.isArray(bcMatches) && bcMatches.length > 0);
  _updateScraper('winamax', Array.isArray(wmMatches) && wmMatches.length > 0);

  const markets = {};

  // Unibet via scraping
  if (ubData?.h2h) {
    markets.h2h = markets.h2h || { bookmakers: {} };
    markets.h2h.bookmakers.unibet = ubData.h2h;
  }
  if (ubData?.totals) {
    markets.totals = markets.totals || { bookmakers: {} };
    markets.totals.bookmakers.unibet = ubData.totals;
  }

  // Betclic via scraping
  const bcMatch = bcMatches.find(m => matchTeam(m.homeTeam, home) && matchTeam(m.awayTeam, away));
  if (bcMatch) {
    markets.h2h = markets.h2h || { bookmakers: {} };
    markets.h2h.bookmakers.betclic = { home: bcMatch.h2h.home, away: bcMatch.h2h.away };
  }

  // Winamax via scraping
  const wmMatch = wmMatches.find(m => matchTeam(m.homeTeam, home) && matchTeam(m.awayTeam, away));
  if (wmMatch) {
    markets.h2h = markets.h2h || { bookmakers: {} };
    markets.h2h.bookmakers.winamax = { home: wmMatch.h2h.home, away: wmMatch.h2h.away };
  }

  // Winamax match details (totals + player props lines)
  let wmDetails = null;
  if (wmMatch?.matchId) {
    wmDetails = await fetchWinamaxMatchDetails(wmMatch.matchId).catch(() => null);
    if (wmDetails?.totals) {
      markets.totals = markets.totals || { bookmakers: {} };
      markets.totals.bookmakers.winamax = wmDetails.totals;
    }
  }

  // Pinnacle H2H + Total — toutes ligues basket (25 juin 2026, générique)
  // Cache bulk partagé (getPinnacleAllBasket) — un seul scrape multi-pages alimente tous les matchs.
  // Pinnacle peut désigner l'équipe "domicile" différemment de notre source (ESPN) pour un même
  // match → gestion inversion home/away.
  {
    const pinMatches = await getPinnacleAllBasket().catch(() => []);
    const pinMatch = pinMatches.find(m =>
      (matchTeam(m.homeTeam, home) && matchTeam(m.awayTeam, away)) ||
      (matchTeam(m.homeTeam, away) && matchTeam(m.awayTeam, home))
    );
    if (pinMatch) {
      if (!Number.isNaN(pinMatch.line) && !Number.isNaN(pinMatch.over) && !Number.isNaN(pinMatch.under)) {
        markets.totals = markets.totals || { bookmakers: {} };
        markets.totals.bookmakers.pinnacle = { line: pinMatch.line, over: pinMatch.over, under: pinMatch.under };
      }
      if (pinMatch.h2h) {
        const isReversed = matchTeam(pinMatch.homeTeam, away) && matchTeam(pinMatch.awayTeam, home);
        markets.h2h = markets.h2h || { bookmakers: {} };
        markets.h2h.bookmakers.pinnacle = isReversed
          ? { home: pinMatch.h2h.away, away: pinMatch.h2h.home }
          : { home: pinMatch.h2h.home, away: pinMatch.h2h.away };
      }
    }
  }

  // Betclic match details (totals + earlywin + player props)
  const bcDetails = await fetchBetclicMatchDetails(home, away, league).catch(() => null);
  if (bcDetails?.totals) {
    markets.totals = markets.totals || { bookmakers: {} };
    markets.totals.bookmakers.betclic = bcDetails.totals;
  }
  if (bcDetails?.earlywin) {
    markets.earlywin = markets.earlywin || { bookmakers: {} };
    markets.earlywin.bookmakers.betclic = bcDetails.earlywin;
  }

  // Unibet earlywin
  if (ubData?.earlywin) {
    markets.earlywin = markets.earlywin || { bookmakers: {} };
    markets.earlywin.bookmakers.unibet = ubData.earlywin;
  }

  // Fallback Betclic : le scraping est intermittent (page non trouvée, marché absent ce cycle…).
  // Si ce cycle n'a rien renvoyé mais qu'on a des cotes Betclic récentes en cache (< 30 min),
  // on les conserve plutôt que de les faire disparaître de la boxe odds.
  const prevMarkets = (cached?.data?.markets && Date.now() - cached.ts < 30 * 60 * 1000) ? cached.data.markets : null;
  if (!bcMatch && prevMarkets?.h2h?.bookmakers?.betclic) {
    markets.h2h = markets.h2h || { bookmakers: {} };
    markets.h2h.bookmakers.betclic = prevMarkets.h2h.bookmakers.betclic;
  }
  if (!bcDetails?.totals && prevMarkets?.totals?.bookmakers?.betclic) {
    markets.totals = markets.totals || { bookmakers: {} };
    markets.totals.bookmakers.betclic = prevMarkets.totals.bookmakers.betclic;
  }
  if (!bcDetails?.earlywin && prevMarkets?.earlywin?.bookmakers?.betclic) {
    markets.earlywin = markets.earlywin || { bookmakers: {} };
    markets.earlywin.bookmakers.betclic = prevMarkets.earlywin.bookmakers.betclic;
  }

  if (!Object.keys(markets).length) {
    // Match commencé mais scrape vide → cache mémoire puis snapshot disque
    if (matchStarted && cached?.data?.found) return cached.data;
    if (matchStarted) {
      const snap = _linesSnapshot[cacheKey];
      if (snap?.data?.found) return snap.data;
    }
    return { found: false, home, away };
  }

  const result = { found: true, homeTeam: home, awayTeam: away, markets, source: 'scraped', wmMatchId: wmMatch?.matchId ?? null };
  _espnCache[cacheKey] = { data: result, ts: Date.now() };
  _saveLinesSnapshot(cacheKey, result);
  return result;
}

// ── Basketball scrapers ───────────────────────────────────────────────────────
async function _betclicLeagueSlugs(league, H) {
  if (league === 'euroleague') return ['basketball-sbasketball/euroligue-c14', 'basketball-sbasketball/basketball-euroleague-c53'];
  if (league === 'nba')        return ['basketball-sbasketball/nba-c13'];
  if (league === 'wnba')       return ['basketball-sbasketball/wnba-c513'];
  if (league === 'acb')        return ['basketball-sbasketball/espagne-acb-c154'];
  if (league === 'lnb')        return ['basketball-sbasketball/betclic-elite-c15'];
  if (league === 'bbl')        return ['basketball-sbasketball/allemagne-bundesliga-c1263'];
  if (league === 'legaa')      return ['basketball-sbasketball/italie-serie-a-c153'];
  return [];
}

async function fetchBetclicBasketOdds(league = 'nba') {
  const H = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'fr-FR,fr;q=0.9',
  };
  const slugs = await _betclicLeagueSlugs(league, H);
  if (!slugs.length) return [];

  const parsePage = html => {
    const idx = html.indexOf('"matches":[');
    if (idx < 0) return [];
    const pos = idx + '"matches":'.length;
    let depth = 0, end = pos;
    for (let i = 0; i < 300000; i++) {
      const c = html[pos + i];
      if (!c) break;
      if (c === '[') depth++;
      else if (c === ']') { depth--; if (depth === 0) { end = pos + i + 1; break; } }
    }
    try { return JSON.parse(html.slice(pos, end)); } catch { return []; }
  };

  const pages = await Promise.all(
    slugs.map(slug =>
      fetchBk('betclic', `https://www.betclic.fr/${slug}`, { headers: H, signal: AbortSignal.timeout(8000) })
        .then(r => r.ok ? r.text() : '')
        .catch(() => '')
    )
  );

  const results = [];
  for (const html of pages) {
    if (!html) continue;
    for (const m of parsePage(html)) {
      if (!m.contestants || m.contestants.length < 2) continue;
      const homeTeam = m.contestants[0].name;
      const awayTeam = m.contestants[1].name;
      const sels = m.market?.mainSelections ?? [];
      const homeSel = sels.find(s => s.name === homeTeam);
      const awaySel = sels.find(s => s.name === awayTeam);
      if (!homeSel || !awaySel) continue;
      results.push({
        homeTeam,
        awayTeam,
        commenceTime: m.matchDateUtc,
        h2h: { home: homeSel.odds, away: awaySel.odds },
      });
    }
  }
  return results;
}

async function fetchBetclicMatchDetails(home, away, league = 'nba') {
  const H = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'fr-FR,fr;q=0.9',
  };
  const leagueSlugs = await _betclicLeagueSlugs(league, H);
  if (!leagueSlugs.length) return null;
  const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  const lwrdBc  = s => (s || '').trim().split(' ').pop();
  const JUNK_BC  = new Set(['bc', 'basket', 'basketball', 'beko', 'club', 'baskets']);
  const EU_PRE_BC = new Set(['fc','ucam','bc','sk','sg','bbc','rb','la','olimpia','ea7','emporio','armani','germani','bertram','derthona','dolomiti','energia','umana','reyer','olidata','pompea']);
  const euCoreBc = n => { const ws = (n||'').toLowerCase().split(/[^a-z]+/).filter(Boolean); let s=0, e=ws.length; while(s<e-1 && EU_PRE_BC.has(ws[s])) s++; while(e>s+1 && JUNK_BC.has(ws[e-1])) e--; return ws.slice(s,e).join(''); };
  const IS_EU_BC = league === 'euroleague' || ['acb','lnb','bbl','legaa'].includes(league);
  // Noms FR de Betclic qui diffèrent des noms italiens/espagnols dans nos fixtures
  const BC_FR_ALIASES = { venezia: 'venise', zaragoza: 'saragosse', sevilla: 'seville' };

  // 1. Find the match URL — cherche dans tous les slugs de la ligue
  const homeBase = IS_EU_BC ? (BC_FR_ALIASES[euCoreBc(home)] ?? euCoreBc(home)) : lwrdBc(home);
  const awayBase = IS_EU_BC ? (BC_FR_ALIASES[euCoreBc(away)] ?? euCoreBc(away)) : lwrdBc(away);
  const slugLen = IS_EU_BC ? 5 : 6;
  const homeSlug = slugify(homeBase).replace(/-/g, '').slice(0, slugLen);
  const awaySlug = slugify(awayBase).replace(/-/g, '').slice(0, slugLen);
  let matchPath = null;
  for (const slug of leagueSlugs) {
    const lr = await fetchBk('betclic', `https://www.betclic.fr/${slug}`, { headers: H, signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!lr?.ok) continue;
    const lHtml = await lr.text();
    const hrefs = [...lHtml.matchAll(/href="(\/basketball[^"]*-m\d+)"/g)].map(m => m[1]);
    matchPath = hrefs.find(h => { const c = h.replace(/-/g, ''); return c.includes(homeSlug) && c.includes(awaySlug); });
    if (matchPath) break;
  }
  if (!matchPath) return null;

  // 2. Fetch match page
  const mr = await fetchBk('betclic', `https://www.betclic.fr${matchPath}`, { headers: H, signal: AbortSignal.timeout(8000) });
  if (!mr.ok) return null;
  const mHtml = await mr.text();

  // 3. Parse markets array (embedded as part of the match payload)
  const idx = mHtml.indexOf('markets":[');
  if (idx < 0) return null;
  const pos = idx + 'markets":'.length;
  let depth = 0, end = pos;
  for (let i = 0; i < 2000000; i++) {
    const c = mHtml[pos + i];
    if (!c) break;
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = pos + i + 1; break; } }
  }
  let mkList;
  try { mkList = JSON.parse(mHtml.slice(pos, end)); } catch { return null; }

  // 4. Find game totals market
  const totalMk = mkList.find(mk => mk.name === 'Nombre total de points');

  // 4b. EarlyWin market — Betclic expose isEarlyWin:true ou "avance" dans le nom
  const ewMk = mkList.find(mk => mk.isEarlyWin === true) || mkList.find(mk => mk.name && /avance/i.test(mk.name));
  let earlywin = null;
  if (ewMk) {
    const threshM = (ewMk.name || '').match(/(\d+)\s*point/i);
    const threshold = threshM ? +threshM[1] : 18;
    const normStr = s => (s || '').toLowerCase().replace(/[^a-z]/g, '');
    const homeKey = normStr(lwrdBc(home));
    const awayKey = normStr(lwrdBc(away));
    const sels = ewMk.mainSelections || (ewMk.selectionMatrix || []).flatMap(r => (r.selections || []).map(s => s.selectionOneof?.selection ?? s));
    const homeS = sels.find(s => normStr(s.name).includes(homeKey));
    const awayS = sels.find(s => normStr(s.name).includes(awayKey));
    if (homeS?.odds && awayS?.odds) earlywin = { home: homeS.odds, away: awayS.odds, threshold };
  }

  // 5. Player props — "Nombre de points du joueur (plus/moins)"
  const ptsMk = mkList.find(mk => mk.name === 'Nombre de points du joueur (plus/moins)');
  const players = {};
  if (ptsMk) {
    for (const row of ptsMk.selectionMatrix || []) {
      for (const s of row.selections || []) {
        const sel = s.selectionOneof?.selection ?? s;
        if (!sel.name || !sel.odds) continue;
        // Format : "Marko Gudurić + de 6,5" ou "Marko Gudurić - de 6,5"
        const m = sel.name.match(/^(.+?)\s+([+-])\s+de\s+([\d,]+)$/);
        if (!m) continue;
        const pName = m[1].trim();
        const isOver = m[2] === '+';
        const line = parseFloat(m[3].replace(',', '.'));
        if (!players[pName]) players[pName] = {};
        if (!players[pName].pts) players[pName].pts = { line };
        if (isOver) players[pName].pts.over  = sel.odds;
        else        players[pName].pts.under = sel.odds;
      }
    }
  }

  if (!totalMk && !earlywin && !Object.keys(players).length) return null;

  // 6. Extract over/under lines from selectionMatrix
  let totals = null;
  if (totalMk) {
    const lineMap = {};
    for (const row of totalMk.selectionMatrix || []) {
      for (const s of row.selections || []) {
        const sel = s.selectionOneof?.selection ?? s;
        if (!sel.name || !sel.odds) continue;
        const lineM = sel.name.match(/[\d,]+/);
        if (!lineM) continue;
        const line = parseFloat(lineM[0].replace(',', '.'));
        const isOver = /^\+/.test(sel.name);
        if (!lineMap[line]) lineMap[line] = {};
        if (isOver) lineMap[line].over = sel.odds;
        else lineMap[line].under = sel.odds;
      }
    }
    const cands = Object.entries(lineMap).filter(([, v]) => v.over && v.under).map(([l, v]) => ({ line: parseFloat(l), ...v }));
    if (cands.length) {
      const pickBest = cs => cs.reduce((best, c) => Math.abs(1/c.over - 1/c.under) < Math.abs(1/best.over - 1/best.under) ? c : best, cs[0]);
      totals = pickBest(cands);
    }
  }

  return {
    ...(totals ? { totals } : {}),
    ...(earlywin ? { earlywin } : {}),
    ...(Object.keys(players).length ? { players } : {}),
  };
}

async function fetchUnibetBasketData(home, away, league = 'nba') {
  const H = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'fr-FR,fr;q=0.9',
  };
  const norm  = s => (s || '').toLowerCase().replace(/[^a-z]/g, '');
  const lwrd  = s => (s || '').trim().split(' ').pop();
  const price = s => parseFloat((s || '0').replace(',', '.'));
  // For EL teams: strip generic prefixes/suffixes, use meaningful word
  const BRAND_PRE = new Set(['fc','bc','bk','sk','sg','bbc','rb','la','as','ss','ac','cf','ucam','olimpia','ea7','emporio','armani','germani','pallacanestro','virtus','fortitudo','reyer','umana','dolomiti','energia','bertram','derthona','telekom','mhp','ratiopharm','fraport','skyliners','alba','s04','riesen','hakro']);
  // Also extend JUNK with plural form
  const JUNK = new Set(['bc', 'basket', 'basketball', 'baskets', 'beko', 'club']);
  const teamSlug = name => {
    const parts = (name || '').trim().split(/\s+/);
    const cleaned = parts.filter(p => !BRAND_PRE.has(p.toLowerCase()) && !JUNK.has(p.toLowerCase()));
    const useParts = cleaned.length > 0 ? cleaned : parts;
    const key = norm(useParts.join(''));
    return key.slice(0, 8);
  };

  // 1. Find match URL from the basketball list page
  const listR = await fetchBk('unibet', 'https://www.unibet.fr/paris-basketball', { headers: H, signal: AbortSignal.timeout(10000) });
  if (!listR.ok) return null;
  const listHtml = await listR.text();

  const UB_LEAGUE_PATHS = { euroleague: 'euroleague', wnba: '/wnba/', nba: '/nba/', acb: 'liga-acb', lnb: 'd1-france', bbl: '/bbl/', legaa: '/serie-a' };
  const leaguePath = UB_LEAGUE_PATHS[league] || '/nba/';
  const isEuroLeague = league === 'euroleague' || ['acb','lnb','bbl','legaa'].includes(league);
  const hrefRe = /href="(\/paris-basketball\/[^"]*\/\d+\/[^"]+)"/g;
  const hrefs = [...listHtml.matchAll(hrefRe)].map(m => m[1]).filter(h => h.includes(leaguePath) && !h.includes('cotes-boostees'));
  const unique = [...new Set(hrefs)];

  const homeSlug = isEuroLeague ? teamSlug(home).slice(0, 6) : norm(lwrd(home));
  const awaySlug = isEuroLeague ? teamSlug(away).slice(0, 6) : norm(lwrd(away));
  let matchPath = unique.find(h => {
    if (isEuroLeague) {
      const clean = h.replace(/-/g, '');
      return clean.includes(homeSlug) && clean.includes(awaySlug);
    }
    return h.includes(homeSlug) && h.includes(awaySlug);
  });

  const urlCacheKey = `${league}_${norm(home)}_${norm(away)}`;

  if (matchPath) {
    // Cache URL for reuse when match goes live and disappears from list
    _ubMatchUrlCache[urlCacheKey] = matchPath;
  } else {
    // Match no longer in list (live or finished) — reuse cached pre-match URL
    matchPath = _ubMatchUrlCache[urlCacheKey] ?? null;
  }

  if (!matchPath) return null;

  // 2. Fetch match page (Unibet parfois renvoie 500 avec HTML valide — on parse quand même)
  const matchR = await fetchBk('unibet', `https://www.unibet.fr${matchPath}`, { headers: H, signal: AbortSignal.timeout(10000) });
  if (matchR.status === 404) return null;
  const mHtml = await matchR.text();

  // 3. Extract groupedMarkets
  const key = '"groupedMarkets":[';
  const idx = mHtml.indexOf(key);
  if (idx < 0) return null;
  const pos = idx + key.length - 1;
  let depth = 0, end = pos;
  for (let i = 0; i < 3000000; i++) {
    const c = mHtml[pos + i]; if (!c) break;
    if (c === '[') depth++; else if (c === ']') { depth--; if (depth === 0) { end = pos + i + 1; break; } }
  }
  let gm;
  try { gm = JSON.parse(mHtml.slice(pos, end)); } catch { return null; }

  const result = {};

  // 4. H2H
  const h2hGroup = gm.find(g => g.description === 'Face à Face - Match');
  if (h2hGroup) {
    const outs = h2hGroup.markets?.[0]?.outcomes ?? [];
    const homeKey = isEuroLeague ? teamSlug(home).slice(0, 6) : norm(lwrd(home));
    const awayKey = isEuroLeague ? teamSlug(away).slice(0, 6) : norm(lwrd(away));
    const homeOut = outs.find(o => norm(o.description).includes(homeKey));
    const awayOut = outs.find(o => norm(o.description).includes(awayKey));
    if (homeOut && awayOut) result.h2h = { home: price(homeOut.price), away: price(awayOut.price) };
  }

  // 4b. EarlyWin (+20 gagnant)
  const ewGroup = gm.find(g => g.description && /\+\d+\s*gagnant/i.test(g.description));
  if (ewGroup) {
    const threshM = ewGroup.description.match(/\+(\d+)/);
    const threshold = threshM ? +threshM[1] : 20;
    const outs = ewGroup.markets?.[0]?.outcomes ?? [];
    const homeKey = isEuroLeague ? teamSlug(home).slice(0, 6) : norm(lwrd(home));
    const awayKey = isEuroLeague ? teamSlug(away).slice(0, 6) : norm(lwrd(away));
    const homeOut = outs.find(o => norm(o.description).includes(homeKey));
    const awayOut = outs.find(o => norm(o.description).includes(awayKey));
    if (homeOut && awayOut) result.earlywin = { home: price(homeOut.price), away: price(awayOut.price), threshold };
  }

  // 5. Totals (most balanced line)
  const totGroup = gm.find(g => g.description?.startsWith('Plus / Moins Points - Match'));
  if (totGroup) {
    const cands = [];
    for (const mk of totGroup.markets || []) {
      const overOut  = mk.outcomes?.find(o => o.description?.startsWith('Plus'));
      const underOut = mk.outcomes?.find(o => o.description?.startsWith('Moins'));
      if (!overOut || !underOut) continue;
      const lineM = overOut.description.match(/[\d,.]+/);
      if (!lineM) continue;
      const line  = parseFloat(lineM[0].replace(',', '.'));
      const over  = price(overOut.price);
      const under = price(underOut.price);
      if (over && under) cands.push({ line, over, under });
    }
    if (cands.length) {
      const best = cands.reduce((b, c) => Math.abs(1/c.over - 1/c.under) < Math.abs(1/b.over - 1/b.under) ? c : b);
      result.totals = best;
    }
  }

  // 6. Player props — points, rebounds, assists
  const PROP_GROUPS = [
    { desc: 'Plus / Moins Points - Joueur - Match',                     prefix: 'Plus / Moins Points - ',                 key: 'pts' },
    { desc: 'Plus / Moins Rebonds - Joueur - Match',                    prefix: 'Plus / Moins Rebonds - ',                key: 'reb' },
    { desc: 'Plus / Moins Passes Décisives - Joueur - Match',           prefix: 'Plus / Moins Passes décisives - ',       key: 'ast' },
    { desc: 'Plus / Moins Paniers à 3 points réussis - Joueur - Match', prefix: '+/- Paniers 3 pts réussis - ',           key: 'tpm' },
  ];
  // Format "Performance Joueur" ignoré : Over uniquement, pas d'Under → on n'affiche rien pour Unibet
  const PERF_GROUPS = [];
  result.players = {};
  for (const { desc, prefix, key } of PROP_GROUPS) {
    const grp = gm.find(g => g.description === desc);
    if (!grp) continue;
    for (const mk of grp.markets || []) {
      const name = mk.description?.replace(prefix, '');
      if (!name) continue;
      const overOut  = mk.outcomes?.find(o => o.description?.startsWith('Plus'));
      const underOut = mk.outcomes?.find(o => o.description?.startsWith('Moins'));
      if (!overOut || !underOut) continue;
      const lineM = overOut.description.match(/[\d,.]+/);
      if (!lineM) continue;
      const line = parseFloat(lineM[0].replace(',', '.'));
      if (!result.players[name]) result.players[name] = {};
      result.players[name][key] = { line, over: price(overOut.price), under: price(underOut.price) };
    }
  }
  // Combos à 2 stats (Pts+Reb / Pts+Ast / Reb+Ast) — un seul marché par groupe regroupant tous les joueurs
  const COMBO_GROUPS = [
    { desc: 'Performance du Joueur - Total Points + Rebonds - Match', key: 'pr' },
    { desc: 'Performance du Joueur - Total Points + Passes - Match',  key: 'pa' },
    { desc: 'Performance du Joueur - Total Rebonds + Passes - Match', key: 'ra' },
  ];
  result.combos = {};
  for (const { desc, key } of COMBO_GROUPS) {
    const grp = gm.find(g => g.description === desc);
    if (!grp) continue;
    const byPlayer = {};
    for (const mk of grp.markets || []) {
      for (const o of mk.outcomes || []) {
        const m = o.description?.match(/^(.+?)\s+([+-])\s*de\s*([\d,.]+)/);
        if (!m) continue;
        const name = m[1].trim();
        const line = parseFloat(m[3].replace(',', '.'));
        if (!byPlayer[name]) byPlayer[name] = { line };
        if (m[2] === '+') byPlayer[name].over = price(o.price);
        else byPlayer[name].under = price(o.price);
      }
    }
    for (const [name, v] of Object.entries(byPlayer)) {
      if (v.line == null || !v.over || !v.under) continue;
      if (!result.combos[name]) result.combos[name] = {};
      result.combos[name][key] = { line: v.line, over: v.over, under: v.under };
    }
  }

  // Double Double / Triple Double — paris binaires "1+", on stocke la cote brute
  const MILESTONE_GROUPS = [
    { desc: 'Double Double - Match', key: 'dd' },
    { desc: 'Triple Double - Match', key: 'td' },
  ];
  result.milestones = {};
  for (const { desc, key } of MILESTONE_GROUPS) {
    const grp = gm.find(g => g.description === desc);
    if (!grp) continue;
    for (const mk of grp.markets || []) {
      for (const o of mk.outcomes || []) {
        const m = o.description?.match(/^(.+?)\s+1\+/);
        if (!m) continue;
        const name = m[1].trim();
        if (!result.milestones[name]) result.milestones[name] = {};
        result.milestones[name][key] = price(o.price);
      }
    }
  }

  // Format "Performance Joueur" : stocke toutes les lignes → pickMainLine choisira la bonne lors du merge
  if (!result._perfLines) result._perfLines = {};
  for (const { desc, key } of PERF_GROUPS) {
    const grp = gm.find(g => g.description === desc);
    if (!grp) continue;
    for (const mk of grp.markets || []) {
      const outs = mk.outcomes || [];
      if (!outs.length) continue;
      const playerName = outs[0]?.description?.replace(/\s+\d+\+$/, '').trim();
      if (!playerName) continue;
      const lines = outs.map(o => ({ line: o.spread ?? 0, over: price(o.price), under: null })).filter(l => l.line && l.over);
      if (!lines.length) continue;
      if (!result._perfLines[playerName]) result._perfLines[playerName] = {};
      result._perfLines[playerName][key] = lines;
    }
  }

  // Ladders "Performance Joueur" — Over uniquement, additif (ne touche pas Analyse Props)
  const ALT_PERF_GROUPS = [
    { desc: 'Performance Joueur Points - Match',             key: 'pts' },
    { desc: 'Performance Joueur - Rebonds - Match',          key: 'reb' },
    { desc: 'Performance Joueur - Passes Décisives - Match', key: 'ast' },
    { desc: 'Performance Joueur - Panier à 3pts - Match',    key: 'tpm' },
  ];
  result.perfLadders = {};
  for (const { desc, key } of ALT_PERF_GROUPS) {
    const grp = gm.find(g => g.description === desc);
    if (!grp) continue;
    for (const mk of grp.markets || []) {
      const outs = mk.outcomes || [];
      if (!outs.length) continue;
      const playerName = outs[0]?.description?.replace(/\s+\d+\+$/, '').trim();
      if (!playerName) continue;
      const lines = outs.map(o => ({ line: o.spread ?? 0, over: price(o.price) })).filter(l => l.line && l.over).sort((a, b) => a.line - b.line);
      if (!lines.length) continue;
      if (!result.perfLadders[playerName]) result.perfLadders[playerName] = {};
      result.perfLadders[playerName][key] = lines;
    }
  }

  return result;
}

// Scraping Winamax suspendu — ban CloudFront 13 juin. Repasser à true une fois débloqué.
const WINAMAX_ENABLED = false;

// Headers complets type navigateur Chrome — Winamax/CloudFront est sensible au fingerprint
// (un vrai Chrome envoie ~12 headers, pas juste UA + Accept-Language).
function winamaxHeaders(referer) {
  return {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'fr-FR,fr;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    ...(referer ? { Referer: referer } : {}),
  };
}

async function fetchWinamaxBasketOdds(league = 'nba') {
  if (!WINAMAX_ENABLED) return [];
  const H = winamaxHeaders();
  const WM_LEAGUE_IDS = { euroleague: 153, nba: 177, wnba: 591, acb: 271, lnb: 272, bbl: 154, legaa: 269 };
  const tid = WM_LEAGUE_IDS[league];
  const TARGET_TOURNAMENT_IDS = league === 'wnba' ? null : (tid ? new Set([tid]) : new Set([177]));

  const urls = tid && league !== 'nba' && league !== 'wnba'
    ? [`https://www.winamax.fr/paris-sportifs/sports/2/800000484/${tid}`, 'https://www.winamax.fr/paris-sportifs/sports/2/']
    : ['https://www.winamax.fr/paris-sportifs/sports/2/'];

  let matches = {}, bets = {}, oddsMap = {};
  for (const url of urls) {
    const r = await fetchBk('winamax', url, { headers: H, signal: AbortSignal.timeout(10000) }).catch(() => null);
    if (!r || !r.ok) continue;
    const html = await r.text();
    const stateMatch = html.match(/PRELOADED_STATE = (\{.*\})/);
    if (!stateMatch) continue;
    const data = JSON.parse(stateMatch[1]);
    // Merge — first page wins on conflict
    matches  = { ...(data.matches || {}),   ...matches };
    bets     = { ...(data.bets    || {}),   ...bets };
    oddsMap  = { ...(data.odds    || {}),   ...oddsMap };
  }

  const results = [];
  for (const match of Object.values(matches)) {
    if (!match || !['PREMATCH', 'STARTED', 'INPROGRESS', 'LIVE'].includes(match.status)) continue;
    if (TARGET_TOURNAMENT_IDS && !TARGET_TOURNAMENT_IDS.has(match.tournamentId)) continue;

    const bet = bets[match.mainBetId];
    if (!bet || !bet.outcomes || bet.outcomes.length < 2) continue;
    const [oc1, oc2] = bet.outcomes;
    const home = +(oddsMap[String(oc1)] ?? 0);
    const away = +(oddsMap[String(oc2)] ?? 0);
    if (!home || !away) continue;

    results.push({
      homeTeam: match.competitor1Name,
      awayTeam: match.competitor2Name,
      commenceTime: new Date(match.matchStart * 1000).toISOString(),
      matchId: match.matchId,
      h2h: { home, away },
    });
  }
  return results;
}

async function fetchWinamaxMatchDetails(matchId) {
  if (!WINAMAX_ENABLED) return {};
  const H = winamaxHeaders('https://www.winamax.fr/paris-sportifs/sports/2/');
  const r = await fetchBk('winamax', `https://www.winamax.fr/paris-sportifs/match/${matchId}`, { headers: H, signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (!r || !r.ok) return {};
  const html = await r.text();
  const stateMatch = html.match(/PRELOADED_STATE = (\{.*\})/);
  if (!stateMatch) return {};
  const data = JSON.parse(stateMatch[1]);

  const bets       = data.bets     || {};
  const oddsMap    = data.odds     || {};
  const outcomeMap = data.outcomes || {};

  const getLbl  = id => outcomeMap[String(id)]?.label ?? '';
  const getOdds = id => oddsMap[String(id)] ?? null;
  const parseLn = lbl => { const m = lbl.match(/[\d,]+/); return m ? parseFloat(m[0].replace(',', '.')) : null; };

  const pickBest = cands => cands.reduce((best, c) => {
    const balC = c.over && c.under ? Math.abs(1/c.over - 1/c.under) : 99;
    const balB = best.over && best.under ? Math.abs(1/best.over - 1/best.under) : 99;
    return balC < balB ? c : best;
  }, cands[0] ?? null);

  // Game totals
  const totalCands = [];
  const playerBets = {};
  const milestones = {}; // double-double / triple-double — cote brute par joueur
  const perfLadders = {}; // ladders "(paliers)" Over uniquement — par joueur, par stat

  for (const bet of Object.values(bets)) {
    const title    = bet.betTitle || '';
    const template = bet.template || '';

    // Ladders "(paliers)" — Over uniquement, un bet par palier (marketTotal = seuil)
    const palierM = title.match(/^Nombre de (points|rebonds|passes décisives) du joueur \(paliers\) - (.+)$/);
    if (template === 'dynamic' && palierM) {
      const key = { points: 'pts', rebonds: 'reb', 'passes décisives': 'ast' }[palierM[1]];
      const name = palierM[2];
      const odds = getOdds(bet.outcomes?.[0]);
      const line = bet.marketTotal;
      if (key && name && odds && line != null) {
        if (!perfLadders[name]) perfLadders[name] = {};
        if (!perfLadders[name][key]) perfLadders[name][key] = [];
        perfLadders[name][key].push({ line, over: odds });
      }
      continue;
    }

    if (template === 'ListOdd' && (title === 'Double-double' || title === 'Triple-double')) {
      const key = title === 'Double-double' ? 'dd' : 'td';
      for (const oc of bet.outcomes || []) {
        const name = getLbl(oc);
        const odds = getOdds(oc);
        if (!name || !odds) continue;
        if (!milestones[name]) milestones[name] = {};
        milestones[name][key] = odds;
      }
      continue;
    }

    if (template !== 'OverUnder') continue;
    const [oc1, oc2] = bet.outcomes || [];
    const lbl1 = getLbl(oc1); const lbl2 = getLbl(oc2);
    const odd1 = getOdds(oc1); const odd2 = getOdds(oc2);
    if (!odd1 || !odd2) continue;
    const isOver1 = lbl1.includes('Plus');
    const over = isOver1 ? odd1 : odd2;
    const under = isOver1 ? odd2 : odd1;
    const line = parseLn(isOver1 ? lbl1 : lbl2);
    if (!line) continue;

    const WM_PLAYER_PREFIXES = [
      { prefix: 'Nombre de points du joueur - ',                  key: 'pts' },
      { prefix: 'Nombre de rebonds du joueur - ',                 key: 'reb' },
      { prefix: 'Nombre de passes décisives du joueur - ',        key: 'ast' },
      { prefix: 'Total du joueur (points + rebonds) - ',          key: 'pr'  },
      { prefix: 'Total du joueur (points + passes) - ',           key: 'pa'  },
      { prefix: 'Total du joueur (passes + rebonds) - ',          key: 'ra'  },
      { prefix: 'Total du joueur (points + rebonds + passes) - ', key: 'pra' },
      { prefix: 'Nombre de paniers à 3 points du joueur - ',      key: 'tpm' },
    ];
    if (title === 'Nombre de points') {
      totalCands.push({ line, over, under });
    } else {
      const match = WM_PLAYER_PREFIXES.find(p => title.startsWith(p.prefix));
      if (match) {
        const name = title.slice(match.prefix.length);
        if (!playerBets[name]) playerBets[name] = {};
        if (!playerBets[name][match.key]) playerBets[name][match.key] = [];
        playerBets[name][match.key].push({ line, over, under });
      }
    }
  }

  const bestTotal = totalCands.length ? pickBest(totalCands) : null;
  const players   = {};
  for (const [name, statsBets] of Object.entries(playerBets)) {
    players[name] = {};
    for (const [key, cands] of Object.entries(statsBets)) {
      const best = pickBest(cands);
      if (best) players[name][key] = { line: best.line, over: best.over, under: best.under, allLines: cands.slice().sort((a, b) => a.line - b.line) };
    }
  }

  for (const name of Object.keys(perfLadders)) {
    for (const key of Object.keys(perfLadders[name])) {
      perfLadders[name][key] = perfLadders[name][key].slice().sort((a, b) => a.line - b.line);
    }
  }

  return { totals: bestTotal, players, milestones, perfLadders };
}

const WINAMAX_TARGET_TOURNAMENTS = new Set([
  'Premier League', 'Ligue 1', "Ligue 1 McDonald's®", 'LaLiga', 'Bundesliga',
  'Serie A', 'Eredivisie', 'Coupe du Monde', 'FIFA World Cup', 'WC 2026',
]);

const BETCLIC_LEAGUES = [
  'angl-premier-league-c3',
  'espagne-laliga-c7',
  'italie-serie-a-c6',
  'ned-eredivisie-c11',
  'top-football-europeen-p0',
  'coupe-du-monde-2026-c1',
];

// ── Outrights (paris longterme vainqueur de compétition) — Betclic uniquement ──
// Le marché "Vainqueur Compétition" est chargé par le JS de la page (onglet "Compétition",
// actif par défaut seulement quand il n'y a aucun match à venir à afficher — sinon il faut
// cliquer l'onglet) et parfois replié derrière un "Afficher plus" — aucune des deux données
// n'existe dans le HTML brut, donc scraping HTTP simple impossible ici. Unibet a le même
// souci mais sans solution sûre (voir mémoire) — Betclic n'a montré aucun signe de
// protection anti-bot pendant toute l'exploration, donc on utilise Playwright (navigateur
// headless réel) uniquement pour ce besoin précis. Le reste du scraping de l'app (cotes de
// match, props) continue d'utiliser fetchBk/HTTP simple, inchangé.
const BETCLIC_OUTRIGHT_TARGETS = [
  { key: 'ligue1',     label: 'Ligue 1',         sport: 'football',   slug: 'football-sfootball/ligue-1-uber-eats-c4' },
  { key: 'pl',         label: 'Premier League',  sport: 'football',   slug: 'football-sfootball/angl-premier-league-c3' },
  { key: 'laliga',     label: 'La Liga',         sport: 'football',   slug: 'football-sfootball/espagne-laliga-c7' },
  { key: 'seriea',     label: 'Serie A',         sport: 'football',   slug: 'football-sfootball/italie-serie-a-c6' },
  { key: 'bundesliga', label: 'Bundesliga',      sport: 'football',   slug: 'football-sfootball/allemagne-bundesliga-c5' },
  { key: 'nba',        label: 'NBA',             sport: 'basketball', slug: 'basketball-sbasketball/nba-c13' },
  { key: 'wnba',       label: 'WNBA',            sport: 'basketball', slug: 'basketball-sbasketball/wnba-c513' },
];

// La bannière cookies peut apparaître avec un délai (pas toujours présente au chargement) —
// on la vérifie à plusieurs moments plutôt qu'une seule fois, sinon elle intercepte les clics.
async function _dismissCookieBanner(page) {
  const acceptBtn = page.locator('button:has-text("Tout accepter")').first();
  if (await acceptBtn.count() > 0 && await acceptBtn.isVisible().catch(() => false)) {
    await acceptBtn.click({ timeout: 3000 }).catch(() => {});
    return true;
  }
  return false;
}

async function _scrapeBetclicOutrightPage(page, slug) {
  await page.goto(`https://www.betclic.fr/${slug}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await _dismissCookieBanner(page);

  // Si la page a un onglet Événements/Compétition, "Compétition" n'est pas actif par
  // défaut — sinon (pas de match à venir) le marché est déjà affiché directement.
  const compTab = page.locator('.tab_item:has-text("Compétition")').first();
  if (await compTab.count() > 0) {
    await _dismissCookieBanner(page);
    let clicked = await compTab.click({ timeout: 5000 }).then(() => true).catch(() => false);
    if (!clicked) {
      // Probablement la bannière cookies apparue entre-temps — on la redismisse et on retente.
      await _dismissCookieBanner(page);
      await compTab.click({ timeout: 5000 }).catch(() => {});
    }
  }

  const targetBox = page.locator('.marketBox', { has: page.locator('.marketBox_headTitle', { hasText: 'Vainqueur Compétition' }) }).first();
  await targetBox.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  if (await targetBox.count() === 0) return [];

  // Le bouton "Afficher plus" est un toggle — il peut déjà être à l'état "déplié"
  // (ex: PL après le clic sur l'onglet Compétition) ; cliquer dans ce cas le replierait.
  const seeMore = targetBox.locator('.is-seeMore');
  if (await seeMore.count() > 0) {
    const alreadyExpanded = await seeMore.first().evaluate(el => el.classList.contains('is-expanded')).catch(() => false);
    if (!alreadyExpanded) {
      await seeMore.first().evaluate(el => el.click()).catch(() => {});
      await targetBox.locator('.marketBox_label').nth(3).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    }
  }

  const names = await targetBox.locator('.marketBox_label').allTextContents();
  const oddsRaw = await targetBox.locator('bcdk-bet-button-odds-animated').allTextContents();
  const teams = names
    .map((name, i) => ({ name: name.trim(), odds: parseFloat((oddsRaw[i] || '').replace(/\s/g, '').replace(',', '.')) }))
    .filter(t => t.name && !isNaN(t.odds));
  return teams.sort((a, b) => a.odds - b.odds);
}

// Garde-fou anti-spam : même si le bouton "actualiser" ou un bug est déclenché en boucle,
// on ne relance jamais un vrai navigateur Playwright plus d'une fois par 15min. C'est ce
// genre de rafale (plusieurs lancements en quelques minutes, pendant du débogage) qui a
// déclenché le blocage Betclic du 23 juin — ce garde-fou empêche que ça se reproduise.
// Persisté sur disque (pas juste en mémoire) : un redémarrage du serveur pendant le dev
// (--watch sur chaque edit) ne doit pas remettre ce délai à zéro.
let _outrightAttempts = { betclic: 0, pinnacle: 0, pmu: 0, pinnacleFootCdm: 0, pinnacleWnbaTotals: 0 };
try { if (existsSync(OUTRIGHT_ATTEMPTS_FILE)) Object.assign(_outrightAttempts, JSON.parse(readFileSync(OUTRIGHT_ATTEMPTS_FILE, 'utf8'))); } catch {}
const _saveOutrightAttempts = () => { try { writeFileSync(OUTRIGHT_ATTEMPTS_FILE, JSON.stringify(_outrightAttempts), 'utf8'); } catch {} };

const BETCLIC_OUTRIGHT_MIN_INTERVAL_MS = 15 * 60 * 1000;

async function fetchBetclicOutrights() {
  if (process.env.RENDER === 'true') return {}; // Playwright → OOM sur Render free tier
  if (Date.now() - _outrightAttempts.betclic < BETCLIC_OUTRIGHT_MIN_INTERVAL_MS) return {};
  _outrightAttempts.betclic = Date.now();
  _saveOutrightAttempts();

  const { chromium } = await import('playwright');
  const out = {};
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'fr-FR',
    });
    for (const t of BETCLIC_OUTRIGHT_TARGETS) {
      const page = await context.newPage();
      try {
        const teams = await _scrapeBetclicOutrightPage(page, t.slug);
        if (teams.length) out[t.key] = { label: t.label, sport: t.sport, teams, updatedAt: Date.now() };
      } catch {} finally {
        await page.close().catch(() => {});
      }
      await new Promise(res => setTimeout(res, 800));
    }
  } finally {
    await browser.close().catch(() => {});
  }

  // Détection automatique de blocage : si la majorité des compétitions échouent d'un coup
  // (alors qu'elles marchaient avant), c'est probablement Betclic qui freine nos requêtes —
  // on se met en pause via le même système anti-ban que le scraping HTTP classique, au lieu
  // de continuer à retenter en silence.
  const successCount = Object.keys(out).length;
  if (successCount < BETCLIC_OUTRIGHT_TARGETS.length / 2) {
    _scraperFailStreak.betclic = (_scraperFailStreak.betclic || 0) + 1;
    const backoff = Math.min(BK_BACKOFF_BASE_MS * 2 ** (_scraperFailStreak.betclic - 1), BK_BACKOFF_MAX_MS);
    _scraperBlockedUntil.betclic = Date.now() + backoff;
    _saveScraperBlocks();
  }
  return out;
}

// ── Outrights Pinnacle (NBA uniquement pour l'instant) ───────────────────────
// Contrairement à Betclic, le marché "Vainqueur" est affiché en entier directement sur la
// page (pas de bouton "Afficher plus" à gérer) — aucun signe de protection anti-bot constaté
// pendant l'exploration (24 juin 2026). Reste branché sur les mêmes garde-fous (délai
// minimum, auto-détection de blocage) par précaution, même site différent de Betclic/Unibet.
const PINNACLE_NBA_TEAM_ALIASES = { 'philadelphie 76ers': 'philadelphia 76ers' };
const normPinnacleTeam = s => {
  const lower = (s || '').toLowerCase().trim();
  return PINNACLE_NBA_TEAM_ALIASES[lower] || lower;
};

const PINNACLE_OUTRIGHT_MIN_INTERVAL_MS = 15 * 60 * 1000;

async function fetchPinnacleOutrights() {
  if (Date.now() - _outrightAttempts.pinnacle < PINNACLE_OUTRIGHT_MIN_INTERVAL_MS) return {};
  _outrightAttempts.pinnacle = Date.now();
  _saveOutrightAttempts();

  const headers = {
    'x-api-key': PINNACLE_GUEST_API_KEY,
    'Accept':    'application/json',
    'Origin':    'https://www.pinnacle.com',
    'Referer':   'https://www.pinnacle.com/',
  };
  const out = {};
  try {
    // Find "NBA Champion" futures matchup dynamically
    const allMatchups = await fetch(
      `${PINNACLE_GUEST_API}/leagues/487/matchups?withSpecials=true`,
      { headers, signal: AbortSignal.timeout(10000) }
    ).then(r => r.json());

    const championMatchup = allMatchups.find(m =>
      m.type === 'special' && /nba champion/i.test(m.special?.description ?? '')
    );
    if (!championMatchup) throw new Error('NBA Champion futures not found');

    const [muDetail, mkts] = await Promise.all([
      fetch(`${PINNACLE_GUEST_API}/matchups/${championMatchup.id}`,                { headers, signal: AbortSignal.timeout(10000) }).then(r => r.json()),
      fetch(`${PINNACLE_GUEST_API}/matchups/${championMatchup.id}/markets/straight`, { headers, signal: AbortSignal.timeout(10000) }).then(r => r.json()),
    ]);

    const nameById = {};
    for (const p of muDetail.participants ?? []) nameById[p.id] = p.name;

    const mkt = mkts.find(m => m.key === 's;0;m');
    if (!mkt) throw new Error('no moneyline market');

    const teams = mkt.prices
      .map(p => ({ name: nameById[p.participantId], odds: _pinDecimal(p.price) }))
      .filter(t => t.name && !isNaN(t.odds))
      .sort((a, b) => a.odds - b.odds);

    if (teams.length) out.nba = teams;
  } catch {}

  if (!out.nba) {
    _scraperFailStreak.pinnacle = (_scraperFailStreak.pinnacle || 0) + 1;
    const backoff = Math.min(BK_BACKOFF_BASE_MS * 2 ** (_scraperFailStreak.pinnacle - 1), BK_BACKOFF_MAX_MS);
    _scraperBlockedUntil.pinnacle = Date.now() + backoff;
    _saveScraperBlocks();
  } else {
    _scraperFailStreak.pinnacle = 0;
  }
  return out;
}

const PINNACLE_OUTRIGHTS_CACHE_FILE = join(CACHE_DIR, 'pinnacle_outrights.json');
let _pinnacleOutrightsCache = { data: {}, ts: 0 };
try { if (existsSync(PINNACLE_OUTRIGHTS_CACHE_FILE)) _pinnacleOutrightsCache = JSON.parse(readFileSync(PINNACLE_OUTRIGHTS_CACHE_FILE, 'utf8')); } catch {}
const _savePinnacleOutrightsCache = () => { try { writeFileSync(PINNACLE_OUTRIGHTS_CACHE_FILE, JSON.stringify(_pinnacleOutrightsCache), 'utf8'); } catch {} };

async function getPinnacleOutrights() {
  if (Date.now() < _scraperBlockedUntil.pinnacle) return _pinnacleOutrightsCache.data;
  if (Date.now() - _pinnacleOutrightsCache.ts > OUTRIGHTS_TTL) {
    const data = await fetchPinnacleOutrights();
    const merged = { ..._pinnacleOutrightsCache.data, ...data };
    if (Object.keys(merged).length) {
      _pinnacleOutrightsCache = { data: merged, ts: Date.now() };
      _savePinnacleOutrightsCache();
    }
  }
  return _pinnacleOutrightsCache.data;
}

// ── Pinnacle football — CDM + Big Five (générique, 25 juin 2026) ─────────────
// Une seule session Playwright couvre toutes les ligues foot Pinnacle. Big Five retourne []
// hors saison (off-season juin-août) — sans impact sur le failStreak tant qu'une autre ligue
// (CDM en ce moment) renvoie des matchs.
const PINNACLE_FOOT_MIN_INTERVAL_MS = 15 * 60 * 1000;

// ── Pinnacle direct JSON API (remplace Playwright pour foot + basket) ─────────
// Clé publique extraite du frontend Pinnacle (même pour tous les visiteurs anonymes).
const PINNACLE_GUEST_API_KEY = 'CmX2KcMrXuFmNg6YFbmTxE0y9CIrOi0R';
const PINNACLE_GUEST_API     = 'https://guest.api.arcadia.pinnacle.com/0.1';

const PINNACLE_FOOT_LEAGUE_IDS = [
  2686,  // FIFA World Cup 2026
  2036,  // France Ligue 1
  1980,  // England Premier League
  2196,  // Spain La Liga
  1842,  // Germany Bundesliga
  2436,  // Italy Serie A
];

const PINNACLE_BASKET_LEAGUE_IDS = [
  { id: 578, league: 'wnba' },
  { id: 487, league: 'nba' },
  { id: 559, league: 'acb' },
  { id: 423, league: 'bbl' },
  { id: 472, league: 'legaa' },
  { id: 382, league: 'euroleague' },
];

function _pinDecimal(americanPrice) {
  if (!americanPrice) return NaN;
  return americanPrice > 0
    ? +((americanPrice / 100) + 1).toFixed(3)
    : +((100 / (-americanPrice)) + 1).toFixed(3);
}

async function _fetchPinnacleLeagueOdds(leagueId, sportType) {
  const headers = {
    'x-api-key': PINNACLE_GUEST_API_KEY,
    'Accept':    'application/json',
    'Origin':    'https://www.pinnacle.com',
    'Referer':   'https://www.pinnacle.com/',
  };
  const [matchupsResp, marketsResp] = await Promise.all([
    fetch(`${PINNACLE_GUEST_API}/leagues/${leagueId}/matchups?withSpecials=false`, { headers, signal: AbortSignal.timeout(10000) }),
    fetch(`${PINNACLE_GUEST_API}/leagues/${leagueId}/markets/straight`,            { headers, signal: AbortSignal.timeout(10000) }),
  ]);
  if (!matchupsResp.ok || !marketsResp.ok) return [];

  const [matchups, markets] = await Promise.all([matchupsResp.json(), marketsResp.json()]);

  const mktsById = {};
  for (const mkt of markets) (mktsById[mkt.matchupId] ??= []).push(mkt);

  const results = [];
  for (const mu of matchups) {
    if (mu.parentId) continue;
    const ps   = mu.participants ?? [];
    const homeP = ps.find(p => p.alignment === 'home');
    const awayP = ps.find(p => p.alignment === 'away');
    if (!homeP || !awayP) continue;

    const matchMarkets = mktsById[mu.id] ?? [];
    const mlMkt  = matchMarkets.find(m => m.type === 'moneyline' && m.key === 's;0;m' && !m.isAlternate);
    const totMkt = matchMarkets.find(m => m.type === 'total'     && !m.isAlternate && m.key.startsWith('s;0;ou;'));

    const result = { homeTeam: homeP.name, awayTeam: awayP.name, commenceTime: mu.startTime };

    if (mlMkt) {
      const hp = mlMkt.prices.find(p => p.designation === 'home');
      const ap = mlMkt.prices.find(p => p.designation === 'away');
      const dp = mlMkt.prices.find(p => p.designation === 'draw');
      if (hp && ap) {
        result.h2h = { home: _pinDecimal(hp.price), away: _pinDecimal(ap.price) };
        if (dp) result.h2h.draw = _pinDecimal(dp.price);
      }
    }

    if (totMkt) {
      const op   = totMkt.prices.find(p => p.designation === 'over');
      const up   = totMkt.prices.find(p => p.designation === 'under');
      const line = op?.points ?? up?.points;
      if (op && up && line != null) {
        if (sportType === 'football') {
          result.totals = { [String(line)]: { over: _pinDecimal(op.price), under: _pinDecimal(up.price) } };
        } else {
          result.line  = line;
          result.over  = _pinDecimal(op.price);
          result.under = _pinDecimal(up.price);
        }
      }
    }

    if (sportType === 'basketball') {
      result.line  ??= NaN;
      result.over  ??= NaN;
      result.under ??= NaN;
      result.h2h   ??= null;
    }

    if (result.h2h || result.totals || !Number.isNaN(result.line)) results.push(result);
  }
  return results;
}

const PINNACLE_FOOT_PAGES = [
  { path: '/en/soccer/fifa-world-cup/matchups/',        href: '/fifa-world-cup/' },
  { path: '/en/soccer/french-ligue-1/matchups/',        href: '/french-ligue-1/' },
  { path: '/en/soccer/english-premier-league/matchups/', href: '/english-premier-league/' },
  { path: '/en/soccer/spanish-la-liga/matchups/',       href: '/spanish-la-liga/' },
  { path: '/en/soccer/german-bundesliga/matchups/',     href: '/german-bundesliga/' },
  { path: '/en/soccer/italian-serie-a/matchups/',       href: '/italian-serie-a/' },
];

// Scrape une page foot Pinnacle et retourne les matchs avec H2H + O/U.
// hrefSubstr : fragment de l'href des liens match (ex: "/french-ligue-1/").
async function _scrapePinnacleFootballPage(page, hrefSubstr) {
  await page.waitForSelector(`a[href*="${hrefSubstr}"][href*="-vs-"]`, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  return page.evaluate((sub) => {
    const cls = el => (typeof el.className === 'string' ? el.className : '');
    const txt = el => (el ? el.innerText.trim() : '');
    const flt = s => parseFloat(s);
    const results = [];
    for (const link of document.querySelectorAll(`a[href*="${sub}"][href*="-vs-"]`)) {
      try {
        const labelDivs = [...link.querySelectorAll('div')].filter(el => cls(el).includes('gameInfoLabel'));
        if (labelDivs.length < 2) continue;
        const homeTeam = txt(labelDivs[0]).replace(/\s*\(Match\)\s*$/i, '').trim();
        const awayTeam = txt(labelDivs[1]).replace(/\s*\(Match\)\s*$/i, '').trim();
        if (!homeTeam || !awayTeam) continue;
        let container = link.parentElement;
        while (container && !container.querySelector('[data-test-id="moneyline"]')) {
          container = container.parentElement;
          if (!container || container === document.body) break;
        }
        if (!container) continue;
        const getPrice = btn => {
          const el = [...btn.querySelectorAll('*')].find(e => cls(e).includes('price-'));
          return el ? flt(txt(el)) : NaN;
        };
        const moneylineEl = container.querySelector('[data-test-id="moneyline"]');
        if (!moneylineEl) continue;
        const priceBtns = [...moneylineEl.querySelectorAll('button')].filter(b => cls(b).includes('market-btn'));
        if (priceBtns.length < 3) continue;
        const [home, draw, away] = priceBtns.map(getPrice);
        if ([home, draw, away].some(Number.isNaN)) continue;
        let totals = null;
        const ouEl = container.querySelector('[data-test-id="over-under"]');
        if (ouEl) {
          const ouBtns = [...ouEl.querySelectorAll('button')].filter(b => cls(b).includes('market-btn'));
          if (ouBtns.length >= 2) {
            const labelEl = [...ouBtns[0].querySelectorAll('*')].find(e => cls(e).includes('label-'));
            const line  = labelEl ? flt(txt(labelEl)) : NaN;
            const over  = getPrice(ouBtns[0]);
            const under = getPrice(ouBtns[1]);
            if (![line, over, under].some(Number.isNaN)) totals = { [String(line)]: { over, under } };
          }
        }
        results.push({ homeTeam, awayTeam, commenceTime: null, h2h: { home, draw, away }, ...(totals ? { totals } : {}) });
      } catch { /* skip */ }
    }
    return results;
  }, hrefSubstr);
}

async function fetchPinnacleAllFootball() {
  if (Date.now() - _outrightAttempts.pinnacleFootCdm < PINNACLE_FOOT_MIN_INTERVAL_MS) return [];
  if (Date.now() < _scraperBlockedUntil.pinnacle_foot) return [];
  _outrightAttempts.pinnacleFootCdm = Date.now();
  _saveOutrightAttempts();

  let callsOk = 0;
  const chunks = await Promise.all(
    PINNACLE_FOOT_LEAGUE_IDS.map(id =>
      _fetchPinnacleLeagueOdds(id, 'football')
        .then(r => { callsOk++; return r; })
        .catch(() => [])
    )
  );
  const allMatches = chunks.flat();

  if (allMatches.length > 0 || callsOk > 0) {
    _scraperFailStreak.pinnacle_foot = 0;
  } else {
    _scraperFailStreak.pinnacle_foot = (_scraperFailStreak.pinnacle_foot || 0) + 1;
    const backoff = Math.min(BK_BACKOFF_BASE_MS * 2 ** (_scraperFailStreak.pinnacle_foot - 1), BK_BACKOFF_MAX_MS);
    _scraperBlockedUntil.pinnacle_foot = Date.now() + backoff;
    _saveScraperBlocks();
  }
  return allMatches;
}

// ── Pinnacle basket — WNBA + NBA + ligues EU (générique, 25 juin 2026) ───────
// Une seule session Playwright couvre toutes les ligues basket Pinnacle.
// NBA/ACB/BBL/LegaA/EuroLeague retournent [] hors saison — sans impacter le failStreak
// tant que WNBA (en cours) renvoie des matchs.
// URLs EU basket : à valider à la reprise des saisons (sept/oct 2026).
const PINNACLE_WNBA_MIN_INTERVAL_MS = 15 * 60 * 1000;

const PINNACLE_BASKET_PAGES = [
  { league: 'wnba',       path: '/en/basketball/wnba/matchups/',                       href: '/basketball/wnba/' },
  { league: 'nba',        path: '/en/basketball/nba/matchups/',                        href: '/basketball/nba/' },
  { league: 'acb',        path: '/en/basketball/spain-acb/matchups/',                  href: '/spain-acb/' },
  { league: 'bbl',        path: '/en/basketball/germany-bbl/matchups/',                href: '/germany-bbl/' },
  { league: 'legaa',      path: '/en/basketball/italy-lega-basket-serie-a/matchups/',  href: '/italy-lega-basket-serie-a/' },
  { league: 'euroleague', path: '/en/basketball/euroleague/matchups/',                 href: '/euroleague/' },
];

async function _scrapePinnacleBasketPage(page, hrefSubstr) {
  await page.waitForSelector(`a[href*="${hrefSubstr}"][href*="-vs-"]`, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  return page.evaluate((sub) => {
    const cls = el => (typeof el.className === 'string' ? el.className : '');
    const txt = el => (el ? el.innerText.trim() : '');
    const flt = s => parseFloat(s);
    const results = [];
    for (const link of document.querySelectorAll(`a[href*="${sub}"][href*="-vs-"]`)) {
      try {
        const labelDivs = [...link.querySelectorAll('div')].filter(el => cls(el).includes('gameInfoLabel'));
        if (labelDivs.length < 2) continue;
        const homeTeam = txt(labelDivs[0]);
        const awayTeam = txt(labelDivs[1]);
        if (!homeTeam || !awayTeam) continue;
        let container = link.parentElement;
        while (container && !container.querySelector('[data-test-id="total"]') && !container.querySelector('[data-test-id="moneyline"]')) {
          container = container.parentElement;
          if (!container || container === document.body) break;
        }
        if (!container) continue;
        const getPrice = btn => {
          const el = [...btn.querySelectorAll('*')].find(e => cls(e).includes('price-'));
          return el ? flt(txt(el)) : NaN;
        };
        let line = NaN, over = NaN, under = NaN;
        const totalEl = container.querySelector('[data-test-id="total"]');
        if (totalEl) {
          const btns = [...totalEl.querySelectorAll('button')].filter(b => cls(b).includes('market-btn'));
          if (btns.length >= 2) {
            const labelEl = [...btns[0].querySelectorAll('*')].find(e => cls(e).includes('label-'));
            line  = labelEl ? flt(txt(labelEl)) : NaN;
            over  = getPrice(btns[0]);
            under = getPrice(btns[1]);
          }
        }
        let h2h = null;
        const mlEl = container.querySelector('[data-test-id="moneyline"]');
        if (mlEl) {
          const btns = [...mlEl.querySelectorAll('button')].filter(b => cls(b).includes('market-btn'));
          if (btns.length >= 2) {
            const home = getPrice(btns[0]);
            const away = getPrice(btns[1]);
            if (!Number.isNaN(home) && !Number.isNaN(away)) h2h = { home, away };
          }
        }
        if ([line, over, under].some(Number.isNaN) && !h2h) continue;
        results.push({ homeTeam, awayTeam, line, over, under, h2h, href: link.getAttribute('href') });
      } catch { /* skip */ }
    }
    return results;
  }, hrefSubstr);
}

// ── Pinnacle player props — scraper page match individuel ─────────────────────
const PINNACLE_PROPS_STAT_MAP = {
  'Points': 'pts', 'Rebounds': 'reb', 'Assists': 'ast',
  '3-Pointers Made': 'tpm', 'Three Pointers Made': 'tpm', 'Three-Pointers Made': 'tpm',
};

async function _scrapePinnacleGameProps(page, gameHref) {
  try {
    const url = `https://www.pinnacle.com${gameHref}`.replace(/\/$/, '') + '/player-props/';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1800);
    const raw = await page.evaluate(() => {
      const cls = el => (typeof el.className === 'string' ? el.className : '');
      const txt = el => (el ? (el.innerText || el.textContent || '').trim() : '');
      const flt = s => parseFloat(s);
      const results = [];
      const getPrice = btn => {
        const el = [...btn.querySelectorAll('*')].find(e => cls(e).includes('price-'));
        return el ? flt(txt(el)) : NaN;
      };
      const getLabel = btn => {
        const el = [...btn.querySelectorAll('*')].find(e => cls(e).includes('label-'));
        return el ? txt(el) : '';
      };
      // Parcourt tous les blocs de marché sur la page
      const marketEls = document.querySelectorAll('[data-test-id]');
      // Cherche les conteneurs de props joueur — structure Pinnacle : un heading avec le nom du joueur
      // puis des sous-sections par stat, chacune avec 2 boutons Over/Under
      const allHeadings = [...document.querySelectorAll('h4, h3, [class*="playerName"], [class*="player-name"]')];
      for (const heading of allHeadings) {
        const playerName = txt(heading);
        if (!playerName || playerName.length < 3 || playerName.length > 40) continue;
        // Le container de ce joueur contient les stats
        let container = heading.parentElement;
        for (let i = 0; i < 4 && container; i++) {
          const btns = [...container.querySelectorAll('button')].filter(b => cls(b).includes('market-btn'));
          if (btns.length >= 2) break;
          container = container.parentElement;
        }
        if (!container) continue;
        // Groupe les boutons par paires Over/Under
        const btns = [...container.querySelectorAll('button')].filter(b => cls(b).includes('market-btn'));
        for (let i = 0; i + 1 < btns.length; i += 2) {
          const lbl0 = getLabel(btns[i]).toLowerCase();
          const lbl1 = getLabel(btns[i + 1]).toLowerCase();
          const lineMatch = lbl0.match(/(\d+\.?\d*)/);
          if (!lineMatch) continue;
          const line = flt(lineMatch[1]);
          const overOdds  = getPrice(btns[0]);
          const underOdds = getPrice(btns[1]);
          if (Number.isNaN(overOdds) || Number.isNaN(underOdds)) continue;
          // Détecte le nom de la stat depuis le texte autour
          let statName = null;
          let statEl = heading.parentElement;
          for (let j = 0; j < 5 && statEl; j++) {
            const t = txt(statEl).toLowerCase();
            if (t.includes('point')) { statName = 'pts'; break; }
            if (t.includes('rebound')) { statName = 'reb'; break; }
            if (t.includes('assist')) { statName = 'ast'; break; }
            if (t.includes('3-point') || t.includes('three')) { statName = 'tpm'; break; }
            statEl = statEl.parentElement;
          }
          if (!statName) continue;
          results.push({ player: playerName, stat: statName, line, over: overOdds, under: underOdds });
        }
      }
      return results;
    });
    return raw;
  } catch (e) {
    return [];
  }
}

let _pinnaclePropsCache = { data: {}, ts: 0 };
const PINNACLE_PROPS_CACHE_MS = 40 * 60 * 1000; // 40 min

async function fetchPinnaclePropsNBA() {
  if (process.env.RENDER === 'true') return _pinnaclePropsCache.data; // Playwright → OOM sur Render free tier
  if (Date.now() - _pinnaclePropsCache.ts < PINNACLE_PROPS_CACHE_MS) return _pinnaclePropsCache.data;
  const { chromium } = await import('playwright');
  const propsData = {}; // clé: "${homeTeam}|${awayTeam}" → [{ player, stat, line, over, under }]
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-US',
    });
    const page = await context.newPage();
    let cookieDismissed = false;
    for (const { league, path, href } of PINNACLE_BASKET_PAGES.filter(p => ['nba', 'wnba'].includes(p.league))) {
      try {
        await page.goto(`https://www.pinnacle.com${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (!cookieDismissed) {
          await page.waitForTimeout(1500);
          const acceptBtn = page.locator('button:has-text("ACCEPT")').first();
          if (await acceptBtn.count() > 0 && await acceptBtn.isVisible().catch(() => false)) {
            await acceptBtn.click({ timeout: 3000 }).catch(() => {});
          }
          cookieDismissed = true;
        } else {
          await page.waitForTimeout(800);
        }
        const matches = await _scrapePinnacleBasketPage(page, href);
        for (const m of matches) {
          if (!m.href) continue;
          await page.waitForTimeout(600);
          const props = await _scrapePinnacleGameProps(page, m.href);
          if (props.length > 0) {
            const key = `${m.homeTeam}|${m.awayTeam}`;
            propsData[key] = props;
            _bgLog.push(`pinnacle props: ${m.homeTeam} vs ${m.awayTeam} (${league}) — ${props.length} lignes`);
          }
        }
      } catch { /* ligue inaccessible */ }
    }
    await page.close().catch(() => {});
  } finally {
    await browser.close().catch(() => {});
  }
  _pinnaclePropsCache = { data: propsData, ts: Date.now() };
  return propsData;
}

async function fetchPinnacleAllBasket() {
  if (Date.now() - _outrightAttempts.pinnacleWnbaTotals < PINNACLE_WNBA_MIN_INTERVAL_MS) return [];
  if (Date.now() < _scraperBlockedUntil.pinnacle_wnba) return [];
  _outrightAttempts.pinnacleWnbaTotals = Date.now();
  _saveOutrightAttempts();

  let callsOk = 0;
  const allMatches = [];
  for (const { id, league } of PINNACLE_BASKET_LEAGUE_IDS) {
    const matches = await _fetchPinnacleLeagueOdds(id, 'basketball')
      .then(r => { callsOk++; return r; })
      .catch(() => []);
    for (const m of matches) allMatches.push({ ...m, league });
  }

  const hasAny = allMatches.length > 0;
  if (!hasAny && callsOk === 0) {
    _scraperFailStreak.pinnacle_wnba = (_scraperFailStreak.pinnacle_wnba || 0) + 1;
    const backoff = Math.min(BK_BACKOFF_BASE_MS * 2 ** (_scraperFailStreak.pinnacle_wnba - 1), BK_BACKOFF_MAX_MS);
    _scraperBlockedUntil.pinnacle_wnba = Date.now() + backoff;
    _saveScraperBlocks();
  } else {
    _scraperFailStreak.pinnacle_wnba = 0;
  }
  return allMatches;
}

// Cache bulk (tous les matchs basket Pinnacle toutes ligues) — un seul scrape alimente toutes les
// recherches par match individuel (_refreshBasketballOdds).
const PINNACLE_WNBA_CACHE_FILE = join(CACHE_DIR, 'pinnacle_wnba_totals.json');
let _pinnacleWnbaCache = { data: [], ts: 0 };
try { if (existsSync(PINNACLE_WNBA_CACHE_FILE)) _pinnacleWnbaCache = JSON.parse(readFileSync(PINNACLE_WNBA_CACHE_FILE, 'utf8')); } catch {}
const _savePinnacleWnbaCache = () => { try { writeFileSync(PINNACLE_WNBA_CACHE_FILE, JSON.stringify(_pinnacleWnbaCache), 'utf8'); } catch {} };

async function getPinnacleAllBasket() {
  if (Date.now() < _scraperBlockedUntil.pinnacle_wnba) return _pinnacleWnbaCache.data;
  if (Date.now() - _pinnacleWnbaCache.ts > ODDS_TTL) {
    const before = _outrightAttempts.pinnacleWnbaTotals;
    const data = await fetchPinnacleAllBasket();
    if (_outrightAttempts.pinnacleWnbaTotals !== before) _updateScraper('pinnacle_wnba', data.length > 0);
    if (data.length) {
      _pinnacleWnbaCache = { data, ts: Date.now() };
      _savePinnacleWnbaCache();
    }
  }
  return _pinnacleWnbaCache.data;
}

// ── Outrights PMU (Premier League, Serie A, NBA, WNBA) ───────────────────────
// PMU utilise aussi le widget Kambi (même que Unibet) mais ici on charge juste la page
// pmu.fr normalement via navigateur — pas d'appel direct à l'API Kambi, donc pas le même
// risque que ce qu'on a évité plus haut. Aucun signe de protection anti-bot constaté
// (24 juin 2026). Ligue 1/La Liga/Bundesliga n'ont pas ce marché chez PMU pour l'instant.
// Deux variantes d'affichage existent : une colonne simple (NBA/WNBA, nom+cote dans le même
// bouton) ou plusieurs colonnes côte à côte (foot, ex: Vainqueur + Top 4) où le nom est dans
// un label séparé et seul le 1er bouton de la ligne correspond au marché "Vainqueur".
const PMU_OUTRIGHT_TARGETS = [
  { key: 'pl',     label: 'Premier League', sport: 'football',   slug: '/sport/football/angleterre/premier-league', titlePattern: 'text=/Vainqueur/i' },
  { key: 'laliga', label: 'La Liga',        sport: 'football',   slug: '/sport/football/espagne/laliga',           titlePattern: 'text=/Vainqueur/i' },
  { key: 'seriea', label: 'Serie A',        sport: 'football',   slug: '/sport/football/italie/serie-a',           titlePattern: 'text=/Vainqueur/i' },
  { key: 'nba',    label: 'NBA',            sport: 'basketball', slug: '/sport/basketball/nba',                     titlePattern: 'text=/Champion NBA/i' },
  { key: 'wnba',   label: 'WNBA',           sport: 'basketball', slug: '/sport/basketball/wnba',                    titlePattern: 'text=/WNBA Champion/i' },
];

const PMU_TEAM_ALIASES = {
  'la clippers': 'los angeles clippers',
  'fc barcelone': 'barcelone',
  'betis séville': 'betis',
  'espanyol barcelone': 'espanyol',
  'inter': 'inter milan',
  'ac milan': 'milan ac',
  'fc séville': 'séville',
  'la corogne': 'deportivo la corogne',
  'venise': 'venezia',
};
const normPmuTeam = s => {
  const lower = (s || '').toLowerCase().trim();
  return PMU_TEAM_ALIASES[lower] || lower;
};

async function _scrapePmuOutrightPage(page, slug, titlePattern) {
  await page.goto(`https://www.pmu.fr${slug}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Le widget Kambi s'hydrate après le chargement initial — sans cette attente, les
  // sélecteurs ci-dessous tournent dans le vide (page encore en cours de rendu JS).
  await page.waitForTimeout(3000);
  const acceptBtn = page.locator('button:has-text("Tout accepter")').first();
  if (await acceptBtn.count() > 0 && await acceptBtn.isVisible().catch(() => false)) {
    await acceptBtn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  // Popup promo "nouveautés" qui peut intercepter les clics — retirée directement par sécurité.
  await page.evaluate(() => { const p = document.getElementById('popin'); if (p) p.remove(); }).catch(() => {});

  let container = page.locator('.KambiBC-sports-hub-bet-offers-view', { has: page.locator(titlePattern) }).first();
  await container.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  if (await container.count() === 0) {
    // Pas affiché par défaut (match du jour visible à la place) — passe sur l'onglet Compétitions.
    const compTab = page.locator('text="Compétitions"').first();
    if (await compTab.count() > 0) {
      await compTab.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1500);
      container = page.locator('.KambiBC-sports-hub-bet-offers-view', { has: page.locator(titlePattern) }).first();
      await container.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    }
  }
  if (await container.count() === 0) return [];

  const seeMore = container.locator('text="Voir plus"');
  if (await seeMore.count() > 0) {
    await seeMore.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }

  // Variante multi-colonnes (label séparé + plusieurs boutons par ligne, seul le 1er = Vainqueur)
  const rows = container.locator('.KambiBC-sports-hub-bet-offers-view__row');
  const rowCount = await rows.count();
  let teams = [];
  if (rowCount > 0) {
    for (let i = 0; i < rowCount; i++) {
      const name = await rows.nth(i).locator('.KambiBC-sports-hub-bet-offers-view__label').innerText().catch(() => '');
      const oddsText = await rows.nth(i).locator('.KambiBC-outcome-button').first().innerText().catch(() => '');
      const odds = parseFloat(oddsText.replace(',', '.').trim());
      if (name && !isNaN(odds)) teams.push({ name: name.trim(), odds });
    }
  } else {
    // Variante simple : nom + cote dans le même bouton (NBA/WNBA)
    const buttons = container.locator('.KambiBC-outcome-button');
    const texts = await buttons.allInnerTexts();
    teams = texts.map(t => {
      const lines = t.split('\n').map(s => s.trim()).filter(Boolean);
      const odds = parseFloat((lines[lines.length - 1] || '').replace(',', '.'));
      const name = lines.slice(0, -1).join(' ');
      return { name, odds };
    }).filter(t => t.name && !isNaN(t.odds));
  }
  return teams.sort((a, b) => a.odds - b.odds);
}

const PMU_OUTRIGHT_MIN_INTERVAL_MS = 15 * 60 * 1000;

async function fetchPmuOutrights() {
  if (process.env.RENDER === 'true') return {}; // Playwright → OOM sur Render free tier
  if (Date.now() - _outrightAttempts.pmu < PMU_OUTRIGHT_MIN_INTERVAL_MS) return {};
  _outrightAttempts.pmu = Date.now();
  _saveOutrightAttempts();

  const { chromium } = await import('playwright');
  const out = {};
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'fr-FR',
    });
    for (const t of PMU_OUTRIGHT_TARGETS) {
      const page = await context.newPage();
      try {
        const teams = await _scrapePmuOutrightPage(page, t.slug, t.titlePattern);
        if (teams.length) out[t.key] = teams;
      } catch {} finally {
        await page.close().catch(() => {});
      }
      await new Promise(res => setTimeout(res, 800));
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const successCount = Object.keys(out).length;
  if (successCount < PMU_OUTRIGHT_TARGETS.length / 2) {
    _scraperFailStreak.pmu = (_scraperFailStreak.pmu || 0) + 1;
    const backoff = Math.min(BK_BACKOFF_BASE_MS * 2 ** (_scraperFailStreak.pmu - 1), BK_BACKOFF_MAX_MS);
    _scraperBlockedUntil.pmu = Date.now() + backoff;
    _saveScraperBlocks();
  } else {
    _scraperFailStreak.pmu = 0;
  }
  return out;
}

const PMU_OUTRIGHTS_CACHE_FILE = join(CACHE_DIR, 'pmu_outrights.json');
let _pmuOutrightsCache = { data: {}, ts: 0 };
try { if (existsSync(PMU_OUTRIGHTS_CACHE_FILE)) _pmuOutrightsCache = JSON.parse(readFileSync(PMU_OUTRIGHTS_CACHE_FILE, 'utf8')); } catch {}
const _savePmuOutrightsCache = () => { try { writeFileSync(PMU_OUTRIGHTS_CACHE_FILE, JSON.stringify(_pmuOutrightsCache), 'utf8'); } catch {} };

async function getPmuOutrights() {
  if (Date.now() < _scraperBlockedUntil.pmu) return _pmuOutrightsCache.data;
  if (Date.now() - _pmuOutrightsCache.ts > OUTRIGHTS_TTL) {
    const data = await fetchPmuOutrights();
    const merged = { ..._pmuOutrightsCache.data, ...data };
    if (Object.keys(merged).length) {
      _pmuOutrightsCache = { data: merged, ts: Date.now() };
      _savePmuOutrightsCache();
    }
  }
  return _pmuOutrightsCache.data;
}

const OUTRIGHTS_TTL = 3 * 60 * 60 * 1000; // 3h — ces cotes bougent lentement, pas besoin du rythme des alertes
let _outrightsCache = { data: {}, ts: 0 };
try { if (existsSync(OUTRIGHTS_CACHE_FILE)) _outrightsCache = JSON.parse(readFileSync(OUTRIGHTS_CACHE_FILE, 'utf8')); } catch {}
const _saveOutrightsCache = () => { try { writeFileSync(OUTRIGHTS_CACHE_FILE, JSON.stringify(_outrightsCache), 'utf8'); } catch {} };

async function getOutrights() {
  // Respecte le même blocage anti-ban que le scraping HTTP classique (fetchBk) — Playwright
  // partage la même IP, donc le même risque. Tant que Betclic est en pause (403/429 détecté
  // ailleurs dans l'app), on ne lance surtout pas de navigateur en plus par-dessus.
  if (Date.now() < _scraperBlockedUntil.betclic) return _outrightsCache.data;
  if (Date.now() - _outrightsCache.ts > OUTRIGHTS_TTL) {
    const data = await fetchBetclicOutrights();
    // Fusionne au lieu de remplacer : si une compétition échoue ce cycle-ci (page lente,
    // bannière cookies récalcitrante...), on garde sa dernière donnée connue plutôt que
    // de la faire disparaître du résultat.
    const merged = { ..._outrightsCache.data, ...data };
    if (Object.keys(merged).length) {
      _outrightsCache = { data: merged, ts: Date.now() };
      _saveOutrightsCache();
    }
  }
  return _outrightsCache.data;
}

// Semaphore — max 4 pages match Betclic simultanées pour BTTS/Buts. Avant ce fix, fetchBetclicOdds
// lançait une page par match CDM en parallèle d'un coup (~40 lors d'une journée chargée) : certaines
// revenaient incomplètes silencieusement (pas un 403/429, donc invisible des compteurs de blocage),
// laissant la moitié des matchs CDM sans BTTS/Buts Betclic alors que le 1X2 (page liste, pas concerné)
// restait bon partout. Même pattern que Bzzoiro (max 4) / api-sports.io basket (max 5).
let _betclicExtrasActive = 0;
const _betclicExtrasQueue = [];
function betclicExtrasRelease() {
  _betclicExtrasActive--;
  if (_betclicExtrasQueue.length > 0) _betclicExtrasQueue.shift()();
}

async function fetchBetclicFootballExtras(href) {
  if (_betclicExtrasActive >= 4) await new Promise(res => _betclicExtrasQueue.push(res));
  _betclicExtrasActive++;
  try {
    const H = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'fr-FR,fr;q=0.9',
    };
    const r = await fetchBk('betclic', `https://www.betclic.fr${href}`, { signal: AbortSignal.timeout(8000), headers: H });
    if (!r.ok) { _bgLog.push(`betclic extras HTTP ${r.status} — ${href}`); return null; }
    const html = await r.text();
    const idx = html.indexOf('"markets":[{');
    if (idx < 0) { _bgLog.push(`betclic extras: pas de bloc "markets" — ${href}`); return null; }
    const pos = idx + '"markets":'.length;
    let depth = 0, end = pos;
    for (let i = 0; i < 500000; i++) {
      const c = html[pos + i];
      if (!c) break;
      if (c === '[') depth++;
      else if (c === ']') { depth--; if (depth === 0) { end = pos + i + 1; break; } }
    }
    const mkts = JSON.parse(html.slice(pos, end));

    let btts = null;
    const bttsMkt = mkts.find(mk => {
      const n = (mk.name ?? '').toLowerCase();
      return n === 'les 2 équipes marquent' || (n.includes('2 équipes marquent') && !n.includes('ou'));
    });
    if (bttsMkt) {
      const rawSels = bttsMkt.selectionMatrix?.[0]?.selections ?? [];
      const sels = rawSels.map(s => s.selectionOneof?.selection ?? s);
      const yesS = sels.find(s => (s.name ?? '').toLowerCase().startsWith('oui'));
      const noS  = sels.find(s => (s.name ?? '').toLowerCase().startsWith('non'));
      if (yesS && noS) btts = { yes: yesS.odds, no: noS.odds };
    }

    // Total de buts — lignes 1.5 et 2.5 (over/under)
    let totals = null;
    const totMkt = mkts.find(mk => mk.name === 'Nombre total de buts');
    if (totMkt) {
      const t = {};
      for (const row of totMkt.selectionMatrix ?? []) {
        const sels = (row.selections ?? []).map(s => s.selectionOneof?.selection ?? s);
        for (const sel of sels) {
          const m = (sel.name ?? '').match(/^([+-]) de (1|2),5$/);
          if (!m) continue;
          const line = `${m[2]}.5`;
          const dir = m[1] === '+' ? 'over' : 'under';
          t[line] = { ...(t[line] || {}), [dir]: sel.odds };
        }
      }
      if (Object.keys(t).length) totals = t;
    }

    // Diagnostic temporaire (24/06) — comprendre pourquoi certains matchs CDM n'ont pas
    // BTTS/Buts Betclic alors que le 1X2 est bon. Log uniquement si un des deux marchés manque.
    if (!bttsMkt || !totMkt) {
      _bgLog.push(`betclic extras incomplet — ${href} | btts=${!!bttsMkt} totals=${!!totMkt} | marchés dispo: ${mkts.map(mk => mk.name).join(' / ')}`);
    }

    return { btts, totals };
  } catch (e) { _bgLog.push(`betclic extras error — ${href} : ${e.message}`); return null; }
  finally { betclicExtrasRelease(); }
}

async function fetchBetclicOdds() {
  const H = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'fr-FR,fr;q=0.9',
  };

  const parsePage = html => {
    const idx = html.indexOf('"matches":[');
    if (idx < 0) return [];
    const pos = idx + '"matches":'.length;
    let depth = 0, end = pos;
    for (let i = 0; i < 300000; i++) {
      const c = html[pos + i];
      if (!c) break;
      if (c === '[') depth++;
      else if (c === ']') { depth--; if (depth === 0) { end = pos + i + 1; break; } }
    }
    try {
      return JSON.parse(html.slice(pos, end));
    } catch { return []; }
  };

  const extractHrefs = html => {
    const out = {};
    for (const m of html.matchAll(/href="(\/football-sfootball\/[^"]*-m(\d+))"/g)) {
      out[m[2]] = m[1];
    }
    return out;
  };

  const pageHtmls = await Promise.all(
    BETCLIC_LEAGUES.map(slug =>
      fetchBk('betclic', `https://www.betclic.fr/football-sfootball/${slug}`, { headers: H, signal: AbortSignal.timeout(8000) })
        .then(r => r.ok ? r.text() : '')
        .catch(() => '')
    )
  );

  const seen = new Set();
  const results = [];
  for (const html of pageHtmls) {
    if (!html) continue;
    const hrefMap = extractHrefs(html);
    for (const m of parsePage(html)) {
      if (!m.contestants || m.contestants.length < 2) continue;
      const homeTeam = m.contestants[0].name;
      const awayTeam = m.contestants[1].name;
      const key = `${homeTeam}|${awayTeam}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sels = m.market?.mainSelections ?? [];
      const drawNames = ['nul', 'draw', 'match nul'];
      const homeSel = sels.find(s => s.name === homeTeam);
      const drawSel = sels.find(s => drawNames.includes(s.name?.toLowerCase()));
      const awaySel = sels.find(s => s.name === awayTeam);
      if (!homeSel || !drawSel || !awaySel) continue;
      const entry = {
        homeTeam,
        awayTeam,
        commenceTime: m.matchDateUtc,
        h2h: { home: homeSel.odds, draw: drawSel.odds, away: awaySel.odds },
        _href: hrefMap[m.matchId] ?? null,
      };
      results.push(entry);
    }
  }

  // Diagnostic temporaire (24/06) — repère les matchs pour lesquels aucun lien individuel
  // n'a été trouvé sur la page de liste (cause possible de BTTS/Buts manquants malgré un 1X2 bon).
  const missingHref = results.filter(r => !r._href);
  if (missingHref.length) {
    _bgLog.push(`betclic: ${missingHref.length}/${results.length} matchs sans href — ${missingHref.map(r => `${r.homeTeam}-${r.awayTeam}`).join(', ')}`);
  }

  // Batch-fetch BTTS + Over/Under depuis les pages match individuelles
  const extrasArr = await Promise.all(results.map(r =>
    r._href ? fetchBetclicFootballExtras(r._href).catch(() => null) : Promise.resolve(null)
  ));
  extrasArr.forEach((extras, i) => {
    if (extras?.btts)   results[i].btts   = extras.btts;
    if (extras?.totals) results[i].totals = extras.totals;
    delete results[i]._href;
  });

  return results;
}

async function fetchWinamaxOdds() {
  if (!WINAMAX_ENABLED) return [];
  const norm = s => s.toLowerCase().replace(/[^a-z]/g, '');
  const H = winamaxHeaders();
  const r = await fetchBk('winamax', 'https://www.winamax.fr/paris-sportifs/sports/1/', { headers: H, signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (!r || !r.ok) return [];
  const html = await r.text();
  const stateMatch = html.match(/PRELOADED_STATE = (\{.*\})/);
  if (!stateMatch) return [];
  const data = JSON.parse(stateMatch[1]);

  const matches   = data.matches   || {};
  const bets      = data.bets      || {};
  const outcomes  = data.outcomes  || {};
  const oddsMap   = data.odds      || {};
  const tournaments = data.tournaments || {};

  const results = [];
  for (const match of Object.values(matches)) {
    if (!match || match.status !== 'PREMATCH') continue;
    const tourney = tournaments[match.tournamentId];
    const tourneyName = tourney?.tournamentName ?? '';
    const isTarget = [...WINAMAX_TARGET_TOURNAMENTS].some(t => tourneyName.startsWith(t));
    if (!isTarget) continue;

    const bet = bets[match.mainBetId];
    if (!bet || bet.template !== '3way') continue;
    const [oc1, ocX, oc2] = bet.outcomes || [];
    const home = +(oddsMap[oc1] ?? 0);
    const draw = +(oddsMap[ocX] ?? 0);
    const away = +(oddsMap[oc2] ?? 0);
    if (!home || !draw || !away) continue;

    results.push({
      homeTeam: match.competitor1Name,
      awayTeam: match.competitor2Name,
      commenceTime: new Date(match.matchStart * 1000).toISOString(),
      matchId: match.matchId,
      h2h: { home, draw, away },
    });
  }

  // Batch-fetch BTTS depuis les pages match individuelles
  const bttsArr = await Promise.all(results.map(r =>
    r.matchId ? fetchWinamaxFootballBtts(r.matchId).catch(() => null) : Promise.resolve(null)
  ));
  bttsArr.forEach((btts, i) => { if (btts) results[i].btts = btts; });

  return results;
}

async function fetchWinamaxFootballBtts(matchId) {
  if (!WINAMAX_ENABLED) return null;
  const H = winamaxHeaders('https://www.winamax.fr/paris-sportifs/sports/1/');
  const r = await fetchBk('winamax', `https://www.winamax.fr/paris-sportifs/match/${matchId}`, { headers: H, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r || !r.ok) return null;
  const html = await r.text();
  const stateMatch = html.match(/PRELOADED_STATE = (\{.*\})/);
  if (!stateMatch) return null;
  const data = JSON.parse(stateMatch[1]);
  const bets = data.bets || {};
  const oddsMap = data.odds || {};
  const outcomeMap = data.outcomes || {};
  for (const bet of Object.values(bets)) {
    const title = (bet.betTitle || '').toLowerCase();
    const isPureBtts = title === 'les 2 équipes marquent' || (title.includes('btts') && !title.includes(' et ') && !title.includes('mi-temps'));
    if (!isPureBtts) continue;
    const [oc1, oc2] = bet.outcomes || [];
    const lbl1 = (outcomeMap[String(oc1)]?.label ?? '').toLowerCase();
    const lbl2 = (outcomeMap[String(oc2)]?.label ?? '').toLowerCase();
    const odds1 = oddsMap[String(oc1)];
    const odds2 = oddsMap[String(oc2)];
    const yes = lbl1.includes('oui') ? odds1 : lbl2.includes('oui') ? odds2 : null;
    const no  = lbl1.includes('non') ? odds1 : lbl2.includes('non') ? odds2 : null;
    if (yes && no) return { yes: +yes.toFixed(3), no: +no.toFixed(3) };
  }
  return null;
}

async function fetchUnibetFootballOdds() {
  const H = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'fr-FR,fr;q=0.9',
  };
  const price = s => parseFloat((s || '0').replace(',', '.'));

  // 1. Scrape la page principale foot pour avoir tous les matchs disponibles
  const mainHtml = await fetchBk('unibet', 'https://www.unibet.fr/paris-football', { headers: H, signal: AbortSignal.timeout(10000) })
    .then(r => r.ok ? r.text() : '').catch(() => '');
  const matchPaths = [...new Set(
    [...mainHtml.matchAll(/href="(\/paris-football\/[^"]*\/\d+\/[^"#]+)"/g)].map(m => m[1])
      .filter(p => !p.includes('cotes-boostees'))
  )];

  if (!matchPaths.length) return [];

  // 2. Fetch all match pages in parallel
  const matchHtmls = await Promise.all(
    matchPaths.map(p => fetchBk('unibet', `https://www.unibet.fr${p}`, { headers: H, signal: AbortSignal.timeout(10000) }).then(r => r.status !== 404 ? r.text() : '').catch(() => ''))
  );

  // 3. Parse h2h from groupedMarkets
  const results = [];
  const extractGM = html => {
    const key = '"groupedMarkets":[';
    const idx = html.indexOf(key);
    if (idx < 0) return null;
    const pos = idx + key.length - 1;
    let depth = 0, end = pos;
    for (let i = 0; i < 3000000; i++) {
      const c = html[pos + i]; if (!c) break;
      if (c === '[') depth++; else if (c === ']') { depth--; if (depth === 0) { end = pos + i + 1; break; } }
    }
    try { return JSON.parse(html.slice(pos, end)); } catch { return null; }
  };

  for (const mHtml of matchHtmls) {
    if (!mHtml) continue;
    const gm = extractGM(mHtml);
    if (!gm) continue;
    const h2hGroup = gm.find(g => g.description?.includes('1 N 2') && g.description?.includes('90'));
    if (!h2hGroup) continue;
    const outs = h2hGroup.markets?.[0]?.outcomes ?? [];
    if (outs.length < 3) continue;
    const drawOut = outs.find(o => o.description === 'N');
    const teamOuts = outs.filter(o => o.description !== 'N');
    if (!drawOut || teamOuts.length < 2) continue;
    const homeOut = teamOuts[0];
    const awayOut = teamOuts[1];
    const eventDesc = homeOut.eventDesc ?? '';
    const [homeTeam, awayTeam] = eventDesc.includes(' vs ') ? eventDesc.split(' vs ') : [homeOut.description, awayOut.description];

    const entry = {
      homeTeam: homeTeam.trim(),
      awayTeam: awayTeam.trim(),
      commenceTime: null,
      h2h: { home: price(homeOut.price), draw: price(drawOut.price), away: price(awayOut.price) },
    };

    // BTTS — cherche dans les groupedMarkets
    const bttsGroup = gm.find(g => {
      const d = (g.description ?? '').toLowerCase();
      return d.includes('deux équipes') || d.includes('2 équipes') || d.includes('btts');
    });
    if (bttsGroup) {
      const bOuts = bttsGroup.markets?.[0]?.outcomes ?? [];
      const yesOut = bOuts.find(o => (o.description ?? '').toLowerCase().match(/^oui|^yes/));
      const noOut  = bOuts.find(o => (o.description ?? '').toLowerCase().match(/^non|^no/));
      if (yesOut && noOut) entry.btts = { yes: price(yesOut.price), no: price(noOut.price) };
    }

    // Total de buts — lignes 1.5 et 2.5 (over/under)
    const totalsGroup = gm.find(g => g.description === 'Plus / Moins Buts - 90 Mins');
    if (totalsGroup) {
      const totals = {};
      for (const sub of totalsGroup.markets ?? []) {
        const dm = (sub.description ?? '').match(/^Plus \/ Moins (1|2)\.5 But/);
        if (!dm) continue;
        const line = `${dm[1]}.5`;
        for (const o of sub.outcomes ?? []) {
          const om = (o.description ?? '').match(/^(Plus|Moins) (1|2)\.5$/);
          if (!om) continue;
          const dir = om[1] === 'Plus' ? 'over' : 'under';
          totals[line] = { ...(totals[line] || {}), [dir]: price(o.price) };
        }
      }
      if (Object.keys(totals).length) entry.totals = totals;
    }

    results.push(entry);
  }
  return results;
}

// ── Betclic gRPC-Web player props ────────────────────────────────────────────

function _pbVarint(n) {
  let v = typeof n === 'bigint' ? n : BigInt(Math.floor(n));
  const b = [];
  while (v > 127n) { b.push(Number((v & 0xffn) | 0x80n)); v >>= 7n; }
  b.push(Number(v & 0x7fn));
  return Buffer.from(b);
}
function _pbTag(fn, wt) { return _pbVarint((BigInt(fn) << 3n) | BigInt(wt)); }
function _pbLen(fn, data) { const d = typeof data === 'string' ? Buffer.from(data,'utf8') : data; return Buffer.concat([_pbTag(fn,2), _pbVarint(d.length), d]); }
function _pbV64(fn, val) { return Buffer.concat([_pbTag(fn,0), _pbVarint(val)]); }
function _grpcFrame(p) { const h = Buffer.alloc(5); h.writeUInt32BE(p.length,1); return Buffer.concat([h,p]); }

function _pbFields(buf) {
  const fields = []; let i = 0;
  while (i < buf.length) {
    let tag = 0n, shift = 0n;
    while (i < buf.length) { const b = buf[i++]; tag |= BigInt(b & 0x7f) << shift; shift += 7n; if (!(b & 0x80)) break; }
    const wt = Number(tag & 7n), fn = Number(tag >> 3n);
    if (wt === 0) {
      let v = 0n; shift = 0n;
      while (i < buf.length) { const b = buf[i++]; v |= BigInt(b & 0x7f) << shift; shift += 7n; if (!(b & 0x80)) break; }
      fields.push({ fn, wt, v });
    } else if (wt === 1) {
      if (i + 8 > buf.length) break;
      fields.push({ fn, wt, v: buf.readDoubleLE(i) }); i += 8;
    } else if (wt === 2) {
      let len = 0n; shift = 0n;
      while (i < buf.length) { const b = buf[i++]; len |= BigInt(b & 0x7f) << shift; shift += 7n; if (!(b & 0x80)) break; }
      const l = Number(len); if (i + l > buf.length) break;
      fields.push({ fn, wt, v: buf.subarray(i, i + l) }); i += l;
    } else if (wt === 5) {
      if (i + 4 > buf.length) break;
      fields.push({ fn, wt, v: buf.readFloatLE(i) }); i += 4;
    } else break;
  }
  return fields;
}

async function _betclicGrpcCategory(matchIdStr, categoryId) {
  const proto = Buffer.concat([_pbV64(1, BigInt(matchIdStr)), _pbLen(2,'fr'), _pbLen(3, categoryId)]);
  const ctrl = new AbortController();
  const resp = await fetch(
    'https://offering.begmedia.com/web/offering.access.api/offering.access.api.MatchService/GetMatchWithNotification',
    { method:'POST', headers:{ 'Content-Type':'application/grpc-web+proto', 'Accept':'application/grpc-web+proto', 'x-grpc-web':'1', 'X-BG-REGULATION':'FR', 'X-BG-Ref-Brand':'BETCLIC', 'X-BG-Ref-Regulator-Zone':'FR', 'X-BG-Ref-Platform':'DESKTOP', 'ngsw-bypass':'1', 'Origin':'https://www.betclic.fr', 'Referer':'https://www.betclic.fr/' }, body: _grpcFrame(proto), signal: ctrl.signal }
  );
  if (!resp.ok) return {};

  // Server-streaming: read chunks until first complete message frame, then stop
  // node-fetch v3 returns a Node.js Readable — use for-await, not getReader()
  const chunks = [];
  let totalLen = 0;
  let frameLen = -1;
  const tRead = setTimeout(() => { try { resp.body.destroy(); } catch {} }, 8000);
  try {
    for await (const value of resp.body) {
      const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
      chunks.push(buf);
      totalLen += buf.length;
      if (frameLen < 0 && totalLen >= 5) {
        frameLen = Buffer.concat(chunks).readUInt32BE(1) + 5;
      }
      if (frameLen > 0 && totalLen >= frameLen) { break; }
    }
  } catch {}
  clearTimeout(tRead);

  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks);
  if (raw.length < 5) return {};

  // outer → GetMatchPayload (f1) → Match (f1) → SubCategoryWithMarkets[] (f11) → Market[] (f3)
  const payloadBuf = _pbFields(raw.subarray(5)).find(f => f.fn===1 && f.wt===2)?.v;
  if (!payloadBuf) return {};
  const matchBuf = _pbFields(payloadBuf).find(f => f.fn===1 && f.wt===2)?.v;
  if (!matchBuf) return {};

  const ouByPlayer = {};
  const milestonesByPlayer = {};
  for (const scF of _pbFields(matchBuf).filter(f => f.fn===11 && f.wt===2)) {
    for (const mkF of _pbFields(scF.v).filter(f => f.fn===3 && f.wt===2)) {
      const mkF2 = _pbFields(mkF.v);
      const mkName = mkF2.find(f => f.fn===2 && f.wt===2)?.v?.toString('utf8') ?? '';
      const mkLow = mkName.toLowerCase();
      const isPlusMoins = mkLow.includes('plus/moins') || mkLow.includes('plus ou moins');
      const isRebPaliers = mkLow.includes('paliers') && mkLow.includes('rebond');
      const isAstPaliers = mkLow.includes('paliers') && (mkLow.includes('passe') || mkLow.includes('assist'));
      const isPtsPaliers = mkLow.includes('paliers') && (mkLow.includes('point') || mkLow.includes('marqueur')) && !isRebPaliers && !isAstPaliers;
      const isTpmPaliers = mkLow.includes('paniers à 3 points') || mkLow.includes('paniers a 3 points');
      const milestoneKey = mkLow.includes('triple double') ? 'td' : mkLow.includes('double double') ? 'dd' : null;

      if (milestoneKey) {
        // f10 path: bare player name + single odds value (binary "double-double oui/non")
        for (const nsWrap of mkF2.filter(f => f.fn===10 && f.wt===2)) {
          for (const nsF of _pbFields(nsWrap.v).filter(f => f.fn===1 && f.wt===2)) {
            const selBuf = _pbFields(nsF.v).find(f => f.fn===1 && f.wt===2)?.v;
            if (!selBuf) continue;
            const selF = _pbFields(selBuf);
            const name = selF.find(f => f.fn===10 && f.wt===2)?.v?.toString('utf8')
                      ?? selF.find(f => f.fn===11 && f.wt===2)?.v?.toString('utf8');
            const odds = selF.find(f => f.fn===12 && f.wt===1)?.v;
            if (!name || !odds) continue;
            const player = name.trim();
            if (!milestonesByPlayer[player]) milestonesByPlayer[player] = {};
            milestonesByPlayer[player][milestoneKey] = odds;
          }
        }
        continue;
      }

      if (!isPlusMoins && !isRebPaliers && !isAstPaliers && !isPtsPaliers && !isTpmPaliers) continue;

      const statKey = isPlusMoins
        ? (mkLow.includes('passes') ? 'ast' : mkLow.includes('rebond') ? 'reb' : 'pts')
        : isRebPaliers ? 'reb' : isAstPaliers ? 'ast' : isTpmPaliers ? 'tpm' : 'pts';

      if (isPlusMoins) {
        // f10 path: over/under pairs — "Player + de X,Y" / "Player - de X,Y"
        for (const nsWrap of mkF2.filter(f => f.fn===10 && f.wt===2)) {
          for (const nsF of _pbFields(nsWrap.v).filter(f => f.fn===1 && f.wt===2)) {
            const selBuf = _pbFields(nsF.v).find(f => f.fn===1 && f.wt===2)?.v;
            if (!selBuf) continue;
            const selF = _pbFields(selBuf);
            const name = selF.find(f => f.fn===10 && f.wt===2)?.v?.toString('utf8')
                      ?? selF.find(f => f.fn===11 && f.wt===2)?.v?.toString('utf8');
            const odds = selF.find(f => f.fn===12 && f.wt===1)?.v;
            if (!name || !odds) continue;
            const m = name.match(/^(.+?)\s*([-–+]|Plus|Moins)\s*de\s*([\d,.]+)/i);
            if (!m) continue;
            const player = m[1].trim();
            const line = parseFloat(m[3].replace(',', '.'));
            const isOver = m[2] === '+' || /plus/i.test(m[2]);
            if (!ouByPlayer[player]) ouByPlayer[player] = {};
            if (!ouByPlayer[player][statKey]) ouByPlayer[player][statKey] = {};
            if (!ouByPlayer[player][statKey][line]) ouByPlayer[player][statKey][line] = {};
            if (isOver) ouByPlayer[player][statKey][line].over = odds;
            else ouByPlayer[player][statKey][line].under = odds;
          }
        }
      } else {
        // f15 path: paliers (over only) — f15=player row, f3=line entry, f2>f1=selection
        for (const f15 of mkF2.filter(f => f.fn===15 && f.wt===2)) {
          const f15f = _pbFields(f15.v);
          const playerName = f15f.find(f => f.fn===1 && f.wt===2)?.v?.toString('utf8');
          if (!playerName) continue;
          for (const f3 of f15f.filter(f => f.fn===3 && f.wt===2)) {
            const f3f = _pbFields(f3.v);
            const line = f3f.find(f => f.fn===1 && f.wt===1)?.v;
            const f2buf = f3f.find(f => f.fn===2 && f.wt===2)?.v;
            if (!f2buf || line == null) continue;
            const selBuf = _pbFields(f2buf).find(f => f.fn===1 && f.wt===2)?.v;
            if (!selBuf) continue;
            const odds = _pbFields(selBuf).find(f => f.fn===12 && f.wt===1)?.v;
            if (!odds) continue;
            if (!ouByPlayer[playerName]) ouByPlayer[playerName] = {};
            if (!ouByPlayer[playerName][statKey]) ouByPlayer[playerName][statKey] = {};
            if (!ouByPlayer[playerName][statKey][line]) ouByPlayer[playerName][statKey][line] = {};
            ouByPlayer[playerName][statKey][line].over = odds;
          }
        }
      }
    }
  }

  const result = {};
  for (const [pn, stats] of Object.entries(ouByPlayer)) {
    result[pn] = {};
    for (const [sk, lines] of Object.entries(stats))
      result[pn][sk] = Object.entries(lines).map(([l,v]) => ({ line: parseFloat(l), ...v })).sort((a,b) => a.line - b.line);
  }
  return { ou: result, milestones: milestonesByPlayer };
}

async function fetchBetclicPlayerProps(home, away, league = 'nba') {
  try {
    const H = { 'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept-Language':'fr-FR,fr;q=0.9' };
    const leagueSlugs = await _betclicLeagueSlugs(league, H);
    if (!leagueSlugs.length) return { ou: {}, brand: null };
    const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-+$/,'');
    const lwrd = s => (s||'').trim().split(' ').pop();
    const JUNK_BC = new Set(['bc','basket','basketball','beko','club']);
    const elKeyBc = n => { const p=(n||'').trim().split(/\s+/); const l=p[p.length-1].toLowerCase(); return JUNK_BC.has(l)&&p.length>1?p.slice(0,-1).join(''):n; };
    const IS_EU_PROPS = league === 'euroleague' || ['acb','lnb','bbl','legaa'].includes(league);
    const EU_PRE_BP = new Set(['fc','ucam','bc','sk','sg','bbc','rb','la','olimpia','ea7','emporio','armani','germani','bertram','derthona','dolomiti','energia','umana','reyer','olidata','pompea']); const EU_SUF_BP = new Set(['basket','baskets','basketball','beko','club','bc']);
    const euCoreBp = n => { const ws=(n||'').toLowerCase().split(/[^a-z]+/).filter(Boolean); let s=0,e=ws.length; while(s<e-1&&EU_PRE_BP.has(ws[s]))s++; while(e>s+1&&EU_SUF_BP.has(ws[e-1]))e--; return ws.slice(s,e).join(''); };
    const BC_FR_ALIASES_P = { venezia: 'venise', zaragoza: 'saragosse', sevilla: 'seville' };
    const homeBase = IS_EU_PROPS ? (BC_FR_ALIASES_P[euCoreBp(home)] ?? euCoreBp(home)) : lwrd(home);
    const awayBase = IS_EU_PROPS ? (BC_FR_ALIASES_P[euCoreBp(away)] ?? euCoreBp(away)) : lwrd(away);
    const homeSlug = slugify(homeBase).replace(/-/g,'').slice(0, IS_EU_PROPS ? 5 : 6);
    const awaySlug = slugify(awayBase).replace(/-/g,'').slice(0, IS_EU_PROPS ? 5 : 6);

    let matchPath = null;
    for (const slug of leagueSlugs) {
      const lr = await fetchBk('betclic', `https://www.betclic.fr/${slug}`, { headers: H, signal: AbortSignal.timeout(8000) }).catch(() => null);
      if (!lr?.ok) continue;
      const lHtml = await lr.text();
      const hrefs = [...lHtml.matchAll(/href="(\/basketball[^"]*-m\d+)"/g)].map(m => m[1]);
      matchPath = hrefs.find(h => { const c = h.replace(/-/g,''); return c.includes(homeSlug) && c.includes(awaySlug); });
      if (matchPath) break;
    }
    if (!matchPath) return { ou: {}, brand: null };

    const midM = matchPath.match(/-m(\d+)$/);
    if (!midM) return { ou: {}, brand: null };
    const matchIdStr = midM[1];

    const [ptsCat, astCat] = await Promise.all([
      _betclicGrpcCategory(matchIdStr, 'ca_bkb_scrs').catch(() => ({ ou: {}, milestones: {} })),
      _betclicGrpcCategory(matchIdStr, 'ca_bkb_pprp').catch(() => ({ ou: {}, milestones: {} })),
    ]);
    const ptsP = ptsCat?.ou ?? {};
    const astP = astCat?.ou ?? {};
    const milestones = astCat?.milestones ?? {};

    const ou = {};
    for (const [n, s] of Object.entries(ptsP)) { ou[n] = { ...ou[n], ...s }; }
    for (const [n, s] of Object.entries(astP)) {
      const key = Object.keys(ou).find(k => k.toLowerCase() === n.toLowerCase()) ?? n;
      ou[key] = { ...ou[key], ...s };
    }

    // Fallback HTML pour les ligues où gRPC ne retourne rien (ex: Lega A)
    if (!Object.keys(ou).length) {
      try {
        const mR = await fetchBk('betclic', `https://www.betclic.fr${matchPath}`, { headers: H, signal: AbortSignal.timeout(8000) });
        if (mR.ok) {
          const mHtml = await mR.text();
          const mkIdx = mHtml.indexOf('markets\":[');
          if (mkIdx >= 0) {
            const pos2 = mkIdx + 'markets\":'.length;
            let d2 = 0, end2 = pos2;
            for (let i = 0; i < 2000000; i++) {
              const c = mHtml[pos2 + i];
              if (!c) break;
              if (c === '[') d2++;
              else if (c === ']') { d2--; if (d2 === 0) { end2 = pos2 + i + 1; break; } }
            }
            let mkList2 = [];
            try { mkList2 = JSON.parse(mHtml.slice(pos2, end2)); } catch {}
            const STAT_MAP = [
              { key: 'pts', re: /point.*plus.moins|plus.moins.*point/i },
              { key: 'reb', re: /rebond.*plus.moins|plus.moins.*rebond/i },
              { key: 'ast', re: /passe.*plus.moins|plus.moins.*passe|assist.*plus.moins/i },
            ];
            const ouRaw = {};
            for (const mk of mkList2) {
              const skEntry = STAT_MAP.find(({ re }) => re.test(mk.name || ''));
              if (!skEntry) continue;
              const sk = skEntry.key;
              for (const row of mk.selectionMatrix || []) {
                for (const sw of row.selections || []) {
                  const sel = sw.selectionOneof?.selection ?? sw;
                  const sname = sel.name || '';
                  const odds = sel.odds;
                  if (!sname || !odds) continue;
                  const m2 = sname.match(/^(.+?)\s*([+\-])\s*de\s*([\d,\.]+)/i);
                  if (!m2) continue;
                  const player = m2[1].trim();
                  const isOver = m2[2] === '+';
                  const line = parseFloat(m2[3].replace(',', '.'));
                  if (!ouRaw[player]) ouRaw[player] = {};
                  if (!ouRaw[player][sk]) ouRaw[player][sk] = {};
                  if (!ouRaw[player][sk][line]) ouRaw[player][sk][line] = {};
                  if (isOver) ouRaw[player][sk][line].over = odds;
                  else ouRaw[player][sk][line].under = odds;
                }
              }
            }
            // Convertir au format attendu { player: { pts: [{line, over, under}] } }
            for (const [pn, stats] of Object.entries(ouRaw)) {
              ou[pn] = {};
              for (const [sk, lines] of Object.entries(stats)) {
                ou[pn][sk] = Object.entries(lines)
                  .map(([l, v]) => ({ line: parseFloat(l), ...v }))
                  .sort((a, b) => a.line - b.line);
              }
            }
          }
        }
      } catch {}
    }

    // "Performance (pts+reb+pas) du joueur" — ladder Over uniquement (sliders par seuil), cotes brutes
    let praLadders = {};
    try {
      const mR2 = await fetchBk('betclic', `https://www.betclic.fr${matchPath}`, { headers: H, signal: AbortSignal.timeout(8000) });
      if (mR2.ok) {
        const mHtml2 = await mR2.text();
        const mkIdx2 = mHtml2.indexOf('markets":[');
        if (mkIdx2 >= 0) {
          const pos3 = mkIdx2 + 'markets":'.length;
          let d3 = 0, end3 = pos3;
          for (let i = 0; i < 2000000; i++) {
            const c = mHtml2[pos3 + i];
            if (!c) break;
            if (c === '[') d3++;
            else if (c === ']') { d3--; if (d3 === 0) { end3 = pos3 + i + 1; break; } }
          }
          let mkList3 = [];
          try { mkList3 = JSON.parse(mHtml2.slice(pos3, end3)); } catch {}
          const praMk = mkList3.find(mk => mk.name === 'Performance (pts+reb+pas) du joueur');
          for (const sl of praMk?.sliders || []) {
            const name = sl.name?.trim();
            if (!name) continue;
            const lines = [];
            for (const sv of sl.sliderValues || []) {
              const sel = sv.selections?.[0]?.selectionOneof?.selection;
              if (sel?.odds && sv.value != null) lines.push({ line: sv.value, over: sel.odds });
            }
            if (lines.length) praLadders[name] = lines.sort((a, b) => a.line - b.line);
          }
        }
      }
    } catch {}

    return { ou, brand: Object.keys(ou).length ? 'betclic' : null, praLadders, milestones };
  } catch (err) {
    console.error('betclic player props:', err.message);
    return { ou: {}, brand: null, milestones: {} };
  }
}

// ── Basketball player props (Unibet + Winamax scraping) ────────────────
app.get('/api/basketball/player-props', async (req, res) => {
  const { league = 'nba', home = '', away = '', date = '' } = req.query;
  if (!home || !away) return res.status(400).json({ error: 'home and away required' });

  // Inclure la date dans la clé → chaque match a son propre cache (évite la réutilisation inter-matchs)
  const dateKey = date ? date.slice(0, 10) : '';
  const cacheKey = `bball_pprops3_${league}_${home}_${away}${dateKey ? '_' + dateKey : ''}`.toLowerCase().replace(/\s+/g, '_');
  const cached = _espnCache[cacheKey];

  // Match commencé : lignes joueurs figées (même logique que /api/basketball/odds pour
  // Résultat/Points) — avant ce fix, l'onglet Joueurs continuait de re-scraper en live même
  // une fois le match lancé, et les bookmakers retirent presque toutes leurs lignes joueurs
  // en live → la page finissait par n'afficher que 1-2 lignes résiduelles au lieu de la photo
  // d'avant-match (cas réel : ACB Barcelone-Valence, 22 juin 2026). snapshotKey sans suffixe
  // date car c'est la clé utilisée par les jobs d'alertes en arrière-plan qui alimentent déjà
  // _linesSnapshot pour ce match avant le coup d'envoi.
  const matchStarted = date && new Date(date).getTime() < Date.now();
  if (matchStarted && cached?.data) return res.json(cached.data);
  if (matchStarted) {
    const snapshotKey = `bball_pprops3_${league}_${home}_${away}`.toLowerCase().replace(/\s+/g, '_');
    const snap = _linesSnapshot[snapshotKey];
    if (snap?.data?.found) return res.json(snap.data);
  }

  const EU_LEAGUES_SET = new Set(['acb','lnb','bbl','legaa','euroleague']);
  const cacheStaleTeam = cached && EU_LEAGUES_SET.has(league) && cached.data?.found && Object.keys(cached.data?.teamMap || {}).length === 0;
  // Cache court (5min) si un bookmaker manquant mais d'autres présents → pas encore scrapé au moment du cache
  const winamaxMissing = cached && !cached.data?.winamaxSource && (cached.data?.unibetSource || cached.data?.betclicSource);
  const betclicMissing = cached && !cached.data?.betclicSource && (cached.data?.unibetSource || cached.data?.winamaxSource);
  const unibetMissing  = cached && !cached.data?.unibetSource  && (cached.data?.betclicSource || cached.data?.winamaxSource);
  const cacheTTL = (winamaxMissing || betclicMissing || unibetMissing) ? 5 * 60 * 1000 : 30 * 60 * 1000;
  const cacheStale = cacheStaleTeam;
  if (cached && !req.query.refresh && !cacheStale && Date.now() - cached.ts < cacheTTL) return res.json(cached.data);

  // Cache présent (même périmé au-delà du TTL) : on le sert tel quel et on rafraîchit en
  // arrière-plan (évite le scraping + jitter sur le chemin de la requête)
  if (cached && !req.query.refresh && !cacheStale) {
    _refreshInBackground(cacheKey, () => _refreshPlayerProps(league, home, away, cacheKey, cached));
    return res.json(cached.data);
  }

  try {
    return res.json(await _refreshPlayerProps(league, home, away, cacheKey, cached));
  } catch (err) {
    console.error('basketball player-props:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function _refreshPlayerProps(league, home, away, cacheKey, cached) {
  const pickMainLine = (lines, refLine) => {
    if (!lines?.length) return null;
    if (refLine != null) return lines.reduce((b, t) => Math.abs(t.line - refLine) < Math.abs(b.line - refLine) ? t : b);
    return lines.reduce((b, t) => {
      const balT = t.over && t.under ? Math.abs(1/t.over - 1/t.under) : 99;
      const balB = b.over && b.under ? Math.abs(1/b.over - 1/b.under) : 99;
      return balT < balB ? t : b;
    });
  };

  // Fusionne deux listes de lignes (avec/sans Under) par seuil — pour la page "toutes les lignes"
  const mergeLineArrays = (primary = [], ladder = []) => {
    const byLine = new Map();
    for (const l of primary) byLine.set(l.line, { line: l.line, over: l.over ?? null, under: l.under ?? null });
    for (const l of ladder) {
      const ex = byLine.get(l.line);
      if (ex) { if (ex.over == null) ex.over = l.over; }
      else byLine.set(l.line, { line: l.line, over: l.over, under: null });
    }
    return [...byLine.values()].sort((a, b) => a.line - b.line);
  };

  {
    // Unibet + Winamax + Betclic in parallel
    const [ubData, wmBasketMatches, bcData] = await Promise.all([
      fetchUnibetBasketData(home, away, league).catch(() => null),
      fetchWinamaxBasketOdds(league).catch(() => []),
      fetchBetclicPlayerProps(home, away, league).catch(() => ({ ou: {}, brand: null })),
    ]);

    // Tracking santé scrapers — "ok" = le scraper a renvoyé des données exploitables pour ce match
    // (pas seulement des props joueurs au format Plus/Moins, qui ne sont pas toujours disponibles)
    _updateScraper('unibet', ubData != null && (
      Object.keys(ubData?.players ?? {}).length > 0 ||
      Object.keys(ubData?.perfLadders ?? {}).length > 0 ||
      ubData?.h2h != null || ubData?.totals != null
    ));
    _updateScraper('betclic', bcData != null && (
      Object.keys(bcData?.ou ?? {}).length > 0 ||
      Object.keys(bcData?.praLadders ?? {}).length > 0 ||
      Object.keys(bcData?.milestones ?? {}).length > 0
    ));
    _updateScraper('winamax', Array.isArray(wmBasketMatches) && wmBasketMatches.length > 0);

    // Find Winamax matchId for this game
    const norm  = s => (s || '').toLowerCase().replace(/[^a-z]/g, '');
    const fuzzy = (a, b) => { if (!a || !b) return false; const na = norm(a), nb = norm(b); return na.includes(nb) || nb.includes(na); };
    const lwrd  = s => (s || '').trim().split(' ').pop();
    // EL teams: strip junk suffixes + prefix match (handles Olympiakos vs Olympiacos, Valence vs Valencia)
    const JUNK_WDS = new Set(['bc', 'basket', 'basketball', 'beko', 'club']);
    const elKey = name => { const p = (name||'').trim().split(/\s+/); const last = p[p.length-1].toLowerCase(); return norm(JUNK_WDS.has(last) && p.length>1 ? p.slice(0,-1).join('') : name); };
    const fuzzyPrefix = (a, b, n=6) => { const na=norm(a), nb=norm(b); if(na.includes(nb)||nb.includes(na)) return true; if(na.length>=n&&nb.length>=n&&na.slice(0,n)===nb.slice(0,n)) return true; return false; };
    const EU_PRE_P = new Set(['fc','ucam','bc','sk','sg','bbc','rb','la','olimpia','ea7','emporio','armani','germani','bertram','derthona','dolomiti','energia','umana','reyer','olidata']); const EU_SUF_P = new Set(['basket','baskets','basketball','beko','club','bc']);
    const euCoreP = n => { const ws=(n||'').toLowerCase().split(/[^a-z]+/).filter(Boolean); let s=0,e=ws.length; while(s<e-1&&EU_PRE_P.has(ws[s]))s++; while(e>s+1&&EU_SUF_P.has(ws[e-1]))e--; return ws.slice(s,e).join(''); };
    // Traduction noms français → italien (Winamax/Betclic utilisent les noms FR pour Lega A)
    const LEGAA_FR_IT = { venise:'venezia', bologne:'bologna', milan:'milano', naples:'napoli', trente:'trento', sienne:'sienne', florence:'firenze', turin:'torino', genes:'genova' };
    const normLegaa = n => { let c = euCoreP(n); for (const [fr,it] of Object.entries(LEGAA_FR_IT)) if (c.includes(fr)) { c = c.replace(fr, it); break; } return c; };
    const EURO_BBALL_P = new Set(['acb','lnb','bbl','legaa']);
    const matchTeam = (wmName, ourName) => {
      if (league === 'euroleague') return fuzzyPrefix(wmName, elKey(ourName));
      if (league === 'legaa') { const ma=normLegaa(wmName),mb=normLegaa(ourName); return ma.includes(mb)||mb.includes(ma)||(ma.length>=5&&mb.length>=5&&ma.slice(0,5)===mb.slice(0,5)); }
      if (EURO_BBALL_P.has(league)) { const ma=euCoreP(wmName),mb=euCoreP(ourName); return ma.includes(mb)||mb.includes(ma)||(ma.length>=5&&mb.length>=5&&ma.slice(0,5)===mb.slice(0,5)); }
      return fuzzy(wmName, lwrd(ourName));
    };
    const wmMatch = wmBasketMatches.find(m => matchTeam(m.homeTeam, home) && matchTeam(m.awayTeam, away));
    const wmDetails = wmMatch?.matchId ? await fetchWinamaxMatchDetails(wmMatch.matchId).catch(() => null) : null;
    const wmPlayers = wmDetails?.players ?? {};
    const ubPlayers = ubData?.players ?? {};

    // Merge all players from all sources
    const players = {};

    // Unibet from scraping
    for (const [name, stats] of Object.entries(ubPlayers)) {
      if (!players[name]) players[name] = {};
      players[name].unibet = {};
      if (stats.pts) players[name].unibet.pts = stats.pts;
      if (stats.reb) players[name].unibet.reb = stats.reb;
      if (stats.ast) players[name].unibet.ast = stats.ast;
      if (stats.tpm) players[name].unibet.tpm = stats.tpm;
    }

    // Winamax from match page
    const nameMatch = (a, b) => {
      if (!a || !b) return false;
      // Normalise les apostrophes (ex. "A'ja Wilson" vs "Aja Wilson") — sinon le bookmaker
      // qui omet l'apostrophe crée une fiche joueur séparée et fragmente les cotes
      const stripApos = n => n.replace(/['']/g, '');
      a = stripApos(a); b = stripApos(b);
      if (a.toLowerCase() === b.toLowerCase()) return true;
      const parse = n => {
        n = n.trim();
        if (!/\s/.test(n)) { const d = n.indexOf('.'); return d > 0 ? { first: n.slice(0, d), last: n.slice(d + 1) } : { first: '', last: n }; }
        const parts = n.split(/\s+/);
        return { first: parts[0].replace(/\.$/, ''), last: parts.slice(-1)[0] };
      };
      const pa = parse(a), pb = parse(b);
      if (pa.last.toLowerCase() !== pb.last.toLowerCase()) return false;
      if (!pa.first || !pb.first) return true;
      const fa = pa.first.toLowerCase(), fb = pb.first.toLowerCase();
      const minLen = Math.min(fa.length, fb.length, 3);
      return fa.startsWith(fb) || fb.startsWith(fa) || (minLen >= 3 && fa.slice(0, minLen) === fb.slice(0, minLen));
    };
    for (const [name, stats] of Object.entries(wmPlayers)) {
      const matchedKey = Object.keys(players).find(k => nameMatch(k, name)) ?? name;
      // Prefer the fuller name (no dot-abbreviation) as canonical key
      const isAbbrev = k => /^[A-Z]\.[A-Z]/.test(k);
      const key = matchedKey !== name && isAbbrev(matchedKey) && !isAbbrev(name) ? name : matchedKey;
      if (key !== matchedKey && players[matchedKey]) { players[key] = players[matchedKey]; delete players[matchedKey]; }
      if (!players[key]) players[key] = {};
      if (!players[key].winamax) players[key].winamax = {};
      if (stats.pts) players[key].winamax.pts = stats.pts;
      if (stats.reb) players[key].winamax.reb = stats.reb;
      if (stats.ast) players[key].winamax.ast = stats.ast;
    }

    // Betclic via gRPC-Web — pickMainLine to flatten arrays to {line,over,under}
    const bcPlayers = bcData?.ou ?? {};
    for (const [name, stats] of Object.entries(bcPlayers)) {
      const matchedKey = Object.keys(players).find(k => nameMatch(k, name)) ?? name;
      const isAbbrev = k => /^[A-Z]\.[A-Z]/.test(k);
      const key = matchedKey !== name && isAbbrev(matchedKey) && !isAbbrev(name) ? name : matchedKey;
      if (key !== matchedKey && players[matchedKey]) { players[key] = players[matchedKey]; delete players[matchedKey]; }
      if (!players[key]) players[key] = {};
      if (!players[key].betclic) players[key].betclic = {};
      const refLine = stat => players[key].unibet?.[stat]?.line ?? players[key].winamax?.[stat]?.line ?? null;
      if (stats.pts?.length) { const b = pickMainLine(stats.pts, refLine('pts')); if (b) players[key].betclic.pts = b; }
      if (stats.reb?.length) { const b = pickMainLine(stats.reb, refLine('reb')); if (b) players[key].betclic.reb = b; }
      if (stats.ast?.length) { const b = pickMainLine(stats.ast, refLine('ast')); if (b) players[key].betclic.ast = b; }
      if (stats.tpm?.length) { const b = pickMainLine(stats.tpm, refLine('tpm')); if (b) players[key].betclic.tpm = b; }
      const bcAll = {};
      for (const stat of ['pts', 'reb', 'ast', 'tpm']) {
        if (stats[stat]?.length > 1) bcAll[stat] = stats[stat].slice().sort((a, b) => a.line - b.line);
      }
      if (Object.keys(bcAll).length) players[key].betclicAllLines = bcAll;
    }
    for (const [name, ms] of Object.entries(bcData?.milestones ?? {})) {
      const matchedKey = Object.keys(players).find(k => nameMatch(k, name)) ?? name;
      if (!players[matchedKey]) continue;
      if (!players[matchedKey].milestones) players[matchedKey].milestones = {};
      if (!players[matchedKey].milestones.betclic) players[matchedKey].milestones.betclic = {};
      Object.assign(players[matchedKey].milestones.betclic, ms);
    }

    // Lignes complètes (allLines) + combos + milestones — additif, pour la page "toutes les lignes du joueur"
    const wmLadders = wmDetails?.perfLadders ?? {};
    for (const [name, stats] of Object.entries(wmPlayers)) {
      const matchedKey = Object.keys(players).find(k => nameMatch(k, name)) ?? name;
      if (!players[matchedKey]) continue;
      const wmAll = {};
      const ladderName = Object.keys(wmLadders).find(k => nameMatch(k, name));
      const ladder = ladderName ? wmLadders[ladderName] : null;
      for (const stat of ['pts', 'reb', 'ast', 'tpm']) {
        if (stats[stat] && !players[matchedKey].winamax?.[stat]) {
          if (!players[matchedKey].winamax) players[matchedKey].winamax = {};
          players[matchedKey].winamax[stat] = { line: stats[stat].line, over: stats[stat].over, under: stats[stat].under };
        }
        const merged = mergeLineArrays(stats[stat]?.allLines || [], ladder?.[stat] || []);
        if (merged.length > 1) wmAll[stat] = merged;
      }
      if (Object.keys(wmAll).length) players[matchedKey].winamaxAllLines = wmAll;
      for (const stat of ['pr', 'pa', 'ra', 'pra']) {
        if (!stats[stat]) continue;
        if (!players[matchedKey].combos) players[matchedKey].combos = {};
        if (!players[matchedKey].combos.winamax) players[matchedKey].combos.winamax = {};
        players[matchedKey].combos.winamax[stat] = { line: stats[stat].line, over: stats[stat].over, under: stats[stat].under };
        if (stats[stat].allLines?.length > 1) {
          if (!players[matchedKey].combosAllLines) players[matchedKey].combosAllLines = {};
          if (!players[matchedKey].combosAllLines.winamax) players[matchedKey].combosAllLines.winamax = {};
          players[matchedKey].combosAllLines.winamax[stat] = stats[stat].allLines;
        }
      }
    }
    for (const [name, ms] of Object.entries(wmDetails?.milestones ?? {})) {
      const matchedKey = Object.keys(players).find(k => nameMatch(k, name)) ?? name;
      if (!players[matchedKey]) continue;
      if (!players[matchedKey].milestones) players[matchedKey].milestones = {};
      if (!players[matchedKey].milestones.winamax) players[matchedKey].milestones.winamax = {};
      Object.assign(players[matchedKey].milestones.winamax, ms);
    }

    // Combos & milestones Unibet
    for (const [name, combos] of Object.entries(ubData?.combos ?? {})) {
      const matchedKey = Object.keys(players).find(k => nameMatch(k, name)) ?? name;
      if (!players[matchedKey]) continue;
      if (!players[matchedKey].combos) players[matchedKey].combos = {};
      players[matchedKey].combos.unibet = combos;
    }
    for (const [name, ms] of Object.entries(ubData?.milestones ?? {})) {
      const matchedKey = Object.keys(players).find(k => nameMatch(k, name)) ?? name;
      if (!players[matchedKey]) continue;
      if (!players[matchedKey].milestones) players[matchedKey].milestones = {};
      if (!players[matchedKey].milestones.unibet) players[matchedKey].milestones.unibet = {};
      Object.assign(players[matchedKey].milestones.unibet, ms);
    }

    // Lignes complètes Unibet — fusion ligne unique (Plus/Moins) + ladder "Performance Joueur" (Over uniquement)
    for (const [name, ladder] of Object.entries(ubData?.perfLadders ?? {})) {
      const matchedKey = Object.keys(players).find(k => nameMatch(k, name)) ?? name;
      if (!players[matchedKey]) continue;
      const ubAll = {};
      for (const stat of ['pts', 'reb', 'ast', 'tpm']) {
        if (!ladder[stat]) continue;
        const single = players[matchedKey].unibet?.[stat];
        const merged = mergeLineArrays(single ? [single] : [], ladder[stat]);
        if (merged.length > 1) ubAll[stat] = merged;
      }
      if (Object.keys(ubAll).length) players[matchedKey].unibetAllLines = ubAll;
    }

    // Ladder PRA Betclic (Over uniquement)
    for (const [name, ladder] of Object.entries(bcData?.praLadders ?? {})) {
      const matchedKey = Object.keys(players).find(k => nameMatch(k, name)) ?? name;
      if (!players[matchedKey]) continue;
      players[matchedKey].betclicPraLadder = ladder;
    }

    const found = Object.keys(players).length > 0;
    // Scrape vide → match en live ou terminé : retourner cache mémoire, puis snapshot disque
    if (!found) {
      if (cached?.data?.found) return cached.data;
      const disk = _linesSnapshot[cacheKey];
      if (disk?.data?.found) return disk.data;
    }
    let espnEventId = null;
    if (league === 'wnba' && _wnbaScoreboardCache.data?.games) {
      const normT = s => (s || '').toLowerCase().replace(/[^a-z]/g, '');
      const match = _wnbaScoreboardCache.data.games.find(g =>
        (normT(g.home?.name) === normT(home) && normT(g.away?.name) === normT(away)) ||
        (normT(g.home?.name) === normT(away) && normT(g.away?.name) === normT(home))
      );
      espnEventId = match?.id ?? null;
    }
    // Team assignment map — EU leagues only
    let teamMap = {};
    const EU_PROP_LEAGUES = new Set(['acb','lnb','bbl','legaa','euroleague']);
    if (found && EU_PROP_LEAGUES.has(league)) {
      try {
        const getTeamIdFromSb = teamName => {
          const sb = _euroCache[`euro_sb_${league}`]?.data?.games || [];
          const norm = s => (s||'').toLowerCase().replace(/[^a-z]/g,'');
          const tn = norm(teamName);
          for (const g of sb) {
            if (norm(g.home?.name).includes(tn) || tn.includes(norm(g.home?.name).slice(0,5))) return g.home?.id;
            if (norm(g.away?.name).includes(tn) || tn.includes(norm(g.away?.name).slice(0,5))) return g.away?.id;
          }
          return null;
        };
        // Force le chargement du roster si non encore en cache
        const ensureRoster = async teamName => {
          const teamId = getTeamIdFromSb(teamName);
          if (!teamId) return;
          const ck2 = `euro_players_${league}_${teamId}`;
          if (_euroCache[ck2]?.data?.players?.length > 0) return;
          try { await fetch(`http://localhost:${PORT}/api/euro/${league}/players/${teamId}`, { signal: AbortSignal.timeout(8000) }); } catch {}
        };
        await Promise.all([ensureRoster(home), ensureRoster(away)]);
        const getCachedNames = teamName => {
          const teamId = getTeamIdFromSb(teamName);
          if (!teamId) return [];
          const ck2 = `euro_players_${league}_${teamId}`;
          const ps = _euroCache[ck2]?.data?.players;
          return ps?.length > 0 ? ps.map(p => p.name || '') : [];
        };
        const hNames = getCachedNames(home);
        const aNames = getCachedNames(away);
        if (hNames.length > 0 || aNames.length > 0) {
          const normN = n => (n||'').toLowerCase().replace(/[.\-']/g,' ').replace(/[^a-z\s]/g,'').trim().replace(/\s+/g,' ');
          const score = (pn, roster) => {
            const p = normN(pn); let best = 0;
            for (const r of roster) {
              const rn = normN(r);
              if (p === rn) return 10;
              const pL = p.split(' ').at(-1), rL = rn.split(' ').at(-1);
              if (pL === rL && pL.length > 2) { best = Math.max(best, 5); continue; }
              if (p.split(' ').filter(w=>w.length>3).some(w=>rn.includes(w))) best = Math.max(best, 2);
            }
            return best;
          };
          for (const pn of Object.keys(players)) {
            const h = score(pn, hNames), a = score(pn, aNames);
            if (h > 0 || a > 0) teamMap[pn] = h >= a ? 'home' : 'away';
          }
        }
      } catch { teamMap = {}; }

      // Correction et fallback via _euroPlayerTeams (assignations persistantes corrigées manuellement)
      // S'applique TOUJOURS : corrige les erreurs du roster Bzzoiro + fallback si teamMap vide
      if (Object.keys(_euroPlayerTeams).length > 0) {
        const sb = _euroCache[`euro_sb_${league}`]?.data?.games || [];
        const norm = s => (s||'').toLowerCase().replace(/[^a-z]/g,'');
        const g = sb.find(x =>
          (norm(x.home?.name).includes(norm(home).slice(0,4)) || norm(home).includes(norm(x.home?.name).slice(0,4))) &&
          (norm(x.away?.name).includes(norm(away).slice(0,4)) || norm(away).includes(norm(x.away?.name).slice(0,4)))
        );
        if (g) {
          const homeId = g.home?.id, awayId = g.away?.id;
          for (const pn of Object.keys(players)) {
            const pt = _euroPlayerTeams[pn];
            if (!pt) continue;
            // Remplace toujours l'assignation par celle de _euroPlayerTeams si elle concerne ce match
            if (pt.teamId === homeId) teamMap[pn] = 'home';
            else if (pt.teamId === awayId) teamMap[pn] = 'away';
          }
        }
      }
    }
    // Applique les lignes Unibet "Performance" avec pickMainLine en utilisant Winamax/Betclic comme référence
    if (ubData?._perfLines) {
      for (const [perfName, statLines] of Object.entries(ubData._perfLines)) {
        const matchedKey = Object.keys(players).find(k => nameMatch(k, perfName)) ?? perfName;
        if (!players[matchedKey]) players[matchedKey] = {};
        if (!players[matchedKey].unibet) players[matchedKey].unibet = {};
        for (const [stat, lines] of Object.entries(statLines)) {
          const refLine = players[matchedKey].winamax?.[stat]?.line ?? players[matchedKey].betclic?.[stat]?.line ?? null;
          const best = pickMainLine(lines, refLine);
          if (best) players[matchedKey].unibet[stat] = best;
        }
      }
    }
    // Injecte les cotes Pinnacle props depuis le cache (sans déclencher de nouveau scrape)
    if (['nba', 'wnba'].includes(league) && Object.keys(_pinnaclePropsCache.data).length > 0) {
      const normT = s => (s || '').toLowerCase().replace(/[^a-z]/g, '');
      const normP = s => (s || '').toLowerCase().replace(/[.\-']/g, ' ').replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, ' ');
      const lastN  = s => normP(s).split(' ').slice(-1)[0];
      const hn = normT(home), an = normT(away);
      const pinnKey = Object.keys(_pinnaclePropsCache.data).find(k => {
        const [h, a] = k.split('|');
        const khn = normT(h), kan = normT(a);
        return (khn.includes(hn.slice(0, 5)) || hn.includes(khn.slice(0, 5))) &&
               (kan.includes(an.slice(0, 5)) || an.includes(kan.slice(0, 5)));
      });
      if (pinnKey) {
        for (const { player: pn, stat, line, over, under } of _pinnaclePropsCache.data[pinnKey]) {
          const matchedKey = Object.keys(players).find(k =>
            normP(k) === normP(pn) || lastN(k) === lastN(pn)
          );
          if (!matchedKey) continue;
          if (!players[matchedKey].pinnacle) players[matchedKey].pinnacle = {};
          players[matchedKey].pinnacle[stat] = { line, over, under };
        }
      }
    }

    const result = { found, players, teamMap, eventId: espnEventId, unibetSource: ubData ? 'scraped' : null, winamaxSource: wmMatch?.matchId ? 'scraped' : null, betclicSource: bcData?.brand ? 'grpc' : null };
    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    if (found) _saveLinesSnapshot(cacheKey, result);

    // Persistance automatique des assignations joueur→équipe (mise à jour transferts)
    if (found && EU_PROP_LEAGUES.has(league) && Object.keys(teamMap).length > 0) {
      const sb = _euroCache[`euro_sb_${league}`]?.data?.games || [];
      const norm = s => (s||'').toLowerCase().replace(/[^a-z]/g,'');
      const g = sb.find(x => norm(x.home?.name).includes(norm(home).slice(0,4)) || norm(x.away?.name).includes(norm(home).slice(0,4)));
      if (g) {
        let updated = false;
        for (const [playerName, side] of Object.entries(teamMap)) {
          const teamId = side === 'home' ? g.home?.id : g.away?.id;
          const teamName = side === 'home' ? g.home?.name : g.away?.name;
          if (!teamId) continue;
          const existing = _euroPlayerTeams[playerName];
          // Ne pas écraser les entrées vérifiées par gamelog (_verified = 'gamelog')
          if (existing?._verified === 'gamelog') continue;
          if (!existing || existing.teamId !== teamId) {
            _euroPlayerTeams[playerName] = { league, teamId, teamName, updatedAt: Date.now() };
            updated = true;
          }
        }
        if (updated) _saveEuroPlayerTeams();
      }
    }
    return result;
  }
}

// ── Background Alert Generation ───────────────────────────────────────────────

const ESPN_NBA_MAP = {
  'Atlanta Hawks': 1,        'Boston Celtics': 2,       'New Orleans Pelicans': 3,
  'Chicago Bulls': 4,        'Cleveland Cavaliers': 5,  'Dallas Mavericks': 6,
  'Denver Nuggets': 7,       'Detroit Pistons': 8,      'Golden State Warriors': 9,
  'Houston Rockets': 10,     'Indiana Pacers': 11,      'LA Clippers': 12,
  'Los Angeles Lakers': 13,  'Miami Heat': 14,          'Milwaukee Bucks': 15,
  'Minnesota Timberwolves': 16, 'Brooklyn Nets': 17,
  'New York Knicks': 18,     'Orlando Magic': 19,       'Philadelphia 76ers': 20,
  'Phoenix Suns': 21,        'Portland Trail Blazers': 22, 'Sacramento Kings': 23,
  'San Antonio Spurs': 24,   'Oklahoma City Thunder': 25,  'Utah Jazz': 26,
  'Washington Wizards': 27,  'Toronto Raptors': 28,     'Memphis Grizzlies': 29,
  'Charlotte Hornets': 30,
};

const ESPN_ABBR_NORM = { SAS: 'SA', NYK: 'NY', GSW: 'GS', NOP: 'NO', UTA: 'UT' };

const ESPN_WNBA_MAP = {
  'Atlanta Dream':           20,
  'Chicago Sky':             19,
  'Connecticut Sun':         18,
  'Dallas Wings':             3,
  'Golden State Valkyries': 129689,
  'Indiana Fever':            5,
  'Las Vegas Aces':          17,
  'Los Angeles Sparks':       6,
  'Minnesota Lynx':           8,
  'New York Liberty':         9,
  'Phoenix Mercury':         11,
  'Portland Fire':          132052,
  'Seattle Storm':           14,
  'Toronto Tempo':          131935,
  'Washington Mystics':      16,
};

const WNBA_SCALE = 114.5 / 87.0; // normalize WNBA pts to NBA-equivalent for computeEstimate

let backgroundAlerts = [];

// Anti-ban Betclic/Unibet/Winamax — pause un bookmaker après un 403/429 pour ne pas aggraver
// un blocage CDN (cf. project_winamax_ban_juin10/11). Persisté sur disque pour survivre aux
// restarts (--watch) : sans ça, un restart pendant le cooldown remet le compteur à 0 et
// l'app retente immédiatement, ce qui peut prolonger le ban côté WAF.
const BK_BACKOFF_BASE_MS = 30 * 60_000;  // 30min
const BK_BACKOFF_MAX_MS  = 6 * 3600_000; // 6h plafond
let _scraperBlockedUntil = { betclic: 0, unibet: 0, winamax: 0, pinnacle: 0, pmu: 0, pinnacle_foot: 0, pinnacle_wnba: 0 };
let _scraperFailStreak   = { betclic: 0, unibet: 0, winamax: 0, pinnacle: 0, pmu: 0, pinnacle_foot: 0, pinnacle_wnba: 0 };
try {
  if (existsSync(SCRAPER_BLOCK_FILE)) {
    const saved = JSON.parse(readFileSync(SCRAPER_BLOCK_FILE, 'utf8'));
    Object.assign(_scraperBlockedUntil, saved.blockedUntil);
    Object.assign(_scraperFailStreak, saved.failStreak);
  }
} catch {}
function _saveScraperBlocks() {
  writeFile(SCRAPER_BLOCK_FILE, JSON.stringify({ blockedUntil: _scraperBlockedUntil, failStreak: _scraperFailStreak }), 'utf8', () => {});
}

// Cache des pages brutes par URL — évite de re-télécharger la même page plusieurs fois
// dans un même cycle de refresh (ex: 5 matchs ACB → 1 fetch /sports/2/ au lieu de 5).
// Winamax a un TTL plus long (30min) : c'est juste de la consultation côté UI pour ce
// bookmaker, donc on peut être beaucoup moins agressif sur le scraping.
const _bkPageCache = new Map(); // `${bk}:${url}` -> { ts, status, text }
const BK_CACHE_TTL = { betclic: 90_000, unibet: 90_000, winamax: 30 * 60_000 };

// Cookie jar par bookmaker — CloudFront pose un cookie __cf_bm après la 1ère requête
// et s'attend à le revoir ensuite ; sans ça chaque requête a l'air "neuve" (signal bot).
const _bkCookies = { betclic: {}, unibet: {}, winamax: {} };
function _bkCookieHeader(bk) {
  const jar = _bkCookies[bk];
  const pairs = Object.entries(jar).map(([k, v]) => `${k}=${v}`);
  return pairs.length ? pairs.join('; ') : null;
}
function _bkStoreCookies(bk, setCookieArr) {
  for (const c of setCookieArr) {
    const eq = c.indexOf('=');
    const semi = c.indexOf(';');
    if (eq === -1) continue;
    const name = c.slice(0, eq).trim();
    const value = c.slice(eq + 1, semi === -1 ? undefined : semi).trim();
    _bkCookies[bk][name] = value;
  }
}

async function fetchBk(bk, url, opts) {
  if (Date.now() < _scraperBlockedUntil[bk]) throw new Error(`${bk}_blocked`);

  const cacheKey = `${bk}:${url}`;
  const cached = _bkPageCache.get(cacheKey);
  if (cached) {
    if (Date.now() - cached.ts < BK_CACHE_TTL[bk]) return new Response(cached.text, { status: cached.status });
    _bkPageCache.delete(cacheKey);
  }

  // Jitter anti-bot : évite des requêtes à intervalles parfaitement réguliers (signal bot classique)
  await new Promise(res => setTimeout(res, 200 + Math.random() * 1300));

  const headers = { ...(opts?.headers || {}) };
  const cookieHeader = _bkCookieHeader(bk);
  if (cookieHeader) headers['Cookie'] = cookieHeader;

  const r = await fetch(url, { ...opts, headers });
  const setCookie = r.headers.getSetCookie?.() || [];
  if (setCookie.length) _bkStoreCookies(bk, setCookie);

  if (r.status === 403 || r.status === 429) {
    _scraperFailStreak[bk] = (_scraperFailStreak[bk] || 0) + 1;
    const backoff = Math.min(BK_BACKOFF_BASE_MS * 2 ** (_scraperFailStreak[bk] - 1), BK_BACKOFF_MAX_MS);
    _scraperBlockedUntil[bk] = Date.now() + backoff;
    _saveScraperBlocks();
    _bgLog.push(`${bk} blocked (HTTP ${r.status}) — pause anti-ban ${Math.round(backoff / 60_000)}min (streak ${_scraperFailStreak[bk]})`);
    return r;
  }
  if (r.ok) {
    if (_scraperFailStreak[bk]) { _scraperFailStreak[bk] = 0; _saveScraperBlocks(); }
    const text = await r.text();
    _bkPageCache.set(cacheKey, { ts: Date.now(), status: r.status, text });
    return new Response(text, { status: r.status });
  }
  return r;
}

// ── Santé du système — tracking scrapers + cycles bg ─────────────────────────
let _bgLastRun  = null;
let _snapshotLastUpdate = null;
const _scraperHealth = {
  unibet:      { ts: null, ok: false, lastOk: null, history: [] },
  betclic:     { ts: null, ok: false, lastOk: null, history: [] },
  winamax:     { ts: null, ok: false, lastOk: null, history: [] },
  espn:        { ts: null, ok: false, lastOk: null, history: [] },
  acb:         { ts: null, ok: false, lastOk: null, history: [] },
  bzzoiro:     { ts: null, ok: false, lastOk: null, history: [] },
  rotowire:    { ts: null, ok: false, lastOk: null, history: [] },
  unibet_foot: { ts: null, ok: false, lastOk: null, history: [] },
  betclic_foot:{ ts: null, ok: false, lastOk: null, history: [] },
  winamax_foot:{ ts: null, ok: false, lastOk: null, history: [] },
  pinnacle_foot:{ ts: null, ok: false, lastOk: null, history: [] },
  pinnacle_wnba:{ ts: null, ok: false, lastOk: null, history: [] },
};
function _updateScraper(name, ok) {
  const now = Date.now();
  const prev = _scraperHealth[name] ?? { history: [] };
  const history = [...(prev.history || []), ok ? 1 : 0].slice(-10);
  _scraperHealth[name] = { ts: now, ok, lastOk: ok ? now : (prev.lastOk ?? null), history };
}

// Quotas API — mis à jour à chaque appel réel (pas depuis le cache)
let _footballApiQuota = { remaining: null, limit: null, ts: null }; // API-Football (100/jour)
let _basketballApiQuota = { remaining: null, limit: null, ts: null }; // API-Basketball (7500/jour)
let _fdQuota = { remaining: null, limit: 10, ts: null }; // football-data.org (10/min)

function _captureFootballQuota(resp) {
  const remaining = parseInt(resp.headers.get('x-ratelimit-requests-remaining'), 10);
  const limit     = parseInt(resp.headers.get('x-ratelimit-requests-limit'), 10);
  if (!isNaN(remaining)) _footballApiQuota = { remaining, limit: isNaN(limit) ? null : limit, ts: Date.now() };
}
function _captureBasketballApiQuota(resp) {
  const remaining = parseInt(resp.headers.get('x-ratelimit-requests-remaining'), 10);
  const limit     = parseInt(resp.headers.get('x-ratelimit-requests-limit'), 10);
  if (!isNaN(remaining)) _basketballApiQuota = { remaining, limit: isNaN(limit) ? null : limit, ts: Date.now() };
}
function _captureFdQuota(resp) {
  const remaining = parseInt(resp.headers.get('x-requests-available-minute'), 10);
  if (!isNaN(remaining)) _fdQuota = { remaining, limit: 10, ts: Date.now() };
}

// Snapshot projections pré-match — persisté sur disque pour survivre aux restarts
const _projectionsSnapshot = (() => {
  try { if (existsSync(SNAPSHOT_FILE)) return JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8')); } catch {}
  return {};
})();
let _snapshotSaveTimer = null;
function _saveSnapshot() {
  if (_snapshotSaveTimer) clearTimeout(_snapshotSaveTimer);
  _snapshotSaveTimer = setTimeout(() => {
    _snapshotSaveTimer = null;
    writeFile(SNAPSHOT_FILE, JSON.stringify(_projectionsSnapshot), 'utf8', () => {});
    _snapshotLastUpdate = Date.now();
  }, 2000);
}

// Lines snapshot — lignes bookmaker pré-match persistées sur disque
const _linesSnapshot = (() => {
  try { if (existsSync(LINES_FILE)) return JSON.parse(readFileSync(LINES_FILE, 'utf8')); } catch {}
  return {};
})();
let _linesSaveTimer = null;
function _saveLinesSnapshot(cacheKey, data) {
  _linesSnapshot[cacheKey] = { data, ts: Date.now() };
  if (_linesSaveTimer) clearTimeout(_linesSaveTimer);
  _linesSaveTimer = setTimeout(() => {
    _linesSaveTimer = null;
    writeFile(LINES_FILE, JSON.stringify(_linesSnapshot), 'utf8', () => {});
  }, 2000);
}


async function bgFetchRoster(teamId) {
  const cached = _espnCache[teamId];
  if (cached && Date.now() - cached.ts < CACHE_6H) return cached.data.players || [];
  try {
    const ac = new AbortController(); setTimeout(() => ac.abort(), 10000);
    const resp = await fetch(`${ESPN_NBA}/${teamId}/roster`, { signal: ac.signal });
    if (!resp.ok) return [];
    const json = await resp.json();
    const athletes = json.athletes || [];
    const statsArr = await Promise.all(athletes.map(p => fetchPlayerStats(p.id)));
    const players = athletes.map((p, i) => ({
      id: p.id, name: p.fullName, position: p.position?.abbreviation || '—',
      injury: p.injuries?.length ? p.injuries[0].status : null,
      stats: statsArr[i],
    })).sort((a, b) => (b.stats?.pts ?? -1) - (a.stats?.pts ?? -1));
    _espnCache[teamId] = { data: { teamId, players }, ts: Date.now() };
    return players;
  } catch { return []; }
}

async function bgFetchSchedule(teamId) {
  const cacheKey = `sched_${teamId}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return cached.data.games || [];
  try {
    const ac = new AbortController(); setTimeout(() => ac.abort(), 10000);
    const resp = await fetch(`${ESPN_NBA}/${teamId}/schedule`, { signal: ac.signal });
    if (!resp.ok) return [];
    const json = await resp.json();
    const games = [];
    for (const event of (json.events || [])) {
      const comp = event.competitions?.[0];
      if (!comp) continue;
      if (!comp.status?.type?.name?.includes('STATUS_FINAL')) continue;
      const us   = comp.competitors?.find(c => String(c.id) === String(teamId));
      const them = comp.competitors?.find(c => String(c.id) !== String(teamId));
      if (!us || !them) continue;
      const parseScore = s => parseInt(s?.value ?? s?.displayValue ?? s) || 0;
      games.push({
        date:        event.date,
        ptsScored:   parseScore(us.score),
        ptsAllowed:  parseScore(them.score),
        isHome:      us.homeAway === 'home',
        opponentAbbr: them.team?.abbreviation || '?',
      });
    }
    games.sort((a, b) => new Date(b.date) - new Date(a.date));
    const result = { teamId, games };
    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    return games;
  } catch { return []; }
}

// Boxscore interne (même logique que /api/nba/boxscore, sans req/res — réutilisable côté alertes)
async function bgFetchBoxscore(date, home, away) {
  const cacheKey = `bs_${date}_${home}_${away}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_5MIN) return cached.data;
  try {
    const dt  = new Date(date);
    const est = new Date(dt.getTime() - 5 * 60 * 60 * 1000);
    const ymd = est.toISOString().slice(0, 10).replace(/-/g, '');
    const sbResp = await fetch(`${ESPN_SCOREBOARD}?dates=${ymd}&limit=50`);
    if (!sbResp.ok) return null;
    const sbData = await sbResp.json();
    const ESPN_ABBR_MAP = { SAS:'SA', NYK:'NY', GSW:'GS', NOP:'NO', UTA:'UT' };
    const toEspn = a => ESPN_ABBR_MAP[a.toUpperCase()] || a.toUpperCase();
    const homeE = toEspn(home), awayE = toEspn(away);
    const game = (sbData.events || []).find(e => {
      const abbrs = (e.competitions?.[0]?.competitors || []).map(c => c.team?.abbreviation?.toUpperCase() || '');
      return abbrs.includes(homeE) && abbrs.includes(awayE);
    });
    if (!game) return null;
    const sumResp = await fetch(`${ESPN_SUMMARY}?event=${game.id}`);
    if (!sumResp.ok) return null;
    const sumData = await sumResp.json();
    const ABBR_BACK = Object.fromEntries(Object.entries(ESPN_ABBR_MAP).map(([k,v]) => [v, k]));
    const toOrig = a => ABBR_BACK[a.toUpperCase()] || a.toUpperCase();
    const result = { gameId: game.id, status: game.status?.type?.name };
    for (const teamData of (sumData.boxscore?.players || [])) {
      const espnAbbr = teamData.team?.abbreviation?.toUpperCase();
      const abbr     = toOrig(espnAbbr);
      const group  = teamData.statistics?.[0];
      if (!group) continue;
      const labels = (group.labels || []).map(l => l.toLowerCase());
      result[abbr] = (group.athletes || []).map(a => {
        const vals = a.stats || [];
        const s = {};
        labels.forEach((l, i) => { s[l] = vals[i] ?? '—'; });
        return {
          id: a.athlete?.id, name: a.athlete?.displayName,
          dnp: !!a.didNotPlay,
          stats: { min: s.min || '—', pts: parseFloat(s.pts) || 0, reb: parseFloat(s.reb) || 0, ast: parseFloat(s.ast) || 0 },
        };
      });
    }
    _espnCache[cacheKey] = { data: result, ts: Date.now() };
    return result;
  } catch { return null; }
}

// Fusionne les boxscores des matchs précédents de la série PO en cours dans le gamelog —
// même logique que seriesGamelogs côté frontend (BasketballDetailPage.jsx ~1369-1425).
// Sans ça, l'EWA playoff du backend tourne sur un gamelog saison régulière périmé.
const ESPN_SHORT_NORM_BG = { SA: 'SAS', NY: 'NYK', GS: 'GSW', NO: 'NOP', UT: 'UTA' };
const normAbbrBG = a => ESPN_SHORT_NORM_BG[a?.toUpperCase()] || a?.toUpperCase() || '';

async function bgFetchSeriesGamelogs(game, allNormalized) {
  const pairKey = g => [g.home.name, g.away.name].sort().join('__');
  const k = pairKey(game);
  const seriesDone = allNormalized.filter(g =>
    g.id !== game.id && g.status?.includes('STATUS_FINAL') && pairKey(g) === k
  ).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!seriesDone.length) return {};

  const results = await Promise.all(seriesDone.map(async f => ({ f, bs: await bgFetchBoxscore(f.date, f.home.short, f.away.short) })));
  const byPlayer = {};
  for (const { f: gf, bs } of results) {
    if (!bs) continue;
    for (const [abbr, players] of Object.entries(bs)) {
      if (abbr === 'gameId' || abbr === 'status') continue;
      const isHome = normAbbrBG(abbr) === normAbbrBG(gf.home.short);
      const oppAbbr = isHome ? normAbbrBG(gf.away.short) : normAbbrBG(gf.home.short);
      for (const p of (players || [])) {
        if (!p.id || p.dnp) continue;
        const minVal = parseFloat(String(p.stats?.min || '0').split(':')[0]) || 0;
        if (minVal < 5 && (p.stats?.pts || 0) === 0) continue;
        const pid = String(p.id);
        if (!byPlayer[pid]) byPlayer[pid] = [];
        byPlayer[pid].push({
          date: gf.date, pts: p.stats?.pts || 0, reb: p.stats?.reb || 0, ast: p.stats?.ast || 0,
          min: minVal, to: 0, opponentAbbr: oppAbbr, isHome,
        });
      }
    }
  }
  return byPlayer;
}

async function bgFetchGamelog(playerId) {
  const cacheKey = `gl_${playerId}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return cached.data.games || [];
  try {
    const ac = new AbortController(); setTimeout(() => ac.abort(), 10000);
    const resp = await fetch(`${ESPN_ATHLETE}/${playerId}/gamelog?season=${ESPN_SEASON}`, { signal: ac.signal });
    if (!resp.ok) return [];
    const json = await resp.json();
    const labels = json.labels || [];
    const iPTS = labels.indexOf('PTS'), iREB = labels.indexOf('REB');
    const iAST = labels.indexOf('AST'), iMIN = labels.indexOf('MIN');
    const iTO  = labels.indexOf('TO');
    const i3PT = labels.indexOf('3PT');
    const iFG  = labels.indexOf('FG');   // "fgm-fga"
    const iFT  = labels.indexOf('FT');   // "ftm-fta"
    const parseMadeAtt = stats => {
      const parts = String(stats ?? '').split('-');
      return parts.length === 2 ? { made: parseInt(parts[0]) || 0, att: parseInt(parts[1]) || 0 } : { made: 0, att: 0 };
    };
    const eventsMap = json.events || {};
    const games = [];
    for (const st of (json.seasonTypes || [])) {
      for (const cat of (st.categories || [])) {
        if (cat.type === 'total') continue;
        for (const ev of (cat.events || [])) {
          const meta = eventsMap[ev.eventId];
          if (!meta?.gameDate) continue;
          const stats = ev.stats || [];
          const pts = iPTS >= 0 ? parseFloat(stats[iPTS]) : 0;
          const reb = iREB >= 0 ? parseFloat(stats[iREB]) : 0;
          const ast = iAST >= 0 ? parseFloat(stats[iAST]) : 0;
          const min = iMIN >= 0 ? parseFloat(String(stats[iMIN]).split(':')[0]) || 0 : 0;
          const to  = iTO  >= 0 ? parseFloat(stats[iTO]) || 0 : 0;
          const tpm = i3PT >= 0 ? parseFloat(String(stats[i3PT]).split('-')[0]) || 0 : 0;
          if (pts === 0 && reb === 0 && min === 0) continue;
          const fg = iFG >= 0 ? parseMadeAtt(stats[iFG]) : { made: 0, att: 0 };
          const ft = iFT >= 0 ? parseMadeAtt(stats[iFT]) : { made: 0, att: 0 };
          const tsDenom = 2 * (fg.att + 0.44 * ft.att);
          const tsPct   = tsDenom > 0 ? pts / tsDenom : null;
          games.push({ date: meta.gameDate, pts, reb, ast, min, to, tpm, fgm: fg.made, fga: fg.att, ftm: ft.made, fta: ft.att, tsPct, opponentAbbr: meta.opponent?.abbreviation || '?', isHome: meta.atVs !== '@' });
        }
      }
    }
    games.sort((a, b) => new Date(b.date) - new Date(a.date));
    const sliced = games.slice(0, 15);
    // Cache persistant : garde les meilleures données si ESPN est instable
    const best = _updateGlCache(`nba_${playerId}`, sliced);
    const result = { playerId, games: best };
    if (best.length > 0) _espnCache[cacheKey] = { data: result, ts: Date.now() };
    return best;
  } catch { return []; }
}

async function bgFetchWNBARoster(teamId) {
  const cacheKey = `wnba_roster_${teamId}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return cached.data.players || [];
  try {
    const ac = new AbortController(); setTimeout(() => ac.abort(), 10000);
    const resp = await fetch(`${ESPN_WNBA}/${teamId}/roster`, { signal: ac.signal });
    if (!resp.ok) return [];
    const json = await resp.json();
    const athletes = json.athletes || [];
    const statsArr = await Promise.all(athletes.map(p => fetchWNBAPlayerStats(p.id)));
    const players = athletes.map((p, i) => ({
      id: p.id, name: p.fullName, position: p.position?.abbreviation || '—',
      injury: null, // rely on RotoWire — ESPN WNBA injuries are stale
      stats: statsArr[i],
    })).sort((a, b) => (b.stats?.pts ?? -1) - (a.stats?.pts ?? -1));
    _espnCache[cacheKey] = { data: { teamId, players }, ts: Date.now() };
    return players;
  } catch { return []; }
}

async function bgFetchWNBASchedule(teamId) {
  const cacheKey = `wnba_sched_${teamId}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return cached.data.games || [];
  try {
    const ac = new AbortController(); setTimeout(() => ac.abort(), 10000);
    const resp = await fetch(`${ESPN_WNBA}/${teamId}/schedule`, { signal: ac.signal });
    if (!resp.ok) return [];
    const json = await resp.json();
    const games = [];
    for (const event of (json.events || [])) {
      const comp = event.competitions?.[0];
      if (!comp) continue;
      if (!comp.status?.type?.name?.includes('STATUS_FINAL')) continue;
      const us   = comp.competitors?.find(c => String(c.id) === String(teamId));
      const them = comp.competitors?.find(c => String(c.id) !== String(teamId));
      if (!us || !them) continue;
      const parseScore = s => parseInt(s?.value ?? s?.displayValue ?? s) || 0;
      games.push({
        date:        event.date,
        ptsScored:   parseScore(us.score),
        ptsAllowed:  parseScore(them.score),
        isHome:      us.homeAway === 'home',
        opponentAbbr: them.team?.abbreviation || '?',
      });
    }
    games.sort((a, b) => new Date(b.date) - new Date(a.date));
    _espnCache[cacheKey] = { data: { teamId, games }, ts: Date.now() };
    return games;
  } catch { return []; }
}

async function bgFetchWNBAGamelog(playerId) {
  const cacheKey = `wnba_gl_${playerId}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return cached.data.games || [];
  try {
    const ac = new AbortController(); setTimeout(() => ac.abort(), 10000);
    const resp = await fetch(`${ESPN_WNBA_ATH}/${playerId}/gamelog?season=${WNBA_SEASON}`, { signal: ac.signal });
    if (!resp.ok) return [];
    const json = await resp.json();
    const labels = json.labels || [];
    const iPTS = labels.indexOf('PTS'), iREB = labels.indexOf('REB');
    const iAST = labels.indexOf('AST'), iMIN = labels.indexOf('MIN');
    const iTO  = labels.indexOf('TO');
    const i3PT = labels.indexOf('3PT');
    const iFG  = labels.indexOf('FG');   // "fgm-fga"
    const iFT  = labels.indexOf('FT');   // "ftm-fta"
    const parseMadeAtt = stats => {
      const parts = String(stats ?? '').split('-');
      return parts.length === 2 ? { made: parseInt(parts[0]) || 0, att: parseInt(parts[1]) || 0 } : { made: 0, att: 0 };
    };
    const eventsMap = json.events || {};
    const games = [];
    for (const st of (json.seasonTypes || [])) {
      for (const cat of (st.categories || [])) {
        if (cat.type === 'total') continue;
        for (const ev of (cat.events || [])) {
          const meta = eventsMap[ev.eventId];
          if (!meta?.gameDate) continue;
          const stats = ev.stats || [];
          const pts = iPTS >= 0 ? parseFloat(stats[iPTS]) : 0;
          const reb = iREB >= 0 ? parseFloat(stats[iREB]) : 0;
          const ast = iAST >= 0 ? parseFloat(stats[iAST]) : 0;
          const min = iMIN >= 0 ? parseFloat(String(stats[iMIN]).split(':')[0]) || 0 : 0;
          const to  = iTO  >= 0 ? parseFloat(stats[iTO]) || 0 : 0;
          const tpm = i3PT >= 0 ? parseFloat(String(stats[i3PT]).split('-')[0]) || 0 : 0;
          if (pts === 0 && reb === 0 && min === 0) continue;
          const fg = iFG >= 0 ? parseMadeAtt(stats[iFG]) : { made: 0, att: 0 };
          const ft = iFT >= 0 ? parseMadeAtt(stats[iFT]) : { made: 0, att: 0 };
          const tsDenom = 2 * (fg.att + 0.44 * ft.att);
          const tsPct   = tsDenom > 0 ? pts / tsDenom : null;
          games.push({ date: meta.gameDate, pts, reb, ast, min, to, tpm, fgm: fg.made, fga: fg.att, ftm: ft.made, fta: ft.att, tsPct, opponentAbbr: meta.opponent?.abbreviation || '?', isHome: meta.atVs !== '@' });
        }
      }
    }
    games.sort((a, b) => new Date(b.date) - new Date(a.date));
    const slicedW = games.slice(0, 15);
    const bestW = _updateGlCache(`wnba_${playerId}`, slicedW);
    const result = { playerId, games: bestW };
    if (bestW.length > 0) _espnCache[cacheKey] = { data: result, ts: Date.now() };
    return bestW;
  } catch { return _glPersist[`wnba_${playerId}`]?.games || []; }
}

async function getWNBATeamAbbr(teamId) {
  const cacheKey = `wnba_teamabbr_${teamId}`;
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return cached.data;
  try {
    const ac = new AbortController(); setTimeout(() => ac.abort(), 10000);
    const resp = await fetch(`${ESPN_WNBA}/${teamId}`, { signal: ac.signal });
    if (!resp.ok) return null;
    const json = await resp.json();
    const abbr = json.team?.abbreviation || null;
    if (abbr) _espnCache[cacheKey] = { data: abbr, ts: Date.now() };
    return abbr;
  } catch { return null; }
}

// Défense par poste WNBA — équivalent de /api/nba/teamdefbypos (stats.nba.com), mais
// construite à partir des gamelogs ESPN déjà exploités ailleurs (stats.wnba.com
// inaccessible). Pour chaque équipe adverse, moyenne des pts marqués contre elle par
// poste (G/F/C) sur l'ensemble des joueurs de la ligue. Moyenne ligue par poste
// recalculée dynamiquement (échelle WNBA != NBA, pas de constante réutilisée).
async function getWNBADefByPos() {
  const cacheKey = 'wnba_defbypos_all';
  const cached = _espnCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_6H) return cached.data;

  const teamIds = Object.values(ESPN_WNBA_MAP);
  const [abbrs, rosters] = await Promise.all([
    Promise.all(teamIds.map(id => getWNBATeamAbbr(id))),
    Promise.all(teamIds.map(id => bgFetchWNBARoster(id))),
  ]);

  const idToAbbr = {};
  teamIds.forEach((id, i) => { if (abbrs[i]) idToAbbr[id] = abbrs[i]; });

  const allPlayers = rosters.flat().filter(p => p.id && p.position);
  const gamelogs = await Promise.all(allPlayers.map(p => bgFetchWNBAGamelog(p.id)));

  // buckets[abbr][G/F/C] = pts marqués par les adversaires de cette position contre l'équipe `abbr`
  const buckets = {};
  Object.values(idToAbbr).forEach(abbr => { buckets[abbr] = { G: [], F: [], C: [] }; });

  allPlayers.forEach((p, i) => {
    const posKey = toDefCat(p.position);
    for (const g of (gamelogs[i] || [])) {
      if (buckets[g.opponentAbbr]) buckets[g.opponentAbbr][posKey].push(g.pts);
    }
  });

  const avg = arr => arr.length ? +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2) : null;
  const teamDefByPosByAbbr = {};
  for (const [abbr, b] of Object.entries(buckets)) {
    teamDefByPosByAbbr[abbr] = { G: avg(b.G), F: avg(b.F), C: avg(b.C) };
  }

  const leagueAvg = {};
  for (const pos of ['G', 'F', 'C']) {
    leagueAvg[pos] = avg(Object.values(teamDefByPosByAbbr).map(t => t[pos]).filter(v => v != null));
  }

  const teamDefByPosById = {};
  for (const [id, abbr] of Object.entries(idToAbbr)) teamDefByPosById[id] = teamDefByPosByAbbr[abbr];

  const data = { teamDefByPosById, leagueAvg };
  _espnCache[cacheKey] = { data, ts: Date.now() };
  return data;
}

// Merge all entries matching a player name (handles name variants like "Aja Wilson" / "A'ja Wilson")
function mergePlayerProps(scrapedPlayers, playerName, nameMatchFn) {
  const matches = Object.entries(scrapedPlayers).filter(([n]) => nameMatchFn(n, playerName));
  if (!matches.length) return null;
  return matches.reduce((merged, [, bks]) => {
    for (const [bk, stats] of Object.entries(bks)) {
      if (!merged[bk]) merged[bk] = { ...stats };
      else for (const [k, v] of Object.entries(stats)) { if (v != null && merged[bk][k] == null) merged[bk][k] = v; }
    }
    return merged;
  }, {});
}

let _bgLog = [];
// ── Moteur de projection joueurs EU (backend) ─────────────────────────────
const EU_LEAGUE_CONST_BG = { acb:83, lnb:79, bbl:82, legaa:80, euroleague:81 };
const NBA_REF_BG = 114.5;

function calcEWAbg(games, key, n, decay = 0.82) {
  const vals = games.slice(0,n).map(g=>g[key]).filter(v=>v!=null&&!isNaN(v));
  if (!vals.length) return null;
  let s=0,w=0; vals.forEach((v,i)=>{const wi=Math.pow(decay,i);s+=wi*v;w+=wi;});
  return w?s/w:null;
}
function calcAvgBg(games,key,n){const sl=games.slice(0,n).map(g=>g[key]).filter(v=>v!=null&&!isNaN(v));return sl.length?sl.reduce((a,b)=>a+b,0)/sl.length:null;}

// Écart-type (Bessel n-1) pour les gamelogs EU (champs points/rebounds/assists/tpm, minutes>5)
function calcStdBgEU(games, key) {
  const vals = (games || []).filter(g => (g.minutes||0) > 5 && g[key] != null).map(g => g[key]);
  if (vals.length < 3) return null;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1));
}

// Variante EU de isConsistentStat (compute.js) — champs minutes/points/rebounds/assists/tpm au
// lieu de min/pts/reb/ast/tpm. Mêmes seuils de régularité par stat (vérifiés quasi identiques
// entre groupes de ligues sur données réelles le 22 juin 2026).
const EU_GL_KEY = { pts: 'points', reb: 'rebounds', ast: 'assists', tpm: 'tpm' };
const CONSISTENCY_CV_CUTOFF_EU = { pts: 0.42, reb: 0.46, ast: 0.58, tpm: 0.76 };
function isConsistentStatEU(games, stat) {
  const key = EU_GL_KEY[stat];
  const vals = (games || []).filter(g => (g.minutes||0) > 5 && g[key] != null).map(g => g[key]);
  if (vals.length < 10) return false;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  if (mean <= 0 || (stat === 'tpm' && mean < 0.5)) return false;
  const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1));
  return (std / mean) <= CONSISTENCY_CV_CUTOFF_EU[stat];
}

// ── Game Total O/U — modèle complet (source unique alertes + page détail depuis le 22 juin 2026,
// remplace l'ancien "port du frontend computeGameTotal" qui était une 2e implémentation séparée) ──
const TOTAL_ALERT_PROB = 0.80; // P(over) ou P(under) minimum pour déclencher
const MAX_TOTAL_P = 0.88;      // un total ne peut jamais être "certain" à 93%+
const Q_STATUSES_TOTAL = ['Questionable', 'GTD', 'Game Time Decision', 'Doubtful', 'Day-To-Day'];
// Constantes partagées generateBackgroundAlerts() + /api/basketball/total (NBA réutilise NBA_REF_BG,
// EU réutilise EU_LEAGUE_CONST_BG — déjà module-level, pas besoin de les dupliquer ici)
const WNBA_TOTAL_LEAGUE_AVG = 85.5;  // pts/équipe WNBA (recalibré 15 juin, ~14 matchs/équipe)
const NBA_TOTAL_GAME_AVG    = 229.0;
const WNBA_TOTAL_GAME_AVG   = 171.0; // recalibré 15 juin (était 174.0)
const EU_GAME_TOTAL_AVG     = { acb: 166.0, bbl: 164.0, legaa: 160.0 };

// Facteur playoffs spécifique aux totaux — plus fort que pour les props joueurs
function getPlayoffFactorTotalBg(round) {
  if (!round) return { val: 1.0, desc: 'Saison régulière' };
  const r = round.toLowerCase();
  if (r.includes('final') && !r.includes('conf') && !r.includes('semi'))
    return { val: 0.87, desc: 'Finales' };
  if ((r.includes('conf') && r.includes('final')) || r.includes('conference final'))
    return { val: 0.90, desc: 'Finales de Conférence' };
  if (r.includes('semi') || r.includes('2nd round'))
    return { val: 0.93, desc: '2ème tour Playoffs' };
  if (r.includes('playoff') || r.includes('round 1') || r.includes('1st round') || r.includes('game'))
    return { val: 0.95, desc: '1er tour Playoffs' };
  return { val: 1.0, desc: 'Saison régulière' };
}

function calcGameTotalStdBg(games, fallback = 12) {
  const vals = (games || []).map(g => g.ptsScored + g.ptsAllowed).filter(v => v > 0);
  if (vals.length < 3) return fallback;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
}

// Modèle complet : pace matchup, momentum, repos, densité calendrier, facteur playoffs,
// ancre historique. `homeGames`/`awayGames` = schedules triés du plus récent au plus ancien
// ({date, ptsScored, ptsAllowed, isHome}). `round` = '' (saison régulière) ou 'game' (playoffs).
function computeGameTotalFull({ homeGames, awayGames, avgPtsAllowed, ouBaseline, gameDate, round, refTotal, isWNBA, h2hGames = [] }) {
  if (!homeGames?.length || !awayGames?.length) return null;

  const inPlayoffs = isPlayoffRound(round);
  const poStart    = new Date(`${new Date(gameDate).getFullYear()}-04-01`);
  const filterFn   = inPlayoffs ? g => new Date(g.date) >= poStart : () => true;
  const hGames = homeGames.filter(filterFn);
  const aGames = awayGames.filter(filterFn);
  const hEff = hGames.length >= 3 ? hGames : homeGames;
  const aEff = aGames.length >= 3 ? aGames : awayGames;

  const homeOff = calcEWAbg(hEff, 'ptsScored', 7);
  const awayOff = calcEWAbg(aEff, 'ptsScored', 7);
  if (!homeOff || !awayOff) return null;

  const homeDefAllowed = calcEWAbg(hEff, 'ptsAllowed', 7);
  const awayDefAllowed = calcEWAbg(aEff, 'ptsAllowed', 7);
  if (!homeDefAllowed || !awayDefAllowed) return null;

  const homeDefFactor = Math.min(1.20, Math.max(0.80, homeDefAllowed / avgPtsAllowed));
  const awayDefFactor = Math.min(1.20, Math.max(0.80, awayDefAllowed / avgPtsAllowed));

  const homeExpected = homeOff * awayDefFactor;
  const awayExpected = awayOff * homeDefFactor;

  const homeAtHome = hEff.filter(g => g.isHome === true).slice(0, 5);
  const awayAtAway = aEff.filter(g => g.isHome === false).slice(0, 5);
  const homeLocFactor = homeAtHome.length >= 3
    ? Math.min(1.05, Math.max(0.95, calcEWAbg(homeAtHome, 'ptsScored', 5) / homeOff))
    : 1.025;
  const awayLocFactor = awayAtAway.length >= 3
    ? Math.min(1.05, Math.max(0.95, calcEWAbg(awayAtAway, 'ptsScored', 5) / awayOff))
    : 0.975;

  const n = Math.min(10, hEff.length, aEff.length);
  const homeOver = hEff.slice(0, n).filter(g => (g.ptsScored + g.ptsAllowed) > ouBaseline).length;
  const awayOver = aEff.slice(0, n).filter(g => (g.ptsScored + g.ptsAllowed) > ouBaseline).length;
  const ouRatio  = n > 0 ? (homeOver + awayOver) / (n * 2) : 0.5;
  const ouFactor = Math.min(1.08, Math.max(0.92, 1.0 + (ouRatio - 0.5) * 0.12));

  // Pace matchup : si deux équipes jouent vite, le tempo s'emballe
  const homePaceTotal = homeOff + homeDefAllowed;
  const awayPaceTotal = awayOff + awayDefAllowed;
  const leagueRefTotal2 = avgPtsAllowed * 2;
  const paceMatchupRaw = Math.sqrt((homePaceTotal / leagueRefTotal2) * (awayPaceTotal / leagueRefTotal2));
  const paceFactor = Math.min(1.07, Math.max(0.93, paceMatchupRaw));

  // Momentum récent (3 matchs)
  const hRecent3 = hEff.slice(0, 3);
  const aRecent3 = aEff.slice(0, 3);
  const hRecentAvg = hRecent3.length >= 2 ? hRecent3.reduce((s, g) => s + g.ptsScored + g.ptsAllowed, 0) / hRecent3.length : homePaceTotal;
  const aRecentAvg = aRecent3.length >= 2 ? aRecent3.reduce((s, g) => s + g.ptsScored + g.ptsAllowed, 0) / aRecent3.length : awayPaceTotal;
  const hMomentum = homePaceTotal > 0 ? hRecentAvg / homePaceTotal : 1;
  const aMomentum = awayPaceTotal > 0 ? aRecentAvg / awayPaceTotal : 1;
  const momentumFactor = Math.min(1.05, Math.max(0.95, (hMomentum + aMomentum) / 2));

  const playoffF  = getPlayoffFactorTotalBg(round);
  const homeRestF = getRestFactor(hEff, gameDate);
  const awayRestF = getRestFactor(aEff, gameDate);
  const restFactor = (homeRestF.val + awayRestF.val) / 2;
  const homeDensF = getScheduleDensityFactor(hEff, gameDate);
  const awayDensF = getScheduleDensityFactor(aEff, gameDate);
  const densFactor = (homeDensF.val + awayDensF.val) / 2;

  // Tendance de la série en cours (confrontations directes récentes) : en playoffs, deux mêmes
  // équipes qui se rejouent voient souvent leur total baisser match après match (défenses qui
  // se calent l'une sur l'autre) — signal distinct du "momentum" général de chaque équipe, qui
  // mélange des matchs contre d'autres adversaires. Cas réel à l'origine de ce fix (22 juin 2026) :
  // finale ACB Barcelone-Valence, totaux combinés G1=225 → G2=177 → G3=168, jamais détecté car
  // le modèle n'avait aucun signal spécifique à cette confrontation. N'agit qu'à partir de 2
  // confrontations connues (sinon pas de tendance calculable), et la tendance observée n'est
  // appliquée qu'à moitié (amorti) pour ne pas extrapoler à l'excès sur un échantillon de 2-3 matchs.
  const h2hSorted = (h2hGames || [])
    .filter(g => g && (g.ptsScored || g.ptsAllowed))
    .map(g => ({ date: g.date, total: (g.ptsScored ?? 0) + (g.ptsAllowed ?? 0) }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  let h2hFactor = 1.0;
  if (h2hSorted.length >= 2 && h2hSorted[1].total > 0) {
    const trendRatio = h2hSorted[0].total / h2hSorted[1].total;
    h2hFactor = Math.min(1.15, Math.max(0.85, 1 + (trendRatio - 1) * 0.5));
  }

  const rawEstimated = (homeExpected * homeLocFactor + awayExpected * awayLocFactor)
    * ouFactor * playoffF.val * restFactor * densFactor * paceFactor * momentumFactor * h2hFactor;

  // Ancre historique : blend 40% modèle / 60% moyenne réelle des deux équipes
  const hAvgTotal = hEff.length >= 4 ? hEff.slice(0, Math.min(10, hEff.length)).reduce((s, g) => s + (g.ptsScored + g.ptsAllowed), 0) / Math.min(10, hEff.length) : null;
  const aAvgTotal = aEff.length >= 4 ? aEff.slice(0, Math.min(10, aEff.length)).reduce((s, g) => s + (g.ptsScored + g.ptsAllowed), 0) / Math.min(10, aEff.length) : null;
  const historicalAvg = hAvgTotal && aAvgTotal ? (hAvgTotal + aAvgTotal) / 2 : null;
  const estimated = historicalAvg ? +(0.40 * rawEstimated + 0.60 * historicalAvg).toFixed(1) : +rawEstimated.toFixed(1);

  const edge = refTotal ? +((estimated - refTotal) / refTotal * 100).toFixed(1) : null;

  // Probabilité P(total > line) via t-distribution
  const std = calcGameTotalStdBg([...hEff, ...aEff], isWNBA ? 20 : 12);
  const rawOver = refTotal ? 1 - tCDF4((refTotal - estimated) / std) : null;
  const pOver  = rawOver != null ? +Math.min(MAX_TOTAL_P, rawOver).toFixed(3) : null;
  const pUnder = rawOver != null ? +Math.min(MAX_TOTAL_P, 1 - rawOver).toFixed(3) : null;

  return {
    estimated, refTotal, edge, pOver, pUnder, std: +std.toFixed(1),
    direction: edge != null ? (edge > 0 ? 'over' : 'under') : null,
    homeExpected: +homeExpected.toFixed(1),
    awayExpected: +awayExpected.toFixed(1),
    details: {
      homeOff: +homeOff.toFixed(1),
      awayOff: +awayOff.toFixed(1),
      homeDefFactor: +awayDefFactor.toFixed(3),
      awayDefFactor: +homeDefFactor.toFixed(3),
      playoffFiltered: hEff.length,
      ouTrend:  { homePct: Math.round(homeOver / Math.max(1,n) * 100), awayPct: Math.round(awayOver / Math.max(1,n) * 100), factor: +ouFactor.toFixed(3) },
      pace:     { homeTotal: +homePaceTotal.toFixed(1), awayTotal: +awayPaceTotal.toFixed(1), factor: +paceFactor.toFixed(3) },
      momentum: { homeRecent: +hRecentAvg.toFixed(1), awayRecent: +aRecentAvg.toFixed(1), factor: +momentumFactor.toFixed(3) },
      playoffs: { val: playoffF.val, desc: playoffF.desc },
      rest:     { home: homeRestF.desc, away: awayRestF.desc, combined: +restFactor.toFixed(3) },
      density:  { home: homeDensF.desc, away: awayDensF.desc, combined: +densFactor.toFixed(3) },
      h2hTrend: { games: h2hSorted.slice(0, 3), factor: +h2hFactor.toFixed(3) },
    },
  };
}

// ── Résultat basket (victoire équipe) — modèle indépendant du marché ────────
// Remplace EarlyWin (formule empirique non calibrée 70%/15%) par un vrai rating de marge
// attendue (offensif/défensif EWA, repos, densité calendrier, avantage terrain, pénalité
// absence titulaire clé), converti en proba de victoire via Student t df=4 — même esprit
// que le modèle Poisson foot (indépendant des cotes, comparé ensuite au marché pour l'edge).
const RESULT_ALERT_PROB     = 0.80;
const HOME_COURT_PTS        = 2.5;  // avantage terrain moyen, en points de marge (échelle NBA)
const KEY_PLAYER_PTS        = 15;   // seuil "titulaire clé" pour la pénalité Out (échelle NBA — EU déjà recalé)
const KEY_PLAYER_OUT_FACTOR = 0.4;  // part de sa moyenne pts retirée du rating équipe (le reste redistribué aux coéquipiers ailleurs dans l'app)

function calcMarginStdBg(games, fallback = 12) {
  const vals = (games || []).map(g => (g.ptsScored ?? 0) - (g.ptsAllowed ?? 0)).filter(v => !isNaN(v));
  if (vals.length < 3) return fallback;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
}

// `homeOutPenalty`/`awayOutPenalty` : points retirés au rating si un titulaire clé est Out
// côté concerné (0 si personne d'absent) — calculés côté appelant à partir du roster.
function computeTeamWinProb({ homeGames, awayGames, gameDate, round, isWNBA = false, homeOutPenalty = 0, awayOutPenalty = 0 }) {
  if (!homeGames?.length || !awayGames?.length) return null;

  const inPlayoffs = isPlayoffRound(round);
  const poStart    = new Date(`${new Date(gameDate).getFullYear()}-04-01`);
  const filterFn   = inPlayoffs ? g => new Date(g.date) >= poStart : () => true;
  const hGames = homeGames.filter(filterFn);
  const aGames = awayGames.filter(filterFn);
  const hEff = hGames.length >= 3 ? hGames : homeGames;
  const aEff = aGames.length >= 3 ? aGames : awayGames;

  const homeOff = calcEWAbg(hEff, 'ptsScored', 8);
  const awayOff = calcEWAbg(aEff, 'ptsScored', 8);
  const homeDef = calcEWAbg(hEff, 'ptsAllowed', 8);
  const awayDef = calcEWAbg(aEff, 'ptsAllowed', 8);
  if (!homeOff || !awayOff || !homeDef || !awayDef) return null;

  // Rating net = ce que l'équipe marque en moyenne moins ce qu'elle concède (EWA récent)
  let homeNet = homeOff - homeDef;
  let awayNet = awayOff - awayDef;

  // Repos / densité calendrier — mêmes facteurs que les props (compute.js), appliqués ici par équipe
  const homeRestF = getRestFactor(hEff, gameDate);
  const awayRestF = getRestFactor(aEff, gameDate);
  const homeDensF = getScheduleDensityFactor(hEff, gameDate);
  const awayDensF = getScheduleDensityFactor(aEff, gameDate);
  homeNet *= homeRestF.val * homeDensF.val;
  awayNet *= awayRestF.val * awayDensF.val;

  // Pénalité absence titulaire clé (calculée côté appelant via roster + injury === 'Out')
  homeNet -= homeOutPenalty;
  awayNet -= awayOutPenalty;

  const playoffDamp    = getPlayoffFactorTotalBg(round).val; // resserre la marge en playoffs (matchs plus tactiques/défensifs)
  const marginExpected = ((homeNet - awayNet) + HOME_COURT_PTS) * playoffDamp;
  const std = calcMarginStdBg([...hEff, ...aEff], isWNBA ? 14 : 12);

  const pHome = Math.max(0.02, Math.min(0.98, tCDF4(marginExpected / std)));
  const pAway = 1 - pHome;

  return { pHome, pAway, marginExpected: +marginExpected.toFixed(1), std: +std.toFixed(1) };
}

// Pénalité Out à partir d'un roster (joueurs avec stats.pts, échelle déjà recalée si EU)
function calcKeyPlayerOutPenalty(players) {
  return (players || [])
    .filter(p => p.injury === 'Out' && (p.stats?.pts ?? 0) >= KEY_PLAYER_PTS)
    .reduce((s, p) => s + p.stats.pts * KEY_PLAYER_OUT_FACTOR, 0);
}

const EU_PO_KEYWORDS = /quarter.final|semi.final|final|playoff|po round|round of/i;

function computeEUEstimate(player, isHome, oppGames, myGames, gamelogs, gameDate, league, round = '', oppName = '') {
  const season = player.stats;
  if (!season?.pts || season.pts < 2) return null;
  const leagueAvg = EU_LEAGUE_CONST_BG[league] || 83;
  const scaleFactor = NBA_REF_BG / leagueAvg;

  // Playoffs EU : détecté via le champ round api-sports ("Quarter-finals", "Semi-finals", "Finals"…)
  // Fallback par mois (avril-juillet) si round absent
  const inPO = round ? EU_PO_KEYWORDS.test(round) : (new Date(gameDate).getMonth() + 1 >= 4);

  // Scale schedules to NBA units
  const scale = g => ({ ...g, ptsScored: (g.ptsScored||0)*scaleFactor, ptsAllowed: (g.ptsAllowed||0)*scaleFactor });
  const hGames = myGames.map(scale);
  const oGames = oppGames.map(scale);

  const basePts = season.pts;
  const baseReb = season.reb || 0;
  const baseAst = season.ast || 0;
  const baseTpm = season.tpm || 0;

  // EWA sur tous les gamelogs (min>5min)
  const recentGl = gamelogs.filter(g=>(g.minutes||0)>5);
  // En PO : gamelogs du mois en cours prioritaires si ≥3 matchs
  const poGl = inPO ? recentGl.filter(g => new Date(g.date||g.event_date).getMonth()+1 >= 4) : [];
  const gl   = (inPO && poGl.length >= 3) ? poGl : recentGl;

  // Plafonne les pics isolés des matchs récents avant l'EWA (cf. winsorizeRecent, compute.js)
  const glPtsW = winsorizeRecent(gl, 'points',   basePts, calcStdBgEU(gl, 'points'));
  const glRebW = winsorizeRecent(gl, 'rebounds', baseReb, calcStdBgEU(gl, 'rebounds'));
  const glAstW = winsorizeRecent(gl, 'assists',  baseAst, calcStdBgEU(gl, 'assists'));
  const glTpmW = winsorizeRecent(gl, 'tpm',      baseTpm, calcStdBgEU(gl, 'tpm'));

  const ewaPts = calcEWAbg(glPtsW,'points',7)   ?? basePts;
  const ewaReb = baseReb > 0 ? (calcEWAbg(glRebW,'rebounds',7)  ?? baseReb) : 0;
  const ewaAst = baseAst > 0 ? (calcEWAbg(glAstW,'assists',7)   ?? baseAst) : 0;
  const ewaTpm = baseTpm > 0 ? (calcEWAbg(glTpmW,'tpm',7)       ?? baseTpm) : 0;

  // Blend EWA / saison : 65/35 en PO, 60/40 en RS
  const ewaW = inPO ? 0.65 : 0.60;
  const rsW  = 1 - ewaW;
  const blendPts = +(ewaW * ewaPts + rsW * basePts).toFixed(1);
  const blendReb = baseReb > 0 ? +(ewaW * ewaReb + rsW * baseReb).toFixed(1) : 0;
  const blendAst = baseAst > 0 ? +(ewaW * ewaAst + rsW * baseAst).toFixed(1) : 0;
  const blendTpm = baseTpm > 0 ? +(ewaW * ewaTpm + rsW * baseTpm).toFixed(1) : 0;

  const formFactor    = Math.min(1.35, Math.max(0.70, blendPts / basePts));
  const formFactorReb = baseReb > 0 ? Math.min(1.25, Math.max(0.80, blendReb / baseReb)) : 1.0;
  const formFactorAst = baseAst > 0 ? Math.min(1.25, Math.max(0.80, blendAst / baseAst)) : 1.0;
  const formFactorTpm = baseTpm > 0 ? Math.min(1.25, Math.max(0.80, blendTpm / baseTpm)) : 1.0;

  // Pace adversaire
  const oppPaceRaw = calcEWAbg(oGames,'ptsScored',5);
  const paceFactor = oppPaceRaw ? Math.min(1.10, Math.max(0.90, oppPaceRaw / (NBA_REF_BG*1.15))) : 1.0;

  // Défense adversaire
  const oppDef = calcEWAbg(oGames,'ptsAllowed',5);
  const defFactor = oppDef ? Math.min(1.20, Math.max(0.80, oppDef / NBA_REF_BG)) : 1.0;

  // Repos
  let restFactor = 1.0;
  if (recentGl.length>0) {
    const last = new Date(recentGl[0].date||recentGl[0].event_date);
    const diff = (new Date(gameDate)-last)/86400000;
    if (diff<1.5) restFactor=0.94;
    else if (diff>2.5) restFactor=1.02;
  }

  // Domicile/Extérieur : ±2.5% RS, ±4% PO
  const locFactor = isHome ? (inPO ? 1.04 : 1.025) : (inPO ? 0.96 : 0.975);

  // Streak (forme récente vs moyenne blend) — atténué ×0.5 en PO
  const streakFactor = (() => {
    const l3 = gl.slice(0,3).filter(g=>(g.minutes||0)>5).map(g=>g.points).filter(v=>v!=null);
    if (l3.length < 2) return 1.0;
    const l3Avg = l3.reduce((s,v)=>s+v,0)/l3.length;
    const raw = Math.min(1.12, Math.max(0.88, l3Avg / blendPts));
    return inPO ? 1 + (raw - 1) * 0.5 : raw;
  })();

  // Normalisation minutes — ajuste la projection si le joueur tourne plus ou moins que sa moyenne
  const minNormFactor = (() => {
    const allMins = recentGl.map(g => g.minutes || g.min).filter(m => m > 0);
    if (allMins.length < 4) return 1.0;
    const seasonAvgMin = allMins.reduce((s,v)=>s+v,0) / allMins.length;
    const recent2Mins  = allMins.slice(0, 2);
    const recentAvgMin = recent2Mins.reduce((s,v)=>s+v,0) / recent2Mins.length;
    const ratio = recentAvgMin / seasonAvgMin;
    // Baisse si -18% ou plus de minutes, boost si +15% ou plus, neutre entre les deux
    if (ratio >= 0.82 && ratio <= 1.15) return 1.0;
    return Math.min(1.10, Math.max(0.75, ratio));
  })();

  // FG% efficiency — récent (L3) vs long terme
  const fgFactor = (() => {
    const parseFG = s => {
      if (!s || s === '—') return null;
      const [m, a] = s.split('-').map(Number);
      return a > 0 ? m / a : null;
    };
    const allFG = recentGl.map(g => parseFG(g.fg)).filter(v => v != null);
    if (allFG.length < 5) return 1.0;
    const recentPct  = allFG.slice(0, 3).reduce((s,v)=>s+v,0) / 3;
    const longPct    = allFG.reduce((s,v)=>s+v,0) / allFG.length;
    if (longPct < 0.01) return 1.0;
    return Math.min(1.08, Math.max(0.93, recentPct / longPct));
  })();

  // H2H — performances vs cet adversaire précis (via champ opponent du gamelog)
  const h2hFactor = (() => {
    if (!oppName || blendPts < 1) return 1.0;
    const norm = s => (s||'').toLowerCase().replace(/[^a-z]/g,'');
    const oppNorm = norm(oppName).slice(0, 6);
    const h2hGl = recentGl.filter(g => {
      const opp = norm(g.opponent||'');
      return opp && opp.includes(oppNorm.slice(0,5));
    }).slice(0, 4);
    if (h2hGl.length < 1) return 1.0;
    const h2hAvg = h2hGl.reduce((s,g)=>s+g.points,0) / h2hGl.length;
    return Math.min(1.10, Math.max(0.90, h2hAvg / blendPts));
  })();

  // Densité calendrier — ≥3 matchs dans les 7 derniers jours = fatigue
  const densityFactor = (() => {
    const cutoff7 = new Date(gameDate).getTime() - 7 * 86400000;
    const count = recentGl.filter(g => new Date(g.date).getTime() > cutoff7).length;
    if (count >= 4) return 0.93;
    if (count >= 3) return 0.96;
    return 1.0;
  })();

  // Retour blessure — gap > 14j depuis le dernier match = atténuation
  const injReturnFactor = (() => {
    if (recentGl.length === 0) return 1.0;
    const lastDate   = new Date(recentGl[0].date);
    const daysSince  = (new Date(gameDate) - lastDate) / 86400000;
    if (daysSince > 21) return 0.85;
    if (daysSince > 14) return 0.92;
    return 1.0;
  })();

  const allMult = restFactor * locFactor * streakFactor * minNormFactor * fgFactor * h2hFactor * densityFactor * injReturnFactor;

  const multPts = Math.min(1.35, Math.max(0.72, formFactor    * paceFactor * defFactor * allMult));
  const multReb = Math.min(1.25, Math.max(0.78, formFactorReb *              defFactor * allMult));
  const multAst = Math.min(1.25, Math.max(0.78, formFactorAst * paceFactor *             allMult));
  const multTpm = Math.min(1.25, Math.max(0.78, formFactorTpm * paceFactor *             allMult));
  const estimatedRaw = basePts * multPts;
  const estReb    = baseReb * multReb;
  const estAst    = baseAst * multAst;
  const estTpm    = baseTpm * multTpm;

  // Ancrage volume × efficacité saison — n'affecte que pts (reb/ast/tpm inchangés)
  const volAnchor = getShotVolumeAnchor(gl, 'points', 'minutes');
  const estimated = volAnchor != null ? estimatedRaw * 0.85 + volAnchor * 0.15 : estimatedRaw;

  return {
    pts: Math.max(0, +estimated.toFixed(1)),
    reb: Math.max(0, +estReb.toFixed(1)),
    ast: Math.max(0, +estAst.toFixed(1)),
    tpm: Math.max(0, +estTpm.toFixed(1)),
    // Écart de la projection par rapport à la moyenne saison — sert à élargir le std dans probAtLeast
    deviation: { pts: Math.abs(multPts - 1), reb: Math.abs(multReb - 1), ast: Math.abs(multAst - 1), tpm: Math.abs(multTpm - 1) },
  };
}

// tpm gamelog au format "M-A" (ex: "3-7") ou déjà numérique si re-normalisé depuis le cache
const parseTpmMade = t => {
  if (typeof t === 'number') return t;
  if (!t || t === '—') return 0;
  const m = parseInt(String(t).split('-')[0]);
  return isNaN(m) ? 0 : m;
};

async function bgFetchEUGamelog(playerId, league, base) {
  const ck = `euro_gl_${playerId}`;
  const hit = _euroCache[ck];
  const normalize = games => games.map(g => ({
    ...g,
    minutes:  g.minutes  ?? g.min ?? 0,
    points:   g.points   ?? g.pts ?? 0,
    rebounds: g.rebounds ?? g.reb ?? 0,
    assists:  g.assists  ?? g.ast ?? 0,
    tpm:      parseTpmMade(g.tpm),
  }));
  if (hit && Date.now() - hit.ts < CACHE_6H) return normalize(hit.data.games || []);
  try {
    const ac = new AbortController(); setTimeout(() => ac.abort(), 10000);
    const resp = await fetch(`${base}/api/euro/${league}/playergamelog/${playerId}`, { signal: ac.signal });
    if (!resp.ok) return [];
    const json = await resp.json();
    const games = normalize(json.games || []);
    const best = _updateGlCache(`eu_${playerId}`, games);
    _euroCache[ck] = { data: { ...json, games: best }, ts: Date.now() };
    return best;
  } catch { return normalize(_glPersist[`eu_${playerId}`]?.games || []); }
}

async function runEUPropsAlerts(newAlerts, PORT) {
  // LNB exclue : pas de couverture gamelogs fiable (Bzzoiro ne couvre l'EL que pour Paris/Monaco) → projections non fiables, alertes désactivées
  const LEAGUES_EU = ['acb','bbl','legaa'];
  const base = `http://localhost:${PORT}`;
  const Q_STATUSES = ['Questionable','GTD','Game Time Decision','Doubtful','Day-To-Day'];
  // Resserrement du 8 juin 2026 (soir) : plancher = seuil "haute confiance" (badge vert) de
  // propConfColor/propBadgeClass — n'alerter que sur les % que l'app qualifie déjà de fiables.
  // Plus de distinction titulaire/remplaçant : le badge vert ne la fait pas non plus.
  // Relevé à 80% uniforme le 22 juin 2026 — alignement sur RESULT_ALERT_PROB/TOTAL_ALERT_PROB,
  // moins d'alertes mais plus sélectives (win rate réel mesuré à ~50% sur l'historique, cf. audit calibration).
  const ALERT_FLOOR = { pts: 0.80, reb: 0.80, ast: 0.80, tpm: 0.80 };
  const ALERT_FLOOR_BENCH = { pts: 0.80, reb: 0.80, ast: 0.80, tpm: 0.80 };
  const GL_KEY = { pts: 'points', reb: 'rebounds', ast: 'assists', tpm: 'tpm' };

  const calcStdBg = (games, key) => {
    const vals = games.filter(g => (g.minutes||0) > 5 && g[key] != null).map(g => g[key]);
    if (vals.length < 3) return null;
    const mean = vals.reduce((a,b) => a+b, 0) / vals.length;
    return Math.sqrt(vals.reduce((s,v) => s+(v-mean)**2, 0) / vals.length);
  };
  const probOver  = (est, std, threshold, stat, deviation = 0) => probAtLeast(est, std, threshold, stat, deviation);
  const probUnder = (est, std, threshold, stat, deviation = 0) => 1 - probAtLeast(est, std, Math.floor(threshold) + 1, stat, deviation);

  for (const league of LEAGUES_EU) {
    try {
      // Auto-fetch scoreboard si cache vide
      if (!_euroCache[`euro_sb_${league}`]?.data) {
        try {
          const r = await fetch(`${base}/api/euro/${league}/scoreboard`, { signal: AbortSignal.timeout(12000) });
          if (r.ok) await r.json(); // le endpoint peuple _euroCache lui-même
        } catch {}
      }
      const sbGames = _euroCache[`euro_sb_${league}`]?.data?.games || [];
      const euPairKey = g => [g.home?.name, g.away?.name].sort().join('__');
      // Bloquer paires avec un match live uniquement (le post-it gère le reste)
      const euLivePairs = new Set(sbGames.filter(g => g.status === 'STATUS_IN_PROGRESS').map(euPairKey));
      // Garder uniquement le match le plus proche par paire
      const euEarliestByPair = {};
      for (const g of sbGames.filter(g => g.status === 'STATUS_SCHEDULED' && g.home?.id && g.away?.id)) {
        const k = euPairKey(g);
        if (euLivePairs.has(k)) continue;
        if (!euEarliestByPair[k] || new Date(g.date) < new Date(euEarliestByPair[k].date)) euEarliestByPair[k] = g;
      }
      const upcoming = Object.values(euEarliestByPair);

      for (const game of upcoming) {
        try {
          const hoursToGame = (new Date(game.date).getTime() - Date.now()) / 3600000;

          // Rosters
          const [homePlayersR, awayPlayersR] = await Promise.all([
            fetch(`${base}/api/euro/${league}/players/${game.home.id}`,{signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():null).catch(()=>null),
            fetch(`${base}/api/euro/${league}/players/${game.away.id}`,{signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():null).catch(()=>null),
          ]);
          const homePlayers = homePlayersR?.players?.filter(p => p.stats?.pts >= 3) || [];
          const awayPlayers = awayPlayersR?.players?.filter(p => p.stats?.pts >= 3) || [];
          if (!homePlayers.length && !awayPlayers.length) continue;

          // Compo manuelle confirmée — marque "Out" les joueurs retirés que l'utilisateur a
          // explicitement déclarés absents (cf. confirmed/outPlayers de _euroLineups), pour
          // déclencher la redistribution déjà existante (même mécanisme que NBA/WNBA — il
          // manquait juste un signal côté EU, pas de flux blessures comme RotoWire ici).
          // ACB/BBL/LNB uniquement — Lega A a sa propre source officielle (legabasket.it).
          if (league !== 'legaa') {
            // Insensible à l'ordre des mots (Prénom Nom vs Nom Prénom) — api-sports.io n'est pas
            // cohérent sur l'ordre selon l'endpoint, voire selon le joueur au sein du même roster.
            const normEuName = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
              .replace(/[^a-z\s]/g,'').split(/\s+/).filter(Boolean).sort().join(' ');
            const applyManualOut = (players, teamId) => {
              const saved = _euroLineups[`${league}_${teamId}`];
              if (!saved?.confirmed || !saved.outPlayers?.length) return;
              if (saved.date && Math.abs(new Date(saved.date) - new Date(game.date)) > 3 * 86400_000) return;
              for (const out of saved.outPlayers) {
                if (out.status !== 'out') continue;
                const match = players.find(p => normEuName(p.name) === normEuName(out.name));
                if (match) match.injury = 'Out';
              }
            };
            applyManualOut(homePlayers, game.home.id);
            applyManualOut(awayPlayers, game.away.id);
          }

          // Injury gate (≤ 2.5h)
          const homeStarters = new Set(homePlayers.slice(0,5).map(p => String(p.id)));
          const awayStarters = new Set(awayPlayers.slice(0,5).map(p => String(p.id)));
          const homeGated = hoursToGame <= 2.5 && homePlayers.some(p => homeStarters.has(String(p.id)) && Q_STATUSES.includes(p.injury));
          const awayGated = hoursToGame <= 2.5 && awayPlayers.some(p => awayStarters.has(String(p.id)) && Q_STATUSES.includes(p.injury));
          if (homeGated) _bgLog.push(`EU gate home ${game.home.short} [${league}]`);
          if (awayGated) _bgLog.push(`EU gate away ${game.away.short} [${league}]`);

          // OUT redistribution — pool resserré aux 8 joueurs les plus utilisés (sur les 12 évalués
          // pour les props) pour que le boost ne se dilue pas sur tout le roster (19 juin 2026)
          const homeOutKey = homePlayers.filter(p => homeStarters.has(String(p.id)) && p.injury === 'Out');
          const awayOutKey = awayPlayers.filter(p => awayStarters.has(String(p.id)) && p.injury === 'Out');
          const homeTop8 = homePlayers.slice(0,12).filter(p => p.stats?.pts && p.injury !== 'Out');
          const awayTop8 = awayPlayers.slice(0,12).filter(p => p.stats?.pts && p.injury !== 'Out');
          const homeRedist = computeRedist(homeOutKey, homeTop8.slice(0, 8));
          const awayRedist = computeRedist(awayOutKey, awayTop8.slice(0, 8));

          // Schedules — auto-fetch si cache vide
          for (const teamId of [game.home.id, game.away.id]) {
            if (!_euroCache[`euro_sched_${league}_${teamId}`]?.data) {
              try {
                const r = await fetch(`${base}/api/euro/${league}/teamschedule/${teamId}`, { signal: AbortSignal.timeout(12000) });
                if (r.ok) await r.json();
              } catch {}
            }
          }
          const homeGames = _euroCache[`euro_sched_${league}_${game.home.id}`]?.data?.games || [];
          const awayGames = _euroCache[`euro_sched_${league}_${game.away.id}`]?.data?.games || [];
          if (homeGames.length < 3 && awayGames.length < 3) continue;

          // Props bookmakers
          const propsR = await fetch(`${base}/api/basketball/player-props?league=${league}&home=${encodeURIComponent(game.home.name)}&away=${encodeURIComponent(game.away.name)}&date=${encodeURIComponent(game.date)}`,{signal:AbortSignal.timeout(15000)}).then(r=>r.ok?r.json():null).catch(()=>null);
          const propsPlayers = propsR?.players || {};
          if (!Object.keys(propsPlayers).length) { _bgLog.push(`EU no props ${game.home.short}v${game.away.short} [${league}]`); continue; }
          _bgLog.push(`EU props OK ${game.home.short}v${game.away.short} [${league}]: ${Object.keys(propsPlayers).length} joueurs`);

          if (propsR?.found) _saveLinesSnapshot(`bball_pprops3_${league}_${game.home.name}_${game.away.name}`.toLowerCase().replace(/\s+/g,'_'), propsR);

          // Précalcul des estimates — gamelogs fetchés uniquement pour les joueurs avec une ligne props
          const allPlayers = [...homeTop8, ...awayTop8];
          const ln = n => (n||'').split(' ').pop().toLowerCase();
          const playersWithProps = allPlayers.filter(rosterP =>
            Object.keys(propsPlayers).some(pn =>
              rosterP.name?.toLowerCase() === pn.toLowerCase() || ln(rosterP.name) === ln(pn)
            )
          );
          const gamelogsAll = await Promise.all(
            playersWithProps.map(p => bgFetchEUGamelog(p.id, league, base))
          );
          const gamelogById = {};
          playersWithProps.forEach((p, i) => { gamelogById[p.id] = gamelogsAll[i]; });

          const estimatesMap = {};
          for (const rosterP of playersWithProps) {
            const isHome = homePlayers.some(p => p.id === rosterP.id);
            const myGames  = isHome ? homeGames : awayGames;
            const oppGames = isHome ? awayGames : homeGames;
            const gamelogs = gamelogById[rosterP.id] || [];
            const lastGlDateEU = gamelogs[0]?.event_date?.slice(0,10) ?? gamelogs[0]?.date?.slice(0,10) ?? null;

            // Filtre minutes EU (champ 'minutes')
            { const avg = avgRecentMin(gamelogs, 'minutes'); if (avg !== null && avg < MIN_AVG_MINUTES) { _bgLog.push(`skip eu ${rosterP.name}: avg min ${avg.toFixed(1)}`); continue; } }

            // Post-it EU : si dernier match du joueur inchangé → utilise la valeur gelée
            if (new Date(game.date) > Date.now()) {
              const snapEU = _projectionsSnapshot[game.id]?.[String(rosterP.id)];
              if (snapEU && snapEU._lastGame === lastGlDateEU && snapEU.pts != null) {
                // Backfill tpm sur les snapshots gelés avant l'ajout du 10 juin 2026 (pts/reb/ast restent figés)
                if (snapEU.tpm == null) {
                  const oppNameBf = isHome ? game.away.name : game.home.name;
                  const tpmEst = computeEUEstimate(rosterP, isHome, oppGames, myGames, gamelogs, game.date, league, game.round, oppNameBf);
                  if (tpmEst?.tpm != null) {
                    const redistFactorBf = isHome ? (homeRedist[String(rosterP.id)] ?? 1) : (awayRedist[String(rosterP.id)] ?? 1);
                    snapEU.tpm = redistFactorBf > 1 ? +(tpmEst.tpm * redistFactorBf).toFixed(1) : tpmEst.tpm;
                    snapEU.deviation = { ...(snapEU.deviation || {}), tpm: tpmEst.deviation?.tpm ?? 0 };
                    _saveSnapshot();
                  }
                }
                estimatesMap[rosterP.id] = { est: { pts: snapEU.pts, reb: snapEU.reb, ast: snapEU.ast, tpm: snapEU.tpm }, isHome, gamelogs };
                continue;
              }
            }

            const oppName = isHome ? game.away.name : game.home.name;
            const est = computeEUEstimate(rosterP, isHome, oppGames, myGames, gamelogs, game.date, league, game.round, oppName);
            if (!est) continue;

            // Redist OUT
            const redistFactor = isHome ? (homeRedist[String(rosterP.id)] ?? 1) : (awayRedist[String(rosterP.id)] ?? 1);
            if (redistFactor > 1) {
              est.pts = +(est.pts * redistFactor).toFixed(1);
              est.reb = +(est.reb * redistFactor).toFixed(1);
              est.ast = +(est.ast * redistFactor).toFixed(1);
              est.tpm = est.tpm != null ? +(est.tpm * redistFactor).toFixed(1) : est.tpm;
            }
            estimatesMap[rosterP.id] = { est, isHome, gamelogs };

            if (new Date(game.date) > Date.now()) {
              if (!_projectionsSnapshot[game.id]) _projectionsSnapshot[game.id] = {};
              const lastGlDateEU2 = gamelogById[rosterP.id]?.[0]?.event_date?.slice(0,10) ?? gamelogById[rosterP.id]?.[0]?.date?.slice(0,10) ?? null;
              _projectionsSnapshot[game.id][String(rosterP.id)] = {
                name: rosterP.name, team: isHome ? game.home.short : game.away.short,
                pts: est.pts, reb: est.reb, ast: est.ast, tpm: est.tpm,
                deviation: est.deviation,
                _lastGame: lastGlDateEU2,
              };
            }
          }
          _saveSnapshot();

          for (const [playerName, bkLines] of Object.entries(propsPlayers)) {
            const rosterP = playersWithProps.find(p =>
              p.name?.toLowerCase() === playerName.toLowerCase() || ln(p.name) === ln(playerName)
            );
            if (!rosterP || !estimatesMap[rosterP.id]) continue;
            const { est, gamelogs, isHome } = estimatesMap[rosterP.id];

            if (isHome && homeGated) continue;
            if (!isHome && awayGated) continue;

            for (const stat of ['pts','reb','ast','tpm']) {
              const refBk = ['unibet','betclic','winamax'].find(b => bkLines[b]?.[stat]?.line);
              if (!refBk) continue;
              const refLine = bkLines[refBk][stat];
              const estVal  = est[stat];
              if (!estVal) continue;

              const glFilt = gamelogs.filter(g => (g.minutes||0) > 5);
              const std = calcStdBg(glFilt, GL_KEY[stat]);

              const minVarianceAdj = (() => {
                const mins = glFilt.slice(0,8).map(g => g.minutes).filter(m => m > 0);
                if (mins.length < 3) return 0;
                const mean = mins.reduce((a,b)=>a+b,0)/mins.length;
                const sd = Math.sqrt(mins.reduce((s,v)=>s+(v-mean)**2,0)/mins.length);
                return (mean > 0 && sd/mean > 0.35) ? -0.08 : 0;
              })();

              const deviation = est.deviation?.[stat] ?? 0;
              const pOver  = Math.max(0, probOver(estVal, std, refLine.line, stat, deviation) + minVarianceAdj);
              const pUnder = Math.max(0, probUnder(estVal, std, refLine.line, stat, deviation) + minVarianceAdj);
              _bgLog.push(`EU dbg [${league}] ${rosterP.name} ${stat}: est=${estVal?.toFixed(1)} line=${refLine.line} std=${std?.toFixed(1)} pOver=${Math.round(pOver*100)}% pUnder=${Math.round(pUnder*100)}%`);

              const ubLine = bkLines.unibet?.[stat] ?? null;
              const bcLine = bkLines.betclic?.[stat] ?? null;
              const wmLine = bkLines.winamax?.[stat] ?? null;
              const _euConsistent = isConsistentStatEU(gamelogs, stat);
              const alertBase = {
                type: 'player_prop', league, eventId: game.id,
                home: game.home.name, away: game.away.name,
                homeShort: game.home.short, awayShort: game.away.short,
                player: rosterP.name,
                team: isHome ? game.home.short : game.away.short,
                fixture: `${game.home.short} vs ${game.away.short}`,
                round: '', fixtureDate: game.date,
                homeTeam: game.home.name, awayTeam: game.away.name,
                stat, line: refLine.line, estimate: estVal,
                pinnacleOdds: null,
                unibetLine: ubLine?.line ?? null,
                winamaxLine: wmLine?.line ?? null,
                betclicLine: bcLine?.line ?? null,
                injury: rosterP.injury || null,
                savedAt: Date.now(),
                ...(_euConsistent ? { consistentStat: true } : {}),
              };
              // Sauvegarde prob dans snapshot (accessible même sans ouvrir la page)
              if (!_projectionsSnapshot[game.id]) _projectionsSnapshot[game.id] = {};
              const _se = _projectionsSnapshot[game.id][String(rosterP.id)] || { name: rosterP.name, team: isHome ? game.home.short : game.away.short, pts: est.pts, reb: est.reb, ast: est.ast, tpm: est.tpm, deviation: est.deviation };
              if (!_se.probs) _se.probs = {};
              _se.probs[stat] = { pOver: +pOver.toFixed(3), pUnder: +pUnder.toFixed(3), line: refLine.line, ubOver: ubLine?.over??null, bcOver: bcLine?.over??null, wmOver: wmLine?.over??null, ubUnder: ubLine?.under??null, bcUnder: bcLine?.under??null, wmUnder: wmLine?.under??null };
              _projectionsSnapshot[game.id][String(rosterP.id)] = _se;

              const _euIsStarter = isHome ? homeStarters.has(String(rosterP.id)) : awayStarters.has(String(rosterP.id));
              // Plancher abaissé à 75% si la joueuse est "spécialiste" de cette stat (régulière sur
              // ses 10+ derniers matchs réels — cf. isConsistentStatEU) — décision du 22 juin 2026.
              const floor = _euConsistent ? 0.75 : ((_euIsStarter ? ALERT_FLOOR[stat] : ALERT_FLOOR_BENCH[stat]) || 0.85);
              const _euSeasonAvg = rosterP.stats?.[stat];
              const _euEdge = Math.abs(estVal - refLine.line);
              // Marge moyenne saison ↔ ligne + minimum de volume TPM — étendu de la WNBA aux ligues EU le 22 juin 2026
              const _euMarginOverOk  = _euSeasonAvg == null || _euSeasonAvg >= refLine.line + SEASON_MARGIN[stat];
              const _euMarginUnderOk = _euSeasonAvg == null || _euSeasonAvg <= refLine.line - SEASON_MARGIN[stat];
              const _euTpmVolOk = stat !== 'tpm' || (_euSeasonAvg??0) >= TPM_MIN_SEASON_AVG;
              const _euOverOk  = pOver  >= floor && _euEdge >= minEdgeFor(stat, 'over',  _euSeasonAvg) && _euMarginOverOk && _euTpmVolOk;
              const _euUnderOk = pUnder >= floor && _euEdge >= minEdgeFor(stat, 'under', _euSeasonAvg) && _euMarginUnderOk;
              if (_euOverOk && hasValidOverOdds(ubLine?.over??null, wmLine?.over??null, bcLine?.over??null)) {
                newAlerts.push({ ...alertBase, id:`${game.id}_eu_${rosterP.id}_${stat}_over_${refLine.line}`, direction:'over',  probability:Math.round(pOver*100),  unibetOdds:capOdds(ubLine?.over??null),  winamaxOdds:capOdds(wmLine?.over??null),  betclicOdds:capOdds(bcLine?.over??null) });
              } else if (_euOverOk) {
                const alt = findLadderAlternative({ direction: 'over', refLineValue: refLine.line, bks: bkLines, stat,
                  computeProbAtLine: line => Math.max(0, probOver(estVal, std, line, stat, deviation) + minVarianceAdj),
                  passesOtherGates: (line, p) => {
                    const marginOk = _euSeasonAvg == null || _euSeasonAvg >= line + SEASON_MARGIN[stat];
                    return p >= floor && Math.abs(estVal - line) >= minEdgeFor(stat, 'over', _euSeasonAvg) && marginOk && _euTpmVolOk;
                  } });
                if (alt) newAlerts.push({ ...alertBase, line: alt.line, id:`${game.id}_eu_${rosterP.id}_${stat}_over_${alt.line}`, direction:'over', probability:Math.round(alt.p*100), unibetOdds: alt.book==='unibet'?capOdds(alt.odds):null, winamaxOdds:null, betclicOdds: alt.book==='betclic'?capOdds(alt.odds):null, lineSource:'ladder' });
              } else if (_euUnderOk && hasValidUnderOdds(ubLine?.under??null, wmLine?.under??null, bcLine?.under??null)) {
                newAlerts.push({ ...alertBase, id:`${game.id}_eu_${rosterP.id}_${stat}_under_${refLine.line}`, direction:'under', probability:Math.round(pUnder*100), unibetOdds:capOdds(ubLine?.under??null), winamaxOdds:capOdds(wmLine?.under??null), betclicOdds:capOdds(bcLine?.under??null) });
              } else if (_euUnderOk) {
                const alt = findLadderAlternative({ direction: 'under', refLineValue: refLine.line, bks: bkLines, stat,
                  computeProbAtLine: line => Math.max(0, probUnder(estVal, std, line, stat, deviation) + minVarianceAdj),
                  passesOtherGates: (line, p) => {
                    const marginOk = _euSeasonAvg == null || _euSeasonAvg <= line - SEASON_MARGIN[stat];
                    return p >= floor && Math.abs(estVal - line) >= minEdgeFor(stat, 'under', _euSeasonAvg) && marginOk;
                  } });
                if (alt) newAlerts.push({ ...alertBase, line: alt.line, id:`${game.id}_eu_${rosterP.id}_${stat}_under_${alt.line}`, direction:'under', probability:Math.round(alt.p*100), unibetOdds: alt.book==='unibet'?capOdds(alt.odds):null, winamaxOdds:null, betclicOdds: alt.book==='betclic'?capOdds(alt.odds):null, lineSource:'ladder' });
              }
              else if (!_euMarginOverOk && pOver>=floor) { _bgLog.push(`block EU [${league}] ${stat} over ${rosterP.name}: moy saison ${(_euSeasonAvg??0).toFixed(1)} < ligne ${refLine.line} + marge ${SEASON_MARGIN[stat]}`); }
              else if (!_euTpmVolOk && pOver>=floor) { _bgLog.push(`block EU [${league}] tpm over ${rosterP.name}: moy saison ${(_euSeasonAvg??0).toFixed(1)} < ${TPM_MIN_SEASON_AVG}`); }
              else if (!_euMarginUnderOk && pUnder>=floor) { _bgLog.push(`block EU [${league}] ${stat} under ${rosterP.name}: moy saison ${(_euSeasonAvg??0).toFixed(1)} > ligne ${refLine.line} - marge ${SEASON_MARGIN[stat]}`); }
            }
          }
        } catch { /* skip game */ }
      }
    } catch { /* skip league */ }
  }
}

// Alerte valide uniquement si Unibet OU Betclic >= 1.55 (Winamax ignoré pour le filtre)
// Probabilité "affichage" — recalcule avec les mêmes ajustements que PropsSection (front)
// pour que le % montré sur l'alerte corresponde à celui d'Analyse Props. N'influence PAS
// le déclenchement de l'alerte (qui reste basé sur pOver/pUnder bruts + planchers existants).
function displayProb(estVal, rawStd, fallbackStd, gamelog, refLineLine, stat, deviation, gameDate, lastGameStr, isWNBA = false) {
  const recentMins = (gamelog || []).slice(0, 8).map(g => g.min).filter(m => m > 0);
  let minCV = 0;
  if (recentMins.length >= 3) {
    const mean = recentMins.reduce((s, v) => s + v, 0) / recentMins.length;
    if (mean >= 1) {
      const sd = Math.sqrt(recentMins.reduce((s, v) => s + (v - mean) ** 2, 0) / recentMins.length);
      minCV = sd / mean;
    }
  }
  const minInflation = 1 + minCV * 0.8;
  const daysSinceLast = lastGameStr ? (new Date(gameDate) - new Date(lastGameStr)) / 86400000 : 0;
  const staleInflation = daysSinceLast > 5 ? 1 + Math.min(0.4, (daysSinceLast - 5) * 0.04) : 1;
  const baseStd = rawStd ?? fallbackStd;
  if (baseStd == null) return null;
  const std = baseStd * minInflation * staleInflation;
  const threshold = Math.ceil(refLineLine);
  const rawPOver = probAtLeast(estVal, std, threshold, stat, deviation, isWNBA, (gamelog || []).length);
  const gap = Math.abs(estVal - refLineLine) / refLineLine;
  const sanityMax = gap > 0.25 ? 0.75 : 1.0;
  const minVarianceAdj = minCV > 0.35 ? -0.08 : 0;
  const pOver = Math.max(0, Math.min(sanityMax, rawPOver) + minVarianceAdj);
  return { pOver, pUnder: Math.max(0, 1 - pOver) };
}

const hasValidUnderOdds = (ub, wm, bc) => (ub != null && ub >= 1.60) || (bc != null && bc >= 1.60);
const hasValidOverOdds  = (ub, wm, bc) => (ub != null && ub >= 1.60) || (bc != null && bc >= 1.60);
const capOdds = o => (o != null && o >= 1.60) ? o : null;

// Échelle de lignes alternative (PlayerLinesPage — betclicAllLines/unibetAllLines) : si la ligne
// "de référence" a une proba suffisante mais une cote trop juste (<1.50 partout), cherche une ligne
// voisine dans le sens qui fait MONTER la cote du côté retenu (over → ligne plus haute, under →
// plus basse). La proba est recalculée à CHAQUE ligne testée (computeProbAtLine), jamais réutilisée
// depuis refLine. Parmi les candidates qui repassent tous les seuils (passesOtherGates), garde la
// plus sûre (proba la plus haute). Renvoie null si aucune ne convient.
function findLadderAlternative({ direction, refLineValue, bks, stat, computeProbAtLine, passesOtherGates }) {
  const ladder = [
    ...(bks?.unibetAllLines?.[stat]  || []).map(l => ({ ...l, book: 'unibet'  })),
    ...(bks?.betclicAllLines?.[stat] || []).map(l => ({ ...l, book: 'betclic' })),
  ];
  if (!ladder.length) return null;
  const candidates = ladder.filter(l => direction === 'over' ? l.line > refLineValue : l.line < refLineValue);
  let best = null;
  for (const cand of candidates) {
    const odds = direction === 'over' ? cand.over : cand.under;
    if (odds == null || odds < 1.60) continue;
    const p = computeProbAtLine(cand.line);
    if (p == null || !passesOtherGates(cand.line, p)) continue;
    if (!best || p > best.p) best = { line: cand.line, odds, book: cand.book, p };
  }
  return best;
}
const GAP_THRESHOLD = 0.30;
const GAP_MIN_ODDS  = 1.40;
// Génère une alerte gap si BC ou UB est >= WM + 0.30 sur le même cut
function makeGapAlert(base, stat, direction, line, bcOdds, ubOdds, wmOdds, idSuffix) {
  if (!wmOdds) return null;
  const bcGap = bcOdds ? +(bcOdds - wmOdds).toFixed(2) : 0;
  const ubGap = ubOdds ? +(ubOdds - wmOdds).toFixed(2) : 0;
  const maxGap = Math.max(bcGap, ubGap);
  if (maxGap < GAP_THRESHOLD) return null;
  const gapSource = bcGap >= ubGap ? 'betclic' : 'unibet';
  const bestOdds  = bcGap >= ubGap ? bcOdds : ubOdds;
  if (!bestOdds || bestOdds < GAP_MIN_ODDS) return null;
  return { ...base, id: `${idSuffix}_gap`, direction, stat, line, probability: 0,
    gapAlert: true, gapAmount: maxGap, gapSource,
    betclicOdds: bcOdds ?? null, unibetOdds: ubOdds ?? null, winamaxOdds: wmOdds };
}

// Retourne la moyenne de minutes sur les 5 derniers matchs joués (min > 0), ou null si pas de data
const avgRecentMin = (gl, key = 'min') => {
  const played = (gl || []).filter(g => (g[key] ?? 0) > 0).slice(0, 5);
  if (!played.length) return null;
  return played.reduce((s, g) => s + (g[key] ?? 0), 0) / played.length;
};
const MIN_AVG_MINUTES = 10; // en dessous → pas d'alerte (joueur fin de banc)

// Edge minimum (10 juin 2026) — écart |estimation - ligne| requis avant d'envoyer une alerte.
// Backtest 17 paris : edge < 1.0 → 0% de réussite (paris "pile ou face"). edge >= 1.0 → 62%.
const MIN_EDGE = 1.0;
// Franchise players (gros volume saison sur cette stat) : edge renforcé sur Under, car ils
// peuvent exploser leur ligne n'importe quel soir (cf. A. Reese 9.5 proj → 17 réel).
const FRANCHISE_MIN_EDGE   = 2.0;
const FRANCHISE_THRESHOLD  = { pts: 18, reb: 9, ast: 6, tpm: 3 };
function minEdgeFor(stat, direction, seasonAvgStat) {
  if (direction === 'under' && seasonAvgStat != null && seasonAvgStat >= FRANCHISE_THRESHOLD[stat]) return FRANCHISE_MIN_EDGE;
  return MIN_EDGE;
}

// Resserrement du 8 juin 2026 (soir) : plancher = seuil "haute confiance" (badge vert) de
// propConfColor/propBadgeClass — n'alerter que sur les % que l'app qualifie déjà de fiables.
// Remplace l'ancien plancher (calé sur le bas de la bande jaune/cyan), qui généra un volume
// d'alertes trop élevé. Plus de distinction titulaire/remplaçant : le badge vert ne la fait pas non plus.
// Relevé à 80% uniforme le 22 juin 2026 — alignement sur RESULT_ALERT_PROB/TOTAL_ALERT_PROB,
// moins d'alertes mais plus sélectives (win rate réel mesuré à ~50% sur l'historique, cf. audit calibration).
const NBA_ALERT_FLOOR       = { pts: 0.80, reb: 0.80, ast: 0.80, tpm: 0.80 };
const NBA_ALERT_FLOOR_BENCH = { pts: 0.80, reb: 0.80, ast: 0.80, tpm: 0.80 };
const WNBA_ALERT_FLOOR       = { pts: 0.77, reb: 0.77, ast: 0.80, tpm: 0.77 }; // ast inchangé à 0.80
const WNBA_ALERT_FLOOR_BENCH = { pts: 0.80, reb: 0.80, ast: 0.80, tpm: 0.80 };
const WNBA_SPECIALIST_FLOOR  = 0.72; // spécialiste WNBA (isConsistentStat par stat) — NBA/EU restent à 0.75
const TPM_MIN_SEASON_AVG       = 1.5;  // NBA/EU — shooteuses/tireurs élites seulement
const WNBA_TPM_MIN_SEASON_AVG  = 1.2;  // WNBA — seuil abaissé (Loyd, Stewart, Plum ~ 1.2-1.5/match)
// Marge mini entre moyenne saison et ligne bookmaker, par stat — initialement WNBA seulement (REB,
// marge 0.3, depuis le 16 juin), étendue le 22 juin 2026 à pts/ast/tpm (proportionnellement aux
// planchers std du modèle : pts 4.0/reb 2.0/ast 1.5/tpm 1.0, même ratio ~0.15 que REB), puis à
// NBA et aux ligues EU (ACB/LNB/BBL/Lega A) le même jour — mêmes valeurs partout, la volatilité
// relative par stat s'est révélée quasi identique entre groupes de ligues (cf. seuils "spécialiste").
const SEASON_MARGIN      = { pts: 0.6,  reb: 0.3,  ast: 0.25, tpm: 0.15 }; // NBA + EU
const WNBA_SEASON_MARGIN = { pts: 0.4,  reb: 0.2,  ast: 0.25, tpm: 0.10 }; // WNBA — ast inchangé

// Effet cross-équipe : adverse titulaire Q → bloquer l'alerte ; OUT → booster la projection
function oppInjuryEffect(oppPlayers, oppStarters, playerPos, stat, hoursToGame, Q_STATUSES) {
  const isBig   = pos => /^(C|F|PF|SF|C-F|F-C)/i.test(String(pos || ''));
  const isGuard = pos => /^(G|PG|SG|G-F|F-G)/i.test(String(pos || ''));
  const playerIsBig = isBig(playerPos);
  const isRelevant = pos => {
    if (stat === 'reb') return isBig(pos);
    if (stat === 'ast' || stat === 'tpm') return isGuard(pos);
    if (stat === 'pts') return playerIsBig ? isBig(pos) : isGuard(pos);
    return false;
  };
  const relevant = (oppPlayers || []).filter(p => oppStarters.has(String(p.id)) && isRelevant(p.position));
  const outCount = relevant.filter(p => p.injury === 'Out').length;
  const hasQ = hoursToGame <= 2.5 && relevant.some(p => (Q_STATUSES || []).includes(p.injury));
  const boost = stat === 'reb' ? outCount * 0.12 : outCount * 0.08;
  return { factor: 1 + boost, shouldBlock: hasQ && outCount === 0 };
}

async function generateBackgroundAlerts() {
  _bgLastRun = Date.now();
  _bgLog = ['started'];
  console.log('[bg-alerts] Running…');
  try {
    // 1. Fetch upcoming NBA games from ESPN
    // Fetch i=-10..-1 (10 derniers jours, pour retrouver le dernier match FINAL d'une série → gel des projections)
    // puis i=0 (aujourd'hui UTC), i=1 (demain UTC), i=2 (J+2 UTC) avec dates explicites
    // pour éviter l'ambiguïté de fuseau horaire ESPN (matchs ET pouvant tomber sur un jour UTC différent)
    const allEvents = [];
    for (let i = -10; i <= 2; i++) {
      const dateStr = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
      const r = await fetch(`${ESPN_SCOREBOARD}?dates=${dateStr}&limit=50`);
      if (r.ok) allEvents.push(...((await r.json()).events || []));
    }
    const seen = new Set();
    const cutoff = Date.now() + 36 * 3600 * 1000;
    const allUpcoming = allEvents
      .filter(ev => { if (seen.has(ev.id)) return false; seen.add(ev.id); return true; })
      .map(normalizeGame).filter(Boolean)
      .filter(g => g.status === 'STATUS_SCHEDULED' && new Date(g.date).getTime() <= cutoff);
    // For each team pair, keep only the earliest scheduled game.
    // Also block pairs that currently have a game IN_PROGRESS (Game N running → no alert for Game N+1).
    const pairKey = g => [g.home.name, g.away.name].sort().join('__');
    const LIVE_STATUSES = new Set(['STATUS_IN_PROGRESS','STATUS_HALFTIME','STATUS_END_PERIOD','STATUS_OVERTIME','STATUS_FIRST_HALF','STATUS_SECOND_HALF']);
    const isLiveStatus = s => LIVE_STATUSES.has(s) || (s && !s.includes('FINAL') && !s.includes('SCHEDULED') && !s.includes('POSTPONED'));
    const liveGames = allEvents.map(normalizeGame).filter(Boolean)
      .filter(g => isLiveStatus(g.status));
    const livePairs = new Set(liveGames.map(pairKey));
    const earliestByPair = {};
    for (const g of allUpcoming) {
      const k = pairKey(g);
      if (livePairs.has(k)) continue;
      if (!earliestByPair[k] || new Date(g.date) < new Date(earliestByPair[k].date)) earliestByPair[k] = g;
    }
    const upcoming = Object.values(earliestByPair);

    // For each upcoming game pair, find the most recent completed game in the series (to validate gamelogs)
    const allNormalized = allEvents.map(normalizeGame).filter(Boolean);
    const lastSeriesGame = {}; // pairKey → Date of last STATUS_FINAL game
    for (const g of allNormalized) {
      if (!g.status.includes('STATUS_FINAL')) continue;
      const k = pairKey(g);
      const d = new Date(g.date);
      if (!lastSeriesGame[k] || d > lastSeriesGame[k]) lastSeriesGame[k] = d;
    }

    _bgLog.push(`upcoming: ${upcoming.map(g=>g.home.short+'v'+g.away.short).join(', ')}`);
    if (!upcoming.length) { console.log('[bg-alerts] No upcoming NBA games'); _bgLog.push('no upcoming NBA'); }

    // Fetch USG% / TS% once for all players (skip if slow — it's optional for USG factor)
    const fetchWithTimeout = (url, ms = 5000) => {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), ms);
      return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t));
    };
    const normTeam = s => s.toLowerCase().replace(/[^a-z]/g, '');
    const lastWord = s => s.trim().split(' ').pop();
    const nameMatch = (a, b) => {
      if (!a || !b) return false;
      if (a.toLowerCase() === b.toLowerCase()) return true;
      const parse = n => { n = n.trim(); if (!/\s/.test(n)) { const d = n.indexOf('.'); return d > 0 ? { first: n.slice(0, d), last: n.slice(d + 1) } : { first: '', last: n }; } const parts = n.split(/\s+/); return { first: parts[0].replace(/\.$/, ''), last: parts.slice(-1)[0] }; };
      const pa = parse(a), pb = parse(b);
      if (pa.last.toLowerCase() !== pb.last.toLowerCase()) return false;
      if (!pa.first || !pb.first) return true;
      const fa = pa.first.toLowerCase(), fb = pb.first.toLowerCase();
      const minLen = Math.min(fa.length, fb.length, 3);
      return fa.startsWith(fb) || fb.startsWith(fa) || (minLen >= 3 && fa.slice(0, minLen) === fb.slice(0, minLen));
    };

    const newAlerts = [];

    // Helper : construit la base d'une alerte NBA
    const baseAlert = (player, game, isHome, stat, line, estVal, teamHasQ = null) => ({
      type: 'player_prop', league: 'nba', eventId: game.id,
      home: game.home.name, away: game.away.name,
      homeShort: game.home.short, awayShort: game.away.short,
      homeTeam: game.home.name, awayTeam: game.away.name,
      player: player.name, team: isHome ? game.home.short : game.away.short,
      fixture: `${game.home.short} vs ${game.away.short}`,
      round: '', fixtureDate: game.date,
      stat, line, estimate: estVal,
      pinnacleOdds: null,
      injury: player.injury || null,
      ...(teamHasQ?.length ? { teamHasQ } : {}),
      savedAt: Date.now(),
    });

    for (const game of upcoming) {
      const homeId = ESPN_NBA_MAP[game.home.name];
      const awayId = ESPN_NBA_MAP[game.away.name];
      if (!homeId || !awayId) continue;

      // Fetch defense-by-position for both teams
      const [homeDefByPos, awayDefByPos] = await Promise.all([
        fetchWithTimeout(`http://localhost:${process.env.PORT || 3001}/api/nba/teamdefbypos/${homeId}`, 5000).then(r => r.ok ? r.json() : null).catch(() => null),
        fetchWithTimeout(`http://localhost:${process.env.PORT || 3001}/api/nba/teamdefbypos/${awayId}`, 5000).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      // Player props — appelle directement la route qui gère scraping + cache + format
      let scrapedPlayers = null;
      try {
        const propsResp = await fetchWithTimeout(
          `http://localhost:${process.env.PORT || 3001}/api/basketball/player-props?league=nba&home=${encodeURIComponent(game.home.name)}&away=${encodeURIComponent(game.away.name)}&date=${encodeURIComponent(game.date)}`,
          25000
        );
        const propsData = propsResp.ok ? await propsResp.json() : null;
        scrapedPlayers = propsData?.players ?? null;
        if (propsData?.found && scrapedPlayers) {
          const lk = `bball_pprops3_nba_${game.home.name}_${game.away.name}`.toLowerCase().replace(/\s+/g, '_');
          _saveLinesSnapshot(lk, propsData);
        }
      } catch { scrapedPlayers = null; }

      if (!scrapedPlayers || !Object.keys(scrapedPlayers).length) { _bgLog.push(`no props for ${game.home.short}v${game.away.short}`); continue; }
      _bgLog.push(`props OK for ${game.home.short}v${game.away.short}: ${Object.keys(scrapedPlayers).length} players`);

      // 3. Fetch rosters + schedules en parallèle
      const [homePlayers, awayPlayers, homeSched, awaySched] = await Promise.all([
        bgFetchRoster(homeId), bgFetchRoster(awayId),
        bgFetchSchedule(homeId), bgFetchSchedule(awayId),
      ]);

      // 4. Fetch all gamelogs in parallel (top 8 per team)
      const gameMonth   = new Date(game.date).getMonth() + 1;
      const isPlayoff   = gameMonth >= 4 && gameMonth <= 6;
      const roundStr    = isPlayoff ? 'game' : '';
      const hoursToGame = (new Date(game.date).getTime() - Date.now()) / 3600000;

      // Injury gate — saison régulière ET playoffs (étendu 19 juin 2026, était playoffs-only),
      // s'active à ≤ 2h30 avant le match. Bloque par ÉQUIPE (pas par game) : l'équipe adverse
      // continue à générer des alertes.
      const Q_STATUSES   = ['Questionable', 'GTD', 'Game Time Decision', 'Doubtful', 'Day-To-Day'];
      const homeStarters = new Set(homePlayers.slice(0, 5).map(p => String(p.id)));
      const awayStarters = new Set(awayPlayers.slice(0, 5).map(p => String(p.id)));
      const isStarter    = (p, starters) => starters.has(String(p.id));
      const homeGated = hoursToGame <= 2.5 && homePlayers.some(p => isStarter(p, homeStarters) && Q_STATUSES.includes(p.injury));
      const awayGated = hoursToGame <= 2.5 && awayPlayers.some(p => isStarter(p, awayStarters) && Q_STATUSES.includes(p.injury));
      if (homeGated || awayGated) {
        const names = [
          ...homePlayers.filter(p => isStarter(p, homeStarters) && Q_STATUSES.includes(p.injury)).map(p => `${p.name}(Q/home)`),
          ...awayPlayers.filter(p => isStarter(p, awayStarters) && Q_STATUSES.includes(p.injury)).map(p => `${p.name}(Q/away)`),
        ].join(', ');
        _bgLog.push(`gate ${game.home.short}v${game.away.short}: ${names}`);
        console.log(`[bg-alerts] Injury gate ${game.home.short}v${game.away.short}: ${names}`);
      }

      // Redistribution des minutes si joueur clé confirmé Out — toujours actif (régulière + playoffs),
      // même logique que WNBA (cf. computeRedist)
      const homeOutKeyRaw = homePlayers.filter(p => isStarter(p, homeStarters) && p.injury === 'Out');
      const awayOutKeyRaw = awayPlayers.filter(p => isStarter(p, awayStarters) && p.injury === 'Out');
      // Exclut les absences déjà installées toute la saison (0 match joué) : la baseline des
      // coéquipiers (gamelogs/EWA) reflète déjà son absence, redistribuer en plus double-compterait l'usage
      const outKeyGamelogsNBA = await Promise.all([...homeOutKeyRaw, ...awayOutKeyRaw].map(p => bgFetchGamelog(p.id)));
      const outPlayedNBA = new Set([...homeOutKeyRaw, ...awayOutKeyRaw].filter((p, i) => outKeyGamelogsNBA[i].length > 0).map(p => String(p.id)));
      const homeOutKey = homeOutKeyRaw.filter(p => outPlayedNBA.has(String(p.id)));
      const awayOutKey = awayOutKeyRaw.filter(p => outPlayedNBA.has(String(p.id)));

      const homeTop8 = homePlayers.slice(0, 12).filter(p => p.stats?.pts && p.injury !== 'Out');
      const awayTop8 = awayPlayers.slice(0, 12).filter(p => p.stats?.pts && p.injury !== 'Out');
      // Pool resserré aux 8 joueurs les plus utilisés pour la redistribution (19 juin 2026)
      const homeRedist = computeRedist(homeOutKey, homeTop8.slice(0, 8));
      const awayRedist = computeRedist(awayOutKey, awayTop8.slice(0, 8));
      if (homeOutKey.length || awayOutKey.length) {
        _bgLog.push(`redist ${game.home.short}v${game.away.short}: Out=${[...homeOutKey,...awayOutKey].map(p=>p.name).join(',')}`);
      }

      const allTop16 = [...homeTop8, ...awayTop8];
      const allGamelogs = await Promise.all(allTop16.map(p => bgFetchGamelog(p.id)));
      const seriesGamelogsByPlayer = isPlayoff ? await bgFetchSeriesGamelogs(game, allNormalized) : {};

      // 5. Process each side (skip la team gatée, garder l'adverse)
      for (const [players, mySchedule, oppSchedule, isHome] of [
        [homeTop8, homeSched, awaySched, true],
        [awayTop8, awaySched, homeSched, false],
      ]) {
        const rawOpp = isHome ? game.away.short : game.home.short;
        const oppAbbr = ESPN_ABBR_NORM[rawOpp] || rawOpp;
        const startIdx = isHome ? 0 : homeTop8.length;

        // Date du dernier match joué dans cette série — le gamelog doit être plus récent
        const lastPlayed = lastSeriesGame[pairKey(game)];

        for (let pi = 0; pi < players.length; pi++) {
          const player = players[pi];
          const rsLog = allGamelogs[startIdx + pi];
          // Fusionne les boxscores de la série PO en cours (plus récents en tête) avec le gamelog ESPN —
          // aligné sur seriesGamelogs+mergedGamelog du frontend (BasketballDetailPage.jsx ~1593)
          const gamelog = [...(seriesGamelogsByPlayer[String(player.id)] || []), ...rsLog];

          // Filtre minutes : joueur qui joue peu (fin de banc, blessé léger) → pas d'alerte
          { const avg = avgRecentMin(gamelog, 'min'); if (avg !== null && avg < MIN_AVG_MINUTES) { _bgLog.push(`skip ${player.name}: avg min ${avg.toFixed(1)} < ${MIN_AVG_MINUTES}`); continue; } }

          // Gate Q/Doubtful : Under autorisé (minutes réduites → favorable), Over bloqué
          const playerIsQ = Q_STATUSES.includes(player.injury) && hoursToGame <= 2.5;
          if (playerIsQ) _bgLog.push(`${player.name}: Q himself → Under only`);
          // Flag si un titulaire coéquipier est Q (alerte envoyée mais avertissement)
          const myStarters = isHome ? homeStarters : awayStarters;
          const myPlayers  = isHome ? homePlayers  : awayPlayers;
          const teamQNames = hoursToGame <= 2.5
            ? myPlayers.filter(p => myStarters.has(String(p.id)) && Q_STATUSES.includes(p.injury) && String(p.id) !== String(player.id)).map(p => p.name)
            : [];

          // Projections périmées → pas d'alerte (comparaison par date uniquement, pas heure)
          if (lastPlayed && gamelog?.length) {
            const mostRecentStr = gamelog.map(g => g.date?.slice(0,10)).filter(Boolean).sort().pop();
            const lastPlayedStr = lastPlayed.toISOString().slice(0,10);
            if (mostRecentStr && mostRecentStr < lastPlayedStr) continue;
          }

          // Redistribution minutes (joueur clé Out) → boost proportionnel, injecté dans le calcul
          // (même point d'application que le frontend : multiplie basePts/baseReb/baseAst en amont)
          const redistFactor = isHome ? (homeRedist[String(player.id)] ?? 1) : (awayRedist[String(player.id)] ?? 1);
          const oppDefByPos  = isHome ? awayDefByPos : homeDefByPos;
          const oppPlayers_  = isHome ? awayPlayers : homePlayers;
          const oppStarters_ = isHome ? awayStarters : homeStarters;

          // Post-it : si la projection existe déjà ET que le dernier match de série n'a pas changé → skip le recalcul
          const lastGameStr = lastPlayed ? lastPlayed.toISOString().slice(0,10) : null;
          const existingSnap = _projectionsSnapshot[game.id]?.[String(player.id)];
          if (existingSnap && existingSnap._lastGame === lastGameStr) {
            // Backfill tpm sur les snapshots gelés avant l'ajout du 10 juin 2026 (pts/reb/ast restent figés)
            if (existingSnap.tpm == null) {
              const tpmEst = computeEstimate(player, isHome, oppSchedule, mySchedule, gamelog, oppAbbr, game.date, roundStr, null, oppDefByPos, null, redistFactor);
              if (tpmEst?.tpm != null) {
                existingSnap.tpm = tpmEst.tpm;
                existingSnap.deviation = { ...(existingSnap.deviation || {}), tpm: tpmEst.deviation?.tpm ?? 0 };
                _saveSnapshot();
              }
            }
            // Projection gelée — utilise la valeur du post-it sans recalculer
            const frozenEstimate = { pts: existingSnap.pts, reb: existingSnap.reb, ast: existingSnap.ast, tpm: existingSnap.tpm };
            const bks = mergePlayerProps(scrapedPlayers, player.name, nameMatch);
            if (!bks) continue;
            for (const stat of ['pts', 'reb', 'ast', 'tpm']) {
              const estVal = frozenEstimate[stat];
              if (estVal == null) continue;
              const refLine = bks.unibet?.[stat] ?? bks.winamax?.[stat] ?? null;
              if (!refLine?.line) continue;
              // Effet adverse blessé : Q → bloquer ; OUT → booster projection
              const { factor: oppFactor, shouldBlock: oppBlock } = oppInjuryEffect(oppPlayers_, oppStarters_, player.position, stat, hoursToGame, Q_STATUSES);
              if (oppBlock) { _bgLog.push(`opp-Q block ${player.name} ${stat} (frozen)`); continue; }
              const adjEstVal = estVal * oppFactor;
              if (oppFactor > 1) _bgLog.push(`opp-OUT boost ${player.name} ${stat} x${oppFactor.toFixed(2)}: ${estVal.toFixed(1)}→${adjEstVal.toFixed(1)}`);
              const std = calcStd(gamelog, stat);
              const deviation = existingSnap.deviation?.[stat] ?? 0;
              const rawPOver = probAtLeast(adjEstVal, std, Math.ceil(refLine.line), stat, deviation, false, gamelog.length);
              const rawPUnder = 1 - probAtLeast(adjEstVal, std, (Math.floor(refLine.line) + 1), stat, deviation, false, gamelog.length);
              const pOver = Math.max(0, rawPOver);
              const pUnder = Math.max(0, rawPUnder);
              const disp = displayProb(adjEstVal, std, null, gamelog, refLine.line, stat, deviation, game.date, lastGameStr);
              const wmLine = bks.winamax?.[stat] ?? null;
              const bcLine = bks.betclic?.[stat] ?? null;
              // Snapshot : aligne .probs sur les % réellement affichés (disp) — source unique avec l'alerte
              if (existingSnap) {
                if (!existingSnap.probs) existingSnap.probs = {};
                existingSnap.probs[stat] = { pOver: +((disp?.pOver ?? pOver)).toFixed(3), pUnder: +((disp?.pUnder ?? pUnder)).toFixed(3), line: refLine.line, ubOver: refLine.over??null, bcOver: bcLine?.over??null, wmOver: wmLine?.over??null, ubUnder: refLine.under??null, bcUnder: bcLine?.under??null, wmUnder: wmLine?.under??null };
              }
              const _frozenStarter = isHome ? isStarter(player, homeStarters) : isStarter(player, awayStarters);
              // Plancher abaissé à 75% si le joueur est "spécialiste" de cette stat — voir isConsistentStat (compute.js)
              const _frozenFloor = isConsistentStat(gamelog, stat) ? 0.75 : (_frozenStarter ? NBA_ALERT_FLOOR[stat] : NBA_ALERT_FLOOR_BENCH[stat]);
              const _frozenSeasonAvg = player.stats?.[stat];
              const _frozenEdge = Math.abs(estVal - refLine.line);
              // Marge moyenne saison ↔ ligne + minimum de volume TPM — étendu de la WNBA à la NBA le 22 juin 2026
              const _frozenMarginOverOk  = _frozenSeasonAvg == null || _frozenSeasonAvg >= refLine.line + SEASON_MARGIN[stat];
              const _frozenMarginUnderOk = _frozenSeasonAvg == null || _frozenSeasonAvg <= refLine.line - SEASON_MARGIN[stat];
              const _frozenTpmVolOk = stat !== 'tpm' || (_frozenSeasonAvg??0) >= TPM_MIN_SEASON_AVG;
              const _frozenOverOk = !playerIsQ && pOver >= _frozenFloor && _frozenEdge >= minEdgeFor(stat, 'over', _frozenSeasonAvg) && _frozenMarginOverOk && _frozenTpmVolOk;
              if (_frozenOverOk && hasValidOverOdds(refLine.over??null, wmLine?.over??null, bcLine?.over??null)) {
                newAlerts.push({ ...baseAlert(player, game, isHome, stat, refLine.line, estVal, teamQNames), id:`${game.id}_${player.id}_${stat}_over_${refLine.line}`, direction:'over', probability:Math.round((disp?.pOver ?? pOver)*100), unibetOdds:capOdds(refLine.over??null), winamaxOdds:capOdds(wmLine?.over??null), betclicOdds:capOdds(bcLine?.over??null) });
              } else if (_frozenOverOk) {
                const alt = findLadderAlternative({ direction: 'over', refLineValue: refLine.line, bks, stat,
                  computeProbAtLine: line => displayProb(adjEstVal, std, null, gamelog, line, stat, deviation, game.date, lastGameStr)?.pOver ?? Math.max(0, probAtLeast(adjEstVal, std, Math.ceil(line), stat, deviation, false, gamelog.length)),
                  passesOtherGates: (line, p) => {
                    const marginOk = _frozenSeasonAvg == null || _frozenSeasonAvg >= line + SEASON_MARGIN[stat];
                    return p >= _frozenFloor && Math.abs(estVal - line) >= minEdgeFor(stat, 'over', _frozenSeasonAvg) && marginOk && _frozenTpmVolOk;
                  } });
                if (alt) newAlerts.push({ ...baseAlert(player, game, isHome, stat, alt.line, estVal, teamQNames), id:`${game.id}_${player.id}_${stat}_over_${alt.line}`, direction:'over', probability:Math.round(alt.p*100), unibetOdds: alt.book==='unibet'?capOdds(alt.odds):null, winamaxOdds:null, betclicOdds: alt.book==='betclic'?capOdds(alt.odds):null, lineSource:'ladder' });
              } else if (!_frozenMarginOverOk && pOver>=_frozenFloor) { _bgLog.push(`block NBA ${stat} over ${player.name}: moy saison ${(_frozenSeasonAvg??0).toFixed(1)} < ligne ${refLine.line} + marge ${SEASON_MARGIN[stat]}`); }
              else if (!_frozenTpmVolOk && pOver>=_frozenFloor) { _bgLog.push(`block NBA tpm over ${player.name}: moy saison ${(_frozenSeasonAvg??0).toFixed(1)} < ${TPM_MIN_SEASON_AVG}`); }
              else {
                const _frozenUnderOk = !teamQNames?.length && pUnder >= _frozenFloor && _frozenEdge >= minEdgeFor(stat, 'under', _frozenSeasonAvg) && _frozenMarginUnderOk;
                if (_frozenUnderOk && hasValidUnderOdds(refLine.under??null, wmLine?.under??null, bcLine?.under??null)) {
                  newAlerts.push({ ...baseAlert(player, game, isHome, stat, refLine.line, estVal, teamQNames), id:`${game.id}_${player.id}_${stat}_under_${refLine.line}`, direction:'under', probability:Math.round((disp?.pUnder ?? pUnder)*100), unibetOdds:capOdds(refLine.under??null), winamaxOdds:capOdds(wmLine?.under??null), betclicOdds:capOdds(bcLine?.under??null), ...(playerIsQ?{playerIsQ:true}:{}) });
                } else if (_frozenUnderOk) {
                  const alt = findLadderAlternative({ direction: 'under', refLineValue: refLine.line, bks, stat,
                    computeProbAtLine: line => displayProb(adjEstVal, std, null, gamelog, line, stat, deviation, game.date, lastGameStr)?.pUnder ?? Math.max(0, 1 - probAtLeast(adjEstVal, std, Math.floor(line) + 1, stat, deviation, false, gamelog.length)),
                    passesOtherGates: (line, p) => {
                      const marginOk = _frozenSeasonAvg == null || _frozenSeasonAvg <= line - SEASON_MARGIN[stat];
                      return p >= _frozenFloor && Math.abs(estVal - line) >= minEdgeFor(stat, 'under', _frozenSeasonAvg) && marginOk;
                    } });
                  if (alt) newAlerts.push({ ...baseAlert(player, game, isHome, stat, alt.line, estVal, teamQNames), id:`${game.id}_${player.id}_${stat}_under_${alt.line}`, direction:'under', probability:Math.round(alt.p*100), unibetOdds: alt.book==='unibet'?capOdds(alt.odds):null, winamaxOdds:null, betclicOdds: alt.book==='betclic'?capOdds(alt.odds):null, lineSource:'ladder', ...(playerIsQ?{playerIsQ:true}:{}) });
                } else if (!_frozenMarginUnderOk && pUnder>=_frozenFloor) { _bgLog.push(`block NBA ${stat} under ${player.name}: moy saison ${(_frozenSeasonAvg??0).toFixed(1)} > ligne ${refLine.line} - marge ${SEASON_MARGIN[stat]}`); }
              }
            }
            continue;
          }

          const estimate = computeEstimate(player, isHome, oppSchedule, mySchedule, gamelog, oppAbbr, game.date, roundStr, null, oppDefByPos, null, redistFactor);
          if (!estimate) continue;

          // Snapshot : écrit le post-it UNE FOIS (ou si nouveau match de série joué)
          if (new Date(game.date) > Date.now()) {
            if (!_projectionsSnapshot[game.id]) _projectionsSnapshot[game.id] = {};
            _projectionsSnapshot[game.id][String(player.id)] = {
              name: player.name,
              team: isHome ? game.home.short : game.away.short,
              pts:  estimate.pts,
              reb:  estimate.reb,
              ast:  estimate.ast,
              tpm:  estimate.tpm,
              deviation: estimate.deviation,
              _lastGame: lastGameStr, // date du dernier match de série → permet de détecter quand recalculer
            };
            _saveSnapshot();
          }

          const bks = mergePlayerProps(scrapedPlayers, player.name, nameMatch);
          if (!bks) continue;

          for (const stat of ['pts', 'reb', 'ast', 'tpm']) {
            const estVal = estimate[stat];
            if (estVal == null) continue;
            const refLine = bks.unibet?.[stat] ?? bks.winamax?.[stat] ?? null;
            if (!refLine?.line) continue;

            // Effet adverse blessé : Q → bloquer ; OUT → booster projection
            const { factor: oppFactor, shouldBlock: oppBlock } = oppInjuryEffect(oppPlayers_, oppStarters_, player.position, stat, hoursToGame, Q_STATUSES);
            if (oppBlock) { _bgLog.push(`opp-Q block ${player.name} ${stat}`); continue; }
            const adjEstVal = estVal * oppFactor;
            if (oppFactor > 1) _bgLog.push(`opp-OUT boost ${player.name} ${stat} x${oppFactor.toFixed(2)}: ${estVal.toFixed(1)}→${adjEstVal.toFixed(1)}`);

            const std    = calcStd(gamelog, stat);
            // Fix 3 — bloquer Under si ligne >30% au-dessus moyenne saison (bookmaker anticipe gros match)
            const seasonAvgStat = player.stats?.[stat];
            if (seasonAvgStat && refLine.line > seasonAvgStat * 1.30) {
              _bgLog.push(`block Under ${player.name} ${stat}: line ${refLine.line} vs avg ${seasonAvgStat} (+${Math.round((refLine.line/seasonAvgStat-1)*100)}%)`);
            }
            const deviation = estimate.deviation?.[stat] ?? 0;
            const rawPOver  = probAtLeast(adjEstVal, std, Math.ceil(refLine.line), stat, deviation, false, gamelog.length);
            const rawPUnder = 1 - probAtLeast(adjEstVal, std, (Math.floor(refLine.line) + 1), stat, deviation, false, gamelog.length);
            // Fix 1+6 : minutes très variables → pénalité -8% sur toutes les stats
            const minVarianceAdj = (() => {
              const mins = (gamelog || []).slice(0, 8).map(g => g.min).filter(m => m > 0);
              if (mins.length < 3) return 0;
              const mean = mins.reduce((s, v) => s + v, 0) / mins.length;
              const sd = Math.sqrt(mins.reduce((s, v) => s + (v - mean) ** 2, 0) / mins.length);
              return (mean > 0 && sd / mean > 0.35) ? -0.08 : 0;
            })();
            const pOver  = Math.max(0, rawPOver  + minVarianceAdj);
            const pUnder = seasonAvgStat && refLine.line > seasonAvgStat * 1.30
              ? 0  // bloqué
              : Math.max(0, rawPUnder + minVarianceAdj);
            const disp = displayProb(estVal, std, null, gamelog, refLine.line, stat, deviation, game.date, lastGameStr);

            const wmLine = bks.winamax?.[stat] ?? null;
            const bcLine = bks.betclic?.[stat] ?? null;
            const baseAlert = {
              player:       player.name,
              team:         isHome ? game.home.short : game.away.short,
              fixture:      `${game.home.short} vs ${game.away.short}`,
              round:        '',
              fixtureDate:  game.date,
              eventId:      game.id,
              homeTeam:     game.home.name,
              awayTeam:     game.away.name,
              homeShort:    game.home.short,
              awayShort:    game.away.short,
              stat,
              line:         refLine.line,
              estimate:     estVal,
              pinnacleOdds: null,
              unibetLine:   refLine.line,
              winamaxLine:  wmLine?.line ?? null,
              betclicLine:  bcLine?.line ?? null,
              injury:       player.injury || null,
              ...(teamQNames?.length ? { teamHasQ: teamQNames } : {}),
              ...(playerIsQ ? { playerIsQ: true } : {}),
              savedAt:      Date.now(),
            };
            // Bloquer Under si L2 propres (min≥15) sont toutes > ligne (joueur en feu)
            // Save prob dans snapshot NBA
            if (!_projectionsSnapshot[game.id]) _projectionsSnapshot[game.id] = {};
            const _sn = _projectionsSnapshot[game.id][String(player.id)] || { name: player.name, team: isHome ? game.home.short : game.away.short, pts: estimate.pts, reb: estimate.reb, ast: estimate.ast, tpm: estimate.tpm, deviation: estimate.deviation };
            if (!_sn.probs) _sn.probs = {};
            _sn.probs[stat] = { pOver: +((disp?.pOver ?? pOver)).toFixed(3), pUnder: +((disp?.pUnder ?? pUnder)).toFixed(3), line: refLine.line, ubOver: refLine.over??null, bcOver: bcLine?.over??null, wmOver: wmLine?.over??null, ubUnder: refLine.under??null, bcUnder: bcLine?.under??null, wmUnder: wmLine?.under??null };
            _projectionsSnapshot[game.id][String(player.id)] = _sn;

            const l2CleanNba = (gamelog || []).filter(g => (g.min ?? 0) >= 15 && g[stat] != null).slice(0, 2);
            const l2AboveLineNba = l2CleanNba.length >= 2 && l2CleanNba.every(g => g[stat] > refLine.line);
            const _nbaIsStarter = isHome ? isStarter(player, homeStarters) : isStarter(player, awayStarters);
            // Plancher abaissé à 75% si le joueur est "spécialiste" de cette stat — voir isConsistentStat (compute.js)
            const _nbaFloor = isConsistentStat(gamelog, stat) ? 0.75 : (_nbaIsStarter ? NBA_ALERT_FLOOR[stat] : NBA_ALERT_FLOOR_BENCH[stat]);
            const _nbaEdge = Math.abs(estVal - refLine.line);
            // Marge moyenne saison ↔ ligne + minimum de volume TPM — étendu de la WNBA à la NBA le 22 juin 2026
            const _nbaMarginOverOk  = seasonAvgStat == null || seasonAvgStat >= refLine.line + SEASON_MARGIN[stat];
            const _nbaMarginUnderOk = seasonAvgStat == null || seasonAvgStat <= refLine.line - SEASON_MARGIN[stat];
            const _nbaTpmVolOk = stat !== 'tpm' || (seasonAvgStat??0) >= TPM_MIN_SEASON_AVG;
            const _nbaOverOk = !playerIsQ && pOver >= _nbaFloor && _nbaEdge >= minEdgeFor(stat, 'over', seasonAvgStat) && _nbaMarginOverOk && _nbaTpmVolOk;
            if (_nbaOverOk && hasValidOverOdds(refLine.over??null, wmLine?.over??null, bcLine?.over??null)) {
              newAlerts.push({ ...baseAlert, id: `${game.id}_${player.id}_${stat}_over_${refLine.line}`,  direction: 'over',  probability: Math.round((disp?.pOver ?? pOver) * 100), unibetOdds: capOdds(refLine.over  ?? null), winamaxOdds: capOdds(wmLine?.over  ?? null), betclicOdds: capOdds(bcLine?.over  ?? null) });
            } else if (_nbaOverOk) {
              const alt = findLadderAlternative({ direction: 'over', refLineValue: refLine.line, bks, stat,
                computeProbAtLine: line => displayProb(estVal, std, null, gamelog, line, stat, deviation, game.date, lastGameStr)?.pOver ?? Math.max(0, probAtLeast(adjEstVal, std, Math.ceil(line), stat, deviation, false, gamelog.length) + minVarianceAdj),
                passesOtherGates: (line, p) => {
                  const marginOk = seasonAvgStat == null || seasonAvgStat >= line + SEASON_MARGIN[stat];
                  return p >= _nbaFloor && Math.abs(estVal - line) >= minEdgeFor(stat, 'over', seasonAvgStat) && marginOk && _nbaTpmVolOk;
                } });
              if (alt) newAlerts.push({ ...baseAlert, line: alt.line, id: `${game.id}_${player.id}_${stat}_over_${alt.line}`, direction: 'over', probability: Math.round(alt.p * 100), unibetOdds: alt.book==='unibet'?capOdds(alt.odds):null, winamaxOdds: null, betclicOdds: alt.book==='betclic'?capOdds(alt.odds):null, lineSource: 'ladder' });
            }
            else if (!_nbaMarginOverOk && pOver>=_nbaFloor) { _bgLog.push(`block NBA ${stat} over ${player.name}: moy saison ${(seasonAvgStat??0).toFixed(1)} < ligne ${refLine.line} + marge ${SEASON_MARGIN[stat]}`); }
            else if (!_nbaTpmVolOk && pOver>=_nbaFloor) { _bgLog.push(`block NBA tpm over ${player.name}: moy saison ${(seasonAvgStat??0).toFixed(1)} < ${TPM_MIN_SEASON_AVG}`); }
            if (teamQNames?.length > 0) { _bgLog.push(`block Under ${player.name} ${stat}: teammate Q (${teamQNames.join(', ')}) → redistrib risk`); }
            else {
              const _nbaUnderOk = pUnder >= _nbaFloor && !l2AboveLineNba && _nbaEdge >= minEdgeFor(stat, 'under', seasonAvgStat) && _nbaMarginUnderOk;
              if (_nbaUnderOk && hasValidUnderOdds(refLine.under??null, wmLine?.under??null, bcLine?.under??null)) {
                newAlerts.push({ ...baseAlert, id: `${game.id}_${player.id}_${stat}_under_${refLine.line}`, direction: 'under', probability: Math.round((disp?.pUnder ?? pUnder) * 100), unibetOdds: capOdds(refLine.under ?? null), winamaxOdds: capOdds(wmLine?.under ?? null), betclicOdds: capOdds(bcLine?.under ?? null) });
              } else if (_nbaUnderOk) {
                const alt = findLadderAlternative({ direction: 'under', refLineValue: refLine.line, bks, stat,
                  computeProbAtLine: line => displayProb(estVal, std, null, gamelog, line, stat, deviation, game.date, lastGameStr)?.pUnder ?? Math.max(0, (1 - probAtLeast(adjEstVal, std, Math.floor(line) + 1, stat, deviation, false, gamelog.length)) + minVarianceAdj),
                  passesOtherGates: (line, p) => {
                    const l2AboveAtLine = l2CleanNba.length >= 2 && l2CleanNba.every(g => g[stat] > line);
                    const marginOk = seasonAvgStat == null || seasonAvgStat <= line - SEASON_MARGIN[stat];
                    return p >= _nbaFloor && !l2AboveAtLine && marginOk && Math.abs(estVal - line) >= minEdgeFor(stat, 'under', seasonAvgStat);
                  } });
                if (alt) newAlerts.push({ ...baseAlert, line: alt.line, id: `${game.id}_${player.id}_${stat}_under_${alt.line}`, direction: 'under', probability: Math.round(alt.p * 100), unibetOdds: alt.book==='unibet'?capOdds(alt.odds):null, winamaxOdds: null, betclicOdds: alt.book==='betclic'?capOdds(alt.odds):null, lineSource: 'ladder' });
              } else if (pUnder >= _nbaFloor && l2AboveLineNba) _bgLog.push(`block Under ${player.name} ${stat}: L2 both above line ${refLine.line}`);
              else if (!_nbaMarginUnderOk && pUnder>=_nbaFloor) _bgLog.push(`block NBA ${stat} under ${player.name}: moy saison ${(seasonAvgStat??0).toFixed(1)} > ligne ${refLine.line} - marge ${SEASON_MARGIN[stat]}`);
              else if (pUnder >= _nbaFloor && _nbaEdge < minEdgeFor(stat, 'under', seasonAvgStat)) _bgLog.push(`block Under ${player.name} ${stat}: edge ${_nbaEdge.toFixed(1)} < ${minEdgeFor(stat, 'under', seasonAvgStat)}`);
            }
          }
        }
      }
    }

    // ── WNBA ── same logic, WNBA-specific helpers + scale ─────────────────────
    // i=-10..-1 : retrouve le dernier match FINAL d'une série → gel des projections (même fix que NBA)
    const wnbaEvents = [];
    for (let i = -10; i <= 2; i++) {
      const dateStr = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
      const r = await fetch(`${ESPN_WNBA_SB}?dates=${dateStr}&limit=50`).catch(() => null);
      if (r?.ok) wnbaEvents.push(...((await r.json()).events || []));
    }
    const wnbaSeen = new Set();
    const wnbaUpcoming = wnbaEvents
      .filter(ev => { if (wnbaSeen.has(ev.id)) return false; wnbaSeen.add(ev.id); return true; })
      .map(ev => { const g = normalizeGame(ev); return g ? { ...g, league: 'wnba' } : null; }).filter(Boolean)
      .filter(g => g.status === 'STATUS_SCHEDULED' && new Date(g.date).getTime() <= cutoff);
    const wnbaPairKey = g => [g.home.name, g.away.name].sort().join('__');
    const wnbaLive = wnbaEvents.map(ev => { const g = normalizeGame(ev); return g ? { ...g, league: 'wnba' } : null; }).filter(Boolean)
      .filter(g => g.status === 'STATUS_IN_PROGRESS');
    const wnbaLivePairs = new Set(wnbaLive.map(wnbaPairKey));
    const wnbaEarliestByPair = {};
    for (const g of wnbaUpcoming) {
      const k = wnbaPairKey(g);
      if (wnbaLivePairs.has(k)) continue;
      if (!wnbaEarliestByPair[k] || new Date(g.date) < new Date(wnbaEarliestByPair[k].date)) wnbaEarliestByPair[k] = g;
    }
    const wnbaGamesNext = Object.values(wnbaEarliestByPair);
    _bgLog.push(`wnba upcoming: ${wnbaGamesNext.map(g => g.home.short + 'v' + g.away.short).join(', ') || 'none'}`);

    const scaleGames = (gs, factor) => gs.map(g => g.ptsScored != null
      ? { ...g, ptsScored: +(g.ptsScored * factor).toFixed(1), ptsAllowed: +(g.ptsAllowed * factor).toFixed(1) }
      : g);

    // Défense par poste WNBA — une fois pour tous les matchs (cache 6h)
    const wnbaDefData = await getWNBADefByPos().catch(() => ({ teamDefByPosById: {}, leagueAvg: {} }));

    // Fetch WNBA injuries une fois pour tous les matchs
    const wnbaInjuries = await fetchRotoWireWNBAInjuries().catch(() => ({}));
    const Q_STATUSES_WNBA = ['Questionable', 'GTD', 'Doubtful', 'Day-To-Day'];
    const applyWNBAInjury = (player) => {
      const inj = Object.entries(wnbaInjuries).find(([n]) => n === player.name || n.toLowerCase() === player.name.toLowerCase());
      return inj ? { ...player, injury: inj[1].status } : player;
    };

    for (const game of wnbaGamesNext) {
      const homeId = ESPN_WNBA_MAP[game.home.name];
      const awayId = ESPN_WNBA_MAP[game.away.name];
      if (!homeId || !awayId) continue;

      let scrapedPlayers = null;
      try {
        const propsResp = await fetchWithTimeout(
          `http://localhost:${process.env.PORT || 3001}/api/basketball/player-props?league=wnba&home=${encodeURIComponent(game.home.name)}&away=${encodeURIComponent(game.away.name)}&date=${encodeURIComponent(game.date)}`,
          25000
        );
        const propsData = propsResp.ok ? await propsResp.json() : null;
        scrapedPlayers = propsData?.players ?? null;
        if (propsData?.found && scrapedPlayers) {
          const lk = `bball_pprops3_wnba_${game.home.name}_${game.away.name}`.toLowerCase().replace(/\s+/g, '_');
          _saveLinesSnapshot(lk, propsData);
        }
      } catch { scrapedPlayers = null; }

      if (!scrapedPlayers || !Object.keys(scrapedPlayers).length) { _bgLog.push(`wnba no props for ${game.home.short}v${game.away.short}`); continue; }
      _bgLog.push(`wnba props OK for ${game.home.short}v${game.away.short}: ${Object.keys(scrapedPlayers).length} players`);

      const [homePlayers, awayPlayers, homeSched, awaySched] = await Promise.all([
        bgFetchWNBARoster(homeId), bgFetchWNBARoster(awayId),
        bgFetchWNBASchedule(homeId), bgFetchWNBASchedule(awayId),
      ]);

      const homeScaled = scaleGames(homeSched, WNBA_SCALE);
      const awayScaled = scaleGames(awaySched, WNBA_SCALE);

      const homePatch = homePlayers.map(applyWNBAInjury);
      const awayPatch = awayPlayers.map(applyWNBAInjury);
      const wnbaHomeTop8 = homePatch.slice(0, 12).filter(p => p.stats?.pts);
      const wnbaAwayTop8 = awayPatch.slice(0, 12).filter(p => p.stats?.pts);
      const homeStartersWNBA = new Set([...homePatch].sort((a,b)=>(b.stats?.pts||0)-(a.stats?.pts||0)).slice(0,5).map(p=>String(p.id)));
      const awayStartersWNBA = new Set([...awayPatch].sort((a,b)=>(b.stats?.pts||0)-(a.stats?.pts||0)).slice(0,5).map(p=>String(p.id)));

      // Redistribution des minutes si titulaire confirmé Out — toujours actif en WNBA
      // (rosters à 12 joueurs : l'absence d'un titulaire pèse plus qu'en NBA, pas besoin d'attendre les playoffs)
      const wnbaHomeOutRaw = homePatch.filter(p => homeStartersWNBA.has(String(p.id)) && p.injury === 'Out');
      const wnbaAwayOutRaw = awayPatch.filter(p => awayStartersWNBA.has(String(p.id)) && p.injury === 'Out');
      // Exclut les absences déjà installées toute la saison (0 match joué, ex: Collier depuis le début) :
      // la baseline des coéquipières (gamelogs/EWA) reflète déjà son absence, redistribuer en plus double-compterait l'usage
      const wnbaOutGamelogs = await Promise.all([...wnbaHomeOutRaw, ...wnbaAwayOutRaw].map(p => bgFetchWNBAGamelog(p.id)));
      const wnbaOutPlayed = new Set([...wnbaHomeOutRaw, ...wnbaAwayOutRaw].filter((p, i) => wnbaOutGamelogs[i].length > 0).map(p => String(p.id)));
      const wnbaHomeOut = wnbaHomeOutRaw.filter(p => wnbaOutPlayed.has(String(p.id)));
      const wnbaAwayOut = wnbaAwayOutRaw.filter(p => wnbaOutPlayed.has(String(p.id)));
      // Pool resserré aux 8 joueuses les plus utilisées pour la redistribution (19 juin 2026)
      const homeRedistWNBA = computeRedist(wnbaHomeOut, wnbaHomeTop8.filter(p => p.injury !== 'Out').slice(0, 8));
      const awayRedistWNBA = computeRedist(wnbaAwayOut, wnbaAwayTop8.filter(p => p.injury !== 'Out').slice(0, 8));
      if (wnbaHomeOut.length || wnbaAwayOut.length) {
        _bgLog.push(`wnba redist ${game.home.short}v${game.away.short}: Out=${[...wnbaHomeOut,...wnbaAwayOut].map(p=>p.name).join(',')}`);
      }

      const allWnba16 = [...wnbaHomeTop8, ...wnbaAwayTop8];
      const allWnbaGamelogs = await Promise.all(allWnba16.map(p => bgFetchWNBAGamelog(p.id)));

      // Défense par poste de chacune des deux équipes (null si données insuffisantes → fallback getDefFactor)
      const homeDefByPosWNBA = wnbaDefData.teamDefByPosById[homeId]
        ? { ...wnbaDefData.teamDefByPosById[homeId], _leagueAvg: wnbaDefData.leagueAvg } : null;
      const awayDefByPosWNBA = wnbaDefData.teamDefByPosById[awayId]
        ? { ...wnbaDefData.teamDefByPosById[awayId], _leagueAvg: wnbaDefData.leagueAvg } : null;

      const hoursToGame = (new Date(game.date).getTime() - Date.now()) / 3600000;

      for (const [players, myScaled, oppScaled, isHome] of [
        [wnbaHomeTop8, homeScaled, awayScaled, true],
        [wnbaAwayTop8, awayScaled, homeScaled, false],
      ]) {
        const oppAbbr = isHome ? game.away.short : game.home.short;
        const startIdx = isHome ? 0 : wnbaHomeTop8.length;

        for (let pi = 0; pi < players.length; pi++) {
          const player = players[pi];
          const gamelog = allWnbaGamelogs[startIdx + pi];
          const lastGlDate = gamelog?.[0]?.date?.slice(0,10) ?? null;

          // Filtre minutes WNBA
          { const avg = avgRecentMin(gamelog, 'min'); if (avg !== null && avg < MIN_AVG_MINUTES) { _bgLog.push(`skip wnba ${player.name}: avg min ${avg.toFixed(1)}`); continue; } }

          // Per-player Q gate WNBA : Under autorisé, Over bloqué
          const playerIsQWNBA = Q_STATUSES_WNBA.includes(player.injury) && hoursToGame <= 2.5;
          if (playerIsQWNBA) _bgLog.push(`wnba ${player.name}: Q herself → Under only`);
          const myStartersWNBA = isHome ? homeStartersWNBA : awayStartersWNBA;
          const myPlayersWNBA  = isHome ? homePatch : awayPatch;
          const teamQNamesWNBA = hoursToGame <= 2.5 ? myPlayersWNBA.filter(p => myStartersWNBA.has(String(p.id)) && Q_STATUSES_WNBA.includes(p.injury) && String(p.id) !== String(player.id)).map(p => p.name) : [];
          const redistFactorWNBA = isHome ? (homeRedistWNBA[String(player.id)] ?? 1) : (awayRedistWNBA[String(player.id)] ?? 1);
          const oppDefByPosWNBA = isHome ? awayDefByPosWNBA : homeDefByPosWNBA;
          const oppPlayersWNBA_  = isHome ? awayPatch : homePatch;
          const oppStartersWNBA_ = isHome ? awayStartersWNBA : homeStartersWNBA;

          // Post-it WNBA : gel si dernier match du joueur n'a pas changé
          if (new Date(game.date) > Date.now()) {
            const snap = _projectionsSnapshot[game.id]?.[String(player.id)];
            if (snap && snap._lastGame === lastGlDate && snap.pts != null) {
              // Backfill tpm sur les snapshots gelés avant l'ajout du 10 juin 2026 (pts/reb/ast restent figés)
              if (snap.tpm == null) {
                const tpmEst = computeEstimate(player, isHome, oppScaled, myScaled, gamelog, oppAbbr, game.date, '', null, oppDefByPosWNBA, null, redistFactorWNBA, true);
                if (tpmEst?.tpm != null) {
                  snap.tpm = tpmEst.tpm;
                  snap.deviation = { ...(snap.deviation || {}), tpm: tpmEst.deviation?.tpm ?? 0 };
                  _saveSnapshot();
                }
              }
              const bks = mergePlayerProps(scrapedPlayers, player.name, nameMatch);
              if (bks) {
                for (const stat of ['pts','reb','ast','tpm']) {
                  const estVal = snap[stat]; if (estVal == null) continue;
                  const refLine = bks.unibet?.[stat] ?? bks.winamax?.[stat] ?? null; if (!refLine?.line) continue;
                  const std = calcStd(gamelog, stat) ?? (stat==='pts'?6:stat==='reb'?2.5:stat==='tpm'?1.2:1.5);
                  const { factor: oppFactorW, shouldBlock: oppBlockW } = oppInjuryEffect(oppPlayersWNBA_, oppStartersWNBA_, player.position, stat, hoursToGame, Q_STATUSES_WNBA);
                  if (oppBlockW) { _bgLog.push(`opp-Q block wnba ${player.name} ${stat} (frozen)`); continue; }
                  const adjEstValW = estVal * oppFactorW;
                  if (oppFactorW > 1) _bgLog.push(`opp-OUT boost wnba ${player.name} ${stat} x${oppFactorW.toFixed(2)}: ${estVal.toFixed(1)}→${adjEstValW.toFixed(1)}`);
                  const pOver = Math.max(0, probAtLeast(adjEstValW, std, Math.ceil(refLine.line), stat, 0, true, gamelog.length));
                  const pUnder = Math.max(0, 1-probAtLeast(adjEstValW, std, (Math.floor(refLine.line) + 1), stat, 0, true, gamelog.length));
                  const disp = displayProb(adjEstValW, std, null, gamelog, refLine.line, stat, 0, game.date, lastGlDate, true);
                  const wmLine = bks.winamax?.[stat]??null; const bcLine = bks.betclic?.[stat]??null;
                  // Snapshot : aligne .probs sur les % réellement affichés (disp) — source unique avec l'alerte
                  if (snap) {
                    if (!snap.probs) snap.probs = {};
                    snap.probs[stat] = { pOver: +((disp?.pOver ?? pOver)).toFixed(3), pUnder: +((disp?.pUnder ?? pUnder)).toFixed(3), line: refLine.line, ubOver: refLine.over??null, bcOver: bcLine?.over??null, wmOver: wmLine?.over??null, ubUnder: refLine.under??null, bcUnder: bcLine?.under??null, wmUnder: wmLine?.under??null };
                  }
                  const base = { type:'player_prop', league:'wnba', eventId:game.id, home:game.home.name, away:game.away.name, homeShort:game.home.short, awayShort:game.away.short, homeTeam:game.home.name, awayTeam:game.away.name, player:player.name, team:isHome?game.home.short:game.away.short, fixture:`${game.home.short} vs ${game.away.short}`, round:'', fixtureDate:game.date, stat, line:refLine.line, estimate:estVal, pinnacleOdds:null, injury:player.injury||null, ...(teamQNamesWNBA?.length?{teamHasQ:teamQNamesWNBA}:{}), ...(playerIsQWNBA?{playerIsQ:true}:{}), savedAt:Date.now() };
                  const _wnbaFrozenStarter = myStartersWNBA.has(String(player.id));
                  // Plancher abaissé à 72% si la joueuse est "spécialiste" de cette stat — voir isConsistentStat (compute.js)
                  const _wnbaFrozenFloor = isConsistentStat(gamelog, stat) ? WNBA_SPECIALIST_FLOOR : (_wnbaFrozenStarter ? WNBA_ALERT_FLOOR[stat] : WNBA_ALERT_FLOOR_BENCH[stat]);
                  const _wnbaFrozenSeasonAvg = player.stats?.[stat];
                  const _wnbaFrozenEdge = Math.abs(estVal - refLine.line);
                  const _wnbaFrozenMarginOverOk  = _wnbaFrozenSeasonAvg == null || _wnbaFrozenSeasonAvg >= refLine.line + WNBA_SEASON_MARGIN[stat];
                  const _wnbaFrozenMarginUnderOk = _wnbaFrozenSeasonAvg == null || _wnbaFrozenSeasonAvg <= refLine.line - WNBA_SEASON_MARGIN[stat];
                  const _wnbaFrozenTpmVolOk = stat !== 'tpm' || (_wnbaFrozenSeasonAvg??0) >= WNBA_TPM_MIN_SEASON_AVG;
                  const _wnbaFrozenOverOk = !playerIsQWNBA && (disp?.pOver ?? pOver)>=_wnbaFrozenFloor && _wnbaFrozenEdge >= minEdgeFor(stat, 'over', _wnbaFrozenSeasonAvg) && _wnbaFrozenMarginOverOk && _wnbaFrozenTpmVolOk;
                  const _wnbaFrozenUnderOk = !teamQNamesWNBA?.length && (disp?.pUnder ?? pUnder)>=_wnbaFrozenFloor && _wnbaFrozenMarginUnderOk && _wnbaFrozenEdge >= minEdgeFor(stat, 'under', _wnbaFrozenSeasonAvg);
                  if (_wnbaFrozenOverOk && hasValidOverOdds(refLine.over??null,wmLine?.over??null,bcLine?.over??null)) {
                    newAlerts.push({...base, id:`${game.id}_${player.id}_${stat}_over_${refLine.line}`, direction:'over', probability:Math.round((disp?.pOver ?? pOver)*100), unibetOdds:capOdds(refLine.over??null), winamaxOdds:capOdds(wmLine?.over??null), betclicOdds:capOdds(bcLine?.over??null)});
                  } else if (_wnbaFrozenOverOk) {
                    const alt = findLadderAlternative({ direction:'over', refLineValue: refLine.line, bks, stat,
                      computeProbAtLine: line => displayProb(adjEstValW, std, null, gamelog, line, stat, 0, game.date, lastGlDate, true)?.pOver ?? Math.max(0, probAtLeast(adjEstValW, std, Math.ceil(line), stat, 0, true, gamelog.length)),
                      passesOtherGates: (line, p) => {
                        const marginOk = _wnbaFrozenSeasonAvg == null || _wnbaFrozenSeasonAvg >= line + WNBA_SEASON_MARGIN[stat];
                        return p >= _wnbaFrozenFloor && Math.abs(estVal - line) >= minEdgeFor(stat, 'over', _wnbaFrozenSeasonAvg) && marginOk && _wnbaFrozenTpmVolOk;
                      } });
                    if (alt) newAlerts.push({...base, line: alt.line, id:`${game.id}_${player.id}_${stat}_over_${alt.line}`, direction:'over', probability:Math.round(alt.p*100), unibetOdds: alt.book==='unibet'?capOdds(alt.odds):null, winamaxOdds:null, betclicOdds: alt.book==='betclic'?capOdds(alt.odds):null, lineSource:'ladder'});
                  }
                  else if (!_wnbaFrozenMarginOverOk && pOver>=_wnbaFrozenFloor) _bgLog.push(`block WNBA ${stat} over ${player.name}: moy saison ${(_wnbaFrozenSeasonAvg??0).toFixed(1)} < ligne ${refLine.line} + marge ${WNBA_SEASON_MARGIN[stat]}`);
                  else if (!_wnbaFrozenTpmVolOk && pOver>=_wnbaFrozenFloor) _bgLog.push(`block WNBA tpm over ${player.name}: moy saison ${(_wnbaFrozenSeasonAvg??0).toFixed(1)} < ${WNBA_TPM_MIN_SEASON_AVG}`);
                  else if (_wnbaFrozenUnderOk && hasValidUnderOdds(refLine.under??null,wmLine?.under??null,bcLine?.under??null)) {
                    newAlerts.push({...base, id:`${game.id}_${player.id}_${stat}_under_${refLine.line}`, direction:'under', probability:Math.round((disp?.pUnder ?? pUnder)*100), unibetOdds:capOdds(refLine.under??null), winamaxOdds:capOdds(wmLine?.under??null), betclicOdds:capOdds(bcLine?.under??null)});
                  } else if (_wnbaFrozenUnderOk) {
                    const alt = findLadderAlternative({ direction:'under', refLineValue: refLine.line, bks, stat,
                      computeProbAtLine: line => displayProb(adjEstValW, std, null, gamelog, line, stat, 0, game.date, lastGlDate, true)?.pUnder ?? Math.max(0, 1 - probAtLeast(adjEstValW, std, Math.floor(line) + 1, stat, 0, true, gamelog.length)),
                      passesOtherGates: (line, p) => {
                        const marginOk = _wnbaFrozenSeasonAvg == null || _wnbaFrozenSeasonAvg <= line - WNBA_SEASON_MARGIN[stat];
                        return p >= _wnbaFrozenFloor && marginOk && Math.abs(estVal - line) >= minEdgeFor(stat, 'under', _wnbaFrozenSeasonAvg);
                      } });
                    if (alt) newAlerts.push({...base, line: alt.line, id:`${game.id}_${player.id}_${stat}_under_${alt.line}`, direction:'under', probability:Math.round(alt.p*100), unibetOdds: alt.book==='unibet'?capOdds(alt.odds):null, winamaxOdds:null, betclicOdds: alt.book==='betclic'?capOdds(alt.odds):null, lineSource:'ladder'});
                  }
                  else if (!_wnbaFrozenMarginUnderOk && pUnder>=_wnbaFrozenFloor) _bgLog.push(`block WNBA ${stat} under ${player.name}: moy saison ${(_wnbaFrozenSeasonAvg??0).toFixed(1)} > ligne ${refLine.line} - marge ${WNBA_SEASON_MARGIN[stat]}`);
                }
              }
              continue;
            }
          }

          const estimate = computeEstimate(player, isHome, oppScaled, myScaled, gamelog, oppAbbr, game.date, '', null, oppDefByPosWNBA, null, redistFactorWNBA, true);
          if (!estimate) continue;

          if (new Date(game.date) > Date.now()) {
            if (!_projectionsSnapshot[game.id]) _projectionsSnapshot[game.id] = {};
            _projectionsSnapshot[game.id][String(player.id)] = {
              name: player.name,
              team: isHome ? game.home.short : game.away.short,
              pts:  estimate.pts,
              reb:  estimate.reb,
              ast:  estimate.ast,
              tpm:  estimate.tpm,
              deviation: estimate.deviation,
              _lastGame: lastGlDate,
            };
            _saveSnapshot();
          }

          const bks = mergePlayerProps(scrapedPlayers, player.name, nameMatch);
          if (!bks) continue;

          for (const stat of ['pts', 'reb', 'ast', 'tpm']) {
            const estVal = estimate[stat];
            if (estVal == null) continue;
            const refLine = bks.unibet?.[stat] ?? bks.winamax?.[stat] ?? null;
            if (!refLine?.line) continue;

            // Effet adverse blessé WNBA
            const { factor: oppFactorW2, shouldBlock: oppBlockW2 } = oppInjuryEffect(oppPlayersWNBA_, oppStartersWNBA_, player.position, stat, hoursToGame, Q_STATUSES_WNBA);
            if (oppBlockW2) { _bgLog.push(`opp-Q block wnba ${player.name} ${stat}`); continue; }
            const adjEstValW2 = estVal * oppFactorW2;
            if (oppFactorW2 > 1) _bgLog.push(`opp-OUT boost wnba ${player.name} ${stat} x${oppFactorW2.toFixed(2)}: ${estVal.toFixed(1)}→${adjEstValW2.toFixed(1)}`);

            const rawStd = calcStd(gamelog, stat);
            const fallbackStd = !rawStd ? (stat === 'pts' ? 6.0 : stat === 'reb' ? 2.5 : stat === 'tpm' ? 1.2 : 1.5) : null;
            const std    = rawStd ?? fallbackStd;
            const deviation = estimate.deviation?.[stat] ?? 0;
            const rawPOver  = probAtLeast(adjEstValW2, std, Math.ceil(refLine.line), stat, deviation, true, gamelog.length);
            const rawPUnder = 1 - probAtLeast(adjEstValW2, std, (Math.floor(refLine.line) + 1), stat, deviation, true, gamelog.length);
            // Fix 1+6 : minutes très variables → pénalité -8% sur toutes les stats
            const minVarianceAdj = (() => {
              const mins = (gamelog || []).slice(0, 8).map(g => g.min).filter(m => m > 0);
              if (mins.length < 3) return 0;
              const mean = mins.reduce((s, v) => s + v, 0) / mins.length;
              const sd = Math.sqrt(mins.reduce((s, v) => s + (v - mean) ** 2, 0) / mins.length);
              return (mean > 0 && sd / mean > 0.35) ? -0.08 : 0;
            })();
            const MAX_WNBA_P = 0.92; // plafond props WNBA
            const pOver  = Math.max(0, Math.min(MAX_WNBA_P, rawPOver)  + minVarianceAdj);
            const pUnder = Math.max(0, Math.min(MAX_WNBA_P, rawPUnder) + minVarianceAdj);
            const disp = displayProb(adjEstValW2, rawStd, fallbackStd, gamelog, refLine.line, stat, deviation, game.date, lastGlDate, true);

            const wmLine = bks.winamax?.[stat] ?? null;
            const bcLine = bks.betclic?.[stat] ?? null;
            // Snapshot : aligne .probs sur les % réellement affichés (disp) — source unique avec l'alerte
            {
              const _swn = _projectionsSnapshot[game.id]?.[String(player.id)];
              if (_swn) {
                if (!_swn.probs) _swn.probs = {};
                _swn.probs[stat] = { pOver: +((disp?.pOver ?? pOver)).toFixed(3), pUnder: +((disp?.pUnder ?? pUnder)).toFixed(3), line: refLine.line, ubOver: refLine.over??null, bcOver: bcLine?.over??null, wmOver: wmLine?.over??null, ubUnder: refLine.under??null, bcUnder: bcLine?.under??null, wmUnder: wmLine?.under??null };
              }
            }
            const baseAlert = {
              player:       player.name,
              team:         isHome ? game.home.short : game.away.short,
              fixture:      `${game.home.short} vs ${game.away.short}`,
              round:        '',
              fixtureDate:  game.date,
              eventId:      game.id,
              homeTeam:     game.home.name,
              awayTeam:     game.away.name,
              homeShort:    game.home.short,
              awayShort:    game.away.short,
              league:       'wnba',
              stat,
              line:         refLine.line,
              estimate:     estVal,
              pinnacleOdds: null,
              unibetLine:   refLine.line,
              winamaxLine:  wmLine?.line ?? null,
              betclicLine:  bcLine?.line ?? null,
              injury:       player.injury || null,
              ...(teamQNamesWNBA?.length ? { teamHasQ: teamQNamesWNBA } : {}),
              ...(playerIsQWNBA ? { playerIsQ: true } : {}),
              savedAt:      Date.now(),
            };
            // Bloquer Under si L2 propres (min≥15) sont toutes > ligne (joueur en feu)
            const l2Clean = (gamelog || []).filter(g => (g.min ?? 0) >= 15 && g[stat] != null).slice(0, 2);
            const l2AboveLine = l2Clean.length >= 2 && l2Clean.every(g => g[stat] > refLine.line);
            const _wnbaIsStarter = myStartersWNBA.has(String(player.id));
            // Plancher abaissé à 72% si la joueuse est "spécialiste" de cette stat — voir isConsistentStat (compute.js)
            const alertFloor = isConsistentStat(gamelog, stat) ? WNBA_SPECIALIST_FLOOR : (_wnbaIsStarter ? WNBA_ALERT_FLOOR[stat] : WNBA_ALERT_FLOOR_BENCH[stat]);
            const _wnbaSeasonAvg = player.stats?.[stat];
            const _wnbaEdge = Math.abs(estVal - refLine.line);
            _bgLog.push(`wnba dbg ${player.name} ${stat}: est=${estVal?.toFixed(1)} line=${refLine.line} std=${std?.toFixed(1)} pOver=${Math.round(rawPOver*100)}% pUnder=${Math.round(rawPUnder*100)}% adj=${minVarianceAdj}`);
            const _wnbaMarginOverOk  = _wnbaSeasonAvg == null || _wnbaSeasonAvg >= refLine.line + WNBA_SEASON_MARGIN[stat];
            const _wnbaMarginUnderOk = _wnbaSeasonAvg == null || _wnbaSeasonAvg <= refLine.line - WNBA_SEASON_MARGIN[stat];
            const _wnbaTpmVolOk = stat !== 'tpm' || (_wnbaSeasonAvg??0) >= WNBA_TPM_MIN_SEASON_AVG;
            const _wnbaOverOk = !playerIsQWNBA && (disp?.pOver ?? pOver) >= alertFloor && _wnbaEdge >= minEdgeFor(stat, 'over', _wnbaSeasonAvg) && _wnbaMarginOverOk && _wnbaTpmVolOk;
            if (_wnbaOverOk && hasValidOverOdds(refLine.over??null, wmLine?.over??null, bcLine?.over??null)) {
              newAlerts.push({ ...baseAlert, id: `${game.id}_${player.id}_${stat}_over_${refLine.line}`,  direction: 'over',  probability: Math.round((disp?.pOver ?? pOver) * 100), unibetOdds: capOdds(refLine.over  ?? null), winamaxOdds: capOdds(wmLine?.over  ?? null), betclicOdds: capOdds(bcLine?.over  ?? null) });
            } else if (_wnbaOverOk) {
              const alt = findLadderAlternative({ direction: 'over', refLineValue: refLine.line, bks, stat,
                computeProbAtLine: line => displayProb(adjEstValW2, rawStd, fallbackStd, gamelog, line, stat, deviation, game.date, lastGlDate, true)?.pOver ?? Math.max(0, probAtLeast(adjEstValW2, std, Math.ceil(line), stat, deviation, true, gamelog.length) + minVarianceAdj),
                passesOtherGates: (line, p) => {
                  const marginOk = _wnbaSeasonAvg == null || _wnbaSeasonAvg >= line + WNBA_SEASON_MARGIN[stat];
                  return p >= alertFloor && Math.abs(estVal - line) >= minEdgeFor(stat, 'over', _wnbaSeasonAvg) && marginOk && _wnbaTpmVolOk;
                } });
              if (alt) newAlerts.push({ ...baseAlert, line: alt.line, id: `${game.id}_${player.id}_${stat}_over_${alt.line}`, direction: 'over', probability: Math.round(alt.p * 100), unibetOdds: alt.book==='unibet'?capOdds(alt.odds):null, winamaxOdds: null, betclicOdds: alt.book==='betclic'?capOdds(alt.odds):null, lineSource: 'ladder' });
            }
            else if (!_wnbaMarginOverOk && pOver>=alertFloor) _bgLog.push(`block WNBA ${stat} over ${player.name}: moy saison ${(_wnbaSeasonAvg??0).toFixed(1)} < ligne ${refLine.line} + marge ${WNBA_SEASON_MARGIN[stat]}`);
            else if (!_wnbaTpmVolOk && pOver>=alertFloor) _bgLog.push(`block WNBA tpm over ${player.name}: moy saison ${(_wnbaSeasonAvg??0).toFixed(1)} < ${WNBA_TPM_MIN_SEASON_AVG}`);
            if (teamQNamesWNBA?.length > 0) { _bgLog.push(`block Under ${player.name} ${stat}: wnba teammate Q (${teamQNamesWNBA.join(', ')}) → redistrib risk`); }
            else {
              const _wnbaUnderOk = (disp?.pUnder ?? pUnder) >= alertFloor && !l2AboveLine && _wnbaMarginUnderOk && _wnbaEdge >= minEdgeFor(stat, 'under', _wnbaSeasonAvg);
              if (_wnbaUnderOk && hasValidUnderOdds(refLine.under??null, wmLine?.under??null, bcLine?.under??null)) {
                newAlerts.push({ ...baseAlert, id: `${game.id}_${player.id}_${stat}_under_${refLine.line}`, direction: 'under', probability: Math.round((disp?.pUnder ?? pUnder) * 100), unibetOdds: capOdds(refLine.under ?? null), winamaxOdds: capOdds(wmLine?.under ?? null), betclicOdds: capOdds(bcLine?.under ?? null) });
              } else if (_wnbaUnderOk) {
                const alt = findLadderAlternative({ direction: 'under', refLineValue: refLine.line, bks, stat,
                  computeProbAtLine: line => displayProb(adjEstValW2, rawStd, fallbackStd, gamelog, line, stat, deviation, game.date, lastGlDate, true)?.pUnder ?? Math.max(0, (1 - probAtLeast(adjEstValW2, std, Math.floor(line) + 1, stat, deviation, true, gamelog.length)) + minVarianceAdj),
                  passesOtherGates: (line, p) => {
                    const marginOk = _wnbaSeasonAvg == null || _wnbaSeasonAvg <= line - WNBA_SEASON_MARGIN[stat];
                    const l2AboveAtLine = l2Clean.length >= 2 && l2Clean.every(g => g[stat] > line);
                    return p >= alertFloor && !l2AboveAtLine && marginOk && Math.abs(estVal - line) >= minEdgeFor(stat, 'under', _wnbaSeasonAvg);
                  } });
                if (alt) newAlerts.push({ ...baseAlert, line: alt.line, id: `${game.id}_${player.id}_${stat}_under_${alt.line}`, direction: 'under', probability: Math.round(alt.p * 100), unibetOdds: alt.book==='unibet'?capOdds(alt.odds):null, winamaxOdds: null, betclicOdds: alt.book==='betclic'?capOdds(alt.odds):null, lineSource: 'ladder' });
              } else if (!_wnbaMarginUnderOk && pUnder>=alertFloor) _bgLog.push(`block WNBA ${stat} under ${player.name}: moy saison ${(_wnbaSeasonAvg??0).toFixed(1)} > ligne ${refLine.line} - marge ${WNBA_SEASON_MARGIN[stat]}`);
              else if (pUnder >= alertFloor && l2AboveLine) _bgLog.push(`block Under ${player.name} ${stat}: L2 both above line ${refLine.line}`);
              else if (pUnder >= alertFloor && _wnbaEdge < minEdgeFor(stat, 'under', _wnbaSeasonAvg)) _bgLog.push(`block Under ${player.name} ${stat}: edge ${_wnbaEdge.toFixed(1)} < ${minEdgeFor(stat, 'under', _wnbaSeasonAvg)}`);
            }
          }
        }
      }
    }

    // 4a-bis. NBA + WNBA — Game Total O/U alerts
    // Étape 1 (filtre rapide) : modèle simple homeExp/awayExp vs ligue, edge ≥ 5% (NBA/WNBA)
    // Étape 2 (si étape 1 passe) : modèle complet (pace matchup, momentum, repos, densité,
    // facteur playoffs, ancre historique) → alerte si P(over) ou P(under) ≥ TOTAL_ALERT_PROB (80%)
    const NBA_TOTAL_LEAGUE_AVG  = 114.5; // pts/équipe saison régulière NBA
    // WNBA_TOTAL_LEAGUE_AVG / NBA_TOTAL_GAME_AVG / WNBA_TOTAL_GAME_AVG / EU_GAME_TOTAL_AVG :
    // remontées au niveau module le 22 juin 2026, partagées avec /api/basketball/total
    const NBA_TOTAL_EDGE  = 0.05;
    const WNBA_TOTAL_EDGE = 0.05;

    for (const [games, isWNBA] of [[upcoming, false], [wnbaGamesNext, true]]) {
      const leagueAvg   = isWNBA ? WNBA_TOTAL_LEAGUE_AVG : NBA_TOTAL_LEAGUE_AVG;
      const gameAvg     = isWNBA ? WNBA_TOTAL_GAME_AVG : NBA_TOTAL_GAME_AVG;
      const edgeMin     = isWNBA ? WNBA_TOTAL_EDGE : NBA_TOTAL_EDGE;
      const leagueKey   = isWNBA ? 'wnba' : 'nba';
      const mapFn       = isWNBA ? (n => ESPN_WNBA_MAP[n]) : (n => ESPN_NBA_MAP[n]);
      const schedFn     = isWNBA ? bgFetchWNBASchedule : bgFetchSchedule;
      const rosterFn    = isWNBA ? bgFetchWNBARoster : bgFetchRoster;

      for (const game of games) {
        try {
          const homeId = mapFn(game.home.name);
          const awayId = mapFn(game.away.name);
          if (!homeId || !awayId) { _bgLog.push(`${leagueKey} total skip ${game.home.short}v${game.away.short}: no ESPN id`); continue; }

          const [homeSched, awaySched] = await Promise.all([schedFn(homeId), schedFn(awayId)]);
          if (homeSched.length < 4 || awaySched.length < 4) { _bgLog.push(`${leagueKey} total skip ${game.home.short}v${game.away.short}: sched too short (${homeSched.length}/${awaySched.length})`); continue; }

          const homeOff = calcEWAbg(homeSched, 'ptsScored',  8);
          const awayOff = calcEWAbg(awaySched, 'ptsScored',  8);
          const homeDef = calcEWAbg(homeSched, 'ptsAllowed', 8);
          const awayDef = calcEWAbg(awaySched, 'ptsAllowed', 8);
          if (!homeOff || !awayOff || !homeDef || !awayDef) { _bgLog.push(`${leagueKey} total skip ${game.home.short}v${game.away.short}: null EWA (off=${homeOff}/${awayOff} def=${homeDef}/${awayDef})`); continue; }

          const quickEstimated = homeOff * (awayDef / leagueAvg) + awayOff * (homeDef / leagueAvg);

          const oddsKey = `bball_odds_${leagueKey}_${game.home.name}_${game.away.name}`;
          // Rafraîchit activement si pas en cache — ne plus dépendre d'une visite navigateur (22 juin 2026)
          let oddsData = _espnCache[oddsKey]?.data;
          if (!oddsData) {
            try {
              const oddsResp = await fetchWithTimeout(`http://localhost:${process.env.PORT || 3001}/api/basketball/odds?home=${encodeURIComponent(game.home.name)}&away=${encodeURIComponent(game.away.name)}&league=${leagueKey}&date=${encodeURIComponent(game.date)}`, 15000);
              oddsData = oddsResp.ok ? await oddsResp.json() : null;
            } catch { oddsData = null; }
          }
          const bks = oddsData?.markets?.totals?.bookmakers || {};
          const refBk = ['unibet', 'betclic', 'winamax'].find(b => bks[b]?.line);
          if (!refBk) { _bgLog.push(`${leagueKey} total skip ${game.home.short}v${game.away.short}: no odds (key=${oddsKey}, cached=${!!_espnCache[oddsKey]})`); continue; }
          const line = bks[refBk].line;

          const quickPct = Math.abs(quickEstimated - line) / line;
          if (quickPct < edgeMin) { _bgLog.push(`${leagueKey} total skip ${game.home.short}v${game.away.short}: edge ${(quickPct*100).toFixed(1)}% < ${edgeMin*100}%`); continue; }

          // Étape 2 : modèle complet (pace, momentum, repos, densité, playoffs, tendance série, ancre historique)
          // Heuristique playoffs NBA = avril-juin (pas de champ .round sur les jeux ESPN NBA/WNBA).
          // WNBA : playoffs en sept-oct, hors saison actuelle → toujours 'régulière'.
          const gameMonth  = new Date(game.date).getMonth() + 1;
          const inPlayoffs = !isWNBA && gameMonth >= 4 && gameMonth <= 6;
          const ESPN_SHORT_TO_STD = { SA:'SAS', NY:'NYK', GS:'GSW', NO:'NOP', UT:'UTA' };
          const normAbbr = a => ESPN_SHORT_TO_STD[a?.toUpperCase()] || a?.toUpperCase();
          const h2hGames = homeSched.filter(hg => normAbbr(hg.opponentAbbr) === normAbbr(game.away.short));
          const full = computeGameTotalFull({
            homeGames: homeSched, awayGames: awaySched,
            avgPtsAllowed: leagueAvg, ouBaseline: gameAvg,
            gameDate: game.date, round: inPlayoffs ? 'game' : '', refTotal: line, isWNBA, h2hGames,
          });
          if (!full) { _bgLog.push(`${leagueKey} total skip ${game.home.short}v${game.away.short}: full model null`); continue; }

          const bestP = Math.max(full.pOver ?? 0, full.pUnder ?? 0);
          if (bestP < TOTAL_ALERT_PROB) { _bgLog.push(`${leagueKey} total skip ${game.home.short}v${game.away.short}: prob ${(bestP*100).toFixed(1)}% < ${TOTAL_ALERT_PROB*100}% (est=${full.estimated} line=${line})`); continue; }

          // Filtre joueur clé (≥15 pts/match) Q/GTD, ≤2h30 du tip-off — saison régulière ET
          // playoffs (étendu 19 juin 2026, était playoffs-only)
          const hoursToTip = (new Date(game.date).getTime() - Date.now()) / 3600000;
          if (hoursToTip <= 2.5) {
            const [homePlayers, awayPlayers] = await Promise.all([rosterFn(homeId), rosterFn(awayId)]);
            const hasKeyQ = [...homePlayers, ...awayPlayers].some(p => (p.stats?.pts ?? 0) >= 15 && Q_STATUSES_TOTAL.includes(p.injury));
            if (hasKeyQ) { _bgLog.push(`${leagueKey} total skip ${game.home.short}v${game.away.short}: key player Q/GTD ≤2h30`); continue; }
          }

          const direction = full.direction;
          const dirOdds = Math.max(bks.unibet?.[direction] ?? 0, bks.betclic?.[direction] ?? 0); // winamax exclu depuis le 22 juin (cf. props)
          if (dirOdds < 1.60) { _bgLog.push(`${leagueKey} total skip ${game.home.short}v${game.away.short}: odds ${dirOdds} < 1.60`); continue; }
          const alertId   = `${game.id}_${leagueKey}_total`;
          if (newAlerts.find(a => a.id === alertId)) continue;
          newAlerts.push({
            id: alertId, type: 'game_total', league: leagueKey,
            eventId: game.id,
            home: game.home.name, away: game.away.name,
            homeShort: game.home.short, awayShort: game.away.short,
            date: game.date,
            estimated: full.estimated, line, direction,
            edge: +Math.abs(full.edge).toFixed(1),
            prob: +(bestP * 100).toFixed(1),
            unibetOdds:  bks.unibet?.[direction]  ?? null,
            betclicOdds: bks.betclic?.[direction]  ?? null,
            winamaxOdds: bks.winamax?.[direction]  ?? null,
            savedAt: Date.now(),
          });
          _bgLog.push(`${leagueKey} total ALERT: ${game.home.short}v${game.away.short} est=${full.estimated} line=${line} → ${direction} (prob ${(bestP*100).toFixed(1)}%)`);

          // Value Bet vs Pinnacle — Total O/U (toutes ligues basket, généralisé 25 juin 2026)
          // Pinnacle choisit sa propre ligne (pas forcément identique à Unibet/Betclic) — on ne
          // compare que si elle coïncide exactement, sinon l'edge serait faussé.
          if (bks.pinnacle?.line != null && bks.pinnacle?.over && bks.pinnacle?.under) {
            const vigP = 1 / bks.pinnacle.over + 1 / bks.pinnacle.under;
            const fairPinnacle = { over: (1 / bks.pinnacle.over) / vigP, under: (1 / bks.pinnacle.under) / vigP };
            for (const dir of ['over', 'under']) {
              const bestBk = ['unibet', 'betclic'].find(bk => bks[bk]?.line === bks.pinnacle.line && (bks[bk]?.[dir] ?? 0) >= PINNACLE_MIN_ODDS);
              if (!bestBk) continue;
              const odds = bks[bestBk][dir];
              const edge = odds * fairPinnacle[dir] - 1;
              if (edge < PINNACLE_EDGE_THRESHOLD) continue;
              const pinAlertId = `${game.id}_${leagueKey}_pinnacle_total_${dir}`;
              if (newAlerts.find(a => a.id === pinAlertId)) continue;
              newAlerts.push({
                id: pinAlertId, type: 'basketball_pinnacle_edge', market: 'totals',
                league: leagueKey, eventId: game.id,
                home: game.home.name, away: game.away.name,
                homeShort: game.home.short, awayShort: game.away.short,
                date: game.date,
                line: bks.pinnacle.line, direction: dir,
                edge: +(edge * 100).toFixed(1),
                prob: Math.round(fairPinnacle[dir] * 100),
                pinnacleOdds: bks.pinnacle[dir],
                bookmaker: bestBk,
                unibetOdds:  bks.unibet?.line === bks.pinnacle.line ? bks.unibet[dir]  : null,
                betclicOdds: bks.betclic?.line === bks.pinnacle.line ? bks.betclic[dir] : null,
                savedAt: Date.now(),
              });
              _bgLog.push(`${leagueKey} pinnacle edge (total): ${game.home.short}v${game.away.short} ${dir} ${bks.pinnacle.line} edge=${Math.round(edge * 100)}% (${bestBk})`);
            }
          }
          // Value Bet vs Pinnacle — H2H Résultat (toutes ligues basket)
          const h2hBksPinNBA = oddsData?.markets?.h2h?.bookmakers || {};
          if (h2hBksPinNBA.pinnacle?.home && h2hBksPinNBA.pinnacle?.away) {
            const pinH2H = h2hBksPinNBA.pinnacle;
            const vigH = 1 / pinH2H.home + 1 / pinH2H.away;
            const fairH = { home: (1 / pinH2H.home) / vigH, away: (1 / pinH2H.away) / vigH };
            for (const dir of ['home', 'away']) {
              const bestBk = ['unibet', 'betclic'].find(bk => (h2hBksPinNBA[bk]?.[dir] ?? 0) >= PINNACLE_MIN_ODDS);
              if (!bestBk) continue;
              const odds = h2hBksPinNBA[bestBk][dir];
              const edge = odds * fairH[dir] - 1;
              if (edge < PINNACLE_EDGE_THRESHOLD) continue;
              const pinAlertId = `${game.id}_${leagueKey}_pinnacle_h2h_${dir}`;
              if (newAlerts.find(a => a.id === pinAlertId)) continue;
              newAlerts.push({
                id: pinAlertId, type: 'basketball_pinnacle_edge', market: 'h2h',
                league: leagueKey, eventId: game.id,
                home: game.home.name, away: game.away.name,
                homeShort: game.home.short, awayShort: game.away.short,
                date: game.date, direction: dir,
                edge: +(edge * 100).toFixed(1),
                prob: Math.round(fairH[dir] * 100),
                pinnacleOdds: pinH2H[dir],
                bookmaker: bestBk,
                unibetOdds:  h2hBksPinNBA.unibet?.[dir] ?? null,
                betclicOdds: h2hBksPinNBA.betclic?.[dir] ?? null,
                savedAt: Date.now(),
              });
              _bgLog.push(`${leagueKey} pinnacle edge (h2h): ${game.home.short}v${game.away.short} ${dir} edge=${Math.round(edge * 100)}% (${bestBk})`);
            }
          }
        } catch { /* skip game */ }
      }
    }

    // 4a-bis. Pinnacle props joueurs — NBA + WNBA
    // Compare les lignes Pinnacle (scrappées par fetchPinnaclePropsNBA) contre Unibet/Betclic.
    // Edge ≥ PINNACLE_EDGE_THRESHOLD (20%) + cote bk ≥ PINNACLE_MIN_ODDS (1.70).
    try {
      const pinnProps = await fetchPinnaclePropsNBA().catch(() => ({}));
      const normN = s => (s || '').toLowerCase().replace(/[.\-']/g, ' ').replace(/\s+/g, ' ').trim();
      const lastName = s => normN(s).split(' ').slice(-1)[0];
      for (const [gameKey, props] of Object.entries(pinnProps)) {
        if (!props.length) continue;
        const [pinnHome, pinnAway] = gameKey.split('|');
        // Retrouve le match NBA/WNBA correspondant
        let gameInfo = null;
        for (const [lk, leagueGames] of Object.entries({ nba: nbaSchedule, wnba: wnbaSchedule })) {
          const g = (leagueGames || []).find(g =>
            (matchTeam(pinnHome, g.home?.name) && matchTeam(pinnAway, g.away?.name)) ||
            (matchTeam(pinnHome, g.away?.name) && matchTeam(pinnAway, g.home?.name))
          );
          if (g) { gameInfo = { game: g, league: lk }; break; }
        }
        if (!gameInfo) continue;
        const { game, league: leagueKey } = gameInfo;
        if (new Date(game.date) < new Date()) continue; // match passé
        // Fetch props Unibet/Betclic pour ce match
        let bkProps = null;
        try {
          const pr = await fetchWithTimeout(
            `http://localhost:${process.env.PORT || 3001}/api/basketball/player-props?league=${leagueKey}&home=${encodeURIComponent(game.home.name)}&away=${encodeURIComponent(game.away.name)}&date=${encodeURIComponent(game.date)}`,
            20000
          );
          bkProps = pr.ok ? await pr.json() : null;
        } catch { bkProps = null; }
        if (!bkProps?.found || !bkProps.players) continue;

        for (const pinnProp of props) {
          const { player: pinnPlayer, stat, line: pinnLine, over: pinnOver, under: pinnUnder } = pinnProp;
          if (!pinnOver || !pinnUnder || !stat) continue;
          const vigP = 1 / pinnOver + 1 / pinnUnder;
          const fairPinn = { over: (1 / pinnOver) / vigP, under: (1 / pinnUnder) / vigP };

          // Matching nom joueur Pinnacle → Unibet/Betclic
          const bkEntry = Object.entries(bkProps.players).find(([name]) =>
            normN(name) === normN(pinnPlayer) ||
            lastName(name) === lastName(pinnPlayer)
          );
          if (!bkEntry) continue;
          const [bkPlayerName, bkBks] = bkEntry;

          for (const dir of ['over', 'under']) {
            const bkStat = bkBks.unibet?.[stat] ?? bkBks.betclic?.[stat];
            if (!bkStat?.line || bkStat.line !== pinnLine) continue; // ligne différente → edge faussé
            const bestBk = ['unibet', 'betclic'].find(bk => {
              const s = bkBks[bk]?.[stat];
              return s?.line === pinnLine && (s?.[dir] ?? 0) >= PINNACLE_MIN_ODDS;
            });
            if (!bestBk) continue;
            const bkOdds = bkBks[bestBk][stat][dir];
            const edge = bkOdds * fairPinn[dir] - 1;
            if (edge < PINNACLE_EDGE_THRESHOLD) continue;
            const alertId = `${game.id}_${leagueKey}_pinnacle_props_${normN(pinnPlayer).replace(/\s/g,'_')}_${stat}_${dir}`;
            if (newAlerts.find(a => a.id === alertId)) continue;
            newAlerts.push({
              id: alertId, type: 'basketball_pinnacle_props',
              league: leagueKey, eventId: game.id,
              home: game.home.name, away: game.away.name,
              homeShort: game.home.short, awayShort: game.away.short,
              date: game.date,
              player: bkPlayerName, stat, line: pinnLine, direction: dir,
              edge: +(edge * 100).toFixed(1),
              pinnacleOdds: dir === 'over' ? pinnOver : pinnUnder,
              bookmaker: bestBk,
              unibetOdds:  bkBks.unibet?.[stat]?.line === pinnLine ? bkBks.unibet[stat][dir] : null,
              betclicOdds: bkBks.betclic?.[stat]?.line === pinnLine ? bkBks.betclic[stat][dir] : null,
              savedAt: Date.now(),
            });
            _bgLog.push(`${leagueKey} pinnacle props: ${bkPlayerName} ${stat} ${dir} ${pinnLine} edge=${Math.round(edge*100)}% (${bestBk})`);
          }
        }
      }
    } catch (e) { _bgLog.push(`pinnacle props error: ${e.message}`); }

    // 4b. EL — gel des lignes uniquement (pas de projections sans api-sports Pro)
    try {
      const elSbResp = await fetchWithTimeout(`http://localhost:${process.env.PORT || 3001}/api/euroleague/scoreboard`, 10000);
      if (elSbResp.ok) {
        const elSb = await elSbResp.json();
        const elUpcoming = (elSb.games || []).filter(g => g.status !== 'STATUS_FINAL' && new Date(g.date) > new Date());
        for (const elGame of elUpcoming) {
          try {
            const propsResp = await fetchWithTimeout(
              `http://localhost:${process.env.PORT || 3001}/api/basketball/player-props?league=euroleague&home=${encodeURIComponent(elGame.home.name)}&away=${encodeURIComponent(elGame.away.name)}`,
              20000
            );
            const propsData = propsResp.ok ? await propsResp.json() : null;
            if (propsData?.found) {
              const lk = `bball_pprops3_euroleague_${elGame.home.name}_${elGame.away.name}`.toLowerCase().replace(/\s+/g, '_');
              _saveLinesSnapshot(lk, propsData);
              _bgLog.push(`el lines saved for ${elGame.home.name}v${elGame.away.name}`);
            }
          } catch { /* skip game */ }
        }
      }
    } catch { /* EL scoreboard unavailable */ }

    // 4a. EU leagues — Props joueurs (moteur computeEUEstimate)
    await runEUPropsAlerts(newAlerts, process.env.PORT || 3001);

    // 4b. EU leagues — Résultat (victoire équipe), modèle indépendant du marché
    // Remplace EarlyWin (cf computeTeamWinProb plus haut, 19 juin 2026). Gate sur le marché
    // h2h classique (plus large que l'ancien marché "earlywin/avance", plus rare chez les bookmakers EU).
    // Pénalité absence titulaire clé : rosters déjà exposés par /api/euro/:league/players/:id.
    const RESULT_MIN_ODDS  = 1.60;
    const EU_ALERT_LEAGUES = { acb: 83, bbl: 82, legaa: 80 };
    for (const [euLeague, euScale] of Object.entries(EU_ALERT_LEAGUES)) {
      try {
        const sbGames = _euroCache[`euro_sb_${euLeague}`]?.data?.games || [];
        // Garder uniquement le match le plus proche par paire d'équipes, et bloquer une paire qui a
        // un match en cours — même règle que les props (sinon le match 3 d'une série best-of peut
        // recevoir une alerte avant que le match 2 ait été joué). Ajouté le 22 juin 2026.
        const euResultPairKey = g => [g.home?.name, g.away?.name].sort().join('__');
        const euResultLivePairs = new Set(sbGames.filter(g => g.status === 'STATUS_IN_PROGRESS').map(euResultPairKey));
        const euResultEarliestByPair = {};
        for (const g of sbGames.filter(g => g.status === 'STATUS_SCHEDULED' && g.home?.id && g.away?.id)) {
          const k = euResultPairKey(g);
          if (euResultLivePairs.has(k)) continue;
          if (!euResultEarliestByPair[k] || new Date(g.date) < new Date(euResultEarliestByPair[k].date)) euResultEarliestByPair[k] = g;
        }
        for (const g of Object.values(euResultEarliestByPair)) {
          // Bug corrigé le 22 juin 2026 : cette clé ne correspondait jamais à celle écrite par
          // /api/basketball/odds (`bball_odds_${league}_${home}_${away}`, pas de préfixe "eu",
          // pas de lowercase) — le Résultat EU ne trouvait donc jamais de cotes h2h, peu importe
          // le cache. Corrigé + rafraîchi activement si absent (ne plus dépendre d'une visite navigateur).
          const oddsKey = `bball_odds_${euLeague}_${g.home.name}_${g.away.name}`;
          let oddsData = _espnCache[oddsKey]?.data;
          if (!oddsData) {
            try {
              const oddsResp = await fetchWithTimeout(`http://localhost:${process.env.PORT || 3001}/api/basketball/odds?home=${encodeURIComponent(g.home.name)}&away=${encodeURIComponent(g.away.name)}&league=${euLeague}&date=${encodeURIComponent(g.date)}`, 15000);
              oddsData = oddsResp.ok ? await oddsResp.json() : null;
            } catch { oddsData = null; }
          }
          const h2hBks = oddsData?.markets?.h2h?.bookmakers || {};
          if (!Object.keys(h2hBks).length) continue;
          const scaleF = NBA_REF_BG / euScale;
          const homeSchK = `euro_sched_${euLeague}_${g.home.id}`;
          const awaySchK = `euro_sched_${euLeague}_${g.away.id}`;
          const hGames = (_euroCache[homeSchK]?.data?.games || []).map(x => ({ ...x, ptsScored: (x.ptsScored || 0) * scaleF, ptsAllowed: (x.ptsAllowed || 0) * scaleF }));
          const aGames = (_euroCache[awaySchK]?.data?.games || []).map(x => ({ ...x, ptsScored: (x.ptsScored || 0) * scaleF, ptsAllowed: (x.ptsAllowed || 0) * scaleF }));
          if (hGames.length < 3 || aGames.length < 3) continue;

          const [homePlayersR, awayPlayersR] = await Promise.all([
            fetch(`http://localhost:${PORT}/api/euro/${euLeague}/players/${g.home.id}`, { signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch(`http://localhost:${PORT}/api/euro/${euLeague}/players/${g.away.id}`, { signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : null).catch(() => null),
          ]);
          const scalePlayers = arr => (arr || []).map(p => ({ ...p, stats: { ...p.stats, pts: (p.stats?.pts || 0) * scaleF } }));
          const homeOutPenalty = calcKeyPlayerOutPenalty(scalePlayers(homePlayersR?.players));
          const awayOutPenalty = calcKeyPlayerOutPenalty(scalePlayers(awayPlayersR?.players));

          const result = computeTeamWinProb({
            homeGames: hGames, awayGames: aGames, gameDate: g.date, round: '',
            isWNBA: false, homeOutPenalty, awayOutPenalty,
          });
          if (!result) continue;
          _bgLog.push(`${euLeague} result dbg ${g.home.short}v${g.away.short}: pHome=${(result.pHome*100).toFixed(1)}% pAway=${(result.pAway*100).toFixed(1)}% margin=${result.marginExpected} outPen=${homeOutPenalty.toFixed(1)}/${awayOutPenalty.toFixed(1)}`);

          for (const [bk, h] of Object.entries(h2hBks).filter(([bk]) => bk !== 'winamax')) { // winamax exclu depuis le 22 juin
            if (!h?.home || !h?.away) continue;
            for (const [side, forHome] of [['home', true], ['away', false]]) {
              const prob = forHome ? result.pHome : result.pAway;
              if (prob < RESULT_ALERT_PROB) continue;
              const odds = h[side];
              if (!odds || odds < RESULT_MIN_ODDS) continue;
              const vig  = 1 / h.home + 1 / h.away;
              const fair = (1 / odds) / vig;
              const edge = +((prob - fair) * 100).toFixed(1);
              const alertId = `${g.id}_eu_result_${side}`;
              if (newAlerts.find(a => a.id === alertId)) continue;
              newAlerts.push({
                id: alertId, type: 'basketball_result', league: euLeague,
                eventId: g.id, home: g.home.name, away: g.away.name,
                homeShort: g.home.short, awayShort: g.away.short,
                date: g.date, direction: side,
                teamName: forHome ? g.home.name : g.away.name,
                teamShort: forHome ? g.home.short : g.away.short,
                probability: +(prob * 100).toFixed(1), margin: result.marginExpected,
                odds, edge, bookmaker: bk, savedAt: Date.now(),
              });
            }
          }
          // Pinnacle H2H edge — EU
          if (h2hBks.pinnacle?.home && h2hBks.pinnacle?.away) {
            const pinH2H = h2hBks.pinnacle;
            const vigH = 1 / pinH2H.home + 1 / pinH2H.away;
            const fairH = { home: (1 / pinH2H.home) / vigH, away: (1 / pinH2H.away) / vigH };
            for (const dir of ['home', 'away']) {
              const bestBk = ['unibet', 'betclic'].find(bk => (h2hBks[bk]?.[dir] ?? 0) >= PINNACLE_MIN_ODDS);
              if (!bestBk) continue;
              const odds = h2hBks[bestBk][dir];
              const edge = odds * fairH[dir] - 1;
              if (edge < PINNACLE_EDGE_THRESHOLD) continue;
              const pinAlertId = `${g.id}_${euLeague}_pinnacle_h2h_${dir}`;
              if (newAlerts.find(a => a.id === pinAlertId)) continue;
              newAlerts.push({
                id: pinAlertId, type: 'basketball_pinnacle_edge', market: 'h2h',
                league: euLeague, eventId: g.id,
                home: g.home.name, away: g.away.name,
                homeShort: g.home.short, awayShort: g.away.short,
                date: g.date, direction: dir,
                edge: +(edge * 100).toFixed(1), prob: Math.round(fairH[dir] * 100),
                pinnacleOdds: pinH2H[dir], bookmaker: bestBk,
                unibetOdds: h2hBks.unibet?.[dir] ?? null,
                betclicOdds: h2hBks.betclic?.[dir] ?? null,
                savedAt: Date.now(),
              });
              _bgLog.push(`${euLeague} pinnacle edge (h2h): ${g.home.short}v${g.away.short} ${dir} edge=${Math.round(edge * 100)}% (${bestBk})`);
            }
          }
        }
      } catch { /* skip */ }
    }

    // 4b-bis. NBA + WNBA — Résultat (victoire équipe), modèle indépendant du marché
    // Remplace EarlyWin — même modèle computeTeamWinProb que l'EU ci-dessus, sans rescale d'échelle.
    try {
      for (const [games, isWNBA] of [[upcoming, false], [wnbaGamesNext, true]]) {
        const leagueKey = isWNBA ? 'wnba' : 'nba';
        const mapFn    = isWNBA ? (n => ESPN_WNBA_MAP[n]) : (n => ESPN_NBA_MAP[n]);
        const schedFn  = isWNBA ? bgFetchWNBASchedule : bgFetchSchedule;
        const rosterFn = isWNBA ? bgFetchWNBARoster : bgFetchRoster;

        for (const g of games) {
          try {
            const oddsKey  = `bball_odds_${leagueKey}_${g.home.name}_${g.away.name}`;
            // Rafraîchit activement si pas en cache — ne plus dépendre d'une visite navigateur (22 juin 2026)
            let oddsData = _espnCache[oddsKey]?.data;
            if (!oddsData) {
              try {
                const oddsResp = await fetchWithTimeout(`http://localhost:${process.env.PORT || 3001}/api/basketball/odds?home=${encodeURIComponent(g.home.name)}&away=${encodeURIComponent(g.away.name)}&league=${leagueKey}&date=${encodeURIComponent(g.date)}`, 15000);
                oddsData = oddsResp.ok ? await oddsResp.json() : null;
              } catch { oddsData = null; }
            }
            const h2hBks   = oddsData?.markets?.h2h?.bookmakers || {};
            if (!Object.keys(h2hBks).length) continue;

            const homeId = mapFn(g.home.name);
            const awayId = mapFn(g.away.name);
            if (!homeId || !awayId) continue;
            const [homeSched, awaySched, homePlayers, awayPlayers] = await Promise.all([
              schedFn(homeId), schedFn(awayId), rosterFn(homeId), rosterFn(awayId),
            ]);
            if (homeSched.length < 4 || awaySched.length < 4) continue;

            const homeOutPenalty = calcKeyPlayerOutPenalty(homePlayers);
            const awayOutPenalty = calcKeyPlayerOutPenalty(awayPlayers);

            const result = computeTeamWinProb({
              homeGames: homeSched, awayGames: awaySched, gameDate: g.date, round: '',
              isWNBA, homeOutPenalty, awayOutPenalty,
            });
            if (!result) continue;
            _bgLog.push(`${leagueKey} result dbg ${g.home.short}v${g.away.short}: pHome=${(result.pHome*100).toFixed(1)}% pAway=${(result.pAway*100).toFixed(1)}% margin=${result.marginExpected} outPen=${homeOutPenalty.toFixed(1)}/${awayOutPenalty.toFixed(1)}`);

            for (const [bk, h] of Object.entries(h2hBks).filter(([bk]) => bk !== 'winamax')) { // winamax exclu depuis le 22 juin
              if (!h?.home || !h?.away) continue;
              for (const [side, forHome] of [['home', true], ['away', false]]) {
                const prob = forHome ? result.pHome : result.pAway;
                if (prob < RESULT_ALERT_PROB) continue;
                const odds = h[side];
                if (!odds || odds < RESULT_MIN_ODDS) continue;
                const vig  = 1 / h.home + 1 / h.away;
                const fair = (1 / odds) / vig;
                const edge = +((prob - fair) * 100).toFixed(1);
                const alertId = `${g.id}_${leagueKey}_result_${side}`;
                if (newAlerts.find(a => a.id === alertId)) continue;
                newAlerts.push({
                  id: alertId, type: 'basketball_result', league: leagueKey,
                  eventId: g.id, home: g.home.name, away: g.away.name,
                  homeShort: g.home.short, awayShort: g.away.short,
                  date: g.date, direction: side,
                  teamName: forHome ? g.home.name : g.away.name,
                  teamShort: forHome ? g.home.short : g.away.short,
                  probability: +(prob * 100).toFixed(1), margin: result.marginExpected,
                  odds, edge, bookmaker: bk, savedAt: Date.now(),
                });
              }
            }
            // Pinnacle H2H edge — NBA/WNBA
            if (h2hBks.pinnacle?.home && h2hBks.pinnacle?.away) {
              const pinH2H = h2hBks.pinnacle;
              const vigH = 1 / pinH2H.home + 1 / pinH2H.away;
              const fairH = { home: (1 / pinH2H.home) / vigH, away: (1 / pinH2H.away) / vigH };
              for (const dir of ['home', 'away']) {
                const bestBk = ['unibet', 'betclic'].find(bk => (h2hBks[bk]?.[dir] ?? 0) >= PINNACLE_MIN_ODDS);
                if (!bestBk) continue;
                const odds = h2hBks[bestBk][dir];
                const edge = odds * fairH[dir] - 1;
                if (edge < PINNACLE_EDGE_THRESHOLD) continue;
                const pinAlertId = `${g.id}_${leagueKey}_pinnacle_h2h_${dir}`;
                if (newAlerts.find(a => a.id === pinAlertId)) continue;
                newAlerts.push({
                  id: pinAlertId, type: 'basketball_pinnacle_edge', market: 'h2h',
                  league: leagueKey, eventId: g.id,
                  home: g.home.name, away: g.away.name,
                  homeShort: g.home.short, awayShort: g.away.short,
                  date: g.date, direction: dir,
                  edge: +(edge * 100).toFixed(1), prob: Math.round(fairH[dir] * 100),
                  pinnacleOdds: pinH2H[dir], bookmaker: bestBk,
                  unibetOdds:  h2hBks.unibet?.[dir] ?? null,
                  betclicOdds: h2hBks.betclic?.[dir] ?? null,
                  savedAt: Date.now(),
                });
                _bgLog.push(`${leagueKey} pinnacle edge (h2h): ${g.home.short}v${g.away.short} ${dir} edge=${Math.round(edge * 100)}% (${bestBk})`);
              }
            }
          } catch { /* skip game */ }
        }
      }
    } catch { /* skip */ }

    // 4c. EU leagues — Game Total O/U alerts
    // Étape 1 (filtre rapide) : modèle simple homeExp/awayExp vs ligue, edge ≥ 4%
    // Étape 2 (si étape 1 passe) : modèle complet (pace matchup, momentum, repos, densité,
    // facteur playoffs, ancre historique) → alerte si P(over) ou P(under) ≥ TOTAL_ALERT_PROB (80%)
    const calcEWA = (arr, key, n, decay = 0.82) => {
      const vals = arr.slice(0, n).map(g => g[key]).filter(v => v != null && !isNaN(v));
      if (!vals.length) return null;
      let sum = 0, ws = 0;
      vals.forEach((v, i) => { const w = Math.pow(decay, i); sum += w * v; ws += w; });
      return ws ? sum / ws : null;
    };
    const euBase = `http://localhost:${process.env.PORT || 3001}`;
    for (const [euLeague, leagueAvg] of Object.entries(EU_ALERT_LEAGUES)) {
      try {
        const ck = `euro_sb_${euLeague}`;
        const sbGames = _euroCache[ck]?.data?.games || [];
        // Garder uniquement le match le plus proche par paire d'équipes, et bloquer une paire qui a
        // un match en cours — même règle que les props (sinon le match 3 d'une série best-of peut
        // recevoir une alerte avant que le match 2 ait été joué). Ajouté le 22 juin 2026.
        const euTotalPairKey = g => [g.home?.name, g.away?.name].sort().join('__');
        const euTotalLivePairs = new Set(sbGames.filter(g => g.status === 'STATUS_IN_PROGRESS').map(euTotalPairKey));
        const euTotalEarliestByPair = {};
        for (const g of sbGames.filter(g => g.status === 'STATUS_SCHEDULED' && g.home?.id && g.away?.id)) {
          const k = euTotalPairKey(g);
          if (euTotalLivePairs.has(k)) continue;
          if (!euTotalEarliestByPair[k] || new Date(g.date) < new Date(euTotalEarliestByPair[k].date)) euTotalEarliestByPair[k] = g;
        }
        const scheduledGames = Object.values(euTotalEarliestByPair);
        for (const g of scheduledGames) {
          try {
            const homeScheduleKey = `euro_sched_${euLeague}_${g.home.id}`;
            const awayScheduleKey = `euro_sched_${euLeague}_${g.away.id}`;
            const homeGames = _euroCache[homeScheduleKey]?.data?.games || [];
            const awayGames = _euroCache[awayScheduleKey]?.data?.games || [];
            if (homeGames.length < 3 || awayGames.length < 3) continue;

            const homeOff = calcEWA(homeGames, 'ptsScored', 7);
            const awayOff = calcEWA(awayGames, 'ptsScored', 7);
            const homeDefAllow = calcEWA(homeGames, 'ptsAllowed', 7);
            const awayDefAllow = calcEWA(awayGames, 'ptsAllowed', 7);
            if (!homeOff || !awayOff || !homeDefAllow || !awayDefAllow) continue;

            const quickEstimated = homeOff * (awayDefAllow / leagueAvg) + awayOff * (homeDefAllow / leagueAvg);

            // Récupérer la ligne bookmaker depuis le cache odds — rafraîchit activement si absent
            // (ne plus dépendre d'une visite navigateur, 22 juin 2026)
            const oddsKey = `bball_odds_${euLeague}_${g.home.name}_${g.away.name}`;
            let oddsData = _espnCache[oddsKey]?.data || null;
            if (!oddsData) {
              try {
                const oddsResp = await fetchWithTimeout(`http://localhost:${process.env.PORT || 3001}/api/basketball/odds?home=${encodeURIComponent(g.home.name)}&away=${encodeURIComponent(g.away.name)}&league=${euLeague}&date=${encodeURIComponent(g.date)}`, 15000);
                oddsData = oddsResp.ok ? await oddsResp.json() : null;
              } catch { oddsData = null; }
            }
            const bks = oddsData?.markets?.totals?.bookmakers || {};
            const refBk = ['betclic', 'winamax', 'unibet'].find(b => bks[b]?.line);
            if (!refBk) { _bgLog.push(`${euLeague} total skip ${g.home.short}v${g.away.short}: no odds (key=${oddsKey}, cached=${!!_espnCache[oddsKey]})`); continue; }
            const line = bks[refBk].line;
            if (!line) continue;

            const quickPct = Math.abs(quickEstimated - line) / line;
            if (quickPct < 0.04) { _bgLog.push(`${euLeague} total skip ${g.home.short}v${g.away.short}: edge ${(quickPct*100).toFixed(1)}% < 4% (est=${quickEstimated.toFixed(1)} line=${line})`); continue; }

            // Étape 2 : modèle complet (pace, momentum, repos, densité, playoffs, tendance série, ancre historique)
            // Heuristique playoffs = avril-juin (le champ g.week ne permet pas de détecter les PO)
            const gameMonth  = new Date(g.date).getMonth() + 1;
            const inPlayoffs = gameMonth >= 4 && gameMonth <= 6;
            const h2hGames = homeGames.filter(hg => String(hg.opponentId) === String(g.away.id));
            const full = computeGameTotalFull({
              homeGames, awayGames,
              avgPtsAllowed: leagueAvg, ouBaseline: EU_GAME_TOTAL_AVG[euLeague] ?? leagueAvg * 2,
              gameDate: g.date, round: inPlayoffs ? 'game' : '', refTotal: line, isWNBA: false, h2hGames,
            });
            if (!full) { _bgLog.push(`${euLeague} total skip ${g.home.short}v${g.away.short}: full model null`); continue; }

            const bestP = Math.max(full.pOver ?? 0, full.pUnder ?? 0);
            if (bestP < TOTAL_ALERT_PROB) { _bgLog.push(`${euLeague} total skip ${g.home.short}v${g.away.short}: prob ${(bestP*100).toFixed(1)}% < ${TOTAL_ALERT_PROB*100}% (est=${full.estimated} line=${line})`); continue; }

            // Filtre joueur clé (≥15 pts/match) Q/GTD, ≤2h30 du tip-off — saison régulière ET
            // playoffs (étendu 19 juin 2026, était playoffs-only)
            const hoursToTip = (new Date(g.date).getTime() - Date.now()) / 3600000;
            if (hoursToTip <= 2.5) {
              const [homePlayersR, awayPlayersR] = await Promise.all([
                fetch(`${euBase}/api/euro/${euLeague}/players/${g.home.id}`, { signal: AbortSignal.timeout(10000) }).then(r=>r.ok?r.json():null).catch(()=>null),
                fetch(`${euBase}/api/euro/${euLeague}/players/${g.away.id}`, { signal: AbortSignal.timeout(10000) }).then(r=>r.ok?r.json():null).catch(()=>null),
              ]);
              const homePlayers = homePlayersR?.players || [];
              const awayPlayers = awayPlayersR?.players || [];
              const hasKeyQ = [...homePlayers, ...awayPlayers].some(p => (p.stats?.pts ?? 0) >= 15 && Q_STATUSES_TOTAL.includes(p.injury));
              if (hasKeyQ) { _bgLog.push(`${euLeague} total skip ${g.home.short}v${g.away.short}: key player Q/GTD ≤2h30`); continue; }
            }

            const direction = full.direction;
            const dirOdds = Math.max(bks.unibet?.[direction] ?? 0, bks.betclic?.[direction] ?? 0); // winamax exclu depuis le 22 juin (cf. props)
            if (dirOdds < 1.60) { _bgLog.push(`${euLeague} total skip ${g.home.short}v${g.away.short}: odds ${dirOdds} < 1.60`); continue; }
            const alertId = `${g.id}_${euLeague}_total`;
            newAlerts.push({
              id: alertId,
              type: 'game_total',
              league: euLeague,
              eventId: g.id,
              home: g.home.name,
              away: g.away.name,
              homeShort: g.home.short,
              awayShort: g.away.short,
              date: g.date,
              estimated: full.estimated,
              line,
              edge: +Math.abs(full.edge).toFixed(1),
              direction,
              prob: +(bestP * 100).toFixed(1),
              savedAt: Date.now(),
              unibetOdds: bks.unibet?.[direction] ?? null,
              betclicOdds: bks.betclic?.[direction] ?? null,
              winamaxOdds: bks.winamax?.[direction] ?? null,
            });
            _bgLog.push(`EU O/U alert: ${g.home.short}v${g.away.short} [${euLeague}] est=${full.estimated} line=${line} dir=${direction} (prob ${(bestP*100).toFixed(1)}%)`);

            // Pinnacle Total edge — EU (si Pinnacle scrapé pour cette ligue)
            if (bks.pinnacle?.line != null && bks.pinnacle?.over && bks.pinnacle?.under) {
              const vigP = 1 / bks.pinnacle.over + 1 / bks.pinnacle.under;
              const fairPin = { over: (1 / bks.pinnacle.over) / vigP, under: (1 / bks.pinnacle.under) / vigP };
              for (const dir of ['over', 'under']) {
                const bestBk = ['unibet', 'betclic'].find(bk => bks[bk]?.line === bks.pinnacle.line && (bks[bk]?.[dir] ?? 0) >= PINNACLE_MIN_ODDS);
                if (!bestBk) continue;
                const odds = bks[bestBk][dir];
                const edge = odds * fairPin[dir] - 1;
                if (edge < PINNACLE_EDGE_THRESHOLD) continue;
                const pinAlertId = `${g.id}_${euLeague}_pinnacle_total_${dir}`;
                if (newAlerts.find(a => a.id === pinAlertId)) continue;
                newAlerts.push({
                  id: pinAlertId, type: 'basketball_pinnacle_edge', market: 'totals',
                  league: euLeague, eventId: g.id,
                  home: g.home.name, away: g.away.name,
                  homeShort: g.home.short, awayShort: g.away.short,
                  date: g.date, line: bks.pinnacle.line, direction: dir,
                  edge: +(edge * 100).toFixed(1), prob: Math.round(fairPin[dir] * 100),
                  pinnacleOdds: bks.pinnacle[dir], bookmaker: bestBk,
                  unibetOdds:  bks.unibet?.line === bks.pinnacle.line ? bks.unibet[dir]  : null,
                  betclicOdds: bks.betclic?.line === bks.pinnacle.line ? bks.betclic[dir] : null,
                  savedAt: Date.now(),
                });
                _bgLog.push(`${euLeague} pinnacle edge (total): ${g.home.short}v${g.away.short} ${dir} ${bks.pinnacle.line} edge=${Math.round(edge * 100)}% (${bestBk})`);
              }
            }
            // Pinnacle H2H edge — EU
            const h2hBksEU = oddsData?.markets?.h2h?.bookmakers || {};
            if (h2hBksEU.pinnacle?.home && h2hBksEU.pinnacle?.away) {
              const pinH2H = h2hBksEU.pinnacle;
              const vigH = 1 / pinH2H.home + 1 / pinH2H.away;
              const fairH = { home: (1 / pinH2H.home) / vigH, away: (1 / pinH2H.away) / vigH };
              for (const dir of ['home', 'away']) {
                const bestBk = ['unibet', 'betclic'].find(bk => (h2hBksEU[bk]?.[dir] ?? 0) >= PINNACLE_MIN_ODDS);
                if (!bestBk) continue;
                const odds = h2hBksEU[bestBk][dir];
                const edge = odds * fairH[dir] - 1;
                if (edge < PINNACLE_EDGE_THRESHOLD) continue;
                const pinAlertId = `${g.id}_${euLeague}_pinnacle_h2h_${dir}`;
                if (newAlerts.find(a => a.id === pinAlertId)) continue;
                newAlerts.push({
                  id: pinAlertId, type: 'basketball_pinnacle_edge', market: 'h2h',
                  league: euLeague, eventId: g.id,
                  home: g.home.name, away: g.away.name,
                  homeShort: g.home.short, awayShort: g.away.short,
                  date: g.date, direction: dir,
                  edge: +(edge * 100).toFixed(1), prob: Math.round(fairH[dir] * 100),
                  pinnacleOdds: pinH2H[dir], bookmaker: bestBk,
                  unibetOdds: h2hBksEU.unibet?.[dir] ?? null,
                  betclicOdds: h2hBksEU.betclic?.[dir] ?? null,
                  savedAt: Date.now(),
                });
                _bgLog.push(`${euLeague} pinnacle edge (h2h): ${g.home.short}v${g.away.short} ${dir} edge=${Math.round(edge * 100)}% (${bestBk})`);
              }
            }
          } catch { /* skip game */ }
        }
      } catch { /* skip league */ }
    }

    // 4d. Football — BTTS + Over/Under (Poisson), 5 grands championnats + CDM
    // Hôtes du Mondial 2026 — seules ces 3 sélections ont un vrai avantage du terrain en phase de
    // poules (CDM 2026 = USA/Canada/Mexique). Pour tout autre match, l'équipe "domicile" n'est qu'une
    // étiquette arbitraire de la source de données (le terrain est neutre) — appliquer homeAdv=1.10
    // comme pour un championnat domestique fausse λ_home sans raison (25 juin 2026).
    const CDM_HOST_NATIONS = new Set(['United States', 'Canada', 'Mexico']);
    const footballUpcomingIds = new Set();
    try {
      const fbFixtures = [];
      for (const m of (_fdCache?.matches || [])) {
        const leagueAvg = FB_LEAGUE_AVG_GOALS[m.league];
        if (!leagueAvg || !m.home || !m.away) continue;
        fbFixtures.push({
          fixtureId: `fd_${m.id}`, league: m.league, date: m.date, round: m.round,
          home: m.home, away: m.away,
          homeGF: m.home.goalsFor, homeGA: m.home.goalsAgainst, homePlayed: m.home.played,
          awayGF: m.away.goalsFor, awayGA: m.away.goalsAgainst, awayPlayed: m.away.played,
          leagueAvgGoals: leagueAvg,
        });
      }

      // CDM : la moyenne de référence (avgGF/avgGA) se recalcule à chaque cycle selon le pool
      // de matchs encore programmés, donc la proba d'un match peut dériver de jour en jour
      // sans rapport avec ce match lui-même. On limite la génération d'alertes CDM aux
      // matchs dans les 24h, pour que la proba affichée reste proche de celle au coup d'envoi.
      const CDM_ALERT_WINDOW_MS = 24 * 3600_000;
      const cdmScheduled = (_cdmCache?.games || []).filter(g => g.status === 'STATUS_SCHEDULED' && g.home?.name && g.away?.name
        && (new Date(g.date).getTime() - Date.now()) <= CDM_ALERT_WINDOW_MS);
      if (cdmScheduled.length) {
        const fbBase = `http://localhost:${PORT}`;
        const statsArr = await Promise.all(cdmScheduled.map(async g => {
          const [hs, as_] = await Promise.all([
            fetch(`${fbBase}/api/football/cdm/teamstats/${encodeURIComponent(g.home.name)}`, { signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch(`${fbBase}/api/football/cdm/teamstats/${encodeURIComponent(g.away.name)}`, { signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : null).catch(() => null),
          ]);
          return { g, hs, as_ };
        }));
        // avgGF/avgGA calculés dynamiquement sur le pool actuel d'équipes CDM programmées
        // (plutôt que des constantes figées) — s'auto-recalibre si le pool change
        // (nouvelles équipes, élimination au fil du tournoi), cf. limite documentée.
        const validStats = statsArr.flatMap(({ hs, as_ }) => [hs, as_]).filter(s => s && s.games >= 3);
        const cdmAvgGF = validStats.length ? validStats.reduce((s, x) => s + x.goalsFor, 0) / validStats.length : CDM_AVG_GF;
        const cdmAvgGA = validStats.length ? validStats.reduce((s, x) => s + x.goalsAgainst, 0) / validStats.length : CDM_AVG_GA;
        _cdmPoolAvg = { avgGF: cdmAvgGF, avgGA: cdmAvgGA };
        for (const { g, hs, as_ } of statsArr) {
          if (!hs || !as_ || hs.games < 3 || as_.games < 3) continue;
          // avgGF/avgGA figés à la 1ère apparition du match (cf freezeCdmPoolAvg ci-dessus) —
          // les cycles suivants réutilisent la même valeur tant que le match n'a pas eu lieu.
          const frozenAvg = freezeCdmPoolAvg(`fdcdm_${g.id}`, cdmAvgGF, cdmAvgGA);
          // hs.goalsFor/goalsAgainst sont déjà des moyennes pondérées par match (cf /api/football/cdm/teamstats) —
          // on les multiplie par `games` pour reconstituer des "totaux" attendus par computeLambdas (qui redivise par homePlayed).
          fbFixtures.push({
            fixtureId: `fdcdm_${g.id}`, league: 'cdm', date: g.date, round: g.round,
            home: g.home, away: g.away,
            homeGF: hs.goalsFor * hs.games, homeGA: hs.goalsAgainst * hs.games, homePlayed: hs.games,
            awayGF: as_.goalsFor * as_.games, awayGA: as_.goalsAgainst * as_.games, awayPlayed: as_.games,
            leagueAvgGoals: CDM_AVG_GOALS, avgGF: frozenAvg.avgGF, avgGA: frozenAvg.avgGA,
            homeAdv: CDM_HOST_NATIONS.has(g.home.name) ? 1.10 : 1.0,
          });
        }
      }

      fbFixtures.forEach(f => footballUpcomingIds.add(f.fixtureId));
      // Rafraîchit activement les cotes foot si le cache est froid/absent — ne plus dépendre
      // d'une visite navigateur sur /api/odds pour que BTTS/O-U/Résultat se déclenchent (22 juin 2026)
      if (!_oddsCache.data || Date.now() - _oddsCache.ts > ODDS_TTL) {
        await _refreshOddsCache().catch(() => {});
      }
      const oddsMatches = _oddsCache?.data?.matches || [];
      const FB_BOOKS = ['unibet', 'betclic']; // winamax exclu depuis le 22 juin (cf. props/total basket)

      for (const f of fbFixtures) {
        try {
          const lambdas = computeLambdas({
            homeGF: f.homeGF, homeGA: f.homeGA, homePlayed: f.homePlayed,
            awayGF: f.awayGF, awayGA: f.awayGA, awayPlayed: f.awayPlayed,
            leagueAvgGoals: f.leagueAvgGoals, avgGF: f.avgGF, avgGA: f.avgGA,
            ...(f.homeAdv != null ? { homeAdv: f.homeAdv } : {}),
          });
          if (!lambdas) continue;
          const { lambdaHome, lambdaAway } = lambdas;
          const _1x2raw = compute1X2Probs(lambdaHome, lambdaAway);
          const pHome = Math.min(_1x2raw.pHome, FB_RESULT_MAX_PROB);
          const pDraw = Math.min(_1x2raw.pDraw, FB_RESULT_MAX_PROB);
          const pAway = Math.min(_1x2raw.pAway, FB_RESULT_MAX_PROB);

          const oddsMatch = oddsMatches.find(m => fuzzy(m.homeTeam, f.home.name) && fuzzy(m.awayTeam, f.away.name));
          const bttsBk   = oddsMatch?.markets?.btts?.bookmakers || {};
          const totalsBk = oddsMatch?.markets?.totals?.bookmakers || {};

          // BTTS — id identique à celui généré côté client (MatchDetailPage) → dédup au sync
          const bttsProb = computeBTTSProb(lambdaHome, lambdaAway);
          if (bttsProb >= FB_BTTS_ALERT_PROB) {
            const bestBk = FB_BOOKS.find(bk => (bttsBk[bk]?.yes ?? 0) >= FB_MIN_ODDS);
            if (bestBk) {
              const pair = bttsBk[bestBk];
              let edge = null;
              if (pair?.yes && pair?.no) {
                const vig = 1 / pair.yes + 1 / pair.no;
                const impliedProb = (1 / pair.yes) / vig;
                edge = +((bttsProb - impliedProb) * 100).toFixed(1);
              }
              newAlerts.push({
                id: `${f.fixtureId}_btts_yes`,
                type: 'football_btts',
                fixtureId: f.fixtureId,
                league: f.league,
                eventId: f.fixtureId,
                fixture: `${f.home.name} vs ${f.away.name}`,
                homeTeam: f.home.name,
                awayTeam: f.away.name,
                fixtureDate: f.date,
                round: f.round || '',
                direction: 'yes',
                probability: Math.round(bttsProb * 100),
                pinnacleOdds: null,
                unibetOdds: bttsBk.unibet?.yes ?? null,
                betclicOdds: bttsBk.betclic?.yes ?? null,
                winamaxOdds: bttsBk.winamax?.yes ?? null,
                edge,
                savedAt: Date.now(),
              });
              _bgLog.push(`football BTTS alert: ${f.home.name} v ${f.away.name} [${f.league}] prob=${Math.round(bttsProb * 100)}%`);
            }
          }

          // Résultat 1X2 — chaque issue (dom./nul/ext.) traitée comme un pari oui/non indépendant,
          // même seuil/format que BTTS. Une fixture peut générer 0 à 3 alertes "résultat".
          const h2hBk = oddsMatch?.markets?.h2h?.bookmakers || {};
          // J3 CDM : calcul tactique entre équipes (qualification mutuelle possible) → résultat imprévisible, on bloque
          const isCdmJ3 = f.league === 'cdm' && /^J3$/i.test(f.round?.trim());
          const RESULT_OUTCOMES = [
            { key: 'home', prob: pHome },
            { key: 'draw', prob: pDraw },
            { key: 'away', prob: pAway },
          ];
          for (const { key, prob } of RESULT_OUTCOMES) {
            if (isCdmJ3) continue; // J3 CDM bloqué — enjeux tactiques imprévisibles
            if (prob < FB_RESULT_ALERT_PROB) continue;
            const bestBk = FB_BOOKS.find(bk => (h2hBk[bk]?.[key] ?? 0) >= FB_MIN_ODDS);
            if (!bestBk) continue;
            const pair = h2hBk[bestBk];
            let edge = null;
            if (pair?.home && pair?.draw && pair?.away) {
              const fair = removeVig(pair, 'h2h');
              edge = +((prob - fair[key]) * 100).toFixed(1);
            }
            newAlerts.push({
              id: `${f.fixtureId}_result_${key}`,
              type: 'football_result',
              fixtureId: f.fixtureId,
              league: f.league,
              eventId: f.fixtureId,
              home: f.home.name,
              away: f.away.name,
              homeShort: f.home.short,
              awayShort: f.away.short,
              fixtureDate: f.date,
              round: f.round || '',
              direction: key,
              probability: Math.round(prob * 100),
              unibetOdds: h2hBk.unibet?.[key] ?? null,
              betclicOdds: h2hBk.betclic?.[key] ?? null,
              winamaxOdds: h2hBk.winamax?.[key] ?? null,
              edge,
              savedAt: Date.now(),
            });
            _bgLog.push(`football result alert: ${f.home.name} v ${f.away.name} [${f.league}] ${key} prob=${Math.round(prob * 100)}%`);
          }

          // Value Bet vs Pinnacle (25 juin 2026) — méthode indépendante du modèle Poisson ci-dessus :
          // compare directement les cotes Unibet/Betclic à la ligne Pinnacle démarginée (cotes
          // "sharp" de référence), pas à notre propre probabilité de victoire. Concerne aujourd'hui
          // uniquement la CDM, seule compétition où Pinnacle est scrapé (h2h seulement — cf.
          // fetchPinnacleCdmH2H, BTTS introuvable sur leur site pour cette compétition). Ressuscite
          // l'ancienne route /api/alerts (jamais branchée au frontend, structurellement cassée
          // depuis le 11 juin car Pinnacle absent des cotes scrapées) — id distinct de
          // football_result pour ne jamais se confondre avec l'alerte basée sur notre modèle, même
          // quand les deux portent sur la même issue du même match.
          const pinnacleH2h = h2hBk.pinnacle;
          if (pinnacleH2h?.home && pinnacleH2h?.draw && pinnacleH2h?.away) {
            const fairPinnacle = removeVig(pinnacleH2h, 'h2h');
            for (const key of ['home', 'draw', 'away']) {
              const bestBk = FB_BOOKS.find(bk => (h2hBk[bk]?.[key] ?? 0) >= PINNACLE_MIN_ODDS);
              if (!bestBk) continue;
              const odds = h2hBk[bestBk][key];
              const edge = odds * fairPinnacle[key] - 1;
              if (edge < PINNACLE_EDGE_THRESHOLD) continue;
              newAlerts.push({
                id: `${f.fixtureId}_pinnacle_${key}`,
                type: 'football_pinnacle_edge',
                market: 'h2h',
                fixtureId: f.fixtureId,
                league: f.league,
                eventId: f.fixtureId,
                home: f.home.name,
                away: f.away.name,
                homeShort: f.home.short,
                awayShort: f.away.short,
                fixtureDate: f.date,
                round: f.round || '',
                direction: key,
                probability: Math.round(fairPinnacle[key] * 100),
                pinnacleOdds: pinnacleH2h[key],
                bookmaker: bestBk,
                unibetOdds: h2hBk.unibet?.[key] ?? null,
                betclicOdds: h2hBk.betclic?.[key] ?? null,
                winamaxOdds: h2hBk.winamax?.[key] ?? null,
                edge: +(edge * 100).toFixed(1),
                savedAt: Date.now(),
              });
              _bgLog.push(`football pinnacle edge: ${f.home.name} v ${f.away.name} [${f.league}] ${key} edge=${Math.round(edge * 100)}% (${bestBk})`);
            }
          }

          // Value Bet vs Pinnacle — Over/Under (25 juin 2026) — même principe que le H2H ci-dessus,
          // mais Pinnacle n'affiche qu'une seule ligne "courante" par match (rarement pile 2.5/1.5,
          // ex. 2.75) : on compare Unibet/Betclic à CETTE ligne précise, seulement si elle existe
          // aussi chez eux (pas de repli sur 2.5/1.5 — comparer des lignes différentes fausserait l'edge).
          const pinnacleLine = totalsBk.pinnacle ? Object.keys(totalsBk.pinnacle)[0] : null;
          const pinTotals = pinnacleLine ? totalsBk.pinnacle[pinnacleLine] : null;
          if (pinTotals?.over && pinTotals?.under) {
            const vigP = 1 / pinTotals.over + 1 / pinTotals.under;
            const fairPinnacleOU = { over: (1 / pinTotals.over) / vigP, under: (1 / pinTotals.under) / vigP };
            for (const direction of ['over', 'under']) {
              const bestBk = FB_BOOKS.find(bk => (totalsBk[bk]?.[pinnacleLine]?.[direction] ?? 0) >= PINNACLE_MIN_ODDS);
              if (!bestBk) continue;
              const odds = totalsBk[bestBk][pinnacleLine][direction];
              const edge = odds * fairPinnacleOU[direction] - 1;
              if (edge < PINNACLE_EDGE_THRESHOLD) continue;
              newAlerts.push({
                id: `${f.fixtureId}_pinnacle_total_${pinnacleLine}_${direction}`,
                type: 'football_pinnacle_edge',
                market: 'totals',
                fixtureId: f.fixtureId,
                league: f.league,
                eventId: f.fixtureId,
                home: f.home.name,
                away: f.away.name,
                homeShort: f.home.short,
                awayShort: f.away.short,
                fixtureDate: f.date,
                round: f.round || '',
                line: parseFloat(pinnacleLine),
                direction,
                probability: Math.round(fairPinnacleOU[direction] * 100),
                pinnacleOdds: pinTotals[direction],
                bookmaker: bestBk,
                unibetOdds: totalsBk.unibet?.[pinnacleLine]?.[direction] ?? null,
                betclicOdds: totalsBk.betclic?.[pinnacleLine]?.[direction] ?? null,
                winamaxOdds: totalsBk.winamax?.[pinnacleLine]?.[direction] ?? null,
                edge: +(edge * 100).toFixed(1),
                savedAt: Date.now(),
              });
              _bgLog.push(`football pinnacle edge (totals): ${f.home.name} v ${f.away.name} [${f.league}] ${direction} ${pinnacleLine} edge=${Math.round(edge * 100)}% (${bestBk})`);
            }
          }

          // Over/Under — ligne 2.5 prioritaire, fallback 1.5
          for (const line of ['2.5', '1.5']) {
            const ou = computeOUProb(lambdaHome, lambdaAway, parseFloat(line));
            const bestP = Math.max(ou.pOver, ou.pUnder);
            if (bestP < FB_OU_ALERT_PROB) continue;
            const direction = ou.pOver >= ou.pUnder ? 'over' : 'under';
            const bestBk = FB_BOOKS.find(bk => (totalsBk[bk]?.[line]?.[direction] ?? 0) >= FB_MIN_ODDS);
            if (!bestBk) continue;
            const pair = totalsBk[bestBk][line];
            let edge = null;
            if (pair?.over && pair?.under) {
              const vig = 1 / pair.over + 1 / pair.under;
              const impliedProb = (direction === 'over' ? 1 / pair.over : 1 / pair.under) / vig;
              edge = +((bestP - impliedProb) * 100).toFixed(1);
            }
            newAlerts.push({
              id: `${f.fixtureId}_total_${line}`,
              type: 'football_total',
              fixtureId: f.fixtureId,
              league: f.league,
              eventId: f.fixtureId,
              home: f.home.name,
              away: f.away.name,
              homeShort: f.home.short,
              awayShort: f.away.short,
              fixtureDate: f.date,
              round: f.round || '',
              line: parseFloat(line),
              direction,
              estimated: +(lambdaHome + lambdaAway).toFixed(2),
              probability: Math.round(bestP * 100),
              unibetOdds: totalsBk.unibet?.[line]?.[direction] ?? null,
              betclicOdds: totalsBk.betclic?.[line]?.[direction] ?? null,
              winamaxOdds: totalsBk.winamax?.[line]?.[direction] ?? null,
              edge,
              savedAt: Date.now(),
            });
            _bgLog.push(`football O/U alert: ${f.home.name} v ${f.away.name} [${f.league}] ${direction} ${line} prob=${Math.round(bestP * 100)}%`);
            break; // une seule ligne par match
          }
        } catch { /* skip fixture */ }
      }
    } catch (err) { _bgLog.push(`football error: ${err.message}`); }

    // 5. Merge into backgroundAlerts (preserve accepted/rejected)
    const euUpcomingIds = new Set();
    for (const l of Object.keys(EU_ALERT_LEAGUES)) {
      (_euroCache[`euro_sb_${l}`]?.data?.games || [])
        .filter(g => g.status === 'STATUS_SCHEDULED')
        .forEach(g => euUpcomingIds.add(g.id));
    }
    const upcomingIds = new Set([...upcoming, ...wnbaGamesNext].map(g => g.id), ...euUpcomingIds, ...footballUpcomingIds);
    // Une seule alerte par (match, joueur) — on garde la plus haute proba
    const _playerBest = {};
    newAlerts.filter(a => a.type === 'player_prop' && a.player).forEach(a => {
      const k = `${a.eventId}_${a.player}`;
      if (!_playerBest[k] || a.probability > _playerBest[k].probability) _playerBest[k] = a;
    });
    const filteredAlerts = newAlerts.filter(a =>
      a.type !== 'player_prop' || !a.player || _playerBest[`${a.eventId}_${a.player}`]?.id === a.id
    );
    if (newAlerts.length !== filteredAlerts.length)
      _bgLog.push(`player-dedup: ${newAlerts.length - filteredAlerts.length} alertes supprimées (1 par joueur/match)`);
    const byId = {};
    // Purge alerts for games no longer scheduled (completed/cancelled)
    backgroundAlerts.filter(a => upcomingIds.has(a.eventId)).forEach(a => { byId[a.id] = a; });
    filteredAlerts.forEach(a => {
      // Une seule alerte pending par (match, joueur, stat) — purge toute version stale (direction
      // ou ligne qui a bougé depuis le cycle précédent) avant d'ajouter la version à jour
      if (a.type === 'player_prop' && a.player && a.stat) {
        const staleKey = Object.keys(byId).find(id => {
          const x = byId[id];
          return x?.type === 'player_prop' && x.eventId === a.eventId &&
                 x.player === a.player && x.stat === a.stat &&
                 id !== a.id && (!x.status || x.status === 'pending');
        });
        if (staleKey) { _bgLog.push(`prop-dedup: drop ${byId[staleKey].direction} ${byId[staleKey].line} ${a.player} ${a.stat} → ${a.direction} ${a.line}`); delete byId[staleKey]; }
        // Si une alerte ACCEPTÉE existe déjà pour ce joueur/stat/match (même dans l'autre sens),
        // on ne génère pas de nouvelle alerte concurrente — le pari est déjà engagé, on ne le double pas.
        const hasAccepted = Object.values(byId).some(x =>
          x?.type === 'player_prop' && x.eventId === a.eventId &&
          x.player === a.player && x.stat === a.stat && x.status === 'accepted' && x.id !== a.id
        );
        if (hasAccepted) return;
      }
      const prev = byId[a.id];
      if (!prev || (prev.status || 'pending') === 'pending') {
        byId[a.id] = { ...a, status: prev?.status || 'pending' };
      } else if (prev.status === 'rejected') {
        // Rejeté = on ne retouche jamais, même si la cote/line bouge
      } else {
        // accepted : on met à jour odds/line mais on garde le statut
        byId[a.id] = { ...prev, unibetOdds: a.unibetOdds ?? prev.unibetOdds, winamaxOdds: a.winamaxOdds ?? prev.winamaxOdds, line: a.line ?? prev.line };
      }
    });
    // Alertes player_prop pending qui ne sont plus régénérées ce cycle (ligne/cote ne qualifie
    // plus) → marquées obsolètes plutôt que supprimées, l'utilisateur les ferme manuellement
    const refreshedPropKeys = new Set(filteredAlerts.filter(a => a.type === 'player_prop').map(a => `${a.eventId}_${a.player}_${a.stat}`));
    Object.values(byId).forEach(x => {
      if (x.type === 'player_prop' && (!x.status || x.status === 'pending')) {
        x.obsolete = !refreshedPropKeys.has(`${x.eventId}_${x.player}_${x.stat}`);
      }
    });
    backgroundAlerts = Object.values(byId);
    _bgLog.push(`done: ${newAlerts.length} new, ${backgroundAlerts.length} total`);
    console.log(`[bg-alerts] Done — ${newAlerts.length} new, ${backgroundAlerts.length} total`);
  } catch (err) {
    _bgLog.push(`error: ${err.message}`);
    console.error('[bg-alerts] Error:', err.message);
  }
}

app.get('/api/nba/bg-log', (req, res) => res.json(_bgLog));

app.get('/api/pinnacle/props/test', async (req, res) => {
  // Sans ?scrape=1 : montre juste le cache actuel (pas de Playwright)
  if (req.query.scrape !== '1') {
    const data = _pinnaclePropsCache.data;
    return res.json({ ok: true, cached: true, games: Object.keys(data).length, ageMin: _pinnaclePropsCache.ts ? Math.round((Date.now() - _pinnaclePropsCache.ts) / 60000) : null, data });
  }
  try {
    const data = await fetchPinnaclePropsNBA();
    res.json({ ok: true, cached: false, games: Object.keys(data).length, data });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get('/api/system/health', async (req, res) => {
  if (req.query.refresh === '1') {
    await Promise.all(Object.values(_manualHealthRefreshers).map(fn => fn().catch(() => {})));
  }
  const BG_INTERVAL_MS = 20 * 60 * 1000;
  res.json({
    bgLastRun:          _bgLastRun,
    bgNextRun:          _bgLastRun ? _bgLastRun + BG_INTERVAL_MS : null,
    snapshotLastUpdate: _snapshotLastUpdate,
    alertsActive:       backgroundAlerts.length,
    alertsPending:      backgroundAlerts.filter(a => !a.status || a.status === 'pending').length,
    scrapers:           _scraperHealth,
    blockedUntil: {
      winamax: _scraperBlockedUntil.winamax || null,
      betclic: _scraperBlockedUntil.betclic || null,
      unibet:  _scraperBlockedUntil.unibet || null,
    },
    quotas: {
      footballData:  _fdQuota,
      footballApi:   _footballApiQuota,
      basketballApi: _basketballApiQuota,
    },
  });
});

app.get('/api/nba/background-alerts', (req, res) => {
  res.json({ alerts: backgroundAlerts, generatedAt: Date.now() });
});

app.get('/api/nba/projections-snapshot/:gameId', (req, res) => {
  const snap = _projectionsSnapshot[req.params.gameId];
  if (!snap) return res.json({ found: false, players: {} });
  res.json({ found: true, players: snap });
});

app.post('/api/nba/trigger-alerts', async (req, res) => {
  generateBackgroundAlerts().catch(e => console.error('[bg-alerts] trigger error:', e.message));
  res.json({ ok: true });
});

app.get('/api/nba/debug-alerts', async (req, res) => {
  const log = [];
  const nameMatch = (a, b) => {
    if (!a || !b) return false;
    if (a.toLowerCase() === b.toLowerCase()) return true;
    const parse = n => { n = n.trim(); if (!/\s/.test(n)) { const d = n.indexOf('.'); return d > 0 ? { first: n.slice(0, d), last: n.slice(d + 1) } : { first: '', last: n }; } const parts = n.split(/\s+/); return { first: parts[0].replace(/\.$/, ''), last: parts.slice(-1)[0] }; };
    const pa = parse(a), pb = parse(b);
    if (pa.last.toLowerCase() !== pb.last.toLowerCase()) return false;
    if (!pa.first || !pb.first) return true;
    const fa = pa.first.toLowerCase(), fb = pb.first.toLowerCase();
    return fa.startsWith(fb) || fb.startsWith(fa);
  };
  try {
    const routeCacheKey = `bball_pprops3_nba_san_antonio_spurs_oklahoma_city_thunder`;
    const routeCached = _espnCache[routeCacheKey];
    let scrapedPlayers = {};
    if (routeCached?.data?.players) {
      for (const [name, bks] of Object.entries(routeCached.data.players)) {
        scrapedPlayers[name] = {};
        for (const bk of ['unibet', 'winamax', 'betclic']) {
          if (!bks[bk]) continue;
          scrapedPlayers[name][bk] = {};
          for (const st of ['pts', 'reb', 'ast']) {
            if (bks[bk][st]) scrapedPlayers[name][bk][st] = bks[bk][st];
          }
        }
      }
      log.push({ cacheHit: true, propPlayers: Object.keys(scrapedPlayers).length });
    } else {
      const norm2 = s => (s || '').toLowerCase().replace(/[^a-z]/g, '');
      const fuzzy = (a, b) => { const na = norm2(a), nb = norm2(b); return na.includes(nb) || nb.includes(na); };
      const [ubData, wmMatches] = await Promise.all([
        fetchUnibetBasketData('San Antonio Spurs', 'Oklahoma City Thunder', 'nba').catch(() => null),
        fetchWinamaxBasketOdds('nba').catch(() => []),
      ]);
      const wmMatch = wmMatches.find(m => fuzzy(m.homeTeam, 'Spurs') && fuzzy(m.awayTeam, 'Thunder'));
      const wmDetails = wmMatch?.matchId ? await fetchWinamaxMatchDetails(wmMatch.matchId).catch(() => null) : null;
      for (const [name, stats] of Object.entries(ubData?.players || {})) {
        scrapedPlayers[name] = { unibet: {} };
        for (const st of ['pts', 'reb', 'ast']) { if (stats[st]) scrapedPlayers[name].unibet[st] = stats[st]; }
      }
      for (const [name, stats] of Object.entries(wmDetails?.players || {})) {
        const key = Object.keys(scrapedPlayers).find(k => nameMatch(k, name)) ?? name;
        if (!scrapedPlayers[key]) scrapedPlayers[key] = {};
        scrapedPlayers[key].winamax = {};
        for (const st of ['pts', 'reb', 'ast']) { if (stats[st]) scrapedPlayers[key].winamax[st] = stats[st]; }
      }
      log.push({ cacheHit: false, scraped: true, propPlayers: Object.keys(scrapedPlayers).length, sample: Object.entries(scrapedPlayers)[0]?.[0] });
    }

    const hRoster = await bgFetchRoster(24);
    const aRoster = await bgFetchRoster(25);
    const hSched = await bgFetchSchedule(24);
    const aSched = await bgFetchSchedule(25);
    const gameDate = '2026-05-23T00:30Z';

    for (const [players, mySched, oppSched, isHome] of [[hRoster, hSched, aSched, true], [aRoster, aSched, hSched, false]]) {
      for (const player of players.slice(0, 8)) {
        if (!player.stats?.pts || player.injury === 'Out') continue;
        const gl = await bgFetchGamelog(player.id);
        const roundStr = 'game';
        const est = computeEstimate(player, isHome, oppSched, mySched, gl, isHome ? 'OKC' : 'SAS', gameDate, roundStr, null, null);
        if (!est) { log.push({ player: player.name, skip: 'no estimate' }); continue; }
        const propsEntry = Object.entries(scrapedPlayers).find(([n]) => nameMatch(n, player.name));
        if (!propsEntry) { log.push({ player: player.name, skip: 'no props match', searched: Object.keys(scrapedPlayers).slice(0, 5) }); continue; }
        const bks = propsEntry[1];
        const playerLog = { player: player.name, matched: propsEntry[0], estPts: est.pts, estReb: est.reb, estAst: est.ast, alerts: [] };
        for (const stat of ['pts', 'reb', 'ast']) {
          const estVal = est[stat];
          if (estVal == null) continue;
          const refLine = bks.unibet?.[stat] ?? bks.winamax?.[stat] ?? null;
          if (!refLine?.line) continue;
          const std = calcStd(gl, stat);
          const deviation = est.deviation?.[stat] ?? 0;
          const pOver = probAtLeast(estVal, std, Math.ceil(refLine.line), stat, deviation);
          const pUnder = 1 - probAtLeast(estVal, std, (Math.floor(refLine.line) + 1), stat, deviation);
          playerLog.alerts.push({ stat, line: refLine.line, std: std?.toFixed(2), pOver: Math.round(pOver*100), pUnder: Math.round(pUnder*100), trigger: pOver >= 0.90 ? 'OVER!' : pUnder >= 0.90 ? 'UNDER!' : '' });
        }
        log.push(playerLog);
      }
    }
  } catch (e) { log.push({ error: e.message, stack: e.stack?.slice(0,300) }); }
  res.json(log);
});

app.post('/api/nba/test-alert', (req, res) => {
  const alert = {
    id: 'test_999_pts_over',
    player: 'Shai Gilgeous-Alexander',
    team: 'OKC',
    fixture: 'OKC vs SAS',
    round: 'Finales Conf. Ouest - Game 1',
    fixtureDate: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    eventId: 'test_event_999',
    homeTeam: 'Oklahoma City Thunder',
    awayTeam: 'San Antonio Spurs',
    stat: 'pts',
    line: 29.5,
    estimate: 33.2,
    direction: 'over',
    probability: 91,
    pinnacleOdds: 1.87,
    unibetOdds: 1.95,
    unibetLine: 29.5,
    winamaxOdds: 2.00,
    winamaxLine: 29.5,
    injury: null,
    savedAt: Date.now(),
  };
  const existing = backgroundAlerts.filter(a => a.id !== alert.id);
  backgroundAlerts = [...existing, alert];
  res.json({ ok: true, alert });
});

// ── Football-data.org Standings ───────────────────────────────────────────────
const _fdStandingsCache = {};

app.get('/api/football/standings/:league', async (req, res) => {
  if (!FD_KEY) return res.status(503).json({ error: 'FD_API_KEY not configured' });

  const { league } = req.params;
  const fdLeague = FD_LEAGUES.find(l => l.key === league);
  if (!fdLeague) return res.status(400).json({ error: `Unknown league: ${league}` });

  const hit = _fdStandingsCache[league];
  if (hit && Date.now() - hit.ts < 30 * 60 * 1000) return res.json(hit.data);

  try {
    const data = await fdGet(`/competitions/${fdLeague.code}/standings`);
    const table = data.standings?.find(s => s.type === 'TOTAL')?.table || [];
    const result = {
      table: table.map(s => ({
        id:           s.team.id,
        name:         s.team.name,
        shortName:    s.team.shortName,
        tla:          s.team.tla,
        position:     s.position,
        points:       s.points,
        played:       s.playedGames,
        wins:         s.won,
        draws:        s.draw,
        losses:       s.lost,
        goalsFor:     s.goalsFor,
        goalsAgainst: s.goalsAgainst,
        form:         (s.form || '').split('').filter(c => 'WDL'.includes(c)).slice(-5),
      })),
    };
    _fdStandingsCache[league] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    console.error('FD standings error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Football-data.org Team Matches ────────────────────────────────────────────
const _fdTeamMatchCache = {};

app.get('/api/football/teammatches/:teamId', async (req, res) => {
  if (!FD_KEY) return res.status(503).json({ error: 'FD_API_KEY not configured' });

  const { teamId } = req.params;
  const limit = Math.min(parseInt(req.query.limit || '30', 10), 50);
  const cacheKey = `${teamId}_${limit}`;
  const hit = _fdTeamMatchCache[cacheKey];
  if (hit && Date.now() - hit.ts < 6 * 60 * 60 * 1000) return res.json(hit.data);

  try {
    const data = await fdGet(`/teams/${teamId}/matches?status=FINISHED&limit=${limit}`);
    const matches = (data.matches || [])
      .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))
      .map(m => ({
        date:      m.utcDate,
        homeTeam:  m.homeTeam.shortName || m.homeTeam.name,
        awayTeam:  m.awayTeam.shortName || m.awayTeam.name,
        homeId:    m.homeTeam.id,
        awayId:    m.awayTeam.id,
        scoreHome: m.score.fullTime.home,
        scoreAway: m.score.fullTime.away,
        competition: m.competition.name,
      }));
    const result = { matches };
    _fdTeamMatchCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    console.error('FD teammatches error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Auto-settle backend ───────────────────────────────────────────────────────

app.post('/api/accepted-alerts', (req, res) => {
  const alert = req.body;
  if (!alert?.id) return res.status(400).json({ error: 'id required' });
  // Dédoublonnage par empreinte (joueur+stat+match), pas seulement par ID exact : un même pari réel
  // peut arriver avec deux IDs différents (ex. ID statique basketball.js vs ID live ESPN pour les
  // Finales NBA), ou en sens opposé (over/under) si la ligne a bougé entre deux cycles alors que
  // l'alerte précédente était déjà acceptée. Dans tous ces cas, une seule entrée doit être trackée.
  const isFingerprintDup = alert.type === 'player_prop' && alert.player && alert.stat && _acceptedAlerts.some(a =>
    a.id !== alert.id && a.type === 'player_prop' && a.player === alert.player && a.stat === alert.stat &&
    a.fixtureDate && alert.fixtureDate &&
    Math.abs(new Date(a.fixtureDate).getTime() - new Date(alert.fixtureDate).getTime()) < 36 * 3600_000
  );
  if (!isFingerprintDup && !_acceptedAlerts.find(a => a.id === alert.id)) {
    _acceptedAlerts.push(alert);
    _saveAccepted();
  }
  res.json({ ok: true });
});

app.delete('/api/accepted-alerts/:id', (req, res) => {
  _acceptedAlerts = _acceptedAlerts.filter(a => a.id !== req.params.id);
  _saveAccepted();
  res.json({ ok: true });
});

// Purge des alertes par nom de joueur (pour suppressions manuelles impossibles côté UI)
app.post('/api/purge-alerts', (req, res) => {
  const { players } = req.body; // [{ player, date }] ou [{ player }]
  if (!players?.length) return res.status(400).json({ error: 'players required' });
  for (const entry of players) {
    _settlements.push({ purge: true, player: entry.player, date: entry.date || null, settledAt: Date.now() });
  }
  _saveSettlements();
  res.json({ ok: true, purged: players.length });
});

app.post('/api/run-settle', async (req, res) => {
  await runAutoSettle().catch(e => console.error('settle error:', e));
  res.json({ ok: true, settlements: _settlements.length, accepted: _acceptedAlerts.length });
});

app.get('/api/settlements', (req, res) => {
  // Retourne les settlements des 48h — le frontend les applique au localStorage.
  // Les directives purge:true sont permanentes (blacklist joueur) et exemptées du cutoff,
  // sinon elles cessent d'être servies après 48h et le nettoyage localStorage ne tient plus.
  const cutoff = Date.now() - 48 * 3600_000;
  res.json(_settlements.filter(s => s.purge || s.settledAt > cutoff));
});

// Permet au frontend de pousser un résultat déjà résolu côté client (cas du foot : BTTS/O-U/1X2
// sont résolus dans le navigateur via /api/fd/worldcup, sans settlement auto côté backend comme
// pour les props basket). Sans ça, aucune trace serveur d'un pari foot gagné/perdu.
app.post('/api/settlements', (req, res) => {
  const s = req.body;
  if (!s?.id || !s?.status) return res.status(400).json({ error: 'id and status required' });
  if (!_settlements.find(x => x.id === s.id)) {
    _settlements.push({ id: s.id, status: s.status, probability: s.probability, line: s.line, edge: s.edge, settledAt: s.settledAt || Date.now() });
    _saveSettlements();
  }
  res.json({ ok: true });
});

let _calibrationDump = null;
app.post('/api/debug/calibration-dump', (req, res) => {
  _calibrationDump = req.body;
  res.json({ ok: true });
});
app.get('/api/debug/calibration-dump', (req, res) => res.json(_calibrationDump));

async function runAutoSettle() {
  const now = Date.now();
  // Déduplique les settlements existants (évite les doublons après restart)
  const settledIds = new Set(_settlements.map(s => s.id));
  const normAbbr = s => s?.toUpperCase().replace(/[^A-Z]/g, '') || '';
  const lastName = n => n?.split(' ').slice(-1)[0]?.toLowerCase() || '';
  const EU = new Set(['acb','lnb','bbl','legaa']);
  const base = `http://localhost:${process.env.PORT || 3001}`;

  // Règlement anticipé des props "Over" — dès que le cumul en direct dépasse la ligne, c'est
  // mathématiquement gagné (un stat de match ne redescend jamais en cours de partie), pas besoin
  // d'attendre la fin + les 2h de marge ci-dessous. Ne s'applique qu'aux Over (les Under peuvent
  // encore basculer jusqu'à la fin). Demandé le 23 juin 2026 après que Kelsey Mitchell ait dépassé
  // sa ligne de points en plein 4e quart-temps sans que l'alerte ne se règle.
  const liveOverCandidates = _acceptedAlerts.filter(a =>
    a.type === 'player_prop' && a.direction === 'over' && a.status === 'accepted' &&
    !settledIds.has(a.id) && new Date(a.fixtureDate || a.date).getTime() < now
  );
  if (liveOverCandidates.length) {
    const byMatchLive = {};
    for (const a of liveOverCandidates) {
      const k = `${a.fixture}__${a.fixtureDate}`;
      if (!byMatchLive[k]) {
        const isEuLeague = EU.has(a.league);
        const home = isEuLeague ? (a.homeTeam || a.fixture?.split(' vs ')[0]) : (a.homeShort || a.fixture?.split(' vs ')[0]);
        const away = isEuLeague ? (a.awayTeam || a.fixture?.split(' vs ')[1]) : (a.awayShort || a.fixture?.split(' vs ')[1]);
        byMatchLive[k] = { home, away, date: a.fixtureDate, league: a.league, alerts: [] };
      }
      byMatchLive[k].alerts.push(a);
    }
    for (const { home, away, date, league, alerts: matchAlerts } of Object.values(byMatchLive)) {
      if (!home || !away) continue;
      try {
        const bsUrl = EU.has(league)
          ? `${base}/api/euro/${league}/boxscore?date=${encodeURIComponent(date)}&home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`
          : league === 'wnba' ? `${base}/api/wnba/boxscore?date=${encodeURIComponent(date)}&home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`
          : `${base}/api/nba/boxscore?date=${encodeURIComponent(date)}&home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`;
        const bs = await fetch(bsUrl, { signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : null).catch(() => null);
        // Live ou terminé, peu importe — seul le cumul actuel compte pour décider si un Over est déjà dépassé
        if (!bs || bs.error || !(bs.status?.includes('STATUS_IN_PROGRESS') || bs.status?.includes('STATUS_FINAL'))) continue;
        const bsKeys = Object.keys(bs).filter(k => !['gameId','status','homeScore','awayScore','error'].includes(k));
        for (const a of matchAlerts) {
          const at = normAbbr(a.team);
          const teamKey = bsKeys.find(k => normAbbr(k) === at)
            || bsKeys.find(k => { const nk = normAbbr(k); return nk.startsWith(at) || at.startsWith(nk.slice(0,3)); })
            || bsKeys.find(k => normAbbr(a.homeTeam||'').length > 2 && normAbbr(k).startsWith(normAbbr(a.homeTeam||'').slice(0,4)) && at === normAbbr(a.homeShort||''))
            || bsKeys.find(k => normAbbr(a.awayTeam||'').length > 2 && normAbbr(k).startsWith(normAbbr(a.awayTeam||'').slice(0,4)) && at === normAbbr(a.awayShort||''))
            || null;
          const players = bs[teamKey] || [];
          const player = players.find(p => p.name === a.player || p.name?.toLowerCase() === a.player?.toLowerCase() || lastName(p.name) === lastName(a.player));
          if (!player || player.dnp) continue;
          let actualStat = player.stats?.[a.stat];
          if (actualStat == null) continue;
          if (typeof actualStat === 'string' && actualStat.includes('-')) actualStat = parseInt(actualStat.split('-')[0]) || 0;
          if (actualStat <= a.line) continue; // pas encore dépassé — le cycle normal décidera à la fin du match
          const isDupSettlement = _settlements.some(s =>
            s.player === a.player && s.stat === a.stat && s.fixtureDate && a.fixtureDate &&
            Math.abs(new Date(s.fixtureDate).getTime() - new Date(a.fixtureDate).getTime()) < 36 * 3600_000
          );
          if (!isDupSettlement) _settlements.push({ id: a.id, status: 'won', actualStat, player: a.player, stat: a.stat, direction: 'over', fixtureDate: a.fixtureDate, league: a.league, probability: a.acceptedProbability ?? a.probability, line: a.line, edge: a.edge, lineSource: a.lineSource, settledAt: Date.now(), liveEarlySettle: true });
          _acceptedAlerts = _acceptedAlerts.filter(x => x.id !== a.id);
          _saveAccepted(); _saveSettlements();
          settledIds.add(a.id);
        }
      } catch {}
    }
  }

  const toCheck = _acceptedAlerts.filter(a =>
    a.status === 'accepted' &&
    !settledIds.has(a.id) &&
    new Date(a.fixtureDate || a.date).getTime() + 2 * 3600_000 < now
  );
  if (!toCheck.length) return;

  const propsToCheck    = toCheck.filter(a => a.type === 'player_prop');
  const totalsToCheck   = toCheck.filter(a => a.type === 'game_total' || a.type === 'basketball_pinnacle_edge');
  const resultsToCheck  = toCheck.filter(a => a.type === 'basketball_result');
  const footballToCheck = toCheck.filter(a => ['football_btts', 'football_total', 'football_result'].includes(a.type));

  const byMatch = {};
  for (const a of propsToCheck) {
    const k = `${a.fixture}__${a.fixtureDate}`;
    if (!byMatch[k]) {
      // NBA/WNBA : utilise les shorts (SAS, NYK) — EU : utilise les noms complets
      const isEuLeague = EU.has(a.league);
      const home = isEuLeague ? (a.homeTeam || a.fixture?.split(' vs ')[0]) : (a.homeShort || a.fixture?.split(' vs ')[0]);
      const away = isEuLeague ? (a.awayTeam || a.fixture?.split(' vs ')[1]) : (a.awayShort || a.fixture?.split(' vs ')[1]);
      byMatch[k] = { home, away, date: a.fixtureDate, league: a.league, alerts: [] };
    }
    byMatch[k].alerts.push(a);
  }

  for (const { home, away, date, league, alerts: matchAlerts } of Object.values(byMatch)) {
    if (!home || !away) continue;
    try {
      const bsUrl = EU.has(league)
        ? `${base}/api/euro/${league}/boxscore?date=${encodeURIComponent(date)}&home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`
        : league === 'wnba' ? `${base}/api/wnba/boxscore?date=${encodeURIComponent(date)}&home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`
        : `${base}/api/nba/boxscore?date=${encodeURIComponent(date)}&home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`;
      const bs = await fetch(bsUrl, { signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (!bs || bs.error) continue;
      if (!bs.status?.includes('STATUS_FINAL')) continue;

      const bsKeys = Object.keys(bs).filter(k => !['gameId','status','homeScore','awayScore','error'].includes(k));
      for (const a of matchAlerts) {
        const at = normAbbr(a.team);
        // Matching équipe : exact → préfixe → premier mot du nom complet — jamais de fallback aveugle
        const teamKey = bsKeys.find(k => normAbbr(k) === at)
          || bsKeys.find(k => { const nk = normAbbr(k); return nk.startsWith(at) || at.startsWith(nk.slice(0,3)); })
          || bsKeys.find(k => normAbbr(a.homeTeam||'').length > 2 && normAbbr(k).startsWith(normAbbr(a.homeTeam||'').slice(0,4)) && at === normAbbr(a.homeShort||''))
          || bsKeys.find(k => normAbbr(a.awayTeam||'').length > 2 && normAbbr(k).startsWith(normAbbr(a.awayTeam||'').slice(0,4)) && at === normAbbr(a.awayShort||''))
          || null;
        const players = bs[teamKey] || [];
        const player = players.find(p => p.name === a.player || p.name?.toLowerCase() === a.player?.toLowerCase() || lastName(p.name) === lastName(a.player));
        // Anti-doublon : même pari réel parfois trackée sous 2 IDs (legacy fixture.id vs eventId,
        // ou alerte sens opposé acceptée par-dessus une déjà acceptée) → ne jamais pousser 2 settlements
        // pour le même joueur+stat sur un match à moins de 36h d'écart, quel que soit l'ID/la direction.
        const isDupSettlement = _settlements.some(s =>
          s.player === a.player && s.stat === a.stat && s.fixtureDate && a.fixtureDate &&
          Math.abs(new Date(s.fixtureDate).getTime() - new Date(a.fixtureDate).getTime()) < 36 * 3600_000
        );
        let status, actualStat = null;
        if (!player || player.dnp) {
          // Void = notifie le frontend (applySettlements) + supprime côté backend, sauvegarde immédiatement
          if (players.length > 0) {
            if (!isDupSettlement) _settlements.push({ id: a.id, status: 'void', player: a.player, stat: a.stat, direction: a.direction, fixtureDate: a.fixtureDate, settledAt: Date.now() });
            _acceptedAlerts = _acceptedAlerts.filter(x => x.id !== a.id);
            _saveAccepted(); _saveSettlements();
          }
          continue;
        }
        actualStat = player.stats?.[a.stat];
        if (actualStat == null) continue;
        // tpm est stocké au format "fait-tenté" (ex: "9-12") dans les boxscores — extraire le nombre fait avant comparaison
        if (typeof actualStat === 'string' && actualStat.includes('-')) actualStat = parseInt(actualStat.split('-')[0]) || 0;
        status = (a.direction === 'over' ? actualStat > a.line : actualStat < a.line) ? 'won' : 'lost';
        // probability/line/edge conservés pour pouvoir construire une courbe de calibration
        // (proba annoncée vs % réel gagné) — avant ce fix, perdus au règlement, rendant impossible
        // toute vérification a posteriori des recalibrations du modèle.
        if (!isDupSettlement) _settlements.push({ id: a.id, status, actualStat, player: a.player, stat: a.stat, direction: a.direction, fixtureDate: a.fixtureDate, league: a.league, probability: a.acceptedProbability ?? a.probability, line: a.line, edge: a.edge, lineSource: a.lineSource, settledAt: Date.now() });
        _acceptedAlerts = _acceptedAlerts.filter(x => x.id !== a.id);
        _saveAccepted(); _saveSettlements(); // Sauvegarde immédiate anti-doublons
      }
    } catch {}
  }

  // Score final domicile/extérieur d'un match — partagé par game_total et basketball_result.
  // EuroLeague non couvert (dépend d'une donnée statique frontend, basketball.js) — reste réglé
  // côté navigateur comme avant. acb/lnb/bbl/legaa via le scoreboard officiel, NBA/WNBA via boxscore.
  async function fetchFinalScoreBg(league, fixtureDate, home, away, homeShort, awayShort) {
    if (EU.has(league)) {
      const sb = await fetch(`${base}/api/euro/${league}/scoreboard`, { signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : null).catch(() => null);
      const game = (sb?.games || []).find(g => g.status === 'STATUS_FINAL' &&
        ((g.home?.short === homeShort && g.away?.short === awayShort) || (g.home?.name === home && g.away?.name === away)));
      if (!game || game.home.score == null || game.away.score == null) return null;
      return { homeScore: game.home.score, awayScore: game.away.score };
    }
    if (league === 'euroleague') return null;
    const hTeam = homeShort || (home || '');
    const aTeam = awayShort || (away || '');
    if (!hTeam || !aTeam) return null;
    const bsEndpoint = league === 'wnba' ? 'wnba' : 'nba';
    const bs = await fetch(`${base}/api/${bsEndpoint}/boxscore?date=${encodeURIComponent(fixtureDate)}&home=${encodeURIComponent(hTeam)}&away=${encodeURIComponent(aTeam)}`, { signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : null).catch(() => null);
    if (!bs || bs.error || !bs.status?.includes('STATUS_FINAL') || bs.homeScore == null || bs.awayScore == null) return null;
    return { homeScore: bs.homeScore, awayScore: bs.awayScore };
  }

  // Total O/U basket — étendu de la WNBA/NBA (déjà ok via les props plus haut) à toutes les ligues,
  // pour ne plus dépendre d'une visite de page (22 juin 2026).
  for (const a of totalsToCheck) {
    try {
      const score = await fetchFinalScoreBg(a.league, a.fixtureDate, a.home, a.away, a.homeShort, a.awayShort);
      if (!score) continue;
      const total = score.homeScore + score.awayScore;
      if (!total) continue;
      const status = (a.direction === 'over' ? total > a.line : total < a.line) ? 'won' : 'lost';
      _settlements.push({ id: a.id, status, actualStat: total, line: a.line, edge: a.edge, league: a.league, probability: a.acceptedProbability ?? a.prob, settledAt: Date.now() });
      _acceptedAlerts = _acceptedAlerts.filter(x => x.id !== a.id);
      _saveAccepted(); _saveSettlements();
    } catch {}
  }

  // Résultat équipe basket — jamais réglé automatiquement avant le 22 juin 2026 (aucun mécanisme,
  // ni navigateur ni serveur).
  for (const a of resultsToCheck) {
    try {
      const score = await fetchFinalScoreBg(a.league, a.fixtureDate, a.home, a.away, a.homeShort, a.awayShort);
      if (!score) continue;
      const homeWon = score.homeScore > score.awayScore;
      const status = (a.direction === 'home' ? homeWon : !homeWon) ? 'won' : 'lost';
      _settlements.push({ id: a.id, status, line: null, edge: a.edge, league: a.league, probability: a.acceptedProbability ?? a.probability, settledAt: Date.now() });
      _acceptedAlerts = _acceptedAlerts.filter(x => x.id !== a.id);
      _saveAccepted(); _saveSettlements();
    } catch {}
  }

  // Football BTTS / Total / Résultat — seules les fixtures CDM (fdcdm_*) ont une source de score
  // final aujourd'hui (/api/fd/worldcup). Même règle de résolution que le navigateur
  // (resolveFootballAlertResult, src/utils/syncAlerts.js), portée ici pour ne plus en dépendre.
  const footballCdm = footballToCheck.filter(a => (a.fixtureId || a.eventId || '').startsWith('fdcdm_'));
  if (footballCdm.length) {
    try {
      const wc = await fetch(`${base}/api/fd/worldcup`, { signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : null).catch(() => null);
      const games = wc?.games || [];
      for (const a of footballCdm) {
        const gid = (a.fixtureId || a.eventId).replace('fdcdm_', '');
        const game = games.find(g => String(g.id) === gid && ['STATUS_IN_PROGRESS', 'STATUS_FINAL'].includes(g.status));
        if (!game) continue;
        const hs = game.home?.score, as_ = game.away?.score;
        if (hs == null || as_ == null) continue;
        const isFinal = game.status === 'STATUS_FINAL';
        let status = null;
        if (a.type === 'football_btts') {
          if (hs > 0 && as_ > 0) status = 'won';
          else if (isFinal) status = 'lost';
        } else if (a.type === 'football_result') {
          if (isFinal) {
            if (a.direction === 'home') status = hs > as_ ? 'won' : 'lost';
            else if (a.direction === 'away') status = as_ > hs ? 'won' : 'lost';
            else status = hs === as_ ? 'won' : 'lost';
          }
        } else { // football_total
          const total = hs + as_;
          if (a.direction === 'over') { if (total > a.line) status = 'won'; else if (isFinal) status = 'lost'; }
          else { if (total > a.line) status = 'lost'; else if (isFinal) status = 'won'; }
        }
        if (!status) continue;
        _settlements.push({ id: a.id, status, line: a.line, edge: a.edge, league: a.league, probability: a.acceptedProbability ?? a.probability, settledAt: Date.now() });
        _acceptedAlerts = _acceptedAlerts.filter(x => x.id !== a.id);
        _saveAccepted(); _saveSettlements();
      }
    } catch {}
  }

  _saveAccepted();
  _saveSettlements();
}

// ── App Listen + Background Job ───────────────────────────────────────────────

// Permet à /api/system/health?refresh=1 de forcer un check immédiat — volontairement limité
// aux sources non-bookmaker (RotoWire, ACB) ; Unibet/Betclic gardent leur propre cadence,
// jamais déclenchés manuellement ici pour ne pas ajouter de charge de scraping sur eux.
const _manualHealthRefreshers = {};

// Déclenche un cycle de génération d'alertes immédiatement (appelé par /lanceapp au démarrage)
let _warmupRunning = false;
app.post('/api/system/warmup', (req, res) => {
  res.json({ ok: true, alreadyRunning: _warmupRunning });
  if (!_warmupRunning) {
    _warmupRunning = true;
    generateBackgroundAlerts().catch(() => {}).finally(() => { _warmupRunning = false; });
  }
});

app.listen(PORT, () => {
  console.log(`ValueBet backend → http://localhost:${PORT}`);
  if (!FOOTBALL_KEY) console.warn('⚠  FOOTBALL_API_KEY not set — /api/football/matches returns 503');
;

  // Sanity check au démarrage — détecte les problèmes critiques avant qu'ils atteignent l'UI
  setTimeout(async () => {
    const base = `http://localhost:${PORT}`;
    const checks = [
      { name: 'NBA scoreboard',  url: `${base}/api/nba/scoreboard` },
      { name: 'WNBA scoreboard', url: `${base}/api/wnba/scoreboard` },
      { name: 'ACB scoreboard',  url: `${base}/api/euro/acb/scoreboard` },
      { name: 'BBL scoreboard',  url: `${base}/api/euro/bbl/scoreboard` },
    ];
    for (const c of checks) {
      try {
        const r = await fetch(c.url, { signal: AbortSignal.timeout(8000) });
        const d = await r.json();
        const count = d.games?.length ?? 0;
        if (!r.ok || count === 0) console.warn(`⚠ SANITY [${c.name}]: ${r.status} — ${count} games`);
        else console.log(`✓ SANITY [${c.name}]: ${count} games`);
      } catch (e) { console.error(`✗ SANITY [${c.name}]: ${e.message}`); }
    }

    // /status ne consomme pas le quota journalier — sert juste à initialiser le compteur affiché
    if (FOOTBALL_KEY) footballGet('/status').catch(() => {});
    if (BBALL_KEY) bballFetch('/status').catch(() => {});

    // Pre-warm standings + leaders (WorldMap) — évite le CHARGEMENT au 1er clic
    for (const path of ['/api/nba/standings','/api/nba/leaders','/api/wnba/standings','/api/wnba/leaders','/api/acb/standings','/api/acb/leaders']) {
      fetch(`${base}${path}`, { signal: AbortSignal.timeout(30000) }).catch(() => {});
    }
  }, 5000);

  // Start background alert job: first run after 2s, then every 20min
  setTimeout(generateBackgroundAlerts, 2_000);
  setInterval(generateBackgroundAlerts, 20 * 60 * 1000);

  // Auto-settle : toutes les 3 min
  setInterval(() => runAutoSettle().catch(() => {}), 3 * 60 * 1000);
  setTimeout(() => runAutoSettle().catch(() => {}), 30_000);

  // ── Background odds refresh — toutes les 5 min ───────────────────────────
  // Rafraîchit les cotes (H2H + O/U) de tous les matchs à venir.
  // Ne consomme AUCUNE requête api-sports.io — scraping Unibet/Betclic/Winamax uniquement.
  async function refreshAllBasketballOdds() {
    const PORT = process.env.PORT || 3001;
    const base = `http://localhost:${PORT}`;
    const matches = [];

    // Collecte les matchs depuis les caches existants (aucun appel API)
    const nbaSb = _scoreboardCache.data?.games || [];
    for (const g of nbaSb) {
      if (g.status !== 'STATUS_FINAL' && g.home?.name && g.away?.name)
        matches.push({ home: g.home.name, away: g.away.name, league: 'nba', date: g.date });
    }
    const wnbaSb = _wnbaScoreboardCache.data?.games || [];
    for (const g of wnbaSb) {
      if (g.status !== 'STATUS_FINAL' && g.home?.name && g.away?.name)
        matches.push({ home: g.home.name, away: g.away.name, league: 'wnba', date: g.date });
    }
    for (const league of ['acb', 'lnb', 'bbl', 'legaa']) {
      const cached = _euroCache[`euro_sb_${league}`];
      for (const g of cached?.data?.games || []) {
        if (g.status !== 'STATUS_FINAL' && g.home?.name && g.away?.name)
          matches.push({ home: g.home.name, away: g.away.name, league, date: g.date });
      }
    }

    if (!matches.length) return;
    console.log(`[odds-refresh] Refreshing ${matches.length} matches…`);

    // Rafraîchit séquentiellement avec 300ms entre chaque pour ne pas marteler les bookmakers
    for (const m of matches) {
      try {
        const url = `${base}/api/basketball/odds?home=${encodeURIComponent(m.home)}&away=${encodeURIComponent(m.away)}&league=${m.league}&date=${encodeURIComponent(m.date || '')}&refresh=1`;
        await fetchWithTimeout(url, 25000).catch(() => {});
      } catch {}
      await new Promise(r => setTimeout(r, 300));
    }
    console.log(`[odds-refresh] Done.`);
  }

  // Premier run 45s après démarrage, puis toutes les 10 min
  setTimeout(() => {
    refreshAllBasketballOdds().catch(() => {});
    setInterval(() => refreshAllBasketballOdds().catch(() => {}), 10 * 60 * 1000);
  }, 45_000);

  // ── Health check cotes football — toutes les 10min ───────────────────────────
  async function refreshFootballOddsHealth() {
    try {
      const [ub, bc, wm] = await Promise.all([
        fetchUnibetFootballOdds().catch(() => []),
        fetchBetclicOdds().catch(() => []),
        fetchWinamaxOdds().catch(() => []),
      ]);
      _updateScraper('unibet_foot',  Array.isArray(ub) && ub.length > 0);
      _updateScraper('betclic_foot', Array.isArray(bc) && bc.length > 0);
      _updateScraper('winamax_foot', Array.isArray(wm) && wm.length > 0);
    } catch {}
  }
  setTimeout(() => {
    refreshFootballOddsHealth().catch(() => {});
    setInterval(() => refreshFootballOddsHealth().catch(() => {}), 10 * 60 * 1000);
  }, 60_000);

  // ── Health check RotoWire — toutes les 15min ─────────────────────────────────
  // NBA et WNBA sont testés séparément : un jour sans match NBA (off-day playoffs)
  // ne doit pas faire passer RotoWire au rouge si la WNBA a des lineups.
  async function refreshRotoWireHealth() {
    const [nba, wnba] = await Promise.all([
      fetchRotoWireAllLineups().catch(() => null),
      fetchRotoWireWNBALineups().catch(() => null),
    ]);
    const nbaOk  = nba  != null && Object.keys(nba).length > 0;
    const wnbaOk = wnba != null && Object.keys(wnba).length > 0;
    _updateScraper('rotowire', nbaOk || wnbaOk);
  }
  _manualHealthRefreshers.rotowire = refreshRotoWireHealth;
  setTimeout(() => {
    refreshRotoWireHealth().catch(() => {});
    setInterval(() => refreshRotoWireHealth().catch(() => {}), 15 * 60 * 1000);
  }, 30_000);

  // ── Pings manuels légers (bouton Rafraîchir dashboard) ───────────────────
  const PING_UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept-Language': 'fr-FR,fr;q=0.9' };

  _manualHealthRefreshers.espn = async () => {
    try {
      const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard', { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      _updateScraper('espn', r.ok && Array.isArray(d?.events));
    } catch { _updateScraper('espn', false); }
  };

  _manualHealthRefreshers.unibet = async () => {
    try {
      const r = await fetchBk('unibet', 'https://www.unibet.fr/paris-basketball', { headers: PING_UA, signal: AbortSignal.timeout(10000) });
      _updateScraper('unibet', r?.status === 200);
      _updateScraper('unibet_foot', r?.status === 200);
    } catch { _updateScraper('unibet', false); _updateScraper('unibet_foot', false); }
  };

  _manualHealthRefreshers.betclic = async () => {
    try {
      const r = await fetchBk('betclic', 'https://www.betclic.fr/basketball-s4', { headers: PING_UA, signal: AbortSignal.timeout(10000) });
      _updateScraper('betclic', r?.status === 200);
      _updateScraper('betclic_foot', r?.status === 200);
    } catch { _updateScraper('betclic', false); _updateScraper('betclic_foot', false); }
  };

  // ── Health check Bzzoiro — toutes les 15min ───────────────────────────────────
  async function refreshBzzoiroHealth() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const data = await bzzFetch(`/events/?league=2&date_from=${today}&limit=1`);
      _updateScraper('bzzoiro', data != null);
    } catch { _updateScraper('bzzoiro', false); }
  }
  setTimeout(() => {
    refreshBzzoiroHealth().catch(() => {});
    setInterval(() => refreshBzzoiroHealth().catch(() => {}), 15 * 60 * 1000);
  }, 20_000);

  // ── Health check ACB (acb.com) — toutes les 15min ─────────────────────────────
  // Sans ça, l'indicateur ne se rafraîchit que quand quelqu'un visite une page ACB
  // (ou 1x/jour via dailyRosterRefresh) → passe au rouge dès 20min d'inactivité,
  // même quand le scraping fonctionne très bien (faux signal de panne).
  async function refreshAcbHealth() {
    try {
      const firstId = Object.keys(ACB_TEAM_MAP)[0];
      const slug = ACB_TEAM_MAP[firstId];
      const html = await fetchAcbHtml(`/es/liga/equipos/${slug}?editionId=90`);
      const roster = parseAcbRoster(html);
      _updateScraper('acb', roster.length > 0);
    } catch { _updateScraper('acb', false); }
  }
  _manualHealthRefreshers.acb = refreshAcbHealth;
  setTimeout(() => {
    refreshAcbHealth().catch(() => {});
    setInterval(() => refreshAcbHealth().catch(() => {}), 15 * 60 * 1000);
  }, 25_000);

  // ── Refresh quotidien des rosters (Base de données) ──────────────────────────
  // Pre-chauffe les caches NBA / WNBA / ACB une fois par jour.
  async function dailyRosterRefresh() {
    const base = `http://localhost:${PORT}`;
    console.log('[roster-refresh] Start daily roster pre-warm…');

    // NBA — 30 équipes (IDs ESPN 1-30, bdlId)
    const NBA_IDS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30];
    for (const id of NBA_IDS) {
      try { await fetchWithTimeout(`${base}/api/nba/players/${id}?refresh=1`, 12000).catch(() => {}); } catch {}
      await new Promise(r => setTimeout(r, 300));
    }

    // WNBA — 15 équipes
    const WNBA_IDS = [20, 19, 18, 3, 129689, 5, 17, 6, 8, 9, 11, 132052, 14, 131935, 16];
    for (const id of WNBA_IDS) {
      try { await fetchWithTimeout(`${base}/api/wnba/players/${id}?refresh=1`, 12000).catch(() => {}); } catch {}
      await new Promise(r => setTimeout(r, 300));
    }

    // ACB — 18 équipes via scraping acb.com
    for (const id of Object.keys(ACB_TEAM_MAP)) {
      try { await fetchWithTimeout(`${base}/api/euro/acb/players/${id}?refresh=1`, 30000).catch(() => {}); } catch {}
      await new Promise(r => setTimeout(r, 800));
    }

    console.log('[roster-refresh] Done.');
  }

  // Premier run 2 min après démarrage, puis toutes les 24h
  setTimeout(() => {
    dailyRosterRefresh().catch(() => {});
    setInterval(() => dailyRosterRefresh().catch(() => {}), 24 * 60 * 60 * 1000);
  }, 2 * 60 * 1000);
});
