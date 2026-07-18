import { useState, useEffect } from 'react';

const rosterCache    = {};
const sofascoreCache = {};

// IDs ESPN + abréviations pour logos
const NBA_TEAMS = [
  { name: 'Atlanta Hawks',           bdlId: 1,  abbr: 'atl'  },
  { name: 'Boston Celtics',          bdlId: 2,  abbr: 'bos'  },
  { name: 'Brooklyn Nets',           bdlId: 17, abbr: 'bkn'  },
  { name: 'Charlotte Hornets',       bdlId: 30, abbr: 'cha'  },
  { name: 'Chicago Bulls',           bdlId: 4,  abbr: 'chi'  },
  { name: 'Cleveland Cavaliers',     bdlId: 5,  abbr: 'cle'  },
  { name: 'Dallas Mavericks',        bdlId: 6,  abbr: 'dal'  },
  { name: 'Denver Nuggets',          bdlId: 7,  abbr: 'den'  },
  { name: 'Detroit Pistons',         bdlId: 8,  abbr: 'det'  },
  { name: 'Golden State Warriors',   bdlId: 9,  abbr: 'gs'   },
  { name: 'Houston Rockets',         bdlId: 10, abbr: 'hou'  },
  { name: 'Indiana Pacers',          bdlId: 11, abbr: 'ind'  },
  { name: 'LA Clippers',             bdlId: 12, abbr: 'lac'  },
  { name: 'Los Angeles Lakers',      bdlId: 13, abbr: 'lal'  },
  { name: 'Memphis Grizzlies',       bdlId: 29, abbr: 'mem'  },
  { name: 'Miami Heat',              bdlId: 14, abbr: 'mia'  },
  { name: 'Milwaukee Bucks',         bdlId: 15, abbr: 'mil'  },
  { name: 'Minnesota Timberwolves',  bdlId: 16, abbr: 'min'  },
  { name: 'New Orleans Pelicans',    bdlId: 3,  abbr: 'no'   },
  { name: 'New York Knicks',         bdlId: 18, abbr: 'ny'   },
  { name: 'Oklahoma City Thunder',   bdlId: 25, abbr: 'okc'  },
  { name: 'Orlando Magic',           bdlId: 19, abbr: 'orl'  },
  { name: 'Philadelphia 76ers',      bdlId: 20, abbr: 'phi'  },
  { name: 'Phoenix Suns',            bdlId: 21, abbr: 'phx'  },
  { name: 'Portland Trail Blazers',  bdlId: 22, abbr: 'por'  },
  { name: 'Sacramento Kings',        bdlId: 23, abbr: 'sac'  },
  { name: 'San Antonio Spurs',       bdlId: 24, abbr: 'sa'   },
  { name: 'Toronto Raptors',         bdlId: 28, abbr: 'tor'  },
  { name: 'Utah Jazz',               bdlId: 26, abbr: 'utah' },
  { name: 'Washington Wizards',      bdlId: 27, abbr: 'wsh'  },
];

const LEAGUES = [
  {
    id: 'ligue1', flag: '🇫🇷', name: 'Ligue 1', country: 'France', espnLeague: 'fra.1',
    teams: [
      { name: 'Paris Saint-Germain', espnId: 160  },
      { name: 'RC Lens',             espnId: 175  },
      { name: 'Lille',               espnId: 166  },
      { name: 'Lyon',                espnId: 167  },
      { name: 'Marseille',           espnId: 176  },
      { name: 'Rennes',              espnId: 169  },
      { name: 'Monaco',              espnId: 174  },
      { name: 'Strasbourg',          espnId: 180  },
      { name: 'Lorient',             espnId: 273  },
      { name: 'Toulouse',            espnId: 179  },
      { name: 'Paris FC',            espnId: 6851 },
      { name: 'Brest',               espnId: 6997 },
      { name: 'Angers',              espnId: 7868 },
      { name: 'Le Havre',            espnId: 3236 },
      { name: 'Auxerre',             espnId: 172  },
      { name: 'Nice',                espnId: 2502 },
      { name: 'Troyes',              espnId: 170  },
      { name: 'Le Mans',             espnId: 2697 },
    ],
  },
  {
    id: 'pl', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', name: 'Premier League', country: 'Angleterre', espnLeague: 'eng.1',
    teams: [
      { name: 'Arsenal',           espnId: 359  },
      { name: 'Manchester City',   espnId: 382  },
      { name: 'Manchester United', espnId: 360  },
      { name: 'Aston Villa',       espnId: 362  },
      { name: 'Liverpool',         espnId: 364  },
      { name: 'Bournemouth',       espnId: 349  },
      { name: 'Sunderland',        espnId: 366  },
      { name: 'Brighton',          espnId: 331  },
      { name: 'Brentford',         espnId: 337  },
      { name: 'Chelsea',           espnId: 363  },
      { name: 'Fulham',            espnId: 370  },
      { name: 'Newcastle United',  espnId: 361  },
      { name: 'Everton',           espnId: 368  },
      { name: 'Leeds United',      espnId: 357  },
      { name: 'Crystal Palace',    espnId: 384  },
      { name: 'Nottingham Forest', espnId: 393  },
      { name: 'Tottenham Hotspur', espnId: 367  },
      { name: 'Hull City',         espnId: 306  },
      { name: 'Ipswich Town',      espnId: 373  },
      { name: 'Coventry City',     espnId: 388  },
    ],
  },
  {
    id: 'laliga', flag: '🇪🇸', name: 'La Liga', country: 'Espagne', espnLeague: 'esp.1',
    teams: [
      { name: 'FC Barcelona',       espnId: 83   },
      { name: 'Real Madrid',        espnId: 86   },
      { name: 'Villarreal',         espnId: 102  },
      { name: 'Atlético de Madrid', espnId: 1068 },
      { name: 'Real Betis',         espnId: 244  },
      { name: 'Celta Vigo',         espnId: 85   },
      { name: 'Getafe',             espnId: 2922 },
      { name: 'Rayo Vallecano',     espnId: 101  },
      { name: 'Valencia',           espnId: 94   },
      { name: 'Real Sociedad',      espnId: 89   },
      { name: 'Espanyol',           espnId: 88   },
      { name: 'Athletic Club',      espnId: 93   },
      { name: 'Elche',              espnId: 3751 },
      { name: 'Deportivo Alavés',   espnId: 96   },
      { name: 'Sevilla',            espnId: 243  },
      { name: 'Osasuna',            espnId: 97   },
      { name: 'Levante UD',         espnId: 1538 },
      { name: 'Málaga',             espnId: 99   },
      { name: 'Deportivo La Coruña',espnId: 90   },
      { name: 'Racing Santander',   espnId: 87   },
    ],
  },
  {
    id: 'bundes', flag: '🇩🇪', name: 'Bundesliga', country: 'Allemagne', espnLeague: 'ger.1',
    teams: [
      { name: 'FC Bayern München',        espnId: 132   },
      { name: 'Borussia Dortmund',        espnId: 124   },
      { name: 'RB Leipzig',               espnId: 11420 },
      { name: 'VfB Stuttgart',            espnId: 134   },
      { name: 'TSG Hoffenheim',           espnId: 7911  },
      { name: 'Bayer 04 Leverkusen',      espnId: 131   },
      { name: 'SC Freiburg',              espnId: 126   },
      { name: 'Eintracht Frankfurt',      espnId: 125   },
      { name: 'FC Augsburg',              espnId: 3841  },
      { name: '1. FSV Mainz 05',          espnId: 2950  },
      { name: '1. FC Union Berlin',       espnId: 598   },
      { name: 'Borussia Mönchengladbach', espnId: 268   },
      { name: 'Hamburger SV',             espnId: 127   },
      { name: '1. FC Köln',               espnId: 122   },
      { name: 'SV Werder Bremen',         espnId: 137   },
      { name: 'Schalke 04',               espnId: 133   },
      { name: 'SC Paderborn 07',          espnId: 3307  },
      { name: 'SV Elversberg',            espnId: 10388 },
    ],
  },
  {
    id: 'seriea', flag: '🇮🇹', name: 'Serie A', country: 'Italie', espnLeague: 'ita.1',
    teams: [
      { name: 'Inter Milan',   espnId: 110  },
      { name: 'SSC Napoli',    espnId: 114  },
      { name: 'AS Roma',       espnId: 104  },
      { name: 'Como',          espnId: 2572 },
      { name: 'AC Milan',      espnId: 103  },
      { name: 'Juventus',      espnId: 111  },
      { name: 'Atalanta',      espnId: 105  },
      { name: 'Bologna',       espnId: 107  },
      { name: 'Lazio',         espnId: 112  },
      { name: 'Udinese',       espnId: 118  },
      { name: 'Sassuolo',      espnId: 3997 },
      { name: 'Parma',         espnId: 115  },
      { name: 'Torino',        espnId: 239  },
      { name: 'Cagliari',      espnId: 2925 },
      { name: 'Fiorentina',    espnId: 109  },
      { name: 'Genoa',         espnId: 3263 },
      { name: 'Lecce',         espnId: 113  },
      { name: 'Venezia',       espnId: 17530 },
      { name: 'Frosinone',     espnId: 4057 },
      { name: 'Monza',         espnId: 4007 },
    ],
  },
  {
    id: 'bresil', flag: '🇧🇷', name: 'Brasileirão', country: 'Brésil', espnLeague: 'bra.1',
    teams: [
      { name: 'Athletico-PR',        espnId: 3458 },
      { name: 'Atlético-MG',         espnId: 7632 },
      { name: 'Bahia',               espnId: 9967 },
      { name: 'Botafogo',            espnId: 6086 },
      { name: 'Chapecoense',         espnId: 9318 },
      { name: 'Corinthians',         espnId: 874  },
      { name: 'Coritiba',            espnId: 3456 },
      { name: 'Cruzeiro',            espnId: 2022 },
      { name: 'Flamengo',            espnId: 819  },
      { name: 'Fluminense',          espnId: 3445 },
      { name: 'Grêmio',              espnId: 6273 },
      { name: 'Internacional',       espnId: 1936 },
      { name: 'Mirassol',            espnId: 9169 },
      { name: 'Palmeiras',           espnId: 2029 },
      { name: 'Red Bull Bragantino', espnId: 6079 },
      { name: 'Remo',                espnId: 4936 },
      { name: 'Santos',              espnId: 2674 },
      { name: 'São Paulo',           espnId: 2026 },
      { name: 'Vasco da Gama',       espnId: 3454 },
      { name: 'Vitória',             espnId: 3457 },
    ],
  },
  {
    id: 'nba', flag: '🇺🇸', name: 'NBA', country: 'États-Unis',
    teams: NBA_TEAMS,
  },
  {
    id: 'wnba', flag: '🇺🇸', name: 'WNBA', country: 'États-Unis',
    teams: [
      { name: 'Atlanta Dream',          wnbaId: 20,     abbr: 'atl'  },
      { name: 'Chicago Sky',            wnbaId: 19,     abbr: 'chi'  },
      { name: 'Connecticut Sun',        wnbaId: 18,     abbr: 'conn' },
      { name: 'Dallas Wings',           wnbaId: 3,      abbr: 'dal'  },
      { name: 'Golden State Valkyries', wnbaId: 129689, abbr: 'gs'   },
      { name: 'Indiana Fever',          wnbaId: 5,      abbr: 'ind'  },
      { name: 'Las Vegas Aces',         wnbaId: 17,     abbr: 'lv'   },
      { name: 'Los Angeles Sparks',     wnbaId: 6,      abbr: 'la'   },
      { name: 'Minnesota Lynx',         wnbaId: 8,      abbr: 'min'  },
      { name: 'New York Liberty',       wnbaId: 9,      abbr: 'ny'   },
      { name: 'Phoenix Mercury',        wnbaId: 11,     abbr: 'phx'  },
      { name: 'Portland Fire',          wnbaId: 132052, abbr: 'por'  },
      { name: 'Seattle Storm',          wnbaId: 14,     abbr: 'sea'  },
      { name: 'Toronto Tempo',          wnbaId: 131935, abbr: 'tor'  },
      { name: 'Washington Mystics',     wnbaId: 16,     abbr: 'wsh'  },
    ],
  },
  {
    id: 'acb', flag: '🇪🇸', name: 'ACB', country: 'Espagne',
    teams: [
      { name: 'Barcelona' },
      { name: 'Basket Zaragoza' },
      { name: 'Baskonia' },
      { name: 'Basquet Girona' },
      { name: 'Bilbao' },
      { name: 'Breogan' },
      { name: 'Forca Lleida' },
      { name: 'Gran Canaria' },
      { name: 'Joventut Badalona' },
      { name: 'Manresa' },
      { name: 'MoraBanc Andorra' },
      { name: 'Murcia' },
      { name: 'Real Madrid' },
      { name: 'San Pablo Burgos' },
      { name: 'Tenerife' },
      { name: 'Unicaja' },
      { name: 'Valencia' },
    ],
  },
  {
    id: 'euroleague', flag: '🇪🇺', name: 'EuroLeague', country: 'Europe',
    teams: [
      'Real Madrid', 'FC Barcelona', 'Fenerbahçe', 'Panathinaikos',
      'Olympiacos', 'Maccabi Tel Aviv', 'Baskonia', 'Bayern München',
      'AS Monaco', 'ASVEL', 'Anadolu Efes', 'Žalgiris Kaunas',
      'Partizan', 'Crvena zvezda', 'Alba Berlin', 'Virtus Bologna',
      'Paris Basketball',
    ],
  },
];



function RosterPanel({ team, onClose }) {
  const [players, setPlayers] = useState(rosterCache[team.bdlId] ?? null);
  const [loading, setLoading] = useState(!rosterCache[team.bdlId]);
  const [error, setError]     = useState(null);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    if (rosterCache[team.bdlId]) {
      setPlayers(rosterCache[team.bdlId]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setPlayers(null);
    setError(null);
    fetch(`/api/nba/players/${team.bdlId}`)
      .then(r => r.json())
      .then(d => {
        rosterCache[team.bdlId] = d.players;
        setPlayers(d.players);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [team.bdlId]);

  return (
    <div className="ef-roster-panel">
      <div className="ef-roster-header">
        <span className="ef-roster-title">{team.name}</span>
        <button className="ef-roster-close" onClick={onClose}>✕</button>
      </div>

      {players && <RosterSearchBar value={search} onChange={setSearch} />}

      {loading && <div className="ef-roster-state">Chargement…</div>}
      {error   && <div className="ef-roster-state ef-roster-error">Erreur : {error}</div>}

      {players && (() => {
        const searchNorm = normPlayerName(search.trim());
        const filtered = searchNorm ? players.filter(p => normPlayerName(p.name).includes(searchNorm)) : players;
        const sorted = [...filtered].sort((a, b) => (b.stats?.pts ?? -1) - (a.stats?.pts ?? -1));
        return (
          <div className="ef-roster-table">
            <div className="ef-roster-row ef-roster-head">
              <span>#</span><span>Joueur</span><span>Pos</span><span>PPG</span><span>REB</span><span>AST</span><span>3PM</span>
            </div>
            {sorted.map((p, i) => (
              <div key={p.id} className={`ef-roster-row${i < 5 ? ' ef-roster-starter' : ''}`}>
                <span className="ef-roster-jersey">{p.jersey}</span>
                <span className="ef-roster-name-wrap">
                  <span className="ef-roster-name">{p.name}</span>
                  {i < 5 && p.lastGame && p.lastGame.gameDate &&
                    Date.now() - new Date(p.lastGame.gameDate).getTime() < 48 * 3600 * 1000 && (
                    <span className="ef-roster-lastgame">
                      ({p.lastGame.pts}/{p.lastGame.reb}/{p.lastGame.ast} {p.lastGame.atVs} {p.lastGame.opponent})
                    </span>
                  )}
                </span>
                <span className="ef-roster-pos">{p.position}</span>
                <span className="ef-roster-stat">{p.stats?.pts != null ? p.stats.pts.toFixed(1) : '—'}</span>
                <span className="ef-roster-stat">{p.stats?.reb != null ? p.stats.reb.toFixed(1) : '—'}</span>
                <span className="ef-roster-stat">{p.stats?.ast != null ? p.stats.ast.toFixed(1) : '—'}</span>
                <span className="ef-roster-stat">{p.stats?.tpm != null ? p.stats.tpm.toFixed(1) : '—'}</span>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

function NBALeagueItem({ league }) {
  const [open, setOpen]             = useState(false);
  const [selectedTeam, setSelected] = useState(null);

  return (
    <div className="ef-league-item">
      <button className="ef-card-btn" onClick={() => { setOpen(o => !o); setSelected(null); }}>
        <div className="ef-card">
          <span className="ef-card-flag">{league.flag}</span>
          <div className="ef-card-info">
            <span className="ef-card-name">{league.name}</span>
            <span className="ef-card-meta">{league.country} · {league.teams.length} clubs</span>
          </div>
          <svg className={`ef-card-chevron ${open ? 'open' : ''}`} width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      <div className={`ef-teams-wrap ${open ? 'open' : ''}`}>
        <div className="ef-teams-grid">
          {league.teams.map(team => (
            <button
              key={team.bdlId}
              className={`ef-team-chip ef-team-chip--clickable ${selectedTeam?.bdlId === team.bdlId ? 'active' : ''}`}
              onClick={() => setSelected(s => s?.bdlId === team.bdlId ? null : team)}
            >
              {team.name}
              {team.abbr && (
                <img
                  src={`https://a.espncdn.com/i/teamlogos/nba/500/${team.abbr}.png`}
                  alt=""
                  className="ef-chip-logo"
                />
              )}
            </button>
          ))}
        </div>

        {selectedTeam && (
          <RosterPanel key={selectedTeam.bdlId} team={selectedTeam} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}

const wnbaRosterCache = {};

function WNBARosterPanel({ team, onClose }) {
  const [players, setPlayers] = useState(wnbaRosterCache[team.wnbaId] ?? null);
  const [loading, setLoading] = useState(!wnbaRosterCache[team.wnbaId]);
  const [error, setError]     = useState(null);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    if (wnbaRosterCache[team.wnbaId]) { setPlayers(wnbaRosterCache[team.wnbaId]); setLoading(false); return; }
    setLoading(true); setPlayers(null); setError(null);
    fetch(`/api/wnba/players/${team.wnbaId}`)
      .then(r => r.json())
      .then(d => { wnbaRosterCache[team.wnbaId] = d.players; setPlayers(d.players); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [team.wnbaId]);

  return (
    <div className="ef-roster-panel">
      <div className="ef-roster-header">
        <span className="ef-roster-title">{team.name}</span>
        <button className="ef-roster-close" onClick={onClose}>✕</button>
      </div>
      {players && <RosterSearchBar value={search} onChange={setSearch} placeholder="Rechercher une joueuse…" />}
      {loading && <div className="ef-roster-state">Chargement…</div>}
      {error   && <div className="ef-roster-state ef-roster-error">Erreur : {error}</div>}
      {players && (() => {
        const searchNorm = normPlayerName(search.trim());
        const filtered = searchNorm ? players.filter(p => normPlayerName(p.name).includes(searchNorm)) : players;
        const sorted = [...filtered].sort((a, b) => (b.stats?.pts ?? -1) - (a.stats?.pts ?? -1));
        return (
          <div className="ef-roster-table">
            <div className="ef-roster-row ef-roster-head">
              <span>#</span><span>Joueuse</span><span>Pos</span><span>PPG</span><span>REB</span><span>AST</span><span>MIN</span>
            </div>
            {sorted.map((p, i) => (
              <div key={p.id} className={`ef-roster-row${i < 5 ? ' ef-roster-starter' : ''}`}>
                <span className="ef-roster-jersey">{p.jersey}</span>
                <span className="ef-roster-name-wrap"><span className="ef-roster-name">{p.name}</span></span>
                <span className="ef-roster-pos">{p.position}</span>
                <span className="ef-roster-stat">{p.stats?.pts != null ? p.stats.pts.toFixed(1) : '—'}</span>
                <span className="ef-roster-stat">{p.stats?.reb != null ? p.stats.reb.toFixed(1) : '—'}</span>
                <span className="ef-roster-stat">{p.stats?.ast != null ? p.stats.ast.toFixed(1) : '—'}</span>
                <span className="ef-roster-stat">{p.stats?.min != null ? p.stats.min.toFixed(1) : '—'}</span>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

function WNBALeagueItem({ league }) {
  const [open, setOpen]             = useState(false);
  const [selectedTeam, setSelected] = useState(null);

  return (
    <div className="ef-league-item">
      <button className="ef-card-btn" onClick={() => { setOpen(o => !o); setSelected(null); }}>
        <div className="ef-card">
          <span className="ef-card-flag">{league.flag}</span>
          <div className="ef-card-info">
            <span className="ef-card-name">{league.name}</span>
            <span className="ef-card-meta">{league.country} · {league.teams.length} clubs</span>
          </div>
          <svg className={`ef-card-chevron ${open ? 'open' : ''}`} width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>
      <div className={`ef-teams-wrap ${open ? 'open' : ''}`}>
        <div className="ef-teams-grid">
          {league.teams.map(team => (
            <button
              key={team.wnbaId}
              className={`ef-team-chip ef-team-chip--clickable ${selectedTeam?.wnbaId === team.wnbaId ? 'active' : ''}`}
              onClick={() => setSelected(s => s?.wnbaId === team.wnbaId ? null : team)}
            >
              {team.name}
              {team.abbr && (
                <img
                  src={`https://a.espncdn.com/i/teamlogos/wnba/500/${team.abbr}.png`}
                  alt=""
                  className="ef-chip-logo"
                />
              )}
            </button>
          ))}
        </div>
        {selectedTeam && (
          <WNBARosterPanel key={selectedTeam.wnbaId} team={selectedTeam} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}

const euRosterCache = {};

function EURosterPanel({ team, league, onClose }) {
  const ck = `${league}_${team.name}`;
  const [players, setPlayers] = useState(euRosterCache[ck] ?? null);
  const [loading, setLoading] = useState(!euRosterCache[ck]);
  const [error, setError]     = useState(null);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    if (euRosterCache[ck]) { setPlayers(euRosterCache[ck]); setLoading(false); return; }
    setLoading(true); setPlayers(null); setError(null);
    fetch(`/api/euro/${league}/roster/byname/${encodeURIComponent(team.name)}`)
      .then(r => r.json())
      .then(d => { euRosterCache[ck] = d.players; setPlayers(d.players); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [ck]);

  return (
    <div className="ef-roster-panel">
      <div className="ef-roster-header">
        <span className="ef-roster-title">{team.name}</span>
        <button className="ef-roster-close" onClick={onClose}>✕</button>
      </div>
      {players && <RosterSearchBar value={search} onChange={setSearch} />}
      {loading && <div className="ef-roster-state">Chargement…</div>}
      {error   && <div className="ef-roster-state ef-roster-error">Erreur : {error}</div>}
      {players && (() => {
        const searchNorm = normPlayerName(search.trim());
        const filtered = searchNorm ? players.filter(p => normPlayerName(p.name).includes(searchNorm)) : players;
        const sorted = [...filtered].sort((a, b) => (b.stats?.pts ?? -1) - (a.stats?.pts ?? -1));
        return (
          <div className="ef-roster-table">
            <div className="ef-roster-row ef-roster-head">
              <span>#</span><span>Joueur</span><span>Pos</span><span>PPG</span><span>REB</span><span>AST</span><span>MIN</span>
            </div>
            {sorted.map((p, i) => (
              <div key={p.id} className={`ef-roster-row${p.starterFrac >= 0.6 ? ' ef-roster-starter' : ''}`}>
                <span className="ef-roster-jersey">{p.jersey}</span>
                <span className="ef-roster-name-wrap"><span className="ef-roster-name">{p.name}</span></span>
                <span className="ef-roster-pos">{p.position}</span>
                <span className="ef-roster-stat">{p.stats?.pts != null ? p.stats.pts.toFixed(1) : '—'}</span>
                <span className="ef-roster-stat">{p.stats?.reb != null ? p.stats.reb.toFixed(1) : '—'}</span>
                <span className="ef-roster-stat">{p.stats?.ast != null ? p.stats.ast.toFixed(1) : '—'}</span>
                <span className="ef-roster-stat">{p.stats?.min != null ? p.stats.min.toFixed(1) : '—'}</span>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

function EULeagueItem({ league }) {
  const [open, setOpen]             = useState(false);
  const [selectedTeam, setSelected] = useState(null);

  return (
    <div className="ef-league-item">
      <button className="ef-card-btn" onClick={() => { setOpen(o => !o); setSelected(null); }}>
        <div className="ef-card">
          <span className="ef-card-flag">{league.flag}</span>
          <div className="ef-card-info">
            <span className="ef-card-name">{league.name}</span>
            <span className="ef-card-meta">{league.country} · {league.teams.length} clubs</span>
          </div>
          <svg className={`ef-card-chevron ${open ? 'open' : ''}`} width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>
      <div className={`ef-teams-wrap ${open ? 'open' : ''}`}>
        <div className="ef-teams-grid">
          {league.teams.map(team => (
            <button
              key={team.name}
              className={`ef-team-chip ef-team-chip--clickable ${selectedTeam?.name === team.name ? 'active' : ''}`}
              onClick={() => setSelected(s => s?.name === team.name ? null : team)}
            >
              {team.name}
            </button>
          ))}
        </div>
        {selectedTeam && (
          <EURosterPanel key={selectedTeam.name} team={selectedTeam} league={league.id} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}

const POS_ORDER = { G: 0, D: 1, M: 2, F: 3 };
const POS_LABEL = { G: 'Gardiens', D: 'Défenseurs', M: 'Milieux', F: 'Attaquants' };

const normPlayerName = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Barre de recherche partagée par les 4 panneaux d'effectif (NBA/WNBA/EU basket/foot) — 18 juillet 2026.
function RosterSearchBar({ value, onChange, placeholder = 'Rechercher un joueur…' }) {
  return (
    <div className="ef-roster-search-wrap">
      <svg className="ef-roster-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
        <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <input
        type="text"
        className="ef-roster-search"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

function FootballRosterPanel({ teamName, espnId, espnLeague, onClose }) {
  const cacheKey = `${espnLeague}:${espnId}`;
  const [data, setData]       = useState(sofascoreCache[cacheKey] ?? null);
  const [loading, setLoading] = useState(!sofascoreCache[cacheKey]);
  const [error, setError]     = useState(null);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    if (!espnId) { setLoading(false); return; }
    if (sofascoreCache[cacheKey]) { setData(sofascoreCache[cacheKey]); setLoading(false); return; }
    setLoading(true);
    fetch(`/api/football/squad/${espnLeague}/${espnId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        sofascoreCache[cacheKey] = d;
        setData(d);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [espnId, espnLeague]);

  const searchNorm = normPlayerName(search.trim());
  const filteredPlayers = data
    ? (searchNorm ? data.players.filter(p => normPlayerName(p.shortName ?? p.name).includes(searchNorm)) : data.players)
    : [];
  const grouped = data ? Object.entries(
    filteredPlayers.reduce((acc, p) => {
      const pos = p.position || 'M';
      if (!acc[pos]) acc[pos] = [];
      acc[pos].push(p);
      return acc;
    }, {})
  ).sort(([a], [b]) => (POS_ORDER[a] ?? 9) - (POS_ORDER[b] ?? 9)) : [];

  return (
    <div className="ef-roster-panel">
      <div className="ef-roster-header">
        <span className="ef-roster-title">{teamName}</span>
        <button className="ef-roster-close" onClick={onClose}>✕</button>
      </div>

      {data && <RosterSearchBar value={search} onChange={setSearch} />}

      {!espnId  && <div className="ef-roster-state ef-roster-error">Effectif non disponible</div>}
      {loading  && <div className="ef-roster-state">Chargement…</div>}
      {error    && <div className="ef-roster-state ef-roster-error">Erreur : {error}</div>}

      {data && grouped.length === 0 && (
        <div className="ef-roster-state">Aucun joueur trouvé</div>
      )}

      {data && (
        <div className="ef-fb-roster">
          {grouped.map(([pos, players]) => (
            <div key={pos} className="ef-fb-pos-group">
              <div className="ef-fb-pos-label">{POS_LABEL[pos] ?? pos}</div>
              {players
                .sort((a, b) => (a.jerseyNumber ?? 99) - (b.jerseyNumber ?? 99))
                .map(p => (
                  <div key={p.id} className={`ef-fb-player${p.injury ? ' ef-fb-player--injured' : ''}`}>
                    <span className="ef-fb-jersey">{p.jerseyNumber ?? '—'}</span>
                    <span className="ef-fb-name">{p.shortName ?? p.name}</span>
                    <span className="ef-fb-country">{p.country}</span>
                    <span className="ef-fb-age">{p.age ? `${p.age} ans` : ''}</span>
                    {p.injury && (
                      <span className="ef-fb-injury" title={p.injury}>🔴</span>
                    )}
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeagueItem({ league }) {
  const [open, setOpen]         = useState(false);
  const [selected, setSelected] = useState(null);
  const teams = league.teams;

  return (
    <div className="ef-league-item">
      <button className="ef-card-btn" onClick={() => { setOpen(o => !o); setSelected(null); }}>
        <div className="ef-card">
          <span className="ef-card-flag">{league.flag}</span>
          <div className="ef-card-info">
            <span className="ef-card-name">{league.name}</span>
            <span className="ef-card-meta">{league.country} · {teams.length} clubs</span>
          </div>
          <svg className={`ef-card-chevron ${open ? 'open' : ''}`} width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>
      <div className={`ef-teams-wrap ${open ? 'open' : ''}`}>
        <div className="ef-teams-grid">
          {teams.map(team => (
            <button
              key={team.name}
              className={`ef-team-chip ef-team-chip--clickable ${selected?.name === team.name ? 'active' : ''}`}
              onClick={() => setSelected(s => s?.name === team.name ? null : team)}
            >
              {team.name}
              {team.espnId && (
                <img
                  src={`https://a.espncdn.com/i/teamlogos/soccer/500/${team.espnId}.png`}
                  alt=""
                  className="ef-chip-logo"
                />
              )}
            </button>
          ))}
        </div>
        {selected && (
          <FootballRosterPanel
            key={selected.name}
            teamName={selected.name}
            espnId={selected.espnId}
            espnLeague={league.espnLeague}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}

const EU_BASKET_LEAGUE_IDS = new Set(['acb', 'lnb', 'bbl', 'legaa']);

// Dispatch par type de ligue (NBA/WNBA/EU basket/football) — réutilisé tel quel par la Carte
// championnats (DatabaseMapPage.jsx) pour afficher les équipes d'un pays cliqué. EULeagueItem est
// générique (roster via /api/euro/:league/roster/byname/:nom) : marche pour acb/lnb/bbl/legaa.
export function renderLeagueItem(l) {
  return l.id === 'nba'  ? <NBALeagueItem  key={l.id} league={l} /> :
         l.id === 'wnba' ? <WNBALeagueItem key={l.id} league={l} /> :
         EU_BASKET_LEAGUE_IDS.has(l.id) ? <EULeagueItem key={l.id} league={l} /> :
                           <LeagueItem     key={l.id} league={l} />;
}

export { LEAGUES };
