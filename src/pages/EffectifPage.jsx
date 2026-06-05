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
      { name: 'Lorient',             espnId: 3800 },
      { name: 'Toulouse',            espnId: 179  },
      { name: 'Paris FC',            espnId: null },
      { name: 'Brest',               espnId: 6997 },
      { name: 'Angers',              espnId: 7868 },
      { name: 'Le Havre',            espnId: 3236 },
      { name: 'Auxerre',             espnId: 172  },
      { name: 'Nice',                espnId: 2502 },
      { name: 'Nantes',              espnId: 165  },
      { name: 'Metz',                espnId: null },
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
      { name: 'Sunderland',        espnId: 375  },
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
      { name: 'West Ham United',   espnId: 371  },
      { name: 'Burnley',           espnId: 338  },
      { name: 'Wolverhampton',     espnId: 380  },
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
      { name: 'Elche',              espnId: 92   },
      { name: 'Deportivo Alavés',   espnId: 96   },
      { name: 'Sevilla',            espnId: 243  },
      { name: 'Osasuna',            espnId: 97   },
      { name: 'Mallorca',           espnId: 84   },
      { name: 'Levante UD',         espnId: 98   },
      { name: 'Girona',             espnId: 9812 },
      { name: 'Real Oviedo',        espnId: null },
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
      { name: 'Hamburger SV',             espnId: 273   },
      { name: '1. FC Köln',               espnId: 127   },
      { name: 'SV Werder Bremen',         espnId: 137   },
      { name: 'VfL Wolfsburg',            espnId: 138   },
      { name: '1. FC Heidenheim',         espnId: 6418  },
      { name: 'FC St. Pauli',             espnId: 270   },
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
      { name: 'Sassuolo',      espnId: null },
      { name: 'Parma',         espnId: 115  },
      { name: 'Torino',        espnId: 239  },
      { name: 'Cagliari',      espnId: 2925 },
      { name: 'Fiorentina',    espnId: 109  },
      { name: 'Genoa',         espnId: 3263 },
      { name: 'Lecce',         espnId: 113  },
      { name: 'Cremonese',     espnId: null },
      { name: 'Hellas Verona', espnId: 119  },
      { name: 'Pisa',          espnId: null },
    ],
  },
  {
    id: 'nba', flag: '🇺🇸', name: 'NBA', country: 'États-Unis',
    teams: NBA_TEAMS,
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

const SPORT_LABELS = {
  ligue1: 'Football', pl: 'Football', laliga: 'Football', bundes: 'Football', seriea: 'Football',
  nba: 'Basket', euroleague: 'Basket',
};


function RosterPanel({ team, onClose }) {
  const [players, setPlayers] = useState(rosterCache[team.bdlId] ?? null);
  const [loading, setLoading] = useState(!rosterCache[team.bdlId]);
  const [error, setError]     = useState(null);

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

      {loading && <div className="ef-roster-state">Chargement…</div>}
      {error   && <div className="ef-roster-state ef-roster-error">Erreur : {error}</div>}

      {players && (() => {
        const sorted = [...players].sort((a, b) => (b.stats?.pts ?? -1) - (a.stats?.pts ?? -1));
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

const POS_ORDER = { G: 0, D: 1, M: 2, F: 3 };
const POS_LABEL = { G: 'Gardiens', D: 'Défenseurs', M: 'Milieux', F: 'Attaquants' };

function FootballRosterPanel({ teamName, espnId, espnLeague, onClose }) {
  const cacheKey = `${espnLeague}:${espnId}`;
  const [data, setData]       = useState(sofascoreCache[cacheKey] ?? null);
  const [loading, setLoading] = useState(!sofascoreCache[cacheKey]);
  const [error, setError]     = useState(null);

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

  const grouped = data ? Object.entries(
    data.players.reduce((acc, p) => {
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

      {!espnId  && <div className="ef-roster-state ef-roster-error">Effectif non disponible</div>}
      {loading  && <div className="ef-roster-state">Chargement…</div>}
      {error    && <div className="ef-roster-state ef-roster-error">Erreur : {error}</div>}

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

export default function EffectifPage() {
  const football = LEAGUES.filter(l => SPORT_LABELS[l.id] === 'Football');
  const basket   = LEAGUES.filter(l => SPORT_LABELS[l.id] === 'Basket');

  return (
    <div className="page">
      <section className="ef-section">
        <h2 className="ef-section-title">Football</h2>
        <div className="ef-list">
          {football.map(l => <LeagueItem key={l.id} league={l} />)}
        </div>
      </section>

      <section className="ef-section">
        <h2 className="ef-section-title">Basket</h2>
        <div className="ef-list">
          {basket.map(l =>
            l.id === 'nba'
              ? <NBALeagueItem key={l.id} league={l} />
              : <LeagueItem    key={l.id} league={l} />
          )}
        </div>
      </section>
    </div>
  );
}
