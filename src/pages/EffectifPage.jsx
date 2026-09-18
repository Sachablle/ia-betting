import { useState, useEffect } from 'react';

const rosterCache    = {};
const sofascoreCache = {};
// Séparé de rosterCache (clé numérique NBA/balldontlie) — un id api-football pourrait numériquement
// coïncider avec un bdlId, deux espaces de clés différents dans le même objet aurait risqué une
// collision silencieuse.
const footballTeamsCache = {};

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

// Championnats foot — effectifs via api-football (8 septembre 2026, remplace ESPN). Plus aucun id
// par club à chercher à la main : `teams` est chargé dynamiquement à l'ouverture du championnat
// (voir LeagueItem plus bas, GET /api/football/teams-full/:league) — un nouveau championnat foot
// n'a besoin que d'une entrée ici (id doit matcher FOOTBALL_API_LEAGUE_IDS côté backend) au lieu
// d'une recherche manuelle de ~18-20 ids ESPN. `apiFootball: true` distingue ces entrées des ligues
// encore sur données statiques (NBA/WNBA ci-dessous, gérées différemment).
const LEAGUES = [
  { id: 'ligue1', flag: '🇫🇷', logo: 'https://media.api-sports.io/football/leagues/61.png', name: 'Ligue 1', country: 'France', apiFootball: true, teams: [] },
  { id: 'pl',     flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', logo: 'https://media.api-sports.io/football/leagues/39.png', name: 'Premier League', country: 'Angleterre', apiFootball: true, teams: [] },
  { id: 'laliga', flag: '🇪🇸', logo: 'https://media.api-sports.io/football/leagues/140.png', name: 'La Liga', country: 'Espagne', apiFootball: true, teams: [] },
  { id: 'bundes', flag: '🇩🇪', logo: 'https://media.api-sports.io/football/leagues/78.png', name: 'Bundesliga', country: 'Allemagne', apiFootball: true, teams: [] },
  { id: 'seriea', flag: '🇮🇹', logo: 'https://media.api-sports.io/football/leagues/135.png', name: 'Serie A', country: 'Italie', apiFootball: true, teams: [] },
  { id: 'bresil', flag: '🇧🇷', logo: 'https://media.api-sports.io/football/leagues/71.png', name: 'Brasileirão', country: 'Brésil', apiFootball: true, teams: [] },
  // Grèce (8 septembre 2026) — 1er championnat ajouté au moteur d'alertes profitant directement de
  // ce nouveau système : aucune recherche d'id ESPN n'a été nécessaire, contrairement aux 6 ci-dessus
  // à l'époque de leur ajout.
  { id: 'grece',  flag: '🇬🇷', logo: 'https://media.api-sports.io/football/leagues/197.png', name: 'Super League', country: 'Grèce', apiFootball: true, teams: [] },
  // Arabie Saoudite (8 septembre 2026) — 2e championnat à profiter du système dynamique, aucune
  // recherche d'id nécessaire (contrairement à l'époque ESPN des 6 premiers championnats).
  { id: 'arabie', flag: '🇸🇦', logo: 'https://media.api-sports.io/football/leagues/307.png', name: 'Pro League', country: 'Arabie Saoudite', apiFootball: true, teams: [] },
  // Portugal (9 septembre 2026) — 3e championnat à profiter du système dynamique.
  { id: 'portugal', flag: '🇵🇹', logo: 'https://media.api-sports.io/football/leagues/94.png', name: 'Liga Betclic', country: 'Portugal', apiFootball: true, teams: [] },
  // Pays-Bas/Belgique/Suisse/Norvège/Turquie (17 septembre 2026) — même système dynamique.
  { id: 'paysbas',  flag: '🇳🇱', logo: 'https://media.api-sports.io/football/leagues/88.png', name: 'Eredivisie', country: 'Pays-Bas', apiFootball: true, teams: [] },
  { id: 'belgique', flag: '🇧🇪', logo: 'https://media.api-sports.io/football/leagues/144.png', name: 'Pro League', country: 'Belgique', apiFootball: true, teams: [] },
  { id: 'suisse',   flag: '🇨🇭', logo: 'https://media.api-sports.io/football/leagues/207.png', name: 'Super League', country: 'Suisse', apiFootball: true, teams: [] },
  { id: 'norvege',  flag: '🇳🇴', logo: 'https://media.api-sports.io/football/leagues/103.png', name: 'Eliteserien', country: 'Norvège', apiFootball: true, teams: [] },
  { id: 'turquie',  flag: '🇹🇷', logo: 'https://media.api-sports.io/football/leagues/203.png', name: 'Süper Lig', country: 'Turquie', apiFootball: true, teams: [] },
  {
    id: 'nba', flag: '🇺🇸', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png', name: 'NBA', country: 'États-Unis',
    teams: NBA_TEAMS,
  },
  {
    id: 'wnba', flag: '🇺🇸', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png', name: 'WNBA', country: 'États-Unis',
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
    id: 'acb', flag: '🇪🇸', logo: 'https://media.api-sports.io/basketball/leagues/117.png', name: 'ACB', country: 'Espagne',
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
    // Grèce (9 septembre 2026) — "Basket League", même patron que ACB/BBL/Lega A/NBL (byname roster
    // générique, aucun id à chercher à la main). 13 équipes 2025-2026 vérifiées en direct
    // (api-basketball, league=45), noms tels que renvoyés par l'API pour matcher exactement côté
    // /api/euro/gbl/roster/byname.
    id: 'gbl', flag: '🇬🇷', logo: 'https://media.api-sports.io/basketball/leagues/45.png', name: 'Basket League', country: 'Grèce',
    teams: [
      { name: 'AEK Athens' },
      { name: 'Aris' },
      { name: 'AS Karditsas' },
      { name: 'Iraklis' },
      { name: 'Kolossos Rhodes' },
      { name: 'Maroussi' },
      { name: 'Mykonos' },
      { name: 'Olympiacos' },
      { name: 'Panathinaikos' },
      { name: 'Panionios' },
      { name: 'PAOK' },
      { name: 'Peristeri' },
      { name: 'Promitheas' },
    ],
  },
  {
    // Corrigé le 15 septembre 2026 (signalé "on a pas les effectifs de l'Europe pour le basket") :
    // cette entrée n'était jamais atteignable — `country: 'Europe'` ne correspond à aucun pays
    // cliquable sur la carte (COVERED n'a pas d'entrée "Europe", EuroLeague n'est pas un pays), et
    // même sélectionnée elle serait tombée dans le mauvais composant (LeagueItem, foot uniquement,
    // faute d'être dans EU_BASKET_LEAGUE_IDS) — 2 bugs indépendants qui masquaient totalement
    // cette ligue. Liste de clubs remplacée par les 20 vrais clubs de la saison 2025 (vérifié en
    // direct, api-basketball league=120/season=2025) — l'ancienne liste à 17 clubs datait d'une
    // saison passée et utilisait des noms (ex. "AS Monaco", "ASVEL") qui ne matchent pas les noms
    // exacts renvoyés par l'API ("Monaco", "Lyon-Villeurbanne"), nécessaires pour la recherche par
    // nom de /api/euro/euroleague/roster/byname.
    id: 'euroleague', flag: '🇪🇺', logo: 'https://media.api-sports.io/basketball/leagues/120.png', name: 'EuroLeague', country: 'Europe',
    teams: [
      { name: 'Anadolu Efes' }, { name: 'Barcelona' }, { name: 'Baskonia' }, { name: 'Bayern' },
      { name: 'Crvena zvezda' }, { name: 'Dubai' }, { name: 'Fenerbahce' }, { name: 'Hapoel Tel-Aviv' },
      { name: 'Lyon-Villeurbanne' }, { name: 'Maccabi Tel Aviv' }, { name: 'Monaco' }, { name: 'Olimpia Milano' },
      { name: 'Olympiacos' }, { name: 'Panathinaikos' }, { name: 'Paris' }, { name: 'Partizan' },
      { name: 'Real Madrid' }, { name: 'Valencia' }, { name: 'Virtus Bologna' }, { name: 'Zalgiris Kaunas' },
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
          {league.logo
            ? <img className="ef-card-logo" src={league.logo} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
            : <span className="ef-card-flag">{league.flag}</span>}
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
          {league.logo
            ? <img className="ef-card-logo" src={league.logo} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
            : <span className="ef-card-flag">{league.flag}</span>}
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
          {league.logo
            ? <img className="ef-card-logo" src={league.logo} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
            : <span className="ef-card-flag">{league.flag}</span>}
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

function FootballRosterPanel({ teamName, teamId, leagueKey, onClose }) {
  const cacheKey = `${leagueKey}:${teamId}`;
  const [data, setData]       = useState(sofascoreCache[cacheKey] ?? null);
  const [loading, setLoading] = useState(!sofascoreCache[cacheKey]);
  const [error, setError]     = useState(null);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    if (!teamId) { setLoading(false); return; }
    if (sofascoreCache[cacheKey]) { setData(sofascoreCache[cacheKey]); setLoading(false); return; }
    setLoading(true);
    fetch(`/api/football/squad2/${leagueKey}/${teamId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        sofascoreCache[cacheKey] = d;
        setData(d);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [teamId, leagueKey]);

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

      {!teamId  && <div className="ef-roster-state ef-roster-error">Effectif non disponible</div>}
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
                    {p.photo
                      ? <img src={p.photo} alt="" className="ef-fb-photo" onError={e => { e.currentTarget.style.display = 'none'; }} />
                      : <span className="ef-fb-jersey">{p.jerseyNumber ?? '—'}</span>}
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

// Foot uniquement (NBA/WNBA/basket EU ont leurs propres composants dédiés, cf. renderLeagueItem
// plus bas) — toutes les entrées foot de LEAGUES sont dynamiques (api-football), plus de liste
// statique d'ids à gérer ici.
function LeagueItem({ league }) {
  const [open, setOpen]         = useState(false);
  const [selected, setSelected] = useState(null);
  const [teams, setTeams]       = useState(footballTeamsCache[league.id] ?? null);
  const [teamsLoading, setTeamsLoading] = useState(!footballTeamsCache[league.id]);

  useEffect(() => {
    if (!open) return;
    if (footballTeamsCache[league.id]) { setTeams(footballTeamsCache[league.id]); setTeamsLoading(false); return; }
    setTeamsLoading(true);
    fetch(`/api/football/teams-full/${league.id}`)
      .then(r => r.json())
      .then(d => {
        const t = d.teams || [];
        footballTeamsCache[league.id] = t;
        setTeams(t);
        setTeamsLoading(false);
      })
      .catch(() => { setTeams([]); setTeamsLoading(false); });
  }, [open, league.id]);

  const teamList = teams ?? [];

  return (
    <div className="ef-league-item">
      <button className="ef-card-btn" onClick={() => { setOpen(o => !o); setSelected(null); }}>
        <div className="ef-card">
          {league.logo
            ? <img className="ef-card-logo" src={league.logo} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
            : <span className="ef-card-flag">{league.flag}</span>}
          <div className="ef-card-info">
            <span className="ef-card-name">{league.name}</span>
            <span className="ef-card-meta">{league.country} · {teams ? `${teamList.length} clubs` : '…'}</span>
          </div>
          <svg className={`ef-card-chevron ${open ? 'open' : ''}`} width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>
      <div className={`ef-teams-wrap ${open ? 'open' : ''}`}>
        {teamsLoading && <div className="ef-roster-state">Chargement des clubs…</div>}
        <div className="ef-teams-grid">
          {teamList.map(team => (
            <button
              key={team.name}
              className={`ef-team-chip ef-team-chip--clickable ${selected?.name === team.name ? 'active' : ''}`}
              onClick={() => setSelected(s => s?.name === team.name ? null : team)}
            >
              {team.name}
              {team.logo && <img src={team.logo} alt="" className="ef-chip-logo" />}
            </button>
          ))}
        </div>
        {selected && (
          <FootballRosterPanel
            key={selected.name}
            teamName={selected.name}
            teamId={selected.id}
            leagueKey={league.id}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}

// 'euroleague' ajoutée le 15 septembre 2026 — même route générique (/api/euro/euroleague/roster/
// byname/:nom, api-basketball) que les 6 autres, jamais branchée jusqu'ici (voir commentaire sur
// l'entrée LEAGUES correspondante).
const EU_BASKET_LEAGUE_IDS = new Set(['acb', 'lnb', 'bbl', 'legaa', 'nbl', 'gbl', 'euroleague']);

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
