// ── Candidat V2 — Résultat équipe & Total points (basket, 11 septembre 2026, EXPÉRIMENTAL) ──────
// Même principe que computeFootballV2.js : fichier séparé, jamais importé par le calcul de
// production (V1, `computeTeamWinProb`/`computeGameTotalFull` dans server.js, inchangés). Tourne
// uniquement en observation (near_miss_basket_v2.json) — jamais utilisé pour émettre une vraie
// alerte. Suite à l'audit "Variables candidates" : le modèle V1 raisonne entièrement en points
// bruts (marge de score) — jamais en efficacité par possession (Pace/Offensive Rating/Defensive
// Rating/eFG%/TS% au sens analytics du terme). ESPN fournit déjà tout le nécessaire au niveau
// équipe (FGA/FGM/3PA/3PM/FTA/FTM/rebonds off.-déf./turnovers, vérifié en direct sur un vrai match)
// — jamais extrait jusqu'ici, contrairement aux mêmes stats déjà utilisées côté props JOUEUR.
//
// Formule des possessions estimées — référence Dean Oliver (Basketball on Paper, 2004), standard
// de l'analytics basket, pas une invention : Poss ≈ FGA - OREB + TOV + 0.44×FTA.

function estimatePossessions({ fga, oreb, tov, fta }) {
  if (fga == null || tov == null || fta == null) return null;
  return fga - (oreb ?? 0) + tov + 0.44 * fta;
}

function computeEfgPct({ fgm, fga, tpm }) {
  if (!fga) return null;
  return (fgm + 0.5 * (tpm ?? 0)) / fga;
}

function computeTsPct({ pts, fga, fta }) {
  const denom = 2 * ((fga ?? 0) + 0.44 * (fta ?? 0));
  if (!denom) return null;
  return pts / denom;
}

// Moyenne des box scores récents d'une équipe (déjà agrégés par server.js, un par match) → Pace/
// eFG%/TS%/Offensive Rating (pts marqués/100 poss)/Defensive Rating (pts encaissés/100 poss) moyens.
// `games` = tableau de { fga, fgm, tpm, tpa, fta, ftm, oreb, dreb, tov, ptsScored, ptsAllowed }.
function computeTeamAdvancedAverages(games) {
  const valid = (games || []).filter(g => g.fga != null);
  if (!valid.length) return null;
  let paceSum = 0, paceN = 0, efgSum = 0, efgN = 0, tsSum = 0, tsN = 0, offRtgSum = 0, defRtgSum = 0, rtgN = 0;
  for (const g of valid) {
    const poss = estimatePossessions(g);
    if (poss == null || poss <= 0) continue;
    paceSum += poss; paceN++;
    const efg = computeEfgPct(g);
    if (efg != null) { efgSum += efg; efgN++; }
    const ts = computeTsPct({ pts: g.ptsScored, fga: g.fga, fta: g.fta });
    if (ts != null) { tsSum += ts; tsN++; }
    offRtgSum += (g.ptsScored / poss) * 100;
    defRtgSum += (g.ptsAllowed / poss) * 100;
    rtgN++;
  }
  if (!paceN) return null;
  return {
    pace: paceSum / paceN,
    efgPct: efgN ? efgSum / efgN : null,
    tsPct: tsN ? tsSum / tsN : null,
    offRating: rtgN ? offRtgSum / rtgN : null,
    defRating: rtgN ? defRtgSum / rtgN : null,
    games: paceN,
  };
}

// Marge de points attendue V2 — remplace la marge brute EWA (V1, calcTeamNetRatingBg : simple
// différentiel points marqués/encaissés) par un Net Rating réellement par possession (offRating -
// defRating, pts pour/contre par 100 possessions), reconverti en points pour CE match via le pace
// moyen des deux équipes. Mêmes ajustements que V1 en aval (avantage terrain, amortissement
// playoffs, écart-type) — seule la source de la marge change, tout le reste de la mécanique
// (calcMarginStdBg, tCDF4) est réutilisé tel quel côté appelant (server.js) pour rester comparable.
function computeV2ExpectedMargin({ homeOffRating, homeDefRating, awayOffRating, awayDefRating, avgPace, homeCourtPts, playoffDamp }) {
  if (homeOffRating == null || homeDefRating == null || awayOffRating == null || awayDefRating == null || !avgPace) return null;
  const homeNetRating = homeOffRating - homeDefRating;
  const awayNetRating = awayOffRating - awayDefRating;
  return ((homeNetRating - awayNetRating) * avgPace / 100 + homeCourtPts) * playoffDamp;
}

// Total attendu V2 (12 septembre 2026, même famille que la marge ci-dessus) — remplace le proxy V1
// (moyenne EWA de points marqués/encaissés bruts, `computeGameTotalFull`) par la somme des points
// attendus de chaque équipe selon son propre Offensive Rating face au Defensive Rating adverse,
// reconvertie via le pace réel moyen des deux équipes. Chaque équipe "attendue" = moyenne de son
// propre off rating et du def rating adverse (symétrique par construction), scores additionnés.
function computeV2ExpectedTotal({ homeOffRating, homeDefRating, awayOffRating, awayDefRating, avgPace, playoffDamp }) {
  if (homeOffRating == null || homeDefRating == null || awayOffRating == null || awayDefRating == null || !avgPace) return null;
  const homeExpected = ((homeOffRating + awayDefRating) / 2) * avgPace / 100;
  const awayExpected = ((awayOffRating + homeDefRating) / 2) * avgPace / 100;
  return (homeExpected + awayExpected) * playoffDamp;
}

export {
  estimatePossessions, computeEfgPct, computeTsPct, computeTeamAdvancedAverages,
  computeV2ExpectedMargin, computeV2ExpectedTotal,
};
