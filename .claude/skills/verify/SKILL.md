---
name: verify
description: Vérifier visuellement une page ValueBet (React+Vite) en pilotant un vrai navigateur headless — recette qui marche dans cet environnement.
---

# Vérifier l'app ValueBet dans un vrai navigateur

Le frontend (`npm run dev`, port 5173) et le backend (`npm run dev` dans `backend/`, port 3001)
doivent déjà tourner (voir `/lanceapp`). Pas de skill de test E2E existant dans ce repo — Playwright
est déjà une dépendance de `backend/` (utilisé pour scraper Betclic/PMU outrights + Pinnacle props
NBA), on le réutilise pour piloter le site.

## Lancer Chromium headless

Le lancement basique (`chromium.launch()`) fonctionne, mais **`newPage()` plante silencieusement**
("Target page, context or browser has been closed") dans cet environnement sandboxé — il faut ces
flags, en particulier `--single-process` (sans lui, le process browser se déconnecte dès qu'il tente
de spawn un renderer séparé) :

```js
const { chromium } = require('/Users/sacha/Desktop/Claude projets/Projets betting /backend/node_modules/playwright');
const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
});
```

Lancer le script Node depuis `backend/` (où `playwright` est installé) via Bash avec
`dangerouslyDisableSandbox: true` — sinon le process Chromium est tué par le sandbox de l'outil Bash.

## Naviguer

**Ne jamais utiliser `waitUntil: 'networkidle'`** — l'app fait du polling permanent (SSE
`/api/sync-events`, `SystemHealthSection` toutes les 15s, etc.), `networkidle` n'arrive donc jamais
et le `goto()` timeout. Utiliser `waitUntil: 'domcontentloaded'` puis un `waitForTimeout(2000-4000)`
fixe pour laisser React/les fetchs initiaux se terminer.

## Trouver un vrai match à ouvrir

Il n'y a pas de route `/basketball` ou `/football` listant les matchs (seulement `/basketball/:id`
et `/football/:id`) — récupérer un vrai ID via l'API backend plutôt que deviner :

```bash
curl -s http://localhost:3001/api/wnba/scoreboard | python3 -c "import json,sys; [print(g['id'], g['home']['name'], g['away']['name'], g['status']) for g in json.load(sys.stdin)['games']]"
curl -s http://localhost:3001/api/fd/matches   | python3 -c "import json,sys; [print(m['league'], m['id'], m['home']['name'], m['away']['name']) for m in json.load(sys.stdin)['matches'][:10]]"
curl -s http://localhost:3001/api/fd/worldcup  | python3 -c "import json,sys; d=json.load(sys.stdin); [print(g['id'], g['home']['name'], g['away']['name'], g['status']) for g in d.get('games', d)]"
```

- **Basket NBA/WNBA** : `/basketball/{espnId}` — **WNBA a besoin de `?league=wnba` en query param**
  (`BasketballDetailPage.jsx` lit `isWNBA` depuis `searchParams`, pas depuis le format de l'id).
  Sans ce paramètre → "Match introuvable." même avec un ID WNBA valide.
- **Foot 5 ligues** : `/football/fd_{id}` (id de football-data.org).
- **Foot CDM** : `/football/fdcdm_{id}`.
- Les 5 ligues classiques (Ligue1/PL/Liga/Bundesliga/SerieA) sont **hors-saison une bonne partie de
  l'année** (pas de cotes scrapées avant mi-août) — pour un test avec de vraies cotes en attendant,
  utiliser un match **CDM** (Coupe du Monde 2026, en cours) à la place.

## Boutons clés (sélecteurs qui marchent)

- Panneau cotes foot ("Odds") : **PAS un `<button>`**, c'est un `<div class="info-chip">` avec
  `onClick` → `page.locator('.info-chip', { hasText: 'Odds' })`. Ne s'ouvre que si des cotes existent
  (`matchOdds` non vide) — sinon le clic ne fait rien, aucune erreur.
- Panneau "Analyse Props" basket : vrai `<button title="Analyse Props">` →
  `page.locator('button[title="Analyse Props"]')`.
- Sous-onglets (BTTS/Résultat/Buts, ou Résultat/Points/Écart H2H/Joueurs, ou Pts/Reb/Ast/3pts) :
  boutons texte simples → `page.locator('button', { hasText: 'NOM_EXACT' })`.

## Ce qu'il faut vérifier après un changement de formule/proba

1. Screenshot de la page + `page.innerText('body')` pour chercher le texte attendu (ex: un badge).
2. Écouter `page.on('console', ...)` et `page.on('pageerror', ...)` pour choper les erreurs silencieuses.
3. Chercher `"NaN"` / `"undefined"` dans le texte de la page après avoir changé d'onglet/équipe —
   signe qu'un calcul a reçu une valeur manquante.
4. Probe minimal : changer d'onglet stat et d'équipe (Reb/Ast/3pts, home/away) pour vérifier que le
   changement ne casse pas les cas adjacents à celui testé en premier.
