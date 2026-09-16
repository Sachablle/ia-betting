// ── Candidat V2 — Props 3 points (12 septembre 2026, EXPÉRIMENTAL) ──────────────────────────────
// Fichier séparé de compute.js à dessein : rien ici n'est jamais importé par le calcul de production
// (V1, inchangé). Tourne uniquement en observation — jamais utilisé pour émettre une vraie alerte.
//
// Gap identifié par l'audit "Variables candidates" (11 septembre 2026) : V1 (`baseTpm`, compute.js)
// projette les 3pts réussis directement depuis l'historique de PANIERS MARQUÉS (EWA), sans jamais
// séparer volume de tentatives et taux de réussite — deux signaux différents (une joueuse qui tire
// moins souvent mais mieux n'est pas dans la même dynamique qu'une joueuse qui tire plus souvent avec
// un % en baisse). Les tentatives (3PA) étaient déjà présentes dans les mêmes réponses ESPN/
// api-sports.io que les paniers marqués (même famille de bug que `usage rate`, corrigé séparément le
// même jour) — jamais extraites jusqu'ici. Étendu à `bgFetchGamelog`/`bgFetchWNBAGamelog`/
// `bballPlayerGamelog` (server.js) : chaque entrée porte désormais `tpa` en plus de `tpm`, champ
// additif sans aucun effet sur le calcul réel.

function calcSimpleEWA(values, halfLife = 10) {
  const valid = values.filter(v => v != null);
  if (!valid.length) return null;
  const decay = Math.pow(0.5, 1 / halfLife);
  let num = 0, den = 0, w = 1;
  for (const v of valid) { num += w * v; den += w; w *= decay; }
  return den > 0 ? num / den : null;
}

// `games` = gamelog trié plus récent d'abord, chaque entrée portant `tpm`/`tpa`/`min` (même forme que
// compute.js). `seasonTpm`/`seasonTpa` optionnels (moyenne saison réelle, NBA/WNBA — indisponible côté
// EU où le calcul retombe sur le seul historique récent, dégradation propre plutôt qu'un crash).
// Retourne une moyenne de 3pts attendus alternative à `baseTpm` (V1), à passer telle quelle dans
// `probAtLeast(v2Mean, std, line, 'tpm', ...)` — même std/conversion probabiliste que V1, seule
// l'estimation centrale change (même principe que les V2 foot/basket équipe déjà en place).
const V2_TPM_RECENT_WEIGHT_PCT = 0.6;   // poids du % récent vs % saison dans le taux de réussite retenu
const V2_TPM_RECENT_WEIGHT_VOL = 0.5;   // poids du volume récent vs volume saison dans les tentatives retenues

function computeV2ThreePointerMean(games, seasonTpm = null, seasonTpa = null) {
  const valid = (games || []).filter(g => g.tpa != null && (g.min ?? 0) > 10);
  if (valid.length < 4) return null;
  const recentTpa = calcSimpleEWA(valid.map(g => g.tpa), 10);
  const recentTpm = calcSimpleEWA(valid.map(g => g.tpm), 10);
  if (recentTpa == null || recentTpm == null || recentTpa <= 0) return null;
  const recentPct = recentTpm / recentTpa;
  const hasSeason = seasonTpa != null && seasonTpa > 0 && seasonTpm != null;
  const seasonPct = hasSeason ? seasonTpm / seasonTpa : recentPct;
  const blendedPct = V2_TPM_RECENT_WEIGHT_PCT * recentPct + (1 - V2_TPM_RECENT_WEIGHT_PCT) * seasonPct;
  const blendedAtt = hasSeason
    ? V2_TPM_RECENT_WEIGHT_VOL * recentTpa + (1 - V2_TPM_RECENT_WEIGHT_VOL) * seasonTpa
    : recentTpa;
  return blendedAtt * blendedPct;
}

// ── Candidat V2 — Props Rebonds (12 septembre 2026, EXPÉRIMENTAL) ───────────────────────────────
// Gap identifié par l'audit "Variables candidates" : V1 (`baseReb`, compute.js) projette les rebonds
// via une EWA sur le total brut de rebonds/match, jamais normalisée par le temps de jeu — une baisse
// de minutes récente fait mécaniquement chuter la projection même si le RYTHME de rebonds par minute
// de la joueuse n'a pas changé (confond volume de jeu et tendance au rebond). Corrigé en séparant les
// deux signaux : rythme par 36 minutes (stable, propre à la joueuse) × minutes projetées (volume,
// propre au contexte du match) — même logique volume × taux que le candidat 3pts ci-dessus, appliquée
// aux minutes plutôt qu'aux tentatives. `seasonReb`/`seasonMin` = moyennes saison réelles
// (`player.stats.reb`/`.min`, déjà existantes) ; sans elles (EU sans season stats séparées),
// dégradation propre sur le seul historique récent.
const V2_REB_RECENT_WEIGHT = 0.6;

function computeV2ReboundMean(games, seasonReb = null, seasonMin = null) {
  const valid = (games || []).filter(g => g.reb != null && (g.min ?? 0) > 10);
  if (valid.length < 4) return null;
  const perGameRate36 = valid.map(g => (g.reb / g.min) * 36);
  const recentRate36 = calcSimpleEWA(perGameRate36, 10);
  const recentMin = calcSimpleEWA(valid.map(g => g.min), 10);
  if (recentRate36 == null || recentMin == null) return null;
  const hasSeason = seasonReb != null && seasonMin != null && seasonMin > 0;
  const seasonRate36 = hasSeason ? (seasonReb / seasonMin) * 36 : recentRate36;
  const blendedRate36 = V2_REB_RECENT_WEIGHT * recentRate36 + (1 - V2_REB_RECENT_WEIGHT) * seasonRate36;
  return (blendedRate36 * recentMin) / 36;
}

// ── Candidat V2 — Props Passes décisives (12 septembre 2026, EXPÉRIMENTAL) ──────────────────────
// Gap identifié par l'audit : la redistribution d'absence (`computeRedist`, server.js) pondère TOUTES
// les stats (pts/reb/ast/tpm) de la même façon — par minutes + poste de la joueuse absente, sans
// distinguer si l'absente était une passeuse clé ou non. Une attaquante qui sort du groupe ne libère
// pas les mêmes opportunités de passe qu'une meneuse qui sort. V2 : un facteur de redistribution
// DÉDIÉ aux passes, qui pondère chaque joueuse active par ses PROPRES passes/match (jouées) × ses
// minutes — au lieu du minutes+poste générique de V1 — donc une joueuse qui distribue déjà beaucoup
// absorbe une plus grosse part des passes qui se libèrent, indépendamment de son poste.
// `outPlayers`/`activePlayers` = mêmes listes que celles passées à computeRedist() côté V1 (même
// point d'entrée, juste une pondération différente) ; `playerId` = joueuse évaluée.
const V2_AST_REDIST_CAP = 1.30; // même ordre de grandeur que REDIST_CAP (server.js), non calibré

function computeV2AstRedistFactor(outPlayers, activePlayers, playerId) {
  const totalOutAst = (outPlayers || []).reduce((s, p) => s + (p.stats?.ast ?? 0), 0);
  if (!totalOutAst || !activePlayers?.length) return 1;
  const weighted = activePlayers.map(p => ({ id: String(p.id), weight: (p.stats?.ast ?? 0.3) * (p.stats?.min ?? 1) }));
  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
  if (!totalWeight) return 1;
  const target = weighted.find(w => w.id === String(playerId));
  if (!target) return 1;
  const ownAst = activePlayers.find(p => String(p.id) === String(playerId))?.stats?.ast ?? 1;
  const extraAst = (target.weight / totalWeight) * totalOutAst;
  return Math.min(V2_AST_REDIST_CAP, 1 + extraAst / Math.max(ownAst, 0.5));
}

export {
  computeV2ThreePointerMean, computeV2ReboundMean, computeV2AstRedistFactor,
};
