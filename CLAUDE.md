# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**ValueBet** — a sports betting analytics dashboard. Shows upcoming football and basketball fixtures with team stats, and highlights value bets by comparing bookmaker odds against Pinnacle's sharp lines.

## Running the app

Two processes must run concurrently:

```bash
# Frontend (React + Vite, port 5173)
npm run dev

# Backend (Express, port 3001) — in a separate terminal
cd backend && npm run dev
```

Build for production:
```bash
npm run build   # outputs to dist/
```

---

## Architecture

### Frontend (`src/`)
React 18 SPA built with Vite. Vite proxies all `/api` requests to `http://localhost:3001`.

**Routing** (`App.jsx`): Sidebar + `<Routes>` for `/football`, `/football/:id`, `/basketball`, `/basketball/:id`.

**Data sources — two parallel tracks:**
1. **Static fixture data** (`src/utils/fixtures.js`, `src/utils/basketball.js`): hardcoded match data used by the current UI pages. This is what the pages actually render.
2. **Live API utilities** (`src/utils/api.js`): fetch functions for the backend APIs. Exist but not yet wired into the main pages.

**Key components:**
- `OddsTable.jsx` — renders h2h and BTTS odds per bookmaker, highlights best odds and value edges vs Pinnacle
- `StatBar.jsx` — side-by-side comparative stat bar for match detail pages
- `FormStrip.jsx` — W/D/L recent form badges
- `TeamLogo.jsx` — loads logos from API-Sports CDN: `https://media.api-sports.io/football/teams/{logoId}.png`

All dates/numbers are formatted in French locale (`fr-FR`) via `src/utils/formatters.js`.

### Backend (`backend/server.js`)
Single Express file. All external API calls happen here; the frontend never calls third-party APIs directly.

**Routes:**
- `GET /api/health`
- `GET /api/fd/matches` — football-data.org: next 5 fixtures + standings for 5 leagues. 30-min cache. 200ms delay between league requests (10 req/min limit).
- `GET /api/football/matches` — API-Football: next 5 fixtures + standings. 30-min cache.
- `GET /api/football/h2h/:homeId/:awayId` — last 5 h2h results from API-Football.
- `GET /api/odds` — The Odds API: h2h + btts markets, bookmakers: `pinnacle, betfair_ex_eu, unibet_eu, betclic`.
- `GET /api/alerts` — value bet alerts: edges above `VALUE_THRESHOLD` (default 2%).
- `GET /api/nba/scoreboard` — ESPN live NBA scoreboard. Polled every 30s if live game active, 5min otherwise.
- `GET /api/nba/players/:teamId` — ESPN roster for a team. Cache 6h.
- `GET /api/nba/teamschedule/:teamId` — ESPN team schedule (recent + upcoming games). Cache 6h.
- `GET /api/nba/playergamelog/:playerId` — ESPN player game log (last ~15 games). Cache 6h.
- `GET /api/nba/boxscore?date=ISO&home=ABR&away=ABR` — ESPN box score for a completed game. Cache 5min (to pick up NBA post-game stat corrections). Date converted UTC→ET. Response keys use standard abbreviations (SAS, NYK…).

**Value bet calculation:**
```
fair_prob = (1/pinnacle_odds) / overround   // overround = sum of 1/odds for all outcomes
edge = bookmaker_odds * fair_prob - 1
```

**Football BTTS / Over-Under alerts (`backend/computeFootball.js` + `generateBackgroundAlerts()` section 4d):**
Poisson model, generated every 20min alongside NBA/EU basket alerts — no need to visit `MatchDetailPage` for an alert to be created.
- `computeLambdas({homeGF, homeGA, homePlayed, awayGF, awayGA, awayPlayed, leagueAvgGoals, avgGF, avgGA, homeAdv=1.10})` — attack/defense factors normalized by `avgGF`/`avgGA` (falling back to `leagueAvgGoals` if omitted), λ rescaled by `leagueAvgGoals` × home advantage. Returns `null` if sample too small.
- `computeBTTSProb(λh, λa) = (1-P(home=0)) * (1-P(away=0))`
- `computeOUProb(λh, λa, line)` — `pUnder = Σ Poisson(λh+λa, k)` for `k=0..floor(line)`, `pOver = 1-pUnder`
- `compute1X2Probs(λh, λa, kMax=10)` — independent Poisson grid over `i,j ∈ [0,kMax]`, sums `P(i)·P(j)` by `i>j` (home win), `i===j` (draw), `i<j` (away win) → `{pHome, pDraw, pAway}`
- Fixtures source: `_fdCache.matches` (5 leagues, `fixtureId = fd_${id}`, `leagueAvgGoals = FB_LEAGUE_AVG_GOALS[league]` — `{ligue1:1.35, pl:1.45, laliga:1.35, bundes:1.55, seriea:1.35}`, `avgGF`/`avgGA` omitted — closed league, GF≈GA on average, single constant is fine) + `_cdmCache.games` `STATUS_SCHEDULED` (`fixtureId = fdcdm_${id}`, `leagueAvgGoals = CDM_AVG_GOALS = 1.30`, `avgGF`/`avgGA` computed **dynamically** as the average `goalsFor`/`goalsAgainst` across all teams in the current CDM fixture pool — `CDM_AVG_GF=2.15`/`CDM_AVG_GA=0.78` are fallback-only if no stats available, requires `games >= 3` both teams via `/api/football/cdm/teamstats/:name`).
  - **Important**: `/api/football/cdm/teamstats/:name` returns `goalsFor`/`goalsAgainst` as already-weighted **per-match averages** (not totals). `computeLambdas` expects totals (it divides by `played`), so the CDM fixture builder multiplies back by `games`: `homeGF: hs.goalsFor * hs.games, homePlayed: hs.games`. Don't pass the raw averages directly — λ collapses to ~0 and every match falsely alerts "Under" at 100%.
  - **CDM attack/defense asymmetry**: qualified WC teams' recent friendlies/qualifiers are mostly against weaker opponents, so average GF is far above average GA across the squad pool. Normalizing both attack and defense by the same `CDM_AVG_GOALS=1.30` crushed every λ below 1.7 → 100% "Under" regardless of matchup. Fix: `avgGF`/`avgGA` normalize attack/defense separately, `CDM_AVG_GOALS` only rescales the final λ (home/away split + home advantage). The 5 leagues are unaffected (no `avgGF`/`avgGA` passed → same behavior as before).
  - **Dynamic avgGF/avgGA**: computed each `generateBackgroundAlerts()` run as the mean `goalsFor`/`goalsAgainst` over every team (`games >= 3`) appearing in the scheduled CDM fixtures — self-recalibrates as the team pool changes (knockout stage, new qualifiers) instead of relying on a stale hardcoded sample. A fixed `avgGA=0.65` (sample of ~13 teams) was initially used but proved too low once weaker teams (Haiti, Curaçao, NZ, Scotland — GA ~1.0-1.4) were included, inflating defense factors and producing unrealistic BTTS alerts (e.g. Germany vs Curaçao 75%). The dynamic average (~0.83 on the current pool) removed those overconfident BTTS calls entirely.
  - **Fix 18 juin 2026 — matchs CDM réels manquants des stats équipe**: `/api/football/cdm/teamstats/:name` ne récupérait que `fifa.friendly` + `fifa.worldq.{conf}` (amicaux + qualifs), jamais `fifa.world` (le calendrier de la Coupe du Monde elle-même). Une fois le tournoi commencé, les matchs de poule déjà joués (J1, J2…) étaient donc invisibles du modèle, qui continuait de tourner sur des amicaux/qualifs d'avant-tournoi (ex: Canada vs Qatar J2 calculé sans voir Canada 1-1 Bosnie ni Qatar 1-1 Suisse, leurs vrais matchs de poule précédents). Fix : ajout de `fetchEspnSoccerSchedule('fifa.world', espnId)`, résultats tagués `type: 'worldcup'`, poids `1.5` (au-dessus des qualifs `1.3` et amicaux `0.85`) — un match de poule réel est la donnée la plus représentative une fois le tournoi lancé (effectif et forme actuels, niveau d'adversité CDM).
  - **Note — alias nom manquant**: `ESPN_CDM` utilise `turkiye` (nom FIFA) mais la source `_cdmCache` (football-data.org) renvoie `Turkey` → 404 sur `/api/football/cdm/teamstats/Turkey`, cette équipe est donc exclue de la moyenne du pool et n'a pas d'alertes générées. Pas encore corrigé (ajouter `turkey: 'turkiye'` à `CDM_NAME_ALIASES` si besoin).
- Alert thresholds: `FB_BTTS_ALERT_PROB = 0.68`, `FB_OU_ALERT_PROB = 0.65`, `FB_RESULT_ALERT_PROB = 0.65`, `FB_MIN_ODDS = 1.45` (best of unibet/betclic/winamax on the proposed direction). O/U tries line `2.5` then falls back to `1.5`, one alert per fixture.
- Output: `type: 'football_btts'` (`id: ${fixtureId}_btts_yes`, same id scheme as the client-generated `fb_btts_alerts` → natural dedup), `type: 'football_total'` (`id: ${fixtureId}_total_${line}`, includes `estimated` = `λhome+λaway` expected total goals), and `type: 'football_result'` (`id: ${fixtureId}_result_${direction}`, `direction ∈ {home,draw,away}`, includes `probability` and optional `edge` vs vig-removed h2h odds).
- **Football Résultat 1X2 (15 juin 2026)**: each outcome (home/draw/away) is treated as an *independent binary yes/no proposition* (same framing as BTTS), not a 3-way mutually-exclusive pick — since `2 × FB_RESULT_ALERT_PROB > 1`, at most one outcome can qualify per fixture, so still "one alert per fixture". h2h odds come from the same scraping merge as BTTS/O-U (`_mergeFootballBookmaker` → `oddsMatch.markets.h2h.bookmakers[bk] = {home, draw, away}`), `FB_BOOKS = ['unibet','betclic','winamax']` (winamax_foot permanently blocked since 11 juin, `?.[key] ?? 0` handles its absence gracefully). Edge computed via `removeVig(pair, 'h2h')` when all 3 odds present from the chosen bookmaker.
- Frontend sync: `syncFootballAlerts()` (`src/utils/syncAlerts.js`) merges into `fb_btts_alerts` / `fb_total_alerts` / `fb_result_alerts` localStorage keys, preserving accepted/rejected. `BTTSAlertCard`/`FootballTotalCard`/`FootballResultCard` (shared in `src/components/FootballAlertCards.jsx`, with `FB_LEAGUE_META`) render `pending` cards in `PlaceBetPage.jsx`.
- **Accepted → Running (compact format, like basketball)**: once accepted, the alert disappears from `PlaceBetPage` and `RunningPage.jsx`'s `footballAlertToGroup()` converts it into the same "group" shape as basketball props/totals (`stat: 'btts'|'total'|'result'`, `direction: 'yes'|'over'/'under'|'home'/'draw'/'away'`, `eventId: fixtureId`), fed into the shared `groupByMatch()` → rendered as a compact `MatchGroup` box (logo, league badge `CDM`/`L1`/`PL`/`Liga`/`BL`/`SA` via `FB_LEAGUE_LABEL`, team names, kickoff time, alert count) — no more dedicated "⚽ Football · Acceptés" card section. `AlertCard.goToMatch` navigates to `/football/${fixtureId}`. Live scores for CDM groups come from `/api/fd/worldcup` (matched by `String(g.id) === fixtureId.replace('fdcdm_','')`, crest `logo` URLs used directly by `TeamLogo`); the 5 European leagues have no live-score source yet so they stay in the "scheduled" bucket with initials only. `onDismiss` removes the alert from its localStorage key (`fb_btts_alerts`/`fb_total_alerts`/`fb_result_alerts`).
- **Settlement**: only CDM (`fixtureId` starting `fdcdm_`) can be resolved today, via `/api/fd/worldcup` (`STATUS_FINAL` + `home.score`/`away.score`) — `resolveCompletedFootballAlerts()` (`src/utils/syncAlerts.js`, shared by `PlaceBetPage` and `RunningPage`). The 5 European leagues have no finished-match endpoint yet (gap, to address when the leagues resume ~August). `football_result` can only resolve at `STATUS_FINAL` (the 1X2 outcome can flip until the final whistle), unlike BTTS/O-U which can be "already won" live.

**ESPN abbreviation normalization (backend):**
ESPN uses short forms (`SA`, `NY`, `GS`, `NO`, `UT`) instead of standard NBA abbreviations. The backend normalizes bidirectionally:
```js
const ESPN_ABBR_MAP = { SAS:'SA', NYK:'NY', GSW:'GS', NOP:'NO', UTA:'UT' };
// Response keys are converted back: SA→SAS, NY→NYK, etc.
```

---

## Basketball — BasketballPage.jsx

The NBA list comes from the **live ESPN scoreboard** (`/api/nba/scoreboard`), not static fixtures.

**Display rules:**
- Matchs triés par date **croissante** (plus ancien → plus récent)
- Matchs terminés affichés **48h max** après leur date, puis filtrés automatiquement
- Euroleague : fixtures statiques depuis `basketball.js`, mêmes règles de tri et rétention

---

## Basketball — BasketballDetailPage.jsx

### ESPN_NBA map (name → ESPN teamId)
Used to fetch rosters via `/api/nba/players/:teamId`. The `/roster` endpoint uses different IDs than `/teams` — always use these verified IDs:

```js
const ESPN_NBA = {
  'Atlanta Hawks': 1,        'Boston Celtics': 2,       'New Orleans Pelicans': 3,
  'Chicago Bulls': 4,        'Cleveland Cavaliers': 5,  'Dallas Mavericks': 6,
  'Denver Nuggets': 7,       'Detroit Pistons': 8,      'Golden State Warriors': 9,
  'Houston Rockets': 10,     'Indiana Pacers': 11,      'LA Clippers': 12,
  'Los Angeles Lakers': 13,  'Miami Heat': 14,          'Milwaukee Bucks': 15,
  'Minnesota Timberwolves': 16, 'Brooklyn Nets': 17,
  'New York Knicks': 18,     'Orlando Magic': 19,       'Philadelphia 76ers': 20,
  'Phoenix Suns': 21,        'Portland Trail Blazers': 22, 'Sacramento Kings': 23,
  'San Antonio Spurs': 24,   'Oklahoma City Thunder': 25,  'Utah Jazz': 26,
  'Washington Wizards': 27,  'Toronto Raptors': 28,     'Memphis Grizzlies': 29,
  'Charlotte Hornets': 30,
};
```

### ESPN abbreviation normalization (frontend)
ESPN's live scoreboard returns short abbreviations (`SA`, `NY`, `GS`…). When looking up boxscore keys, always normalize:
```js
const ESPN_SHORT = { SA: 'SAS', NY: 'NYK', GS: 'GSW', NO: 'NOP', UT: 'UTA' };
const normalizeAbbr = a => ESPN_SHORT[a?.toUpperCase()] || a?.toUpperCase() || '';
```
This is critical for matching the `team.short` from a live fixture against the boxscore response keys.

### isCompleted detection
```js
const isCompleted = fixture.round?.includes('Terminé') || new Date(fixture.date) < new Date();
```
Note: `'Terminée'.includes('Terminé')` = true — both forms work.

### Section "Analyse Props" — PropsSection
Single unified component (no longer split into two). Opens when the user clicks the bar-chart icon in the info bar. **Cliquer sur le titre "Analyse Props" ferme la section.**

**Layout:** grid à 9 colonnes — `26px 1fr 36px 36px 36px 8px 36px 36px 36px`
- Colonne 1–5 : Position | Nom | **Projeté** Pts / Rebs / Asst
- Colonne 6 : séparateur vertical
- Colonne 7–9 : **Réalisé** Pts / Rebs / Asst (vert si `isCompleted`, `—` sinon)

**Toggle équipe** : boutons `home.short` / `away.short` en haut à droite — switchent les deux colonnes ensemble.

**Roster** : joueurs triés par pts saison décroissant, séparateur `—— Remplaçants ——` entre les 5 premiers (titulaires) et le reste.

**Matching joueur** (projected ↔ realized) :
```js
realized.find(r =>
  String(r.id) === String(p.id) ||        // ESPN athlete ID (string comparison)
  r.name === p.name ||                     // nom exact
  lastName(r.name) === lastName(p.name)   // nom de famille en fallback
)
```

**Box score fetch** : déclenché au mount de PropsSection si `isCompleted`. Cache 5min côté backend.

---

## Basketball — basketball.js

### NBA Playoffs 2026 — état au 22 mai 2026

| ID | Match | Statut |
|---|---|---|
| b001 | OKC (1W, 64-18) vs SAS (2W, 62-20) | Finales Conf. Ouest – **Terminée G1** (SAS 122-115, SAS 1-0) |
| b011 | OKC vs SAS | Finales Conf. Ouest – **Terminée G2** (OKC 122-113, Série 1-1) |
| b012 | SAS (home) vs OKC | Finales Conf. Ouest – **Terminée G3** (OKC 123-108, OKC 2-1) |
| b002 | DET (1E, 60-22) vs CLE (4E, 52-30) | Demi-Finales Conf. Est – **Terminée** CLE 4-3 (G7 le 18 mai, CLE 125-94) |
| b003 | PHI (2E, 55-27) vs NYK (3E, 53-29) | Demi-Finales Conf. Est – **Terminée** NYK 4-0 |
| b004 | MIN (6W, 49-33) vs SAS (2W, 62-20) | Demi-Finales Conf. Ouest – **Terminée** SAS 4-2 (G6 le 15 mai, SAS 139-109) |
| b005 | LAL (4W, 53-29) vs OKC (1W, 64-18) | Demi-Finales Conf. Ouest – **Terminée** OKC 4-0 |
| b008 | OLY (home) vs FEN | Euroleague – **Terminée Demi A** (OLY 79-61, EL game 404, Athènes) |
| b009 | VBC (home) vs RMB | Euroleague – **Terminée Demi B** (RMB 105-90, EL game 405, Athènes) |
| b010 | NYK vs CLE | Finales Conf. Est – **Terminée G1** (NYK 115-104 OT, NYK 1-0) |
| b013 | NYK vs CLE | Finales Conf. Est – **Terminée G2** (NYK 109-93, NYK 2-0) |
| b014 | CLE (home) vs NYK | Finales Conf. Est – **Terminée G3** (NYK 121-108, NYK 3-0) |
| b015 | SAS (home) vs OKC | Finales Conf. Ouest – **Terminée G4** (SAS 103-82, Série 2-2) |
| b016 | — | Euroleague – **3e place non jouée** (l'EL n'organise pas de match pour la 3e place) |
| b017 | OLY (home) vs RMB | Euroleague – **Terminée Finale** (OLY 92–85 RMB, **OLY Champion**, EL game 406, Athènes) |
| b018 | CLE (home) vs NYK | Finales Conf. Est – **Game 4** (25 mai, 20h ET, Rocket Mortgage FieldHouse, NYK 3-0) |
| b019 | OKC (home) vs SAS | Finales Conf. Ouest – **Terminée G5** (OKC 127-114, OKC 3-2) |
| b020 | SAS (home) vs OKC | Finales Conf. Ouest – **Terminée G6** (SAS 118-91, Série 3-3) |
| b021 | OKC (home) vs SAS | Finales Conf. Ouest – **Terminée G7** (SAS 111-103, SAS 4-3) |
| b018 | CLE (home) vs NYK | Finales Conf. Est – **Terminée G4** (NYK 130-93, NYK 4-0) |
| b022 | SAS (home) vs NYK | Finales NBA – **Game 1** (3 juin, 20h30 ET, Frost Bank Center) |
| b023 | SAS (home) vs NYK | Finales NBA – **Game 2** (5 juin, 20h30 ET, Frost Bank Center) |
| b024 | NYK (home) vs SAS | Finales NBA – **Game 3** (8 juin, 20h30 ET, Madison Square Garden) |
| b025 | NYK (home) vs SAS | Finales NBA – **Game 4** (10 juin, 20h30 ET, Madison Square Garden) |

**Note EL :** Venue Final Four 2026 = TELEKOM CENTER ATHENS, Marousi (18 500 places). Scores patchés automatiquement via `/api/euroleague/scoreboard` + `useFixtures.js`. b006/b007 supprimés — PAO éliminé par VBC (3-2).

**Règle :** toujours utiliser des vraies stats (StatMuse, ESPN, CBS Sports). Ne jamais inventer. Vérifier le bracket actuel sur StatMuse avant d'éditer.

### Stats équipes clés (saison régulière 2025-26)

| Équipe | Bilan | PPG | OPPG | RPG | APG | FG% |
|---|---|---|---|---|---|---|
| OKC | 64-18 | 119.0 | 108.2 | 44.1 | 27.5 | 48.4 |
| SAS | 62-20 | 119.8 | 109.4 | 47.0 | 28.1 | 47.8 |
| DET | 60-22 | 116.8 | 110.4 | 45.2 | 26.4 | 47.2 |
| NYK | 53-29 | 116.5 | 112.6 | 45.6 | 27.4 | 47.1 |
| CLE | 52-30 | 119.5 | 113.8 | 45.4 | 27.2 | 47.4 |
| LAL | 53-29 | 117.8 | 114.2 | 44.6 | 27.1 | 47.2 |
| MIN | 49-33 | 118.0 | 114.6 | 44.1 | 26.1 | 46.8 |
| PHI | 55-27 | 116.4 | 113.2 | 44.1 | 26.2 | 47.2 |

---

## Environment variables (`backend/.env`)

| Variable | Source | Free tier |
|---|---|---|
| `FD_API_KEY` | football-data.org | 10 req/min |
| `FOOTBALL_API_KEY` | api-sports.io | 100 req/day |
| `ODDS_API_KEY` | the-odds-api.com | 500 req/month |
| `VALUE_THRESHOLD` | — | default `2` (%) |
| `PORT` | — | default `3001` |

All three API keys are optional — backend returns 503 for routes whose key is missing.

---

## Adding fixtures or leagues

- **Football static data**: edit `src/utils/fixtures.js`. The `LEAGUES` array controls ordering and accent colors.
- **Basketball static data**: edit `src/utils/basketball.js`. Après chaque modif, mettre à jour ce fichier CLAUDE.md ET `memory/project_nba_data.md`.
- **CONVENTION DATES NBA** : les matchs jouent en ET (UTC-4 en été). Toujours convertir en UTC pour le champ `date` :
  - 20h30 ET → lendemain T00:30:00Z (ex: 25 mai 20h30 ET → `2026-05-26T00:30:00Z`)
  - 21h00 ET → lendemain T01:00:00Z
  - Ne jamais écrire la date ET telle quelle — c'est la source du bug "match détecté terminé avant d'avoir lieu".
- **Live football leagues**: add entries to `FOOTBALL_LEAGUES` (server.js) and `ODDS_SPORTS` for odds coverage.
