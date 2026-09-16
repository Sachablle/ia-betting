// Notifications Telegram — alertes envoyées dès qu'une nouvelle alerte qualifiée apparaît, avec
// boutons Accepter/Rejeter (16 juillet 2026). Fichier séparé exprès : aucune fonction ici ne touche
// à la logique d'alertes existante, uniquement l'envoi/réception Telegram.

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TG_API = TG_TOKEN ? `https://api.telegram.org/bot${TG_TOKEN}` : null;

function telegramConfigured() {
  return !!(TG_TOKEN && TG_CHAT_ID);
}

// Vérifie la santé réelle du tunnel/webhook — interroge l'API Telegram elle-même (getWebhookInfo)
// plutôt que de pinguer le tunnel en local : ça confirme que Telegram ARRIVE VRAIMENT à joindre le
// webhook, pas juste que le process cloudflared tourne encore (le watchdog du tunnel a déjà eu le cas
// d'un process vivant mais devenu injoignable côté edge, cf. telegram-tunnel-watchdog.sh).
//
// Fix 26 juillet 2026 — faux vert pendant une vraie panne de 3h : `last_error_date` n'est mis à jour
// par Telegram QUE quand ils tentent réellement de livrer un update et échouent. Sans trafic entrant
// (aucune alerte poussée, aucun clic Accepter/Rejeter) pendant la panne, Telegram ne retente jamais
// rien → `recentError` reste faux indéfiniment même avec un tunnel mort depuis des heures, et l'icône
// Dashboard passait au vert malgré une panne réelle en cours. Fix : vérification active en plus du
// signal passif — un GET sur `/api/health` via l'URL publique elle-même (même principe que
// telegram-tunnel-watchdog.sh, mais câblé ici pour alimenter l'icône au lieu d'un check séparé qui ne
// remonte nulle part côté UI).
async function checkTelegramWebhookHealth() {
  if (!telegramConfigured()) return { ok: false, reason: 'not_configured' };
  try {
    const res = await fetch(`${TG_API}/getWebhookInfo`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (!data?.ok) return { ok: false, reason: 'api_error' };
    const info = data.result;
    const hasUrl = !!info.url;
    const errorAgeMs = info.last_error_date ? Date.now() - info.last_error_date * 1000 : null;
    const recentError = errorAgeMs !== null && errorAgeMs < 6 * 60_000;

    let reachable = false;
    if (hasUrl) {
      try {
        const origin = new URL(info.url).origin;
        const pingRes = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(8000) });
        reachable = pingRes.ok;
      } catch { reachable = false; }
    }

    return { ok: hasUrl && !recentError && reachable, url: info.url || null, lastErrorMessage: info.last_error_message || null };
  } catch (e) {
    return { ok: false, reason: 'fetch_failed' };
  }
}

// Envoie un message avec boutons inline [{text, callback_data}] optionnels.
// Renvoie le message_id Telegram (utile pour éditer le message après un clic), ou null si échec.
async function sendTelegramMessage(text, buttons = null) {
  if (!telegramConfigured()) return null;
  try {
    const body = {
      chat_id: TG_CHAT_ID,
      text,
      parse_mode: 'HTML',
      ...(buttons ? { reply_markup: { inline_keyboard: [buttons] } } : {}),
    };
    const res = await fetch(`${TG_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return data?.ok ? data.result.message_id : null;
  } catch { return null; }
}

// Édite un message existant (après clic sur un bouton) — retire les boutons et affiche le résultat.
// Fix 11 septembre 2026 : le commentaire ci-dessus disait déjà "retire les boutons" mais c'était
// faux — `editMessageText` sans `reply_markup` explicite laisse le clavier existant intact côté
// Telegram (comportement natif de leur API, pas un bug de notre fetch). Les 2 boutons Accepter/
// Rejeter restaient donc cliquables indéfiniment après une 1ère décision — cas réel : Rennes-Marseille
// (Total O/U), Rejeter cliqué à 01:33, puis Accepter cliqué sur le MÊME message à 01:40 (le bouton
// était toujours actif), écrasant silencieusement le rejet en acceptation réelle côté `_acceptedAlerts`
// sans que rien ne prévienne l'utilisateur ni ne bloque le 2e clic. `reply_markup:{inline_keyboard:[]}`
// force Telegram à retirer visuellement les boutons dès la 1ère décision.
async function editTelegramMessage(messageId, text) {
  if (!telegramConfigured() || !messageId) return;
  try {
    await fetch(`${TG_API}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, message_id: messageId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } }),
    });
  } catch {}
}

// Accuse réception d'un clic sur bouton (obligatoire côté Telegram, sinon le bouton reste en
// "chargement" indéfiniment côté téléphone).
async function answerCallbackQuery(callbackQueryId, text = '') {
  if (!telegramConfigured()) return;
  try {
    await fetch(`${TG_API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch {}
}

// ── Registre des types d'alertes ────────────────────────────────────────────
// Un type = comment formater le message Telegram + comment reconstruire les champs "accepted"
// (mêmes noms que les handlers d'acceptation de PlaceBetPage.jsx) pour que le site retrouve
// exactement la même forme qu'une acceptation faite depuis le site. Les lookups sont volontairement
// défensifs (?? en cascade) — mieux vaut un champ manquant silencieux qu'un crash sur un type qui
// aurait une variante de nommage non prévue ici.
const LEAGUE_LABEL = { nba: 'NBA', wnba: 'WNBA', acb: 'ACB', lnb: 'LNB', bbl: 'BBL', legaa: 'Lega A', euroleague: 'EuroLeague', cdm: 'CDM', ligue1: 'Ligue 1', pl: 'Premier League', laliga: 'Liga', bundes: 'Bundesliga', seriea: 'Serie A', bresil: 'Brasileirão', europa: 'Europa League', conference: 'Conference League', champions: 'Ligue des Champions' };
const STAT_LABEL = { pts: 'Pts', reb: 'Reb', ast: 'Ast', tpm: '3pts' };
const leagueLabel = a => LEAGUE_LABEL[a.league] || (a.league || '').toUpperCase();
const teamName = (a, side) => side === 'home' ? (a.home || a.homeShort) : (a.away || a.awayShort);
// "Home - Away" (tiret, pas "vs") — nouveau format Telegram du 6 septembre 2026, demande explicite.
const matchVs = a => `${teamName(a, 'home')} - ${teamName(a, 'away')}`;

// Meilleure cote dispo parmi les bookmakers scrapés pour cette alerte/direction — Telegram ne
// permet pas de choisir un bookmaker précis comme sur le site, donc on prend la meilleure cote
// valide disponible.
function bestOdds(candidates) {
  const valid = candidates.filter(([, o]) => o != null && o > 1);
  if (!valid.length) return [null, null];
  return valid.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
}
function propsOdds(a) {
  const dir = a.direction === 'over' ? 'Over' : 'Under';
  return bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds], ['winamax', a.winamaxOdds]]);
}

// ── Format de message unifié (6-7 septembre 2026, demande explicite utilisateur) ────────────────
// 5 lignes fixes pour tout marché "probabiliste" (foot BTTS/Total/Résultat/DC, props, marchés
// équipe basket) : sport+ligue, match+horaire, pari+cote, probabilité+historique near-miss à ce %
// exact, et la mise recommandée en euros (barème bankroll de l'app, pas le % implicite de la cote —
// cf. buildAlertText plus bas). Volontairement PAS appliqué aux types "edge" (Pinnacle/outrights) —
// ils n'ont pas de probabilité de référence ni d'historique near-miss comparable, un edge se lit
// différemment (cf. leurs labels existants, inchangés).
const SPORT_EMOJI = {
  nba: '🏀', wnba: '🏀', acb: '🏀', lnb: '🏀', bbl: '🏀', legaa: '🏀', euroleague: '🏀',
  cdm: '⚽', ligue1: '⚽', pl: '⚽', laliga: '⚽', bundes: '⚽', seriea: '⚽', bresil: '⚽',
  europa: '⚽', conference: '⚽', champions: '⚽',
};
// 🇬🇧 (Union Jack) plutôt que le drapeau Angleterre (🏴󠁧󠁢󠁥󠁮󠁧󠁿, séquence de tags Unicode qui ne rend pas
// sur tous les clients Telegram/polices — préférer un drapeau qui s'affiche partout à un drapeau
// plus précis mais parfois invisible).
const LEAGUE_FLAG = {
  nba: '🇺🇸', wnba: '🇺🇸', acb: '🇪🇸', lnb: '🇫🇷', bbl: '🇩🇪', legaa: '🇮🇹', euroleague: '🇪🇺',
  cdm: '🌍', ligue1: '🇫🇷', pl: '🇬🇧', laliga: '🇪🇸', bundes: '🇩🇪', seriea: '🇮🇹', bresil: '🇧🇷',
  europa: '🇪🇺', conference: '🇪🇺', champions: '🇪🇺',
};
// Fuseau horaire figé sur Europe/Paris (6 septembre 2026, bug trouvé par l'utilisateur — 1er test
// affichait 23h30 au lieu de 01h30) — Date.prototype.getHours()/getDate() lisent le fuseau LOCAL du
// process Node, pas celui de l'utilisateur. Si le serveur tourne dans un environnement réglé sur
// UTC (fréquent en dev/prod), l'heure affichée dérivait silencieusement. Intl.DateTimeFormat avec
// `timeZone` explicite convertit toujours vers l'heure française, peu importe le fuseau système.
function fmtMatchDateTime(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = t => parts.find(p => p.type === t)?.value;
  return `${get('day')}/${get('month')}/${get('year')} - ${get('hour')}h${get('minute')}`;
}
// Nombres au format français (virgule) — cohérent avec le reste de l'app (fr-FR partout, cf.
// src/utils/formatters.js) ; les messages Telegram utilisaient jusqu'ici l'interpolation JS brute
// (point anglo-saxon), jamais remarqué avant que l'utilisateur ne compare avec le site.
const frNum = n => (n == null ? null : n.toLocaleString('fr-FR'));
const frOdds = n => (n == null ? null : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
// Betclic/Unibet uniquement (demande explicite : "si 2 lignes betclic ou unibet, donne la
// meilleure des deux") — jamais Winamax (mort, cf. feedback_winamax_removed) ni Pinnacle (pas un
// bookmaker sur lequel l'utilisateur peut réellement parier).
function bkOnlyBestOdds(a) {
  return bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds]]);
}
const BK_DISPLAY = { unibet: 'Unibet', betclic: 'Betclic' };
function nearMissLine(wl) {
  if (!wl || wl.won + wl.lost === 0) return null;
  return `${wl.won}G/${wl.lost}P`;
}
// Format 5 lignes revu le 7 septembre 2026 sur retours directs de l'utilisateur : (1) sport+ligue
// SANS drapeau, (2) drapeau+match, date en texte normal (pas gras) juste après — Telegram n'a aucun
// contrôle de taille de police (HTML très limité : gras/italique/souligné/lien seulement), le
// contraste gras/normal est le plus proche possible d'un "petit à droite" dans ce médium ; (3) pari
// + cote toujours collée juste après la direction (jamais séparée par du texte) ; (4) probabilité +
// % calibré + historique near-miss réel à ce % exact (sans "à ce %", implicite) ; (5) mise recommandée
// en % DE LA BANKROLL (pas un montant en euros — un montant absolu se périme dès que le bankroll
// change) — passée par deux versions rejetées avant celle-ci (% implicite de la cote bookmaker,
// puis un demi-Kelly qui dépendait de la cote et pouvait tomber à 0%) : la version actuelle
// (`_stakePctForAlert()`, server.js) ignore complètement la cote, indexée uniquement sur le %
// calibré de l'alerte (÷12, plafond 10% — mêmes constantes que l'ancienne suggestion par alerte du
// site, gardées pour cohérence). `null` (jamais 0%) si aucune donnée de calibration pour ce
// marché/cette ligue. Odds/lignes en virgule française (frNum/frOdds).
function buildAlertText({ league, matchLabel, dateStr, betLabel, bk, odds, probability, wl, stake, calibratedProbability, stakeAmount }) {
  const emoji = SPORT_EMOJI[league] || '⚽';
  const flag = LEAGUE_FLAG[league] || '';
  const lines = [];
  lines.push(`${emoji} <b>${leagueLabel({ league })}</b>`);
  const day = fmtMatchDateTime(dateStr);
  lines.push(`${flag ? `${flag} ` : ''}<b>${matchLabel}</b>${day ? ` (${day})` : ''}`.trim());
  lines.push(''); // ligne vide demandée entre le match et le pari donné
  const oddsStr = odds != null ? ` — <b>${frOdds(odds)}</b>${bk ? ` (${BK_DISPLAY[bk] || bk})` : ''}` : '';
  lines.push(`${betLabel}${oddsStr}`);
  const nm = nearMissLine(wl);
  // % calibré (7 septembre 2026, demande explicite) — affiché EN PLUS du % modèle, jamais à sa place :
  // taux de réussite réel isotonique (régression PAVA sur l'historique near-miss), garanti croissant
  // avec le % modèle contrairement au % brut qui peut avoir des zones non-monotones (cf. audit du
  // 7 sept). Purement informatif, ne change aucun seuil de déclenchement.
  const calibStr = calibratedProbability != null ? ` (${calibratedProbability}% calibré)` : '';
  lines.push(`Probabilité : <b>${probability}%</b>${calibStr}${nm ? ` — ${nm}` : ''}`);
  // % de la bankroll (7 septembre 2026, demande explicite — pas un montant en euros, qui se périme
  // dès que le bankroll change) — `stake` est déjà un pourcentage calculé côté serveur
  // (_stakePctForAlert), demi-Kelly indexé sur le % calibré quand disponible, replié sur le palier
  // bankroll classique sinon. Peut légitimement valoir 0% (aucun edge réel une fois calibré) —
  // volontaire, pas un bug (cf. discussion utilisateur).
  // 0% caché (7 septembre 2026, demande explicite) — un edge nul affiché comme "0% de la BK" lisait
  // comme une recommandation contradictoire avec le fait même de recevoir l'alerte. La ligne
  // disparaît simplement plutôt que d'afficher un chiffre qui n'a pas de sens à montrer.
  // Montant en euros (8 septembre 2026, demande explicite) — affiché EN PLUS du %, pas à sa place :
  // le % reste la vraie règle (s'adapte au solde), le montant est juste la traduction pratique au
  // solde du moment. Absent si le solde réel n'a pas pu être récupéré (repli silencieux sur le % seul).
  const amountStr = stakeAmount != null && stakeAmount > 0 ? ` (≈ ${frNum(stakeAmount)}€)` : '';
  if (stake != null && stake > 0) lines.push(`Mise recommandée : <b>${frNum(stake)}% de la BK</b>${amountStr}`);
  return lines.join('\n');
}
function propsAccepted(a, bk, odds, prob) {
  return {
    acceptedAt: Date.now(), acceptedProbability: prob ?? a.probability ?? a.prob ?? null, acceptedBookmaker: bk,
    acceptedUnibetOdds: bk === 'unibet' ? odds : null,
    acceptedBetclicOdds: bk === 'betclic' ? odds : null,
    acceptedWinamaxOdds: bk === 'winamax' ? odds : null,
  };
}

const ALERT_TYPES = {
  player_prop: {
    dateField: 'fixtureDate',
    label: a => {
      const [bk, odds] = propsOdds(a);
      const betLabel = `${a.player} — ${a.direction === 'over' ? '▲ Over' : '▼ Under'} ${frNum(a.line)} ${STAT_LABEL[a.stat] || (a.stat || '').toUpperCase()}`;
      const matchLabel = a.home && a.away ? matchVs(a) : (a.fixture || a.player || '');
      const base = buildAlertText({ league: a.league, matchLabel, dateStr: a.fixtureDate, betLabel, bk, odds, probability: a.probability, wl: a._wl, stake: a._stake, calibratedProbability: a.calibratedProbability, stakeAmount: a._stakeAmount });
      return a.oppQSamePosition ? `${base}\n⚠ Adversaire Q au même poste — pas de boost tant que son statut n'est pas confirmé` : base;
    },
    odds: propsOdds,
    buildAccepted: (a, bk, odds) => propsAccepted(a, bk, odds),
  },
  game_total: {
    dateField: 'date',
    label: a => {
      const [bk, odds] = bkOnlyBestOdds(a);
      const betLabel = `${a.direction === 'over' ? '▲ Plus' : '▼ Moins'} de ${frNum(a.line)}`;
      return buildAlertText({ league: a.league, matchLabel: matchVs(a), dateStr: a.date, betLabel, bk, odds, probability: a.prob, wl: a._wl, stake: a._stake, calibratedProbability: a.calibratedProbability, stakeAmount: a._stakeAmount });
    },
    odds: a => bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds], ['winamax', a.winamaxOdds]]),
    buildAccepted: (a, bk, odds) => ({ ...propsAccepted(a, bk, odds, a.prob), acceptedOdds: odds ?? null }),
  },
  team_total: {
    dateField: 'date',
    label: a => {
      const [bk, odds] = bkOnlyBestOdds(a);
      const betLabel = `${a.team} — ${a.direction === 'over' ? '▲ Plus' : '▼ Moins'} de ${frNum(a.line)}`;
      return buildAlertText({ league: a.league, matchLabel: matchVs(a), dateStr: a.date, betLabel, bk, odds, probability: a.prob, wl: a._wl, stake: a._stake, calibratedProbability: a.calibratedProbability, stakeAmount: a._stakeAmount });
    },
    odds: a => bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds]]),
    buildAccepted: (a, bk, odds) => ({ ...propsAccepted(a, bk, odds, a.prob), acceptedOdds: odds ?? null }),
  },
  basketball_result: {
    dateField: 'date',
    label: a => buildAlertText({ league: a.league, matchLabel: matchVs(a), dateStr: a.date, betLabel: `Victoire ${teamName(a, a.direction)}`, bk: a.bookmaker ?? null, odds: a.odds ?? null, probability: a.probability, wl: a._wl, stake: a._stake, calibratedProbability: a.calibratedProbability }),
    odds: a => [a.bookmaker ?? null, a.odds ?? null], // déjà figé à la génération, pas de choix à faire
    buildAccepted: () => ({ acceptedAt: Date.now() }),
  },
  basketball_pinnacle_edge: {
    dateField: 'date',
    label: a => `💎 <b>${leagueLabel(a)} Value vs Pinnacle</b>\n${teamName(a, 'home')} vs ${teamName(a, 'away')}\nEdge : <b>${a.edge != null ? Math.round(a.edge * 100) + '%' : '—'}</b>`,
    odds: a => bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds]]),
    buildAccepted: (a, bk, odds) => ({ acceptedAt: Date.now(), acceptedBookmaker: bk, acceptedUnibetOdds: bk === 'unibet' ? odds : null, acceptedBetclicOdds: bk === 'betclic' ? odds : null }),
  },
  basketball_pinnacle_props: {
    dateField: 'date',
    label: a => `💎 <b>${leagueLabel(a)} Value Props vs Pinnacle</b>\n${a.player} — ${a.direction === 'over' ? '▲' : '▼'} ${a.line} ${STAT_LABEL[a.stat] || (a.stat || '').toUpperCase()}\nEdge : <b>${a.edge != null ? Math.round(a.edge * 100) + '%' : '—'}</b>`,
    odds: a => bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds]]),
    buildAccepted: (a, bk, odds) => ({ acceptedAt: Date.now(), acceptedBookmaker: bk, acceptedUnibetOdds: bk === 'unibet' ? odds : null, acceptedBetclicOdds: bk === 'betclic' ? odds : null }),
  },
  football_btts: {
    dateField: 'fixtureDate',
    label: a => {
      const [bk, odds] = bkOnlyBestOdds(a);
      // matchVs(a) plutôt que a.fixture (6 septembre 2026) — le champ `fixture` généré à la création
      // de l'alerte porte encore l'ancien séparateur "vs" ("Home vs Away"), incompatible avec le
      // nouveau format "Home - Away" demandé ; a.home/a.away restent la source fiable dans tous les cas.
      return buildAlertText({ league: a.league, matchLabel: matchVs(a), dateStr: a.fixtureDate, betLabel: 'Les 2 équipes marquent : Oui', bk, odds, probability: a.probability, wl: a._wl, stake: a._stake, calibratedProbability: a.calibratedProbability, stakeAmount: a._stakeAmount });
    },
    odds: a => bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds], ['winamax', a.winamaxOdds]]),
    buildAccepted: (a, bk, odds) => propsAccepted(a, bk, odds),
  },
  football_total: {
    dateField: 'fixtureDate',
    label: a => {
      const [bk, odds] = bkOnlyBestOdds(a);
      const betLabel = `${a.direction === 'over' ? '▲ Plus' : '▼ Moins'} de ${frNum(a.line)} buts`;
      return buildAlertText({ league: a.league, matchLabel: matchVs(a), dateStr: a.fixtureDate, betLabel, bk, odds, probability: a.probability, wl: a._wl, stake: a._stake, calibratedProbability: a.calibratedProbability, stakeAmount: a._stakeAmount });
    },
    odds: a => bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds], ['winamax', a.winamaxOdds]]),
    buildAccepted: (a, bk, odds) => propsAccepted(a, bk, odds),
  },
  football_result: {
    dateField: 'fixtureDate',
    label: a => {
      const [bk, odds] = bkOnlyBestOdds(a);
      const who = a.direction === 'draw' ? 'Match nul' : `Victoire ${teamName(a, a.direction)}`;
      return buildAlertText({ league: a.league, matchLabel: matchVs(a), dateStr: a.fixtureDate, betLabel: who, bk, odds, probability: a.probability, wl: a._wl, stake: a._stake, calibratedProbability: a.calibratedProbability, stakeAmount: a._stakeAmount });
    },
    odds: a => bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds], ['winamax', a.winamaxOdds]]),
    buildAccepted: (a, bk, odds) => propsAccepted(a, bk, odds),
  },
  // Total de buts PAR ÉQUIPE — passé en production le 14 septembre 2026 (voir CLAUDE.md pour
  // l'historique de calibration). Même format que football_total, libellé nommant l'équipe (a.side).
  football_team_goals: {
    dateField: 'fixtureDate',
    label: a => {
      const [bk, odds] = bkOnlyBestOdds(a);
      const betLabel = `${teamName(a, a.side)} — ${a.direction === 'over' ? '▲ Plus' : '▼ Moins'} de ${frNum(a.line)} but(s)`;
      return buildAlertText({ league: a.league, matchLabel: matchVs(a), dateStr: a.fixtureDate, betLabel, bk, odds, probability: a.probability, wl: a._wl, stake: a._stake, calibratedProbability: a.calibratedProbability, stakeAmount: a._stakeAmount });
    },
    odds: a => bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds]]),
    buildAccepted: (a, bk, odds) => propsAccepted(a, bk, odds),
  },
  // football_dc_btts / football_dc_ou retirés le 8 septembre 2026 (marché supprimé du projet) —
  // plus aucune nouvelle alerte de ces types n'est jamais générée par server.js.
  football_pinnacle_edge: {
    dateField: 'fixtureDate',
    label: a => `💎 <b>${leagueLabel(a)} Value vs Pinnacle</b>\n${teamName(a, 'home')} vs ${teamName(a, 'away')}\nEdge : <b>${a.edge != null ? Math.round(a.edge * 100) + '%' : '—'}</b>`,
    odds: a => bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds]]),
    buildAccepted: (a, bk, odds) => ({ acceptedAt: Date.now(), acceptedBookmaker: bk, acceptedUnibetOdds: bk === 'unibet' ? odds : null, acceptedBetclicOdds: bk === 'betclic' ? odds : null }),
  },
  // Outrights (28 juillet 2026) — traités par une branche dédiée dans /api/telegram/webhook
  // (server.js, store _outrightAlerts séparé de backgroundAlerts/_acceptedAlerts) ; meta.odds/label
  // sont quand même utilisés par cette branche et par notifyNewAlert (message initial).
  outright_model: {
    dateField: 'savedAt',
    label: a => `📊 <b>${a.compLabel || a.compKey} — Outright</b>\n${a.team}\nScore modèle : <b>${a.score}/100</b>`,
    odds: a => bestOdds([['betclic', a.books?.betclic], ['pmu', a.books?.pmu]]),
    buildAccepted: (a, bk, odds) => ({ acceptedAt: Date.now(), acceptedBookmaker: bk, acceptedOdds: odds }),
  },
  outright_gap: {
    dateField: 'savedAt',
    label: a => `💎 <b>${a.compLabel || a.compKey} — Outright</b>\n${a.team}\nEdge vs Pinnacle : <b>+${a.edge}%</b> (${a.bookmaker})`,
    odds: a => [a.bookmaker ?? null, a.odds ?? null],
    buildAccepted: (a, bk, odds) => ({ acceptedAt: Date.now(), acceptedBookmaker: bk, acceptedOdds: odds }),
  },
};

function getAlertTypeMeta(type) {
  return ALERT_TYPES[type] || null;
}

// ── Tokens de callback + journal d'actions ──────────────────────────────────
// callback_data Telegram est limité à 64 octets — un id d'alerte complet (ex: un id de props NBA
// avec player+stat+date concaténés) peut dépasser cette limite, donc on ne met jamais l'id réel dans
// le bouton. À la place : un token court aléatoire → {type, id} en mémoire. _actionLog garde la trace
// des accept/reject pour que le frontend (qui ne peut pas recevoir de webhook Telegram lui-même)
// puisse les découvrir par polling (GET /api/telegram/actions?since=).
// Persisté sur disque depuis le 18 juillet 2026 — avant ça, _tokenMap était perdu à chaque
// redémarrage backend et un bouton Accepter/Rejeter déjà envoyé devenait mort ("Alerte introuvable
// ou expirée") sans jamais être renvoyé automatiquement (le fix _telegramNotifiedIds côté server.js,
// qui dédup par ID déjà notifié plutôt que par "1er cycle après restart", empêche justement une
// re-notification qui aurait pu régénérer un token valide — cas réel constaté le 18 juillet 2026,
// alerte Jonquel Jones). Avec le watchdog backend qui peut redémarrer le process tout seul, ce
// n'est plus un cas rare de session de dev — les boutons doivent survivre à un redémarrage normal.
const TOKEN_MAP_FILE = join(dirname(fileURLToPath(import.meta.url)), 'cache', 'telegram_tokens.json');
const _tokenMap = new Map(); // token -> { type, id, messageId }
try {
  if (existsSync(TOKEN_MAP_FILE)) {
    for (const [k, v] of JSON.parse(readFileSync(TOKEN_MAP_FILE, 'utf8'))) _tokenMap.set(k, v);
  }
} catch {}
function _saveTokenMap() {
  try { writeFileSync(TOKEN_MAP_FILE, JSON.stringify([..._tokenMap.entries()]), 'utf8'); } catch {}
}
const _actionLog = []; // { type, id, action, ts }
const ACTION_LOG_MAX = 500;

function makeToken() {
  return Math.random().toString(36).slice(2, 10);
}

// `extra` (20 juillet 2026) — jusqu'ici seul {type,id,action} était journalisé, jamais le bookmaker
// ni la cote choisis au moment d'un accept Telegram (acceptedFields côté webhook, server.js). Le
// site ne pouvait donc jamais savoir laquelle afficher après coup — cote manquante sur Running/
// Backtesting pour toute alerte acceptée depuis Telegram. `extra` transporte acceptedBookmaker/
// acceptedUnibetOdds/acceptedBetclicOdds/... jusqu'à syncTelegramActions() côté client.
function recordAction(type, id, action, extra = null) {
  _actionLog.push({ type, id, action, ts: Date.now(), ...(extra ? { extra } : {}) });
  if (_actionLog.length > ACTION_LOG_MAX) _actionLog.splice(0, _actionLog.length - ACTION_LOG_MAX);
}

function getActionsSince(ts) {
  return _actionLog.filter(a => a.ts > (ts || 0));
}

// Debug uniquement — retrouve le(s) token(s) de callback en attente pour un id d'alerte donné, pour
// pouvoir simuler un clic bouton depuis un test sans passer par un vrai tap Telegram.
function _debugTokensForId(id) {
  const found = [];
  for (const [token, entry] of _tokenMap.entries()) if (entry.id === id) found.push({ token, ...entry });
  return found;
}

// Invalide les tokens Accepter/Rejeter d'une alerte SANS passer par un vrai clic Telegram (16
// septembre 2026) — utilisée par POST /api/accepted-alerts (server.js) quand la décision est prise
// depuis le SITE plutôt que depuis Telegram. Avant cette fonction, un accept web ne touchait jamais
// _tokenMap : le message Telegram d'origine restait affiché avec ses 2 boutons live indéfiniment,
// et un tap tardif (même des jours après, notification retrouvée en scrollant) sur "Rejeter" pouvait
// silencieusement écraser l'acceptation (cas réels Espanyol/Levante, football_team_goals). Retourne
// le messageId pour permettre d'éditer le texte affiché (fait par l'appelant, qui connaît le vrai
// libellé via getAlertTypeMeta).
function invalidateTokensForId(id) {
  let messageId = null;
  for (const [tok, e] of _tokenMap.entries()) {
    if (e.id === id) { messageId = e.messageId; _tokenMap.delete(tok); }
  }
  if (messageId) _saveTokenMap();
  return messageId;
}

// Envoie une notification pour une alerte fraîchement générée (jamais vue au cycle précédent),
// avec boutons Accepter/Rejeter. Ne fait rien si le type n'est pas dans le registre ou si Telegram
// n'est pas configuré (clé absente en local dev sans .env rempli, ou sur Render où on ne veut pas
// notifier — cf. TELEGRAM_BOT_TOKEN présent seulement en local pour l'instant).
// Renvoie true si le message est réellement parti (utilisé par server.js pour ne marquer l'alerte
// "notifiée" — et donc ne plus jamais la retenter — qu'en cas de succès réel, cf. fix 28 juillet 2026).
async function notifyNewAlert(alert) {
  if (!telegramConfigured()) return false;
  const meta = getAlertTypeMeta(alert.type);
  if (!meta) return false;
  try {
    const text = meta.label(alert);
    const acceptToken = makeToken();
    const rejectToken = makeToken();
    const buttons = [
      { text: '✅ Accepter', callback_data: `A:${acceptToken}` },
      { text: '❌ Rejeter', callback_data: `R:${rejectToken}` },
    ];
    const messageId = await sendTelegramMessage(text, buttons);
    if (!messageId) return false;
    _tokenMap.set(acceptToken, { type: alert.type, id: alert.id, messageId });
    _tokenMap.set(rejectToken, { type: alert.type, id: alert.id, messageId });
    _saveTokenMap();
    return true;
  } catch (e) { console.error('notifyNewAlert error:', e.message); return false; }
}

// Résout un callback_data ("A:xxxxx" / "R:xxxxx") en { action, type, id, messageId }, ou null si le
// token est inconnu/expiré (ex: backend redémarré entre-temps). Le token est consommé (retiré de la
// map) au premier clic pour éviter un double-accept si l'utilisateur clique deux fois vite.
function resolveCallbackToken(callbackData) {
  if (!callbackData || callbackData.length < 3) return null;
  const action = callbackData[0] === 'A' ? 'accepted' : callbackData[0] === 'R' ? 'rejected' : null;
  const token = callbackData.slice(2);
  const entry = _tokenMap.get(token);
  if (!action || !entry) return null;
  _tokenMap.delete(token);
  // Invalide aussi le token du bouton opposé (même id) — filet de sécurité en plus du fix
  // reply_markup ci-dessus (editTelegramMessage) : même si un client Telegram affiche encore une
  // copie périmée du message avec ses 2 boutons (cache local, notification déjà affichée avant
  // l'édition), un 2e clic tardif sur l'autre bouton ne peut plus rien écraser silencieusement —
  // il tombera sur "Alerte introuvable ou expirée" au lieu de renverser la décision déjà prise.
  for (const [tok, e] of _tokenMap.entries()) {
    if (tok !== token && e.id === entry.id) _tokenMap.delete(tok);
  }
  _saveTokenMap();
  return { action, ...entry };
}

export {
  telegramConfigured, sendTelegramMessage, editTelegramMessage, answerCallbackQuery,
  getAlertTypeMeta, bestOdds, notifyNewAlert, resolveCallbackToken, recordAction, getActionsSince,
  _debugTokensForId, invalidateTokensForId, checkTelegramWebhookHealth,
};
