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
- `GET /api/fd/results` — football-data.org: final scores for the 5 leagues, ±2/1 day window (`_getFdLeaguesResults()`, 30-min cache). Sole purpose: settlement (`resolveCompletedFootballAlerts()` frontend + `runAutoSettle()`/near-miss backend) — `/api/fd/matches` below never returns finished matches (`?status=SCHEDULED`), so this is a separate route on purpose.
- `GET /api/fd/matches` — football-data.org: next 5 fixtures + standings for 5 leagues. 30-min cache. 200ms delay between league requests (10 req/min limit). Sole source for the 5-league fixture list (Carte du Monde hub, `WorldMapPage.jsx`, and `MatchDetailPage.jsx` via `useFootballFixtures.js`) since 12 juillet 2026 — API-Football (`v3.football.api-sports.io`) was removed entirely from the project at that point (dead weight: its `/api/football/matches` route had been gated off behind an unset `FOOTBALL_MATCHES_ENABLED` flag since the feature's original commit, `/api/football/h2h` was never called by any page, `src/utils/api.js` that wrapped both was never imported anywhere). **Reintroduced 22 juillet 2026** (Pro plan, see "api-football Pro" below) as a supplement for injuries/xG/snapshot on those same 5 leagues + Brasileirão, and **as the sole fixture/odds/model source** for the 3 EU cup competitions added 23 juillet 2026 (see "Coupes d'Europe" below) — football-data.org still owns the 5-league + CDM + Brasileirão fixture lists themselves, api-football never replaces it there.
- `GET /api/odds` — The Odds API: h2h + btts markets, bookmakers: `pinnacle, betfair_ex_eu, unibet_eu, betclic`.
- `GET /api/alerts` — value bet alerts: edges above `VALUE_THRESHOLD` (default 2%).
- `GET /api/nba/scoreboard` — ESPN live NBA scoreboard. Polled every 30s if live game active, 5min otherwise.
- `GET /api/nba/players/:teamId` — ESPN roster for a team. Cache 6h.
- `GET /api/nba/teamschedule/:teamId` — ESPN team schedule (recent + upcoming games). Cache 6h.
- `GET /api/nba/playergamelog/:playerId` — ESPN player game log (last ~15 games). Cache 6h.
- `GET /api/nba/boxscore?date=ISO&home=ABR&away=ABR` — ESPN box score for a completed game. Cache 5min (to pick up NBA post-game stat corrections). Date converted UTC→ET. Response keys use standard abbreviations (SAS, NYK…).
- `POST /api/basketball/result` — team win probability via `computeTeamWinProb` (see below). Body: `{homeGames, awayGames, gameDate, round, league, homePlayers, awayPlayers}`. Used both by `generateBackgroundAlerts()` (alerts) and `BasketballDetailPage.jsx`'s "Modèle 1X2" widget (display) — same function, single source of truth.
- `GET /api/football/cdm/poolavg?fixtureId=fdcdm_xxx` — CDM pool average `avgGF`/`avgGA`. With `fixtureId`, returns the value **frozen** for that match (see CDM section below) if already generated; without it, the live current pool average.
- `GET /api/football/teamxgstats?league=X&team=Y&date=Z` — recent xG/xGA/shots/possession for a team via api-football Pro (see "api-football Pro" below). Returns `{found, xG, xGA, shotsPerGame, shotsOnTarget, possession, games}`.
- `GET /api/football/projections-snapshot/:fixtureId` — real backend-computed BTTS/O-U/1X2 for a fixture, frozen at first generation (see "Football snapshot" below). Returns `{found, bttsProb, pOver25, pUnder25, pHome, pDraw, pAway, lambdaHome, lambdaAway, estimated, savedAt}`.
- `GET /api/outrights` — competition-winner odds (Ligue 1, PL, La Liga, Serie A, Bundesliga, NBA, WNBA). `?refresh=1` forces a re-scrape (see Outrights section below).

**Value bet calculation:**
```
fair_prob = (1/pinnacle_odds) / overround   // overround = sum of 1/odds for all outcomes
edge = bookmaker_odds * fair_prob - 1
```

**Player props alerts — ladder de lignes alternatives (18 juin 2026, `findLadderAlternative()` in `server.js`):**
For NBA/WNBA/EU basket player props (pts/reb/ast/tpm), each player normally gets evaluated on a single "reference" bookmaker line (`bks.unibet[stat] ?? bks.winamax[stat]`). When that line's probability+edge already clear the floor but its odds don't reach the `1.60` minimum on Unibet/Betclic, `findLadderAlternative()` searches the full line ladder already scraped for `PlayerLinesPage.jsx` (`bks.unibetAllLines[stat]` / `bks.betclicAllLines[stat]`) for a neighboring line in the direction that *raises* the odds on the favored side (higher line for Over, lower for Under). The probability is recalculated from scratch at each candidate line (never reused from the reference line) via the same `probAtLeast`/`displayProb` calibration; all the existing gates (floor, edge, WNBA reb-margin/ast-cap/tpm-min-avg, NBA L2-above-line) are re-checked against the candidate line too. Among candidates that pass both the odds and probability gates, the one with the **highest probability** wins. Resulting alerts carry `lineSource: 'ladder'` and use the alternate `line`/odds instead of the reference one — same one-alert-per-player-per-stat rule, just possibly on a different line than the one shown by default elsewhere in the UI. Applied at all 5 emission sites: NBA live + frozen, WNBA live + frozen, EU (acb/bbl/legaa).

**Basketball Résultat (victoire équipe) alerts — `computeTeamWinProb()` in `server.js` (19 juin 2026, replaces EarlyWin):**
EarlyWin (the old "team leads by +X or wins" alert) used an uncalibrated empirical formula (`P(EW) = 0.70×pWin + 0.15×(1-pWin)`) and was never actually wired to the frontend sync pipeline (`syncAlerts.js` had no handler for `type:'earlywin'` — the only alerts ever shown came from a separate, redundant client-side generator in `BasketballDetailPage.jsx`). Replaced end-to-end with an independent team-strength model:
- `computeTeamWinProb({homeGames, awayGames, gameDate, round, isWNBA, homeOutPenalty, awayOutPenalty})` — net rating (`ptsScored - ptsAllowed`, EWA-weighted) per team, adjusted by `getRestFactor`/`getScheduleDensityFactor` (from `compute.js`), `+HOME_COURT_PTS` (2.5, scaled to the league via the same point-scale rescale as EU), damped by `getPlayoffFactorTotalBg` in playoffs, converted to win probability via `tCDF4` (margin/std). `calcKeyPlayerOutPenalty()` removes `KEY_PLAYER_OUT_FACTOR=0.4` × season pts for any roster player with `injury==='Out'` and `stats.pts >= KEY_PLAYER_PTS (15)`.
- Generated in `generateBackgroundAlerts()` for NBA/WNBA (section 4b-bis) and EU acb/bbl/legaa (section 4b, schedules rescaled to NBA-point-equivalent like the EU props engine) — gated on the **h2h market** (not the old, rarer "earlywin/avance" market), `RESULT_ALERT_PROB = 0.80`, `RESULT_MIN_ODDS = 1.50`, bookmaker loop (`Object.entries(h2hBks)`) filters out winamax since 22 juin 2026 (same as basket props/total/football).
- Output: `type: 'basketball_result'` (`id: ${eventId}_{league}_result_{side}` for NBA/WNBA, `${eventId}_eu_result_{side}` for EU), `direction: 'home'|'away'`, `probability`, `margin` (expected point margin), `edge` vs vig-removed h2h odds.
- Frontend: `syncBasketballResultAlerts()` (`src/utils/syncAlerts.js`) merges into `basketball_result_alerts` localStorage key. `BasketballResultCard` (`PlaceBetPage.jsx`) renders pending cards.
- **Single source of truth**: `BasketballDetailPage.jsx`'s "Modèle 1X2" display widget calls `POST /api/basketball/result` with its already-fetched schedules/rosters — same function as the alert generator, so the page never shows a probability that disagrees with the alert (this exact kind of divergence, for a different bug, was the whole subject of the 19 juin session — see [[project_refonte_validation_watch]] memory).

**Basketball Total O/U — tendance H2H resserrée aux vraies séries (22 juillet 2026, `computeGameTotalFull()` in `server.js`):**
`h2hFactor` (added 22 juin for the ACB Barcelone-Valence playoff-series case: totals dropping game after game as defenses adjust) used to extrapolate a trend from any 2 head-to-head meetings in the season, regardless of how far apart in time they were. Real case: Seattle-Minnesota WNBA had only 2 meetings 6 weeks apart (6 juin, 156 pts → 21 juillet, 207 pts) — extrapolated into a wrongful +15% (capped) push on the 22 juillet rematch, which then collapsed to ~160 pts (alert lost). Fix: `H2H_SEQUENCE_MAX_DAYS = 14` — the trend now only extrapolates if the last H2H meeting is ≤14 days before the current game AND the 2 meetings used are ≤14 days apart (genuine series/back-to-back); otherwise `h2hFactor` stays neutral (1.0), same as the pre-existing default with <2 meetings. Single function shared by `game_total` alerts (NBA/WNBA/EU) and the `/api/basketball/total` display widget — one fix point, no divergence possible.

**Football BTTS / Over-Under alerts (`backend/computeFootball.js` + `generateBackgroundAlerts()` section 4d):**
Poisson model, generated every 20min alongside NBA/EU basket alerts — no need to visit `MatchDetailPage` for an alert to be created.
- `computeLambdas({homeGF, homeGA, homePlayed, awayGF, awayGA, awayPlayed, leagueAvgGoals, avgGF, avgGA, homeAdv=1.10})` — attack/defense factors normalized by `avgGF`/`avgGA` (falling back to `leagueAvgGoals` if omitted), each factor passed through `shrinkFactor()` (see below), λ rescaled by `leagueAvgGoals` × home advantage. Returns `null` if sample too small.
- `shrinkFactor(rawFactor, games, k=SHRINK_K=5)` (25 juin 2026) — pulls a small-sample attack/defense factor toward 1.0 ("average team") proportionally to `confidence = games/(games+k)`: at 3 games, only ~37% of the raw deviation from 1.0 is trusted; at 20 games, ~80%. Literature-style constant, not locally calibrated (same caveat as `DIXON_COLES_RHO` below) — mainly matters for CDM squads early in the tournament with only 3-4 real/qualifier matches on file. Mirrored client-side in `MatchDetailPage.jsx` (`computeCdmBTTS`, same `SHRINK_K`).
- **Dixon-Coles correlation** (25 juin 2026) — independent Poisson underestimates low, correlated scorelines (0-0, 1-0, 0-1, 1-1: a team protecting a lead closes the game down) relative to real results. `computeScoreGrid(λh, λa, rho=DIXON_COLES_RHO=0.10, kMax=10)` builds the joint P(i,j) grid, multiplies the 4 low-score cells by `dixonColesTau(x,y,λh,λa,rho)` (standard Dixon & Coles 1997 τ — reduces (0,0)/(1,1), boosts (0,1)/(1,0)), then renormalizes the whole grid to sum to 1. `ρ=0` reproduces the old independent-Poisson numbers exactly (validated to ~1e-7) — it's the safety net if this ever needs to be turned off. `ρ=0.10` is a textbook reference value, **not calibrated on our own results** (sample too small for a reliable MLE fit).
- `computeBTTSProb(λh, λa, rho=DIXON_COLES_RHO)` — sum of `computeScoreGrid` cells where `i≥1` and `j≥1` (replaces the old `(1-P(home=0))*(1-P(away=0))` closed form, which assumed independence).
- `computeOUProb(λh, λa, line, rho=DIXON_COLES_RHO)` — sum of grid cells where `i+j ≤ floor(line)` → `pUnder`, `pOver = 1-pUnder`. At the standard 2.5 line, the 4 Dixon-Coles cells all sit inside the same under-bucket, so the net effect on O/U is small; the correction mainly reshuffles BTTS and 1X2 draw probability.
- `compute1X2Probs(λh, λa, kMax=10, rho=DIXON_COLES_RHO)` — same grid, sums `P(i,j)` by `i>j` (home win), `i===j` (draw), `i<j` (away win) → `{pHome, pDraw, pAway}`. All three (BTTS/O-U/1X2) now derive from one shared grid for internal consistency.
- **Neutral home advantage — CDM only** (25 juin 2026): `homeAdv` is no longer a blanket `1.10` for World Cup fixtures. `CDM_HOST_NATIONS = new Set(['United States','Canada','Mexico'])` (2026 hosts) — `homeAdv: CDM_HOST_NATIONS.has(g.home.name) ? 1.10 : 1.0` is computed when building each CDM fixture and passed into `computeLambdas`; everything else (the "home" label is arbitrary fixture-list order at a neutral tournament venue) gets `1.0`. The 5 domestic leagues are unaffected (no `homeAdv` set on their fixture objects → `computeLambdas` default `1.10` applies, same as before). Mirrored in `MatchDetailPage.jsx` (`computeCdmBTTS`, `CDM_HOST_NATIONS`, 4th arg = `fixture.home.name`).
- Fixtures source: `_fdCache.matches` (5 leagues, `fixtureId = fd_${id}`, `leagueAvgGoals = FB_LEAGUE_AVG_GOALS[league]` — `{ligue1:1.35, pl:1.45, laliga:1.35, bundes:1.55, seriea:1.35}`, `avgGF`/`avgGA` omitted — closed league, GF≈GA on average, single constant is fine) + `_cdmCache.games` `STATUS_SCHEDULED` (`fixtureId = fdcdm_${id}`, `leagueAvgGoals = CDM_AVG_GOALS = 1.30`, `avgGF`/`avgGA` computed **dynamically** as the average `goalsFor`/`goalsAgainst` across all teams in the current CDM fixture pool — `CDM_AVG_GF=2.15`/`CDM_AVG_GA=0.78` are fallback-only if no stats available, requires `games >= 3` both teams via `/api/football/cdm/teamstats/:name`).
  - **Important**: `/api/football/cdm/teamstats/:name` returns `goalsFor`/`goalsAgainst` as already-weighted **per-match averages** (not totals). `computeLambdas` expects totals (it divides by `played`), so the CDM fixture builder multiplies back by `games`: `homeGF: hs.goalsFor * hs.games, homePlayed: hs.games`. Don't pass the raw averages directly — λ collapses to ~0 and every match falsely alerts "Under" at 100%.
  - **CDM attack/defense asymmetry**: qualified WC teams' recent friendlies/qualifiers are mostly against weaker opponents, so average GF is far above average GA across the squad pool. Normalizing both attack and defense by the same `CDM_AVG_GOALS=1.30` crushed every λ below 1.7 → 100% "Under" regardless of matchup. Fix: `avgGF`/`avgGA` normalize attack/defense separately, `CDM_AVG_GOALS` only rescales the final λ (home/away split + home advantage). The 5 leagues are unaffected (no `avgGF`/`avgGA` passed → same behavior as before).
  - **Dynamic avgGF/avgGA**: computed each `generateBackgroundAlerts()` run as the mean `goalsFor`/`goalsAgainst` over every team (`games >= 3`) appearing in the scheduled CDM fixtures — self-recalibrates as the team pool changes (knockout stage, new qualifiers) instead of relying on a stale hardcoded sample. A fixed `avgGA=0.65` (sample of ~13 teams) was initially used but proved too low once weaker teams (Haiti, Curaçao, NZ, Scotland — GA ~1.0-1.4) were included, inflating defense factors and producing unrealistic BTTS alerts (e.g. Germany vs Curaçao 75%). The dynamic average (~0.83 on the current pool) removed those overconfident BTTS calls entirely.
  - **Fix 18 juin 2026 — matchs CDM réels manquants des stats équipe**: `/api/football/cdm/teamstats/:name` ne récupérait que `fifa.friendly` + `fifa.worldq.{conf}` (amicaux + qualifs), jamais `fifa.world` (le calendrier de la Coupe du Monde elle-même). Une fois le tournoi commencé, les matchs de poule déjà joués (J1, J2…) étaient donc invisibles du modèle, qui continuait de tourner sur des amicaux/qualifs d'avant-tournoi (ex: Canada vs Qatar J2 calculé sans voir Canada 1-1 Bosnie ni Qatar 1-1 Suisse, leurs vrais matchs de poule précédents). Fix : ajout de `fetchEspnSoccerSchedule('fifa.world', espnId)`, résultats tagués `type: 'worldcup'`, poids `1.5` (au-dessus des qualifs `1.3` et amicaux `0.85`) — un match de poule réel est la donnée la plus représentative une fois le tournoi lancé (effectif et forme actuels, niveau d'adversité CDM).
  - **Note — alias nom manquant**: `ESPN_CDM` utilise `turkiye` (nom FIFA) mais la source `_cdmCache` (football-data.org) renvoie `Turkey` → 404 sur `/api/football/cdm/teamstats/Turkey`, cette équipe est donc exclue de la moyenne du pool et n'a pas d'alertes générées. Pas encore corrigé (ajouter `turkey: 'turkiye'` à `CDM_NAME_ALIASES` si besoin).
  - **Fix 19 juin 2026 — avgGF/avgGA figés par match (`freezeCdmPoolAvg()`)** : avant ce fix, `avgGF`/`avgGA` étaient recalculés à *chaque* cycle de 20min sur le pool de matchs encore programmés dans les 24h — un pool qui change constamment fait dériver fortement la probabilité d'un match déjà suivi, sans qu'aucune donnée de ce match lui-même ait changé (cas réel : BTTS Mexique-Corée du Sud généré à 76%, recalculé à 18% quelques heures plus tard, alors qu'aucune des deux équipes n'avait rejoué). Fix : `avgGF`/`avgGA` sont maintenant figés par `fixtureId` dès la 1ère génération (`_cdmFixturePoolAvg`, persisté dans `backend/cache/cdm_fixture_poolavg.json`), réutilisés tels quels aux cycles suivants tant que le match n'a pas eu lieu. Exposé côté frontend via `GET /api/football/cdm/poolavg?fixtureId=...` (`MatchDetailPage.jsx` l'utilise déjà).
- Alert thresholds (raised 27 juin 2026, see "Session 27 juin" below): `FB_BTTS_ALERT_PROB = 0.70`, `FB_OU_ALERT_PROB = 0.70`, `FB_RESULT_ALERT_PROB = 0.70`, `FB_BTTS_OU_MIN_ODDS = 1.60`, `FB_RESULT_MIN_ODDS = 1.50` (best of unibet/betclic on the proposed direction — winamax excluded from the threshold check since 22 juin 2026, same as basket props/total/result; winamax odds still shown on the card for reference). O/U tries line `2.5` then falls back to `1.5`, one alert per fixture.
- Output: `type: 'football_btts'` (`id: ${fixtureId}_btts_yes`, same id scheme as the client-generated `fb_btts_alerts` → natural dedup), `type: 'football_total'` (`id: ${fixtureId}_total_${line}`, includes `estimated` = `λhome+λaway` expected total goals), and `type: 'football_result'` (`id: ${fixtureId}_result_${direction}`, `direction ∈ {home,draw,away}`, includes `probability` and optional `edge` vs vig-removed h2h odds).
- **Football Résultat 1X2 (15 juin 2026)**: each outcome (home/draw/away) is treated as an *independent binary yes/no proposition* (same framing as BTTS), not a 3-way mutually-exclusive pick — since `2 × FB_RESULT_ALERT_PROB > 1`, at most one outcome can qualify per fixture, so still "one alert per fixture". h2h odds come from the same scraping merge as BTTS/O-U (`_mergeFootballBookmaker` → `oddsMatch.markets.h2h.bookmakers[bk] = {home, draw, away}`), `FB_BOOKS = ['unibet','betclic']` (winamax_foot permanently blocked since 11 juin anyway, and explicitly removed from the threshold check on 22 juin 2026 — `?.[key] ?? 0` handled its absence gracefully before that too). Edge computed via `removeVig(pair, 'h2h')` when all 3 odds present from the chosen bookmaker.
- Frontend sync: `syncFootballAlerts()` (`src/utils/syncAlerts.js`) merges into `fb_btts_alerts` / `fb_total_alerts` / `fb_result_alerts` localStorage keys, preserving accepted/rejected. `BTTSAlertCard`/`FootballTotalCard`/`FootballResultCard` (shared in `src/components/FootballAlertCards.jsx`, with `FB_LEAGUE_META`) render `pending` cards in `PlaceBetPage.jsx`.
- **Accepted → Running (compact format, like basketball)**: once accepted, the alert disappears from `PlaceBetPage` and `RunningPage.jsx`'s `footballAlertToGroup()` converts it into the same "group" shape as basketball props/totals (`stat: 'btts'|'total'|'result'`, `direction: 'yes'|'over'/'under'|'home'/'draw'/'away'`, `eventId: fixtureId`), fed into the shared `groupByMatch()` → rendered as a compact `MatchGroup` box (logo, league badge `CDM`/`L1`/`PL`/`Liga`/`BL`/`SA` via `FB_LEAGUE_LABEL`, team names, kickoff time, alert count) — no more dedicated "⚽ Football · Acceptés" card section. `AlertCard.goToMatch` navigates to `/football/${fixtureId}`. Live scores for CDM groups come from `/api/fd/worldcup` (matched by `String(g.id) === fixtureId.replace('fdcdm_','')`, crest `logo` URLs used directly by `TeamLogo`); the 5 European leagues have no live-score source yet so they stay in the "scheduled" bucket with initials only. `onDismiss` removes the alert from its localStorage key (`fb_btts_alerts`/`fb_total_alerts`/`fb_result_alerts`).
- **Settlement**: `resolveCompletedFootballAlerts()` (`src/utils/syncAlerts.js`, shared by `PlaceBetPage` and `RunningPage`) — generic `FOOTBALL_SETTLEMENT_SOURCES` array, one entry per fixtureId prefix, each with its own scores endpoint (`resolveFootballAlertResult()` computes won/lost identically regardless of source, from `{status, home:{score}, away:{score}}`). Covers **all** football leagues in the app as of 24 juillet 2026: `fdcdm_` (CDM, `/api/fd/worldcup`), `fdbr_` (Brasileirão, `/api/fd/bresil`), `afel_`/`afcl_`/`afch_` (coupes d'Europe, `/api/football/eucup/:comp/matches`), `fd_` (5 grands championnats, `/api/fd/results` — wraps the pre-existing backend-only `_getFdLeaguesResults()`, previously used only by `runAutoSettle()`/near-miss resolution and never exposed over HTTP for this frontend path, hence the earlier gap). `football_result` can only resolve at `STATUS_FINAL` (the 1X2 outcome can flip until the final whistle), unlike BTTS/O-U which can be "already won" live.
- **Fix 19 juin 2026 — cotes football figées au coup d'envoi (`_refreshOddsCache()`)**: avant ce fix, un match n'était marqué `frozen:true` que s'il *disparaissait complètement* du scrape Unibet/Betclic/Winamax — un match resté visible en live (bookmaker continue de renvoyer des cotes in-play) gardait ses cotes écrasées en continu, affichées comme si elles étaient pré-match (cas réel : Canada-Qatar, cotes 1X2 in-play 1.00/40/100 jamais figées). Fix : un match dont `commenceTime` est dépassé est désormais figé sur la dernière capture pré-coup d'envoi connue, peu importe si le bookmaker le renvoie encore en live. Effet de bord corrigé au passage : un match **futur** disparu temporairement du scrape (ligne pas encore postée) n'est plus marqué `frozen` à tort — il disparaît juste de la liste jusqu'à réapparition, au lieu d'afficher un faux badge "cotes pré-match".
- **Fenêtre d'alerte 48h — 5 grands championnats + Brasileirão (22 juillet 2026)**: `FOOTBALL_ALERT_WINDOW_MS = 48 * 3600_000` filtre désormais les fixtures des 5 ligues + Brasileirão à ≤48h avant génération d'alerte (jusque-là aucune fenêtre — un match dans 2 semaines pouvait déclencher une alerte sur des compos/forme qui allaient forcément changer d'ici là). La CDM garde sa fenêtre 24h séparée et préexistante, non touchée.

**api-football Pro — blessures, xG, snapshot (22 juillet 2026, `backend/server.js`):**
L'utilisateur a souscrit au plan Pro api-football (api-sports.io, même clé que `BASKETBALL_API_KEY`, variable `FOOTBALL_API_KEY` dans `.env` — le plan Free bloque toute donnée saison en cours). `footballApiFetch()`/`_footballApiFetchRaw()` — semaphore(5) + retry-on-rateLimit, même pattern que `bballFetch` (basket) — encapsule tous les appels api-football, capture le quota via `_captureFootballApiQuota()` (exposé dans `/api/system/health` → `quotas.footballApi`, affiché sur le Dashboard à côté d'API-Basketball).
- **Blessures** (`fetchFootballInjuriesForDate`, `computeFootballInjuryPenalties()`) — `/injuries?league=X&season=Y&date=Z` renvoie en un seul appel toutes les blessures/suspensions liées aux fixtures du jour. Un attaquant clé absent (`FB_KEY_ATTACKER_GOALS_ASSISTS=8` buts+passes) pénalise l'attaque (`FB_ATTACK_OUT_PENALTY=0.90`) ; un gardien titulaire absent (`FB_KEY_DEFENDER_APPEARANCES=10` apparitions) pénalise la défense (`FB_DEFENSE_OUT_PENALTY=1.12`). Pénalités multipliées dans `computeLambdas()` via 4 nouveaux paramètres optionnels (`homeAttackPenalty`/`homeDefensePenalty`/`awayAttackPenalty`/`awayDefensePenalty`, défaut 1 = no-op, rétrocompatible).
- **xG** (`fetchTeamRecentXG`, `tryGetFootballXGInputs`) — `/fixtures/statistics` (pas `/teams/statistics`, qui n'a que les buts bruts) sur les `FB_XG_RECENT_GAMES=8` derniers matchs (min `FB_XG_MIN_GAMES=3`), remplace les buts bruts (`homeGF`/`homeGA`) comme entrée de `computeLambdas` quand disponible — capture aussi `shotsPerGame`/`shotsOnTarget`/`possession` au passage, réutilisés pour remplir le panneau "Statistiques saison" de `MatchDetailPage.jsx` (`fetchXGStats`, route `GET /api/football/teamxgstats`).
- **Snapshot foot** (même principe que `_projectionsSnapshot` basket) — `_footballProjectionsSnapshot` persisté (`FB_SNAPSHOT_FILE`), écrit à chaque cycle `generateBackgroundAlerts()` juste après le calcul de `bttsProb`/`pOver25`/`pHome` etc., exposé via `GET /api/football/projections-snapshot/:fixtureId`. `MatchDetailPage.jsx` lit ce snapshot en priorité pour les 5 ligues + Brasileirão (non-CDM, qui a son propre calcul `computeCdmBTTS`) au lieu de recalculer indépendamment côté client avec une formule plus simple — supprime le badge "estimation site" sur ces compétitions, `cdmRho` s'applique aussi aux résultats snapshot (`bttsResult?.isSnapshot`).
- **Pas encore sur Render** : `FOOTBALL_API_KEY` seulement en local (`backend/.env`, gitignored) — décision explicite de l'utilisateur de différer l'ajout en production, tout dégrade proprement sans la clé (fallback buts bruts, pas de pénalité blessure, pas de snapshot).

**Coupes d'Europe — Ligue des Champions / Europa League / Conference League (23 juillet 2026, `backend/server.js`) :**
Ajoutées dans la Carte du Monde en parité complète avec les 5 championnats/CDM/Brasileirão : fixtures, cotes (Betclic+Unibet+Pinnacle), modèle Poisson (BTTS/O-U/1X2/Dixon-Coles), page match, alertes, règlement automatique, scores live, blessures.
- **Source de données : entièrement api-football** (football-data.org ne couvre pas ces compétitions). `EU_CLUB_COMP_IDS = { europa: 3, conference: 848, champions: 2 }` (ids Pinnacle distincts : 2632/271382/2627). `fixtureId` préfixés `afel_`/`afcl_`/`afch_`, namespace séparé de `fd_`/`fdcdm_`/`fdbr_`.
- **Forme d'équipe tous compétitions confondues** : `fetchClubRecentForm()`/`fetchClubRecentXG()` n'appliquent pas de filtre `league=` (contrairement aux 5 championnats domestiques) — les clubs en tour de qualification n'ont que 0-2 matchs dans la compétition elle-même. `avgGF`/`avgGA` calculés dynamiquement sur le pool courant puis figés par match via `freezeCdmPoolAvg()` (réutilisée telle quelle malgré son nom).
- **Blessures** : `/injuries` et `/teams` d'api-football acceptent ces 3 `competitionId` exactement comme un championnat domestique — `europa: 3, conference: 848, champions: 2` ajoutés directement dans `FOOTBALL_API_LEAGUE_IDS`, aucune logique séparée nécessaire, tout le pipeline `computeFootballInjuryPenalties()` existant s'applique tel quel.
- **Alertes coupées en tours de qualification, modèle actif quand même** (demande explicite : "on s'en fout des qualifs" ; affiné le 23 juillet 2026) : `fbFixtures` (loop `generateBackgroundAlerts()`) porte un flag `isQualifRound` (test `/qualif|preliminary|play-?offs?/i` sur `fx.league.round`) — les qualifs entrent quand même dans `computeLambdas`/near-miss tracking (`_logFootballNearMiss`, voir `/api/analysis/near-miss-football`), seule l'émission de l'alerte elle-même (`newAlerts.push`, les 5 points BTTS/Résultat/O-U/DC&BTTS/DC&Over + les 2 edges Pinnacle) est gardée par `!f.isQualifRound`. Se réactive automatiquement dès la phase finale (League Stage / élimination directe). `_resolveFootballNearMiss()` sait régler ces candidats (`FOOT_MATCH_ENDPOINT` étendu aux préfixes `afel_`/`afcl_`/`afch_` → `/api/football/eucup/:comp/matches`, même liste que `FOOTBALL_SETTLEMENT_SOURCES` côté frontend).
- `GET /api/football/eucup/:comp/matches` (`comp` ∈ `europa`/`conference`/`champions`) — liste de matchs générique, cache 30min (`_euClubMatchesCache`). `/api/football/teamxgstats` étend sa branche existante pour couvrir ces 3 compétitions (`resolveEuClubTeamId()` + `fetchClubRecentXG()`).
- **Limites de données connues (pas des bugs)** : pas de xG disponible au stade des qualifs (vérifié en direct, ex. Benfica) — le modèle retombe sur les buts bruts récents ; le panneau "Statistiques saison" reste à 0 pour ces 3 ligues (pas de classement saison côté api-football pour ces compétitions) ; Ligue des Champions sans page Betclic tant que leur 1er match (28 juillet) n'est pas ouvert côté bookmaker.
- **Fenêtre de scraping détaillé Betclic bornée à 72h** (`BETCLIC_EXTRAS_WINDOW_MS`) — évite de scraper le détail de matchs de qualif à plusieurs semaines, correctif qui bénéficie aussi aux 5 championnats existants. `fetchBetclicFootballExtras` a en plus un timeout dur de 15s (`Promise.race`) qui garantit la libération du sémaphore même si un match précis fait planter le scraping interne indéfiniment.
- **Fix 23 juillet 2026 — fuite mémoire réelle sur `_betclicGrpcMarketNames`/`_betclicGrpcCategory`** : le "timeout de lecture" interne (8s) appelait `resp.body.destroy()` — méthode `Readable` Node.js qui n'existe pas sur le `ReadableStream` Web Streams renvoyé par `fetch` natif (silencieusement avalée par le `try/catch` qui l'entourait, donc no-op). La requête + lecture du flux gRPC continuaient de tourner en arrière-plan indéfiniment si Betclic ne fermait jamais la connexion, bien après que le timeout dur de 15s de `fetchBetclicFootballExtras` ait abandonné côté appelant — connexions fantômes qui s'accumulent cycle après cycle (probable cause du mail Render "Web Service exceeded its memory limit" reçu le jour même). Fix : un seul `AbortController` par appel, `ctrl.abort()` dans le timeout coupe réellement la requête ET la lecture du flux. Repéré en observant qu'un cycle bg-alerts local restait bloqué (CPU ~0%, aucune progression du log) bien après la fenêtre de 15s censée le débloquer.
- **Règlement Brasileirão branché au passage** : en généralisant `resolveCompletedFootballAlerts()` (`FOOTBALL_SETTLEMENT_SOURCES` dans `syncAlerts.js`) pour couvrir ces 3 nouvelles ligues, découverte que le Brasileirão (scores dispo depuis le 17 juillet via `/api/fd/bresil`) n'avait en fait jamais été câblé au règlement — seule la CDM l'était. Corrigé dans la foulée.
- **Carte du Monde — CDM masquée** (`WorldMapPage.jsx`, `MONDE.leagues`) : la Coupe du Monde 2026 étant terminée (prochaine édition en 2030), `'cdm'` a été retiré du tableau `MONDE.leagues` — code/routes/settlement CDM intacts, juste plus affiché dans la navigation. Ordre des compétitions dans le panneau Monde : LDC → Europa → Conference → EuroLeague.

**ESPN abbreviation normalization (backend):**
ESPN uses short forms (`SA`, `NY`, `GS`, `NO`, `UT`) instead of standard NBA abbreviations. The backend normalizes bidirectionally:
```js
const ESPN_ABBR_MAP = { SAS:'SA', NYK:'NY', GSW:'GS', NOP:'NO', UTA:'UT' };
// Response keys are converted back: SA→SAS, NY→NYK, etc.
```

**Outrights — paris long terme vainqueur de compétition (23 juin 2026, `backend/server.js` + `src/pages/OutrightsPage.jsx`):**
7 compétitions (Ligue 1, PL, La Liga, Serie A, Bundesliga, NBA, WNBA), 3 sources bookmaker fusionnées. Betclic et PMU via Playwright (le marché "Vainqueur Compétition" n'est pas dans le HTML brut). Pinnacle via API JSON directe depuis le 26 juin 2026 (plus de Playwright pour Pinnacle) :
- **Betclic** (`fetchBetclicOutrights()`) — source principale, les 7 compétitions quand non bloqué. `BETCLIC_OUTRIGHT_TARGETS` (slug par compétition), gère bandeau cookies (peut réapparaître en différé — `_dismissCookieBanner()` appelé à plusieurs points), onglet "Compétition" optionnel, bouton "Afficher plus" (vérifie `.is-expanded` avant de cliquer pour ne pas re-fermer une liste déjà dépliée).
- **Pinnacle** (`fetchPinnacleOutrights()`) — NBA uniquement, via API JSON directe `guest.api.arcadia.pinnacle.com` (clé publique `CmX2KcMrXuFmNg6YFbmTxE0y9CIrOi0R`, interceptée du frontend Pinnacle). Plus de Playwright pour les outrights Pinnacle depuis le 26 juin 2026.
- **PMU** (`fetchPmuOutrights()`) — PL, La Liga, Serie A, NBA, WNBA (Ligue 1 et Bundesliga pas disponibles chez eux pour le moment). Naviguer sur `www.pmu.fr` (pas `parisportif.pmu.fr`). Widget Kambi sous-jacent, nécessite un `waitForTimeout(3000)` après `goto` pour laisser le widget s'hydrater avant extraction.
- **Unibet abandonné pour cette feature** : la page outrights Unibet tronque à 3 favoris par défaut ; ni l'API Kambi (429 rate-limit confirmé) ni Playwright (signaux anti-bot type DataDome — modales cookies répétées, resets de session, 403) n'ont permis de débloquer la liste complète. Décision conjointe avec l'utilisateur d'abandonner Unibet et l'API Kambi entièrement pour les outrights — ne pas retenter sans nouvelle piste.
- **Garde-fous anti-ban** (suite à un vrai ban Betclic le 23 juin causé par des tests Playwright en rafale pendant le dev — voir [[project_betclic_ban_juin23]]) : `pinnacle`/`pmu` ajoutés aux objets partagés `_scraperBlockedUntil`/`_scraperFailStreak` (`scraper_blocks.json`, même mécanisme que `fetchBk`) ; `getOutrights()` vérifie le blocage Betclic **avant** de lancer Playwright (ne scrape jamais un bookmaker déjà bloqué) ; délai minimum de 15 min entre deux tentatives réelles par source, persisté dans `backend/cache/outright_attempts.json` (`_outrightAttempts`) pour survivre aux redémarrages `node --watch` pendant le dev ; auto-détection de blocage si moins de la moitié des compétitions réussissent dans un cycle.
- Fusion des 3 sources dans la route `GET /api/outrights` : `competitions[key].teams[].books = {betclic, pinnacle?, pmu?}`, réconciliation des noms d'équipe via alias maps (`PINNACLE_NBA_TEAM_ALIASES`, `PMU_TEAM_ALIASES`) car chaque bookmaker orthographie différemment (ex: "Inter" vs "Inter Milan", "FC Barcelone" vs "Barcelone").
- Frontend (`OutrightsPage.jsx`) : toggle sport ⚽/🏀, colonnes bookmaker dans un ordre fixe `BOOK_ORDER = ['pinnacle','betclic','pmu']` (Pinnacle blanc, Betclic rouge, PMU vert foncé `#166534`), compétitions triées par `COMP_ORDER` fixe (Ligue 1 en premier), une carte n'affiche que les colonnes bookmaker pour lesquelles elle a des données.

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

### NBA Playoffs 2026 — état au 18 juin 2026 (saison terminée, NYK Champion)

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
| b022 | SAS (home) vs NYK | Finales NBA – **Terminée G1** (NYK 105-95, NYK 1-0) |
| b023 | SAS (home) vs NYK | Finales NBA – **Terminée G2** (NYK 105-104, NYK 2-0) |
| b024 | NYK (home) vs SAS | Finales NBA – **Terminée G3** (SAS 115-111, NYK 2-1) |
| b025 | NYK (home) vs SAS | Finales NBA – **Terminée G4** (NYK 107-106, NYK 3-1) |
| b026 | SAS (home) vs NYK | Finales NBA – **Terminée G5** (NYK 94-90, **NYK CHAMPION 2026**, série 4-1) |

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
| `BASKETBALL_API_KEY` | api-sports.io (basketball, plan Pro) | 7500 req/day |
| `FOOTBALL_API_KEY` | api-sports.io (football, plan Pro — 22 juillet 2026) | 7500 req/day, 300 req/min |
| `ODDS_API_KEY` | the-odds-api.com | 500 req/month |
| `BZZOIRO_API_KEY` | sports.bzzoiro.com | — (EuroLeague uniquement, voir ci-dessous) |
| `VALUE_THRESHOLD` | — | default `2` (%) |
| `PORT` | — | default `3001` |

All API keys are optional — backend returns 503 for routes whose key is missing.

## Basketball EU leagues — data sources (ACB / LNB / BBL / Lega A)

Migration 22 juin 2026 : **Bzzoiro coupé pour ces 4 ligues** (instable, jugé peu fiable) — roster, gamelog et box-score reposent désormais sur `BBALL_BASE = v1.basketball.api-sports.io` (`bballFetch`/`bballPlayerGamelog`/`getEuroGamesMap` in `server.js`). Bzzoiro (`bzzFetch`) reste utilisé **uniquement pour l'EuroLeague** (`BZZ_EL_TEAMS`, routes `/api/euroleague/*`) — ne pas y toucher en travaillant sur les 4 ligues EU.

- **ACB** : roster + gamelog principal restent sur scraping direct acb.com (`fetchAcbHtml`/`ACB_TEAM_MAP`) — plus complet qu'api-sports.io (steals/blocks/turnovers inclus). api-sports.io ne couvre que ce qui manquait côté ACB (compos, box-score auto-save).
- **LNB / BBL / Lega A** : roster + gamelog + box-score entièrement via api-sports.io.
- **Lega A** : compositions confirmées restent sur le scraping officiel legabasket.it (`fetchLegaALineup`), inchangé par cette migration.
- **Important — pas de lineups pré-match natif côté api-sports.io basketball** (`/lineups?game=` renvoie `"This endpoint do not exist."` — vérifié en direct le 22 juin 2026). Les "compos probables" ACB/LNB/BBL sont calculées depuis l'historique de titularisations (`type: 'starters'`) des gamelogs récents (`bballPlayerGamelog`), pas depuis un lineup pré-match confirmé. Seule la Lega A a une vraie source de compos confirmées pré-match (legabasket.it).
- **Concurrence api-sports.io** : un roster complet déclenche un appel `/games/statistics/players?player=X` par joueur (~15-19 en parallèle) — sans throttling ça déclenche un rate-limit (réponse HTTP 200 avec `errors.rateLimit`, pas une erreur HTTP, donc invisible si non détectée). `bballFetch` limite à 5 appels simultanés (semaphore) + retry avec backoff sur `rateLimit`, et `getEuroGamesMap` déduplique les appels concurrents identiques.

---

## Adding fixtures or leagues

- **Football static data**: edit `src/utils/fixtures.js`. The `LEAGUES` array controls ordering and accent colors.
- **Basketball static data**: edit `src/utils/basketball.js`. Après chaque modif, mettre à jour ce fichier CLAUDE.md ET `memory/project_nba_data.md`.
- **CONVENTION DATES NBA** : les matchs jouent en ET (UTC-4 en été). Toujours convertir en UTC pour le champ `date` :
  - 20h30 ET → lendemain T00:30:00Z (ex: 25 mai 20h30 ET → `2026-05-26T00:30:00Z`)
  - 21h00 ET → lendemain T01:00:00Z
  - Ne jamais écrire la date ET telle quelle — c'est la source du bug "match détecté terminé avant d'avoir lieu".
- **Live football leagues**: add entries to `FOOTBALL_LEAGUES` (server.js) and `ODDS_SPORTS` for odds coverage.
