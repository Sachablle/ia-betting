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

// EWA avec decay=0.82 — identique au frontend
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

function normalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return z > 0 ? 1 - p : p;
}

function probAtLeast(estimate, std, threshold) {
  if (!std || std <= 0) return threshold <= estimate ? 0.70 : 0.30;
  const z = (threshold - 0.5 - estimate) / std;
  return Math.max(0.01, Math.min(0.99, 1 - normalCDF(z)));
}

function calcStd(games, key) {
  const vals = (games || [])
    .filter(g => g.min > 10 && g[key] != null && !(key === 'pts' && g.pts === 0 && g.min >= 12))
    .map(g => g[key]);
  if (vals.length < 3) return null;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
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
  const gn     = parseInt(m[1]);
  const isStar = (usg ?? 0) > 24;
  if (!isStar) return { val: 1.0 };
  // À domicile : les stars s'élèvent dans les matchs à enjeu (protection du parquet, crowd energy)
  if (isHome) {
    const homeMap = { 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.01, 5: 1.02, 6: 1.02, 7: 1.03 };
    return { val: homeMap[gn] ?? 1.01 };
  }
  // À l'extérieur : pression + hostilité de la salle → pénalité maintenue
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

function getDefByPosFactor(teamDef, position) {
  if (!teamDef || !position) return { val: 1.0 };
  const posKey    = String(position)[0].toUpperCase();
  const allowed   = teamDef[posKey];
  const leagueAvg = LEAGUE_AVG_BY_POS[posKey];
  if (!allowed || !leagueAvg) return { val: 1.0 };
  return { val: Math.min(1.25, Math.max(0.75, allowed / leagueAvg)) };
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

// Fenêtre 5 jours — identique au frontend
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

function getLocationFactor(isHome, isPlayoff = false) {
  if (isPlayoff) return { val: isHome ? 1.04 : 0.96 };
  return { val: isHome ? 1.025 : 0.975 };
}

// Blowout / garbage time — identique au frontend
function getBlowoutFactor(homeImpliedProb) {
  if (homeImpliedProb == null) return { val: 1.0 };
  const dominant = Math.max(homeImpliedProb, 1 - homeImpliedProb);
  if (dominant > 0.82) return { val: 0.92 };
  if (dominant > 0.74) return { val: 0.96 };
  return { val: 1.0 };
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

// homeImpliedProb : probabilité implicite Pinnacle (null si indispo)
function computeEstimate(player, isHome, oppGames, myGames, gamelogs, oppAbbr, gameDate, round, gameTotal, extra = {}, homeImpliedProb = null, isWNBA = false) {
  const s = player.stats;
  if (!s?.pts) return null;

  const inPO    = isPlayoffRound(round);
  const poStart = inPO ? new Date(`${new Date(gameDate).getFullYear()}-04-01`) : null;
  const rawG    = gamelogs || [];
  const g = (poStart && rawG.filter(gl => new Date(gl.date) >= poStart).length >= 3)
    ? rawG.filter(gl => new Date(gl.date) >= poStart)
    : rawG;

  const injRet = getInjuryReturnFactor(player, g, gameDate);
  if (injRet.isOut) return null;

  const poCount  = poStart ? rawG.filter(gl => new Date(gl.date) >= poStart).length : 0;
  const hasPOData = poCount > 0;
  // Identique au frontend : exclut uniquement les 0 pts avec min >= 12
  const gClean = g.filter(gl => !(gl.pts === 0 && (gl.min ?? 0) >= 12));
  const poEWAPts = gClean.length >= 4 ? calcEWA(gClean, 'pts', 10) : null;
  const poEWAReb = s.reb && g.length >= 4 ? calcEWA(g, 'reb', 10) : null;
  const poEWAAst = s.ast && g.length >= 4 ? calcEWA(g, 'ast', 10) : null;
  const ewaW = isWNBA ? 0.70 : (inPO && hasPOData && poCount >= 3) ? 0.65 : 0.60;
  const rsW  = 1 - ewaW;

  // L3 crosscheck (3 matchs) — identique au frontend, évite la surpondération des hot streaks
  const l3Clean = gClean.slice(0, 3).filter(gl => (gl.min ?? 0) >= 12 && gl.pts != null);
  const l3Avg   = l3Clean.length >= 2 ? l3Clean.reduce((sum, gl) => sum + gl.pts, 0) / l3Clean.length : null;
  const useL3   = l3Avg != null && poEWAPts != null && Math.abs(l3Avg - poEWAPts) / poEWAPts > 0.25;
  const effEWA  = useL3 ? l3Avg : poEWAPts;

  const basePts = effEWA != null ? +(ewaW * effEWA + rsW * s.pts).toFixed(1) : s.pts;
  const baseReb = s.reb ? (poEWAReb != null ? +(ewaW * poEWAReb + rsW * s.reb).toFixed(1) : s.reb) : null;
  const baseAst = s.ast ? (poEWAAst != null ? +(ewaW * poEWAAst + rsW * s.ast).toFixed(1) : s.ast) : null;

  // Fix 4 — atténuer facteurs défensifs si < 15 matchs (données peu fiables)
  const sampleDamp = n => n >= 15 ? 1.0 : n < 5 ? 0.0 : (n - 5) / 10;
  const dampen = sampleDamp(Math.min(oppGames?.length || 0, myGames?.length || 0));

  const rawPaceF = getPaceFactor(oppGames);
  const rawDefF  = extra.defByPos ? getDefByPosFactor(extra.defByPos, player.position) : getDefFactor(oppGames, inPO);
  const pace     = { ...rawPaceF, val: 1 + (rawPaceF.val - 1) * dampen };
  const def      = { ...rawDefF,  val: 1 + (rawDefF.val  - 1) * dampen };
  const h2h     = getH2HFactor(g, oppAbbr, s.pts);
  const rest    = getRestFactor(myGames, gameDate);
  const density = getScheduleDensityFactor(myGames, gameDate);
  const loc     = getLocationFactor(isHome, inPO);
  const vegas   = getVegasTotalFactor(gameTotal, inPO);
  const blowout = getBlowoutFactor(homeImpliedProb);
  const tsF     = getTSFactor(g, inPO);
  const shotVol = getShotVolumeFactor(g);
  const ftRate  = getFTRateFactor(g);
  const orebF   = getORebFactor(g);
  const toaF    = getTOARatioFactor(g);
  const streak  = getStreakFactor(rawG, basePts);

  let adjMult, adjMultReb, adjMultAst;

  if (inPO) {
    const playoff    = getPlayoffFactor(round);
    const series     = getSeriesGameFactor(round, player.usg, isHome);
    const h2hCapped  = Math.min(1.08, Math.max(0.92, h2h.val));
    const paceDamped = 1 + (pace.val - 1) * 0.5;
    const roleNormPO = (() => {
      const seasonMin = player.stats?.min;
      if (!seasonMin || seasonMin < 5 || g.length < 2) return 1.0;
      const recent2  = g.slice(0, 2).filter(gl => gl.min > 0);
      if (recent2.length < 2) return 1.0;
      const recentMin = recent2.reduce((s, gl) => s + gl.min, 0) / recent2.length;
      const ratio = recentMin / seasonMin;
      if (ratio >= 0.75 && ratio <= 1.15) return 1.0;
      return Math.min(1.10, Math.max(0.72, ratio));
    })();
    const tsAttn     = 1 + (tsF.val    - 1) * 0.5;
    const volAttn    = 1 + (shotVol.val - 1) * 0.5;
    const ftAttn     = 1 + (ftRate.val  - 1) * 0.5;
    const streakAttn = 1 + (streak.val  - 1) * 0.5; // streak atténué ×0.5 en PO
    const playoffAdj = poEWAPts != null ? 1.0 : playoff.val;
    const rawMult = def.val * paceDamped * rest.val * density.val * loc.val * vegas.val
                  * blowout.val * injRet.val * roleNormPO * h2hCapped
                  * tsAttn * volAttn * ftAttn * streakAttn * playoffAdj * series.val;
    adjMult    = Math.min(1.30, Math.max(0.74, rawMult));
    adjMultReb = Math.min(1.30, Math.max(0.74, rawMult * (1 + (orebF.val - 1) * 0.6)));
    adjMultAst = Math.min(1.30, Math.max(0.74, rawMult * toaF.val));
  } else {
    const h2hCapped    = Math.min(1.08, Math.max(0.92, h2h.val));
    const streakCapped = Math.min(1.06, Math.max(0.94, streak.val));
    // Normalisation minutes RS — même logique que PO
    const roleNormRS = (() => {
      const seasonMin = player.stats?.min;
      if (!seasonMin || seasonMin < 5 || g.length < 2) return 1.0;
      const recent2 = g.slice(0, 2).filter(gl => gl.min > 0);
      if (recent2.length < 2) return 1.0;
      const recentMin = recent2.reduce((s, gl) => s + gl.min, 0) / recent2.length;
      const ratio = recentMin / seasonMin;
      if (ratio >= 0.75 && ratio <= 1.15) return 1.0;
      return Math.min(1.10, Math.max(0.72, ratio));
    })();
    const rawMult      = def.val * pace.val * rest.val * density.val * loc.val * vegas.val
                       * blowout.val * injRet.val * streakCapped * h2hCapped * roleNormRS
                       * tsF.val * shotVol.val * ftRate.val;
    adjMult    = Math.min(1.24, Math.max(0.78, rawMult));
    adjMultReb = Math.min(1.24, Math.max(0.78, rawMult * orebF.val));
    adjMultAst = Math.min(1.24, Math.max(0.78, rawMult * toaF.val));
  }

  // Plancher : la projection ne peut jamais tomber sous 72% de la moyenne saison
  // Évite les projections aberrantes quand les facteurs s'accumulent négativement
  const floorPts = s.pts * 0.72;
  const projPts  = Math.max(floorPts, +(basePts * adjMult).toFixed(1));

  return {
    pts:       +projPts.toFixed(1),
    reb:       baseReb ? +(baseReb * adjMultReb).toFixed(1) : null,
    ast:       baseAst ? +(baseAst * adjMultAst).toFixed(1) : null,
    streak,
    isInjured: injRet.isInjured,
  };
}

export { computeEstimate, calcStd, probAtLeast };
