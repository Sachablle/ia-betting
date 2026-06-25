import { useState, useEffect, useRef } from 'react';
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
const ESPN_FOOTBALL = {
  'Paris Saint-Germain':    { league: 'fra.1', id: 160   },
  'Olympique de Marseille': { league: 'fra.1', id: 176   },
  'Olympique Lyonnais':     { league: 'fra.1', id: 167   },
  'AS Monaco':              { league: 'fra.1', id: 174   },
  'LOSC Lille':             { league: 'fra.1', id: 166   },
  'Stade Rennais':          { league: 'fra.1', id: 169   },
  'OGC Nice':               { league: 'fra.1', id: 2502  },
  'RC Lens':                { league: 'fra.1', id: 175   },
  'Stade Brestois':         { league: 'fra.1', id: 6997  },
  'RC Strasbourg':          { league: 'fra.1', id: 180   },
  'FC Nantes':              { league: 'fra.1', id: 165   },
  'Toulouse FC':            { league: 'fra.1', id: 179   },
  'AJ Auxerre':             { league: 'fra.1', id: 172   },
  'Angers SCO':             { league: 'fra.1', id: 7868  },
  'Le Havre AC':            { league: 'fra.1', id: 3236  },
  'Manchester City':        { league: 'eng.1', id: 382   },
  'Arsenal':                { league: 'eng.1', id: 359   },
  'Chelsea':                { league: 'eng.1', id: 363   },
  'Liverpool':              { league: 'eng.1', id: 364   },
  'Tottenham Hotspur':      { league: 'eng.1', id: 367   },
  'Newcastle United':       { league: 'eng.1', id: 361   },
  'Manchester United':      { league: 'eng.1', id: 360   },
  'Aston Villa':            { league: 'eng.1', id: 362   },
  'Brighton & Hove Albion': { league: 'eng.1', id: 331   },
  'West Ham United':        { league: 'eng.1', id: 371   },
  'Wolverhampton Wanderers':{ league: 'eng.1', id: 380   },
  'Crystal Palace':         { league: 'eng.1', id: 384   },
  'Nottingham Forest':      { league: 'eng.1', id: 393   },
  'Brentford':              { league: 'eng.1', id: 337   },
  'Fulham':                 { league: 'eng.1', id: 370   },
  'Everton':                { league: 'eng.1', id: 368   },
  'AFC Bournemouth':        { league: 'eng.1', id: 349   },
  'Real Madrid':            { league: 'esp.1', id: 86    },
  'FC Barcelona':           { league: 'esp.1', id: 83    },
  'Atlético de Madrid':     { league: 'esp.1', id: 1068  },
  'Athletic Club':          { league: 'esp.1', id: 93    },
  'Villarreal CF':          { league: 'esp.1', id: 102   },
  'Real Sociedad':          { league: 'esp.1', id: 89    },
  'Real Betis':             { league: 'esp.1', id: 244   },
  'Sevilla FC':             { league: 'esp.1', id: 243   },
  'Celta Vigo':             { league: 'esp.1', id: 85    },
  'Girona FC':              { league: 'esp.1', id: 9812  },
  'Valencia CF':            { league: 'esp.1', id: 94    },
  'Bayern München':         { league: 'ger.1', id: 132   },
  'FC Bayern München':      { league: 'ger.1', id: 132   },
  'Bayer Leverkusen':       { league: 'ger.1', id: 131   },
  'Bayer 04 Leverkusen':    { league: 'ger.1', id: 131   },
  'Borussia Dortmund':      { league: 'ger.1', id: 124   },
  'RB Leipzig':             { league: 'ger.1', id: 11420 },
  'Eintracht Frankfurt':    { league: 'ger.1', id: 125   },
  'VfB Stuttgart':          { league: 'ger.1', id: 134   },
  'VfL Wolfsburg':          { league: 'ger.1', id: 138   },
  'Werder Bremen':          { league: 'ger.1', id: 137   },
  'SC Freiburg':            { league: 'ger.1', id: 126   },
  'Inter Milan':            { league: 'ita.1', id: 110   },
  'SSC Napoli':             { league: 'ita.1', id: 114   },
  'Atalanta BC':            { league: 'ita.1', id: 105   },
  'Juventus':               { league: 'ita.1', id: 111   },
  'Juventus FC':            { league: 'ita.1', id: 111   },
  'AC Milan':               { league: 'ita.1', id: 103   },
  'AS Roma':                { league: 'ita.1', id: 104   },
  'SS Lazio':               { league: 'ita.1', id: 112   },
  'ACF Fiorentina':         { league: 'ita.1', id: 109   },
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

  const avgGF = poolAvg?.avgGF || 2.15;
  const avgGA = poolAvg?.avgGA || 0.78;
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
  return { pHome: Math.round(pHome * 100), pDraw: Math.round(pDraw * 100), pAway: Math.round(pAway * 100) };
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
const FB_BK_LABELS = { pinnacle: 'Pinnacle', unibet: 'Unibet', betclic: 'Betclic', winamax: 'Winamax' };
const FB_BK_COLORS = { unibet: '#1db954', betclic: '#e0292e', winamax: '#ffffff' };
// Pinnacle en tête — réactivé en scraping le 25 juin 2026 (CDM uniquement, H2H seulement),
// affiché avec le style "REF" déjà prévu dans le rendu ci-dessous (isPinnacle).
const FB_BK_ORDER  = ['pinnacle', 'unibet', 'betclic', 'winamax'];

function FootballOddsBox({ markets, bttsResult, home, away, frozen, onRefresh, refreshing }) {
  const [tab, setTab] = useState('result');
  const [totalsLine, setTotalsLine] = useState('2.5');
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

  const h2h  = markets?.h2h;
  const tots = markets?.totals;
  const btts = markets?.btts;

  const availBks = FB_BK_ORDER.filter(bk =>
    h2h?.bookmakers?.[bk] || tots?.bookmakers?.[bk] || btts?.bookmakers?.[bk]
  );

  // Lignes O/U disponibles : union des clés de tous les bookmakers (Pinnacle peut avoir 2.75 etc.)
  const availTotalsLines = (() => {
    const lines = new Set(['1.5', '2.5']);
    if (tots?.bookmakers) {
      for (const bk of Object.values(tots.bookmakers)) {
        for (const key of Object.keys(bk)) lines.add(key);
      }
    }
    return [...lines].sort((a, b) => parseFloat(a) - parseFloat(b));
  })();

  const TABS = [
    { id: 'result', label: 'Résultat' },
    { id: 'buts',   label: 'Buts'     },
    { id: 'btts',   label: 'BTTS'     },
  ];

  const tabStyle = id => ({
    padding: '0.25rem 0.75rem', borderRadius: 5, border: '1px solid', cursor: 'pointer',
    fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
    background: tab === id ? 'rgba(251,146,60,0.25)' : 'rgba(251,146,60,0.08)',
    color: '#ffffff',
    borderColor: tab === id ? 'rgba(251,146,60,0.55)' : 'rgba(251,146,60,0.22)',
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

  const cdmRho = bttsResult?.isCdm ? DIXON_COLES_RHO : 0;
  const ouResult = bttsResult ? computeOU(bttsResult.lambda_home, bttsResult.lambda_away, parseFloat(totalsLine), cdmRho) : null;
  const result1X2 = bttsResult ? compute1X2(bttsResult.lambda_home, bttsResult.lambda_away, 10, cdmRho) : null;

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
        <button
          className={`icon-refresh-btn${refreshing ? ' spinning' : ''}`}
          onClick={onRefresh}
          disabled={refreshing}
          title="Rafraîchir les cotes"
          style={{ marginLeft: tab === 'buts' ? '0.3rem' : 'auto' }}
        >↻</button>
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
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', marginBottom: '0.4rem' }}>
              Envoi des alertes — Football
            </div>
            <div style={{ fontSize: 9.5, lineHeight: 1.55, color: 'var(--text-dim)' }}>
              Un modèle de Poisson estime les buts attendus de chaque équipe à partir de leurs stats récentes.
              <br /><br />
              <b style={{ color: '#00ff80' }}>BTTS Oui</b> : alerte si probabilité ≥ 68%.
              <br />
              <b style={{ color: '#00ff80' }}>Total Over/Under</b> : alerte si probabilité ≥ 65% (ligne 2,5, sinon 1,5).
              <br />
              <b style={{ color: '#00ff80' }}>Résultat 1X2</b> : alerte si probabilité ≥ 65% sur une issue (domicile/nul/extérieur), chacune traitée indépendamment — au plus une alerte par match.
              <br /><br />
              Dans les trois cas, il faut aussi une cote ≥ 1,45 chez Unibet, Betclic ou Winamax sur l'issue concernée.
              <br /><br />
              Une seule alerte par match et par type (BTTS / Total / Résultat), générée automatiquement toutes les 20 min — pas besoin d'ouvrir cette page.
              <br /><br />
              Dans le widget <b>Modèle 1X2</b>, le <span style={{ color: '#4ade80', fontWeight: 700 }}>+Xpt</span>/<span style={{ color: '#f87171', fontWeight: 700 }}>−Xpt</span> indique l'écart entre la probabilité du modèle et celle du marché (cotes bookmaker, marge retirée) pour cette issue — rien à voir avec les flèches ▲▼ de tendance de cote vues ailleurs sur cette page.
            </div>
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

      {availBks.map(bk => {
        const isPinnacle = bk === 'pinnacle';
        const color = isPinnacle ? undefined : FB_BK_COLORS[bk];
        const h = h2h?.bookmakers?.[bk];
        // Pinnacle : affiche sa propre ligne disponible (indépendamment du toggle)
        const t = isPinnacle
          ? (pinTotLine ? pinTotsBk[pinTotLine] : undefined)
          : tots?.bookmakers?.[bk]?.[totalsLine];
        const tLine = isPinnacle ? (pinTotLine ?? totalsLine) : totalsLine;
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

      {availBks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--text-dim)', fontSize: 12 }}>Cotes indisponibles</div>
      )}

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
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', flexShrink: 0 }}>Modèle 1X2</span>
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
              Modèle BTTS{isStatic ? <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 4, fontWeight: 400 }}>stats saison</span> : ''}
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

const STARTER_THRESHOLD = 10;

function RosterColumn({ team, players, names, side, loading, onAssign }) {
  function handleClick(p) {
    onAssign(side, p.shortName || p.name);
  }

  const starters = (players || [])
    .filter(p => p.gamesStarted >= STARTER_THRESHOLD)
    .sort((a, b) => b.gamesStarted - a.gamesStarted);
  const bench = (players || [])
    .filter(p => p.gamesStarted < STARTER_THRESHOLD)
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
                      <span className="rp-pos-tag">{p.position}</span>
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
                      <span className="rp-pos-tag">{p.position}</span>
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

function UpcomingList({ team }) {
  return (
    <div className="upcoming-col">
      <div className="upcoming-team-header">
        <TeamLogo name={team.name} logoId={team.logoId} size={18} />
        <span>{team.short}</span>
      </div>
      {team.upcoming.map((m, i) => (
        <div key={i} className="upcoming-row">
          <span className="upc-date">{formatUpcomingDate(m.date)} · {formatUpcomingTime(m.date)}</span>
          <span className={`upc-ha ${m.home ? 'home' : 'away'}`}>{m.home ? 'D' : 'E'}</span>
          <span className="upc-opp">{m.opponent}</span>
        </div>
      ))}
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
  const footballFixtures = useFootballFixtures();
  const fixture = footballFixtures.find(f => f.id === id) || getFixtureById(id);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef(null);
  const [showLineup, setShowLineup] = useState(true);
  const [homeForm, setHomeForm] = useState('4-3-3');
  const [awayForm, setAwayForm] = useState('4-3-3');
  const [homeNames, setHomeNames] = useState(Array(11).fill(''));
  const [awayNames, setAwayNames] = useState(Array(11).fill(''));
  const [homePlayers, setHomePlayers] = useState(null);
  const [awayPlayers, setAwayPlayers] = useState(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [matchOdds, setMatchOdds] = useState(null);
  const [matchOddsFrozen, setMatchOddsFrozen] = useState(false);
  const [showOddsDropdown, setShowOddsDropdown] = useState(false);
  const [refreshingOdds, setRefreshingOdds] = useState(false);
  const [liveHomeStats, setLiveHomeStats] = useState(null);
  const [liveAwayStats, setLiveAwayStats] = useState(null);
  const [cdmPoolAvg,   setCdmPoolAvg]    = useState(null);
  const [homeMatches, setHomeMatches] = useState([]);
  const [awayMatches, setAwayMatches] = useState([]);

  // Extrait en fonction réutilisable pour le bouton refresh manuel (FootballOddsBox) — appelle
  // /api/odds SANS ?refresh=1 : on relit juste le cache déjà alimenté par le cycle automatique
  // (toutes les 20min), jamais un nouveau scraping live déclenché par un clic utilisateur.
  const loadOdds = () => {
    if (!fixture) return Promise.resolve();
    const norm = s => {
      const base = (s || '').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\b(as|fc|sc|rc|ogc|afc|ac|stade|club|island|islands)\b/g, '')
        .replace(/\bst\b/g, 'saint')
        .replace(/[^a-z]/g, '');
      return CDM_NAME_ALIASES[base] || base;
    };
    const fuzzy = (a, b) => { const na = norm(a), nb = norm(b); return na.includes(nb) || nb.includes(na); };
    return fetch('/api/odds')
      .then(r => r.json())
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
      setTimeout(() => setRefreshingOdds(false), Math.max(0, remaining));
    });
  };

  useEffect(() => {
    if (!fixture) return;
    if (fixture.league === 'cdm') {
      const toForm = results => (results || []).slice(0, 5)
        .map(r => r.gf > r.ga ? 'W' : r.gf === r.ga ? 'D' : 'L');
      const fetchTeam = (name, setter) => {
        fetch(`/api/football/cdm/teamstats/${encodeURIComponent(name)}`)
          .then(r => r.json())
          .then(d => {
            if (d.goalsFor == null) return;
            setter({ goalsFor: d.goalsFor, goalsAgainst: d.goalsAgainst, lastMatchDate: d.lastMatchDate, form: toForm(d.results) });
          })
          .catch(() => {});
      };
      fetchTeam(fixture.home.name, setLiveHomeStats);
      fetchTeam(fixture.away.name, setLiveAwayStats);
      fetch(`/api/football/cdm/poolavg?fixtureId=${encodeURIComponent(fixture.id)}`).then(r => r.json()).then(d => setCdmPoolAvg(d)).catch(() => {});
      return;
    }
    fetch(`/api/football/standings/${fixture.league}`)
      .then(r => r.json())
      .then(({ table }) => {
        if (!Array.isArray(table) || !table.length) return;
        const h = findInTable(table, fixture.home.name);
        const a = findInTable(table, fixture.away.name);
        if (h) { setLiveHomeStats(h); fetch(`/api/football/teammatches/${h.id}`).then(r => r.json()).then(d => setHomeMatches(d.matches || [])).catch(() => {}); }
        if (a) { setLiveAwayStats(a); fetch(`/api/football/teammatches/${a.id}`).then(r => r.json()).then(d => setAwayMatches(d.matches || [])).catch(() => {}); }
      })
      .catch(() => {});
  }, [fixture?.id]);

  useEffect(() => {
    if (!fixture || !showLineup || homePlayers !== null) return;
    setRosterLoading(true);
    async function fetchOne(name, setter) {
      if (fixture.league === 'cdm') {
        try {
          const r = await fetch(`/api/football/cdm/squad/${encodeURIComponent(name)}`);
          const d = await r.json();
          setter(d.players || []);
        } catch { setter([]); }
        return;
      }
      const info = ESPN_FOOTBALL[name];
      if (!info) { setter([]); return; }
      try {
        const r = await fetch(`/api/football/squad/${info.league}/${info.id}`);
        const d = await r.json();
        setter(d.players || []);
      } catch { setter([]); }
    }
    Promise.all([
      fetchOne(fixture.home.name, setHomePlayers),
      fetchOne(fixture.away.name, setAwayPlayers),
    ]).finally(() => setRosterLoading(false));
  }, [showLineup]);

  const league = fixture ? getLeagueById(fixture.league) : null;
  const { home, away, venue, weather, h2h, round } = fixture || {};

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

  const bttsResult = fixture?.league === 'cdm'
    ? computeCdmBTTS(liveHomeStats, liveAwayStats, cdmPoolAvg, fixture.home?.name)
    : (homeMatches.length && awayMatches.length && liveHomeStats?.id && liveAwayStats?.id)
      ? computeBTTS(homeMatches, awayMatches, liveHomeStats.id, liveAwayStats.id)
      : computeStaticBTTS(fixture);

  // Sauvegarde alerte BTTS si confiance ≥ 70%
  useEffect(() => {
    if (!bttsResult || !fixture || bttsResult.prob < 70) return;
    const alertId = `${fixture.id}_btts_yes`;
    try {
      const existing = JSON.parse(localStorage.getItem('fb_btts_alerts') || '[]');
      const old = existing.find(a => a.id === alertId);
      if (old && ['accepted', 'rejected'].includes(old.status)) return;
      const pinn = matchOdds?.btts?.bookmakers?.pinnacle;
      let pinnacleOdds = null, edge = null;
      if (pinn?.yes && pinn?.no) {
        pinnacleOdds = pinn.yes;
        const vig = 1 / pinn.yes + 1 / pinn.no;
        const marketProb = Math.round((1 / pinn.yes / vig) * 100);
        edge = bttsResult.prob - marketProb;
      }
      const alert = {
        id: alertId,
        type: 'football_btts',
        fixtureId: fixture.id,
        league: fixture.league,
        fixture: `${home.name} vs ${away.name}`,
        homeTeam: home.name,
        awayTeam: away.name,
        fixtureDate: fixture.date,
        round: fixture.round || '',
        direction: 'yes',
        probability: bttsResult.prob,
        pinnacleOdds,
        unibetOdds: matchOdds?.btts?.bookmakers?.unibet?.yes || null,
        betclicOdds: matchOdds?.btts?.bookmakers?.betclic?.yes || null,
        edge,
        savedAt: Date.now(),
        status: old?.status || 'pending',
      };
      const filtered = existing.filter(a => a.id !== alertId);
      localStorage.setItem('fb_btts_alerts', JSON.stringify([...filtered, alert]));
      window.dispatchEvent(new Event('fb_btts_alerts_updated'));
    } catch {}
  }, [bttsResult?.prob, matchOdds]);

  if (!fixture) {
    return <div className="page"><div className="empty-state">Match introuvable.</div></div>;
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
          <FootballOddsBox markets={matchOdds} bttsResult={bttsResult} home={home} away={away} frozen={matchOddsFrozen} onRefresh={handleRefreshOdds} refreshing={refreshingOdds} />
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

        {showLineup && (homeMatches.length > 0 || awayMatches.length > 0) && (() => {
          const awayId = liveAwayStats?.id;
          const homeId = liveHomeStats?.id;
          const realH2H = homeMatches
            .filter(m => m.homeId === awayId || m.awayId === awayId)
            .slice(0, 5)
            .map(m => ({ date: m.date.split('T')[0], home: m.homeTeam, away: m.awayTeam, scoreHome: m.scoreHome, scoreAway: m.scoreAway }));
          return (
            <>
              <section className="detail-card compact-card">
                <h2 className="card-title">Derniers résultats</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: '0 1rem' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', marginBottom: '0.4rem' }}>{home.short}</div>
                    {homeMatches.slice(0, 6).map((m, i) => <RecentMatchLine key={i} match={m} teamId={homeId} />)}
                  </div>
                  <div style={{ background: 'var(--border)' }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', marginBottom: '0.4rem' }}>{away.short}</div>
                    {awayMatches.slice(0, 6).map((m, i) => <RecentMatchLine key={i} match={m} teamId={awayId} />)}
                  </div>
                </div>
              </section>
              {realH2H.length > 0 && (
                <CollapsibleCard title="Confrontations directes (réelles)" className="h2h-card">
                  <div className="h2h-list">
                    {realH2H.map((m, i) => <H2HRow key={i} match={m} />)}
                  </div>
                </CollapsibleCard>
              )}
            </>
          );
        })()}

        {showLineup && (
          <CollapsibleCard title="5 prochains matchs" className="upcoming-card">
            <div className="upcoming-grid">
              <UpcomingList team={home} />
              <UpcomingList team={away} />
            </div>
          </CollapsibleCard>
        )}

        {showLineup && (
          <CollapsibleCard title="Confrontations directes" className="h2h-card">
            <div className="h2h-list">
              {[...h2h].reverse().map((m, i) => <H2HRow key={i} match={m} />)}
            </div>
          </CollapsibleCard>
        )}


      </div>
    </div>
  );
}
