// Suggestion de mise par alerte, affichée directement dans l'en-tête de chaque carte (3 septembre
// 2026, demande explicite) — indépendante des autres alertes en attente (contrairement au
// Calculateur de mise multi-alertes de PendingAlertWidgets.jsx, qui lui répartit le budget RESTANT
// du jour entre tout ce qui est pending). Les deux coexistent : celle-ci donne un avis rapide et fixe
// par alerte, l'autre la vraie décision en euros quand plusieurs alertes se bousculent le même jour.
//
// Kelly plein f=(bp-q)/b (b=cote-1) donne un % bien trop agressif pris seul (ex: 49% sur un pick à
// 82%/cote 1.55) — nos probas ne sont jamais parfaitement calibrées (cf. suivi near-miss) et rien ne
// borne la concentration sur une seule alerte comme le fait le plafond du calculateur. Division par 12
// (choisie avec l'utilisateur le 3 septembre 2026 pour retomber sur des ordres de grandeur cohérents
// avec ses mises réelles historiques — médiane ~4% d'une bankroll à 1000€) + plafond dur à 10%.
// Non calibré sur des résultats réels (v1, comme SHRINK_K/DIXON_COLES_RHO) — à ajuster une fois qu'on
// aura assez de paris passés avec ce système pour voir si les % proposés collent à ce qui gagne vraiment.
const STAKE_SUGGESTION_DIVISOR = 12;
const STAKE_SUGGESTION_CAP_PCT = 10;

// probabilityPct : 0-100 (même échelle que alert.probability partout dans l'app). odds : cote décimale.
export function suggestedStakePct(probabilityPct, odds) {
  if (probabilityPct == null || odds == null || odds <= 1) return null;
  const p = probabilityPct / 100;
  const b = odds - 1;
  const kellyFull = p - (1 - p) / b;
  if (kellyFull <= 0) return 0;
  return Math.min((kellyFull / STAKE_SUGGESTION_DIVISOR) * 100, STAKE_SUGGESTION_CAP_PCT);
}

// Meilleure cote "jouable" parmi les bookmakers fournis — jamais Pinnacle (référence de calcul
// d'edge, pas un bookmaker sur lequel on mise réellement), même logique que extractProbOdds()
// (PendingAlertWidgets.jsx) pour rester cohérent avec le calculateur de mise.
export function bestPlayableOdds(...odds) {
  const valid = odds.filter(o => typeof o === 'number' && o > 1);
  return valid.length ? Math.max(...valid) : null;
}

// Libellé prêt à afficher, ex: "5% de la BK" / "<1% de la BK" / null si pas assez de données.
export function stakeSuggestionLabel(probabilityPct, odds) {
  const pct = suggestedStakePct(probabilityPct, odds);
  if (pct == null) return null;
  if (pct <= 0) return null;
  return pct < 1 ? '<1% de la BK' : `${Math.round(pct)}% de la BK`;
}
