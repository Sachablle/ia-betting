// Regroupe les alertes props NBA/WNBA/EU brutes (localStorage nba_prop_alerts) par
// joueur + date + stat + direction. Source unique — utilisé par PlaceBetPage (rendu des
// cartes) et par le widget KPI du Dashboard (comptage), pour éviter toute divergence de chiffres.
export function groupAlerts(alerts) {
  const map = {};
  for (const a of alerts) {
    if (!['over','under'].includes(a.direction)) continue;
    const dateKey = new Date(a.fixtureDate).toISOString().slice(0, 10); // normalise YYYY-MM-DD
    const key = `${a.player}__${dateKey}__${a.stat}__${a.direction}`;
    if (!map[key]) {
      map[key] = {
        key,
        player:      a.player,
        team:        a.team,
        fixture:     a.fixture,
        round:       a.round,
        fixtureDate: a.fixtureDate,
        homeTeam:    a.homeTeam || null,
        awayTeam:    a.awayTeam || null,
        eventId:     a.eventId  || null,
        league:      a.league || 'nba',
        stats:       [],
        maxProb:     0,
        ids:         [],
        status:           a.status || 'pending',
        injury:           a.injury || null,
        acceptedAt:       0,
        acceptedBookmaker: a.acceptedBookmaker || null,
      };
    }
    // Priorité statut : accepted > rejected > pending
    const STATUS_RANK = { accepted: 2, rejected: 1, pending: 0 };
    const rank = s => STATUS_RANK[s] ?? 0;
    if (rank(a.status) > rank(map[key].status)) map[key].status = a.status;
    // Déduplique par stat+direction : garde l'alerte la plus récente (sinon une vieille valeur figée
    // avec un % plus haut masquerait pour toujours la projection à jour — bug constaté le 8 juin)
    const statKey = `${a.stat}__${a.direction}`;
    const existing = map[key].stats.findIndex(s => `${s.stat}__${s.direction}` === statKey);
    const entry = { stat: a.stat, direction: a.direction, line: a.line, unibetLine: a.unibetLine, betclicLine: a.betclicLine, winamaxLine: a.winamaxLine, estimate: a.estimate, probability: a.probability, pinnacleOdds: a.pinnacleOdds, unibetOdds: a.unibetOdds, betclicOdds: a.betclicOdds, winamaxOdds: a.winamaxOdds, acceptedUnibetOdds: a.acceptedUnibetOdds ?? null, acceptedBetclicOdds: a.acceptedBetclicOdds ?? null, acceptedWinamaxOdds: a.acceptedWinamaxOdds ?? null, oddsAlert: a.oddsAlert || null, directionFlip: a.directionFlip || null, obsolete: a.obsolete || false, teammateOverlap: a.teammateOverlap || null, deviation: a.deviation ?? null, deviationCap: a.deviationCap ?? null, savedAt: a.savedAt || 0 };
    if (existing === -1) map[key].stats.push(entry);
    else if ((a.savedAt || 0) > (map[key].stats[existing].savedAt || 0)) map[key].stats[existing] = entry;
    if (a.injuryAlert) map[key].hasInjuryAlert = true;
    if (a.playerIsQ) map[key].playerIsQ = true;
    if (a.teamHasQ?.length) map[key].teamHasQ = a.teamHasQ;
    map[key].ids.push(a.id);
    if (a.acceptedAt) map[key].acceptedAt = Math.max(map[key].acceptedAt, a.acceptedAt);
    if (a.acceptedBookmaker && !map[key].acceptedBookmaker) map[key].acceptedBookmaker = a.acceptedBookmaker;
  }
  // maxProb calculé APRÈS dédup, à partir des stats retenues (la plus récente par stat+direction)
  // — sinon une vieille entrée dupliquée avec un % plus haut faussait l'affichage pour toujours
  // hasOddsAlert dérivé des stats réellement affichées (post-dédup) — sinon un vieux doublon
  // avec un mouvement de cote périmé affichait le badge "!" sans aucun détail visible
  Object.values(map).forEach(g => {
    g.maxProb = g.stats.reduce((m, s) => Math.max(m, s.probability), 0);
    g.hasOddsAlert = g.stats.some(s => s.oddsAlert);
    g.hasDirectionFlip = g.stats.some(s => s.directionFlip);
  });
  return Object.values(map).sort((a, b) => {
    if (a.acceptedAt && b.acceptedAt) return b.acceptedAt - a.acceptedAt;
    const dateDiff = new Date(a.fixtureDate) - new Date(b.fixtureDate);
    if (dateDiff !== 0) return dateDiff;
    return b.maxProb - a.maxProb;
  });
}
