// Suivi bankroll + plan de mise progressif — construit le 16 juillet 2026 (objectif 10 000€ depuis
// 250€). Mise fixe par palier de bankroll (pas un % recalculé à chaque pari) pour rester simple à
// appliquer en pratique, mais le % implicite décroît à mesure que le bankroll grossit (agressif
// quand les montants sont encore petits, plus prudent une fois que les euros en jeu comptent).
//
// Répartition entre plusieurs alertes le même jour (16 juillet 2026) : testé un partage automatique
// (équitable puis proportionnel Kelly du budget du jour), abandonné — impossible de deviner à
// l'avance si d'autres alertes vont sortir plus tard dans la journée, donc soit on sous-utilise le
// budget les jours à une seule alerte, soit on dépasse le budget les jours à plusieurs. Décision :
// toujours utiliser la mise recommandée pleine du palier, quitte à dépasser le budget du jour un
// soir à plusieurs alertes (préférence assumée : vitesse vers 10k plutôt que lissage parfait) —
// l'ajustement manuel sur l'alerte (RunningPage, badge mise cliquable) reste l'outil pour répartir
// soi-même au cas par cas si besoin.
import { setItem as cloudSet } from './cloudStorage';

export const BANKROLL_KEY = 'bankroll_tracker';
export const BANKROLL_TARGET = 10000;

export const BANKROLL_BRACKETS = [
  { min: 0,     stake: 50,  pct: '20%'   },
  { min: 500,   stake: 75,  pct: '15%'   },
  { min: 1000,  stake: 125, pct: '12,5%' },
  { min: 2000,  stake: 200, pct: '10%'   },
  { min: 3500,  stake: 300, pct: '8,5%'  },
  { min: 5000,  stake: 400, pct: '8%'    },
  { min: 7000,  stake: 500, pct: '7%'    },
  { min: 10000, stake: null, pct: '5%'   }, // au-delà de l'objectif : 5% dynamique du BK
];

// Mise recommandée pour un bankroll donné, d'après le palier en cours.
export function getRecommendedStake(bk) {
  if (bk <= 0) return 0;
  let bracket = BANKROLL_BRACKETS[0];
  for (const b of BANKROLL_BRACKETS) { if (bk >= b.min) bracket = b; else break; }
  if (bracket.stake == null) return Math.round(bk * 0.05);
  return Math.min(bracket.stake, bk); // jamais plus que le bankroll dispo
}

// Alertes/paris localStorage réellement acceptés (en attente de résultat) — même liste de clés que
// SYNC_KEYS (cloudStorage.js) moins les clés qui ne sont pas des tableaux d'alertes.
const ALERT_STORAGE_KEYS = [
  'nba_prop_alerts', 'nba_game_total_alerts',
  'fb_btts_alerts', 'fb_total_alerts', 'fb_result_alerts', 'fb_dc_btts_alerts', 'fb_dc_ou_alerts',
  'basketball_result_alerts', 'basketball_spread_alerts',
  'fb_pinnacle_alerts', 'bball_pinnacle_alerts', 'bball_pinnacle_props_alerts',
];

function dateKey(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Purement informatif (pas de division automatique de la mise, cf. note en tête de fichier) :
// total réellement engagé aujourd'hui, d'après les mises (éventuellement éditées à la main sur
// chaque alerte) des paris ACCEPTÉS ce jour-là. Groupé par date d'ACCEPTATION (acceptedAt), pas par
// date du match (fixtureDate) — un match programmé tard le soir côté heure américaine peut déjà
// être "le lendemain" en UTC brut (ex: 01h00Z = encore la même soirée en heure US), ce qui aurait
// exclu à tort des paris acceptés ensemble le même soir (cas réel : Shepard 2026-07-17T01:00Z vs
// Austin 2026-07-16T23:00Z, acceptées la même soirée, 16 juillet 2026).
export function getEngagedToday(iso) {
  const target = dateKey(iso ?? new Date().toISOString());
  if (!target) return { total: 0, stakes: [] };
  const stakes = [];
  for (const key of ALERT_STORAGE_KEYS) {
    try {
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      for (const a of arr) {
        if (a.status !== 'accepted') continue;
        if (dateKey(a.acceptedAt) !== target) continue;
        if (typeof a.stakeAmount === 'number' && a.stakeAmount > 0) stakes.push(a.stakeAmount);
      }
    } catch { /* clé absente ou format inattendu — ignorée */ }
  }
  return { total: stakes.reduce((s, v) => s + v, 0), stakes };
}

// Total réellement bloqué en ce moment sur des paris encore en attente de résultat (statut
// 'accepted', tous types confondus, sans filtre de date) — 20 juillet 2026. `state.current` ne
// bouge qu'au règlement (won/lost), donc pendant qu'un pari est en jeu il inclut encore de l'argent
// qui n'est plus disponible sur le compte réel du bookmaker (déjà débité à la mise). L'affichage du
// solde doit donc soustraire ce total pour refléter le vrai solde consultable (ex: 700€ de bankroll
// "logique" avec 50€ engagés = 650€ réellement visibles sur Betclic tant que le pari n'est pas réglé).
export function getEngagedPending() {
  const stakes = [];
  for (const key of ALERT_STORAGE_KEYS) {
    try {
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      for (const a of arr) {
        if (a.status !== 'accepted') continue;
        if (typeof a.stakeAmount === 'number' && a.stakeAmount > 0) stakes.push(a.stakeAmount);
      }
    } catch { /* clé absente ou format inattendu — ignorée */ }
  }
  return { total: stakes.reduce((s, v) => s + v, 0), stakes };
}

export function getBracketLabel(bk) {
  let bracket = BANKROLL_BRACKETS[0], idx = 0;
  BANKROLL_BRACKETS.forEach((b, i) => { if (bk >= b.min) { bracket = b; idx = i; } });
  const next = BANKROLL_BRACKETS[idx + 1];
  return { min: bracket.min, max: next ? next.min - 1 : null, pct: bracket.pct };
}

const DEFAULT_STATE = () => ({
  startAmount: 250,
  startDate: new Date().toISOString(),
  current: 250,
  history: [], // { date, type: 'win'|'loss'|'reset', stake, odds, profit, balanceAfter, betId?, betLabel? }
  processedIds: [], // ids des paris bet-history déjà appliqués — évite le double-comptage à l'auto-sync
  baselineSeeded: false, // cf. seedBaselineIfNeeded()
});

export function loadBankrollState() {
  try {
    const raw = localStorage.getItem(BANKROLL_KEY);
    if (!raw) return DEFAULT_STATE();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.current !== 'number') return DEFAULT_STATE();
    if (!Array.isArray(parsed.processedIds)) parsed.processedIds = [];
    if (typeof parsed.baselineSeeded !== 'boolean') parsed.baselineSeeded = false;
    return parsed;
  } catch { return DEFAULT_STATE(); }
}

// À la toute première utilisation du tracker (ou après une migration depuis l'ancienne version
// sans processedIds), tous les paris DÉJÀ réglés à cet instant sont marqués comme référence de
// départ sans être appliqués — sinon l'auto-sync rejouerait tout l'historique (des dizaines de
// paris depuis fin juin) à travers le nouveau plan de mise, ce qui n'a pas de sens : seuls les
// paris réglés APRÈS l'activation du suivi doivent faire bouger le bankroll (16 juillet 2026).
export async function seedBaselineIfNeeded(state) {
  if (state.baselineSeeded) return state;
  let ids = state.processedIds;
  try {
    const res = await fetch('/api/bet-history');
    const data = await res.json();
    const bets = Array.isArray(data) ? data : (data.bets || data.history || []);
    const allSettledIds = bets.filter(b => (b.status === 'won' || b.status === 'lost') && b.id).map(b => b.id);
    ids = [...new Set([...ids, ...allSettledIds])];
  } catch { /* si le fetch échoue, on retentera au prochain montage — pas bloquant */ return state; }
  return saveBankrollState({ ...state, processedIds: ids, baselineSeeded: true });
}

export function saveBankrollState(state) {
  const json = JSON.stringify(state);
  cloudSet(BANKROLL_KEY, json);
  return state;
}

export function recordBet(state, { won, odds, betId = null, betLabel = null, stake = null }) {
  const finalStake = stake ?? getRecommendedStake(state.current);
  const profit = won ? +(finalStake * (odds - 1)).toFixed(2) : -finalStake;
  const balanceAfter = +(state.current + profit).toFixed(2);
  const entry = { date: new Date().toISOString(), type: won ? 'win' : 'loss', stake: finalStake, odds, profit, balanceAfter, betId, betLabel };
  return saveBankrollState({
    ...state,
    current: balanceAfter,
    history: [...state.history, entry],
    processedIds: betId ? [...state.processedIds, betId] : state.processedIds,
  });
}

// Reset = on repart de zéro : tous les paris déjà réglés à cet instant (même ceux pas encore
// traités par l'auto-sync, ex: le pari qui vient de vider l'ancien bankroll) sont marqués comme
// déjà pris en compte, pour qu'ils ne soient JAMAIS réappliqués après coup avec la mise du nouveau
// palier — seuls les paris réglés APRÈS le reset doivent nourrir le tracker (16 juillet 2026).
export async function resetBankroll(state, amount) {
  const entry = { date: new Date().toISOString(), type: 'reset', stake: null, odds: null, profit: null, balanceAfter: amount };
  let existingIds = state.processedIds;
  try {
    const res = await fetch('/api/bet-history');
    const data = await res.json();
    const bets = Array.isArray(data) ? data : (data.bets || data.history || []);
    const allSettledIds = bets.filter(b => (b.status === 'won' || b.status === 'lost') && b.id).map(b => b.id);
    existingIds = [...new Set([...state.processedIds, ...allSettledIds])];
  } catch { /* si le fetch échoue, on garde processedIds tel quel — pas bloquant */ }
  return saveBankrollState({ startAmount: amount, startDate: entry.date, current: amount, history: [...state.history, entry], processedIds: existingIds, baselineSeeded: true });
}

// Fix 19 juillet 2026 — basketball_result/basketball_spread stockent leur cote dans un champ plat
// `odds` (ex: {odds: 1.59, bookmaker: 'betclic'}), jamais dans les champs par bookmaker
// (acceptedUnibetOdds/acceptedBetclicOdds/...) que ce sélecteur cherchait exclusivement. Comme
// updateResultStatus/updateSpreadStatus (PlaceBetPage.jsx) ne posent jamais acceptedBookmaker à
// l'accept, TOUS les paris Résultat/Écart H2H depuis leur création tombaient dans aucune des
// branches ci-dessous → odds toujours undefined → syncBankrollFromHistory les marquait "traités"
// sans jamais appliquer leur gain/perte au bankroll, silencieusement. `?? b.odds` en toute fin
// couvre ce cas sans changer le comportement existant (les props/foot ont déjà une valeur avant ce point).
const pickOdds = b => (b.acceptedBookmaker === 'unibet' ? (b.acceptedUnibetOdds ?? b.unibetOdds)
  : b.acceptedBookmaker === 'betclic' ? (b.acceptedBetclicOdds ?? b.betclicOdds)
  : b.acceptedBookmaker === 'winamax' ? (b.acceptedWinamaxOdds ?? b.winamaxOdds)
  : (b.acceptedUnibetOdds ?? b.acceptedBetclicOdds ?? b.acceptedWinamaxOdds ?? b.unibetOdds ?? b.betclicOdds ?? b.winamaxOdds)) ?? b.odds;

function labelFor(b) {
  if (b.player && b.stat) return `${b.player} ${b.direction === 'over' ? 'Over' : 'Under'} ${b.line} ${b.stat}`;
  if (b.type === 'basketball_result' || b.type === 'football_result') return `Résultat ${b.direction === 'home' ? b.home : b.direction === 'away' ? b.away : 'Match nul'}`;
  return `${b.fixture || `${b.home} vs ${b.away}`} — ${b.type || b.stat || ''}`;
}

// Auto-sync : applique au bankroll tout pari won/lost du registre backend (source de vérité,
// indépendant de la page/du composant où le règlement a réellement eu lieu) qui n'a pas encore été
// traité (processedIds). Les paris sont appliqués dans l'ordre chronologique (acceptedAt) pour que
// la mise recommandée à chaque étape corresponde bien au palier du moment (16 juillet 2026).
// Mise = celle éditée manuellement sur l'alerte si présente (stakeAmount), sinon la mise pleine du
// palier — pas de division automatique entre alertes du même jour (voir note en tête de fichier).
export async function syncBankrollFromHistory(state) {
  let bets;
  try {
    const res = await fetch('/api/bet-history');
    const data = await res.json();
    bets = Array.isArray(data) ? data : (data.bets || data.history || []);
  } catch { return state; }
  const settled = bets.filter(b => (b.status === 'won' || b.status === 'lost') && b.id);
  const processed = new Set(state.processedIds);
  const toApply = settled
    .filter(b => !processed.has(b.id))
    .sort((a, b) => (a.acceptedAt || 0) - (b.acceptedAt || 0));
  if (!toApply.length) return state;
  let s = state;
  for (const b of toApply) {
    const odds = pickOdds(b);
    if (odds == null) { s = { ...s, processedIds: [...s.processedIds, b.id] }; continue; } // pas de cote exploitable, on marque quand même traité pour ne pas boucler dessus
    const stake = (typeof b.stakeAmount === 'number' && b.stakeAmount > 0) ? b.stakeAmount : getRecommendedStake(s.current);
    s = recordBet(s, { won: b.status === 'won', odds, betId: b.id, betLabel: labelFor(b), stake });
  }
  return s;
}
