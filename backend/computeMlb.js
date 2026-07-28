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

// Binomiale négative — comparaison en parallèle avec Poisson (28 juillet 2026, mode fantôme MLB).
// 4 points de calibration (25→28 juillet, cf. mémoire projet) montrent Poisson trop confiant en
// haut d'échelle (proba affichée 90-100% → réussite réelle ~62%) : signature classique d'une
// surdispersion réelle des runs (bullpen qui craque, grosse manche) que Poisson ne peut pas
// représenter (Poisson impose variance = moyenne, par construction). La binomiale négative garde
// la même moyenne (λtotal) mais autorise une variance plus grande via un paramètre de dispersion r.
//
// Paramétrage choisi : variance = MLB_NB_VARIANCE_RATIO × moyenne (Poisson = ratio de 1). Le ratio
// est un repère de départ, PAS calibré sur nos propres données — même statut que MLB_HOME_ADV
// ci-dessus et DIXON_COLES_RHO côté foot. r dérive de λtotal (r = λtotal / (ratio-1)) plutôt que
// d'être une constante fixe : la dispersion doit croître avec la moyenne, pas rester indépendante.
const MLB_NB_VARIANCE_RATIO = 1.5;

// ln(Γ(x)) — approximation de Lanczos (nécessaire pour un r non-entier, la binomiale négative
// "vraie" utilise Γ plutôt que la factorielle de la définition à base de tirages entiers).
function logGamma(x) {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function nbPmf(k, r, p) {
  const logPmf = logGamma(k + r) - logGamma(r) - logGamma(k + 1) + r * Math.log(p) + k * Math.log(1 - p);
  return Math.exp(logPmf);
}

function computeMlbTotalProbNB(lambdaHome, lambdaAway, line, varianceRatio = MLB_NB_VARIANCE_RATIO) {
  const lambdaTotal = lambdaHome + lambdaAway;
  const r = lambdaTotal / (varianceRatio - 1);
  const p = r / (r + lambdaTotal);
  const floorLine = Math.floor(line);
  let pUnderOrEqual = 0;
  for (let k = 0; k <= floorLine; k++) pUnderOrEqual += nbPmf(k, r, p);
  return { pOver: 1 - pUnderOrEqual, pUnder: pUnderOrEqual, lambdaTotal };
}

export { poissonPmf, shrinkFactor, MLB_HOME_ADV, computeMlbLambdas, computeMlbTotalProb, computeMlbTotalProbNB, MLB_NB_VARIANCE_RATIO };
