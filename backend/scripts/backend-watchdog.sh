#!/bin/bash
# Surveille le backend et le relance tout seul s'il devient injoignable OU si son propre
# watchdog réseau interne reste bloqué en panne (18 juillet 2026) — incident réel : après un
# réveil du Mac, le process restait "up" mais son vérificateur DNS interne (_networkWatchdog,
# server.js) restait planté en échec pendant 20+ min sans jamais se rétablir tout seul
# (node --watch ne redémarre PAS après ce type de panne, seulement sur modif de fichier — il
# fallait un redémarrage manuel). Ce script fait ce redémarrage à notre place.
# Cible le process par sa commande exacte (jamais par port) — un `kill` par port attrape aussi
# les connexions CLIENTES sur ce port (ex: le proxy Vite du frontend), qui n'ont rien à voir
# avec le backend et se retrouvaient tuées par erreur (incident du 18 juillet 2026 au matin).
# Lancer avec run_in_background — tourne indéfiniment, ne rend jamais la main.
cd "$(dirname "$0")/.."
LOG_FILE=/tmp/backend_watchdog.log
CHECK_INTERVAL=90
FAIL_STREAK_LIMIT=3
HEALTH_URL="http://localhost:3001/api/health"

log() { echo "$(date '+%H:%M:%S') — $1" | tee -a "$LOG_FILE"; }

restart_backend() {
  log "(re)démarrage du backend..."
  # Cible le process par sa commande (node --watch server.js dans backend/), pas par port —
  # évite de tuer une connexion cliente non liée (ex: proxy Vite).
  pkill -f "node --watch server.js" 2>/dev/null
  sleep 2
  (cd "$(dirname "$0")/.." && npm run dev > /tmp/backend_last_start.log 2>&1 &)
  sleep 5
  if curl -sf --max-time 8 "$HEALTH_URL" > /dev/null 2>&1; then
    log "backend relancé avec succès"
  else
    log "backend relancé mais ne répond pas encore (peut prendre quelques secondes de plus)"
  fi
}

log "watchdog backend démarré"

while true; do
  sleep "$CHECK_INTERVAL"
  RESPONSE=$(curl -sf --max-time 8 "$HEALTH_URL" 2>/dev/null)
  if [ -z "$RESPONSE" ]; then
    log "backend injoignable, relance..."
    restart_backend
    continue
  fi
  FAIL_STREAK=$(echo "$RESPONSE" | grep -o '"netFailStreak":[0-9]*' | grep -o '[0-9]*$')
  if [ -n "$FAIL_STREAK" ] && [ "$FAIL_STREAK" -ge "$FAIL_STREAK_LIMIT" ]; then
    log "réseau backend bloqué depuis $FAIL_STREAK échecs (~$((FAIL_STREAK * 2))min), relance..."
    restart_backend
  fi
done
