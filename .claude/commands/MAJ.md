Review rapide de l'app ValueBet — vérifie que tout est à jour sur les prochaines 24h.

1. **Date du jour** : note la date/heure actuelle (UTC).

2. **NBA — matchs à venir (ESPN live)** :
   Appelle `curl -s http://localhost:3001/api/nba/scoreboard` et liste les matchs STATUS_SCHEDULED dans les 24h avec leurs dates, équipes, et venue.

3. **Fixtures statiques** (basketball.js) :
   Lis `src/utils/basketball.js` et compare chaque fixture NBA avec le scoreboard ESPN :
   - Date correcte ?
   - Équipes correctes ?
   - Round/label à jour ?
   Signale toute divergence et propose la correction.

4. **Euroleague** :
   Vérifie que les fixtures Euroleague dans `basketball.js` ont des dates cohérentes avec aujourd'hui (rien d'expiré sans être marqué Terminé, rien de futur mal daté).

5. **Cotes** :
   Appelle `curl -s "http://localhost:3001/api/basketball/odds?home=Oklahoma+City+Thunder&away=San+Antonio+Spurs&league=nba"` (ou le prochain match dans les 24h).
   - Les cotes Pinnacle sont-elles disponibles ?
   - L'eventId est-il présent ?

6. **Résumé** : tableau markdown avec une ligne par match à venir — Statut / Date ET / Équipes / Anomalie éventuelle.

Sois concis. Signale uniquement ce qui est faux ou manquant, pas ce qui est OK.
