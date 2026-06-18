import { useState } from 'react';

function Accordion({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="util-section">
      <button className="util-section-toggle" onClick={() => setOpen(o => !o)}>
        <h2 className="util-section-title">{title}</h2>
        <svg
          className={`util-chevron ${open ? 'open' : ''}`}
          width="14" height="14" viewBox="0 0 14 14" fill="none"
        >
          <path d="M3 5L7 9L11 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <div className={`util-accordion-body ${open ? 'open' : ''}`}>
        <div className="util-accordion-inner">{children}</div>
      </div>
    </section>
  );
}

function openReviewPDF() {
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<title>ValueBet — Review complète du projet</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; line-height: 1.65; color: #1a1a2e; background: #fff; padding: 48px 56px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 26px; font-weight: 800; color: #0f172a; margin-bottom: 6px; }
  .subtitle { font-size: 13px; color: #64748b; margin-bottom: 36px; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; }
  h2 { font-size: 17px; font-weight: 700; color: #1e40af; margin: 32px 0 10px; border-left: 4px solid #3b82f6; padding-left: 10px; }
  h3 { font-size: 14px; font-weight: 700; color: #334155; margin: 20px 0 8px; }
  p { margin-bottom: 10px; color: #334155; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 18px; font-size: 12px; }
  th { background: #f1f5f9; color: #475569; font-weight: 700; text-align: left; padding: 7px 10px; border: 1px solid #e2e8f0; }
  td { padding: 6px 10px; border: 1px solid #e2e8f0; vertical-align: top; color: #334155; }
  tr:nth-child(even) td { background: #f8fafc; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: .04em; margin-right: 4px; }
  .tag-blue { background: #dbeafe; color: #1d4ed8; }
  .tag-green { background: #dcfce7; color: #15803d; }
  .tag-orange { background: #ffedd5; color: #c2410c; }
  .tag-purple { background: #ede9fe; color: #7c3aed; }
  code { background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-family: monospace; font-size: 11px; color: #be185d; }
  .formula { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; font-family: monospace; font-size: 12px; margin: 12px 0; color: #0f172a; line-height: 1.9; }
  .alert-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 14px 16px; margin: 10px 0; }
  .alert-box h3 { color: #1d4ed8; margin-top: 0; }
  .pending { background: #fffbeb; border-color: #fde68a; }
  .pending h3 { color: #b45309; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
  @media print {
    body { padding: 28px 36px; }
    @page { margin: 1.5cm; size: A4; }
    h2 { page-break-before: auto; }
  }
</style>
</head>
<body>
<h1>ValueBet — Review complète du projet</h1>
<p class="subtitle">État au 23 mai 2026 · Généré depuis l'application ValueBet</p>

<h2>Vue d'ensemble</h2>
<p><strong>ValueBet</strong> est un dashboard d'analyse de paris sportifs full-stack. L'objectif : comparer des projections statistiques construites from scratch aux lignes proposées par les bookmakers français, et générer des alertes automatiques quand l'écart est significatif.</p>
<p>Stack : <strong>React 18 + Vite</strong> (port 5173) + <strong>Express</strong> (port 3001). Toutes les APIs tierces passent par le backend — le frontend ne contacte jamais aucune source externe directement.</p>

<h2>Sports couverts</h2>
<h3>Football</h3>
<p>5 championnats : Ligue 1, Premier League, La Liga, Bundesliga, Serie A. Fixtures des 5 prochains matchs par ligue, stats de classement, cotes h2h + BTTS, détection des value bets vs Pinnacle.</p>
<h3>Basketball</h3>
<p>NBA + WNBA (live ESPN) + EuroLeague + 4 championnats EU : ACB (Espagne), LNB Betclic Élite (France), BBL (Allemagne), Lega A (Italie). Tous partagent la même interface : scoreboard live, OddsCard 3 tabs (Résultat / Points / Joueurs), Analyse Props, modèle O/U, compositions, forme, H2H. Cotes scrapées depuis Unibet/Betclic/Winamax — auto-refresh background toutes les 5 min sans intervention.</p>

<h2>Sources de données — Football</h2>
<table>
<thead><tr><th>Source</th><th>Ce qu'elle apporte</th><th>Limite / Cache</th></tr></thead>
<tbody>
<tr><td><strong>football-data.org</strong></td><td>Fixtures + standings 5 ligues</td><td>10 req/min — cache 30min</td></tr>
<tr><td><strong>api-sports.io</strong></td><td>Idem (source alternative)</td><td>100 req/jour</td></tr>
<tr><td><strong>The Odds API</strong></td><td>Cotes h2h + BTTS (Pinnacle, Betfair, Unibet, Betclic)</td><td>500 req/mois — cache disque 30min</td></tr>
<tr><td><strong>Unibet (scraping HTML)</strong></td><td>Cotes h2h football FR</td><td>Sans clé</td></tr>
<tr><td><strong>Winamax (scraping)</strong></td><td>Cotes h2h football FR</td><td>Sans clé</td></tr>
</tbody>
</table>

<h2>Sources de données — Basketball</h2>
<h3>NBA</h3>
<table>
<thead><tr><th>Source</th><th>Ce qu'elle apporte</th><th>Cache</th></tr></thead>
<tbody>
<tr><td><strong>ESPN Scoreboard</strong></td><td>Matchs du jour en live (score, statut, équipes)</td><td>30s si live, 5min sinon</td></tr>
<tr><td><strong>ESPN Roster</strong></td><td>Effectif complet (stats saison, statut blessure, headshot)</td><td>6h</td></tr>
<tr><td><strong>ESPN Team Schedule</strong></td><td>15 derniers matchs (pts marqués/encaissés, domicile/ext, adversaire)</td><td>6h</td></tr>
<tr><td><strong>ESPN Player Gamelog</strong></td><td>Gamelogs par joueur : pts/reb/ast/tpm (3pts)/min/fga/fta/to/tsPct</td><td>6h</td></tr>
<tr><td><strong>ESPN Boxscore</strong></td><td>Stats du match pour les matchs terminés</td><td>5min (corrections post-match)</td></tr>
<tr><td><strong>stats.nba.com</strong></td><td>USG% officiel, pts encaissés par position (G/F/C) par équipe</td><td>6h</td></tr>
<tr><td><strong>The Odds API</strong></td><td>Total Vegas + moneyline (DraftKings, FanDuel, Pinnacle)</td><td>30min</td></tr>
<tr><td><strong>Unibet (scraping HTML)</strong></td><td>H2H + totaux (NBA + EL) + props joueurs pts/3pts O/U (NBA)</td><td>5min</td></tr>
<tr><td><strong>Betclic (gRPC-Web)</strong></td><td>H2H + totaux (NBA + EL) + props pts O/U via catégorie <code>ca_bkb_scrs</code> (f10) + reb/ast/3pts paliers via <code>ca_bkb_pprp</code> (f15)</td><td>5min</td></tr>
<tr><td><strong>Winamax (scraping)</strong></td><td>H2H + totaux (NBA + EL) + props joueurs pts/ast O/U (NBA + EL)</td><td>5min</td></tr>
<tr><td><strong>RotoWire (scraping)</strong></td><td>Compositions probables + MAY NOT PLAY + liste blessés (NBA uniquement)</td><td>15min</td></tr>
</tbody>
</table>
<h3>EuroLeague</h3>
<table>
<thead><tr><th>Source</th><th>Ce qu'elle apporte</th><th>Cache</th></tr></thead>
<tbody>
<tr><td><strong>api-live.euroleague.net</strong></td><td>Scoreboard EL en live — auto-patch des fixtures statiques</td><td>5min</td></tr>
<tr><td><strong>bzzoiro API</strong></td><td>Rosters (stats saison L15), gamelogs, schedules, boxscores</td><td>6h</td></tr>
<tr><td><strong>Betclic (gRPC-Web)</strong></td><td>Props joueurs pts O/U + reb/ast/3pts paliers</td><td>5min</td></tr>
<tr><td><strong>Winamax / Unibet (scraping)</strong></td><td>H2H + totaux + props joueurs</td><td>5min</td></tr>
</tbody>
</table>

<h3>Ligues EU — ACB / LNB / BBL / Lega A</h3>
<table>
<thead><tr><th>Source</th><th>Ce qu'elle apporte</th><th>Cache</th></tr></thead>
<tbody>
<tr><td><strong>api-sports.io Basketball v1</strong></td><td>Scoreboard live, standings (ppg/oppg), H2H, lineups confirmées, team schedule</td><td>5min–6h</td></tr>
<tr><td><strong>bzzoiro API</strong></td><td>Rosters + stats EWA L15 + gamelogs + boxscores (ACB/BBL/Lega A + quelques équipes LNB)</td><td>6h</td></tr>
<tr><td><strong>legabasket.it (scraping)</strong></td><td>Starters officiels Lega A via <code>sf=1</code> dans <code>__NEXT_DATA__</code></td><td>15min</td></tr>
<tr><td><strong>Betclic (gRPC-Web)</strong></td><td>Props joueurs pts/reb/ast/3pts quand marché disponible (LNB principalement)</td><td>5min</td></tr>
<tr><td><strong>Unibet / Betclic / Winamax</strong></td><td>H2H + totaux O/U pour tous les matchs EU (auto-refresh 5 min en background)</td><td>5min</td></tr>
</tbody>
</table>

<h2>Modèle de projection joueurs — computeEstimate</h2>
<p>C'est le cœur de l'application. Il prend en entrée un joueur, son contexte (équipe, adversaire, date, round), et retourne une projection pts/reb/ast/tpm (3pts) ajustée. Tous les facteurs sont multiplicatifs et bornés.</p>
<p><strong>Portée :</strong> NBA + EuroLeague. Pour l'EL, les schedules bzzoiro (ptsScored/ptsAllowed) sont scalés ×1.414 (= 114.5/81) avant d'entrer dans les fonctions modèle, de sorte que les mêmes constantes NBA fonctionnent correctement en relatif. La probabilité implicite blowout utilise Unibet H2H à la place de Pinnacle pour l'EL. Pas de blessures RotoWire pour l'EL (source inexistante).</p>
<p><strong>3pts (tpm) — ajouté le 10 juin 2026 :</strong> même pipeline de projection que pts/reb/ast (EWA L10 + blend moyenne saison + H2H + sharedMult). Disponible pour NBA, WNBA et ACB/BBL/Lega A (Bzzoiro fournit le gamelog 3pts au format "M-A"). Affiché dans la colonne "3pts" de la section Projetées d'Analyse Props.</p>

<h3>Formules</h3>
<div class="formula">pts  = s.pts  × formPPM × trend × h2h × streak × usage × sharedMult
reb  = s.reb  × formReb × trendReb × sharedMult
ast  = s.ast  × formAst × trendAst × sharedMult
tpm  = s.tpm  × formTpm × h2hTpm × sharedMult

sharedMult = pace × def × rest × density × location × playoff × vegasTotal × blowout × injury</div>

<h3>Les 14 facteurs</h3>
<table>
<thead><tr><th>#</th><th>Facteur</th><th>Plage</th><th>Source</th></tr></thead>
<tbody>
<tr><td>1</td><td><strong>Forme pts/min EWA L7</strong> — PPM pondéré (decay 0.82) L7, normalisé par médiane des minutes. Neutralise le garbage time.</td><td>0.60–1.45</td><td>Gamelogs ESPN</td></tr>
<tr><td>2</td><td><strong>Tendance EWA</strong> — EWA L3 vs EWA L4-10. Accélération ou décélération récente.</td><td>0.90–1.10</td><td>Gamelogs ESPN</td></tr>
<tr><td>3</td><td><strong>Streak (série)</strong> — 3+ matchs consécutifs au-dessus/sous la moyenne → +1.5% par match supplémentaire.</td><td>0.88–1.12</td><td>Gamelogs ESPN</td></tr>
<tr><td>4</td><td><strong>USG% récent vs historique</strong> — L5 vs L6-20. Détecte un changement de rôle (blessure partenaire, décision coach).</td><td>0.90–1.10</td><td>Gamelogs ESPN</td></tr>
<tr><td>5</td><td><strong>H2H vs adversaire</strong> — Moyenne réelle du joueur contre cet adversaire précis dans ses gamelogs.</td><td>0.70–1.30</td><td>Gamelogs ESPN</td></tr>
<tr><td>6</td><td><strong>Pace adversaire</strong> — Total pts/match L5 adverse vs référence 227 pts (NBA) / scores EL scalés ×1.414.</td><td>0.90–1.10</td><td>Schedule ESPN / bzzoiro</td></tr>
<tr><td>7</td><td><strong>Défense adverse</strong> — Pts encaissés/match global, ou par position G/F/C (stats.nba.com si dispo — NBA uniquement).</td><td>0.75–1.25</td><td>Schedule + stats.nba.com</td></tr>
<tr><td>8</td><td><strong>Repos / B2B</strong> — B2B → ×0.94 | 2j repos → ×1.00 | 3j+ → ×1.03</td><td>0.94–1.03</td><td>Schedule ESPN</td></tr>
<tr><td>9</td><td><strong>Densité calendrier</strong> — 3 matchs en 5j → ×0.92 | 2 en 3j → ×0.96</td><td>0.92–1.00</td><td>Schedule ESPN</td></tr>
<tr><td>10</td><td><strong>Domicile / Extérieur</strong> — Dom → ×1.025 | Ext → ×0.975</td><td>0.975–1.025</td><td>Fixture</td></tr>
<tr><td>11</td><td><strong>Période (playoffs)</strong> — Finales ×0.93 | CF ×0.95 | 2e tour ×0.96 | 1er tour ×0.97</td><td>0.93–1.00</td><td>Fixture round</td></tr>
<tr><td>12</td><td><strong>Total Vegas</strong> — gameTotal / 227. Si les books voient 215, tout le monde score moins.</td><td>0.85–1.10</td><td>The Odds API</td></tr>
<tr><td>13</td><td><strong>Blowout / garbage time</strong> — Probabilité implicite &gt;82% → ×0.92 | &gt;74% → ×0.96. Source : Pinnacle H2H (NBA), Unibet H2H (EL).</td><td>0.92–1.00</td><td>Pinnacle / Unibet H2H</td></tr>
<tr><td>14</td><td><strong>Blessure / retour</strong> — Out → null | Retour après &gt;8j → ×0.78 | Minutes réduites → ratio direct (min 0.72) | Blessé incertain → ×0.88. NBA uniquement (RotoWire).</td><td>0–1.00</td><td>RotoWire + ESPN</td></tr>
</tbody>
</table>

<p><strong>EWA decay = 0.82 :</strong> le match le plus récent pèse ~5× plus que le 7ème. Le L3 représente ~60% du poids total.</p>
<p><strong>Filtrage playoffs :</strong> quand le round est détecté comme playoff, les gamelogs sont filtrés aux matchs depuis le 1er avril de l'année du match. Évite la contamination saison régulière (pace plus élevé, défenses moins intenses). Fallback sur tous les matchs si moins de 3 gamelogs playoffs disponibles.</p>

<h2>Modèle Total O/U — computeGameTotal</h2>
<p>Prédit le total de points du match et le compare à la ligne du bookmaker.</p>

<div class="formula">homeExpected = EWA7(homeOff) × (awayDefAllowed / 113.5)
awayExpected = EWA7(awayOff) × (homeDefAllowed / 113.5)

estimated = (homeExpected × homeLocFactor + awayExpected × awayLocFactor)
           × ouTrendFactor × playoffFactor × avgRestFactor × avgDensityFactor

P(Over) = 1 - studentT4CDF((line - estimated) / std)</div>

<table>
<thead><tr><th>Facteur</th><th>Valeurs</th></tr></thead>
<tbody>
<tr><td><strong>Splits domicile/extérieur</strong></td><td>±5% max selon les 5 derniers matchs chez soi/à l'extérieur</td></tr>
<tr><td><strong>O/U trend</strong></td><td>% matchs au-dessus baseline (215 PO, 227 régulière) → 0.92–1.08</td></tr>
<tr><td><strong>Pace matchup</strong></td><td>√(paceTotal domicile × paceTotal extérieur / (2×avgPtsAllowed)²) → 0.93–1.07. Deux équipes rapides → tempo qui s'emballe.</td></tr>
<tr><td><strong>Momentum récent (L3)</strong></td><td>Moyenne (total des 3 derniers matchs / total habituel) pour chaque équipe → 0.95–1.05</td></tr>
<tr><td><strong>Playoff factor renforcé</strong></td><td>Finales ×0.87 | CF ×0.90 | 2e tour ×0.93 | 1er tour ×0.95</td></tr>
<tr><td><strong>Repos moyen</strong></td><td>Moyenne (restFactor domicile + restFactor extérieur)</td></tr>
<tr><td><strong>Densité moyenne</strong></td><td>Moyenne (densityFactor domicile + densityFactor extérieur)</td></tr>
<tr><td><strong>Ancrage historique</strong></td><td>estimated = 40% modèle + 60% moyenne réelle des totaux des 2 équipes (si ≥4 matchs dispo chacune) — évite les projections trop extrêmes</td></tr>
</tbody>
</table>
<p>Plafond probabilité : <code>P(Over)</code> et <code>P(Under)</code> sont plafonnés à 88% (un total n'est jamais "certain").</p>

<h2>Système d'alertes</h2>

<div class="alert-box">
<h3>Système 1 — Props joueurs (front-end, localStorage)</h3>
<p>Déclencheur : l'utilisateur ouvre le panneau "Analyse Props". Conditions : (1) la probabilité dépasse le plancher de la catégorie concernée — depuis la recalibration du 8 juin 2026 (nuit), ce plancher correspond au seuil « haute confiance » (badge vert) différencié par stat × ligue (ex. NBA pts 70%, NBA reb 62%, EU ast 70% — voir le tableau « Seuils d'alertes » plus bas) ; (2) cote Unibet OU Betclic ≥ 1.55 sur le sens choisi (Winamax ignoré) — alignement avec le Système 2, seuil ajusté le 8 juin 2026 (soir) de 1.70 à 1.55 (≈55€ de gain net pour 100€ misés, jugé suffisant). Joueur Out → skippé. Stockage localStorage (<code>nba_alerts</code>) avec 3 statuts : pending / accepted / rejected.</p>
<p>Données incluses : joueur, équipe, fixture, stat, ligne bookmaker, estimation modèle, direction, probabilité (%), cotes Unibet + Winamax, statut blessure, timestamp.</p>
</div>

<div class="alert-box">
<h3>Système 2 — Background alerts (backend, toutes les 20 min)</h3>
<p>Job automatique côté serveur, toutes les 20 min. Scope : NBA, WNBA, EuroLeague, ACB, LNB, BBL, Lega A. Priorité des lignes : Unibet → Betclic → Winamax. Condition : la probabilité dépasse le plancher différencié de la catégorie (stat × titulaire/remplaçant × ligue — voir tableau « Seuils d'alertes »). Endpoint : <code>GET /api/nba/background-alerts</code>. Merge intelligent : pas de remise en pending si l'utilisateur a déjà statué, sauf si la ligne bouge de ≥1 point ou les cotes de ≥15%.</p>
<p><strong>Rafraîchissement des alertes en attente (15 juin 2026)</strong> : une alerte <em>pending</em> est entièrement recalculée à chaque cycle (probabilité, ligne, cotes Unibet/Betclic/Winamax) — si une cote Betclic apparaît ou qu'une cote/ligne bouge, l'alerte affichée se met à jour automatiquement, sans action de l'utilisateur. Si la ligne change (nouvel identifiant d'alerte), l'ancienne version est supprimée au profit de la nouvelle (une seule alerte pending par joueur/stat). Si l'alerte ne qualifie plus du tout au cycle suivant (ligne/cote ayant trop bougé), elle reste affichée avec un badge <strong>OBSOLÈTE</strong> — à fermer manuellement via l'icône ✗.</p>
</div>

<div class="alert-box">
<h3>Système 3 — Total O/U (match ouvert + background, toutes les 20 min)</h3>
<p><strong>Front-end</strong> : <code>computeGameTotal</code> tourne dès qu'un match est ouvert (widget Total O/U). <strong>Backend</strong> (10 juin 2026) : même modèle complet porté côté serveur, exécuté toutes les 20 min pour NBA, WNBA, ACB, BBL, Lega A, en deux étapes :</p>
<ol style="margin:4px 0 8px 18px; padding:0">
<li><strong>Étape 1 (filtre rapide)</strong> : modèle simple <code>homeOff×(awayDef/leagueAvg) + awayOff×(homeDef/leagueAvg)</code> vs ligne bookmaker — edge ≥ 5% (NBA/WNBA) ou ≥ 4% (ACB/BBL/Lega A). Évite de lancer le modèle complet (pace/momentum/repos/densité = fetchs supplémentaires) sur chaque match à chaque cycle.</li>
<li><strong>Étape 2 (modèle complet)</strong> : si l'étape 1 passe, <code>computeGameTotal</code> complet (pace matchup, momentum, repos, densité, facteur playoffs, ancrage historique) calcule <code>P(Over)</code> / <code>P(Under)</code>. Alerte déclenchée si <strong>max(P(Over), P(Under)) ≥ 80%</strong> (<code>TOTAL_ALERT_PROB</code>, abaissé de 90% le 10 juin 2026 — un écart-type de ~12pts NBA / ~20pts WNBA rend 90% quasi inatteignable sur un total).</li>
</ol>
<p>Filtre supplémentaire : alerte bloquée si un joueur clé (≥15 pts/match, l'un ou l'autre camp) est Questionable/GTD/Doubtful en playoffs (avril-juin) et qu'on est à ≤2h30 du tip-off.</p>
<p>Stockage localStorage (<code>nba_game_total_alerts</code>), affiché dans Alertes (pending) puis dans le widget du match. Badge OVER/UNDER, vert (over) ou rouge (under).</p>
</div>

<div class="alert-box">
<h3>Système 4 — Football BTTS / Over-Under / Résultat (background, toutes les 20 min)</h3>
<p>Modèle Poisson <code>computeLambdas</code> (attaque/défense normalisées, λ rescalé par la moyenne de buts de la ligue × avantage domicile). Scope : 5 grands championnats (Ligue 1, PL, Liga, Bundesliga, Serie A) + Coupe du Monde (CDM, avgGF/avgGA recalculés dynamiquement sur le pool d'équipes qualifiées).</p>
<table>
<thead><tr><th>Alerte</th><th>Calcul</th><th>Seuil</th></tr></thead>
<tbody>
<tr><td><strong>BTTS</strong></td><td><code>(1-P(dom=0)) × (1-P(ext=0))</code></td><td>≥ 68% (<code>FB_BTTS_ALERT_PROB</code>)</td></tr>
<tr><td><strong>Total O/U</strong></td><td><code>P(Over) = 1 - Σ Poisson(λdom+λext, k≤ligne)</code>, ligne 2.5 puis fallback 1.5</td><td>≥ 65% (<code>FB_OU_ALERT_PROB</code>)</td></tr>
<tr><td><strong>Résultat 1X2</strong> (15 juin 2026)</td><td><code>compute1X2Probs</code> — grille Poisson indépendante λdom×λext, somme par i&gt;j (dom), i=j (nul), i&lt;j (ext)</td><td>≥ 65% par issue (<code>FB_RESULT_ALERT_PROB</code>)</td></tr>
</tbody>
</table>
<p>Le <strong>Résultat 1X2</strong> traite chaque issue (victoire dom. / nul / victoire ext.) comme un pari oui/non indépendant — exactement comme BTTS — et non comme une sélection 3 voies exclusive. Comme deux issues ne peuvent pas dépasser 65% simultanément, au maximum 1 alerte "résultat" par match. Cotes comparées : Unibet/Betclic (scraping — Winamax foot non scrappé depuis le 11 juin 2026).</p>
<p>Cote minimale : 1.45 (<code>FB_MIN_ODDS</code>, meilleure cote Unibet/Betclic sur le sens proposé). Une alerte par fixture et par type. Stockage localStorage : <code>fb_btts_alerts</code> / <code>fb_total_alerts</code> / <code>fb_result_alerts</code>, affichées dans Alertes (pending) puis converties en groupe compact dans Running une fois acceptées.</p>
<p><strong>Règlement</strong> : seules les fixtures CDM (<code>fdcdm_*</code>, via <code>/api/fd/worldcup</code>) peuvent être réglées automatiquement aujourd'hui. Les 5 championnats européens n'ont pas encore de source de scores finaux (à combler à la reprise des championnats, ~août 2026). Le Résultat 1X2 ne peut se régler qu'au coup de sifflet final (contrairement à BTTS/O-U qui peuvent être "déjà gagnés" en live).</p>
</div>

<div class="alert-box pending">
<h3>Value bets football (The Odds API)</h3>
<div class="formula" style="margin:8px 0">fair_prob = (1/pinnacle_odds) / overround
edge = bookmaker_odds × fair_prob - 1</div>
<p>Seuil : 2% par défaut. Endpoint <code>GET /api/alerts</code>.</p>
</div>

<h2>Système blessures — NBA / WNBA / EL</h2>
<p>Deux sources fusionnées via <code>GET /api/nba/injuries</code> (NBA) et <code>GET /api/wnba/injuries</code> (WNBA) :</p>
<table>
<thead><tr><th>Source</th><th>Ce qu'elle apporte</th><th>Cache</th></tr></thead>
<tbody>
<tr><td>RotoWire injuries page</td><td>Liste complète du roster NBA/WNBA</td><td>15min</td></tr>
<tr><td>Section MAY NOT PLAY (page lineups)</td><td>Données spécifiques au match du jour — override prioritaire</td><td>15min</td></tr>
</tbody>
</table>
<table>
<thead><tr><th>Statut</th><th>Badge UI</th><th>Impact modèle</th></tr></thead>
<tbody>
<tr><td>Out</td><td>OUT (rouge)</td><td>Pas de calcul, pas d'alerte + redistribution USG aux coéquipiers actifs</td></tr>
<tr><td>Doubtful</td><td>DTB (rouge)</td><td>×0.88</td></tr>
<tr><td>Questionable</td><td>Q (orange)</td><td>×0.88 (ou moins si minutes réduites)</td></tr>
<tr><td>Day-To-Day</td><td>DTD (orange)</td><td>×0.88</td></tr>
</tbody>
</table>
<h3>Redistribution USG quand un joueur est OUT</h3>
<p>Quand un joueur est déclaré OUT, ses minutes/possessions sont automatiquement redistribuées aux coéquipiers actifs, proportionnellement à leur propre poids. La proxy utilisée dépend des données disponibles par ligue :</p>
<table>
<thead><tr><th>Ligue</th><th>Proxy utilisé</th><th>Source</th></tr></thead>
<tbody>
<tr><td>NBA</td><td>USG% (usage rate officiel)</td><td>stats.nba.com</td></tr>
<tr><td>WNBA</td><td>Minutes moyennes</td><td>ESPN WNBA</td></tr>
<tr><td>EL</td><td>Points moyens</td><td>bzzoiro.com</td></tr>
</tbody>
</table>
<p>Formule : <code>redistributionFactor = (activeSum + outSum) / activeSum</code>, plafonné à ×1.25. Ne s'active que si les joueurs OUT représentent plus de 10% du poids total de l'équipe.</p>
<h3>Transition Q→OUT en cours de session</h3>
<p>Si un joueur était <strong>Questionable</strong> (projection calculée et gelée en localStorage), puis passe <strong>OUT</strong> avant le match : le gel est automatiquement cassé pour cette équipe, les projections sont recalculées avec redistribution, et le nouveau gel remplace l'ancien. Le joueur OUT est retiré de la liste, ses coéquipiers voient leurs projections réévaluées à la hausse.</p>
<p>Si une <strong>alerte Props</strong> avait été créée pour ce joueur, un badge <strong>! orange</strong> apparaît sur la carte avec le message "Joueur déclaré OUT après alerte".</p>

<h2>Architecture des caches</h2>
<table>
<thead><tr><th>Donnée</th><th>TTL</th></tr></thead>
<tbody>
<tr><td>ESPN roster / schedule / gamelog</td><td>6h</td></tr>
<tr><td>ESPN scoreboard</td><td>30s (live) / 5min</td></tr>
<tr><td>ESPN boxscore</td><td>5min</td></tr>
<tr><td>stats.nba.com (USG%, défense par pos)</td><td>6h</td></tr>
<tr><td>RotoWire lineups</td><td>15min</td></tr>
<tr><td>RotoWire injuries</td><td>15min</td></tr>
<tr><td>Basketball odds (Unibet/Betclic/Winamax)</td><td>5min</td></tr>
<tr><td>Player props</td><td>30min</td></tr>
<tr><td>Football odds (The Odds API, disque)</td><td>30min</td></tr>
<tr><td>Vegas game total</td><td>30min</td></tr>
<tr><td>Background NBA odds (Pinnacle)</td><td>2h</td></tr>
</tbody>
</table>

<h2>Ce qui reste à construire</h2>
<table>
<thead><tr><th>Item</th><th>Statut</th></tr></thead>
<tbody>
<tr><td><strong>TS% / eFG% dans le modèle</strong></td><td>Documenté, pas encore dans computeEstimate</td></tr>
<tr><td><strong>Système 2 complet</strong> (Pinnacle vs FR books)</td><td>En attente retour des requests Pinnacle API</td></tr>
<tr><td><strong>NBA Official Injury Report</strong> (PDF officiel)</td><td>Non implémenté — RotoWire suffit pour l'instant</td></tr>
<tr><td><strong>Modèle moneyline</strong> (qui gagne ?)</td><td>Pas encore conçu — prochaine étape logique</td></tr>
<tr><td><strong>Play types</strong> (isolation PPP, P&amp;R)</td><td>NBA Stats API non officielle — endpoint backend prêt</td></tr>
</tbody>
</table>

<div class="footer">ValueBet · Généré le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} · Usage interne</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}

export default function UtilisationPage() {
  const [sport, setSport] = useState('basketball');
  const isFoot = sport === 'football';
  const isBasket = sport === 'basketball';

  return (
    <div className="util-page">
      <div className="util-header">
        <h1 className="util-title">Documentation technique</h1>
        <p className="util-subtitle">Sources des données, fonctionnement des algorithmes et lexique des abréviations.</p>
        <button
          onClick={openReviewPDF}
          style={{
            marginTop: '0.75rem',
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.45rem 1rem', borderRadius: 7, border: '1px solid rgba(251,146,60,0.4)',
            background: 'rgba(251,146,60,0.1)', color: '#fb923c',
            fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M7 1v8M4 6l3 3 3-3M2 11h10"/>
          </svg>
          Télécharger la review PDF
        </button>
      </div>

      {/* Sport toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.75rem' }}>
        {[
          { key: 'football', label: '⚽ Football' },
          { key: 'basketball', label: '🏀 Basketball' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSport(key)}
            style={{
              padding: '0.4rem 1.1rem', borderRadius: 7, cursor: 'pointer',
              fontSize: 12, fontWeight: 700, letterSpacing: '0.02em',
              border: `1px solid ${sport === key ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.1)'}`,
              background: sport === key ? 'rgba(251,146,60,0.12)' : 'transparent',
              color: sport === key ? '#fb923c' : 'var(--text-dim)',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── SOURCES ── */}
      <Accordion title="Sources des données">
        <div className="util-cards">

          {/* ── Football seulement ── */}
          {isFoot && <>
            <div className="util-card">
              <div className="util-card-header">
                <span className="util-badge util-badge--key">Clé requise</span>
                <span className="util-card-name">football-data.org</span>
              </div>
              <p className="util-card-desc">Source principale de calendrier et de classements pour 5 ligues majeures. Limite stricte de 10 req/min — délai de 200 ms entre chaque requête ligue côté backend pour rester dans le quota.</p>
              <table className="util-table">
                <thead><tr><th>Donnée</th><th>Ligues</th><th>Cache</th></tr></thead>
                <tbody>
                  <tr><td>5 prochains matchs par ligue</td><td>L1, PL, Liga, Bundes, Serie A</td><td>30 min</td></tr>
                  <tr><td>Classement (standings)</td><td>Toutes ligues</td><td>30 min</td></tr>
                </tbody>
              </table>
            </div>

            <div className="util-card">
              <div className="util-card-header">
                <span className="util-badge util-badge--key">Clé requise</span>
                <span className="util-card-name">API-Football (api-sports.io)</span>
              </div>
              <p className="util-card-desc">Source alternative enrichie de statistiques de classement et de l'historique des confrontations directes. Quota serré : 100 req/jour.</p>
              <table className="util-table">
                <thead><tr><th>Donnée</th><th>Ligues</th><th>Cache</th></tr></thead>
                <tbody>
                  <tr><td>5 prochains matchs + classement</td><td>L1, PL, Liga, Bundes, Serie A</td><td>30 min</td></tr>
                  <tr><td>H2H (5 dernières confrontations)</td><td>Toutes ligues</td><td>30 min</td></tr>
                </tbody>
              </table>
            </div>
          </>}

          {/* ── Basketball seulement ── */}
          {isBasket && <>
            <div className="util-card">
              <div className="util-card-header">
                <span className="util-badge util-badge--free">Gratuit · Sans clé</span>
                <span className="util-card-name">ESPN API (non-officielle)</span>
              </div>
              <p className="util-card-desc">Source principale pour toutes les données NBA. Plusieurs endpoints sont utilisés en parallèle. <em>* Cache 5 min pour le box score afin de capter les corrections post-match de la NBA.</em></p>
              <table className="util-table">
                <thead><tr><th>Donnée</th><th>Endpoint utilisé</th><th>Cache</th></tr></thead>
                <tbody>
                  <tr><td>Rosters + stats de base (PTS/REB/AST)</td><td>…/teams/{'{id}'}/roster</td><td>6 h</td></tr>
                  <tr><td>Gamelogs par joueur (FGA/FTA/TO/MIN)</td><td>…/athletes/{'{id}'}/gamelog</td><td>6 h</td></tr>
                  <tr><td>Schedule par équipe (résultats passés)</td><td>…/teams/{'{id}'}/schedule</td><td>6 h</td></tr>
                  <tr><td>Matchs en direct / scoreboard</td><td>…/nba/scoreboard</td><td>Temps réel</td></tr>
                  <tr><td>Box score complet (stats réalisées)</td><td>…/nba/summary?event={'{id}'}</td><td>5 min*</td></tr>
                </tbody>
              </table>
            </div>

            <div className="util-card">
              <div className="util-card-header">
                <span className="util-badge util-badge--free">Gratuit · Sans clé</span>
                <span className="util-card-name">RotoWire (scraping HTML)</span>
              </div>
              <p className="util-card-desc">Source des compositions probables et confirmées NBA/WNBA/EL. La page publique contient les lineups du jour — scraping HTML côté backend.</p>
              <table className="util-table">
                <thead><tr><th>Donnée</th><th>Source</th><th>Cache</th></tr></thead>
                <tbody>
                  <tr><td>Compos probables (5 titulaires)</td><td>rotowire.com/basketball/nba-lineups.php</td><td>15 min</td></tr>
                  <tr><td>Compos confirmées</td><td>Même page — badge "Confirmé" ~1h avant tip-off</td><td>15 min</td></tr>
                </tbody>
              </table>
            </div>

            <div className="util-card">
              <div className="util-card-header">
                <span className="util-badge util-badge--key">Clé requise</span>
                <span className="util-card-name">api-sports.io Basketball v1 — Ligues EU</span>
              </div>
              <p className="util-card-desc">Source principale pour ACB, LNB, BBL et Lega A. Quota : 7 500 req/jour.</p>
              <table className="util-table">
                <thead><tr><th>Donnée</th><th>Ligues</th><th>Cache</th></tr></thead>
                <tbody>
                  <tr><td>Scoreboard live (matchs + scores)</td><td>ACB, LNB, BBL, Lega A</td><td>30s (live) / 5min</td></tr>
                  <tr><td>Classements standings (ppg / oppg)</td><td>Toutes ligues EU</td><td>6h</td></tr>
                  <tr><td>H2H (saison en cours + précédente)</td><td>Toutes ligues EU</td><td>6h</td></tr>
                  <tr><td>Lineups confirmées (~1-2h avant tip-off)</td><td>Toutes ligues EU</td><td>10min</td></tr>
                  <tr><td>Team schedule (ptsScored / ptsAllowed)</td><td>Toutes ligues EU</td><td>6h</td></tr>
                </tbody>
              </table>
            </div>

            <div className="util-card">
              <div className="util-card-header">
                <span className="util-badge util-badge--key">Clé requise</span>
                <span className="util-card-name">Bzzoiro API — ACB / BBL / Lega A</span>
              </div>
              <p className="util-card-desc">Source des rosters, gamelogs et boxscores pour ACB, BBL, Lega A et EuroLeague. Monaco, Paris Basketball et Lyon-Villeurbanne (LNB) sont aussi couverts.</p>
              <table className="util-table">
                <thead><tr><th>Donnée</th><th>Ligues</th><th>Cache</th></tr></thead>
                <tbody>
                  <tr><td>Rosters + stats saison EWA L15 (pts/reb/ast)</td><td>ACB, BBL, Lega A, EL, LNB partiel</td><td>6h</td></tr>
                  <tr><td>Gamelogs joueurs</td><td>Mêmes ligues</td><td>6h</td></tr>
                  <tr><td>Boxscores (matchs en cours ou terminés)</td><td>ACB, BBL, Lega A, EL</td><td>5min</td></tr>
                </tbody>
              </table>
            </div>

            <div className="util-card">
              <div className="util-card-header">
                <span className="util-badge util-badge--free">Gratuit · Scraping</span>
                <span className="util-card-name">legabasket.it — Starters officiels Lega A</span>
              </div>
              <p className="util-card-desc">Le site officiel de la Lega A expose les starters dans son <code>__NEXT_DATA__</code>. Le backend extrait le champ <code>sf=1</code> (starter flag) dès qu'un match est en cours ou terminé.</p>
              <table className="util-table">
                <thead><tr><th>Donnée</th><th>Disponibilité</th><th>Cache</th></tr></thead>
                <tbody>
                  <tr><td>5 titulaires officiels par équipe</td><td>Dès le tip-off (match live ou terminé)</td><td>15min</td></tr>
                </tbody>
              </table>
            </div>
          </>}

          {/* ── Les deux sports ── */}
          <div className="util-card">
            <div className="util-card-header">
              <span className="util-badge util-badge--free">Gratuit · Sans clé</span>
              <span className="util-card-name">Scraping HTML — Unibet</span>
            </div>
            <p className="util-card-desc">Les pages Unibet embarquent toutes les cotes dans le HTML rendu côté serveur (SSR Angular). On parse directement le JSON <code>groupedMarkets</code> sans clé API ni navigateur headless.</p>
            <table className="util-table">
              <thead><tr><th>Donnée</th><th>Sport</th><th>Cache</th></tr></thead>
              <tbody>
                <tr><td>H2H (1X2)</td><td>Football{isBasket ? ' + Basket NBA/EL' : ' (L1, PL, Liga, Bundes, Serie A)'}</td><td>30 min</td></tr>
                {isBasket && <>
                  <tr><td>Total Over/Under</td><td>Basket NBA/WNBA/EL/ACB/LNB/BBL/Lega A</td><td>5 min</td></tr>
                  <tr><td>Player props pts O/U</td><td>Basket NBA/WNBA</td><td>30 min</td></tr>
                </>}
              </tbody>
            </table>
            {isFoot && <p className="util-card-desc" style={{ marginTop: '0.5rem', fontSize: 11 }}>ℹ️ Scraping des pages ligue (L1, PL, Liga, Bundes, Serie A) puis des pages match en parallèle. Requêtes uniquement à la demande, avec cache agressif.</p>}
          </div>

          <div className="util-card">
            <div className="util-card-header">
              <span className="util-badge util-badge--free">Gratuit · Sans clé</span>
              <span className="util-card-name">Scraping HTML — Betclic</span>
            </div>
            {isFoot
              ? <p className="util-card-desc">Cotes match extraites du JSON <code>selectionMatrix</code> embarqué dans le HTML de chaque page match Betclic.</p>
              : <p className="util-card-desc">Deux canaux : cotes match via JSON <code>selectionMatrix</code> dans le HTML ; props joueurs via API gRPC-Web (protocole protobuf). Catégories : <code>ca_bkb_scrs</code> (pts O/U, path f10) et <code>ca_bkb_pprp</code> (reb/ast paliers, path f15).</p>
            }
            <table className="util-table">
              <thead><tr><th>Donnée</th><th>Sport</th><th>Cache</th></tr></thead>
              <tbody>
                <tr><td>H2H ({isFoot ? '1X2' : '1X2 / 2-way basket'})</td><td>Football{isBasket ? ' + Basket NBA/EL' : ''}</td><td>30 min</td></tr>
                {isBasket && <>
                  <tr><td>Total Over/Under</td><td>Basket NBA/WNBA/EL/ACB/LNB/BBL/Lega A</td><td>5 min</td></tr>
                  <tr><td>Player props pts O/U (<code>ca_bkb_scrs</code>)</td><td>NBA/WNBA/EL/LNB (si marché dispo)</td><td>5 min</td></tr>
                  <tr><td>Player props reb/ast paliers (<code>ca_bkb_pprp</code>)</td><td>NBA/WNBA/EL/LNB (si marché dispo)</td><td>5 min</td></tr>
                </>}
              </tbody>
            </table>
          </div>

          <div className="util-card">
            <div className="util-card-header">
              <span className="util-badge util-badge--free">Gratuit · Sans clé</span>
              <span className="util-card-name">Scraping HTML — Winamax</span>
            </div>
            <p className="util-card-desc">Winamax expose un objet <code>PRELOADED_STATE</code> dans le HTML de ses pages sport. Pour les détails match (totaux + props), on scrape la page individuelle du match.</p>
            <table className="util-table">
              <thead><tr><th>Donnée</th><th>Sport</th><th>Cache</th></tr></thead>
              <tbody>
                <tr><td>H2H ({isFoot ? '1X2' : '1X2 / 2-way basket'})</td><td>Football{isBasket ? ' + Basket NBA/EL' : ''}</td><td>30 min</td></tr>
                <tr><td>Total Over/Under{isFoot ? ' + BTTS' : ''}</td><td>Football{isBasket ? ' + Basket NBA/EL' : ''}</td><td>30 min</td></tr>
                {isBasket && <tr><td>Player props pts/ast O/U</td><td>NBA/WNBA/EL/LNB/ACB (si marché dispo)</td><td>30 min</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="util-card">
            <div className="util-card-header">
              <span className="util-badge util-badge--key">Clé requise</span>
              <span className="util-card-name">The Odds API</span>
            </div>
            <p className="util-card-desc">Source des cotes <strong>Pinnacle</strong> — ligne de référence sharp pour le calcul des edges. Sans cette clé, les colonnes Pinnacle et les calculs d'edge ne s'affichent pas. Quota : 500 req/mois (gratuit).</p>
            <table className="util-table">
              <thead><tr><th>Donnée</th><th>Marché</th><th>Cache</th></tr></thead>
              <tbody>
                {isFoot && <tr><td>Cotes football (H2H + BTTS)</td><td>Pinnacle, Betfair</td><td>30 min · disque</td></tr>}
                {isBasket && <tr><td>Total Vegas NBA (over/under)</td><td>Pinnacle, DraftKings, FanDuel</td><td>30 min</td></tr>}
              </tbody>
            </table>
            {isFoot && <p className="util-card-desc" style={{ marginTop: '0.5rem', fontSize: 11 }}>ℹ️ Cache stocké sur disque pour économiser le quota mensuel. Partagé entre tous les appels pour un même match.</p>}
          </div>

          <div className="util-card">
            <div className="util-card-header">
              <span className="util-badge util-badge--free">Inactif · Sans clé</span>
              <span className="util-card-name">Kambi (API publique)</span>
            </div>
            <p className="util-card-desc">Kambi est le moteur de paris sous-jacent d'Unibet. Conservé dans le code en fallback — remplacé par le scraping HTML direct pour Unibet (foot + basket) depuis que les données scrappées sont plus fraîches et ne subissent pas de rate limiting.</p>
          </div>

        </div>
      </Accordion>

      {/* ── MISE À JOUR ── */}
      <Accordion title="Mise à jour des données">
        <p className="util-intro">Toutes les données sont mises en cache côté backend (Node.js) pour éviter de dépasser les quotas des APIs. Le cache est partagé pour tous les utilisateurs connectés au même serveur.</p>
        <div className="util-refresh-grid">
          {isBasket && (
            <div className="util-refresh-item">
              <span className="util-refresh-icon">⚡</span>
              <div>
                <div className="util-refresh-label">Scoreboard NBA</div>
                <div className="util-refresh-desc">Temps réel — rechargé à chaque appel (30s si live, 5min sinon)</div>
              </div>
            </div>
          )}
          {isFoot && (
            <div className="util-refresh-item">
              <span className="util-refresh-icon">⚽</span>
              <div>
                <div className="util-refresh-label">Fixtures football</div>
                <div className="util-refresh-desc">Cache 30 min — football-data.org + API-Football. Délai 200ms entre ligues (quota 10 req/min).</div>
              </div>
            </div>
          )}
          {isFoot && (
            <div className="util-refresh-item">
              <span className="util-refresh-icon">🕐</span>
              <div>
                <div className="util-refresh-label">Cotes H2H + BTTS</div>
                <div className="util-refresh-desc">Cache 30 min — scraping Unibet + Betclic + Winamax. Bouton refresh dans la box Odds pour forcer la mise à jour.</div>
              </div>
            </div>
          )}
          {isFoot && (
            <div className="util-refresh-item">
              <span className="util-refresh-icon">📡</span>
              <div>
                <div className="util-refresh-label">Pinnacle + Betfair (The Odds API)</div>
                <div className="util-refresh-desc">Cache 30 min stocké sur disque — économise le quota mensuel (500 req/mois). Partagé entre tous les appels pour un même match.</div>
              </div>
            </div>
          )}
          {isBasket && (
            <div className="util-refresh-item">
              <span className="util-refresh-icon">🔄</span>
              <div>
                <div className="util-refresh-label">Cotes basket — background auto toutes les 5 min</div>
                <div className="util-refresh-desc">Job backend automatique : rafraîchit les cotes H2H + O/U de <strong>tous les matchs à venir</strong> (NBA, WNBA, ACB, LNB, BBL, Lega A) sans ouvrir un seul match. Scraping Unibet + Betclic + Winamax avec <code>refresh=1</code>. Aucun appel api-sports.io.</div>
              </div>
            </div>
          )}
          {isBasket && (
            <div className="util-refresh-item">
              <span className="util-refresh-icon">🏀</span>
              <div>
                <div className="util-refresh-label">Props joueurs — auto toutes les 3 min (onglet actif)</div>
                <div className="util-refresh-desc">Quand l'onglet "Joueurs" est ouvert et le match pas encore terminé, les lignes et cotes joueurs sont rafraîchies toutes les 3 min (bypass cache 30min). Gelées dans localStorage avant le match pour consultation post-match.</div>
              </div>
            </div>
          )}
          {isBasket && (
            <div className="util-refresh-item">
              <span className="util-refresh-icon">🕕</span>
              <div>
                <div className="util-refresh-label">Rosters, gamelogs, schedules</div>
                <div className="util-refresh-desc">Cache 6h — ESPN (NBA/WNBA), Bzzoiro (EL/ACB/BBL/Lega A/LNB partiel), api-sports.io (LNB/BBL/Lega A fallback)</div>
              </div>
            </div>
          )}
          {isBasket && (
            <div className="util-refresh-item">
              <span className="util-refresh-icon">📋</span>
              <div>
                <div className="util-refresh-label">Compos basket</div>
                <div className="util-refresh-desc">NBA/WNBA/EL : RotoWire (15 min) · Lega A : legabasket.it scraping dès le tip-off · Autres EU : api-sports.io confirmed (~1-2h avant) ou top-5 stats estimé</div>
              </div>
            </div>
          )}
          <div className="util-refresh-item">
            <span className="util-refresh-icon">📦</span>
            <div>
              <div className="util-refresh-label">Données statiques</div>
              <div className="util-refresh-desc">Fixtures {isFoot ? 'football' : 'basketball'} — mises à jour manuelles dans le code</div>
            </div>
          </div>
        </div>
      </Accordion>

      {/* ── FORMULE PROPS ── */}
      {isBasket && <Accordion title="Formule Props NBA">
        <p className="util-intro">
          L'outil Props estime les statistiques d'un joueur via un <strong>modèle multiplicatif</strong> : chaque facteur est un coefficient appliqué à la base de projection. En playoffs, la base intègre les vraies performances de la série en cours.
        </p>
        <div className="util-formula-box">
          <code>Base playoffs = 50% × EWA(gamelog série) + 50% × Moy. saison</code>
          <br/>
          <code>Estimation = Base × Forme × Tendance × Série × H2H × Pace × Défense × Repos × Lieu × Match série × Total Vegas</code>
        </div>
        <div className="util-subsection" style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}>
          <h4 style={{ fontSize: 12, fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text)' }}>Données playoffs — gamelog série réelle</h4>
          <p className="util-intro">
            En playoffs, le modèle reconstruit le gamelog réel du joueur <strong>dans la série en cours</strong> à partir des boxscores ESPN des matchs précédents. Ces données sont préfixées au gamelog saison régulière : l'EWA (decay 0.82) pondère naturellement les matchs playoffs en tête.
          </p>
          <p className="util-intro">
            La base de projection est un <strong>blend 50/50</strong> entre l'EWA du gamelog fusionné et la moyenne de saison régulière. Avec seulement 3–4 matchs de série, la saison (82 matchs) reste un prior fort — évite les sur-réactions à un G1 exceptionnel ou décevant.
          </p>
          <p className="util-intro">
            Pour le G1 d'une nouvelle série (aucun boxscore disponible), le modèle utilise le gamelog saison régulière seul, avec le facteur <em>Période (playoffs)</em> appliqué.
          </p>
          <p className="util-intro">
            <strong>Rôle réduit (10 juin 2026)</strong> : si les minutes des 3 derniers matchs d'un joueur tombent sous 60% de sa moyenne saison (ex. blessure, rotation réduite), la moyenne saison n'est plus un repère fiable. Le blend bascule alors à ~92% EWA récente / 8% saison, et le plancher (floor) passe de <em>moyenne saison × 0.72</em> à <em>base récente × 0.7</em> — au lieu de coller à une moyenne saison obsolète. Cas corrigé : H. Barnes (saison ~7pts mais ~8min/match récemment) projetait 7.1pts au lieu de ~2pts.
          </p>
        </div>
        <div className="util-factors">
          {[
            { name: 'Forme pts/min (EWA)', range: '×0.60 – ×1.45', desc: 'Moyenne pondérée exponentielle sur le gamelog fusionné (matchs playoffs série + saison régulière), normalisée par les minutes jouées (decay 0.82 : le dernier match pèse ~5× plus que le 7ème). Neutralise les blowouts où le joueur joue 22 min au lieu de 38. Exemple : 20 pts en 24 min = même efficacité que 30 pts en 36 min.' },
            { name: 'Tendance', range: '×0.90 – ×1.10', desc: 'Compare la moyenne EWA des 3 derniers matchs à la moyenne EWA des matchs 4 à 10. Détecte une dynamique haussière ou baissière indépendamment du niveau absolu.' },
            { name: 'Série en cours (streak)', range: '×0.92 – ×1.08', desc: '2+ matchs consécutifs au-dessus ou en dessous de la moyenne → ±4% par match supplémentaire (fenêtre 3 matchs). Symbolisé par 🔥 (série haussière) ou ❄️ (série baissière).' },
            { name: 'USG% (rôle récent)', range: '×0.90 – ×1.10', desc: 'Compare le taux d\'utilisation récent (L5) au taux habituel (matchs 6 à 20). Détecte un changement de rôle — blessure d\'un partenaire clé, nouveau schéma du coach. Un USG% récent +20% supérieur = boost ×1.10.' },
            { name: 'H2H vs adversaire', range: '×0.92 – ×1.08 (PO) / ×0.70 – ×1.30 (RS)', desc: 'Performance historique du joueur spécifiquement contre l\'équipe adverse (gamelogs filtrés par code adversaire). En playoffs, le cap est resserré à ±8% — les données série sont déjà intégrées dans l\'EWA de base, éviter le double-comptage.' },
            { name: 'Pace adversaire', range: '×0.90 – ×1.10', desc: 'Rythme de jeu moyen de l\'équipe adverse sur les 5 derniers matchs (pts totaux / 2). Comparé à la moyenne ligue (227 pts/match total). Un match rapide = plus de possessions = plus de stats pour tout le monde.' },
            { name: 'Défense adverse', range: '×0.80 – ×1.20', desc: 'Moyenne de points encaissés par l\'équipe adverse sur ses 5 derniers matchs. Comparé à la moyenne ligue (113.5 pts/match). Une défense faible = facteur positif.' },
            { name: 'Repos / Back-to-back', range: '×0.94 – ×1.03', desc: 'B2B (0 jour de repos) : ×0.94 — 1 jour : ×1.00 — 2 jours : ×1.02 — 3 jours ou plus : ×1.03. La fatigue est le facteur le plus fiable statistiquement en NBA.' },
            { name: 'Densité calendrier', range: '×0.92 – ×1.00', desc: '3 matchs en 5 jours : ×0.92 — 2 matchs en 3 jours : ×0.96. Capture la fatigue cumulative que le repos seul ne voit pas (ex. B2B la veille + match 2 jours avant = tripleheader).' },
            { name: 'Lieu (domicile/extérieur)', range: '×0.96 – ×1.04 (PO) / ×0.975 – ×1.025 (RS)', desc: 'En playoffs : domicile +4%, extérieur −4% — l\'avantage du terrain est amplifié par la pression et le public partisan. En saison régulière : ±2.5%.' },
            { name: 'Match dans la série (PO)', range: '×0.94 – ×1.03', desc: 'Facteur spécifique aux playoffs. À domicile : légère montée en G4–G7 pour les stars (pression du public). À l\'extérieur : pression croissante G3–G6 (risque élimination ou fermer la série). Appliqué uniquement aux joueurs à fort USG%.' },
            { name: 'Période (playoffs)', range: '×0.93 – ×1.00', desc: 'Appliqué uniquement quand aucune donnée série n\'est disponible (G1). Finales ×0.93 | CF ×0.95 | 2e tour ×0.96 | 1er tour ×0.97. Si des boxscores série existent, ce facteur est désactivé (EWA playoff encode déjà l\'intensité défensive).' },
            { name: 'Total Vegas', range: '×0.85 – ×1.10', desc: 'Over/under du match posé par les bookmakers (DraftKings, FanDuel, Pinnacle), comparé à la moyenne ligue (227 pts). Un total de 215 = marché anticipe un match lent → tous les joueurs ajustés en baisse. Nécessite une clé The Odds API.' },
            { name: 'Blowout / garbage time', range: '×0.92 – ×1.00', desc: 'Basé sur les cotes Pinnacle H2H : si l\'un des deux camps a une probabilité implicite > 82%, le match risque d\'être plié tôt → minutes réduites pour les deux équipes. Appliqué à tous les joueurs. Nécessite une clé The Odds API.' },
            { name: 'Normalisation de rôle', range: '×0.55 – ×1.00', desc: 'Détecte les joueurs remplaçants qui ont joué titulaire en remplacement d\'un blessé : si les minutes récentes (L3) dépassent de +25% la moyenne de saison, la projection est ramenée vers la moyenne habituelle.' },
          ].map(f => (
            <div key={f.name} className="util-factor-row">
              <div className="util-factor-header">
                <span className="util-factor-name">{f.name}</span>
                <span className="util-factor-range">{f.range}</span>
              </div>
              <p className="util-factor-desc">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Métriques d'efficacité — TS% &amp; eFG% <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: 'rgba(251,146,60,0.15)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.3)', marginLeft: 8, verticalAlign: 'middle' }}>À venir</span></h3>
          <p className="util-intro">
            Les points bruts ne disent pas <em>comment</em> un joueur les marque. Un joueur qui score 25 pts à 38% au tir avec 12 tentatives de lancers-francs n'est pas équivalent à un autre qui marque 25 pts à 52% sur 3pts. Ces deux métriques mesurent l'efficacité réelle.
          </p>

          <div className="util-subsection" style={{ marginTop: '0.75rem' }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text)' }}>eFG% — Effective Field Goal %</h4>
            <p className="util-intro">Corrige la valeur supérieure du 3pts par rapport au 2pts. Un tir à 3pts réussi vaut 1.5× un 2pts réussi.</p>
            <div className="util-formula-box">
              <code>eFG% = (FGM + 0.5 × 3PM) / FGA</code>
            </div>
            <p className="util-intro" style={{ marginTop: '0.4rem' }}>
              Exemple : tirer 40% à 3pts = eFG% de 60% — équivalent à un intérieur qui shoote 60% à 2pts. La moyenne ligue tourne autour de <strong>53–55%</strong>. Un shooteur d'élite dépasse 58%.
            </p>
            <p className="util-intro">
              <strong>Usage dans le modèle :</strong> si l'eFG% récent (L7) d'un joueur est significativement au-dessus de son eFG% de saison, sa forme offensive est sous-estimée par les points bruts seuls → boost de projection.
            </p>
          </div>

          <div className="util-subsection" style={{ marginTop: '0.75rem' }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text)' }}>TS% — True Shooting %</h4>
            <p className="util-intro">Va plus loin que l'eFG% en intégrant aussi les lancers-francs (LF). C'est l'indicateur d'efficacité le plus complet.</p>
            <div className="util-formula-box">
              <code>TS% = PTS / (2 × (FGA + 0.44 × FTA))</code>
            </div>
            <p className="util-intro" style={{ marginTop: '0.4rem' }}>
              Le facteur <code>0.44</code> reflète qu'une séquence de LF coûte en moyenne 0.44 possession (les "and-one" en comptent 0.5, les fautes à 2 LF en comptent 0.5, etc.). La moyenne ligue est autour de <strong>57–58%</strong>. Les joueurs élites comme SGA ou Curry dépassent 63–65%.
            </p>
            <p className="util-intro">
              <strong>Usage dans le modèle :</strong> un joueur avec un TS% récent en chute (ex. 52% vs 60% habituel) traverse une période de maladresse → pénalité, même si ses pts bruts semblent corrects à court terme. À l'inverse, un joueur qui retrouve un TS% élevé après une blessure signale un retour à pleine efficacité avant que les lignes bookmaker ne s'ajustent.
            </p>
          </div>

          <div className="util-subsection" style={{ marginTop: '0.75rem' }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text)' }}>Pourquoi c'est important pour les props ?</h4>
            <p className="util-intro">
              Les bookmakers posent leurs lignes principalement sur les moyennes de points bruts. Si un joueur score 22 pts de moyenne mais avec un TS% en baisse depuis 5 matchs (plus de mauvais tirs, moins de lancers), sa ligne à 21.5 pts peut sembler juste alors que sa vraie projection ajustée est à 18–19 pts — c'est un <strong>Under à valeur</strong> que les pts bruts seuls ne voient pas.
            </p>
          </div>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Distribution de probabilité</h3>
          <p className="util-intro">
            Depuis la <strong>refonte du 6 juin 2026</strong>, la probabilité de dépasser un palier utilise une <strong>distribution de Student à 4 degrés de liberté</strong> (queues plus épaisses qu'une loi normale — moins de fausses certitudes extrêmes) : <code>P(X ≥ seuil) = 1 − T₄((seuil − 0.5 − estimation_ajustée) / σ_ajusté)</code>.
          </p>
          <p className="util-intro">
            Avant le calcul, l'estimation est <strong>contractée vers la ligne bookmaker</strong> (shrinkage : pts 35%, reb 12%, ast 14%, tpm (3pts) 20% — les bookmakers intègrent déjà beaucoup d'information). L'écart-type est lui-même élargi (×1.5, plancher pts 4.0 / reb 2.0 / ast 1.5 / tpm 1.0, et un boost supplémentaire si la projection dévie fortement de la moyenne saison du joueur). Résultat : le modèle atteint des % de confiance globalement plus bas et plus réalistes qu'avant la refonte — d'où la recalibration complète des seuils d'alerte ci-dessous.
          </p>
          <p className="util-intro">Les paliers sont adaptatifs : pas de 5 pour les points, pas de 2 pour les rebonds et passes. Ils sont centrés autour de l'estimation finale.</p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Seuils d'alertes — Pourquoi ces %</h3>
          <p className="util-intro">
            Une alerte n'est générée que si la probabilité calculée dépasse un seuil minimum (= « plancher »,<code>ALERT_FLOOR</code> côté serveur). Depuis la <strong>refonte du modèle de probabilité (6 juin 2026)</strong>, ces planchers ont été entièrement recalibrés : l'ancien modèle (loi normale, peu de shrinkage) atteignait facilement 87-94% de confiance, alors que le nouveau (Student-t df=4, shrinkage vers la ligne, écart-type élargi) plafonne naturellement beaucoup plus bas — surtout sur rebonds/passes en NBA et WNBA. Garder les anciens seuils aurait simplement arrêté de générer des alertes (constaté : 0 alerte sur toutes les ligues juste après la bascule).
          </p>
          <p className="util-intro">
            <strong>Resserrement du 8 juin 2026 (soir) :</strong> une première recalibration (alignée sur le bas de la bande « correcte » jaune/cyan) générait un volume d'alertes bien trop élevé, avec beaucoup de % seulement moyens. Le plancher a donc été remonté pour correspondre exactement au seuil <strong>« haute confiance » (badge vert)</strong> de <code>propBadgeClass</code> / <code>propConfColor</code> — n'alerter que sur les % que l'app qualifie elle-même de fiables. La distinction titulaire/remplaçant a été supprimée à cette occasion : le badge vert ne la fait pas non plus, et le modèle intègre déjà cette incertitude via l'écart-type calculé sur les gamelogs réels.
          </p>
          <p className="util-intro">
            Les seuils restent différenciés par <strong>stat</strong> (pts / reb / ast / tpm) et par <strong>groupe de ligue</strong> (NBA et WNBA partagent une distribution de confiance quasi identique ; les ligues EU — ACB/LNB/BBL/Lega A — ont une distribution nettement plus large, surtout sur reb/ast — d'où des seuils différents).
          </p>

          <div style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-dim)', fontWeight: 700 }}>Stat</th>
                  <th style={{ textAlign: 'center', padding: '6px 10px', color: '#60a5fa', fontWeight: 700 }}>NBA / WNBA</th>
                  <th style={{ textAlign: 'center', padding: '6px 10px', color: '#a78bfa', fontWeight: 700 }}>EU (ACB/LNB/BBL/Lega A)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { stat: 'Points',             nba: '70%', eu: '75%' },
                  { stat: 'Rebonds',            nba: '62%', eu: '68%' },
                  { stat: 'Passes décisives',   nba: '58%', eu: '70%' },
                  { stat: '3 points (tpm)',     nba: '62%', eu: '68%' },
                ].map(r => (
                  <tr key={r.stat} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--text)' }}>{r.stat}</td>
                    <td style={{ textAlign: 'center', padding: '6px 10px', color: '#60a5fa', fontWeight: 700 }}>{r.nba}</td>
                    <td style={{ textAlign: 'center', padding: '6px 10px', color: '#a78bfa', fontWeight: 700 }}>{r.eu}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="util-intro" style={{ marginTop: '0.4rem', fontSize: 11 }}>
            Constantes serveur : <code>NBA_ALERT_FLOOR</code> / <code>NBA_ALERT_FLOOR_BENCH</code> (identiques, et identiques pour <code>WNBA_ALERT_FLOOR*</code>) et <code>ALERT_FLOOR</code> / <code>ALERT_FLOOR_BENCH</code> pour les ligues EU (également identiques). Mêmes valeurs côté Système 1 dans <code>BasketballDetailPage.jsx</code> (déclenché à l'ouverture d'Analyse Props).
          </p>

          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {[
              { label: 'Recalibration du 8 juin 2026 (nuit)', color: '#fb923c', text: 'Les planchers du soir (NBA pts 80% / reb 68% / ast 62%, EU pts 78% / reb 83% / ast 85%) filtraient 90%+ des cas réels observés sur les données live (ex. seulement ~7% des projections "points" NBA dépassaient 80%, contre ~30% pour les rebonds à 68%) — trop sélectif, plus aucune alerte ne se déclenchait. Abaissés à NBA pts 70% / reb 62% / ast 58% et EU pts 75% / reb 68% / ast 70%, calibrés pour laisser passer le "haut ~25-30%" de la distribution réelle de chaque catégorie.' },
              { label: 'Points NBA/WNBA — 70%', color: '#60a5fa', text: 'Stat la plus stable : un joueur prend un volume de tirs régulier match après match, le modèle s\'en approche fiablement et atteint sa confiance maximale plus vite — d\'où un seuil vert plus exigeant en valeur absolue mais réellement atteint.' },
              { label: 'Rebonds / Passes NBA/WNBA — 58-62%', color: '#60a5fa', text: 'Stats nettement plus volatiles (dépendent du style de jeu adverse, du positionnement, des rotations) : avec la distribution Student-t à queues épaisses, le modèle dépasse rarement 65-70% sur ces catégories. Le seuil vert a donc été calibré plus bas en valeur absolue, mais représente la même chose : le haut de la plage de confiance atteignable par le modèle sur cette stat précise.' },
              { label: 'Plus de distinction titulaire/remplaçant', color: '#fb923c', text: 'Supprimée le 8 juin au soir : le badge de couleur (vert/jaune/rouge) ne la fait pas non plus, et le modèle intègre déjà la variabilité des minutes d\'un remplaçant via le facteur EWA pts/min et l\'écart-type calculé sur ses gamelogs réels. La garder aurait revenu à pénaliser deux fois la même incertitude.' },
              { label: 'Ligues EU — profil inversé', color: '#a78bfa', text: 'Sur les données ACB/LNB/BBL/Lega A, c\'est l\'inverse de la NBA : les points restent la stat la plus sélective (75%) tandis que rebonds et passes peuvent légitimement atteindre 68-70% — la distribution empirique de confiance y est nettement plus large (jusqu\'à 90%+ contre un plafond ~65-70% en NBA/WNBA sur ces stats).' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, marginTop: 2, width: 8, height: 8, borderRadius: '50%', background: item.color, display: 'inline-block' }} />
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{item.label} — </span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{item.text}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#f87171', marginBottom: '0.3rem' }}>⚠ Règles de sécurité</p>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: '0.3rem' }}>
              <strong style={{ color: 'var(--text)' }}>Plancher 72% :</strong> la projection ne peut jamais descendre sous 72% de la moyenne saison d'un joueur, même si les facteurs s'accumulent négativement. Évite les projections aberrantes dues à des outliers.
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              <strong style={{ color: 'var(--text)' }}>Élargissement de l'écart-type (devBoost) :</strong> quand la projection finale dévie fortement de la moyenne saison du joueur (retour de blessure, changement de rôle…), l'écart-type utilisé dans le calcul de probabilité est élargi (jusqu'à ×2.5 son plancher). Conséquence directe : la confiance ne peut pas devenir artificiellement extrême sur la base d'un ajustement agressif — c'est ce mécanisme, combiné au shrinkage et à la distribution Student-t, qui remplace l'ancien plafonnage brutal de la confiance.
            </p>
          </div>
          <p className="util-intro" style={{ marginTop: '0.6rem', fontSize: 11, fontStyle: 'italic' }}>
            ℹ️ Ces valeurs sont calibrées par analyse des percentiles de la distribution réelle de confiance produite par le nouveau modèle (sur <code>cache/projections-snapshot.json</code>) — ce ne sont pas (encore) des seuils optimisés sur des résultats réels, le nouveau modèle étant trop récent (6 juin 2026) pour disposer d'un historique de paris résolus. Voir <code>project_refonte_validation_watch</code> : à recomparer avec le winrate réel des nouvelles alertes d'ici 1-2 semaines, et ajuster si besoin.
          </p>
        </div>
      </Accordion>}

      {/* ── LIGUES EU BASKET ── */}
      {isBasket && <Accordion title="Ligues européennes basket — ACB · LNB · BBL · Lega A">
        <p className="util-intro">
          Les 4 championnats européens partagent la même interface que la NBA : scoreboard live, compositions, cotes, modèle O/U et Analyse Props. Quelques différences par rapport à la NBA.
        </p>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Modèle Props — calibration par ligue</h3>
          <p className="util-intro">Le modèle est adapté au scoring de chaque ligue. Les schedules (ptsScored/ptsAllowed) sont scalés avant d'entrer dans les fonctions NBA pour que les comparaisons soient correctes.</p>
          <table className="util-table">
            <thead><tr><th>Ligue</th><th>Moy. pts encaissés/match</th><th>Scale factor</th></tr></thead>
            <tbody>
              <tr><td>NBA</td><td>114.5 pts</td><td>×1.00 (référence)</td></tr>
              <tr><td>EuroLeague</td><td>81 pts</td><td>×1.414</td></tr>
              <tr><td>ACB</td><td>83 pts</td><td>×1.38</td></tr>
              <tr><td>BBL</td><td>82 pts</td><td>×1.40</td></tr>
              <tr><td>Lega A</td><td>80 pts</td><td>×1.43</td></tr>
              <tr><td>LNB (Betclic Élite)</td><td>79 pts</td><td>×1.45</td></tr>
            </tbody>
          </table>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Compositions</h3>
          <table className="util-table">
            <thead><tr><th>Source</th><th>Ligue</th><th>Disponibilité</th></tr></thead>
            <tbody>
              <tr><td>legabasket.it (<code>sf=1</code>)</td><td>Lega A</td><td>Dès le tip-off — starters officiels réels</td></tr>
              <tr><td>api-sports.io <code>/lineups</code></td><td>ACB/LNB/BBL/Lega A</td><td>~1-2h avant — label "Compos confirmées"</td></tr>
              <tr><td>Top-5 stats Bzzoiro</td><td>Toutes ligues EU</td><td>En permanence — label "Compos probables"</td></tr>
            </tbody>
          </table>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Props joueurs — couverture bookmakers</h3>
          <table className="util-table">
            <thead><tr><th>Ligue</th><th>Betclic gRPC</th><th>Winamax</th><th>Unibet</th></tr></thead>
            <tbody>
              <tr><td>LNB (Betclic Élite)</td><td>✅ Props individuels</td><td>❌ Totaux équipe uniquement</td><td>❌ Non disponible</td></tr>
              <tr><td>ACB / BBL / Lega A</td><td>❌ Totaux équipe uniquement</td><td>❌</td><td>❌</td></tr>
            </tbody>
          </table>
          <p className="util-intro" style={{ marginTop: '0.5rem', fontSize: 11 }}>ℹ️ Si un bookmaker commence à offrir des props individuels pour une ligue EU, ils apparaîtront automatiquement — le matching est générique.</p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Données affichées en page détail</h3>
          <div className="util-refresh-grid">
            {[
              { icon: '📊', label: 'Classement & Stats saison', desc: 'ppg / oppg depuis les standings api-sports.io — affiché dans le hero et la carte Statistiques saison' },
              { icon: '⚔️', label: 'H2H direct', desc: 'Saison en cours + saison précédente via api-sports.io — section Confrontations directes' },
              { icon: '📈', label: 'Forme récente (V/D)', desc: 'Calculée depuis le team schedule — ptsScored > ptsAllowed = V, sinon D' },
              { icon: '🔄', label: 'Scores live', desc: 'Polling automatique toutes les 30s pendant le match — badge LIVE + scores mis à jour' },
            ].map(item => (
              <div key={item.label} className="util-refresh-item">
                <span className="util-refresh-icon">{item.icon}</span>
                <div>
                  <div className="util-refresh-label">{item.label}</div>
                  <div className="util-refresh-desc">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Accordion>}

      {/* ── VALUE BETS FOOT ── */}
      {isFoot && <Accordion title="Calcul des value bets (football)">
        <p className="util-intro">
          La probabilité implicite "juste" d'un résultat est calculée depuis les cotes Pinnacle en retirant la marge (vig). L'edge représente l'avantage théorique du parieur sur un autre bookmaker.
        </p>
        <div className="util-formula-box">
          <code>prob_juste = (1 / cote_pinnacle) / overround</code>
          <br/>
          <code>overround = Σ (1 / cote) pour tous les résultats</code>
          <br/>
          <code>edge = cote_bookmaker × prob_juste − 1</code>
        </div>
        <p className="util-intro" style={{ marginTop: '0.5rem' }}>
          Un edge positif (ex. +3.5%) signifie que la cote proposée est supérieure à la valeur "juste" selon Pinnacle. Le seuil d'alerte est configuré via <code>VALUE_THRESHOLD</code> dans <code>.env</code> (défaut : 2%).
        </p>
      </Accordion>}

      {/* ── COTES FOOTBALL ── */}
      {isFoot && <Accordion title="Affichage des cotes — OddsTable">
        <p className="util-intro">
          Le composant <strong>OddsTable</strong> s'affiche sur chaque page match. Il présente les cotes de tous les bookmakers côte à côte pour deux marchés : <strong>H2H (1X2)</strong> et <strong>BTTS</strong> (Both Teams To Score — les deux équipes marquent).
        </p>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Bookmakers et sources</h3>
          <table className="util-table">
            <thead><tr><th>Bookmaker</th><th>Source</th><th>Marché</th><th>Cache</th></tr></thead>
            <tbody>
              <tr><td><strong>Pinnacle</strong></td><td>The Odds API</td><td>H2H + BTTS</td><td>30 min · disque</td></tr>
              <tr><td><strong>Betfair</strong></td><td>The Odds API</td><td>H2H + BTTS</td><td>30 min · disque</td></tr>
              <tr><td><strong>Unibet</strong></td><td>Scraping HTML</td><td>H2H</td><td>30 min</td></tr>
              <tr><td><strong>Betclic</strong></td><td>Scraping HTML</td><td>H2H</td><td>30 min</td></tr>
              <tr><td><strong>Winamax</strong></td><td>Scraping HTML</td><td>H2H + BTTS</td><td>30 min</td></tr>
            </tbody>
          </table>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Mise en évidence</h3>
          <div className="util-refresh-grid">
            <div className="util-refresh-item">
              <span className="util-refresh-icon">🟢</span>
              <div>
                <div className="util-refresh-label">Meilleure cote</div>
                <div className="util-refresh-desc">La cote la plus haute sur un résultat donné est mise en vert — indique le bookmaker le plus généreux.</div>
              </div>
            </div>
            <div className="util-refresh-item">
              <span className="util-refresh-icon">📊</span>
              <div>
                <div className="util-refresh-label">Edge vs Pinnacle</div>
                <div className="util-refresh-desc">Affiché en % sous la cote de chaque bookmaker. Edge {'>'} 0 = cote supérieure à la valeur juste. Edge {'>'} 2% = alerte value bet.</div>
              </div>
            </div>
            <div className="util-refresh-item">
              <span className="util-refresh-icon">🔄</span>
              <div>
                <div className="util-refresh-label">Bouton Refresh</div>
                <div className="util-refresh-desc">Force la mise à jour des cotes scrappées (Unibet, Betclic, Winamax) sans attendre l'expiration du cache.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">BTTS — Both Teams To Score</h3>
          <p className="util-intro">
            Marché binaire : est-ce que les deux équipes marquent au moins un but ? La cote Oui/Non est proposée par Pinnacle, Betfair et Winamax. L'edge est calculé de la même façon que le H2H — probabilité implicite Pinnacle vs cote du bookmaker français.
          </p>
          <p className="util-intro">
            <strong>Prochaine étape :</strong> <code>computeBTTS()</code> est déjà en place dans le backend — il utilise les moyennes de buts pour construire une prédiction Poisson. Actuellement basé sur les buts bruts ; sera upgraié vers xG dès l'accès API-Football Pro.
          </p>
        </div>
      </Accordion>}

      {/* ── LISTE FOOTBALL ── */}
      {isFoot && <Accordion title="Affichage de la liste football">
        <p className="util-intro">
          La liste football est construite à partir de <strong>données statiques</strong> (<code>src/utils/fixtures.js</code>). Chaque ligue affiche ses 5 prochains matchs. Il n'y a pas de polling — les fixtures sont mises à jour manuellement dans le code.
        </p>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Ligues couvertes</h3>
          <table className="util-table">
            <thead><tr><th>Compétition</th><th>Pays</th><th>Couleur accent</th></tr></thead>
            <tbody>
              <tr><td><strong>Ligue 1</strong></td><td>France</td><td>Bleu</td></tr>
              <tr><td><strong>Premier League</strong></td><td>Angleterre</td><td>Violet</td></tr>
              <tr><td><strong>La Liga</strong></td><td>Espagne</td><td>Rouge/orange</td></tr>
              <tr><td><strong>Bundesliga</strong></td><td>Allemagne</td><td>Rouge</td></tr>
              <tr><td><strong>Serie A</strong></td><td>Italie</td><td>Bleu foncé</td></tr>
            </tbody>
          </table>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Page détail d'un match</h3>
          <div className="util-refresh-grid">
            <div className="util-refresh-item">
              <span className="util-refresh-icon">📊</span>
              <div>
                <div className="util-refresh-label">StatBar</div>
                <div className="util-refresh-desc">Barres comparatives côte à côte : buts marqués/encaissés, classement, forme. Données issues du classement FIFA.</div>
              </div>
            </div>
            <div className="util-refresh-item">
              <span className="util-refresh-icon">🏆</span>
              <div>
                <div className="util-refresh-label">FormStrip</div>
                <div className="util-refresh-desc">Badges W/D/L des 5 derniers matchs de chaque équipe — visualisation rapide de la forme récente.</div>
              </div>
            </div>
            <div className="util-refresh-item">
              <span className="util-refresh-icon">⚽</span>
              <div>
                <div className="util-refresh-label">H2H (confrontations directes)</div>
                <div className="util-refresh-desc">5 dernières rencontres entre les deux équipes — score, vainqueur, date. Source : API-Football (cache 30min).</div>
              </div>
            </div>
            <div className="util-refresh-item">
              <span className="util-refresh-icon">💰</span>
              <div>
                <div className="util-refresh-label">OddsTable</div>
                <div className="util-refresh-desc">Cotes H2H + BTTS de tous les bookmakers avec edges vs Pinnacle. Chargée à la demande.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Alertes value bets</h3>
          <p className="util-intro">
            L'endpoint <code>GET /api/alerts</code> scanne en temps réel tous les matchs football disponibles via The Odds API. Pour chaque marché H2H et BTTS, il compare les cotes de Unibet, Betclic et Winamax à la ligne Pinnacle démarginée. Toute cote générant un edge supérieur à <code>VALUE_THRESHOLD</code> (2% par défaut dans <code>.env</code>) remonte dans la page <strong>Alertes</strong>.
          </p>
        </div>
      </Accordion>}

      {/* ── ANALYSE PROPS BASKETBALL ── */}
      {isBasket && <Accordion title="Analyse Props — mode d'emploi (Basketball)">
        <p className="util-intro">
          La section <strong>Analyse Props</strong> s'ouvre en cliquant sur l'icône graphique dans la barre d'info d'un match. Disponible pour <strong>NBA, WNBA, EuroLeague, ACB, BBL, Lega A et LNB</strong>. <strong>Cliquer sur le titre "Analyse Props" referme la section.</strong>
        </p>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Deux colonnes + badges % par stat</h3>
          <p className="util-intro">Chaque joueur apparaît sur une seule ligne :</p>
          <table className="util-table">
            <thead><tr><th>Colonne</th><th>Contenu</th><th>Couleur</th></tr></thead>
            <tbody>
              <tr><td><strong>Stats projetées</strong></td><td>Pts / Rebs / Ast — modèle complet. Sous chaque valeur : badge ▲/▼ + % de confiance (probabilité Over ou Under vs ligne bookmaker)</td><td>Blanc</td></tr>
              <tr><td><strong>Stats réalisées</strong></td><td>Stats du match joué — box score ESPN (NBA/WNBA) ou Bzzoiro (EU)</td><td>Vert</td></tr>
            </tbody>
          </table>
          <p className="util-intro" style={{ marginTop: '0.5rem' }}>
            Depuis la recalibration du 8 juin 2026, le badge de couleur n'est plus une bande générique : il est <strong>calculé par catégorie</strong> (stat × groupe de ligues), car chaque catégorie a sa propre plage de confiance atteignable par le modèle (ex. les rebonds NBA plafonnent vers ~70% alors que les rebonds en EU peuvent dépasser 85%). Cette règle est désormais <strong>identique des deux côtés de l'app</strong> — fonction <code>propBadgeClass(stat, league, prob)</code> dans <code>PlaceBetPage.jsx</code> (alertes) et son équivalent <code>propConfColor(stat, league, pct)</code> dans <code>BasketballDetailPage.jsx</code> (Analyse Props, badges ▲/▼) — pour qu'un même % ait toujours la même couleur, qu'il soit vu dans le tableau des joueurs ou sur une carte d'alerte :
          </p>
          <table className="util-table" style={{ marginTop: '0.5rem' }}>
            <thead><tr><th>Catégorie</th><th style={{ color: '#00ff80' }}>Vert (haute confiance)</th><th style={{ color: '#00d4ff' }}>Cyan (correcte)</th><th style={{ color: '#ffb400' }}>Ambre (faible)</th></tr></thead>
            <tbody>
              <tr><td><strong>NBA/WNBA — Points</strong></td><td>≥ 70%</td><td>62–69%</td><td>&lt; 62%</td></tr>
              <tr><td><strong>NBA/WNBA — Rebonds</strong></td><td>≥ 62%</td><td>55–61%</td><td>&lt; 55%</td></tr>
              <tr><td><strong>NBA/WNBA — Passes</strong></td><td>≥ 58%</td><td>52–57%</td><td>&lt; 52%</td></tr>
              <tr><td><strong>EU — Points</strong></td><td>≥ 75%</td><td>67–74%</td><td>&lt; 67%</td></tr>
              <tr><td><strong>EU — Rebonds</strong></td><td>≥ 68%</td><td>61–67%</td><td>&lt; 61%</td></tr>
              <tr><td><strong>EU — Passes</strong></td><td>≥ 70%</td><td>62–69%</td><td>&lt; 62%</td></tr>
            </tbody>
          </table>
          <p className="util-intro" style={{ marginTop: '0.4rem', fontSize: 11 }}>
            Ces bandes sont des <strong>seuils absolus par catégorie</strong> (pas une marge relative au-dessus du plancher d'alerte) : les paliers % sont identiques dans Analyse Props et dans les alertes — un même % franchit toujours les mêmes paliers, ce qui permet de comparer visuellement deux % de catégories différentes d'un coup d'œil. Seules les teintes exactes diffèrent légèrement d'un écran à l'autre pour coller à la palette existante de chacun (vert/cyan/ambre pour les badges d'alerte <code>bc-edge-badge</code>, vert/jaune/rouge pour les badges ▲/▼ d'Analyse Props) — la logique de classement (haute / correcte / faible confiance) reste, elle, rigoureusement la même.
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Compos — sources et confirmation</h3>
          <table className="util-table">
            <thead><tr><th>Source</th><th>Badge</th><th>Disponibilité</th></tr></thead>
            <tbody>
              <tr><td><strong>Manuel (toi)</strong></td><td style={{ color: '#22c55e' }}>Compos confirmées ✓</td><td>Dès que tu enregistres via le bouton "Enregistrer"</td></tr>
              <tr><td><strong>Bzzoiro / Lega A</strong></td><td style={{ color: '#22c55e' }}>Compos confirmées</td><td>~1-2h avant tip-off (EU)</td></tr>
              <tr><td><strong>ESPN</strong></td><td style={{ color: '#22c55e' }}>Compos confirmées</td><td>~1h avant tip-off (NBA/WNBA)</td></tr>
              <tr><td><strong>RotoWire</strong></td><td style={{ color: '#fbbf24' }}>Compos probables</td><td>24h+ avant (NBA)</td></tr>
              <tr><td><strong>Bzzoiro historique</strong></td><td style={{ color: '#fbbf24' }}>Compos probables</td><td>Basé sur is_starter des 60 derniers jours (EU)</td></tr>
            </tbody>
          </table>
          <p className="util-intro" style={{ marginTop: '0.5rem' }}>
            Badge <strong>vert</strong> = starters confirmés sur le terrain. Badge <strong>jaune</strong> = probabilistes. La compo enregistrée manuellement est prioritaire sur toutes les autres sources et persiste pour les prochains matchs entre les mêmes équipes.
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Sync équipe Analyse Props ↔ onglet Joueurs</h3>
          <p className="util-intro">
            Les boutons d'équipe en haut à droite d'<strong>Analyse Props</strong> et de l'onglet <strong>Joueurs</strong> (OddsCard) sont synchronisés dans les deux sens.
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Ordre des joueurs</h3>
          <p className="util-intro">
            Triés par <strong>points décroissants</strong>. Séparateur <em>—— Remplaçants ——</em> après les 5 titulaires.
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Projections gelées (post-it)</h3>
          <p className="util-intro">
            Les projections sont calculées <strong>une seule fois par match</strong> puis gelées dans un snapshot serveur. Elles ne sont recalculées que si un nouveau match des mêmes équipes vient de se terminer (gamelogs mis à jour). Ce système garantit que les pourcentages affichés dans Analyse Props et sur les alertes sont toujours cohérents.
          </p>
        </div>
      </Accordion>}

      {/* ── ALERTES PLACE BET ── */}
      {isBasket && <Accordion title="Alertes — Props (NBA / WNBA / ACB / BBL / Lega A / LNB / EL)">
        <p className="util-intro">
          Les alertes Props sont générées automatiquement en <strong>arrière-plan toutes les 20 min</strong> par le serveur. Couverture : <strong>NBA, WNBA, ACB, BBL, Lega A, LNB et EuroLeague</strong>. Aucune action nécessaire — elles apparaissent directement dans l'onglet <strong>Alertes</strong>.
        </p>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Conditions de déclenchement</h3>
          <table className="util-table">
            <thead><tr><th>Critère</th><th>Valeur</th></tr></thead>
            <tbody>
              <tr><td><strong>Confiance minimum</strong></td><td>Seuil « haute confiance » (badge vert), différencié par stat × groupe de ligue — voir le tableau « Seuils d'alertes » de la section Modèle Props ci-dessus (ex. NBA pts 70%, NBA reb 62%, EU ast 70%, NBA/EU tpm 62%/68%…)</td></tr>
              <tr><td><strong>Edge minimum</strong></td><td>Écart |projection − ligne| ≥ 1.0 (pts/reb/ast/tpm). En dessous, le pari est jugé "pile ou face" — backtest 17 paris : edge &lt; 1.0 → 0% de réussite, edge ≥ 1.0 → 62%.</td></tr>
              <tr><td><strong>Edge renforcé "Under" — franchise players</strong></td><td>Si la moyenne saison du joueur sur cette stat est élevée (pts ≥ 18, reb ≥ 9, ast ≥ 6, tpm ≥ 3 — joueur majeur de son équipe), l'edge minimum passe à 2.0 pour un Under. Ces joueurs peuvent exploser leur ligne n'importe quel soir (ex. A. Reese 9.5 proj. → 17 réel).</td></tr>
              <tr><td><strong>Cote minimum</strong></td><td>Unibet OU Betclic ≥ 1.60 (Winamax ignoré pour le déclenchement)</td></tr>
              <tr><td><strong>Cote plancher</strong></td><td>Cotes &lt; 1.40 nullifiées sur la carte (non affichées)</td></tr>
              <tr><td><strong>Gamelogs minimum</strong></td><td>≥ 3 matchs joués pour calculer un écart-type fiable</td></tr>
            </tbody>
          </table>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Ligne alternative (18 juin 2026)</h3>
          <p className="util-intro">
            Si la ligne principale d'un joueur a une bonne probabilité mais une cote trop juste (&lt; 1.60 partout), le serveur regarde automatiquement les autres lignes disponibles pour ce joueur (visibles sur la page « Toutes les lignes ») — uniquement dans le sens qui fait monter la cote du côté favorisé (ligne plus haute pour un Over, plus basse pour un Under). La probabilité est recalculée entièrement pour chaque ligne testée (jamais réutilisée). Parmi les lignes qui repassent à la fois le seuil de cote et le seuil de confiance, la plus sûre (probabilité la plus haute) est retenue. L'alerte générée affiche alors cette ligne ajustée plutôt que la ligne « par défaut ».
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Ce qu'affiche une carte d'alerte</h3>
          <table className="util-table">
            <thead><tr><th>Champ</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><strong>Joueur · Match · Date</strong></td><td>Nom, équipes et horaire</td></tr>
              <tr><td><strong>▲/▼ Over/Under X stat</strong></td><td>Direction du pari + ligne bookmaker (pts, reb, ast ou tpm/3pts)</td></tr>
              <tr><td><strong>proj. Y</strong></td><td>Projection du modèle pour ce joueur dans ce match</td></tr>
              <tr><td><strong>% confiance</strong></td><td>Probabilité calculée que le pari gagne — identique au % affiché sous la stat dans Analyse Props</td></tr>
              <tr><td><strong>Cotes</strong></td><td>Unibet / Betclic / Winamax. Cliquer sur une cote = accepter le pari avec ce bookmaker</td></tr>
              <tr><td><strong>Bookmaker accepté</strong></td><td>Une fois accepté, seule la cote du bookmaker choisi s'affiche sur la carte compacte</td></tr>
            </tbody>
          </table>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Navigation depuis une alerte</h3>
          <p className="util-intro">
            Cliquer sur une carte d'alerte (pendante ou acceptée) ouvre directement la page du match avec la section <strong>Analyse Props déjà dépliée</strong>. Le × ferme l'alerte sans naviguer.
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Auto-settle — settlement automatique</h3>
          <table className="util-table">
            <thead><tr><th>Ligue</th><th>Source boxscore</th><th>Délai après match</th></tr></thead>
            <tbody>
              <tr><td>NBA / WNBA</td><td>ESPN Boxscore</td><td>~5-15 min</td></tr>
              <tr><td>ACB / BBL / Lega A</td><td>Bzzoiro Boxscore</td><td>~15-45 min</td></tr>
              <tr><td>LNB</td><td>Non couvert</td><td>Settlement manuel uniquement</td></tr>
            </tbody>
          </table>
          <p className="util-intro" style={{ marginTop: '0.5rem' }}>
            Le serveur vérifie toutes les 3 min les alertes acceptées dont le match est terminé (2h après le tip-off). Si le boxscore est disponible, l'alerte passe automatiquement en <strong>Gagné</strong> ou <strong>Perdu</strong>. Si le joueur n'a pas joué (DNP), l'alerte est silencieusement supprimée (non comptabilisée).
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Badges d'alerte</h3>
          <table className="util-table">
            <thead><tr><th>Badge</th><th>Couleur</th><th>Signification</th></tr></thead>
            <tbody>
              <tr><td><strong>!</strong></td><td>Rouge</td><td>Mouvement de cotes détecté depuis la création de l'alerte</td></tr>
              <tr><td><strong>!</strong></td><td>Orange</td><td>Joueur déclaré OUT après la création de l'alerte — pari à annuler</td></tr>
              <tr><td><strong>Q</strong></td><td>Orange</td><td>Joueur Questionable au moment de l'alerte</td></tr>
            </tbody>
          </table>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Gestion des alertes</h3>
          <table className="util-table">
            <thead><tr><th>Statut</th><th>Condition</th><th>Actions</th></tr></thead>
            <tbody>
              <tr><td><strong>En attente</strong></td><td>Match pas encore commencé</td><td>Cliquer une cote pour accepter · ✗ Rejeter</td></tr>
              <tr><td><strong>Accepté</strong></td><td>En jeu jusqu'au settlement auto</td><td>Visible dans le panneau bas · clic → match</td></tr>
              <tr><td><strong>Gagné / Perdu</strong></td><td>Après settlement automatique</td><td>Visible en backtesting</td></tr>
            </tbody>
          </table>
          <p className="util-intro" style={{ marginTop: '0.5rem' }}>
            Le bouton <strong>"Tout effacer"</strong> supprime toutes les alertes <em>en attente</em> uniquement (les alertes acceptées ne sont pas touchées).
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Calcul de probabilité</h3>
          <p className="util-intro">Même formule que dans Analyse Props :</p>
          <div className="util-factors">
            {[
              { name: '1. Projection (EWA modèle)', desc: 'Estimation pts/reb/ast via le modèle multiplicatif complet (NBA/WNBA) ou EWA blend 65/35 PO (EU). Voir section "Formule Props NBA" pour le détail.' },
              { name: '2. Écart-type (σ)', desc: 'Variabilité sur le gamelog récent. Un joueur régulier → σ faible → probabilité plus tranchée. Un joueur erratique → σ élevé → probabilité proche de 50%.' },
              { name: '3. Distribution Student-t (df=4)', desc: 'P(X ≥ seuil) = 1 − T₄((seuil − 0.5 − estimation_ajustée) / σ_ajusté). Le −0.5 est un ajustement de continuité ; l\'estimation est contractée vers la ligne (shrinkage) et σ est élargi (×1.5 + plancher + boost déviation). Si P dépasse le plancher de la catégorie (voir tableau « Seuils d\'alertes ») avec cote Unibet/Betclic ≥ 1.55 → alerte.' },
            ].map(f => (
              <div key={f.name} className="util-factor-row">
                <div className="util-factor-header"><span className="util-factor-name">{f.name}</span></div>
                <p className="util-factor-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Accordion>}

      {/* ── AFFICHAGE BASKETBALL ── */}
      {isBasket && <Accordion title="Affichage de la liste basketball">
        <p className="util-intro">
          La liste des matchs NBA est alimentée par le <strong>scoreboard ESPN en direct</strong> (pas les fixtures statiques). Les matchs Euroleague viennent des données statiques du projet.
        </p>

        <div className="util-refresh-grid">
          <div className="util-refresh-item">
            <span className="util-refresh-icon">📅</span>
            <div>
              <div className="util-refresh-label">Tri chronologique</div>
              <div className="util-refresh-desc">Les matchs sont affichés du plus proche au plus lointain (date croissante)</div>
            </div>
          </div>
          <div className="util-refresh-item">
            <span className="util-refresh-icon">🕑</span>
            <div>
              <div className="util-refresh-label">Rétention 48h</div>
              <div className="util-refresh-desc">Un match terminé reste visible 48h après sa date, puis disparaît automatiquement</div>
            </div>
          </div>
          <div className="util-refresh-item">
            <span className="util-refresh-icon">🔄</span>
            <div>
              <div className="util-refresh-label">Rafraîchissement auto</div>
              <div className="util-refresh-desc">Toutes les 30s si un match est en cours, toutes les 5 min sinon</div>
            </div>
          </div>
          <div className="util-refresh-item">
            <span className="util-refresh-icon">📦</span>
            <div>
              <div className="util-refresh-label">Données statiques</div>
              <div className="util-refresh-desc">Fixtures Euroleague — mise à jour manuelle dans <code>basketball.js</code></div>
            </div>
          </div>
        </div>
      </Accordion>}

      {/* ── LEXIQUE ── */}
      <Accordion title="Lexique des abréviations">
        <div className="util-lexique">
          {[
            ['PTS', 'Points par match (moyenne de saison)'],
            ['REB', 'Rebonds par match — total offensifs + défensifs'],
            ['AST', 'Passes décisives par match'],
            ['BLK', 'Contres par match'],
            ['STL', 'Interceptions (steals) par match'],
            ['TO', 'Pertes de balle (turnovers) par match'],
            ['FGA', 'Field Goals Attempted — nombre de tirs tentés par match'],
            ['FTA', 'Free Throws Attempted — lancers francs tentés par match'],
            ['FG%', 'Pourcentage de réussite aux tirs à deux points'],
            ['3P%', 'Pourcentage de réussite aux tirs à trois points'],
            ['FT%', 'Pourcentage de réussite aux lancers francs'],
            ['TS%', 'True Shooting % — efficacité globale de tir, intègre 2pts, 3pts et lancers francs. Formule : PTS / (2 × (FGA + 0.44 × FTA))'],
            ['USG%', 'Usage Rate — pourcentage des possessions de l\'équipe qui se terminent avec ce joueur (tir, lancer franc ou perte de balle) lorsqu\'il est sur le terrain. Calculé ici depuis les gamelogs ESPN.'],
            ['PER', 'Player Efficiency Rating — note globale d\'efficacité inventée par John Hollinger. La moyenne ligue est 15.'],
            ['VORP', 'Value Over Replacement Player — contribution d\'un joueur par rapport à un joueur de remplacement théorique'],
            ['Pace', 'Rythme de jeu — nombre estimé de possessions par 48 minutes d\'une équipe. Moyenne NBA actuelle ≈ 100.'],
            ['ORTG', 'Offensive Rating — points marqués pour 100 possessions offensives'],
            ['DRTG', 'Defensive Rating — points encaissés pour 100 possessions défensives'],
            ['NetRTG', 'Net Rating = ORTG − DRTG. Mesure la différence de score au score pour 100 possessions lorsque ce joueur est sur le terrain.'],
            ['B2B', 'Back-to-Back — deux matchs consécutifs sans jour de repos. Facteur de fatigue reconnu statistiquement.'],
            ['L5 / L15', 'Les 5 / 15 derniers matchs — fenêtre d\'analyse de la forme récente'],
            ['H2H', 'Head-to-Head — historique des confrontations directes entre deux équipes ou d\'un joueur contre une équipe adverse'],
            ['Streak', 'Série — nombre de matchs consécutifs au-dessus (🔥) ou en dessous (❄️) de la moyenne de saison'],
            ['Edge', 'Avantage théorique d\'un parieur exprimé en pourcentage. Edge > 0 = value bet potentiel.'],
            ['Vig / Overround', 'Marge intégrée dans les cotes par le bookmaker. La somme des probabilités implicites dépasse 100%.'],
            ['Sharp line', 'Cote établie par un bookmaker de référence (Pinnacle). Considérée comme le reflet le plus précis de la probabilité réelle.'],
            ['Value Bet', 'Pari où la probabilité réelle estimée est supérieure à la probabilité implicite dans la cote du bookmaker.'],
            ['OVER / UNDER', 'Paris sur le dépassement (OVER) ou non (UNDER) d\'un seuil de performance ou d\'un total de points.'],
            ['Total Vegas', 'Over/under du total de points d\'un match posé par les marchés (bookmakers sharp). Indicateur clé du rythme attendu.'],
          ].map(([term, def]) => (
            <div key={term} className="util-lex-row">
              <span className="util-lex-term">{term}</span>
              <span className="util-lex-def">{def}</span>
            </div>
          ))}
        </div>
      </Accordion>

      <Accordion title="Commandes Claude Code">
        <p className="util-intro">
          Commandes slash utilisables directement dans le chat Claude Code pour ce projet.
          Taper <code>/nom</code> dans le prompt pour lancer la commande.
        </p>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Gestion du projet</h3>
          <div className="util-lex-grid">
            {[
              ['/Projetbetting', 'Reprend le contexte du projet ValueBet en début de session — lit CLAUDE.md, trouve les fichiers récemment modifiés, résume la dernière session et demande sur quoi travailler.'],
              ['/lanceapp', 'Démarre le backend (port 3001) et le frontend (port 5173) en arrière-plan, puis affiche le lien de l\'app et confirme que le backend répond.'],
              ['/MAJ', 'Review rapide de l\'app sur les prochaines 24h — compare les fixtures statiques avec le scoreboard ESPN live, vérifie les dates/équipes, contrôle la disponibilité des cotes Pinnacle, et liste les anomalies détectées.'],
              ['/audit', 'Audit complet de la section Basketball — scoreboards, cotes, props, données live, anomalies. Nécessite l\'app lancée (/lanceapp d\'abord).'],
              ['/controlscrapper', 'Audit complet du système de scraping — scrapers cotes + props + données live, vérifie les sources et détecte les pannes. Nécessite l\'app lancée.'],
            ].map(([cmd, def]) => (
              <div key={cmd} className="util-lex-row">
                <span className="util-lex-term" style={{ fontFamily: 'monospace', color: 'var(--accent)', fontSize: 11 }}>{cmd}</span>
                <span className="util-lex-def">{def}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Qualité & sécurité</h3>
          <div className="util-lex-grid">
            {[
              ['/simplify', 'Analyse le code modifié pour détecter les duplications, inefficacités et mauvaises pratiques, puis corrige automatiquement les problèmes trouvés.'],
              ['/security-review', 'Audit de sécurité complet des changements en cours sur la branche — vérifie les injections, XSS, exposition de clés API, et autres vulnérabilités OWASP.'],
              ['/review', 'Revue d\'une pull request GitHub.'],
            ].map(([cmd, def]) => (
              <div key={cmd} className="util-lex-row">
                <span className="util-lex-term" style={{ fontFamily: 'monospace', color: 'var(--accent)', fontSize: 11 }}>{cmd}</span>
                <span className="util-lex-def">{def}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Automatisation</h3>
          <div className="util-lex-grid">
            {[
              ['/loop [interval] [cmd]', 'Répète une commande à intervalle régulier. Ex : /loop 5m /MAJ pour vérifier la MAJ toutes les 5 minutes.'],
              ['/schedule', 'Planifie l\'exécution d\'un agent à un horaire précis (cron). Utile pour des tâches récurrentes autonomes.'],
              ['Auto-commit (cron local, 6h)', 'Tâche cron sur le Mac (crontab -l pour la voir) qui exécute ~/.claude/scripts/valuebet-auto-commit.sh toutes les 6h : si des fichiers suivis ont changé, Claude Code génère un message descriptif et crée le commit, sans push ni intervention manuelle. Log dans ~/.claude/logs/valuebet-auto-commit.log.'],
            ].map(([cmd, def]) => (
              <div key={cmd} className="util-lex-row">
                <span className="util-lex-term" style={{ fontFamily: 'monospace', color: 'var(--accent)', fontSize: 11 }}>{cmd}</span>
                <span className="util-lex-def">{def}</span>
              </div>
            ))}
          </div>
        </div>
      </Accordion>
    </div>
  );
}
