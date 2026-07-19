#!/bin/bash
# Surveille le tunnel Telegram et le relance tout seul s'il tombe (16 juillet 2026) — les "quick
# tunnels" Cloudflare gratuits n'ont aucune garantie de disponibilité et peuvent rester "en cours
# d'exécution" côté process local tout en étant devenus injoignables côté DNS/edge (cas réel constaté
# ce soir : process vivant, URL plus résolue du tout côté Telegram). Vérifie toutes les 90s et
# relance start-telegram-tunnel.sh (qui gère lui-même le ré-enregistrement du webhook) au besoin.
# Lancer avec run_in_background — tourne indéfiniment, ne rend jamais la main.
cd "$(dirname "$0")/.."
STATE_FILE=/tmp/telegram_tunnel_url.txt
CHECK_INTERVAL=90
TOKEN=$(grep "^TELEGRAM_BOT_TOKEN=" .env 2>/dev/null | sed 's/^TELEGRAM_BOT_TOKEN=//' | tr -d '\r\n"'"'"'')
SECRET=$(grep "^TELEGRAM_WEBHOOK_SECRET=" .env 2>/dev/null | sed 's/^TELEGRAM_WEBHOOK_SECRET=//' | tr -d '\r\n"'"'"'')

# Vérifie que le webhook Telegram pointe bien vers le tunnel actuel (18 juillet 2026) — le check de
# santé ci-dessous ne teste que la joignabilité du tunnel depuis CETTE machine, pas l'enregistrement
# du webhook côté Telegram. Or la propagation DNS peut dépasser les 15 min tentées par
# start-telegram-tunnel.sh — dans ce cas ce script abandonnait silencieusement et plus rien ne
# retentait jamais, laissant le webhook vide indéfiniment malgré un tunnel "sain". Cette vérification,
# répétée à chaque cycle, referme ce trou sans toucher à la logique de relance du tunnel existante.
check_webhook() {
  local url="$1"
  [ -z "$TOKEN" ] && return
  local current
  current=$(curl -s --max-time 8 "https://api.telegram.org/bot${TOKEN}/getWebhookInfo" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
  if [ "$current" != "${url}/api/telegram/webhook" ]; then
    echo "$(date '+%H:%M:%S') — webhook désynchronisé (Telegram: '${current:-vide}', attendu: '${url}/api/telegram/webhook') — ré-enregistrement..."
    local res
    res=$(curl -s --max-time 10 -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
      -d "url=${url}/api/telegram/webhook" \
      -d "secret_token=${SECRET}")
    echo "$(date '+%H:%M:%S') — résultat: $res"
  fi
}

start_tunnel() {
  echo "$(date '+%H:%M:%S') — (re)démarrage du tunnel..."
  # 18 juillet 2026 : tuer le watchdog parent (ex: pour appliquer un correctif de script) ne tue pas
  # ses enfants en arrière-plan (start-telegram-tunnel.sh + cloudflared) — ils continuaient de tourner
  # en orphelins et d'écrire dans CE MÊME fichier de log à chemin fixe qu'une nouvelle instance
  # relancée juste après, provoquant une corruption (octets NUL entrelacés) qui a fait passer un
  # message d'erreur pour une vraie URL de tunnel. Fix : un fichier de log unique par lancement
  # (mktemp) élimine toute possibilité de collision entre deux instances, orphelines ou non.
  pkill -f "cloudflared tunnel --url" 2>/dev/null
  pkill -f "scripts/start-telegram-tunnel.sh" 2>/dev/null
  sleep 2
  # Le mktemp BSD/macOS exige que les X soient les 6 derniers caractères du nom (pas de suffixe
  # après) — un template avec ".log" à la fin échoue silencieusement en boucle (constaté le 18
  # juillet 2026 : le tunnel n'a plus jamais pu redémarrer pendant des heures à cause de ça).
  local start_log
  start_log=$(mktemp /tmp/telegram_tunnel_start.XXXXXX)
  ./scripts/start-telegram-tunnel.sh > "$start_log" 2>&1 &
  for i in $(seq 1 30); do
    URL=$(grep -a -o 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' "$start_log" | grep -v '^https://api\.trycloudflare\.com$' | head -1)
    if [ -n "$URL" ]; then echo "$URL" > "$STATE_FILE"; echo "$(date '+%H:%M:%S') — nouveau tunnel : $URL"; return; fi
    sleep 2
  done
  echo "$(date '+%H:%M:%S') — échec démarrage tunnel, voir $start_log"
}

# Si un tunnel sain tourne déjà (ex: watchdog relancé après une réparation manuelle), ne pas le
# détruire pour rien — sinon chaque relance du watchdog fait repartir tout le cycle de propagation
# DNS (jusqu'à plusieurs minutes) alors que tout fonctionnait déjà.
EXISTING_URL=$(cat "$STATE_FILE" 2>/dev/null)
if [ -n "$EXISTING_URL" ] && curl -sf --max-time 8 "$EXISTING_URL/api/health" > /dev/null 2>&1; then
  echo "$(date '+%H:%M:%S') — tunnel existant sain ($EXISTING_URL), pas de relance"
  check_webhook "$EXISTING_URL"
else
  start_tunnel
fi

while true; do
  sleep "$CHECK_INTERVAL"
  URL=$(cat "$STATE_FILE" 2>/dev/null)
  if [ -z "$URL" ] || ! curl -sf --max-time 8 "$URL/api/health" > /dev/null 2>&1; then
    echo "$(date '+%H:%M:%S') — tunnel injoignable, relance..."
    start_tunnel
  else
    check_webhook "$URL"
  fi
done
