// Modèle Poisson pour le total de runs MLB (24 juillet 2026, étape 3 du chantier MLB en mode
// fantôme — cf. server.js section MLB). Même principe que computeFootball.js (buts → runs), mais
// plus simple : un seul marché visé (Over/Under total runs), donc pas besoin de la grille jointe
// Dixon-Coles (utile pour BTTS/1X2, pas ici) — la somme de deux lois de Poisson indépendantes est
// elle-même une loi de Poisson (λtotal = λhome + λaway), donc P(Over/Under) se calcule directement
// dessus, sans construire de grille i×j.

function poissonPmf(lambda, k) {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return Math.exp(-lambda) * Math.pow(lambda, k) / f;
}

// Même shrinkage petit échantillon que le foot (cf. computeFootball.js, SHRINK_K) — dupliqué plutôt
// qu'importé pour garder les modèles par sport indépendants (un changement de calibration foot ne
// doit jamais affecter silencieusement le MLB, et vice-versa).
const SHRINK_K = 5;
function shrinkFactor(rawFactor, games, k = SHRINK_K) {
  const confidence = games / (games + k);
  return 1 + (rawFactor - 1) * confidence;
}

// Avantage du terrain nettement plus faible qu'au foot (1.10) — en MLB il tient surtout à des
// facteurs indirects (voyage, fatigue, familiarité du stade), pas un biais structurel marqué comme
// en sport co-viewing avec foule proche du terrain. Valeur ici = repère indicatif de littérature
// sabermétrique (facteur domicile MLB généralement cité entre +2% et +4% de runs), PAS calibrée sur
// nos propres données — on n'a aucun historique interne, c'est justement l'objet du mode fantôme.
const MLB_HOME_ADV = 1.03;

// λ_home/λ_away via facteurs attaque/défense (runs marqués/encaissés récents) normalisés par la
// moyenne de runs de la ligue courante — à calculer dynamiquement côté appelant sur le pool
// d'équipes qui jouent aujourd'hui (même principe que la CDM dans computeFootball.js), pas une
// constante figée : la MLB a des cycles saisonniers (météo, forme des lanceurs) qui font dériver la
// moyenne de la ligue au fil de la saison.
function computeMlbLambdas({ homeRunsFor, homeRunsAgainst, homeGames, awayRunsFor, awayRunsAgainst, awayGames, leagueAvgRuns, homeAdv = MLB_HOME_ADV }) {
  if (!homeGames || !awayGames || !leagueAvgRuns) return null;
  if (homeRunsFor == null || homeRunsAgainst == null || awayRunsFor == null || awayRunsAgainst == null) return null;

  const homeAttack  = shrinkFactor((homeRunsFor / homeGames) / leagueAvgRuns, homeGames);
  const homeDefense = shrinkFactor((homeRunsAgainst / homeGames) / leagueAvgRuns, homeGames);
  const awayAttack  = shrinkFactor((awayRunsFor / awayGames) / leagueAvgRuns, awayGames);
  const awayDefense = shrinkFactor((awayRunsAgainst / awayGames) / leagueAvgRuns, awayGames);

  const lambdaHome = homeAttack * awayDefense * leagueAvgRuns * homeAdv;
  const lambdaAway = awayAttack * homeDefense * leagueAvgRuns / homeAdv;
  return { lambdaHome, lambdaAway };
}

// P(Over/Under "line" runs) — la ligne MLB est toujours à .5 (jamais de push), donc pUnder = 1 - pOver
// à la précision Poisson près (pas de masse de probabilité perdue sur une valeur entière exacte).
function computeMlbTotalProb(lambdaHome, lambdaAway, line) {
  const lambdaTotal = lambdaHome + lambdaAway;
  const floorLine = Math.floor(line);
  let pUnderOrEqual = 0;
  for (let k = 0; k <= floorLine; k++) pUnderOrEqual += poissonPmf(lambdaTotal, k);
  return { pOver: 1 - pUnderOrEqual, pUnder: pUnderOrEqual, lambdaTotal };
}

export { poissonPmf, shrinkFactor, MLB_HOME_ADV, computeMlbLambdas, computeMlbTotalProb };
