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
function computeLambdas({ homeGF, homeGA, homePlayed, awayGF, awayGA, awayPlayed, leagueAvgGoals, avgGF, avgGA, homeAdv = 1.10 }) {
  if (!homePlayed || !awayPlayed || !leagueAvgGoals) return null;
  if (homeGF == null || homeGA == null || awayGF == null || awayGA == null) return null;

  const attackBase  = avgGF || leagueAvgGoals;
  const defenseBase = avgGA || leagueAvgGoals;

  const homeAttack  = (homeGF / homePlayed) / attackBase;
  const homeDefense = (homeGA / homePlayed) / defenseBase;
  const awayAttack  = (awayGF / awayPlayed) / attackBase;
  const awayDefense = (awayGA / awayPlayed) / defenseBase;

  const lambdaHome = homeAttack * awayDefense * leagueAvgGoals * homeAdv;
  const lambdaAway = awayAttack * homeDefense * leagueAvgGoals / homeAdv;
  return { lambdaHome, lambdaAway };
}

// P(les deux équipes marquent) = (1 - P(home=0)) * (1 - P(away=0))
function computeBTTSProb(lambdaHome, lambdaAway) {
  const pHome0 = poissonPmf(lambdaHome, 0);
  const pAway0 = poissonPmf(lambdaAway, 0);
  return (1 - pHome0) * (1 - pAway0);
}

// P(Over/Under "line" buts) — total ~ Poisson(λhome + λaway)
function computeOUProb(lambdaHome, lambdaAway, line) {
  const lambdaTotal = lambdaHome + lambdaAway;
  const kMax = Math.floor(line); // 1.5 → 1, 2.5 → 2
  let pUnder = 0;
  for (let k = 0; k <= kMax; k++) pUnder += poissonPmf(lambdaTotal, k);
  const pOver = 1 - pUnder;
  return { pOver, pUnder, lambdaTotal };
}

// P(victoire dom. / nul / victoire ext.) — grille Poisson indépendante (home/away buts non corrélés)
function compute1X2Probs(lambdaHome, lambdaAway, kMax = 10) {
  let pHome = 0, pDraw = 0, pAway = 0;
  for (let i = 0; i <= kMax; i++) {
    const pi = poissonPmf(lambdaHome, i);
    for (let j = 0; j <= kMax; j++) {
      const p = pi * poissonPmf(lambdaAway, j);
      if (i > j) pHome += p;
      else if (i === j) pDraw += p;
      else pAway += p;
    }
  }
  return { pHome, pDraw, pAway };
}

export { poissonPmf, computeLambdas, computeBTTSProb, computeOUProb, compute1X2Probs };
