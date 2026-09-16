// Meilleure cote "jouable" parmi les bookmakers fournis — jamais Pinnacle (référence de calcul
// d'edge, pas un bookmaker sur lequel on mise réellement), même logique que extractProbOdds()
// (PendingAlertWidgets.jsx) pour rester cohérent avec le calculateur de mise.
//
// La suggestion de mise par alerte basée sur la cote (Kelly÷12, 3 septembre 2026) a été retirée le
// 7 septembre 2026 — remplacée par `stakePct` calculé côté backend, indexé UNIQUEMENT sur le %
// calibré de l'alerte (cf. StakeBadge, FootballAlertCards.jsx) : demande explicite utilisateur de
// sortir la cote du calcul entièrement ("on cherche pas à être rentable sur la cote, juste à faire
// en sorte que l'alerte soit gagnante").
export function bestPlayableOdds(...odds) {
  const valid = odds.filter(o => typeof o === 'number' && o > 1);
  return valid.length ? Math.max(...valid) : null;
}
