Audit complet de la section Basketball de l'app ValueBet — scoreboards, cotes, props, données live, anomalies.

IMPORTANT : L'app doit être lancée (backend port 3001). Si pas démarré, utilise /lanceapp d'abord.

## Étapes

### 1. Scoreboards live — tous les championnats basket
Appelle en parallèle :
- `GET /api/nba/scoreboard` → nombre de matchs, statuts
- `GET /api/wnba/scoreboard` → idem
- `GET /api/euroleague/scoreboard` → idem (0 = normal si saison terminée)
- `GET /api/euro/acb/scoreboard`, `lnb`, `bbl`, `legaa` → matchs + scores

### 2. Cotes match (H2H + O/U) — avec refresh=1
Pour chaque ligue, teste sur le prochain match schedulé :
- NBA : SAS vs NYK (ou le match en cours)
- WNBA : premier match schedulé
- ACB, LNB, BBL, Lega A : premier match schedulé de chaque ligue
- `GET /api/basketball/odds?home=...&away=...&league=...&refresh=1`
- Vérifie : found=true, quels bookmakers (unibet/betclic/winamax), H2H + O/U présents

### 3. Props joueurs — avec refresh=1
- NBA : `/api/basketball/player-props?league=nba&home=...&away=...&refresh=1`
- WNBA : même endpoint, league=wnba
- LNB : league=lnb sur le match dispo
- Vérifie : nombre de joueurs, sources (betclicSource, winamaxSource, unibetSource)

### 4. Rapport final
Présente deux sections :

**Scoreboards**
| Ligue | Matchs | Status |
|---|---|---|
| NBA | N matchs | ✅/⚠️ |
| WNBA | N matchs | ... |
| EuroLeague | N matchs | ... |
| ACB | N matchs | ... |
| LNB | N matchs | ... |
| BBL | N matchs | ... |
| Lega A | N matchs | ... |

**Cotes & Props**
| Ligue | Match testé | Unibet | Betclic | Winamax | Props |
|---|---|---|---|---|---|
| NBA | SAS vs NYK | H2H+O/U ✅ | H2H+O/U ✅ | H2H+O/U ✅ | 16 joueurs ✅ |
| WNBA | ... | ... | ... | ... | ... |
| ACB | ... | ... | ... | ... | — |
| LNB | ... | ... | ... | ... | 8 joueurs ✅ |
| BBL | ... | ... | ... | ... | — |
| Lega A | ... | ... | ... | ... | — |

**Anomalies** (si applicable)
Liste tout ce qui est cassé, absent de façon inattendue, ou suspect.
Distingue clairement : bug vs limitation bookmaker (pas de marché pour cette ligue) vs données pas encore publiées (J-2 avant match).

Conclure par : "Tout est opérationnel." ou lister ce qui nécessite une action.
