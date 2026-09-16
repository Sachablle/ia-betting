// Synchronise les alertes props locales (localStorage) avec le modèle live du backend.
// Partagé entre PlaceBetPage (page "Alertes") et RunningPage (page "Running") :
// avant cette extraction, seule PlaceBetPage appelait cette logique — RunningPage affichait
// donc des % figés au moment du clic, jamais resynchronisés sur le modèle en direct
// (cf. memory feedback_session_08juin_bugs_recurrents #4, divergence Clark/Bridges/Castle/Brunson).

import { setItem as cloudSet } from './cloudStorage.js';
import { getRecommendedStake, loadBankrollState } from './bankroll.js';

// Écrit `alerts` dans la clé localStorage `key` en préservant toute entrée déjà en storage dont le
// statut est décisif (accepted/rejected/won/lost/void) et absente du sous-ensemble écrit. Sans ça,
// une page qui ne garde qu'une fenêtre récente en state (ex. rawAlerts ~7j) peut écraser
// silencieusement un pari tout juste accepté par un autre onglet/cycle utilisant un state obsolète
// — fix du 6 juillet 2026 pour ALERT_KEY seul, généralisé à toutes les clés le 11 juillet 2026 après
// l'incident Breanna Stewart (alerte acceptée disparue sans trace, écrasée par une écriture
// concurrente qui ne la protégeait pas encore).
const PROTECTED_STATUSES = new Set(['accepted', 'rejected', 'won', 'lost', 'void']);
export function persistAlertsKey(key, alerts) {
  try {
    const current = JSON.parse(localStorage.getItem(key) || '[]');
    const writtenIds = new Set(alerts.map(a => a.id));
    const preservedOld = current.filter(a => PROTECTED_STATUSES.has(a.status) && !writtenIds.has(a.id));
    cloudSet(key, JSON.stringify([...alerts, ...preservedOld]));
  } catch { cloudSet(key, JSON.stringify(alerts)); }
}

const ALERT_KEY     = 'nba_prop_alerts';
const HISTORY_KEY   = 'nba_bet_history';
const GAME_TOTAL_KEY = 'nba_game_total_alerts';
export const TEAM_TOTAL_KEY = 'basketball_teamtotal_alerts';
const BASKETBALL_RESULT_KEY = 'basketball_result_alerts';
const FB_BTTS_KEY   = 'fb_btts_alerts';
const FB_TOTAL_KEY  = 'fb_total_alerts';
const FB_RESULT_KEY = 'fb_result_alerts';
// Total de buts PAR ÉQUIPE (14 septembre 2026) — passé en production, même patron de sync que
// football_total (id inclut side+ligne, `${fixtureId}_teamgoals_${side}_${line}`).
const FB_TEAM_GOALS_KEY = 'fb_team_goals_alerts';
const FB_PINNACLE_KEY = 'fb_pinnacle_alerts';
const FB_DC_BTTS_KEY = 'fb_dc_btts_alerts';
const FB_DC_OU_KEY   = 'fb_dc_ou_alerts';
// Préfixes fixtureId réellement suivis en live côté backend (10 septembre 2026) — utilisé par la
// purge orpheline BTTS ci-dessous. Doit rester synchro avec FOOTBALL_SETTLEMENT_SOURCES plus bas
// dans ce fichier (même liste de préfixes, panorama complet des championnats foot en direct).
const LIVE_FOOTBALL_FIXTURE_PREFIX = /^(fd_|fdcdm_|fdbr_|afel_|afcl_|afch_|grc_|arb_|por_)/;
const BBALL_PINNACLE_KEY = 'bball_pinnacle_alerts';
const PURGE_PLAYERS = ['Justin Bean', 'Jack Kayil', 'Leandro Bolmaro'];

// Applique les settlements backend (won/lost/void) dans le localStorage — appeler depuis n'importe
// quelle page. Boucle sur toutes les clés d'alertes connues (props, total, résultat équipe, foot)
// pour que chaque type bénéficie du même règlement serveur — un seul endroit à étendre pour un
// futur type d'alerte (22 juin 2026, avant ça seul ALERT_KEY/props était couvert ici).
const SETTLEABLE_KEYS = [ALERT_KEY, GAME_TOTAL_KEY, TEAM_TOTAL_KEY, BASKETBALL_RESULT_KEY, FB_BTTS_KEY, FB_TOTAL_KEY, FB_RESULT_KEY, FB_PINNACLE_KEY, BBALL_PINNACLE_KEY, FB_DC_BTTS_KEY, FB_DC_OU_KEY, FB_TEAM_GOALS_KEY];

const PENDING_SYNC_KEY = 'pending_alert_sync';
const readPendingSync  = () => { try { return JSON.parse(localStorage.getItem(PENDING_SYNC_KEY) || '[]'); } catch { return []; } };
const writePendingSync = list => { try { localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(list)); } catch {} };

// Envoie une alerte acceptée au serveur avec retry — avant ce fix (22 juin 2026), un .catch(()=>{})
// silencieux laissait le pari invisible côté serveur (jamais réglé automatiquement par
// runAutoSettle) si la requête échouait une seule fois, ex. redémarrage backend (node --watch)
// pendant le clic "accepter" — cas réel constaté sur une alerte ACB Total. 3 tentatives
// rapprochées, puis mise en file localStorage pour réessai au prochain chargement de page
// (flushPendingAlertSync, appelé depuis syncSettlements).
export async function postAcceptedAlertReliably(alert) {
  if (!alert?.id) return;
  for (const delay of [0, 1500, 4000]) {
    if (delay) await new Promise(r => setTimeout(r, delay));
    try {
      const res = await fetch('/api/accepted-alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(alert) });
      if (res.ok) { writePendingSync(readPendingSync().filter(a => a.id !== alert.id)); return; }
    } catch {}
  }
  writePendingSync([...readPendingSync().filter(a => a.id !== alert.id), alert]);
}

// Réessaie les alertes acceptées jamais confirmées côté serveur (3 tentatives épuisées) — appelé
// au chargement de PlaceBetPage/RunningPage via syncSettlements.
// Un pending resté bloqué (échecs répétés au moment de l'acceptation, ex: coupure backend) ne doit
// jamais rejouer un "accepted" périmé si l'utilisateur a annulé/rejeté ce pari entre-temps — sinon
// le prochain flush (à chaque montage de page) ressuscite un pari déjà annulé avec son état d'origine
// (cas réel : alerte Jessica Shepard reportée, annulée plusieurs fois, revenue à chaque fois avec le
// même acceptedAt d'origine — 17 juillet 2026).
const REVOKED_STATUSES = new Set(['void', 'rejected', 'won', 'lost']);
function isNowRevoked(id) {
  for (const key of SETTLEABLE_KEYS) {
    try {
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const found = arr.find(a => a.id === id);
      if (found && REVOKED_STATUSES.has(found.status)) return true;
    } catch {}
  }
  return false;
}

export async function flushPendingAlertSync() {
  const pending = readPendingSync();
  for (const alert of pending) {
    if (isNowRevoked(alert.id)) { writePendingSync(readPendingSync().filter(a => a.id !== alert.id)); continue; }
    try {
      const res = await fetch('/api/accepted-alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(alert) });
      if (res.ok) writePendingSync(readPendingSync().filter(a => a.id !== alert.id));
    } catch {}
  }
}

const PENDING_SETTLEMENT_KEY = 'pending_settlement_sync';
const readPendingSettlements  = () => { try { return JSON.parse(localStorage.getItem(PENDING_SETTLEMENT_KEY) || '[]'); } catch { return []; } };
const writePendingSettlements = list => { try { localStorage.setItem(PENDING_SETTLEMENT_KEY, JSON.stringify(list)); } catch {} };

// Même fiabilité que postAcceptedAlertReliably ci-dessus, appliquée à l'envoi du résultat foot par
// resolveCompletedFootballAlerts() — avant ce fix (25 juin 2026), un .catch(()=>{}) silencieux sans
// retry perdait la trace serveur du pari dès la moindre panne réseau/redémarrage backend, alors que
// le résultat était déjà correctement réglé dans le localStorage (cas réel : 3 alertes Under CDM du
// 24 juin correctement W/L côté navigateur mais absentes de settlements.json côté serveur).
async function postSettlementReliably(payload) {
  if (!payload?.id) return;
  for (const delay of [0, 1500, 4000]) {
    if (delay) await new Promise(r => setTimeout(r, delay));
    try {
      const res = await fetch('/api/settlements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) { writePendingSettlements(readPendingSettlements().filter(p => p.id !== payload.id)); return; }
    } catch {}
  }
  writePendingSettlements([...readPendingSettlements().filter(p => p.id !== payload.id), payload]);
}

// Réessaie les résultats foot jamais confirmés côté serveur — appelé au chargement via syncSettlements.
export async function flushPendingSettlementSync() {
  const pending = readPendingSettlements();
  for (const payload of pending) {
    try {
      const res = await fetch('/api/settlements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) writePendingSettlements(readPendingSettlements().filter(p => p.id !== payload.id));
    } catch {}
  }
}

export async function syncSettlements() {
  try {
    await flushPendingAlertSync();
    await flushPendingSettlementSync();
    const settlements = await fetch('/api/settlements').then(r => r.ok ? r.json() : []).catch(() => []);
    if (!settlements?.length) return;
    const purges = settlements.filter(s => s.purge);
    let anyChanged = false;

    for (const key of SETTLEABLE_KEYS) {
      const raw = JSON.parse(localStorage.getItem(key) || '[]');
      let changed = false;
      const updated = raw
        .filter(a => {
          const s = settlements.find(x => x.id === a.id);
          if (s?.status === 'void' && a.status === 'accepted') { changed = true; return false; }
          if (purges.some(p => p.player && p.player === a.player && (!p.date || a.fixtureDate?.startsWith(p.date)))) { changed = true; return false; }
          return true;
        })
        .map(a => {
          const s = settlements.find(x => x.id === a.id);
          if (!s || a.status === s.status || s.status === 'void') return a;
          changed = true;
          return { ...a, status: s.status, actualStat: s.actualStat ?? a.actualStat ?? null };
        });
      if (changed) { cloudSet(key, JSON.stringify(updated)); anyChanged = true; }
    }
    if (anyChanged) window.dispatchEvent(new Event('nba_alerts_updated'));
  } catch {}
}

export async function syncBackgroundAlerts() {
  try {
    const { alerts: bgAlerts } = await fetch('/api/nba/background-alerts').then(r => r.json());
    // bgAlerts=[] est une réponse valide (aucune alerte ne qualifie ce cycle) et doit quand même
    // atteindre la purge des orphelins pending plus bas — seul un fetch/parse raté (bgAlerts
    // null/undefined) doit court-circuiter. Avant ce fix (14 juillet 2026), une réponse totalement
    // vide empêchait TOUTE synchro de tourner, y compris la purge : une alerte locale pending dont
    // le pendant backend disparaît (ex: titulaire passée Q/GTD) restait figée indéfiniment tant que
    // le backend renvoyait au moins une alerte d'un autre type — et disparaissait carrément dès que
    // le backend tombait à zéro alerte au total (cas réel : alerte spread Indiana Fever/Caitlin
    // Clark toujours visible côté utilisateur alors que le backend ne la renvoyait plus).
    if (!bgAlerts) return;
    const existing = JSON.parse(localStorage.getItem(ALERT_KEY) || '[]');
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    // On cherche dans existing + history pour bloquer les re-générations post-dismiss
    const allKnown = [...existing, ...history];
    const byId = {};
    existing.forEach(a => { byId[a.id] = a; });

    // Cherche un match par empreinte (joueur+stat+direction+line ±1, même jour ±36h)
    const findByFingerprint = (a, status) => {
      const aTime = new Date(a.fixtureDate).getTime();
      return allKnown.find(p => {
        if (status && p.status !== status) return false;
        if (p.player !== a.player || p.stat !== a.stat || p.direction !== a.direction) return false;
        if (Math.abs((p.line ?? 0) - (a.line ?? 0)) >= 1.0) return false;
        const pTime = new Date(p.fixtureDate).getTime();
        if (!isNaN(pTime) && !isNaN(aTime) && Math.abs(pTime - aTime) > 36 * 3600_000) return false;
        return true;
      });
    };

    // Une alerte acceptée existe déjà sur ce joueur+stat (même jour ±36h) dans la direction opposée
    // (over vs under) → ne jamais créer une 2e alerte contradictoire. Le retournement éventuel du
    // modèle est signalé via directionFlip (cf. syncOddsDrift), pas via une nouvelle carte.
    const findOppositeAccepted = (a) => {
      const aTime = new Date(a.fixtureDate).getTime();
      return allKnown.find(p => {
        if (p.status !== 'accepted') return false;
        if (p.player !== a.player || p.stat !== a.stat || p.direction === a.direction) return false;
        const pTime = new Date(p.fixtureDate).getTime();
        if (!isNaN(pTime) && !isNaN(aTime) && Math.abs(pTime - aTime) > 36 * 3600_000) return false;
        return true;
      });
    };

    let changed = false;
    bgAlerts.forEach(a => {
      // Bloquer toute alerte sans probabilité réelle (probability=0 → gap alert ou bug)
      if (!(a.probability > 0)) return;
      // Bloquer joueurs blacklistés
      if (PURGE_PLAYERS.includes(a.player)) return;
      // Rejeté/terminé (même empreinte, même jour) → jamais renvoyé
      if (findByFingerprint(a, 'rejected')) return;
      if (findByFingerprint(a, 'won')) return;
      if (findByFingerprint(a, 'lost')) return;
      if (findByFingerprint(a, 'void')) return;
      // Alerte acceptée existante dans l'autre sens → pas de doublon contradictoire
      if (findOppositeAccepted(a)) return;

      const prev = byId[a.id];

      // Accepté avec un ID différent (PropsSection vs background) → cherche par empreinte
      const acceptedMatch = (!prev || prev.status !== 'accepted')
        ? findByFingerprint(a, 'accepted')
        : null;

      if (acceptedMatch) {
        // Pour les alertes acceptées : référence = cotes au moment du clic (acceptedXxxOdds)
        // Tout mouvement ≥ 0.02 est affiché (1.70→1.65 = 0.05 → visible)
        const refUb = acceptedMatch.acceptedUnibetOdds  ?? acceptedMatch.unibetOdds;
        const refBc = acceptedMatch.acceptedBetclicOdds ?? acceptedMatch.betclicOdds;
        const refWm = acceptedMatch.acceptedWinamaxOdds ?? acceptedMatch.winamaxOdds;
        const lineShift = Math.abs((a.line ?? 0) - (acceptedMatch.line ?? 0)) >= 1.0;
        const ubShift   = a.unibetOdds  != null && refUb != null && Math.abs(a.unibetOdds  - refUb) >= 0.02;
        const bcShift   = a.betclicOdds != null && refBc != null && Math.abs(a.betclicOdds - refBc) >= 0.02;
        const wmShift   = a.winamaxOdds != null && refWm != null && Math.abs(a.winamaxOdds - refWm) >= 0.02;
        // Resynchronise % et projection sur le modèle en direct (même source que Analyse Props) —
        // une alerte acceptée garde sa cote/ligne au moment du clic, mais doit toujours afficher
        // le même % que la page du match (sinon "running" et "Analyse Props" divergent)
        const probChanged = a.probability != null && a.probability !== acceptedMatch.probability;
        const estChanged  = a.estimate != null && a.estimate !== acceptedMatch.estimate;
        // Avertissement de dérive (8 juillet 2026, cf. refreshOrDropPendingProp/ById côté backend)
        // — n'affecte jamais probability/status (le pari reste tel qu'accepté), juste un signal.
        const driftChanged = !!a.probDropWarning !== !!acceptedMatch.probDropWarning
          || a.currentProbability !== acceptedMatch.currentProbability;
        // Fix 20 août 2026 — acceptedMatch peut venir de `history` seule (jamais de `existing`,
        // donc jamais encore dans byId) : cas réel Allisha Gray, présente accepted dans
        // nba_bet_history mais absente de nba_prop_alerts, cote/ligne/proba identiques depuis
        // l'acceptation → aucun des 6 "shift" ci-dessus n'était vrai, donc byId[acceptedMatch.id]
        // n'était jamais posé et l'alerte ne revenait jamais dans la liste courante (invisible sur
        // Running). Il faut restaurer l'entrée dans byId dès qu'elle n'y est pas déjà, même sans
        // rien de changé à afficher.
        const needsRestore = !byId[acceptedMatch.id];
        if (lineShift || ubShift || bcShift || wmShift || probChanged || estChanged || driftChanged || needsRestore) {
          byId[acceptedMatch.id] = {
            ...acceptedMatch,
            ...((lineShift || ubShift || bcShift || wmShift) ? {
              oddsAlert: {
                lineFrom: acceptedMatch.line, lineTo: lineShift ? a.line : null,
                ubFrom: refUb, ubTo: ubShift ? a.unibetOdds : null,
                bcFrom: refBc, bcTo: bcShift ? a.betclicOdds : null,
                wmFrom: refWm, wmTo: wmShift ? a.winamaxOdds : null,
              },
            } : {}),
            unibetOdds:  a.unibetOdds  ?? acceptedMatch.unibetOdds,
            betclicOdds: a.betclicOdds ?? acceptedMatch.betclicOdds,
            winamaxOdds: a.winamaxOdds ?? acceptedMatch.winamaxOdds,
            probability: a.probability ?? acceptedMatch.probability,
            rawProbability: a.rawProbability ?? acceptedMatch.rawProbability ?? null,
            estimate:    a.estimate    ?? acceptedMatch.estimate,
            probDropWarning: a.probDropWarning ?? false,
            currentProbability: a.probDropWarning ? a.currentProbability : null,
            // Raison lisible de la dérive (ex. "Cameron Brink : Out → Questionable") quand le
            // backend a pu l'attribuer à un changement de statut adverse (15 juillet 2026).
            driftReason: a.probDropWarning ? (a.driftReason ?? null) : null,
          };
          changed = true;
        }
        return; // on ne crée pas de nouvelle alerte
      }

      // Pending avec un ID différent (PropsSection vs background) → cherche par empreinte
      const pendingMatch = (!prev || prev.status !== 'pending')
        ? findByFingerprint(a, 'pending')
        : null;

      if (pendingMatch) {
        // Alerte pending identique existe déjà — mettre à jour les cotes si elles ont bougé,
        // et toujours rafraîchir probabilité/projection pour rester alignée sur le modèle en direct
        // (comme Analyse Props — une alerte "pending" n'est pas figée, contrairement à une acceptée)
        const lineShift = Math.abs((a.line ?? 0) - (pendingMatch.line ?? 0)) >= 1.0;
        const ubShift   = a.unibetOdds  != null && pendingMatch.unibetOdds  != null && Math.abs(a.unibetOdds  - pendingMatch.unibetOdds)  >= 0.05;
        const bcShift   = a.betclicOdds != null && pendingMatch.betclicOdds != null && Math.abs(a.betclicOdds - pendingMatch.betclicOdds) >= 0.05;
        const wmShift   = a.winamaxOdds != null && pendingMatch.winamaxOdds != null && Math.abs(a.winamaxOdds - pendingMatch.winamaxOdds) >= 0.05;
        const probChanged = a.probability != null && a.probability !== pendingMatch.probability;
        const estChanged  = a.estimate != null && a.estimate !== pendingMatch.estimate;
        if (lineShift || ubShift || bcShift || wmShift || probChanged || estChanged) {
          byId[pendingMatch.id] = {
            ...pendingMatch,
            ...(lineShift || ubShift || bcShift || wmShift ? {
              oddsAlert: {
                lineFrom: pendingMatch.line, lineTo: lineShift ? a.line : null,
                ubFrom: pendingMatch.unibetOdds, ubTo: ubShift ? a.unibetOdds : null,
                bcFrom: pendingMatch.betclicOdds, bcTo: bcShift ? a.betclicOdds : null,
                wmFrom: pendingMatch.winamaxOdds, wmTo: wmShift ? a.winamaxOdds : null,
              },
            } : {}),
            unibetOdds:  a.unibetOdds  ?? pendingMatch.unibetOdds,
            betclicOdds: a.betclicOdds ?? pendingMatch.betclicOdds,
            winamaxOdds: a.winamaxOdds ?? pendingMatch.winamaxOdds,
            probability: a.probability ?? pendingMatch.probability,
            rawProbability: a.rawProbability ?? pendingMatch.rawProbability ?? null,
            estimate:    a.estimate    ?? pendingMatch.estimate,
            teammateOverlap: a.teammateOverlap ?? pendingMatch.teammateOverlap ?? null,
            oppQSamePosition: a.oppQSamePosition ?? pendingMatch.oppQSamePosition ?? false,
          };
          changed = true;
        }
        return; // Ne pas créer de doublon
      }

      if (!prev || (prev.status || 'pending') === 'pending') {
        // Ne jamais écraser une cote déjà enrichie côté frontend (enrichUnibet, PlaceBetPage.jsx)
        // par une valeur absente/plus ancienne du backend — sinon la cote disparaît puis
        // enrichUnibet la rapatrie aussitôt, et le SSE (auto-déclenché par sa propre écriture)
        // boucle cette bascule en quelques secondes (flicker Betclic constaté 12 juillet, cas
        // Breanna Stewart — même famille que l'incident du 11 juillet référencé plus haut).
        byId[a.id] = {
          ...a,
          // Fix 2 août 2026 — cette fonction (player_prop) avait échappé au fix du 22 juillet qui a
          // corrigé les 11 autres syncXxxAlerts() (cf. project_accepted_alert_revert_fix_juillet22) :
          // sans `a.status ||`, un id absent du localStorage local (ex: après un restart backend,
          // le catch-up _acceptedAlerts régénère l'alerte mais le frontend ne l'avait pas encore vue)
          // retombait en 'pending' même si le backend renvoyait déjà 'accepted'.
          // Fix 20 août 2026 — `prev?.status ||` ne servait à rien : on n'entre dans cette branche
          // que quand prev est absent OU déjà 'pending' (garde ligne 319), donc prev?.status valait
          // toujours soit undefined soit 'pending' (chaîne non vide = truthy) et gagnait
          // systématiquement le `||` face à a.status. Une alerte acceptée via Telegram (pas via
          // l'app) ne touche jamais le localStorage directement — son statut 'accepted' venu du
          // backend était donc silencieusement ignoré si une copie locale 'pending' existait déjà
          // (cas réel : Allisha Gray acceptée sur Telegram, restée "pending" en local indéfiniment,
          // absente de Running). Le backend fait foi ici, jamais l'inverse.
          status: a.status || 'pending',
          unibetOdds:   a.unibetOdds   ?? prev?.unibetOdds   ?? null,
          betclicOdds:  a.betclicOdds  ?? prev?.betclicOdds  ?? null,
          winamaxOdds:  a.winamaxOdds  ?? prev?.winamaxOdds  ?? null,
          lastEnriched: prev?.lastEnriched,
        };
        // Marquer changed seulement si quelque chose de significatif a changé
        // Fix 20 août 2026 — cette liste ne comparait jamais le statut : le fix juste au-dessus
        // recalculait bien `status: 'accepted'` dans byId[a.id], mais si aucun des autres champs
        // n'avait bougé depuis la dernière synchro pending (cas fréquent — l'alerte n'a pas eu le
        // temps de dériver entre sa création et son acceptation Telegram), `changed` restait false
        // et le `cloudSet` plus bas n'était jamais atteint : le recalcul restait piégé en mémoire,
        // jamais écrit dans le localStorage réellement lu par Running/PlaceBetPage.
        if (!prev ||
            (prev.status || 'pending') !== (a.status || 'pending') ||
            prev.probability !== a.probability ||
            prev.line !== a.line ||
            prev.unibetOdds !== a.unibetOdds ||
            prev.betclicOdds !== a.betclicOdds ||
            prev.winamaxOdds !== a.winamaxOdds ||
            prev.playerIsQ !== a.playerIsQ) {
          changed = true;
        }
      } else if (prev.status === 'accepted') {
        // Même ID, cote/cut bougé — comparé à la ligne du bookmaker RÉELLEMENT accepté, pas à la
        // ligne de référence (souvent Unibet, cf. `a.line`). Fix 28 août 2026 (cas réel : Jackie
        // Young pariée sur Betclic à 19.5 alors que la ligne de référence Unibet était 20.5 —
        // corriger `prev.line` à la vraie ligne pariée se faisait aussitôt écraser par ce bloc, qui
        // comparait à 20.5 et voyait ça comme un "shift" à rattraper). Repli sur `a.line` si le
        // bookmaker accepté est inconnu ou absent de la ligne live (alerte pré-fix, ancien format).
        const acceptedLineField = { unibet: 'unibetLine', betclic: 'betclicLine', winamax: 'winamaxLine' }[prev.acceptedBookmaker];
        const liveAcceptedLine = (acceptedLineField && a[acceptedLineField] != null) ? a[acceptedLineField] : a.line;
        const lineShift = liveAcceptedLine != null && prev.line != null && Math.abs(liveAcceptedLine - prev.line) >= 0.5;
        const ubShift   = a.unibetOdds  != null && prev.unibetOdds  != null && Math.abs(a.unibetOdds  - prev.unibetOdds)  >= 0.05;
        const bcShift   = a.betclicOdds != null && prev.betclicOdds != null && Math.abs(a.betclicOdds - prev.betclicOdds) >= 0.05;
        const wmShift   = a.winamaxOdds != null && prev.winamaxOdds != null && Math.abs(a.winamaxOdds - prev.winamaxOdds) >= 0.05;
        // Même empreinte que le bloc acceptedMatch ci-dessus : il faut aussi resynchroniser
        // % et projection ici, sinon une alerte acceptée dont l'ID matche déjà (cas le plus courant)
        // reste figée sur le % calculé au moment du clic au lieu de suivre le modèle en direct
        // (= divergence avec Analyse Props, ex. Caitlin Clark / Bridges / Castle / Brunson)
        const probChanged = a.probability != null && a.probability !== prev.probability;
        const estChanged  = a.estimate != null && a.estimate !== prev.estimate;
        // rawProbability (2 août 2026) — vraie confiance du modèle avant le plafond sanityMax,
        // affichée entre parenthèses. Se resynchronise comme le %, jamais figée à l'acceptation.
        const rawChanged  = a.rawProbability != null && a.rawProbability !== prev.rawProbability;
        // Avertissement de dérive (8 juillet 2026, cf. refreshOrDropPendingProp/ById côté backend)
        // — n'affecte jamais probability/status (le pari reste tel qu'accepté), juste un signal.
        const driftChanged = !!a.probDropWarning !== !!prev.probDropWarning
          || a.currentProbability !== prev.currentProbability;
        if (lineShift || ubShift || bcShift || wmShift || probChanged || estChanged || rawChanged || driftChanged) {
          byId[a.id] = {
            ...prev,
            ...((lineShift || ubShift || bcShift || wmShift) ? {
              oddsAlert: {
                lineFrom: prev.line, lineTo: lineShift ? liveAcceptedLine : null,
                ubFrom: prev.unibetOdds, ubTo: ubShift ? a.unibetOdds : null,
                bcFrom: prev.betclicOdds, bcTo: bcShift ? a.betclicOdds : null,
                wmFrom: prev.winamaxOdds, wmTo: wmShift ? a.winamaxOdds : null,
              },
            } : {}),
            unibetOdds:  a.unibetOdds  ?? prev.unibetOdds,
            betclicOdds: a.betclicOdds ?? prev.betclicOdds,
            winamaxOdds: a.winamaxOdds ?? prev.winamaxOdds,
            line: lineShift ? liveAcceptedLine : prev.line,
            probability: a.probability ?? prev.probability,
            rawProbability: a.rawProbability ?? prev.rawProbability ?? null,
            estimate:    a.estimate    ?? prev.estimate,
            probDropWarning: a.probDropWarning ?? false,
            currentProbability: a.probDropWarning ? a.currentProbability : null,
            driftReason: a.probDropWarning ? (a.driftReason ?? null) : null,
          };
          changed = true;
        }
      }
      // rejeté même ID : on ne touche pas
    });

    // Purge des alertes "pending" orphelines : le modèle a tourné et ne les régénère plus
    // (projection gelée recalculée différemment → ne franchit plus le seuil). On laisse une marge
    // d'un cycle (20 min + tampon) avant de purger pour ne pas virer une alerte tout juste créée.
    const ORPHAN_GRACE_MS = 25 * 60_000;
    const isLiveFingerprint = (a) => {
      const aTime = new Date(a.fixtureDate).getTime();
      return bgAlerts.some(p => {
        if (p.player !== a.player || p.stat !== a.stat || p.direction !== a.direction) return false;
        if (Math.abs((p.line ?? 0) - (a.line ?? 0)) >= 1.0) return false;
        const pTime = new Date(p.fixtureDate).getTime();
        if (!isNaN(pTime) && !isNaN(aTime) && Math.abs(pTime - aTime) > 36 * 3600_000) return false;
        return true;
      });
    };
    Object.keys(byId).forEach(id => {
      const a = byId[id];
      if ((a.status || 'pending') !== 'pending') return;
      if (Date.now() - (a.savedAt || 0) < ORPHAN_GRACE_MS) return;
      if (!isLiveFingerprint(a)) {
        delete byId[id];
        changed = true;
      }
    });

    // Dédoublonnage des entrées "même pari, ID différent" (legacy fixture.id vs eventId,
    // cf. memory feedback_session_08juin_bugs_recurrents #4) : deux entrées accepted/pending
    // pour le même joueur+stat+direction+jour cohabitent encore avec des % d'anciens modèles.
    // On garde celle dont l'ID correspond à une alerte live actuelle (modèle à jour),
    // sinon la plus récente (savedAt/acceptedAt le plus grand), et on supprime l'autre
    // des DEUX clés localStorage (nba_prop_alerts + nba_bet_history, sinon findByFingerprint
    // la ressuscite).
    const removedIds = new Set();
    const liveIds = new Set(bgAlerts.map(b => b.id));
    // Même empreinte que findByFingerprint (joueur+stat+direction+ligne ±1.0+date ±36h) —
    // une clé stricte par jour calendaire échoue dès que deux entrées sont à cheval sur minuit
    const sameFingerprint = (x, y) => {
      if (x.player !== y.player || x.stat !== y.stat || x.direction !== y.direction) return false;
      if (Math.abs((x.line ?? 0) - (y.line ?? 0)) >= 1.0) return false;
      const xT = new Date(x.fixtureDate).getTime();
      const yT = new Date(y.fixtureDate).getTime();
      if (!isNaN(xT) && !isNaN(yT) && Math.abs(xT - yT) > 36 * 3600_000) return false;
      return true;
    };
    const candidates = Object.values(byId).filter(a => a.status === 'accepted' || a.status === 'pending');
    const visited = new Set();
    candidates.forEach(a => {
      if (visited.has(a.id) || removedIds.has(a.id)) return;
      const group = candidates.filter(b => b.status === a.status && sameFingerprint(a, b));
      if (group.length < 2) { visited.add(a.id); return; }
      group.forEach(g => visited.add(g.id));
      const winner = group.find(e => liveIds.has(e.id))
        || group.slice().sort((x, y) => (y.savedAt || y.acceptedAt || 0) - (x.savedAt || x.acceptedAt || 0))[0];
      group.forEach(e => {
        if (e.id !== winner.id) {
          delete byId[e.id];
          removedIds.add(e.id);
          changed = true;
        }
      });
    });
    if (removedIds.size) {
      const cleanHistory = history.filter(h => !removedIds.has(h.id));
      if (cleanHistory.length !== history.length) {
        cloudSet(HISTORY_KEY, JSON.stringify(cleanHistory));
      }
    }

    if (changed) {
      // Re-lire le localStorage courant avant d'écrire : si l'utilisateur a accepté/rejeté
      // une alerte pendant le fetch async, ne pas écraser son statut.
      const TERMINAL = ['accepted', 'rejected', 'won', 'lost', 'void'];
      const currentRaw = JSON.parse(localStorage.getItem(ALERT_KEY) || '[]');
      const currentById = {};
      currentRaw.forEach(a => { currentById[a.id] = a; });
      const merged = Object.values(byId).map(a => {
        const cur = currentById[a.id];
        if (cur && TERMINAL.includes(cur.status)) return cur;
        return a;
      });
      cloudSet(ALERT_KEY, JSON.stringify(merged));
      window.dispatchEvent(new Event('nba_alerts_updated'));
    }
  } catch (e) { console.error('[syncBackgroundAlerts] error:', e); }
}

// Pont alertes "totaux" backend (game_total, NBA/WNBA/EU) → localStorage nba_game_total_alerts.
// Le backend applique déjà le seuil P(over)/P(under) >= 80% (TOTAL_ALERT_PROB) — on ne le
// revérifie pas ici, on fait juste confiance au champ `prob` retourné.
export async function syncGameTotalAlerts() {
  try {
    const { alerts: bgAlerts } = await fetch('/api/nba/background-alerts').then(r => r.json());
    // bgAlerts=[] est une réponse valide (aucune alerte ne qualifie ce cycle) et doit quand même
    // atteindre la purge des orphelins pending plus bas — seul un fetch/parse raté (bgAlerts
    // null/undefined) doit court-circuiter. Avant ce fix (14 juillet 2026), une réponse totalement
    // vide empêchait TOUTE synchro de tourner, y compris la purge : une alerte locale pending dont
    // le pendant backend disparaît (ex: titulaire passée Q/GTD) restait figée indéfiniment tant que
    // le backend renvoyait au moins une alerte d'un autre type — et disparaissait carrément dès que
    // le backend tombait à zéro alerte au total (cas réel : alerte spread Indiana Fever/Caitlin
    // Clark toujours visible côté utilisateur alors que le backend ne la renvoyait plus).
    if (!bgAlerts) return;
    const totalAlerts = bgAlerts.filter(a => a.type === 'game_total' && a.prob > 0);

    const existing = JSON.parse(localStorage.getItem(GAME_TOTAL_KEY) || '[]');

    // Empreinte = même affiche (home+away) à ±36h — couvre les IDs différents
    // entre génération backend (`${eventId}_${league}_total`) et client (`${fixture.id}_total`).
    const sameFixture = (a, b) => {
      if (a.home !== b.home || a.away !== b.away) return false;
      const aT = new Date(a.date).getTime();
      const bT = new Date(b.date).getTime();
      if (isNaN(aT) || isNaN(bT)) return true;
      return Math.abs(aT - bT) <= 36 * 3600_000;
    };

    let changed = false;
    const result = [...existing];
    totalAlerts.forEach(a => {
      const idx = result.findIndex(p => p.id === a.id || sameFixture(p, a));
      if (idx === -1) {
        // Fix 25 août 2026 (cas réel : mise/bookmaker Washington/Phoenix qui s'effaçaient tout seuls)
        // — cette branche reconstruisait un objet "neuf" à la main, champ par champ, et n'incluait
        // jamais stakeAmount/acceptedAt/acceptedBookmaker/acceptedOdds/accepted*Odds : si jamais elle
        // se déclenche pour une alerte déjà ACCEPTÉE (ex: localStorage vidé/désynchro), tout
        // l'enrichissement du moment de l'acceptation disparaissait silencieusement, alors que le
        // backend (`a`) les a toujours (accepted_alerts.json les persiste). On part maintenant de
        // l'objet backend complet plutôt que d'une liste de champs choisis à la main.
        result.push({ ...a, savedAt: Date.now(), status: a.status || 'pending' });
        changed = true;
        return;
      }
      const prev = result[idx];
      if ((prev.status || 'pending') !== 'pending') {
        // Accepté/rejeté/réglé : on ne retouche jamais le pari, seul un avertissement de dérive
        // informatif (8 juillet 2026, cf. refreshOrDropPendingById côté backend) peut s'ajouter.
        if (prev.status === 'accepted') {
          const driftChanged = !!a.probDropWarning !== !!prev.probDropWarning || a.currentProbability !== prev.currentProbability;
          if (driftChanged) {
            result[idx] = { ...prev, probDropWarning: a.probDropWarning ?? false, currentProbability: a.probDropWarning ? a.currentProbability : null };
            changed = true;
          }
        }
        return;
      }
      if (prev.estimated !== a.estimated || prev.line !== a.line || prev.direction !== a.direction
          || prev.edge !== a.edge || prev.prob !== a.prob) {
        result[idx] = {
          ...prev,
          estimated: a.estimated, line: a.line, edge: a.edge,
          direction: a.direction, prob: a.prob,
          unibetOdds: a.unibetOdds ?? prev.unibetOdds,
          betclicOdds: a.betclicOdds ?? prev.betclicOdds,
          winamaxOdds: a.winamaxOdds ?? prev.winamaxOdds,
        };
        changed = true;
      }
    });

    // Purge des "pending" que le backend ne génère plus (modèle repassé sous le seuil)
    const ORPHAN_GRACE_MS = 25 * 60_000;
    const liveFingerprints = totalAlerts;
    const purged = result.filter(a => {
      if ((a.status || 'pending') !== 'pending') return true;
      if (Date.now() - (a.savedAt || 0) < ORPHAN_GRACE_MS) return true;
      return liveFingerprints.some(p => p.id === a.id || sameFixture(p, a));
    });
    if (purged.length !== result.length) changed = true;

    if (changed) {
      cloudSet(GAME_TOTAL_KEY, JSON.stringify(purged));
      window.dispatchEvent(new Event('nba_alerts_updated'));
    }
  } catch {}
}

// Pont alertes "Total équipe" backend (team_total, NBA/WNBA/EU, 28 août 2026) → localStorage
// basketball_teamtotal_alerts. Même principe que syncGameTotalAlerts ci-dessus, mais l'empreinte
// doit aussi comparer `side` (home/away) — un même match peut avoir 2 alertes team_total distinctes
// (une par équipe) contrairement à game_total qui n'en a qu'une.
export async function syncTeamTotalAlerts() {
  try {
    const { alerts: bgAlerts } = await fetch('/api/nba/background-alerts').then(r => r.json());
    if (!bgAlerts) return;
    const ttAlerts = bgAlerts.filter(a => a.type === 'team_total' && a.prob > 0);

    const existing = JSON.parse(localStorage.getItem(TEAM_TOTAL_KEY) || '[]');

    const sameFixture = (a, b) => {
      if (a.home !== b.home || a.away !== b.away || a.side !== b.side) return false;
      const aT = new Date(a.date).getTime();
      const bT = new Date(b.date).getTime();
      if (isNaN(aT) || isNaN(bT)) return true;
      return Math.abs(aT - bT) <= 36 * 3600_000;
    };

    let changed = false;
    const result = [...existing];
    ttAlerts.forEach(a => {
      const idx = result.findIndex(p => p.id === a.id || sameFixture(p, a));
      if (idx === -1) {
        result.push({ ...a, savedAt: Date.now(), status: a.status || 'pending' });
        changed = true;
        return;
      }
      const prev = result[idx];
      if ((prev.status || 'pending') !== 'pending') {
        if (prev.status === 'accepted') {
          const driftChanged = !!a.probDropWarning !== !!prev.probDropWarning || a.currentProbability !== prev.currentProbability;
          if (driftChanged) {
            result[idx] = { ...prev, probDropWarning: a.probDropWarning ?? false, currentProbability: a.probDropWarning ? a.currentProbability : null };
            changed = true;
          }
        }
        return;
      }
      if (prev.estimated !== a.estimated || prev.line !== a.line || prev.direction !== a.direction || prev.prob !== a.prob) {
        result[idx] = {
          ...prev,
          estimated: a.estimated, line: a.line, direction: a.direction, prob: a.prob,
          unibetOdds: a.unibetOdds ?? prev.unibetOdds,
          betclicOdds: a.betclicOdds ?? prev.betclicOdds,
        };
        changed = true;
      }
    });

    const ORPHAN_GRACE_MS = 25 * 60_000;
    const purged = result.filter(a => {
      if ((a.status || 'pending') !== 'pending') return true;
      if (Date.now() - (a.savedAt || 0) < ORPHAN_GRACE_MS) return true;
      return ttAlerts.some(p => p.id === a.id || sameFixture(p, a));
    });
    if (purged.length !== result.length) changed = true;

    if (changed) {
      cloudSet(TEAM_TOTAL_KEY, JSON.stringify(purged));
      window.dispatchEvent(new Event('nba_alerts_updated'));
    }
  } catch {}
}

// Pont alertes "Value Bet vs Pinnacle" basket (25 juin 2026) — même principe que syncGameTotalAlerts
// ci-dessus, mais pour basketball_pinnacle_edge (WNBA Total uniquement, cf. getPinnacleWnbaTotals
// backend). Clé localStorage séparée pour rester visuellement/structurellement distinct de
// nba_game_total_alerts (même marché, mais méthode de calcul indépendante — comparaison à
// Pinnacle, pas à notre modèle).
export async function syncBballPinnacleAlerts() {
  try {
    const { alerts: bgAlerts } = await fetch('/api/nba/background-alerts').then(r => r.json());
    // bgAlerts=[] est une réponse valide (aucune alerte ne qualifie ce cycle) et doit quand même
    // atteindre la purge des orphelins pending plus bas — seul un fetch/parse raté (bgAlerts
    // null/undefined) doit court-circuiter. Avant ce fix (14 juillet 2026), une réponse totalement
    // vide empêchait TOUTE synchro de tourner, y compris la purge : une alerte locale pending dont
    // le pendant backend disparaît (ex: titulaire passée Q/GTD) restait figée indéfiniment tant que
    // le backend renvoyait au moins une alerte d'un autre type — et disparaissait carrément dès que
    // le backend tombait à zéro alerte au total (cas réel : alerte spread Indiana Fever/Caitlin
    // Clark toujours visible côté utilisateur alors que le backend ne la renvoyait plus).
    if (!bgAlerts) return;
    const pinAlerts = bgAlerts.filter(a => a.type === 'basketball_pinnacle_edge' && a.prob > 0);

    const existing = JSON.parse(localStorage.getItem(BBALL_PINNACLE_KEY) || '[]');
    const sameFixture = (a, b) => {
      if (a.home !== b.home || a.away !== b.away) return false;
      const aT = new Date(a.date).getTime();
      const bT = new Date(b.date).getTime();
      if (isNaN(aT) || isNaN(bT)) return true;
      return Math.abs(aT - bT) <= 36 * 3600_000;
    };

    let changed = false;
    const result = [...existing];
    pinAlerts.forEach(a => {
      const idx = result.findIndex(p => p.id === a.id || sameFixture(p, a));
      if (idx === -1) {
        result.push({
          id: a.id, type: 'basketball_pinnacle_edge', market: a.market ?? null,
          league: a.league, eventId: a.eventId, home: a.home, away: a.away,
          homeShort: a.homeShort, awayShort: a.awayShort, date: a.date,
          line: a.line, edge: a.edge, direction: a.direction, prob: a.prob,
          pinnacleOdds: a.pinnacleOdds, bookmaker: a.bookmaker,
          unibetOdds: a.unibetOdds ?? null, betclicOdds: a.betclicOdds ?? null,
          savedAt: Date.now(), status: a.status || 'pending',
        });
        changed = true;
        return;
      }
      const prev = result[idx];
      if ((prev.status || 'pending') !== 'pending') return;
      if (prev.line !== a.line || prev.direction !== a.direction || prev.edge !== a.edge || prev.prob !== a.prob || prev.pinnacleOdds !== a.pinnacleOdds) {
        result[idx] = {
          ...prev,
          market: a.market ?? prev.market,
          line: a.line, edge: a.edge, direction: a.direction, prob: a.prob,
          pinnacleOdds: a.pinnacleOdds, bookmaker: a.bookmaker,
          unibetOdds: a.unibetOdds ?? prev.unibetOdds,
          betclicOdds: a.betclicOdds ?? prev.betclicOdds,
        };
        changed = true;
      }
    });

    const ORPHAN_GRACE_MS = 25 * 60_000;
    const purged = result.filter(a => {
      if ((a.status || 'pending') !== 'pending') return true;
      if (Date.now() - (a.savedAt || 0) < ORPHAN_GRACE_MS) return true;
      return pinAlerts.some(p => p.id === a.id || sameFixture(p, a));
    });
    if (purged.length !== result.length) changed = true;

    if (changed) {
      cloudSet(BBALL_PINNACLE_KEY, JSON.stringify(purged));
      window.dispatchEvent(new Event('bball_pinnacle_alerts_updated'));
    }
  } catch {}
}

// Pont alertes props joueurs vs Pinnacle — basketball_pinnacle_props_alerts
const BBALL_PINNACLE_PROPS_KEY = 'bball_pinnacle_props_alerts';

export async function syncBballPinnaclePropsAlerts() {
  try {
    const { alerts: bgAlerts } = await fetch('/api/nba/background-alerts').then(r => r.json());
    // bgAlerts=[] est une réponse valide (aucune alerte ne qualifie ce cycle) et doit quand même
    // atteindre la purge des orphelins pending plus bas — seul un fetch/parse raté (bgAlerts
    // null/undefined) doit court-circuiter. Avant ce fix (14 juillet 2026), une réponse totalement
    // vide empêchait TOUTE synchro de tourner, y compris la purge : une alerte locale pending dont
    // le pendant backend disparaît (ex: titulaire passée Q/GTD) restait figée indéfiniment tant que
    // le backend renvoyait au moins une alerte d'un autre type — et disparaissait carrément dès que
    // le backend tombait à zéro alerte au total (cas réel : alerte spread Indiana Fever/Caitlin
    // Clark toujours visible côté utilisateur alors que le backend ne la renvoyait plus).
    if (!bgAlerts) return;
    const pinProps = bgAlerts.filter(a => a.type === 'basketball_pinnacle_props');

    const existing = JSON.parse(localStorage.getItem(BBALL_PINNACLE_PROPS_KEY) || '[]');
    let changed = false;
    const result = [...existing];
    pinProps.forEach(a => {
      const idx = result.findIndex(p => p.id === a.id);
      if (idx === -1) {
        result.push({ ...a, status: a.status || 'pending', savedAt: Date.now() });
        changed = true;
        return;
      }
      const prev = result[idx];
      if ((prev.status || 'pending') !== 'pending') return;
      if (prev.edge !== a.edge || prev.pinnacleOdds !== a.pinnacleOdds) {
        result[idx] = { ...prev, edge: a.edge, pinnacleOdds: a.pinnacleOdds, bookmaker: a.bookmaker,
          unibetOdds: a.unibetOdds ?? prev.unibetOdds, betclicOdds: a.betclicOdds ?? prev.betclicOdds };
        changed = true;
      }
    });
    const ORPHAN_MS = 25 * 60_000;
    const purged = result.filter(a => {
      if ((a.status || 'pending') !== 'pending') return true;
      if (Date.now() - (a.savedAt || 0) < ORPHAN_MS) return true;
      return pinProps.some(p => p.id === a.id);
    });
    if (purged.length !== result.length) changed = true;
    if (changed) {
      cloudSet(BBALL_PINNACLE_PROPS_KEY, JSON.stringify(purged));
      window.dispatchEvent(new Event('bball_pinnacle_props_alerts_updated'));
    }
  } catch {}
}

export function loadBballPinnaclePropsAlerts() {
  try { return JSON.parse(localStorage.getItem(BBALL_PINNACLE_PROPS_KEY) || '[]'); } catch { return []; }
}
export function saveBballPinnaclePropsAlerts(arr) {
  try { persistAlertsKey(BBALL_PINNACLE_PROPS_KEY, arr); } catch {}
}

// Pont alertes "Résultat" basket (victoire équipe, NBA/WNBA/EU) backend → localStorage
// basketball_result_alerts. Remplace EarlyWin (19 juin 2026) — seule source = backend
// (computeTeamWinProb), plus de génération côté client dans BasketballDetailPage.
export async function syncBasketballResultAlerts() {
  try {
    const { alerts: bgAlerts } = await fetch('/api/nba/background-alerts').then(r => r.json());
    // bgAlerts=[] est une réponse valide (aucune alerte ne qualifie ce cycle) et doit quand même
    // atteindre la purge des orphelins pending plus bas — seul un fetch/parse raté (bgAlerts
    // null/undefined) doit court-circuiter. Avant ce fix (14 juillet 2026), une réponse totalement
    // vide empêchait TOUTE synchro de tourner, y compris la purge : une alerte locale pending dont
    // le pendant backend disparaît (ex: titulaire passée Q/GTD) restait figée indéfiniment tant que
    // le backend renvoyait au moins une alerte d'un autre type — et disparaissait carrément dès que
    // le backend tombait à zéro alerte au total (cas réel : alerte spread Indiana Fever/Caitlin
    // Clark toujours visible côté utilisateur alors que le backend ne la renvoyait plus).
    if (!bgAlerts) return;
    const resultAlerts = bgAlerts.filter(a => a.type === 'basketball_result' && a.probability > 0);

    const existing = JSON.parse(localStorage.getItem(BASKETBALL_RESULT_KEY) || '[]');

    // Empreinte = même affiche (home+away) + même issue (direction) à ±36h
    const sameBet = (a, b) => {
      if (a.home !== b.home || a.away !== b.away || a.direction !== b.direction) return false;
      const aT = new Date(a.date).getTime();
      const bT = new Date(b.date).getTime();
      if (isNaN(aT) || isNaN(bT)) return true;
      return Math.abs(aT - bT) <= 36 * 3600_000;
    };

    let changed = false;
    const result = [...existing];
    resultAlerts.forEach(a => {
      const idx = result.findIndex(p => p.id === a.id || sameBet(p, a));
      if (idx === -1) {
        result.push({ ...a, status: a.status || 'pending' });
        changed = true;
        return;
      }
      const prev = result[idx];
      if ((prev.status || 'pending') !== 'pending') {
        // Accepté/rejeté/réglé : on ne retouche jamais le pari, seul un avertissement de dérive
        // informatif (8 juillet 2026, cf. refreshOrDropPendingById côté backend) peut s'ajouter.
        if (prev.status === 'accepted') {
          const driftChanged = !!a.probDropWarning !== !!prev.probDropWarning || a.currentProbability !== prev.currentProbability;
          if (driftChanged) {
            result[idx] = { ...prev, probDropWarning: a.probDropWarning ?? false, currentProbability: a.probDropWarning ? a.currentProbability : null };
            changed = true;
          }
        }
        return;
      }
      if (prev.probability !== a.probability || prev.margin !== a.margin || prev.edge !== a.edge
          || prev.odds !== a.odds || prev.bookmaker !== a.bookmaker) {
        result[idx] = { ...prev, probability: a.probability, margin: a.margin, edge: a.edge, odds: a.odds, bookmaker: a.bookmaker };
        changed = true;
      }
    });

    // Purge des "pending" que le backend ne génère plus (modèle repassé sous le seuil)
    const ORPHAN_GRACE_MS = 25 * 60_000;
    const purged = result.filter(a => {
      if ((a.status || 'pending') !== 'pending') return true;
      if (Date.now() - (a.savedAt || 0) < ORPHAN_GRACE_MS) return true;
      return resultAlerts.some(p => p.id === a.id || sameBet(p, a));
    });
    if (purged.length !== result.length) changed = true;

    if (changed) {
      cloudSet(BASKETBALL_RESULT_KEY, JSON.stringify(purged));
      window.dispatchEvent(new Event('nba_alerts_updated'));
    }
  } catch {}
}

// Pont alertes football BTTS + Over/Under (Poisson, générées en arrière-plan) → localStorage
// fb_btts_alerts (même clé/format que la génération côté client de MatchDetailPage — même id
// `${fixtureId}_btts_yes` → dédup naturelle) et fb_total_alerts (nouvelle clé).
export async function syncFootballAlerts() {
  try {
    const { alerts: bgAlerts } = await fetch('/api/nba/background-alerts').then(r => r.json());
    // bgAlerts=[] est une réponse valide (aucune alerte ne qualifie ce cycle) et doit quand même
    // atteindre la purge des orphelins pending plus bas — seul un fetch/parse raté (bgAlerts
    // null/undefined) doit court-circuiter. Avant ce fix (14 juillet 2026), une réponse totalement
    // vide empêchait TOUTE synchro de tourner, y compris la purge : une alerte locale pending dont
    // le pendant backend disparaît (ex: titulaire passée Q/GTD) restait figée indéfiniment tant que
    // le backend renvoyait au moins une alerte d'un autre type — et disparaissait carrément dès que
    // le backend tombait à zéro alerte au total (cas réel : alerte spread Indiana Fever/Caitlin
    // Clark toujours visible côté utilisateur alors que le backend ne la renvoyait plus).
    if (!bgAlerts) return;
    const ORPHAN_GRACE_MS = 25 * 60_000;
    // Le backend ne génère des alertes CDM que dans les 24h avant coup d'envoi (CDM_ALERT_WINDOW_MS,
    // server.js) — pour éviter que la proba dérive avec le pool de matchs encore programmés. Une
    // alerte CDM créée côté client (MatchDetailPage, sur un match encore loin) n'apparaîtra donc
    // JAMAIS dans bgAlerts avant que la fenêtre 24h ne s'ouvre : sans cette exception, le purge
    // "orphelin" ci-dessous la supprimait ~25 min après sa création, puis elle ne revenait que si
    // l'utilisateur revisitait la page match (constaté 7 juillet 2026, ex: Angleterre-Norvège à 4j).
    const isCdmBeyondWindow = a => /^fdcdm_/.test(a.fixtureId || '')
      && a.fixtureDate && (new Date(a.fixtureDate).getTime() - Date.now()) > 24 * 3600_000;

    // Détecte un doublon même quand le fixtureId change (migration football-data.org → api-football,
    // 2 septembre 2026 : un match déjà accepté sous un ancien id fd_/fdbr_ se voit régénérer une
    // alerte "neuve" sous le nouvel id api-football au cycle suivant, pour le même pari réel).
    // Comparaison FLOUE sur les noms d'équipe — indispensable : les deux sources n'orthographient pas
    // pareil ("Real Sociedad de Fútbol" côté football-data.org vs "Real Sociedad" côté api-football),
    // une simple égalité de chaîne ne matche jamais (bug constaté en direct : le doublon revenait
    // malgré une 1ère version de ce correctif basée sur une clé exacte).
    const _flNorm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\b(fc|cf|ac|sc|rc|cd|ud|de|club|deportivo)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
    const _flTeamsMatch = (a, b) => {
      const na = _flNorm(a), nb = _flNorm(b);
      return na.length > 2 && (na === nb || na.includes(nb) || nb.includes(na));
    };
    const footballAlertsMatch = (p, a) =>
      _flTeamsMatch(p.homeTeam || p.home, a.homeTeam || a.home) &&
      _flTeamsMatch(p.awayTeam || p.away, a.awayTeam || a.away) &&
      Math.abs(new Date(p.fixtureDate).getTime() - new Date(a.fixtureDate).getTime()) < 6 * 3600_000 &&
      p.direction === a.direction && (p.line ?? '') === (a.line ?? '');

    // BTTS
    const bttsAlerts = bgAlerts.filter(a => a.type === 'football_btts' && a.probability > 0);
    { // bttsAlerts peut être vide (0 alerte BTTS ce cycle) — la purge des orphelins doit quand
      // même tourner (14 juillet 2026, cf. commentaire sur bgAlerts plus haut).
      const existing = JSON.parse(localStorage.getItem(FB_BTTS_KEY) || '[]');
      let changed = false;
      const result = [...existing];
      bttsAlerts.forEach(a => {
        const idx = result.findIndex(p => p.id === a.id || footballAlertsMatch(p, a));
        if (idx === -1) {
          result.push({ ...a, status: a.status || 'pending' });
          changed = true;
          return;
        }
        const prev = result[idx];
        if ((prev.status || 'pending') !== 'pending') {
          return; // accepté/rejeté/réglé : ne jamais toucher
        }
        if (prev.id !== a.id || prev.probability !== a.probability || prev.unibetOdds !== a.unibetOdds
            || prev.betclicOdds !== a.betclicOdds || prev.winamaxOdds !== a.winamaxOdds || prev.edge !== a.edge) {
          result[idx] = {
            ...prev,
            id: a.id, fixtureId: a.fixtureId, eventId: a.eventId,
            probability: a.probability,
            unibetOdds: a.unibetOdds ?? prev.unibetOdds,
            betclicOdds: a.betclicOdds ?? prev.betclicOdds,
            winamaxOdds: a.winamaxOdds ?? prev.winamaxOdds,
            edge: a.edge ?? prev.edge,
          };
          changed = true;
        }
      });
      // Purge des "pending" orphelins — uniquement pour les fixtures suivies en live (n'importe quel
      // championnat foot backend, cf. LIVE_FOOTBALL_FIXTURE_PREFIX ci-dessus) : les alertes générées
      // côté client sur des fixtures statiques (hors-saison) n'ont pas d'équivalent backend et ne
      // doivent pas être purgées (comportement historique préservé).
      // Bug trouvé le 10 septembre 2026 (cas réel Coritiba-Atletico Paranaense, Brasileirão) : cette
      // regex ne couvrait que `fd_`/`fdcdm_` depuis sa création — jamais étendue aux championnats
      // ajoutés depuis (Brésil `fdbr_`, coupes d'Europe `afel_/afcl_/afch_`, Grèce/Arabie/Portugal
      // `grc_/arb_/por_`). Une alerte BTTS pending sur l'un de ces championnats qui disparaît côté
      // backend (ex: remplacée par une alerte Total via `goalsFamilyChampion`) restait donc affichée
      // indéfiniment dans l'app — visible et "acceptable" localement alors que Telegram (qui interroge
      // le vrai état serveur) répondait déjà "alerte introuvable" sur le même message.
      const liveIds = new Set(bttsAlerts.map(a => a.id));
      const purged = result.filter(a => {
        if ((a.status || 'pending') !== 'pending') return true;
        if (Date.now() - (a.savedAt || 0) < ORPHAN_GRACE_MS) return true;
        if (!LIVE_FOOTBALL_FIXTURE_PREFIX.test(a.fixtureId || '')) return true;
        if (isCdmBeyondWindow(a)) return true;
        return liveIds.has(a.id);
      });
      if (purged.length !== result.length) changed = true;
      if (changed) {
        cloudSet(FB_BTTS_KEY, JSON.stringify(purged));
        window.dispatchEvent(new Event('fb_btts_alerts_updated'));
      }
    }

    // Over/Under
    const totalAlerts = bgAlerts.filter(a => a.type === 'football_total' && a.probability > 0);
    { // idem — purge même si totalAlerts est vide ce cycle
      const existing = JSON.parse(localStorage.getItem(FB_TOTAL_KEY) || '[]');
      let changed = false;
      const result = [...existing];
      totalAlerts.forEach(a => {
        const idx = result.findIndex(p => p.id === a.id || footballAlertsMatch(p, a));
        if (idx === -1) {
          result.push({ ...a, status: a.status || 'pending' });
          changed = true;
          return;
        }
        const prev = result[idx];
        if ((prev.status || 'pending') !== 'pending') {
          return; // accepté/rejeté/réglé : ne jamais toucher
        }
        if (prev.id !== a.id || prev.probability !== a.probability || prev.line !== a.line || prev.direction !== a.direction
            || prev.unibetOdds !== a.unibetOdds || prev.betclicOdds !== a.betclicOdds || prev.winamaxOdds !== a.winamaxOdds || prev.edge !== a.edge) {
          result[idx] = {
            ...prev,
            id: a.id, fixtureId: a.fixtureId, eventId: a.eventId,
            probability: a.probability, line: a.line, direction: a.direction, edge: a.edge,
            unibetOdds: a.unibetOdds ?? prev.unibetOdds,
            betclicOdds: a.betclicOdds ?? prev.betclicOdds,
            winamaxOdds: a.winamaxOdds ?? prev.winamaxOdds,
          };
          changed = true;
        }
      });
      const liveIds = new Set(totalAlerts.map(a => a.id));
      // Les 2 lignes O/U (1.5 et 2.5) peuvent désormais alerter simultanément sur un même match
      // (28 août 2026, cf. server.js) — l'id inclut la ligne (`${fixtureId}_total_${line}`), donc un
      // simple Set liveIds ne suffit pas à décider si une ligne disparue est "juste ce cycle-ci" ou
      // "vraiment abandonnée" : si le match est encore activement évalué ce cycle (au moins une ligne
      // vivante dedans) mais qu'UNE ligne précise n'y est plus, c'est qu'elle est retombée sous le
      // seuil — supersession réelle, purge immédiate sans attendre ORPHAN_GRACE_MS (cas réel signalé
      // 28 août : São Paulo/RB Bragantino, "Plus de 1.5" ET "Moins de 2.5" affichées ensemble pendant
      // la fenêtre de grâce). Si le fixture entier est absent ce cycle (panne/scrape raté), la grâce
      // s'applique normalement — pas de faux positif sur un simple cycle manqué.
      const liveFixtureIds = new Set(totalAlerts.map(a => a.fixtureId));
      const purged = result.filter(a => {
        if ((a.status || 'pending') !== 'pending') return true;
        if (!liveIds.has(a.id) && liveFixtureIds.has(a.fixtureId)) return false;
        if (Date.now() - (a.savedAt || 0) < ORPHAN_GRACE_MS) return true;
        if (isCdmBeyondWindow(a)) return true;
        return liveIds.has(a.id);
      });
      if (purged.length !== result.length) changed = true;
      if (changed) {
        cloudSet(FB_TOTAL_KEY, JSON.stringify(purged));
        window.dispatchEvent(new Event('fb_total_alerts_updated'));
      }
    }

    // Résultat 1X2 (chaque issue dom./nul/ext. traitée comme un pari oui/non, même format que Over/Under)
    const resultAlerts = bgAlerts.filter(a => a.type === 'football_result' && a.probability > 0);
    { // idem — purge même si resultAlerts est vide ce cycle
      const existing = JSON.parse(localStorage.getItem(FB_RESULT_KEY) || '[]');
      let changed = false;
      const result = [...existing];
      resultAlerts.forEach(a => {
        const idx = result.findIndex(p => p.id === a.id || footballAlertsMatch(p, a));
        if (idx === -1) {
          result.push({ ...a, status: a.status || 'pending' });
          changed = true;
          return;
        }
        const prev = result[idx];
        if ((prev.status || 'pending') !== 'pending') {
          return; // accepté/rejeté/réglé : ne jamais toucher
        }
        if (prev.id !== a.id || prev.probability !== a.probability || prev.direction !== a.direction
            || prev.unibetOdds !== a.unibetOdds || prev.betclicOdds !== a.betclicOdds || prev.winamaxOdds !== a.winamaxOdds || prev.edge !== a.edge) {
          result[idx] = {
            ...prev,
            id: a.id, fixtureId: a.fixtureId, eventId: a.eventId,
            probability: a.probability, direction: a.direction, edge: a.edge,
            unibetOdds: a.unibetOdds ?? prev.unibetOdds,
            betclicOdds: a.betclicOdds ?? prev.betclicOdds,
            winamaxOdds: a.winamaxOdds ?? prev.winamaxOdds,
          };
          changed = true;
        }
      });
      const liveIds = new Set(resultAlerts.map(a => a.id));
      const purged = result.filter(a => {
        if ((a.status || 'pending') !== 'pending') return true;
        if (Date.now() - (a.savedAt || 0) < ORPHAN_GRACE_MS) return true;
        if (isCdmBeyondWindow(a)) return true;
        return liveIds.has(a.id);
      });
      if (purged.length !== result.length) changed = true;
      if (changed) {
        cloudSet(FB_RESULT_KEY, JSON.stringify(purged));
        window.dispatchEvent(new Event('fb_result_alerts_updated'));
      }
    }

    // Total de buts PAR ÉQUIPE (14 septembre 2026) — passé en production, même patron de sync que
    // Over/Under (id inclut side+ligne : `${fixtureId}_teamgoals_${side}_${line}`, plusieurs lignes
    // peuvent alerter simultanément sur un même match/équipe).
    const teamGoalsAlerts = bgAlerts.filter(a => a.type === 'football_team_goals' && a.probability > 0);
    {
      const existing = JSON.parse(localStorage.getItem(FB_TEAM_GOALS_KEY) || '[]');
      let changed = false;
      const result = [...existing];
      teamGoalsAlerts.forEach(a => {
        const idx = result.findIndex(p => p.id === a.id);
        if (idx === -1) {
          result.push({ ...a, status: a.status || 'pending' });
          changed = true;
          return;
        }
        const prev = result[idx];
        if ((prev.status || 'pending') !== 'pending') {
          return; // accepté/rejeté/réglé : ne jamais toucher
        }
        if (prev.probability !== a.probability || prev.unibetOdds !== a.unibetOdds || prev.betclicOdds !== a.betclicOdds || prev.edge !== a.edge) {
          result[idx] = {
            ...prev,
            probability: a.probability, edge: a.edge,
            unibetOdds: a.unibetOdds ?? prev.unibetOdds,
            betclicOdds: a.betclicOdds ?? prev.betclicOdds,
          };
          changed = true;
        }
      });
      const liveIds = new Set(teamGoalsAlerts.map(a => a.id));
      const liveFixtureIds = new Set(teamGoalsAlerts.map(a => a.fixtureId));
      const purged = result.filter(a => {
        if ((a.status || 'pending') !== 'pending') return true;
        if (!liveIds.has(a.id) && liveFixtureIds.has(a.fixtureId)) return false;
        if (Date.now() - (a.savedAt || 0) < ORPHAN_GRACE_MS) return true;
        return liveIds.has(a.id);
      });
      if (purged.length !== result.length) changed = true;
      if (changed) {
        cloudSet(FB_TEAM_GOALS_KEY, JSON.stringify(purged));
        window.dispatchEvent(new Event('fb_team_goals_alerts_updated'));
      }
    }

    // Value Bet vs Pinnacle (25 juin 2026) — méthode indépendante de football_result : compare les
    // cotes Unibet/Betclic à la ligne Pinnacle démarginée plutôt qu'à notre propre modèle Poisson.
    // CDM uniquement (seule compétition où Pinnacle est scrapé). Même format de sync que les 3
    // autres types foot, clé localStorage séparée pour rester visuellement/structurellement distinct.
    const pinnacleAlerts = bgAlerts.filter(a => a.type === 'football_pinnacle_edge' && a.probability > 0);
    { // idem — purge même si pinnacleAlerts est vide ce cycle
      const existing = JSON.parse(localStorage.getItem(FB_PINNACLE_KEY) || '[]');
      let changed = false;
      const result = [...existing];
      pinnacleAlerts.forEach(a => {
        const idx = result.findIndex(p => p.id === a.id);
        if (idx === -1) {
          result.push({ ...a, status: a.status || 'pending' });
          changed = true;
          return;
        }
        const prev = result[idx];
        if ((prev.status || 'pending') !== 'pending') {
          return; // accepté/rejeté/réglé : ne jamais toucher
        }
        if (prev.probability !== a.probability || prev.direction !== a.direction || prev.pinnacleOdds !== a.pinnacleOdds
            || prev.unibetOdds !== a.unibetOdds || prev.betclicOdds !== a.betclicOdds || prev.winamaxOdds !== a.winamaxOdds || prev.edge !== a.edge) {
          result[idx] = {
            ...prev,
            probability: a.probability, direction: a.direction, edge: a.edge, pinnacleOdds: a.pinnacleOdds, bookmaker: a.bookmaker,
            unibetOdds: a.unibetOdds ?? prev.unibetOdds,
            betclicOdds: a.betclicOdds ?? prev.betclicOdds,
            winamaxOdds: a.winamaxOdds ?? prev.winamaxOdds,
          };
          changed = true;
        }
      });
      const liveIds = new Set(pinnacleAlerts.map(a => a.id));
      const purged = result.filter(a => {
        if ((a.status || 'pending') !== 'pending') return true;
        if (Date.now() - (a.savedAt || 0) < ORPHAN_GRACE_MS) return true;
        if (isCdmBeyondWindow(a)) return true;
        return liveIds.has(a.id);
      });
      if (purged.length !== result.length) changed = true;
      if (changed) {
        cloudSet(FB_PINNACLE_KEY, JSON.stringify(purged));
        window.dispatchEvent(new Event('fb_pinnacle_alerts_updated'));
      }
    }

    // DC & BTTS
    // Clé logique pour détecter les doublons même si fixtureId change entre cycles
    const dcLogicalKey = a => `${(a.home||'').toLowerCase()}__${(a.away||'').toLowerCase()}__${(a.fixtureDate||'').slice(0,10)}__${a.direction}`;

    const dcBttsAlerts = bgAlerts.filter(a => a.type === 'football_dc_btts' && a.probability > 0);
    { // idem — purge même si dcBttsAlerts est vide ce cycle
      const existing = JSON.parse(localStorage.getItem(FB_DC_BTTS_KEY) || '[]');
      // Nettoyer les doublons logiques déjà en stock (garde le plus récent / non-pending en priorité)
      const deduped = [];
      const seenKeys = new Set();
      for (const a of [...existing].sort((x, y) => (x.status !== 'pending' ? -1 : 1))) {
        const k = dcLogicalKey(a); if (seenKeys.has(k)) continue; seenKeys.add(k); deduped.push(a);
      }
      let changed = deduped.length !== existing.length;
      const result = deduped;
      const liveIds = new Set(dcBttsAlerts.map(a => a.id));
      dcBttsAlerts.forEach(a => {
        const idx = result.findIndex(p => p.id === a.id || dcLogicalKey(p) === dcLogicalKey(a));
        if (idx === -1) { result.push({ ...a, status: a.status || 'pending' }); changed = true; return; }
        const prev = result[idx];
        if ((prev.status || 'pending') !== 'pending') return;
        if (prev.probability !== a.probability || prev.unibetOdds !== a.unibetOdds || prev.betclicOdds !== a.betclicOdds) {
          result[idx] = { ...prev, id: a.id, probability: a.probability, unibetOdds: a.unibetOdds ?? prev.unibetOdds, betclicOdds: a.betclicOdds ?? prev.betclicOdds };
          changed = true;
        }
      });
      const purged = result.filter(a => {
        if ((a.status || 'pending') !== 'pending') return true;
        if (Date.now() - (a.savedAt || 0) < ORPHAN_GRACE_MS) return true;
        if (isCdmBeyondWindow(a)) return true;
        return liveIds.has(a.id);
      });
      if (purged.length !== result.length) changed = true;
      if (changed) { cloudSet(FB_DC_BTTS_KEY, JSON.stringify(purged)); window.dispatchEvent(new Event('fb_dc_btts_alerts_updated')); }
    }

    // DC & Over 1.5
    const dcOuAlerts = bgAlerts.filter(a => a.type === 'football_dc_ou' && a.probability > 0);
    { // idem — purge même si dcOuAlerts est vide ce cycle
      const existing = JSON.parse(localStorage.getItem(FB_DC_OU_KEY) || '[]');
      const deduped2 = [];
      const seenKeys2 = new Set();
      for (const a of [...existing].sort((x, y) => (x.status !== 'pending' ? -1 : 1))) {
        const k = dcLogicalKey(a); if (seenKeys2.has(k)) continue; seenKeys2.add(k); deduped2.push(a);
      }
      let changed = deduped2.length !== existing.length;
      const result = deduped2;
      const liveIds = new Set(dcOuAlerts.map(a => a.id));
      dcOuAlerts.forEach(a => {
        const idx = result.findIndex(p => p.id === a.id || dcLogicalKey(p) === dcLogicalKey(a));
        if (idx === -1) { result.push({ ...a, status: a.status || 'pending' }); changed = true; return; }
        const prev = result[idx];
        if ((prev.status || 'pending') !== 'pending') return;
        if (prev.probability !== a.probability || prev.unibetOdds !== a.unibetOdds || prev.betclicOdds !== a.betclicOdds) {
          result[idx] = { ...prev, id: a.id, probability: a.probability, unibetOdds: a.unibetOdds ?? prev.unibetOdds, betclicOdds: a.betclicOdds ?? prev.betclicOdds };
          changed = true;
        }
      });
      const purged = result.filter(a => {
        if ((a.status || 'pending') !== 'pending') return true;
        if (Date.now() - (a.savedAt || 0) < ORPHAN_GRACE_MS) return true;
        if (isCdmBeyondWindow(a)) return true;
        return liveIds.has(a.id);
      });
      if (purged.length !== result.length) changed = true;
      if (changed) { cloudSet(FB_DC_OU_KEY, JSON.stringify(purged)); window.dispatchEvent(new Event('fb_dc_ou_alerts_updated')); }
    }
  } catch {}
}

export { FB_DC_BTTS_KEY, FB_DC_OU_KEY };

// Règlement BTTS/O-U football — uniquement CDM pour l'instant (seule source avec scores
// disponibles via /api/fd/worldcup, home.score/away.score). Les 5 grands championnats ne
// renvoient que les matchs SCHEDULED (/api/fd/matches) — pas de score.
// Règlement live : un résultat est acté dès qu'il est mathématiquement acquis, même si le
// match n'est pas terminé (ex: total déjà > line → "over" gagné / "under" perdu ; BTTS déjà
// 1-1 → "oui" gagné). Le sens "négatif" (under gagné, over perdu, BTTS non) ne peut être
// confirmé qu'à STATUS_FINAL puisque le score peut encore évoluer.
export function resolveFootballAlertResult(a, game) {
  // scoreReg = score du temps réglementaire (fullTime - extraTime, voir /api/fd/worldcup) — DC/BTTS/
  // O-U/Résultat se règlent sur 90min, pas sur le score final après prolongation.
  const hs = game.home?.scoreReg ?? game.home?.score, as_ = game.away?.scoreReg ?? game.away?.score;
  if (hs == null || as_ == null) return null;
  const isFinal = game.status === 'STATUS_FINAL';
  if (a.type === 'football_btts') {
    if (hs > 0 && as_ > 0) return 'won';
    return isFinal ? 'lost' : null;
  }
  if (a.type === 'football_dc_btts') {
    if (!isFinal) return null;
    const bttsOk = hs > 0 && as_ > 0;
    const dcOk = a.direction === '1x' ? hs >= as_ : a.direction === 'x2' ? as_ >= hs : hs !== as_;
    return bttsOk && dcOk ? 'won' : 'lost';
  }
  if (a.type === 'football_dc_ou') {
    if (!isFinal) return null;
    const ouOk = hs + as_ > (a.line ?? 1.5);
    const dcOk = a.direction === '1x' ? hs >= as_ : a.direction === 'x2' ? as_ >= hs : hs !== as_;
    return ouOk && dcOk ? 'won' : 'lost';
  }
  if (a.type === 'football_result' || (a.type === 'football_pinnacle_edge' && a.market !== 'totals')) {
    // Le résultat 1X2 peut s'inverser jusqu'au coup de sifflet final — pas de règlement "live"
    // (football_pinnacle_edge sur le marché h2h porte sur la même issue que football_result,
    // même règle — mais sur le marché totals il faut tomber dans la branche Over/Under ci-dessous,
    // sinon "over"/"under" serait lu à tort comme un sens h2h et toujours résolu comme un nul).
    if (!isFinal) return null;
    if (a.direction === 'home') return hs > as_ ? 'won' : 'lost';
    if (a.direction === 'away') return as_ > hs ? 'won' : 'lost';
    return hs === as_ ? 'won' : 'lost'; // draw
  }
  if (a.type === 'football_team_goals') {
    // Total de buts PAR ÉQUIPE (14 septembre 2026) — même logique que football_total mais sur le
    // score d'UNE SEULE équipe (a.side), pas le cumul des deux. Même fonction côté backend
    // (server.js, footballMarketStatus) — garder les deux synchro si cette logique change un jour.
    const teamScore = a.side === 'home' ? hs : as_;
    if (a.direction === 'over') return teamScore > a.line ? 'won' : (isFinal ? 'lost' : null);
    return teamScore > a.line ? 'lost' : (isFinal ? 'won' : null);
  }
  const total = hs + as_;
  if (a.direction === 'over') {
    if (total > a.line) return 'won';
    return isFinal ? 'lost' : null;
  }
  if (total > a.line) return 'lost';
  return isFinal ? 'won' : null;
}

// Sources de règlement foot — une entrée par préfixe fixtureId, chacune avec sa propre source de
// scores. Généralisé le 23 juillet 2026 (Europa League) : jusque-là seule la CDM était réglée ;
// au passage, corrige aussi le Brasileirão (fdbr_) qui avait pourtant déjà un score exploitable via
// /api/fd/bresil (STATUS_FINAL + home.score/away.score) mais jamais consommé pour le règlement.
// Ligue 1/PL/Liga/Bundesliga/Serie A (fd_) ajoutées le 24 juillet 2026 — /api/fd/results existait
// déjà côté backend (runAutoSettle()) mais n'était jamais exposée en HTTP pour ce règlement-ci.
const FOOTBALL_SETTLEMENT_SOURCES = [
  { prefix: 'fdcdm_', endpoint: '/api/fd/worldcup', gamesKey: 'games' },
  { prefix: 'fdbr_',  endpoint: '/api/fd/bresil', gamesKey: 'matches' },
  { prefix: 'afel_',  endpoint: '/api/football/eucup/europa/matches', gamesKey: 'matches' },
  { prefix: 'afcl_',  endpoint: '/api/football/eucup/conference/matches', gamesKey: 'matches' },
  { prefix: 'afch_',  endpoint: '/api/football/eucup/champions/matches', gamesKey: 'matches' },
  { prefix: 'fd_',    endpoint: '/api/fd/results', gamesKey: 'matches' },
  // Grèce Super League (8 septembre 2026) — jamais passée par football-data.org, préfixe dédié
  // `grc_` (pas de faux héritage `fd`, contrairement aux 6 championnats migrés depuis FD).
  { prefix: 'grc_',   endpoint: '/api/football/grece', gamesKey: 'matches' },
  { prefix: 'arb_',   endpoint: '/api/football/arabie', gamesKey: 'matches' },
  // Portugal Primeira Liga (9 septembre 2026) — même patron que Grèce/Arabie ci-dessus.
  { prefix: 'por_',   endpoint: '/api/football/portugal', gamesKey: 'matches' },
];

export async function resolveCompletedFootballAlerts(alerts, save) {
  const toResolve = alerts.filter(a =>
    a.status === 'accepted' &&
    FOOTBALL_SETTLEMENT_SOURCES.some(s => (a.fixtureId || '').startsWith(s.prefix)) &&
    new Date(a.fixtureDate).getTime() < Date.now()
  );
  if (!toResolve.length) return;
  let changed = false;
  for (const source of FOOTBALL_SETTLEMENT_SOURCES) {
    const items = toResolve.filter(a => (a.fixtureId || '').startsWith(source.prefix));
    if (!items.length) continue;
    try {
      const d = await fetch(source.endpoint).then(r => r.json());
      const games = d[source.gamesKey] || [];
      for (const a of items) {
        const gid = a.fixtureId.replace(source.prefix, '');
        let game = games.find(g => String(g.id) === gid && ['STATUS_IN_PROGRESS', 'STATUS_FINAL'].includes(g.status));
        // Le match est sorti de la fenêtre glissante de la source (48h) — filet de rattrapage CDM
        // pour ne pas laisser un pari accepted bloqué indéfiniment (cf. server.js /api/fd/match/:id,
        // bug du 7 juillet 2026 : alerte DC Suisse-Algérie du 3 juillet jamais réglée).
        if (!game && source.prefix === 'fdcdm_') {
          const single = await fetch(`/api/fd/match/${gid}`).then(r => r.ok ? r.json() : null).catch(() => null);
          if (single && ['STATUS_IN_PROGRESS', 'STATUS_FINAL'].includes(single.status)) game = single;
        }
        // Migration football-data.org → api-football (2 septembre 2026) — une alerte fd_/fdbr_ créée
        // avant la bascule porte un id football-data.org que ces sources ne renvoient plus (elles
        // renvoient désormais des ids api-football). Résolution une fois via la table de
        // correspondance (server.js), mémorisée sur l'alerte pour ne pas la redemander à chaque
        // cycle. À retirer une fois qu'aucune alerte fd_/fdbr_ n'est plus pending/accepted.
        if (!game && (source.prefix === 'fd_' || source.prefix === 'fdbr_') && a.league) {
          const legacyLeague = source.prefix === 'fdbr_' ? 'bresil' : a.league;
          if (!a.migratedFixtureId) {
            try {
              const resolved = await fetch(`/api/fd/resolve-legacy-id?league=${legacyLeague}&oldId=${gid}`).then(r => r.ok ? r.json() : null);
              if (resolved?.newId) { a.migratedFixtureId = resolved.newId; changed = true; }
            } catch {}
          }
          if (a.migratedFixtureId) {
            game = games.find(g => String(g.id) === a.migratedFixtureId && ['STATUS_IN_PROGRESS', 'STATUS_FINAL'].includes(g.status));
          }
        }
        if (!game) continue;
        const result = resolveFootballAlertResult(a, game);
        if (!result) continue;
        a.actualHomeScore = game.home.score;
        a.actualAwayScore = game.away.score;
        a.status = result;
        a.settledAt = Date.now();
        changed = true;
        // Trace serveur du résultat — sans ça aucun bilan foot n'est possible côté backend
        // (contrairement aux props basket, réglées automatiquement par runAutoSettle()). Envoi fiable
        // avec retry + file d'attente (postSettlementReliably) depuis le 25 juin 2026.
        postSettlementReliably({ id: a.id, status: result, probability: a.acceptedProbability ?? a.probability, line: a.line, edge: a.edge, settledAt: a.settledAt });
      }
    } catch {}
  }
  if (changed) save([...alerts]);
}

// Suit le marché pour les alertes player_prop ACCEPTÉES, même quand le modèle ne génère plus
// d'alerte live sur ce joueur (cas où la ligne a trop bougé pour rester rentable) : le backend
// calcule à chaque cycle, pour TOUS les joueurs, la ligne/cotes/probas courantes dans
// _projectionsSnapshot — exposé via /api/{nba|wnba|euro/<league>}/projections-snapshot/:eventId.
const EU_PROJ_LEAGUES = ['acb', 'lnb', 'bbl', 'legaa', 'euroleague', 'nbl', 'gbl'];
const projectionsSnapshotUrl = (league, eventId) => {
  if (league === 'wnba') return `/api/wnba/projections-snapshot/${eventId}`;
  if (EU_PROJ_LEAGUES.includes(league)) return `/api/euro/${league}/projections-snapshot/${eventId}`;
  return `/api/nba/projections-snapshot/${eventId}`;
};
const BK_PREFIX = { unibet: 'ub', betclic: 'bc', winamax: 'wm' };
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
// Si l'autre sens dépasse cette proba, le modèle "penche" significativement pour le retournement
const FLIP_MIN_PROB = 0.55;

// Extrait l'ID joueur depuis l'id d'alerte : `${eventId}_${playerId}_${stat}_${direction}_${line}`
// (EU : `${eventId}_eu_${playerId}_${stat}_${direction}_${line}`)
function extractPlayerId(a) {
  const eventId = String(a.eventId ?? '');
  let rest = a.id;
  if (rest.startsWith(`${eventId}_eu_`)) rest = rest.slice(`${eventId}_eu_`.length);
  else if (rest.startsWith(`${eventId}_`)) rest = rest.slice(`${eventId}_`.length);
  else return null;
  return rest.split('_')[0];
}

export async function syncOddsDrift() {
  try {
    const raw = JSON.parse(localStorage.getItem(ALERT_KEY) || '[]');
    const accepted = raw.filter(a => a.status === 'accepted' && a.type !== 'game_total' && a.eventId != null);
    if (!accepted.length) return;

    const groups = {};
    accepted.forEach(a => {
      const key = `${a.league || 'nba'}__${a.eventId}`;
      (groups[key] ||= []).push(a);
    });

    const byId = {};
    raw.forEach(a => { byId[a.id] = a; });
    let changed = false;

    for (const [key, alerts] of Object.entries(groups)) {
      const [league, eventId] = key.split('__');
      const snap = await fetch(projectionsSnapshotUrl(league, eventId)).then(r => r.json()).catch(() => null);
      if (!snap?.found) continue;

      alerts.forEach(a => {
        const playerId = extractPlayerId(a);
        const probs = playerId && snap.players[playerId]?.probs?.[a.stat];
        if (!probs) return;

        const newLine   = probs.line;
        const lineShift = newLine != null && a.line != null && Math.abs(newLine - a.line) >= 1.0;

        const bk      = a.acceptedBookmaker;
        const bkPfx   = BK_PREFIX[bk];
        const refOdds = bk ? (a[`accepted${capitalize(bk)}Odds`] ?? a[`${bk}Odds`]) : null;
        const newOdds = bkPfx ? probs[`${bkPfx}${capitalize(a.direction)}`] : null;
        const oddsShift = refOdds != null && newOdds != null && Math.abs(newOdds - refOdds) >= 0.02;

        // Le modèle penche désormais pour la direction opposée
        const opp     = a.direction === 'over' ? 'under' : 'over';
        const ownProb = probs[`p${capitalize(a.direction)}`];
        const oppProb = probs[`p${capitalize(opp)}`];
        const flipped = ownProb != null && oppProb != null && oppProb > ownProb && oppProb >= FLIP_MIN_PROB;

        const next = { ...a };
        let touched = false;

        if (lineShift || oddsShift) {
          const oddsAlert = {
            lineFrom: a.line, lineTo: lineShift ? newLine : null,
            ubFrom: null, ubTo: null, bcFrom: null, bcTo: null, wmFrom: null, wmTo: null,
          };
          if (bkPfx === 'ub') { oddsAlert.ubFrom = refOdds; oddsAlert.ubTo = oddsShift ? newOdds : null; }
          if (bkPfx === 'bc') { oddsAlert.bcFrom = refOdds; oddsAlert.bcTo = oddsShift ? newOdds : null; }
          if (bkPfx === 'wm') { oddsAlert.wmFrom = refOdds; oddsAlert.wmTo = oddsShift ? newOdds : null; }
          if (JSON.stringify(next.oddsAlert) !== JSON.stringify(oddsAlert)) { next.oddsAlert = oddsAlert; touched = true; }
        }

        if (flipped) {
          const directionFlip = { to: opp, line: newLine ?? a.line, probability: Math.round(oppProb * 100) };
          if (JSON.stringify(next.directionFlip) !== JSON.stringify(directionFlip)) { next.directionFlip = directionFlip; touched = true; }
        } else if (next.directionFlip) {
          delete next.directionFlip;
          touched = true;
        }

        if (touched) { byId[a.id] = next; changed = true; }
      });
    }

    if (changed) {
      cloudSet(ALERT_KEY, JSON.stringify(Object.values(byId)));
      window.dispatchEvent(new Event('nba_alerts_updated'));
    }
  } catch {}
}

// ── Accept/reject via Telegram (16 juillet 2026) ────────────────────────────
// Le site ne peut pas recevoir de webhook Telegram lui-même (il tourne dans le navigateur) — il
// vient donc régulièrement chercher les actions faites depuis le téléphone (GET /api/telegram/actions)
// et les répercute dans le localStorage local, comme un clic Accepter/Rejeter fait depuis le site.
// Le backend a déjà tout fait de son côté au moment du clic Telegram (poussé dans _acceptedAlerts,
// donc le Backtesting le voit déjà) — ceci ne sert qu'à faire disparaître l'alerte du "Pending" et
// l'afficher côté "Running" sur CE navigateur.
const TELEGRAM_ACTIONS_TS_KEY = 'telegram_actions_last_ts';
const TELEGRAM_TYPE_TO_KEY = {
  player_prop: ALERT_KEY,
  game_total: GAME_TOTAL_KEY,
  team_total: TEAM_TOTAL_KEY,
  basketball_result: BASKETBALL_RESULT_KEY,
  basketball_pinnacle_edge: BBALL_PINNACLE_KEY,
  basketball_pinnacle_props: BBALL_PINNACLE_KEY,
  football_btts: FB_BTTS_KEY,
  football_total: FB_TOTAL_KEY,
  football_result: FB_RESULT_KEY,
  football_dc_btts: FB_DC_BTTS_KEY,
  football_dc_ou: FB_DC_OU_KEY,
  football_pinnacle_edge: FB_PINNACLE_KEY,
  football_team_goals: FB_TEAM_GOALS_KEY,
};

export async function syncTelegramActions() {
  try {
    const lastTs = Number(localStorage.getItem(TELEGRAM_ACTIONS_TS_KEY) || '0');
    const res = await fetch(`/api/telegram/actions?since=${lastTs}`);
    if (!res.ok) return;
    const { actions, now } = await res.json();
    if (!actions?.length) { localStorage.setItem(TELEGRAM_ACTIONS_TS_KEY, String(now)); return; }

    const byKey = {};
    actions.forEach(a => {
      const key = TELEGRAM_TYPE_TO_KEY[a.type];
      if (key) (byKey[key] = byKey[key] || []).push(a);
    });

    // Une action dont l'alerte n'est pas encore dans le localStorage local (le navigateur n'a pas
    // encore fait tourner le sync classique qui l'aurait insérée en pending) ne peut pas être
    // appliquée tout de suite — on ne fait PAS avancer le curseur au-delà d'une action récente
    // (<10min) non appliquée, pour la retenter au prochain polling une fois l'alerte présente.
    // Au-delà de 10min on laisse tomber (cas extrême : app jamais rouverte depuis) plutôt que de
    // bloquer indéfiniment la synchronisation des actions suivantes.
    let earliestUnapplied = null;
    for (const [key, acts] of Object.entries(byKey)) {
      let list;
      try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch { list = []; }
      let changed = false;
      acts.forEach(act => {
        const idx = list.findIndex(x => x.id === act.id);
        if (idx === -1) {
          if (Date.now() - act.ts < 10 * 60_000 && (earliestUnapplied == null || act.ts < earliestUnapplied)) {
            earliestUnapplied = act.ts;
          }
          return;
        }
        if ((list[idx].status || 'pending') !== 'pending') return; // déjà décidé localement, ne pas écraser
        // Fix 19 juillet 2026 — un accept fait depuis Telegram ne posait que `status`, jamais
        // `acceptedAt`/`stakeAmount` (contrairement à un accept fait directement sur le site,
        // cf. PlaceBetPage.jsx) : la carte apparaissait bien "acceptée" mais restait invisible du
        // Suivi Bankroll (qui groupe "engagé aujourd'hui" par date d'acceptation) — cas réel Écart
        // H2H Dallas Wings, accepté via Telegram, absent du total engagé du jour.
        // act.extra (20 juillet 2026) — bookmaker/cote choisis au moment de l'accept Telegram
        // (acceptedBookmaker/acceptedUnibetOdds/acceptedBetclicOdds/...), transporté depuis
        // recordAction() côté serveur. Sans ça, la carte Running/Backtesting n'affichait aucune
        // cote pour un accept fait depuis Telegram (cas réel : Total SEA-MIN, cote Betclic absente).
        // stakeAmountSuggested (8 septembre 2026, demande explicite) — même priorité que le chemin
        // d'accept direct sur l'app (PlaceBetPage.jsx, stakeAtAccept()) : la mise calibrée propre à
        // CETTE alerte d'abord, repli sur l'ancienne mise plate du palier seulement si absente.
        const dateExtra = act.action === 'accepted' && !list[idx].acceptedAt
          ? { acceptedAt: Date.now(), stakeAmount: list[idx].stakeAmount ?? list[idx].stakeAmountSuggested ?? getRecommendedStake(loadBankrollState().current) }
          : {};
        list[idx] = { ...list[idx], status: act.action, ...dateExtra, ...(act.extra || {}) };
        changed = true;
      });
      if (changed) persistAlertsKey(key, list);
    }
    localStorage.setItem(TELEGRAM_ACTIONS_TS_KEY, String(earliestUnapplied != null ? earliestUnapplied - 1 : now));
  } catch {}
}

// ── Outrights (28 juillet 2026) ─────────────────────────────────────────────
// Contrairement aux autres types d'alertes, le statut (accepted/rejected/won/lost) est déjà
// autoritaire côté backend (`_outrightAlerts`, routes POST /api/outrights/alerts/:id/{accept,
// reject,settle}) — pas besoin de logique de préservation aussi élaborée que les autres syncs,
// `persistAlertsKey` (déjà généraliste) suffit comme garde-fou.
export const OUTRIGHT_ALERTS_KEY = 'outright_alerts';

export async function syncOutrightAlerts() {
  try {
    const alerts = await fetch('/api/outrights/alerts').then(r => r.json());
    if (!Array.isArray(alerts)) return;
    persistAlertsKey(OUTRIGHT_ALERTS_KEY, alerts);
    window.dispatchEvent(new Event('outright_alerts_updated'));
  } catch {}
}

function _updateOutrightLocal(id, patch) {
  const list = JSON.parse(localStorage.getItem(OUTRIGHT_ALERTS_KEY) || '[]');
  const idx = list.findIndex(a => a.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch };
  cloudSet(OUTRIGHT_ALERTS_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event('outright_alerts_updated'));
}

export async function acceptOutrightAlert(id, bookmaker, odds) {
  _updateOutrightLocal(id, { status: 'accepted', acceptedAt: Date.now(), acceptedBookmaker: bookmaker, acceptedOdds: odds });
  try { await fetch(`/api/outrights/alerts/${id}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookmaker, odds }) }); } catch {}
}

export async function rejectOutrightAlert(id) {
  _updateOutrightLocal(id, { status: 'rejected' });
  try { await fetch(`/api/outrights/alerts/${id}/reject`, { method: 'POST' }); } catch {}
}

// status : 'won' | 'lost' — règlement manuel (pas de scraping fiable du vainqueur final sur
// plusieurs mois/7 compétitions, décision actée avec l'utilisateur le 28 juillet 2026).
export async function settleOutrightAlert(id, status) {
  _updateOutrightLocal(id, { status, settledAt: Date.now() });
  try { await fetch(`/api/outrights/alerts/${id}/settle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); } catch {}
}

export function dismissOutrightAlert(id) {
  const list = JSON.parse(localStorage.getItem(OUTRIGHT_ALERTS_KEY) || '[]').filter(a => a.id !== id);
  cloudSet(OUTRIGHT_ALERTS_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event('outright_alerts_updated'));
}
