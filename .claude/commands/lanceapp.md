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

3. Attends 4 secondes, puis vérifie les ports utilisés dans les outputs des commandes.

4. Affiche uniquement :
   - Le lien de l'app (ex: http://localhost:5173 ou le port effectif si 5173 était pris)
   - "Backend OK" ou "Backend KO" selon le health check `curl -s http://localhost:3001/api/health`
