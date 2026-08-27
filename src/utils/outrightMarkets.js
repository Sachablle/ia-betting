// Labels des marchés outrights secondaires (Top N / Relégation / Conférence NBA), partagés entre
// OutrightCompetitionPage.jsx (affichage des cotes par marché) et OutrightAlertCards.jsx (alertes,
// 1er août 2026) — extrait de OutrightCompetitionPage.jsx pour éviter la duplication.

export const MARKET_ORDER = ['winner', 'conference_eastern', 'conference_western', 'top2', 'top3', 'top4', 'top5', 'top6', 'top10', 'relegation'];
export const MARKET_LABELS = {
  winner: 'Vainqueur', top2: 'Top 2', top3: 'Podium (Top 3)', top4: 'Top 4', top5: 'Top 5',
  top6: 'Top 6', top10: 'Top 10', relegation: 'Relégation',
  // Clé partagée avec Pinnacle (_classifyPinnacleSpecialDescription, 30 juillet 2026) — Betclic
  // (français, _slugifyMarketTitle) normalise vers ces mêmes clés pour fusionner sur un seul onglet.
  conference_eastern: 'Conférence Est', conference_western: 'Conférence Ouest',
};

export function marketLabel(key) {
  // Filet de sécurité générique pour tout marché "topN" pas explicitement listé ci-dessus
  // (ex. un nouveau palier ajouté par un bookmaker) plutôt que d'afficher la clé brute.
  const topMatch = /^top(\d+)$/.exec(key || '');
  if (topMatch) return MARKET_LABELS[key] || `Top ${topMatch[1]}`;
  if (MARKET_LABELS[key]) return MARKET_LABELS[key];
  // Marchés capturés génériquement (30 juillet 2026, ex. "division_nord_ouest",
  // "conference_est", "finaliste") — la clé est un slug du titre Betclic, on la remet en forme
  // plutôt que d'afficher le underscore brut.
  return (key || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Marchés connus toujours en tête (ordre fixe) ; tout le reste (marchés génériques capturés par
// slug, ex. divisions/conférences NBA) suit ensuite, dans l'ordre où le backend les a renvoyés.
export function marketSortIndex(key) {
  const i = MARKET_ORDER.indexOf(key);
  return i === -1 ? MARKET_ORDER.length : i;
}

// Marchés pour lesquels une vraie alerte (outright_model/outright_gap) est branchée côté backend
// (2 août 2026, generateOutrightAlerts()/generateOutrightCutoffAlerts() dans server.js) — reflet
// exact de FOOTBALL_CUTOFF_MARKETS/NBA_CONFERENCE_MARKETS, à tenir synchronisé si de nouveaux
// marchés sont branchés côté backend. "winner" toujours présent (marché d'origine, 23 juin 2026).
export const ALERTED_MARKETS = {
  ligue1:     new Set(['winner', 'top3', 'relegation']),
  pl:         new Set(['winner', 'top2', 'top4', 'top5', 'top6', 'top10', 'relegation']),
  laliga:     new Set(['winner', 'top4', 'relegation']),
  seriea:     new Set(['winner']),
  bundesliga: new Set(['winner']),
  nba:        new Set(['winner', 'conference_eastern', 'conference_western', 'vainqueur_de_la_division_atlantique', 'vainqueur_de_la_division_centrale', 'vainqueur_de_la_division_sud_est', 'vainqueur_de_la_division_nord_ouest', 'vainqueur_de_la_division_pacifique', 'vainqueur_de_la_division_sud_ouest']),
  wnba:       new Set(['winner', 'finaliste']),
};
export function hasAlert(compKey, marketKey) {
  return ALERTED_MARKETS[compKey]?.has(marketKey) ?? false;
}
