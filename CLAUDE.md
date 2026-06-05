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
