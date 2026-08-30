import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { loadBankrollState, getEngagedToday, BANKROLL_BRACKETS } from '../utils/bankroll';
import { groupAlerts } from '../utils/groupAlerts';

// Widgets flottants partagés entre PlaceBetPage (alertes en attente) et RunningPage (paris acceptés)
// — extraits de PlaceBetPage.jsx le 28 août 2026 (demande explicite : pouvoir consulter le
// calculateur de mise et le near-miss en direct depuis Running aussi, pas seulement Alertes).

// Calculateur de mise multi-alertes (1er août 2026) — outil manuel, PAS une répartition
// automatique : contrairement à la tentative du 16 juillet (abandonnée, cf. bankroll.js), ici
// on ne cherche jamais à deviner si une alerte va sortir plus tard dans la journée — l'outil ne
// regarde que les alertes déjà affichées à l'instant où on l'ouvre, et propose une répartition du
// budget du jour RESTANT entre elles, pondérée par l'edge de chacune (proba×cote-1). Rien n'est
// écrit automatiquement sur les alertes — juste un chiffre suggéré, la mise réelle continue de se
// figer normalement à l'acceptation (stakeAtAccept).
export function extractProbOdds(item) {
  const bestOdds = (...odds) => {
    const valid = odds.filter(o => typeof o === 'number' && o > 1);
    return valid.length ? Math.max(...valid) : null;
  };
  if (item.type === 'prop') {
    const g = item.data;
    const stats = g?.stats || [];
    if (!stats.length) return null;
    const top = stats.reduce((best, s) => (s.probability > (best?.probability ?? -1) ? s : best), null);
    if (!top) return null;
    const odds = bestOdds(top.unibetOdds, top.betclicOdds, top.winamaxOdds);
    if (top.probability == null || !odds) return null;
    return { label: `${g.player} · ${top.stat?.toUpperCase()} ${top.direction === 'over' ? '+' : '-'}${top.line}`, probability: top.probability, odds };
  }
  if (item.type === 'fbgroup') {
    const alerts = item.data?.alerts?.filter(a => a.status === 'pending') || [];
    if (!alerts.length) return null;
    const top = alerts.reduce((best, a) => (a.probability > (best?.probability ?? -1) ? a : best), null);
    const odds = bestOdds(top?.unibetOdds, top?.betclicOdds, top?.winamaxOdds);
    if (!top || top.probability == null || !odds) return null;
    return { label: `${top.home || top.homeShort} vs ${top.away || top.awayShort} · ${top.stat || top.type}`, probability: top.probability, odds };
  }
  if (item.type === 'fbsingle' || item.type === 'basketresult') {
    const a = item.data;
    const probability = a.probability;
    const odds = a.odds ?? bestOdds(a.unibetOdds, a.betclicOdds, a.winamaxOdds);
    if (probability == null || !odds) return null;
    const label = a.teamName || a.teamShort ? `${a.home || a.homeShort} vs ${a.away || a.awayShort} · ${a.teamShort || a.teamName}`
      : `${a.home || a.homeShort} vs ${a.away || a.awayShort}`;
    return { label, probability, odds };
  }
  if (item.type === 'total' || item.type === 'teamtotal' || item.type === 'bballpinnacle' || item.type === 'bballpinnacleprops') {
    const a = item.data;
    const probability = a.prob;
    const odds = bestOdds(a.unibetOdds, a.betclicOdds, a.winamaxOdds);
    if (probability == null || !odds) return null;
    const who = a.type === 'teamtotal' || item.type === 'teamtotal' ? (a.team || a.teamShort) + ' · ' : '';
    return { label: `${a.home || a.homeShort} vs ${a.away || a.awayShort} · ${who}${a.player ? a.player : (a.direction === 'over' ? 'Over' : 'Under') + ' ' + (a.line ?? '')}`, probability, odds };
  }
  // outright : pari saison entière, pas une décision "aujourd'hui" — hors périmètre de cet outil
  return null;
}

// `bottom` (28 août 2026, personnalisable au besoin — reste à 20 par défaut partout, même position
// exacte que sur la page Alertes, y compris sur RunningPage qui a en plus une barre "matchs à venir"
// en `position:fixed; bottom:24` sur toute la largeur — zIndex 250 ci-dessous (> 200 de cette barre)
// pour que ces widgets restent cliquables par-dessus plutôt que d'être recouverts).
export function StakeCalculatorWidget({ items, bottom = 20 }) {
  const [open, setOpen] = useState(false);
  // Décalage de palier (1er août 2026) — permet de simuler le calcul sur un palier plus prudent
  // (ou plus agressif) que le bankroll réel actuel, sans toucher au bankroll réellement suivi
  // (Suivi Bankroll, BacktestingPage.jsx) — purement une hypothèse pour CE calcul, remise à zéro
  // à chaque fermeture du panneau.
  const [bracketOffset, setBracketOffset] = useState(0);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Calculateur de mise — plusieurs alertes en même temps"
        style={{ position: 'fixed', bottom, right: 20, zIndex: 40, width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(96,165,250,0.4)', background: '#1a2332', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
      >
        <svg width="13" height="12" viewBox="0 0 20 18" fill="none">
          <rect x="1" y="10" width="4" height="7" rx="1" stroke="currentColor" strokeWidth="1.3"/>
          <rect x="8" y="4" width="4" height="13" rx="1" stroke="currentColor" strokeWidth="1.3"/>
          <rect x="15" y="7" width="4" height="10" rx="1" stroke="currentColor" strokeWidth="1.3"/>
        </svg>
      </button>
    );
  }

  const bk = loadBankrollState().current;
  let realIdx = 0;
  BANKROLL_BRACKETS.forEach((b, i) => { if (bk >= b.min) realIdx = i; });
  const effIdx = Math.min(BANKROLL_BRACKETS.length - 1, Math.max(0, realIdx + bracketOffset));
  const effBracket = BANKROLL_BRACKETS[effIdx];
  const dailyBudget = effBracket.stake ?? Math.round(bk * 0.05);
  const engaged = getEngagedToday().total;
  const remaining = Math.max(0, dailyBudget - engaged);

  // Pondération par fraction de Kelly (pas par edge brut) — corrige un vrai défaut signalé par
  // l'utilisateur : quand plusieurs alertes affichent la même probabilité (ex: 65%, plafond de
  // sécurité sanityMax), pondérer par edge seul revient à juste miser plus gros sur la cote la plus
  // haute, sans tenir compte que ça veut aussi dire perdre plus si le pari rate. Kelly f=(bp-q)/b
  // (b=cote-1) modère naturellement les grosses cotes — même classement qu'avec l'edge, écart moins
  // extrême. Demi-Kelly (×0.5) : nos probabilités affichées ne sont jamais parfaitement calibrées
  // (cf. suivi near-miss), Kelly plein suppose une proba exacte et sur-mise si elle est fausse.
  const KELLY_FRACTION = 0.5;
  // Plafond de concentration (24 août 2026) — sans lui, un edge nettement supérieur (ex: +15% vs
  // +3%) peut recevoir ~80% du budget du jour : si CE pari précis rate pendant que l'autre gagne,
  // la perte nette dépasse largement ce que le gain de l'autre compense (cas réel signalé par
  // l'utilisateur : Collier perd + Atlanta gagne → -50,70€ sans plafond, sur seulement 75€ de
  // budget). Le Kelly atténué suppose des probas parfaitement calibrées, ce qui n'est jamais vrai
  // en pratique (cf. suivi near-miss) — un plafond dur limite l'impact d'une erreur de calibration
  // sur un seul pari, au prix d'un edge théorique légèrement sous-optimal. Non calibré (v1, choix
  // raisonné avec l'utilisateur) : 60% garde un net avantage au meilleur edge sans qu'un seul pari
  // puisse représenter plus de 3/5 du risque du jour.
  const CONCENTRATION_CAP = 0.6;
  const rows = items
    .map(item => {
      const ext = extractProbOdds(item);
      if (!ext) return null;
      const p = ext.probability / 100;
      const b = ext.odds - 1;
      const edge = p * ext.odds - 1;
      const kelly = Math.max(0, (p - (1 - p) / b)) * KELLY_FRACTION;
      return { key: item.key, ...ext, edge, kelly };
    })
    .filter(r => r && r.kelly > 0)
    .sort((a, b) => b.kelly - a.kelly);

  // Répartition en cascade : tout pari qui dépasserait le plafond est fixé dessus, le reste du
  // budget est réparti au prorata du Kelly restant parmi les paris non plafonnés — répété jusqu'à
  // stabilisation (nécessaire si plusieurs paris à fort edge dépassent le plafond tour à tour).
  const capAmount = remaining * CONCENTRATION_CAP;
  const stakeByKey = {};
  let pool = remaining;
  let active = rows;
  while (active.length) {
    const totalW = active.reduce((s, r) => s + r.kelly, 0);
    if (totalW <= 0) break;
    const overCap = active.filter(r => pool * (r.kelly / totalW) > capAmount + 1e-9);
    if (!overCap.length) {
      active.forEach(r => { stakeByKey[r.key] = pool * (r.kelly / totalW); });
      break;
    }
    overCap.forEach(r => { stakeByKey[r.key] = capAmount; pool -= capAmount; });
    active = active.filter(r => stakeByKey[r.key] == null);
  }
  const withStake = rows.map(r => ({ ...r, stake: Math.round((stakeByKey[r.key] ?? 0) / 5) * 5 }));

  return (
    <div style={{ position: 'fixed', bottom, right: 20, zIndex: 40, width: 340, maxHeight: '70vh', overflowY: 'auto', background: '#0f1620', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: '0.9rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="13" viewBox="0 0 20 18" fill="none" style={{ flexShrink: 0 }}>
            <rect x="1" y="10" width="4" height="7" rx="1" stroke="currentColor" strokeWidth="1.6"/>
            <rect x="8" y="4" width="4" height="13" rx="1" stroke="currentColor" strokeWidth="1.6"/>
            <rect x="15" y="7" width="4" height="10" rx="1" stroke="currentColor" strokeWidth="1.6"/>
          </svg>
          Répartition des mises
        </span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: '0.4rem', lineHeight: 1.5 }}>
        Budget du jour <b style={{ color: 'var(--text)' }}>{dailyBudget}€</b> · déjà engagé <b style={{ color: 'var(--text)' }}>{engaged}€</b> · restant <b style={{ color: remaining > 0 ? '#4ade80' : '#f87171' }}>{remaining}€</b>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.6rem' }}>
        <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Palier utilisé :</span>
        <button onClick={() => setBracketOffset(o => Math.max(o - 1, -realIdx))} disabled={effIdx === 0} title="Palier plus prudent" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: effIdx === 0 ? 'var(--text-dim)' : 'var(--text)', cursor: effIdx === 0 ? 'default' : 'pointer', fontSize: 11, padding: '1px 6px', opacity: effIdx === 0 ? 0.4 : 1 }}>‹</button>
        <span style={{ fontSize: 10, color: bracketOffset !== 0 ? '#fbbf24' : 'var(--text)', fontWeight: 600 }}>
          {effBracket.min}€+{bracketOffset !== 0 ? ' (simulé)' : ''}
        </span>
        <button onClick={() => setBracketOffset(o => Math.min(o + 1, BANKROLL_BRACKETS.length - 1 - realIdx))} disabled={effIdx === BANKROLL_BRACKETS.length - 1} title="Palier plus agressif" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: effIdx === BANKROLL_BRACKETS.length - 1 ? 'var(--text-dim)' : 'var(--text)', cursor: effIdx === BANKROLL_BRACKETS.length - 1 ? 'default' : 'pointer', fontSize: 11, padding: '1px 6px', opacity: effIdx === BANKROLL_BRACKETS.length - 1 ? 0.4 : 1 }}>›</button>
        {bracketOffset !== 0 && (
          <button onClick={() => setBracketOffset(0)} style={{ fontSize: 9, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 2 }}>↺ réel</button>
        )}
      </div>
      {rows.length === 0 && (
        <p style={{ fontSize: 11, color: 'var(--text-dim)' }}>Aucune alerte avec cote et probabilité exploitables en ce moment.</p>
      )}
      {rows.length > 0 && remaining <= 0 && (
        <p style={{ fontSize: 11, color: '#f87171', marginBottom: '0.5rem' }}>Budget du jour déjà atteint — mise suggérée à 0€ pour toutes.</p>
      )}
      {withStake.map(r => (
        <div key={r.key} style={{ padding: '0.4rem 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{r.probability}% · cote {r.odds.toFixed(2)} · edge {(r.edge * 100).toFixed(1)}%</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>{r.stake}€</span>
          </div>
        </div>
      ))}
      {withStake.length > 0 && (
        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: 'var(--text-dim)' }}>Total suggéré</span>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{withStake.reduce((s, r) => s + r.stake, 0)}€</span>
        </div>
      )}
    </div>
  );
}

// Marchés suivis par le panneau near-miss ci-dessous — même liste que celle auditée le 27-28 août
// 2026 (Résultat/Total/Total équipe WNBA, props WNBA, marchés foot). NBA/EU basket volontairement
// absents pour l'instant : hors-saison ou trop peu de données pour qu'un chiffre ait un sens —
// s'ajouteront d'eux-mêmes à la reprise (BBL 31 août, NBA octobre) sans changement de code ici,
// le calculateur renvoie juste "pas de recommandation" tant que le seuil de 30 cas n'est pas atteint.
// Ordre + libellés demandés explicitement le 28 août 2026 : foot dans l'ordre Résultat → Total
// buts → BTTS → DC&+1,5 → DC&BTTS, basket renommé sans le suffixe "WNBA" (redondant, déjà affiché
// via le toggle ⚽/🏀 juste au-dessus). L'ordre d'affichage suit l'ordre du tableau (filter() le
// préserve), donc réordonner ce tableau suffit — pas de tri supplémentaire au rendu.
const NEAR_MISS_PANEL_MARKETS = [
  { key: 'wnba_result',   label: 'Résultat',             domain: 'basket', params: 'source=basket-markets&league=wnba&market=result' },
  { key: 'wnba_total',    label: 'Total points',         domain: 'basket', params: 'source=basket-markets&league=wnba&market=total' },
  { key: 'wnba_teamtotal',label: 'Total points équipes', domain: 'basket', params: 'source=basket-markets&league=wnba&market=team_total' },
  { key: 'wnba_pts',      label: 'Props points',         domain: 'basket', params: 'source=props&league=wnba&stat=pts' },
  { key: 'wnba_reb',      label: 'Props rebonds',        domain: 'basket', params: 'source=props&league=wnba&stat=reb' },
  { key: 'wnba_ast',      label: 'Props assists',        domain: 'basket', params: 'source=props&league=wnba&stat=ast' },
  { key: 'wnba_tpm',      label: 'Props 3pts',           domain: 'basket', params: 'source=props&league=wnba&stat=tpm' },
  { key: 'fb_result',     label: 'Résultat',                         domain: 'foot', params: 'source=football&market=result' },
  { key: 'fb_total',      label: 'Total buts',                       domain: 'foot', params: 'source=football&market=total' },
  { key: 'fb_btts',       label: 'BTTS',                             domain: 'foot', params: 'source=football&market=btts' },
  { key: 'fb_dcou',       label: 'Double chance & plus de 1,5 buts', domain: 'foot', params: 'source=football&market=dc_ou' },
  { key: 'fb_dcbtts',     label: 'Double chance & BTTS',             domain: 'foot', params: 'source=football&market=dc_btts' },
];
const NEAR_MISS_REFRESH_MS = 5 * 60_000; // aligné sur le rythme réel des cycles d'alertes (20 min) — pas la peine d'actualiser plus souvent, les données near-miss ne bougent pas entre-temps

// Grille de cotes sélectionnables au clic sur la cellule "Cote" (28 août 2026, demande explicite) —
// mêmes tranches de 0,10 que `oddsBuckets` côté backend, 1,10 à 5,00.
const ODDS_PICKER_VALUES = [];
for (let lo = 1.10; lo < 5.00 + 1e-9; lo = +(lo + 0.10).toFixed(2)) ODDS_PICKER_VALUES.push(+lo.toFixed(2));

// Grille de seuils sélectionnables au survol de la cellule "Seuil" (29 août 2026, demande explicite,
// symétrique au sélecteur de cote ci-dessus) — mêmes paliers que la recherche croisée `combos` côté
// backend (50 à 95, pas de 5).
const THRESHOLD_PICKER_VALUES = [];
for (let t = 50; t <= 95; t += 5) THRESHOLD_PICKER_VALUES.push(t);

export function NearMissPanelWidget({ bottom = 20 } = {}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState({}); // key → réponse /api/analysis/threshold-optimizer
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState(null);
  // Sélecteurs cote/seuil (29 août 2026, passés du survol au clic — l'ouverture au survol se
  // refermait trop facilement en déplaçant la souris entre la cellule et le menu, rendant les
  // valeurs difficiles à atteindre). Ouvre/ferme au clic sur la cellule, ou se ferme en cliquant
  // n'importe où ailleurs dans l'app (`data-nearmiss-picker` + listener document, même pattern que
  // la légende "?" plus bas) — plus de timer, plus de fermeture accidentelle en bougeant la souris.
  const [oddsPickerFor, setOddsPickerFor] = useState(null); // key du marché dont le dropdown est ouvert
  const [oddsPickerPos, setOddsPickerPos] = useState(null); // {top,left} — dans l'espace vide à droite de la colonne ROI, pas hors du widget (28 août 2026, 2e ajustement)
  const [selectedOdds, setSelectedOdds] = useState({}); // key → tranche de cote choisie (lo), ou absent = agrégat recommandé
  const widgetOuterRef = useRef(null);
  const ODDS_PICKER_WIDTH = 148;
  const toggleOddsPicker = (key, cellEl) => {
    if (oddsPickerFor === key) { setOddsPickerFor(null); return; }
    const cRect = cellEl.getBoundingClientRect();
    const wRect = widgetOuterRef.current?.getBoundingClientRect();
    setOddsPickerFor(key);
    setOddsPickerPos({ top: cRect.top, left: wRect ? wRect.right - ODDS_PICKER_WIDTH - 14 : cRect.right + 6 });
  };
  // Sélecteur de seuil (29 août 2026) — même mécanique que le sélecteur de cote ci-dessus, état
  // indépendant pour ne pas fermer l'un quand on ouvre l'autre.
  const [thresholdPickerFor, setThresholdPickerFor] = useState(null);
  const [thresholdPickerPos, setThresholdPickerPos] = useState(null);
  const [selectedThreshold, setSelectedThreshold] = useState({}); // key → seuil choisi, ou absent = agrégat par défaut
  const THRESHOLD_PICKER_WIDTH = 128;
  const toggleThresholdPicker = (key, cellEl) => {
    if (thresholdPickerFor === key) { setThresholdPickerFor(null); return; }
    const cRect = cellEl.getBoundingClientRect();
    const wRect = widgetOuterRef.current?.getBoundingClientRect();
    setThresholdPickerFor(key);
    setThresholdPickerPos({ top: cRect.top, left: wRect ? wRect.right - THRESHOLD_PICKER_WIDTH - 14 : cRect.right + 6 });
  };
  useEffect(() => {
    if (!oddsPickerFor && !thresholdPickerFor) return;
    const onDocClick = e => { if (!e.target.closest('[data-nearmiss-picker]')) { setOddsPickerFor(null); setThresholdPickerFor(null); } };
    document.addEventListener('mousedown', onDocClick, true);
    return () => document.removeEventListener('mousedown', onDocClick, true);
  }, [oddsPickerFor, thresholdPickerFor]);
  // Bouton "?" légende du code couleur Win% (28 août 2026, demande explicite) — popup en portail
  // vers document.body, même raison que le picker de cote ci-dessus (élément fixed mal positionné
  // sous l'ancêtre .page transformé par l'animation d'entrée de page).
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpPos, setHelpPos] = useState(null);
  const helpBtnRef = useRef(null);
  const HELP_WIDTH = 270;
  const toggleHelp = () => {
    if (!helpOpen) {
      const r = helpBtnRef.current.getBoundingClientRect();
      setHelpPos({ bottom: window.innerHeight - r.top + 8, left: Math.max(12, r.right - HELP_WIDTH) });
    }
    setHelpOpen(v => !v);
  };
  useEffect(() => {
    if (!helpOpen) return;
    const onDocClick = e => { if (!e.target.closest('[data-nearmiss-help]')) setHelpOpen(false); };
    document.addEventListener('mousedown', onDocClick, true);
    return () => document.removeEventListener('mousedown', onDocClick, true);
  }, [helpOpen]);
  // Bascule foot/basket (28 août 2026) — trop d'info d'un coup, même animation que le toggle
  // "5 prochains matchs" de la fiche match foot (scaleX(0)+fade 280ms).
  const [domain, setDomain] = useState('foot');
  const [domainFlipping, setDomainFlipping] = useState(false);
  const handleDomainToggle = () => {
    setDomainFlipping(true);
    setTimeout(() => { setDomain(d => d === 'basket' ? 'foot' : 'basket'); setDomainFlipping(false); }, 280);
  };

  const fetchAll = () => {
    setLoading(true);
    Promise.all(NEAR_MISS_PANEL_MARKETS.map(m =>
      fetch(`/api/analysis/threshold-optimizer?${m.params}`).then(r => r.json()).then(d => [m.key, d]).catch(() => [m.key, null])
    )).then(pairs => {
      setResults(Object.fromEntries(pairs));
      setLastFetched(new Date());
      setLoading(false);
    });
  };

  useEffect(() => {
    if (!open) return;
    fetchAll();
    const t = setInterval(fetchAll, NEAR_MISS_REFRESH_MS);
    return () => clearInterval(t);
  }, [open]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Near-miss en direct — fiabilité actuelle de chaque marché"
        style={{ position: 'fixed', bottom, right: 64, zIndex: 40, width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(96,165,250,0.4)', background: '#1a2332', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <path d="M2 15 L7 9 L11 12 L18 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="18" cy="4" r="1.8" fill="currentColor"/>
        </svg>
      </button>
    );
  }

  const th = { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)', textAlign: 'left', padding: '0 0.5rem 0.4rem 0', whiteSpace: 'nowrap' };
  const td = { fontSize: 11, padding: '0.4rem 0.5rem 0.4rem 0', whiteSpace: 'nowrap', borderTop: '1px solid rgba(255,255,255,0.06)' };

  return (
    <div ref={widgetOuterRef} style={{ position: 'fixed', bottom, right: 20, zIndex: 40, maxWidth: 'calc(100vw - 40px)', maxHeight: '70vh', overflow: 'auto', background: '#0f1620', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: '0.9rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', gap: '2rem' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
            <path d="M2 15 L7 9 L11 12 L18 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="18" cy="4" r="1.8" fill="currentColor"/>
          </svg>
          Near-miss en direct
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {[['football', '⚽', '#4ade80', 'rgba(74,222,128,'], ['basket', '🏀', '#fb923c', 'rgba(251,146,60,']].map(([sport, icon, col, rgba]) => {
              const active = (sport === 'football') === (domain === 'foot');
              return (
                <button
                  key={sport}
                  onClick={() => { if (!active) handleDomainToggle(); }}
                  title={sport === 'football' ? 'Foot' : 'Basket'}
                  style={{
                    background: active ? `${rgba}0.15)` : 'none',
                    border: `1px solid ${active ? col : `${rgba}0.2)`}`,
                    borderRadius: 5, cursor: active ? 'default' : 'pointer',
                    width: 22, height: 22, fontSize: 11,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
                    boxShadow: active ? `0 0 6px ${rgba}0.3)` : 'none',
                    opacity: active ? 1 : 0.5,
                  }}
                >
                  {icon}
                </button>
              );
            })}
          </div>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
        {loading ? 'Calcul en cours…' : lastFetched ? `Actualisé à ${lastFetched.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · se remet à jour toutes les 5 min` : ''}
        {' · '}Seuil + cote = la combinaison des deux qui donne le meilleur résultat historique pour ce marché (pas deux infos séparées).
      </div>
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#60a5fa', marginBottom: '0.4rem',
        transition: 'transform 0.28s ease, opacity 0.28s ease',
        transform: domainFlipping ? 'scaleX(0)' : 'scaleX(1)', opacity: domainFlipping ? 0 : 1,
      }}>
        {domain === 'basket' ? '🏀 Basket' : '⚽ Foot'}
      </div>
      <table style={{
        borderCollapse: 'collapse',
        transition: 'transform 0.28s ease, opacity 0.28s ease',
        transform: domainFlipping ? 'scaleX(0)' : 'scaleX(1)', opacity: domainFlipping ? 0 : 1,
      }}>
        <thead>
          <tr>
            <th style={th}>Marché</th>
            <th style={th}>Seuil</th>
            <th style={th}>Cote</th>
            <th style={th}>N</th>
            <th style={th}>Win%</th>
            <th style={th}>ROI</th>
          </tr>
        </thead>
        <tbody>
          {NEAR_MISS_PANEL_MARKETS.filter(m => m.domain === domain).map(m => {
            const d = results[m.key];
            const rec = d?.recommendedThreshold;
            // floored (28 août 2026) — props WNBA pts/reb/ast/tpm : le log near-miss ne contient que
            // des candidats SOUS le plancher d'alerte déjà actif (voir _analyzeThresholdRows côté
            // backend), donc `rec` (recherche du "meilleur" seuil) ne peut jamais approcher ni
            // dépasser ce plancher réel — toujours trompeur. `activeFloorStats` remplace `rec` pour
            // ces 4 marchés : le vrai plancher actif, avec le win%/n/roi observés juste en dessous.
            const floored = d?.activeFloorStats;
            const primary = floored || rec;
            // Seuil choisi manuellement au clic (29 août 2026) — cherche dans `thresholdCombos` (tous
            // les seuils testés, indépendamment du filtre ≥30 cas appliqué à `rec`/`floored`).
            const thresholdSel = selectedThreshold[m.key];
            const thresholdOverride = thresholdSel != null ? d?.thresholdCombos?.find(c => c.threshold === thresholdSel) : null;
            // Cote choisie manuellement au clic — combine vraiment avec le seuil choisi (29 août 2026,
            // fix demandé) : si un seuil précis est sélectionné, la tranche de cote est recalculée sur
            // CE seuil (`oddsBucketsByThreshold[thresholdSel]`) au lieu du seuil par défaut
            // (`oddsBuckets`) — sinon choisir 70% puis une cote affichait silencieusement les chiffres
            // du seuil par défaut, en ignorant le 70% choisi.
            const bucketLo = selectedOdds[m.key];
            const oddsSource = thresholdSel != null ? d?.oddsBucketsByThreshold?.[thresholdSel] : d?.oddsBuckets;
            const bucket = bucketLo != null ? oddsSource?.find(b => b.lo === bucketLo) : null;
            // Vue affichée : agrégat par défaut, ou seuil/cote choisis (combinés si les deux sont actifs).
            const view = bucket
              ? { n: bucket.n, wins: bucket.wins, losses: bucket.losses, winRate: bucket.winRate, winRateCI95: bucket.winRateCI95, roi: bucket.roi, calibratedWinRate: bucket.calibratedWinRate }
              : thresholdOverride || primary;
            return (
              <tr key={m.key}>
                <td style={{ ...td, color: 'var(--text)', fontWeight: 600 }}>{m.label}</td>
                {!primary ? (
                  <td style={{ ...td, color: 'var(--text-dim)' }} colSpan={5}>
                    {d ? `Pas assez de données (≥30 cas requis, ${d.totalResolved} résolus au total)` : (loading ? '…' : '—')}
                  </td>
                ) : (
                  <>
                    <td
                      data-nearmiss-picker
                      style={{ ...td, color: thresholdSel != null ? '#60a5fa' : 'var(--text)', fontWeight: thresholdSel != null ? 700 : 400, cursor: 'pointer' }}
                      onClick={e => { e.stopPropagation(); toggleThresholdPicker(m.key, e.currentTarget); }}
                      title={thresholdSel != null ? undefined : (floored ? `Plancher d'alerte réellement actif — Win%/N/ROI mesurés sur la tranche ${floored.band[0]}–${floored.band[1]}% (seule zone couverte par le suivi near-miss pour ce marché) — cliquer pour explorer un autre seuil` : "Cliquer pour explorer un autre seuil")}
                    >
                      {/* Fix 29 août 2026 — l'étiquette doit refléter le seuil VRAIMENT choisi (`thresholdSel`),
                          pas seulement quand `thresholdOverride` existe (qui exige ≥30 cas SANS filtre de
                          cote) : combiné à une tranche de cote choisie, `bucket` peut avoir des données
                          valables à ce seuil même si `thresholdOverride` seul n'en a pas — sinon
                          l'étiquette retombait silencieusement sur le seuil par défaut alors que les
                          chiffres affichés (N/Win%/ROI) reflétaient bien le seuil choisi. */}
                      {thresholdSel != null ? `≥${thresholdSel}%` : (floored ? `${floored.threshold}%` : `≥${rec.threshold}%`)}
                      {thresholdSel == null && floored && <span style={{ fontSize: 8, color: 'var(--text-dim)' }}> (actif)</span>}
                    </td>
                    <td
                      data-nearmiss-picker
                      style={{ ...td, color: bucket ? '#60a5fa' : 'var(--text)', fontWeight: bucket ? 700 : 400, cursor: 'pointer' }}
                      onClick={e => { e.stopPropagation(); toggleOddsPicker(m.key, e.currentTarget); }}
                      title={!bucket && primary.minOdds > 0 ? "Cote mini réellement programmée pour l'envoi de l'alerte sur ce marché — cliquer pour explorer une autre tranche de cote" : undefined}
                    >
                      {bucket ? `${bucket.lo.toFixed(2)}–${bucket.hi.toFixed(2)}` : (primary.minOdds > 0 ? `≥${primary.minOdds.toFixed(2)}` : '—')}
                    </td>
                    <td style={{ ...td, color: 'var(--text)' }}>
                      {view.n} {view.wins != null && <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>({view.wins}W/{view.losses}L)</span>}
                    </td>
                    {view.n > 0 ? (
                      <>
                        <td style={{ ...td, color: view.winRateCI95[0] >= 55 ? '#4ade80' : view.winRateCI95[0] >= 45 ? '#fbbf24' : '#f87171' }}>
                          <b>{view.winRate}%</b> <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({view.winRateCI95[0]}–{view.winRateCI95[1]}%)</span>
                          {view.calibratedWinRate != null && (
                            <div
                              style={{ fontSize: 8, color: '#60a5fa', fontWeight: 400, marginTop: 1 }}
                              title="Taux calibré (régression isotonique) — mutualise avec les probabilités voisines pour lisser le bruit d'un petit échantillon, plus fiable que le Win% brut ci-dessus sur peu de cas"
                            >
                              ≈{view.calibratedWinRate}% calibré
                            </div>
                          )}
                        </td>
                        <td style={{ ...td, color: view.roi >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>{view.roi >= 0 ? '+' : ''}{view.roi}%</td>
                      </>
                    ) : (
                      <td style={{ ...td, color: 'var(--text-dim)' }} colSpan={2}>Aucun cas résolu</td>
                    )}
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.4rem' }}>
        <span
          ref={helpBtnRef}
          data-nearmiss-help
          onClick={toggleHelp}
          title="Code couleur Win%"
          style={{
            width: 14, height: 14, borderRadius: '50%', fontSize: 9, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: helpOpen ? '#60a5fa' : 'var(--text-dim)', border: `1px solid ${helpOpen ? 'rgba(96,165,250,0.5)' : 'var(--border)'}`,
            cursor: 'pointer', flexShrink: 0,
          }}
        >?</span>
      </div>
      {/* Contenu de la légende retiré le 28 août 2026 (demande explicite — "j'aime pas, enlève la
          légende, laisse le '?'") — à reconstruire plus tard. Le bouton reste affiché/cliquable,
          `helpOpen`/`helpPos` restent posés pour ne pas avoir à recâbler le positionnement quand la
          légende sera reconstruite, mais rien ne s'affiche pour l'instant. */}
      {oddsPickerFor && oddsPickerPos && createPortal((() => {
        const d = results[oddsPickerFor];
        const bucketLo = selectedOdds[oddsPickerFor];
        // Combine avec le seuil déjà choisi sur cette ligne, s'il y en a un (29 août 2026).
        const thresholdSelForOdds = selectedThreshold[oddsPickerFor];
        const oddsSourceForPicker = thresholdSelForOdds != null ? d?.oddsBucketsByThreshold?.[thresholdSelForOdds] : d?.oddsBuckets;
        return (
          <div
            data-nearmiss-picker
            style={{
              position: 'fixed', top: oddsPickerPos.top, left: oddsPickerPos.left, zIndex: 200,
              background: '#111a26', border: '1px solid rgba(96,165,250,0.35)', borderRadius: 6,
              boxShadow: '0 6px 20px rgba(0,0,0,0.5)', padding: '0.3rem', maxHeight: 180, overflowY: 'auto',
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, width: 148,
            }}
          >
            {ODDS_PICKER_VALUES.map(lo => {
              const b = oddsSourceForPicker?.find(x => x.lo === lo);
              const hasData = b && b.n > 0;
              const isSel = bucketLo === lo;
              return (
                <button
                  key={lo}
                  title={hasData ? `n=${b.n} · win ${b.winRate}%` : 'Aucun cas résolu dans cette tranche'}
                  onClick={() => { setSelectedOdds(prev => ({ ...prev, [oddsPickerFor]: isSel ? undefined : lo })); }}
                  style={{
                    fontSize: 9, padding: '2px 3px', borderRadius: 4, cursor: 'pointer',
                    border: `1px solid ${isSel ? '#60a5fa' : 'rgba(255,255,255,0.1)'}`,
                    background: isSel ? 'rgba(96,165,250,0.25)' : 'transparent',
                    color: hasData ? 'var(--text)' : 'var(--text-dim)',
                    opacity: hasData ? 1 : 0.4,
                    fontWeight: isSel ? 700 : 400,
                  }}
                >
                  {lo.toFixed(2)}
                </button>
              );
            })}
          </div>
        );
      })(), document.body)}
      {thresholdPickerFor && thresholdPickerPos && createPortal((() => {
        const d = results[thresholdPickerFor];
        const sel = selectedThreshold[thresholdPickerFor];
        return (
          <div
            data-nearmiss-picker
            style={{
              position: 'fixed', top: thresholdPickerPos.top, left: thresholdPickerPos.left, zIndex: 200,
              background: '#111a26', border: '1px solid rgba(96,165,250,0.35)', borderRadius: 6,
              boxShadow: '0 6px 20px rgba(0,0,0,0.5)', padding: '0.3rem', maxHeight: 180, overflowY: 'auto',
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2, width: 128,
            }}
          >
            {THRESHOLD_PICKER_VALUES.map(t => {
              const c = d?.thresholdCombos?.find(x => x.threshold === t);
              const hasData = c && c.n > 0;
              const isSel = sel === t;
              return (
                <button
                  key={t}
                  title={hasData ? `n=${c.n} · win ${c.winRate}%` : 'Aucun cas résolu (ou <30) à ce seuil'}
                  onClick={() => { setSelectedThreshold(prev => ({ ...prev, [thresholdPickerFor]: isSel ? undefined : t })); }}
                  style={{
                    fontSize: 9, padding: '2px 3px', borderRadius: 4, cursor: 'pointer',
                    border: `1px solid ${isSel ? '#60a5fa' : 'rgba(255,255,255,0.1)'}`,
                    background: isSel ? 'rgba(96,165,250,0.25)' : 'transparent',
                    color: hasData ? 'var(--text)' : 'var(--text-dim)',
                    opacity: hasData ? 1 : 0.4,
                    fontWeight: isSel ? 700 : 400,
                  }}
                >
                  ≥{t}%
                </button>
              );
            })}
          </div>
        );
      })(), document.body)}
    </div>
  );
}


// Reconstruit la liste unifiée d'alertes PENDING attendue par StakeCalculatorWidget, à partir des
// stores bruts déjà chargés par la page appelante (mêmes noms/formes que dans PlaceBetPage.jsx).
// Chaque store manquant (ex: bballPinnaclePropsAlerts, outrightAlerts — pas chargés par RunningPage)
// est simplement omis, le calculateur fonctionne avec ce qui est disponible.
export function buildPendingItems({
  rawAlerts = [], rawTotalAlerts = [], rawTeamTotalAlerts = [], rawResultAlerts = [],
  bttsAlerts = [], fbTotalAlerts = [], fbResultAlerts = [], fbPinnacleAlerts = [],
  dcBttsAlerts = [], dcOuAlerts = [], bballPinnacleAlerts = [], bballPinnaclePropsAlerts = [],
  outrightAlerts = [],
}) {
  const pendingGroups = groupAlerts(rawAlerts).filter(g => g.status === 'pending');
  const pendingTotalAlerts = rawTotalAlerts.filter(a => a.status === 'pending');
  const pendingTeamTotalAlerts = rawTeamTotalAlerts.filter(a => a.status === 'pending');
  const pendingResultAlerts = rawResultAlerts.filter(a => a.status === 'pending');

  const _allFoot = [
    ...bttsAlerts.filter(a => a.status === 'pending' || a.status === 'accepted'),
    ...fbTotalAlerts.filter(a => a.status === 'pending' || a.status === 'accepted'),
    ...fbResultAlerts.filter(a => a.status === 'pending' || a.status === 'accepted'),
    ...fbPinnacleAlerts.filter(a => a.status === 'pending' || a.status === 'accepted'),
    ...dcBttsAlerts.filter(a => a.status === 'pending' || a.status === 'accepted'),
    ...dcOuAlerts.filter(a => a.status === 'pending' || a.status === 'accepted'),
  ];
  const _footballByFixture = Object.values(
    _allFoot.reduce((acc, a) => {
      const k = a.fixtureId || a.eventId;
      if (!acc[k]) acc[k] = { fixtureId: k, fixtureDate: a.fixtureDate, alerts: [] };
      acc[k].alerts.push(a);
      return acc;
    }, {})
  ).filter(g => g.alerts.some(a => a.status === 'pending'));
  const footballGroups = _footballByFixture.filter(g => g.alerts.length >= 2);
  const footballSingleAlerts = _footballByFixture.filter(g => g.alerts.length === 1).map(g => g.alerts[0]);

  return [
    ...pendingGroups.map(g => ({ type: 'prop', key: g.key, date: g.fixtureDate, data: g })),
    ...pendingTotalAlerts.map(a => ({ type: 'total', key: a.id, date: a.fixtureDate, data: a })),
    ...pendingTeamTotalAlerts.map(a => ({ type: 'teamtotal', key: a.id, date: a.date, data: a })),
    ...pendingResultAlerts.map(a => ({ type: 'basketresult', key: a.id, date: a.date, data: a })),
    ...footballGroups.map(g => ({ type: 'fbgroup', key: g.fixtureId, date: g.fixtureDate, data: g })),
    ...footballSingleAlerts.map(a => ({ type: 'fbsingle', key: a.id, date: a.fixtureDate, data: a })),
    ...bballPinnacleAlerts.filter(a => a.status === 'pending').map(a => ({ type: 'bballpinnacle', key: a.id, date: a.date, data: a })),
    ...bballPinnaclePropsAlerts.filter(a => a.status === 'pending').map(a => ({ type: 'bballpinnacleprops', key: a.id, date: a.date, data: a })),
    ...outrightAlerts.filter(a => a.status === 'pending').map(a => ({ type: 'outright', key: a.id, date: a.savedAt, data: a })),
  ].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
}
