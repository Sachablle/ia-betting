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

  // ── COUPE DU MONDE 2026 ──────────────────────────────────────────────────
  {
    id: 'f016', league: 'cdm', round: 'Groupe I — J1',
    date: '2026-06-16T00:00:00Z',
    venue: { name: 'MetLife Stadium', city: 'East Rutherford, NJ', capacity: 82500 },
    weather: { temp: 24, condition: 'Ensoleillé', wind: 10, humidity: 60, icon: '☀️' },
    home: team('France','FRA', 2, 1,0,0,0,0,0,0,0,2.1,1.0,14.8,5.6,58,['W','W','W','W','D'],[
      { date:'2026-06-16T00:00:00Z', opponent:'Sénégal',    home:true,  competition:'Coupe du Monde' },
      { date:'2026-06-22T02:00:00Z', opponent:'Irak',       home:true,  competition:'Coupe du Monde' },
      { date:'2026-06-26T00:00:00Z', opponent:'Norvège',    home:false, competition:'Coupe du Monde' },
    ]),
    away: team('Sénégal','SEN', 24, 3,0,0,0,0,0,0,0,1.4,1.2,11.2,4.1,48,['W','D','W','L','W'],[
      { date:'2026-06-16T00:00:00Z', opponent:'France',     home:false, competition:'Coupe du Monde' },
      { date:'2026-06-20T23:00:00Z', opponent:'Norvège',    home:true,  competition:'Coupe du Monde' },
      { date:'2026-06-26T00:00:00Z', opponent:'Irak',       home:true,  competition:'Coupe du Monde' },
    ]),
    h2h:[
      {date:'2022-12-14',home:'France',away:'Maroc',scoreHome:2,scoreAway:0},
      {date:'2019-06-10',home:'France',away:'Andorre',scoreHome:3,scoreAway:0},
      {date:'2002-06-22',home:'Sénégal',away:'Turquie',scoreHome:0,scoreAway:1},
    ],
  },
  {
    id: 'f017', league: 'cdm', round: 'Groupe I — J2',
    date: '2026-06-22T02:00:00Z',
    venue: { name: 'Lincoln Financial Field', city: 'Philadelphia, PA', capacity: 69176 },
    weather: { temp: 28, condition: 'Peu nuageux', wind: 8, humidity: 65, icon: '🌤️' },
    home: team('France','FRA', 2, 1,3,1,1,0,0,2,0,2.1,0.9,14.8,5.6,58,['W','W','W','W','W'],[
      { date:'2026-06-16T00:00:00Z', opponent:'Sénégal',    home:true,  competition:'Coupe du Monde' },
      { date:'2026-06-22T02:00:00Z', opponent:'Irak',       home:true,  competition:'Coupe du Monde' },
      { date:'2026-06-26T00:00:00Z', opponent:'Norvège',    home:false, competition:'Coupe du Monde' },
    ]),
    away: team('Irak','IRQ', 40, 4,0,1,0,0,1,0,2,0.6,1.8,8.4,2.8,42,['L','L','W','D','L'],[
      { date:'2026-06-13T00:00:00Z', opponent:'Norvège',    home:true,  competition:'Coupe du Monde' },
      { date:'2026-06-22T02:00:00Z', opponent:'France',     home:false, competition:'Coupe du Monde' },
      { date:'2026-06-26T00:00:00Z', opponent:'Sénégal',    home:false, competition:'Coupe du Monde' },
    ]),
    h2h:[
      {date:'2024-10-12',home:'France',away:'Belgique',scoreHome:2,scoreAway:1},
      {date:'2024-09-07',home:'France',away:'Italie',scoreHome:3,scoreAway:1},
      {date:'2024-06-17',home:'France',away:'Autriche',scoreHome:1,scoreAway:0},
    ],
  },
  {
    id: 'f018', league: 'cdm', round: 'Groupe I — J3',
    date: '2026-06-26T00:00:00Z',
    venue: { name: 'Gillette Stadium', city: 'Foxborough, MA', capacity: 65878 },
    weather: { temp: 22, condition: 'Nuageux', wind: 16, humidity: 72, icon: '⛅' },
    home: team('Norvège','NOR', 41, 2,3,2,1,0,1,4,3,1.8,1.4,12.6,4.8,52,['W','W','D','W','L'],[
      { date:'2026-06-13T00:00:00Z', opponent:'Irak',       home:false, competition:'Coupe du Monde' },
      { date:'2026-06-20T23:00:00Z', opponent:'Sénégal',    home:false, competition:'Coupe du Monde' },
      { date:'2026-06-26T00:00:00Z', opponent:'France',     home:true,  competition:'Coupe du Monde' },
    ]),
    away: team('France','FRA', 2, 1,6,2,2,0,0,4,0,2.2,0.8,15.0,5.8,58,['W','W','W','W','W'],[
      { date:'2026-06-16T00:00:00Z', opponent:'Sénégal',    home:true,  competition:'Coupe du Monde' },
      { date:'2026-06-22T02:00:00Z', opponent:'Irak',       home:true,  competition:'Coupe du Monde' },
      { date:'2026-06-26T00:00:00Z', opponent:'Norvège',    home:false, competition:'Coupe du Monde' },
    ]),
    h2h:[],
  },

  // ── COUPE DU MONDE 2026 — Groupe I (suite) ──────────────────────────────
  {
    id: 'f019', league: 'cdm', round: 'Groupe I — J1',
    date: '2026-06-16T22:00:00Z',
    venue: { name: 'AT&T Stadium', city: 'Arlington, TX', capacity: 80000 },
    weather: { temp: 30, condition: 'Ensoleillé', wind: 5, humidity: 55, icon: '☀️' },
    home: team('Irak','IRQ', 40, 58,0,0,0,0,0,0,0,0.9,1.3,9.8,3.2,44,['W','L','D','W','L'],[
      {date:'2026-06-16T22:00:00Z',opponent:'Norvège',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-22T22:00:00Z',opponent:'France',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-26T20:00:00Z',opponent:'Sénégal',home:false,competition:'Coupe du Monde'},
    ]),
    away: team('Norvège','NOR', 41, 13,0,0,0,0,0,0,0,1.8,1.1,13.4,4.9,54,['W','W','D','W','W'],[
      {date:'2026-06-16T22:00:00Z',opponent:'Irak',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-22T21:00:00Z',opponent:'Sénégal',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-26T00:00:00Z',opponent:'France',home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f020', league: 'cdm', round: 'Groupe I — J2',
    date: '2026-06-22T21:00:00Z',
    venue: { name: 'Arrowhead Stadium', city: 'Kansas City, MO', capacity: 76416 },
    weather: { temp: 29, condition: 'Peu nuageux', wind: 12, humidity: 58, icon: '🌤️' },
    home: team('Norvège','NOR', 41, 13,0,0,0,0,0,0,0,1.8,1.1,13.4,4.9,54,['W','W','D','W','W'],[
      {date:'2026-06-16T22:00:00Z',opponent:'Irak',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-22T21:00:00Z',opponent:'Sénégal',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-26T00:00:00Z',opponent:'France',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('Sénégal','SEN', 24, 20,0,0,0,0,0,0,0,1.3,1.2,11.2,4.0,48,['W','D','W','L','W'],[
      {date:'2026-06-16T00:00:00Z',opponent:'France',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-22T21:00:00Z',opponent:'Norvège',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-26T20:00:00Z',opponent:'Irak',home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f021', league: 'cdm', round: 'Groupe I — J3',
    date: '2026-06-26T20:00:00Z',
    venue: { name: 'NRG Stadium', city: 'Houston, TX', capacity: 72220 },
    weather: { temp: 33, condition: 'Nuageux', wind: 8, humidity: 75, icon: '⛅' },
    home: team('Sénégal','SEN', 24, 20,0,0,0,0,0,0,0,1.3,1.2,11.2,4.0,48,['W','D','W','L','W'],[
      {date:'2026-06-16T00:00:00Z',opponent:'France',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-22T21:00:00Z',opponent:'Norvège',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-26T20:00:00Z',opponent:'Irak',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('Irak','IRQ', 40, 58,0,0,0,0,0,0,0,0.9,1.3,9.8,3.2,44,['W','L','D','W','L'],[
      {date:'2026-06-16T22:00:00Z',opponent:'Norvège',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-22T22:00:00Z',opponent:'France',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-26T20:00:00Z',opponent:'Sénégal',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },

  // ── COUPE DU MONDE 2026 — Groupe H (Espagne) ────────────────────────────
  {
    id: 'f022', league: 'cdm', round: 'Groupe H — J1',
    date: '2026-06-15T20:00:00Z',
    venue: { name: 'SoFi Stadium', city: 'Inglewood, CA', capacity: 70240 },
    weather: { temp: 24, condition: 'Ensoleillé', wind: 6, humidity: 40, icon: '☀️' },
    home: team('Espagne','ESP', 9, 1,0,0,0,0,0,0,0,2.0,0.7,15.2,5.8,63,['W','W','W','D','W'],[
      {date:'2026-06-15T20:00:00Z',opponent:'Cap-Vert',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-21T21:00:00Z',opponent:'Arabie Saoudite',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-26T20:00:00Z',opponent:'Uruguay',home:false,competition:'Coupe du Monde'},
    ]),
    away: team('Cap-Vert','CPV', null, 77,0,0,0,0,0,0,0,0.9,1.3,9.6,3.1,45,['W','D','L','W','W'],[
      {date:'2026-06-15T20:00:00Z',opponent:'Espagne',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-21T21:00:00Z',opponent:'Uruguay',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-26T23:00:00Z',opponent:'Arabie Saoudite',home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f023', league: 'cdm', round: 'Groupe H — J1',
    date: '2026-06-15T23:00:00Z',
    venue: { name: 'Mercedes-Benz Stadium', city: 'Atlanta, GA', capacity: 71000 },
    weather: { temp: 28, condition: 'Peu nuageux', wind: 10, humidity: 65, icon: '🌤️' },
    home: team('Arabie Saoudite','KSA', 36, 57,0,0,0,0,0,0,0,1.0,1.4,10.4,3.4,48,['W','L','W','D','L'],[
      {date:'2026-06-15T23:00:00Z',opponent:'Uruguay',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-21T21:00:00Z',opponent:'Espagne',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-26T23:00:00Z',opponent:'Cap-Vert',home:false,competition:'Coupe du Monde'},
    ]),
    away: team('Uruguay','URU', 7, 18,0,0,0,0,0,0,0,1.4,1.1,12.0,4.4,51,['W','W','D','W','D'],[
      {date:'2026-06-15T23:00:00Z',opponent:'Arabie Saoudite',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-21T21:00:00Z',opponent:'Cap-Vert',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-26T20:00:00Z',opponent:'Espagne',home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f024', league: 'cdm', round: 'Groupe H — J2',
    date: '2026-06-21T21:00:00Z',
    venue: { name: 'Hard Rock Stadium', city: 'Miami Gardens, FL', capacity: 65000 },
    weather: { temp: 30, condition: 'Peu nuageux', wind: 12, humidity: 72, icon: '🌤️' },
    home: team('Espagne','ESP', 9, 1,0,0,0,0,0,0,0,2.0,0.7,15.2,5.8,63,['W','W','W','D','W'],[
      {date:'2026-06-15T20:00:00Z',opponent:'Cap-Vert',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-21T21:00:00Z',opponent:'Arabie Saoudite',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-26T20:00:00Z',opponent:'Uruguay',home:false,competition:'Coupe du Monde'},
    ]),
    away: team('Arabie Saoudite','KSA', 36, 57,0,0,0,0,0,0,0,1.0,1.4,10.4,3.4,48,['W','L','W','D','L'],[
      {date:'2026-06-15T23:00:00Z',opponent:'Uruguay',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-21T21:00:00Z',opponent:'Espagne',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-26T23:00:00Z',opponent:'Cap-Vert',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f025', league: 'cdm', round: 'Groupe H — J2',
    date: '2026-06-21T21:00:00Z',
    venue: { name: 'Mercedes-Benz Stadium', city: 'Atlanta, GA', capacity: 71000 },
    weather: { temp: 28, condition: 'Ensoleillé', wind: 10, humidity: 65, icon: '☀️' },
    home: team('Uruguay','URU', 7, 18,0,0,0,0,0,0,0,1.4,1.1,12.0,4.4,51,['W','W','D','W','D'],[
      {date:'2026-06-15T23:00:00Z',opponent:'Arabie Saoudite',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-21T21:00:00Z',opponent:'Cap-Vert',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-26T20:00:00Z',opponent:'Espagne',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('Cap-Vert','CPV', null, 77,0,0,0,0,0,0,0,0.9,1.3,9.6,3.1,45,['W','D','L','W','W'],[
      {date:'2026-06-15T20:00:00Z',opponent:'Espagne',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-21T21:00:00Z',opponent:'Uruguay',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-26T23:00:00Z',opponent:'Arabie Saoudite',home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f026', league: 'cdm', round: 'Groupe H — J3',
    date: '2026-06-26T20:00:00Z',
    venue: { name: 'SoFi Stadium', city: 'Inglewood, CA', capacity: 70240 },
    weather: { temp: 23, condition: 'Ensoleillé', wind: 8, humidity: 40, icon: '☀️' },
    home: team('Uruguay','URU', 7, 18,0,0,0,0,0,0,0,1.4,1.1,12.0,4.4,51,['W','W','D','W','D'],[
      {date:'2026-06-15T23:00:00Z',opponent:'Arabie Saoudite',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-21T21:00:00Z',opponent:'Cap-Vert',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-26T20:00:00Z',opponent:'Espagne',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('Espagne','ESP', 9, 1,0,0,0,0,0,0,0,2.0,0.7,15.2,5.8,63,['W','W','W','D','W'],[
      {date:'2026-06-15T20:00:00Z',opponent:'Cap-Vert',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-21T21:00:00Z',opponent:'Arabie Saoudite',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-26T20:00:00Z',opponent:'Uruguay',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f027', league: 'cdm', round: 'Groupe H — J3',
    date: '2026-06-26T23:00:00Z',
    venue: { name: 'Hard Rock Stadium', city: 'Miami Gardens, FL', capacity: 65000 },
    weather: { temp: 29, condition: 'Peu nuageux', wind: 15, humidity: 78, icon: '🌤️' },
    home: team('Cap-Vert','CPV', null, 77,0,0,0,0,0,0,0,0.9,1.3,9.6,3.1,45,['W','D','L','W','W'],[
      {date:'2026-06-15T20:00:00Z',opponent:'Espagne',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-21T21:00:00Z',opponent:'Uruguay',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-26T23:00:00Z',opponent:'Arabie Saoudite',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('Arabie Saoudite','KSA', 36, 57,0,0,0,0,0,0,0,1.0,1.4,10.4,3.4,48,['W','L','W','D','L'],[
      {date:'2026-06-15T23:00:00Z',opponent:'Uruguay',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-21T21:00:00Z',opponent:'Espagne',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-26T23:00:00Z',opponent:'Cap-Vert',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },

  // ── COUPE DU MONDE 2026 — Groupe L (Angleterre) ─────────────────────────
  {
    id: 'f028', league: 'cdm', round: 'Groupe L — J1',
    date: '2026-06-17T18:00:00Z',
    venue: { name: 'AT&T Stadium', city: 'Arlington, TX', capacity: 80000 },
    weather: { temp: 32, condition: 'Ensoleillé', wind: 6, humidity: 52, icon: '☀️' },
    home: team('Angleterre','ANG', 10, 4,0,0,0,0,0,0,0,1.8,0.9,14.1,5.2,59,['W','D','W','W','W'],[
      {date:'2026-06-17T18:00:00Z',opponent:'Croatie',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-23T18:00:00Z',opponent:'Ghana',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-27T20:00:00Z',opponent:'Panama',home:false,competition:'Coupe du Monde'},
    ]),
    away: team('Croatie','CRO', null, 12,0,0,0,0,0,0,0,1.4,1.1,12.8,4.8,53,['W','D','W','D','W'],[
      {date:'2026-06-17T18:00:00Z',opponent:'Angleterre',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-23T21:00:00Z',opponent:'Panama',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-27T23:00:00Z',opponent:'Ghana',home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[
      {date:'2024-03-25',home:'Angleterre',away:'Croatie',scoreHome:2,scoreAway:1},
      {date:'2022-11-13',home:'Croatie',away:'Angleterre',scoreHome:0,scoreAway:0},
      {date:'2021-06-13',home:'Angleterre',away:'Croatie',scoreHome:1,scoreAway:0},
    ],
  },
  {
    id: 'f029', league: 'cdm', round: 'Groupe L — J1',
    date: '2026-06-17T21:00:00Z',
    venue: { name: 'Arrowhead Stadium', city: 'Kansas City, MO', capacity: 76416 },
    weather: { temp: 30, condition: 'Peu nuageux', wind: 14, humidity: 60, icon: '🌤️' },
    home: team('Ghana','GHA', null, 60,0,0,0,0,0,0,0,1.1,1.3,10.6,3.6,49,['W','D','W','L','W'],[
      {date:'2026-06-17T21:00:00Z',opponent:'Panama',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-23T18:00:00Z',opponent:'Angleterre',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-27T23:00:00Z',opponent:'Croatie',home:false,competition:'Coupe du Monde'},
    ]),
    away: team('Panama','PAN', null, 68,0,0,0,0,0,0,0,0.9,1.4,9.8,3.2,46,['W','W','D','W','L'],[
      {date:'2026-06-17T21:00:00Z',opponent:'Ghana',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-23T21:00:00Z',opponent:'Croatie',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-27T20:00:00Z',opponent:'Angleterre',home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f030', league: 'cdm', round: 'Groupe L — J2',
    date: '2026-06-23T18:00:00Z',
    venue: { name: "Levi's Stadium", city: 'Santa Clara, CA', capacity: 68500 },
    weather: { temp: 20, condition: 'Peu nuageux', wind: 10, humidity: 65, icon: '🌤️' },
    home: team('Angleterre','ANG', 10, 4,0,0,0,0,0,0,0,1.8,0.9,14.1,5.2,59,['W','D','W','W','W'],[
      {date:'2026-06-17T18:00:00Z',opponent:'Croatie',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-23T18:00:00Z',opponent:'Ghana',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-27T20:00:00Z',opponent:'Panama',home:false,competition:'Coupe du Monde'},
    ]),
    away: team('Ghana','GHA', null, 60,0,0,0,0,0,0,0,1.1,1.3,10.6,3.6,49,['W','D','W','L','W'],[
      {date:'2026-06-17T21:00:00Z',opponent:'Panama',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-23T18:00:00Z',opponent:'Angleterre',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-27T23:00:00Z',opponent:'Croatie',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f031', league: 'cdm', round: 'Groupe L — J2',
    date: '2026-06-23T21:00:00Z',
    venue: { name: 'SoFi Stadium', city: 'Inglewood, CA', capacity: 70240 },
    weather: { temp: 22, condition: 'Ensoleillé', wind: 8, humidity: 42, icon: '☀️' },
    home: team('Panama','PAN', null, 68,0,0,0,0,0,0,0,0.9,1.4,9.8,3.2,46,['W','W','D','W','L'],[
      {date:'2026-06-17T21:00:00Z',opponent:'Ghana',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-23T21:00:00Z',opponent:'Croatie',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-27T20:00:00Z',opponent:'Angleterre',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('Croatie','CRO', null, 12,0,0,0,0,0,0,0,1.4,1.1,12.8,4.8,53,['W','D','W','D','W'],[
      {date:'2026-06-17T18:00:00Z',opponent:'Angleterre',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-23T21:00:00Z',opponent:'Panama',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-27T23:00:00Z',opponent:'Ghana',home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f032', league: 'cdm', round: 'Groupe L — J3',
    date: '2026-06-27T20:00:00Z',
    venue: { name: 'BC Place', city: 'Vancouver, BC', capacity: 54500 },
    weather: { temp: 19, condition: 'Peu nuageux', wind: 10, humidity: 70, icon: '🌤️' },
    home: team('Panama','PAN', null, 68,0,0,0,0,0,0,0,0.9,1.4,9.8,3.2,46,['W','W','D','W','L'],[
      {date:'2026-06-17T21:00:00Z',opponent:'Ghana',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-23T21:00:00Z',opponent:'Croatie',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-27T20:00:00Z',opponent:'Angleterre',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('Angleterre','ANG', 10, 4,0,0,0,0,0,0,0,1.8,0.9,14.1,5.2,59,['W','D','W','W','W'],[
      {date:'2026-06-17T18:00:00Z',opponent:'Croatie',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-23T18:00:00Z',opponent:'Ghana',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-27T20:00:00Z',opponent:'Panama',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f033', league: 'cdm', round: 'Groupe L — J3',
    date: '2026-06-27T23:00:00Z',
    venue: { name: 'BMO Field', city: 'Toronto, ON', capacity: 45736 },
    weather: { temp: 22, condition: 'Nuageux', wind: 12, humidity: 68, icon: '⛅' },
    home: team('Croatie','CRO', null, 12,0,0,0,0,0,0,0,1.4,1.1,12.8,4.8,53,['W','D','W','D','W'],[
      {date:'2026-06-17T18:00:00Z',opponent:'Angleterre',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-23T21:00:00Z',opponent:'Panama',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-27T23:00:00Z',opponent:'Ghana',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('Ghana','GHA', null, 60,0,0,0,0,0,0,0,1.1,1.3,10.6,3.6,49,['W','D','W','L','W'],[
      {date:'2026-06-17T21:00:00Z',opponent:'Panama',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-23T18:00:00Z',opponent:'Angleterre',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-27T23:00:00Z',opponent:'Croatie',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },

  // ── COUPE DU MONDE 2026 — Groupe C (Brésil) ─────────────────────────────
  {
    id: 'f034', league: 'cdm', round: 'Groupe C — J1',
    date: '2026-06-13T22:00:00Z',
    venue: { name: 'NRG Stadium', city: 'Houston, TX', capacity: 72220 },
    weather: { temp: 33, condition: 'Ensoleillé', wind: 8, humidity: 78, icon: '☀️' },
    home: team('Brésil','BRA', 6, 5,0,0,0,0,0,0,0,2.1,0.7,15.4,5.9,58,['W','W','W','W','D'],[
      {date:'2026-06-13T22:00:00Z',opponent:'Maroc',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-19T22:00:00Z',opponent:'Haïti',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-24T20:00:00Z',opponent:'Écosse',home:false,competition:'Coupe du Monde'},
    ]),
    away: team('Maroc','MAR', 18, 14,0,0,0,0,0,0,0,1.5,1.0,12.4,4.6,52,['W','D','W','W','W'],[
      {date:'2026-06-13T22:00:00Z',opponent:'Brésil',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-19T18:00:00Z',opponent:'Écosse',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-24T23:00:00Z',opponent:'Haïti',home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f035', league: 'cdm', round: 'Groupe C — J1',
    date: '2026-06-13T18:00:00Z',
    venue: { name: 'MetLife Stadium', city: 'East Rutherford, NJ', capacity: 82500 },
    weather: { temp: 25, condition: 'Peu nuageux', wind: 12, humidity: 62, icon: '🌤️' },
    home: team('Haïti','HAI', null, 90,0,0,0,0,0,0,0,0.8,1.6,8.8,2.8,43,['D','L','W','D','L'],[
      {date:'2026-06-13T18:00:00Z',opponent:'Écosse',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-19T22:00:00Z',opponent:'Brésil',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-24T23:00:00Z',opponent:'Maroc',home:false,competition:'Coupe du Monde'},
    ]),
    away: team('Écosse','SCO', null, 40,0,0,0,0,0,0,0,1.1,1.2,10.8,3.6,50,['W','L','D','W','D'],[
      {date:'2026-06-13T18:00:00Z',opponent:'Haïti',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-19T18:00:00Z',opponent:'Maroc',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-24T20:00:00Z',opponent:'Brésil',home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f036', league: 'cdm', round: 'Groupe C — J2',
    date: '2026-06-19T18:00:00Z',
    venue: { name: 'Gillette Stadium', city: 'Foxborough, MA', capacity: 65878 },
    weather: { temp: 23, condition: 'Peu nuageux', wind: 14, humidity: 66, icon: '🌤️' },
    home: team('Écosse','SCO', null, 40,0,0,0,0,0,0,0,1.1,1.2,10.8,3.6,50,['W','L','D','W','D'],[
      {date:'2026-06-13T18:00:00Z',opponent:'Haïti',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-19T18:00:00Z',opponent:'Maroc',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-24T20:00:00Z',opponent:'Brésil',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('Maroc','MAR', 18, 14,0,0,0,0,0,0,0,1.5,1.0,12.4,4.6,52,['W','D','W','W','W'],[
      {date:'2026-06-13T22:00:00Z',opponent:'Brésil',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-19T18:00:00Z',opponent:'Écosse',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-24T23:00:00Z',opponent:'Haïti',home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f037', league: 'cdm', round: 'Groupe C — J2',
    date: '2026-06-19T22:00:00Z',
    venue: { name: 'Lincoln Financial Field', city: 'Philadelphia, PA', capacity: 69176 },
    weather: { temp: 26, condition: 'Nuageux', wind: 10, humidity: 68, icon: '⛅' },
    home: team('Brésil','BRA', 6, 5,0,0,0,0,0,0,0,2.1,0.7,15.4,5.9,58,['W','W','W','W','D'],[
      {date:'2026-06-13T22:00:00Z',opponent:'Maroc',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-19T22:00:00Z',opponent:'Haïti',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-24T20:00:00Z',opponent:'Écosse',home:false,competition:'Coupe du Monde'},
    ]),
    away: team('Haïti','HAI', null, 90,0,0,0,0,0,0,0,0.8,1.6,8.8,2.8,43,['D','L','W','D','L'],[
      {date:'2026-06-13T18:00:00Z',opponent:'Écosse',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-19T22:00:00Z',opponent:'Brésil',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-24T23:00:00Z',opponent:'Maroc',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f038', league: 'cdm', round: 'Groupe C — J3',
    date: '2026-06-24T20:00:00Z',
    venue: { name: 'Mercedes-Benz Stadium', city: 'Atlanta, GA', capacity: 71000 },
    weather: { temp: 29, condition: 'Ensoleillé', wind: 8, humidity: 65, icon: '☀️' },
    home: team('Écosse','SCO', null, 40,0,0,0,0,0,0,0,1.1,1.2,10.8,3.6,50,['W','L','D','W','D'],[
      {date:'2026-06-13T18:00:00Z',opponent:'Haïti',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-19T18:00:00Z',opponent:'Maroc',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-24T20:00:00Z',opponent:'Brésil',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('Brésil','BRA', 6, 5,0,0,0,0,0,0,0,2.1,0.7,15.4,5.9,58,['W','W','W','W','D'],[
      {date:'2026-06-13T22:00:00Z',opponent:'Maroc',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-19T22:00:00Z',opponent:'Haïti',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-24T20:00:00Z',opponent:'Écosse',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f039', league: 'cdm', round: 'Groupe C — J3',
    date: '2026-06-24T23:00:00Z',
    venue: { name: 'Hard Rock Stadium', city: 'Miami Gardens, FL', capacity: 65000 },
    weather: { temp: 30, condition: 'Peu nuageux', wind: 14, humidity: 75, icon: '🌤️' },
    home: team('Maroc','MAR', 18, 14,0,0,0,0,0,0,0,1.5,1.0,12.4,4.6,52,['W','D','W','W','W'],[
      {date:'2026-06-13T22:00:00Z',opponent:'Brésil',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-19T18:00:00Z',opponent:'Écosse',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-24T23:00:00Z',opponent:'Haïti',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('Haïti','HAI', null, 90,0,0,0,0,0,0,0,0.8,1.6,8.8,2.8,43,['D','L','W','D','L'],[
      {date:'2026-06-13T18:00:00Z',opponent:'Écosse',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-19T22:00:00Z',opponent:'Brésil',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-24T23:00:00Z',opponent:'Maroc',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },

  // ── COUPE DU MONDE 2026 — Groupe E (Allemagne) ──────────────────────────
  {
    id: 'f040', league: 'cdm', round: 'Groupe E — J1',
    date: '2026-06-14T20:00:00Z',
    venue: { name: 'Estadio Azteca', city: 'Mexico', capacity: 87000 },
    weather: { temp: 18, condition: 'Peu nuageux', wind: 10, humidity: 55, icon: '🌤️' },
    home: team('Allemagne','ALL', 25, 3,0,0,0,0,0,0,0,1.9,0.8,14.8,5.5,60,['W','W','D','W','W'],[
      {date:'2026-06-14T20:00:00Z',opponent:'Curaçao',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-20T21:00:00Z',opponent:"Côte d'Ivoire",home:true,competition:'Coupe du Monde'},
      {date:'2026-06-25T20:00:00Z',opponent:'Équateur',home:false,competition:'Coupe du Monde'},
    ]),
    away: team('Curaçao','CUW', null, 85,0,0,0,0,0,0,0,0.8,1.5,9.2,3.0,44,['L','D','W','L','W'],[
      {date:'2026-06-14T20:00:00Z',opponent:'Allemagne',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-20T21:00:00Z',opponent:'Équateur',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-25T23:00:00Z',opponent:"Côte d'Ivoire",home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f041', league: 'cdm', round: 'Groupe E — J1',
    date: '2026-06-14T23:00:00Z',
    venue: { name: 'Estadio BBVA', city: 'Monterrey', capacity: 53500 },
    weather: { temp: 24, condition: 'Ensoleillé', wind: 8, humidity: 50, icon: '☀️' },
    home: team("Côte d'Ivoire",'CIV', null, 50,0,0,0,0,0,0,0,1.3,1.2,11.4,3.9,52,['W','W','D','L','W'],[
      {date:'2026-06-14T23:00:00Z',opponent:'Équateur',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-20T21:00:00Z',opponent:'Allemagne',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-25T23:00:00Z',opponent:'Curaçao',home:false,competition:'Coupe du Monde'},
    ]),
    away: team('Équateur','ECU', 31, 44,0,0,0,0,0,0,0,1.2,1.3,11.2,3.8,48,['W','D','L','W','D'],[
      {date:'2026-06-14T23:00:00Z',opponent:"Côte d'Ivoire",home:false,competition:'Coupe du Monde'},
      {date:'2026-06-20T21:00:00Z',opponent:'Curaçao',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-25T20:00:00Z',opponent:'Allemagne',home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f042', league: 'cdm', round: 'Groupe E — J2',
    date: '2026-06-20T21:00:00Z',
    venue: { name: 'Arrowhead Stadium', city: 'Kansas City, MO', capacity: 76416 },
    weather: { temp: 28, condition: 'Nuageux', wind: 14, humidity: 62, icon: '⛅' },
    home: team('Allemagne','ALL', 25, 3,0,0,0,0,0,0,0,1.9,0.8,14.8,5.5,60,['W','W','D','W','W'],[
      {date:'2026-06-14T20:00:00Z',opponent:'Curaçao',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-20T21:00:00Z',opponent:"Côte d'Ivoire",home:true,competition:'Coupe du Monde'},
      {date:'2026-06-25T20:00:00Z',opponent:'Équateur',home:false,competition:'Coupe du Monde'},
    ]),
    away: team("Côte d'Ivoire",'CIV', null, 50,0,0,0,0,0,0,0,1.3,1.2,11.4,3.9,52,['W','W','D','L','W'],[
      {date:'2026-06-14T23:00:00Z',opponent:'Équateur',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-20T21:00:00Z',opponent:'Allemagne',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-25T23:00:00Z',opponent:'Curaçao',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f043', league: 'cdm', round: 'Groupe E — J2',
    date: '2026-06-20T21:00:00Z',
    venue: { name: 'NRG Stadium', city: 'Houston, TX', capacity: 72220 },
    weather: { temp: 31, condition: 'Ensoleillé', wind: 8, humidity: 76, icon: '☀️' },
    home: team('Équateur','ECU', 31, 44,0,0,0,0,0,0,0,1.2,1.3,11.2,3.8,48,['W','D','L','W','D'],[
      {date:'2026-06-14T23:00:00Z',opponent:"Côte d'Ivoire",home:false,competition:'Coupe du Monde'},
      {date:'2026-06-20T21:00:00Z',opponent:'Curaçao',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-25T20:00:00Z',opponent:'Allemagne',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('Curaçao','CUW', null, 85,0,0,0,0,0,0,0,0.8,1.5,9.2,3.0,44,['L','D','W','L','W'],[
      {date:'2026-06-14T20:00:00Z',opponent:'Allemagne',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-20T21:00:00Z',opponent:'Équateur',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-25T23:00:00Z',opponent:"Côte d'Ivoire",home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f044', league: 'cdm', round: 'Groupe E — J3',
    date: '2026-06-25T20:00:00Z',
    venue: { name: 'AT&T Stadium', city: 'Arlington, TX', capacity: 80000 },
    weather: { temp: 32, condition: 'Ensoleillé', wind: 6, humidity: 54, icon: '☀️' },
    home: team('Équateur','ECU', 31, 44,0,0,0,0,0,0,0,1.2,1.3,11.2,3.8,48,['W','D','L','W','D'],[
      {date:'2026-06-14T23:00:00Z',opponent:"Côte d'Ivoire",home:false,competition:'Coupe du Monde'},
      {date:'2026-06-20T21:00:00Z',opponent:'Curaçao',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-25T20:00:00Z',opponent:'Allemagne',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('Allemagne','ALL', 25, 3,0,0,0,0,0,0,0,1.9,0.8,14.8,5.5,60,['W','W','D','W','W'],[
      {date:'2026-06-14T20:00:00Z',opponent:'Curaçao',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-20T21:00:00Z',opponent:"Côte d'Ivoire",home:true,competition:'Coupe du Monde'},
      {date:'2026-06-25T20:00:00Z',opponent:'Équateur',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f045', league: 'cdm', round: 'Groupe E — J3',
    date: '2026-06-25T23:00:00Z',
    venue: { name: 'Mercedes-Benz Stadium', city: 'Atlanta, GA', capacity: 71000 },
    weather: { temp: 28, condition: 'Peu nuageux', wind: 10, humidity: 65, icon: '🌤️' },
    home: team('Curaçao','CUW', null, 85,0,0,0,0,0,0,0,0.8,1.5,9.2,3.0,44,['L','D','W','L','W'],[
      {date:'2026-06-14T20:00:00Z',opponent:'Allemagne',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-20T21:00:00Z',opponent:'Équateur',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-25T23:00:00Z',opponent:"Côte d'Ivoire",home:true,competition:'Coupe du Monde'},
    ]),
    away: team("Côte d'Ivoire",'CIV', null, 50,0,0,0,0,0,0,0,1.3,1.2,11.4,3.9,52,['W','W','D','L','W'],[
      {date:'2026-06-14T23:00:00Z',opponent:'Équateur',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-20T21:00:00Z',opponent:'Allemagne',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-25T23:00:00Z',opponent:'Curaçao',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },

  // ── COUPE DU MONDE 2026 — Groupe J (Argentine) ──────────────────────────
  {
    id: 'f046', league: 'cdm', round: 'Groupe J — J1',
    date: '2026-06-16T18:00:00Z',
    venue: { name: 'Hard Rock Stadium', city: 'Miami Gardens, FL', capacity: 65000 },
    weather: { temp: 30, condition: 'Ensoleillé', wind: 12, humidity: 74, icon: '☀️' },
    home: team('Argentine','ARG', 26, 1,0,0,0,0,0,0,0,2.0,0.8,14.6,5.4,58,['W','W','W','W','W'],[
      {date:'2026-06-16T18:00:00Z',opponent:'Algérie',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-22T18:00:00Z',opponent:'Autriche',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-27T20:00:00Z',opponent:'Jordanie',home:false,competition:'Coupe du Monde'},
    ]),
    away: team('Algérie','ALG', null, 30,0,0,0,0,0,0,0,1.2,1.2,11.0,3.8,51,['W','W','D','W','L'],[
      {date:'2026-06-16T18:00:00Z',opponent:'Argentine',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-22T21:00:00Z',opponent:'Jordanie',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-27T23:00:00Z',opponent:'Autriche',home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f047', league: 'cdm', round: 'Groupe J — J1',
    date: '2026-06-16T21:00:00Z',
    venue: { name: 'Mercedes-Benz Stadium', city: 'Atlanta, GA', capacity: 71000 },
    weather: { temp: 28, condition: 'Peu nuageux', wind: 10, humidity: 65, icon: '🌤️' },
    home: team('Autriche','AUT', 38, 25,0,0,0,0,0,0,0,1.3,1.1,11.8,4.2,52,['W','D','W','W','L'],[
      {date:'2026-06-16T21:00:00Z',opponent:'Jordanie',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-22T18:00:00Z',opponent:'Argentine',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-27T23:00:00Z',opponent:'Algérie',home:false,competition:'Coupe du Monde'},
    ]),
    away: team('Jordanie','JOR', null, 75,0,0,0,0,0,0,0,0.9,1.4,9.8,3.3,46,['D','W','L','D','W'],[
      {date:'2026-06-16T21:00:00Z',opponent:'Autriche',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-22T21:00:00Z',opponent:'Algérie',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-27T20:00:00Z',opponent:'Argentine',home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f048', league: 'cdm', round: 'Groupe J — J2',
    date: '2026-06-22T18:00:00Z',
    venue: { name: 'MetLife Stadium', city: 'East Rutherford, NJ', capacity: 82500 },
    weather: { temp: 26, condition: 'Peu nuageux', wind: 10, humidity: 62, icon: '🌤️' },
    home: team('Argentine','ARG', 26, 1,0,0,0,0,0,0,0,2.0,0.8,14.6,5.4,58,['W','W','W','W','W'],[
      {date:'2026-06-16T18:00:00Z',opponent:'Algérie',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-22T18:00:00Z',opponent:'Autriche',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-27T20:00:00Z',opponent:'Jordanie',home:false,competition:'Coupe du Monde'},
    ]),
    away: team('Autriche','AUT', 38, 25,0,0,0,0,0,0,0,1.3,1.1,11.8,4.2,52,['W','D','W','W','L'],[
      {date:'2026-06-16T21:00:00Z',opponent:'Jordanie',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-22T18:00:00Z',opponent:'Argentine',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-27T23:00:00Z',opponent:'Algérie',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f049', league: 'cdm', round: 'Groupe J — J2',
    date: '2026-06-22T21:00:00Z',
    venue: { name: 'Lincoln Financial Field', city: 'Philadelphia, PA', capacity: 69176 },
    weather: { temp: 27, condition: 'Nuageux', wind: 12, humidity: 66, icon: '⛅' },
    home: team('Jordanie','JOR', null, 75,0,0,0,0,0,0,0,0.9,1.4,9.8,3.3,46,['D','W','L','D','W'],[
      {date:'2026-06-16T21:00:00Z',opponent:'Autriche',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-22T21:00:00Z',opponent:'Algérie',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-27T20:00:00Z',opponent:'Argentine',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('Algérie','ALG', null, 30,0,0,0,0,0,0,0,1.2,1.2,11.0,3.8,51,['W','W','D','W','L'],[
      {date:'2026-06-16T18:00:00Z',opponent:'Argentine',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-22T21:00:00Z',opponent:'Jordanie',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-27T23:00:00Z',opponent:'Autriche',home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f050', league: 'cdm', round: 'Groupe J — J3',
    date: '2026-06-27T23:00:00Z',
    venue: { name: 'Gillette Stadium', city: 'Foxborough, MA', capacity: 65878 },
    weather: { temp: 22, condition: 'Peu nuageux', wind: 12, humidity: 68, icon: '🌤️' },
    home: team('Algérie','ALG', null, 30,0,0,0,0,0,0,0,1.2,1.2,11.0,3.8,51,['W','W','D','W','L'],[
      {date:'2026-06-16T18:00:00Z',opponent:'Argentine',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-22T21:00:00Z',opponent:'Jordanie',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-27T23:00:00Z',opponent:'Autriche',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('Autriche','AUT', 38, 25,0,0,0,0,0,0,0,1.3,1.1,11.8,4.2,52,['W','D','W','W','L'],[
      {date:'2026-06-16T21:00:00Z',opponent:'Jordanie',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-22T18:00:00Z',opponent:'Argentine',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-27T23:00:00Z',opponent:'Algérie',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f051', league: 'cdm', round: 'Groupe J — J3',
    date: '2026-06-27T20:00:00Z',
    venue: { name: 'BC Place', city: 'Vancouver, BC', capacity: 54500 },
    weather: { temp: 20, condition: 'Ensoleillé', wind: 8, humidity: 62, icon: '☀️' },
    home: team('Jordanie','JOR', null, 75,0,0,0,0,0,0,0,0.9,1.4,9.8,3.3,46,['D','W','L','D','W'],[
      {date:'2026-06-16T21:00:00Z',opponent:'Autriche',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-22T21:00:00Z',opponent:'Algérie',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-27T20:00:00Z',opponent:'Argentine',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('Argentine','ARG', 26, 1,0,0,0,0,0,0,0,2.0,0.8,14.6,5.4,58,['W','W','W','W','W'],[
      {date:'2026-06-16T18:00:00Z',opponent:'Algérie',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-22T18:00:00Z',opponent:'Autriche',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-27T20:00:00Z',opponent:'Jordanie',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },

  // ── COUPE DU MONDE 2026 — Groupe K (Portugal) ────────────────────────────
  {
    id: 'f052', league: 'cdm', round: 'Groupe K — J1',
    date: '2026-06-17T22:00:00Z',
    venue: { name: "Levi's Stadium", city: 'Santa Clara, CA', capacity: 68500 },
    weather: { temp: 19, condition: 'Peu nuageux', wind: 10, humidity: 68, icon: '🌤️' },
    home: team('Portugal','POR', 27, 6,0,0,0,0,0,0,0,1.9,0.8,14.2,5.3,57,['W','W','W','D','W'],[
      {date:'2026-06-17T22:00:00Z',opponent:'RD Congo',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-23T22:00:00Z',opponent:'Ouzbékistan',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-27T20:00:00Z',opponent:'Colombie',home:false,competition:'Coupe du Monde'},
    ]),
    away: team('RD Congo','COD', null, 58,0,0,0,0,0,0,0,1.1,1.3,10.8,3.6,50,['W','D','W','W','L'],[
      {date:'2026-06-17T22:00:00Z',opponent:'Portugal',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-23T21:00:00Z',opponent:'Colombie',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-27T23:00:00Z',opponent:'Ouzbékistan',home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f053', league: 'cdm', round: 'Groupe K — J1',
    date: '2026-06-17T18:00:00Z',
    venue: { name: 'Arrowhead Stadium', city: 'Kansas City, MO', capacity: 76416 },
    weather: { temp: 28, condition: 'Peu nuageux', wind: 14, humidity: 60, icon: '🌤️' },
    home: team('Ouzbékistan','UZB', null, 79,0,0,0,0,0,0,0,0.9,1.4,9.6,3.2,47,['W','D','W','L','D'],[
      {date:'2026-06-17T18:00:00Z',opponent:'Colombie',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-23T22:00:00Z',opponent:'Portugal',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-27T23:00:00Z',opponent:'RD Congo',home:false,competition:'Coupe du Monde'},
    ]),
    away: team('Colombie','COL', 8, 11,0,0,0,0,0,0,0,1.6,0.9,13.2,4.9,55,['W','W','D','W','W'],[
      {date:'2026-06-17T18:00:00Z',opponent:'Ouzbékistan',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-23T21:00:00Z',opponent:'RD Congo',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-27T20:00:00Z',opponent:'Portugal',home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f054', league: 'cdm', round: 'Groupe K — J2',
    date: '2026-06-23T22:00:00Z',
    venue: { name: 'SoFi Stadium', city: 'Inglewood, CA', capacity: 70240 },
    weather: { temp: 21, condition: 'Ensoleillé', wind: 8, humidity: 42, icon: '☀️' },
    home: team('Portugal','POR', 27, 6,0,0,0,0,0,0,0,1.9,0.8,14.2,5.3,57,['W','W','W','D','W'],[
      {date:'2026-06-17T22:00:00Z',opponent:'RD Congo',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-23T22:00:00Z',opponent:'Ouzbékistan',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-27T20:00:00Z',opponent:'Colombie',home:false,competition:'Coupe du Monde'},
    ]),
    away: team('Ouzbékistan','UZB', null, 79,0,0,0,0,0,0,0,0.9,1.4,9.6,3.2,47,['W','D','W','L','D'],[
      {date:'2026-06-17T18:00:00Z',opponent:'Colombie',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-23T22:00:00Z',opponent:'Portugal',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-27T23:00:00Z',opponent:'RD Congo',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f055', league: 'cdm', round: 'Groupe K — J2',
    date: '2026-06-23T21:00:00Z',
    venue: { name: 'NRG Stadium', city: 'Houston, TX', capacity: 72220 },
    weather: { temp: 32, condition: 'Ensoleillé', wind: 8, humidity: 76, icon: '☀️' },
    home: team('Colombie','COL', 8, 11,0,0,0,0,0,0,0,1.6,0.9,13.2,4.9,55,['W','W','D','W','W'],[
      {date:'2026-06-17T18:00:00Z',opponent:'Ouzbékistan',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-23T21:00:00Z',opponent:'RD Congo',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-27T20:00:00Z',opponent:'Portugal',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('RD Congo','COD', null, 58,0,0,0,0,0,0,0,1.1,1.3,10.8,3.6,50,['W','D','W','W','L'],[
      {date:'2026-06-17T22:00:00Z',opponent:'Portugal',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-23T21:00:00Z',opponent:'Colombie',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-27T23:00:00Z',opponent:'Ouzbékistan',home:true,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f056', league: 'cdm', round: 'Groupe K — J3',
    date: '2026-06-27T20:00:00Z',
    venue: { name: 'AT&T Stadium', city: 'Arlington, TX', capacity: 80000 },
    weather: { temp: 33, condition: 'Ensoleillé', wind: 6, humidity: 55, icon: '☀️' },
    home: team('Colombie','COL', 8, 11,0,0,0,0,0,0,0,1.6,0.9,13.2,4.9,55,['W','W','D','W','W'],[
      {date:'2026-06-17T18:00:00Z',opponent:'Ouzbékistan',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-23T21:00:00Z',opponent:'RD Congo',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-27T20:00:00Z',opponent:'Portugal',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('Portugal','POR', 27, 6,0,0,0,0,0,0,0,1.9,0.8,14.2,5.3,57,['W','W','W','D','W'],[
      {date:'2026-06-17T22:00:00Z',opponent:'RD Congo',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-23T22:00:00Z',opponent:'Ouzbékistan',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-27T20:00:00Z',opponent:'Colombie',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
  {
    id: 'f057', league: 'cdm', round: 'Groupe K — J3',
    date: '2026-06-27T23:00:00Z',
    venue: { name: 'BMO Field', city: 'Toronto, ON', capacity: 45736 },
    weather: { temp: 23, condition: 'Nuageux', wind: 12, humidity: 68, icon: '⛅' },
    home: team('RD Congo','COD', null, 58,0,0,0,0,0,0,0,1.1,1.3,10.8,3.6,50,['W','D','W','W','L'],[
      {date:'2026-06-17T22:00:00Z',opponent:'Portugal',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-23T21:00:00Z',opponent:'Colombie',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-27T23:00:00Z',opponent:'Ouzbékistan',home:true,competition:'Coupe du Monde'},
    ]),
    away: team('Ouzbékistan','UZB', null, 79,0,0,0,0,0,0,0,0.9,1.4,9.6,3.2,47,['W','D','W','L','D'],[
      {date:'2026-06-17T18:00:00Z',opponent:'Colombie',home:true,competition:'Coupe du Monde'},
      {date:'2026-06-23T22:00:00Z',opponent:'Portugal',home:false,competition:'Coupe du Monde'},
      {date:'2026-06-27T23:00:00Z',opponent:'RD Congo',home:false,competition:'Coupe du Monde'},
    ]),
    h2h:[],
  },
];

export const getFixtureById    = id       => FIXTURES.find(f => f.id === id) || null;
export const getFixturesByLeague = leagueId => FIXTURES.filter(f => f.league === leagueId);
export const getLeagueById     = id       => LEAGUES.find(l => l.id === id) || null;
