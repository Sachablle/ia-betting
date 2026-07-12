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
<p>NBA + WNBA (live ESPN) + EuroLeague + 4 championnats EU : ACB (Espagne), LNB Betclic Élite (France), BBL (Allemagne), Lega A (Italie). Tous partagent la même interface : scoreboard live, OddsCard 3 tabs (Résultat / Points / Joueurs), Analyse Props, modèle O/U, compositions, forme, H2H. Cotes scrapées depuis Unibet/Betclic — auto-refresh background toutes les 5 min sans intervention.</p>

<h2>Sources de données — Football</h2>
<table>
<thead><tr><th>Source</th><th>Ce qu'elle apporte</th><th>Limite / Cache</th></tr></thead>
<tbody>
<tr><td><strong>football-data.org</strong></td><td>Fixtures + standings 5 ligues (source unique depuis le 12 juillet 2026 — API-Football retiré du projet, jamais réellement branché)</td><td>10 req/min — cache 30min</td></tr>
<tr><td><strong>The Odds API</strong></td><td>Cotes h2h + BTTS (Pinnacle, Betfair, Unibet, Betclic)</td><td>500 req/mois — cache disque 30min</td></tr>
<tr><td><strong>Unibet (scraping HTML)</strong></td><td>Cotes h2h football FR</td><td>Sans clé</td></tr>
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
<tr><td><strong>Unibet (scraping)</strong></td><td>H2H + totaux + props joueurs</td><td>5min</td></tr>
</tbody>
</table>

<h3>Ligues EU — ACB / LNB / BBL / Lega A</h3>
<p><strong>Migration 22 juin 2026 :</strong> Bzzoiro coupé pour ces 4 ligues (instable, jugé peu fiable) — rosters, gamelogs et box-scores reposent désormais entièrement sur <strong>api-sports.io Basketball v1</strong>. Bzzoiro reste utilisé uniquement pour l'EuroLeague (voir tableau ci-dessus). ACB garde en plus son scraping direct acb.com (gamelogs plus riches : steals/blocks/turnovers inclus, absents d'api-sports.io).</p>
<table>
<thead><tr><th>Source</th><th>Ce qu'elle apporte</th><th>Cache</th></tr></thead>
<tbody>
<tr><td><strong>api-sports.io Basketball v1</strong></td><td>Scoreboard live, standings (ppg/oppg), H2H, team schedule, rosters + gamelogs + boxscores (LNB/BBL/Lega A + compléments ACB)</td><td>5min–6h</td></tr>
<tr><td><strong>acb.com (scraping)</strong></td><td>Rosters + gamelogs ACB (source principale, plus complète qu'api-sports.io : inclut steals/blocks/turnovers)</td><td>6h</td></tr>
<tr><td><strong>legabasket.it (scraping)</strong></td><td>Starters officiels Lega A via <code>sf=1</code> dans <code>__NEXT_DATA__</code></td><td>15min</td></tr>
<tr><td><strong>Betclic (gRPC-Web)</strong></td><td>Props joueurs pts/reb/ast/3pts quand marché disponible (LNB principalement)</td><td>5min</td></tr>
<tr><td><strong>Unibet / Betclic</strong></td><td>H2H + totaux O/U pour tous les matchs EU (auto-refresh 5 min en background)</td><td>5min</td></tr>
</tbody>
</table>
<p style="font-size:0.85em; opacity:0.8">Note : api-sports.io n'expose pas de compositions confirmées pré-match pour le basket (endpoint inexistant). Les "compos probables" (ACB/LNB/BBL) restent calculées depuis l'historique de titularisations (<code>type: 'starters'</code>) des gamelogs récents — voir tableau des compositions plus bas.</p>

<h2>Modèle de projection joueurs — computeEstimate</h2>
<p>C'est le cœur de l'application. Il prend en entrée un joueur, son contexte (équipe, adversaire, date, round), et retourne une projection pts/reb/ast/tpm (3pts) ajustée. Tous les facteurs sont multiplicatifs et bornés.</p>
<p><strong>Portée :</strong> NBA + EuroLeague. Pour l'EL, les schedules bzzoiro (ptsScored/ptsAllowed) sont scalés ×1.414 (= 114.5/81) avant d'entrer dans les fonctions modèle, de sorte que les mêmes constantes NBA fonctionnent correctement en relatif. La probabilité implicite blowout utilise Unibet H2H à la place de Pinnacle pour l'EL. Pas de blessures RotoWire pour l'EL (source inexistante).</p>
<p><strong>3pts (tpm) — ajouté le 10 juin 2026 :</strong> même pipeline de projection que pts/reb/ast (EWA L10 + blend moyenne saison + H2H + sharedMult). Disponible pour NBA, WNBA et ACB/LNB/BBL/Lega A (gamelog 3pts au format "M-A" fourni par acb.com pour l'ACB, api-sports.io pour les 3 autres). Affiché dans la colonne "3pts" de la section Projetées d'Analyse Props.</p>

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

<h3>Vue d'ensemble — tous les seuils, tous les sports (26 juin 2026)</h3>
<p>Tableau de référence rapide. Le détail de chaque système (modèle, garde-fous complets) suit en dessous.</p>

<table>
<thead><tr><th></th><th>Props joueurs</th><th>Total O/U</th><th>Résultat équipe</th><th>Écart H2H (Handicap)</th></tr></thead>
<tbody>
<tr><td><strong>Sport</strong></td><td colspan="4">Basketball</td></tr>
<tr><td><strong>Catégories</strong></td><td>Points, Rebonds, Passes, 3pts</td><td>Points cumulés du match</td><td>Victoire équipe</td><td>Couverture de l'écart de points</td></tr>
<tr><td><strong>Seuil de confiance</strong></td><td>NBA/ACB/EU : 80% (spécialiste : 75%) · WNBA : pts/reb/tpm 77%, ast 80% (spécialiste toutes stats : 72%)</td><td>80% (jamais affiché au-dessus de 88%)</td><td>75%</td><td>75%</td></tr>
<tr><td><strong>Modèle</strong></td><td>Projection joueuse (EWA, forme, adversaire, blessures) → Student-t</td><td>Pace, momentum, repos, densité, playoffs, ancrage historique (40% modèle / 60% moyenne réelle), pénalité absence titulaire clé (8 juillet 2026)</td><td>Force nette (pts marqués − encaissés), ancrage saison (40% forme récente / 60% moyenne nette saison, 9 juillet 2026), repos, avantage terrain, pénalité blessure clé, playoffs → Student-t</td><td>Réutilise marge/écart-type du modèle Résultat, probabilité de couverture via Student-t (9 juillet 2026)</td></tr>
<tr><td><strong>Cote minimum</strong></td><td colspan="2">1.60 (Unibet/Betclic)</td><td>1.50 (Unibet/Betclic)</td><td>1.60 (Unibet/Betclic)</td></tr>
<tr><td><strong>Marge moyenne saison ↔ ligne</strong></td><td>NBA/ACB/EU : pts 0.6 / reb 0.3 / ast 0.25 / 3pts 0.15 · WNBA : pts 0.4 / reb 0.2 / ast 0.25 (inchangé) / 3pts 0.10</td><td>—</td><td>—</td><td>—</td></tr>
<tr><td><strong>Garde-fou spécifique</strong></td><td>Min. 3pts/match : NBA/ACB/EU ≥ 1.5 moy. saison · WNBA ≥ 1.2 moy. saison</td><td>Bloqué si joueur clé (≥15pts) incertain (Q/GTD), peu importe la distance au match (8 juillet 2026)</td><td>—</td><td>Ligne alternative si la plus équilibrée ne suffit pas (même principe que les props)</td></tr>
<tr><td><strong>Edge minimum</strong></td><td>1.0 (2.0 si joueuse « franchise » sur Under : pts≥18/reb≥9/ast≥6/3pts≥3)</td><td>Filtre rapide 5% (NBA/WNBA) ou 4% (EU) avant le modèle complet</td><td>—</td><td>—</td></tr>
<tr><td><strong>Ligues couvertes</strong></td><td>NBA, WNBA, ACB, LNB, BBL, Lega A</td><td>NBA, WNBA, ACB, BBL, Lega A (pas LNB)</td><td>NBA, WNBA, ACB, BBL, Lega A (pas LNB)</td><td>NBA, WNBA, ACB, BBL, Lega A (pas LNB)</td></tr>
<tr><td><strong>Cotes auto-chargées</strong></td><td>Oui depuis toujours</td><td>Oui depuis le 22 juin (avant : dépendait d'une visite de page)</td><td>Oui depuis le 22 juin</td><td>Oui depuis sa création (9 juillet)</td></tr>
<tr><td><strong>Page = alerte, même calcul ?</strong></td><td>Oui</td><td>Oui depuis le 22 juin (unifié via <code>/api/basketball/total</code>)</td><td>Oui depuis le 19 juin (<code>/api/basketball/result</code>)</td><td>Oui depuis sa création (<code>/api/basketball/spread</code>)</td></tr>
</tbody>
</table>

<table style="margin-top:12px">
<thead><tr><th></th><th>BTTS</th><th>Over/Under</th><th>Résultat (1X2)</th></tr></thead>
<tbody>
<tr><td><strong>Sport</strong></td><td colspan="3">Football</td></tr>
<tr><td><strong>Seuil de confiance</strong></td><td>70%</td><td>70%</td><td>70% par issue (dom/nul/ext, indépendants)</td></tr>
<tr><td><strong>Modèle</strong></td><td colspan="3">Poisson sur les buts attendus (λ domicile + extérieur) — <code>computeLambdas</code></td></tr>
<tr><td><strong>Détail</strong></td><td><code>(1-P(dom=0))×(1-P(ext=0))</code></td><td>Ligne 2.5 testée, repli sur 1.5</td><td>Grille Poisson i&gt;j (dom) / i=j (nul) / i&lt;j (ext)</td></tr>
<tr><td><strong>Cote minimum</strong></td><td colspan="2">1.60 (Unibet/Betclic)</td><td>1.50 (Unibet/Betclic)</td></tr>
<tr><td><strong>Ligues couvertes</strong></td><td colspan="3">Ligue 1, Premier League, La Liga, Bundesliga, Serie A, Coupe du Monde</td></tr>
<tr><td><strong>Cotes auto-chargées</strong></td><td colspan="3">Oui depuis le 22 juin (avant : dépendait d'une visite de page foot)</td></tr>
</tbody>
</table>

<div class="alert-box">
<h3>Système 1 — Props joueurs (front-end, localStorage)</h3>
<p>Déclencheur : l'utilisateur ouvre le panneau "Analyse Props". Conditions : (1) la probabilité dépasse le plancher — NBA/ACB/EU 80% (spécialiste 75%), WNBA pts/reb/tpm 77% / ast 80% (spécialiste toutes stats 72%) ; (2) cote Unibet OU Betclic ≥ 1.60 sur le sens choisi. Joueur Out → skippé. Stockage localStorage (<code>nba_alerts</code>) avec 3 statuts : pending / accepted / rejected.</p>
<p>Données incluses : joueur, équipe, fixture, stat, ligne bookmaker, estimation modèle, direction, probabilité (%), cotes Unibet + Betclic, statut blessure, timestamp.</p>
</div>

<div class="alert-box">
<h3>Système 2 — Background alerts (backend, toutes les 20 min)</h3>
<p>Job automatique côté serveur, toutes les 20 min. Scope : NBA, WNBA, EuroLeague, ACB, LNB, BBL, Lega A. Priorité des lignes : Unibet → Betclic. Plancher : <strong>NBA/ACB/EU 80%</strong> (spécialiste : <strong>75%</strong>) · <strong>WNBA pts/reb/tpm 77% / ast 80%</strong> (spécialiste toutes stats : <strong>72%</strong>). Marge saison WNBA allégée (pts 0.4 / reb 0.2 / tpm 0.10, ast 0.25 inchangé), min. 3pts WNBA abaissé à 1.2/match. Endpoint : <code>GET /api/nba/background-alerts</code>. Merge intelligent : pas de remise en pending si l'utilisateur a déjà statué, sauf si la ligne bouge de ≥1 point ou les cotes de ≥15%.</p>
<p><strong>Rafraîchissement des alertes en attente (15 juin 2026)</strong> : une alerte <em>pending</em> est entièrement recalculée à chaque cycle (probabilité, ligne, cotes Unibet/Betclic) — si une cote Betclic apparaît ou qu'une cote/ligne bouge, l'alerte affichée se met à jour automatiquement, sans action de l'utilisateur. Si la ligne change (nouvel identifiant d'alerte), l'ancienne version est supprimée au profit de la nouvelle (une seule alerte pending par joueur/stat). Si l'alerte ne qualifie plus du tout au cycle suivant (ligne/cote ayant trop bougé), elle reste affichée avec un badge <strong>OBSOLÈTE</strong> — à fermer manuellement via l'icône ✗.</p>
</div>

<div class="alert-box">
<h3>Système 3 — Total O/U (background toutes les 20 min + widget de la page match)</h3>
<p><strong>Source unique depuis le 22 juin 2026</strong> : le widget "Modèle O/U" de la page match appelle <code>POST /api/basketball/total</code>, exactement la même fonction (<code>computeGameTotalFull</code>) que les alertes en arrière-plan — avant cette date, la page avait son propre calcul local (<code>computeGameTotal</code>, frontend), qui pouvait légèrement diverger du serveur. L'ancienne fonction locale reste dans le code mais n'est plus appelée par rien.</p>
<p>Côté serveur, exécuté toutes les 20 min pour NBA, WNBA, ACB, BBL, Lega A (pas LNB), en deux étapes :</p>
<ol style="margin:4px 0 8px 18px; padding:0">
<li><strong>Étape 1 (filtre rapide)</strong> : modèle simple <code>homeOff×(awayDef/leagueAvg) + awayOff×(homeDef/leagueAvg)</code> vs ligne bookmaker — edge ≥ 5% (NBA/WNBA) ou ≥ 4% (ACB/BBL/Lega A). Évite de lancer le modèle complet (pace/momentum/repos/densité = fetchs supplémentaires) sur chaque match à chaque cycle.</li>
<li><strong>Étape 2 (modèle complet)</strong> : si l'étape 1 passe, <code>computeGameTotalFull</code> (pace matchup, momentum, repos, densité, facteur playoffs, tendance de la série en cours, ancrage historique) calcule <code>P(Over)</code> / <code>P(Under)</code>. Alerte déclenchée si <strong>max(P(Over), P(Under)) ≥ 80%</strong> (<code>TOTAL_ALERT_PROB</code>), jamais affiché au-dessus de 88% (<code>MAX_TOTAL_P</code> — un écart-type de ~12pts NBA / ~20pts WNBA rend 90%+ quasi inatteignable sur un total).</li>
</ol>
<p><strong>Tendance de la série (22 juin 2026)</strong> : en playoffs, deux mêmes équipes qui se rejouent voient souvent leur total baisser match après match (défenses qui se calent l'une sur l'autre) — signal distinct du momentum général de chaque équipe (qui mélange des matchs contre d'autres adversaires). Le modèle compare le dernier match de cette confrontation au pénultième ; si la tendance est connue (≥2 confrontations), elle est appliquée à l'estimation finale amortie à moitié (jamais plus de ±15%). Cas réel à l'origine de ce fix : finale ACB Barcelone-Valence, totaux combinés 225→177→168, jamais détecté faute de signal dédié à la confrontation.</p>
<p>Filtre supplémentaire : alerte bloquée si un joueur clé (≥15 pts/match, l'un ou l'autre camp) est Questionable/GTD/Doubtful en playoffs (avril-juin) et qu'on est à ≤2h30 du tip-off. Cote minimum 1.60 (Unibet/Betclic).</p>
<p><strong>Cotes auto-chargées (22 juin 2026)</strong> : le serveur va chercher lui-même les cotes manquantes (<code>/api/basketball/odds</code>) au lieu de dépendre d'une visite de la page du match — avant ce fix, un match jamais ouvert dans le navigateur ne générait jamais d'alerte Total, peu importe la confiance réelle.</p>
<p>Stockage localStorage (<code>nba_game_total_alerts</code>), affiché dans Alertes (pending) puis dans le widget du match. Badge OVER/UNDER, vert (over) ou rouge (under).</p>
</div>

<div class="alert-box">
<h3>Système 3bis — Résultat équipe (background toutes les 20 min + widget "Modèle 1X2")</h3>
<p>Prédit la victoire de l'une des deux équipes, <strong>indépendamment des cotes du marché</strong> (contrairement au Total, le modèle ne regarde pas la ligne bookmaker pour faire sa propre estimation — il la compare seulement après, pour vérifier qu'il y a de la valeur).</p>
<p><code>computeTeamWinProb</code> : force nette de chaque équipe (points marqués − encaissés, pondérée vers les matchs récents) ; ajustée par le repos et la densité du calendrier ; <code>−40%</code> des points moyens d'un joueur clé (≥15 pts/match) si déclaré Out ; <code>+2.5 points</code> d'avantage terrain pour l'équipe qui reçoit ; resserrée en playoffs (jeu plus défensif). Convertie en probabilité de victoire via une distribution Student-t.</p>
<p>Alerte déclenchée si <strong>P(victoire) ≥ 75%</strong> (<code>RESULT_ALERT_PROB</code>) et cote ≥ 1.50 (<code>RESULT_MIN_ODDS</code>, Unibet/Betclic) sur le marché h2h. Une alerte par match maximum — les deux probabilités (dom + ext) totalisent 100%, une seule peut dépasser 75% à la fois.</p>
<p>Remplace l'ancien système EarlyWin (formule empirique non calibrée, jamais réellement branché au pipeline d'alertes) depuis le 19 juin 2026. Source unique avec la page match depuis sa création : le widget "Modèle 1X2" appelle <code>POST /api/basketball/result</code>, exactement la même fonction que les alertes — jamais deux implémentations séparées comme pour le Total avant le 22 juin.</p>
<p>Ligues : NBA, WNBA, ACB, BBL, Lega A (pas LNB — bug de clé de cache corrigé le 22 juin 2026, le Résultat des ligues EU ne trouvait jamais de cotes h2h avant ce fix, donc ne générait jamais d'alerte).</p>
<p>Stockage localStorage (<code>basketball_result_alerts</code>), affiché dans Alertes (pending) puis dans Running.</p>
</div>

<div class="alert-box">
<h3>Système 4 — Football BTTS / Over-Under / Résultat / DC combinés (background, toutes les 20 min)</h3>
<p>Modèle Poisson <code>computeLambdas</code> (attaque/défense normalisées, λ rescalé par la moyenne de buts de la ligue × avantage domicile). Scope : 5 grands championnats (Ligue 1, PL, Liga, Bundesliga, Serie A) + Coupe du Monde (CDM, avgGF/avgGA recalculés dynamiquement sur le pool d'équipes qualifiées).</p>
<table>
<thead><tr><th>Alerte</th><th>Calcul</th><th>Seuil</th></tr></thead>
<tbody>
<tr><td><strong>BTTS</strong></td><td>Somme de la grille jointe (corrélée, voir ci-dessous) sur les cases i≥1 et j≥1</td><td>≥ 70% (<code>FB_BTTS_ALERT_PROB</code>) · cote ≥ 1.60</td></tr>
<tr><td><strong>Total O/U</strong></td><td>Somme de la grille jointe sur les cases i+j ≤ ligne, ligne 2.5 puis fallback 1.5</td><td>≥ 70% (<code>FB_OU_ALERT_PROB</code>) · cote ≥ 1.60</td></tr>
<tr><td><strong>Résultat 1X2</strong> (15 juin 2026)</td><td><code>compute1X2Probs</code> — même grille jointe, somme par i&gt;j (dom), i=j (nul), i&lt;j (ext)</td><td>≥ 70% par issue (<code>FB_RESULT_ALERT_PROB</code>) · cote ≥ 1.50</td></tr>
<tr><td><strong>DC &amp; BTTS</strong> (29 juin 2026)</td><td><code>computeDCBTTSProbs</code> — même grille, somme des cases (DC ET BTTS) pour 1X / X2 / 12</td><td>≥ 50% (<code>FB_DC_BTTS_ALERT_PROB</code>) · cote ≥ 1.45</td></tr>
<tr><td><strong>DC &amp; Over 1.5</strong> (29 juin 2026)</td><td><code>computeDCOverProbs</code> — même grille, somme des cases (DC ET i+j&gt;1.5) pour 1X / X2 / 12</td><td>≥ 55% (<code>FB_DC_OU_ALERT_PROB</code>) · cote ≥ 1.45</td></tr>
</tbody>
</table>
<p><strong>Corrélation Dixon-Coles (25 juin 2026)</strong> : la grille jointe P(i buts dom., j buts ext.) n'est plus un simple produit de deux lois Poisson indépendantes. Les 4 cases de score bas (0-0, 1-0, 0-1, 1-1) sont corrigées par un facteur τ (ρ=0.10, valeur de référence de la littérature — Dixon &amp; Coles 1997, pas calibrée sur nos propres données) puis la grille entière est renormalisée. BTTS/Total/Résultat dérivent tous de cette même grille (cohérence interne). Avec ρ=0, le calcul redonne exactement l'ancien résultat (indépendance pure).</p>
<p><strong>Avantage du terrain neutre — CDM (25 juin 2026)</strong> : en Coupe du Monde, l'avantage domicile (×1.10) ne s'applique plus qu'aux 3 pays hôtes du Mondial 2026 (USA, Canada, Mexique). Pour tout autre match, l'équipe "domicile" n'est qu'une étiquette arbitraire de la source de données — le terrain est neutre, donc <code>homeAdv=1.0</code>. Les 5 championnats européens (vrai domicile) gardent ×1.10 sans condition.</p>
<p><strong>Shrinkage petit échantillon (25 juin 2026)</strong> : les facteurs attaque/défense d'une équipe à l'échantillon réduit (qualifs/amicaux peu nombreux) sont tirés vers 1.0 ("équipe moyenne") proportionnellement à la confiance <code>games/(games+5)</code> — à 3 matchs, ~37% du facteur brut est retenu ; à 20 matchs, ~80%. Évite qu'un seul résultat extrême (5-0, 0-0 chanceux) ne fausse tout le calcul pour une sélection peu rodée. Concerne surtout la CDM en début de tournoi.</p>
<p>Le <strong>Résultat 1X2</strong> traite chaque issue (victoire dom. / nul / victoire ext.) comme un pari oui/non indépendant — exactement comme BTTS — et non comme une sélection 3 voies exclusive. Comme deux issues ne peuvent pas dépasser 70% simultanément, au maximum 1 alerte "résultat" par match. Cotes comparées : Unibet/Betclic uniquement.</p>
<p>Cote minimale : 1.60 pour BTTS/O-U, 1.50 pour le Résultat (meilleure cote Unibet/Betclic sur le sens proposé). Une alerte par fixture et par type. Stockage localStorage : <code>fb_btts_alerts</code> / <code>fb_total_alerts</code> / <code>fb_result_alerts</code>, affichées dans Alertes (pending) puis converties en groupe compact dans Running une fois acceptées.</p>
<p><strong>Cotes auto-chargées (22 juin 2026)</strong> : le serveur rafraîchit lui-même le cache de cotes foot s'il est froid ou absent, au lieu de dépendre d'une visite d'une page foot dans le navigateur — avant ce fix, le cache de cotes foot n'avait <em>aucun</em> rafraîchissement automatique (pire que le basket, qui avait au moins un cron séparé toutes les 10 min).</p>
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
<tr><td>ACB / LNB / BBL</td><td>Points moyens (même mécanisme que NBA/WNBA, <code>computeRedist</code>)</td><td>Signal OUT manuel (pas de flux blessures officiel en EU — voir compositions ci-dessous)</td></tr>
</tbody>
</table>
<p>Formule : <code>redistributionFactor = (activeSum + outSum) / activeSum</code>, plafonné à ×1.25. Ne s'active que si les joueurs OUT représentent plus de 10% du poids total de l'équipe.</p>
<p><strong>Plafond combiné redistribution × matchup (8 juillet 2026)</strong> : une joueuse avec coéquipière Out ET bon matchup peut cumuler deux boosts déjà plafonnés individuellement, mais dont le produit ne l'était pas (jusqu'à +43-55%, cas Nneka Ogwumike à 12.7 rebonds projetés vs ~9 en saison). Plafond combiné ajouté (×1.30 NBA/WNBA, ×1.40 pts / ×1.32 reb-ast-tpm EU) par rapport à la valeur sans redistribution.</p>
<p><strong>Fix double-comptage absences saison entière (8 juillet 2026)</strong> : une joueuse Out depuis le début de saison (aucun match joué) a son absence déjà intégrée dans la force nette de l'équipe — une pénalité en plus double-compte (cas Napheesa Collier, alerte Résultat faussée à 87,9%). Ces absences longue durée sont désormais exclues de la pénalité, même logique que le fix du 18 juin sur la redistribution des props.</p>
<h3>Transition Q→OUT en cours de session</h3>
<p>Si un joueur était <strong>Questionable</strong> (projection calculée et gelée en localStorage), puis passe <strong>OUT</strong> avant le match : le gel est automatiquement cassé pour cette équipe, les projections sont recalculées avec redistribution, et le nouveau gel remplace l'ancien. Le joueur OUT est retiré de la liste, ses coéquipiers voient leurs projections réévaluées à la hausse.</p>
<p>Si une <strong>alerte Props</strong> avait été créée pour ce joueur, un badge <strong>! orange</strong> apparaît sur la carte avec le message "Joueur déclaré OUT après alerte".</p>

<h3>Compositions par ligue — Probable vs Confirmé</h3>
<table>
<thead><tr><th>Ligue</th><th>Source des compos</th><th>Probable → Confirmé</th></tr></thead>
<tbody>
<tr><td>NBA / WNBA / EuroLeague</td><td>RotoWire lineups (15 min)</td><td>Selon la page RotoWire elle-même</td></tr>
<tr><td>ACB / LNB / BBL</td><td>Top-5 titularisations récentes (api-sports.io) — pas de lineups pré-match natif côté API</td><td>Manuel : voir ci-dessous</td></tr>
<tr><td>Lega A</td><td>legabasket.it (scraping officiel, dès le tip-off)</td><td>Automatique à l'heure du match</td></tr>
</tbody>
</table>
<p><strong>ACB / LNB / BBL (22 juin 2026)</strong> : le report automatique du lineup du match précédent s'affiche en <strong>« Compos probables »</strong> (badge jaune). Un clic explicite sur <strong>Enregistrer</strong> marque la composition <strong>« Confirmée »</strong> (badge vert) côté serveur. Si des titulaires ont été retirés au moment d'enregistrer, un prompt demande de qualifier chacun :</p>
<ul style="margin:4px 0 8px 18px; padding:0">
<li><strong>OUT</strong> — ne joue pas du tout → redistribution complète façon NBA/WNBA (ci-dessus)</li>
<li><strong>BENCH</strong> — joue toujours, juste plus titulaire → aucune redistribution (ses minutes ne sont pas perdues pour l'équipe)</li>
</ul>
<p>Ce signal OUT/BENCH est utilisé à la fois par les alertes en arrière-plan et par le panneau Analyse Props de la page match — jamais deux logiques séparées.</p>
<p><strong>Lega A</strong> : la composition ne peut être annoncée « Confirmée » qu'à partir de l'heure du match (garde-fou ajouté le 22 juin) — avant le coup d'envoi, toujours affichée comme « Probable », même si le scraping renvoie une réponse, pour éviter de confondre avec un match précédent entre les deux mêmes équipes.</p>

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
<tr><td>Basketball odds (Unibet/Betclic)</td><td>5min</td></tr>
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
              <p className="util-card-desc">Source principale pour ACB, LNB, BBL et Lega A — rosters, gamelogs et boxscores inclus depuis la migration du 22 juin 2026 (Bzzoiro coupé pour ces 4 ligues, jugé peu fiable). ACB garde en plus le scraping direct acb.com (gamelogs plus riches : steals/blocks/turnovers). Quota : 7 500 req/jour.</p>
              <table className="util-table">
                <thead><tr><th>Donnée</th><th>Ligues</th><th>Cache</th></tr></thead>
                <tbody>
                  <tr><td>Scoreboard live (matchs + scores)</td><td>ACB, LNB, BBL, Lega A</td><td>30s (live) / 5min</td></tr>
                  <tr><td>Classements standings (ppg / oppg)</td><td>Toutes ligues EU</td><td>6h</td></tr>
                  <tr><td>H2H (saison en cours + précédente)</td><td>Toutes ligues EU</td><td>6h</td></tr>
                  <tr><td>Rosters + gamelogs joueurs</td><td>LNB, BBL, Lega A (+ compléments ACB)</td><td>6h</td></tr>
                  <tr><td>Boxscores (matchs terminés)</td><td>ACB, LNB, BBL, Lega A</td><td>5min</td></tr>
                  <tr><td>Compos probables (titularisations récentes, pas de lineups pré-match natif)</td><td>ACB, LNB, BBL</td><td>15min</td></tr>
                  <tr><td>Team schedule (ptsScored / ptsAllowed)</td><td>Toutes ligues EU</td><td>6h</td></tr>
                </tbody>
              </table>
            </div>

            <div className="util-card">
              <div className="util-card-header">
                <span className="util-badge util-badge--key">Clé requise</span>
                <span className="util-card-name">Bzzoiro API — EuroLeague uniquement</span>
              </div>
              <p className="util-card-desc">Source des rosters, gamelogs et boxscores pour l'EuroLeague. Depuis le 22 juin 2026, plus utilisée pour ACB/LNB/BBL/Lega A (migrées vers api-sports.io).</p>
              <table className="util-table">
                <thead><tr><th>Donnée</th><th>Ligues</th><th>Cache</th></tr></thead>
                <tbody>
                  <tr><td>Rosters + stats saison EWA L15 (pts/reb/ast)</td><td>EuroLeague</td><td>6h</td></tr>
                  <tr><td>Gamelogs joueurs</td><td>EuroLeague</td><td>6h</td></tr>
                  <tr><td>Boxscores (matchs en cours ou terminés)</td><td>EuroLeague</td><td>5min</td></tr>
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
                <div className="util-refresh-desc">Cache 30 min — football-data.org. Délai 200ms entre ligues (quota 10 req/min).</div>
              </div>
            </div>
          )}
          {isFoot && (
            <div className="util-refresh-item">
              <span className="util-refresh-icon">🕐</span>
              <div>
                <div className="util-refresh-label">Cotes H2H + BTTS</div>
                <div className="util-refresh-desc">Cache 30 min — scraping Unibet + Betclic. Bouton refresh dans la box Odds pour forcer la mise à jour.</div>
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
                <div className="util-refresh-desc">Job backend automatique : rafraîchit les cotes H2H + O/U de <strong>tous les matchs à venir</strong> (NBA, WNBA, ACB, LNB, BBL, Lega A) sans ouvrir un seul match. Scraping Unibet + Betclic avec <code>refresh=1</code>. Aucun appel api-sports.io.</div>
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
                <div className="util-refresh-desc">Cache 6h — ESPN (NBA/WNBA), Bzzoiro (EL uniquement), api-sports.io (ACB/LNB/BBL/Lega A), acb.com scraping (ACB principal)</div>
              </div>
            </div>
          )}
          {isBasket && (
            <div className="util-refresh-item">
              <span className="util-refresh-icon">📋</span>
              <div>
                <div className="util-refresh-label">Compos basket</div>
                <div className="util-refresh-desc">NBA/WNBA/EL : RotoWire (15 min) · Lega A : legabasket.it scraping dès le tip-off · ACB/LNB/BBL : compo probable depuis l'historique de titularisations api-sports.io (pas de lineups pré-match natif)</div>
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
          <h3 className="util-subsection-title">Métriques d'efficacité — TS%</h3>
          <p className="util-intro">
            Les points bruts ne disent pas <em>comment</em> un joueur les marque. Un joueur qui score 25 pts à 38% au tir avec 12 tentatives de lancers-francs n'est pas équivalent à un autre qui marque 25 pts à 52% sur 3pts — le TS% mesure l'efficacité réelle.
          </p>

          <div className="util-subsection" style={{ marginTop: '0.75rem' }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text)' }}>TS% — True Shooting %</h4>
            <p className="util-intro">Intègre tirs et lancers-francs (LF) dans une seule mesure d'efficacité au tir.</p>
            <div className="util-formula-box">
              <code>TS% = PTS / (2 × (FGA + 0.44 × FTA))</code>
            </div>
            <p className="util-intro" style={{ marginTop: '0.4rem' }}>
              Le facteur <code>0.44</code> reflète qu'une séquence de LF coûte en moyenne 0.44 possession (les "and-one" en comptent 0.5, les fautes à 2 LF en comptent 0.5, etc.). La moyenne ligue est autour de <strong>57–58%</strong>. Les joueurs élites comme SGA ou Curry dépassent 63–65%.
            </p>
            <p className="util-intro">
              <strong>Actif dans le modèle</strong> (<code>getTSFactor</code>, <code>compute.js</code>) : un joueur avec un TS% récent en chute (ex. 52% vs 60% habituel) traverse une période de maladresse → pénalité, même si ses pts bruts semblent corrects à court terme. À l'inverse, un joueur qui retrouve un TS% élevé après une blessure signale un retour à pleine efficacité avant que les lignes bookmaker ne s'ajustent.
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
            <strong>Passage à un plancher unique 80% — 22 juin 2026 :</strong> un audit de <code>cache/settlements.json</code> a montré un taux de réussite réel de <strong>50.5%</strong> (46 gagnés / 45 perdus). Plancher unifié à 80% pour toutes les stats et ligues (NBA/WNBA/EU), remplaçant les seuils différenciés ci-dessous. <strong>Ajustement WNBA — 26 juin 2026 :</strong> la WNBA ayant moins de matchs en base, les probabilités sont naturellement comprimées vers 50% — un 77% WNBA est aussi fiable qu'un 80% NBA. Planchers abaissés : pts/reb/tpm 77%, ast 80% inchangé, spécialiste 72% (vs 75% NBA/EU). Marges saison allégées (pts 0.4, reb 0.2, tpm 0.10 — ast 0.25 inchangé), min. 3pts abaissé à 1.2/match.
          </p>
          <p className="util-intro">
            Les seuils différenciés par <strong>stat</strong> (pts / reb / ast / tpm) et par <strong>groupe de ligue</strong> ci-dessous datent d'avant le 22 juin et sont conservés à titre historique — le plancher réellement appliqué aujourd'hui est <strong>80% partout</strong>.
          </p>
          <p className="util-intro">
            <strong>Exception « spécialiste » — 22 juin 2026 (WNBA abaissée à 72% le 26 juin) :</strong> si une joueuse est régulière sur une catégorie précise (écart-type ÷ moyenne sur ses 10+ derniers vrais matchs — seuils : points ≤0.42, rebonds ≤0.46, passes ≤0.58, 3pts ≤0.76), le plancher descend à <strong>75% (NBA/ACB/EU)</strong> ou <strong>72% (WNBA)</strong> pour cette catégorie chez cette joueuse uniquement. Évalué <em>par stat indépendamment</em> — une joueuse peut être spécialiste en rebonds sans l'être en points. Le seuil de régularité est volontairement plus tolérant sur les 3pts : même les meilleures tireuses ont des swings importants d'un match à l'autre. Cas réel : Marina Mabrey (WNBA), rebonds sur ses 15 derniers matchs → régulière, plancher 72% au lieu de 77%.
          </p>
          <p className="util-intro">
            <strong>Marge moyenne saison ↔ ligne — 22 juin 2026 :</strong> en plus du % de confiance, la moyenne de la joueuse/du joueur sur toute la saison doit elle aussi confirmer le sens du pari, avec une marge de sécurité : <strong>points 0.6 · rebonds 0.3 · passes 0.25 · 3pts 0.15</strong> (rebonds inchangé depuis le 16 juin en WNBA, les 3 autres ajoutées ce jour). Concrètement : pour un Over, la moyenne saison doit dépasser la ligne + cette marge ; pour un Under, être sous la ligne − cette marge. Sinon bloqué même si l'estimation du soir est haute — évite de déclencher sur une forme ponctuelle (boost adversaire affaibli, retour de blessure) que le fond de saison ne confirme pas encore. Remplace l'ancien plafond fixe « passes : ligne ≥4.5 = bloqué » (WNBA), plus grossier (il bloquait pareil une passeuse à 8 passes de moyenne et une à 3). Le 3pts garde en plus son propre filtre minimum (moyenne saison ≥1.5 panier, sinon bloqué quelle que soit la ligne — réservé aux vraies tireuses). Initialement WNBA seulement, étendue le même jour à la <strong>NBA et aux 4 ligues EU</strong> (mêmes valeurs partout — la volatilité relative par stat s'est révélée quasi identique entre groupes de ligues, cf. seuils « spécialiste » ci-dessus).
          </p>

          <div style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-dim)', fontWeight: 700 }}>Stat</th>
                  <th style={{ textAlign: 'center', padding: '6px 10px', color: '#60a5fa', fontWeight: 700 }}>NBA / WNBA (historique, avant 22 juin)</th>
                  <th style={{ textAlign: 'center', padding: '6px 10px', color: '#a78bfa', fontWeight: 700 }}>EU — ACB/LNB/BBL/Lega A (historique, avant 22 juin)</th>
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
            Constantes serveur : <code>NBA_ALERT_FLOOR</code> / <code>NBA_ALERT_FLOOR_BENCH</code> / <code>WNBA_ALERT_FLOOR*</code> / <code>ALERT_FLOOR</code> / <code>ALERT_FLOOR_BENCH</code> (ligues EU) — toutes fixées à <code>{`{ pts: 0.80, reb: 0.80, ast: 0.80, tpm: 0.80 }`}</code> depuis le 22 juin 2026. Mêmes valeurs côté Système 1 dans <code>BasketballDetailPage.jsx</code> (déclenché à l'ouverture d'Analyse Props).
          </p>

          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {[
              { label: 'Plancher unique 80% — 22 juin 2026', color: '#ef4444', text: 'Remplace tous les seuils différenciés ci-dessous. Décision prise après l\'audit calibration (win rate réel 50.5% malgré le seuil "haute confiance") : mieux vaut moins d\'alertes mais plus sélectives en attendant un vrai historique probabilité-vs-résultat.' },
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
            ℹ️ Les seuils différenciés ci-dessus avaient été calibrés par analyse des percentiles de la distribution de confiance produite par le modèle, pas sur des résultats réels — la comparaison a été faite le 22 juin 2026 (<code>cache/settlements.json</code>, 95 paris props réglés) et a montré un winrate réel de 50.5%, sans amélioration mesurable après les recalibrations du 8 et du 17 juin. D'où le passage au plancher unique 80% ci-dessus. Jusqu'au 22 juin, <code>settlements.json</code> ne conservait pas la probabilité annoncée au moment du pari — corrigé le même jour pour pouvoir suivre une vraie courbe de calibration (% annoncé vs % réel gagné) sur les prochaines semaines.
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
              <tr><td>Top-5 titularisations récentes api-sports.io</td><td>ACB/LNB/BBL</td><td>En permanence — label "Compos probables" (pas de lineups pré-match natif côté api-sports.io)</td></tr>
            </tbody>
          </table>
          <p className="util-intro" style={{ marginTop: '0.5rem' }}>
            <strong>Probable → Confirmé (22 juin 2026, ACB/LNB/BBL)</strong> : le report automatique du lineup du match précédent s'affiche en badge <strong style={{ color: '#fbbf24' }}>jaune « Probable »</strong>. Un clic explicite sur <strong>Enregistrer</strong> passe la compo en badge <strong style={{ color: '#4ade80' }}>vert « Confirmée »</strong>. Si des titulaires ont été retirés au moment d'enregistrer, un prompt demande de qualifier chacun :
          </p>
          <ul style={{ margin: '0.4rem 0 0.4rem 1.2rem', fontSize: 13, color: 'var(--text-dim)' }}>
            <li><strong>OUT</strong> — ne joue pas du tout → redistribution de ses points aux coéquipiers (même mécanisme que NBA/WNBA, voir « Système blessures » plus bas)</li>
            <li><strong>BENCH</strong> — joue toujours, juste plus titulaire → aucune redistribution, ses minutes ne sont pas perdues pour l'équipe</li>
          </ul>
          <p className="util-intro" style={{ marginTop: '0.4rem' }}>
            Ce signal OUT/BENCH alimente à la fois les alertes en arrière-plan et le panneau Analyse Props — jamais deux logiques séparées. Pour <strong>Lega A</strong>, la compo ne peut passer "Confirmée" qu'à partir de l'heure du match (garde-fou ajouté le 22 juin, évite de confondre avec une rencontre précédente entre les deux mêmes équipes).
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Migration des données (22 juin 2026)</h3>
          <p className="util-intro">
            Roster, gamelog et boxscore d'ACB/LNB/BBL/Lega A reposent désormais sur <strong>api-sports.io</strong> au lieu de Bzzoiro, jugé trop instable. Bzzoiro reste utilisé <strong>uniquement pour l'EuroLeague</strong>. Pour l'ACB spécifiquement, le scraping direct acb.com reste la source principale (plus complet — steals/blocks/turnovers inclus), api-sports.io ne complète que ce qui manquait (compositions, sauvegarde automatique de boxscore).
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Props joueurs — couverture bookmakers</h3>
          <table className="util-table">
            <thead><tr><th>Ligue</th><th>Betclic gRPC</th><th>Unibet</th></tr></thead>
            <tbody>
              <tr><td>LNB (Betclic Élite)</td><td>✅ Props individuels</td><td>❌ Non disponible</td></tr>
              <tr><td>ACB / BBL / Lega A</td><td>❌ Totaux équipe uniquement</td><td>❌</td></tr>
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

      {isFoot && <Accordion title="Alertes — BTTS / Over-Under / Résultat / DC combinés (background, toutes les 20 min)">
        <p className="util-intro">
          Générées automatiquement par le serveur, aucune action nécessaire. Couverture : <strong>Ligue 1, Premier League, La Liga, Bundesliga, Serie A</strong> et <strong>Coupe du Monde</strong>. Modèle de Poisson sur les buts attendus (<code>computeLambdas</code>) — attaque/défense de chaque équipe normalisées, λ rescalé par la moyenne de buts de la ligue et l'avantage du terrain.
        </p>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Les 5 alertes</h3>
          <table className="util-table">
            <thead><tr><th>Alerte</th><th>Calcul</th><th>Seuil</th><th>Cote min</th></tr></thead>
            <tbody>
              <tr><td><strong>BTTS</strong></td><td>Grille jointe Dixon-Coles — somme des cases i≥1 et j≥1</td><td>≥ 70%</td><td>1,60</td></tr>
              <tr><td><strong>Over/Under</strong></td><td>Ligne 2.5 testée d'abord, repli sur 1.5</td><td>≥ 70%</td><td>1,60</td></tr>
              <tr><td><strong>Résultat (1X2)</strong></td><td>Même grille — domicile/nul/extérieur traités comme 3 paris oui/non indépendants</td><td>≥ 70% par issue</td><td>1,50</td></tr>
              <tr><td><strong>DC &amp; BTTS</strong> (29 juin 2026)</td><td><code>computeDCBTTSProbs</code> — même grille, somme des cases où DC ET BTTS sont vérifiés (3 combinaisons : 1X/X2/12)</td><td>≥ 50%</td><td>1,45</td></tr>
              <tr><td><strong>DC &amp; Over 1,5</strong> (29 juin 2026)</td><td><code>computeDCOverProbs</code> — même grille, somme des cases où DC ET total &gt; 1,5 buts</td><td>≥ 55%</td><td>1,45</td></tr>
            </tbody>
          </table>
          <p className="util-intro" style={{ marginTop: '0.5rem' }}>
            Cotes comparées : Unibet/Betclic uniquement. Une alerte par match et par catégorie. Les DC combinés sont des marchés scrappés via gRPC Betclic (<code>ca_ftb_rslt</code>) + HTML Unibet — les probabilités modèle sont aussi affichées directement dans les onglets "Double chance &amp; BTTS" / "Double chance &amp; Over 1,5" de chaque page match.
          </p>
          <p className="util-intro" style={{ marginTop: '0.4rem' }}>
            <strong>Pourquoi des seuils plus bas pour DC ?</strong> C'est un pari combiné : même pour un fort favori offensif (λh=1.9, λa=1.3), DC &amp; BTTS plafonne à ~46% sur la meilleure combinaison. Les seuils 50%/55% restent sélectifs par rapport à ce plafond naturel.
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Affinements du modèle (25 juin 2026)</h3>
          <p className="util-intro">
            <strong>Corrélation Dixon-Coles</strong> : la Poisson "pure" traite les buts domicile/extérieur comme deux dés totalement indépendants, ce qui sous-estime légèrement les scores serrés (0-0, 1-0, 1-1) par rapport à la réalité (une équipe qui mène gère son avance, ce qui referme le match). Un petit correctif statistique (ρ=0.10, valeur de référence académique, pas encore calibrée sur nos propres résultats) rééquilibre ça sur BTTS/Over-Under/Résultat à la fois, pour rester cohérent entre les trois.
          </p>
          <p className="util-intro" style={{ marginTop: '0.5rem' }}>
            <strong>Terrain neutre en Coupe du Monde</strong> : l'avantage du terrain (+10% de buts attendus) ne s'applique plus qu'aux 3 pays hôtes du Mondial 2026 (USA, Canada, Mexique). Pour tous les autres matchs de poule, aucune des deux équipes ne joue vraiment "à domicile" — le label l'était par la source de données, pas par la réalité du terrain.
          </p>
          <p className="util-intro" style={{ marginTop: '0.5rem' }}>
            <strong>Prudence sur petit échantillon</strong> : une sélection qui n'a que 3-4 matchs de référence voit son profil attaque/défense rapproché de la moyenne plutôt que pris à 100% au pied de la lettre — un seul résultat extrême (5-0, 0-0 chanceux) ne doit pas suffire à juger tout son niveau. L'effet s'efface progressivement à mesure que l'échantillon grandit.
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Cotes chargées automatiquement (22 juin 2026)</h3>
          <p className="util-intro">
            Le serveur rafraîchit lui-même les cotes foot si le cache est froid ou absent, au lieu de dépendre d'une visite d'une page foot — avant ce fix, le cache de cotes n'avait <strong>aucun</strong> rafraîchissement automatique (pire que le basket, qui avait au moins un job séparé toutes les 10 min).
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Règlement</h3>
          <p className="util-intro">
            Seules les fixtures Coupe du Monde peuvent être réglées automatiquement aujourd'hui (score final via football-data.org). Les 5 championnats européens n'ont pas encore de source de scores finaux — à combler à la reprise des championnats (~août 2026). Le Résultat 1X2 ne peut se régler qu'au coup de sifflet final (le score peut encore s'inverser), contrairement à BTTS/Over-Under qui peuvent être "déjà gagnés" en live.
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Stockage et affichage</h3>
          <p className="util-intro">
            localStorage : <code>fb_btts_alerts</code> / <code>fb_total_alerts</code> / <code>fb_result_alerts</code> / <code>fb_dc_btts_alerts</code> / <code>fb_dc_ou_alerts</code>. Affichées dans Alertes (pending), puis converties en groupe compact dans Running une fois acceptées (logo, badge de ligue, équipes, heure du match, nombre d'alertes). Règlement des DC uniquement au coup de sifflet final (<code>STATUS_FINAL</code>) — les deux conditions (DC + BTTS/Over) ne peuvent être actées que lorsque le score est définitif.
          </p>
        </div>
      </Accordion>}

      {/* ── COTES FOOTBALL ── */}
      {isFoot && <Accordion title="Affichage des cotes — FootballOddsBox">
        <p className="util-intro">
          Le composant <strong>FootballOddsBox</strong> (dans <code>MatchDetailPage.jsx</code>) s'affiche sur chaque page match, derrière le bouton "Odds" de la barre d'info. Trois onglets : <strong>Résultat</strong> (1X2), <strong>Buts</strong> (Over/Under, ligne 1.5 ou 2.5 au choix) et <strong>BTTS</strong>. Remplace l'ancien composant <code>OddsTable.jsx</code>, qui n'est plus utilisé par aucune page depuis cette refonte.
        </p>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Bookmakers affichés</h3>
          <table className="util-table">
            <thead><tr><th>Bookmaker</th><th>Source</th><th>Marchés</th><th>Rôle</th></tr></thead>
            <tbody>
              <tr><td><strong>Unibet</strong></td><td>Scraping HTML</td><td>Résultat + Buts + BTTS</td><td>Ligne affichée</td></tr>
              <tr><td><strong>Betclic</strong></td><td>Scraping HTML</td><td>Résultat + Buts + BTTS</td><td>Ligne affichée</td></tr>
              <tr><td><strong>Pinnacle</strong></td><td>The Odds API</td><td>Résultat + Buts + BTTS</td><td>Jamais affiché en ligne — sert uniquement de référence "juste" cachée (label <strong>vs Pinnacle X%</strong> sous chaque modèle, voir plus bas)</td></tr>
            </tbody>
          </table>
          <p className="util-intro" style={{ marginTop: '0.5rem' }}>
            Betfair n'apparaît plus dans ce composant (seulement encore utilisé côté <code>GET /api/alerts</code>, voir "Calcul des value bets" ci-dessus). Quand aucune des 3 cotes 1X2 d'un bookmaker scrappé n'est disponible pour comparer au marché, le modèle 1X2 utilise le premier bookmaker scrappé qui a les 3 cotes — Pinnacle n'a pas de marché 1X2 foot fiable trouvé à date.
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Sous chaque cote</h3>
          <div className="util-refresh-grid">
            <div className="util-refresh-item">
              <span className="util-refresh-icon">📊</span>
              <div>
                <div className="util-refresh-label">Edge vs Pinnacle</div>
                <div className="util-refresh-desc">Badge coloré sous la cote (composant partagé <code>OddsCell</code>, identique au basket depuis le 22 juin). Vert si edge {'>'} 0.5%, rouge si {'<'} −0.5%.</div>
              </div>
            </div>
            <div className="util-refresh-item">
              <span className="util-refresh-icon">▲▼</span>
              <div>
                <div className="util-refresh-label">Tendance de cote</div>
                <div className="util-refresh-desc">Flèche à côté de la cote si elle a bougé depuis le dernier scrape — hausse (vert) ou baisse (rouge).</div>
              </div>
            </div>
            <div className="util-refresh-item">
              <span className="util-refresh-icon">↻</span>
              <div>
                <div className="util-refresh-label">Bouton refresh (rond, en haut)</div>
                <div className="util-refresh-desc">Relit le cache déjà alimenté par le cycle automatique — ne déclenche jamais un nouveau scraping live au clic, juste une relecture immédiate sans attendre le prochain cycle de 20 min.</div>
              </div>
            </div>
            <div className="util-refresh-item">
              <span className="util-refresh-icon">🟡</span>
              <div>
                <div className="util-refresh-label">Badge "Cotes pré-match (figées)"</div>
                <div className="util-refresh-desc">Affiché dès que le coup d'envoi est passé — les cotes affichées sont les dernières connues avant le match (figées le 19 juin 2026 pour éviter d'afficher des cotes in-play déformées comme si elles étaient pré-match).</div>
              </div>
            </div>
          </div>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Ligne "Modèle" sous le tableau</h3>
          <p className="util-intro">
            Chaque onglet affiche en bas la probabilité du modèle Poisson interne (<strong>Modèle BTTS</strong> / <strong>Modèle O/U</strong> / <strong>Modèle 1X2</strong>, calculée par <code>computeLambdas</code> + <code>compute1X2Probs</code>/<code>computeOU</code> — les mêmes fonctions que les alertes en arrière-plan), comparée à la probabilité implicite Pinnacle ("vs Pinnacle X%"). L'écart entre les deux est affiché en points (▲/▼ pour BTTS/Buts, +X pt/−X pt pour 1X2) — ce nombre n'a rien à voir avec les flèches de tendance de cote du tableau au-dessus, c'est un popup "?" (légende) qui le précise directement sur la page.
          </p>
        </div>
      </Accordion>}

      {/* ── LISTE FOOTBALL ── */}
      {isFoot && <Accordion title="Affichage de la liste football — Carte Monde">
        <p className="util-intro">
          Il n'y a plus de page liste football dédiée : <code>FootballPage.jsx</code> (données statiques <code>src/utils/fixtures.js</code>) n'est plus routée dans <code>App.jsx</code> — <code>/sports</code> redirige désormais vers <strong>/carte</strong> (<code>WorldMapPage.jsx</code>, le hub "Sports" de la nav). Les fixtures y sont chargées <strong>en live</strong> : <code>GET /api/fd/matches</code> pour les 5 championnats (cache 30 min) et <code>GET /api/fd/worldcup</code> pour la Coupe du Monde.
        </p>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Navigation</h3>
          <p className="util-intro">
            Carte interactive : cliquer sur un pays ouvre un panneau listant ses matchs par ligue, répartis en 3 groupes — à venir bientôt, à venir plus tard, terminés (48h max). Un pays qui a à la fois du foot et du basket affiche un toggle ⚽/🏀 en haut du panneau pour filtrer les ligues visibles.
          </p>
        </div>

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
              <tr><td><strong>Coupe du Monde</strong></td><td>International</td><td>—</td></tr>
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
                <div className="util-refresh-desc">Pas encore de source branchée pour les 5 grands championnats (toujours vide) — l'ancienne source prévue (API-Football) n'a jamais été réellement utilisée par aucune page et a été retirée du projet le 12 juillet 2026.</div>
              </div>
            </div>
            <div className="util-refresh-item">
              <span className="util-refresh-icon">💰</span>
              <div>
                <div className="util-refresh-label">FootballOddsBox</div>
                <div className="util-refresh-desc">Cotes Résultat/Buts/BTTS de Unibet et Betclic avec edges vs Pinnacle (caché). Chargée à la demande, rafraîchissable manuellement.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Alertes value bets</h3>
          <p className="util-intro">
            L'endpoint <code>GET /api/alerts</code> scanne en temps réel tous les matchs football disponibles via The Odds API. Pour chaque marché H2H et BTTS, il compare les cotes de Unibet et Betclic à la ligne Pinnacle démarginée. Toute cote générant un edge supérieur à <code>VALUE_THRESHOLD</code> (2% par défaut dans <code>.env</code>) remonte dans la page <strong>Alertes</strong>.
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
              <tr><td><strong>Stats réalisées</strong></td><td>Stats du match joué — box score ESPN (NBA/WNBA), api-sports.io (LNB/BBL/Lega A), acb.com (ACB) ou Bzzoiro (EuroLeague)</td><td>Vert</td></tr>
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
          <p className="util-intro" style={{ marginTop: '0.4rem', fontSize: 11, fontStyle: 'italic' }}>
            ℹ️ Ces bandes de couleur (affichage uniquement) n'ont pas été modifiées le 22 juin 2026 — seul le plancher qui déclenche une alerte a changé (80% uniforme, voir « Seuils d'alertes » dans la section Modèle Props). Conséquence : un badge vert dans Analyse Props ne garantit plus qu'une alerte sera générée pour ce joueur — il faut désormais ≥ 80% spécifiquement.
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Compos — sources et confirmation</h3>
          <table className="util-table">
            <thead><tr><th>Source</th><th>Badge</th><th>Disponibilité</th></tr></thead>
            <tbody>
              <tr><td><strong>Manuel (toi)</strong></td><td style={{ color: '#22c55e' }}>Compos confirmées ✓</td><td>Dès que tu enregistres via le bouton "Enregistrer"</td></tr>
              <tr><td><strong>legabasket.it</strong></td><td style={{ color: '#22c55e' }}>Compos confirmées</td><td>Dès le tip-off (Lega A uniquement)</td></tr>
              <tr><td><strong>Bzzoiro</strong></td><td style={{ color: '#22c55e' }}>Compos confirmées</td><td>~1-2h avant tip-off (EuroLeague uniquement)</td></tr>
              <tr><td><strong>ESPN</strong></td><td style={{ color: '#22c55e' }}>Compos confirmées</td><td>~1h avant tip-off (NBA/WNBA)</td></tr>
              <tr><td><strong>RotoWire</strong></td><td style={{ color: '#fbbf24' }}>Compos probables</td><td>24h+ avant (NBA)</td></tr>
              <tr><td><strong>api-sports.io historique</strong></td><td style={{ color: '#fbbf24' }}>Compos probables</td><td>Titularisations des 60 derniers jours (ACB/LNB/BBL — pas de lineups pré-match natif)</td></tr>
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
              <tr><td><strong>Confiance minimum</strong></td><td>NBA/ACB/EU : 80% (spécialiste 75%) · WNBA : pts/reb/tpm 77% / ast 80% (spécialiste 72%) — voir la section « Seuils d'alertes » ci-dessus</td></tr>
              <tr><td><strong>Edge minimum</strong></td><td>Écart |projection − ligne| ≥ 1.0 (pts/reb/ast/tpm). En dessous, le pari est jugé "pile ou face" — backtest 17 paris : edge &lt; 1.0 → 0% de réussite, edge ≥ 1.0 → 62%.</td></tr>
              <tr><td><strong>Edge renforcé "Under" — franchise players</strong></td><td>Si la moyenne saison du joueur sur cette stat est élevée (pts ≥ 18, reb ≥ 9, ast ≥ 6, tpm ≥ 3 — joueur majeur de son équipe), l'edge minimum passe à 2.0 pour un Under. Ces joueurs peuvent exploser leur ligne n'importe quel soir (ex. A. Reese 9.5 proj. → 17 réel).</td></tr>
              <tr><td><strong>Cote minimum</strong></td><td>Unibet OU Betclic ≥ 1.50</td></tr>
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
              <tr><td><strong>Cotes</strong></td><td>Unibet / Betclic. Cliquer sur une cote = accepter le pari avec ce bookmaker</td></tr>
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
              <tr><td>ACB / LNB / BBL / Lega A</td><td>api-sports.io Boxscore (depuis le 22 juin 2026)</td><td>~15-45 min</td></tr>
              <tr><td>EuroLeague</td><td>Bzzoiro Boxscore</td><td>~15-45 min</td></tr>
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
              { name: '3. Distribution Student-t (df=4)', desc: 'P(X ≥ seuil) = 1 − T₄((seuil − 0.5 − estimation_ajustée) / σ_ajusté). Le −0.5 est un ajustement de continuité ; l\'estimation est contractée vers la ligne (shrinkage) et σ est élargi (×1.5 + plancher + boost déviation). Si P dépasse le plancher de la catégorie (voir tableau « Seuils d\'alertes ») avec cote Unibet/Betclic ≥ 1.50 → alerte.' },
            ].map(f => (
              <div key={f.name} className="util-factor-row">
                <div className="util-factor-header"><span className="util-factor-name">{f.name}</span></div>
                <p className="util-factor-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Accordion>}

      {isBasket && <Accordion title="Alertes — Total O/U, Résultat équipe & Écart H2H (NBA / WNBA / ACB / BBL / Lega A)">
        <p className="util-intro">
          Trois types d'alertes générées automatiquement en <strong>arrière-plan toutes les 20 min</strong> — comme les props, aucune action nécessaire. <strong>LNB non couverte</strong> (alertes désactivées pour cette ligue).
        </p>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Vue d'ensemble</h3>
          <table className="util-table">
            <thead><tr><th></th><th>Total O/U</th><th>Résultat équipe</th><th>Écart H2H (Handicap)</th></tr></thead>
            <tbody>
              <tr><td><strong>Ce que ça prédit</strong></td><td>Points cumulés du match (Over/Under une ligne)</td><td>Quelle équipe gagne</td><td>Si le favori couvre l'écart de points (ligne handicap)</td></tr>
              <tr><td><strong>Seuil de confiance</strong></td><td>80% (jamais affiché au-dessus de 88%)</td><td>80%</td><td>75%</td></tr>
              <tr><td><strong>Modèle</strong></td><td>Pace, momentum, repos, densité, playoffs, ancrage historique (40% modèle / 60% moyenne réelle des 2 équipes), pénalité absence titulaire clé (8 juillet 2026)</td><td>Force nette (pts marqués − encaissés), <strong>ancrage saison (9 juillet 2026)</strong> : 40% forme récente (EWA 8 matchs) / 60% moyenne nette de la saison, repos, avantage terrain (+2.5 pts), pénalité blessure clé, playoffs</td><td>Réutilise <code>marginExpected</code>/écart-type du modèle Résultat ci-contre, évalue la probabilité de couvrir la ligne bookmaker via une distribution Student-t (<code>computeSpreadCoverProb</code>)</td></tr>
              <tr><td><strong>Cote minimum</strong></td><td>1.50 (Unibet/Betclic)</td><td>1.50 (idem)</td><td>1.60 (Unibet/Betclic)</td></tr>
              <tr><td><strong>Garde-fou spécifique</strong></td><td>Bloqué si joueur clé (≥15 pts/match) incertain (Q/GTD), peu importe la distance au match (8 juillet 2026)</td><td>Idem — Q/GTD bloque aussi (8 juillet 2026)</td><td>Ligne alternative si la plus équilibrée ne suffit pas (même principe que les props, voir plus bas)</td></tr>
              <tr><td><strong>1 alerte par match ?</strong></td><td>Oui</td><td>Oui (mathématiquement, dom + ext ne peuvent pas dépasser 80% en même temps)</td><td>Oui par côté (dom/ext) — signalé si le Résultat est déjà accepté dans le même sens (corrélation)</td></tr>
            </tbody>
          </table>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Ancrage saison — Résultat équipe (9 juillet 2026)</h3>
          <p className="util-intro">
            La force nette de chaque équipe n'était calculée que sur les 8 derniers matchs (forme récente, EWA). Une série de matchs serrés récents pouvait presque égaliser deux équipes très différentes sur la saison entière — cas réel : Connecticut Sun (5-17, net saison −6) donné favori à 75% contre Minnesota Lynx (16-6, net saison +10.7) à cause d'une forme récente sur 8 matchs presque égale. Le modèle mélange désormais 40% forme récente / 60% moyenne nette de la saison entière (si ≥5 matchs disponibles) — même principe que l'ancrage historique déjà utilisé pour le Total O/U.
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Plafond combiné redistribution × ajustement matchup (8 juillet 2026)</h3>
          <p className="util-intro">
            Une joueuse peut cumuler <strong>deux boosts en même temps</strong> : la redistribution de minutes/usage d'une coéquipière Out, et un bon matchup contre la défense adverse. Chacun est déjà plafonné individuellement, mais rien n'empêchait leur <em>produit</em> de dépasser ces plafonds (jusqu'à +43-55% selon la ligue) — cas réel : Nneka Ogwumike (LA Sparks) projetée à 12.7 rebonds avec 2 coéquipières Out, saison ~8.7-9.1. Un plafond combiné (×1.30 NBA/WNBA, ×1.40 pts / ×1.32 reb-ast-tpm en EU) borne désormais la projection finale par rapport à la valeur <em>sans</em> la redistribution — ne s'active que quand la redistribution est réellement en jeu, aucun effet sur l'immense majorité des joueuses.
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Fix double-comptage — absences saison entière (8 juillet 2026)</h3>
          <p className="util-intro">
            Une joueuse absente <strong>depuis le tout début de la saison</strong> (aucun match joué, ex. opération) voit son absence déjà intégrée dans la force nette de son équipe (calculée sur les vrais matchs joués sans elle) — lui appliquer une pénalité Out en plus double-compte. Cas réel : Napheesa Collier (Out toute la saison) faisait chuter Minnesota à tort, générant une alerte Résultat à 87,9% / edge 56,8% sur Connecticut Sun. Corrigé en excluant ces absences longue durée de la pénalité (même logique que le fix du 18 juin sur la redistribution des props), branché sur les 6 points d'entrée NBA/WNBA/EU (arrière-plan + widgets de page).
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Page du match = alerte : même calcul (22 juin 2026, étendu Écart H2H le 9 juillet)</h3>
          <p className="util-intro">
            Les widgets "Modèle O/U", "Modèle 1X2" et "Modèle Écart" de la page du match appellent désormais les <strong>mêmes fonctions serveur</strong> que les alertes (<code>/api/basketball/total</code>, <code>/api/basketball/result</code>, <code>/api/basketball/spread</code>) — le % affiché sur la page est donc garanti identique à celui de l'alerte. Avant le 22 juin, le Total O/U avait un calcul local séparé côté page qui pouvait légèrement diverger du serveur (corrigé) ; le Résultat équipe était déjà unifié depuis le 19 juin ; l'Écart H2H est unifié dès sa création le 9 juillet.
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Cotes chargées automatiquement (22 juin 2026)</h3>
          <p className="util-intro">
            Le serveur va chercher lui-même les cotes manquantes au lieu de dépendre d'une visite de la page du match dans le navigateur — avant ce fix, un match jamais ouvert ne générait jamais d'alerte Total ou Résultat, peu importe la confiance réelle du modèle. Au passage, un bug a été corrigé sur le Résultat des ligues EU : une mauvaise clé de cache faisait qu'il ne trouvait jamais de cotes, donc ne générait jamais d'alerte depuis sa création.
          </p>
        </div>

        <div className="util-subsection">
          <h3 className="util-subsection-title">Stockage et affichage</h3>
          <p className="util-intro">
            Total O/U : localStorage <code>nba_game_total_alerts</code>, badge OVER (vert) / UNDER (rouge). Résultat équipe : localStorage <code>basketball_result_alerts</code> — remplace l'ancien système EarlyWin (jamais réellement branché aux alertes). Écart H2H : localStorage <code>basketball_spread_alerts</code>. Les trois apparaissent dans l'onglet Alertes (pending), puis dans Running une fois acceptées, sous forme de groupe compact par match.
          </p>
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

      <Accordion title="Déploiement — comment le site tourne sur internet">
        <p style={{ marginBottom: '1rem', color: 'var(--text-sub)', fontSize: 13 }}>
          L'application tourne en permanence sur internet, sans que ton Mac soit allumé. Elle repose sur 4 services gratuits indépendants.
        </p>

        {/* Schéma */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.25rem', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-sub)', lineHeight: 2 }}>
          <div style={{ color: '#60a5fa', fontWeight: 700, marginBottom: '0.5rem', fontFamily: 'inherit' }}>Navigateur (toi)</div>
          <div style={{ paddingLeft: '1rem' }}>↓ HTTPS</div>
          <div style={{ color: '#4ade80', fontWeight: 700 }}>Vercel — Frontend React</div>
          <div style={{ paddingLeft: '1rem' }}>↓ /api/* proxié</div>
          <div style={{ color: '#fb923c', fontWeight: 700 }}>Render — Backend Express</div>
          <div style={{ paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>↓ scraping Unibet / Betclic / Pinnacle</span>
            <span>↓ APIs football-data.org / ESPN / api-sports.io</span>
            <span>↓ lecture/écriture alertes utilisateur</span>
          </div>
          <div style={{ color: '#a78bfa', fontWeight: 700 }}>MongoDB Atlas — Base de données</div>
          <div style={{ paddingLeft: '1rem' }}>↑ sync alertes / paris entre appareils</div>
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>GitHub — Code source</div>
          <div style={{ paddingLeft: '1rem' }}>→ push sur main → Vercel redéploie automatiquement</div>
        </div>

        {/* Tableau des services */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: '1rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-sub)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Service</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-sub)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Rôle</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-sub)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tarif</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-sub)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Limite</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: 'Vercel', color: '#60a5fa', role: 'Héberge le frontend React. Redéploie automatiquement à chaque push GitHub.', tarif: 'Gratuit', limite: 'Illimité pour usage perso' },
              { name: 'Render', color: '#fb923c', role: 'Héberge le backend Express (scraping, APIs, alertes background toutes les 20 min).', tarif: 'Gratuit', limite: 'S\'endort après 15 min d\'inactivité (30-60s de réveil)' },
              { name: 'MongoDB Atlas', color: '#a78bfa', role: 'Stocke les alertes acceptées/rejetées, l\'historique des paris, synchronise les données entre appareils.', tarif: 'Gratuit', limite: '512 Mo de stockage' },
              { name: 'GitHub', color: '#4ade80', role: 'Héberge le code source. Chaque git push déclenche un redéploiement automatique sur Vercel.', tarif: 'Gratuit', limite: 'Dépôts privés illimités' },
            ].map((s, i) => (
              <tr key={s.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: s.color }}>{s.name}</td>
                <td style={{ padding: '8px 10px', color: 'var(--text-main)', lineHeight: 1.5 }}>{s.role}</td>
                <td style={{ padding: '8px 10px', color: '#4ade80', fontWeight: 600 }}>{s.tarif}</td>
                <td style={{ padding: '8px 10px', color: 'var(--text-sub)', fontSize: 11 }}>{s.limite}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 8, padding: '0.75rem 1rem', fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.7 }}>
          <strong style={{ color: '#60a5fa' }}>Synchronisation multi-appareils</strong><br />
          Quand tu acceptes ou rejettes une alerte sur un appareil, MongoDB est mis à jour immédiatement. Tous les autres appareils connectés reçoivent une notification SSE (Server-Sent Events) et rechargent les données en temps réel — sans rafraîchir la page.
        </div>
      </Accordion>
    </div>
  );
}
