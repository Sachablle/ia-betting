import { useState, useEffect, useMemo } from 'react';
import { syncSettlements, resolveCompletedFootballAlerts } from '../utils/syncAlerts';

const ROLLING_N = 20;
const DEFAULT_ODDS = 1.9;

// Séparation ancien / nouveau modèle — alertes à partir du match Toronto Tempo @ Connecticut Sun (10 juin 2026, 23h UTC)
const MODEL_SPLIT_MS = new Date('2026-06-10T23:00:00Z').getTime();

// ── Chargement & normalisation ─────────────────────────────────────────────

function countAccepted(periodDays, sportFilter, typeFilter, model = 'new') {
  const now = Date.now();
  const rawCutoff = periodDays === Infinity ? 0 : now - periodDays * 24 * 3600_000;
  const cutoff   = model === 'new' ? Math.max(rawCutoff, MODEL_SPLIT_MS) : rawCutoff;
  const endCutoff = model === 'old' ? MODEL_SPLIT_MS : Infinity;
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

  return props.length + totals.length + btts.length + fbTotals.length + fbResults.length;
}

function loadAllResolved(periodDays, model = 'new') {
  const now = Date.now();
  const rawCutoff = periodDays === Infinity ? 0 : now - periodDays * 24 * 3600_000;
  const cutoff    = model === 'new' ? Math.max(rawCutoff, MODEL_SPLIT_MS) : rawCutoff;
  const endCutoff = model === 'old' ? MODEL_SPLIT_MS : Infinity;

  const getOdds = a =>
    a.acceptedUnibetOdds ?? a.acceptedBetclicOdds ?? a.acceptedWinamaxOdds ??
    a.unibetOdds ?? a.betclicOdds ?? a.winamaxOdds ?? null;

  const props = JSON.parse(localStorage.getItem('nba_prop_alerts') || '[]')
    .filter(a => ['won', 'lost'].includes(a.status))
    .map(a => ({
      type: 'prop', sport: ['euroleague','wnba','acb','lnb','bbl','legaa'].includes(a.league) ? a.league : 'nba',
      label: a.player,
      sub: `${a.direction === 'over' ? '▲ Over' : '▼ Under'} ${a.line} ${(a.stat || '').toUpperCase()}`,
      date: a.fixtureDate, status: a.status, odds: getOdds(a),
      probability: a.probability, actual: a.actualStat, stat: a.stat,
      direction: a.direction, line: a.line, bookmaker: a.acceptedBookmaker, league: a.league || 'nba',
    }));

  const totals = JSON.parse(localStorage.getItem('nba_game_total_alerts') || '[]')
    .filter(a => ['won', 'lost'].includes(a.status))
    .map(a => ({
      type: 'total', sport: a.league || 'nba',
      label: `${a.homeShort || a.home} vs ${a.awayShort || a.away}`,
      sub: `${a.direction === 'over' ? '▲ Over' : '▼ Under'} ${a.line}`,
      date: a.date, status: a.status,
      odds: a.acceptedUnibetOdds ?? a.acceptedBetclicOdds ?? a.acceptedWinamaxOdds ??
            a.unibetOdds ?? a.betclicOdds ?? a.winamaxOdds ?? null,
      probability: a.prob, actual: a.actualTotal, line: a.line,
      direction: a.direction, bookmaker: a.acceptedBookmaker, league: a.league || 'nba',
    }));

  const btts = JSON.parse(localStorage.getItem('fb_btts_alerts') || '[]')
    .filter(a => ['won', 'lost'].includes(a.status))
    .map(a => ({
      type: 'btts', sport: 'football', label: a.fixture,
      sub: '✓ Les deux équipes marquent', date: a.fixtureDate, status: a.status,
      odds: a.acceptedUnibetOdds ?? a.acceptedBetclicOdds ?? a.acceptedWinamaxOdds ?? a.acceptedPinnacleOdds ??
            a.unibetOdds ?? a.betclicOdds ?? a.winamaxOdds ?? a.pinnacleOdds ?? null,
      probability: a.probability,
      actual: (a.actualHomeScore != null && a.actualAwayScore != null) ? `${a.actualHomeScore}-${a.actualAwayScore}` : null,
      league: a.league || 'football', bookmaker: a.acceptedBookmaker,
    }));

  const fbTotals = JSON.parse(localStorage.getItem('fb_total_alerts') || '[]')
    .filter(a => ['won', 'lost'].includes(a.status))
    .map(a => ({
      type: 'total', sport: 'football',
      label: `${a.homeShort || a.home} vs ${a.awayShort || a.away}`,
      sub: `${a.direction === 'over' ? '▲ Plus' : '▼ Moins'} de ${a.line} buts`,
      date: a.fixtureDate, status: a.status,
      odds: a.acceptedUnibetOdds ?? a.acceptedBetclicOdds ?? a.acceptedWinamaxOdds ??
            a.unibetOdds ?? a.betclicOdds ?? a.winamaxOdds ?? null,
      probability: a.probability,
      actual: (a.actualHomeScore != null && a.actualAwayScore != null) ? a.actualHomeScore + a.actualAwayScore : null,
      line: a.line, direction: a.direction, league: a.league || 'football',
      bookmaker: a.acceptedBookmaker,
    }));

  const fbResults = JSON.parse(localStorage.getItem('fb_result_alerts') || '[]')
    .filter(a => ['won', 'lost'].includes(a.status))
    .map(a => ({
      type: 'result', sport: 'football',
      label: `${a.homeShort || a.home} vs ${a.awayShort || a.away}`,
      sub: a.direction === 'draw' ? '🏆 Match nul' : `🏆 Victoire ${a.direction === 'home' ? (a.homeShort || a.home) : (a.awayShort || a.away)}`,
      date: a.fixtureDate, status: a.status,
      odds: a.acceptedUnibetOdds ?? a.acceptedBetclicOdds ?? a.acceptedWinamaxOdds ??
            a.unibetOdds ?? a.betclicOdds ?? a.winamaxOdds ?? null,
      probability: a.probability,
      actual: (a.actualHomeScore != null && a.actualAwayScore != null) ? `${a.actualHomeScore}-${a.actualAwayScore}` : null,
      direction: a.direction, league: a.league || 'football',
      bookmaker: a.acceptedBookmaker,
    }));

  return [...props, ...totals, ...btts, ...fbTotals, ...fbResults]
    .filter(a => { const t = new Date(a.date).getTime(); return !isNaN(t) && t >= cutoff && t < endCutoff; })
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
  if (z <= 0)   return { label: 'Pas d\'edge',          color: '#f87171', icon: '✗', z, p0 };
  if (z > 2.33) return { label: 'Très significatif',   color: '#4ade80', icon: '✓✓', z, p0, level: 99 };
  if (z > 1.65) return { label: 'Significatif (95%)',  color: '#4ade80', icon: '✓',  z, p0, level: 95 };
  if (z > 1.28) return { label: 'Marginal (90%)',      color: '#f59e0b', icon: '~',  z, p0, level: 90 };
  return { label: 'Non significatif', color: '#f87171', icon: '?', z, p0 };
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
    const b = bets.filter(x => x.status !== 'void' && x.probability != null && x.probability >= band.min && x.probability < band.max);
    const won = b.filter(x => x.status === 'won').length;
    return { ...band, total: b.length, won, rate: b.length > 0 ? (won / b.length * 100) : null };
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

function KpiCard({ label, value, sub, color, small }) {
  return (
    <div style={{
      flex: 1, minWidth: small ? 90 : 110,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14, padding: small ? '0.75rem 1rem' : '1rem 1.25rem',
      display: 'flex', flexDirection: 'column', gap: '0.2rem',
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontSize: small ? 18 : 24, fontWeight: 800, color: color || 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{sub}</span>}
    </div>
  );
}

function SigBadge({ sig }) {
  if (!sig) return null;
  return (
    <div style={{
      flex: 1, minWidth: 140,
      background: `${sig.color}10`, border: `1px solid ${sig.color}44`,
      borderRadius: 14, padding: '0.75rem 1rem',
      display: 'flex', flexDirection: 'column', gap: '0.2rem',
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>Significativité</span>
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
  const lineColor = color || (lastV >= base ? '#4ade80' : '#f87171');
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
  const lineColor = lastPL >= 0 ? '#4ade80' : '#f87171';
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
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${rate}%`, background: rate >= 55 ? '#4ade80' : '#f87171', borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{rate.toFixed(0)}%</span>
      <span style={{ fontSize: 10, color: diff >= 0 ? '#4ade80' : '#f87171', minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {diff >= 0 ? '+' : ''}{diff.toFixed(0)}pp
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', minWidth: 28, textAlign: 'right' }}>{won}/{total}</span>
    </div>
  );
}

function DonutResults({ metrics, accepted = 0 }) {
  const segments = [
    { key: 'won',      label: 'Gagné',   color: '#4ade80', count: metrics.won },
    { key: 'lost',     label: 'Perdu',   color: '#f87171', count: metrics.lost },
    { key: 'accepted', label: 'En jeu',  color: '#60a5fa', count: accepted },
  ].filter(s => s.count > 0);
  const total = metrics.won + metrics.lost + accepted;
  if (total === 0) return <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, padding: '2rem 0' }}>Aucun résultat</div>;

  const R = 80, r = 52, cx = 120, cy = 120;
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', padding: '0.5rem 0' }}>
      <svg width={240} height={240} viewBox="0 0 240 240">
        {arcs.map(a => (
          <path key={a.key} d={arc(a.offset, a.pct)} fill={a.color} opacity={0.85} />
        ))}
        <text x={cx} y={cy - 8}  textAnchor="middle" fontSize="28" fontWeight="800" fill="var(--text)" fontFamily="inherit">{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.45)" fontFamily="inherit">résultats</text>
      </svg>
      <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
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
const BK_COLORS   = { unibet: '#1db954', betclic: '#e0292e', winamax: '#e5e7eb', pinnacle: '#8b5cf6', inconnu: '#64748b' };

function TypeStatsRow({ g }) {
  const roiColor = g.roi == null ? 'var(--text-dim)' : g.roi >= 0 ? '#4ade80' : '#f87171';
  const wrColor  = g.winRate == null ? 'var(--text-dim)' : g.winRate >= 50 ? '#4ade80' : '#f87171';
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
  const roiColor = g.roi >= 0 ? '#4ade80' : '#f87171';
  const wrColor  = g.winRate >= 50 ? '#4ade80' : '#f87171';
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

function BetRow({ bet, rank, stake = 100 }) {
  const isWon  = bet.status === 'won';
  const isVoid = bet.status === 'void';
  const statusColor = isVoid ? '#94a3b8' : isWon ? '#4ade80' : '#f87171';
  const o = bet.odds ?? 1.9;
  const pl = isVoid ? null : isWon ? (o - 1) * stake : -stake;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto auto auto auto', alignItems: 'center', gap: '0 0.75rem', padding: '0.35rem 0.75rem', borderRadius: 7, background: 'rgba(255,255,255,0.02)', borderLeft: `3px solid ${statusColor}44`, fontSize: 12 }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center' }}>#{rank}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bet.label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{bet.sub}</div>
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
        {new Date(bet.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
      </span>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', minWidth: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {bet.odds != null ? bet.odds.toFixed(2) : '—'}
      </span>
      <span style={{ fontSize: 12, fontWeight: 800, color: statusColor, minWidth: 20, textAlign: 'center' }}>
        {isVoid ? 'V' : isWon ? '✓' : '✗'}
      </span>
      <span style={{ fontSize: 12, fontWeight: 800, color: pl == null ? '#94a3b8' : pl >= 0 ? '#4ade80' : '#f87171', minWidth: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {pl == null ? '—' : `${pl >= 0 ? '+' : ''}${pl.toFixed(0)}€`}
      </span>
    </div>
  );
}

const PERIODS      = [{ label: '1j', days: 1 }, { label: '3j', days: 3 }, { label: '5j', days: 5 }, { label: '10j', days: 10 }, { label: '20j', days: 20 }, { label: '30j', days: 30 }];
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

function Section({ title, children, mb = true, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden', marginBottom: mb ? '1.25rem' : 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.85rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer',
          borderBottom: open ? '1px solid rgba(255,255,255,0.07)' : 'none',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>{title}</span>
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
  const [model,       setModel]       = useState('new');
  const [period,      setPeriod]      = useState(Infinity);
  const [sportFilter, setSportFilter] = useState('all');
  const [compFilter,  setCompFilter]  = useState('all');
  const [typeFilter,  setTypeFilter]  = useState('all');
  const [allBets,     setAllBets]     = useState([]);
  const [stake,       setStake]       = useState(100);

  const handleModelChange = (m) => { setModel(m); setPeriod(Infinity); setSportFilter('all'); setCompFilter('all'); setTypeFilter('all'); };
  const handleSportChange = (v) => { setSportFilter(v); setCompFilter('all'); setTypeFilter('all'); };

  // Options dynamiques selon sport sélectionné
  const compOptions = [{ key: 'all', label: 'Toutes' }, ...COMP_FILTERS.filter(c => sportFilter === 'all' || c.sport === sportFilter)];
  const typeOptions = sportFilter === 'basket' ? TYPE_FILTERS_BASKET : sportFilter === 'foot' ? TYPE_FILTERS_FOOT : TYPE_FILTERS_ALL;

  const acceptedCount = useMemo(() => countAccepted(period, sportFilter, typeFilter, model), [period, sportFilter, typeFilter, model]);

  // Sync settlements au mount (won/lost depuis le backend) puis recharge les données
  useEffect(() => {
    const resolveFootball = async (key) => {
      const alerts = JSON.parse(localStorage.getItem(key) || '[]');
      await resolveCompletedFootballAlerts(alerts, updated => localStorage.setItem(key, JSON.stringify(updated)));
    };
    Promise.all([
      syncSettlements(),
      resolveFootball('fb_btts_alerts'),
      resolveFootball('fb_total_alerts'),
    ]).then(() => setAllBets(loadAllResolved(period, model)));
  }, []);

  useEffect(() => { setAllBets(loadAllResolved(period, model)); }, [period, model]);

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
  const dd         = useMemo(() => calcDrawdown(filtered),      [filtered]);
  const sig        = useMemo(() => calcSignificance(filtered),  [filtered]);
  const cumPoints  = useMemo(() => buildCumPL(filtered),        [filtered]);
  const rollingWR  = useMemo(() => buildRollingWR(filtered),    [filtered]);
  const bkStats    = useMemo(() => byBookmaker(filtered),       [filtered]);
  const calib      = useMemo(() => calibrationBands(filtered),  [filtered]);
  const typeStats  = useMemo(() => byTypeStats(filtered),       [filtered]);

  const rolling        = useMemo(() => filtered.filter(b => b.status !== 'void').slice(-ROLLING_N), [filtered]);
  const rollingMetrics = useMemo(() => calcMetrics(rolling), [rolling]);

  const roiColor = metrics.roi == null ? 'var(--text-dim)' : metrics.roi >= 0 ? '#4ade80' : '#f87171';
  const plColor  = metrics.pl === 0    ? 'var(--text-dim)' : metrics.pl >= 0  ? '#4ade80' : '#f87171';
  const wrColor  = metrics.winRate == null ? 'var(--text-dim)' : metrics.winRate >= 50 ? '#4ade80' : '#f87171';

  return (
    <div className="page" style={{ paddingBottom: '3rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#3b82f6', marginBottom: '0.6rem' }}>
            Performance
          </p>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1.1 }}>
            Backtesting
          </h1>
          <p style={{ color: 'var(--text-sub)', marginTop: '0.6rem', fontSize: 14, maxWidth: 420, lineHeight: 1.6 }}>
            Suivez la pertinence de vos alertes et la performance de vos paris en temps réel.
          </p>
        </div>
        {/* Toggle modèle */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 3, gap: 2, alignSelf: 'flex-start', marginTop: '0.5rem' }}>
          {[{ key: 'new', label: 'Nouveau modèle', sub: 'depuis le 9 juin' }, { key: 'old', label: 'Ancien modèle', sub: 'avant le 9 juin' }].map(m => (
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

      {/* Filtres */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <DropdownFilter label="Période"     options={PERIODS}      value={period}      onChange={setPeriod} />
        <DropdownFilter label="Sport"       options={SPORT_FILTERS} value={sportFilter} onChange={handleSportChange} />
        <DropdownFilter label="Compétition" options={compOptions}   value={compFilter}  onChange={setCompFilter} />
        <DropdownFilter label="Type"        options={typeOptions}   value={typeFilter}  onChange={setTypeFilter} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-dim)' }}>Mise (€)</span>
          <input type="number" min="1" value={stake} onChange={e => setStake(Math.max(1, +e.target.value || 100))}
            style={{ width: 72, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'var(--text)', fontSize: 12, fontWeight: 600, padding: '5px 10px', outline: 'none' }} />
        </div>
      </div>

      {metrics.total === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 32, marginBottom: '0.75rem' }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: '0.35rem' }}>Aucun pari résolu</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Les paris marqués Won / Perdu / Void apparaîtront ici automatiquement.</div>
        </div>
      ) : (<>

        {/* KPIs ligne 1 — performance */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
          <KpiCard label="Paris résolus" value={metrics.total}   sub={`${metrics.won}W · ${metrics.lost}L`} />
          <KpiCard label="Win Rate"  value={metrics.winRate != null ? `${metrics.winRate.toFixed(1)}%` : '—'} sub={`${metrics.won + metrics.lost} non-void`} color={wrColor} />
          <KpiCard label="ROI"       value={metrics.roi != null ? `${metrics.roi >= 0 ? '+' : ''}${metrics.roi.toFixed(1)}%` : '—'} sub={`flat ${stake}€/pari`} color={roiColor} />
          <KpiCard label="P&L"       value={`${metrics.pl >= 0 ? '+' : ''}${(metrics.pl * stake).toFixed(0)}€`} sub={`mise ${stake}€/alerte`} color={plColor} />
        </div>

        {/* KPIs ligne 2 — risque + significativité */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <KpiCard small label="Drawdown max" value={`-${(dd.maxDD * stake).toFixed(0)}€`} sub="pire chute depuis un pic" color={dd.maxDD > 3 ? '#f87171' : dd.maxDD > 1 ? '#f59e0b' : '#4ade80'} />
          <KpiCard small label="Meilleure série" value={`${dd.maxWin}W`} color="#4ade80" />
          <KpiCard small label="Pire série"      value={`${dd.maxLoss}L`} color={dd.maxLoss >= 5 ? '#f87171' : '#f59e0b'} />
          <SigBadge sig={sig} />
        </div>

        {/* Ligne 1 : P&L cumulé + Win Rate glissant */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
          <Section title="P&L cumulé" mb={false}>
            <PLChart points={cumPoints} />
          </Section>
          <Section title={`Win Rate glissant (${ROLLING_N} paris)`} mb={false}>
            <LineChart points={rollingWR} yKey="rate" color="#60a5fa" yFormat={v => `${v.toFixed(0)}%`} baseline={50} />
            {rollingWR.length < 2 && <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', marginTop: 4 }}>Besoin de {ROLLING_N}+ paris non-void</div>}
          </Section>
        </div>

        {/* Ligne 2 : 20 derniers + Calibration */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
          <Section title={`${ROLLING_N} derniers paris`} mb={false}>
            {rolling.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Pas assez de données</div>
              : <>
                  <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '0.75rem' }}>
                    {[
                      { lbl: 'Win Rate', val: rollingMetrics.winRate != null ? `${rollingMetrics.winRate.toFixed(0)}%` : '—', col: (rollingMetrics.winRate ?? 0) >= 50 ? '#4ade80' : '#f87171' },
                      { lbl: 'P&L',      val: `${rollingMetrics.pl >= 0 ? '+' : ''}${(rollingMetrics.pl * stake).toFixed(0)}€`, col: rollingMetrics.pl >= 0 ? '#4ade80' : '#f87171' },
                      { lbl: 'Bilan',    val: `${rollingMetrics.won}W/${rollingMetrics.lost}L`, col: 'var(--text)' },
                    ].map(({ lbl, val, col }) => (
                      <div key={lbl}>
                        <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{lbl}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: col, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: 240, overflowY: 'auto' }}>
                    {[...rolling].reverse().map((bet, i) => <BetRow key={i} bet={bet} rank={rolling.length - i} stake={stake} />)}
                  </div>
                </>
            }
          </Section>
          <Section title="Calibration modèle" mb={false}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: '0.75rem' }}>Win rate réel vs probabilité estimée · pp = points de %</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {calib.map(band => <CalibrationRow key={band.label} band={band} />)}
            </div>
          </Section>
        </div>

        {/* Ligne 3 : Répartition + Performance par type */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
          <Section title="Répartition des résultats" mb={false}>
            <DonutResults metrics={metrics} accepted={acceptedCount} />
          </Section>
          {typeStats.length > 0 && (
            <Section title="Performance par type" mb={false}>
              <div style={{ display: 'grid', gridTemplateColumns: '90px 40px 40px 1fr 60px 60px', gap: '0 0.75rem', padding: '0 0.75rem', marginBottom: '0.4rem' }}>
                {['Type', 'Total', 'Won', '', 'Win%', 'ROI'].map((h, i) => (
                  <span key={i} style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', textAlign: i >= 4 ? 'right' : i === 1 || i === 2 ? 'center' : 'left' }}>{h}</span>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {typeStats.map(g => <TypeStatsRow key={g.label} g={g} />)}
              </div>
            </Section>
          )}
        </div>

        {/* Historique complet */}
        <Section title="Historique complet" mb={false} defaultOpen={false}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{filtered.length} pari{filtered.length > 1 ? 's' : ''}</span>
            <button
              onClick={() => exportCSV(filtered)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '4px 12px', borderRadius: 7, border: '1px solid rgba(96,165,250,0.35)', background: 'rgba(96,165,250,0.08)', color: '#60a5fa', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(96,165,250,0.15)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(96,165,250,0.08)'}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 6l3 3 3-3M2 10v2a1 1 0 001 1h8a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Export CSV
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: 480, overflowY: 'auto' }}>
            {[...filtered].reverse().map((bet, i) => <BetRow key={i} bet={bet} rank={filtered.length - i} stake={stake} />)}
          </div>
        </Section>

      </>)}
    </div>
  );
}
