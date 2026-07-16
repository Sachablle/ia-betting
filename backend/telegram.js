// Notifications Telegram — alertes envoyées dès qu'une nouvelle alerte qualifiée apparaît, avec
// boutons Accepter/Rejeter (16 juillet 2026). Fichier séparé exprès : aucune fonction ici ne touche
// à la logique d'alertes existante, uniquement l'envoi/réception Telegram.

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
    return { ok: hasUrl && !recentError, url: info.url || null, lastErrorMessage: info.last_error_message || null };
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
async function editTelegramMessage(messageId, text) {
  if (!telegramConfigured() || !messageId) return;
  try {
    await fetch(`${TG_API}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, message_id: messageId, text, parse_mode: 'HTML' }),
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
const LEAGUE_LABEL = { nba: 'NBA', wnba: 'WNBA', acb: 'ACB', lnb: 'LNB', bbl: 'BBL', legaa: 'Lega A', euroleague: 'EuroLeague', cdm: 'CDM', ligue1: 'Ligue 1', pl: 'Premier League', laliga: 'Liga', bundes: 'Bundesliga', seriea: 'Serie A' };
const STAT_LABEL = { pts: 'Pts', reb: 'Reb', ast: 'Ast', tpm: '3pts' };
const leagueLabel = a => LEAGUE_LABEL[a.league] || (a.league || '').toUpperCase();
const teamName = (a, side) => side === 'home' ? (a.home || a.homeShort) : (a.away || a.awayShort);

// Meilleure cote dispo parmi les bookmakers scrapés pour cette alerte/direction — Telegram ne
// permet pas de choisir un bookmaker précis comme sur le site, donc on prend la meilleure cote
// valide disponible.
function bestOdds(candidates) {
  const valid = candidates.filter(([, o]) => o != null && o > 1);
  if (!valid.length) return [null, null];
  return valid.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
}
const fmtOdds = (bk, odds) => (odds ? `${odds.toFixed(2)} (${bk})` : '—');

function propsOdds(a) {
  const dir = a.direction === 'over' ? 'Over' : 'Under';
  return bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds], ['winamax', a.winamaxOdds]]);
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
    label: a => `🏀 <b>${leagueLabel(a)} Props</b>\n${a.player} — ${a.direction === 'over' ? '▲ Over' : '▼ Under'} ${a.line} ${STAT_LABEL[a.stat] || (a.stat || '').toUpperCase()}\nProbabilité : <b>${a.probability}%</b>`,
    odds: propsOdds,
    buildAccepted: (a, bk, odds) => propsAccepted(a, bk, odds),
  },
  game_total: {
    dateField: 'date',
    label: a => `🏀 <b>${leagueLabel(a)} Total</b>\n${teamName(a, 'home')} vs ${teamName(a, 'away')} — ${a.direction === 'over' ? '▲ Plus' : '▼ Moins'} de ${a.line}\nProbabilité : <b>${a.prob}%</b>`,
    odds: a => bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds], ['winamax', a.winamaxOdds]]),
    buildAccepted: (a, bk, odds) => ({ ...propsAccepted(a, bk, odds, a.prob), acceptedOdds: odds ?? null }),
  },
  basketball_result: {
    dateField: 'date',
    label: a => `🏆 <b>${leagueLabel(a)} Résultat</b>\n${teamName(a, 'home')} vs ${teamName(a, 'away')}\nVictoire ${teamName(a, a.direction)} — <b>${a.probability}%</b>${fmtOdds(a.bookmaker, a.odds) !== '—' ? ` · ${fmtOdds(a.bookmaker, a.odds)}` : ''}`,
    odds: a => [a.bookmaker ?? null, a.odds ?? null], // déjà figé à la génération, pas de choix à faire
    buildAccepted: () => ({ acceptedAt: Date.now() }),
  },
  basketball_spread: {
    dateField: 'date',
    label: a => `📏 <b>${leagueLabel(a)} Écart H2H</b>\n${teamName(a, 'home')} vs ${teamName(a, 'away')}\n${teamName(a, a.direction)} ${a.line > 0 ? '+' : ''}${a.line} — <b>${a.probability}%</b>${fmtOdds(a.bookmaker, a.odds) !== '—' ? ` · ${fmtOdds(a.bookmaker, a.odds)}` : ''}`,
    odds: a => [a.bookmaker ?? null, a.odds ?? null],
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
    label: a => `⚽ <b>${leagueLabel(a)} BTTS</b>\n${a.fixture || `${teamName(a, 'home')} vs ${teamName(a, 'away')}`}\n✓ Les deux équipes marquent — <b>${a.probability}%</b>`,
    odds: a => bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds], ['winamax', a.winamaxOdds]]),
    buildAccepted: (a, bk, odds) => propsAccepted(a, bk, odds),
  },
  football_total: {
    dateField: 'fixtureDate',
    label: a => `⚽ <b>${leagueLabel(a)} Total</b>\n${teamName(a, 'home')} vs ${teamName(a, 'away')} — ${a.direction === 'over' ? '▲ Plus' : '▼ Moins'} de ${a.line} buts\nProbabilité : <b>${a.probability}%</b>`,
    odds: a => bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds], ['winamax', a.winamaxOdds]]),
    buildAccepted: (a, bk, odds) => propsAccepted(a, bk, odds),
  },
  football_result: {
    dateField: 'fixtureDate',
    label: a => {
      const who = a.direction === 'draw' ? 'Match nul' : `Victoire ${teamName(a, a.direction)}`;
      return `⚽ <b>${leagueLabel(a)} Résultat 1X2</b>\n${teamName(a, 'home')} vs ${teamName(a, 'away')}\n${who} — <b>${a.probability}%</b>`;
    },
    odds: a => bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds], ['winamax', a.winamaxOdds]]),
    buildAccepted: (a, bk, odds) => propsAccepted(a, bk, odds),
  },
  football_dc_btts: {
    dateField: 'fixtureDate',
    label: a => `⚽ <b>${leagueLabel(a)} Double Chance + BTTS</b>\n${teamName(a, 'home')} vs ${teamName(a, 'away')}\nProbabilité : <b>${a.probability}%</b>`,
    odds: a => bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds]]),
    buildAccepted: (a, bk, odds) => propsAccepted(a, bk, odds),
  },
  football_dc_ou: {
    dateField: 'fixtureDate',
    label: a => `⚽ <b>${leagueLabel(a)} Double Chance + Total</b>\n${teamName(a, 'home')} vs ${teamName(a, 'away')} — +${a.line ?? 1.5} buts\nProbabilité : <b>${a.probability}%</b>`,
    odds: a => bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds]]),
    buildAccepted: (a, bk, odds) => propsAccepted(a, bk, odds),
  },
  football_pinnacle_edge: {
    dateField: 'fixtureDate',
    label: a => `💎 <b>${leagueLabel(a)} Value vs Pinnacle</b>\n${teamName(a, 'home')} vs ${teamName(a, 'away')}\nEdge : <b>${a.edge != null ? Math.round(a.edge * 100) + '%' : '—'}</b>`,
    odds: a => bestOdds([['unibet', a.unibetOdds], ['betclic', a.betclicOdds]]),
    buildAccepted: (a, bk, odds) => ({ acceptedAt: Date.now(), acceptedBookmaker: bk, acceptedUnibetOdds: bk === 'unibet' ? odds : null, acceptedBetclicOdds: bk === 'betclic' ? odds : null }),
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
// puisse les découvrir par polling (GET /api/telegram/actions?since=). Perdu au redémarrage backend —
// sans conséquence : un redémarrage backend perd aussi les boutons actifs (les alertes seront de
// toute façon régénérées et re-notifiées au cycle suivant si toujours pending).
const _tokenMap = new Map(); // token -> { type, id, messageId }
const _actionLog = []; // { type, id, action, ts }
const ACTION_LOG_MAX = 500;

function makeToken() {
  return Math.random().toString(36).slice(2, 10);
}

function recordAction(type, id, action) {
  _actionLog.push({ type, id, action, ts: Date.now() });
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

// Envoie une notification pour une alerte fraîchement générée (jamais vue au cycle précédent),
// avec boutons Accepter/Rejeter. Ne fait rien si le type n'est pas dans le registre ou si Telegram
// n'est pas configuré (clé absente en local dev sans .env rempli, ou sur Render où on ne veut pas
// notifier — cf. TELEGRAM_BOT_TOKEN présent seulement en local pour l'instant).
async function notifyNewAlert(alert) {
  if (!telegramConfigured()) return;
  const meta = getAlertTypeMeta(alert.type);
  if (!meta) return;
  try {
    const text = meta.label(alert);
    const acceptToken = makeToken();
    const rejectToken = makeToken();
    const buttons = [
      { text: '✅ Accepter', callback_data: `A:${acceptToken}` },
      { text: '❌ Rejeter', callback_data: `R:${rejectToken}` },
    ];
    const messageId = await sendTelegramMessage(text, buttons);
    _tokenMap.set(acceptToken, { type: alert.type, id: alert.id, messageId });
    _tokenMap.set(rejectToken, { type: alert.type, id: alert.id, messageId });
  } catch (e) { console.error('notifyNewAlert error:', e.message); }
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
  return { action, ...entry };
}

export {
  telegramConfigured, sendTelegramMessage, editTelegramMessage, answerCallbackQuery,
  getAlertTypeMeta, bestOdds, notifyNewAlert, resolveCallbackToken, recordAction, getActionsSince,
  _debugTokensForId, checkTelegramWebhookHealth,
};
