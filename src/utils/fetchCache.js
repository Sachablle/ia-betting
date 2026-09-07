// Cache mémoire inter-navigations pour les appels GET fréquents.
// Les données survivent aux montages/démontages de composants — naviguer
// sur une page déjà visitée affiche les données en cache instantanément
// pendant que le rafraîchissement se fait en arrière-plan.
const _cache = new Map(); // url → { data, ts, inflight }

// Fix 4 septembre 2026 — fetch() brut n'a pas de timeout par défaut : si une requête reste bloquée
// côté réseau (ne serait-ce qu'une fois), sa promesse ne se résout jamais, et tout code qui l'attend
// (ex: le bouton "Recharger" de la Carte du Monde, Promise.all sur plusieurs ligues) reste bloqué en
// chargement indéfiniment — cas réel signalé par l'utilisateur sur un match PSG en direct. Timeout dur
// pour que l'appel finisse toujours par échouer proprement plutôt que de pendre pour toujours ; le
// `.catch()` déjà présent partout où cachedFetch est utilisé retombe alors sur les anciennes données.
const CACHED_FETCH_TIMEOUT_MS = 5_000;

export function cachedFetch(url, ttlMs = 20_000) {
  const hit = _cache.get(url);
  const now = Date.now();

  // Cache frais → réponse immédiate
  if (hit?.data && now - hit.ts < ttlMs) return Promise.resolve(hit.data);

  // Requête déjà en vol → on s'accroche à la même promise (déduplication)
  if (hit?.inflight) return hit.inflight;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CACHED_FETCH_TIMEOUT_MS);
  const inflight = fetch(url, { signal: controller.signal })
    .finally(() => clearTimeout(timeoutId))
    .then(r => {
      // Un 429/500 (ex: rate-limit football-data.org, 10 req/min vite atteint) renvoie quand même
      // un corps JSON ({error: "..."}) — sans ce check, il était traité comme une réponse valide et
      // mis en cache tel quel pour tout le ttlMs (jusqu'à 30min), affichant "aucun résultat" pour une
      // équipe alors que la vraie donnée existe, juste temporairement indisponible (2 septembre 2026,
      // cas réel : "Derniers résultats" vide sur des équipes PL/Ligue1/Serie A/La Liga au hasard).
      if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
      return r.json();
    })
    .then(data => {
      _cache.set(url, { data, ts: Date.now(), inflight: null });
      return data;
    })
    .catch(err => {
      // En cas d'erreur, on garde l'ancienne data si elle existe
      const prev = _cache.get(url);
      _cache.set(url, { data: prev?.data ?? null, ts: prev?.ts ?? 0, inflight: null });
      throw err;
    });

  _cache.set(url, { data: hit?.data ?? null, ts: hit?.ts ?? 0, inflight });
  return inflight;
}

// Lecture synchrone du cache — pour initialiser useState sans attendre la Promise.
// Retourne null si pas de données en cache (ou expirées).
export function getCached(url, ttlMs = 60_000) {
  const hit = _cache.get(url);
  if (hit?.data && Date.now() - hit.ts < ttlMs) return hit.data;
  return null;
}

// Force un re-fetch au prochain appel (ex: après un refresh manuel)
export function invalidateCache(url) {
  _cache.delete(url);
}
