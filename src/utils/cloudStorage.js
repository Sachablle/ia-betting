// Synchronise les données importantes avec MongoDB via /api/userdata.
// Les lectures restent sur localStorage (rapide, instantané).
// Les écritures vont dans localStorage ET MongoDB (sync cross-device).

const SYNC_KEYS = new Set([
  'nba_prop_alerts',
  'nba_game_total_alerts',
  'fb_btts_alerts',
  'fb_total_alerts',
  'fb_result_alerts',
  'fb_dc_btts_alerts',
  'fb_dc_ou_alerts',
  'basketball_result_alerts',
  'basketball_spread_alerts',
  'fb_pinnacle_alerts',
  'bball_pinnacle_alerts',
  'bball_pinnacle_props_alerts',
  'nba_bet_history',
  'nba_has_history',
  'bet_notes',
  'bankroll_tracker',
]);

// Protège une clé contre l'écrasement par loadFromCloud pendant 90s après un setItem local.
// Évite la race condition : user accepte une alerte → POST MongoDB en cours → loadFromCloud GET
// retourne l'ancien "pending" et l'écrase avant que le POST soit arrivé.
const _writeProtected = new Map(); // key → expiry timestamp

// Même fiabilité que postAcceptedAlertReliably/postSettlementReliably (syncAlerts.js, fix du
// 22/25 juin) — le POST /api/userdata était resté en fire-and-forget silencieux ici. S'il échoue
// une fois (cold-start Render, réseau), la valeur locale (ex: un règlement won/lost basket) reste
// non synchronisée ; le prochain loadFromCloud() (toutes les 2 min, protection 90s expirée) écrase
// alors le localStorage avec l'ancienne version Mongo, et comme /api/settlements ne resert que les
// règlements des dernières 48h côté backend, le résultat ne se réapplique jamais — perte définitive
// constatée sur des alertes basket réglées (7 juillet 2026).
const PENDING_USERDATA_KEY = 'pending_userdata_sync';
const readPendingUserData  = () => { try { return JSON.parse(localStorage.getItem(PENDING_USERDATA_KEY) || '[]'); } catch { return []; } };
const writePendingUserData = list => { try { localStorage.setItem(PENDING_USERDATA_KEY, JSON.stringify(list)); } catch {} };

// Un pending resté bloqué (échecs répétés, onglet ouvert des jours) ne doit jamais empêcher
// indéfiniment loadFromCloud() de rapatrier la vraie valeur serveur — sinon un onglet ancien reste
// figé pour toujours sur sa version locale (bug constaté le 7 juillet 2026 : navigation privée à
// jour, onglet normal resté bloqué sur d'anciennes données malgré un rechargement complet).
const PENDING_BLOCK_MS = 30_000;

async function postUserDataReliably(key, parsed) {
  for (const delay of [0, 1500, 4000]) {
    if (delay) await new Promise(r => setTimeout(r, delay));
    try {
      const res = await fetch('/api/userdata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: parsed }),
      });
      if (res.ok) { writePendingUserData(readPendingUserData().filter(p => p.key !== key)); return; }
    } catch {}
  }
  writePendingUserData([...readPendingUserData().filter(p => p.key !== key), { key, value: parsed, queuedAt: Date.now() }]);
}

// Réessaie les écritures MongoDB jamais confirmées (3 tentatives épuisées) — appelé depuis
// loadFromCloud à chaque cycle, comme flushPendingAlertSync/flushPendingSettlementSync.
export async function flushPendingUserData() {
  const pending = readPendingUserData();
  for (const { key, value } of pending) {
    // Repart de la version localStorage ACTUELLE, pas de l'instantané figé au moment de la mise en
    // file — un pending resté bloqué des heures (ex: coupure backend passagère) rejouait sinon un
    // état obsolète et écrasait des changements faits entre-temps (cas réel : une alerte annulée
    // après coup se faisait ré-accepter par un vieux pending jamais purgé, 17 juillet 2026).
    let fresh = value;
    try { const raw = localStorage.getItem(key); if (raw != null) fresh = JSON.parse(raw); } catch {}
    try {
      const res = await fetch('/api/userdata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: fresh }),
      });
      if (res.ok) writePendingUserData(readPendingUserData().filter(p => p.key !== key));
    } catch {}
  }
}

// Résolu une seule fois, dès que le tout premier loadFromCloud() de la session se termine (succès
// ou échec) — permet à un code qui lirait/réécrirait une clé SYNC_KEYS dès le montage (ex: le Suivi
// Bankroll qui "seed" sa baseline) d'attendre que le vrai état Mongo soit rapatrié avant d'agir.
// Fix 23 juillet 2026 : sans ça, un navigateur/onglet neuf (localStorage vide) déclenchait
// seedBaselineIfNeeded() → saveBankrollState() → cloudSet AVANT que ce loadFromCloud() ait eu le
// temps de répondre, écrasant le vrai bankroll_tracker partagé avec un état par défaut tout neuf
// (cas réel : solde/historique réels remplacés par un état vierge après un test Playwright sur une
// session vierge).
let _resolveInitialSync;
const _initialSyncPromise = new Promise(resolve => { _resolveInitialSync = resolve; });
let _initialSyncSettled = false;
export function waitForInitialCloudSync() { return _initialSyncPromise; }

// Charge toutes les données depuis MongoDB dans localStorage au démarrage.
export async function loadFromCloud() {
  try {
    await flushPendingUserData();
    try {
      const res = await fetch('/api/userdata');
      if (!res.ok) return;
      const data = await res.json();
      const now = Date.now();
      const pendingKeys = new Set(
        readPendingUserData().filter(p => now - (p.queuedAt ?? 0) < PENDING_BLOCK_MS).map(p => p.key)
      );
      for (const [key, value] of Object.entries(data)) {
        // Ne pas écraser une clé modifiée localement dans les 90 dernières secondes,
        // ni une clé dont l'envoi vers Mongo est encore en attente (POST précédent en échec).
        if ((_writeProtected.get(key) ?? 0) > now) continue;
        if (pendingKeys.has(key)) continue;
        try {
          localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        } catch {}
      }
    } catch {}
  } finally {
    if (!_initialSyncSettled) { _initialSyncSettled = true; _resolveInitialSync(); }
  }
}

// Remplace localStorage.setItem pour les clés importantes.
// Écrit localement ET envoie à MongoDB en arrière-plan (avec retry, cf. postUserDataReliably).
export function setItem(key, value) {
  try { localStorage.setItem(key, value); } catch {}
  if (!SYNC_KEYS.has(key)) return;
  // Protéger cette clé pour 90s (temps suffisant pour que le POST MongoDB arrive)
  _writeProtected.set(key, Date.now() + 90_000);
  let parsed;
  try { parsed = JSON.parse(value); } catch { parsed = value; }
  postUserDataReliably(key, parsed);
}
