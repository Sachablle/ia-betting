// Synchronise les données importantes avec MongoDB via /api/userdata.
// Les lectures restent sur localStorage (rapide, instantané).
// Les écritures vont dans localStorage ET MongoDB (sync cross-device).

const SYNC_KEYS = new Set([
  'nba_prop_alerts',
  'nba_game_total_alerts',
  'fb_btts_alerts',
  'fb_total_alerts',
  'fb_result_alerts',
  'basketball_result_alerts',
  'fb_pinnacle_alerts',
  'bball_pinnacle_alerts',
  'bball_pinnacle_props_alerts',
  'nba_bet_history',
  'nba_has_history',
  'bet_notes',
]);

// Protège une clé contre l'écrasement par loadFromCloud pendant 90s après un setItem local.
// Évite la race condition : user accepte une alerte → POST MongoDB en cours → loadFromCloud GET
// retourne l'ancien "pending" et l'écrase avant que le POST soit arrivé.
const _writeProtected = new Map(); // key → expiry timestamp

// Charge toutes les données depuis MongoDB dans localStorage au démarrage.
export async function loadFromCloud() {
  try {
    const res = await fetch('/api/userdata');
    if (!res.ok) return;
    const data = await res.json();
    const now = Date.now();
    for (const [key, value] of Object.entries(data)) {
      // Ne pas écraser une clé modifiée localement dans les 90 dernières secondes
      if ((_writeProtected.get(key) ?? 0) > now) continue;
      try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      } catch {}
    }
  } catch {}
}

// Remplace localStorage.setItem pour les clés importantes.
// Écrit localement ET envoie à MongoDB en arrière-plan.
export function setItem(key, value) {
  try { localStorage.setItem(key, value); } catch {}
  if (!SYNC_KEYS.has(key)) return;
  // Protéger cette clé pour 90s (temps suffisant pour que le POST MongoDB arrive)
  _writeProtected.set(key, Date.now() + 90_000);
  try {
    let parsed;
    try { parsed = JSON.parse(value); } catch { parsed = value; }
    fetch('/api/userdata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: parsed }),
    }).catch(() => {});
  } catch {}
}
