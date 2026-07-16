import { useState, useEffect, useMemo } from 'react';
import { syncSettlements, resolveCompletedFootballAlerts } from '../utils/syncAlerts';
import { BANKROLL_BRACKETS, BANKROLL_TARGET, getRecommendedStake, getEngagedToday, getBracketLabel, loadBankrollState, recordBet, resetBankroll, syncBankrollFromHistory, seedBaselineIfNeeded } from '../utils/bankroll';

const ROLLING_N = 20;
const DEFAULT_ODDS = 1.9;

// Séparation ancien / nouveau modèle — déplacée le 22 juin 2026 (12h51 UTC) : plancher de confiance
// unifié à 80%/75% (spécialiste), marge moyenne saison↔ligne + minimum volume 3pts étendus à
// NBA/WNBA/EU, win rate réel audité à 50.5% sur l'historique pré-22 juin (cf. audit calibration).
// Remplace l'ancien point de bascule du 10 juin 2026 (match Toronto Tempo @ Connecticut Sun),
// désormais regroupé dans "ancien modèle" — ce changement-ci est jugé plus significatif.
const MODEL_SPLIT_MS = new Date('2026-06-22T12:51:00Z').getTime();

// ── Chargement & normalisation ─────────────────────────────────────────────

function countAccepted(periodDays, sportFilter, typeFilter, model = 'new') {
  const now = Date.now();
  const rawCutoff = periodDays === Infinity ? 0 : now - periodDays * 24 * 3600_000;
  const cutoff   = model === 'new' ? Math.max(rawCutoff, MODEL_SPLIT_MS) : rawCutoff;
  const endCutoff = model === 'old' ? MODEL_SPLIT_MS : Infinity;
  // model === 'all' → rawCutoff + endCutoff=Infinity → tout afficher
  const inPeriod = date => { const t = new Date(date).getTime(); return !isNaN(t) && t >= cutoff && t < endCutoff; };
  const EU = ['euroleague','wnba','acb','lnb','bbl','legaa'];

  const props = JSON.parse(localStorage.getItem('nba_prop_alerts') || '[]')
    .filter(a => a.status === 'accepted' && inPeriod(a.fixtureDate))
    .filter(a => {
      const sport = EU.includes(a.league) ? a.league : 'nba';
      if (sportFilter !== 'all' && sport !== sportFilter) return false;
      if (typeFilter !== 'all' && 'prop' !== typeFilter) return false;
      return true;
    });

  const totals = JSON.parse(localStorage.getItem('nba_game_total_alerts') || '[]')
    .filter(a => a.status === 'accepted' && inPeriod(a.date))
    .filter(a => {
      if (sportFilter !== 'all' && (a.league || 'nba') !== sportFilter) return false;
      if (typeFilter !== 'all' && 'total' !== typeFilter) return false;
      return true;
    });

  const btts = JSON.parse(localStorage.getItem('fb_btts_alerts') || '[]')
    .filter(a => a.status === 'accepted' && inPeriod(a.fixtureDate))
    .filter(a => {
      if (sportFilter !== 'all' && sportFilter !== 'foot') return false;
      if (typeFilter !== 'all' && 'btts' !== typeFilter) return false;
      return true;
    });

  const fbTotals = JSON.parse(localStorage.getItem('fb_total_alerts') || '[]')
    .filter(a => a.status === 'accepted' && inPeriod(a.fixtureDate))
    .filter(a => {
      if (sportFilter !== 'all' && sportFilter !== 'foot') return false;
      if (typeFilter !== 'all' && 'total' !== typeFilter) return false;
      return true;
    });

  const fbResults = JSON.parse(localStorage.getItem('fb_result_alerts') || '[]')
    .filter(a => a.status === 'accepted' && inPeriod(a.fixtureDate))
    .filter(a => {
      if (sportFilter !== 'all' && sportFilter !== 'foot') return false;
      if (typeFilter !== 'all' && 'result' !== typeFilter) return false;
      return true;
    });

  const basketResults = JSON.parse(localStorage.getItem('basketball_result_alerts') || '[]')
    .filter(a => a.status === 'accepted' && inPeriod(a.date))
    .filter(a => {
      if (sportFilter !== 'all' && (a.league || 'nba') !== sportFilter) return false;
      if (typeFilter !== 'all' && 'result' !== typeFilter) return false;
      return true;
    });

  return props.length + totals.length + btts.length + fbTotals.length + fbResults.length + basketResults.length;
}

const DC_DIR = { '1x': '1X', 'x2': 'X2', '12': '12' };

const getBetOdds = a =>
  a.acceptedUnibetOdds ?? a.acceptedBetclicOdds ?? a.acceptedWinamaxOdds ?? a.acceptedPinnacleOdds ??
  a.unibetOdds ?? a.betclicOdds ?? a.winamaxOdds ?? a.pinnacleOdds ?? null;

// Transforme une entrée du registre permanent (backend /api/bet-history) dans le format d'affichage
// attendu par cette page — un seul mapping par type d'alerte, au lieu d'un bloc dupliqué par clé
// localStorage. _sourceKey est toujours 'bet_ledger'.
function mapLedgerEntry(a) {
  const base = {
    date: a.fixtureDate ?? a.date, status: a.status, odds: getBetOdds(a),
    probability: a.acceptedProbability ?? a.probability ?? a.prob,
    bookmaker: a.acceptedBookmaker ?? a.bookmaker,
    _sourceKey: 'bet_ledger', _alertId: a.id,
  };
  switch (a.type) {
    case 'player_prop':
      return { ...base, type: 'prop', sport: ['euroleague','wnba','acb','lnb','bbl','legaa'].includes(a.league) ? a.league : 'nba',
        label: a.player, sub: `${a.direction === 'over' ? '▲ Over' : '▼ Under'} ${a.line} ${(a.stat || '').toUpperCase()}`,
        actual: a.actualStat, stat: a.stat, direction: a.direction, line: a.line, league: a.league || 'nba' };
    case 'game_total':
      return { ...base, type: 'total', sport: a.league || 'nba',
        label: `${a.homeShort || a.home} vs ${a.awayShort || a.away}`,
        sub: `${a.direction === 'over' ? '▲ Over' : '▼ Under'} ${a.line}`,
        actual: a.actualStat ?? a.actualTotal, line: a.line, direction: a.direction, league: a.league || 'nba' };
    case 'basketball_result':
      return { ...base, type: 'result', sport: a.league || 'nba',
        label: `${a.homeShort || a.home} vs ${a.awayShort || a.away}`,
        sub: `🏆 Victoire ${a.direction === 'home' ? (a.homeShort || a.home) : (a.awayShort || a.away)}`,
        direction: a.direction, league: a.league || 'nba' };
    case 'football_btts':
      return { ...base, type: 'btts', sport: 'football',
        label: a.fixture || `${a.homeShort || a.home} vs ${a.awayShort || a.away}`,
        sub: '✓ Les deux équipes marquent',
        actual: (a.actualHomeScore != null && a.actualAwayScore != null) ? `${a.actualHomeScore}-${a.actualAwayScore}` : null,
        league: a.league || 'football' };
    case 'football_total':
      return { ...base, type: 'total', sport: 'football',
        label: `${a.homeShort || a.home} vs ${a.awayShort || a.away}`,
        sub: `${a.direction === 'over' ? '▲ Plus' : '▼ Moins'} de ${a.line} buts`,
        actual: (a.actualHomeScore != null && a.actualAwayScore != null) ? a.actualHomeScore + a.actualAwayScore : null,
        line: a.line, direction: a.direction, league: a.league || 'football' };
    case 'football_result':
      return { ...base, type: 'result', sport: 'football',
        label: `${a.homeShort || a.home} vs ${a.awayShort || a.away}`,
        sub: a.direction === 'draw' ? '🏆 Match nul' : `🏆 Victoire ${a.direction === 'home' ? (a.homeShort || a.home) : (a.awayShort || a.away)}`,
        actual: (a.actualHomeScore != null && a.actualAwayScore != null) ? `${a.actualHomeScore}-${a.actualAwayScore}` : null,
        direction: a.direction, league: a.league || 'football' };
    case 'football_dc_btts':
      return { ...base, type: 'btts', sport: 'football',
        label: `${a.homeShort || a.home} vs ${a.awayShort || a.away}`,
        sub: `DC ${DC_DIR[a.direction] ?? a.direction} & BTTS`,
        actual: (a.actualHomeScore != null && a.actualAwayScore != null) ? `${a.actualHomeScore}-${a.actualAwayScore}` : null,
        league: a.league || 'cdm' };
    case 'football_dc_ou':
      return { ...base, type: 'total', sport: 'football',
        label: `${a.homeShort || a.home} vs ${a.awayShort || a.away}`,
        sub: `DC ${DC_DIR[a.direction] ?? a.direction} & +${a.line ?? 1.5} buts`,
        actual: (a.actualHomeScore != null && a.actualAwayScore != null) ? a.actualHomeScore + a.actualAwayScore : null,
        line: a.line ?? 1.5, direction: 'over', league: a.league || 'cdm' };
    default:
      return null;
  }
}

// Source unique de vérité pour les résultats : le registre backend (/api/bet-history), jamais
// tronqué en bloc par une page frontend (cf. cause racine des résultats disparus le 7 juillet
// 2026). Les pages Alertes/Running restent la source des paris "en cours" (countAccepted
// ci-dessus, encore basé sur localStorage — un pari pas encore réglé n'a pas sa place ici).
async function loadAllResolved(periodDays, model = 'new') {
  const now = Date.now();
  const rawCutoff = periodDays === Infinity ? 0 : now - periodDays * 24 * 3600_000;
  const cutoff    = model === 'new' ? Math.max(rawCutoff, MODEL_SPLIT_MS) : rawCutoff;
  const endCutoff = model === 'old' ? MODEL_SPLIT_MS : Infinity;

  const ledger = await fetch('/api/bet-history').then(r => r.ok ? r.json() : []).catch(() => []);
  return ledger
    .filter(a => ['won', 'lost'].includes(a.status))
    .map(mapLedgerEntry)
    .filter(Boolean)
    .filter(a => { const t = new Date(a.date).getTime(); return !isNaN(t) && t >= cutoff && t < endCutoff; })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function loadPinnacleBets(periodDays) {
  const now = Date.now();
  const cutoff = periodDays === Infinity ? 0 : now - periodDays * 24 * 3600_000;

  const fbPin = JSON.parse(localStorage.getItem('fb_pinnacle_alerts') || '[]')
    .filter(a => ['won', 'lost'].includes(a.status))
    .map(a => ({
      type: 'pinnacle', sport: 'football',
      label: `${a.homeShort || a.home} vs ${a.awayShort || a.away}`,
      sub: a.market === 'totals'
        ? `${a.direction === 'over' ? '▲ Plus' : '▼ Moins'} de ${a.line} buts`
        : a.direction === 'draw' ? 'Match nul' : `Victoire ${a.direction === 'home' ? (a.homeShort || a.home) : (a.awayShort || a.away)}`,
      date: a.fixtureDate, status: a.status,
      odds: a.acceptedUnibetOdds ?? a.acceptedBetclicOdds ?? a.acceptedWinamaxOdds ??
            a.unibetOdds ?? a.betclicOdds ?? a.winamaxOdds ?? null,
      edge: a.edge ?? null,
      actual: (a.actualHomeScore != null && a.actualAwayScore != null) ? `${a.actualHomeScore}-${a.actualAwayScore}` : null,
      direction: a.direction, league: a.league || 'football', sport2: 'foot',
      bookmaker: a.acceptedBookmaker,
    }));

  const bballPin = JSON.parse(localStorage.getItem('bball_pinnacle_alerts') || '[]')
    .filter(a => ['won', 'lost'].includes(a.status))
    .map(a => ({
      type: 'pinnacle', sport: a.league || 'wnba',
      label: `${a.homeShort || a.home} vs ${a.awayShort || a.away}`,
      sub: a.market === 'h2h'
        ? `Victoire ${a.direction === 'home' ? (a.homeShort || a.home) : (a.awayShort || a.away)}`
        : `${a.direction === 'over' ? '▲ Plus' : '▼ Moins'} de ${a.line} pts`,
      date: a.date, status: a.status,
      odds: a.acceptedUnibetOdds ?? a.acceptedBetclicOdds ?? a.unibetOdds ?? a.betclicOdds ?? null,
      edge: a.edge ?? null,
      actual: a.actualTotal ?? a.actualStat ?? null,
      direction: a.direction, line: a.line, league: a.league || 'wnba', sport2: 'basket',
      bookmaker: a.acceptedBookmaker,
    }));

  return [...fbPin, ...bballPin]
    .filter(a => { const t = new Date(a.date).getTime(); return !isNaN(t) && t >= cutoff; })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// ── Calculs ────────────────────────────────────────────────────────────────

function calcMetrics(bets) {
  const resolved = bets.filter(b => ['won', 'lost', 'void'].includes(b.status));
  const nonVoid  = resolved.filter(b => b.status !== 'void');
  const won      = nonVoid.filter(b => b.status === 'won');
  let pl = 0;
  for (const b of nonVoid) {
    const o = b.odds ?? DEFAULT_ODDS;
    pl += b.status === 'won' ? o - 1 : -1;
  }
  const winRate = nonVoid.length > 0 ? (won.length / nonVoid.length * 100) : null;
  const roi     = nonVoid.length > 0 ? (pl / nonVoid.length * 100) : null;
  return { total: resolved.length, won: won.length, lost: nonVoid.length - won.length, void: resolved.length - nonVoid.length, winRate, pl, roi };
}

function calcDrawdown(bets) {
  const nonVoid = bets.filter(b => b.status !== 'void');
  let peak = 0, cum = 0, maxDD = 0;
  let curWin = 0, curLoss = 0, maxWin = 0, maxLoss = 0;
  for (const b of nonVoid) {
    const o = b.odds ?? DEFAULT_ODDS;
    if (b.status === 'won') { cum += o - 1; curWin++; curLoss = 0; }
    else { cum -= 1; curLoss++; curWin = 0; }
    maxWin  = Math.max(maxWin, curWin);
    maxLoss = Math.max(maxLoss, curLoss);
    if (cum > peak) peak = cum;
    maxDD = Math.max(maxDD, peak - cum);
  }
  return { maxDD, maxWin, maxLoss };
}

function calcSignificance(bets) {
  const nonVoid = bets.filter(b => b.status !== 'void');
  const n = nonVoid.length;
  if (n < 10) return { label: 'Trop peu de données', color: '#94a3b8', icon: '—', z: null };
  const won = nonVoid.filter(b => b.status === 'won').length;
  const pHat = won / n;
  const avgOdds = nonVoid.reduce((s, b) => s + (b.odds ?? DEFAULT_ODDS), 0) / n;
  const p0 = 1 / avgOdds;
  const z = (pHat - p0) / Math.sqrt(p0 * (1 - p0) / n);
  if (z <= 0)   return { label: 'Pas d\'edge',          color: '#ef4444', icon: '✗', z, p0 };
  if (z > 2.33) return { label: 'Très significatif',   color: '#4ade80', icon: '✓✓', z, p0, level: 99 };
  if (z > 1.65) return { label: 'Significatif (95%)',  color: '#4ade80', icon: '✓',  z, p0, level: 95 };
  if (z > 1.28) return { label: 'Marginal (90%)',      color: '#f59e0b', icon: '~',  z, p0, level: 90 };
  return { label: 'Non significatif', color: '#ef4444', icon: '?', z, p0 };
}

function buildCumPL(bets) {
  let cum = 0;
  return bets.filter(b => b.status !== 'void').map((b, i) => {
    const o = b.odds ?? DEFAULT_ODDS;
    cum += b.status === 'won' ? o - 1 : -1;
    return { i: i + 1, pl: cum, date: b.date, status: b.status };
  });
}

function buildRollingWR(bets, n = ROLLING_N) {
  const nonVoid = bets.filter(b => b.status !== 'void');
  if (nonVoid.length < n) return [];
  return nonVoid.slice(n - 1).map((_, i) => {
    const window = nonVoid.slice(i, i + n);
    const won = window.filter(b => b.status === 'won').length;
    return { i: i + n, rate: won / n * 100, date: nonVoid[i + n - 1].date };
  });
}

function byBookmaker(bets) {
  const books = {};
  for (const b of bets.filter(x => x.status !== 'void')) {
    const bk = b.bookmaker || 'inconnu';
    if (!books[bk]) books[bk] = { won: 0, lost: 0, pl: 0 };
    const o = b.odds ?? DEFAULT_ODDS;
    if (b.status === 'won') { books[bk].won++; books[bk].pl += o - 1; }
    else { books[bk].lost++; books[bk].pl -= 1; }
  }
  return Object.entries(books)
    .map(([bk, s]) => ({ bk, ...s, total: s.won + s.lost, winRate: s.won / (s.won + s.lost) * 100, roi: s.pl / (s.won + s.lost) * 100 }))
    .sort((a, b) => b.total - a.total);
}

function byTypeStats(bets) {
  const groups = {
    'Props Pts ▲': bets.filter(b => b.type === 'prop' && b.stat === 'pts' && b.direction === 'over'),
    'Props Pts ▼': bets.filter(b => b.type === 'prop' && b.stat === 'pts' && b.direction === 'under'),
    'Props Reb ▲': bets.filter(b => b.type === 'prop' && b.stat === 'reb' && b.direction === 'over'),
    'Props Reb ▼': bets.filter(b => b.type === 'prop' && b.stat === 'reb' && b.direction === 'under'),
    'Props Ast ▲': bets.filter(b => b.type === 'prop' && b.stat === 'ast' && b.direction === 'over'),
    'Props Ast ▼': bets.filter(b => b.type === 'prop' && b.stat === 'ast' && b.direction === 'under'),
    'Total O/U':   bets.filter(b => b.type === 'total'),
    'BTTS':        bets.filter(b => b.type === 'btts'),
    'Résultat':    bets.filter(b => b.type === 'result'),
  };
  return Object.entries(groups).map(([label, arr]) => ({ label, ...calcMetrics(arr) })).filter(g => g.total > 0);
}

function calibrationBands(bets) {
  const bands = [
    { label: '50–65%', min: 50, max: 65 },
    { label: '65–75%', min: 65, max: 75 },
    { label: '75–85%', min: 75, max: 85 },
    { label: '85%+',   min: 85, max: 101 },
  ];
  return bands.map(band => {
    // Comparaison sur la probabilité arrondie (même valeur que celle affichée sur la carte du pari,
    // cf. bet.probability.toFixed(0) plus bas) — sinon deux paris affichés "75%" pouvaient atterrir
    // dans deux bandes différentes si leurs valeurs brutes étaient par ex. 74.6% et 75.3%.
    const b = bets.filter(x => x.status !== 'void' && x.probability != null && Math.round(x.probability) >= band.min && Math.round(x.probability) < band.max);
    const won = b.filter(x => x.status === 'won').length;
    return { ...band, total: b.length, won, rate: b.length > 0 ? (won / b.length * 100) : null };
  });
}

// ── Calibration par catégorie ──────────────────────────────────────────────
// Pour chaque catégorie (stat × groupe de ligue, ou type de pari foot), calcule
// le win rate réel cumulatif "probabilité affichée >= seuil" — permet de voir à
// partir de quel % affiché les alertes deviennent vraiment fiables.

const EU_BASKET_LEAGUES = new Set(['acb', 'lnb', 'bbl', 'legaa', 'euroleague']);
const CALIB_THRESHOLDS = [55, 60, 65, 70, 75, 80, 85, 90];

function categoryKey(b) {
  if (b.type === 'prop') {
    const grp = EU_BASKET_LEAGUES.has(b.sport) ? 'EU' : b.sport === 'wnba' ? 'WNBA' : 'NBA';
    return `${grp} · ${(b.stat || '?').toUpperCase()}`;
  }
  if (b.type === 'total')  return b.sport === 'football' ? 'Foot · O/U' : `${(b.sport || '?').toUpperCase()} · O/U`;
  if (b.type === 'btts')   return 'Foot · BTTS';
  if (b.type === 'result') return 'Foot · Résultat';
  return 'Autre';
}

// Ordre d'affichage demandé : Foot (Résultat, O/U, BTTS) sur une ligne, basket
// (Pts, Reb, Ast, 3pm, puis O/U match) sur la ligne suivante.
const FOOT_CAT_ORDER = { 'Foot · Résultat': 0, 'Foot · O/U': 1, 'Foot · BTTS': 2 };
const BASKET_STAT_ORDER = { PTS: 0, REB: 1, AST: 2, TPM: 3 };

function categorySortKey(key) {
  if (key in FOOT_CAT_ORDER) return [0, FOOT_CAT_ORDER[key]];
  const stat = key.match(/· (PTS|REB|AST|TPM)$/)?.[1];
  if (stat) return [1, BASKET_STAT_ORDER[stat]];
  if (key.endsWith('· O/U')) return [1, 4];
  return [2, 0];
}

function calibrationByCategory(bets) {
  const groups = {};
  for (const b of bets) {
    if (b.status === 'void' || b.probability == null) continue;
    const key = categoryKey(b);
    (groups[key] ||= []).push(b);
  }
  return Object.entries(groups)
    .map(([key, arr]) => {
      // Buckets exclusifs (chaque pari compté une seule fois, jamais répliqué dans plusieurs
      // seuils) — demandé le 12 juillet 2026 : l'ancien système cumulatif "≥seuil" comptait un
      // pari à 74% dans les lignes 55%, 60%, 65% ET 70% à la fois, ce qui donnait l'impression
      // (à tort niveau calcul, mais trompeur à l'affichage) que les paris à haute probabilité
      // étaient dupliqués partout au lieu d'être rangés dans une seule catégorie claire.
      const rows = CALIB_THRESHOLDS.map((t, i) => {
        const next = CALIB_THRESHOLDS[i + 1] ?? Infinity;
        // Même arrondi que l'affichage (cf. calibrationBands ci-dessus) — sinon deux paris affichés
        // "75%" pouvaient se répartir dans deux seuils différents selon leur valeur brute non arrondie.
        const subset = arr.filter(a => { const p = Math.round(a.probability); return p >= t && p < next; });
        if (subset.length === 0) return null;
        const won = subset.filter(a => a.status === 'won').length;
        const sorted = [...subset].sort((a, b) => new Date(b.date) - new Date(a.date));
        return { threshold: t, minThreshold: t, maxThreshold: next, n: subset.length, won, rate: won / subset.length * 100, bets: sorted };
      }).filter(Boolean);
      // La ligne la plus haute occupée est toujours ouverte ("≥seuil%") : aucun pari de cette
      // catégorie ne dépasse ce seuil, donc pas de fourchette figée à afficher au-dessus.
      if (rows.length) rows[rows.length - 1].maxThreshold = Infinity;
      return { key, total: arr.length, rows };
    })
    .filter(g => g.total >= 1)
    .sort((a, b) => {
      const [ga, sa] = categorySortKey(a.key);
      const [gb, sb] = categorySortKey(b.key);
      return ga !== gb ? ga - gb : sa !== sb ? sa - sb : b.total - a.total;
    });
}

function exportCSV(bets) {
  const BOM = '﻿';
  const headers = ['Date', 'Label', 'Détail', 'Type', 'Sport', 'Direction', 'Ligne', 'Stat', 'Cote', 'Probabilité (%)', 'Bookmaker', 'Résultat', 'Réalisé'];
  const rows = bets.map(b => [
    new Date(b.date).toLocaleDateString('fr-FR'),
    b.label,
    b.sub,
    b.type,
    b.sport,
    b.direction || '',
    b.line ?? '',
    b.stat || '',
    b.odds?.toFixed(2) ?? '',
    b.probability ?? '',
    b.bookmaker || '',
    b.status,
    b.actual ?? '',
  ]);
  const csv = BOM + [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `backtesting_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Composants visuels ─────────────────────────────────────────────────────

// Suivi bankroll + plan de mise progressif (16 juillet 2026) — objectif 10 000€ depuis 250€.
// La mise recommandée dépend uniquement du bankroll actuel (jamais de l'émotion du moment) : elle
// ne change qu'en passant un palier, à la hausse comme à la baisse. cf. src/utils/bankroll.js.
function BankrollTracker() {
  const [state, setState] = useState(loadBankrollState);
  const [oddsInput, setOddsInput] = useState('1.70');
  const [showTools, setShowTools] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetAmount, setResetAmount] = useState('250');
  const [syncing, setSyncing] = useState(false);

  // Auto-sync depuis le registre de paris backend (source de vérité) — au montage, puis toutes les
  // 2 min tant que la page reste ouverte. Chaque pari won/lost non encore traité (processedIds) est
  // appliqué automatiquement, plus besoin de cliquer Gagné/Perdu à la main (16 juillet 2026).
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      setSyncing(true);
      seedBaselineIfNeeded(loadBankrollState())
        .then(syncBankrollFromHistory)
        .then(next => {
          if (!cancelled) setState(next);
          setSyncing(false);
        });
    };
    run();
    const id = setInterval(run, 2 * 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const bk = state.current;
  const stake = getRecommendedStake(bk);
  const bracket = getBracketLabel(bk);
  const progressPct = Math.min(100, (bk / BANKROLL_TARGET) * 100);
  const reachedTarget = bk >= BANKROLL_TARGET;
  const engagedToday = getEngagedToday();
  const remaining = Math.max(0, stake - engagedToday.total);

  const applyBet = won => {
    const odds = Math.max(1.01, +oddsInput || 1.70);
    setState(recordBet(state, { won, odds }));
  };
  const doReset = () => {
    const amount = Math.max(1, +resetAmount || 250);
    setShowResetConfirm(false);
    resetBankroll(state, amount).then(setState);
  };

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6' }}>Suivi Bankroll</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginTop: '0.3rem' }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{bk.toFixed(0)}€</span>
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>/ objectif {BANKROLL_TARGET.toLocaleString('fr-FR')}€</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>Mise recommandée</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#4ade80' }}>{remaining}€</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>(~{bracket.pct} du BK)</span>
          </div>
          {engagedToday.stakes.length > 0 && (
            <div title={engagedToday.stakes.map(s => `${s}€`).join(' + ')} style={{ fontSize: 11, fontWeight: 700, color: engagedToday.total > stake ? '#fbbf24' : 'var(--text-dim)', marginTop: 4 }}>
              {engagedToday.stakes.join('€ + ')}€ engagés aujourd'hui (sur {stake}€)
            </div>
          )}
        </div>
      </div>

      {/* Barre de progression */}
      <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: '1rem' }}>
        <div style={{ height: '100%', width: `${progressPct}%`, background: reachedTarget ? '#4ade80' : 'linear-gradient(90deg,#3b82f6,#60a5fa)', transition: 'width 0.3s' }} />
      </div>

      {reachedTarget && (
        <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', marginBottom: '1rem' }}>🎉 Objectif atteint !</div>
      )}

      {/* Synchro auto depuis le registre de paris — tout le reste (ajout manuel, historique,
          réinitialiser) est secondaire et repoussé sous un menu déroulant (16 juillet 2026) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', marginBottom: showTools ? '0.75rem' : 0 }}>
        <span style={{ fontSize: 10, color: syncing ? '#60a5fa' : 'var(--text-dim)' }}>
          {syncing ? '⟳ Synchronisation...' : '✓ Mis à jour automatiquement après chaque pari réglé'}
        </span>
        <button onClick={() => setShowTools(v => !v)} style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-dim)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          ⚙ Options {showTools ? '▲' : '▼'}
        </button>
      </div>

      {showTools && (
      <>
      {/* Ajustement manuel (secours — pari hors système, correction...) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Ajout manuel — cote :</span>
        <input type="number" step="0.01" min="1.01" value={oddsInput} onChange={e => setOddsInput(e.target.value)}
          style={{ width: 64, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'var(--text)', fontSize: 12, fontWeight: 600, padding: '4px 8px', outline: 'none' }} />
        <button onClick={() => applyBet(true)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(74,222,128,0.4)', background: 'rgba(74,222,128,0.12)', color: '#4ade80', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          ✓ Gagné (mise {stake}€)
        </button>
        <button onClick={() => applyBet(false)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          ✗ Perdu (mise {stake}€)
        </button>
        <button onClick={() => setShowHistory(v => !v)} style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-dim)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          {showHistory ? 'Masquer' : 'Historique'} ({state.history.filter(h => h.type !== 'reset').length})
        </button>
        <button onClick={() => setShowResetConfirm(v => !v)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-dim)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          Réinitialiser
        </button>
      </div>
      </>
      )}

      {showTools && showResetConfirm && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem', background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.3)', borderRadius: 10, marginBottom: '0.75rem' }}>
          <span style={{ fontSize: 11, color: '#fb923c' }}>Nouveau bankroll de départ :</span>
          <input type="number" min="1" value={resetAmount} onChange={e => setResetAmount(e.target.value)}
            style={{ width: 72, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'var(--text)', fontSize: 12, fontWeight: 600, padding: '4px 8px', outline: 'none' }} />
          <button onClick={doReset} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(251,146,60,0.5)', background: 'rgba(251,146,60,0.15)', color: '#fb923c', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Confirmer</button>
          <button onClick={() => setShowResetConfirm(false)} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-dim)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
        </div>
      )}

      {/* Table des paliers */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: showHistory ? '0.75rem' : 0 }}>
        {BANKROLL_BRACKETS.map((b, i) => {
          const next = BANKROLL_BRACKETS[i + 1];
          const isCurrent = bk >= b.min && (!next || bk < next.min);
          const label = b.stake != null ? `${b.stake}€` : '5% BK';
          return (
            <div key={b.min} style={{
              fontSize: 10, padding: '3px 8px', borderRadius: 6,
              background: isCurrent ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isCurrent ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.08)'}`,
              color: isCurrent ? '#60a5fa' : 'var(--text-dim)', fontWeight: isCurrent ? 700 : 500,
            }}>
              {b.min}€+ → {label}
            </div>
          );
        })}
      </div>

      {showTools && showHistory && (
        <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {state.history.filter(h => h.type !== 'reset').length === 0 && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Aucun pari enregistré pour l'instant.</span>}
          {[...state.history].filter(h => h.type !== 'reset').reverse().map((h, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 11, padding: '0.35rem 0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
              <span style={{ color: 'var(--text-dim)', minWidth: 90 }}>{new Date(h.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              <span style={{ color: h.type === 'win' ? '#4ade80' : '#ef4444', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {h.type === 'win' ? '✓' : '✗'} mise {h.stake}€ @ {h.odds}
              </span>
              {h.betLabel && <span style={{ color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.betLabel}</span>}
              <span style={{ color: h.profit >= 0 ? '#4ade80' : '#ef4444' }}>{h.profit >= 0 ? '+' : ''}{h.profit}€</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>→ {h.balanceAfter}€</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, color, small, pinnacle }) {
  return (
    <div style={{
      flex: 1, minWidth: small ? 90 : 110,
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${pinnacle ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 14, padding: small ? '0.75rem 1rem' : '1rem 1.25rem',
      display: 'flex', flexDirection: 'column', gap: '0.2rem',
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: pinnacle ? '#60a5fa' : 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontSize: small ? 18 : 24, fontWeight: 800, color: color || 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{sub}</span>}
    </div>
  );
}

function SigBadge({ sig, pinnacle }) {
  if (!sig) return null;
  return (
    <div style={{
      flex: 1, minWidth: 140,
      background: `${sig.color}10`,
      border: `1px solid ${pinnacle ? 'rgba(96,165,250,0.3)' : `${sig.color}44`}`,
      borderRadius: 14, padding: '0.75rem 1rem',
      display: 'flex', flexDirection: 'column', gap: '0.2rem',
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: pinnacle ? '#60a5fa' : 'var(--text-dim)' }}>Significativité</span>
      <span style={{ fontSize: 18, fontWeight: 800, color: sig.color }}>{sig.icon} {sig.label}</span>
      {sig.z != null && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
          z = {sig.z.toFixed(2)} · seuil équil. {(sig.p0 * 100).toFixed(1)}%
        </span>
      )}
    </div>
  );
}

function LineChart({ points, yKey, color, label, yFormat, baseline }) {
  if (points.length < 2) return (
    <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
      Pas assez de données ({ROLLING_N} paris min.)
    </div>
  );
  const W = 600, H = 120, PAD = { t: 10, b: 22, l: 36, r: 10 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;
  const vals = points.map(p => p[yKey]);
  const base = baseline ?? 0;
  const minV = Math.min(base, ...vals);
  const maxV = Math.max(base, ...vals);
  const range = maxV - minV || 1;
  const xOf = i => PAD.l + (i / (points.length - 1)) * iW;
  const yOf = v => PAD.t + iH - ((v - minV) / range) * iH;
  const y0  = yOf(base);
  const ptsStr = points.map((p, i) => `${xOf(i)},${yOf(p[yKey])}`).join(' ');
  const area = `M ${xOf(0)},${y0} ` + points.map((p, i) => `L ${xOf(i)},${yOf(p[yKey])}`).join(' ') + ` L ${xOf(points.length - 1)},${y0} Z`;
  const lastV = vals[vals.length - 1];
  const lineColor = color || (lastV >= base ? '#4ade80' : '#ef4444');
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      <line x1={PAD.l} x2={W - PAD.r} y1={y0} y2={y0} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4,3" />
      <path d={area} fill={`${lineColor}18`} />
      <polyline points={ptsStr} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xOf(points.length - 1)} cy={yOf(lastV)} r="4" fill={lineColor} />
      <text x={xOf(points.length - 1) + 6} y={yOf(lastV) + 4} fontSize="10" fill={lineColor} fontFamily="inherit" fontWeight="700">
        {yFormat ? yFormat(lastV) : lastV.toFixed(1)}
      </text>
      {[0, Math.floor(points.length / 2), points.length - 1].map(i => (
        <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.25)" fontFamily="inherit">
          #{points[i].i}
        </text>
      ))}
    </svg>
  );
}

function PLChart({ points }) {
  if (points.length < 2) return (
    <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
      Pas assez de données
    </div>
  );
  const W = 600, H = 140, PAD = { t: 12, b: 24, l: 40, r: 12 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;
  const pls = points.map(p => p.pl);
  const minPL = Math.min(0, ...pls);
  const maxPL = Math.max(0, ...pls);
  const range = maxPL - minPL || 1;
  const xOf = i => PAD.l + (i / (points.length - 1)) * iW;
  const yOf = v => PAD.t + iH - ((v - minPL) / range) * iH;
  const y0  = yOf(0);
  const pts = points.map((p, i) => `${xOf(i)},${yOf(p.pl)}`).join(' ');
  const area = `M ${xOf(0)},${y0} ` + points.map((p, i) => `L ${xOf(i)},${yOf(p.pl)}`).join(' ') + ` L ${xOf(points.length - 1)},${y0} Z`;
  const lastPL = points[points.length - 1].pl;
  const lineColor = lastPL >= 0 ? '#4ade80' : '#ef4444';
  const step = range <= 2 ? 0.5 : range <= 5 ? 1 : range <= 10 ? 2 : 5;
  const ticks = [];
  for (let v = Math.ceil(minPL / step) * step; v <= maxPL + 0.001; v += step) ticks.push(v);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      {ticks.map(v => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={yOf(v)} y2={yOf(v)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <text x={PAD.l - 5} y={yOf(v) + 4} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.3)" fontFamily="inherit">
            {v > 0 ? '+' : ''}{v.toFixed(1)}
          </text>
        </g>
      ))}
      <line x1={PAD.l} x2={W - PAD.r} y1={y0} y2={y0} stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="4,3" />
      <path d={area} fill={lastPL >= 0 ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)'} />
      <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xOf(points.length - 1)} cy={yOf(lastPL)} r="4" fill={lineColor} />
      {[0, Math.floor(points.length / 2), points.length - 1].map(i => (
        <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.3)" fontFamily="inherit">
          #{points[i].i}
        </text>
      ))}
    </svg>
  );
}

function CalibrationRow({ band }) {
  const { label, total, won, rate } = band;
  if (total === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: 0.35, fontSize: 12 }}>
      <span style={{ width: 50, color: 'var(--text-dim)', fontSize: 11 }}>{label}</span>
      <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</span>
    </div>
  );
  const diff = rate - ((band.min + Math.min(band.max, 100)) / 2);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <span style={{ width: 50, fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${rate}%`, background: rate >= 55 ? '#4ade80' : '#ef4444', borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{rate.toFixed(0)}%</span>
      <span style={{ fontSize: 10, color: diff >= 0 ? '#4ade80' : '#ef4444', minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {diff >= 0 ? '+' : ''}{diff.toFixed(0)}pp
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', minWidth: 28, textAlign: 'right' }}>{won}/{total}</span>
    </div>
  );
}

function CalibCategoryCard({ group }) {
  const [openThreshold, setOpenThreshold] = useState(null);
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '0.75rem 0.9rem' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>
        {group.key} <span style={{ fontWeight: 400, color: 'var(--text-dim)', fontSize: 10 }}>(n={group.total})</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {group.rows.map(r => {
          const isOpen = openThreshold === r.minThreshold;
          const color = r.rate >= 85 ? '#4ade80' : r.rate >= 50 ? '#f59e0b' : '#ef4444';
          // Buckets exclusifs (cf. calibrationByCategory) : chaque pari n'apparaît que dans une
          // seule ligne. "≥seuil%" pour la ligne la plus haute occupée (rien au-dessus dans cette
          // catégorie), sinon la vraie fourchette exclusive "min–max%".
          const label = r.maxThreshold === Infinity ? `≥${r.minThreshold}%` : `${r.minThreshold}–${r.maxThreshold}%`;
          return (
            <div key={r.minThreshold}>
              <div
                onClick={() => setOpenThreshold(isOpen ? null : r.minThreshold)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', padding: '2px 4px', borderRadius: 5, background: isOpen ? 'rgba(255,255,255,0.04)' : 'transparent' }}
              >
                <span style={{ width: 56, fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{label}</span>
                <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${r.rate}%`, background: color, borderRadius: 3, transition: 'width 0.4s' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color }}>
                  {r.rate.toFixed(0)}%
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', minWidth: 36, textAlign: 'right' }}>{r.won}/{r.n}</span>
              </div>
              {isOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', margin: '0.35rem 0 0.35rem 0', paddingLeft: '0.25rem', borderLeft: '2px solid rgba(255,255,255,0.08)' }}>
                  {r.bets.map((bet, i) => <BetRow key={bet.id ?? i} bet={bet} rank={r.bets.length - i} compact />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DonutResults({ metrics, accepted = 0 }) {
  const segments = [
    { key: 'won',      label: 'Gagné',   color: '#4ade80', count: metrics.won },
    { key: 'lost',     label: 'Perdu',   color: '#ef4444', count: metrics.lost },
    { key: 'accepted', label: 'En jeu',  color: '#60a5fa', count: accepted },
  ].filter(s => s.count > 0);
  const total = metrics.won + metrics.lost + accepted;
  if (total === 0) return <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, padding: '2rem 0' }}>Aucun résultat</div>;

  const R = 53, r = 35, cx = 80, cy = 80;
  const toXY = (pct, rad) => {
    const a = pct * 2 * Math.PI - Math.PI / 2;
    return { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) };
  };
  const arc = (startPct, pct) => {
    const s = toXY(startPct, R), e = toXY(startPct + pct, R);
    const is = toXY(startPct, r), ie = toXY(startPct + pct, r);
    const large = pct > 0.5 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} 1 ${e.x} ${e.y} L ${ie.x} ${ie.y} A ${r} ${r} 0 ${large} 0 ${is.x} ${is.y} Z`;
  };

  let offset = 0;
  const arcs = segments.map(s => {
    const pct = s.count / total;
    const a = { ...s, pct, offset };
    offset += pct;
    return a;
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.75rem', padding: '0.5rem 0' }}>
      <svg width={160} height={160} viewBox="0 0 160 160" style={{ flexShrink: 0 }}>
        {arcs.map(a => (
          <path key={a.key} d={arc(a.offset, a.pct)} fill={a.color} opacity={0.85} />
        ))}
        <text x={cx} y={cy - 6}  textAnchor="middle" fontSize="19" fontWeight="800" fill="var(--text)" fontFamily="inherit">{total}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.45)" fontFamily="inherit">résultats</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {arcs.map(a => (
          <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 12, borderRadius: 6, background: a.color }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{a.label} <span style={{ color: a.color }}>{a.count}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SECTIONS = [
  { key: 'pl',       label: 'P&L cumulé' },
  { key: 'rolling',  label: `Win Rate glissant` },
  { key: 'last20',   label: '20 derniers paris' },
  { key: 'calib',    label: 'Calibration modèle' },
  { key: 'repartition', label: 'Répartition des résultats' },
  { key: 'types',    label: 'Performance par type' },
  { key: 'history',  label: 'Historique complet' },
];

const TYPE_COLORS = {
  'Props Pts ▲': '#4ade80', 'Props Pts ▼': '#60a5fa',
  'Props Reb ▲': '#4ade80', 'Props Reb ▼': '#60a5fa',
  'Props Ast ▲': '#4ade80', 'Props Ast ▼': '#60a5fa',
  'Total O/U': '#f97316', 'BTTS': '#10b981',
};
const BK_COLORS   = { unibet: '#1db954', betclic: '#e0292e', winamax: '#e5e7eb', pinnacle: '#3b82f6', inconnu: '#64748b' };

function TypeStatsRow({ g }) {
  const roiColor = g.roi == null ? 'var(--text-dim)' : g.roi >= 0 ? '#4ade80' : '#ef4444';
  const wrColor  = g.winRate == null ? 'var(--text-dim)' : g.winRate >= 50 ? '#4ade80' : '#ef4444';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '90px 40px 40px 1fr 60px 60px', alignItems: 'center', gap: '0 0.75rem', padding: '0.4rem 0.75rem', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: TYPE_COLORS[g.label] || 'var(--text)' }}>{g.label}</span>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>{g.total}</span>
      <span style={{ fontSize: 11, color: '#4ade80', textAlign: 'center' }}>{g.won}W</span>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${g.winRate ?? 0}%`, background: TYPE_COLORS[g.label] || '#60a5fa', borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: wrColor, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {g.winRate != null ? `${g.winRate.toFixed(0)}%` : '—'}
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color: roiColor, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {g.roi != null ? `${g.roi >= 0 ? '+' : ''}${g.roi.toFixed(1)}%` : '—'}
      </span>
    </div>
  );
}

function BookmakerRow({ g }) {
  const bkColor  = BK_COLORS[g.bk] || '#64748b';
  const roiColor = g.roi >= 0 ? '#4ade80' : '#ef4444';
  const wrColor  = g.winRate >= 50 ? '#4ade80' : '#ef4444';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 36px 36px 1fr 56px 60px', alignItems: 'center', gap: '0 0.75rem', padding: '0.4rem 0.75rem', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: bkColor, textTransform: 'capitalize' }}>{g.bk}</span>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>{g.total}</span>
      <span style={{ fontSize: 11, color: '#4ade80', textAlign: 'center' }}>{g.won}W</span>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${g.winRate}%`, background: bkColor, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: wrColor, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {g.winRate.toFixed(0)}%
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color: roiColor, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {g.roi >= 0 ? '+' : ''}{g.roi.toFixed(1)}%
      </span>
    </div>
  );
}

function _getBetNotes() { try { return JSON.parse(localStorage.getItem('bet_notes') || '{}'); } catch { return {}; } }
function _saveBetNote(key, val) {
  try {
    const notes = _getBetNotes();
    if (val.trim()) notes[key] = val.trim(); else delete notes[key];
    localStorage.setItem('bet_notes', JSON.stringify(notes));
  } catch {}
}

function BetRow({ bet, rank, stake = 10, compact = false }) {
  const isWon  = bet.status === 'won';
  const isVoid = bet.status === 'void';
  const statusColor = isVoid ? '#94a3b8' : isWon ? '#4ade80' : '#ef4444';
  const o = bet.odds ?? 1.9;
  const pl = isVoid ? null : isWon ? (o - 1) * stake : -stake;
  const plColor = pl == null ? '#94a3b8' : pl >= 0 ? '#4ade80' : '#ef4444';
  const plStr = pl == null ? '—' : `${pl >= 0 ? '+' : ''}${pl.toFixed(0)}€`;
  const dateStr = new Date(bet.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

  const betKey = `${bet.date}_${bet.label}_${bet.sub}`;
  const [note, setNote] = useState(() => _getBetNotes()[betKey] || '');
  const [editing, setEditing] = useState(false);
  // Resync si le composant est réutilisé avec un autre pari (key=index en contexte compact)
  useEffect(() => { setNote(_getBetNotes()[betKey] || ''); }, [betKey]);

  const handleNoteBlur = (val) => {
    setEditing(false);
    _saveBetNote(betKey, val);
  };

  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0.3rem 0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.02)', borderLeft: `3px solid ${statusColor}44`, fontSize: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', flexShrink: 0 }}>#{rank}</span>
          <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{bet.label}</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: statusColor, flexShrink: 0 }}>{isVoid ? 'V' : isWon ? '✓' : '✗'}</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: plColor, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{plStr}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', paddingLeft: 14 }}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', flex: 1 }}>{bet.sub}</span>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', flexShrink: 0 }}>{dateStr}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {bet.probability != null ? `${bet.probability.toFixed(0)}%` : '—'}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {bet.odds != null ? bet.odds.toFixed(2) : '—'}
          </span>
        </div>
        {note && <div style={{ fontSize: 9, color: 'rgba(251,191,36,0.7)', fontStyle: 'italic', paddingLeft: 14 }}>💬 {note}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto auto auto auto auto 22px', alignItems: 'center', gap: '0 0.5rem', padding: '0.35rem 0.75rem', borderRadius: 7, background: 'rgba(255,255,255,0.02)', borderLeft: `3px solid ${statusColor}44`, fontSize: 12 }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center' }}>#{rank}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bet.label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{bet.sub}</div>
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{dateStr}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', minWidth: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {bet.probability != null ? `${bet.probability.toFixed(0)}%` : '—'}
      </span>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', minWidth: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {bet.odds != null ? bet.odds.toFixed(2) : '—'}
      </span>
      <span style={{ fontSize: 12, fontWeight: 800, color: statusColor, minWidth: 20, textAlign: 'center' }}>
        {isVoid ? 'V' : isWon ? '✓' : '✗'}
      </span>
      <span style={{ fontSize: 12, fontWeight: 800, color: plColor, minWidth: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {plStr}
      </span>
      <button
        onClick={() => setEditing(e => !e)}
        title="Ajouter une note"
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: note ? 'rgba(251,191,36,0.8)' : 'rgba(255,255,255,0.18)', padding: 0, lineHeight: 1, alignSelf: 'center' }}
      >✏</button>
      {(note || editing) && (
        <div style={{ gridColumn: '1 / -1', paddingLeft: 26, paddingBottom: '0.3rem' }}>
          {editing ? (
            <input
              autoFocus
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              onBlur={e => handleNoteBlur(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setEditing(false); setNote(_getBetNotes()[betKey] || ''); } }}
              placeholder="Raison du résultat (ex: DNP coach, enjeu CDM…)"
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 4, color: '#fff', fontSize: 10, padding: '3px 7px', outline: 'none', boxSizing: 'border-box' }}
            />
          ) : (
            <div style={{ fontSize: 10, color: 'rgba(251,191,36,0.7)', fontStyle: 'italic' }}>💬 {note}</div>
          )}
        </div>
      )}
    </div>
  );
}

const TIMELINE = [
  { key: 'Tous', label: 'Tous', days: Infinity },
  { key: '1j',   label: '1j',   days: 1        },
  { key: '3j',   label: '3j',   days: 3        },
  { key: '5j',   label: '5j',   days: 5        },
  { key: '10j',  label: '10j',  days: 10       },
];
const SPORT_FILTERS = [{ key: 'all', label: 'Tous' }, { key: 'basket', label: 'Basket' }, { key: 'foot', label: 'Foot' }];
const BASKET_LEAGUES = new Set(['nba','wnba','euroleague','acb','lnb','bbl','legaa']);
const COMP_FILTERS  = [
  { key: 'nba',        label: 'NBA',            sport: 'basket' },
  { key: 'wnba',       label: 'WNBA',           sport: 'basket' },
  { key: 'euroleague', label: 'Euroligue',       sport: 'basket' },
  { key: 'acb',        label: 'ACB',             sport: 'basket' },
  { key: 'lnb',        label: 'LNB',             sport: 'basket' },
  { key: 'bbl',        label: 'BBL',             sport: 'basket' },
  { key: 'legaa',      label: 'Lega A',          sport: 'basket' },
  { key: 'ligue1',     label: 'Ligue 1',         sport: 'foot'   },
  { key: 'laliga',     label: 'La Liga',          sport: 'foot'   },
  { key: 'bundesliga', label: 'Bundesliga',       sport: 'foot'   },
  { key: 'seriea',     label: 'Serie A',          sport: 'foot'   },
  { key: 'pl',         label: 'Premier League',   sport: 'foot'   },
];
const TYPE_FILTERS_BASKET = [{ key: 'all', label: 'Tous' }, { key: 'result', label: 'Résultat' }, { key: 'total', label: 'Over/Under' }, { key: 'prop', label: 'Props' }];
const TYPE_FILTERS_FOOT   = [{ key: 'all', label: 'Tous' }, { key: 'result', label: 'Résultat' }, { key: 'btts', label: 'BTTS' }, { key: 'total', label: 'Over/Under' }];
const TYPE_FILTERS_ALL    = [{ key: 'all', label: 'Tous' }, { key: 'prop', label: 'Props' }, { key: 'total', label: 'Over/Under' }, { key: 'result', label: 'Résultat' }, { key: 'btts', label: 'BTTS' }];

function DropdownFilter({ label, options, value, onChange }) {
  const selStyle = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 12,
    fontWeight: 600,
    padding: '5px 28px 5px 10px',
    cursor: 'pointer',
    outline: 'none',
    appearance: 'none',
    WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='rgba(255,255,255,0.4)' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
    minWidth: 90,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-dim)' }}>{label}</span>
      <select
        value={value}
        onChange={e => {
          const raw = e.target.value;
          onChange(raw === 'Infinity' ? Infinity : isNaN(Number(raw)) ? raw : Number(raw));
        }}
        style={selStyle}
      >
        {options.map(o => {
          const k = o.key ?? o.days;
          return <option key={String(k)} value={String(k)}>{o.label}</option>;
        })}
      </select>
    </div>
  );
}

function Section({ title, children, mb = true, defaultOpen = true, pinnacle = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const border = pinnacle ? 'rgba(96,165,250,0.35)' : 'rgba(255,255,255,0.07)';
  const bg     = 'rgba(255,255,255,0.02)';
  const titleColor = pinnacle ? '#60a5fa' : 'var(--text-dim)';
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, overflow: 'hidden', marginBottom: mb ? '1.25rem' : 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.85rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer',
          borderBottom: open ? `1px solid ${border}` : 'none',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: titleColor, textTransform: 'uppercase', letterSpacing: '0.09em' }}>{title}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>
          <path d="M2 4l4 4 4-4" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && <div style={{ padding: '1.25rem' }}>{children}</div>}
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────

export default function BacktestingPage() {
  const [model,         setModel]         = useState('new');
  const [timelineLabel, setTimelineLabel] = useState('Tous');
  const period = TIMELINE.find(t => t.label === timelineLabel)?.days ?? 1;
  const [sportFilter, setSportFilter] = useState('all');
  const [compFilter,  setCompFilter]  = useState('all');
  const [typeFilter,  setTypeFilter]  = useState('all');
  const [allBets,        setAllBets]        = useState([]);
  const [pinnacleAllBets, setPinnacleAllBets] = useState([]);
  const [reloadKey,      setReloadKey]      = useState(0);
  const [stake,          setStake]          = useState(10);
  const [refreshing,     setRefreshing]     = useState(false);

  const handleModelChange = (m) => { setModel(m); setTimelineLabel('Tous'); setSportFilter('all'); setCompFilter('all'); setTypeFilter('all'); };
  const handleSportChange = (v) => { setSportFilter(v); setCompFilter('all'); setTypeFilter('all'); };

  // Options dynamiques selon sport sélectionné
  const compOptions = [{ key: 'all', label: 'Toutes' }, ...COMP_FILTERS.filter(c => sportFilter === 'all' || c.sport === sportFilter)];
  const typeOptions = sportFilter === 'basket' ? TYPE_FILTERS_BASKET : sportFilter === 'foot' ? TYPE_FILTERS_FOOT : TYPE_FILTERS_ALL;

  const acceptedCount = useMemo(() => countAccepted(period, sportFilter, typeFilter, model), [period, sportFilter, typeFilter, model]);

  const loadData = (p, m) => {
    loadAllResolved(p, m).then(setAllBets);
    setPinnacleAllBets(loadPinnacleBets(p));
  };

  // Sync settlements au mount uniquement — pas de rechargement automatique ensuite
  useEffect(() => {
    const resolveFootball = async (key) => {
      const alerts = JSON.parse(localStorage.getItem(key) || '[]');
      await resolveCompletedFootballAlerts(alerts, updated => localStorage.setItem(key, JSON.stringify(updated)));
    };
    Promise.all([
      syncSettlements(),
      resolveFootball('fb_btts_alerts'),
      resolveFootball('fb_total_alerts'),
      resolveFootball('fb_result_alerts'),
      resolveFootball('fb_pinnacle_alerts'),
      resolveFootball('fb_dc_btts_alerts'),
      resolveFootball('fb_dc_ou_alerts'),
    ]).then(() => loadData(period, model));
  }, []);

  // Rechargement quand les filtres période/modèle changent ou après suppression
  useEffect(() => { loadData(period, model); }, [period, model, reloadKey]);

  const handleRefresh = async () => {
    setRefreshing(true);
    const resolveFootball = async (key) => {
      const alerts = JSON.parse(localStorage.getItem(key) || '[]');
      await resolveCompletedFootballAlerts(alerts, updated => localStorage.setItem(key, JSON.stringify(updated)));
    };
    await Promise.all([
      syncSettlements(),
      resolveFootball('fb_btts_alerts'),
      resolveFootball('fb_total_alerts'),
      resolveFootball('fb_result_alerts'),
      resolveFootball('fb_pinnacle_alerts'),
      resolveFootball('fb_dc_btts_alerts'),
      resolveFootball('fb_dc_ou_alerts'),
    ]);
    loadData(period, model);
    setRefreshing(false);
  };

  const filtered = useMemo(() => allBets.filter(b => {
    if (sportFilter === 'basket' && !BASKET_LEAGUES.has(b.sport)) return false;
    if (sportFilter === 'foot'   && b.sport !== 'football') return false;
    if (compFilter  !== 'all') {
      // Basket : filtre sur b.sport (nba, wnba...) / Foot : filtre sur b.league (ligue1, laliga...)
      const isFootComp = ['ligue1','laliga','bundesliga','seriea','pl'].includes(compFilter);
      if (isFootComp ? b.league !== compFilter : b.sport !== compFilter) return false;
    }
    if (typeFilter  !== 'all'   && b.type  !== typeFilter)  return false;
    return true;
  }), [allBets, sportFilter, compFilter, typeFilter]);

  const metrics    = useMemo(() => calcMetrics(filtered),       [filtered]);
  const dd         = useMemo(() => calcDrawdown(filtered),           [filtered]);
  const sig        = useMemo(() => calcSignificance(filtered),        [filtered]);
  const cumPoints  = useMemo(() => buildCumPL(filtered),        [filtered]);
  const rollingWR  = useMemo(() => buildRollingWR(filtered),    [filtered]);
  const bkStats    = useMemo(() => byBookmaker(filtered),       [filtered]);
  const calib      = useMemo(() => calibrationBands(filtered),  [filtered]);
  const calibCats  = useMemo(() => calibrationByCategory(filtered), [filtered]);
  const typeStats  = useMemo(() => byTypeStats(filtered),       [filtered]);

  const rolling        = useMemo(() => filtered.filter(b => b.status !== 'void').slice(-ROLLING_N), [filtered]);
  const rollingMetrics = useMemo(() => calcMetrics(rolling), [rolling]);

  // ── Pinnacle diff — métriques isolées (hors bilan global) ─────────────────
  const pinnacleFiltered = useMemo(() => pinnacleAllBets.filter(b => {
    if (sportFilter === 'basket' && b.sport2 !== 'basket') return false;
    if (sportFilter === 'foot'   && b.sport2 !== 'foot')   return false;
    return true;
  }), [pinnacleAllBets, sportFilter]);
  const pinDd      = useMemo(() => calcDrawdown(pinnacleFiltered),    [pinnacleFiltered]);
  const pinSig     = useMemo(() => calcSignificance(pinnacleFiltered),[pinnacleFiltered]);
  const pinMetrics      = useMemo(() => calcMetrics(pinnacleFiltered),           [pinnacleFiltered]);
  const pinCalib        = useMemo(() => calibrationBands(pinnacleFiltered),      [pinnacleFiltered]);
  const pinTypeStats    = useMemo(() => byTypeStats(pinnacleFiltered),           [pinnacleFiltered]);
  const pinRolling      = useMemo(() => pinnacleFiltered.filter(b => b.status !== 'void').slice(-ROLLING_N), [pinnacleFiltered]);
  const pinRollingMetrics = useMemo(() => calcMetrics(pinRolling),               [pinRolling]);
  const pinCumPoints    = useMemo(() => buildCumPL(pinnacleFiltered),            [pinnacleFiltered]);
  const pinRollingWR    = useMemo(() => buildRollingWR(pinnacleFiltered),        [pinnacleFiltered]);

  // ── Toggle vue Pinnacle ────────────────────────────────────────────────────
  const [showPinnacle,    setShowPinnacle]    = useState(false);
  const [sectionsFlipping, setSectionsFlipping] = useState(false);

  const handlePinnacleToggle = () => {
    setSectionsFlipping(true);
    setTimeout(() => { setShowPinnacle(v => !v); setSectionsFlipping(false); }, 280);
  };

  // Données affichées selon le mode actif
  const D = showPinnacle
    ? { metrics: pinMetrics, calib: pinCalib, typeStats: pinTypeStats, rolling: pinRolling, rollingMetrics: pinRollingMetrics, cumPoints: pinCumPoints, rollingWR: pinRollingWR, bets: pinnacleFiltered }
    : { metrics, calib, typeStats, rolling, rollingMetrics, cumPoints, rollingWR, bets: filtered };

  const roiColor = metrics.roi == null ? 'var(--text-dim)' : metrics.roi >= 0 ? '#4ade80' : '#ef4444';
  const plColor  = metrics.pl === 0    ? 'var(--text-dim)' : metrics.pl >= 0  ? '#4ade80' : '#ef4444';
  const wrColor  = metrics.winRate == null ? 'var(--text-dim)' : metrics.winRate >= 50 ? '#4ade80' : '#ef4444';

  return (
    <div className="page" style={{ paddingBottom: '3rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#3b82f6', marginBottom: '0.6rem' }}>
            Performance
          </p>
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1.1 }}>
            Backtesting
          </h1>
          <p style={{ color: 'var(--text-sub)', marginTop: '0.6rem', fontSize: 14, maxWidth: 420, lineHeight: 1.6 }}>
            Suivez la pertinence de vos alertes et la performance de vos paris en temps réel.
          </p>
        </div>
        {/* Toggle modèle */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 3, gap: 2, alignSelf: 'flex-start', marginTop: '0.5rem' }}>
          {[{ key: 'new', label: 'Nouveau modèle', sub: 'depuis le 22 juin' }, { key: 'old', label: 'Ancien modèle', sub: 'avant le 22 juin' }].map(m => (
            <button key={m.key} onClick={() => handleModelChange(m.key)} style={{
              background: model === m.key ? (m.key === 'new' ? 'rgba(96,165,250,0.18)' : 'rgba(148,163,184,0.12)') : 'transparent',
              border: model === m.key ? `1px solid ${m.key === 'new' ? 'rgba(96,165,250,0.4)' : 'rgba(148,163,184,0.2)'}` : '1px solid transparent',
              borderRadius: 9, padding: '0.45rem 1rem', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: model === m.key ? (m.key === 'new' ? '#60a5fa' : '#94a3b8') : 'var(--text-dim)', whiteSpace: 'nowrap' }}>{m.label}</span>
              <span style={{ fontSize: 9, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{m.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <BankrollTracker />

      {/* Filtres */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <DropdownFilter label="Période" options={TIMELINE} value={timelineLabel} onChange={setTimelineLabel} />
        <DropdownFilter label="Sport"       options={SPORT_FILTERS} value={sportFilter} onChange={handleSportChange} />
        <DropdownFilter label="Compétition" options={compOptions}   value={compFilter}  onChange={setCompFilter} />
        <DropdownFilter label="Type"        options={typeOptions}   value={typeFilter}  onChange={setTypeFilter} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-dim)' }}>Mise (€)</span>
          <input type="number" min="1" value={stake} onChange={e => setStake(Math.max(1, +e.target.value || 10))}
            style={{ width: 72, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'var(--text)', fontSize: 12, fontWeight: 600, padding: '5px 10px', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-dim)' }}>Données</span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '5px 12px', borderRadius: 8, cursor: refreshing ? 'default' : 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: refreshing ? 'var(--text-dim)' : 'var(--text)', fontSize: 12, fontWeight: 700, opacity: refreshing ? 0.6 : 1 }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}>
              <path d="M12 7A5 5 0 1 1 7 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M7 2l2-2M7 2l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {refreshing ? 'Sync…' : 'Rafraîchir'}
          </button>
        </div>
        {/* Toggle vue Pinnacle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 'auto' }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-dim)' }}>Vue</span>
          <button
            onClick={handlePinnacleToggle}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '5px 12px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
              background: showPinnacle ? 'rgba(96,165,250,0.18)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${showPinnacle ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.12)'}`,
              color: showPinnacle ? '#60a5fa' : 'var(--text-dim)',
              fontSize: 12, fontWeight: 700,
            }}
          >
            💎 Pinnacle
          </button>
        </div>
      </div>

      {metrics.total === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 32, marginBottom: '0.75rem' }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: '0.35rem' }}>Aucun pari résolu</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Les paris marqués Won / Perdu / Void apparaîtront ici automatiquement.</div>
        </div>
      ) : (<>

        {/* Conteneur animé — flip au toggle Pinnacle */}
        <div style={{ transition: 'transform 0.28s ease, opacity 0.28s ease', transform: sectionsFlipping ? 'scaleX(0)' : 'scaleX(1)', opacity: sectionsFlipping ? 0 : 1 }}>

        {/* KPIs ligne 1 — performance */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
          <KpiCard pinnacle={showPinnacle} label="Paris résolus" value={D.metrics.total} sub={`${D.metrics.won}W · ${D.metrics.lost}L`} />
          <KpiCard pinnacle={showPinnacle} label="Win Rate"  value={D.metrics.winRate != null ? `${D.metrics.winRate.toFixed(1)}%` : '—'} sub={`${D.metrics.won + D.metrics.lost} non-void`} color={D.metrics.winRate == null ? 'var(--text-dim)' : D.metrics.winRate >= 50 ? '#4ade80' : '#ef4444'} />
          <KpiCard pinnacle={showPinnacle} label="ROI"       value={D.metrics.roi != null ? `${D.metrics.roi >= 0 ? '+' : ''}${D.metrics.roi.toFixed(1)}%` : '—'} sub={`flat ${stake}€/pari`} color={D.metrics.roi == null ? 'var(--text-dim)' : D.metrics.roi >= 0 ? '#4ade80' : '#ef4444'} />
          <KpiCard pinnacle={showPinnacle} label="P&L"       value={`${D.metrics.pl >= 0 ? '+' : ''}${(D.metrics.pl * stake).toFixed(0)}€`} sub={`mise ${stake}€/alerte`} color={D.metrics.pl >= 0 ? '#4ade80' : '#ef4444'} />
        </div>

        {/* KPIs ligne 2 — séries + significativité */}
        {(() => { const dD = showPinnacle ? pinDd : dd; const sG = showPinnacle ? pinSig : sig; return (
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <KpiCard pinnacle={showPinnacle} small label="Meilleure série" value={`${dD.maxWin}W`} color="#4ade80" />
          <KpiCard pinnacle={showPinnacle} small label="Pire série"      value={`${dD.maxLoss}L`} color={dD.maxLoss >= 5 ? '#ef4444' : '#f59e0b'} />
          <SigBadge sig={sG} pinnacle={showPinnacle} />
        </div>
        ); })()}

        {/* Ligne 1 : P&L cumulé + Win Rate glissant */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
          <Section title="P&L cumulé" mb={false} pinnacle={showPinnacle}>
            <PLChart points={D.cumPoints} />
          </Section>
          <Section title={`Win Rate glissant (${ROLLING_N} paris)`} mb={false} pinnacle={showPinnacle}>
            <LineChart points={D.rollingWR} yKey="rate" color={showPinnacle ? '#60a5fa' : '#60a5fa'} yFormat={v => `${v.toFixed(0)}%`} baseline={50} />
            {D.rollingWR.length < 2 && <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', marginTop: 4 }}>Besoin de {ROLLING_N}+ paris non-void</div>}
          </Section>
        </div>

        {/* Ligne 2 : 20 derniers + Calibration */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
          <Section title={`${ROLLING_N} derniers paris${showPinnacle ? ' · Pinnacle' : ''}`} mb={false} pinnacle={showPinnacle}>
            {D.rolling.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Pas assez de données</div>
              : <>
                  <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '0.75rem' }}>
                    {[
                      { lbl: 'Win Rate', val: D.rollingMetrics.winRate != null ? `${D.rollingMetrics.winRate.toFixed(0)}%` : '—', col: (D.rollingMetrics.winRate ?? 0) >= 50 ? '#4ade80' : '#ef4444' },
                      { lbl: 'P&L',      val: `${D.rollingMetrics.pl >= 0 ? '+' : ''}${(D.rollingMetrics.pl * stake).toFixed(0)}€`, col: D.rollingMetrics.pl >= 0 ? '#4ade80' : '#ef4444' },
                      { lbl: 'Bilan',    val: `${D.rollingMetrics.won}W/${D.rollingMetrics.lost}L`, col: 'var(--text)' },
                    ].map(({ lbl, val, col }) => (
                      <div key={lbl}>
                        <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{lbl}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: col, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: 240, overflowY: 'auto' }}>
                    {[...D.rolling].reverse().map((bet, i) => <BetRow key={`${bet.date}_${bet.label}_${bet.sub}`} bet={bet} rank={D.rolling.length - i} stake={stake} />)}
                  </div>
                </>
            }
          </Section>
          <Section title="Calibration modèle" mb={false} pinnacle={showPinnacle}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: '0.75rem' }}>Win rate réel vs probabilité estimée · pp = points de %</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {D.calib.map(band => <CalibrationRow key={band.label} band={band} />)}
            </div>
          </Section>
        </div>

        {/* Ligne 2b : Calibration par catégorie */}
        {!showPinnacle && calibCats.length > 0 && (() => {
          const footCats   = calibCats.filter(g => g.key.startsWith('Foot ·'));
          const basketCats = calibCats.filter(g => !g.key.startsWith('Foot ·'));
          return (
            <Section title="Calibration par catégorie" mb={true}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
                Win rate réel des paris dont la probabilité affichée est ≥ seuil · permet de trouver le seuil de déclenchement par catégorie
              </div>
              {footCats.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: basketCats.length > 0 ? '0.75rem' : 0 }}>
                  {footCats.map(g => <CalibCategoryCard key={g.key} group={g} />)}
                </div>
              )}
              {basketCats.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                  {basketCats.map(g => <CalibCategoryCard key={g.key} group={g} />)}
                </div>
              )}
            </Section>
          );
        })()}

        {/* Ligne 3 : Répartition + Performance par type */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem', alignItems: 'start' }}>
          <Section title="Répartition des résultats" mb={false} pinnacle={showPinnacle}>
            <DonutResults metrics={D.metrics} accepted={showPinnacle ? D.metrics.total : acceptedCount} />
          </Section>
          {D.typeStats.length > 0 && (
            <Section title="Performance par type" mb={false} pinnacle={showPinnacle}>
              <div style={{ display: 'grid', gridTemplateColumns: '90px 40px 40px 1fr 60px 60px', gap: '0 0.75rem', padding: '0 0.75rem', marginBottom: '0.4rem' }}>
                {['Type', 'Total', 'Won', '', 'Win%', 'ROI'].map((h, i) => (
                  <span key={i} style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', textAlign: i >= 4 ? 'right' : i === 1 || i === 2 ? 'center' : 'left' }}>{h}</span>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {D.typeStats.map(g => <TypeStatsRow key={g.label} g={g} />)}
              </div>
            </Section>
          )}
        </div>

        {/* Historique complet */}
        <Section title={`Historique complet${showPinnacle ? ' · Pinnacle' : ''}`} mb={false} defaultOpen={false} pinnacle={showPinnacle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{D.bets.length} pari{D.bets.length > 1 ? 's' : ''}</span>
            {!showPinnacle && (
              <button
                onClick={() => exportCSV(filtered)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '4px 12px', borderRadius: 7, border: '1px solid rgba(96,165,250,0.35)', background: 'rgba(96,165,250,0.08)', color: '#60a5fa', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(96,165,250,0.15)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(96,165,250,0.08)'}
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 6l3 3 3-3M2 10v2a1 1 0 001 1h8a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Export CSV
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: 480, overflowY: 'auto' }}>
            {[...D.bets].reverse().map((bet, i) => <BetRow key={`${bet.date}_${bet.label}_${bet.sub}`} bet={bet} rank={D.bets.length - i} stake={stake} />)}
          </div>
        </Section>

        </div>{/* fin conteneur animé */}

      </>)}

      {/* ── Encadré Alertes vs Pinnacle (hors bilan global) ────────────────── */}
      <div style={{
        marginTop: '2rem',
        border: '1px solid rgba(96,165,250,0.35)',
        borderRadius: 16,
        overflow: 'hidden',
        background: 'rgba(96,165,250,0.04)',
      }}>
        {/* Header */}
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(96,165,250,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#60a5fa' }}>
              💎 Alertes vs Pinnacle
            </span>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
              Alertes issues du différentiel bookmaker / cotes Pinnacle — bilan indépendant, non inclus dans les stats ci-dessus.
            </div>
          </div>
        </div>

        <div style={{ padding: '1.25rem' }}>
          {pinMetrics.total === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-dim)', fontSize: 12 }}>
              Aucune alerte vs Pinnacle résolue sur cette période.
            </div>
          ) : (<>
            {/* KPIs */}
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
              {[
                { label: 'Paris résolus', value: pinMetrics.total,   sub: `${pinMetrics.won}W · ${pinMetrics.lost}L`, color: 'var(--text)' },
                { label: 'Win Rate',  value: pinMetrics.winRate != null ? `${pinMetrics.winRate.toFixed(1)}%` : '—', sub: `${pinMetrics.won + pinMetrics.lost} non-void`, color: pinMetrics.winRate == null ? 'var(--text-dim)' : pinMetrics.winRate >= 50 ? '#4ade80' : '#ef4444' },
                { label: 'ROI',       value: pinMetrics.roi != null ? `${pinMetrics.roi >= 0 ? '+' : ''}${pinMetrics.roi.toFixed(1)}%` : '—', sub: `flat ${stake}€/pari`, color: pinMetrics.roi == null ? 'var(--text-dim)' : pinMetrics.roi >= 0 ? '#4ade80' : '#ef4444' },
                { label: 'P&L',       value: `${pinMetrics.pl >= 0 ? '+' : ''}${(pinMetrics.pl * stake).toFixed(0)}€`, sub: `mise ${stake}€/alerte`, color: pinMetrics.pl >= 0 ? '#4ade80' : '#ef4444' },
              ].map(({ label, value, sub, color }) => (
                <div key={label} style={{ flex: '1 1 100px', background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.18)', borderRadius: 12, padding: '0.75rem 1rem' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#60a5fa', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Liste paris */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-dim)' }}>
                Historique ({pinnacleFiltered.length} paris)
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: 360, overflowY: 'auto' }}>
              {[...pinnacleFiltered].reverse().map((bet, i) => (
                <BetRow key={`${bet.date}_${bet.label}_${bet.sub}`} bet={bet} rank={pinnacleFiltered.length - i} stake={stake} />
              ))}
            </div>
          </>)}
        </div>
      </div>

    </div>
  );
}
