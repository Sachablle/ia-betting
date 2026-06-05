Audit complet du système de scraping ValueBet — scrapers cotes + props + données live.

IMPORTANT : L'app doit être lancée (backend port 3001). Si pas démarré, utilise /lanceapp d'abord.

## Étapes

### 1. Health check backend
```bash
curl -s http://localhost:3001/api/health
```

### 2. Scoreboards live (tous les sports)
Teste NBA, WNBA, ACB, LNB, BBL, Lega A, EuroLeague — vérifie que les matchs sont à jour.

### 3. Cotes match (H2H + O/U + EarlyWin) — avec refresh=1
Pour chaque ligue, teste sur le prochain match disponible :
- `GET /api/basketball/odds?home=...&away=...&league=...&refresh=1`
- Vérifie : found=true, présence Unibet/Betclic/Winamax, H2H + O/U
- Football : `GET /api/odds?refresh=1`

### 4. Props joueurs — avec refresh=1
- NBA : `/api/basketball/player-props?league=nba&home=...&away=...&refresh=1`
- WNBA : même endpoint, league=wnba
- EU : lnb/legaa selon les matchs dispo
- Vérifie : betclicSource=grpc, winamaxSource=scraped, unibetSource=scraped

### 5. Rapport final
Présente un tableau markdown :

| Composant | Status | Détail |
|---|---|---|
| Backend | ✅/❌ | timestamp |
| Unibet scraper | ✅/❌ | H2H + O/U |
| Betclic scraper | ✅/❌ | H2H + O/U |
| Betclic gRPC | ✅/❌ | N props |
| Winamax scraper | ✅/❌ | H2H + O/U + props |
| NBA scoreboard | ✅/❌ | N matchs |
| WNBA scoreboard | ✅/❌ | N matchs |
| EU scoreboards | ✅/❌ | ACB/LNB/BBL/Lega A |
| EuroLeague | ✅/❌ | N matchs (0=normal si saison terminée) |
| Football | ✅/❌ | N matchs |

Signale les anomalies clairement : scraper cassé, marché absent, données stale, 0 joueurs inattendu.
Distingue les limitations normales (marché pas ouvert, bookmaker ne couvre pas la ligue) des vrais bugs.
