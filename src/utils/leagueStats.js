import { LEAGUES, FIXTURES } from './fixtures';

function computeStats(leagueId) {
  const fixtures = FIXTURES.filter(f => f.league === leagueId);
  if (!fixtures.length) return null;

  const teamsMap = new Map();
  fixtures.forEach(f => {
    if (!teamsMap.has(f.home.name)) teamsMap.set(f.home.name, f.home);
    if (!teamsMap.has(f.away.name)) teamsMap.set(f.away.name, f.away);
  });

  const teams = [...teamsMap.values()];
  const totalGoals  = teams.reduce((s, t) => s + t.goalsFor, 0);
  const totalGames  = teams.reduce((s, t) => s + t.played, 0) / 2;
  const avgGPG      = totalGames > 0 ? totalGoals / totalGames : 0;

  // Poisson BTTS: P(home scores) * P(away scores)
  const lambda    = avgGPG / 2;
  const pScores   = 1 - Math.exp(-lambda);
  const btts      = Math.round(pScores * pScores * 100);

  // Poisson Over 2.5: 1 - P(0) - P(1) - P(2)
  const l     = avgGPG;
  const over25 = Math.round((1 - Math.exp(-l) * (1 + l + (l * l) / 2)) * 100);

  const cleanSheets = Math.round(
    teams.reduce((s, t) => s + (t.goalsAgainst === 0 ? 1 : 0), 0) / teams.length * 100
  );

  return { avgGPG: +avgGPG.toFixed(2), btts, over25, cleanSheets, totalGoals, totalGames: Math.round(totalGames) };
}

export function getAllLeagueStats() {
  return LEAGUES
    .map(league => {
      const stats = computeStats(league.id);
      return stats ? { league, ...stats } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.avgGPG - a.avgGPG);
}
