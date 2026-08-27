// Score composite "outrights" (paris vainqueur de compétition) — 28 juillet 2026.
// Même esprit que computeFootball.js : fonctions pures, pas d'accès réseau.
//
// IMPORTANT — poids/seuils non calibrés (même statut que DIXON_COLES_RHO/SHRINK_K dans
// computeFootball.js) : valeurs de départ raisonnables, choisies à la main, PAS validées sur des
// résultats réels — un outright ne se règle qu'une fois par saison, impossible de calibrer
// statistiquement avant d'avoir accumulé plusieurs saisons de données. À revoir avec
// near_miss_outrights.json une fois assez d'historique accumulé (voir server.js, génération
// des alertes outright_model/outright_gap).

const clamp01 = x => Math.max(0, Math.min(1, x));

// ── Football ──────────────────────────────────────────────────────────────────

// `standings` : { points, played } de l'équipe. `form` : tableau des 5 derniers résultats
// ('W'/'D'/'L'). `leaderPace` : points/match de l'équipe en tête du classement (référence).
// `attackFactor`/`defenseFactor` : computeTeamAttackDefenseFactor (computeFootball.js), déjà
// ajustés par les pénalités blessure de l'appelant si besoin (ou passer injuryPenalty séparément).
// `remainingFixtures` : [{ oppPaceRelative }] — force de l'adversaire (pace/leaderPace, 0-1+)
// pour chaque match restant, calculée par l'appelant depuis le classement complet.
function computeFootballOutrightScore({
  standings, form, leaderPace, attackFactor, defenseFactor,
  remainingFixtures = [], injuryPenalty = { attackPenalty: 1, defensePenalty: 1 },
  trophyCount = 0,
}) {
  if (!standings?.played || !leaderPace) return null;

  const pace = standings.points / standings.played;
  const paceComponent = 40 * clamp01(pace / leaderPace);

  const formPts = (form || []).reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
  const recentPace = form?.length ? formPts / form.length : pace;
  // Momentum : forme récente au-dessus/en-dessous du rythme saison, amorti (±3 pts/match d'écart
  // max avant saturation) — pas une comparaison au leader, une comparaison à SA propre moyenne.
  const formComponent = 25 * clamp01(0.5 + (recentPace - pace) / 6);

  const adjAttack  = (attackFactor  ?? 1) * (injuryPenalty.attackPenalty  ?? 1);
  const adjDefense = (defenseFactor ?? 1) * (injuryPenalty.defensePenalty ?? 1);
  const attackDefenseComponent = 20 * clamp01(0.5 + (adjAttack - adjDefense) / 2);

  const avgOppPace = remainingFixtures.length
    ? remainingFixtures.reduce((s, f) => s + (f.oppPaceRelative ?? 0.5), 0) / remainingFixtures.length
    : 0.5;
  const scheduleComponent = 10 * clamp01(1 - avgOppPace * 0.5);

  const trophyComponent = 5 * clamp01(trophyCount / 10);

  const score = paceComponent + formComponent + attackDefenseComponent + scheduleComponent + trophyComponent;

  return {
    score: +score.toFixed(1),
    components: {
      pace: +paceComponent.toFixed(1),
      form: +formComponent.toFixed(1),
      attackDefense: +attackDefenseComponent.toFixed(1),
      schedule: +scheduleComponent.toFixed(1),
      trophy: +trophyComponent.toFixed(1),
    },
  };
}

// Score composite "Relégation" (1er août 2026) — même 4 ingrédients que
// computeFootballOutrightScore, sens inversé puisqu'on cherche une équipe FAIBLE plutôt que forte.
// Volontairement une fonction séparée plutôt qu'un flag "direction" sur computeFootballOutrightScore
// ci-dessus : pour "Top N" (finir dans les N premiers), la fonction existante marche déjà TELLE
// QUELLE en lui passant le rythme de l'équipe à la position N comme `leaderPace` — pas besoin d'y
// toucher. Seule la Relégation a besoin d'un sens réellement inversé sur chaque composante.
// `safetyPace` : rythme de points de la dernière équipe "sauvée" (juste au-dessus de la zone rouge).
// Pas d'historique de titres (aucun sens ici) — son poids (5pts) est redistribué au calendrier
// (10→15) : un calendrier dur pèse plus pour couler une équipe fragile qu'un calendrier facile ne
// pèse pour la sauver.
function computeFootballRelegationScore({
  standings, form, safetyPace, attackFactor, defenseFactor,
  remainingFixtures = [], injuryPenalty = { attackPenalty: 1, defensePenalty: 1 },
}) {
  if (!standings?.played || !safetyPace) return null;

  const pace = standings.points / standings.played;
  // Inversé vs Top N : plus l'équipe est LENTE par rapport à la ligne de sécurité, plus haut le score.
  const paceComponent = 40 * clamp01(pace > 0 ? safetyPace / pace : 1);

  const formPts = (form || []).reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
  const recentPace = form?.length ? formPts / form.length : pace;
  // Inversé : une forme qui EMPIRE (pire que la moyenne saison) est le signal recherché ici.
  const formComponent = 25 * clamp01(0.5 + (pace - recentPace) / 6);

  const adjAttack  = (attackFactor  ?? 1) * (injuryPenalty.attackPenalty  ?? 1);
  const adjDefense = (defenseFactor ?? 1) * (injuryPenalty.defensePenalty ?? 1);
  // Inversé : attaque faible + défense qui prend beaucoup de buts = bon signal de relégation.
  const attackDefenseComponent = 20 * clamp01(0.5 - (adjAttack - adjDefense) / 2);

  const avgOppPace = remainingFixtures.length
    ? remainingFixtures.reduce((s, f) => s + (f.oppPaceRelative ?? 0.5), 0) / remainingFixtures.length
    : 0.5;
  // Inversé et remonté à 15pts (remplace l'historique de titres) : calendrier difficile = mauvais
  // signe pour une équipe fragile, contrairement au Top N où un calendrier facile aide à y rester.
  const scheduleComponent = 15 * clamp01(avgOppPace * 0.5);

  const score = paceComponent + formComponent + attackDefenseComponent + scheduleComponent;

  return {
    score: +score.toFixed(1),
    components: {
      pace: +paceComponent.toFixed(1),
      form: +formComponent.toFixed(1),
      attackDefense: +attackDefenseComponent.toFixed(1),
      schedule: +scheduleComponent.toFixed(1),
    },
  };
}

// Plancher de plausibilité foot — "encore rattrapable" au sens simple : l'écart de points au
// leader ne dépasse pas 2x le nombre de matchs restants (une victoire vaut 3 points, un nul 1 —
// 2x est une marge généreuse pour ne pas exclure à tort un vrai outsider). v1 non calibrée.
function computeFootballPlausibility({ pointsGap, gamesRemaining }) {
  if (pointsGap == null || gamesRemaining == null) return false;
  if (pointsGap <= 0) return true; // déjà en tête ou à égalité
  return pointsGap <= gamesRemaining * 2;
}

// ── Basketball (NBA/WNBA) ──────────────────────────────────────────────────────

// `standings` : { wins, losses }. `leaderWinPct` : victoires% de l'équipe en tête de conférence/ligue.
// `netRating` : sortie de calcTeamNetRatingBg (server.js) — déjà EWA+ancrage saison+repos/densité.
// `injuryPenaltyPts` : même échelle que homeOutPenalty/awayOutPenalty de computeTeamWinProb
// (calcKeyPlayerOutPenalty), retirée directement du net rating avant normalisation.
// `remainingSchedule` : [{ oppWinPctRelative }] — force adverse (winPct/leaderWinPct) par match restant.
function computeBasketballOutrightScore({
  standings, leaderWinPct, netRating, injuryPenaltyPts = 0,
  remainingSchedule = [], trophyCount = 0,
}) {
  const played = (standings?.wins ?? 0) + (standings?.losses ?? 0);
  if (!played || !leaderWinPct) return null;

  const winPct = standings.wins / played;
  const winPctComponent = 40 * clamp01(winPct / leaderWinPct);

  const netAdjusted = (netRating ?? 0) - injuryPenaltyPts;
  // Net rating NBA/WNBA typique dans [-15,+15] — normalisation centrée, saturée au-delà de ±12.
  const netComponent = 30 * clamp01(0.5 + netAdjusted / 24);

  const avgOppWinPct = remainingSchedule.length
    ? remainingSchedule.reduce((s, g) => s + (g.oppWinPctRelative ?? 0.5), 0) / remainingSchedule.length
    : 0.5;
  const scheduleComponent = 20 * clamp01(1 - avgOppWinPct * 0.5);

  const trophyComponent = 10 * clamp01(trophyCount / 6);

  const score = winPctComponent + netComponent + scheduleComponent + trophyComponent;

  return {
    score: +score.toFixed(1),
    components: {
      winPct: +winPctComponent.toFixed(1),
      netRating: +netComponent.toFixed(1),
      schedule: +scheduleComponent.toFixed(1),
      trophy: +trophyComponent.toFixed(1),
    },
  };
}

// Plancher de plausibilité NBA/WNBA — équipe en position playoff/play-in, ou à ≤MAX_GAMES_BACK
// matchs de la ligne. Contrairement au foot (course aux points), une fois en playoffs n'importe
// quelle équipe a une chance non nulle (petit échantillon, aléa) — pas de règle mathématique
// stricte, juste "encore dans le coup pour la qualif". v1 non calibrée.
const OUTRIGHT_MAX_GAMES_BACK = 6;
function computeBasketballPlausibility({ gamesBack }) {
  if (gamesBack == null) return false;
  return gamesBack <= OUTRIGHT_MAX_GAMES_BACK;
}

export {
  computeFootballOutrightScore,
  computeFootballRelegationScore,
  computeFootballPlausibility,
  computeBasketballOutrightScore,
  computeBasketballPlausibility,
  OUTRIGHT_MAX_GAMES_BACK,
};
