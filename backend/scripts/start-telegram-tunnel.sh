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
# 18 juillet 2026 : "api.trycloudflare.com" est le domaine de contrôle de Cloudflare, pas une URL de
# tunnel — il apparaît aussi dans les lignes d'ERREUR quand la création du tunnel échoue (ex: panne
# réseau/DNS passagère : "failed to request quick Tunnel: Post https://api.trycloudflare.com/tunnel:
# dial tcp: lookup api.trycloudflare.com: no such host"). L'ancien regex matchait cette ligne d'erreur
# et enregistrait un faux "succès" avec un webhook pointant vers nulle part. On exclut ce domaine
# explicitement et on ignore les lignes contenant "fail"/"error".
URL=""
for i in $(seq 1 20); do
  URL=$(grep -vi "fail\|error" "$LOG_FILE" | grep -o 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' | grep -v '^https://api\.trycloudflare\.com$' | head -1)
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
# Le nom de domaine trycloudflare.com d'un tunnel fraîchement créé peut mettre plusieurs minutes à
# se propager sur les résolveurs DNS que Telegram utilise (constaté le 16 juillet 2026 sur 4 tunnels
# de suite : ~10s, ~10s, ~2min, puis ~7-8min pour le dernier — très variable, pas juste une histoire
# de secondes). Budget large (15 min) car ça tourne en tâche de fond sans bloquer le reste de l'app.
SET_OK=0
for i in $(seq 1 60); do
  # || true — un simple timeout réseau passager ne doit pas faire planter tout le script (set -e),
  # sinon la tentative s'arrête après le premier hoquet au lieu d'utiliser le budget de 15 min complet.
  RES=$(curl -s --max-time 10 -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
    -d "url=${URL}/api/telegram/webhook" \
    -d "secret_token=${SECRET}" || true)
  echo "$RES"
  if echo "$RES" | grep -q '"ok":true'; then SET_OK=1; break; fi
  echo "(pas encore propagé, nouvelle tentative dans 15s...)"
  sleep 15
done
if [ "$SET_OK" -ne 1 ]; then
  echo "ÉCHEC — le webhook n'a pas pu être enregistré après 15 min. Le tunnel tourne quand même, réessaie l'enregistrement manuellement plus tard si besoin."
fi
echo ""
echo "OK — le tunnel tourne en arrière-plan (PID $TUNNEL_PID). Laisse ce terminal ouvert."
echo "Logs du tunnel : $LOG_FILE"
wait "$TUNNEL_PID"
