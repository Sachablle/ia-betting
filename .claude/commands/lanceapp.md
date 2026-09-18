Lance les serveurs du projet ValueBet et donne le lien de l'app.

IMPORTANT : Le répertoire du projet contient un espace final dans son nom. Utilise TOUJOURS ces chemins exacts (avec l'espace final après "betting") :
- Frontend : ~/Desktop/"Claude projets"/"Projets betting "/
- Backend  : ~/Desktop/"Claude projets"/"Projets betting "/backend/

1. Lance les 87 tests automatiques du moteur de calcul (16 septembre 2026 — vérifie que le
   Poisson/Dixon-Coles foot et les probabilités props basket n'ont pas été cassés avant de servir
   des données dessus) :
   ```
   cd ~/Desktop/"Claude projets"/"Projets betting " && npm run test
   ```
   Rapide (~200ms), ne dépend pas des serveurs — ne bloque pas le démarrage, mais si un test est
   rouge, le signaler clairement à l'utilisateur avant de continuer (ne pas juste continuer comme
   si de rien n'était).

2. Démarre le backend en arrière-plan (run_in_background: true) :
   ```
   cd ~/Desktop/"Claude projets"/"Projets betting "/backend && npm run dev
   ```

3. Démarre le frontend en arrière-plan (run_in_background: true) :
   ```
   cd ~/Desktop/"Claude projets"/"Projets betting " && npm run dev
   ```

4. Attends 5 secondes, puis vérifie les ports utilisés dans les outputs des commandes.

5. Vérifie que le backend est up via `curl -s http://localhost:3001/api/health`

6. Si backend OK, déclenche immédiatement le chargement des cotes :
   ```
   curl -s -X POST http://localhost:3001/api/system/warmup
   ```

7. Lance le tunnel Cloudflare + notifications Telegram en arrière-plan (run_in_background: true) :
   ```
   cd ~/Desktop/"Claude projets"/"Projets betting "/backend && ./scripts/telegram-tunnel-watchdog.sh
   ```
   Ce script démarre le tunnel ET le surveille en continu (relance automatique + ré-enregistrement du webhook s'il tombe, vérifié toutes les 90s — les tunnels gratuits Cloudflare n'ont aucune garantie de disponibilité). Attends ~15 secondes puis lis la sortie de cette tâche pour récupérer la ligne "nouveau tunnel : https://...trycloudflare.com". Si le script échoue (pas de TELEGRAM_BOT_TOKEN, pas de connexion), continue quand même — ce n'est pas bloquant pour l'app elle-même, seulement pour les notifs Telegram.

8. Empêche le Mac de s'endormir par inactivité, capot ouvert (écran peut quand même s'éteindre tout seul, aucun impact) — sinon backend/tunnel/notifs Telegram s'arrêtent dès que le Mac se met en veille (run_in_background: true) :
   ```
   caffeinate -i
   ```
   Ne bloque rien d'autre, tourne indéfiniment tant que le Mac est allumé. Rappel à donner à l'utilisateur si pertinent : ça ne fonctionne QUE capot ouvert — capot fermé sur batterie, macOS force la veille profonde quoi qu'il arrive (branché sur secteur uniquement dans ce cas).

9. Affiche uniquement :
   - "Tests moteur de calcul : 87/87 ✅" ou le détail du/des test(s) en échec (étape 1)
   - Le lien de l'app (ex: http://localhost:5173 ou le port effectif si 5173 était pris)
   - "Backend OK — cotes en cours de chargement (~2 min)" ou "Backend KO"
   - "Notifications Telegram actives" ou "Notifications Telegram indisponibles" selon le résultat de l'étape 7
   - "Mac maintenu éveillé (capot ouvert requis)" pour rappeler la condition de l'étape 8
