'use strict';

const LEAGUE_AVG_PTS_ALLOWED  = 114.5;
const LEAGUE_AVG_GAME_TOTAL   = 229.0;
const PLAYOFF_AVG_PTS_ALLOWED = 113.0;
const PLAYOFF_AVG_GAME_TOTAL  = 225.0;
const LEAGUE_AVG_BY_POS       = { G: 22.8, F: 18.5, C: 14.8 };

function calcAvg(games, key, n) {
  const slice = games.slice(0, n).map(g => g[key]).filter(v => v != null && !isNaN(v));
  return slice.length ? slice.reduce((s, v) => s + v, 0) / slice.length : null;
}

function calcEWA(games, key, n, decay = 0.82) {
  const slice = games.slice(0, n).map(g => g[key]).filter(v => v != null && !isNaN(v));
  if (!slice.length) return null;
  let wSum = 0, total = 0;
  for (let i = 0; i < slice.length; i++) {
    const w = Math.pow(decay, i);
    total += slice[i] * w;
    wSum  += w;
  }
  return total / wSum;
}

// CDF exacte de la loi de Student df=4
// Formule dérivée : F(t) = 0.5 + t*(6+t²) / (2*(4+t²)^1.5)
// Vérifiée sur quantiles connus (t=2.132 → 94.99%, t=1.0 → 81.3%)
function tCDF4(t) {
  const t2 = t * t;
  const p  = (t * (6 + t2)) / (2 * Math.pow(4 + t2, 1.5));
  return 0.5 + Math.max(-0.4999, Math.min(0.4999, p));
}

// Écart-type empirique — sample std (n-1) + plancher par stat
function calcStd(games, key) {
  const vals = (games || [])
    .filter(g => g.min > 10 && g[key] != null && !(key === 'pts' && g.pts === 0 && g.min >= 12))
    .map(g => g[key]);
  if (vals.length < 3) return null;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  // Bessel correction (n-1) pour meilleure estimation sur petits échantillons
  return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1));
}

// Détecte si une joueuse est "spécialiste" d'une stat (régulière match après match) plutôt
// que de se fier uniquement au % de probabilité calculé. Coefficient de variation (std/moyenne)
// sur ses derniers vrais matchs réels, comparé à un seuil par stat calibré le 22 juin 2026 sur
// la distribution réelle de ~1750 combos joueur×stat (toutes ligues actives, ACB/LNB/BBL/LegaA
// + NBA/WNBA) — seuil = 25e percentile (le quart le plus régulier) de chaque stat. Les stats sont
// naturellement plus ou moins volatiles entre elles (points très stables, passes/3pts beaucoup
// plus, même chez les joueuses les plus régulières) — d'où un seuil différent par stat, mais
// identique entre groupes de ligues (la distribution s'est révélée quasi identique NBA/WNBA vs EU,
// contrairement aux anciens seuils de probabilité absolue).
const CONSISTENCY_CV_CUTOFF = { pts: 0.42, reb: 0.46, ast: 0.58, tpm: 0.76 };
const CONSISTENCY_MIN_SAMPLE = 10;
function isConsistentStat(games, key) {
  const vals = (games || [])
    .filter(g => g.min > 10 && g[key] != null && !(key === 'pts' && g.pts === 0 && g.min >= 12))
    .map(g => g[key]);
  if (vals.length < CONSISTENCY_MIN_SAMPLE) return false;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  if (mean <= 0 || (key === 'tpm' && mean < 0.5)) return false;
  const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1));
  return (std / mean) <= CONSISTENCY_CV_CUTOFF[key];
}

// Moyenne "effective" pour le garde-fou marge saison↔ligne (SEASON_MARGIN) : mélange la moyenne
// saison figée avec la forme récente (n derniers matchs), pondérée par la confiance dans
// l'échantillon récent (mêmes principes que shrinkFactor du modèle foot — confidence = n/(n+k)).
// But : un joueur en série chaude/froide sur ses derniers matchs ne doit pas rester bloqué par
// une moyenne saison qui ne reflète plus son niveau actuel (cf. cas McBride, 15 juil. 2026 —
// 17.0 pts moyenne saison vs 26.2 sur les 5 derniers matchs, alerte points bloquée à tort).
function blendedSeasonAvg(games, key, seasonAvg, n = 10, k = 5) {
  if (seasonAvg == null) return seasonAvg;
  const vals = (games || [])
    .filter(g => g.min > 10 && g[key] != null && !(key === 'pts' && g.pts === 0 && g.min >= 12))
    .slice(0, n)
    .map(g => g[key]);
  if (!vals.length) return seasonAvg;
  const recentAvg = vals.reduce((s, v) => s + v, 0) / vals.length;
  const confidence = vals.length / (vals.length + k);
  return seasonAvg * (1 - confidence) + recentAvg * confidence;
}

// Plafonne les n matchs les plus récents (poids EWA les plus forts, decay=0.82 → ~52-60%
// du poids total sur les 3 derniers) à [moyenne saison ± cap×écart-type].
// Un seul match exceptionnel (ex: 8 rebonds pour une joueuse à 3.27 de moyenne, std=2.28)
// ne doit pas dicter toute la projection EWA — cf. cas Pauline Astier (14/06/2026, reb).
function winsorizeRecent(games, key, seasonAvg, std, n = 3, cap = 1.5) {
  if (!std || seasonAvg == null) return games;
  const lo = Math.max(0, seasonAvg - cap * std);
  const hi = seasonAvg + cap * std;
  return (games || []).map((g, i) => {
    if (i >= n || g[key] == null) return g;
    if (g[key] > hi) return { ...g, [key]: hi };
    if (g[key] < lo) return { ...g, [key]: lo };
    return g;
  });
}

// P(joueur ≥ threshold) — loi de Student df=4 + shrinkage vers la ligne + std calibré ×1.5
// stat: 'pts' | 'reb' | 'ast' | null
// deviation: |adjMult - 1| — mesure à quel point la projection s'écarte de la moyenne saison
//            (empilement de facteurs). Plus l'écart est grand, plus on élargit le std :
//            une projection "extrême" repose sur l'accumulation de petits ajustements
//            individuellement incertains, donc moins fiable que son écart à la ligne ne le suggère.
// Facteurs de prudence basés sur la taille de l'échantillon (gamelogs disponibles).
// Moins de matchs = moins fiable = on élargit le std et on shrink plus vers la ligne bookmaker.
// S'applique à toutes les ligues : WNBA (8-12 matchs), début de saison NBA (5-8 matchs), etc.
function getSampleScale(n) {
  if (n < 6)  return { stdScale: 1.40, shrinkExtra: 0.15 };
  if (n < 10) return { stdScale: 1.20, shrinkExtra: 0.10 };
  if (n < 15) return { stdScale: 1.05, shrinkExtra: 0.05 };
  return { stdScale: 1.0, shrinkExtra: 0.0 };
}

function probAtLeast(estimate, std, threshold, stat = null, deviation = 0, isWNBA = false, sampleSize = 20) {
  const { stdScale, shrinkExtra } = getSampleScale(sampleSize);

  // Shrinkage : tire l'estimation vers la ligne du bookmaker.
  // Plus l'échantillon est petit, plus on fait confiance au bookmaker (shrinkExtra).
  const shrinkBase = stat === 'pts' ? 0.35 : stat === 'reb' ? 0.12 : stat === 'ast' ? 0.20 : stat === 'tpm' ? 0.25 : 0.20;
  const shrinkA    = Math.min(0.55, shrinkBase + shrinkExtra);
  const shrunk     = estimate + shrinkA * (threshold - estimate);

  // Std calibré : plancher ×stdScale selon taille d'échantillon + ×1.5 correction variance
  // + boost proportionnel à l'écart de la projection par rapport à la moyenne saison.
  const stdFloorBase = stat === 'pts' ? 4.0 : stat === 'reb' ? 2.0 : stat === 'ast' ? 1.5 : stat === 'tpm' ? 1.0 : 3.0;
  const statSizeScale = isWNBA ? 0.80 : 1.0;
  const stdFloor   = stdFloorBase * statSizeScale * stdScale;
  const devBoost   = 1 + Math.min(1.0, deviation * 2.5);
  const adjStd     = Math.max(stdFloor, (std || stdFloor) * 1.5 * devBoost);

  // Correction de continuité -0.5 (stats discrètes) + t-distribution df=4
  const z = (threshold - 0.5 - shrunk) / adjStd;
  return Math.max(0.01, Math.min(0.99, 1 - tCDF4(z)));
}

function getStreakFactor(games, seasonAvg) {
  if (!games?.length || !seasonAvg) return { val: 1.0, streak: 0 };
  const isHot = games[0]?.pts > seasonAvg;
  let streak = 0;
  for (const g of games.slice(0, 2)) {
    if (isHot ? g.pts > seasonAvg : g.pts <= seasonAvg) streak++;
    else break;
  }
  if (streak < 2) return { val: 1.0, streak };
  const val = isHot
    ? Math.min(1.12, 1 + (streak - 1) * 0.04)
    : Math.max(0.88, 1 - (streak - 1) * 0.04);
  return { val, streak };
}

function getPlayoffFactor(round) {
  if (!round) return { val: 1.0 };
  const r = round.toLowerCase();
  if (r.includes('final') && !r.includes('conf') && !r.includes('semi')) return { val: 0.93 };
  if ((r.includes('conf') && r.includes('final')) || r.includes('conference final')) return { val: 0.95 };
  if (r.includes('semi') || r.includes('2nd round')) return { val: 0.96 };
  if (r.includes('playoff') || r.includes('round 1') || r.includes('1st round') || r.includes('conf. semi') || r.includes('conf. finals')) return { val: 0.97 };
  return { val: 1.0 };
}

function getSeriesGameFactor(round, usg, isHome = false) {
  if (!round) return { val: 1.0 };
  const m = round.match(/game\s*(\d)/i);
  if (!m) return { val: 1.0 };
  const gn    = parseInt(m[1]);
  const isStar = (usg ?? 0) > 24;
  if (!isStar) return { val: 1.0 };
  if (isHome) {
    const homeMap = { 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.01, 5: 1.02, 6: 1.02, 7: 1.03 };
    return { val: homeMap[gn] ?? 1.01 };
  }
  const awayMap = { 1: 1.0, 2: 0.97, 3: 0.95, 4: 0.94, 5: 0.94, 6: 0.95, 7: 0.96 };
  return { val: awayMap[gn] ?? 0.94 };
}

function getVegasTotalFactor(gameTotal, isPlayoff = false) {
  if (!gameTotal) return { val: 1.0 };
  const avg = isPlayoff ? PLAYOFF_AVG_GAME_TOTAL : LEAGUE_AVG_GAME_TOTAL;
  return { val: Math.min(1.1, Math.max(0.85, gameTotal / avg)) };
}

function getTrendFactor(games, key) {
  if (!games || games.length < 5) return { val: 1.0 };
  const a3 = calcEWA(games, key, 3);
  const a8 = calcEWA(games.slice(3), key, 7);
  if (!a3 || !a8) return { val: 1.0 };
  const raw = a3 / a8;
  return { val: Math.min(1.1, Math.max(0.9, 0.65 + 0.35 * raw)) };
}

function getPaceFactor(oppGames) {
  if (!oppGames?.length) return { val: 1.0 };
  const last5    = oppGames.slice(0, 5);
  const avgTotal = last5.reduce((s, g) => s + g.ptsScored + g.ptsAllowed, 0) / last5.length;
  return { val: Math.min(1.1, Math.max(0.9, avgTotal / LEAGUE_AVG_GAME_TOTAL)) };
}

function getDefFactor(oppGames, isPlayoff = false) {
  if (!oppGames?.length) return { val: 1.0 };
  const avg        = isPlayoff ? PLAYOFF_AVG_PTS_ALLOWED : LEAGUE_AVG_PTS_ALLOWED;
  const last5      = oppGames.slice(0, 5);
  const avgAllowed = last5.reduce((s, g) => s + g.ptsAllowed, 0) / last5.length;
  return { val: Math.min(1.2, Math.max(0.8, avgAllowed / avg)) };
}

function toDefCat(pos) {
  if (!pos) return 'F';
  const p = String(pos).toUpperCase();
  if (p === 'PG' || p === 'SG' || p === 'G' || p.startsWith('G')) return 'G';
  if (p === 'C'  || p.startsWith('C')) return 'C';
  return 'F';
}

// stat='pts' : format historique, teamDef[posKey] est un nombre brut (points encaissés par poste).
// stat='reb'/'ast'/'tpm' (8 juillet 2026) : teamDef[posKey] est désormais un objet {pts,reb,ast,tpm}
// (WNBA — cf. getWNBADefByPos) quand la donnée par-poste-et-par-stat est disponible. Tant qu'une
// ligue/stat n'a pas encore ce format (NBA pas encore étendu, ligues EU sans défense par poste du
// tout), retourne `null` plutôt que {val:1.0} — laisse l'appelant décider du fallback (reprendre le
// facteur pts, comportement historique) plutôt que de neutraliser silencieusement l'ajustement.
function getDefByPosFactor(teamDef, position, stat = 'pts') {
  if (!teamDef || !position) return null;
  const posKey  = toDefCat(position);
  const posData = teamDef[posKey];
  const allowed = (posData && typeof posData === 'object') ? posData[stat] : (stat === 'pts' ? posData : undefined);
  if (allowed == null) return null;
  // _leagueAvg permet de fournir une moyenne ligue alternative (ex: WNBA, calculée
  // dynamiquement côté server.js) — sinon on retombe sur la constante NBA
  const leagueAvgSrc = teamDef._leagueAvg || LEAGUE_AVG_BY_POS;
  const leagueAvgPos = leagueAvgSrc[posKey];
  const leagueAvg = (leagueAvgPos && typeof leagueAvgPos === 'object') ? leagueAvgPos[stat] : (stat === 'pts' ? leagueAvgPos : undefined);
  if (!allowed || !leagueAvg) return null;
  return { val: Math.min(1.25, Math.max(0.75, allowed / leagueAvg)) };
}

// H2H étendu à toutes les stats (pts, reb, ast)
function getH2HFactor(games, oppAbbr, seasonAvg, stat = 'pts') {
  if (!games?.length || !oppAbbr || !seasonAvg) return { val: 1.0 };
  const h2h = games.filter(g => g.opponentAbbr === oppAbbr);
  if (!h2h.length) return { val: 1.0 };
  const a = calcAvg(h2h, stat, h2h.length);
  if (!a) return { val: 1.0 };
  return { val: Math.min(1.3, Math.max(0.7, a / seasonAvg)) };
}

function getRestFactor(myGames, gameDate) {
  if (!myGames?.length) return { val: 1.0 };
  const sorted = [...myGames].sort((a, b) => new Date(b.date) - new Date(a.date));
  const diff   = (new Date(gameDate) - new Date(sorted[0].date)) / 86400000;
  if (diff < 1.5) return { val: 0.94 };
  if (diff < 2.5) return { val: 1.0 };
  if (diff < 3.5) return { val: 1.02 };
  return { val: 1.03 };
}

function getScheduleDensityFactor(myGames, gameDate) {
  if (!myGames?.length) return { val: 1.0 };
  const gd     = new Date(gameDate);
  const recent = myGames.filter(g => {
    const d = (gd - new Date(g.date)) / 86400000;
    return d > 0 && d <= 5;
  });
  if (recent.length >= 3) return { val: 0.92 };
  if (recent.length === 2) {
    const span = (gd - new Date(recent[recent.length - 1].date)) / 86400000;
    if (span <= 3) return { val: 0.96 };
  }
  return { val: 1.0 };
}

// Split domicile/extérieur basé sur les vrais gamelogs du joueur
// Remplace le flat ±2.5% par le comportement réel observé
function getHomeAwaySplitFactor(gamelogs, isHome, isPlayoff = false) {
  const g = (gamelogs || []).filter(gl => gl.min > 10 && gl.pts != null && gl.isHome != null);
  const homeG = g.filter(gl => gl.isHome === true);
  const awayG = g.filter(gl => gl.isHome === false);

  // Fallback générique si pas assez de données (< 4 matchs par contexte)
  if (homeG.length < 4 || awayG.length < 4) {
    return { val: isPlayoff ? (isHome ? 1.04 : 0.96) : (isHome ? 1.025 : 0.975) };
  }

  const homeAvg  = homeG.reduce((s, gl) => s + gl.pts, 0) / homeG.length;
  const awayAvg  = awayG.reduce((s, gl) => s + gl.pts, 0) / awayG.length;
  const totalAvg = (homeAvg + awayAvg) / 2;
  if (!totalAvg) return { val: isHome ? 1.025 : 0.975 };

  const raw      = isHome ? homeAvg / totalAvg : awayAvg / totalAvg;
  const maxSplit = isPlayoff ? 0.12 : 0.10;
  return { val: Math.min(1 + maxSplit, Math.max(1 - maxSplit, raw)) };
}

function getBlowoutFactor(homeImpliedProb, isHome = null) {
  if (homeImpliedProb == null) return { val: 1.0 };
  const dominant = Math.max(homeImpliedProb, 1 - homeImpliedProb);
  if (dominant <= 0.74) return { val: 1.0 };
  // Détermine si le joueur est du côté outsider (perd plus de minutes en garbage time)
  const homeFavored = homeImpliedProb > 0.5;
  const isUnderdog = isHome !== null ? (homeFavored ? !isHome : isHome) : false;
  if (dominant > 0.82) return { val: isUnderdog ? 0.86 : 0.94 };
  return { val: isUnderdog ? 0.92 : 0.97 };
}

function getInjuryReturnFactor(player, gamelogs, gameDate) {
  const g      = gamelogs || [];
  const injury = player.injury;
  if (injury === 'Out') return { val: 0, isInjured: true, isOut: true };
  let daysSinceLast = 0;
  if (g.length > 0) daysSinceLast = (new Date(gameDate) - new Date(g[0].date)) / 86400000;
  const recent3    = g.slice(0, 3);
  const typical5   = g.slice(3, 8);
  const recentMin  = recent3.length  ? recent3.reduce((s, x) => s + (x.min || 0), 0) / recent3.length  : null;
  const typicalMin = typical5.length ? typical5.reduce((s, x) => s + (x.min || 0), 0) / typical5.length : recentMin;
  const minRatio   = (recentMin && typicalMin && typicalMin > 10) ? recentMin / typicalMin : 1.0;
  const missedRecent = daysSinceLast > 8;
  if (missedRecent && injury) return { val: 0.78, isInjured: true, isOut: false };
  if (missedRecent)           return { val: 0.82, isInjured: true, isOut: false };
  if (injury && minRatio < 0.78) return { val: Math.max(0.72, minRatio), isInjured: true, isOut: false };
  if (injury) return { val: 0.88, isInjured: true, isOut: false };
  return { val: 1.0, isInjured: false, isOut: false };
}

function getTSFactor(games, isPlayoff = false) {
  const valid = (games || []).filter(g => g.tsPct != null && g.min > 10);
  if (valid.length < 4) return { val: 1.0 };
  const recentTS  = valid.slice(0, 5).reduce((s, g) => s + g.tsPct, 0) / Math.min(5, valid.slice(0, 5).length);
  const histSlice = valid.slice(5, 15);
  if (!histSlice.length) return { val: 1.0 };
  const histTS    = histSlice.reduce((s, g) => s + g.tsPct, 0) / histSlice.length;
  if (histTS <= 0) return { val: 1.0 };
  const ratio     = recentTS / histTS;
  const [lo, hi]  = isPlayoff ? [0.95, 1.05] : [0.93, 1.07];
  return { val: Math.min(hi, Math.max(lo, 0.4 + 0.6 * ratio)) };
}

function getShotVolumeFactor(games) {
  const valid = (games || []).filter(g => g.fga != null && g.min > 10);
  if (valid.length < 5) return { val: 1.0 };
  const recentVol = valid.slice(0, 4).reduce((s, g) => s + g.fga / g.min, 0) / 4;
  const histSlice = valid.slice(4, 15);
  if (!histSlice.length) return { val: 1.0 };
  const histVol   = histSlice.reduce((s, g) => s + g.fga / g.min, 0) / histSlice.length;
  if (histVol <= 0) return { val: 1.0 };
  return { val: Math.min(1.08, Math.max(0.92, 0.5 + 0.5 * (recentVol / histVol))) };
}

function getFTRateFactor(games) {
  const valid = (games || []).filter(g => g.fga > 3 && g.min > 10);
  if (valid.length < 4) return { val: 1.0 };
  const recentFTR = valid.slice(0, 4).reduce((s, g) => s + g.fta / g.fga, 0) / 4;
  const histSlice = valid.slice(4, 14);
  if (!histSlice.length) return { val: 1.0 };
  const histFTR   = histSlice.reduce((s, g) => s + g.fta / g.fga, 0) / histSlice.length;
  if (histFTR <= 0) return { val: 1.0 };
  return { val: Math.min(1.06, Math.max(0.94, 0.5 + 0.5 * (recentFTR / histFTR))) };
}

// Ancre pts sur le volume de tirs récent (rôle, stable) × efficacité saison (pts par possession-tir,
// stable car moyennée sur tout l'échantillon) — indépendant des séries chaudes/froides au tir.
// N'est PAS injecté dans rawMult : appliqué uniquement à projPts (15 juin 2026, cf. project_pts_shot_data_upgrade).
function getShotVolumeAnchor(games, ptsKey = 'pts', minKey = 'min') {
  const valid = (games || []).filter(g => g.fga != null && (g[minKey] ?? 0) > 10);
  if (valid.length < 6) return null;

  const recent = valid.slice(0, 3);
  if (recent.length < 2) return null;
  const recentPoss = recent.reduce((s, g) => s + g.fga + 0.44 * (g.fta ?? 0), 0) / recent.length;

  const totalPts  = valid.reduce((s, g) => s + (g[ptsKey] ?? 0), 0);
  const totalPoss = valid.reduce((s, g) => s + g.fga + 0.44 * (g.fta ?? 0), 0);
  if (totalPoss <= 0) return null;
  const seasonEff = totalPts / totalPoss;

  return +(recentPoss * seasonEff).toFixed(1);
}

function getORebFactor(games) {
  const valid = (games || []).filter(g => g.oreb != null && g.min > 10);
  if (valid.length < 4) return { val: 1.0 };
  const recentOR  = valid.slice(0, 4).reduce((s, g) => s + g.oreb / g.min, 0) / 4;
  const histSlice = valid.slice(4, 14);
  if (!histSlice.length) return { val: 1.0 };
  const histOR    = histSlice.reduce((s, g) => s + g.oreb / g.min, 0) / histSlice.length;
  if (histOR <= 0.01) return { val: 1.0 };
  return { val: Math.min(1.08, Math.max(0.93, 0.45 + 0.55 * (recentOR / histOR))) };
}

function getTOARatioFactor(games) {
  const valid = (games || []).filter(g => g.to != null && g.ast != null && g.min > 10);
  if (valid.length < 4) return { val: 1.0 };
  const toaRatio  = g => g.ast > 0 ? g.to / g.ast : g.to > 2 ? 1.5 : 0;
  const recentR   = valid.slice(0, 4).reduce((s, g) => s + toaRatio(g), 0) / 4;
  const histSlice = valid.slice(4, 14);
  if (!histSlice.length) return { val: 1.0 };
  const histR     = histSlice.reduce((s, g) => s + toaRatio(g), 0) / histSlice.length;
  if (histR <= 0) return { val: 1.0 };
  return { val: Math.min(1.04, Math.max(0.92, 1.5 - 0.5 * (recentR / histR))) };
}

function isPlayoffRound(round) {
  if (!round) return false;
  const r = round.toLowerCase();
  return r.includes('final') || r.includes('semi') || r.includes('game') || r.includes('playoff');
}

function computeEstimate(player, isHome, oppGames, myGames, gamelogs, oppAbbr, gameDate, round, gameTotal, oppDefByPos = null, homeImpliedProb = null, redistributionFactor = 1.0, isWNBA = false) {
  const s = player.stats;
  if (!s?.pts) return null;

  // Le gamelog passé est déjà fusionné : boxscores PO de la série + gamelog ESPN saison régulière
  // (alignement avec mergedGamelog du frontend — plus de filtre date sur g, l'EWA pèse les PO en tête naturellement)
  const inPO = isPlayoffRound(round);
  const g    = gamelogs || [];

  const injRet = getInjuryReturnFactor(player, g, gameDate);
  if (injRet.isOut) return null;

  const poStart   = inPO ? new Date(`${new Date(gameDate).getFullYear()}-04-01`) : null;
  const poCount   = poStart ? g.filter(gl => new Date(gl.date) >= poStart).length : 0;
  const hasPOData = poCount > 0;

  const gClean = g.filter(gl => !(gl.pts === 0 && (gl.min ?? 0) >= 12));

  // Plafonne les pics isolés des matchs récents avant l'EWA (cf. winsorizeRecent)
  const gPtsW = winsorizeRecent(gClean, 'pts', s.pts, calcStd(g, 'pts'));
  const gRebW = winsorizeRecent(g, 'reb', s.reb, calcStd(g, 'reb'));
  const gAstW = winsorizeRecent(g, 'ast', s.ast, calcStd(g, 'ast'));
  const gTpmW = winsorizeRecent(g, 'tpm', s.tpm, calcStd(g, 'tpm'));

  const ewaBase = gPtsW.length >= 4 ? calcEWA(gPtsW, 'pts', 10) : null;
  const ewaReb  = s.reb && gRebW.length >= 4 ? calcEWA(gRebW, 'reb', 10) : null;
  const ewaAst  = s.ast && gAstW.length >= 4 ? calcEWA(gAstW, 'ast', 10) : null;
  const ewaTpm  = s.tpm && gTpmW.length >= 4 ? calcEWA(gTpmW, 'tpm', 10) : null;

  // Rôle réduit (ex: H. Barnes — saison ~18min, dernier matchs ~8min) : la moyenne saison
  // ne reflète plus le rôle actuel du joueur → on bascule (presque) tout le poids sur l'EWA récente
  const recent3Min = g.slice(0, 3).filter(gl => gl.min != null);
  const recentMin  = recent3Min.length >= 2 ? recent3Min.reduce((sum, gl) => sum + gl.min, 0) / recent3Min.length : null;
  const seasonMin  = s.min;
  const roleShrunk = recentMin != null && seasonMin > 5 && (recentMin / seasonMin) < 0.6;

  // Poids EWA selon taille d'échantillon : petit échantillon = moins de confiance dans les récents
  const ewaWBase = g.length < 8 ? 0.55 : g.length < 12 ? 0.58 : (inPO && hasPOData && poCount >= 3) ? 0.65 : 0.60;
  const ewaW = roleShrunk ? Math.max(ewaWBase, 0.92) : ewaWBase;
  const rsW  = 1 - ewaW;

  const l3Clean = gClean.slice(0, 3).filter(gl => (gl.min ?? 0) >= 12 && gl.pts != null);
  const l3Avg   = l3Clean.length >= 2 ? l3Clean.reduce((sum, gl) => sum + gl.pts, 0) / l3Clean.length : null;
  const useL3   = l3Avg != null && ewaBase != null && Math.abs(l3Avg - ewaBase) / ewaBase > 0.25;
  const effEWA  = useL3 ? l3Avg : ewaBase;

  // redistributionFactor > 1 quand un coéquipier à fort USG est OUT → boost proportionnel
  const basePts = (effEWA != null ? +(ewaW * effEWA + rsW * s.pts).toFixed(1) : s.pts) * redistributionFactor;
  const baseReb = s.reb ? ((ewaReb != null ? +(ewaW * ewaReb + rsW * s.reb).toFixed(1) : s.reb) * redistributionFactor) : null;
  const baseAst = s.ast ? ((ewaAst != null ? +(ewaW * ewaAst + rsW * s.ast).toFixed(1) : s.ast) * redistributionFactor) : null;
  const baseTpm = s.tpm ? ((ewaTpm != null ? +(ewaW * ewaTpm + rsW * s.tpm).toFixed(1) : s.tpm) * redistributionFactor) : null;

  const sampleDamp = n => n >= 15 ? 1.0 : n < 5 ? 0.0 : (n - 5) / 10;
  const dampen = sampleDamp(Math.min(oppGames?.length || 0, myGames?.length || 0));

  const rawPaceF = getPaceFactor(oppGames);
  // Facteur adverse dédié par stat (8 juillet 2026) — avant ce fix, reb/ast/tpm réutilisaient tous
  // le même facteur "points encaissés" que pts, alors qu'une équipe peut être moyenne en défense
  // sur les points tout en étant forte (ou faible) au rebond/à la passe. Fallback sur le facteur
  // pts tant que la donnée par-poste-et-par-stat n'est pas disponible (NBA pas encore étendu,
  // ligues EU) — comportement strictement identique à avant dans ce cas.
  const rawDefF    = (oppDefByPos && getDefByPosFactor(oppDefByPos, player.position, 'pts')) || getDefFactor(oppGames, inPO);
  const rawDefFReb = (oppDefByPos && getDefByPosFactor(oppDefByPos, player.position, 'reb')) || rawDefF;
  const rawDefFAst = (oppDefByPos && getDefByPosFactor(oppDefByPos, player.position, 'ast')) || rawDefF;
  const rawDefFTpm = (oppDefByPos && getDefByPosFactor(oppDefByPos, player.position, 'tpm')) || rawDefF;
  const pace     = { ...rawPaceF, val: 1 + (rawPaceF.val - 1) * dampen };
  const def      = { ...rawDefF,    val: 1 + (rawDefF.val    - 1) * dampen };
  const defReb   = { ...rawDefFReb, val: 1 + (rawDefFReb.val - 1) * dampen };
  const defAst   = { ...rawDefFAst, val: 1 + (rawDefFAst.val - 1) * dampen };
  const defTpm   = { ...rawDefFTpm, val: 1 + (rawDefFTpm.val - 1) * dampen };

  // H2H par stat — prend en compte l'historique joueur vs cet adversaire spécifique
  const h2hPts = getH2HFactor(g, oppAbbr, s.pts, 'pts');
  const h2hReb = s.reb ? getH2HFactor(g, oppAbbr, s.reb, 'reb') : { val: 1.0 };
  const h2hAst = s.ast ? getH2HFactor(g, oppAbbr, s.ast, 'ast') : { val: 1.0 };
  const h2hTpm = s.tpm ? getH2HFactor(g, oppAbbr, s.tpm, 'tpm') : { val: 1.0 };

  const rest    = getRestFactor(myGames, gameDate);
  const density = getScheduleDensityFactor(myGames, gameDate);

  // Split domicile/extérieur basé sur les vrais gamelogs du joueur (remplace le flat ±2.5%)
  const loc     = getHomeAwaySplitFactor(g, isHome, inPO);

  const vegas   = getVegasTotalFactor(gameTotal, inPO);
  const blowout = getBlowoutFactor(homeImpliedProb, isHome);
  const tsF     = getTSFactor(g, inPO);
  const shotVol = getShotVolumeFactor(g);
  const ftRate  = getFTRateFactor(g);
  const orebF   = getORebFactor(g);
  const toaF    = getTOARatioFactor(g);
  const streak  = getStreakFactor(g, s.pts);

  let adjMult, adjMultReb, adjMultAst, adjMultTpm, h2hCapped, h2hRebCapped, h2hAstCapped, h2hTpmCapped;

  if (inPO) {
    // Base EWA déjà alimentée par les matchs PO de la série → H2H double-compte ; cap resserré
    h2hCapped    = Math.min(1.08, Math.max(0.92, h2hPts.val));
    h2hRebCapped = Math.min(1.08, Math.max(0.92, h2hReb.val));
    h2hAstCapped = Math.min(1.08, Math.max(0.92, h2hAst.val));
    h2hTpmCapped = Math.min(1.08, Math.max(0.92, h2hTpm.val));
    const playoff    = getPlayoffFactor(round);
    const series     = getSeriesGameFactor(round, player.usg, isHome);
    const paceDamped = 1 + (pace.val - 1) * 0.5;
    const roleNormPO = (() => {
      const seasonMin = player.stats?.min;
      if (!seasonMin || seasonMin < 5 || g.length < 2) return 1.0;
      const recent3   = g.slice(0, 3).filter(gl => gl.min > 0);
      if (recent3.length < 2) return 1.0;
      const recentMin = recent3.reduce((s, gl) => s + gl.min, 0) / recent3.length;
      if (recentMin >= seasonMin * 0.75) return 1.0;
      return Math.max(0.72, recentMin / seasonMin);
    })();
    const tsAttn  = 1 + (tsF.val    - 1) * 0.5;
    const volAttn = 1 + (shotVol.val - 1) * 0.5;
    const ftAttn  = 1 + (ftRate.val  - 1) * 0.5;
    // Si le gamelog contient déjà des matchs PO, l'EWA reflète l'intensité playoffs → neutralise playoff.val
    const playoffAdj = hasPOData ? 1.0 : playoff.val;
    const sharedMult = paceDamped * rest.val * density.val * loc.val * vegas.val
                  * blowout.val * injRet.val * roleNormPO
                  * tsAttn * volAttn * ftAttn * playoffAdj * series.val;
    const rawMult    = def.val    * sharedMult * h2hCapped;
    const rawMultReb = defReb.val * sharedMult * h2hRebCapped;
    const rawMultAst = defAst.val * sharedMult * h2hAstCapped;
    const rawMultTpm = defTpm.val * sharedMult * h2hTpmCapped;
    // Cap resserré 20 juillet 2026 — pts affichait pourtant un ancrage volume×efficacité (volAnchor,
    // censé jouer le même rôle protecteur que le fix reb du 19 juillet), mais le suivi des
    // "presque-alertes" a montré une surestimation encore pire que reb avant son fix (+23 points de %
    // entre proba affichée et réussite réelle, n=22). Cause tracée : basePts est déjà gonflé par
    // l'EWA (poids fort sur les 3 derniers matchs) avant tout multiplicateur, et plusieurs facteurs de
    // adjMult (streak, shotVol, tsF, ftRate) regardent la MÊME fenêtre récente — pas des risques
    // indépendants qui se compensent, ils s'alignent tous en cas de série chaude. volAnchor lui-même
    // est contaminé par ce même signal récent (recentPoss = 3 derniers matchs), donc ne corrige pas
    // vraiment. Plafond jamais resserré jusqu'ici contrairement à reb — aligné sur le même resserrement.
    adjMult    = Math.min(1.18, Math.max(0.74, rawMult));
    adjMultReb = Math.min(1.18, Math.max(0.74, rawMultReb * (1 + (orebF.val - 1) * 0.6)));
    adjMultAst = Math.min(1.30, Math.max(0.74, rawMultAst * toaF.val));
    adjMultTpm = Math.min(1.30, Math.max(0.74, rawMultTpm));
  } else {
    h2hCapped    = Math.min(1.08, Math.max(0.92, h2hPts.val));
    h2hRebCapped = Math.min(1.08, Math.max(0.92, h2hReb.val));
    h2hAstCapped = Math.min(1.08, Math.max(0.92, h2hAst.val));
    h2hTpmCapped = Math.min(1.08, Math.max(0.92, h2hTpm.val));
    const streakCapped = Math.min(1.06, Math.max(0.94, streak.val));
    const sharedMult = pace.val * rest.val * density.val * loc.val * vegas.val
                  * blowout.val * injRet.val * streakCapped
                  * tsF.val * shotVol.val * ftRate.val;
    const rawMult    = def.val    * sharedMult * h2hCapped;
    const rawMultReb = defReb.val * sharedMult * h2hRebCapped;
    const rawMultAst = defAst.val * sharedMult * h2hAstCapped;
    const rawMultTpm = defTpm.val * sharedMult * h2hTpmCapped;
    // Cap resserré 20 juillet 2026 — pts a pourtant un ancrage volume×efficacité (volAnchor), mais le
    // suivi des "presque-alertes" a montré une surestimation encore pire que reb avant son fix
    // (+23 points de % entre proba affichée et réussite réelle, n=22, vs +7pp pour reb après son fix).
    // Cause tracée : basePts est déjà gonflé par l'EWA (poids fort sur les 3 derniers matchs) avant
    // tout multiplicateur, et plusieurs facteurs de adjMult (streak, shotVol, tsF, ftRate) regardent
    // la MÊME fenêtre récente — pas des risques indépendants qui se compensent, ils s'alignent tous en
    // cas de série chaude. volAnchor est lui-même contaminé par ce même signal récent (recentPoss = 3
    // derniers matchs), donc ne corrige pas vraiment malgré les apparences. Plafond jamais resserré
    // jusqu'ici contrairement à reb (voir juste en dessous) — aligné sur le même resserrement.
    adjMult    = Math.min(1.12, Math.max(0.78, rawMult));
    // Cap resserré 19 juillet 2026 — reb n'a jamais reçu l'équivalent de l'ancrage volume×efficacité
    // qui recale pts (getShotVolumeAnchor, 15 juin) : sans garde-fou, les boosts (défense adverse,
    // H2H, forme, redistribution coéquipière) s'empilent sans rien qui ramène vers une valeur crédible.
    // Constaté sur 13 paris reb réglés (historique réel) : 11/13 surestimés, +3,6 rebonds de moyenne
    // d'écart vs réel — le plafond 1.24 était trop large pour ce stat en particulier.
    adjMultReb = Math.min(1.12, Math.max(0.78, rawMultReb * orebF.val));
    adjMultAst = Math.min(1.24, Math.max(0.78, rawMultAst * toaF.val));
    adjMultTpm = Math.min(1.24, Math.max(0.78, rawMultTpm));
  }

  // Rôle réduit : la moyenne saison n'est plus un plancher pertinent (cf. ewaW ci-dessus)
  const floorPts  = roleShrunk ? basePts * 0.7 : s.pts * 0.72;
  const projPtsRaw = Math.max(floorPts, +(basePts * adjMult).toFixed(1));

  // TEST 8 juillet 2026 (pas encore déployé) — plafond combiné redistribution × ajustement
  // matchup. Chacun des deux est déjà plafonné individuellement (redistributionFactor ≤1.15,
  // adjMult* ≤1.24/1.30 en PO), mais rien n'empêchait les deux de se multiplier ensemble (jusqu'à
  // ~1.43, +43%) quand une joueuse a À LA FOIS une coéquipière clé Out ET un matchup très
  // favorable. Cas concret trouvé : Nneka Ogwumike (LA Sparks) projetée à 12.7 rebonds le 8
  // juillet (saison ~8.7-9.1) avec 2 coéquipières Out. Ne s'applique QUE quand la redistribution
  // est active (redistributionFactor>1) — zéro effet sur l'immense majorité des joueuses.
  const COMBINED_BOOST_CAP = 1.30;
  const capRedistStack = (finalVal, baseVal) => {
    if (finalVal == null || !baseVal || redistributionFactor <= 1.0) return finalVal;
    const baseNoRedist = baseVal / redistributionFactor;
    const maxAllowed = baseNoRedist * COMBINED_BOOST_CAP;
    return finalVal > maxAllowed ? +maxAllowed.toFixed(1) : finalVal;
  };

  const projPtsCapped = capRedistStack(projPtsRaw, basePts);

  // Ancrage volume × efficacité saison — n'affecte que pts (reb/ast/tpm inchangés)
  const volAnchor = getShotVolumeAnchor(g, 'pts', 'min');
  const projPts   = volAnchor != null
    ? Math.max(floorPts, +(projPtsCapped * 0.85 + volAnchor * 0.15).toFixed(1))
    : projPtsCapped;

  const rebRaw = baseReb ? +(baseReb * adjMultReb).toFixed(1) : null;
  const astRaw = baseAst ? +(baseAst * adjMultAst).toFixed(1) : null;
  const tpmRaw = baseTpm ? +(baseTpm * adjMultTpm).toFixed(1) : null;

  return {
    pts:       +projPts.toFixed(1),
    reb:       capRedistStack(rebRaw, baseReb),
    ast:       capRedistStack(astRaw, baseAst),
    tpm:       capRedistStack(tpmRaw, baseTpm),
    // Écart de la projection par rapport à la moyenne saison — sert à élargir le std dans probAtLeast
    deviation: { pts: Math.abs(adjMult - 1), reb: Math.abs(adjMultReb - 1), ast: Math.abs(adjMultAst - 1), tpm: Math.abs(adjMultTpm - 1) },
    streak,
    isInjured: injRet.isInjured,
  };
}

export { computeEstimate, calcStd, isConsistentStat, blendedSeasonAvg, winsorizeRecent, getShotVolumeAnchor, probAtLeast, tCDF4, getRestFactor, getScheduleDensityFactor, isPlayoffRound, toDefCat, getDefByPosFactor };
