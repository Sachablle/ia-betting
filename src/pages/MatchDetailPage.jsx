import { useState, useEffect, useRef } from 'react';
import { cachedFetch } from '../utils/fetchCache';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { getFixtureById, getLeagueById } from '../utils/fixtures';
import { useFootballFixtures } from '../utils/useFootballFixtures';
import { formatFullDate, formatMatchTime, formatCapacity } from '../utils/formatters';
import FormStrip from '../components/FormStrip';
import StatBar from '../components/StatBar';
import TeamLogo from '../components/TeamLogo';
import { OddsCell } from '../components/OddsCell';

const FINAL_STATUSES = new Set(['STATUS_FULL_TIME', 'STATUS_FINAL', 'STATUS_FT', 'STATUS_AFTER_EXTRA_TIME', 'STATUS_AFTER_PENALTIES']);

// ── ESPN team lookup (name → { league, id }) ──────────────────────────────────
// Fix 28 août 2026 — la moitié des clubs des 5 championnats renvoyaient "Indisponible" en
// Compositions malgré des effectifs ESPN valides (vérifié en direct via l'API ESPN : PSG/Lille
// renvoient bien 26-28 joueurs) : la clé de recherche était `fixture.home.name`/`away.name`
// (nom EXACT football-data.org, ex. "Lille OSC", "Paris Saint-Germain FC") alors que ce dictionnaire
// n'avait que des noms raccourcis/différents ("LOSC Lille", "Paris Saint-Germain") — recherche stricte
// par égalité, aucun rapprochement flou. Reconstruit intégralement à partir des vraies listes
// football-data.org (`/api/football/standings/:league`) et ESPN (`/apis/site/v2/sports/soccer/{lg}/teams`)
// des 5 championnats, clé = nom EXACT football-data.org — les anciennes clés courtes sont gardées en
// plus (harmless) au cas où une autre source utiliserait un nom raccourci.
const ESPN_FOOTBALL = {
  // Ligue 1
  'Olympique de Marseille': { league: 'fra.1', id: 176 },
  'Racing Club de Lens': { league: 'fra.1', id: 175 },
  'RC Lens': { league: 'fra.1', id: 175 },
  'Lille OSC': { league: 'fra.1', id: 166 },
  'LOSC Lille': { league: 'fra.1', id: 166 },
  'Olympique Lyonnais': { league: 'fra.1', id: 167 },
  'AS Monaco FC': { league: 'fra.1', id: 174 },
  'AS Monaco': { league: 'fra.1', id: 174 },
  'Le Mans FC': { league: 'fra.1', id: 2697 },
  'Paris Saint-Germain FC': { league: 'fra.1', id: 160 },
  'Paris Saint-Germain': { league: 'fra.1', id: 160 },
  'Stade Brestois 29': { league: 'fra.1', id: 6997 },
  'Stade Brestois': { league: 'fra.1', id: 6997 },
  'Stade Rennais FC 1901': { league: 'fra.1', id: 169 },
  'Stade Rennais': { league: 'fra.1', id: 169 },
  'ES Troyes AC': { league: 'fra.1', id: 170 },
  'FC Lorient': { league: 'fra.1', id: 273 },
  'OGC Nice': { league: 'fra.1', id: 2502 },
  'Paris FC': { league: 'fra.1', id: 6851 },
  'Le Havre AC': { league: 'fra.1', id: 3236 },
  'Angers SCO': { league: 'fra.1', id: 7868 },
  'Toulouse FC': { league: 'fra.1', id: 179 },
  'AJ Auxerre': { league: 'fra.1', id: 172 },
  'RC Strasbourg Alsace': { league: 'fra.1', id: 180 },
  'RC Strasbourg': { league: 'fra.1', id: 180 },
  'FC Nantes': { league: 'fra.1', id: 165 },
  // Premier League
  'Brighton & Hove Albion FC': { league: 'eng.1', id: 331 },
  'Brighton & Hove Albion': { league: 'eng.1', id: 331 },
  'Arsenal FC': { league: 'eng.1', id: 359 },
  'Arsenal': { league: 'eng.1', id: 359 },
  'Brentford FC': { league: 'eng.1', id: 337 },
  'Brentford': { league: 'eng.1', id: 337 },
  'Everton FC': { league: 'eng.1', id: 368 },
  'Everton': { league: 'eng.1', id: 368 },
  'Hull City AFC': { league: 'eng.1', id: 306 },
  'Chelsea FC': { league: 'eng.1', id: 363 },
  'Chelsea': { league: 'eng.1', id: 363 },
  'Ipswich Town FC': { league: 'eng.1', id: 373 },
  'Manchester City FC': { league: 'eng.1', id: 382 },
  'Manchester City': { league: 'eng.1', id: 382 },
  'Leeds United FC': { league: 'eng.1', id: 357 },
  'Liverpool FC': { league: 'eng.1', id: 364 },
  'Liverpool': { league: 'eng.1', id: 364 },
  'Newcastle United FC': { league: 'eng.1', id: 361 },
  'Newcastle United': { league: 'eng.1', id: 361 },
  'Fulham FC': { league: 'eng.1', id: 370 },
  'Fulham': { league: 'eng.1', id: 370 },
  'AFC Bournemouth': { league: 'eng.1', id: 349 },
  'Sunderland AFC': { league: 'eng.1', id: 366 },
  'Nottingham Forest FC': { league: 'eng.1', id: 393 },
  'Nottingham Forest': { league: 'eng.1', id: 393 },
  'Crystal Palace FC': { league: 'eng.1', id: 384 },
  'Crystal Palace': { league: 'eng.1', id: 384 },
  'Manchester United FC': { league: 'eng.1', id: 360 },
  'Manchester United': { league: 'eng.1', id: 360 },
  'Coventry City FC': { league: 'eng.1', id: 388 },
  'Tottenham Hotspur FC': { league: 'eng.1', id: 367 },
  'Tottenham Hotspur': { league: 'eng.1', id: 367 },
  'Aston Villa FC': { league: 'eng.1', id: 362 },
  'Aston Villa': { league: 'eng.1', id: 362 },
  'Wolverhampton Wanderers': { league: 'eng.1', id: 380 },
  // La Liga
  'FC Barcelona': { league: 'esp.1', id: 83 },
  'Real Madrid CF': { league: 'esp.1', id: 86 },
  'Real Madrid': { league: 'esp.1', id: 86 },
  'Sevilla FC': { league: 'esp.1', id: 243 },
  'Real Betis Balompié': { league: 'esp.1', id: 244 },
  'Real Betis': { league: 'esp.1', id: 244 },
  'Deportivo Alavés': { league: 'esp.1', id: 96 },
  'Club Atlético de Madrid': { league: 'esp.1', id: 1068 },
  'Atlético de Madrid': { league: 'esp.1', id: 1068 },
  'CA Osasuna': { league: 'esp.1', id: 97 },
  'RCD Espanyol de Barcelona': { league: 'esp.1', id: 88 },
  'Getafe CF': { league: 'esp.1', id: 2922 },
  'Villarreal CF': { league: 'esp.1', id: 102 },
  'RC Deportivo La Coruña': { league: 'esp.1', id: 90 },
  'Real Racing Club de Santander': { league: 'esp.1', id: 87 },
  'Rayo Vallecano de Madrid': { league: 'esp.1', id: 101 },
  'RC Celta de Vigo': { league: 'esp.1', id: 85 },
  'Celta Vigo': { league: 'esp.1', id: 85 },
  'Valencia CF': { league: 'esp.1', id: 94 },
  'Málaga CF': { league: 'esp.1', id: 99 },
  'Levante UD': { league: 'esp.1', id: 1538 },
  'Elche CF': { league: 'esp.1', id: 3751 },
  'Athletic Club': { league: 'esp.1', id: 93 },
  'Real Sociedad de Fútbol': { league: 'esp.1', id: 89 },
  'Real Sociedad': { league: 'esp.1', id: 89 },
  'Girona FC': { league: 'esp.1', id: 9812 },
  // Bundesliga
  '1. FC Köln': { league: 'ger.1', id: 122 },
  '1. FC Union Berlin': { league: 'ger.1', id: 598 },
  '1. FSV Mainz 05': { league: 'ger.1', id: 2950 },
  'TSG 1899 Hoffenheim': { league: 'ger.1', id: 7911 },
  'Bayer 04 Leverkusen': { league: 'ger.1', id: 131 },
  'Bayer Leverkusen': { league: 'ger.1', id: 131 },
  'FC Bayern München': { league: 'ger.1', id: 132 },
  'Bayern München': { league: 'ger.1', id: 132 },
  'Borussia Mönchengladbach': { league: 'ger.1', id: 268 },
  'Borussia Dortmund': { league: 'ger.1', id: 124 },
  'Eintracht Frankfurt': { league: 'ger.1', id: 125 },
  'FC Augsburg': { league: 'ger.1', id: 3841 },
  'FC Schalke 04': { league: 'ger.1', id: 133 },
  'Hamburger SV': { league: 'ger.1', id: 127 },
  'RB Leipzig': { league: 'ger.1', id: 11420 },
  'SC Freiburg': { league: 'ger.1', id: 126 },
  'SC Paderborn 07': { league: 'ger.1', id: 3307 },
  'SV 07 Elversberg': { league: 'ger.1', id: 10388 },
  'VfB Stuttgart': { league: 'ger.1', id: 134 },
  'SV Werder Bremen': { league: 'ger.1', id: 137 },
  'Werder Bremen': { league: 'ger.1', id: 137 },
  'VfL Wolfsburg': { league: 'ger.1', id: 138 },
  // Serie A
  'AS Roma': { league: 'ita.1', id: 104 },
  'FC Internazionale Milano': { league: 'ita.1', id: 110 },
  'Inter Milan': { league: 'ita.1', id: 110 },
  'SSC Napoli': { league: 'ita.1', id: 114 },
  'US Lecce': { league: 'ita.1', id: 113 },
  'AC Milan': { league: 'ita.1', id: 103 },
  'Atalanta BC': { league: 'ita.1', id: 105 },
  'Cagliari Calcio': { league: 'ita.1', id: 2925 },
  'Juventus FC': { league: 'ita.1', id: 111 },
  'Juventus': { league: 'ita.1', id: 111 },
  'SS Lazio': { league: 'ita.1', id: 112 },
  'Como 1907': { league: 'ita.1', id: 2572 },
  'Udinese Calcio': { league: 'ita.1', id: 118 },
  'US Sassuolo Calcio': { league: 'ita.1', id: 3997 },
  'Torino FC': { league: 'ita.1', id: 239 },
  'Bologna FC 1909': { league: 'ita.1', id: 107 },
  'Frosinone Calcio': { league: 'ita.1', id: 4057 },
  'Parma Calcio 1913': { league: 'ita.1', id: 115 },
  'Genoa CFC': { league: 'ita.1', id: 3263 },
  'Venezia FC': { league: 'ita.1', id: 17530 },
  'AC Monza': { league: 'ita.1', id: 4007 },
  'ACF Fiorentina': { league: 'ita.1', id: 109 },
};

// ── Modèle BTTS ──────────────────────────────────────────────────────────────
function computeBTTS(homeMatches, awayMatches, homeId, awayId) {
  if (!homeMatches.length || !awayMatches.length) return null;

  const avg = (arr, fn) => arr.length ? arr.reduce((s, m) => s + fn(m), 0) / arr.length : null;
  const rate = (arr, fn) => arr.length ? arr.filter(fn).length / arr.length : null;

  // Matchs par contexte (dom/ext)
  const homeAsHome = homeMatches.filter(m => m.homeId === homeId);
  const awayAsAway = awayMatches.filter(m => m.awayId === awayId);
  if (!homeAsHome.length || !awayAsAway.length) return null;

  // λ Poisson (buts attendus dans ce match)
  const home_gf_asHome    = avg(homeAsHome, m => m.scoreHome);   // home marque à domicile
  const away_ga_asAway    = avg(awayAsAway, m => m.scoreHome);   // home concédé par away quand il joue à l'ext
  const away_gf_asAway    = avg(awayAsAway, m => m.scoreAway);   // away marque en déplacement
  const home_ga_asHome    = avg(homeAsHome, m => m.scoreAway);   // home concède à domicile

  const lambda_home = (home_gf_asHome + away_ga_asAway) / 2;
  const lambda_away = (away_gf_asAway + home_ga_asHome) / 2;
  const p_home = 1 - Math.exp(-lambda_home);
  const p_away = 1 - Math.exp(-lambda_away);
  const btts_poisson = p_home * p_away;

  // Taux BTTS historiques par contexte
  const btts_home_asHome = rate(homeAsHome, m => m.scoreHome > 0 && m.scoreAway > 0);
  const btts_away_asAway = rate(awayAsAway, m => m.scoreAway > 0 && m.scoreHome > 0);

  // H2H BTTS
  const h2h = homeMatches.filter(m => m.homeId === awayId || m.awayId === awayId);
  const btts_h2h = h2h.length >= 2 ? rate(h2h, m => m.scoreHome > 0 && m.scoreAway > 0) : null;

  // Formule pondérée (renormalisée si H2H absent)
  const components = [
    { label: 'Modèle Poisson',          value: btts_poisson,    weight: 0.50 },
    { label: `BTTS dom (${homeAsHome.length}J)`, value: btts_home_asHome, weight: 0.20 },
    { label: `BTTS ext (${awayAsAway.length}J)`, value: btts_away_asAway, weight: 0.20 },
    ...(btts_h2h != null ? [{ label: `H2H (${h2h.length} matchs)`, value: btts_h2h, weight: 0.10 }] : []),
  ].filter(c => c.value != null);

  const totalW = components.reduce((s, c) => s + c.weight, 0);
  const score  = components.reduce((s, c) => s + c.value * (c.weight / totalW), 0);

  return {
    prob: Math.round(score * 100),
    components: components.map(c => ({ ...c, pct: Math.round(c.value * 100), normalizedW: +(c.weight / totalW).toFixed(2) })),
    lambda_home: +lambda_home.toFixed(2),
    lambda_away: +lambda_away.toFixed(2),
    p_home: Math.round(p_home * 100),
    p_away: Math.round(p_away * 100),
  };
}

// Fallback : calcul BTTS depuis les stats statiques du fixture (goalsFor/Against + h2h)
function computeStaticBTTS(fixture) {
  const h = fixture?.home;
  const a = fixture?.away;
  if (!h?.goalsFor || !a?.goalsFor) return null;

  const rate = (arr, fn) => arr.length ? arr.filter(fn).length / arr.length : null;

  const lambda_home = ((h.goalsFor / h.played) + (a.goalsAgainst / a.played)) / 2;
  const lambda_away = ((a.goalsFor / a.played) + (h.goalsAgainst / h.played)) / 2;
  const p_home = 1 - Math.exp(-lambda_home);
  const p_away = 1 - Math.exp(-lambda_away);
  const btts_poisson = p_home * p_away;

  const h2h = (fixture.h2h || []).filter(m => m.scoreHome != null && m.scoreAway != null);
  const btts_h2h = h2h.length >= 2 ? rate(h2h, m => m.scoreHome > 0 && m.scoreAway > 0) : null;

  const components = [
    { label: 'Modèle Poisson', value: btts_poisson, weight: 0.80 },
    ...(btts_h2h != null ? [{ label: `H2H (${h2h.length} matchs)`, value: btts_h2h, weight: 0.20 }] : []),
  ].filter(c => c.value != null);

  const totalW = components.reduce((s, c) => s + c.weight, 0);
  const score  = components.reduce((s, c) => s + c.value * (c.weight / totalW), 0);

  return {
    prob: Math.round(score * 100),
    components: components.map(c => ({ ...c, pct: Math.round(c.value * 100), normalizedW: +(c.weight / totalW).toFixed(2) })),
    lambda_home: +lambda_home.toFixed(2),
    lambda_away: +lambda_away.toFixed(2),
    p_home: Math.round(p_home * 100),
    p_away: Math.round(p_away * 100),
    isStatic: true,
  };
}

// CDM : même formule attaque/défense normalisée que le backend (computeLambdas).
// avgGF/avgGA = moyennes du pool CDM actuel, fetchées via /api/football/cdm/poolavg.
const CDM_LEAGUE_AVG = 1.30;
const CDM_HOME_ADV   = 1.10;
// Hôtes Mondial 2026 — seules ces 3 sélections ont un vrai avantage du terrain en phase de poules,
// même logique que CDM_HOST_NATIONS côté backend (server.js, 25 juin 2026).
const CDM_HOST_NATIONS = new Set(['United States', 'Canada', 'Mexico']);
// Shrinkage petit échantillon — même formule que shrinkFactor backend (computeFootball.js).
const SHRINK_K = 5;
function shrinkFactor(rawFactor, games, k = SHRINK_K) {
  const confidence = games / (games + k);
  return 1 + (rawFactor - 1) * confidence;
}
function computeCdmBTTS(homeStats, awayStats, poolAvg = null, homeName = null) {
  if (homeStats?.goalsFor == null || awayStats?.goalsFor == null) return null;
  // poolAvg vient d'un fetch async (/api/football/cdm/poolavg?fixtureId=...) — tant qu'il n'est
  // pas arrivé, ne PAS retomber sur des constantes par défaut : ça produisait une proba fantôme
  // (ex. 74% au lieu de 67% réel) sur les tout premiers rendus, sauvegardée dans l'alerte avant
  // que la vraie moyenne gelée du match n'arrive, sans pouvoir être corrigée ensuite.
  if (!poolAvg) return null;

  const avgGF = poolAvg.avgGF;
  const avgGA = poolAvg.avgGA;
  const homeAdv = CDM_HOST_NATIONS.has(homeName) ? CDM_HOME_ADV : 1.0;

  // Facteurs attaque/défense normalisés — identique au backend (computeLambdas), aucun
  // facteur en plus (repos/blessures) : sinon ce % diverge de celui qui déclenche les alertes.
  const homeAttack  = shrinkFactor(homeStats.goalsFor  / avgGF, homeStats.games  || 0);
  const homeDefense = shrinkFactor(homeStats.goalsAgainst / avgGA, homeStats.games || 0);
  const awayAttack  = shrinkFactor(awayStats.goalsFor   / avgGF, awayStats.games  || 0);
  const awayDefense = shrinkFactor(awayStats.goalsAgainst / avgGA, awayStats.games || 0);

  const lambda_home = homeAttack * awayDefense * CDM_LEAGUE_AVG * homeAdv;
  const lambda_away = awayAttack * homeDefense * CDM_LEAGUE_AVG / homeAdv;

  const p_home = 1 - Math.exp(-lambda_home);
  const p_away = 1 - Math.exp(-lambda_away);
  // BTTS via la grille Dixon-Coles (même calcul que computeBTTSProb backend) plutôt que le produit
  // indépendant p_home*p_away — sinon ce % diverge de celui qui a déclenché l'alerte.
  const grid = computeScoreGrid(lambda_home, lambda_away, DIXON_COLES_RHO);
  let btts_poisson = 0;
  for (let i = 1; i < grid.length; i++) for (let j = 1; j < grid.length; j++) btts_poisson += grid[i][j];

  return {
    prob: Math.round(btts_poisson * 100),
    components: [{ label: 'Modèle Poisson (attaque/défense normalisé pool CDM, corrélation Dixon-Coles)', value: btts_poisson, pct: Math.round(btts_poisson * 100), normalizedW: 1 }],
    lambda_home: +lambda_home.toFixed(2),
    lambda_away: +lambda_away.toFixed(2),
    p_home: Math.round(p_home * 100),
    p_away: Math.round(p_away * 100),
    isStatic: true,
    isCdm: true,
  };
}

// PMF Poisson : P(X=k) = e^-λ · λ^k / k!
function poissonPmf(lambda, k) {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return Math.exp(-lambda) * Math.pow(lambda, k) / f;
}

// Correction Dixon-Coles — même grille que backend/computeFootball.js (dixonColesTau/computeScoreGrid),
// dupliquée ici faute de pouvoir importer un module backend côté client. rho=0 (défaut de computeOU/
// compute1X2 ci-dessous) retombe exactement sur l'indépendance pure — comportement inchangé pour les
// modèles 5-ligues/statique (computeBTTS/computeStaticBTTS), qui n'ont jamais prétendu être identiques
// au backend (λ dérivé différemment). Seul le chemin CDM (computeCdmBTTS, λ identique au backend) active
// rho=DIXON_COLES_RHO, pour rester cohérent avec la probabilité qui a généré l'alerte.
const DIXON_COLES_RHO = 0.10;
function dixonColesTau(x, y, lambdaHome, lambdaAway, rho) {
  if (!rho) return 1;
  if (x === 0 && y === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (x === 0 && y === 1) return 1 + lambdaHome * rho;
  if (x === 1 && y === 0) return 1 + lambdaAway * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}
function computeScoreGrid(lambdaHome, lambdaAway, rho, kMax = 10) {
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
  if (total > 0) for (let i = 0; i <= kMax; i++) for (let j = 0; j <= kMax; j++) grid[i][j] /= total;
  return grid;
}

// P(Over/Under "line" buts) — réutilise λ_home/λ_away du modèle BTTS (même base Poisson)
function computeOU(lambda_home, lambda_away, line, rho = 0) {
  if (lambda_home == null || lambda_away == null) return null;
  const lambda_total = lambda_home + lambda_away;
  const kMax = 10;
  const grid = computeScoreGrid(lambda_home, lambda_away, rho, kMax);
  const threshold = Math.floor(line); // 1.5 → 1, 2.5 → 2
  let pUnder = 0;
  for (let i = 0; i <= kMax; i++) for (let j = 0; j <= kMax; j++) if (i + j <= threshold) pUnder += grid[i][j];
  const pOver = 1 - pUnder;
  return { lambda_total: +lambda_total.toFixed(2), over: Math.round(pOver * 100), under: Math.round(pUnder * 100) };
}

// P(une équipe seule marque plus/moins de "line" buts) — 7 septembre 2026, marché "Total de buts par
// équipe" (observation, pas encore d'alerte réelle — cf. server.js computeTeamGoalsProb, même formule).
// Marginale d'une équipe dérivée de la même grille Dixon-Coles que BTTS/O-U (pas un Poisson brut isolé).
function computeTeamGoals(lambda_home, lambda_away, line, side, rho = 0) {
  if (lambda_home == null || lambda_away == null) return null;
  const kMax = 10;
  const grid = computeScoreGrid(lambda_home, lambda_away, rho, kMax);
  const threshold = Math.floor(line); // 0.5 → 0, 1.5 → 1, 2.5 → 2
  const marginal = new Array(kMax + 1).fill(0);
  for (let i = 0; i <= kMax; i++) for (let j = 0; j <= kMax; j++) marginal[side === 'home' ? i : j] += grid[i][j];
  let pUnder = 0;
  for (let k = 0; k <= threshold; k++) pUnder += marginal[k];
  const pOver = 1 - pUnder;
  return { over: Math.round(pOver * 100), under: Math.round(pUnder * 100) };
}

// P(DC & BTTS) et P(DC & Over line) — même grille Dixon-Coles que les autres calculs CDM
function computeDCBTTS(lambda_home, lambda_away, rho = 0) {
  if (lambda_home == null || lambda_away == null) return null;
  const grid = computeScoreGrid(lambda_home, lambda_away, rho);
  let p1x = 0, px2 = 0, p12 = 0;
  for (let i = 1; i < grid.length; i++) {
    for (let j = 1; j < grid.length; j++) {
      const p = grid[i][j];
      if (i >= j) p1x += p;
      if (i <= j) px2 += p;
      if (i !== j) p12 += p;
    }
  }
  return { p1x: +(p1x * 100).toFixed(1), px2: +(px2 * 100).toFixed(1), p12: +(p12 * 100).toFixed(1) };
}

function computeDCOver(lambda_home, lambda_away, line, rho = 0) {
  if (lambda_home == null || lambda_away == null) return null;
  const kMax = 10;
  const grid = computeScoreGrid(lambda_home, lambda_away, rho, kMax);
  const threshold = Math.floor(line);
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
  return { p1x: +(p1x * 100).toFixed(1), px2: +(px2 * 100).toFixed(1), p12: +(p12 * 100).toFixed(1) };
}

// P(victoire dom. / nul / victoire ext.) — grille Poisson (Dixon-Coles si rho>0, même base que compute1X2Probs backend)
function compute1X2(lambda_home, lambda_away, kMax = 10, rho = 0) {
  if (lambda_home == null || lambda_away == null) return null;
  const grid = computeScoreGrid(lambda_home, lambda_away, rho, kMax);
  let pHome = 0, pDraw = 0, pAway = 0;
  for (let i = 0; i <= kMax; i++) {
    for (let j = 0; j <= kMax; j++) {
      const p = grid[i][j];
      if (i > j) pHome += p;
      else if (i === j) pDraw += p;
      else pAway += p;
    }
  }
  const MAX_PROB = 80; // plafond — même valeur que FB_RESULT_MAX_PROB backend (server.js)
  return {
    pHome: Math.min(Math.round(pHome * 100), MAX_PROB),
    pDraw: Math.min(Math.round(pDraw * 100), MAX_PROB),
    pAway: Math.min(Math.round(pAway * 100), MAX_PROB),
  };
}

function BTTSSection({ result, home, away, marketOdds }) {
  if (!result) return null;

  const { prob, components, lambda_home, lambda_away, p_home, p_away } = result;
  const color = prob >= 62 ? '#10b981' : prob >= 52 ? '#f59e0b' : '#ef4444';
  const verdict = prob >= 62 ? 'Favorable — BTTS Oui' : prob >= 52 ? 'Incertain — à surveiller' : 'Défavorable — BTTS Non';

  // Probabilité implicite marché (Pinnacle, vig retirée)
  let marketProb = null;
  const pinn = marketOdds?.btts?.bookmakers?.pinnacle;
  if (pinn?.yes && pinn?.no) {
    const vig = 1 / pinn.yes + 1 / pinn.no;
    marketProb = Math.round((1 / pinn.yes / vig) * 100);
  }

  const edge = marketProb != null ? prob - marketProb : null;

  return (
    <section className="detail-card compact-card">
      <h2 className="card-title">Analyse BTTS</h2>

      {/* Score principal */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', marginBottom: '1rem' }}>
        <div style={{ fontSize: '2.8rem', fontWeight: 900, color, lineHeight: 1, letterSpacing: '-0.04em' }}>{prob}%</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color }}>{verdict}</div>
          {marketProb != null && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              Marché Pinnacle : <b style={{ color: 'var(--text-sub)' }}>{marketProb}%</b>
              {edge != null && (
                <span style={{ marginLeft: 6, color: edge >= 3 ? '#10b981' : edge <= -3 ? '#ef4444' : '#9ca3af', fontWeight: 700 }}>
                  ({edge >= 0 ? '+' : ''}{edge}% edge)
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Barre visuelle */}
      <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.08)', marginBottom: '1rem', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${prob}%`, background: color, borderRadius: 99, transition: 'width 0.6s ease' }} />
      </div>

      {/* Composantes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.75rem' }}>
        {components.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 11 }}>
            <span style={{ color: 'var(--text-dim)', flex: 1 }}>{c.label}</span>
            <div style={{ width: 80, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${c.pct}%`, background: c.pct >= 60 ? '#10b981' : c.pct >= 50 ? '#f59e0b' : '#ef4444', borderRadius: 99 }} />
            </div>
            <span style={{ fontWeight: 700, color: 'var(--text)', minWidth: 30, textAlign: 'right' }}>{c.pct}%</span>
            <span style={{ color: 'var(--text-dim)', minWidth: 38, textAlign: 'right' }}>×{c.normalizedW}</span>
          </div>
        ))}
        {/* Slot xG — Pro plan */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 11, opacity: 0.4 }}>
          <span style={{ color: 'var(--text-dim)', flex: 1 }}>xG Poisson (Pro)</span>
          <div style={{ width: 80, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ fontWeight: 700, color: 'var(--text-dim)', minWidth: 30, textAlign: 'right' }}>—</span>
          <span style={{ color: 'var(--text-dim)', minWidth: 38, textAlign: 'right' }}>×—</span>
        </div>
      </div>

      {/* λ et P(marque) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', padding: '0.6rem', background: 'rgba(255,255,255,0.04)', borderRadius: 8, fontSize: 11 }}>
        <div>
          <span style={{ color: 'var(--text-dim)' }}>{home.short} </span>
          <span style={{ color: 'var(--text-sub)' }}>λ={lambda_home} → </span>
          <span style={{ fontWeight: 700, color: p_home >= 60 ? '#10b981' : '#f59e0b' }}>P(marque) {p_home}%</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-dim)' }}>{away.short} </span>
          <span style={{ color: 'var(--text-sub)' }}>λ={lambda_away} → </span>
          <span style={{ fontWeight: 700, color: p_away >= 60 ? '#10b981' : '#f59e0b' }}>P(marque) {p_away}%</span>
        </div>
      </div>

      <div style={{ marginTop: '0.5rem', fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic' }}>
        Basé sur les 30 derniers matchs · Poisson + taux BTTS contextuels
      </div>
    </section>
  );
}

// ── Football Odds Box ─────────────────────────────────────────────────────────
const FB_BK_LABELS = { pinnacle: 'Pinnacle', unibet: 'Unibet', betclic: 'Betclic' };
const FB_BK_COLORS = { unibet: '#1db954', betclic: '#e0292e' };
// Pinnacle en tête — réactivé en scraping le 25 juin 2026 (CDM uniquement, H2H seulement),
// affiché avec le style "REF" déjà prévu dans le rendu ci-dessous (isPinnacle).
const FB_BK_ORDER  = ['pinnacle', 'unibet', 'betclic'];

const BIG5_LEAGUES = new Set(['ligue1', 'pl', 'laliga', 'seriea', 'bundes']);

function FootballOddsBox({ markets, bttsResult, home, away, frozen, onRefresh, refreshing, lastRefreshed, fixtureLeague }) {
  const [tab, setTab] = useState('result');
  const [totalsLine, setTotalsLine] = useState('1.5');
  const [showLegend, setShowLegend] = useState(false);
  const [legendBox, setLegendBox] = useState(null); // { top, left }
  const cardRef = useRef(null);
  const legendRef = useRef(null);
  const legendBtnRef = useRef(null);
  const LEGEND_W = 250;
  // Mini popup "Vs Pinnacle" au clic sur une issue du widget Modèle 1X2 (25 juin 2026)
  const [edgePopupKey, setEdgePopupKey] = useState(null);
  const edgePopupRef = useRef(null);

  // Ferme la légende au clic en dehors
  useEffect(() => {
    if (!showLegend) return;
    const onDocClick = (e) => {
      if (legendRef.current?.contains(e.target) || legendBtnRef.current?.contains(e.target)) return;
      setShowLegend(false);
    };
    document.addEventListener('mousedown', onDocClick, true);
    return () => document.removeEventListener('mousedown', onDocClick, true);
  }, [showLegend]);

  // Ferme le popup Vs Pinnacle au clic en dehors, ou si on change d'onglet — écoute 'click' en
  // phase bubble (pas 'mousedown'/capture comme la légende) : chaque libellé d'issue fait son
  // propre stopPropagation, donc le clic qui OUVRE/BASCULE un popup ne remonte jamais jusqu'ici.
  useEffect(() => {
    if (!edgePopupKey) return;
    const onDocClick = (e) => { if (!edgePopupRef.current?.contains(e.target)) setEdgePopupKey(null); };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [edgePopupKey]);
  useEffect(() => { setEdgePopupKey(null); }, [tab]);

  // Positionne la légende dans la marge à droite de la carte, suit le scroll/resize
  useEffect(() => {
    if (!showLegend) return;
    const update = () => {
      if (!cardRef.current) return;
      const r = cardRef.current.getBoundingClientRect();
      const gutterCenter = r.right + (window.innerWidth - r.right) / 2;
      setLegendBox({ top: r.top, left: gutterCenter - LEGEND_W / 2 });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [showLegend]);

  const h2h    = markets?.h2h;
  const tots   = markets?.totals;
  const btts   = markets?.btts;
  const dcbtts = markets?.dcbtts;
  const dcou   = markets?.dcou;
  // Total de buts par équipe (7 septembre 2026) — marché "observation", pas encore d'alerte réelle
  // (cf. server.js generateBackgroundAlerts, section football). Affiché ici à côté de "Buts" sur
  // demande explicite utilisateur, uniquement pour consultation (cotes réelles + estimation modèle).
  const teamGoals = markets?.teamTotals;

  const hasDcBtts = !!(dcbtts?.bookmakers);
  const hasDcOu   = !!(dcou?.bookmakers);
  const hasDC = hasDcBtts || hasDcOu;
  const hasTeamGoals = !!(teamGoals?.bookmakers);

  const availBks = FB_BK_ORDER.filter(bk =>
    h2h?.bookmakers?.[bk] || tots?.bookmakers?.[bk] || btts?.bookmakers?.[bk]
  );
  const availDcBks = bk => FB_BK_ORDER.filter(b =>
    (bk === 'dc_btts' ? dcbtts?.bookmakers?.[b] : dcou?.bookmakers?.[b])
  ).filter(b => b !== 'pinnacle');

  // Toggle limité aux 2 lignes standards (1er septembre 2026, demande explicite) — avant ce fix,
  // toute ligne exotique que Pinnacle scrape parfois (3, 2.25, 3.25...) ajoutait son propre bouton
  // au toggle, en plus de 1,5/2,5. Combiné au fix précédent (Pinnacle "—" si sa ligne ne correspond
  // pas au toggle sélectionné), une ligne Pinnacle non-standard n'a plus besoin d'un bouton dédié —
  // elle affiche juste "—" sur les 2 lignes standards, comme n'importe quel bookmaker sans cette ligne.
  const availTotalsLines = ['1.5', '2.5'];

  const TABS = [
    { id: 'result', label: 'Résultat' },
    { id: 'buts',   label: 'Buts'     },
    ...(hasTeamGoals ? [{ id: 'team_goals', label: 'Buts par équipe' }] : []),
    { id: 'btts',   label: 'BTTS'     },
    ...(hasDcBtts ? [{ id: 'dc_btts', label: 'Double chance & BTTS' }] : []),
    ...(hasDcOu   ? [{ id: 'dc_ou',   label: 'Double chance & Over 1,5' }] : []),
  ];

  const tabStyle = id => ({
    padding: '0.25rem 0.75rem', borderRadius: 5, border: '1px solid', cursor: 'pointer',
    fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
    background: tab === id ? 'rgba(74,222,128,0.25)' : 'rgba(74,222,128,0.08)',
    color: '#ffffff',
    borderColor: tab === id ? 'rgba(74,222,128,0.55)' : 'rgba(74,222,128,0.22)',
    boxShadow: '0 0 0 1px rgba(255,255,255,0.22)',
    transition: 'background 0.15s, border-color 0.15s',
  });

  const ch = { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', textAlign: 'center', letterSpacing: '0.05em' };

  const fairH2H = h2h?.bookmakers?.pinnacle ? (() => {
    const p = h2h.bookmakers.pinnacle;
    const s = 1/p.home + (p.draw ? 1/p.draw : 0) + 1/p.away;
    return { home: (1/p.home)/s, draw: p.draw ? (1/p.draw)/s : null, away: (1/p.away)/s };
  })() : null;

  const fairBtts = btts?.bookmakers?.pinnacle ? (() => {
    const p = btts.bookmakers.pinnacle;
    const s = 1/p.yes + 1/p.no;
    return { yes: (1/p.yes)/s, no: (1/p.no)/s };
  })() : null;

  // Pinnacle peut avoir une ligne différente du toggle (ex: 3.0 vs 2.5) — on utilise sa ligne
  // réelle comme référence, pas celle du toggle.
  const pinTotsBk = tots?.bookmakers?.pinnacle;
  const pinTotLine = pinTotsBk ? Object.keys(pinTotsBk)[0] : null;
  const fairTots = pinTotLine ? (() => {
    const p = pinTotsBk[pinTotLine];
    const s = 1/p.over + 1/p.under;
    return { over: (1/p.over)/s, under: (1/p.under)/s };
  })() : null;

  // ρ Dixon-Coles appliqué aussi côté snapshot (22 juillet 2026) — mêmes λ ET même ρ que le
  // backend = O/U (n'importe quelle ligne)/1X2/DC&BTTS/DC&Over recalculés ici tombent exactement
  // sur les mêmes probabilités que le modèle réel, sans avoir à stocker chaque marché séparément.
  const cdmRho = (bttsResult?.isCdm || bttsResult?.isSnapshot) ? DIXON_COLES_RHO : 0;
  const ouResult = bttsResult ? computeOU(bttsResult.lambda_home, bttsResult.lambda_away, parseFloat(totalsLine), cdmRho) : null;
  const result1X2 = bttsResult ? compute1X2(bttsResult.lambda_home, bttsResult.lambda_away, 10, cdmRho) : null;
  const dcBttsResult = bttsResult ? computeDCBTTS(bttsResult.lambda_home, bttsResult.lambda_away, cdmRho) : null;
  const dcOuResult   = bttsResult ? computeDCOver(bttsResult.lambda_home, bttsResult.lambda_away, 1.5, cdmRho) : null;

  // Fair 1X2 marché — parcourt availBks dans l'ordre (Pinnacle en tête depuis le 25 juin 2026,
  // CDM uniquement) et prend le 1er bookmaker avec les 3 cotes h2h complètes ; repli naturel sur
  // Unibet/Betclic/Winamax si Pinnacle absent (5 championnats, ou échec ponctuel du scraping).
  const fairMarket1X2 = (() => {
    for (const bk of availBks) {
      const h = h2h?.bookmakers?.[bk];
      if (h?.home && h?.draw && h?.away) {
        const s = 1/h.home + 1/h.draw + 1/h.away;
        return { home: (1/h.home)/s, draw: (1/h.draw)/s, away: (1/h.away)/s };
      }
    }
    return null;
  })();

  const calcEdge = (bkOdds, fair) => (bkOdds != null && fair != null) ? +((bkOdds * fair - 1) * 100).toFixed(1) : null;

  // Cell : importé de ../components/OddsCell (source unique avec BasketballDetailPage depuis le
  // 22 juin 2026 — avant ça, taille/écriture différaient des cotes basket). fairProb attend une
  // fraction 0-1 (le composant partagé multiplie par 100 lui-même), donc plus de ×100 ici.
  const Cell = ({ val, edgeVal, isPinnacle, color, fairPct, trend }) => (
    <OddsCell value={val} edge={edgeVal} isPinnacle={isPinnacle} color={color} fairProb={fairPct != null ? fairPct / 100 : null} trend={trend} />
  );

  const gridCols = tab === 'result' ? '80px 1fr 1fr 1fr'
                 : tab === 'buts'   ? '80px 44px 1fr 1fr'
                 : '80px 1fr 1fr';

  return (
    <div ref={cardRef}>
      {frozen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', fontSize: 10, fontWeight: 700, color: '#facc15' }}>
          <span style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.3)' }}>
            Cotes pré-match (figées)
          </span>
          <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>Dernières cotes connues avant le coup d'envoi</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.75rem', alignItems: 'center', position: 'relative' }}>
        {TABS.map(t => <button key={t.id} style={tabStyle(t.id)} onClick={() => setTab(t.id)}>{t.label}</button>)}
        {tab === 'buts' && (
          <div style={{ display: 'flex', gap: '0.3rem', marginLeft: 'auto' }}>
            {availTotalsLines.map(line => (
              <button
                key={line}
                onClick={() => setTotalsLine(line)}
                style={{
                  padding: '0.2rem 0.5rem', borderRadius: 5, border: '1px solid', cursor: 'pointer',
                  fontSize: 10, fontWeight: 700,
                  background: totalsLine === line ? 'rgba(251,146,60,0.25)' : 'rgba(251,146,60,0.08)',
                  color: '#ffffff',
                  borderColor: totalsLine === line ? 'rgba(251,146,60,0.55)' : 'rgba(251,146,60,0.22)',
                }}
              >
                {line}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, marginLeft: tab === 'buts' ? '0.3rem' : 'auto' }}>
          <button
            className={`icon-refresh-btn${refreshing ? ' spinning' : ''}`}
            onClick={onRefresh}
            disabled={refreshing}
            title="Rafraîchir les cotes"
          >↻</button>
          {lastRefreshed && (
            <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>
              {lastRefreshed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <span
          ref={legendBtnRef}
          onClick={() => setShowLegend(v => !v)}
          style={{
            width: 16, height: 16, borderRadius: '50%', fontSize: 10, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: showLegend ? '#fb923c' : 'var(--text-dim)', border: `1px solid ${showLegend ? 'rgba(251,146,60,0.5)' : 'var(--border)'}`,
            cursor: 'pointer', flexShrink: 0,
            marginLeft: '0.3rem',
          }}
        >?</span>
        {showLegend && legendBox && createPortal(
          <div ref={legendRef} style={{
            position: 'fixed', top: legendBox.top, left: legendBox.left, zIndex: 200,
            width: LEGEND_W, maxWidth: 'calc(100vw - 2rem)',
            background: 'var(--bg-card, #11141c)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '0.6rem 0.65rem', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            {(() => {
              const isBig5 = BIG5_LEAGUES.has(fixtureLeague);
              const Dot = ({ color }) => <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: color, marginRight: 4, marginTop: 3, flexShrink: 0 }} />;
              const Row = ({ color, children }) => (
                <span style={{ display: 'flex', alignItems: 'flex-start', fontSize: 9.5, lineHeight: 1.4 }}>
                  <Dot color={color} />
                  <span>{children}</span>
                </span>
              );
              const estimSite = (
                <>La mention <span style={{ color: '#fb923c', fontWeight: 700 }}>· estimation site</span> signale que ce % vient d'un modèle recalculé côté navigateur, plus simple que celui des alertes — peut légèrement différer du % qui aurait généré une alerte sur ce match. N'apparaît que si le backend n'a pas encore de projection fraîche pour ce match précis ; sinon (CDM, ou 5 grands championnats + Brésil) la page lit directement le vrai résultat du modèle, sans mention.</>
              );
              const estimSiteShort = <>La mention <span style={{ color: '#fb923c', fontWeight: 700 }}>· estimation site</span> n'apparaît que si le backend n'a pas encore de projection fraîche pour ce match précis.</>;
              // Format "Big Five" (1er septembre 2026, demande explicite utilisateur) — 🚨 + liste
              // "Infos" numérotée, propre à ces 5 championnats (seuils réellement actifs dessus,
              // recalibrés le 31 août). Volontairement différent du format à puces des autres ligues
              // (CDM/Brésil/coupes d'Europe, seuils globaux inchangés) plutôt qu'unifié en un seul style.
              const AlertLine = ({ children }) => <div style={{ fontSize: 9.5, lineHeight: 1.5 }}>🚨 {children}</div>;
              const Infos = ({ items }) => (
                <div style={{ marginTop: '0.5rem', fontSize: 9, lineHeight: 1.5, color: 'var(--text-dim)', borderTop: '1px solid var(--border)', paddingTop: '0.4rem' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '0.25rem' }}>Infos ⬇️📝</div>
                  <ol style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {items.map((it, i) => <li key={i} style={{ marginBottom: i < items.length - 1 ? '0.3rem' : 0 }}>{it}</li>)}
                  </ol>
                </div>
              );
              const BIG5_ALERTS = {
                result: (
                  <>
                    <AlertLine>Alerte si probabilité ≥ 70% par issue · Cote ≥ 1,50.</AlertLine>
                    <Infos items={[
                      <>Dans le widget <b>Modèle 1X2</b>, le <span style={{ color: '#4ade80', fontWeight: 700 }}>+Xpt</span>/<span style={{ color: '#f87171', fontWeight: 700 }}>−Xpt</span> indique l'écart entre la probabilité du modèle et celle du marché (cotes bookmaker, marge retirée) pour cette issue.</>,
                      estimSiteShort,
                    ]} />
                  </>
                ),
                buts: (
                  <>
                    <AlertLine>Alerte Over/Under 1,5 buts si probabilité ≥ 60% · Cote 1,30</AlertLine>
                    <AlertLine>Alerte Over/Under 2,5 buts si probabilité ≥ 65% · Cote 1,30</AlertLine>
                    <Infos items={[estimSiteShort]} />
                  </>
                ),
                btts: (
                  <>
                    <AlertLine>Alerte BTTS si probabilité ≥ 58% · Cote 1,50</AlertLine>
                    <Infos items={[estimSiteShort]} />
                  </>
                ),
                dc_btts: <AlertLine>Alerte DC &amp; BTTS si probabilité ≥ 50% · Cote ≥ 1,45</AlertLine>,
                dc_ou: <AlertLine>Alerte DC &amp; Over 1,5 buts si probabilité ≥ 45% · Cote ≥ 1,50</AlertLine>,
                team_goals: <div style={{ fontSize: 9.5, lineHeight: 1.5, color: 'var(--text-dim)' }}>📊 Marché en observation — les données s'accumulent (near-miss) mais aucune alerte réelle n'est encore générée dessus.</div>,
              };
              // Format Brésil (1er septembre 2026, demande explicite utilisateur, même style que
              // Big Five ci-dessus). Seuils recalibrés le 31 août — contrairement au Big Five, ce
              // n'est jamais le marché ENTIER qui change mais un SENS précis (le reste du marché
              // reste au seuil global, aucun edge trouvé dessus) — les 2 lignes 🚨 par marché
              // matérialisent ça plutôt que de le cacher dans une seule ligne moyenne.
              const BRESIL_ALERTS = {
                result: (
                  <>
                    <AlertLine>Alerte si probabilité ≥ 70% par issue · Cote ≥ 1,50.</AlertLine>
                    <Infos items={[
                      <>Dans le widget <b>Modèle 1X2</b>, le <span style={{ color: '#4ade80', fontWeight: 700 }}>+Xpt</span>/<span style={{ color: '#f87171', fontWeight: 700 }}>−Xpt</span> indique l'écart entre la probabilité du modèle et celle du marché (cotes bookmaker, marge retirée) pour cette issue.</>,
                      estimSiteShort,
                    ]} />
                  </>
                ),
                buts: (
                  <>
                    <AlertLine>Alerte Over/Under si probabilité ≥ 65% (ligne 2,5, sinon 1,5) · Cote ≥ 1,30</AlertLine>
                    <Infos items={[estimSiteShort]} />
                  </>
                ),
                btts: (
                  <>
                    <AlertLine>Alerte BTTS si probabilité ≥ 45% · Cote ≥ 1,40</AlertLine>
                    <Infos items={[estimSiteShort]} />
                  </>
                ),
                dc_btts: (
                  <>
                    <AlertLine>Alerte DC &amp; BTTS "1X" si probabilité ≥ 20% · Cote ≥ 1,40</AlertLine>
                    <AlertLine>Alerte DC &amp; BTTS "X2" si probabilité ≥ 50% · Cote ≥ 1,45</AlertLine>
                  </>
                ),
                dc_ou: <AlertLine>Alerte DC &amp; Over 1,5 buts si probabilité ≥ 55% · Cote ≥ 1,45</AlertLine>,
                team_goals: <div style={{ fontSize: 9.5, lineHeight: 1.5, color: 'var(--text-dim)' }}>📊 Marché en observation — les données s'accumulent (near-miss) mais aucune alerte réelle n'est encore générée dessus.</div>,
              };
              // Une seule ligne de marché affichée — celle de l'onglet ouvert — même principe que
              // OddsLegendCard côté basket (ALERTS[tab]), demande explicite utilisateur après la 1ère
              // version qui empilait les 5 marchés d'un coup peu importe l'onglet actif.
              const ALERTS = {
                result: {
                  row: (
                    <Row color="#00ff80">
                      <b style={{ color: '#00ff80' }}>Résultat 1X2</b> — ≥ 70% par issue (dom./nul/ext., indépendantes) · cote ≥ 1,50
                    </Row>
                  ),
                  extra: (
                    <>
                      Dans le widget <b>Modèle 1X2</b>, le <span style={{ color: '#4ade80', fontWeight: 700 }}>+Xpt</span>/<span style={{ color: '#f87171', fontWeight: 700 }}>−Xpt</span> indique l'écart entre la probabilité du modèle et celle du marché (cotes bookmaker, marge retirée) pour cette issue — rien à voir avec les flèches ▲▼ de tendance de cote vues ailleurs sur cette page.
                      <br /><br />
                      {estimSite}
                    </>
                  ),
                },
                buts: {
                  row: (
                    <Row color="#00ff80">
                      <b style={{ color: '#00ff80' }}>Total Over/Under</b> — ≥ 65% (ligne 2,5, sinon 1,5) · cote ≥ 1,30
                    </Row>
                  ),
                  extra: estimSite,
                },
                btts: {
                  row: (
                    <Row color="#00ff80">
                      <b style={{ color: '#00ff80' }}>BTTS Oui</b> — ≥ 70% · cote ≥ 1,60
                    </Row>
                  ),
                  extra: estimSite,
                },
                dc_btts: {
                  row: (
                    <Row color="#f59e0b">
                      <b style={{ color: '#f59e0b' }}>DC &amp; BTTS</b> — ≥ 50% · cote ≥ 1,45
                    </Row>
                  ),
                  extra: <>Les % du modèle sont affichés directement dans cet onglet — pas besoin d'ouvrir le near-miss pour les voir.</>,
                },
                dc_ou: {
                  row: (
                    <Row color="#f59e0b">
                      <b style={{ color: '#f59e0b' }}>DC &amp; Over 1,5</b> — ≥ 55% · cote ≥ 1,45
                    </Row>
                  ),
                  extra: <>Les % du modèle sont affichés directement dans cet onglet — pas besoin d'ouvrir le near-miss pour les voir.</>,
                },
                team_goals: {
                  row: (
                    <Row color="#60a5fa">
                      <b style={{ color: '#60a5fa' }}>Total de buts par équipe</b> — marché en observation, pas d'alerte
                    </Row>
                  ),
                  extra: <>Les données s'accumulent en arrière-plan (near-miss) pour calibrer un seuil fiable avant d'activer de vraies alertes dessus.</>,
                },
              };
              if (isBig5 || fixtureLeague === 'bresil') {
                const activeAlerts = isBig5 ? BIG5_ALERTS : BRESIL_ALERTS;
                return (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>
                      Envoi des alertes — Football
                    </div>
                    {activeAlerts[tab] ?? activeAlerts.result}
                  </>
                );
              }
              const current = ALERTS[tab] ?? ALERTS.result;
              return (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', marginBottom: '0.4rem' }}>
                    Envoi des alertes — Football
                  </div>
                  <div style={{ fontSize: 9, lineHeight: 1.4, color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
                    Un modèle de Poisson estime les buts attendus de chaque équipe à partir de leurs stats récentes.
                  </div>
                  <div style={{ marginBottom: '0.5rem' }}>
                    {current.row}
                  </div>
                  <div style={{ fontSize: 9, lineHeight: 1.5, color: 'var(--text-dim)', borderTop: '1px solid var(--border)', paddingTop: '0.4rem' }}>
                    {current.extra}
                    <br /><br />
                    Cotes comparées : Unibet/Betclic uniquement (Winamax exclu). Générées automatiquement toutes les 20 min — pas besoin d'ouvrir cette page.
                  </div>
                </>
              );
            })()}
          </div>,
          document.body
        )}
      </div>

      {tab === 'result' && (
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '0 0.25rem', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border)', marginBottom: '0.2rem' }}>
          <div /><div style={ch}>1</div><div style={ch}>N</div><div style={ch}>2</div>
        </div>
      )}
      {tab === 'buts' && (
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '0 0.25rem', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border)', marginBottom: '0.2rem' }}>
          <div /><div style={ch}>Total</div><div style={ch}>Over</div><div style={ch}>Under</div>
        </div>
      )}
      {tab === 'btts' && (
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '0 0.25rem', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border)', marginBottom: '0.2rem' }}>
          <div /><div style={ch}>Oui</div><div style={ch}>Non</div>
        </div>
      )}

      {!['dc','dc_btts','dc_ou','team_goals'].includes(tab) && availBks.map(bk => {
        const isPinnacle = bk === 'pinnacle';
        const color = isPinnacle ? undefined : FB_BK_COLORS[bk];
        const h = h2h?.bookmakers?.[bk];
        // Pinnacle suit désormais le toggle 1,5/2,5 comme les autres bookmakers (1er septembre
        // 2026, demande explicite) — avant ce fix, sa ligne "réelle" (pinTotLine, la seule dispo)
        // s'affichait toujours telle quelle, y compris quand le toggle sélectionnait l'autre ligne,
        // donnant l'impression que le clic sur 1,5/2,5 n'avait aucun effet sur Pinnacle. Si Pinnacle
        // n'a pas la ligne sélectionnée, sa ligne affiche "—" comme Unibet/Betclic dans le même cas
        // — fairTots/pinTotLine (widget "Vs Pinnacle" plus bas) restent inchangés, sur la vraie
        // ligne Pinnacle, indépendants de ce toggle d'affichage.
        const t = tots?.bookmakers?.[bk]?.[totalsLine];
        const tLine = totalsLine;
        const b = btts?.bookmakers?.[bk];
        return (
          <div key={bk} style={{
            display: 'grid', gridTemplateColumns: gridCols, gap: '0 0.25rem', alignItems: 'center',
            padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
            background: isPinnacle ? 'rgba(255,255,255,0.03)' : 'transparent',
          }}>
            <span style={{ fontSize: 11, fontWeight: isPinnacle ? 700 : 400, color: isPinnacle ? '#60a5fa' : 'var(--text)' }}>
              {FB_BK_LABELS[bk] ?? bk}
            </span>
            {tab === 'result' && <>
              <Cell val={h?.home}  edgeVal={null} isPinnacle={isPinnacle} color={color} trend={h2h?.trends?.[bk]?.home} />
              <Cell val={h?.draw}  edgeVal={null} isPinnacle={isPinnacle} color={color} trend={h2h?.trends?.[bk]?.draw} />
              <Cell val={h?.away}  edgeVal={null} isPinnacle={isPinnacle} color={color} trend={h2h?.trends?.[bk]?.away} />
            </>}
            {tab === 'buts' && <>
              <div style={{ textAlign: 'center', fontSize: 11, fontVariantNumeric: 'tabular-nums', fontWeight: isPinnacle ? 700 : 400, color: 'var(--text)' }}>
                {(t?.over != null || t?.under != null) ? tLine : '—'}
              </div>
              <Cell val={t?.over}  edgeVal={null} isPinnacle={isPinnacle} color={color} trend={tots?.trends?.[bk]?.[totalsLine]?.over} />
              <Cell val={t?.under} edgeVal={null} isPinnacle={isPinnacle} color={color} trend={tots?.trends?.[bk]?.[totalsLine]?.under} />
            </>}
            {tab === 'btts' && <>
              <Cell val={b?.yes} edgeVal={fairBtts ? calcEdge(b?.yes, fairBtts.yes) : null} isPinnacle={isPinnacle} color={color} fairPct={fairBtts ? fairBtts.yes * 100 : null} trend={btts?.trends?.[bk]?.yes} />
              <Cell val={b?.no}  edgeVal={fairBtts ? calcEdge(b?.no,  fairBtts.no)  : null} isPinnacle={isPinnacle} color={color} fairPct={fairBtts ? fairBtts.no * 100  : null} trend={btts?.trends?.[bk]?.no} />
            </>}
          </div>
        );
      })}

      {!['dc_btts','dc_ou','team_goals'].includes(tab) && availBks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--text-dim)', fontSize: 12 }}>Cotes indisponibles</div>
      )}

      {(tab === 'dc_btts' || tab === 'dc_ou') && (() => {
        const bks = availDcBks(tab);
        const mkt = tab === 'dc_btts' ? dcbtts : dcou;
        const dcGridCols = `1fr${bks.map(() => ' 48px').join('')}`;
        const DcRow = ({ label, vals }) => (
          <div style={{ display: 'grid', gridTemplateColumns: dcGridCols, gap: '0 0.25rem', alignItems: 'center', padding: '0.28rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{label}</span>
            {bks.map(bk => (
              <Cell key={bk} val={vals?.[bk]} edgeVal={null} isPinnacle={false} color={FB_BK_COLORS[bk]} />
            ))}
          </div>
        );
        if (!mkt?.bookmakers || bks.length === 0) {
          return <div style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--text-dim)', fontSize: 12 }}>Marchés DC indisponibles</div>;
        }
        const suffix = tab === 'dc_btts' ? 'BTTS' : 'Over 1,5';
        return (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: dcGridCols, gap: '0 0.25rem', paddingBottom: '0.3rem', borderBottom: '1px solid var(--border)', marginBottom: '0.2rem' }}>
              <div />
              {bks.map(bk => <div key={bk} style={ch}>{FB_BK_LABELS[bk]}</div>)}
            </div>
            {[
              { key: '1x', label: `${home?.name ?? '1X'} / Nul & ${suffix}`, prob: tab === 'dc_btts' ? dcBttsResult?.p1x : dcOuResult?.p1x },
              { key: 'x2', label: `${away?.name ?? 'X2'} / Nul & ${suffix}`, prob: tab === 'dc_btts' ? dcBttsResult?.px2 : dcOuResult?.px2 },
            ].map(({ key, label, prob }) => (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: `1fr${bks.map(() => ' 48px').join('')}`, gap: '0 0.25rem', alignItems: 'center', padding: '0.28rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 9, color: '#fff' }}>{label}</span>
                  {prob != null && <span style={{ fontSize: 10, fontWeight: 700, color: prob >= 65 ? '#4ade80' : prob >= 55 ? '#f59e0b' : 'var(--text-dim)', background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '1px 5px' }}>{prob}%</span>}
                </div>
                {bks.map(bk => (
                  <Cell key={bk} val={mkt.bookmakers[bk]?.[key]} edgeVal={null} isPinnacle={false} color={FB_BK_COLORS[bk]} />
                ))}
              </div>
            ))}
          </>
        );
      })()}

      {tab === 'team_goals' && (() => {
        // Format revu le 7 septembre 2026, demande explicite utilisateur : équipe 1/équipe 2 côte
        // à côte (pas empilées) ; chaque ligne Over/Under sur SA PROPRE ligne façon "+ de 0,5 buts"
        // / "- de 0,5 buts" (même présentation que Betclic lui-même), pas 3 colonnes Total/Over/Under.
        // Unibet ajouté au passage (même jour) — colonnes dynamiques comme dc_btts/dc_ou (availDcBks).
        const bks = FB_BK_ORDER.filter(b => teamGoals?.bookmakers?.[b]);
        if (!bks.length) return <div style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--text-dim)', fontSize: 12 }}>Cotes indisponibles</div>;
        const lines = ['0.5', '1.5', '2.5'];
        const sides = [
          { key: 'home', name: home?.name ?? 'Domicile' },
          { key: 'away', name: away?.name ?? 'Extérieur' },
        ];
        // Format 7 septembre 2026, demande explicite utilisateur : une seule ligne par ligne de
        // buts ("O/U 0,5 buts") avec over/under combinés en une cellule "1,45/2,20" par bookmaker,
        // plutôt que 2 lignes séparées "+ de"/"- de".
        const tgGridCols = `1fr${bks.map(() => ' 64px').join('')}`;
        // Même format d'écriture que les cotes des autres marchés (7 septembre 2026, demande
        // explicite) — .toFixed(2), pas de virgule française, même taille/graisse/police tabulaire
        // que OddsCell.jsx (source commune foot+basket) plutôt qu'un formatage maison différent.
        const fmtOdd = v => (v != null ? v.toFixed(2) : '—');
        return (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
              {sides.map(({ key: side, name }) => (
                <div key={side}>
                  <div style={{ display: 'grid', gridTemplateColumns: tgGridCols, gap: '0 0.25rem', paddingBottom: '0.3rem', borderBottom: '1px solid var(--border)', marginBottom: '0.2rem' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{name}</div>
                    {bks.map(bk => <div key={bk} style={ch}>{FB_BK_LABELS[bk]}</div>)}
                  </div>
                  {lines.map(lineStr => {
                    const line = parseFloat(lineStr);
                    const modelP = computeTeamGoals(bttsResult?.lambda_home, bttsResult?.lambda_away, line, side, cdmRho);
                    return (
                      <div key={lineStr} style={{ display: 'grid', gridTemplateColumns: tgGridCols, gap: '0 0.25rem', alignItems: 'center', padding: '0.28rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: '#fff' }}>O/U {lineStr.replace('.', ',')} buts</span>
                          {modelP && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '1px 5px' }}>
                              {modelP.over}%/{modelP.under}%
                            </span>
                          )}
                        </div>
                        {bks.map(bk => {
                          const cell = teamGoals.bookmakers[bk]?.[side]?.[lineStr];
                          return (
                            <div key={bk} style={{ textAlign: 'center' }}>
                              <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 11, color: FB_BK_COLORS[bk] }}>
                                {fmtOdd(cell?.over)}/{fmtOdd(cell?.under)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: '0.4rem' }}>
              Marché en observation — pas encore d'alerte réelle, données accumulées pour calibrer un seuil.
            </div>
          </>
        );
      })()}

      {tab === 'buts' && ouResult && (() => {
        const { over, under, lambda_total } = ouResult;
        const pinnOver  = fairTots ? Math.round(fairTots.over  * 100) : null;
        const pinnUnder = fairTots ? Math.round(fairTots.under * 100) : null;
        const edge = pinnOver != null ? over - pinnOver : null;
        const isOver = edge == null || edge >= 0;
        const edgeColor = isOver ? '#4ade80' : '#f87171';
        const edgeBg    = isOver ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)';
        const probColor = over >= 62 ? '#10b981' : over >= 52 ? '#f59e0b' : '#ef4444';
        const ubT = tots?.bookmakers?.unibet?.[totalsLine];
        const bcT = tots?.bookmakers?.betclic?.[totalsLine];
        const ubEdgeOver  = fairTots ? calcEdge(ubT?.over,  fairTots.over)  : null;
        const bcEdgeOver  = fairTots ? calcEdge(bcT?.over,  fairTots.over)  : null;
        const ubEdgeUnder = fairTots ? calcEdge(ubT?.under, fairTots.under) : null;
        const bcEdgeUnder = fairTots ? calcEdge(bcT?.under, fairTots.under) : null;
        const canClickOver  = pinnOver  != null;
        const canClickUnder = pinnUnder != null;
        const PinnaclePopup = ({ ub, bc }) => (
          <div ref={edgePopupRef} style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6,
            background: 'var(--bg-card, #11141c)', border: '1px solid var(--border)', borderRadius: 6,
            padding: '0.35rem 0.55rem', boxShadow: '0 6px 16px rgba(0,0,0,0.4)', zIndex: 50, whiteSpace: 'nowrap',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 3 }}>vs Pinnacle</div>
            {ub != null && <div style={{ fontSize: 10, fontWeight: 600, color: FB_BK_COLORS.unibet }}>Unibet {ub >= 0 ? '+' : ''}{ub.toFixed(1)}%</div>}
            {bc != null && <div style={{ fontSize: 10, fontWeight: 600, color: FB_BK_COLORS.betclic }}>Betclic {bc >= 0 ? '+' : ''}{bc.toFixed(1)}%</div>}
          </div>
        );
        return (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'nowrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', flexShrink: 0 }}>
              Modèle O/U {totalsLine}<span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 4, fontWeight: 400 }}>λ={lambda_total}</span>
              {!bttsResult?.isCdm && !bttsResult?.isSnapshot && <span style={{ fontSize: 8, color: '#fb923c', marginLeft: 5, fontWeight: 400 }} title="Estimation du site (forme récente + face-à-face) — peut différer du % utilisé pour générer une alerte, qui utilise un modèle plus simple.">· estimation site</span>}
              {bttsResult?.isEarlySample && <span style={{ fontSize: 8, color: '#ef4444', marginLeft: 5, fontWeight: 400 }} title="Une des deux équipes a moins de 3 matchs joués cette saison — échantillon jugé trop faible, aucune alerte réelle ne sera générée sur ce marché tant que ça reste le cas, même si le % ci-contre franchit le seuil habituel.">· échantillon faible</span>}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', flexWrap: 'nowrap', flexShrink: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, position: 'relative' }}>
                <span
                  onClick={canClickOver ? e => { e.stopPropagation(); setEdgePopupKey(prev => prev === 'over' ? null : 'over'); } : undefined}
                  style={{ fontSize: 9, fontWeight: 700, color: 'var(--text)', cursor: canClickOver ? 'pointer' : 'default', textDecoration: canClickOver ? 'underline dotted' : 'none', textDecorationColor: 'rgba(255,255,255,0.3)' }}
                >Over</span>
                <span style={{ fontSize: 8, fontWeight: 600, color: probColor }}>{over}%</span>
                {edge != null && Math.abs(edge) >= 3 && (
                  <span style={{ fontSize: 7, fontWeight: 700, color: edgeColor }}>({isOver ? '+' : '−'}{Math.abs(edge)}pt)</span>
                )}
                {edgePopupKey === 'over' && <PinnaclePopup ub={ubEdgeOver} bc={bcEdgeOver} />}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, position: 'relative' }}>
                <span
                  onClick={canClickUnder ? e => { e.stopPropagation(); setEdgePopupKey(prev => prev === 'under' ? null : 'under'); } : undefined}
                  style={{ fontSize: 9, fontWeight: 700, color: 'var(--text)', cursor: canClickUnder ? 'pointer' : 'default', textDecoration: canClickUnder ? 'underline dotted' : 'none', textDecorationColor: 'rgba(255,255,255,0.3)' }}
                >Under</span>
                <span style={{ fontSize: 8, fontWeight: 600, color: under >= 65 ? '#10b981' : under >= 52 ? '#f59e0b' : '#ef4444' }}>{under}%</span>
                {edgePopupKey === 'under' && <PinnaclePopup ub={ubEdgeUnder} bc={bcEdgeUnder} />}
              </span>
            </div>
          </div>
        );
      })()}

      {tab === 'result' && result1X2 && (() => {
        const items = [
          { key: 'home', label: home?.short ?? 'Dom', prob: result1X2.pHome },
          { key: 'draw', label: 'Nul', prob: result1X2.pDraw },
          { key: 'away', label: away?.short ?? 'Ext', prob: result1X2.pAway },
        ];
        const ubH = h2h?.bookmakers?.unibet;
        const bcH = h2h?.bookmakers?.betclic;
        return (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.9rem', paddingTop: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'nowrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', flexShrink: 0 }}>
              Modèle 1X2
              {!bttsResult?.isCdm && !bttsResult?.isSnapshot && <span style={{ fontSize: 8, color: '#fb923c', marginLeft: 5, fontWeight: 400 }} title="Estimation du site (forme récente + face-à-face) — peut différer du % utilisé pour générer une alerte, qui utilise un modèle plus simple.">· estimation site</span>}
              {bttsResult?.isEarlySample && <span style={{ fontSize: 8, color: '#ef4444', marginLeft: 5, fontWeight: 400 }} title="Une des deux équipes a moins de 3 matchs joués cette saison — échantillon jugé trop faible, aucune alerte réelle ne sera générée sur ce marché tant que ça reste le cas, même si le % ci-contre franchit le seuil habituel.">· échantillon faible</span>}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', flexWrap: 'nowrap', flexShrink: 0 }}>
              {items.map(it => {
                const probColor = it.prob >= 62 ? '#10b981' : it.prob >= 52 ? '#f59e0b' : '#ef4444';
                const marketProb = fairMarket1X2 ? Math.round(fairMarket1X2[it.key] * 100) : null;
                const edge = marketProb != null ? it.prob - marketProb : null;
                const isOver = edge == null || edge >= 0;
                const edgeColor = isOver ? '#4ade80' : '#f87171';
                // Edge Unibet/Betclic vs Pinnacle (25 juin 2026) — déplacé dans un mini popup au clic
                // sur le libellé de l'issue, plutôt qu'une ligne séparée qui prenait trop de place.
                const ubEdge = fairH2H ? calcEdge(ubH?.[it.key], fairH2H[it.key]) : null;
                const bcEdge = fairH2H ? calcEdge(bcH?.[it.key], fairH2H[it.key]) : null;
                const hasPinnacleEdge = ubEdge != null || bcEdge != null;
                return (
                  <span key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 5, position: 'relative' }}>
                    <span
                      onClick={hasPinnacleEdge ? e => { e.stopPropagation(); setEdgePopupKey(prev => prev === it.key ? null : it.key); } : undefined}
                      style={{
                        fontSize: 9, fontWeight: 700, color: 'var(--text)',
                        cursor: hasPinnacleEdge ? 'pointer' : 'default',
                        textDecoration: hasPinnacleEdge ? 'underline dotted' : 'none', textDecorationColor: 'rgba(255,255,255,0.3)',
                      }}
                    >{it.label}</span>
                    <span style={{ fontSize: 8, fontWeight: 600, color: probColor }}>{it.prob}%</span>
                    {edge != null && Math.abs(edge) >= 3 && (
                      // Écart modèle vs marché (points) — signe +/- plutôt que ▲▼ pour ne pas se
                      // confondre avec les flèches de tendance de cote utilisées ailleurs sur cette page.
                      <span style={{ fontSize: 7, fontWeight: 700, color: edgeColor }}>
                        ({isOver ? '+' : '−'}{Math.abs(edge)}pt)
                      </span>
                    )}
                    {edgePopupKey === it.key && (
                      <div ref={edgePopupRef} style={{
                        position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6,
                        background: 'var(--bg-card, #11141c)', border: '1px solid var(--border)', borderRadius: 6,
                        padding: '0.35rem 0.55rem', boxShadow: '0 6px 16px rgba(0,0,0,0.4)', zIndex: 50, whiteSpace: 'nowrap',
                      }}>
                        <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 2 }}>Vs Pinnacle</div>
                        {ubEdge != null && <div style={{ fontSize: 10, fontWeight: 600, color: FB_BK_COLORS.unibet }}>{ubEdge >= 0 ? '+' : ''}{ubEdge.toFixed(1)}%</div>}
                        {bcEdge != null && <div style={{ fontSize: 10, fontWeight: 600, color: FB_BK_COLORS.betclic }}>{bcEdge >= 0 ? '+' : ''}{bcEdge.toFixed(1)}%</div>}
                      </div>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })()}

      {tab === 'btts' && bttsResult && (() => {
        const { prob, isStatic } = bttsResult;
        const pinnFair = fairBtts ? Math.round(fairBtts.yes * 100) : null;
        const edge = pinnFair != null ? prob - pinnFair : null;
        const isOver = edge == null || edge >= 0;
        const edgeColor = isOver ? '#4ade80' : '#f87171';
        const edgeBg    = isOver ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)';
        const probColor = prob >= 62 ? '#10b981' : prob >= 52 ? '#f59e0b' : '#ef4444';
        return (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'nowrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', flexShrink: 0 }}>
              Modèle BTTS{isStatic && !bttsResult?.isCdm ? <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 4, fontWeight: 400 }}>stats saison</span> : ''}
              {!bttsResult?.isCdm && !bttsResult?.isSnapshot && <span style={{ fontSize: 8, color: '#fb923c', marginLeft: 5, fontWeight: 400 }} title="Estimation du site (forme récente + face-à-face) — peut différer du % utilisé pour générer une alerte, qui utilise un modèle plus simple.">· estimation site</span>}
              {bttsResult?.isEarlySample && <span style={{ fontSize: 8, color: '#ef4444', marginLeft: 5, fontWeight: 400 }} title="Une des deux équipes a moins de 3 matchs joués cette saison — échantillon jugé trop faible, aucune alerte réelle ne sera générée sur ce marché tant que ça reste le cas, même si le % ci-contre franchit le seuil habituel.">· échantillon faible</span>}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', flexWrap: 'nowrap', flexShrink: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text)' }}>Oui</span>
                <span style={{ fontSize: 8, fontWeight: 600, color: probColor }}>{prob}%</span>
                {edge != null && Math.abs(edge) >= 3 && (
                  <span style={{ fontSize: 7, fontWeight: 700, color: edgeColor }}>({isOver ? '+' : '−'}{Math.abs(edge)}pt)</span>
                )}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text)' }}>Non</span>
                <span style={{ fontSize: 8, fontWeight: 600, color: (100 - prob) >= 65 ? '#10b981' : (100 - prob) >= 52 ? '#f59e0b' : '#ef4444' }}>{100 - prob}%</span>
              </span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Recent match line ─────────────────────────────────────────────────────────
function RecentMatchLine({ match, teamId }) {
  const isHome = match.homeId === teamId;
  const scored   = isHome ? match.scoreHome : match.scoreAway;
  const conceded = isHome ? match.scoreAway : match.scoreHome;
  const result   = scored > conceded ? 'W' : scored < conceded ? 'L' : 'D';
  const color    = result === 'W' ? '#2e7d32' : result === 'L' ? '#c62828' : '#9ca3af';
  const opp      = isHome ? match.awayTeam : match.homeTeam;
  const dateStr  = new Date(match.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: 11, padding: '0.18rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ color: 'var(--text-dim)', minWidth: 44, flexShrink: 0 }}>{dateStr}</span>
      <span style={{ fontWeight: 800, color, minWidth: 12, flexShrink: 0 }}>{result}</span>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', minWidth: 14, flexShrink: 0 }}>{isHome ? 'D' : 'E'}</span>
      <span style={{ color: 'var(--text-sub)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp}</span>
      <span style={{ fontWeight: 700, color, flexShrink: 0 }}>{scored}–{conceded}</span>
    </div>
  );
}

// ── FD team name matching ─────────────────────────────────────────────────────
const normTeam = s => (s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(fc|sc|ac|rc|ogc|as|afc|1\. fc|club)\b/g, '')
  .replace(/\s+/g, ' ').trim();

// ── CDM : équivalences noms anglais (football-data.org) ↔ français (cotes scrapées) ──
const CDM_NAME_ALIASES = {
  algeria: 'algerie', algerie: 'algerie',
  argentina: 'argentine', argentine: 'argentine',
  australia: 'australie', australie: 'australie',
  austria: 'autriche', autriche: 'autriche',
  belgium: 'belgique', belgique: 'belgique',
  bosniaherzegovina: 'bosnie', bosnieherzegovine: 'bosnie', bosnieherzeg: 'bosnie',
  brazil: 'bresil', bresil: 'bresil',
  capeverde: 'capvert', capvert: 'capvert',
  colombia: 'colombie', colombie: 'colombie',
  drcongo: 'congo', rdcongo: 'congo',
  croatia: 'croatie', croatie: 'croatie',
  czechia: 'tcheque', republiquetcheque: 'tcheque', reptcheque: 'tcheque', tchequie: 'tcheque',
  ecuador: 'equateur', equateur: 'equateur',
  england: 'angleterre', angleterre: 'angleterre',
  germany: 'allemagne', allemagne: 'allemagne',
  iraq: 'irak', irak: 'irak',
  ivorycoast: 'coteivoire', cotedivoire: 'coteivoire',
  japan: 'japon', japon: 'japon',
  mexico: 'mexique', mexique: 'mexique',
  morocco: 'maroc', maroc: 'maroc',
  netherlands: 'paysbas', paysbas: 'paysbas',
  newzealand: 'nouvellezelande', nouvellezelande: 'nouvellezelande', nllezelande: 'nouvellezelande',
  norway: 'norvege', norvege: 'norvege',
  saudiarabia: 'arabiesaoudite', arabiesaoudite: 'arabiesaoudite',
  scotland: 'ecosse', ecosse: 'ecosse',
  southafrica: 'afriquedusud', afriquedusud: 'afriquedusud',
  southkorea: 'coreedusud', coreedusud: 'coreedusud', coree: 'coreedusud',
  spain: 'espagne', espagne: 'espagne',
  sweden: 'suede', suede: 'suede',
  switzerland: 'suisse', suisse: 'suisse',
  tunisia: 'tunisie', tunisie: 'tunisie',
  turkiye: 'turquie', turquie: 'turquie', turkey: 'turquie',
  unitedstates: 'etatsunis', etatsunis: 'etatsunis', usa: 'etatsunis',
};

// Alias clubs Brasileirão (17 juillet 2026) — même besoin/même contenu que côté backend
// (server.js, BRESIL_TEAM_ALIASES) : football-data.org préfixe (EC Bahia), les bookmakers
// suffixent souvent la ville à la place (Bahia Salvador) — ni l'un ni l'autre n'est une
// sous-chaîne de l'autre malgré fuzzy(), donc alias vers un nom canonique partagé.
const BRESIL_TEAM_ALIASES = {
  ecbahia: 'bahia', bahiasalvador: 'bahia', bahiasalvadorba: 'bahia',
  rbbragantino: 'bragantino', bragantinosp: 'bragantino',
  // Ajouts 21 juillet 2026 — audit complet des 20 clubs Série A, même liste que server.js.
  camineiro: 'mineiro', atleticomineiro: 'mineiro', atleticomg: 'mineiro',
  caparanaense: 'paranaense', athleticoparanaense: 'paranaense', atleticoparanaense: 'paranaense',
  // Ajout 30 juillet 2026 — "Atletico PR" (forme abrégée Unibet), même cas que server.js.
  atleticopr: 'paranaense',
  coritibafbc: 'coritiba', coritibapr: 'coritiba',
  ecvitoria: 'vitoria', vitoriaba: 'vitoria',
  gremiofbpa: 'gremio', gremiors: 'gremio',
  crvascodagama: 'vasco', vascodagama: 'vasco', vascodegama: 'vasco',
  // Ajout 23 juillet 2026 — "Clube do Remo" (FD) vs "Remo PA" (bookmakers), même cas que server.js.
  clubederemo: 'remo', remopa: 'remo',
  // Ajout 6 août 2026 — 3 clubs Big Five (pas Brésil, mais même table de repli générique dans
  // norm()), miroir de la même correction côté backend (server.js, BRESIL_TEAM_ALIASES).
  realracingdesantander: 'racingsantander',
  celtadevigo: 'celtavigo',
  bayernmunchen: 'bayernmunich',
  // Ajout 9 août 2026 — 4 clubs Serie A, noms français Betclic vs italiens Pinnacle/FD, miroir de
  // la même correction côté backend (server.js, BRESIL_TEAM_ALIASES).
  come: 'como',
  naples: 'napoli',
  parme: 'parma',
  intermilan: 'internazionale',
  // Ajouts 14 août 2026 — audit complet Unibet Big Five, miroir de la même correction côté backend
  // (server.js, BRESIL_TEAM_ALIASES) — manquaient ici, cause du "Odds N/D" sur Atlético Madrid
  // signalé le 19 août. Cibles adaptées par rapport au backend là où nécessaire : le backend ne
  // fusionne que les bookmakers entre eux (jamais contre le nom football-data.org), alors qu'ici
  // c'est justement ce nom FD qu'il faut atteindre — vérifié en direct sur les vrais noms FD :
  // "Club Atlético de Madrid" (pas "Atlético Madrid" tout court) et "Eintracht Frankfurt"
  // (orthographe anglaise/allemande, pas "Francfort" en français).
  manunited: 'manchesterunited',
  mancity: 'manchestercity',
  atlmadrid: 'atleticodemadrid',
  atleticomadrid: 'atleticodemadrid', // "Atlético Madrid" (Betclic/Pinnacle) vs "Club Atlético de Madrid" (FD)
  athbilbao: 'athleticbilbao',
  rome: 'roma',
  seville: 'sevilla',
  lacorogne: 'deportivolacoruna',
  deportivolacorogne: 'deportivolacoruna',
  einfrancfort: 'eintrachtfrankfurt', // FD utilise l'orthographe anglaise/allemande, pas "Francfort"
  hambourg: 'hamburgersv',
  augsbourg: 'augsburg',
  // Ajouts 25 août 2026 — miroir de la même correction côté backend (server.js, BRESIL_TEAM_ALIASES),
  // cas réel : "Odds N/D" persistant sur LOSC-PSG après le fix backend, parce que CETTE table
  // (utilisée pour faire correspondre l'entrée /api/odds déjà fusionnée au nom de la fixture FD)
  // n'avait jamais reçu les mêmes ajouts que la table backend — deux copies qui divergent avec le
  // temps si on ne pense qu'à en corriger une. Mêmes cibles que le backend ici (vérifié : le nom FD
  // se normalise déjà vers ces cibles après strip fc/club, pas besoin d'adaptation comme atlmadrid/
  // einfrancfort ci-dessus).
  barcelone: 'barcelona',
  parissg: 'parissaintgermain',
  vienne: 'vienna',
  nicosie: 'nicosia',
  salzbourg: 'salzburg',
  bologne: 'bologna',
  brightonhove: 'brighton',
  // Ajout 29 août 2026 — miroir de la même correction côté backend (server.js, COUNTRY_ALIASES),
  // cas réel : "Odds N/D" Levante-Real Betis malgré des cotes Unibet bien scrapées ("Betis Séville").
  betissevilla: 'betis',
  realbetisbalompie: 'betis',
};

function findInTable(table, name) {
  const q = normTeam(name);
  return table.find(t => {
    const tn = normTeam(t.name); const ts = normTeam(t.shortName || '');
    return tn === q || ts === q || tn.includes(q) || q.includes(tn);
  }) || null;
}

// ── Lineup Builder ────────────────────────────────────────────────────────────

// Y croissant = bas d'écran = côté droit du terrain (perspective GK)
// Ordre fill : GK → LB → CB → CB → RB → RM → CM → LM → ST
const FORMATIONS = {
  '4-3-3':   [[50],[15,36,64,85],[78,50,22],[82,50,18]],
  '4-4-2':   [[50],[15,36,64,85],[87,62,38,13],[65,35]],
  '4-2-3-1': [[50],[15,36,64,85],[33,67],[82,50,18],[50]],
  '3-5-2':   [[50],[25,50,75],[90,70,50,30,10],[65,35]],
  '5-3-2':   [[50],[10,27,50,73,90],[75,50,25],[65,35]],
  '4-1-4-1': [[50],[15,36,64,85],[50],[87,62,38,13],[50]],
};

const ROLE_LABELS = {
  '4-3-3':   [['GK'],['LB','CB','CB','RB'],['RM','CM','LM'],['RW','ST','LW']],
  '4-4-2':   [['GK'],['LB','CB','CB','RB'],['RM','CM','CM','LM'],['ST','ST']],
  '4-2-3-1': [['GK'],['LB','CB','CB','RB'],['DM','DM'],['RM','CAM','LM'],['ST']],
  '3-5-2':   [['GK'],['CB','CB','CB'],['RWB','CM','CM','CM','LWB'],['ST','ST']],
  '5-3-2':   [['GK'],['LWB','CB','CB','CB','RWB'],['RM','CM','LM'],['ST','ST']],
  '4-1-4-1': [['GK'],['LB','CB','CB','RB'],['DM'],['RM','CM','CM','LM'],['ST']],
};

// Terrain horizontal — home à gauche, away à droite
// FORMATIONS[f][row] = tableau de positions Y (0-100, haut-bas)
// Profondeur (GK→attaque) = axe X
function buildPositions(formation, isHome) {
  const rows = FORMATIONS[formation];
  const n = rows.length;
  return rows.flatMap((yArr, rowIdx) => {
    const t = rowIdx / (n - 1);
    const x = isHome ? 7 + 38 * t : 93 - 38 * t;
    return yArr.map((y, colIdx) => ({ x, y, rowIdx, colIdx }));
  });
}

function buildRoles(formation) {
  return (ROLE_LABELS[formation] || []).flatMap(row => row);
}

function PitchSVG() {
  const W = 200; const H = 130;
  const s = 'rgba(255,255,255,0.65)'; const sw = '0.7';
  return (
    <svg className="lp-pitch-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <rect width={W} height={H} fill="#2d7a2d"/>
      {[0,1,2,3,4,5,6,7].map(i=>(
        <rect key={i} x={i*25} y="0" width="12.5" height={H} fill="rgba(0,0,0,0.05)"/>
      ))}
      <rect x="4" y="4" width="192" height="122" fill="none" stroke={s} strokeWidth={sw}/>
      <line x1="100" y1="4" x2="100" y2="126" stroke={s} strokeWidth={sw}/>
      <circle cx="100" cy="65" r="16" fill="none" stroke={s} strokeWidth={sw}/>
      <circle cx="100" cy="65" r="1.1" fill={s}/>
      {/* Left box */}
      <rect x="4" y="30" width="30" height="70" fill="none" stroke={s} strokeWidth={sw}/>
      <rect x="4" y="45" width="13" height="40" fill="none" stroke={s} strokeWidth={sw}/>
      <circle cx="25" cy="65" r="0.9" fill={s}/>
      <path d="M 34 51 A 16 16 0 0 1 34 79" fill="none" stroke={s} strokeWidth={sw}/>
      <rect x="0" y="50" width="5" height="30" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5"/>
      {/* Right box */}
      <rect x="166" y="30" width="30" height="70" fill="none" stroke={s} strokeWidth={sw}/>
      <rect x="183" y="45" width="13" height="40" fill="none" stroke={s} strokeWidth={sw}/>
      <circle cx="175" cy="65" r="0.9" fill={s}/>
      <path d="M 166 51 A 16 16 0 0 0 166 79" fill="none" stroke={s} strokeWidth={sw}/>
      <rect x="195" y="50" width="5" height="30" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5"/>
    </svg>
  );
}

function PlayerDot({ pos, name, complete }) {
  return (
    <div
      className="lp-player"
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
    >
      <div className={`lp-dot ${name ? 'lp-dot--filled' : ''} ${name && complete ? 'lp-dot--complete' : ''}`} />
      {name && (
        <span className="lp-player-label">
          {name.split(' ').pop()}
        </span>
      )}
    </div>
  );
}

function LineupBuilder({ home, away, homeForm, awayForm, setHomeForm, setAwayForm, homeNames, awayNames, setHomeNames, setAwayNames }) {
  const homePosArr   = buildPositions(homeForm, true);
  const awayPosArr   = buildPositions(awayForm, false);
  const homeRoles    = buildRoles(homeForm);
  const awayRoles    = buildRoles(awayForm);
  const homeComplete = homeNames.length > 0 && homeNames.every(n => n);
  const awayComplete = awayNames.length > 0 && awayNames.every(n => n);

  function updateName(team, idx, val) {
    if (team === 'home') setHomeNames(n => { const c=[...n]; c[idx]=val; return c; });
    else setAwayNames(n => { const c=[...n]; c[idx]=val; return c; });
  }

  function handleFormChange(team, val) {
    const count = buildPositions(val, true).length;
    if (team === 'home') { setHomeForm(val); setHomeNames(Array(count).fill('')); }
    else                 { setAwayForm(val); setAwayNames(Array(count).fill('')); }
  }

  return (
    <div className="lp-wrap">
      <div className="lp-controls">
        <div className="lp-ctrl">
          <span className="lp-team-label">{home.short}</span>
          <select className="lp-select" value={homeForm} onChange={e => handleFormChange('home', e.target.value)}>
            {Object.keys(FORMATIONS).map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="lp-ctrl lp-ctrl--right">
          <select className="lp-select" value={awayForm} onChange={e => handleFormChange('away', e.target.value)}>
            {Object.keys(FORMATIONS).map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <span className="lp-team-label">{away.short}</span>
        </div>
      </div>

      <div className="lp-pitch-wrap">
        <PitchSVG />
        {awayPosArr.map((pos, i) => (
          <PlayerDot key={`a${i}`} pos={pos} name={awayNames[i]} complete={awayComplete} />
        ))}
        {homePosArr.map((pos, i) => (
          <PlayerDot key={`h${i}`} pos={pos} name={homeNames[i]} complete={homeComplete} />
        ))}
      </div>
      <p className="lp-hint">Cliquer sur un joueur dans la liste · Cliquer sur un point pour le retirer</p>
    </div>
  );
}

// ── Roster Panel ──────────────────────────────────────────────────────────────

// Seuil "titulaire" relatif au nombre de matchs déjà joués par l'équipe cette saison (28 août
// 2026, fix) — un seuil absolu (10 titularisations) ne pouvait jamais se déclencher en tout début de
// saison (journée 1-2 : personne n'a encore 10 titularisations), affichant tout le monde en
// "Remplaçants" sans aucun "Titulaires". `maxStarts` (le max de titularisations dans l'effectif) sert
// de proxy pour le nombre de matchs déjà joués — un joueur qui a débuté au moins la moitié de ces
// matchs compte comme titulaire. Dès 1 seul match joué (maxStarts=1), le seuil vaut 1 : exactement
// les 11 joueurs qui ont débuté le dernier match ressortent comme titulaires, comportement identique
// à l'ancien seuil fixe une fois la saison bien avancée (maxStarts=20 → seuil=10).
const STARTER_RATIO = 0.5;

// Libellé complet des postes ESPN (G/D/M/F) — affiché en tooltip sur l'abréviation.
const POSITION_LABELS = { G: 'Gardien', D: 'Défenseur', M: 'Milieu', F: 'Attaquant' };

function RosterColumn({ team, players, names, side, loading, onAssign }) {
  function handleClick(p) {
    onAssign(side, p.shortName || p.name);
  }

  const maxStarts = Math.max(1, ...(players || []).map(p => p.gamesStarted || 0));
  const starterThreshold = Math.max(1, Math.ceil(maxStarts * STARTER_RATIO));
  const starters = (players || [])
    .filter(p => p.gamesStarted >= starterThreshold)
    .sort((a, b) => b.gamesStarted - a.gamesStarted);
  const bench = (players || [])
    .filter(p => p.gamesStarted < starterThreshold)
    .sort((a, b) => b.appearances - a.appearances);

  return (
    <div className="rp-col">
      <div className="rp-col-header">{team.short}</div>
      <div className="rp-body">
        {loading && <div className="rp-status">Chargement...</div>}
        {!loading && (!players || players.length === 0) && (
          <div className="rp-status">Indisponible</div>
        )}
        {!loading && players && players.length > 0 && (
          <>
            {starters.length > 0 && (
              <div className="rp-group">
                <div className="rp-group-label">Titulaires</div>
                {starters.map(p => {
                  const display = p.shortName || p.name;
                  const isUsed  = names.includes(display);
                  return (
                    <button key={p.id}
                      className={`rp-player-btn ${isUsed ? 'rp-used' : ''} ${p.injury ? 'rp-injured' : ''}`}
                      onClick={() => handleClick(p)} title={p.injury || undefined}>
                      <span className="rp-pos-tag" title={POSITION_LABELS[p.position] || undefined}>{p.position}</span>
                      <span className="rp-num">{p.jerseyNumber ?? '—'}</span>
                      <span className="rp-pname">{display}</span>
                      {p.injury && <span className="rp-inj">🤕</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {bench.length > 0 && (
              <div className="rp-group">
                <div className="rp-group-label">Remplaçants</div>
                {bench.map(p => {
                  const display = p.shortName || p.name;
                  const isUsed  = names.includes(display);
                  return (
                    <button key={p.id}
                      className={`rp-player-btn ${isUsed ? 'rp-used' : ''} ${p.injury ? 'rp-injured' : ''}`}
                      onClick={() => handleClick(p)} title={p.injury || undefined}>
                      <span className="rp-pos-tag" title={POSITION_LABELS[p.position] || undefined}>{p.position}</span>
                      <span className="rp-num">{p.jerseyNumber ?? '—'}</span>
                      <span className="rp-pname">{display}</span>
                      {p.injury && <span className="rp-inj">🤕</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RosterPanel({ home, away, homePlayers, awayPlayers, loading, homeNames, awayNames, onAssign }) {
  return (
    <div className="detail-card roster-panel-card">
      <RosterColumn team={home} players={homePlayers} names={homeNames} side="home" loading={loading} onAssign={onAssign} />
      <div className="rp-divider" />
      <RosterColumn team={away} players={awayPlayers} names={awayNames} side="away" loading={loading} onAssign={onAssign} />
    </div>
  );
}

function formatUpcomingDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
function formatUpcomingTime(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// 31 juillet 2026 (demande utilisateur) — remplace l'ancien "team.upcoming" (jamais alimenté nulle
// part dans l'app, toujours vide) par une vraie source : /api/football/teammatches/:id?status=SCHEDULED,
// même endpoint que "Derniers résultats". Juste les logos des 5 prochains adversaires alignés (pas
// de liste détaillée date/lieu — simplifié suite retour utilisateur) ; date en tooltip au survol.
// Affichage revu en une seule ligne (une équipe à la fois) + bouton de bascule, plutôt que les deux
// équipes côte à côte — même animation flip (scaleX collapse) que le toggle Pinnacle du Backtesting.
function UpcomingRow({ teamId, matches }) {
  if (matches.length === 0) {
    return <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Aucun match disponible</span>;
  }
  return (
    <div style={{ display: 'flex', gap: '1.1rem' }}>
      {matches.slice(0, 5).map((m, i) => {
        const isHome  = m.homeId === teamId;
        const opp     = isHome ? m.awayTeam : m.homeTeam;
        const oppCrest = isHome ? m.awayCrest : m.homeCrest;
        const dateLabel = `${formatUpcomingDate(m.date)} · ${formatUpcomingTime(m.date)} · ${isHome ? 'Domicile' : 'Extérieur'} vs ${opp}`;
        return (
          <div key={i} title={dateLabel}>
            <TeamLogo name={opp} logoId={oppCrest} size={15} />
          </div>
        );
      })}
    </div>
  );
}

function CollapsibleCard({ title, children, className = '', defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`detail-card collapsible-card ${className}`}>
      <button className="collapsible-header" onClick={() => setOpen(o => !o)}>
        <span className="card-title">{title}</span>
        <span className={`collapsible-chevron ${open ? 'open' : ''}`}>▾</span>
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </section>
  );
}

function H2HRow({ match }) {
  const d = new Date(match.date);
  const label = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const isDraw = match.scoreHome === match.scoreAway;
  return (
    <div className="h2h-row">
      <span className="h2h-date">{label}</span>
      <span className="h2h-team">{match.home}</span>
      <span className={`h2h-score ${isDraw ? 'h2h-draw' : ''}`}>{match.scoreHome} – {match.scoreAway}</span>
      <span className="h2h-team right">{match.away}</span>
    </div>
  );
}

export default function MatchDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { fixtures: footballFixtures, loading: fixturesLoading } = useFootballFixtures();
  const fixture = footballFixtures.find(f => f.id === id) || getFixtureById(id);
  // Repli ancien-id (3 septembre 2026) — une alerte acceptée AVANT la migration football-data.org →
  // api-football (2 septembre) porte encore un id football-data.org (ex: fd_564682), introuvable
  // dans la liste courante (désormais en ids api-football, ex: fd_1570392). Cas réel : Real Sociedad-
  // Celta et Flamengo-Mirassol, "Match introuvable" en cliquant depuis Running alors que le match est
  // bien réel/en cours. Résolution en 2 temps : /api/fd/match/:rawId (football-data.org direct,
  // renvoie la ligue) puis /api/fd/resolve-legacy-id (cherche le même match dans le bundle
  // api-football déjà en cache) — puis redirection vers le nouvel id, où la fiche se charge
  // normalement. Ne concerne que fd_/fdbr_ (5 championnats + Brésil) — CDM et coupes d'Europe
  // n'ont jamais changé d'id, jamais concernés.
  const [legacyResolving, setLegacyResolving] = useState(false);
  const [legacyFailed, setLegacyFailed] = useState(false);
  useEffect(() => {
    if (fixture || fixturesLoading || !id) return;
    const m = /^(fd|fdbr)_(\d+)$/.exec(id);
    if (!m) return;
    const [, prefix, rawId] = m;
    const FD_COMP_TO_LEAGUE = { FL1: 'ligue1', PL: 'pl', PD: 'laliga', BL1: 'bundes', SA: 'seriea', BSA: 'bresil' };
    let cancelled = false;
    setLegacyResolving(true);
    setLegacyFailed(false);
    (async () => {
      try {
        const raw = await fetch(`/api/fd/match/${rawId}`).then(r => r.ok ? r.json() : null);
        const leagueKey = raw?.competitionCode ? FD_COMP_TO_LEAGUE[raw.competitionCode] : null;
        if (!leagueKey) throw new Error('ligue non reconnue');
        const resolved = await fetch(`/api/fd/resolve-legacy-id?league=${leagueKey}&oldId=${rawId}`).then(r => r.ok ? r.json() : null);
        if (!resolved?.newId) throw new Error('correspondance introuvable');
        if (!cancelled) navigate(`/football/${prefix}_${resolved.newId}`, { replace: true });
      } catch {
        if (!cancelled) { setLegacyResolving(false); setLegacyFailed(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [id, fixture, fixturesLoading, navigate]);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef(null);
  const [showLineup, setShowLineup] = useState(true);
  const [homeForm, setHomeForm] = useState('4-3-3');
  const [awayForm, setAwayForm] = useState('4-3-3');
  const [homeNames, setHomeNames] = useState(Array(11).fill(''));
  const [awayNames, setAwayNames] = useState(Array(11).fill(''));
  const [homePlayers, setHomePlayers] = useState(null);
  const [awayPlayers, setAwayPlayers] = useState(null);
  const rosterFetchedForRef = useRef(null); // fixture.id déjà fetché — voir effet Compositions plus bas
  const [rosterLoading, setRosterLoading] = useState(false);
  const [matchOdds, setMatchOdds] = useState(null);
  const [matchOddsFrozen, setMatchOddsFrozen] = useState(false);
  const [showOddsDropdown, setShowOddsDropdown] = useState(false);
  const [refreshingOdds, setRefreshingOdds] = useState(false);
  const [lastRefreshedOdds, setLastRefreshedOdds] = useState(null);
  const [liveHomeStats, setLiveHomeStats] = useState(null);
  const [liveAwayStats, setLiveAwayStats] = useState(null);
  const [cdmPoolAvg,   setCdmPoolAvg]    = useState(null);
  const [homeMatches, setHomeMatches] = useState([]);
  const [awayMatches, setAwayMatches] = useState([]);
  const [homeUpcoming, setHomeUpcoming] = useState([]);
  const [awayUpcoming, setAwayUpcoming] = useState([]);
  const [upcomingSide, setUpcomingSide] = useState('home');
  const [upcomingFlipping, setUpcomingFlipping] = useState(false);
  const handleUpcomingToggle = () => {
    setUpcomingFlipping(true);
    setTimeout(() => { setUpcomingSide(s => s === 'home' ? 'away' : 'home'); setUpcomingFlipping(false); }, 280);
  };
  const [footballSnapshot, setFootballSnapshot] = useState(null);

  // Extrait en fonction réutilisable pour le bouton refresh manuel (FootballOddsBox) — appelle
  // /api/odds SANS ?refresh=1 : on relit juste le cache déjà alimenté par le cycle automatique
  // (toutes les 20min), jamais un nouveau scraping live déclenché par un clic utilisateur.
  const loadOdds = () => {
    if (!fixture) return Promise.resolve();
    const norm = s => {
      let base = (s || '').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/ø/g, 'o').replace(/å/g, 'a').replace(/æ/g, 'ae');
      // Alias mot-à-mot (25 août 2026, miroir du fix backend normTeam) — la table n'était cherchée
      // que sur la chaîne entière une fois les espaces supprimés, donc un nom avec préfixe non listé
      // ci-dessous (ex: "Rapid Vienne") ne devenait jamais la chaîne exacte "vienne".
      base = base.replace(/[a-z]+/g, w => CDM_NAME_ALIASES[w] || BRESIL_TEAM_ALIASES[w] || w);
      base = base
        .replace(/\b(as|fc|sc|rc|ogc|afc|ac|stade|club|island|islands)\b/g, '')
        .replace(/\bst\b/g, 'saint')
        .replace(/\butd\b/g, 'united')
        .replace(/[^a-z]/g, '');
      return CDM_NAME_ALIASES[base] || BRESIL_TEAM_ALIASES[base] || base;
    };
    const fuzzy = (a, b) => { const na = norm(a), nb = norm(b); return na.includes(nb) || nb.includes(na); };
    return cachedFetch('/api/odds', 30_000)
      .then(data => {
        const match = (data.matches || []).find(m =>
          fuzzy(m.homeTeam, fixture.home.name) &&
          fuzzy(m.awayTeam, fixture.away.name)
        );
        setMatchOdds(match?.markets ?? false);
        setMatchOddsFrozen(!!match?.frozen);
      })
      .catch(() => setMatchOdds(false));
  };

  useEffect(() => { loadOdds(); }, [fixture?.id]);

  const handleRefreshOdds = () => {
    setRefreshingOdds(true);
    const start = Date.now();
    // Le fetch sert quasi toujours depuis le cache (réponse <100ms) — sans délai minimum,
    // le bouton clignote trop vite pour être perceptible et donne l'impression de ne rien faire.
    loadOdds().finally(() => {
      const remaining = 500 - (Date.now() - start);
      setTimeout(() => { setRefreshingOdds(false); setLastRefreshedOdds(new Date()); }, Math.max(0, remaining));
    });
  };

  // Snapshot foot (22 juillet 2026) — 5 grands championnats + Brasileirão (pas CDM, qui a déjà sa
  // propre parité via computeCdmBTTS). Effet séparé/indépendant du reste : le badge "estimation
  // site" doit disparaître dès que le snapshot arrive, même si les autres fetches (standings, xG)
  // sont encore en cours ou échouent.
  useEffect(() => {
    setFootballSnapshot(null);
    if (!fixture || fixture.league === 'cdm') return;
    cachedFetch(`/api/football/projections-snapshot/${fixture.id}`, 5 * 60_000)
      .then(d => { if (d.found) setFootballSnapshot(d); })
      .catch(() => {});
  }, [fixture?.id]);

  useEffect(() => {
    if (!fixture) return;
    if (fixture.league === 'cdm') {
      const toForm = results => (results || []).slice(0, 5)
        .map(r => r.gf > r.ga ? 'W' : r.gf === r.ga ? 'D' : 'L');
      const fetchTeam = (name, setter) => {
        cachedFetch(`/api/football/cdm/teamstats/${encodeURIComponent(name)}`, 10 * 60_000)
          .then(d => {
            if (d.goalsFor == null) return;
            setter({ goalsFor: d.goalsFor, goalsAgainst: d.goalsAgainst, games: d.games, lastMatchDate: d.lastMatchDate, form: toForm(d.results) });
          })
          .catch(() => {});
      };
      fetchTeam(fixture.home.name, setLiveHomeStats);
      fetchTeam(fixture.away.name, setLiveAwayStats);
      cachedFetch(`/api/football/cdm/poolavg?fixtureId=${encodeURIComponent(fixture.id)}`, 6 * 3600_000).then(d => setCdmPoolAvg(d)).catch(() => {});
      return;
    }
    cachedFetch(`/api/football/standings/${fixture.league}`, 30 * 60_000)
      .then(({ table }) => {
        if (!Array.isArray(table) || !table.length) return;
        const h = findInTable(table, fixture.home.name);
        const a = findInTable(table, fixture.away.name);
        // setLiveHomeStats/setLiveAwayStats en forme fonctionnelle (merge sur prev) — sinon ce fetch
        // et le fetch xG ci-dessous (indépendant, peut résoudre avant ou après) s'écrasent l'un
        // l'autre selon l'ordre d'arrivée au lieu de fusionner (bug trouvé le 22 juillet 2026, xG
        // toujours à 0 malgré une route qui répondait correctement en direct).
        if (h) {
          setLiveHomeStats(prev => ({ ...prev, ...h }));
          cachedFetch(`/api/football/teammatches/${h.id}`, 30 * 60_000).then(d => setHomeMatches(d.matches || [])).catch(() => {});
          // "5 prochains matchs" (31 juillet 2026, demande utilisateur) — même endpoint que
          // "Derniers résultats", juste status=SCHEDULED + limite à 5 (pas besoin de 30 ici).
          cachedFetch(`/api/football/teammatches/${h.id}?status=SCHEDULED&limit=5`, 30 * 60_000).then(d => setHomeUpcoming(d.matches || [])).catch(() => {});
        }
        if (a) {
          setLiveAwayStats(prev => ({ ...prev, ...a }));
          cachedFetch(`/api/football/teammatches/${a.id}`, 30 * 60_000).then(d => setAwayMatches(d.matches || [])).catch(() => {});
          cachedFetch(`/api/football/teammatches/${a.id}?status=SCHEDULED&limit=5`, 30 * 60_000).then(d => setAwayUpcoming(d.matches || [])).catch(() => {});
        }
      })
      .catch(() => {});
    // xG/tirs/possession (22 juillet 2026, api-football) — panneau "Statistiques saison", séparé
    // du fetch standings ci-dessus (source différente) ; merge par-dessus liveHomeStats/liveAwayStats
    // une fois arrivé, sans attendre/bloquer l'affichage des stats standings déjà là.
    const fetchXGStats = (teamName, setter) => {
      cachedFetch(`/api/football/teamxgstats?league=${fixture.league}&team=${encodeURIComponent(teamName)}&date=${encodeURIComponent(fixture.date)}`, 6 * 3600_000)
        .then(d => { if (d.found) setter(prev => ({ ...prev, xG: d.xG, xGA: d.xGA, shotsPerGame: d.shotsPerGame, shotsOnTarget: d.shotsOnTarget, possession: d.possession })); })
        .catch(() => {});
    };
    fetchXGStats(fixture.home.name, setLiveHomeStats);
    fetchXGStats(fixture.away.name, setLiveAwayStats);
  }, [fixture?.id]);

  // Fix 28 août 2026, 2 bugs sur cet effet :
  // 1) dépendance `fixture?.id` manquante à l'origine — `showLineup` vaut déjà `true` par défaut au
  //    montage, donc l'effet ne se déclenchait qu'une fois, au tout premier rendu, AVANT que `fixture`
  //    (chargé de façon async) ne soit disponible : la garde `!fixture` sortait alors immédiatement et
  //    ne se redéclenchait jamais, laissant "Indisponible" affiché en permanence.
  // 2) une fois `fixture?.id` ajouté aux deps, la garde `homePlayers !== null` (censée éviter un
  //    refetch en boucle) bloquait aussi le refetch LÉGITIME lors d'un changement de match réel —
  //    naviguer vers un autre match via la flèche ▾ change `fixture.id` sans démonter le composant,
  //    `homePlayers` restait donc peuplé avec l'effectif du match PRÉCÉDENT et l'effet se voyait
  //    bloqué par sa propre garde. Remplacé par un ref `rosterFetchedForRef` qui retient le dernier
  //    `fixture.id` réellement fetché — comparaison indépendante de l'état `homePlayers`, don ne se
  //    fait plus tromper par des données périmées. Le reset de `homePlayers`/`awayPlayers`/
  //    `homeNames`/`awayNames` a lieu ICI, dans le même passage d'effet, avant le fetch — pas dans un
  //    effet séparé (un 1er essai avec 2 effets distincts ne fonctionnait pas : React n'exécute un
  //    effet que si SES PROPRES dépendances ont changé, un reset d'état déclenché par un autre effet
  //    ne relance pas celui-ci une 2e fois dans le même cycle).
  useEffect(() => {
    if (!fixture || !showLineup || rosterFetchedForRef.current === fixture.id) return;
    rosterFetchedForRef.current = fixture.id;
    setHomePlayers(null); setAwayPlayers(null);
    setHomeNames(Array(11).fill('')); setAwayNames(Array(11).fill(''));
    setRosterLoading(true);
    async function fetchOne(name, setter) {
      if (fixture.league === 'cdm') {
        try {
          const d = await cachedFetch(`/api/football/cdm/squad/${encodeURIComponent(name)}`, 6 * 3600_000);
          setter(d.players || []);
        } catch { setter([]); }
        return;
      }
      // Recherche floue (2 septembre 2026, migration api-football) — ESPN_FOOTBALL est indexé sur
      // les noms exacts football-data.org ("Arsenal FC", "1. FC Union Berlin"...), qui ne
      // correspondent plus à `name` maintenant que les fixtures viennent d'api-football ("Arsenal",
      // "Union Berlin"...). normTeam/fuzzy déjà utilisés par findInTable plus haut dans ce fichier —
      // évite de reconstruire à la main les ~120 lignes du dictionnaire pour chaque championnat.
      const nName = normTeam(name);
      const info = ESPN_FOOTBALL[name] || Object.entries(ESPN_FOOTBALL).find(([key]) => {
        const nKey = normTeam(key);
        return nKey === nName || nKey.includes(nName) || nName.includes(nKey);
      })?.[1];
      if (!info) { setter([]); return; }
      try {
        const d = await cachedFetch(`/api/football/squad/${info.league}/${info.id}`, 6 * 3600_000);
        setter(d.players || []);
      } catch { setter([]); }
    }
    Promise.all([
      fetchOne(fixture.home.name, setHomePlayers),
      fetchOne(fixture.away.name, setAwayPlayers),
    ]).finally(() => setRosterLoading(false));
  }, [showLineup, fixture?.id]);

  const league = fixture ? getLeagueById(fixture.league) : null;
  const { home, away, venue, weather, round } = fixture || {};

  const isLive  = fixture?.status === 'STATUS_IN_PROGRESS';
  const isFinal = FINAL_STATUSES.has(fixture?.status);
  const homeWon = isFinal && home?.score != null && away?.score != null && home.score > away.score;
  const awayWon = isFinal && home?.score != null && away?.score != null && away.score > home.score;

  const effHome = liveHomeStats
    ? { ...home, ...liveHomeStats, form: liveHomeStats.form?.length ? liveHomeStats.form : home?.form }
    : home;
  const effAway = liveAwayStats
    ? { ...away, ...liveAwayStats, form: liveAwayStats.form?.length ? liveAwayStats.form : away?.form }
    : away;

  // Snapshot (22 juillet 2026) prioritaire sur les 5 grands championnats + Brasileirão — c'est la
  // vraie estimation backend (Poisson+Dixon-Coles+shrinkage+blessures+xG), celle qui décide des
  // alertes, au lieu de la recalculer côté client avec une formule plus simple (badge "estimation
  // site" jusqu'ici toujours affiché pour ces 6 championnats). Fallback sur l'ancien calcul client
  // tant que le snapshot n'est pas encore arrivé (fetch async) ou si le backend n'a pas encore
  // généré de projection pour ce match (fixture trop loin dans le temps, cf. fenêtre 48h).
  const bttsResult = fixture?.league === 'cdm'
    ? computeCdmBTTS(liveHomeStats, liveAwayStats, cdmPoolAvg, fixture.home?.name)
    : footballSnapshot
      ? {
          prob: Math.round(footballSnapshot.bttsProb * 100),
          lambda_home: footballSnapshot.lambdaHome, lambda_away: footballSnapshot.lambdaAway,
          isSnapshot: true,
          isEarlySample: !!footballSnapshot.isEarlySample,
        }
      : (homeMatches.length && awayMatches.length && liveHomeStats?.id && liveAwayStats?.id)
        ? computeBTTS(homeMatches, awayMatches, liveHomeStats.id, liveAwayStats.id)
        : computeStaticBTTS(fixture);

  // Générateur d'alerte BTTS côté navigateur retiré (1er septembre 2026, demande explicite) —
  // créait de vraies alertes (cloudSet direct vers Mongo) sans passer par aucun garde-fou backend
  // (fenêtre 48h, seuil 3-matchs, purge des obsolètes, seuils calibrés par ligue). Cas réel qui l'a
  // révélé : Ipswich-Liverpool/Lyon-Auxerre, alertes à 82%/85% générées alors que les deux matchs
  // étaient à plus de 48h du coup d'envoi (donc sans vrai snapshot backend — seule l'estimation
  // "site" non calibrée était disponible ici). Le backend gère déjà le BTTS proprement pour les 5
  // grands championnats + Brésil + CDM ; ce chemin, antérieur à ce moteur, n'était plus nécessaire.

  if (!fixture) {
    if (fixturesLoading || legacyResolving) return <div className="page"><div className="empty-state">Chargement…</div></div>;
    return <div className="page"><div className="empty-state">{legacyFailed ? "Match introuvable (ancien id, correspondance non trouvée)." : "Match introuvable."}</div></div>;
  }

  return (
    <div className="page detail-page">

      <button className="back-btn" onClick={() => navigate('/sports')}>← Retour</button>
      <div className="detail-breadcrumb">
        <span style={{ color: league?.accent }}>{league?.flag} {league?.name}</span>
        <span className="bc-sep">·</span>
        <span>{round}</span>
      </div>

      {/* ── Hero ── */}
      <div className="detail-hero">
        <div className="detail-team home-team">
          <TeamLogo name={home.name} logoId={home.logoId} size={52} />
          <div className="dt-position">#{effHome.position}</div>
          <div className="dt-name">{home.name}</div>
          <div className="dt-pts">{effHome.points} pts</div>
          <FormStrip form={effHome.form} size="lg" />
        </div>

        <div className="detail-center">
          {isLive || isFinal ? (
            <>
              {isLive && <span className="mrd-live">● LIVE</span>}
              <div className="detail-time-big" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: isLive ? '#c62828' : (homeWon ? '#2e7d32' : 'var(--text)') }}>{home.score ?? '–'}</span>
                <span style={{ margin: '0 0.3em', color: 'var(--text-dim)' }}>–</span>
                <span style={{ color: isLive ? '#c62828' : (awayWon ? '#2e7d32' : 'var(--text)') }}>{away.score ?? '–'}</span>
              </div>
              {isFinal && <div className="detail-datetime">Terminé</div>}
            </>
          ) : (
            <>
              <div className="detail-vs">vs</div>
              <div className="detail-datetime">{formatFullDate(fixture.date)}</div>
              <div className="detail-time-big">{formatMatchTime(fixture.date)}</div>
            </>
          )}
        </div>

        <div className="detail-team away-team">
          <TeamLogo name={away.name} logoId={away.logoId} size={52} />
          <div className="dt-position">#{effAway.position}</div>
          <div className="dt-name">{away.name}</div>
          <div className="dt-pts">{effAway.points} pts</div>
          <FormStrip form={effAway.form} size="lg" />
        </div>

        {/* Dropdown autres matchs du championnat */}
        {(() => {
          const now = Date.now();
          const isDone = f => f.status === 'STATUS_FULL_TIME' || new Date(f.date).getTime() < now;
          const curDone = isDone(fixture);
          const others = footballFixtures.filter(f => f.league === fixture.league)
            .filter(f => f.id !== fixture.id && (curDone ? isDone(f) : !isDone(f)))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
          if (!others.length) return null;
          return (
            <div ref={dropRef} style={{ position: 'absolute', bottom: 10, right: 12 }}>
              <button onClick={() => setDropOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-dim)', fontSize: 11, fontWeight: 600, padding: '3px 8px', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}>
                <span style={{ transform: dropOpen ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▾</span>
              </button>
              {dropOpen && (
                <div onMouseLeave={() => setDropOpen(false)} style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 0', zIndex: 100, minWidth: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                  {others.map(f => (
                    <button key={f.id} onClick={() => { setDropOpen(false); navigate(`/football/${f.id}`); }} style={{ display: 'block', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '7px 14px', textAlign: 'left', fontSize: 12, color: 'var(--text-sub)', whiteSpace: 'nowrap' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      {f.home.name} <span style={{ color: 'var(--text-dim)' }}>vs</span> {f.away.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Info bar ── */}
      <div className="detail-infobar">
        <div className="info-chip">
          🏟️ {venue.name}, {venue.city}
          <span className="info-sub">{formatCapacity(venue.capacity)} places</span>
        </div>
        <div className="info-chip">
          {weather.icon} {weather.temp}°C · {weather.condition}
          <span className="info-sub">Vent {weather.wind} km/h · Humidité {weather.humidity}%</span>
        </div>
        <div
          className="info-chip"
          onClick={() => { if (!matchOdds || !Object.keys(matchOdds).length) return; setShowOddsDropdown(v => !v); setShowLineup(false); }}
          style={{ cursor: matchOdds && Object.keys(matchOdds).length ? 'pointer' : 'default', userSelect: 'none', opacity: matchOdds === null ? 0.5 : 1 }}
        >
          {matchOdds === null ? 'Odds…' : matchOdds && Object.keys(matchOdds).length ? (matchOddsFrozen ? 'Odds (pré-match)' : 'Odds') : 'Odds N/D'}
        </div>

        <button
          className={`info-chip info-chip--btn info-chip--pitch ${showLineup ? 'active' : ''}`}
          onClick={() => { setShowLineup(v => !v); setShowOddsDropdown(false); }}
          title="Compositions"
          style={{ marginLeft: 'auto' }}
        >
          <svg width="28" height="20" viewBox="0 0 28 20" fill="none">
            <rect x="1" y="1" width="26" height="18" rx="1" fill="none" stroke="white" strokeWidth="0.8"/>
            <line x1="14" y1="1" x2="14" y2="19" stroke="white" strokeWidth="0.7"/>
            <circle cx="14" cy="10" r="3" fill="none" stroke="white" strokeWidth="0.7"/>
            <rect x="1" y="7" width="4" height="6" fill="none" stroke="white" strokeWidth="0.6"/>
            <rect x="23" y="7" width="4" height="6" fill="none" stroke="white" strokeWidth="0.6"/>
          </svg>
        </button>
      </div>

      {showOddsDropdown && matchOdds && Object.keys(matchOdds).length > 0 && (
        <section className="detail-card compact-card" style={{ marginBottom: '0.5rem' }}>
          <FootballOddsBox markets={matchOdds} bttsResult={bttsResult} home={home} away={away} frozen={matchOddsFrozen} onRefresh={handleRefreshOdds} refreshing={refreshingOdds} lastRefreshed={lastRefreshedOdds} fixtureLeague={fixture?.league} />
        </section>
      )}

      {/* ── Grid ── */}
      <div className="detail-grid">

        {showLineup && (
          <div className="lineup-row-wrap">
            <RosterPanel
              home={home} away={away}
              homePlayers={homePlayers} awayPlayers={awayPlayers}
              loading={rosterLoading}
              homeNames={homeNames} awayNames={awayNames}
              onAssign={(team, name) => {
                const names = team === 'home' ? homeNames : awayNames;
                const setter = team === 'home' ? setHomeNames : setAwayNames;
                const used = names.findIndex(n => n === name);
                if (used !== -1) {
                  setter(n => { const c=[...n]; c[used]=''; return c; });
                } else {
                  const idx = names.findIndex(n => !n);
                  if (idx === -1) return;
                  setter(n => { const c=[...n]; c[idx]=name; return c; });
                }
              }}
            />
            <div className="detail-card lineup-card">
              <LineupBuilder
                home={home} away={away}
                homeForm={homeForm} awayForm={awayForm}
                setHomeForm={setHomeForm} setAwayForm={setAwayForm}
                homeNames={homeNames} awayNames={awayNames}
                setHomeNames={setHomeNames} setAwayNames={setAwayNames}
              />
            </div>
          </div>
        )}

        {showOddsDropdown && (
          <section className="detail-card compact-card">
            <h2 className="card-title">Statistiques saison</h2>
            <div className="stats-teams-header">
              <span>{effHome.tla || home.short}</span>
              <span>{effAway.tla || away.short}</span>
            </div>
            <div className="stat-bars">
              <StatBar label="Buts marqués"       home={+(effHome.goalsFor || 0).toFixed(2)}     away={+(effAway.goalsFor || 0).toFixed(2)} />
              <StatBar label="Buts encaissés"      home={+(effHome.goalsAgainst || 0).toFixed(2)} away={+(effAway.goalsAgainst || 0).toFixed(2)} higherIsBetter={false} />
              <StatBar label="xG (saison)"         home={+(effHome.xG || 0).toFixed(1)}  away={+(effAway.xG || 0).toFixed(1)} />
              <StatBar label="xGA (saison)"        home={+(effHome.xGA || 0).toFixed(1)} away={+(effAway.xGA || 0).toFixed(1)} higherIsBetter={false} />
              <StatBar label="Tirs / match"        home={effHome.shotsPerGame}    away={effAway.shotsPerGame} />
              <StatBar label="Tirs cadrés / match" home={effHome.shotsOnTarget}   away={effAway.shotsOnTarget} />
              <StatBar label="Possession (%)"      home={effHome.possession}      away={effAway.possession} unit="%" />
            </div>
          </section>
        )}

        {/* Derniers résultats — déplacé ici le 30 juillet 2026 (demande utilisateur) : à côté de
            "Statistiques saison" plutôt que sous l'onglet Compositions (showLineup). Frère direct
            dans .detail-grid (pas de grille imbriquée) pour occuper une colonne pleine comme le
            reste de la page — la 1ère tentative les avait réduits à un quart de largeur chacun.
            Données déjà génériques à tous les championnats football-data.org
            (fdGet('/teams/:id/matches')), pas spécifiques au Brasileirão — seul le placement changeait. */}
        {showOddsDropdown && (
          <section className="detail-card compact-card">
            <h2 className="card-title">Derniers résultats</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: '0 1rem' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', marginBottom: '0.4rem' }}>{home.short}</div>
                {homeMatches.length > 0
                  ? homeMatches.slice(0, 6).map((m, i) => <RecentMatchLine key={i} match={m} teamId={liveHomeStats?.id} />)
                  : <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Aucun match disponible</div>}
              </div>
              <div style={{ background: 'var(--border)' }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', marginBottom: '0.4rem' }}>{away.short}</div>
                {awayMatches.length > 0
                  ? awayMatches.slice(0, 6).map((m, i) => <RecentMatchLine key={i} match={m} teamId={liveAwayStats?.id} />)
                  : <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Aucun match disponible</div>}
              </div>
            </div>
          </section>
        )}

        {showLineup && (homeMatches.length > 0 || awayMatches.length > 0) && (() => {
          const awayId = liveAwayStats?.id;
          const realH2H = homeMatches
            .filter(m => m.homeId === awayId || m.awayId === awayId)
            .slice(0, 5)
            .map(m => ({ date: m.date.split('T')[0], home: m.homeTeam, away: m.awayTeam, scoreHome: m.scoreHome, scoreAway: m.scoreAway }));
          return realH2H.length > 0 && (
            <CollapsibleCard title="Confrontations directes (réelles)" className="h2h-card">
              <div className="h2h-list">
                {realH2H.map((m, i) => <H2HRow key={i} match={m} />)}
              </div>
            </CollapsibleCard>
          );
        })()}

        {showLineup && (() => {
          const upTeam    = upcomingSide === 'home' ? home : away;
          const upTeamId  = upcomingSide === 'home' ? liveHomeStats?.id : liveAwayStats?.id;
          const upMatches = upcomingSide === 'home' ? homeUpcoming : awayUpcoming;
          return (
            <section className="detail-card upcoming-card">
              <div className="upcoming-header-row">
                <span className="card-title upcoming-title-with-logo">
                  5 prochains matchs
                  <span
                    style={{
                      transition: 'transform 0.28s ease, opacity 0.28s ease',
                      transform: upcomingFlipping ? 'scaleX(0)' : 'scaleX(1)',
                      opacity: upcomingFlipping ? 0 : 1,
                      display: 'inline-flex',
                    }}
                  >
                    <TeamLogo name={upTeam.name} logoId={upTeam.logoId} size={16} />
                  </span>
                </span>
                <div className="upcoming-header-right">
                  <div
                    className="upcoming-flip-wrap"
                    style={{
                      transition: 'transform 0.28s ease, opacity 0.28s ease',
                      transform: upcomingFlipping ? 'scaleX(0)' : 'scaleX(1)',
                      opacity: upcomingFlipping ? 0 : 1,
                    }}
                  >
                    <UpcomingRow teamId={upTeamId} matches={upMatches} />
                  </div>
                  <button
                    className="upcoming-toggle-btn"
                    onClick={handleUpcomingToggle}
                    title={`Voir les prochains matchs de ${upcomingSide === 'home' ? away.short : home.short}`}
                  >
                    ⇄
                  </button>
                </div>
              </div>
            </section>
          );
        })()}



      </div>
    </div>
  );
}
