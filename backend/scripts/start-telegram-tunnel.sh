#!/bin/bash
# Lance le tunnel Cloudflare vers le backend local (port 3001) et enregistre automatiquement
# la nouvelle URL comme webhook Telegram — l'URL d'un "quick tunnel" trycloudflare.com change à
# chaque lancement, donc ce script évite de devoir refaire le setWebhook à la main à chaque fois
# (16 juillet 2026).
set -e
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "backend/.env introuvable — lance ce script depuis le dossier backend/ ou vérifie le chemin."
  exit 1
fi

TOKEN=$(grep TELEGRAM_BOT_TOKEN .env | cut -d= -f2)
SECRET=$(grep TELEGRAM_WEBHOOK_SECRET .env | cut -d= -f2)

if [ -z "$TOKEN" ] || [ -z "$SECRET" ]; then
  echo "TELEGRAM_BOT_TOKEN ou TELEGRAM_WEBHOOK_SECRET manquant dans backend/.env"
  exit 1
fi

echo "Démarrage du tunnel Cloudflare..."
LOG_FILE=$(mktemp)
./bin/cloudflared tunnel --url http://localhost:3001 > "$LOG_FILE" 2>&1 &
TUNNEL_PID=$!

# Attend que l'URL apparaisse dans les logs (jusqu'à ~20s)
URL=""
for i in $(seq 1 20); do
  URL=$(grep -o 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' "$LOG_FILE" | head -1)
  if [ -n "$URL" ]; then break; fi
  sleep 1
done

if [ -z "$URL" ]; then
  echo "Impossible de récupérer l'URL du tunnel — voir $LOG_FILE"
  kill "$TUNNEL_PID" 2>/dev/null
  exit 1
fi

echo "Tunnel actif : $URL"
echo "Enregistrement du webhook Telegram..."
curl -s -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  -d "url=${URL}/api/telegram/webhook" \
  -d "secret_token=${SECRET}"
echo ""
echo "OK — le tunnel tourne en arrière-plan (PID $TUNNEL_PID). Laisse ce terminal ouvert."
echo "Logs du tunnel : $LOG_FILE"
wait "$TUNNEL_PID"
