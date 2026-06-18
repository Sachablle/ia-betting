export const BBALL_LEAGUES = [
  { id: 'nba',        name: 'NBA',           country: 'USA',     accent: '#c9082a', flag: '🇺🇸', standingsUrl: 'https://www.nba.com/standings' },
  { id: 'wnba',       name: 'WNBA',          country: 'USA',     accent: '#e11d48', flag: '🇺🇸', standingsUrl: 'https://www.wnba.com/standings' },
  { id: 'euroleague', name: 'EuroLeague',    country: 'Europe',  accent: '#0055a4', flag: '🇪🇺', standingsUrl: 'https://www.euroleague.net/competition/standings' },
  { id: 'acb',        name: 'ACB',           country: 'Espagne', accent: '#c60b1e', flag: '🇪🇸', standingsUrl: 'https://www.acb.com/clasificacion' },
  { id: 'lnb',        name: 'Betclic Élite', country: 'France',  accent: '#002395', flag: '🇫🇷', standingsUrl: 'https://www.lnb.fr/betclic-elite' },
  { id: 'bbl',        name: 'BBL',           country: 'Allemagne',accent: '#000000', flag: '🇩🇪', standingsUrl: 'https://www.easycredit-bbl.de/tabelle' },
  { id: 'legaa',      name: 'Lega A',        country: 'Italie',  accent: '#009246', flag: '🇮🇹', standingsUrl: 'https://www.legabasket.it/classifica' },
];

function team(name, short, logoId, position, wins, losses, ppg, oppg, rpg, apg, fg, form) {
  return { name, short, logoId, position, wins, losses, ppg, oppg, rpg, apg, fg, form };
}

export const BBALL_FIXTURES = [
  // ── NBA PLAYOFFS 2026 ──────────────────────────────────────────────────
  // CONVENTION DATES : les matchs NBA jouent en ET (UTC-4 en été).
  // 20h30 ET  → lendemain T00:30:00Z   |  19h30 ET → lendemain T23:30:00Z
  // Exemple : 25 mai 20h30 ET = 2026-05-26T00:30:00Z  (PAS 2026-05-25T00:30:00Z)

  // FINALES DE CONFÉRENCE OUEST — OKC vs SAS (Game 1 — Terminé 2OT, SAS 1-0)
  {
    id: 'b001', league: 'nba', round: 'Finales Conf. Ouest – Terminée G1 (SAS 1-0)',
    date: '2026-05-19T00:30:00Z',
    venue: { name: 'Paycom Center', city: 'Oklahoma City', capacity: 18203 },
    home: { ...team('Oklahoma City Thunder', 'OKC', 'okc', 1, 64, 18, 119.0, 108.2, 44.1, 27.5, 48.4, ['W','W','W','W','W']), score: 115 },
    away: { ...team('San Antonio Spurs',     'SAS', 'sas', 2, 62, 20, 119.8, 109.4, 47.0, 28.1, 47.8, ['W','W','L','W','W']), score: 122 },
    h2h: [
      { date: '2025-11-05', home: 'OKC', away: 'SAS', scoreHome: 124, scoreAway: 116 },
      { date: '2025-12-19', home: 'SAS', away: 'OKC', scoreHome: 128, scoreAway: 119 },
      { date: '2026-02-11', home: 'OKC', away: 'SAS', scoreHome: 118, scoreAway: 111 },
      { date: '2026-03-22', home: 'SAS', away: 'OKC', scoreHome: 121, scoreAway: 118 },
    ],
    markets: {},
  },

  // FINALES DE CONFÉRENCE OUEST — OKC vs SAS (Game 2 — Terminé, OKC 1-1)
  {
    id: 'b011', league: 'nba', round: 'Finales Conf. Ouest – Terminée G2 (1-1)',
    date: '2026-05-21T00:30:00Z',
    venue: { name: 'Paycom Center', city: 'Oklahoma City', capacity: 18203 },
    home: { ...team('Oklahoma City Thunder', 'OKC', 'okc', 1, 64, 18, 119.0, 108.2, 44.1, 27.5, 48.4, ['W','W','W','L','W']), score: 122 },
    away: { ...team('San Antonio Spurs',     'SAS', 'sas', 2, 62, 20, 119.8, 109.4, 47.0, 28.1, 47.8, ['W','L','W','W','W']), score: 113 },
    h2h: [
      { date: '2025-11-05', home: 'OKC', away: 'SAS', scoreHome: 124, scoreAway: 116 },
      { date: '2025-12-19', home: 'SAS', away: 'OKC', scoreHome: 128, scoreAway: 119 },
      { date: '2026-02-11', home: 'OKC', away: 'SAS', scoreHome: 118, scoreAway: 111 },
      { date: '2026-03-22', home: 'SAS', away: 'OKC', scoreHome: 121, scoreAway: 118 },
      { date: '2026-05-19', home: 'OKC', away: 'SAS', scoreHome: 115, scoreAway: 122 },
      { date: '2026-05-21', home: 'OKC', away: 'SAS', scoreHome: 122, scoreAway: 113 },
    ],
    markets: {},
  },

  // FINALES DE CONFÉRENCE OUEST — SAS vs OKC (Game 3, 22 mai — Terminée OKC 2-1)
  {
    id: 'b012', league: 'nba', round: 'Finales Conf. Ouest – Terminée G3 (OKC 2-1)',
    date: '2026-05-23T00:30:00Z',
    venue: { name: 'Frost Bank Center', city: 'San Antonio', capacity: 18418 },
    home: { ...team('San Antonio Spurs',      'SAS', 'sas', 2, 62, 20, 119.8, 109.4, 47.0, 28.1, 47.8, ['L','W','W','W','W']), score: 108 },
    away: { ...team('Oklahoma City Thunder',  'OKC', 'okc', 1, 64, 18, 119.0, 108.2, 44.1, 27.5, 48.4, ['W','W','W','L','W']), score: 123 },
    h2h: [
      { date: '2025-11-05', home: 'OKC', away: 'SAS', scoreHome: 124, scoreAway: 116 },
      { date: '2025-12-19', home: 'SAS', away: 'OKC', scoreHome: 128, scoreAway: 119 },
      { date: '2026-02-11', home: 'OKC', away: 'SAS', scoreHome: 118, scoreAway: 111 },
      { date: '2026-03-22', home: 'SAS', away: 'OKC', scoreHome: 121, scoreAway: 118 },
      { date: '2026-05-19', home: 'OKC', away: 'SAS', scoreHome: 115, scoreAway: 122 },
      { date: '2026-05-21', home: 'OKC', away: 'SAS', scoreHome: 122, scoreAway: 113 },
    ],
    markets: {},
  },

  // FINALES DE CONFÉRENCE OUEST — SAS vs OKC (Game 4, 24 mai à San Antonio)
  {
    id: 'b015', league: 'nba', round: 'Finales Conf. Ouest – Terminée G4 (SAS 2-2)',
    date: '2026-05-26T00:30:00Z',
    venue: { name: 'Frost Bank Center', city: 'San Antonio', capacity: 18418 },
    home: { ...team('San Antonio Spurs',      'SAS', 'sas', 2, 62, 20, 119.8, 109.4, 47.0, 28.1, 47.8, ['L','L','W','W','W']), score: 103 },
    away: { ...team('Oklahoma City Thunder',  'OKC', 'okc', 1, 64, 18, 119.0, 108.2, 44.1, 27.5, 48.4, ['W','W','W','W','L']), score: 82  },
    h2h: [
      { date: '2025-11-05', home: 'OKC', away: 'SAS', scoreHome: 124, scoreAway: 116 },
      { date: '2025-12-19', home: 'SAS', away: 'OKC', scoreHome: 128, scoreAway: 119 },
      { date: '2026-02-11', home: 'OKC', away: 'SAS', scoreHome: 118, scoreAway: 111 },
      { date: '2026-03-22', home: 'SAS', away: 'OKC', scoreHome: 121, scoreAway: 118 },
      { date: '2026-05-19', home: 'OKC', away: 'SAS', scoreHome: 115, scoreAway: 122 },
      { date: '2026-05-21', home: 'OKC', away: 'SAS', scoreHome: 122, scoreAway: 113 },
      { date: '2026-05-22', home: 'SAS', away: 'OKC', scoreHome: 108, scoreAway: 123 },
      { date: '2026-05-25', home: 'SAS', away: 'OKC', scoreHome: 103, scoreAway: 82  },
    ],
    markets: {},
  },

  // FINALES DE CONFÉRENCE OUEST — OKC vs SAS (Game 5 — Terminée, OKC 3-2)
  {
    id: 'b019', league: 'nba', round: 'Finales Conf. Ouest – Terminée G5 (OKC 3-2)',
    date: '2026-05-27T00:30:00Z',
    venue: { name: 'Paycom Center', city: 'Oklahoma City', capacity: 18203 },
    home: { ...team('Oklahoma City Thunder',  'OKC', 'okc', 1, 64, 18, 119.0, 108.2, 44.1, 27.5, 48.4, ['W','L','W','L','W']), score: 127 },
    away: { ...team('San Antonio Spurs',      'SAS', 'sas', 2, 62, 20, 119.8, 109.4, 47.0, 28.1, 47.8, ['W','W','L','W','L']), score: 114 },
    h2h: [
      { date: '2025-11-05', home: 'OKC', away: 'SAS', scoreHome: 124, scoreAway: 116 },
      { date: '2025-12-19', home: 'SAS', away: 'OKC', scoreHome: 128, scoreAway: 119 },
      { date: '2026-02-11', home: 'OKC', away: 'SAS', scoreHome: 118, scoreAway: 111 },
      { date: '2026-03-22', home: 'SAS', away: 'OKC', scoreHome: 121, scoreAway: 118 },
      { date: '2026-05-19', home: 'OKC', away: 'SAS', scoreHome: 115, scoreAway: 122 },
      { date: '2026-05-21', home: 'OKC', away: 'SAS', scoreHome: 122, scoreAway: 113 },
      { date: '2026-05-22', home: 'SAS', away: 'OKC', scoreHome: 108, scoreAway: 123 },
      { date: '2026-05-25', home: 'SAS', away: 'OKC', scoreHome: 103, scoreAway: 82  },
      { date: '2026-05-26', home: 'OKC', away: 'SAS', scoreHome: 127, scoreAway: 114 },
    ],
    markets: {},
  },

  // FINALES DE CONFÉRENCE OUEST — SAS vs OKC (Game 6 — Terminée, SAS 118-91, Série 3-3)
  {
    id: 'b020', league: 'nba', round: 'Finales Conf. Ouest – Terminée G6 (Série 3-3)',
    date: '2026-05-29T00:30:00Z',
    venue: { name: 'Frost Bank Center', city: 'San Antonio', capacity: 18418 },
    home: { ...team('San Antonio Spurs',      'SAS', 'sas', 2, 62, 20, 119.8, 109.4, 47.0, 28.1, 47.8, ['W','L','W','L','W']), score: 118 },
    away: { ...team('Oklahoma City Thunder',  'OKC', 'okc', 1, 64, 18, 119.0, 108.2, 44.1, 27.5, 48.4, ['L','W','L','W','L']), score: 91  },
    h2h: [
      { date: '2025-12-19', home: 'SAS', away: 'OKC', scoreHome: 128, scoreAway: 119 },
      { date: '2026-02-11', home: 'OKC', away: 'SAS', scoreHome: 118, scoreAway: 111 },
      { date: '2026-03-22', home: 'SAS', away: 'OKC', scoreHome: 121, scoreAway: 118 },
      { date: '2026-05-19', home: 'OKC', away: 'SAS', scoreHome: 115, scoreAway: 122 },
      { date: '2026-05-21', home: 'OKC', away: 'SAS', scoreHome: 122, scoreAway: 113 },
      { date: '2026-05-22', home: 'SAS', away: 'OKC', scoreHome: 108, scoreAway: 123 },
      { date: '2026-05-25', home: 'SAS', away: 'OKC', scoreHome: 103, scoreAway:  82 },
      { date: '2026-05-26', home: 'OKC', away: 'SAS', scoreHome: 127, scoreAway: 114 },
      { date: '2026-05-28', home: 'SAS', away: 'OKC', scoreHome: 118, scoreAway:  91 },
    ],
    markets: {},
  },

  // FINALES DE CONFÉRENCE OUEST — OKC vs SAS (Game 7 — Terminée, SAS 111-103, SAS 4-3)
  {
    id: 'b021', league: 'nba', round: 'Finales Conf. Ouest – Terminée G7 (SAS 4-3)',
    date: '2026-05-31T00:30:00Z',
    venue: { name: 'Paycom Center', city: 'Oklahoma City', capacity: 18203 },
    home: { ...team('Oklahoma City Thunder',  'OKC', 'okc', 1, 64, 18, 119.0, 108.2, 44.1, 27.5, 48.4, ['W','L','W','L','L']), score: 103 },
    away: { ...team('San Antonio Spurs',      'SAS', 'sas', 2, 62, 20, 119.8, 109.4, 47.0, 28.1, 47.8, ['L','W','L','W','W']), score: 111 },
    h2h: [
      { date: '2025-12-19', home: 'SAS', away: 'OKC', scoreHome: 128, scoreAway: 119 },
      { date: '2026-02-11', home: 'OKC', away: 'SAS', scoreHome: 118, scoreAway: 111 },
      { date: '2026-03-22', home: 'SAS', away: 'OKC', scoreHome: 121, scoreAway: 118 },
      { date: '2026-05-19', home: 'OKC', away: 'SAS', scoreHome: 115, scoreAway: 122 },
      { date: '2026-05-21', home: 'OKC', away: 'SAS', scoreHome: 122, scoreAway: 113 },
      { date: '2026-05-22', home: 'SAS', away: 'OKC', scoreHome: 108, scoreAway: 123 },
      { date: '2026-05-25', home: 'SAS', away: 'OKC', scoreHome: 103, scoreAway:  82 },
      { date: '2026-05-26', home: 'OKC', away: 'SAS', scoreHome: 127, scoreAway: 114 },
      { date: '2026-05-28', home: 'SAS', away: 'OKC', scoreHome: 118, scoreAway:  91 },
      { date: '2026-05-30', home: 'OKC', away: 'SAS', scoreHome: 103, scoreAway: 111 },
    ],
    markets: {},
  },

  // DEMI-FINALES CONF. EST — CLE bat DET 4-3 (terminé)
  {
    id: 'b002', league: 'nba', round: 'Demi-Finales Conf. Est – Terminée (4-3)',
    date: '2026-05-18T00:00:00Z',
    venue: { name: 'Little Caesars Arena', city: 'Detroit', capacity: 20491 },
    home: { ...team('Detroit Pistons',     'DET', 'det', 1, 60, 22, 116.8, 110.4, 45.2, 26.4, 47.2, ['L','W','L','L','W']), score: 94 },
    away: { ...team('Cleveland Cavaliers', 'CLE', 'cle', 4, 52, 30, 119.5, 113.8, 45.4, 27.2, 47.4, ['W','L','W','W','L']), score: 125 },
    h2h: [
      { date: '2026-05-05', home: 'DET', away: 'CLE', scoreHome: 111, scoreAway: 101 },
      { date: '2026-05-07', home: 'DET', away: 'CLE', scoreHome: 107, scoreAway:  97 },
      { date: '2026-05-09', home: 'CLE', away: 'DET', scoreHome: 116, scoreAway: 109 },
      { date: '2026-05-11', home: 'CLE', away: 'DET', scoreHome: 112, scoreAway: 103 },
      { date: '2026-05-13', home: 'DET', away: 'CLE', scoreHome: 113, scoreAway: 117 },
      { date: '2026-05-15', home: 'CLE', away: 'DET', scoreHome:  94, scoreAway: 115 },
      { date: '2026-05-18', home: 'DET', away: 'CLE', scoreHome:  94, scoreAway: 125 },
    ],
    markets: {},
  },

  // DEMI-FINALES CONF. EST — NYK sweep PHI 4-0 (terminé)
  {
    id: 'b003', league: 'nba', round: 'Demi-Finales Conf. Est – Terminée (4-0)',
    date: '2026-05-10T22:00:00Z',
    venue: { name: 'Wells Fargo Center', city: 'Philadelphia', capacity: 20478 },
    home: { ...team('Philadelphia 76ers',    'PHI', 'phi', 2, 55, 27, 116.4, 113.2, 44.1, 26.2, 47.2, ['W','L','L','L','L']), score: 114 },
    away: { ...team('New York Knicks',       'NYK', 'nyk', 3, 53, 29, 116.5, 112.6, 45.6, 27.4, 47.1, ['W','W','W','W','W']), score: 144 },
    h2h: [
      { date: '2026-05-04', home: 'NYK', away: 'PHI', scoreHome: 137, scoreAway:  98 },
      { date: '2026-05-06', home: 'NYK', away: 'PHI', scoreHome: 108, scoreAway: 102 },
      { date: '2026-05-08', home: 'PHI', away: 'NYK', scoreHome:  94, scoreAway: 108 },
      { date: '2026-05-10', home: 'PHI', away: 'NYK', scoreHome: 114, scoreAway: 144 },
    ],
    markets: {},
  },

  // DEMI-FINALES CONF. OUEST — SAS bat MIN 4-2 (terminé 15 mai)
  {
    id: 'b004', league: 'nba', round: 'Demi-Finales Conf. Ouest – Terminée (4-2)',
    date: '2026-05-16T00:30:00Z',
    venue: { name: 'Target Center', city: 'Minneapolis', capacity: 18978 },
    home: { ...team('Minnesota Timberwolves', 'MIN', 'min', 6, 49, 33, 118.0, 114.6, 44.1, 26.1, 46.8, ['L','L','W','L','L']), score: 109 },
    away: { ...team('San Antonio Spurs',      'SAS', 'sas', 2, 62, 20, 119.8, 109.4, 47.0, 28.1, 47.8, ['W','W','L','W','W']), score: 139 },
    h2h: [
      { date: '2026-05-04', home: 'SAS', away: 'MIN', scoreHome: 102, scoreAway: 104 },
      { date: '2026-05-06', home: 'SAS', away: 'MIN', scoreHome: 133, scoreAway:  95 },
      { date: '2026-05-08', home: 'MIN', away: 'SAS', scoreHome: 108, scoreAway: 115 },
      { date: '2026-05-10', home: 'MIN', away: 'SAS', scoreHome: 114, scoreAway: 109 },
      { date: '2026-05-12', home: 'SAS', away: 'MIN', scoreHome: 126, scoreAway:  97 },
      { date: '2026-05-15', home: 'MIN', away: 'SAS', scoreHome: 109, scoreAway: 139 },
    ],
    markets: {},
  },

  // DEMI-FINALES CONF. OUEST — OKC sweep LAL 4-0 (terminé 11 mai)
  {
    id: 'b005', league: 'nba', round: 'Demi-Finales Conf. Ouest – Terminée (4-0)',
    date: '2026-05-12T01:00:00Z',
    venue: { name: 'Crypto.com Arena', city: 'Los Angeles', capacity: 18997 },
    home: { ...team('Los Angeles Lakers',    'LAL', 'lal', 4, 53, 29, 117.8, 114.2, 44.6, 27.1, 47.2, ['W','L','L','L','L']), score: 110 },
    away: { ...team('Oklahoma City Thunder', 'OKC', 'okc', 1, 64, 18, 119.0, 108.2, 44.1, 27.5, 48.4, ['W','W','W','W','W']), score: 115 },
    h2h: [
      { date: '2026-05-05', home: 'OKC', away: 'LAL', scoreHome: 108, scoreAway:  90 },
      { date: '2026-05-07', home: 'OKC', away: 'LAL', scoreHome: 125, scoreAway: 107 },
      { date: '2026-05-09', home: 'LAL', away: 'OKC', scoreHome: 108, scoreAway: 131 },
      { date: '2026-05-11', home: 'LAL', away: 'OKC', scoreHome: 110, scoreAway: 115 },
    ],
    markets: {},
  },

  // FINALES DE CONFÉRENCE EST — NYK vs CLE (Game 1, 19 mai — Terminée NYK 1-0)
  {
    id: 'b010', league: 'nba', round: 'Finales Conf. Est – Terminée G1 (NYK 1-0)',
    date: '2026-05-19T23:00:00Z',
    venue: { name: 'Madison Square Garden', city: 'New York', capacity: 19812 },
    home: { ...team('New York Knicks',     'NYK', 'nyk', 3, 53, 29, 116.5, 112.6, 45.6, 27.4, 47.1, ['W','W','W','W','W']), score: 115 },
    away: { ...team('Cleveland Cavaliers', 'CLE', 'cle', 4, 52, 30, 119.5, 113.8, 45.4, 27.2, 47.4, ['L','W','W','W','L']), score: 104 },
    h2h: [
      { date: '2025-11-08', home: 'NYK', away: 'CLE', scoreHome: 119, scoreAway: 111 },
      { date: '2026-01-12', home: 'CLE', away: 'NYK', scoreHome: 109, scoreAway:  94 },
      { date: '2026-03-05', home: 'NYK', away: 'CLE', scoreHome: 126, scoreAway: 124 },
    ],
    markets: {},
  },

  // FINALES DE CONFÉRENCE EST — NYK vs CLE (Game 2, 21 mai — Terminée NYK 2-0)
  {
    id: 'b013', league: 'nba', round: 'Finales Conf. Est – Terminée G2 (NYK 2-0)',
    date: '2026-05-21T23:00:00Z',
    venue: { name: 'Madison Square Garden', city: 'New York', capacity: 19812 },
    home: { ...team('New York Knicks',     'NYK', 'nyk', 3, 53, 29, 116.5, 112.6, 45.6, 27.4, 47.1, ['W','W','W','W','W']), score: 109 },
    away: { ...team('Cleveland Cavaliers', 'CLE', 'cle', 4, 52, 30, 119.5, 113.8, 45.4, 27.2, 47.4, ['L','L','W','W','W']), score: 93 },
    h2h: [
      { date: '2025-11-08', home: 'NYK', away: 'CLE', scoreHome: 119, scoreAway: 111 },
      { date: '2026-01-12', home: 'CLE', away: 'NYK', scoreHome: 109, scoreAway:  94 },
      { date: '2026-03-05', home: 'NYK', away: 'CLE', scoreHome: 126, scoreAway: 124 },
      { date: '2026-05-19', home: 'NYK', away: 'CLE', scoreHome: 115, scoreAway: 104 },
    ],
    markets: {},
  },

  // FINALES DE CONFÉRENCE EST — CLE vs NYK (Game 3, 23 mai à Cleveland) — Terminée NYK 121-108, NYK 3-0
  {
    id: 'b014', league: 'nba', round: 'Finales Conf. Est – Terminée G3 (NYK 3-0)',
    date: '2026-05-24T00:30:00Z',
    venue: { name: 'Rocket Mortgage FieldHouse', city: 'Cleveland', capacity: 19432 },
    home: { ...team('Cleveland Cavaliers', 'CLE', 'cle', 4, 52, 30, 119.5, 113.8, 45.4, 27.2, 47.4, ['L','L','L','W','W']), score: 108 },
    away: { ...team('New York Knicks',     'NYK', 'nyk', 3, 53, 29, 116.5, 112.6, 45.6, 27.4, 47.1, ['W','W','W','W','W']), score: 121 },
    h2h: [
      { date: '2025-11-08', home: 'NYK', away: 'CLE', scoreHome: 119, scoreAway: 111 },
      { date: '2026-01-12', home: 'CLE', away: 'NYK', scoreHome: 109, scoreAway:  94 },
      { date: '2026-03-05', home: 'NYK', away: 'CLE', scoreHome: 126, scoreAway: 124 },
      { date: '2026-05-19', home: 'NYK', away: 'CLE', scoreHome: 115, scoreAway: 104 },
      { date: '2026-05-21', home: 'NYK', away: 'CLE', scoreHome: 109, scoreAway:  93 },
      { date: '2026-05-23', home: 'CLE', away: 'NYK', scoreHome: 108, scoreAway: 121 },
    ],
    markets: {},
  },

  // FINALES DE CONFÉRENCE EST — CLE vs NYK (Game 4 — Terminée, NYK 130-93, NYK 4-0)
  {
    id: 'b018', league: 'nba', round: 'Finales Conf. Est – Terminée G4 (NYK 4-0)',
    date: '2026-05-26T00:00:00Z',
    venue: { name: 'Rocket Mortgage FieldHouse', city: 'Cleveland', capacity: 19432 },
    home: { ...team('Cleveland Cavaliers', 'CLE', 'cle', 4, 52, 30, 119.5, 113.8, 45.4, 27.2, 47.4, ['L','L','L','L','W']), score:  93 },
    away: { ...team('New York Knicks',     'NYK', 'nyk', 3, 53, 29, 116.5, 112.6, 45.6, 27.4, 47.1, ['W','W','W','W','W']), score: 130 },
    h2h: [
      { date: '2026-01-12', home: 'CLE', away: 'NYK', scoreHome: 109, scoreAway:  94 },
      { date: '2026-03-05', home: 'NYK', away: 'CLE', scoreHome: 126, scoreAway: 124 },
      { date: '2026-05-19', home: 'NYK', away: 'CLE', scoreHome: 115, scoreAway: 104 },
      { date: '2026-05-21', home: 'NYK', away: 'CLE', scoreHome: 109, scoreAway:  93 },
      { date: '2026-05-23', home: 'CLE', away: 'NYK', scoreHome: 108, scoreAway: 121 },
      { date: '2026-05-25', home: 'CLE', away: 'NYK', scoreHome:  93, scoreAway: 130 },
    ],
    markets: {},
  },

  // ── NBA FINALS 2026 — SAS vs NYK ──────────────────────────────────────────
  // SAS (62-20) a l'avantage du terrain. 20h30 ET → lendemain T00:30:00Z

  // FINALES NBA — G1 (3 juin, SAS home) — Terminée, NYK 105-95 (NYK 1-0)
  {
    id: 'b022', league: 'nba', round: 'Finales NBA – Terminée G1 (NYK 1-0)',
    date: '2026-06-04T00:30:00Z',
    venue: { name: 'Frost Bank Center', city: 'San Antonio', capacity: 18418 },
    home: { ...team('San Antonio Spurs', 'SAS', 'sas', 2, 62, 20, 119.8, 109.4, 47.0, 28.1, 47.8, ['W','W','L','W','W']), score: 95 },
    away: { ...team('New York Knicks',   'NYK', 'nyk', 3, 53, 29, 116.5, 112.6, 45.6, 27.4, 47.1, ['W','W','W','W','W']), score: 105 },
    h2h: [
      { date: '2025-11-14', home: 'SAS', away: 'NYK', scoreHome: 121, scoreAway: 118 },
      { date: '2026-01-22', home: 'NYK', away: 'SAS', scoreHome: 112, scoreAway: 108 },
      { date: '2026-03-01', home: 'SAS', away: 'NYK', scoreHome: 119, scoreAway: 115 },
    ],
    markets: {},
  },

  // FINALES NBA — G2 (5 juin, SAS home) — Terminée, NYK 105-104 (NYK 2-0)
  {
    id: 'b023', league: 'nba', round: 'Finales NBA – Terminée G2 (NYK 2-0)',
    date: '2026-06-06T00:30:00Z',
    venue: { name: 'Frost Bank Center', city: 'San Antonio', capacity: 18418 },
    home: { ...team('San Antonio Spurs', 'SAS', 'sas', 2, 62, 20, 119.8, 109.4, 47.0, 28.1, 47.8, ['W','W','L','W','W']), score: 104 },
    away: { ...team('New York Knicks',   'NYK', 'nyk', 3, 53, 29, 116.5, 112.6, 45.6, 27.4, 47.1, ['W','W','W','W','W']), score: 105 },
    h2h: [
      { date: '2025-11-14', home: 'SAS', away: 'NYK', scoreHome: 121, scoreAway: 118 },
      { date: '2026-01-22', home: 'NYK', away: 'SAS', scoreHome: 112, scoreAway: 108 },
      { date: '2026-03-01', home: 'SAS', away: 'NYK', scoreHome: 119, scoreAway: 115 },
      { date: '2026-06-03', home: 'SAS', away: 'NYK', scoreHome:  95, scoreAway: 105 },
    ],
    markets: {},
  },

  // FINALES NBA — G3 (8 juin, NYK home) — Terminée, SAS 115-111 (NYK 2-1)
  {
    id: 'b024', league: 'nba', round: 'Finales NBA – Terminée G3 (SAS 2-1)',
    date: '2026-06-09T00:30:00Z',
    venue: { name: 'Madison Square Garden', city: 'New York', capacity: 19812 },
    home: { ...team('New York Knicks',   'NYK', 'nyk', 3, 53, 29, 116.5, 112.6, 45.6, 27.4, 47.1, ['W','W','W','W','W']), score: 111 },
    away: { ...team('San Antonio Spurs', 'SAS', 'sas', 2, 62, 20, 119.8, 109.4, 47.0, 28.1, 47.8, ['W','W','L','W','W']), score: 115 },
    h2h: [
      { date: '2025-11-14', home: 'SAS', away: 'NYK', scoreHome: 121, scoreAway: 118 },
      { date: '2026-01-22', home: 'NYK', away: 'SAS', scoreHome: 112, scoreAway: 108 },
      { date: '2026-03-01', home: 'SAS', away: 'NYK', scoreHome: 119, scoreAway: 115 },
      { date: '2026-06-03', home: 'SAS', away: 'NYK', scoreHome:  95, scoreAway: 105 },
      { date: '2026-06-05', home: 'SAS', away: 'NYK', scoreHome: 104, scoreAway: 105 },
    ],
    markets: {},
  },

  // FINALES NBA — G4 (10 juin, NYK home) — Terminée, NYK 107-106 (NYK 3-1)
  {
    id: 'b025', league: 'nba', round: 'Finales NBA – Terminée G4 (NYK 3-1)',
    date: '2026-06-11T00:30:00Z',
    venue: { name: 'Madison Square Garden', city: 'New York', capacity: 19812 },
    home: { ...team('New York Knicks',   'NYK', 'nyk', 3, 53, 29, 116.5, 112.6, 45.6, 27.4, 47.1, ['W','W','W','W','W']), score: 107 },
    away: { ...team('San Antonio Spurs', 'SAS', 'sas', 2, 62, 20, 119.8, 109.4, 47.0, 28.1, 47.8, ['W','W','L','W','W']), score: 106 },
    h2h: [
      { date: '2025-11-14', home: 'SAS', away: 'NYK', scoreHome: 121, scoreAway: 118 },
      { date: '2026-01-22', home: 'NYK', away: 'SAS', scoreHome: 112, scoreAway: 108 },
      { date: '2026-03-01', home: 'SAS', away: 'NYK', scoreHome: 119, scoreAway: 115 },
      { date: '2026-06-03', home: 'SAS', away: 'NYK', scoreHome:  95, scoreAway: 105 },
      { date: '2026-06-05', home: 'SAS', away: 'NYK', scoreHome: 104, scoreAway: 105 },
      { date: '2026-06-08', home: 'NYK', away: 'SAS', scoreHome: 111, scoreAway: 115 },
    ],
    markets: {},
  },

  // FINALES NBA — G5 (13 juin, SAS home) — Terminée, NYK 94-90 — NYK CHAMPION 2026 (4-1)
  {
    id: 'b026', league: 'nba', round: 'Finales NBA – Terminée G5 (NYK Champion 4-1)',
    date: '2026-06-14T00:30:00Z',
    venue: { name: 'Frost Bank Center', city: 'San Antonio', capacity: 18418 },
    home: { ...team('San Antonio Spurs', 'SAS', 'sas', 2, 62, 20, 119.8, 109.4, 47.0, 28.1, 47.8, ['W','W','L','W','W']), score: 90 },
    away: { ...team('New York Knicks',   'NYK', 'nyk', 3, 53, 29, 116.5, 112.6, 45.6, 27.4, 47.1, ['W','W','W','W','W']), score: 94 },
    h2h: [
      { date: '2025-11-14', home: 'SAS', away: 'NYK', scoreHome: 121, scoreAway: 118 },
      { date: '2026-01-22', home: 'NYK', away: 'SAS', scoreHome: 112, scoreAway: 108 },
      { date: '2026-03-01', home: 'SAS', away: 'NYK', scoreHome: 119, scoreAway: 115 },
      { date: '2026-06-03', home: 'SAS', away: 'NYK', scoreHome:  95, scoreAway: 105 },
      { date: '2026-06-05', home: 'SAS', away: 'NYK', scoreHome: 104, scoreAway: 105 },
      { date: '2026-06-08', home: 'NYK', away: 'SAS', scoreHome: 111, scoreAway: 115 },
      { date: '2026-06-10', home: 'NYK', away: 'SAS', scoreHome: 107, scoreAway: 106 },
    ],
    markets: {},
  },

  // ── EUROLEAGUE FINAL FOUR 2026 (Athènes, TELEKOM CENTER ATHENS) ───────────
  // 4 finalistes : OLY, FEN (ULK), VBC (PAM), RMB (MAD)
  // b006/b007 supprimés — Panathinaikos éliminé en playoffs par Valencia (3-2)

  // DEMI-FINALE A (22 mai, 17h Paris) — OLY vs FEN (EL game 404) — Terminée OLY 79-61
  {
    id: 'b008', league: 'euroleague', round: 'Final Four – Terminée Demi-finale A (OLY 1-0)',
    elGameCode: 404,
    date: '2026-05-22T15:00:00Z',
    venue: { name: 'TELEKOM CENTER ATHENS', city: 'Athènes', capacity: 18500 },
    home: { ...team('Olympiacos BC',   'OLY', 'oly', 1, 20, 14, 82.1, 80.6, 31.8, 18.2, 47.6, ['W','W','W','W','W']), score: 79 },
    away: { ...team('Fenerbahce Beko', 'FEN', 'fen', 2, 24, 10, 85.6, 79.4, 32.2, 19.6, 48.8, ['W','W','L','W','W']), score: 61 },
    h2h: [
      { date: '2026-01-17', home: 'FEN', away: 'OLY', scoreHome: 81, scoreAway: 74 },
      { date: '2026-02-28', home: 'OLY', away: 'FEN', scoreHome: 76, scoreAway: 88 },
    ],
    markets: {},
  },

  // DEMI-FINALE B (22 mai, 20h Paris) — VBC vs RMB (EL game 405) — Terminée RMB 105-90
  {
    id: 'b009', league: 'euroleague', round: 'Final Four – Terminée Demi-finale B (RMB 1-0)',
    elGameCode: 405,
    date: '2026-05-22T18:00:00Z',
    venue: { name: 'TELEKOM CENTER ATHENS', city: 'Athènes', capacity: 18500 },
    home: { ...team('Valencia Basket', 'VBC', 'vbc', 3, 22, 12, 83.4, 79.8, 32.8, 19.2, 47.4, ['W','W','W','L','W']), score: 90 },
    away: { ...team('Real Madrid',     'RMB', 'rmb', 4, 26,  8, 88.4, 78.2, 33.6, 20.4, 50.8, ['W','W','L','W','W']), score: 105 },
    h2h: [
      { date: '2026-01-10', home: 'RMB', away: 'VBC', scoreHome: 84, scoreAway: 72 },
      { date: '2026-03-14', home: 'VBC', away: 'RMB', scoreHome: 79, scoreAway: 83 },
    ],
    markets: {},
  },

  // 3E PLACE (24 mai) — pas jouée (l'EuroLeague n'organise pas de match pour la 3e place)

  // FINALE (24 mai, 20h Paris) — OLY vs RMB (EL game 406) — Terminée OLY Champion 92-85
  {
    id: 'b017', league: 'euroleague', round: 'Final Four – Terminée Finale (OLY Champion)',
    elGameCode: 406,
    date: '2026-05-24T18:00:00Z',
    venue: { name: 'TELEKOM CENTER ATHENS', city: 'Athènes', capacity: 18500 },
    home: { ...team('Olympiacos BC', 'OLY', 'oly', 1, 20, 14, 82.1, 80.6, 31.8, 18.2, 47.6, ['W','W','W','W','W']), score: 92 },
    away: { ...team('Real Madrid',   'RMB', 'rmb', 4, 26,  8, 88.4, 78.2, 33.6, 20.4, 50.8, ['W','W','L','W','W']), score: 85 },
    h2h: [
      { date: '2026-01-24', home: 'OLY', away: 'RMB', scoreHome: 80, scoreAway: 76 },
      { date: '2026-03-21', home: 'RMB', away: 'OLY', scoreHome: 82, scoreAway: 79 },
    ],
    markets: {},
  },
];

export const getBballFixtureById     = id       => BBALL_FIXTURES.find(f => f.id === id) || null;
export const getBballFixturesByLeague = leagueId => BBALL_FIXTURES.filter(f => f.league === leagueId);
export const getBballLeagueById      = id       => BBALL_LEAGUES.find(l => l.id === id) || null;
