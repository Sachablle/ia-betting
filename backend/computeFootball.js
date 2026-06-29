// PMF Poisson : P(X=k) = e^-λ · λ^k / k!
function poissonPmf(lambda, k) {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return Math.exp(-lambda) * Math.pow(lambda, k) / f;
}

// λ_home/λ_away via facteurs attaque/défense + avantage du terrain (home_adv).
// Retourne null si les échantillons sont trop faibles.
//
// `avgGF`/`avgGA` (optionnels) : normalisent séparément attaque (buts marqués) et défense
// (buts concédés). Nécessaire pour la CDM, où les stats viennent d'amicaux/qualifs joués
// majoritairement contre des adversaires plus faibles — buts marqués >> buts concédés en
// moyenne, donc un seul `leagueAvgGoals` pour les deux écrase systématiquement λ (biais "Under").
// Pour les championnats (ligue fermée, GF≈GA en moyenne), omettre avgGF/avgGA : les deux
// facteurs retombent sur `leagueAvgGoals`, comportement inchangé.
// Shrinkage petit échantillon : un facteur attaque/défense calculé sur 3-4 matchs est bruyant (un
// résultat extrême pèse trop lourd) — on le tire vers 1.0 ("équipe moyenne") proportionnellement à
// la confiance qu'on peut avoir dans l'échantillon. confidence = games/(games+K) : à K=5 matchs,
// confiance ~50% ; ça monte avec l'échantillon, jusqu'à faire confiance ~100% au facteur brut quand
// games >> K. Valeur K=5 choisie le 25 juin 2026, pas calibrée sur nos données (même limite que ρ
// Dixon-Coles) — sert surtout les petites sélections CDM en tout début de tournoi.
const SHRINK_K = 5;
function shrinkFactor(rawFactor, games, k = SHRINK_K) {
  const confidence = games / (games + k);
  return 1 + (rawFactor - 1) * confidence;
}

function computeLambdas({ homeGF, homeGA, homePlayed, awayGF, awayGA, awayPlayed, leagueAvgGoals, avgGF, avgGA, homeAdv = 1.10 }) {
  if (!homePlayed || !awayPlayed || !leagueAvgGoals) return null;
  if (homeGF == null || homeGA == null || awayGF == null || awayGA == null) return null;

  const attackBase  = avgGF || leagueAvgGoals;
  const defenseBase = avgGA || leagueAvgGoals;

  const homeAttack  = shrinkFactor((homeGF / homePlayed) / attackBase,  homePlayed);
  const homeDefense = shrinkFactor((homeGA / homePlayed) / defenseBase, homePlayed);
  const awayAttack  = shrinkFactor((awayGF / awayPlayed) / attackBase,  awayPlayed);
  const awayDefense = shrinkFactor((awayGA / awayPlayed) / defenseBase, awayPlayed);

  const lambdaHome = homeAttack * awayDefense * leagueAvgGoals * homeAdv;
  const lambdaAway = awayAttack * homeDefense * leagueAvgGoals / homeAdv;
  return { lambdaHome, lambdaAway };
}

// Correction Dixon-Coles (Dixon & Coles, 1997) : sous l'hypothèse Poisson indépendante, les scores
// bas (0-0, 1-0, 0-1, 1-1) ne suivent pas exactement le produit des deux lois — la dynamique réelle
// d'un match (gestion d'avance, prudence à 0-0) corrèle légèrement les buts dom./ext. ρ (rho) règle
// l'intensité de cette correction ; valeur ici = référence de la littérature (~0.10), PAS calibrée sur
// nos propres données (échantillon CDM/5 ligues trop petit pour une estimation MLE fiable). ρ=0
// retombe exactement sur l'indépendance pure — comportement strictement identique à avant ce fix.
const DIXON_COLES_RHO = 0.10;
function dixonColesTau(x, y, lambdaHome, lambdaAway, rho) {
  if (x === 0 && y === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (x === 0 && y === 1) return 1 + lambdaHome * rho;
  if (x === 1 && y === 0) return 1 + lambdaAway * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

// Grille jointe P(i buts dom., j buts ext.), corrigée Dixon-Coles puis renormalisée (la somme des
// τ-ajustements ne vaut pas exactement 1 dès que ρ≠0 — on redivise par le total pour rester sur des
// probabilités valides). BTTS/O-U/1X2 dérivent tous de cette même grille pour rester cohérents entre eux.
function computeScoreGrid(lambdaHome, lambdaAway, rho = DIXON_COLES_RHO, kMax = 10) {
  const grid = [];
  let total = 0;
  for (let i = 0; i <= kMax; i++) {
    const pi = poissonPmf(lambdaHome, i);
    const row = [];
    for (let j = 0; j <= kMax; j++) {
      const p = pi * poissonPmf(lambdaAway, j) * dixonColesTau(i, j, lambdaHome, lambdaAway, rho);
      row.push(p);
      total += p;
    }
    grid.push(row);
  }
  if (total > 0) {
    for (let i = 0; i <= kMax; i++) for (let j = 0; j <= kMax; j++) grid[i][j] /= total;
  }
  return grid;
}

// P(les deux équipes marquent) = somme des cases i≥1 ET j≥1 de la grille corrigée
function computeBTTSProb(lambdaHome, lambdaAway, rho = DIXON_COLES_RHO) {
  const grid = computeScoreGrid(lambdaHome, lambdaAway, rho);
  let p = 0;
  for (let i = 1; i < grid.length; i++) for (let j = 1; j < grid.length; j++) p += grid[i][j];
  return p;
}

// P(Over/Under "line" buts) — somme des cases i+j ≤ line sur la grille corrigée
function computeOUProb(lambdaHome, lambdaAway, line, rho = DIXON_COLES_RHO) {
  const kMax = 10;
  const grid = computeScoreGrid(lambdaHome, lambdaAway, rho, kMax);
  const threshold = Math.floor(line); // 1.5 → 1, 2.5 → 2
  let pUnder = 0;
  for (let i = 0; i <= kMax; i++) for (let j = 0; j <= kMax; j++) if (i + j <= threshold) pUnder += grid[i][j];
  const pOver = 1 - pUnder;
  return { pOver, pUnder, lambdaTotal: lambdaHome + lambdaAway };
}

// P(victoire dom. / nul / victoire ext.) — même grille Dixon-Coles que BTTS/O-U (cohérence interne)
function compute1X2Probs(lambdaHome, lambdaAway, kMax = 10, rho = DIXON_COLES_RHO) {
  const grid = computeScoreGrid(lambdaHome, lambdaAway, rho, kMax);
  let pHome = 0, pDraw = 0, pAway = 0;
  for (let i = 0; i <= kMax; i++) {
    for (let j = 0; j <= kMax; j++) {
      const p = grid[i][j];
      if (i > j) pHome += p;
      else if (i === j) pDraw += p;
      else pAway += p;
    }
  }
  return { pHome, pDraw, pAway };
}

// P(DC & BTTS "Oui") pour les 3 combinaisons Double Chance — même grille Dixon-Coles
// Retourne { p1x, px2, p12 } : proba que la DC ET les deux équipes marquent
function computeDCBTTSProbs(lambdaHome, lambdaAway, rho = DIXON_COLES_RHO) {
  const grid = computeScoreGrid(lambdaHome, lambdaAway, rho);
  let p1x = 0, px2 = 0, p12 = 0;
  for (let i = 1; i < grid.length; i++) {
    for (let j = 1; j < grid.length; j++) {
      const p = grid[i][j];
      if (i >= j) p1x += p; // home win or draw
      if (i <= j) px2 += p; // draw or away win
      if (i !== j) p12 += p; // no draw
    }
  }
  return { '1x': p1x, 'x2': px2, '12': p12 };
}

// P(DC & Over "line" buts) pour les 3 combinaisons Double Chance — même grille Dixon-Coles
// Retourne { '1x', 'x2', '12' } — clés alignées avec les marchés bookmaker
function computeDCOverProbs(lambdaHome, lambdaAway, line, rho = DIXON_COLES_RHO) {
  const kMax = 10;
  const grid = computeScoreGrid(lambdaHome, lambdaAway, rho, kMax);
  const threshold = Math.floor(line); // 1.5 → 1
  let p1x = 0, px2 = 0, p12 = 0;
  for (let i = 0; i <= kMax; i++) {
    for (let j = 0; j <= kMax; j++) {
      if (i + j <= threshold) continue;
      const p = grid[i][j];
      if (i >= j) p1x += p;
      if (i <= j) px2 += p;
      if (i !== j) p12 += p;
    }
  }
  return { '1x': p1x, 'x2': px2, '12': p12 };
}

export { poissonPmf, computeLambdas, computeBTTSProb, computeOUProb, compute1X2Probs, computeScoreGrid, dixonColesTau, DIXON_COLES_RHO, computeDCBTTSProbs, computeDCOverProbs };
