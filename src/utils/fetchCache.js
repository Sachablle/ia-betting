// Cache mémoire inter-navigations pour les appels GET fréquents.
// Les données survivent aux montages/démontages de composants — naviguer
// sur une page déjà visitée affiche les données en cache instantanément
// pendant que le rafraîchissement se fait en arrière-plan.
const _cache = new Map(); // url → { data, ts, inflight }

export function cachedFetch(url, ttlMs = 20_000) {
  const hit = _cache.get(url);
  const now = Date.now();

  // Cache frais → réponse immédiate
  if (hit?.data && now - hit.ts < ttlMs) return Promise.resolve(hit.data);

  // Requête déjà en vol → on s'accroche à la même promise (déduplication)
  if (hit?.inflight) return hit.inflight;

  const inflight = fetch(url)
    .then(r => r.json())
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
