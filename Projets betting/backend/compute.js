'use strict';

const LEAGUE_AVG_PTS_ALLOWED  = 113.5;
const LEAGUE_AVG_GAME_TOTAL   = 227.0;
const LEAGUE_AVG_BY_POS       = { G: 22.8, F: 18.5, C: 14.8 };
const POSITION_AVG_USG        = { G: 22.0, F: 18.5, C: 17.0 };

// Simple average (kept for streak/h2h where weighting doesn't apply)
function calcAvg(games, key, n) {
  const slice = games.slice(0, n).map(g => g[key]).filter(v => v != null && !isNaN(v));
  return slice.length ? slice.reduce((s, v) => s + v, 0) / slice.length : null;
}

// Exponential weighted average — recent games count more (λ=0.85)
function calcWeightedAvg(games, key, n, lambda = 0.85) {
  const slice = games.slice(0, n).map(g => g[key]).filter(v => v != null && !isNaN(v));
  if (!slice.length) return null;
  let wSum = 0, total = 0;
  for (let i = 0; i < slice.length; i++) {
    const w = Math.pow(lambda, i);
    total += slice[i] * w;
    wSum  += w;
  }
  return total / wSum;
}

function normalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return z > 0 ? 1 - p : p;
}

function probAtLeast(estimate, std, threshold) {
  if (!std || std <= 0) return threshold <= estimate ? 0.80 : 0.20;
  const z = (threshold - 0.5 - estimate) / std;
  return Math.max(0.01, Math.min(0.99, 1 - normalCDF(z)));
}

function calcStd(games, key) {
  const vals = (games || []).filter(g => g.min > 10 && g[key] != null).map(g => g[key]);
  if (vals.length < 3) return null;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
}

function getPtsPerMinForm(games, seasonAvg) {
  if (!games?.length || !seasonAvg) return { val: 1.0 };
  const withMin = games.filter(g => g.min > 0).slice(0, 5);
  if (!withMin.length) return { val: 1.0 };
  const allMins = games.filter(g => g.min > 0).map(g => g.min).sort((a, b) => a - b);
  const medMin  = allMins[Math.floor(allMins.length / 2)];
  // Exponential weighting: most recent game counts most
  let wSum = 0, wPPM = 0;
  withMin.forEach((g, i) => { const w = Math.pow(0.85, i); wPPM += (g.pts / g.min) * w; wSum += w; });
  const normPts = +((wPPM / wSum) * medMin).toFixed(1);
  return { val: Math.min(1.45, Math.max(0.6, normPts / seasonAvg)) };
}

function getStreakFactor(games, seasonAvg) {
  if (!games?.length || !seasonAvg) return { val: 1.0, streak: 0 };
  const isHot = games[0]?.pts > seasonAvg;
  let streak = 0;
  for (const g of games.slice(0, 9)) {
    if (isHot ? g.pts > seasonAvg : g.pts <= seasonAvg) streak++;
    else break;
  }
  if (streak < 3) return { val: 1.0, streak };
  const val = isHot
    ? Math.min(1.12, 1 + (streak - 2) * 0.015)
    : Math.max(0.88, 1 - (streak - 2) * 0.015);
  return { val, streak };
}

function getPlayoffFactor(round) {
  if (!round) return { val: 1.0 };
  const r = round.toLowerCase();
  if (r.includes('final') && !r.includes('conf') && !r.includes('semi')) return { val: 0.93 };
  if ((r.includes('conf') && r.includes('final')) || r.includes('conference final')) return { val: 0.95 };
  if (r.includes('semi') || r.includes('2nd round')) return { val: 0.96 };
  if (r.includes('playoff') || r.includes('round 1') || r.includes('1st round')) return { val: 0.97 };
  return { val: 1.0 };
}

function getVegasTotalFactor(gameTotal) {
  if (!gameTotal) return { val: 1.0 };
  return { val: Math.min(1.1, Math.max(0.85, gameTotal / LEAGUE_AVG_GAME_TOTAL)) };
}

// Trend: weighted L3 vs weighted L4-10
function getTrendFactor(games, key) {
  if (!games || games.length < 5) return { val: 1.0 };
  const a3 = calcWeightedAvg(games, key, 3);
  const a8 = calcWeightedAvg(games.slice(3), key, 7);
  if (!a3 || !a8) return { val: 1.0 };
  const raw = a3 / a8;
  return { val: Math.min(1.1, Math.max(0.9, 0.65 + 0.35 * raw)) };
}

function getPaceFactor(oppGames) {
  if (!oppGames?.length) return { val: 1.0 };
  const last5   = oppGames.slice(0, 5);
  const avgTotal = last5.reduce((s, g) => s + g.ptsScored + g.ptsAllowed, 0) / last5.length;
  return { val: Math.min(1.1, Math.max(0.9, avgTotal / LEAGUE_AVG_GAME_TOTAL)) };
}

// Fallback def factor (global pts allowed) — used when defByPos unavailable
function getDefFactor(oppGames) {
  if (!oppGames?.length) return { val: 1.0 };
  const last5      = oppGames.slice(0, 5);
  const avgAllowed = last5.reduce((s, g) => s + g.ptsAllowed, 0) / last5.length;
  return { val: Math.min(1.2, Math.max(0.8, avgAllowed / LEAGUE_AVG_PTS_ALLOWED)) };
}

// Position-specific defense: pts/game allowed to G / F / C
function getDefByPosFactor(defByPos, position) {
  if (!defByPos || !position) return { val: 1.0 };
  const posKey    = String(position)[0].toUpperCase(); // 'G', 'F', 'C'
  const allowed   = defByPos[posKey];
  const leagueAvg = LEAGUE_AVG_BY_POS[posKey];
  if (!allowed || !leagueAvg) return { val: 1.0 };
  return { val: Math.min(1.2, Math.max(0.8, allowed / leagueAvg)) };
}

function getH2HFactor(games, oppAbbr, seasonAvg) {
  if (!games?.length || !oppAbbr || !seasonAvg) return { val: 1.0 };
  const h2h = games.filter(g => g.opponentAbbr === oppAbbr);
  if (!h2h.length) return { val: 1.0 };
  const a = calcAvg(h2h, 'pts', h2h.length);
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

// Schedule density: 3-in-4, 4-in-6, etc.
function getScheduleDensityFactor(myGames, gameDate) {
  if (!myGames?.length) return { val: 1.0 };
  const gd     = new Date(gameDate).getTime();
  const last7  = myGames.filter(g => {
    const diff = (gd - new Date(g.date).getTime()) / 86400000;
    return diff > 0 && diff <= 7;
  }).length;
  if (last7 >= 4) return { val: 0.93 };
  if (last7 === 3) return { val: 0.96 };
  if (last7 === 2) return { val: 0.99 };
  return { val: 1.0 };
}

function getLocationFactor(isHome) {
  return { val: isHome ? 1.025 : 0.975 };
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

// Weighted form factor (L5 exponential)
function getFormFactor(games, key, seasonAvg) {
  if (!games?.length || !seasonAvg) return { val: 1.0 };
  const a = calcWeightedAvg(games, key, 5);
  if (!a) return { val: 1.0 };
  return { val: Math.min(1.45, Math.max(0.6, a / seasonAvg)) };
}

function getRoleNormFactor(games, seasonAvgMin) {
  if (!games?.length || !seasonAvgMin || seasonAvgMin < 5) return { val: 1.0 };
  const recent3 = games.slice(0, 3).filter(g => g.min > 0);
  if (recent3.length < 2) return { val: 1.0 };
  const recentAvgMin = recent3.reduce((s, g) => s + g.min, 0) / recent3.length;
  if (recentAvgMin <= seasonAvgMin * 1.25) return { val: 1.0 };
  const ratio = seasonAvgMin / recentAvgMin;
  return { val: Math.max(0.55, ratio) };
}

// USG% factor: high-usage players get slight boost, low-usage slight penalty
function getUsageFactor(playerUSG, position) {
  if (!playerUSG) return { val: 1.0 };
  const posKey = String(position || '')[0].toUpperCase();
  const posAvg = POSITION_AVG_USG[posKey] ?? 20.0;
  return { val: Math.min(1.08, Math.max(0.92, playerUSG / posAvg)) };
}

function computeEstimate(player, isHome, oppGames, myGames, gamelogs, oppAbbr, gameDate, round, gameTotal, extra = {}) {
  const s = player.stats;
  if (!s?.pts) return null;
  const g = gamelogs || [];

  const injRet   = getInjuryReturnFactor(player, g, gameDate);
  if (injRet.isOut) return null;

  const formPPM  = getPtsPerMinForm(g, s.pts);
  const trend    = getTrendFactor(g, 'pts');
  const pace     = getPaceFactor(oppGames);
  // Position-specific defense if available, fallback to global
  const def      = extra.defByPos
    ? getDefByPosFactor(extra.defByPos, player.position)
    : getDefFactor(oppGames);
  const h2h      = getH2HFactor(g, oppAbbr, s.pts);
  const rest     = getRestFactor(myGames, gameDate);
  const density  = getScheduleDensityFactor(myGames, gameDate);
  const loc      = getLocationFactor(isHome);
  const playoff  = getPlayoffFactor(round);
  const vegas    = getVegasTotalFactor(gameTotal);
  const streak   = getStreakFactor(g, s.pts);
  const roleNorm = getRoleNormFactor(g, s.min);
  const usage    = extra.usg ? getUsageFactor(extra.usg, player.position) : { val: 1.0 };

  const sharedMult = pace.val * def.val * rest.val * density.val * loc.val * playoff.val * vegas.val * injRet.val;
  const formReb    = getFormFactor(g, 'reb', s.reb);
  const trendReb   = getTrendFactor(g, 'reb');
  const formAst    = getFormFactor(g, 'ast', s.ast);
  const trendAst   = getTrendFactor(g, 'ast');

  return {
    pts: +(s.pts * formPPM.val * trend.val * h2h.val * streak.val * roleNorm.val * usage.val * sharedMult).toFixed(1),
    reb: s.reb ? +(s.reb * formReb.val * trendReb.val * sharedMult).toFixed(1) : null,
    ast: s.ast ? +(s.ast * formAst.val * trendAst.val * sharedMult).toFixed(1) : null,
    isInjured: injRet.isInjured,
  };
}

export { computeEstimate, calcStd, probAtLeast };
