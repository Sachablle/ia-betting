// Logo IDs → https://media.api-sports.io/football/teams/{id}.png (CDN public)
export const LEAGUES = [
  { id: 'ligue1',     name: 'Ligue 1',        country: 'France',      accent: '#00a0dc', flag: '🇫🇷', standingsUrl: 'https://www.ligue1.com/classement' },
  { id: 'pl',         name: 'Premier League',  country: 'England',     accent: '#e90052', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', standingsUrl: 'https://www.premierleague.com/tables' },
  { id: 'laliga',     name: 'La Liga',         country: 'Spain',       accent: '#ff4b00', flag: '🇪🇸', standingsUrl: 'https://www.laliga.com/laliga-ea-sports/clasificacion' },
  { id: 'bundes',     name: 'Bundesliga',      country: 'Germany',     accent: '#e30613', flag: '🇩🇪', standingsUrl: 'https://www.bundesliga.com/en/bundesliga/table' },
  { id: 'seriea',     name: 'Serie A',         country: 'Italy',       accent: '#024494', flag: '🇮🇹', standingsUrl: 'https://www.legaseriea.it/en/serie-a/standing' },
  { id: 'eredivisie', name: 'Eredivisie',      country: 'Netherlands', accent: '#ff6600', flag: '🇳🇱', standingsUrl: 'https://www.eredivisie.nl/stand' },
  { id: 'cdm',        name: 'Coupe du Monde', country: 'International', accent: '#FFD700', flag: '🌍', standingsUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026' },
];

function team(name, short, logoId, position, points, played, wins, draws, losses, gf, ga, xG, xGA, spg, sot, poss, form, upcoming) {
  return { name, short, logoId, position, points, played, wins, draws, losses, goalsFor: gf, goalsAgainst: ga, xG, xGA, shotsPerGame: spg, shotsOnTarget: sot, possession: poss, form, upcoming };
}

// upcoming = [{ date, opponent, home: bool, competition }]

export const FIXTURES = [

  // ── LIGUE 1 — Barrages relégation ───────────────────────────────────────
  {
    id: 'f034', league: 'ligue1', round: 'Barrage aller', status: 'STATUS_FULL_TIME',
    date: '2026-05-26T18:45:00Z',
    venue: { name: 'Stade Geoffroy-Guichard', city: 'Saint-Étienne', capacity: 42000 },
    weather: { temp: 18, condition: 'Peu nuageux', wind: 10, humidity: 62, icon: '🌤️' },
    home: { ...team('AS Saint-Étienne','ASSE', 'https://a.espncdn.com/i/teamlogos/soccer/500/178.png', 3,68,38,20,8,10,62,45,55.0,48.0,12.2,4.3,50,['W','W','L','W','D'],[
      { date:'2026-05-26T18:45:00Z', opponent:'OGC Nice', home:true,  competition:'Barrage L1' },
      { date:'2026-05-29T18:45:00Z', opponent:'OGC Nice', home:false, competition:'Barrage L1' },
    ]), score: 0 },
    away: { ...team('OGC Nice','Nice', 'https://a.espncdn.com/i/teamlogos/soccer/500/2502.png', 16,32,34,7,11,16,37,60,43.3,57.9,11.6,4.0,48,['D','L','D','D','D'],[
      { date:'2026-05-26T18:45:00Z', opponent:'AS Saint-Étienne', home:false, competition:'Barrage L1' },
      { date:'2026-05-29T18:45:00Z', opponent:'AS Saint-Étienne', home:true,  competition:'Barrage L1' },
    ]), score: 0 },
    h2h:[
      {date:'2021-09-25',home:'Saint-Étienne',away:'Nice',scoreHome:0,scoreAway:3},
      {date:'2022-05-11',home:'Nice',away:'Saint-Étienne',scoreHome:4,scoreAway:2},
      {date:'2024-09-20',home:'Nice',away:'Saint-Étienne',scoreHome:8,scoreAway:0},
      {date:'2025-03-01',home:'Saint-Étienne',away:'Nice',scoreHome:1,scoreAway:3},
      {date:'2025-12-21',home:'Nice',away:'Saint-Étienne',scoreHome:2,scoreAway:1},
    ],
  },
  {
    id: 'f035', league: 'ligue1', round: 'Barrage retour', status: 'STATUS_FULL_TIME',
    date: '2026-05-29T18:45:00Z',
    venue: { name: 'Allianz Riviera', city: 'Nice', capacity: 35624 },
    weather: { temp: 22, condition: 'Ensoleillé', wind: 8, humidity: 55, icon: '☀️' },
    home: { ...team('OGC Nice','Nice', 'https://a.espncdn.com/i/teamlogos/soccer/500/2502.png', 16,32,34,7,11,16,37,60,43.3,57.9,11.6,4.0,48,['D','L','D','D','D'],[
      { date:'2026-05-26T18:45:00Z', opponent:'AS Saint-Étienne', home:false, competition:'Barrage L1' },
      { date:'2026-05-29T18:45:00Z', opponent:'AS Saint-Étienne', home:true,  competition:'Barrage L1' },
    ]), score: 4 },
    away: { ...team('AS Saint-Étienne','ASSE', 'https://a.espncdn.com/i/teamlogos/soccer/500/178.png', 3,68,38,20,8,10,62,45,55.0,48.0,12.2,4.3,50,['W','W','L','W','D'],[
      { date:'2026-05-26T18:45:00Z', opponent:'OGC Nice', home:true,  competition:'Barrage L1' },
      { date:'2026-05-29T18:45:00Z', opponent:'OGC Nice', home:false, competition:'Barrage L1' },
    ]), score: 1 },
    h2h:[
      {date:'2021-09-25',home:'Saint-Étienne',away:'Nice',scoreHome:0,scoreAway:3},
      {date:'2022-05-11',home:'Nice',away:'Saint-Étienne',scoreHome:4,scoreAway:2},
      {date:'2024-09-20',home:'Nice',away:'Saint-Étienne',scoreHome:8,scoreAway:0},
      {date:'2025-03-01',home:'Saint-Étienne',away:'Nice',scoreHome:1,scoreAway:3},
      {date:'2025-12-21',home:'Nice',away:'Saint-Étienne',scoreHome:2,scoreAway:1},
      {date:'2026-05-26',home:'Saint-Étienne',away:'Nice',scoreHome:0,scoreAway:0},
      {date:'2026-05-29',home:'Nice',away:'Saint-Étienne',scoreHome:4,scoreAway:1},
    ],
  },
];

export const getFixtureById    = id       => FIXTURES.find(f => f.id === id) || null;
export const getFixturesByLeague = leagueId => FIXTURES.filter(f => f.league === leagueId);
export const getLeagueById     = id       => LEAGUES.find(l => l.id === id) || null;
