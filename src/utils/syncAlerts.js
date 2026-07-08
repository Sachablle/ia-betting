// Synchronise les alertes props locales (localStorage) avec le modèle live du backend.
// Partagé entre PlaceBetPage (page "Alertes") et RunningPage (page "Running") :
// avant cette extraction, seule PlaceBetPage appelait cette logique — RunningPage affichait
// donc des % figés au moment du clic, jamais resynchronisés sur le modèle en direct
// (cf. memory feedback_session_08juin_bugs_recurrents #4, divergence Clark/Bridges/Castle/Brunson).

import { setItem as cloudSet } from './cloudStorage.js';

const ALERT_KEY     = 'nba_prop_alerts';
const HISTORY_KEY   = 'nba_bet_history';
const GAME_TOTAL_KEY = 'nba_game_total_alerts';
const BASKETBALL_RESULT_KEY = 'basketball_result_alerts';
const FB_BTTS_KEY   = 'fb_btts_alerts';
const FB_TOTAL_KEY  = 'fb_total_alerts';
const FB_RESULT_KEY = 'fb_result_alerts';
const FB_PINNACLE_KEY = 'fb_pinnacle_alerts';
const FB_DC_BTTS_KEY = 'fb_dc_btts_alerts';
const FB_DC_OU_KEY   = 'fb_dc_ou_alerts';
const BBALL_PINNACLE_KEY = 'bball_pinnacle_alerts';
const PURGE_PLAYERS = ['Justin Bean', 'Jack Kayil', 'Leandro Bolmaro'];

// Applique les settlements backend (won/lost/void) dans le localStorage — appeler depuis n'importe
// quelle page. Boucle sur toutes les clés d'alertes connues (props, total, résultat équipe, foot)
// pour que chaque type bénéficie du même règlement serveur — un seul endroit à étendre pour un
// futur type d'alerte (22 juin 2026, avant ça seul ALERT_KEY/props était couvert ici).
const SETTLEABLE_KEYS = [ALERT_KEY, GAME_TOTAL_KEY, BASKETBALL_RESULT_KEY, FB_BTTS_KEY, FB_TOTAL_KEY, FB_RESULT_KEY, FB_PINNACLE_KEY, BBALL_PINNACLE_KEY, FB_DC_BTTS_KEY, FB_DC_OU_KEY];

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
export async function flushPendingAlertSync() {
  const pending = readPendingSync();
  for (const alert of pending) {
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
    if (!bgAlerts?.length) return;
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
        if (lineShift || ubShift || bcShift || wmShift || probChanged || estChanged || driftChanged) {
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
            estimate:    a.estimate    ?? acceptedMatch.estimate,
            probDropWarning: a.probDropWarning ?? false,
            currentProbability: a.probDropWarning ? a.currentProbability : null,
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
            estimate:    a.estimate    ?? pendingMatch.estimate,
          };
          changed = true;
        }
        return; // Ne pas créer de doublon
      }

      if (!prev || (prev.status || 'pending') === 'pending') {
        byId[a.id] = { ...a, status: prev?.status || 'pending' };
        // Marquer changed seulement si quelque chose de significatif a changé
        if (!prev ||
            prev.probability !== a.probability ||
            prev.line !== a.line ||
            prev.unibetOdds !== a.unibetOdds ||
            prev.betclicOdds !== a.betclicOdds ||
            prev.winamaxOdds !== a.winamaxOdds ||
            prev.playerIsQ !== a.playerIsQ) {
          changed = true;
        }
      } else if (prev.status === 'accepted') {
        // Même ID, cote/cut bougé
        const lineShift = a.line != null && prev.line != null && Math.abs(a.line - prev.line) >= 0.5;
        const ubShift   = a.unibetOdds  != null && prev.unibetOdds  != null && Math.abs(a.unibetOdds  - prev.unibetOdds)  >= 0.05;
        const bcShift   = a.betclicOdds != null && prev.betclicOdds != null && Math.abs(a.betclicOdds - prev.betclicOdds) >= 0.05;
        const wmShift   = a.winamaxOdds != null && prev.winamaxOdds != null && Math.abs(a.winamaxOdds - prev.winamaxOdds) >= 0.05;
        // Même empreinte que le bloc acceptedMatch ci-dessus : il faut aussi resynchroniser
        // % et projection ici, sinon une alerte acceptée dont l'ID matche déjà (cas le plus courant)
        // reste figée sur le % calculé au moment du clic au lieu de suivre le modèle en direct
        // (= divergence avec Analyse Props, ex. Caitlin Clark / Bridges / Castle / Brunson)
        const probChanged = a.probability != null && a.probability !== prev.probability;
        const estChanged  = a.estimate != null && a.estimate !== prev.estimate;
        // Avertissement de dérive (8 juillet 2026, cf. refreshOrDropPendingProp/ById côté backend)
        // — n'affecte jamais probability/status (le pari reste tel qu'accepté), juste un signal.
        const driftChanged = !!a.probDropWarning !== !!prev.probDropWarning
          || a.currentProbability !== prev.currentProbability;
        if (lineShift || ubShift || bcShift || wmShift || probChanged || estChanged || driftChanged) {
          byId[a.id] = {
            ...prev,
            ...((lineShift || ubShift || bcShift || wmShift) ? {
              oddsAlert: {
                lineFrom: prev.line, lineTo: lineShift ? a.line : null,
                ubFrom: prev.unibetOdds, ubTo: ubShift ? a.unibetOdds : null,
                bcFrom: prev.betclicOdds, bcTo: bcShift ? a.betclicOdds : null,
                wmFrom: prev.winamaxOdds, wmTo: wmShift ? a.winamaxOdds : null,
              },
            } : {}),
            unibetOdds:  a.unibetOdds  ?? prev.unibetOdds,
            betclicOdds: a.betclicOdds ?? prev.betclicOdds,
            winamaxOdds: a.winamaxOdds ?? prev.winamaxOdds,
            line: lineShift ? a.line : prev.line,
            probability: a.probability ?? prev.probability,
            estimate:    a.estimate    ?? prev.estimate,
            probDropWarning: a.probDropWarning ?? false,
            currentProbability: a.probDropWarning ? a.currentProbability : null,
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
    if (!bgAlerts?.length) return;
    const totalAlerts = bgAlerts.filter(a => a.type === 'game_total' && a.prob > 0);
    if (!totalAlerts.length) return;

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
        result.push({
          id: a.id, type: 'game_total', league: a.league,
          eventId: a.eventId, home: a.home, away: a.away,
          homeShort: a.homeShort, awayShort: a.awayShort, date: a.date,
          estimated: a.estimated, line: a.line, edge: a.edge,
          direction: a.direction, prob: a.prob,
          unibetOdds: a.unibetOdds ?? null, betclicOdds: a.betclicOdds ?? null, winamaxOdds: a.winamaxOdds ?? null,
          savedAt: Date.now(), status: 'pending',
        });
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

// Pont alertes "Value Bet vs Pinnacle" basket (25 juin 2026) — même principe que syncGameTotalAlerts
// ci-dessus, mais pour basketball_pinnacle_edge (WNBA Total uniquement, cf. getPinnacleWnbaTotals
// backend). Clé localStorage séparée pour rester visuellement/structurellement distinct de
// nba_game_total_alerts (même marché, mais méthode de calcul indépendante — comparaison à
// Pinnacle, pas à notre modèle).
export async function syncBballPinnacleAlerts() {
  try {
    const { alerts: bgAlerts } = await fetch('/api/nba/background-alerts').then(r => r.json());
    if (!bgAlerts?.length) return;
    const pinAlerts = bgAlerts.filter(a => a.type === 'basketball_pinnacle_edge' && a.prob > 0);
    if (!pinAlerts.length) return;

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
          savedAt: Date.now(), status: 'pending',
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
    if (!bgAlerts?.length) return;
    const pinProps = bgAlerts.filter(a => a.type === 'basketball_pinnacle_props');
    if (!pinProps.length) return;

    const existing = JSON.parse(localStorage.getItem(BBALL_PINNACLE_PROPS_KEY) || '[]');
    let changed = false;
    const result = [...existing];
    pinProps.forEach(a => {
      const idx = result.findIndex(p => p.id === a.id);
      if (idx === -1) {
        result.push({ ...a, status: 'pending', savedAt: Date.now() });
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
  try { cloudSet(BBALL_PINNACLE_PROPS_KEY, JSON.stringify(arr)); } catch {}
}

// Pont alertes "Résultat" basket (victoire équipe, NBA/WNBA/EU) backend → localStorage
// basketball_result_alerts. Remplace EarlyWin (19 juin 2026) — seule source = backend
// (computeTeamWinProb), plus de génération côté client dans BasketballDetailPage.
export async function syncBasketballResultAlerts() {
  try {
    const { alerts: bgAlerts } = await fetch('/api/nba/background-alerts').then(r => r.json());
    if (!bgAlerts?.length) return;
    const resultAlerts = bgAlerts.filter(a => a.type === 'basketball_result' && a.probability > 0);
    if (!resultAlerts.length) return;

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
        result.push({ ...a, status: 'pending' });
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
    if (!bgAlerts?.length) return;
    const ORPHAN_GRACE_MS = 25 * 60_000;
    // Le backend ne génère des alertes CDM que dans les 24h avant coup d'envoi (CDM_ALERT_WINDOW_MS,
    // server.js) — pour éviter que la proba dérive avec le pool de matchs encore programmés. Une
    // alerte CDM créée côté client (MatchDetailPage, sur un match encore loin) n'apparaîtra donc
    // JAMAIS dans bgAlerts avant que la fenêtre 24h ne s'ouvre : sans cette exception, le purge
    // "orphelin" ci-dessous la supprimait ~25 min après sa création, puis elle ne revenait que si
    // l'utilisateur revisitait la page match (constaté 7 juillet 2026, ex: Angleterre-Norvège à 4j).
    const isCdmBeyondWindow = a => /^fdcdm_/.test(a.fixtureId || '')
      && a.fixtureDate && (new Date(a.fixtureDate).getTime() - Date.now()) > 24 * 3600_000;

    // BTTS
    const bttsAlerts = bgAlerts.filter(a => a.type === 'football_btts' && a.probability > 0);
    if (bttsAlerts.length) {
      const existing = JSON.parse(localStorage.getItem(FB_BTTS_KEY) || '[]');
      let changed = false;
      const result = [...existing];
      bttsAlerts.forEach(a => {
        const idx = result.findIndex(p => p.id === a.id);
        if (idx === -1) {
          result.push({ ...a, status: 'pending' });
          changed = true;
          return;
        }
        const prev = result[idx];
        if ((prev.status || 'pending') !== 'pending') {
          return; // accepté/rejeté/réglé : ne jamais toucher
        }
        if (prev.probability !== a.probability || prev.unibetOdds !== a.unibetOdds
            || prev.betclicOdds !== a.betclicOdds || prev.winamaxOdds !== a.winamaxOdds || prev.edge !== a.edge) {
          result[idx] = {
            ...prev,
            probability: a.probability,
            unibetOdds: a.unibetOdds ?? prev.unibetOdds,
            betclicOdds: a.betclicOdds ?? prev.betclicOdds,
            winamaxOdds: a.winamaxOdds ?? prev.winamaxOdds,
            edge: a.edge ?? prev.edge,
          };
          changed = true;
        }
      });
      // Purge des "pending" orphelins — uniquement pour les fixtures suivies en live (fd_*/fdcdm_*) :
      // les alertes générées côté client sur des fixtures statiques (hors-saison) n'ont pas
      // d'équivalent backend et ne doivent pas être purgées (comportement historique préservé).
      const liveIds = new Set(bttsAlerts.map(a => a.id));
      const purged = result.filter(a => {
        if ((a.status || 'pending') !== 'pending') return true;
        if (Date.now() - (a.savedAt || 0) < ORPHAN_GRACE_MS) return true;
        if (!/^(fd_|fdcdm_)/.test(a.fixtureId || '')) return true;
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
    if (totalAlerts.length) {
      const existing = JSON.parse(localStorage.getItem(FB_TOTAL_KEY) || '[]');
      let changed = false;
      const result = [...existing];
      totalAlerts.forEach(a => {
        const idx = result.findIndex(p => p.id === a.id);
        if (idx === -1) {
          result.push({ ...a, status: 'pending' });
          changed = true;
          return;
        }
        const prev = result[idx];
        if ((prev.status || 'pending') !== 'pending') {
          return; // accepté/rejeté/réglé : ne jamais toucher
        }
        if (prev.probability !== a.probability || prev.line !== a.line || prev.direction !== a.direction
            || prev.unibetOdds !== a.unibetOdds || prev.betclicOdds !== a.betclicOdds || prev.winamaxOdds !== a.winamaxOdds || prev.edge !== a.edge) {
          result[idx] = {
            ...prev,
            probability: a.probability, line: a.line, direction: a.direction, edge: a.edge,
            unibetOdds: a.unibetOdds ?? prev.unibetOdds,
            betclicOdds: a.betclicOdds ?? prev.betclicOdds,
            winamaxOdds: a.winamaxOdds ?? prev.winamaxOdds,
          };
          changed = true;
        }
      });
      const liveIds = new Set(totalAlerts.map(a => a.id));
      const purged = result.filter(a => {
        if ((a.status || 'pending') !== 'pending') return true;
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
    if (resultAlerts.length) {
      const existing = JSON.parse(localStorage.getItem(FB_RESULT_KEY) || '[]');
      let changed = false;
      const result = [...existing];
      resultAlerts.forEach(a => {
        const idx = result.findIndex(p => p.id === a.id);
        if (idx === -1) {
          result.push({ ...a, status: 'pending' });
          changed = true;
          return;
        }
        const prev = result[idx];
        if ((prev.status || 'pending') !== 'pending') {
          return; // accepté/rejeté/réglé : ne jamais toucher
        }
        if (prev.probability !== a.probability || prev.direction !== a.direction
            || prev.unibetOdds !== a.unibetOdds || prev.betclicOdds !== a.betclicOdds || prev.winamaxOdds !== a.winamaxOdds || prev.edge !== a.edge) {
          result[idx] = {
            ...prev,
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

    // Value Bet vs Pinnacle (25 juin 2026) — méthode indépendante de football_result : compare les
    // cotes Unibet/Betclic à la ligne Pinnacle démarginée plutôt qu'à notre propre modèle Poisson.
    // CDM uniquement (seule compétition où Pinnacle est scrapé). Même format de sync que les 3
    // autres types foot, clé localStorage séparée pour rester visuellement/structurellement distinct.
    const pinnacleAlerts = bgAlerts.filter(a => a.type === 'football_pinnacle_edge' && a.probability > 0);
    if (pinnacleAlerts.length) {
      const existing = JSON.parse(localStorage.getItem(FB_PINNACLE_KEY) || '[]');
      let changed = false;
      const result = [...existing];
      pinnacleAlerts.forEach(a => {
        const idx = result.findIndex(p => p.id === a.id);
        if (idx === -1) {
          result.push({ ...a, status: 'pending' });
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
    if (dcBttsAlerts.length) {
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
        if (idx === -1) { result.push({ ...a, status: 'pending' }); changed = true; return; }
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
    if (dcOuAlerts.length) {
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
        if (idx === -1) { result.push({ ...a, status: 'pending' }); changed = true; return; }
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
  const total = hs + as_;
  if (a.direction === 'over') {
    if (total > a.line) return 'won';
    return isFinal ? 'lost' : null;
  }
  if (total > a.line) return 'lost';
  return isFinal ? 'won' : null;
}

export async function resolveCompletedFootballAlerts(alerts, save) {
  const toResolve = alerts.filter(a =>
    a.status === 'accepted' && (a.fixtureId || '').startsWith('fdcdm_') &&
    new Date(a.fixtureDate).getTime() < Date.now()
  );
  if (!toResolve.length) return;
  try {
    const wc = await fetch('/api/fd/worldcup').then(r => r.json());
    const games = wc.games || [];
    let changed = false;
    for (const a of toResolve) {
      const gid = a.fixtureId.replace('fdcdm_', '');
      let game = games.find(g => String(g.id) === gid && ['STATUS_IN_PROGRESS', 'STATUS_FINAL'].includes(g.status));
      // Le match est sorti de la fenêtre glissante de /api/fd/worldcup (48h) — filet de rattrapage
      // pour ne pas laisser un pari accepted bloqué indéfiniment (cf. server.js /api/fd/match/:id,
      // bug du 7 juillet 2026 : alerte DC Suisse-Algérie du 3 juillet jamais réglée).
      if (!game) {
        const single = await fetch(`/api/fd/match/${gid}`).then(r => r.ok ? r.json() : null).catch(() => null);
        if (single && ['STATUS_IN_PROGRESS', 'STATUS_FINAL'].includes(single.status)) game = single;
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
    if (changed) save([...alerts]);
  } catch {}
}

// Suit le marché pour les alertes player_prop ACCEPTÉES, même quand le modèle ne génère plus
// d'alerte live sur ce joueur (cas où la ligne a trop bougé pour rester rentable) : le backend
// calcule à chaque cycle, pour TOUS les joueurs, la ligne/cotes/probas courantes dans
// _projectionsSnapshot — exposé via /api/{nba|wnba|euro/<league>}/projections-snapshot/:eventId.
const EU_PROJ_LEAGUES = ['acb', 'lnb', 'bbl', 'legaa', 'euroleague'];
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
