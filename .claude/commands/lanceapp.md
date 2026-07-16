Lance les serveurs du projet ValueBet et donne le lien de l'app.

IMPORTANT : Le répertoire du projet contient un espace final dans son nom. Utilise TOUJOURS ces chemins exacts (avec l'espace final après "betting") :
- Frontend : ~/Desktop/"Claude projets"/"Projets betting "/
- Backend  : ~/Desktop/"Claude projets"/"Projets betting "/backend/

1. Démarre le backend en arrière-plan (run_in_background: true) :
   ```
   cd ~/Desktop/"Claude projets"/"Projets betting "/backend && npm run dev
   ```

2. Démarre le frontend en arrière-plan (run_in_background: true) :
   ```
   cd ~/Desktop/"Claude projets"/"Projets betting " && npm run dev
   ```

3. Attends 5 secondes, puis vérifie les ports utilisés dans les outputs des commandes.

4. Vérifie que le backend est up via `curl -s http://localhost:3001/api/health`

5. Si backend OK, déclenche immédiatement le chargement des cotes :
   ```
   curl -s -X POST http://localhost:3001/api/system/warmup
   ```

6. Lance le tunnel Cloudflare + notifications Telegram en arrière-plan (run_in_background: true) :
   ```
   cd ~/Desktop/"Claude projets"/"Projets betting "/backend && ./scripts/telegram-tunnel-watchdog.sh
   ```
   Ce script démarre le tunnel ET le surveille en continu (relance automatique + ré-enregistrement du webhook s'il tombe, vérifié toutes les 90s — les tunnels gratuits Cloudflare n'ont aucune garantie de disponibilité). Attends ~15 secondes puis lis la sortie de cette tâche pour récupérer la ligne "nouveau tunnel : https://...trycloudflare.com". Si le script échoue (pas de TELEGRAM_BOT_TOKEN, pas de connexion), continue quand même — ce n'est pas bloquant pour l'app elle-même, seulement pour les notifs Telegram.

7. Affiche uniquement :
   - Le lien de l'app (ex: http://localhost:5173 ou le port effectif si 5173 était pris)
   - "Backend OK — cotes en cours de chargement (~2 min)" ou "Backend KO"
   - "Notifications Telegram actives" ou "Notifications Telegram indisponibles" selon le résultat de l'étape 6
