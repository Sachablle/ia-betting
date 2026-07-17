#!/bin/bash
# Surveille le tunnel Telegram et le relance tout seul s'il tombe (16 juillet 2026) — les "quick
# tunnels" Cloudflare gratuits n'ont aucune garantie de disponibilité et peuvent rester "en cours
# d'exécution" côté process local tout en étant devenus injoignables côté DNS/edge (cas réel constaté
# ce soir : process vivant, URL plus résolue du tout côté Telegram). Vérifie toutes les 90s et
# relance start-telegram-tunnel.sh (qui gère lui-même le ré-enregistrement du webhook) au besoin.
# Lancer avec run_in_background — tourne indéfiniment, ne rend jamais la main.
cd "$(dirname "$0")/.."
STATE_FILE=/tmp/telegram_tunnel_url.txt
START_LOG=/tmp/telegram_tunnel_last_start.log
CHECK_INTERVAL=90

start_tunnel() {
  echo "$(date '+%H:%M:%S') — (re)démarrage du tunnel..."
  pkill -f "cloudflared tunnel --url" 2>/dev/null
  sleep 2
  ./scripts/start-telegram-tunnel.sh > "$START_LOG" 2>&1 &
  for i in $(seq 1 30); do
    URL=$(grep -o 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' "$START_LOG" | head -1)
    if [ -n "$URL" ]; then echo "$URL" > "$STATE_FILE"; echo "$(date '+%H:%M:%S') — nouveau tunnel : $URL"; return; fi
    sleep 2
  done
  echo "$(date '+%H:%M:%S') — échec démarrage tunnel, voir $START_LOG"
}

# Si un tunnel sain tourne déjà (ex: watchdog relancé après une réparation manuelle), ne pas le
# détruire pour rien — sinon chaque relance du watchdog fait repartir tout le cycle de propagation
# DNS (jusqu'à plusieurs minutes) alors que tout fonctionnait déjà.
EXISTING_URL=$(cat "$STATE_FILE" 2>/dev/null)
if [ -n "$EXISTING_URL" ] && curl -sf --max-time 8 "$EXISTING_URL/api/health" > /dev/null 2>&1; then
  echo "$(date '+%H:%M:%S') — tunnel existant sain ($EXISTING_URL), pas de relance"
else
  start_tunnel
fi

while true; do
  sleep "$CHECK_INTERVAL"
  URL=$(cat "$STATE_FILE" 2>/dev/null)
  if [ -z "$URL" ] || ! curl -sf --max-time 8 "$URL/api/health" > /dev/null 2>&1; then
    echo "$(date '+%H:%M:%S') — tunnel injoignable, relance..."
    start_tunnel
  fi
done
