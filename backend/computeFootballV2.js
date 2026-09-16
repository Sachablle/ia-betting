// ── Candidat V2 — Résultat 1X2 (11 septembre 2026, EXPÉRIMENTAL) ──────────────────────────────
// Fichier séparé de computeFootball.js à dessein : rien ici n'est jamais importé par le calcul de
// production (V1, inchangé). Tourne uniquement en observation (near_miss_football_v2.json dans
// server.js) — jamais utilisé pour émettre une vraie alerte. Suite à l'audit "Variables candidates"
// (artifact publié le 11 septembre 2026) : ajoute tirs cadrés + possession (venue-spécifique),
// domicile/extérieur séparé, classement + forme récente, et un nudge H2H final — le tout ensemble
// en un seul passage (décision explicite de l'utilisateur : le risque est nul de toute façon
// puisqu'aucune alerte réelle n'en dépend, pas besoin d'isoler variable par variable avant de voir
// si le paquet dans son ensemble vaut le coup ; un test en leave-one-out pourra suivre plus tard
// SI le paquet montre un vrai gain, pour identifier laquelle des 4 pièces porte l'effet).
//
// Tous les poids ci-dessous sont des points de départ raisonnés, JAMAIS calibrés sur nos propres
// données (même statut que DIXON_COLES_RHO=0.10 ou SHRINK_K=5 dans computeFootball.js) — seule
// l'observation sur plusieurs semaines dira si le dosage est bon. Plafonnés volontairement bas pour
// qu'aucun ajustement secondaire ne prenne le pas sur le signal primaire (buts/xG, calcul V1
// entièrement inchangé en amont).

const V2_PRESSURE_WEIGHT = 0.15;  // tirs cadrés + possession vs moyenne ligue — poids max de l'ajustement attaque
const V2_RANK_WEIGHT = 0.005;     // par point d'écart de classement
const V2_RANK_CAP = 0.08;
const V2_FORM_WEIGHT = 0.05;      // par écart au-dessus/en dessous de 2.5 victoires sur les 5 derniers
const V2_FORM_CAP = 0.06;
const V2_H2H_WEIGHT = 0.15;       // nudge final sur pHome/pAway, pas sur les lambdas
const V2_H2H_MIN_MATCHES = 3;
// Moyenne grossière tirs cadrés/match, toutes ligues confondues — pas une vraie moyenne par ligue
// calculée (nécessiterait encore plus d'appels API), juste un point de repère neutre pour juger si
// une équipe est au-dessus ou en dessous. À affiner si le test montre un signal qui vaut la peine.
const FB_LEAGUE_AVG_SHOTS_ON_TARGET = 4.3;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function formWinRatio(form) {
  if (!form || !form.length) return null;
  const wins = form.filter(c => c === 'W').length;
  return wins / form.length;
}

// Ajustement multiplicatif attaque — combine pression (tirs cadrés + possession, venue-spécifique),
// écart de classement et forme récente. Conçu pour être passé directement dans les paramètres
// `*AttackPenalty` déjà existants de computeLambdas() (computeFootball.js) — même mécanisme que les
// pénalités blessure, réutilisé tel quel pour un usage différent, aucun changement de signature.
function computeAttackAdjustment({ shotsOnTargetPerGame, possession, rank, oppRank, form }) {
  let adj = 1;
  if (shotsOnTargetPerGame != null) {
    const shotsFactor = shotsOnTargetPerGame / FB_LEAGUE_AVG_SHOTS_ON_TARGET;
    const possFactor = possession != null ? possession / 50 : 1;
    const pressureIndex = (shotsFactor + possFactor) / 2;
    adj *= 1 + V2_PRESSURE_WEIGHT * (pressureIndex - 1);
  }
  if (rank != null && oppRank != null) {
    adj *= 1 + clamp((oppRank - rank) * V2_RANK_WEIGHT, -V2_RANK_CAP, V2_RANK_CAP);
  }
  const wr = formWinRatio(form);
  if (wr != null) {
    adj *= 1 + clamp((wr - 0.5) * 2 * V2_FORM_WEIGHT, -V2_FORM_CAP, V2_FORM_CAP);
  }
  return adj;
}

// Renvoie les 4 multiplicateurs attaque/défense à passer à computeLambdas() en plus des pénalités
// blessure déjà existantes (les deux se multiplient naturellement, aucun conflit). Pas d'ajustement
// défense séparé pour cette 1ère passe (cf. audit — nécessiterait tirs/possession CONCÉDÉS, pas
// encore instrumenté) : seule l'attaque est ajustée ici, volontairement simplifié.
function computeV2AttackPenalties({ home, away }) {
  const homeAdj = computeAttackAdjustment({ ...home, oppRank: away?.rank });
  const awayAdj = computeAttackAdjustment({ ...away, oppRank: home?.rank });
  return { homeAttackPenalty: homeAdj, awayAttackPenalty: awayAdj };
}

// Nudge H2H final, appliqué sur les probabilités 1X2 déjà calculées (pas sur les lambdas) — un
// historique de confrontations directes est un signal de "style de match"/psychologie difficile à
// faire remonter proprement dans un modèle Poisson par équipe, plus simple à traiter en correction
// finale. `h2hMatches` = confrontations réelles (fetchFootballH2H, server.js), `homeTeamId` = id
// api-football de l'équipe qui reçoit AUJOURD'HUI. Inactif sous V2_H2H_MIN_MATCHES confrontations
// connues (signal trop bruyant sur un échantillon minuscule).
function applyH2HNudge(pHome, pDraw, pAway, h2hMatches, homeTeamId) {
  if (!h2hMatches || h2hMatches.length < V2_H2H_MIN_MATCHES) return { pHome, pDraw, pAway, h2hApplied: false };
  let winsHome = 0, winsAway = 0;
  for (const m of h2hMatches) {
    if (m.scoreHome === m.scoreAway) continue;
    const homeTeamWon = (m.homeId === homeTeamId && m.scoreHome > m.scoreAway) || (m.awayId === homeTeamId && m.scoreAway > m.scoreHome);
    if (homeTeamWon) winsHome++; else winsAway++;
  }
  const decisive = winsHome + winsAway;
  if (decisive === 0) return { pHome, pDraw, pAway, h2hApplied: false }; // que des nuls, aucun signal directionnel
  const homeWinRatio = winsHome / decisive;
  const nudge = (homeWinRatio - 0.5) * V2_H2H_WEIGHT;
  const newHome = clamp(pHome + nudge, 0.02, 0.96);
  const newAway = clamp(pAway - nudge * 0.7, 0.02, 0.96);
  const newDraw = Math.max(0.02, 1 - newHome - newAway);
  const total = newHome + newDraw + newAway;
  return { pHome: newHome / total, pDraw: newDraw / total, pAway: newAway / total, h2hApplied: true };
}

// ── Extension BTTS / Total O-U / Buts par équipe (11 septembre 2026, même session) ─────────────
// Ces 3 marchés dérivent de la MÊME grille Dixon-Coles que le Résultat 1X2 (computeBTTSProb/
// computeOUProb/computeTeamGoalsProb, computeFootball.js) — ils bénéficient donc AUTOMATIQUEMENT
// des splits domicile/extérieur + tirs cadrés/possession + classement/forme dès qu'on leur passe
// les lambdas V2 déjà calculés pour le Résultat (aucun travail supplémentaire sur ce plan-là). Seul
// ajout propre à chaque marché : un nudge H2H spécifique (BTTS/Total ont besoin d'un signal
// différent du sens 1X2 — "est-ce que CE genre de confrontation produit des buts", pas "qui gagne").
const V2_H2H_BTTS_WEIGHT = 0.12;
const V2_H2H_TOTAL_WEIGHT = 0.12;

function applyH2HNudgeBTTS(bttsProb, h2hMatches) {
  if (!h2hMatches || h2hMatches.length < V2_H2H_MIN_MATCHES) return { prob: bttsProb, h2hApplied: false };
  const bttsCount = h2hMatches.filter(m => m.scoreHome > 0 && m.scoreAway > 0).length;
  const bttsRate = bttsCount / h2hMatches.length;
  const nudge = (bttsRate - 0.5) * V2_H2H_BTTS_WEIGHT;
  return { prob: clamp(bttsProb + nudge, 0.02, 0.97), h2hApplied: true };
}

// `line` : 1.5 ou 2.5. pOver = probabilité Over calculée par le modèle (déjà sur les lambdas V2).
function applyH2HNudgeTotal(pOver, h2hMatches, line) {
  if (!h2hMatches || h2hMatches.length < V2_H2H_MIN_MATCHES) return { pOver, h2hApplied: false };
  const overCount = h2hMatches.filter(m => (m.scoreHome + m.scoreAway) > line).length;
  const overRate = overCount / h2hMatches.length;
  const nudge = (overRate - 0.5) * V2_H2H_TOTAL_WEIGHT;
  return { pOver: clamp(pOver + nudge, 0.02, 0.97), h2hApplied: true };
}

// ── Extension Buts par équipe (11 septembre 2026, même session, ajouté après coup) ──────────────
// Même famille que BTTS/Total ci-dessus : dérive des lambdas V2 déjà calculés pour le Résultat
// (splits dom/ext + tirs/possession + classement/forme automatiquement inclus), seul le nudge H2H
// change de nature — ici "cette équipe précise a-t-elle l'habitude de marquer plus/moins que la
// ligne dans SES confrontations avec cet adversaire", pas juste le total combiné des 2 équipes.
const V2_H2H_TEAMGOALS_WEIGHT = 0.12;

// `teamId` = id api-football de l'équipe évaluée (home ou away du match du jour). `h2hMatches`
// couvre par construction uniquement des matchs entre les 2 équipes du jour (fetchFootballH2H),
// donc chaque ligne concerne forcément teamId d'un côté ou l'autre — jamais besoin de filtrer.
function applyH2HNudgeTeamGoals(pOver, h2hMatches, teamId, line) {
  if (!h2hMatches || h2hMatches.length < V2_H2H_MIN_MATCHES) return { pOver, h2hApplied: false };
  const scores = h2hMatches
    .map(m => (m.homeId === teamId ? m.scoreHome : m.awayId === teamId ? m.scoreAway : null))
    .filter(s => s != null);
  if (scores.length < V2_H2H_MIN_MATCHES) return { pOver, h2hApplied: false };
  const overCount = scores.filter(s => s > line).length;
  const overRate = overCount / scores.length;
  const nudge = (overRate - 0.5) * V2_H2H_TEAMGOALS_WEIGHT;
  return { pOver: clamp(pOver + nudge, 0.02, 0.97), h2hApplied: true };
}

export {
  computeV2AttackPenalties, applyH2HNudge, applyH2HNudgeBTTS, applyH2HNudgeTotal, applyH2HNudgeTeamGoals,
  FB_LEAGUE_AVG_SHOTS_ON_TARGET,
};
