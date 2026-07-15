import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { getBballLeagueById, getBballFixturesByLeague, BBALL_FIXTURES } from '../utils/basketball';
import { useFixture, useFixturesByLeague } from '../utils/useFixtures';
import { formatFullDate, formatMatchTime, formatCapacity } from '../utils/formatters';
import FormStrip from '../components/FormStrip';
import StatBar from '../components/StatBar';
import { OddsCell, EdgeBadge } from '../components/OddsCell';
import { cachedFetch, invalidateCache } from '../utils/fetchCache';

// ── ESPN WNBA lookup (name → teamId) ─────────────────────────────────────────
const ESPN_WNBA = {
  'Atlanta Dream':           20,
  'Chicago Sky':             19,
  'Connecticut Sun':         18,
  'Dallas Wings':             3,
  'Golden State Valkyries': 129689,
  'Indiana Fever':            5,
  'Las Vegas Aces':          17,
  'Los Angeles Sparks':       6,
  'Minnesota Lynx':           8,
  'New York Liberty':         9,
  'Phoenix Mercury':         11,
  'Portland Fire':          132052,
  'Seattle Storm':           14,
  'Toronto Tempo':          131935,
  'Washington Mystics':      16,
};

// ── ESPN NBA lookup (name → teamId) ──────────────────────────────────────────
const ESPN_NBA = {
  'Atlanta Hawks':           1,
  'Boston Celtics':          2,
  'New Orleans Pelicans':    3,
  'Chicago Bulls':           4,
  'Cleveland Cavaliers':     5,
  'Dallas Mavericks':        6,
  'Denver Nuggets':          7,
  'Detroit Pistons':         8,
  'Golden State Warriors':   9,
  'Houston Rockets':         10,
  'Indiana Pacers':          11,
  'LA Clippers':             12,
  'Los Angeles Lakers':      13,
  'Miami Heat':              14,
  'Milwaukee Bucks':         15,
  'Minnesota Timberwolves':  16,
  'Brooklyn Nets':           17,
  'New York Knicks':         18,
  'Orlando Magic':           19,
  'Philadelphia 76ers':      20,
  'Phoenix Suns':            21,
  'Portland Trail Blazers':  22,
  'Sacramento Kings':        23,
  'San Antonio Spurs':       24,
  'Oklahoma City Thunder':   25,
  'Utah Jazz':               26,
  'Washington Wizards':      27,
  'Toronto Raptors':         28,
  'Memphis Grizzlies':       29,
  'Charlotte Hornets':       30,
};

// ── 5-player court positions : formation 2-1-2 (style FlashScore) ──
// Coordonnées en % du conteneur (aspect-ratio 200/130 = SVG viewBox)
// Conversion : x% = svgX/200*100, y% = svgY/130*100
// Arc 3pts gauche : x=35% | Arc 3pts droit : x=65% | Raquettes : x=20% et x=80%
const BBALL_HOME = [
  { x:  9, y: 20, label: 'SG' },  // coin haut gauche
  { x: 35, y: 20, label: 'PG' },  // coin haut droit (arc)
  { x: 22, y: 50, label: 'SF' },  // centre
  { x:  9, y: 78, label: 'C'  },  // coin bas gauche
  { x: 35, y: 78, label: 'PF' },  // coin bas droit
];
const BBALL_AWAY = [
  { x: 65, y: 20, label: 'PG' },  // coin haut gauche (arc)
  { x: 91, y: 20, label: 'SG' },  // coin haut droit
  { x: 78, y: 50, label: 'SF' },  // centre
  { x: 65, y: 78, label: 'PF' },  // coin bas gauche
  { x: 91, y: 78, label: 'C'  },  // coin bas droit
];

function CourtSVG({ homeLogo }) {
  const s = 'rgba(255,255,255,0.88)';
  const sw = '0.9';
  return (
    <svg className="lp-pitch-svg" viewBox="0 0 200 130" preserveAspectRatio="none">
      {/* Parquet */}
      <rect width="200" height="130" fill="#7a4a1e"/>
      {[1,2,3,4,5,6,7,8,9].map(i => (
        <line key={i} x1="0" y1={i*13} x2="200" y2={i*13} stroke="rgba(0,0,0,0.12)" strokeWidth="0.6"/>
      ))}
      {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].map(i => (
        <line key={`v${i}`} x1={i*13} y1="0" x2={i*13} y2="130" stroke="rgba(255,255,255,0.04)" strokeWidth="0.4"/>
      ))}
      {homeLogo && <>
        <image href={homeLogo} x="0.25" y="-1.5" width="22" height="22"
          opacity="0.35" preserveAspectRatio="xMidYMid meet"/>
        <image href={homeLogo} x="179" y="110" width="22" height="22"
          opacity="0.35" preserveAspectRatio="xMidYMid meet"/>
      </>}

      {/* Boundary */}
      <rect x="2" y="2" width="196" height="126" fill="none" stroke={s} strokeWidth="1.2"/>

      {/* Half-court line + tick marks */}
      <line x1="100" y1="2" x2="100" y2="128" stroke={s} strokeWidth={sw}/>
      <line x1="96" y1="2"   x2="104" y2="2"   stroke={s} strokeWidth="1.4"/>
      <line x1="96" y1="128" x2="104" y2="128" stroke={s} strokeWidth="1.4"/>

      {/* Center circle */}
      <circle cx="100" cy="65" r="18" fill="none" stroke={s} strokeWidth={sw}/>

      {/* ── LEFT HALF ── */}
      {/* 3-point corners + arc (basket center ~17,65 ; r=54) */}
      <line x1="2" y1="20" x2="46" y2="20" stroke={s} strokeWidth={sw}/>
      <line x1="2" y1="110" x2="46" y2="110" stroke={s} strokeWidth={sw}/>
      <path d="M 46,20 A 54,54 0 0,1 46,110" fill="none" stroke={s} strokeWidth={sw}/>

      {/* Paint */}
      <rect x="2" y="43" width="36" height="44" fill="rgba(0,0,0,0.08)" stroke={s} strokeWidth={sw}/>

      {/* Free throw circle — outside solid, inside dashed */}
      <path d="M 38,50 A 15,15 0 0,1 38,80" fill="none" stroke={s} strokeWidth={sw}/>
      <path d="M 38,50 A 15,15 0 0,0 38,80" fill="none" stroke={s} strokeWidth={sw} strokeDasharray="2.5,2"/>

      {/* Restricted area */}
      <path d="M 17,56 A 9,9 0 0,1 17,74" fill="none" stroke={s} strokeWidth={sw}/>

      {/* Backboard + rim */}
      <line x1="11" y1="58" x2="11" y2="72" stroke={s} strokeWidth="2.5"/>
      <circle cx="17" cy="65" r="4" fill="none" stroke={s} strokeWidth="1.2"/>

      {/* ── RIGHT HALF ── */}
      {/* 3-point corners + arc (basket center ~183,65 ; r=54) */}
      <line x1="198" y1="20" x2="154" y2="20" stroke={s} strokeWidth={sw}/>
      <line x1="198" y1="110" x2="154" y2="110" stroke={s} strokeWidth={sw}/>
      <path d="M 154,20 A 54,54 0 0,0 154,110" fill="none" stroke={s} strokeWidth={sw}/>

      {/* Paint */}
      <rect x="162" y="43" width="36" height="44" fill="rgba(0,0,0,0.08)" stroke={s} strokeWidth={sw}/>

      {/* Free throw circle */}
      <path d="M 162,50 A 15,15 0 0,0 162,80" fill="none" stroke={s} strokeWidth={sw}/>
      <path d="M 162,50 A 15,15 0 0,1 162,80" fill="none" stroke={s} strokeWidth={sw} strokeDasharray="2.5,2"/>

      {/* Restricted area */}
      <path d="M 183,56 A 9,9 0 0,0 183,74" fill="none" stroke={s} strokeWidth={sw}/>

      {/* Backboard + rim */}
      <line x1="189" y1="58" x2="189" y2="72" stroke={s} strokeWidth="2.5"/>
      <circle cx="183" cy="65" r="4" fill="none" stroke={s} strokeWidth="1.2"/>
    </svg>
  );
}

const EL_LOGOS = {
  OLY: 'https://media-cdn.incrowdsports.com/789423ac-3cdf-4b89-b11c-b458aa5f59a6.png',
  FEN: 'https://media-cdn.cortextech.io/3b7f020e-5b39-49a1-b4b2-efea918edab7.png',
  RMB: 'https://media-cdn.incrowdsports.com/371b0d9b-9250-4c09-bda7-0686cf024657.png',
  VBC: 'https://media-cdn.cortextech.io/d88f3c71-1519-4b19-8cfb-99e26a4c008e.png',
  PAO: 'https://media-cdn.incrowdsports.com/e3dff28a-9ec6-4faf-9d96-ecbc68f75780.png',
  BAR: 'https://media-cdn.incrowdsports.com/35dfa503-e417-481f-963a-bdf6f013763e.png',
  MUN: 'https://media-cdn.incrowdsports.com/817b0e58-d595-4b09-ab0b-1e7cc26249ff.png',
  ZAL: 'https://media-cdn.incrowdsports.com/0aa09358-3847-4c4e-b228-3582ee4e536d.png',
  TEL: 'https://media-cdn.cortextech.io/1b533342-78f5-4932-b714-a7d80b5826b5.png',
  MIL: 'https://media-cdn.cortextech.io/9512ee73-a0f1-4647-a01e-3c2938aba6b8.png',
  MCO: 'https://media-cdn.incrowdsports.com/89ed276a-2ba3-413f-8ea2-b3be209ca129.png',
  IST: 'https://media-cdn.cortextech.io/9a463aa2-ceb2-481c-9a95-1cddee0a248e.png',
  PAR: 'https://media-cdn.incrowdsports.com/2681304e-77dd-4331-88b1-683078c0fb49.png',
  BAS: 'https://media-cdn.cortextech.io/cbc49cb0-99ce-4462-bdb7-56983ee03cf4.png',
  RED: 'https://media-cdn.incrowdsports.com/d2eef4a8-62df-4fdd-9076-276004268515.png',
};

function BballLogo({ team, size = 52 }) {
  const elLogo = EL_LOGOS[team.short?.toUpperCase()] ?? EL_LOGOS[team.logoId?.toUpperCase()];
  const src = team.logo
    || elLogo
    || (team.logoId ? `https://a.espncdn.com/i/teamlogos/nba/500/${team.logoId}.png` : null);
  if (!src) return null;
  return (
    <img
      src={src}
      alt={team.name}
      className="team-logo-img"
      style={{ width: size, height: size }}
      onError={e => { e.target.style.display = 'none'; }}
    />
  );
}

function PlayerDot({ pos, name, confirmed }) {
  const dotClass = name
    ? confirmed ? 'lp-dot--confirmed' : 'lp-dot--filled'
    : '';
  return (
    <div className="lp-player" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
      <div className={`lp-dot ${dotClass}`} />
      {name && <span className="lp-player-label">{name.split(' ').pop()}</span>}
    </div>
  );
}

function LineupBuilder({ home, away, homeNames, awayNames, confirmed }) {
  return (
    <div className="lp-wrap">
      <div className="lp-controls">
        <div className="lp-ctrl"><span className="lp-team-label">{home.short}</span></div>
        <div className="lp-ctrl lp-ctrl--right"><span className="lp-team-label">{away.short}</span></div>
      </div>
      <div className="lp-pitch-wrap">
        <CourtSVG homeLogo={home.logo || (home.logoId ? `https://a.espncdn.com/i/teamlogos/nba/500/${home.logoId}.png` : null)} />
        {BBALL_AWAY.map((pos, i) => (
          <PlayerDot key={`a${i}`} pos={pos} name={awayNames[i]} confirmed={confirmed} />
        ))}
        {BBALL_HOME.map((pos, i) => (
          <PlayerDot key={`h${i}`} pos={pos} name={homeNames[i]} confirmed={confirmed} />
        ))}
      </div>
      <p className="lp-hint">Cliquer sur un joueur · Cliquer une 2e fois pour le retirer</p>
    </div>
  );
}

// ── Roster Panel ──────────────────────────────────────────────────────────────

function RosterColumn({ team, players, names, side, loading, onAssign, injuryData = {} }) {
  // Abrège la position en 1-2 chars (Guard→G, Forward→F, Center→C)
  const abbrevPos = pos => {
    if (!pos || pos === '—') return '—';
    const p = pos.toUpperCase();
    if (p === 'PG' || p === 'SG' || p.startsWith('G')) return 'G';
    if (p === 'SF' || p === 'PF' || p.startsWith('F')) return 'F';
    if (p.startsWith('C')) return 'C';
    return pos.slice(0, 2).toUpperCase();
  };
  // Titulaires = top-5 par minutes (fallback pts si min absent)
  const sorted = [...(players || [])].sort((a, b) => ((b.stats?.min ?? b.stats?.pts ?? -1)) - ((a.stats?.min ?? a.stats?.pts ?? -1)));
  const starters = sorted.slice(0, 5);
  const bench    = sorted.slice(5);

  return (
    <div className="rp-col">
      <div className="rp-col-header">{team.short}</div>
      <div className="rp-body">
        {loading && <div className="rp-status">Chargement...</div>}
        {!loading && (!players || players.length === 0) && (
          <div className="rp-status">Indisponible</div>
        )}
        {!loading && players && players.length > 0 && (
          <>
            {starters.length > 0 && (
              <div className="rp-group">
                <div className="rp-group-label">Titulaires</div>
                {starters.map(p => {
                  const isUsed = names.some(n => euNameEq(n, p.name));
                  return (
                    <button key={p.id}
                      className={`rp-player-btn ${isUsed ? 'rp-used' : ''}`}
                      onClick={() => onAssign(side, p.name)}>
                      <span className="rp-pos-tag">{abbrevPos(p.position)}</span>
                      <span className="rp-num">{p.jersey ?? '—'}</span>
                      <span className="rp-pname">{p.name}</span>
                      {(() => {
                        const inj = injuryData[p.name]?.status || p.injury;
                        if (!inj) return p.stats?.pts != null ? <span className="rp-inj" style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{Number(p.stats.pts).toFixed(1)}</span> : null;
                        const isOut = inj === 'Out';
                        return <span style={{ fontSize: 9, fontWeight: 700, color: isOut ? '#ef4444' : '#fb923c', marginLeft: 'auto' }}>{isOut ? 'Out' : 'Q'}</span>;
                      })()}
                    </button>
                  );
                })}
              </div>
            )}
            {bench.length > 0 && (
              <div className="rp-group">
                <div className="rp-group-label">Remplaçants</div>
                {bench.map(p => {
                  const isUsed = names.some(n => euNameEq(n, p.name));
                  return (
                    <button key={p.id}
                      className={`rp-player-btn ${isUsed ? 'rp-used' : ''}`}
                      onClick={() => onAssign(side, p.name)}>
                      <span className="rp-pos-tag">{abbrevPos(p.position)}</span>
                      <span className="rp-num">{p.jersey ?? '—'}</span>
                      <span className="rp-pname">{p.name}</span>
                      {(() => {
                        const inj = injuryData[p.name]?.status || p.injury;
                        if (!inj) return null;
                        const isOut = inj === 'Out';
                        return <span style={{ fontSize: 9, fontWeight: 700, color: isOut ? '#ef4444' : '#fb923c', marginLeft: 'auto' }}>{isOut ? 'Out' : 'Q'}</span>;
                      })()}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RosterPanel({ home, away, homePlayers, awayPlayers, loading, homeNames, awayNames, onAssign, injuryData = {} }) {
  return (
    <div className="detail-card roster-panel-card">
      <RosterColumn team={home} players={homePlayers} names={homeNames} side="home" loading={loading} onAssign={onAssign} injuryData={injuryData} />
      <div className="rp-divider" />
      <RosterColumn team={away} players={awayPlayers} names={awayNames} side="away" loading={loading} onAssign={onAssign} injuryData={injuryData} />
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function CollapsibleCard({ title, children, className = '', defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`detail-card collapsible-card ${className}`}>
      <button className="collapsible-header" onClick={() => setOpen(o => !o)}>
        <span className="card-title">{title}</span>
        <span className={`collapsible-chevron ${open ? 'open' : ''}`}>▾</span>
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </section>
  );
}

function H2HRow({ match }) {
  const d = new Date(match.date);
  const label = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const homeWon = match.scoreHome > match.scoreAway;
  return (
    <div className="h2h-row">
      <span className="h2h-date">{label}</span>
      <span className={`h2h-team ${homeWon ? 'h2h-winner' : ''}`}>{match.home}</span>
      <span className="h2h-score">{match.scoreHome} – {match.scoreAway}</span>
      <span className={`h2h-team right ${!homeWon ? 'h2h-winner' : ''}`}>{match.away}</span>
    </div>
  );
}

// ── Props Analyzer ────────────────────────────────────────────────────────────

const LEAGUE_AVG_PTS_ALLOWED  = 114.5;  // NBA saison 2025-26
const LEAGUE_AVG_GAME_TOTAL   = 229.0;  // NBA saison 2025-26
const PLAYOFF_AVG_PTS_ALLOWED = 108.0;
const PLAYOFF_AVG_GAME_TOTAL  = 215.0;

// EuroLeague 2025-26
const EL_AVG_PTS_ALLOWED    = 81.0;   // pts encaissés/match saison régulière
const EL_AVG_GAME_TOTAL     = 163.0;  // total combiné saison régulière
const EL_FF_AVG_PTS_ALLOWED = 83.0;   // Final Four (équipes plus offensives)
const EL_FF_AVG_GAME_TOTAL  = 167.0;  // Final Four total combiné
const EL_SCALE = LEAGUE_AVG_PTS_ALLOWED / EL_AVG_PTS_ALLOWED; // ≈ 1.414 (pour props)

// WNBA 2026 — recalibrer dès ~10 matchs/équipe disponibles (mi-juin 2026)
const WNBA_AVG_PTS_ALLOWED = 87.0;   // pts encaissés/match — calibré 29 mai 2026
const WNBA_AVG_GAME_TOTAL  = 174.0;  // total combiné — calibré 29 mai 2026
const WNBA_SCALE = LEAGUE_AVG_PTS_ALLOWED / WNBA_AVG_PTS_ALLOWED; // ≈ 1.278 (normalise vers NBA)

// Championnats EU 2025-26 — moyennes scoring saison régulière
const EU_LEAGUE_CONST = {
  acb:   { avg: 83.0, total: 166.0 },
  lnb:   { avg: 79.0, total: 158.0 },
  bbl:   { avg: 82.0, total: 164.0 },
  legaa: { avg: 80.0, total: 160.0 },
};
const EURO_LEAGUES_IDS = ['acb', 'lnb', 'bbl', 'legaa'];
const getEuroConst = league => EU_LEAGUE_CONST[league] || null;

// api-sports.io ne renvoie pas toujours les noms EU dans le même ordre (Prénom Nom vs Nom Prénom)
// selon l'endpoint — comparaison insensible à l'ordre des mots pour matcher malgré ça
const euNameKey = s => (s || '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
const euNameEq = (a, b) => !!a && !!b && euNameKey(a) === euNameKey(b);

// Bandes de confiance — plancher unique 80% depuis le 22 juin 2026 (75% exception spécialiste).
// high = seuil alerte (vert) · mid = zone intermédiaire (cyan) · en-dessous = faible (ambre)
const PROP_CONF_BANDS = {
  nba_short: {
    pts: { high: 80, mid: 70 },
    reb: { high: 80, mid: 70 },
    ast: { high: 80, mid: 70 },
    tpm: { high: 80, mid: 70 },
  },
  eu: {
    pts: { high: 80, mid: 70 },
    reb: { high: 80, mid: 70 },
    ast: { high: 80, mid: 70 },
    tpm: { high: 80, mid: 70 },
  },
};
const EU_PROP_LEAGUES = new Set(['acb', 'lnb', 'bbl', 'legaa', 'euroleague']);
// Vert/cyan/ambre — mêmes couleurs que les badges .bc-edge-badge.high/.mid/.low (PlaceBetPage/index.css)
function propConfColor(stat, league, pct) {
  const bands = (EU_PROP_LEAGUES.has(league) ? PROP_CONF_BANDS.eu : PROP_CONF_BANDS.nba_short)[stat];
  if (!bands) return pct >= 80 ? '#00ff80' : pct >= 65 ? '#00d4ff' : '#ffb400';
  if (pct >= bands.high) return '#4a9b6f';
  if (pct >= bands.mid) return '#00d4ff';
  return '#ffb400';
}

// Légende cliquable pour les onglets Résultat/Points/Écart H2H/Joueurs — même format que
// PropLegendCard (dots de couleur + seuil d'alerte), sans texte descriptif sur ce que représente
// chaque onglet (déjà documenté dans la page Utilisation, pas besoin de le répéter ici).
function OddsLegendCard({ tab }) {
  const Dot = ({ color }) => <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: color, marginRight: 4, flexShrink: 0 }} />;
  const showBands = tab !== 'joueurs';
  const ALERTS = {
    all: <>Alerte si probabilité ≥ <b style={{ color: '#4ade80' }}>75%</b> + cote ≥ <b style={{ color: '#ef4444' }}>1.60</b>.</>,
    points: <>Alerte si P(Over) ou P(Under) ≥ <b style={{ color: '#4ade80' }}>80%</b> + cote ≥ <b style={{ color: '#ef4444' }}>1.60</b> (Unibet/Betclic) — bloquée si joueur clé incertain/absent.</>,
    handicap: <>Alerte mêmes seuils que Résultat (≥ <b style={{ color: '#4ade80' }}>75%</b>, cote ≥ <b style={{ color: '#ef4444' }}>1.60</b>).</>,
    joueurs: <>Alerte si un bookmaker offre ≥ <b style={{ color: '#4ade80' }}>20% d'edge</b> vs la ligne Pinnacle, cote ≥ <b style={{ color: '#ef4444' }}>1.60</b>.</>,
  };
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', marginBottom: '0.6rem' }}>
        Code couleur — confiance
      </div>
      {showBands && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.5rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', fontSize: 9.5, whiteSpace: 'nowrap' }}>
            <Dot color="#10b981" /><b style={{ color: '#10b981' }}>≥ 62%</b>&nbsp;— confiance forte
          </span>
          <span style={{ display: 'flex', alignItems: 'center', fontSize: 9.5, whiteSpace: 'nowrap' }}>
            <Dot color="#f59e0b" /><b style={{ color: '#f59e0b' }}>52–62%</b>&nbsp;— moyen
          </span>
          <span style={{ display: 'flex', alignItems: 'center', fontSize: 9.5, whiteSpace: 'nowrap' }}>
            <Dot color="#ef4444" /><b style={{ color: '#ef4444' }}>&lt; 52%</b>&nbsp;— faible
          </span>
        </div>
      )}
      <div style={{ fontSize: 9, lineHeight: 1.45, color: 'var(--text)', ...(showBands ? { borderTop: '1px solid var(--border)', paddingTop: '0.4rem' } : {}) }}>
        {ALERTS[tab] ?? ALERTS.all}
      </div>
    </div>
  );
}

// Légende cliquable — explique le code couleur des % projetés et le seuil d'alerte par stat.
function PropLegendCard({ league }) {
  const bands = EU_PROP_LEAGUES.has(league) ? PROP_CONF_BANDS.eu : PROP_CONF_BANDS.nba_short;
  const STATS = [['pts', 'Pts'], ['reb', 'Rebs'], ['ast', 'Passes'], ['tpm', '3pts']];
  const isWNBA = league === 'wnba';
  const Dot = ({ color }) => <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: color, marginRight: 4, flexShrink: 0 }} />;
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', marginBottom: '0.6rem' }}>
        Code couleur — confiance
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.5rem' }}>
        {isWNBA ? (
          <>
            <span style={{ display: 'flex', alignItems: 'center', fontSize: 9.5, whiteSpace: 'nowrap' }}>
              <Dot color="#4a9b6f" /><b style={{ color: '#4a9b6f' }}>≥ 80%</b>&nbsp;— seuil AST
            </span>
            <span style={{ display: 'flex', alignItems: 'center', fontSize: 9.5, whiteSpace: 'nowrap' }}>
              <Dot color="#4a9b6f" style={{ opacity: 0.85 }} /><b style={{ color: '#4a9b6f', opacity: 0.9 }}>≥ 77%</b>&nbsp;— seuil pts / reb / 3pts
            </span>
            <span style={{ display: 'flex', alignItems: 'center', fontSize: 9.5, whiteSpace: 'nowrap' }}>
              <Dot color="#4a9b6f" style={{ opacity: 0.55 }} /><b style={{ color: '#4a9b6f', opacity: 0.7 }}>≥ 72%</b>&nbsp;— spécialiste régulière sur la stat
            </span>
          </>
        ) : (
          <>
            <span style={{ display: 'flex', alignItems: 'center', fontSize: 9.5, whiteSpace: 'nowrap' }}>
              <Dot color="#4a9b6f" /><b style={{ color: '#4a9b6f' }}>≥ 80%</b>&nbsp;— seuil de déclenchement
            </span>
            <span style={{ display: 'flex', alignItems: 'center', fontSize: 9.5, whiteSpace: 'nowrap' }}>
              <Dot color="#4a9b6f" style={{ opacity: 0.6 }} /><b style={{ color: '#4a9b6f', opacity: 0.8 }}>≥ 75%</b>&nbsp;— spécialiste régulière sur la stat
            </span>
          </>
        )}
        <span style={{ display: 'flex', alignItems: 'center', fontSize: 9.5, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}><Dot color="#00d4ff" />{isWNBA ? '65–71%' : '70–79%'} moyen</span>
        <span style={{ display: 'flex', alignItems: 'center', fontSize: 9.5, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}><Dot color="#ffb400" />&lt;{isWNBA ? '65%' : '70%'} faible</span>
      </div>
      <div style={{ fontSize: 9, lineHeight: 1.45, color: 'var(--text-dim)', borderTop: '1px solid var(--border)', paddingTop: '0.4rem' }}>
        {isWNBA
          ? <>Alerte si <b style={{ color: '#4a9b6f' }}>seuil vert</b> + cotes ≥ 1,60 + minutes ≥ 10/match. AST Over bloqué si ligne ≥ 4,5 · 3pts Over : moy ≥ 1,2/match.</>
          : <>Alerte si <b style={{ color: '#4a9b6f' }}>seuil vert</b> + cotes Unibet/Betclic ≥ 1,60 + minutes ≥ 10/match. 3pts Over : moy ≥ 1,5/match.</>
        }
      </div>
    </div>
  );
}

function fmtFactor(val) {
  const pct = ((val - 1) * 100);
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function calcAvg(games, key, n) {
  const slice = games.slice(0, n).map(g => g[key]).filter(v => v != null && !isNaN(v));
  return slice.length ? slice.reduce((s, v) => s + v, 0) / slice.length : null;
}

// Moyenne pondérée exponentielle — matchs récents = poids plus élevé (decay 0.82 ≈ L3 pèse ~60%)
function calcEWA(games, key, n, decay = 0.82) {
  const slice = games.slice(0, n).map(g => g[key]).filter(v => v != null && !isNaN(v));
  if (!slice.length) return null;
  let sum = 0, wSum = 0;
  slice.forEach((v, i) => { const w = Math.pow(decay, i); sum += w * v; wSum += w; });
  return wSum ? sum / wSum : null;
}

// USG% calculé depuis les gamelogs ESPN (FGA + 0.44*FTA + TO / possessions estimées)
// Formule approximative : on suppose ~100 possessions/match par équipe (pace NBA actuel)
function getUsageRate(games) {
  if (!games?.length) return null;
  const valid = games.filter(g => g.min > 10 && g.fga != null).slice(0, 15);
  if (!valid.length) return null;
  const avgPoss = valid.reduce((s, g) => {
    const poss = (g.fga || 0) + 0.44 * (g.fta || 0) + (g.to || 0);
    return s + poss / Math.max(1, g.min / 48 * 100);
  }, 0) / valid.length;
  return Math.min(50, +(avgPoss * 100).toFixed(1));
}

// USG% récent vs historique — détecte un changement de rôle (blessure partenaire, schéma coach)
function getUsageFactor(gamelogs) {
  if (!gamelogs?.length) return { val: 1.0, desc: '—' };
  const recentUsg  = getUsageRate(gamelogs.slice(0, 5));
  const typicalUsg = getUsageRate(gamelogs.slice(5, 20));
  if (!recentUsg) return { val: 1.0, desc: '—' };
  if (!typicalUsg) return { val: 1.0, desc: `USG% ${recentUsg.toFixed(1)}%` };
  const ratio = recentUsg / typicalUsg;
  if (ratio > 1.20) return { val: Math.min(1.10, 0.5 + 0.5 * ratio), desc: `USG% ↑ ${recentUsg.toFixed(1)}% (+${((ratio - 1) * 100).toFixed(0)}%)` };
  if (ratio < 0.80) return { val: Math.max(0.90, 1.2 - 0.2 / ratio), desc: `USG% ↓ ${recentUsg.toFixed(1)}% (${((ratio - 1) * 100).toFixed(0)}%)` };
  return { val: 1.0, desc: `USG% stable: ${recentUsg.toFixed(1)}%` };
}

// ── Probability distribution helpers ─────────────────────────────────────────

// Approximation de la CDF normale (Abramowitz & Stegun, erreur < 7.5e-8)
// Student t-distribution CDF df=4 (exact) — queues plus lourdes que la normale
function tCDF4(t) {
  if (t >= 0) return 0.5 + t * (6 + t * t) / (2 * Math.pow(4 + t * t, 1.5));
  return 1 - tCDF4(-t);
}

// P(joueur marque ≥ threshold) — t-dist df=4 + shrinkage vers la ligne + std élargi
// deviation: |adjMult - 1| — plus la projection s'écarte de la moyenne saison (empilement
// de facteurs), plus on élargit le std : une projection "extrême" est moins fiable que
// son écart à la ligne ne le suggère.
function probAtLeast(estimate, std, threshold, stat = null, deviation = 0) {
  const SHRINK = { pts: 0.28, reb: 0.12, ast: 0.10, tpm: 0.20 };
  const FLOOR  = { pts: 4.0,  reb: 2.0,  ast: 1.5,  tpm: 1.0  };
  const alpha  = SHRINK[stat] ?? 0.15;
  const floor  = FLOOR[stat]  ?? 2.0;
  const shrunk = estimate + alpha * (threshold - estimate);
  const devBoost = 1 + Math.min(1.0, deviation * 2.5);
  const adjStd = Math.max(floor, (std || 0) * 1.5 * devBoost);
  const t = (threshold - 0.5 - shrunk) / adjStd;
  return Math.max(0.01, Math.min(0.99, 1 - tCDF4(t)));
}

// Écart-type empirique (Bessel n-1) sur les gamelogs pour une stat donnée
function calcStd(games, key) {
  const vals = (games || [])
    .filter(g => g.min > 10 && g[key] != null && !(key === 'pts' && g.pts === 0 && g.min >= 12))
    .map(g => g[key]);
  if (vals.length < 3) return null;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1));
}

// Paliers adaptatifs centrés sur l'estimation
// step: 5 pour pts, 2 pour reb/ast
function generateThresholds(estimate, step) {
  const base = Math.round(estimate / step) * step;
  const thresholds = [];
  for (let t = Math.max(step, base - 2 * step); t <= base + 2 * step; t += step) {
    thresholds.push(t);
  }
  return thresholds;
}

function ProbabilityBars({ estimate, std, label, step = 5, bookmakerLine = null, stat = null }) {
  if (!estimate || estimate <= 0) return null;
  const thresholds = generateThresholds(estimate, step);
  const bLine = bookmakerLine != null ? Math.ceil(bookmakerLine) : null;
  const allThresholds = bLine && !thresholds.includes(bLine)
    ? [...thresholds, bLine].sort((a, b) => a - b)
    : thresholds;
  return (
    <div className="prob-section">
      <div className="prob-section-title">{label} — probabilité de dépasser</div>
      {allThresholds.map(t => {
        const p   = probAtLeast(estimate, std, t, stat);
        const pct = Math.round(p * 100);
        const cls = pct >= 65 ? 'prob-fill--high' : pct >= 40 ? 'prob-fill--mid' : 'prob-fill--low';
        const isBkLine = t === bLine;
        return (
          <div key={t} className="prob-row" style={isBkLine ? { background: 'rgba(139,92,246,0.1)', borderRadius: 3, margin: '0 -2px', padding: '0 2px' } : {}}>
            <span className="prob-threshold" style={isBkLine ? { color: '#a78bfa', fontWeight: 800 } : {}}>{t}{isBkLine ? ' ●' : ''}</span>
            <div className="prob-bar-bg">
              <div className={`prob-bar-fill ${cls}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`prob-pct ${cls}`} style={isBkLine ? { fontWeight: 800 } : {}}>{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

function getFormFactor(games, key, seasonAvg) {
  if (!games?.length || !seasonAvg) return { val: 1.0, desc: '—' };
  const a = calcEWA(games, key, 7);
  if (!a) return { val: 1.0, desc: '—' };
  const val = Math.min(1.45, Math.max(0.6, a / seasonAvg));
  return { val, desc: `${a.toFixed(1)} EWA L7` };
}

// Forme normalisée pts/min — EWA L7, neutralise les blowouts (garbage time min réduits)
function getPtsPerMinForm(games, seasonAvg) {
  if (!games?.length || !seasonAvg) return { val: 1.0, desc: '—' };
  const withMin = games.filter(g => g.min > 0).slice(0, 7);
  if (!withMin.length) return { val: 1.0, desc: '—' };
  const allMins = games.filter(g => g.min > 0).map(g => g.min).sort((a, b) => a - b);
  const medMin = allMins[Math.floor(allMins.length / 2)];
  let sum = 0, wSum = 0;
  withMin.forEach((g, i) => { const w = Math.pow(0.82, i); sum += w * (g.pts / g.min); wSum += w; });
  const avgPPM = wSum ? sum / wSum : null;
  if (!avgPPM) return { val: 1.0, desc: '—' };
  const normPts = +(avgPPM * medMin).toFixed(1);
  const val = Math.min(1.45, Math.max(0.6, normPts / seasonAvg));
  return { val, desc: `${normPts} pts adj. EWA L7 (base ${medMin}min)` };
}

// Streak : 3+ matchs consécutifs au-dessus ou en dessous de la moyenne
function getStreakFactor(games, seasonAvg) {
  if (!games?.length || !seasonAvg) return { val: 1.0, desc: '—', streak: 0, isHot: false, isCold: false };
  const isHot = games[0]?.pts > seasonAvg;
  let streak = 0;
  for (const g of games.slice(0, 9)) {
    if (isHot ? g.pts > seasonAvg : g.pts <= seasonAvg) streak++;
    else break;
  }
  if (streak < 3) return { val: 1.0, desc: `${streak} match(s) consécutif(s)`, streak, isHot: false, isCold: false };
  const val = isHot
    ? Math.min(1.12, 1 + (streak - 2) * 0.015)
    : Math.max(0.88, 1 - (streak - 2) * 0.015);
  const desc = isHot
    ? `${streak} matchs au-dessus moy.`
    : `${streak} matchs sous moy.`;
  return { val, desc, streak, isHot, isCold: !isHot };
}

// Facteur période : saison régulière vs playoffs (défense + pace plus intenses)
function getPlayoffFactor(round) {
  if (!round) return { val: 1.0, desc: 'Saison régulière' };
  const r = round.toLowerCase();
  if (r.includes('final') && !r.includes('conf') && !r.includes('semi'))
    return { val: 0.93, desc: 'Finales NBA' };
  if ((r.includes('conf') && r.includes('final')) || r.includes('conference final'))
    return { val: 0.95, desc: 'Finales de Conférence' };
  if (r.includes('semi') || r.includes('2nd round'))
    return { val: 0.96, desc: '2ème tour Playoffs' };
  if (r.includes('playoff') || r.includes('round 1') || r.includes('1st round') || r.includes('conf. semi') || r.includes('conf. finals'))
    return { val: 0.97, desc: '1er tour Playoffs' };
  return { val: 1.0, desc: 'Saison régulière' };
}

// Facteur total Vegas — référence playoff vs RS selon contexte
function getVegasTotalFactor(gameTotal, isPlayoff = false) {
  if (!gameTotal) return { val: 1.0, desc: 'Total indisponible' };
  const avg = isPlayoff ? PLAYOFF_AVG_GAME_TOTAL : LEAGUE_AVG_GAME_TOTAL;
  const val = Math.min(1.1, Math.max(0.85, gameTotal / avg));
  return { val, desc: `Total Vegas: ${gameTotal}` };
}

function getTrendFactor(games, key) {
  if (!games || games.length < 5) return { val: 1.0, desc: '—' };
  const a3 = calcEWA(games, key, 3);
  const a8 = calcEWA(games.slice(3), key, 7);
  if (!a3 || !a8) return { val: 1.0, desc: '—' };
  const raw = a3 / a8;
  const val = Math.min(1.1, Math.max(0.9, 0.65 + 0.35 * raw));
  return { val, desc: raw > 1.07 ? '↗ En forme' : raw < 0.93 ? '↘ En baisse' : 'Stable' };
}

function getPaceFactor(oppGames) {
  if (!oppGames?.length) return { val: 1.0, desc: '—' };
  const last5 = oppGames.slice(0, 5);
  const avgTotal = last5.reduce((s, g) => s + g.ptsScored + g.ptsAllowed, 0) / last5.length;
  const val = Math.min(1.1, Math.max(0.9, avgTotal / LEAGUE_AVG_GAME_TOTAL));
  return { val, desc: `${avgTotal.toFixed(0)} pts/match total (L5)` };
}

function getDefFactor(oppGames, isPlayoff = false) {
  if (!oppGames?.length) return { val: 1.0, desc: '—' };
  const avg        = isPlayoff ? PLAYOFF_AVG_PTS_ALLOWED : LEAGUE_AVG_PTS_ALLOWED;
  const last5      = oppGames.slice(0, 5);
  const avgAllowed = last5.reduce((s, g) => s + g.ptsAllowed, 0) / last5.length;
  const val        = Math.min(1.2, Math.max(0.8, avgAllowed / avg));
  return { val, desc: `${avgAllowed.toFixed(1)} pts encaissés/match (L5)` };
}

// Stars (USG% > 24) pénalisées progressivement : défenses qui s'adaptent match après match
function getSeriesGameFactor(round, usg, isHome = false) {
  if (!round) return { val: 1.0, desc: '—' };
  const m = round.match(/game\s*(\d)/i);
  if (!m) return { val: 1.0, desc: '—' };
  const gn     = parseInt(m[1]);
  const isStar = (usg ?? 0) > 24;
  if (!isStar) return { val: 1.0, desc: `G${gn} (rôle player)` };
  // À domicile : les stars s'élèvent dans les matchs à enjeu
  if (isHome) {
    const homeMap = { 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.01, 5: 1.02, 6: 1.02, 7: 1.03 };
    const val = homeMap[gn] ?? 1.01;
    return { val, desc: `G${gn} dom. — élévation star (${((val - 1) * 100).toFixed(0)}%)` };
  }
  // À l'extérieur : pression + hostilité → pénalité maintenue
  const awayMap = { 1: 1.0, 2: 0.97, 3: 0.95, 4: 0.94, 5: 0.94, 6: 0.95, 7: 0.96 };
  const val = awayMap[gn] ?? 0.94;
  return { val, desc: `G${gn} ext. — pression hostile (${((val - 1) * 100).toFixed(0)}%)` };
}

// Moyennes ligue par position (approximation stable saison après saison)
const LEAGUE_AVG_BY_POS = { G: 22.8, F: 18.5, C: 14.8 };

function toDefCat(pos) {
  if (!pos) return 'F';
  const p = pos.toUpperCase();
  if (p === 'PG' || p === 'SG' || p === 'G' || p.startsWith('G')) return 'G';
  if (p === 'C'  || p.startsWith('C')) return 'C';
  return 'F';
}

function getPosDefFactor(teamDef, playerPosition) {
  if (!teamDef) return { val: 1.0, desc: '—' };
  const cat = toDefCat(playerPosition);
  const pts = teamDef[cat];
  const avg = LEAGUE_AVG_BY_POS[cat];
  if (pts == null || !avg) return { val: 1.0, desc: '—' };
  const val = Math.min(1.25, Math.max(0.75, pts / avg));
  return { val, desc: `${pts} pts/j vs ${cat} (saison vs cette équipe)` };
}

function getH2HFactor(games, oppAbbr, seasonAvg, stat = 'pts') {
  if (!games?.length || !oppAbbr || !seasonAvg) return { val: 1.0, desc: '—' };
  const h2h = games.filter(g => g.opponentAbbr === oppAbbr);
  if (!h2h.length) return { val: 1.0, desc: 'Pas d\'historique' };
  const a = calcAvg(h2h, stat, h2h.length);
  if (!a) return { val: 1.0, desc: '—' };
  const val = Math.min(1.3, Math.max(0.7, a / seasonAvg));
  return { val, desc: `${a.toFixed(1)} ${stat} moy. vs ${oppAbbr} (${h2h.length}m)` };
}

function getRestFactor(myGames, gameDate) {
  if (!myGames?.length) return { val: 1.0, desc: '—', isB2B: false };
  const sorted = [...myGames].sort((a, b) => new Date(b.date) - new Date(a.date));
  const diff = (new Date(gameDate) - new Date(sorted[0].date)) / 86400000;
  if (diff < 1.5) return { val: 0.94, desc: 'Back-to-back', isB2B: true };
  if (diff < 2.5) return { val: 1.0,  desc: '1j de repos', isB2B: false };
  if (diff < 3.5) return { val: 1.02, desc: '2j de repos', isB2B: false };
  return { val: 1.03, desc: '3j+ de repos', isB2B: false };
}

// Densité calendrier : 3 matchs en 5 jours = fatigue significative
function getScheduleDensityFactor(myGames, gameDate) {
  if (!myGames?.length) return { val: 1.0, desc: '—' };
  const gd = new Date(gameDate);
  const recent = myGames.filter(g => {
    const d = (gd - new Date(g.date)) / 86400000;
    return d > 0 && d <= 5;
  });
  if (recent.length >= 3) {
    const span = Math.round((gd - new Date(recent[recent.length - 1].date)) / 86400000);
    return { val: 0.92, desc: `${recent.length} matchs en ${span}j` };
  }
  if (recent.length === 2) {
    const span = (gd - new Date(recent[recent.length - 1].date)) / 86400000;
    if (span <= 3) return { val: 0.96, desc: '2 matchs en 3j' };
  }
  return { val: 1.0, desc: '—' };
}

// Blowout / garbage time : si l'un des deux camps est dominant (>74%), minutes à risque
function getBlowoutFactor(homeImpliedProb) {
  if (homeImpliedProb == null) return { val: 1.0, desc: '—' };
  const dominant = Math.max(homeImpliedProb, 1 - homeImpliedProb);
  if (dominant > 0.82) return { val: 0.92, desc: `Match plié probable (${Math.round(dominant * 100)}%) — garbage time` };
  if (dominant > 0.74) return { val: 0.96, desc: `Gros écart attendu (${Math.round(dominant * 100)}%)` };
  return { val: 1.0, desc: '—' };
}

function getLocationFactor(isHome, isPlayoff = false) {
  if (isPlayoff) return isHome
    ? { val: 1.04, desc: 'Domicile (playoffs)' }
    : { val: 0.96, desc: 'Extérieur (playoffs)' };
  return isHome
    ? { val: 1.025, desc: 'Domicile' }
    : { val: 0.975, desc: 'Extérieur' };
}

// Split domicile/extérieur spécifique au joueur calculé sur ses gamelogs
function getHomeAwaySplitFactor(gamelogs, isHome, isPlayoff = false) {
  const fallback = getLocationFactor(isHome, isPlayoff);
  const g = (gamelogs || []).filter(gl => gl.isHome != null && (gl.pts ?? 0) > 0 && (gl.min ?? 0) > 10);
  const homeG = g.filter(gl => gl.isHome);
  const awayG = g.filter(gl => !gl.isHome);
  if (homeG.length < 3 || awayG.length < 3) return fallback;
  const avg = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
  const homePts = avg(homeG.map(gl => gl.pts));
  const awayPts = avg(awayG.map(gl => gl.pts));
  if (!homePts || !awayPts) return fallback;
  const ratio = isHome ? homePts / awayPts : awayPts / homePts;
  const capped = Math.min(1.15, Math.max(0.85, ratio));
  const val = +(1 + (capped - 1) * 0.5).toFixed(3);
  return { val, desc: `Split D/E joueur: ${((val - 1) * 100).toFixed(1)}%` };
}

// Facteur blessure / retour — détecte gap dans les gamelogs ou statut injury ESPN
function getInjuryReturnFactor(player, gamelogs, gameDate) {
  const g      = gamelogs || [];
  const injury = player.injury; // null | 'Day-To-Day' | 'Out' | 'Questionable'

  if (injury === 'Out') return { val: 0, desc: 'Absent (Out)', isInjured: true, isOut: true };

  // Jours depuis le dernier match joué
  let daysSinceLast = 0;
  if (g.length > 0) {
    daysSinceLast = (new Date(gameDate) - new Date(g[0].date)) / 86400000;
  }

  // Minutes récentes vs minutes habituelles (L3 vs L4-8)
  const recent3  = g.slice(0, 3);
  const typical5 = g.slice(3, 8);
  const recentMin  = recent3.length  ? recent3.reduce((s, x)  => s + (x.min || 0), 0) / recent3.length  : null;
  const typicalMin = typical5.length ? typical5.reduce((s, x) => s + (x.min || 0), 0) / typical5.length : recentMin;
  const minRatio = (recentMin && typicalMin && typicalMin > 10) ? recentMin / typicalMin : 1.0;

  const missedRecent = daysSinceLast > 8; // au moins 2 matchs de playoffs manqués

  if (missedRecent && injury) return { val: 0.78, desc: `Retour blessure (${Math.round(daysSinceLast)}j) · ${injury}`, isInjured: true, isOut: false };
  if (missedRecent)           return { val: 0.82, desc: `${Math.round(daysSinceLast)}j sans jouer`,                     isInjured: true, isOut: false };
  if (injury && minRatio < 0.78) {
    const val = Math.max(0.72, minRatio);
    return { val, desc: `${injury} · minutes réduites (${recentMin ? Math.round(recentMin) : '?'}min)`, isInjured: true, isOut: false };
  }
  if (injury) return { val: 0.88, desc: `${injury} — incertain`, isInjured: true, isOut: false };

  return { val: 1.0, desc: '—', isInjured: false, isOut: false };
}

// TS% récent vs historique — efficacité réelle au tir
function getTSFactor(games, isPlayoff = false) {
  const valid = (games || []).filter(g => g.tsPct != null && g.min > 10);
  if (valid.length < 4) return { val: 1.0, desc: '—' };
  const recentTS = valid.slice(0, 5).reduce((s, g) => s + g.tsPct, 0) / Math.min(5, valid.slice(0, 5).length);
  const histSlice = valid.slice(5, 15);
  if (!histSlice.length) return { val: 1.0, desc: '—' };
  const histTS = histSlice.reduce((s, g) => s + g.tsPct, 0) / histSlice.length;
  if (histTS <= 0) return { val: 1.0, desc: '—' };
  const ratio = recentTS / histTS;
  const [lo, hi] = isPlayoff ? [0.95, 1.05] : [0.93, 1.07];
  const val = Math.min(hi, Math.max(lo, 0.4 + 0.6 * ratio));
  const pct = r => `${(r * 100).toFixed(1)}%`;
  return { val, desc: `TS% récent ${pct(recentTS)} vs hist. ${pct(histTS)}` };
}

// Volume de tirs FGA/min — détecte changement de rôle
function getShotVolumeFactor(games) {
  const valid = (games || []).filter(g => g.fga != null && g.min > 10);
  if (valid.length < 5) return { val: 1.0, desc: '—' };
  const recentVol = valid.slice(0, 4).reduce((s, g) => s + g.fga / g.min, 0) / 4;
  const histSlice = valid.slice(4, 15);
  if (!histSlice.length) return { val: 1.0, desc: '—' };
  const histVol = histSlice.reduce((s, g) => s + g.fga / g.min, 0) / histSlice.length;
  if (histVol <= 0) return { val: 1.0, desc: '—' };
  const ratio = recentVol / histVol;
  const val = Math.min(1.08, Math.max(0.92, 0.5 + 0.5 * ratio));
  return { val, desc: `Volume tirs: ${(recentVol * 36).toFixed(1)} FGA/36min récent` };
}

// Taux LF (FTA/FGA) — accès à la ligne = scoring facile
function getFTRateFactor(games) {
  const valid = (games || []).filter(g => g.fga > 3 && g.min > 10);
  if (valid.length < 4) return { val: 1.0, desc: '—' };
  const recentFTR = valid.slice(0, 4).reduce((s, g) => s + g.fta / g.fga, 0) / 4;
  const histSlice = valid.slice(4, 14);
  if (!histSlice.length) return { val: 1.0, desc: '—' };
  const histFTR = histSlice.reduce((s, g) => s + g.fta / g.fga, 0) / histSlice.length;
  if (histFTR <= 0) return { val: 1.0, desc: '—' };
  const ratio = recentFTR / histFTR;
  const val = Math.min(1.06, Math.max(0.94, 0.5 + 0.5 * ratio));
  return { val, desc: `Taux LF: ${(recentFTR * 100).toFixed(0)}% récent vs ${(histFTR * 100).toFixed(0)}% hist.` };
}

// Rebond offensif récent — booste projection reb
function getORebFactor(games) {
  const valid = (games || []).filter(g => g.oreb != null && g.min > 10);
  if (valid.length < 4) return { val: 1.0, desc: '—' };
  const recentOR = valid.slice(0, 4).reduce((s, g) => s + g.oreb / g.min, 0) / 4;
  const histSlice = valid.slice(4, 14);
  if (!histSlice.length) return { val: 1.0, desc: '—' };
  const histOR = histSlice.reduce((s, g) => s + g.oreb / g.min, 0) / histSlice.length;
  if (histOR <= 0.01) return { val: 1.0, desc: '—' };
  const ratio = recentOR / histOR;
  const val = Math.min(1.08, Math.max(0.93, 0.45 + 0.55 * ratio));
  return { val, desc: `OREB récent vs hist.` };
}

// Ratio TO/AST — difficultés de création récentes
function getTOARatioFactor(games) {
  const valid = (games || []).filter(g => g.to != null && g.ast != null && g.min > 10);
  if (valid.length < 4) return { val: 1.0, desc: '—' };
  const toaRatio = g => g.ast > 0 ? g.to / g.ast : g.to > 2 ? 1.5 : 0;
  const recentR = valid.slice(0, 4).reduce((s, g) => s + toaRatio(g), 0) / 4;
  const histSlice = valid.slice(4, 14);
  if (!histSlice.length) return { val: 1.0, desc: '—' };
  const histR = histSlice.reduce((s, g) => s + toaRatio(g), 0) / histSlice.length;
  if (histR <= 0) return { val: 1.0, desc: '—' };
  const ratio = recentR / histR;
  const val = Math.min(1.04, Math.max(0.92, 1.5 - 0.5 * ratio));
  return { val, desc: `TO/AST: ${recentR.toFixed(2)} récent vs ${histR.toFixed(2)} hist.` };
}

function computeEstimate(player, isHome, oppGames, myGames, gamelogs, oppAbbr, gameDate, round, gameTotal, oppDefByPos, homeImpliedProb = null, redistributionFactor = 1.0, isWNBA = false) {
  const s = player.stats;
  if (!s?.pts) return null;

  // Le gamelog passé est déjà mergé : matchs PO de la série (boxscores) + gamelog ESPN RS
  // Plus de filtre inPO sur g — les matchs PO sont en tête du tableau, l'EWA les pèse naturellement plus
  const inPO = isPlayoffRound(round);
  const g    = gamelogs || [];

  const injRet = getInjuryReturnFactor(player, g, gameDate);
  if (injRet.isOut) return null;

  // Nombre de vrais matchs PO dans le gamelog (date >= début playoffs)
  const poStart   = inPO ? getPlayoffsStart(gameDate) : null;
  const poCount   = poStart ? g.filter(gl => new Date(gl.date) >= poStart).length : 0;
  const hasPOData = poCount > 0;

  // Base EWA sur le gamelog mergé + blend 50/50 avec moyenne saison (prior bayésien)
  // redistributionFactor > 1 quand un coéquipier à fort USG est OUT → boost proportionnel
  // Exclut les matchs à 0 pts avec minutes significatives (blowout / foul trouble) — outliers
  const gClean = g.filter(gl => !(gl.pts === 0 && (gl.min ?? 0) >= 12));
  const ewaBase   = gClean.length >= 4 ? calcEWA(gClean, 'pts', 10) : null;
  const ewaReb    = s.reb && g.length >= 4 ? calcEWA(g, 'reb', 10) : null;
  const ewaAst    = s.ast && g.length >= 4 ? calcEWA(g, 'ast', 10) : null;
  const ewaTpm    = s.tpm && g.length >= 4 ? calcEWA(g, 'tpm', 10) : null;
  // EWA toujours prioritaire sur moyenne saison — données récentes plus représentatives
  // WNBA (saison courte, anomalies fréquentes) : 70% / PO avec données : 65% / défaut : 60%
  const ewaW = isWNBA ? 0.70 : (inPO && hasPOData && poCount >= 3) ? 0.65 : 0.60;
  const rsW  = 1 - ewaW;

  // L3 crosscheck : si les 3 derniers matchs propres divergent >25% de l'EWA → L3 prioritaire
  const l3Clean = gClean.slice(0, 3).filter(gl => (gl.min ?? 0) >= 12 && gl.pts != null);
  const l3Avg   = l3Clean.length >= 2 ? l3Clean.reduce((s, gl) => s + gl.pts, 0) / l3Clean.length : null;
  const useL3   = l3Avg != null && ewaBase != null && Math.abs(l3Avg - ewaBase) / ewaBase > 0.25;
  const effEWA  = useL3 ? l3Avg : ewaBase;

  const basePts = (effEWA != null ? +(ewaW * effEWA + rsW * s.pts).toFixed(1) : s.pts) * redistributionFactor;
  const baseReb = s.reb ? ((ewaReb != null ? +(ewaW * ewaReb + rsW * s.reb).toFixed(1) : s.reb) * redistributionFactor) : null;
  const baseAst = s.ast ? ((ewaAst != null ? +(ewaW * ewaAst + rsW * s.ast).toFixed(1) : s.ast) * redistributionFactor) : null;
  const baseTpm = s.tpm ? ((ewaTpm != null ? +(ewaW * ewaTpm + rsW * s.tpm).toFixed(1) : s.tpm) * redistributionFactor) : null;

  // Fix 4 — atténuer facteurs défensifs si échantillon < 15 matchs (données peu fiables)
  const sampleDamp = n => n >= 15 ? 1.0 : n < 5 ? 0.0 : (n - 5) / 10;
  const dampen = sampleDamp(Math.min(oppGames?.length || 0, myGames?.length || 0));

  const rawPace = getPaceFactor(oppGames);
  const rawDef  = oppDefByPos ? getPosDefFactor(oppDefByPos, player.position) : getDefFactor(oppGames, inPO);
  const pace    = { ...rawPace, val: 1 + (rawPace.val - 1) * dampen };
  const def     = { ...rawDef,  val: 1 + (rawDef.val  - 1) * dampen };
  const h2h     = getH2HFactor(g, oppAbbr, s.pts, 'pts');
  const h2hReb  = s.reb ? getH2HFactor(g, oppAbbr, s.reb, 'reb') : { val: 1.0, desc: '—' };
  const h2hAst  = s.ast ? getH2HFactor(g, oppAbbr, s.ast, 'ast') : { val: 1.0, desc: '—' };
  const h2hTpm  = s.tpm ? getH2HFactor(g, oppAbbr, s.tpm, 'tpm') : { val: 1.0, desc: '—' };
  const rest    = getRestFactor(myGames, gameDate);
  const density = getScheduleDensityFactor(myGames, gameDate);
  const loc     = getHomeAwaySplitFactor(g, isHome, inPO);
  const playoff = getPlayoffFactor(round);
  const series  = getSeriesGameFactor(round, player.usg, isHome);
  const vegas   = getVegasTotalFactor(gameTotal, inPO);
  const streak  = getStreakFactor(g, s.pts);
  const usage   = getUsageFactor(g);
  const blowout = getBlowoutFactor(homeImpliedProb);

  // Facteurs basés sur les stats individuelles du joueur
  const tsF     = getTSFactor(g, inPO);
  const shotVol = getShotVolumeFactor(g);
  const ftRate  = getFTRateFactor(g);
  const orebF   = getORebFactor(g);
  const toaF    = getTOARatioFactor(g);

  let adjMult, adjMultReb, adjMultAst, adjMultTpm, h2hCapped, h2hRebCapped, h2hAstCapped, h2hTpmCapped;

  if (inPO) {
    // Base EWA déjà filtrée sur matchs PO vs même adversaire → H2H double-compte ; cap resserré
    h2hCapped    = Math.min(1.08, Math.max(0.92, h2h.val));
    h2hRebCapped = Math.min(1.08, Math.max(0.92, h2hReb.val));
    h2hAstCapped = Math.min(1.08, Math.max(0.92, h2hAst.val));
    h2hTpmCapped = Math.min(1.08, Math.max(0.92, h2hTpm.val));
    const paceDamped = 1 + (pace.val - 1) * 0.5;
    const roleNormPO = (() => {
      const seasonMin = player.stats?.min;
      if (!seasonMin || seasonMin < 5 || g.length < 2) return 1.0;
      const recent3 = g.slice(0, 3).filter(gl => gl.min > 0);
      if (recent3.length < 2) return 1.0;
      const recentMin = recent3.reduce((s, gl) => s + gl.min, 0) / recent3.length;
      if (recentMin >= seasonMin * 0.75) return 1.0;
      return Math.max(0.72, recentMin / seasonMin);
    })();
    // Facteurs joueur atténués en PO (base EWA PO les intègre déjà partiellement)
    const tsAttn  = 1 + (tsF.val    - 1) * 0.5;
    const volAttn = 1 + (shotVol.val - 1) * 0.5;
    const ftAttn  = 1 + (ftRate.val  - 1) * 0.5;
    // Si on a de vrais matchs PO dans le gamelog, l'EWA reflète déjà l'intensité playoffs
    // → on neutralise playoff.val pour éviter le double comptage
    // G1 ou pas de données PO → on garde playoff.val pour ajuster la base RS
    const playoffAdj = hasPOData ? 1.0 : playoff.val;
    const rawMult = def.val * paceDamped * rest.val * density.val * loc.val * vegas.val * blowout.val * injRet.val * roleNormPO * h2hCapped * tsAttn * volAttn * ftAttn * playoffAdj * series.val;
    adjMult    = Math.min(1.30, Math.max(0.74, rawMult));
    adjMultReb = Math.min(1.30, Math.max(0.74, rawMult * (1 + (orebF.val - 1) * 0.6) * h2hRebCapped));
    adjMultAst = Math.min(1.30, Math.max(0.74, rawMult * toaF.val * h2hAstCapped));
    adjMultTpm = Math.min(1.30, Math.max(0.74, rawMult * h2hTpmCapped));
  } else {
    h2hCapped    = Math.min(1.08, Math.max(0.92, h2h.val));
    h2hRebCapped = Math.min(1.08, Math.max(0.92, h2hReb.val));
    h2hAstCapped = Math.min(1.08, Math.max(0.92, h2hAst.val));
    h2hTpmCapped = Math.min(1.08, Math.max(0.92, h2hTpm.val));
    const streakCapped = Math.min(1.06, Math.max(0.94, streak.val));
    const rawMult = def.val * pace.val * rest.val * density.val * loc.val * vegas.val * blowout.val * injRet.val * streakCapped * h2hCapped * tsF.val * shotVol.val * ftRate.val;
    adjMult    = Math.min(1.24, Math.max(0.78, rawMult));
    adjMultReb = Math.min(1.24, Math.max(0.78, rawMult * orebF.val * h2hRebCapped));
    adjMultAst = Math.min(1.24, Math.max(0.78, rawMult * toaF.val * h2hAstCapped));
    adjMultTpm = Math.min(1.24, Math.max(0.78, rawMult * h2hTpmCapped));
  }

  const floorPts = s.pts * 0.72;
  const projPts  = Math.max(floorPts, +(basePts * adjMult).toFixed(1));

  return {
    pts: +projPts.toFixed(1),
    reb: baseReb ? +(baseReb * adjMultReb).toFixed(1) : null,
    ast: baseAst ? +(baseAst * adjMultAst).toFixed(1) : null,
    tpm: baseTpm ? +(baseTpm * adjMultTpm).toFixed(1) : null,
    // Écart de la projection par rapport à la moyenne saison — sert à élargir le std dans probAtLeast
    deviation: { pts: Math.abs(adjMult - 1), reb: Math.abs(adjMultReb - 1), ast: Math.abs(adjMultAst - 1), tpm: Math.abs(adjMultTpm - 1) },
    streak,
    isInjured: injRet.isInjured,
    factors: [
      { name: 'TS% (efficacité tir)',       ...tsF      },
      { name: 'Volume tirs (FGA/min)',      ...shotVol  },
      { name: 'Taux lancers francs',        ...ftRate   },
      { name: 'H2H vs adversaire',          ...h2h, val: h2hCapped },
      { name: 'Pace adversaire',            ...pace     },
      { name: oppDefByPos ? 'Défense vs position' : 'Défense adverse', ...def },
      { name: 'Repos / B2B',               ...rest     },
      { name: 'Densité calendrier',        ...density  },
      { name: 'Lieu',                       ...loc      },
      { name: 'Total Vegas',               ...vegas    },
      { name: 'Playoff round',             ...playoff  },
      { name: 'Numéro match série',        ...series   },
      { name: 'Blowout / garbage time',    ...blowout  },
      { name: 'Blessure / retour',         ...injRet   },
      { name: 'Série en cours',            ...streak   },
      { name: 'USG% (rôle récent)',        ...usage    },
      { name: 'Absent coéquipier (USG)',   val: redistributionFactor, desc: redistributionFactor > 1.0 ? `+${Math.round((redistributionFactor - 1) * 100)}% USG redistribué` : '—' },
    ],
  };
}

// ── Game Total O/U model ──────────────────────────────────────────────────────

// resultEstimate.pHome/pAway viennent de computeTeamWinProb (backend), même fonction que les
// alertes basketball_result, via /api/basketball/result — couleurs gérées directement dans le
// widget "Modèle 1X2" (mêmes seuils que le foot, 22 juin 2026).

// Idem pour le widget "Modèle O/U" — gameTotalEstimate vient de computeGameTotalFull (backend)
// via /api/basketball/total depuis le 22 juin 2026, déjà en échelle 0-100 (TOTAL_ALERT_PROB côté
// serveur est en fraction 0.80, ne pas comparer directement à pOver/pUnder ici).
const GAME_TOTAL_DISPLAY_ALERT_PROB = 80; // %

// Détecte automatiquement si le round est un match de playoffs
function isPlayoffRound(round) {
  if (!round) return false;
  const r = round.toLowerCase();
  return r.includes('final') || r.includes('semi') || r.includes('game') || r.includes('playoff');
}

// Date de début des playoffs NBA = 1er avril de l'année du match (auto chaque saison)
function getPlayoffsStart(date) {
  return new Date(`${new Date(date).getFullYear()}-04-01`);
}

// Facteur playoffs spécifique aux totaux — plus fort que pour les props joueurs
// (le pace et l'intensité défensive écrasent le total bien plus que les stats individuelles)
function getPlayoffFactorTotal(round) {
  if (!round) return { val: 1.0, desc: 'Saison régulière' };
  const r = round.toLowerCase();
  if (r.includes('final') && !r.includes('conf') && !r.includes('semi'))
    return { val: 0.87, desc: 'Finales NBA' };
  if ((r.includes('conf') && r.includes('final')) || r.includes('conference final'))
    return { val: 0.90, desc: 'Finales de Conférence' };
  if (r.includes('semi') || r.includes('2nd round'))
    return { val: 0.93, desc: '2ème tour Playoffs' };
  if (r.includes('playoff') || r.includes('round 1') || r.includes('1st round') || r.includes('game'))
    return { val: 0.95, desc: '1er tour Playoffs' };
  return { val: 1.0, desc: 'Saison régulière' };
}

// Écart-type des totaux de match (pour P(total > line))
function calcGameTotalStd(games, fallback = 12) {
  const vals = (games || []).map(g => g.ptsScored + g.ptsAllowed).filter(v => v > 0);
  if (vals.length < 3) return fallback;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
}

function computeGameTotal(homeGames, awayGames, fixture, refTotal = null) {
  if (!homeGames?.length || !awayGames?.length) return null;

  const isEL       = fixture.league === 'euroleague';
  const isWNBA     = fixture.league === 'wnba';
  const isEuroLeagueId = EURO_LEAGUES_IDS.includes(fixture.league);
  const euroC      = isEuroLeagueId ? getEuroConst(fixture.league) : null;
  const inPlayoffs = isPlayoffRound(fixture.round);
  const poStart    = getPlayoffsStart(fixture.date);
  const filterFn   = inPlayoffs ? g => new Date(g.date) >= poStart : () => true;
  const hGames = homeGames.filter(filterFn);
  const aGames = awayGames.filter(filterFn);
  const hEff = hGames.length >= 3 ? hGames : homeGames;
  const aEff = aGames.length >= 3 ? aGames : awayGames;

  const homeOff = calcEWA(hEff, 'ptsScored', 7);
  const awayOff = calcEWA(aEff, 'ptsScored', 7);
  if (!homeOff || !awayOff) return null;

  const homeDefAllowed = calcEWA(hEff, 'ptsAllowed', 7);
  const awayDefAllowed = calcEWA(aEff, 'ptsAllowed', 7);
  if (!homeDefAllowed || !awayDefAllowed) return null;

  // Calibrage selon la ligue
  const avgPtsAllowed = isEL
    ? (inPlayoffs ? EL_FF_AVG_PTS_ALLOWED : EL_AVG_PTS_ALLOWED)
    : isWNBA
    ? WNBA_AVG_PTS_ALLOWED
    : isEuroLeagueId
    ? euroC.avg
    : (inPlayoffs ? PLAYOFF_AVG_PTS_ALLOWED : LEAGUE_AVG_PTS_ALLOWED);

  const homeDefFactor = Math.min(1.20, Math.max(0.80, homeDefAllowed / avgPtsAllowed));
  const awayDefFactor = Math.min(1.20, Math.max(0.80, awayDefAllowed / avgPtsAllowed));

  const homeExpected = homeOff * awayDefFactor;
  const awayExpected = awayOff * homeDefFactor;

  const homeAtHome   = hEff.filter(g => g.isHome === true).slice(0, 5);
  const awayAtAway   = aEff.filter(g => g.isHome === false).slice(0, 5);
  const homeLocFactor = homeAtHome.length >= 3
    ? Math.min(1.05, Math.max(0.95, calcEWA(homeAtHome, 'ptsScored', 5) / homeOff))
    : 1.025;
  const awayLocFactor = awayAtAway.length >= 3
    ? Math.min(1.05, Math.max(0.95, calcEWA(awayAtAway, 'ptsScored', 5) / awayOff))
    : 0.975;

  // Baseline O/U adaptée à la ligue
  const ouBaseline = isEL
    ? (inPlayoffs ? EL_FF_AVG_GAME_TOTAL : EL_AVG_GAME_TOTAL)
    : isWNBA
    ? WNBA_AVG_GAME_TOTAL
    : isEuroLeagueId
    ? euroC.total
    : (inPlayoffs ? 225.0 : LEAGUE_AVG_GAME_TOTAL);
  const n = Math.min(10, hEff.length, aEff.length);
  const homeOver = hEff.slice(0, n).filter(g => (g.ptsScored + g.ptsAllowed) > ouBaseline).length;
  const awayOver = aEff.slice(0, n).filter(g => (g.ptsScored + g.ptsAllowed) > ouBaseline).length;
  const ouRatio  = n > 0 ? (homeOver + awayOver) / (n * 2) : 0.5;
  const ouFactor = Math.min(1.08, Math.max(0.92, 1.0 + (ouRatio - 0.5) * 0.12));

  // Pace matchup : si deux équipes jouent vite, le tempo s'emballe (effet multiplicatif des deux tempos)
  const homePaceTotal = homeOff + homeDefAllowed;
  const awayPaceTotal = awayOff + awayDefAllowed;
  const leagueRefTotal2 = avgPtsAllowed * 2;
  const paceMatchupRaw = Math.sqrt((homePaceTotal / leagueRefTotal2) * (awayPaceTotal / leagueRefTotal2));
  const paceFactor = Math.min(1.07, Math.max(0.93, paceMatchupRaw));

  // Momentum récent (3 matchs) : tendance court-terme des totaux vs leur moyenne habituelle
  const hRecent3 = hEff.slice(0, 3);
  const aRecent3 = aEff.slice(0, 3);
  const hRecentAvg = hRecent3.length >= 2 ? hRecent3.reduce((s, g) => s + g.ptsScored + g.ptsAllowed, 0) / hRecent3.length : homePaceTotal;
  const aRecentAvg = aRecent3.length >= 2 ? aRecent3.reduce((s, g) => s + g.ptsScored + g.ptsAllowed, 0) / aRecent3.length : awayPaceTotal;
  const hMomentum = homePaceTotal > 0 ? hRecentAvg / homePaceTotal : 1;
  const aMomentum = awayPaceTotal > 0 ? aRecentAvg / awayPaceTotal : 1;
  const momentumFactor = Math.min(1.05, Math.max(0.95, (hMomentum + aMomentum) / 2));

  // Facteur playoffs renforcé pour les totaux
  const playoffF   = getPlayoffFactorTotal(fixture.round);
  const homeRestF  = getRestFactor(hEff, fixture.date);
  const awayRestF  = getRestFactor(aEff, fixture.date);
  const restFactor = (homeRestF.val + awayRestF.val) / 2;
  const homeDensF  = getScheduleDensityFactor(hEff, fixture.date);
  const awayDensF  = getScheduleDensityFactor(aEff, fixture.date);
  const densFactor = (homeDensF.val + awayDensF.val) / 2;

  const rawEstimated = +((homeExpected * homeLocFactor + awayExpected * awayLocFactor)
    * ouFactor * playoffF.val * restFactor * densFactor * paceFactor * momentumFactor).toFixed(1);

  // Ancre historique : blend 40% modèle / 60% moyenne réelle des deux équipes (évite projections trop extrêmes)
  const hAvgTotal = hEff.length >= 4 ? hEff.slice(0, Math.min(10, hEff.length)).reduce((s, g) => s + (g.ptsScored + g.ptsAllowed), 0) / Math.min(10, hEff.length) : null;
  const aAvgTotal = aEff.length >= 4 ? aEff.slice(0, Math.min(10, aEff.length)).reduce((s, g) => s + (g.ptsScored + g.ptsAllowed), 0) / Math.min(10, aEff.length) : null;
  const historicalAvg = hAvgTotal && aAvgTotal ? (hAvgTotal + aAvgTotal) / 2 : null;
  const estimated = historicalAvg ? +(0.40 * rawEstimated + 0.60 * historicalAvg).toFixed(1) : rawEstimated;

  const edge = refTotal ? +((estimated - refTotal) / refTotal * 100).toFixed(1) : null;

  // Probabilité P(total > line) via distribution normale
  const std    = calcGameTotalStd([...hEff, ...aEff], isWNBA ? 20 : 12);
  const MAX_TOTAL_P = 0.88; // plafond abaissé : un total ne peut jamais être "certain" à 93%+
  const rawOver  = refTotal ? 1 - tCDF4((refTotal - estimated) / std) : null;
  const pOver  = rawOver  != null ? +Math.min(MAX_TOTAL_P, rawOver).toFixed(3)  : null;
  const pUnder = rawOver  != null ? +Math.min(MAX_TOTAL_P, 1 - rawOver).toFixed(3) : null;

  return {
    estimated,
    refTotal,
    edge,
    pOver,
    pUnder,
    std: +std.toFixed(1),
    direction:    edge != null ? (edge > 0 ? 'over' : 'under') : null,
    homeExpected: +homeExpected.toFixed(1),
    awayExpected: +awayExpected.toFixed(1),
    details: {
      homeOff:       +homeOff.toFixed(1),
      awayOff:       +awayOff.toFixed(1),
      homeDefFactor: +awayDefFactor.toFixed(3),
      awayDefFactor: +homeDefFactor.toFixed(3),
      playoffFiltered: hEff.length,
      ouTrend:  { homePct: Math.round(homeOver / Math.max(1,n) * 100), awayPct: Math.round(awayOver / Math.max(1,n) * 100), factor: +ouFactor.toFixed(3) },
      pace:     { homeTotal: +homePaceTotal.toFixed(1), awayTotal: +awayPaceTotal.toFixed(1), factor: +paceFactor.toFixed(3) },
      momentum: { homeRecent: +hRecentAvg.toFixed(1), awayRecent: +aRecentAvg.toFixed(1), factor: +momentumFactor.toFixed(3) },
      playoffs: { val: playoffF.val, desc: playoffF.desc },
      rest:     { home: homeRestF.desc, away: awayRestF.desc, combined: +restFactor.toFixed(3) },
      density:  { home: homeDensF.desc, away: awayDensF.desc, combined: +densFactor.toFixed(3) },
    },
  };
}

// Widget d'affichage du modèle O/U
function GameTotalWidget({ estimate, fixture, tot, edgePopupKey, setEdgePopupKey, edgePopupRef }) {
  const [expanded, setExpanded] = useState(false);
  if (!estimate) return null;

  const { estimated, refTotal, edge, pOver, pUnder, std, direction, homeExpected, awayExpected, details, refBk } = estimate;
  const isOver  = direction === 'over';
  const bestP   = pOver != null ? Math.max(pOver, pUnder) : null;
  const isAlert = bestP != null && bestP >= GAME_TOTAL_DISPLAY_ALERT_PROB;
  const BK_LABELS = { unibet: 'Unibet', betclic: 'Betclic' };
  const edgeColor = isOver ? '#4ade80' : '#f87171';

  // Bookmaker non affiché en ligne 1 (refBk) — même format, recalculé ici à partir de
  // estimated/std déjà connus (même maths que computeGameTotalFull côté serveur, pas de
  // 2e appel réseau) puisque chaque bookmaker peut avoir sa propre ligne (25 juin 2026).
  const otherBk = ['unibet', 'betclic'].find(b => b !== refBk && tot?.bookmakers?.[b]?.line != null);
  const otherLine = otherBk ? tot.bookmakers[otherBk].line : null;
  let otherCalc = null;
  if (otherLine && std) {
    const oEdge = +((estimated - otherLine) / otherLine * 100).toFixed(1);
    const oIsOver = oEdge >= 0;
    const oPOver = 1 - tCDF4((otherLine - estimated) / std);
    const oBestP = Math.round((oIsOver ? oPOver : 1 - oPOver) * 100);
    otherCalc = { line: otherLine, bk: otherBk, edge: oEdge, isOver: oIsOver, bestP: oBestP };
  }

  // Vs Pinnacle (25 juin 2026) — edge Unibet/Betclic sur la direction retenue par le modèle,
  // seulement si leur ligne correspond exactement à celle de Pinnacle (sinon comparaison invalide).
  const pin = tot?.bookmakers?.pinnacle;
  const fairPin = pin?.over != null && pin?.under != null ? (() => {
    const s = 1 / pin.over + 1 / pin.under;
    return { over: (1 / pin.over) / s, under: (1 / pin.under) / s };
  })() : null;
  const calcEdgeLocal = (o, f) => (o != null && f != null) ? +((o * f - 1) * 100).toFixed(1) : null;
  const ub = tot?.bookmakers?.unibet, bc = tot?.bookmakers?.betclic;
  const ubEdge = (fairPin && ub?.line === pin?.line) ? calcEdgeLocal(isOver ? ub?.over : ub?.under, isOver ? fairPin.over : fairPin.under) : null;
  const bcEdge = (fairPin && bc?.line === pin?.line) ? calcEdgeLocal(isOver ? bc?.over : bc?.under, isOver ? fairPin.over : fairPin.under) : null;
  const hasPinnacleEdge = ubEdge != null || bcEdge != null;
  const edgeBg    = isOver ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)';

  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.3rem', paddingTop: 'calc(0.3rem + 0.1cm)' }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}
      >
        <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-dim)', alignSelf: 'center' }}>Modèle O/U</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Centré verticalement par rapport aux 2 lignes ci-dessous (align-items:center du parent
              + ce span n'a qu'une ligne alors que la pile à droite en a 2, ou 1 si un seul book). */}
          <span style={{ position: 'relative' }}>
            <span
              onClick={hasPinnacleEdge ? e => { e.stopPropagation(); setEdgePopupKey(prev => prev === 'gtw' ? null : 'gtw'); } : undefined}
              style={{
                fontSize: 10, fontWeight: 600,
                cursor: hasPinnacleEdge ? 'pointer' : 'default',
                textDecoration: hasPinnacleEdge ? 'underline dotted' : 'none', textDecorationColor: 'rgba(255,255,255,0.3)',
              }}
            >{estimated}</span>
            {edgePopupKey === 'gtw' && (
              <div ref={edgePopupRef} onClick={e => e.stopPropagation()} style={{
                position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6,
                background: 'var(--bg-card, #11141c)', border: '1px solid var(--border)', borderRadius: 6,
                padding: '0.35rem 0.55rem', boxShadow: '0 6px 16px rgba(0,0,0,0.4)', zIndex: 50, whiteSpace: 'nowrap',
              }}>
                <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 2 }}>Vs Pinnacle</div>
                {ubEdge != null && <div style={{ fontSize: 10, fontWeight: 600, color: '#1db954' }}>{ubEdge >= 0 ? '+' : ''}{ubEdge.toFixed(1)}%</div>}
                {bcEdge != null && <div style={{ fontSize: 10, fontWeight: 600, color: '#e0292e' }}>{bcEdge >= 0 ? '+' : ''}{bcEdge.toFixed(1)}%</div>}
              </div>
            )}
          </span>

          {/* Pile des lignes bookmaker — largeur fixe sur "vs X (Book)" pour que Unibet et Betclic
              s'alignent colonne par colonne (25 juin 2026), peu importe la longueur du nom/de la ligne. */}
          {refTotal ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: 8, color: 'var(--text-dim)', width: 92, textAlign: 'right', flexShrink: 0 }}>vs {refTotal} {refBk ? `(${BK_LABELS[refBk] ?? refBk})` : ''}</span>
                <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: edgeBg, color: edgeColor, border: `1px solid ${isOver ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}` }}>
                  {isOver ? '▲' : '▼'} {Math.abs(edge)}%
                </span>
                {bestP != null && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: bestP >= 90 ? edgeColor : 'var(--text-dim)' }}>
                    {Math.round(bestP)}%
                  </span>
                )}
                {isAlert && (
                  <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 3, background: edgeBg, color: edgeColor, letterSpacing: '0.05em', border: `1px solid ${isOver ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)'}` }}>
                    {isOver ? 'OVER' : 'UNDER'}
                  </span>
                )}
              </div>
              {otherCalc && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: 8, color: 'var(--text-dim)', width: 92, textAlign: 'right', flexShrink: 0 }}>vs {otherCalc.line} ({BK_LABELS[otherCalc.bk] ?? otherCalc.bk})</span>
                  <span style={{
                    fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4,
                    background: otherCalc.isOver ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
                    color: otherCalc.isOver ? '#4ade80' : '#f87171',
                    border: `1px solid ${otherCalc.isOver ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
                  }}>
                    {otherCalc.isOver ? '▲' : '▼'} {Math.abs(otherCalc.edge)}%
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: otherCalc.bestP >= 90 ? (otherCalc.isOver ? '#4ade80' : '#f87171') : 'var(--text-dim)' }}>
                    {otherCalc.bestP}%
                  </span>
                </div>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>ligne N/D</span>
          )}
          <span style={{ fontSize: 9, color: 'var(--text-dim)', alignSelf: 'center' }}>{expanded ? '▴' : '▾'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '0.4rem', fontSize: 10, color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <span>{fixture.home.short} projeté : <b style={{ color: 'var(--text)' }}>{homeExpected}</b> pts</span>
            <span>{fixture.away.short} projeté : <b style={{ color: 'var(--text)' }}>{awayExpected}</b> pts</span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <span>Off. dom. : {details.homeOff} | Déf. fact. : ×{details.homeDefFactor}</span>
            <span>Off. ext. : {details.awayOff} | Déf. fact. : ×{details.awayDefFactor}</span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <span>Tendance Over L10 : {fixture.home.short} {details.ouTrend.homePct}% / {fixture.away.short} {details.ouTrend.awayPct}% → ×{details.ouTrend.factor}</span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <span>Pace : {fixture.home.short} {details.pace.homeTotal} / {fixture.away.short} {details.pace.awayTotal} → ×{details.pace.factor}</span>
            <span>Momentum L3 : {fixture.home.short} {details.momentum.homeRecent} / {fixture.away.short} {details.momentum.awayRecent} → ×{details.momentum.factor}</span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <span>Playoffs : ×{details.playoffs.val} ({details.playoffs.desc})</span>
            <span>Repos : ×{details.rest.combined}</span>
            {details.density.combined < 1 && <span>Densité : ×{details.density.combined}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function FactorBar({ name, val, desc }) {
  const pct = (val - 1) * 100;
  const isPos = pct >= 0.5;
  const isNeg = pct <= -0.5;
  const barW = Math.min(100, Math.abs(pct) * 5);
  return (
    <div className="pf-row">
      <span className="pf-name">{name}</span>
      <div className="pf-bar-wrap">
        <div className={`pf-bar ${isPos ? 'pf-bar--pos' : isNeg ? 'pf-bar--neg' : 'pf-bar--neu'}`}
          style={{ width: `${barW}%` }} />
      </div>
      <span className={`pf-pct ${isPos ? 'pos' : isNeg ? 'neg' : ''}`}>
        {fmtFactor(val)}
      </span>
      <span className="pf-desc">{desc}</span>
    </div>
  );
}

const VALUE_THRESHOLD = 5; // edge % minimum pour badge VALUE

function BetLine({ label, estimated, line, onChange }) {
  if (estimated == null) return null;
  const lineNum = parseFloat(line);
  const hasLine = !isNaN(lineNum) && lineNum > 0;
  const edge    = hasLine ? ((estimated - lineNum) / lineNum * 100) : null;
  const isOver  = edge != null && edge > 0;
  const isValue = edge != null && Math.abs(edge) >= VALUE_THRESHOLD;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0.5rem 0.3rem', background: 'rgba(255,255,255,0.03)', borderRadius: 5 }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', minWidth: 28 }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, minWidth: 32 }}>{estimated.toFixed(1)}</span>
      <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>vs</span>
      <input
        type="number" step="0.5" placeholder="—"
        value={line} onChange={e => onChange(e.target.value)}
        onClick={e => e.stopPropagation()}
        style={{ width: 44, padding: '0.15rem 0.3rem', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11, textAlign: 'center' }}
      />
      {hasLine && (
        <span style={{ fontSize: 10, fontWeight: 700, color: isOver ? '#4ade80' : '#f87171', minWidth: 52 }}>
          {isOver ? '▲' : '▼'} {Math.abs(edge).toFixed(1)}%
        </span>
      )}
      {isValue && (
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', padding: '0.1rem 0.35rem', borderRadius: 4, background: isOver ? 'rgba(74,222,128,0.18)' : 'rgba(248,113,113,0.18)', color: isOver ? '#4ade80' : '#f87171', border: `1px solid ${isOver ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)'}` }}>
          VALUE {isOver ? 'OVER' : 'UNDER'}
        </span>
      )}
    </div>
  );
}

// ── Analyse Props ─────────────────────────────────────────────────────────────

const ALERT_KEY = 'nba_prop_alerts';

function PropsSection({ fixture, homePlayers, awayPlayers, rosterLoading, isCompleted, projLineup, gameTotal, eventId, onClose, pinnacleH2H, showHomeOverride, onTeamChange, homeNames, awayNames, rankSlotRef, forceLegendOpen = false }) {
  const isWNBA = fixture?.league === 'wnba';
  const [showLegend, setShowLegend]      = useState(false);
  // Ouverte soit par son propre bouton "?", soit forcée par le "?" de la boîte cotes (onglet
  // Joueurs) — un seul état affiché, mais deux déclencheurs possibles.
  const legendOpen = showLegend || forceLegendOpen;
  const [legendBox, setLegendBox]         = useState(null); // { top, left }
  const propsCardRef = useRef(null);
  const propsHeaderRef = useRef(null);
  const legendRef = useRef(null);
  const legendBtnRef = useRef(null);
  const LEGEND_W = 252;
  // Ferme la légende au clic en dehors — sans bloquer le scroll/hover du reste de la page
  useEffect(() => {
    if (!legendOpen) return;
    const onDocClick = (e) => {
      if (legendRef.current?.contains(e.target) || legendBtnRef.current?.contains(e.target)) return;
      setShowLegend(false);
    };
    document.addEventListener('mousedown', onDocClick, true);
    return () => document.removeEventListener('mousedown', onDocClick, true);
  }, [legendOpen]);
  // Recalcule la position pendant que la légende est ouverte → elle suit la carte au scroll/resize
  useEffect(() => {
    if (!legendOpen) return;
    const update = () => {
      if (!propsCardRef.current) return;
      const r = propsCardRef.current.getBoundingClientRect();
      const hr = propsHeaderRef.current ? propsHeaderRef.current.getBoundingClientRect() : null;
      const top    = hr ? hr.bottom : r.top;
      const height = hr ? r.bottom - hr.bottom : undefined;
      const gutterCenter = r.right + (window.innerWidth - r.right) / 2;
      setLegendBox({ top, left: gutterCenter - LEGEND_W / 2, height });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [legendOpen]);
  const [showHome, setShowHome]         = useState(true);
  useEffect(() => { if (showHomeOverride != null) setShowHome(showHomeOverride); }, [showHomeOverride]);
  const [boxscore, setBoxscore]         = useState(null);
  const [boxscoreLoading, setBsLoading] = useState(false);
  const [schedules,     setSchedules]     = useState(null);
  const [gamelogs,      setGamelogs]      = useState({});
  const [seriesGamelogs, setSeriesGamelogs] = useState({}); // playerId → [entries PO]
  const [estimates,     setEstimates]     = useState({});
  const [snapshot,      setSnapshot]      = useState(null); // projections gelées pré-match
  const projFrozen = useRef(false);
  const snapshotMatch = useRef(new Map()); // playerId roster → entrée snapshot (direct ou fallback nom)
  const [snapshotChecked, setSnapshotChecked] = useState(false); // true dès que snapshot a répondu
  const [playerProps,   setPlayerProps]   = useState(null);
  const [probabilities, setProbabilities] = useState({});
  const [expandedId,  setExpandedId]  = useState(null);
  const [injuryData,  setInjuryData]  = useState({});

  // Classement ligue par catégorie — clic sur une stat projetée dans Analyse Props (22 juin 2026).
  // Seules NBA/WNBA/ACB ont un classement complet aujourd'hui (cf. /api/<ligue>/leaders) ; les
  // autres ligues EU affichent un message plutôt qu'un faux classement.
  const [rankPlayer,  setRankPlayer]  = useState(null);
  const [rankLeaders, setRankLeaders] = useState(null);
  const [rankLoading, setRankLoading] = useState(false);
  const LEADERS_LEAGUES = new Set(['nba', 'wnba', 'acb']);
  const lastRankTriggerRef = useRef(null); // { id, stat } de la dernière perf cliquée pour ouvrir le panneau
  async function openRankPanel(p, stat) {
    const last = lastRankTriggerRef.current;
    if (rankPlayer && last && String(last.id) === String(p.id) && last.stat === stat) {
      setRankPlayer(null);
      lastRankTriggerRef.current = null;
      return;
    }
    lastRankTriggerRef.current = { id: p.id, stat };
    setRankPlayer(p);
    if (!LEADERS_LEAGUES.has(fixture?.league)) { setRankLeaders(null); return; }
    if (rankLeaders?._league === fixture.league) return;
    setRankLoading(true);
    try {
      const d = await cachedFetch(`/api/${fixture.league}/leaders`, 6 * 3_600_000).catch(() => null);
      setRankLeaders(d ? { ...d, _league: fixture.league } : null);
    } catch { setRankLeaders(null); }
    setRankLoading(false);
  }
  const rankCardRef = useRef(null);
  useEffect(() => {
    if (!rankPlayer) return;
    const onDocClick = (e) => {
      if (rankCardRef.current?.contains(e.target)) return;
      // Un re-clic sur la perf déjà ouverte doit togglé-fermer via openRankPanel lui-même
      // (sinon ce listener la ferme au mousedown, puis le click qui suit la réouvre aussitôt).
      if (e.target.closest?.('.rank-trigger')) return;
      setRankPlayer(null);
      lastRankTriggerRef.current = null;
    };
    document.addEventListener('mousedown', onDocClick, true);
    return () => document.removeEventListener('mousedown', onDocClick, true);
  }, [rankPlayer]);
  // Lookup insensible à l'ordre des mots (api-sports.io n'est pas cohérent Prénom/Nom selon l'endpoint)
  const getInjury = name => {
    const key = Object.keys(injuryData).find(k => euNameEq(k, name));
    return key ? injuryData[key] : undefined;
  };

  // Charge les probabilités gelées (après le match)
  useEffect(() => {
    if (!isCompleted) return;
    try {
      const probKey = `prob_${fixture.id}`;
      const raw = localStorage.getItem(probKey);
      if (raw) setProbabilities(JSON.parse(raw));
    } catch {}
  }, [fixture.id, isCompleted]);

  // Charge les projections gelées depuis localStorage (tous les matchs)
  useEffect(() => {
    const key = `proj_${fixture.id}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const { estimates: cached, outIds } = parsed;
      const count = cached ? Object.keys(cached).length : 0;
      // Cache incomplet (une seule équipe) → on vide et on recalcule
      if (count < 8) { localStorage.removeItem(key); return; }
      // Cache sans outIds (antérieur au système de redistribution) → invalider pour recalcul propre
      if (!outIds) { localStorage.removeItem(key); return; }
      setEstimates(prev => { const m = { ...prev, ...cached }; return m; });
      projFrozen.current = true;
    } catch { localStorage.removeItem(key); }
  }, [fixture.id]);

  // Fetch snapshot projections backend — source de vérité pour tous les matchs
  useEffect(() => {
    if (fixture.league === 'euroleague') return;
    const isEuroLeagueSnap = EURO_LEAGUES_IDS.includes(fixture.league);
    // EU : utilise l'ID api-sports (fixture.id), NBA/WNBA : utilise eventId ESPN
    // NBA/WNBA : fixture.id = ESPN game ID (scoreboard) quand le match est live/à venir → fallback si eventId absent
    // (bballOdds ne renvoie pas eventId pour NBA → eventId est toujours null ; sans ce fallback le snapshot n'était jamais chargé)
    const snapId = isEuroLeagueSnap ? fixture.id : (eventId || fixture.id || null);
    if (!snapId) { setSnapshotChecked(true); return; } // pas de snapshot → libère immédiatement le calcul local
    const snapBase = isEuroLeagueSnap
      ? `/api/euro/${fixture.league}`
      : fixture.league === 'wnba' ? '/api/wnba' : '/api/nba';
    let cancelled = false;
    fetch(`${snapBase}/projections-snapshot/${snapId}`)
      .then(r => r.json())
      .then(d => {
        // Ignore une réponse arrivée en retard pour un autre match (ex: Game N-1 qui répond
        // après Game N) — sinon elle écrase le snapshot courant avec des cotes/% périmés
        // (bug observé : cote Unibet qui flickait entre la bonne valeur et celle d'un autre match)
        if (cancelled || !d.found) return;
        setSnapshot(d.players);
        // Si match terminé + probs dans snapshot → les charger directement
        if (isCompleted) {
          const loaded = {};
          for (const [id, p] of Object.entries(d.players)) {
            if (p.probs && Object.keys(p.probs).length) loaded[id] = p.probs;
          }
          if (Object.keys(loaded).length) setProbabilities(loaded);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSnapshotChecked(true); }); // libère le calcul local
    return () => { cancelled = true; };
  }, [fixture.id, eventId, isCompleted]);

  // Fetch boxscores des matchs précédents de la même série → gamelog playoff réel par joueur
  useEffect(() => {
    if (fixture.league === 'euroleague' || fixture.league === 'wnba') return;
    const teamShorts = [fixture.home.short, fixture.away.short]; // ['OKC', 'SAS'] — plus fiable que name
    const cutoff = Date.now() - 4 * 3600_000;
    const seriesDone = BBALL_FIXTURES.filter(f =>
      f.id !== fixture.id &&
      f.league === 'nba' &&
      teamShorts.includes(f.home.short) && teamShorts.includes(f.away.short) &&
      (f.round?.toLowerCase().includes('terminé') || new Date(f.date).getTime() < cutoff)
    ).sort((a, b) => new Date(b.date) - new Date(a.date)); // plus récent en premier

    if (!seriesDone.length) return;

    const ESPN_SHORT_NORM = { SA: 'SAS', NY: 'NYK', GS: 'GSW', NO: 'NOP', UT: 'UTA' };
    const norm = a => ESPN_SHORT_NORM[a?.toUpperCase()] || a?.toUpperCase() || '';

    Promise.all(
      seriesDone.map(f =>
        fetch(`/api/nba/boxscore?date=${encodeURIComponent(f.date)}&home=${f.home.short}&away=${f.away.short}`)
          .then(r => r.ok ? r.json() : null)
          .then(bs => ({ f, bs }))
          .catch(() => ({ f, bs: null }))
      )
    ).then(results => {
      const byPlayer = {}; // playerId → [gamelog entry, ...]
      for (const { f: gf, bs } of results) {
        if (!bs) continue;
        for (const [abbr, players] of Object.entries(bs)) {
          const isHome = norm(abbr) === norm(gf.home.short);
          const oppAbbr = isHome ? norm(gf.away.short) : norm(gf.home.short);
          for (const p of (players || [])) {
            if (!p.id || p.dnp) continue;
            const minVal = parseFloat(String(p.stats?.min || '0').split(':')[0]) || 0;
            if (minVal < 5 && (p.stats?.pts || 0) === 0) continue;
            const entry = {
              date: gf.date,
              pts:  p.stats?.pts  || 0,
              reb:  p.stats?.reb  || 0,
              ast:  p.stats?.ast  || 0,
              min:  minVal,
              to:   p.stats?.to   || 0,
              stl:  p.stats?.stl  || 0,
              blk:  p.stats?.blk  || 0,
              fgm: 0, fga: 0, ftm: 0, fta: 0, fg3m: 0, fg3a: 0,
              oreb: 0, dreb: 0, pf: 0, pm: 0, tsPct: null,
              opponentAbbr: oppAbbr,
              isHome,
            };
            const pid = String(p.id);
            if (!byPlayer[pid]) byPlayer[pid] = [];
            byPlayer[pid].push(entry);
          }
        }
      }
      setSeriesGamelogs(byPlayer);
    });
  }, [fixture.id]);

  // Fetch rapport de blessures (RotoWire injuries page + MAY NOT PLAY lineups).
  // Rafraîchi toutes les 5 min tant que le match n'est pas terminé — sinon un statut Q qui
  // se résout (ex: Caitlin Clark repassée disponible) reste figé dans Analyse Props tant que
  // l'utilisateur ne quitte pas et ne revient pas sur la page (16 juil. 2026).
  useEffect(() => {
    if (isCompleted || fixture.league === 'euroleague' || EURO_LEAGUES_IDS.includes(fixture.league)) return;
    const injBase = fixture.league === 'wnba' ? '/api/wnba' : '/api/nba';
    const url = `${injBase}/injuries`;
    // invalidateCache force un vrai fetch réseau à chaque tick — sinon le cache client (TTL 10 min,
    // partagé entre tous les composants qui appellent cette URL) sert la même réponse périmée à
    // chaque poll de 5 min, rendant l'auto-refresh inopérant (cas Caitlin Clark, 16 juil. 2026).
    const fetchInjuries = (fresh = false) => {
      if (fresh) invalidateCache(url);
      return cachedFetch(url, 10 * 60_000).then(d => setInjuryData(d || {})).catch(() => {});
    };
    fetchInjuries();
    const id = setInterval(() => fetchInjuries(true), 5 * 60_000);
    return () => clearInterval(id);
  }, [fixture.id, isCompleted]);

  // Compo EU confirmée (ACB/LNB/BBL) : joueur déclaré OUT au moment du remplacement — merge
  // dans injuryData pour réutiliser la redistribution déjà existante (même mécanisme que
  // NBA/WNBA, il manquait juste ce signal côté EU faute de flux blessures type RotoWire).
  useEffect(() => {
    const EU_OUT_BENCH_LEAGUES = ['acb', 'lnb', 'bbl'];
    if (isCompleted || !EU_OUT_BENCH_LEAGUES.includes(fixture.league) || !fixture.home?.id || !fixture.away?.id) return;
    Promise.all([
      cachedFetch(`/api/euro/${fixture.league}/team-lineup/${fixture.home.id}`, 5 * 60_000).catch(() => null),
      cachedFetch(`/api/euro/${fixture.league}/team-lineup/${fixture.away.id}`, 5 * 60_000).catch(() => null),
    ]).then(([homeRes, awayRes]) => {
      const out = {};
      for (const res of [homeRes, awayRes]) {
        if (!res?.confirmed || !res.outPlayers?.length) continue;
        if (res.date && Math.abs(new Date(res.date) - new Date(fixture.date)) > 3 * 86400_000) continue;
        for (const o of res.outPlayers) {
          if (o.status === 'out') out[o.name] = { status: 'Out' };
        }
      }
      if (Object.keys(out).length) setInjuryData(prev => ({ ...prev, ...out }));
    });
  }, [fixture.id]);

  // Fetch team schedules (pace / défense / repos)
  useEffect(() => {
    if (isCompleted) return;
    const EURO_L = ['acb','lnb','bbl','legaa'];
    if (EURO_L.includes(fixture.league)) {
      Promise.all([
        cachedFetch(`/api/euro/${fixture.league}/teamschedule/${fixture.home.id}`, 30 * 60_000).catch(() => ({ games: [] })),
        cachedFetch(`/api/euro/${fixture.league}/teamschedule/${fixture.away.id}`, 30 * 60_000).catch(() => ({ games: [] })),
      ]).then(([h, a]) => setSchedules({ home: h.games || [], away: a.games || [] }));
      return;
    }
    if (fixture.league === 'euroleague') {
      Promise.all([
        cachedFetch(`/api/euroleague/teamschedule/${fixture.home.short}`, 30 * 60_000).catch(() => ({ games: [] })),
        cachedFetch(`/api/euroleague/teamschedule/${fixture.away.short}`, 30 * 60_000).catch(() => ({ games: [] })),
      ]).then(([h, a]) => setSchedules({ home: h.games || [], away: a.games || [] }));
      return;
    }
    if (fixture.league === 'wnba') {
      const homeId = ESPN_WNBA[fixture.home.name];
      const awayId = ESPN_WNBA[fixture.away.name];
      if (!homeId || !awayId) { setSchedules({ home: [], away: [] }); return; }
      Promise.all([
        cachedFetch(`/api/wnba/teamschedule/${homeId}`, 300_000).catch(() => ({ games: [] })),
        cachedFetch(`/api/wnba/teamschedule/${awayId}`, 300_000).catch(() => ({ games: [] })),
      ]).then(([h, a]) => setSchedules({ home: h.games || [], away: a.games || [] }));
      return;
    }
    const homeId = ESPN_NBA[fixture.home.name];
    const awayId = ESPN_NBA[fixture.away.name];
    if (!homeId || !awayId) return;
    Promise.all([
      cachedFetch(`/api/nba/teamschedule/${homeId}`, 300_000).catch(() => ({ games: [] })),
      cachedFetch(`/api/nba/teamschedule/${awayId}`, 300_000).catch(() => ({ games: [] })),
    ]).then(([h, a]) => setSchedules({ home: h.games || [], away: a.games || [] }));
  }, [fixture.id]);

  // Fetch gamelogs pour l'équipe affichée (top 15 joueurs)
  useEffect(() => {
    if (isCompleted || !schedules) return;
    const players = showHome ? homePlayers : awayPlayers;
    if (!players?.length) return;
    const toFetch = players.slice(0, 15).filter(p => p.id && !(p.id in gamelogs));
    if (!toFetch.length) return;
    const EURO = ['acb','lnb','bbl','legaa'];
    const endpoint = fixture.league === 'euroleague'
      ? (id) => `/api/euroleague/playergamelog/${id}`
      : EURO.includes(fixture.league)
      ? (id) => `/api/euro/${fixture.league}/playergamelog/${id}`
      : fixture.league === 'wnba'
      ? (id) => `/api/wnba/playergamelog/${id}`
      : (id) => `/api/nba/playergamelog/${id}`;
    Promise.all(
      toFetch.map(p =>
        fetch(endpoint(p.id))
          .then(r => r.json())
          .then(d => [String(p.id), d.games || []])
          .catch(() => [String(p.id), []])
      )
    ).then(pairs => setGamelogs(prev => ({ ...prev, ...Object.fromEntries(pairs) })));
  }, [showHome, schedules, homePlayers, awayPlayers]);

  // Applique le snapshot backend — priorité absolue sur localStorage
  useEffect(() => {
    if (!snapshot) return;
    // IDs Bzzoiro instables (doublons/réassignations côté Bzzoiro) → fallback par nom,
    // contraint à l'équipe (team court du snapshot vs fixture.home/away.short) pour
    // éviter les collisions entre homonymes des deux équipes (ex: deux "Kameron Taylor").
    const normName = n => n?.toLowerCase().trim();
    const lastName = n => n?.split(' ').slice(-1)[0]?.toLowerCase();
    const snapEntries = Object.entries(snapshot);
    const next = {};
    const matchTeam = (players, teamShort) => {
      const pool = snapEntries.filter(([, s]) => s.team === teamShort);
      (players || []).forEach(p => {
        let s = snapshot[String(p.id)];
        if (!s) {
          const found = pool.find(([, sp]) => normName(sp.name) === normName(p.name))
                     || pool.find(([, sp]) => lastName(sp.name) === lastName(p.name));
          if (found) s = found[1];
        }
        if (s) {
          next[String(p.id)] = { pts: s.pts, reb: s.reb, ast: s.ast, tpm: s.tpm };
          snapshotMatch.current.set(String(p.id), s);
        }
      });
    };
    matchTeam(homePlayers, fixture.home?.short);
    matchTeam(awayPlayers, fixture.away?.short);
    if (Object.keys(next).length) {
      setEstimates(prev => ({ ...prev, ...next }));
      if (!isCompleted) projFrozen.current = true;
    }
  }, [snapshot, homePlayers, awayPlayers, isCompleted]);

  // Recalcule les estimations quand gamelogs ou schedules changent — attend que le snapshot ait répondu
  useEffect(() => {
    if (isCompleted || !schedules) return;
    if (!snapshotChecked) return; // attend que le snapshot backend ait répondu (évite la race condition)
    if (!homePlayers?.length && !awayPlayers?.length) return;
    const isEL        = fixture.league === 'euroleague';
    const isWNBA      = fixture.league === 'wnba';
    const isEuroProps = EURO_LEAGUES_IDS.includes(fixture.league);
    const euroCProps  = isEuroProps ? getEuroConst(fixture.league) : null;
    const scaleGames = (gs, factor) => gs.map(g => g.ptsScored != null
      ? { ...g, ptsScored: +(g.ptsScored * factor).toFixed(1), ptsAllowed: +(g.ptsAllowed * factor).toFixed(1) }
      : g);
    const scaleFactor = isEL ? EL_SCALE : isWNBA ? WNBA_SCALE : isEuroProps ? LEAGUE_AVG_PTS_ALLOWED / euroCProps.avg : 1;
    const homeGames = scaleFactor !== 1 ? scaleGames(schedules.home, scaleFactor) : schedules.home;
    const awayGames = scaleFactor !== 1 ? scaleGames(schedules.away, scaleFactor) : schedules.away;
    const ESPN_ABBR_NORM = { SAS: 'SA', NYK: 'NY', GSW: 'GS', NOP: 'NO', UTA: 'UT' };
    let homeImpliedProb = null;
    if (pinnacleH2H?.home && pinnacleH2H?.away && pinnacleH2H.home > 1 && pinnacleH2H.away > 1) {
      const rawH = 1 / pinnacleH2H.home;
      const rawA = 1 / pinnacleH2H.away;
      homeImpliedProb = rawH / (rawH + rawA);
    }
    // USG% si dispo (NBA), sinon MIN (WNBA), sinon PTS (EL) — proxy de la part de possession
    const getWeight = p => p.stats?.usg ?? p.stats?.min ?? p.stats?.pts ?? 0;

    // OUT players connus au moment du dernier gel (pour détecter les transitions Q→OUT)
    const projKey = `proj_${fixture.id}`;
    let frozenOutIds = new Set();
    try { frozenOutIds = new Set(JSON.parse(localStorage.getItem(projKey) || '{}').outIds || []); } catch {}

    const next = {};
    const outIdsToRemove = new Set(); // estimates à supprimer (joueurs passés OUT depuis le gel)

    // Exclut les joueurs présents dans les deux rosters pour éviter que leurs estimates s'écrasent
    const hIds = new Set((homePlayers || []).map(p => String(p.id)));
    const dedupAway = (awayPlayers || []).filter(p => !hIds.has(String(p.id)));
    for (const [players, isHome] of [[homePlayers, true], [dedupAway, false]]) {
      if (!players?.length) continue;

      // Identifie les OUT actuels pour cette équipe
      const teamOutIds = new Set(players.filter(p => {
        const inj = getInjury(p.name)?.status || p.injury;
        return inj === 'Out';
      }).map(p => String(p.id)));

      teamOutIds.forEach(id => outIdsToRemove.add(id));

      // Freeze : skip si aucun nouveau OUT et tous les actifs ont déjà une estimation
      const hasNewOut     = [...teamOutIds].some(id => !frozenOutIds.has(id));
      const activeIds     = players.filter(p => !teamOutIds.has(String(p.id))).map(p => String(p.id));
      const allActiveHave = activeIds.every(id => estimates[id]);
      if (projFrozen.current && !hasNewOut && allActiveHave) continue;

      // Redistribution USG : si un joueur clé est OUT, boost proportionnel des actifs
      // Exclut les OUT sans aucun match joué cette saison (absence déjà reflétée dans la baseline
      // des coéquipiers via gamelogs/EWA — redistribuer en plus double-compterait l'usage, cf. cas Collier)
      let outWeightSum = 0, activeWeightSum = 0;
      for (const p of players) {
        const inj = getInjury(p.name)?.status || p.injury;
        const w = getWeight(p);
        const pidW = String(p.id);
        const hasPlayedThisSeason = (gamelogs[pidW]?.length > 0) || (seriesGamelogs[pidW]?.length > 0);
        if (inj === 'Out' && hasPlayedThisSeason) outWeightSum += w;
        else if (inj !== 'Out' && w > 0) activeWeightSum += w;
      }
      const totalWeight = outWeightSum + activeWeightSum;
      const redistributionFactor = (totalWeight > 0 && outWeightSum / totalWeight > 0.10)
        ? Math.min(1.25, (activeWeightSum + outWeightSum) / activeWeightSum)
        : 1.0;

      const myGames  = isHome ? homeGames : awayGames;
      const oppGames = isHome ? awayGames : homeGames;
      const rawOpp   = isHome ? fixture.away.short : fixture.home.short;
      const oppAbbr  = (isEL || isEuroProps) ? rawOpp : (ESPN_ABBR_NORM[rawOpp] || rawOpp);
      const BZZ_LEAGUE_NAME_FE = { acb: 'Liga ACB', bbl: 'Germany BBL', legaa: 'Lega A Basket', lnb: 'Pro A' };
      const BZZ_EXTRA_LEAGUES  = { legaa: 'Euroleague' }; // EL teams (Venezia, Olimpia) have only EL logs in recent 20
      const leagueFilter = isEuroProps ? BZZ_LEAGUE_NAME_FE[fixture.league] : null;
      const leagueExtra  = isEuroProps ? BZZ_EXTRA_LEAGUES[fixture.league] : null;
      players.forEach((p, idx) => {
        if (!p.stats?.pts) return;
        const pidCheck = String(p.id);
        // Le snapshot backend est la source de vérité figée — ne jamais l'écraser par un recalcul local,
        // même quand un autre joueur de l'équipe force un recalcul global (sinon le chiffre affiché diverge du %, qui lui reste basé sur le snapshot)
        // snapshotMatch couvre aussi le fallback par nom (IDs Bzzoiro instables entre roster et snapshot)
        if (snapshotMatch.current.has(pidCheck)) return;
        const ext = getInjury(p.name);
        const ep  = ext ? { ...p, injury: ext.status, injuryReason: ext.reason } : p;
        if (ep.injury === 'Out' && idx < 5) return;
        const pid = String(p.id);
        const rawLog = [...(seriesGamelogs[pid] || []), ...(gamelogs[pid] || [])];
        const mergedGamelog = leagueFilter
          ? rawLog.filter(g => !g.league || g.league === leagueFilter || (leagueExtra && g.league === leagueExtra))
          : rawLog;
        const result = computeEstimate(ep, isHome, oppGames, myGames, mergedGamelog, oppAbbr, fixture.date, fixture.round, gameTotal ?? null, null, homeImpliedProb, redistributionFactor, isWNBA);
        if (result) next[pid] = result;
      });
    }
    if (!Object.keys(next).length && !outIdsToRemove.size) return;
    setEstimates(prev => {
      const merged = { ...prev, ...next };
      // Supprime les estimates des joueurs désormais OUT (transition Q→OUT)
      outIdsToRemove.forEach(id => delete merged[id]);
      if (!isCompleted && new Date(fixture.date).getTime() > Date.now()) {
        try {
          const existing     = JSON.parse(localStorage.getItem(projKey) || '{}').estimates || {};
          const existingNames = JSON.parse(localStorage.getItem(projKey) || '{}').byName || {};
          const allPlayers   = [...(homePlayers || []), ...(awayPlayers || [])];
          const allOutIds    = allPlayers
            .filter(p => (getInjury(p.name)?.status || p.injury) === 'Out')
            .map(p => String(p.id));
          const nextByName = {};
          allPlayers.forEach(p => { if (next[String(p.id)]) nextByName[p.name] = next[String(p.id)]; });
          localStorage.setItem(projKey, JSON.stringify({ ts: Date.now(), estimates: { ...existing, ...next }, byName: { ...existingNames, ...nextByName }, outIds: allOutIds }));
          projFrozen.current = true;
        } catch {}
      }
      return merged;
    });
  }, [gamelogs, seriesGamelogs, schedules, homePlayers, awayPlayers, pinnacleH2H, injuryData]);

  // Fetch lignes bookmaker (Pinnacle pts/reb/ast) — fallback Kambi si pas d'eventId
  // Pour les matchs terminés : localStorage d'abord, sinon API (backend sert le snapshot pré-tipoff)
  useEffect(() => {
    const lsKey = `lines_${fixture.id}`;
    if (isCompleted) {
      try {
        const raw = localStorage.getItem(lsKey);
        if (raw) { setPlayerProps(JSON.parse(raw)); return; }
      } catch {}
      // Pas de cache local → on appelle l'API qui sert le snapshot backend
    }
    const EURO_BBALL_LEAGUES = ['acb', 'lnb', 'bbl', 'legaa'];
    const league = fixture.league === 'euroleague' ? 'euroleague'
      : fixture.league === 'wnba' ? 'wnba'
      : EURO_BBALL_LEAGUES.includes(fixture.league) ? fixture.league
      : 'nba';
    const eid    = fixture.league === 'euroleague' || fixture.league === 'wnba' || EURO_BBALL_LEAGUES.includes(fixture.league) ? '' : (eventId || 'kambi');
    const url = `/api/basketball/player-props?league=${league}&home=${encodeURIComponent(fixture.home.name)}&away=${encodeURIComponent(fixture.away.name)}&date=${encodeURIComponent(fixture.date)}` + (eid ? `&eventId=${eid}` : '');
    fetch(url)
      .then(r => r.json())
      .then(d => {
        setPlayerProps(d);
        // Persiste les lignes pour les retrouver après le match
        if (d?.found) {
          try { localStorage.setItem(lsKey, JSON.stringify(d)); } catch {}
        }
      })
      .catch(() => setPlayerProps({ found: false }));
  }, [eventId, fixture.id, isCompleted]);

  // Calcule P(Over) / P(Under) pour chaque joueur affiché dès que estimates + gamelogs + props sont prêts
  useEffect(() => {
    if (isCompleted || !playerProps?.found || !Object.keys(estimates).length) return;
    if (!homePlayers?.length && !awayPlayers?.length) return;

    // Normalise : minuscules + supprime accents + supprime tout non-alpha
    const normStr = s => (s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z]/g, '');
    const nameMatch = (a, b) => {
      if (!a || !b) return false;
      const na = normStr(a), nb = normStr(b);
      if (na === nb) return true;
      // Compact full match : "DavidDeJulius" inclus dans "DavidMichaelDeJulius"
      const shorter = na.length <= nb.length ? na : nb;
      const longer  = na.length <= nb.length ? nb : na;
      if (shorter.length >= 5 && longer.includes(shorter)) return true;
      // Last word match
      const partsA = a.trim().split(/\s+/);
      const partsB = b.trim().split(/\s+/);
      const lastA = normStr(partsA[partsA.length - 1]);
      const lastB = normStr(partsB[partsB.length - 1]);
      const firstA = normStr(partsA[0].replace(/\.$/, ''));
      const firstB = normStr(partsB[0].replace(/\.$/, ''));
      // Noms de famille doivent correspondre (avec support noms composés ex: "DeJulius" ⊇ "Julius")
      const lastOk = lastA === lastB ||
        (lastA.length >= 4 && lastB.length >= 4 && (lastA.includes(lastB) || lastB.includes(lastA)));
      if (!lastOk) return false;
      if (!firstA || !firstB) return true;
      return firstA.startsWith(firstB) || firstB.startsWith(firstA) || firstA[0] === firstB[0];
    };
    const findProp = name => {
      const matches = Object.entries(playerProps.players || {}).filter(([n]) => nameMatch(n, name));
      if (!matches.length) return null;
      return matches.reduce((merged, [, bks]) => {
        for (const [bk, stats] of Object.entries(bks)) {
          if (!merged[bk]) merged[bk] = { ...stats };
          else for (const [k, v] of Object.entries(stats)) { if (v != null && merged[bk][k] == null) merged[bk][k] = v; }
        }
        return merged;
      }, {});
    };

    const next = {};
    [...(homePlayers || []), ...(awayPlayers || [])].forEach(p => {
      const est = estimates[String(p.id)];
      if (!est) return;
      const bks = findProp(p.name);
      if (!bks) return;
      const pid = String(p.id);
      const glogs = [...(seriesGamelogs[pid] || []), ...(gamelogs[pid] || [])];
      // Coefficient de variation des minutes → gonfle le std pour les joueurs à rotation variable
      const recentMins = glogs.slice(0, 8).map(g => g.min).filter(m => m > 0);
      const minCV = (() => {
        if (recentMins.length < 3) return 0;
        const mean = recentMins.reduce((s, v) => s + v, 0) / recentMins.length;
        if (mean < 1) return 0;
        const sd = Math.sqrt(recentMins.reduce((s, v) => s + (v - mean) ** 2, 0) / recentMins.length);
        return sd / mean;
      })();
      const minInflation = 1 + minCV * 0.8; // ex: CV=0.4 (role player) → ×1.32 ; CV=0.1 (titulaire) → ×1.08
      const prob = {};
      for (const stat of ['pts', 'reb', 'ast', 'tpm']) {
        // Pinnacle en priorité, sinon Unibet, sinon Betclic, sinon Winamax comme ligne de référence
        const pin = bks.pinnacle?.[stat];
        const ub  = bks.unibet?.[stat];
        const bc  = bks.betclic?.[stat];
        const wm  = bks.winamax?.[stat];
        const ref = pin?.line ? pin : ub?.line ? ub : bc?.line ? bc : wm?.line ? wm : null;
        if (!ref?.line || !est[stat]) continue;
        const dk = bks.draftkings?.[stat];
        // Source UNIQUE de vérité : si le backend a déjà figé un % pour ce joueur/stat dans son
        // snapshot (= celui qui décide des alertes), on l'utilise tel quel — % ET ligne — sans
        // jamais recalculer en parallèle. Une seule décision possible = plus de divergence
        // Analyse Props ↔ Alertes (cf. bug Anunoby 78% vs 66%, Fox/Citron/Clark figés vs live).
        // L'ancienne condition de tolérance sur la ligne (±0.01) faisait basculer entre % du
        // snapshot et % recalculé localement selon que la cote bookmaker avait micro-bougé —
        // exactement la source de la divergence. Le snapshot prime systématiquement s'il existe.
        const snapProb = snapshotMatch.current.get(String(p.id))?.probs?.[stat];
        if (snapProb) {
          prob[stat] = { pOver: snapProb.pOver, pUnder: snapProb.pUnder, line: snapProb.line, pinOver: pin?.over ?? null, pinUnder: pin?.under ?? null, dkOver: dk?.over ?? null, dkUnder: dk?.under ?? null, ubOver: ub?.over ?? null, ubUnder: ub?.under ?? null, ubLine: ub?.line ?? null, bcOver: bc?.over ?? null, bcUnder: bc?.under ?? null, bcLine: bc?.line ?? null, wmOver: wm?.over ?? null, wmUnder: wm?.under ?? null, wmLine: wm?.line ?? null, std: null };
          continue;
        }
        const rawStd = calcStd(glogs, stat);
        const fallbackStd = (!rawStd && isWNBA)
          ? (stat === 'pts' ? 6.0 : stat === 'reb' ? 2.5 : stat === 'tpm' ? 1.2 : 1.5)
          : null;
        const lastGameStr = snapshotMatch.current.get(String(p.id))?._lastGame;
        const daysSinceLast = lastGameStr ? (new Date(fixture.date) - new Date(lastGameStr)) / 86400000 : 0;
        const staleInflation = daysSinceLast > 5 ? 1 + Math.min(0.4, (daysSinceLast - 5) * 0.04) : 1;
        const std = rawStd != null ? rawStd * minInflation * staleInflation : fallbackStd;
        const threshold = Math.ceil(ref.line);
        const deviation = est.deviation?.[stat] ?? 0;
        const rawPOver  = probAtLeast(est[stat], std, threshold, stat, deviation);
        // Sanity check : projection >25% loin de la ligne → cap 75%
        const gap = Math.abs(est[stat] - ref.line) / ref.line;
        const sanityMax = gap > 0.25 ? 0.75 : 1.0;
        // Fix 1+6 : minutes très variables (CV>0.35) → toutes les stats pénalisées de 8%
        const minVarianceAdj = minCV > 0.35 ? -0.08 : 0;
        const pOver  = Math.max(0, Math.min(sanityMax, rawPOver) + minVarianceAdj);
        prob[stat] = { pOver: +pOver.toFixed(3), pUnder: +(1 - pOver).toFixed(3), line: ref.line, pinOver: pin?.over ?? null, pinUnder: pin?.under ?? null, dkOver: dk?.over ?? null, dkUnder: dk?.under ?? null, ubOver: ub?.over ?? null, ubUnder: ub?.under ?? null, ubLine: ub?.line ?? null, bcOver: bc?.over ?? null, bcUnder: bc?.under ?? null, bcLine: bc?.line ?? null, wmOver: wm?.over ?? null, wmUnder: wm?.under ?? null, wmLine: wm?.line ?? null, std };
      }
      if (Object.keys(prob).length) next[String(p.id)] = prob;
    });
    setProbabilities(prev => ({ ...prev, ...next }));
    // Gèle les probabilités dans localStorage pour les consulter après le match
    if (!isCompleted && Object.keys(next).length > 0) {
      try {
        const probKey = `prob_${fixture.id}`;
        const existing = JSON.parse(localStorage.getItem(probKey) || '{}');
        localStorage.setItem(probKey, JSON.stringify({ ...existing, ...next }));
      } catch {}
    }
  }, [estimates, playerProps, homePlayers, awayPlayers, gamelogs, seriesGamelogs, snapshot]);

  // Source UNIQUE de vérité pour les alertes : le backend (generateBackgroundAlerts,
  // cron 20min) est désormais le SEUL système qui décide "ceci est une alerte" — plus
  // de génération locale en parallèle ici. Avant ce changement, cette page recalculait
  // sa propre copie d'alertes à partir de `probabilities` (recomputée à chaque rendu),
  // ce qui produisait inévitablement des % et des décisions de déclenchement différents
  // de ceux du backend (cf. divergences Anunoby/Fox/Citron/Clark/Wembanyama — "Analyse
  // Props" et "Alertes" affichaient des chiffres différents pour le même pari, et
  // certaines alertes que le modèle backend validait n'apparaissaient jamais ici, ou
  // l'inverse). `syncBackgroundAlerts` (RunningPage/PlaceBetPage) synchronise et purge
  // déjà les entrées locales historiques (dédup par empreinte + orphan-purge) — les
  // anciennes alertes générées ici disparaîtront naturellement au prochain cycle.

  // Détecte les transitions Q→OUT sur les alertes pending de ce fixture
  useEffect(() => {
    if (!Object.keys(injuryData).length) return;
    try {
      const stored = JSON.parse(localStorage.getItem(ALERT_KEY) || '[]');
      let changed = false;
      for (const a of stored) {
        if (a.status !== 'pending') continue;
        if (a.homeTeam !== fixture.home.name && a.awayTeam !== fixture.away.name) continue;
        const currentStatus = getInjury(a.player)?.status;
        if (currentStatus === 'Out' && a.injury !== 'Out') {
          a.injuryAlert = { from: a.injury || 'Actif', at: Date.now() };
          a.injury = 'Out';
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem(ALERT_KEY, JSON.stringify(stored));
        window.dispatchEvent(new Event('nba_alerts_updated'));
      }
    } catch {}
  }, [injuryData]);

  useEffect(() => {
    if (!isCompleted) return;
    setBsLoading(true);
    const EURO_L2 = ['acb','lnb','bbl','legaa'];
    const bsBase = EURO_L2.includes(fixture.league) ? `/api/euro/${fixture.league}/boxscore` : fixture.league === 'euroleague' ? '/api/euroleague/boxscore' : fixture.league === 'wnba' ? '/api/wnba/boxscore' : '/api/nba/boxscore';
    const isEuroLeagueBS = EURO_L2.includes(fixture.league) || fixture.league === 'euroleague';
    const bsH = isEuroLeagueBS ? fixture.home.name : fixture.home.short;
    const bsA = isEuroLeagueBS ? fixture.away.name : fixture.away.short;
    fetch(`${bsBase}?date=${encodeURIComponent(fixture.date)}&home=${encodeURIComponent(bsH)}&away=${encodeURIComponent(bsA)}`)
      .then(r => r.json())
      .then(data => setBoxscore(data))
      .catch(() => setBoxscore({}))
      .finally(() => setBsLoading(false));
  }, [fixture.id, isCompleted]);

  // Exclut les joueurs présents dans les deux rosters (NBA/WNBA uniquement — Bzzoiro EU peut avoir des transferts légitimes)
  const isEuroProps = EURO_LEAGUES_IDS.includes(fixture.league) || fixture.league === 'euroleague';
  const homeIds  = new Set((homePlayers || []).map(p => String(p.id)));
  const cleanAway = isEuroProps
    ? (awayPlayers || [])
    : (awayPlayers || []).filter(p => !homeIds.has(String(p.id)));
  const players = showHome ? homePlayers : cleanAway;
  const team    = showHome ? fixture.home : fixture.away;

  const ESPN_SHORT = { SA: 'SAS', NY: 'NYK', GS: 'GSW', NO: 'NOP', UT: 'UTA' };
  const normalizeAbbr = a => ESPN_SHORT[a?.toUpperCase()] || a?.toUpperCase() || '';
  const teamAbbr = normalizeAbbr(team.short);
  const bsKey = boxscore ? (() => {
    const keys = Object.keys(boxscore).filter(k => !['gameId','status','homeScore','awayScore','found'].includes(k));
    return keys.find(k => normalizeAbbr(k) === teamAbbr)
      || keys.find(k => normalizeAbbr(k).startsWith(teamAbbr) || teamAbbr.startsWith(normalizeAbbr(k).slice(0,3)))
      || keys.find(k => normalizeAbbr(team.name||'').startsWith(normalizeAbbr(k).slice(0,4)) || normalizeAbbr(k).startsWith(normalizeAbbr(team.name||'').slice(0,4)))
      || teamAbbr;
  })() : teamAbbr;
  const realized = [...(boxscore?.[bsKey] || [])].sort((a, b) => b.stats.pts - a.stats.pts);
  const lastName = n => n?.split(' ').slice(-1)[0]?.toLowerCase();

  const isPlayerOut = p => (getInjury(p.name)?.status || p.injury) === 'Out';
  let startersSorted, benchSorted;
  if (isCompleted && realized.length > 0) {
    const starterIds = new Set(realized.filter(r => r.starter).map(r => String(r.id)));
    const actualStarters = (players || []).filter(p => starterIds.has(String(p.id)));
    const actualBench    = (players || []).filter(p => !starterIds.has(String(p.id)));
    startersSorted = [...actualStarters].sort((a, b) => ((b.stats?.min ?? b.stats?.pts ?? 0)) - ((a.stats?.min ?? a.stats?.pts ?? 0)));
    benchSorted    = [...actualBench].sort((a, b) => ((b.stats?.min ?? b.stats?.pts ?? 0)) - ((a.stats?.min ?? a.stats?.pts ?? 0)));
  } else {
    // Priorité 1 : noms du terrain (homeNames/awayNames) — interactifs via onAssign
    const currentNames = showHome ? homeNames : awayNames;
    const hasCurrentNames = currentNames?.some(n => n);
    if (hasCurrentNames) {
      const nameSet = new Set(currentNames.filter(Boolean).map(n => n.toLowerCase()));
      const lnSet   = new Set(currentNames.filter(Boolean).map(n => lastName(n)));
      const isCurrent = p => nameSet.has(p.name?.toLowerCase()) || lnSet.has(lastName(p.name));
      startersSorted = (players || []).filter(isCurrent).sort((a, b) => ((b.stats?.min ?? b.stats?.pts ?? 0)) - ((a.stats?.min ?? a.stats?.pts ?? 0)));
      benchSorted    = (players || []).filter(p => !isCurrent(p)).sort((a, b) => ((b.stats?.min ?? b.stats?.pts ?? 0)) - ((a.stats?.min ?? a.stats?.pts ?? 0)));
    } else {
      // Priorité 2 : projLineup.starters (source externe — ESPN, RotoWire, Bzzoiro…)
      const proj = projLineup?.starters?.[teamAbbr] ?? projLineup?.starters?.[team.short?.toUpperCase()];
      if (proj?.starters?.length) {
        const starterNames    = new Set(proj.starters.map(s => s.name?.toLowerCase()));
        const starterLastNames = new Set(proj.starters.map(s => lastName(s.name)));
        const isProj = p => starterNames.has(p.name?.toLowerCase()) || starterLastNames.has(lastName(p.name));
        startersSorted = (players || []).filter(isProj).sort((a, b) => ((b.stats?.min ?? b.stats?.pts ?? 0)) - ((a.stats?.min ?? a.stats?.pts ?? 0)));
        benchSorted    = (players || []).filter(p => !isProj(p)).sort((a, b) => ((b.stats?.min ?? b.stats?.pts ?? 0)) - ((a.stats?.min ?? a.stats?.pts ?? 0)));
      } else {
        // Priorité 3 : top-5 minutes (fallback)
        const available = (players || []).filter(p => !p.injury);
        const injured   = (players || []).filter(p => p.injury);
        const byMinFb = (a, b) => ((b.stats?.min ?? b.stats?.pts ?? 0)) - ((a.stats?.min ?? a.stats?.pts ?? 0));
        const availSorted = [...available].sort(byMinFb);
        startersSorted = availSorted.slice(0, 5);
        benchSorted    = [...availSorted.slice(5), ...injured].sort(byMinFb);
      }
    }
  }
  // Backfill titulaires (10 juillet 2026) — les priorités 1/2 (noms du terrain / projLineup externe)
  // désignent les titulaires habituelles sans savoir qui est blessée aujourd'hui ; les joueuses Out
  // étaient retirées de l'affichage tout en bas (filtre isPlayerOut) sans être remplacées par la
  // suivante du banc, faisant retomber le nombre de titulaires affichées sous 5 (cas réel : Kelsey
  // Plum + Cameron Brink Out chez LA Sparks → seulement 3 titulaires au lieu de 5).
  const outStarters = startersSorted.filter(isPlayerOut);
  if (outStarters.length) {
    const sortFn = (a, b) => ((b.stats?.min ?? b.stats?.pts ?? 0)) - ((a.stats?.min ?? a.stats?.pts ?? 0));
    const activeStarters = startersSorted.filter(p => !isPlayerOut(p));
    const activeBench = benchSorted.filter(p => !isPlayerOut(p));
    const promoted = activeBench.slice(0, outStarters.length);
    startersSorted = [...activeStarters, ...promoted].sort(sortFn);
    benchSorted = [...activeBench.slice(outStarters.length), ...outStarters].sort(sortFn);
  }
  const projected = [...startersSorted, { __separator: 'bench' }, ...benchSorted]
    .filter(p => p.__separator || !isPlayerOut(p));

  function TeamBtn({ home }) {
    const active = home ? showHome : !showHome;
    const t = home ? fixture.home : fixture.away;
    return (
      <button onClick={() => { setShowHome(home); onTeamChange?.(home); }} style={{
        padding: '0.25rem 0.65rem', borderRadius: 6, border: '1px solid',
        fontSize: 12, fontWeight: 700, cursor: 'pointer',
        background: active ? 'rgba(251,146,60,0.25)' : 'rgba(251,146,60,0.08)',
        color: active ? '#fb923c' : 'rgba(251,146,60,0.45)',
        borderColor: active ? 'rgba(251,146,60,0.5)' : 'rgba(251,146,60,0.2)',
      }}>{t.short}</button>
    );
  }

  const COL = '26px 1fr 36px 36px 36px 36px 8px 36px 36px 36px';
  const statStyle = (dim, green) => ({
    textAlign: 'right', fontSize: 12, fontWeight: dim ? 500 : 700,
    fontVariantNumeric: 'tabular-nums',
    color: green ? '#22c55e' : dim ? 'var(--text-dim)' : 'var(--text)',
  });

  return (
    <div ref={propsCardRef} className="detail-card props-card full-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.4rem', flexWrap: 'wrap', cursor: 'pointer' }} onClick={onClose}>
        <h2 className="card-title" style={{ margin: 0 }}>Analyse Props</h2>
        <span
          ref={legendBtnRef}
          onClick={(e) => { e.stopPropagation(); setShowLegend(v => !v); }}
          style={{
            width: 16, height: 16, borderRadius: '50%', fontSize: 10, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: legendOpen ? '#fb923c' : 'var(--text-dim)', border: `1px solid ${legendOpen ? 'rgba(251,146,60,0.5)' : 'var(--border)'}`, cursor: 'pointer',
          }}
        >?</span>
        {legendOpen && legendBox && createPortal(
          <div ref={legendRef} onClick={e => e.stopPropagation()} style={{
            position: 'fixed', top: legendBox.top, left: legendBox.left, zIndex: 200,
            width: LEGEND_W, maxWidth: 'calc(100vw - 2rem)',
            ...(legendBox.height ? { height: legendBox.height, overflowY: 'auto' } : {}),
            background: 'var(--bg-card, #11141c)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '0.6rem 0.65rem', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            <PropLegendCard league={fixture?.league} />
          </div>,
          document.body
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }} onClick={e => e.stopPropagation()} >
          <TeamBtn home={true} />
          <TeamBtn home={false} />
        </div>
      </div>

      {/* Panneau classement ligue — clic sur une stat projetée d'une joueuse (22 juin 2026).
          Inséré dans le flux de page (portail vers rankSlotRef, entre les chips et la boîte
          Odds) plutôt que flottant par-dessus — pousse le contenu du dessous, page scrollable. */}
      {rankPlayer && rankSlotRef?.current && createPortal(
        <>
          <style>{`@keyframes rankPanelReveal{0%{opacity:0;transform:scale(0.96)}100%{opacity:1;transform:scale(1)}}`}</style>
          <div
            ref={rankCardRef}
            style={{
              width: '100%', marginBottom: '0.5rem',
              background: 'rgba(0,6,20,0.97)', border: '1px solid rgba(96,165,250,0.15)',
              borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.8)', overflow: 'hidden',
              animation: 'rankPanelReveal 0.5s ease-out both',
            }}
          >
          <div style={{ padding: '8px 12px 6px', borderBottom: '1px solid rgba(96,165,250,0.1)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#60a5fa', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', flex: 1 }}>
              Classement — {rankPlayer.name}
            </span>
            <button onClick={() => { setRankPlayer(null); lastRankTriggerRef.current = null; }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
          </div>
          <div style={{ padding: 8 }}>
            {rankLoading ? (
              <div style={{ padding: '1.2rem', textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>CHARGEMENT...</div>
            ) : !rankLeaders ? (
              <div style={{ padding: '1.2rem', textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>Classement non disponible pour cette ligue</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[['pts', 'PTS', '#60a5fa'], ['reb', 'REB', '#4ade80'], ['ast', 'AST', '#fb923c'], ['tpm', '3PM', '#a78bfa']].map(([stat, label, color], ci) => {
                  const top5 = rankLeaders[stat] || [];
                  const full = rankLeaders.full?.[stat] || [];
                  const matchesPlayer = l => String(l.id) === String(rankPlayer.id) || (lastName(l.name) && lastName(l.name) === lastName(rankPlayer.name));
                  const top5Entry = top5.find(matchesPlayer);
                  const fullEntry = !top5Entry ? full.find(matchesPlayer) : null;
                  const headEntry = top5Entry || fullEntry;
                  const restRows = top5Entry ? top5.filter(l => l !== top5Entry) : top5;
                  const abbrevName = n => { const p = n.split(' '); return p.length > 1 ? p[0][0] + '. ' + p.slice(1).join(' ') : n; };
                  return (
                    <div key={stat} style={{
                      background: 'rgba(255,255,255,0.025)', border: `1px solid ${color}2a`,
                      borderRadius: 8, overflow: 'hidden', boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
                      animation: 'rankPanelReveal 0.6s ease-out both', animationDelay: `${ci * 0.12}s`,
                    }}>
                      <div style={{ padding: '6px 10px 4px', borderBottom: `1px solid ${color}22` }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color, fontFamily: 'monospace' }}>{label}</span>
                        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', marginLeft: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>match</span>
                      </div>
                      <div>
                        {headEntry && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: `1px solid ${color}33`, background: `${color}1a` }}>
                            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', width: 12, flexShrink: 0, textAlign: 'right' }}>{headEntry.rank}</span>
                            {headEntry.photo
                              ? <img src={headEntry.photo} alt="" width={24} height={24} style={{ borderRadius: '50%', objectFit: 'cover', border: `1px solid ${color}55`, flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
                              : <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 10, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{abbrevName(headEntry.name)}</div>
                              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>{headEntry.team}</div>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: 'monospace', flexShrink: 0 }}>{headEntry.displayValue ?? headEntry.value?.toFixed(1)}</div>
                          </div>
                        )}
                        {restRows.map((l, i) => (
                          <div key={l.id ?? l.rank} style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                            borderBottom: i < restRows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                          }}>
                            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', width: 12, flexShrink: 0, textAlign: 'right' }}>{l.rank}</span>
                            {l.photo && <img src={l.photo} alt="" width={24} height={24} style={{ borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.75)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{abbrevName(l.name)}</div>
                              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>{l.team}</div>
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', flexShrink: 0 }}>{l.displayValue}</div>
                          </div>
                        ))}
                        {!headEntry && (
                          <div style={{ padding: '6px 10px', fontSize: 8, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>Top 5 uniquement</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        </>,
        rankSlotRef.current
      )}

      {/* En-têtes de colonnes */}
      {/* Libellés de section */}
      <div style={{ display: 'grid', gridTemplateColumns: COL, gap: '0 0.25rem', padding: '0 0.5rem 0.85rem' }}>
        <div /><div />
        <div style={{ gridColumn: 'span 4', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', textAlign: 'center' }}>Projetées</div>
        <div />
        <div style={{ gridColumn: 'span 3', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: isCompleted ? '#22c55e' : 'var(--text-dim)', textAlign: 'center' }}>Réalisées</div>
      </div>
      <div ref={propsHeaderRef} style={{ display: 'grid', gridTemplateColumns: COL, gap: '0 0.25rem', padding: '0 0.5rem 0.35rem', borderBottom: '1px solid var(--border)' }}>
        <div /><div />
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', textAlign: 'right' }}>Pts</div>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', textAlign: 'right' }}>Rebs</div>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', textAlign: 'right' }}>Asst</div>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', textAlign: 'right' }}>3pts</div>
        <div />
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: isCompleted ? '#22c55e' : 'var(--text-dim)', textAlign: 'right' }}>Pts</div>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: isCompleted ? '#22c55e' : 'var(--text-dim)', textAlign: 'right' }}>Rebs</div>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: isCompleted ? '#22c55e' : 'var(--text-dim)', textAlign: 'right' }}>Asst</div>
      </div>

      {/* Liste unifiée */}
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {rosterLoading && <div className="rp-status">Chargement...</div>}
        {!rosterLoading && projected.map((p, i) => {
          if (p.__separator) return (
            <div key="sep-bench" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.5rem', margin: '0.25rem 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Remplaçants</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
          );

          const real = realized.find(r =>
            String(r.id) === String(p.id) ||
            r.name === p.name ||
            (lastName(r.name) === lastName(p.name) && lastName(p.name))
          );
          const hasProj = p.stats?.pts != null;
          const hasReal = isCompleted && !boxscoreLoading && real && !real.dnp;
          const isDNP   = isCompleted && !boxscoreLoading && real?.dnp;
          const est     = !isCompleted ? estimates[String(p.id)] : null;

          const isExpanded = !isCompleted && expandedId === String(p.id);

          return (
            <div key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div
              style={{ display: 'grid', gridTemplateColumns: COL, gap: '0 0.25rem', alignItems: 'center', padding: '0.25rem 0.5rem', cursor: !isCompleted ? 'pointer' : 'default', background: isExpanded ? 'rgba(255,255,255,0.04)' : 'transparent' }}
              onClick={() => !isCompleted && setExpandedId(prev => prev === String(p.id) ? null : String(p.id))}
            >
              <span className="props-pos">{p.position}</span>
              <span className="props-name" style={{ display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 0' }}>{p.name}</span>
                {/* Badge blessure (RotoWire ou ESPN) */}
                {(() => {
                  const inj = getInjury(p.name)?.status || p.injury;
                  if (!inj) return null;
                  const isOut = inj === 'Out';
                  const lbl   = isOut ? 'Out' : 'Q';
                  const c     = isOut ? '#ef4444' : '#fb923c';
                  const bg    = isOut ? 'rgba(239,68,68,0.15)' : 'rgba(251,146,60,0.15)';
                  const bc    = isOut ? 'rgba(239,68,68,0.4)'  : 'rgba(251,146,60,0.4)';
                  return <span style={{ flexShrink: 0, fontSize: 8, fontWeight: 800, padding: '1px 4px', borderRadius: 3, background: bg, color: c, border: `1px solid ${bc}` }}>{lbl}</span>;
                })()}
              </span>

              {/* Projeté — computeEstimate si dispo, sinon moyenne saison */}
              {[['pts', false], ['reb', false], ['ast', false], ['tpm', false]].map(([stat, dim]) => {
                const val = est ? est[stat]?.toFixed(1) : hasProj ? p.stats?.[stat]?.toFixed(1) : null;
                const sp = probabilities[String(p.id)]?.[stat] ?? null;
                const pO = sp?.pOver ?? 0, pU = sp?.pUnder ?? 0;
                const best = Math.max(pO, pU);
                const pct = Math.round(best * 100);
                const dir = pO >= pU ? '▲' : '▼';
                const show = sp && best >= 0.50;
                const pc = propConfColor(stat, fixture?.league, pct);
                return (
                  <div key={stat} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                    <span
                      className={val ? 'rank-trigger' : undefined}
                      style={{ ...statStyle(dim, false), ...(val ? { cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textDecorationColor: 'rgba(255,255,255,0.25)' } : {}) }}
                      onClick={e => { if (!val) return; e.stopPropagation(); openRankPanel(p, stat); }}
                      title={val ? 'Voir le classement ligue' : undefined}
                    >{val ?? '—'}</span>
                    {show && <span style={{ fontSize: 9, fontWeight: 800, color: pc, lineHeight: 1 }}>{dir}{pct}%</span>}
                  </div>
                );
              })}

              {/* Séparateur */}
              <div style={{ borderLeft: '1px solid var(--border)', height: '70%', alignSelf: 'center' }} />

              {/* Réalisé */}
              {boxscoreLoading ? (
                <><span style={statStyle(true, false)}>…</span><span style={statStyle(true, false)}>…</span><span style={statStyle(true, false)}>…</span></>
              ) : isDNP ? (
                <span style={{ gridColumn: 'span 3', fontSize: 10, color: 'var(--text-dim)', textAlign: 'right' }}>DNP</span>
              ) : hasReal ? (
                <>
                  <span style={statStyle(false, true)}>{real.stats.pts}</span>
                  <span style={statStyle(true,  false)}>{real.stats.reb}</span>
                  <span style={statStyle(true,  false)}>{real.stats.ast}</span>
                </>
              ) : (
                <><span style={statStyle(true, false)}>—</span><span style={statStyle(true, false)}>—</span><span style={statStyle(true, false)}>—</span></>
              )}
            </div>
            {isExpanded && est && (() => {
              const prob  = probabilities[String(p.id)];
              const glogs = gamelogs[String(p.id)] || [];
              const validG = glogs.filter(g => g.min > 5).slice(0, 10);
              const floor  = validG.length ? { pts: Math.min(...validG.map(g => g.pts)), reb: Math.min(...validG.map(g => g.reb ?? 0)), ast: Math.min(...validG.map(g => g.ast ?? 0)) } : null;
              const ceil   = validG.length ? { pts: Math.max(...validG.map(g => g.pts)), reb: Math.max(...validG.map(g => g.reb ?? 0)), ast: Math.max(...validG.map(g => g.ast ?? 0)) } : null;
              return (
                <div style={{ padding: '0.2rem 0.5rem 0.6rem', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  {/* Résumé probabilité par stat */}
                  {prob && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem', marginTop: '0.25rem' }}>
                      {[['pts', 'Pts'], ['reb', 'Rebs'], ['ast', 'Asst']].map(([stat, lbl]) => {
                        const d = prob[stat];
                        if (!d) return null;
                        const isOver = d.pOver >= d.pUnder;
                        const bestP  = Math.round(Math.max(d.pOver, d.pUnder) * 100);
                        const odds   = isOver ? d.pinOver : d.pinUnder;
                        const color  = bestP >= 75 ? '#4ade80' : bestP >= 60 ? '#facc15' : 'var(--text-dim)';
                        const bg     = bestP >= 75 ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)';
                        const border = bestP >= 75 ? 'rgba(74,222,128,0.3)' : 'var(--border)';
                        return (
                          <div key={stat} style={{ padding: '0.2rem 0.45rem', borderRadius: 5, background: bg, border: `1px solid ${border}`, minWidth: 68 }}>
                            <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)' }}>
                              {lbl} {isOver ? '▲' : '▼'} {d.line}
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 800, color, lineHeight: 1.2 }}>{bestP}%</div>
                            {odds && <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>@{odds.toFixed(2)} Pin</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Floor / Ceiling L10 */}
                  {floor && ceil && (
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.4rem', fontSize: 10, color: 'var(--text-dim)' }}>
                      <span>Floor L10 — <b style={{ color: '#f87171' }}>{floor.pts}pts / {floor.reb}reb / {floor.ast}ast</b></span>
                      <span>·</span>
                      <span>Ceiling — <b style={{ color: '#4ade80' }}>{ceil.pts}pts / {ceil.reb}reb / {ceil.ast}ast</b></span>
                    </div>
                  )}
                  {/* Facteurs du modèle */}
                  {est.factors?.length > 0 && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      {est.factors.filter(f => Math.abs(f.val - 1) >= 0.01).map(f => (
                        <FactorBar key={f.name} name={f.name} val={f.val} desc={f.desc} />
                      ))}
                    </div>
                  )}
                  {/* Barres de distribution */}
                  <ProbabilityBars estimate={est.pts} std={prob?.pts?.std ?? calcStd(glogs, 'pts')} label="Points" step={5} bookmakerLine={prob?.pts?.line} stat="pts" />
                  {est.reb != null && <ProbabilityBars estimate={est.reb} std={prob?.reb?.std ?? calcStd(glogs, 'reb')} label="Rebonds" step={2} bookmakerLine={prob?.reb?.line} stat="reb" />}
                  {est.ast != null && <ProbabilityBars estimate={est.ast} std={prob?.ast?.std ?? calcStd(glogs, 'ast')} label="Passes" step={2} bookmakerLine={prob?.ast?.line} stat="ast" />}
                </div>
              );
            })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Bookmakers ────────────────────────────────────────────────────────────────

const BK_LABELS  = { pinnacle: 'Pinnacle', betfair: 'Betfair', unibet: 'Unibet', betclic: 'Betclic' };
const BK_COLORS  = { unibet: '#1db954', betclic: '#e0292e' };
const BK_ORDER   = ['pinnacle', 'unibet', 'betclic', 'betfair'];

// EdgeBadge / OddsCell : importés de ../components/OddsCell (source unique avec MatchDetailPage
// depuis le 22 juin 2026, voir ce fichier pour le détail).

function OddsCard({ odds, home, away, league, homePlayers, awayPlayers, onRefresh, refreshing, defaultTab = 'all', gameTotalEstimate = null, resultEstimate = null, gameSpreadEstimate = null, fixture = null, onTabChange = null, onTeamChange = null, showHomeOverride = null, eventId = null, onLegendToggle = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isEL = league === 'euroleague';
  const [tab, setTab] = useState(defaultTab);
  const switchTab = (id) => { setTab(id); onTabChange?.(id); };
  // Mini popup "Vs Pinnacle" au clic sur une issue du widget Modèle 1X2 (25 juin 2026) — même
  // mécanique que FootballOddsBox (MatchDetailPage) : 'click' bubble + stopPropagation sur le
  // libellé, pas 'mousedown'/capture, pour éviter une course entre ouverture et fermeture.
  const [edgePopupKey, setEdgePopupKey] = useState(null);
  const edgePopupRef = useRef(null);
  useEffect(() => {
    if (!edgePopupKey) return;
    const onDocClick = (e) => { if (!edgePopupRef.current?.contains(e.target)) setEdgePopupKey(null); };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [edgePopupKey]);
  useEffect(() => { setEdgePopupKey(null); }, [tab]);
  const [playerProps, setPlayerProps] = useState(null);
  const [propsLoading, setPropsLoading] = useState(false);
  const [showHome, setShowHome] = useState(true);
  useEffect(() => { if (showHomeOverride != null) setShowHome(showHomeOverride); }, [showHomeOverride]);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [propStat, setPropStat] = useState('pts');
  const [showOddsLegend, setShowOddsLegend] = useState(false);
  // Sur l'onglet Joueurs, ce "?" doit aussi ouvrir la légende Analyse Props (composant frère,
  // hors de cet arbre) — le parent la contrôle via forceLegendOpen, prévenu ici de chaque bascule.
  useEffect(() => { onLegendToggle?.(showOddsLegend); }, [showOddsLegend]);
  const [oddsLegendBox, setOddsLegendBox] = useState(null);
  const oddsLegendRef = useRef(null);
  const oddsLegendBtnRef = useRef(null);
  const ODDS_LEGEND_W = 252;
  useEffect(() => {
    if (!showOddsLegend) return;
    const onDown = (e) => {
      if (oddsLegendRef.current?.contains(e.target) || oddsLegendBtnRef.current?.contains(e.target)) return;
      setShowOddsLegend(false);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [showOddsLegend]);
  useEffect(() => {
    if (!showOddsLegend) return;
    const update = () => {
      if (!oddsCardRef.current || !oddsLegendBtnRef.current) return;
      const r = oddsCardRef.current.getBoundingClientRect();
      // Aligné sur le bouton "?" lui-même (même onglet que la boîte Odds), pas le haut de toute
      // la carte — le bouton est dans la même ligne que les onglets Résultat/Points/Écart H2H.
      const btnR = oddsLegendBtnRef.current.getBoundingClientRect();
      const gutterCenter = r.right + (window.innerWidth - r.right) / 2;
      setOddsLegendBox({ top: btnR.top, left: gutterCenter - ODDS_LEGEND_W / 2 });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [showOddsLegend]);

  async function fetchPlayerProps(force = false) {
    if (propsLoading) return;
    setPropsLoading(true);
    const _propsFetchStart = force ? Date.now() : null;
    const propsKey = `eu_props_${fixture?.id}`;
    const isEU = ['acb','lnb','bbl','legaa','euroleague'].includes(league);
    const isMatchDone = fixture?.status === 'STATUS_FINAL';

    // EU + terminé + pas de refresh forcé → servir depuis localStorage si dispo
    if (isEU && isMatchDone && !force) {
      try {
        const saved = JSON.parse(localStorage.getItem(propsKey) || 'null');
        if (saved?.found) { setPlayerProps(saved); setPropsLoading(false); return; }
      } catch {}
    }

    try {
      const propsUrl = `/api/basketball/player-props?league=${league || 'nba'}&home=${encodeURIComponent(home.name)}&away=${encodeURIComponent(away.name)}&date=${encodeURIComponent(fixture?.date || '')}${force ? '&refresh=1' : ''}`;
      const d = await fetch(propsUrl).then(r => r.json());

      // Sauvegarder les lignes avant le match pour les ligues EU
      if (isEU && d?.found) {
        try { localStorage.setItem(propsKey, JSON.stringify(d)); } catch {}
      }

      // EU + terminé + API vide → fallback localStorage
      if (isEU && isMatchDone && !d?.found) {
        try {
          const saved = JSON.parse(localStorage.getItem(propsKey) || 'null');
          if (saved?.found) { setPlayerProps(saved); setPropsLoading(false); return; }
        } catch {}
      }

      setPlayerProps(d);
      if (force) {
        setLastRefreshed(new Date());
        if (d?.found) {
          try {
            const ALERT_KEY = 'nba_prop_alerts';
            const stored = JSON.parse(localStorage.getItem(ALERT_KEY) || '[]');
            const lname = n => n?.split(' ').slice(-1)[0]?.toLowerCase();
            let changed = false;
            for (const a of stored) {
              if (a.stat !== 'pts') continue;
              if (a.eventId !== eventId && !(a.homeTeam === home.name && a.awayTeam === away.name)) continue;
              const entry = Object.entries(d.players || {}).find(([n]) =>
                n === a.player || n.toLowerCase() === a.player.toLowerCase() || lname(n) === lname(a.player)
              );
              const ubPts = entry?.[1]?.unibet?.pts;
              const wmPts = entry?.[1]?.winamax?.pts;
              if (!ubPts?.over && !wmPts?.over) continue;
              if (ubPts?.over) { a.unibetOdds = ubPts.over; a.unibetLine = ubPts.line; }
              if (wmPts?.over) { a.winamaxOdds = wmPts.over; a.winamaxLine = wmPts.line; }
              a.lastEnriched = Date.now();
              changed = true;
            }
            if (changed) localStorage.setItem(ALERT_KEY, JSON.stringify(stored));
          } catch {}
        }
      }
    } catch {
      setPlayerProps({ found: false });
    } finally {
      const remaining = _propsFetchStart ? 500 - (Date.now() - _propsFetchStart) : 0;
      setTimeout(() => setPropsLoading(false), Math.max(0, remaining));
    }
  }

  // Auto-refresh props toutes les 3 min quand onglet Joueurs actif + match pas terminé
  useEffect(() => {
    const isMatchDone = fixture?.status === 'STATUS_FINAL';
    if (tab !== 'joueurs' || isMatchDone || !playerProps) return;
    const id = setInterval(() => fetchPlayerProps(true), 3 * 60 * 1000);
    return () => clearInterval(id);
  }, [tab, fixture?.id, fixture?.status, !!playerProps]);

  useEffect(() => {
    if ((defaultTab === 'joueurs' || isEL) && playerProps === null) fetchPlayerProps();
  }, []);

  const h2h = odds?.markets?.h2h;
  const tot = odds?.markets?.totals;
  const ew  = odds?.markets?.earlywin;
  const spread = odds?.markets?.spread;
  const availBks = BK_ORDER.filter(bk => h2h?.bookmakers?.[bk] || tot?.bookmakers?.[bk] || spread?.bookmakers?.[bk]);

  // Edge Unibet/Betclic vs Pinnacle (25 juin 2026) — h2h?.fairProb / tot?.fairProb / h?.edgeHome
  // etc. lus plus bas dans OddsCell n'étaient en fait jamais assignés nulle part (vérifié) ; calculé
  // ici, même principe que MatchDetailPage (foot) mais 2 voies seulement (pas de nul en basket).
  const fairH2H = h2h?.bookmakers?.pinnacle?.home && h2h?.bookmakers?.pinnacle?.away ? (() => {
    const p = h2h.bookmakers.pinnacle;
    const s = 1 / p.home + 1 / p.away;
    return { home: (1 / p.home) / s, away: (1 / p.away) / s };
  })() : null;
  const calcEdge = (bkOdds, fair) => (bkOdds != null && fair != null) ? +((bkOdds * fair - 1) * 100).toFixed(1) : null;

  // Pour EL : si l'onglet actif n'a pas de données scrappées, basculer sur Joueurs
  useEffect(() => {
    if (!isEL) return;
    if ((tab === 'all' || tab === 'points') && availBks.length === 0) setTab('joueurs');
  }, [availBks.length]);

  if (!odds?.found && !isEL) return null;


  const COLS = '80px 1fr 1fr 8px 44px 1fr 1fr';
  const COLS_H2H = '80px 1fr 1fr';
  const COLS_TOT = '80px 44px 1fr 1fr';
  const ch = { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', textAlign: 'center', letterSpacing: '0.05em' };
  const sep = { borderLeft: '1px solid var(--border)', height: '70%', alignSelf: 'center' };

  const TABS = [{ id: 'all', label: 'Résultat' }, { id: 'points', label: 'Points' }, { id: 'handicap', label: 'Écart H2H' }, { id: 'joueurs', label: 'Joueurs' }];

  const tabStyle = (id) => ({
    padding: '0.25rem 0.75rem', borderRadius: 5, border: '1px solid', cursor: 'pointer',
    fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
    background: tab === id ? 'rgba(251,146,60,0.25)' : 'rgba(251,146,60,0.08)',
    color: '#ffffff',
    borderColor: tab === id ? 'rgba(251,146,60,0.55)' : 'rgba(251,146,60,0.22)',
    boxShadow: '0 0 0 1px rgba(255,255,255,0.22)',
    transition: 'background 0.15s, border-color 0.15s',
  });

  const showH2H = tab === 'all';
  const showTot = tab === 'all' || tab === 'points';

  const cols = tab === 'all' ? COLS : (tab === 'points' || tab === 'handicap') ? COLS_TOT : COLS_H2H;

  const oddsCardRef = useRef(null);

  return (
    <div ref={oddsCardRef}>
      {/* Catégories + toggle équipe + refresh */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t.id} style={tabStyle(t.id)}
            onClick={() => { switchTab(t.id); if (t.id === 'joueurs' && playerProps === null) fetchPlayerProps(); }}>
            {t.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <button onClick={() => {
                if (tab === 'joueurs') { setPlayerProps(null); fetchPlayerProps(true); }
                else { onRefresh(); setLastRefreshed(new Date()); }
              }}
              disabled={tab === 'joueurs' ? propsLoading : refreshing}
              className={`icon-refresh-btn${(tab === 'joueurs' ? propsLoading : refreshing) ? ' spinning' : ''}`}
              title="Rafraîchir">
              ↻
            </button>
            <span
              ref={oddsLegendBtnRef}
              onClick={() => setShowOddsLegend(v => !v)}
              style={{
                width: 16, height: 16, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: showOddsLegend ? '#fb923c' : 'var(--text-dim)',
                border: `1px solid ${showOddsLegend ? 'rgba(251,146,60,0.5)' : 'var(--border)'}`,
                cursor: 'pointer', flexShrink: 0,
              }}
            >?</span>
            {showOddsLegend && oddsLegendBox && createPortal(
              <div ref={oddsLegendRef} style={{
                position: 'fixed', top: oddsLegendBox.top, left: oddsLegendBox.left, zIndex: 200,
                width: ODDS_LEGEND_W, maxWidth: 'calc(100vw - 2rem)',
                background: 'var(--bg-card, #11141c)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '0.6rem 0.65rem', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                <OddsLegendCard tab={tab} />
              </div>,
              document.body
            )}
          </div>
          {lastRefreshed && (
            <div style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'right' }}>
              {lastRefreshed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          {tab === 'joueurs' && (
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              {[{ isHome: true, team: home }, { isHome: false, team: away }].map(({ isHome, team }) => (
                <button key={team.short} onClick={() => { setShowHome(isHome); onTeamChange?.(isHome); }} style={{
                  padding: '0.18rem 0.55rem', borderRadius: 5, border: '1px solid',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: showHome === isHome ? 'var(--accent)' : 'transparent',
                  color: showHome === isHome ? '#fff' : 'var(--text-dim)',
                  borderColor: showHome === isHome ? 'var(--accent)' : 'var(--border)',
                }}>{team.short}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* En-têtes colonnes */}
      {tab === 'all' && (
        <div style={{ display: 'grid', gridTemplateColumns: COLS_H2H, gap: '0 0.25rem', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border)', marginBottom: '0.2rem' }}>
          <div />
          <div style={{ ...ch, paddingLeft: '0.7cm' }}><span style={{ color: 'var(--text)' }}>{home.short}</span> <span style={{ fontWeight: 400, marginLeft: '0.2cm' }}>dom.</span></div>
          <div style={{ ...ch, paddingLeft: '0.7cm' }}><span style={{ color: 'var(--text)' }}>{away.short}</span> <span style={{ fontWeight: 400, marginLeft: '0.2cm' }}>ext.</span></div>
        </div>
      )}
      {tab === 'points' && (
        <div style={{ display: 'grid', gridTemplateColumns: COLS_TOT, gap: '0 0.25rem', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border)', marginBottom: '0.2rem' }}>
          <div />
          <div style={ch}>Total</div>
          <div style={ch}>Over</div>
          <div style={ch}>Under</div>
        </div>
      )}
      {tab === 'handicap' && (
        <div style={{ display: 'grid', gridTemplateColumns: COLS_TOT, gap: '0 0.25rem', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border)', marginBottom: '0.2rem' }}>
          <div />
          <div style={ch}>Écart</div>
          <div style={ch}>{home.short}</div>
          <div style={ch}>{away.short}</div>
        </div>
      )}

      {tab === 'joueurs' && (() => {
        const lastName = n => n?.split(' ').slice(-1)[0]?.toLowerCase();
        const teamPlayers = showHome ? (homePlayers || []) : (awayPlayers || []);
        const teamNames   = new Set(teamPlayers.flatMap(p => [p.name?.toLowerCase(), lastName(p.name)]));
        const inTeam = name => teamNames.has(name?.toLowerCase()) || teamNames.has(lastName(name));

        const STAT_TABS = [{ id: 'pts', label: 'Pts' }, { id: 'reb', label: 'Reb' }, { id: 'ast', label: 'Ast' }, { id: 'tpm', label: '3pts' }];

        const normName = n => (n || '').toLowerCase().replace(/[.\-_]/g, ' ').replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, ' ');
        const allEntries = playerProps?.players ? Object.entries(playerProps.players) : [];
        // Déduplique les entrées avec le même nom normalisé
        const mergedMap = {};
        for (const [name, bks] of allEntries) {
          const key = normName(name);
          if (!mergedMap[key]) mergedMap[key] = [name, {}];
          const merged = mergedMap[key][1];
          for (const [bk, stats] of Object.entries(bks)) {
            if (!merged[bk]) merged[bk] = stats;
            else {
              for (const [stat, val] of Object.entries(stats)) {
                if (val != null && merged[bk][stat] == null) merged[bk][stat] = val;
              }
            }
          }
        }
        // Score de correspondance nom ↔ roster (plus élevé = meilleur match)
        const matchScore = (propsName, rosterName) => {
          const pn = normName(propsName), rn = normName(rosterName);
          if (pn === rn) return 10;
          const pLast = pn.split(' ').slice(-1)[0], rLast = rn.split(' ').slice(-1)[0];
          if (pLast === rLast && pLast.length > 2) return 5;
          const words = pn.split(/\s+/).filter(w => w.length > 3);
          return words.some(w => rn.includes(w)) ? 2 : 0;
        };
        const bestScore = (name, roster) => Math.max(0, ...(roster || []).map(p => matchScore(name, p.name || '')));

        // Assignation exclusive : chaque joueur va dans l'équipe où son nom matche le mieux
        const assignTeam = name => {
          const hScore = bestScore(name, homePlayers);
          const aScore = bestScore(name, awayPlayers);
          if (hScore === 0 && aScore === 0) return null;
          return hScore >= aScore ? 'home' : 'away';
        };

        const isEuroLeagueProps = ['acb','lnb','bbl','legaa','euroleague'].includes(league);
        const entries = Object.values(mergedMap)
          .filter(([name]) => {
            if (!playerProps?.found) return true;
            // Backend teamMap (EU leagues) — source la plus fiable
            if (isEuroLeagueProps && playerProps?.teamMap) {
              const t = playerProps.teamMap[name];
              if (t) return t === (showHome ? 'home' : 'away');
              return true; // pas dans teamMap → afficher dans les deux vues
            }
            // NBA/WNBA : assignTeam via rosters ESPN
            const bothRostersLoaded = (homePlayers?.length > 0) && (awayPlayers?.length > 0);
            if (bothRostersLoaded) {
              const t = assignTeam(name);
              if (t !== null) return t === (showHome ? 'home' : 'away');
              return true;
            }
            if (teamPlayers.length === 0) return true;
            return bestScore(name, teamPlayers) > 0;
          })
          .sort((a, b) => {
            const line = d => d[1].unibet?.[propStat]?.line ?? d[1].betclic?.[propStat]?.line ?? 0;
            return line(b) - line(a);
          });

        return (
          <div>
            {(propsLoading || playerProps === null) && (
              <div style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--text-dim)', fontSize: 12 }}>Chargement…</div>
            )}
            {!propsLoading && playerProps !== null && !playerProps.found && (
              <div style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--text-dim)', fontSize: 12 }}>Cotes joueurs indisponibles</div>
            )}
            {!propsLoading && playerProps?.found && (
              <>
                {/* Stat selector */}
                <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem' }}>
                  {STAT_TABS.map(t => (
                    <button key={t.id} onClick={() => setPropStat(t.id)} style={{
                      padding: '0.15rem 0.55rem', borderRadius: 4, border: '1px solid',
                      fontSize: 10, fontWeight: 700, cursor: 'pointer',
                      background: propStat === t.id ? 'rgba(251,146,60,0.25)' : 'transparent',
                      color: '#ffffff',
                      borderColor: propStat === t.id ? 'rgba(251,146,60,0.55)' : 'rgba(255,255,255,0.15)',
                    }}>{t.label}</button>
                  ))}
                </div>
                {/* Headers */}
                {(() => {
                  const hasPinn = Object.values(playerProps?.players || {}).some(bks => bks.pinnacle != null);
                  const cols = hasPinn ? '1fr 34px 76px 8px 34px 76px 8px 34px 76px' : '1fr 34px 76px 8px 34px 76px';
                  return (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '0 0.2rem', paddingBottom: '0.15rem', marginBottom: '0.1rem' }}>
                        <div />
                        <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', color: '#1db954', textAlign: 'center', letterSpacing: '0.05em', gridColumn: '2 / 4' }}>Unibet</div>
                        <div />
                        <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', color: '#e0292e', textAlign: 'center', letterSpacing: '0.05em', gridColumn: '5 / 7' }}>Betclic</div>
                        {hasPinn && <><div /><div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', color: '#60a5fa', textAlign: 'center', letterSpacing: '0.05em', gridColumn: '8 / 10' }}>Pinnacle</div></>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '0 0.2rem', paddingBottom: '0.25rem', borderBottom: '1px solid var(--border)', marginBottom: '0.2rem' }}>
                        <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.05em' }}>Joueur</div>
                        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>Ligne</div>
                        <div style={{ fontSize: 8, textAlign: 'center' }}><span style={{ color: '#4ade80' }}>↑</span><span style={{ color: 'var(--text-dim)', margin: '0 2px' }}>/</span><span style={{ color: '#ef4444' }}>↓</span></div>
                        <div />
                        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>Ligne</div>
                        <div style={{ fontSize: 8, textAlign: 'center' }}><span style={{ color: '#4ade80' }}>↑</span><span style={{ color: 'var(--text-dim)', margin: '0 2px' }}>/</span><span style={{ color: '#ef4444' }}>↓</span></div>
                        {hasPinn && <>
                          <div />
                          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>Ligne</div>
                          <div style={{ fontSize: 8, textAlign: 'center' }}><span style={{ color: '#4ade80' }}>↑</span><span style={{ color: 'var(--text-dim)', margin: '0 2px' }}>/</span><span style={{ color: '#ef4444' }}>↓</span></div>
                        </>}
                      </div>
                      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                        {entries.length === 0 && <div style={{ textAlign: 'center', padding: '0.8rem 0', color: 'var(--text-dim)', fontSize: 12 }}>Aucun joueur trouvé</div>}
                        {entries.map(([name, bks]) => {
                          const ub = bks.unibet?.[propStat];
                          const bc = bks.betclic?.[propStat];
                          const pn = bks.pinnacle?.[propStat];
                          const cell = { textAlign: 'center', fontSize: 10, fontWeight: 600, fontVariantNumeric: 'tabular-nums' };
                          const dim  = { color: 'var(--text-dim)', fontWeight: 400 };
                          return (
                            <div key={name}
                              onClick={() => {
                                const params = new URLSearchParams(location.search);
                                params.set('props', '1');
                                navigate(`${location.pathname}?${params.toString()}`, { replace: true });
                                navigate(`/basketball/${fixture.id}/player/${encodeURIComponent(name)}`, { state: { fixture, league: fixture.league, eventId } });
                              }}
                              title="Voir toutes les lignes du joueur"
                              style={{ display: 'grid', gridTemplateColumns: cols, gap: '0 0.2rem', alignItems: 'center', padding: '0.2rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
                              <span style={{ fontSize: 11, fontWeight: 400, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                              <div style={{ ...cell, color: ub?.line != null ? 'rgba(255,255,255,0.85)' : 'var(--text-dim)' }}>{ub?.line ?? <span style={dim}>—</span>}</div>
                              <div style={{ ...cell, display: 'flex', justifyContent: 'center', gap: 2 }}>
                                <span style={{ color: ub?.over != null ? '#4ade80' : 'var(--text-dim)' }}>{ub?.over != null ? ub.over.toFixed(2) : '—'}</span>
                                <span style={{ color: 'var(--text-dim)' }}>/</span>
                                <span style={{ color: ub?.under != null ? '#ef4444' : 'var(--text-dim)' }}>{ub?.under != null ? ub.under.toFixed(2) : '—'}</span>
                              </div>
                              <div />
                              <div style={{ ...cell, color: bc?.line != null ? 'rgba(255,255,255,0.85)' : 'var(--text-dim)' }}>{bc?.line ?? <span style={dim}>—</span>}</div>
                              <div style={{ ...cell, display: 'flex', justifyContent: 'center', gap: 2 }}>
                                <span style={{ color: bc?.over != null ? '#4ade80' : 'var(--text-dim)' }}>{bc?.over != null ? bc.over.toFixed(2) : '—'}</span>
                                <span style={{ color: 'var(--text-dim)' }}>/</span>
                                <span style={{ color: bc?.under != null ? '#ef4444' : 'var(--text-dim)' }}>{bc?.under != null ? bc.under.toFixed(2) : '—'}</span>
                              </div>
                              {hasPinn && <>
                                <div />
                                <div style={{ ...cell, color: pn?.line != null ? '#60a5fa' : 'var(--text-dim)' }}>{pn?.line ?? <span style={dim}>—</span>}</div>
                                <div style={{ ...cell, display: 'flex', justifyContent: 'center', gap: 2 }}>
                                  <span style={{ color: pn?.over != null ? '#4ade80' : 'var(--text-dim)' }}>{pn?.over != null ? pn.over.toFixed(2) : '—'}</span>
                                  <span style={{ color: 'var(--text-dim)' }}>/</span>
                                  <span style={{ color: pn?.under != null ? '#ef4444' : 'var(--text-dim)' }}>{pn?.under != null ? pn.under.toFixed(2) : '—'}</span>
                                </div>
                              </>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        );
      })()}

      {tab !== 'joueurs' && availBks.map(bk => {
        const isPinnacle = bk === 'pinnacle';
        const h = h2h?.bookmakers?.[bk];
        const t = tot?.bookmakers?.[bk];
        const sp = spread?.bookmakers?.[bk];
        const gridCols = tab === 'all' ? COLS_H2H : COLS_TOT;
        return (
          <div key={bk} style={{
            display: 'grid', gridTemplateColumns: gridCols, gap: '0 0.25rem', alignItems: 'center',
            padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
            background: isPinnacle ? 'rgba(255,255,255,0.03)' : 'transparent',
          }}>
            <span style={{ fontSize: 11, fontWeight: isPinnacle ? 700 : 400, color: isPinnacle ? '#60a5fa' : 'var(--text)' }}>
              {BK_LABELS[bk] ?? bk}
            </span>
            {tab === 'all' ? <>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <OddsCell value={h?.home} edge={null} isPinnacle={isPinnacle} color={isPinnacle ? undefined : BK_COLORS[bk]} />
                {ew?.bookmakers?.[bk]?.home && <span style={{ position: 'absolute', left: '50%', marginLeft: '1.3rem', fontSize: 9, color: 'var(--text-dim)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>({ew.bookmakers[bk].home.toFixed(2)})</span>}
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <OddsCell value={h?.away} edge={null} isPinnacle={isPinnacle} color={isPinnacle ? undefined : BK_COLORS[bk]} />
                {ew?.bookmakers?.[bk]?.away && <span style={{ position: 'absolute', left: '50%', marginLeft: '1.3rem', fontSize: 9, color: 'var(--text-dim)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>({ew.bookmakers[bk].away.toFixed(2)})</span>}
              </div>
            </> : tab === 'handicap' ? <>
              <div style={{ textAlign: 'center', fontSize: 10, fontVariantNumeric: 'tabular-nums', fontWeight: isPinnacle ? 700 : 400, color: 'var(--text)' }}>
                {sp?.home?.line != null ? `${sp.home.line > 0 ? '+' : ''}${sp.home.line}` : '—'}
              </div>
              <OddsCell value={sp?.home?.odds} edge={null} isPinnacle={isPinnacle} color={isPinnacle ? undefined : BK_COLORS[bk]} />
              <OddsCell value={sp?.away?.odds} edge={null} isPinnacle={isPinnacle} color={isPinnacle ? undefined : BK_COLORS[bk]} />
            </> : <>
              <div style={{ textAlign: 'center', fontSize: 10, fontVariantNumeric: 'tabular-nums', fontWeight: isPinnacle ? 700 : 400, color: 'var(--text)' }}>
                {t?.line ?? '—'}
              </div>
              <OddsCell value={t?.over}  edge={t?.edgeOver}  isPinnacle={isPinnacle} fairProb={tot?.fairProb?.over}  color={isPinnacle ? undefined : BK_COLORS[bk]} />
              <OddsCell value={t?.under} edge={t?.edgeUnder} isPinnacle={isPinnacle} fairProb={tot?.fairProb?.under} color={isPinnacle ? undefined : BK_COLORS[bk]} />
            </>}
          </div>
        );
      })}

      {tab === 'all' && resultEstimate && (() => {
        const { pHome, pAway } = resultEstimate;
        if (pHome == null || pAway == null) return null;
        // Mêmes seuils de couleur que le Modèle 1X2 foot (MatchDetailPage) — vert ≥62%, orange
        // 52-62%, rouge <52% — et même structure en ligne (label, puis chaque issue), pour que les
        // deux sports se présentent pareil (22 juin 2026, remplace l'ancien badge HOME/AWAY dupliqué).
        const items = [
          { key: 'home', label: home?.short ?? 'Dom', prob: Math.round(pHome) },
          { key: 'away', label: away?.short ?? 'Ext', prob: Math.round(pAway) },
        ];
        const ubH = h2h?.bookmakers?.unibet;
        const bcH = h2h?.bookmakers?.betclic;
        return (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'nowrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', flexShrink: 0 }}>Modèle 1X2</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', flexWrap: 'nowrap', flexShrink: 0 }}>
              {items.map(it => {
                const probColor = it.prob >= 62 ? '#10b981' : it.prob >= 52 ? '#f59e0b' : '#ef4444';
                // Edge Unibet/Betclic vs Pinnacle (25 juin 2026) — mini popup au clic sur le libellé,
                // même mécanique que MatchDetailPage (foot), 2 voies (pas de nul en basket).
                const ubEdge = fairH2H ? calcEdge(ubH?.[it.key], fairH2H[it.key]) : null;
                const bcEdge = fairH2H ? calcEdge(bcH?.[it.key], fairH2H[it.key]) : null;
                const hasPinnacleEdge = fairH2H != null;
                const pinnacleProb = fairH2H ? Math.round(fairH2H[it.key] * 100) : null;
                return (
                  <span key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 5, position: 'relative' }}>
                    <span
                      onClick={hasPinnacleEdge ? e => { e.stopPropagation(); setEdgePopupKey(prev => prev === it.key ? null : it.key); } : undefined}
                      style={{
                        fontSize: 9, fontWeight: 700, color: 'var(--text)',
                        cursor: hasPinnacleEdge ? 'pointer' : 'default',
                        textDecoration: hasPinnacleEdge ? 'underline dotted' : 'none', textDecorationColor: 'rgba(255,255,255,0.3)',
                      }}
                    >{it.label}</span>
                    <span style={{ fontSize: 8, fontWeight: 600, color: probColor }}>{it.prob}%</span>
                    {edgePopupKey === it.key && (
                      <div ref={edgePopupRef} style={{
                        position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6,
                        background: 'var(--bg-card, #11141c)', border: '1px solid rgba(139,92,246,0.35)', borderRadius: 6,
                        padding: '0.4rem 0.6rem', boxShadow: '0 6px 16px rgba(0,0,0,0.4)', zIndex: 50, whiteSpace: 'nowrap',
                        minWidth: 90, textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 8, fontWeight: 700, color: '#a78bfa', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pinnacle</div>
                        {pinnacleProb != null && <div style={{ fontSize: 16, fontWeight: 800, color: '#8b5cf6', marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>{pinnacleProb}%</div>}
                        {(ubEdge != null || bcEdge != null) && <div style={{ fontSize: 8, color: 'var(--text-dim)', marginBottom: 2 }}>vs bookmakers</div>}
                        {ubEdge != null && <div style={{ fontSize: 10, fontWeight: 600, color: BK_COLORS.unibet }}>Unibet {ubEdge >= 0 ? '+' : ''}{ubEdge.toFixed(1)}%</div>}
                        {bcEdge != null && <div style={{ fontSize: 10, fontWeight: 600, color: BK_COLORS.betclic }}>Betclic {bcEdge >= 0 ? '+' : ''}{bcEdge.toFixed(1)}%</div>}
                      </div>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })()}

      {tab === 'points' && gameTotalEstimate && fixture && (
        <GameTotalWidget estimate={gameTotalEstimate} fixture={fixture} tot={tot} edgePopupKey={edgePopupKey} setEdgePopupKey={setEdgePopupKey} edgePopupRef={edgePopupRef} />
      )}

      {tab === 'handicap' && gameSpreadEstimate && (() => {
        const { pHomeCovers, pAwayCovers, homeLine, refBk } = gameSpreadEstimate;
        if (pHomeCovers == null || pAwayCovers == null) return null;
        // Même code couleur que Modèle 1X2/O.U — vert ≥62%, orange 52-62%, rouge <52% (9 juillet 2026)
        const items = [
          { key: 'home', label: home?.short ?? 'Dom', line: homeLine, prob: Math.round(pHomeCovers) },
          { key: 'away', label: away?.short ?? 'Ext', line: -homeLine, prob: Math.round(pAwayCovers) },
        ];
        return (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'nowrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', flexShrink: 0 }}>Modèle Écart{refBk ? ` (${BK_LABELS[refBk] ?? refBk})` : ''}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', flexWrap: 'nowrap', flexShrink: 0 }}>
              {items.map(it => {
                const probColor = it.prob >= 62 ? '#10b981' : it.prob >= 52 ? '#f59e0b' : '#ef4444';
                return (
                  <span key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text)' }}>{it.label} {it.line > 0 ? '+' : ''}{it.line}</span>
                    <span style={{ fontSize: 8, fontWeight: 600, color: probColor }}>{it.prob}%</span>
                  </span>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function normalizeLiveGame(g) {
  const gMs = new Date(g.date).getTime();
  const allNba = getBballFixturesByLeague('nba');

  // Match exact (même équipes, date ±6h) → round, h2h, venue
  const exactMatch = allNba.find(f => {
    const diff = Math.abs(new Date(f.date).getTime() - gMs);
    if (diff > 6 * 3600 * 1000) return false;
    return (f.home.name === g.home.name && f.away.name === g.away.name) ||
           (f.home.name === g.away.name && f.away.name === g.home.name);
  });

  // Match série (mêmes équipes, n'importe quelle date) → stats équipe seulement (form, ppg…)
  const seriesMatch = exactMatch || allNba.find(f =>
    (f.home.short === g.home.short || f.away.short === g.home.short) &&
    (f.home.short === g.away.short || f.away.short === g.away.short)
  );

  // Récupère les données de la bonne équipe (home/away peuvent être inversés dans la série)
  const teamData = (match, name) => match
    ? (match.home.name === name ? match.home : match.away)
    : null;

  return {
    id: g.id,
    league: g.league || 'nba',
    round: exactMatch?.round || g.statusDetail || '',
    date: g.date,
    status: g.status,
    venue: g.venue ? { name: g.venue.name, city: g.venue.city, capacity: null } : null,
    h2h: exactMatch?.h2h || [],
    isLive: g.status === 'STATUS_IN_PROGRESS',
    home: { ...(teamData(seriesMatch, g.home.name) || {}), name: g.home.name, short: g.home.short, logo: g.home.logo, wins: g.home.wins, losses: g.home.losses, score: g.home.score },
    away: { ...(teamData(seriesMatch, g.away.name) || {}), name: g.away.name, short: g.away.short, logo: g.away.logo, wins: g.away.wins, losses: g.away.losses, score: g.away.score },
  };
}

export default function BasketballDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromAlert = searchParams.get('props') === '1';
  const isWNBA    = searchParams.get('league') === 'wnba';
  const euroLeague = searchParams.get('league'); // 'acb' | 'lnb' | 'bbl' | 'legaa' | null
  const isEuro    = ['acb','lnb','bbl','legaa'].includes(euroLeague);
  const propsSectionRef = useRef(null);
  const rankSlotRef = useRef(null);
  const dropRef = useRef(null);
  const [dropOpen, setDropOpen] = useState(false);
  const staticFixture    = useFixture(id);
  const [euroFixture, setEuroFixture] = useState(null);
  const allLeagueFixtures = useFixturesByLeague(isWNBA ? 'wnba' : isEuro ? euroLeague : staticFixture?.league || 'nba');
  const [allLiveGames, setAllLiveGames] = useState([]);

  const [liveFixture, setLiveFixture]   = useState(null);
  const [loadingLive, setLoadingLive]   = useState(!staticFixture);
  const [elLiveData, setElLiveData]     = useState(null);
  const [showLineup, setShowLineup]           = useState(!fromAlert);
  const [lineupCollapsed, setLineupCollapsed] = useState(false);
  const [showProps, setShowProps]             = useState(fromAlert);
  const [propsCollapsed, setPropsCollapsed]   = useState(false);
  const [oddsTeam, setOddsTeam]               = useState(null); // null = pas encore sélectionné
  const [savedOk,  setSavedOk]               = useState(false);
  const [bballOdds, setBballOdds]             = useState(null);
  const [oddsRefreshing, setOddsRefreshing]   = useState(false);
  const [gameSchedules, setGameSchedules]     = useState(null);
  const [gameTotalEstimate, setGameTotalEstimate] = useState(null);
  const [resultEstimate, setResultEstimate] = useState(null);
  const [gameSpreadEstimate, setGameSpreadEstimate] = useState(null);
  const [showOddsDropdown, setShowOddsDropdown] = useState(fromAlert);
  const [oddsTab, setOddsTab] = useState(fromAlert ? 'joueurs' : 'all'); // onglet actif de la boîte Odds — pilote l'affichage des cartes en dessous
  const [oddsLegendOpen, setOddsLegendOpen] = useState(false); // légende "?" de la boîte Odds ouverte — force aussi celle d'Analyse Props sur l'onglet Joueurs
  const [homeNames, setHomeNames]       = useState(Array(5).fill(''));
  const savedLineupLoaded = useRef(false);
  // Compo telle que chargée au mount (avant toute modif utilisateur) — sert à détecter les
  // remplacements au moment d'Enregistrer (ACB/LNB/BBL : prompt OUT/BENCH par joueur retiré)
  const baselineNames = useRef({ home: [], away: [] });
  const [outPrompt, setOutPrompt] = useState(null); // { home: [...names], away: [...names], choices: {} }
  const [awayNames, setAwayNames]       = useState(Array(5).fill(''));
  const [homePlayers, setHomePlayers]   = useState(null);
  const [awayPlayers, setAwayPlayers]   = useState(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [boxscore, setBoxscore]           = useState(null);
  const [boxscoreLoading, setBoxscoreLoading] = useState(false);
  const [projLineup, setProjLineup]       = useState(null);
  const [outerInjuryData, setOuterInjuryData] = useState({});
  const [wnbaStats, setWnbaStats]         = useState({ home: null, away: null });
  const [nbaStats, setNbaStats]           = useState({ home: null, away: null });
  const [wnbaH2H, setWnbaH2H]             = useState([]);
  const [nbaH2H, setNbaH2H]               = useState([]);
  const [euroH2H, setEuroH2H]             = useState([]);
  const [euroTeamStats, setEuroTeamStats] = useState({ home: null, away: null });
  const [euroLeagueGames, setEuroLeagueGames] = useState([]);

  useEffect(() => {
    if (staticFixture?.league === 'euroleague') return;
    const doneStatic = staticFixture?.round?.includes('Terminé') || (staticFixture?.date && new Date(staticFixture.date) < new Date());
    if (doneStatic) return;
    const injBase = isWNBA ? '/api/wnba' : '/api/nba';
    const url = `${injBase}/injuries`;
    const fetchInjuries = (fresh = false) => {
      if (fresh) invalidateCache(url);
      return cachedFetch(url, 10 * 60_000).then(d => setOuterInjuryData(d || {})).catch(() => {});
    };
    fetchInjuries();
    const id = setInterval(() => fetchInjuries(true), 5 * 60_000);
    return () => clearInterval(id);
  }, [staticFixture?.id]);

  // Fetch match européen depuis api-sports.io si pas de fixture statique
  useEffect(() => {
    if (!isEuro) return;
    cachedFetch(`/api/euro/${euroLeague}/game/${id}`, 60_000)
      .then(d => { if (d.id) setEuroFixture({ ...d, league: euroLeague, h2h: [], markets: {} }); })
      .catch(() => {})
      .finally(() => setLoadingLive(false));
  }, [id, euroLeague]);

  // Fetch tous les matchs de la ligue EU (pour dropdown)
  useEffect(() => {
    if (!isEuro) return;
    cachedFetch(`/api/euro/${euroLeague}/scoreboard`, 20_000)
      .then(d => setEuroLeagueGames(d.games || []))
      .catch(() => {});
  }, [isEuro, euroLeague]);

  // Polling scores live pour les matchs EU en cours
  useEffect(() => {
    if (!isEuro || !id) return;
    let timer;
    const poll = () => {
      fetch(`/api/euro/${euroLeague}/game/${id}`)
        .then(r => r.json())
        .then(d => {
          if (!d.id) return;
          setEuroFixture(prev => {
            if (!prev) return prev;
            return { ...prev, status: d.status, home: { ...prev.home, score: d.home.score }, away: { ...prev.away, score: d.away.score } };
          });
          const isLiveNow = d.status === 'STATUS_IN_PROGRESS';
          timer = setTimeout(poll, isLiveNow ? 30_000 : 5 * 60_000);
        })
        .catch(() => { timer = setTimeout(poll, 60_000); });
    };
    // Démarre le polling seulement si le match est en cours ou va commencer dans moins d'1h
    const kickoff = euroFixture ? new Date(euroFixture.date).getTime() : 0;
    const msTillKickoff = kickoff - Date.now();
    const delay = msTillKickoff > 3600_000 ? Math.min(msTillKickoff - 3600_000, 5 * 60_000) : 0;
    timer = setTimeout(poll, delay);
    return () => clearTimeout(timer);
  }, [isEuro, euroLeague, id]);

  // Fetch H2H et stats équipe saison pour les ligues EU
  useEffect(() => {
    if (!isEuro || !euroFixture) return;
    cachedFetch(`/api/euro/${euroLeague}/h2h/${euroFixture.home.id}/${euroFixture.away.id}`, 60 * 60_000)
      .then(d => setEuroH2H(d.games || []))
      .catch(() => {});
  }, [euroFixture?.id, isEuro]);

  useEffect(() => {
    if (!isEuro || !euroFixture) return;
    cachedFetch(`/api/euro/${euroLeague}/standings`, 30 * 60_000)
      .then(d => {
        const findTeam = tid => (d.teams || []).find(t => t.id === tid) || null;
        setEuroTeamStats({ home: findTeam(euroFixture.home.id), away: findTeam(euroFixture.away.id) });
      })
      .catch(() => {});
  }, [euroFixture?.id, isEuro]);

  useEffect(() => {
    // EL + Euro leagues have their own loop
    if (staticFixture?.league === 'euroleague' || isEuro) { setLoadingLive(false); return; }
    // Static fixture definitely over (> 3h elapsed) — skip
    const elapsedNow = staticFixture ? Date.now() - new Date(staticFixture.date).getTime() : 0;
    if (staticFixture && elapsedNow >= 3 * 60 * 60 * 1000) { setLoadingLive(false); return; }
    const sbUrl = isWNBA ? '/api/wnba/scoreboard' : '/api/nba/scoreboard';
    let timer;
    // Poll tant que le match n'est pas encore vu comme terminé — sans ça, un fetch unique au mount
    // gèle la page sur l'état capté à l'ouverture (score/statut jamais mis à jour si la page reste
    // ouverte pendant/avant le match, "Terminé" + score + stats réalisées n'apparaissent jamais tant
    // qu'on ne recharge pas la page à la main). Trouvé le 12 juillet 2026 sur Atlanta-Portland (WNBA).
    const poll = () => {
      fetch(sbUrl)
        .then(r => r.json())
        .then(d => {
          const games = d.games || [];
          if (isWNBA) setAllLiveGames(games);
          const game = games.find(g => {
            if (String(g.id) === String(id)) return true;
            // For static fixtures, match by team names + date proximity
            if (staticFixture) {
              const diff = Math.abs(new Date(g.date).getTime() - new Date(staticFixture.date).getTime());
              return g.home.name === staticFixture.home.name &&
                     g.away.name === staticFixture.away.name &&
                     diff < 12 * 60 * 60 * 1000;
            }
            return false;
          });
          if (game) setLiveFixture(normalizeLiveGame(game));
          setLoadingLive(false);
          const isDone = game?.status === 'STATUS_FINAL';
          if (!isDone) timer = setTimeout(poll, game?.status === 'STATUS_IN_PROGRESS' ? 30_000 : 5 * 60_000);
        })
        .catch(() => { setLoadingLive(false); timer = setTimeout(poll, 60_000); });
    };
    poll();
    return () => clearTimeout(timer);
  }, [id]);

  // Score live pour les fixtures EL statiques
  useEffect(() => {
    if (!staticFixture?.elGameCode) return;
    let timer;
    const poll = () => {
      fetch('/api/euroleague/scoreboard')
        .then(r => r.json())
        .then(d => {
          const g = (d.games || []).find(x => x.gameCode === staticFixture.elGameCode);
          if (g) setElLiveData(g);
          const isLiveNow = g?.status === 'STATUS_IN_PROGRESS';
          timer = setTimeout(poll, isLiveNow ? 30_000 : 5 * 60_000);
        })
        .catch(() => { timer = setTimeout(poll, 60_000); });
    };
    poll();
    return () => clearTimeout(timer);
  }, [staticFixture?.elGameCode]);

  // Merge live data into fixture
  const fixture = (() => {
    const base = staticFixture || liveFixture || euroFixture;
    if (!base) return base;
    // EL live scores
    if (elLiveData) return {
      ...base,
      isLive: elLiveData.status === 'STATUS_IN_PROGRESS',
      home: { ...base.home, score: elLiveData.localScore },
      away: { ...base.away, score: elLiveData.roadScore },
    };
    // NBA: merge live scores into static fixture
    if (staticFixture && liveFixture) return {
      ...staticFixture,
      isLive: liveFixture.isLive,
      home: { ...staticFixture.home, score: liveFixture.home.score },
      away: { ...staticFixture.away, score: liveFixture.away.score },
    };
    return base;
  })();
  const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;
  const elapsed = fixture ? Date.now() - new Date(fixture.date).getTime() : -1;
  const isCompleted = fixture && (
    fixture.round?.includes('Terminé') ||
    fixture.status === 'STATUS_FINAL' ||
    elapsed >= LIVE_WINDOW_MS
  );
  const isEuroleague = fixture?.league === 'euroleague';

  // ACB/LNB/BBL uniquement : un joueur retiré au moment d'Enregistrer doit être qualifié
  // OUT (redistribution complète) ou BENCH (toujours sur le terrain, pas de redistribution)
  const EU_OUT_BENCH_LEAGUES = ['acb', 'lnb', 'bbl'];
  const supportsOutBench = EU_OUT_BENCH_LEAGUES.includes(euroLeague);
  const saveEuroLineup = (outPlayersBySide = { home: [], away: [] }) => {
    if (!fixture?.home?.id || !fixture?.away?.id) return;
    const save = (names, teamId, opp, outPlayers) => {
      const filled = names.filter(n => n);
      if (!filled.length) return Promise.resolve();
      return fetch(`/api/euro/${euroLeague}/team-lineup/${teamId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starters: filled, opponent: opp, date: fixture.date, confirmed: true, outPlayers }),
      }).catch(() => {});
    };
    Promise.all([
      save(homeNames, fixture.home.id, fixture.away.name, outPlayersBySide.home),
      save(awayNames, fixture.away.id, fixture.home.name, outPlayersBySide.away),
    ]).then(() => {
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
      setProjLineup(prev => ({ ...(prev || {}), source: 'saved', confirmed: true }));
      baselineNames.current = { home: [...homeNames], away: [...awayNames] };
      setOutPrompt(null);
    });
  };
  const handleSaveClick = () => {
    if (!supportsOutBench) { saveEuroLineup(); return; }
    const removedHome = (baselineNames.current.home || []).filter(n => n && !homeNames.some(m => euNameEq(m, n)));
    const removedAway = (baselineNames.current.away || []).filter(n => n && !awayNames.some(m => euNameEq(m, n)));
    if (!removedHome.length && !removedAway.length) { saveEuroLineup(); return; }
    setOutPrompt({ home: removedHome, away: removedAway, choices: {} });
  };

  // Fetch team stats WNBA (ppg / oppg / rpg / apg / fg%)
  useEffect(() => {
    if (!isWNBA || !fixture) return;
    const homeId = ESPN_WNBA[fixture.home.name];
    const awayId = ESPN_WNBA[fixture.away.name];
    if (!homeId || !awayId) return;
    Promise.all([
      cachedFetch(`/api/wnba/teamstats/${homeId}`, 300_000).catch(() => null),
      cachedFetch(`/api/wnba/teamstats/${awayId}`, 300_000).catch(() => null),
    ]).then(([h, a]) => setWnbaStats({ home: h, away: a }));
  }, [fixture?.id]);

  // Fetch team stats NBA (ppg / oppg / rpg / apg / fg%)
  useEffect(() => {
    if (fixture?.league !== 'nba' || !fixture) return;
    const homeId = ESPN_NBA[fixture.home.name];
    const awayId = ESPN_NBA[fixture.away.name];
    if (!homeId || !awayId) return;
    Promise.all([
      cachedFetch(`/api/nba/teamstats/${homeId}`, 300_000).catch(() => null),
      cachedFetch(`/api/nba/teamstats/${awayId}`, 300_000).catch(() => null),
    ]).then(([h, a]) => setNbaStats({ home: h, away: a }));
  }, [fixture?.id]);

  useEffect(() => {
    if (!isWNBA || !fixture) return;
    const homeId = ESPN_WNBA[fixture.home.name];
    if (!homeId) return;
    cachedFetch(`/api/wnba/h2h/${homeId}?home=${fixture.home.short}&away=${fixture.away.short}`, 300_000)
      .then(d => setWnbaH2H(d.h2h || []))
      .catch(() => {});
  }, [fixture?.id]);

  useEffect(() => {
    if (!fixture || isWNBA || isEuroleague) return;
    const homeId = ESPN_NBA[fixture.home.name];
    if (!homeId) return;
    cachedFetch(`/api/nba/h2h/${homeId}?home=${fixture.home.short}&away=${fixture.away.short}`, 300_000)
      .then(d => { if (d.h2h?.length) setNbaH2H(d.h2h); })
      .catch(() => {});
  }, [fixture?.id]);

  // Pour les matchs EU live : starters réels disponibles dans le boxscore Bzzoiro en cours
  const isEuroLive = isEuro && fixture?.status === 'STATUS_IN_PROGRESS';

  useEffect(() => {
    if (!fixture || (!isCompleted && !isEuroLive) || boxscore !== null) return;
    if (!showProps && !showLineup) return;
    setBoxscoreLoading(true);
    const bsBase = isEuro ? `/api/euro/${euroLeague}/boxscore` : isEuroleague ? '/api/euroleague/boxscore' : isWNBA ? '/api/wnba/boxscore' : '/api/nba/boxscore';
    const bsHome = isEuro ? fixture.home.name : fixture.home.short;
    const bsAway = isEuro ? fixture.away.name : fixture.away.short;
    fetch(`${bsBase}?date=${encodeURIComponent(fixture.date)}&home=${bsHome}&away=${bsAway}`)
      .then(r => r.json())
      .then(data => setBoxscore(data))
      .catch(() => setBoxscore({}))
      .finally(() => setBoxscoreLoading(false));
  }, [showProps, showLineup, fixture?.id]);

  useEffect(() => {
    if (!fixture || !(showLineup || showProps) || homePlayers !== null) return;
    setRosterLoading(true);
    async function fetchOne(name, short, setter) {
      try {
        if (isEuroleague) {
          const r = await fetch(`/api/euroleague/players/${short}`);
          const d = await r.json();
          setter(d.players || []);
        } else if (isWNBA) {
          const teamId = ESPN_WNBA[name];
          if (!teamId) { setter([]); return; }
          const d = await cachedFetch(`/api/wnba/players/${teamId}`, 3_600_000);
          setter(d.players || []);
        } else {
          const teamId = ESPN_NBA[name];
          if (!teamId) { setter([]); return; }
          const d = await cachedFetch(`/api/nba/players/${teamId}`, 3_600_000);
          setter(d.players || []);
        }
      } catch { setter([]); }
    }
    if (isEuro) {
      Promise.all([
        cachedFetch(`/api/euro/${euroLeague}/players/${fixture.home.id}`, 3_600_000).then(d => setHomePlayers(d.players || [])).catch(() => setHomePlayers([])),
        cachedFetch(`/api/euro/${euroLeague}/players/${fixture.away.id}`, 3_600_000).then(d => setAwayPlayers(d.players || [])).catch(() => setAwayPlayers([])),
      ]).finally(() => setRosterLoading(false));
    } else {
      Promise.all([
        fetchOne(fixture.home.name, fixture.home.short, setHomePlayers),
        fetchOne(fixture.away.name, fixture.away.short, setAwayPlayers),
      ]).finally(() => setRosterLoading(false));
    }
  }, [showLineup, showProps, fixture]);

  // Fetch compos probables RotoWire (NBA/WNBA/EL) ou confirmées api-sports (EU) pour les matchs à venir
  useEffect(() => {
    if (!fixture || isCompleted || projLineup !== null) return;
    if (isEuro) {
      const f = euroFixture;
      if (!f) return;
      const url = `/api/euro/${euroLeague}/projectedlineup?home=${encodeURIComponent(f.home.name)}&away=${encodeURIComponent(f.away.name)}&date=${encodeURIComponent(f.date)}`;
      fetch(url)
        .then(r => r.json())
        .then(d => {
          setProjLineup(d?.source && d.source !== 'none' ? d : { starters: {}, source: 'none' });
        })
        .catch(() => setProjLineup({ starters: {}, source: 'none' }));
      return;
    }
    const url = fixture.league === 'euroleague'
      ? `/api/euroleague/projectedlineup?home=${fixture.home.short}&away=${fixture.away.short}`
      : fixture.league === 'wnba'
      ? `/api/wnba/projectedlineup?date=${encodeURIComponent(fixture.date)}&home=${fixture.home.short}&away=${fixture.away.short}`
      : `/api/nba/projectedlineup?date=${encodeURIComponent(fixture.date)}&home=${fixture.home.short}&away=${fixture.away.short}`;
    fetch(url)
      .then(r => r.json())
      .then(d => setProjLineup(d))
      .catch(() => setProjLineup({ starters: {}, source: 'none' }));
  }, [fixture?.id]);

  // Auto-peuplement depuis compos projetées RotoWire/ESPN (matchs à venir)
  useEffect(() => {
    if (!projLineup || isCompleted) return;
    const ESPN_SHORT = { SA: 'SAS', NY: 'NYK', GS: 'GSW', NO: 'NOP', UT: 'UTA' };
    const norm = a => ESPN_SHORT[a?.toUpperCase()] || a?.toUpperCase() || '';
    const lastName = n => n?.split(' ').slice(-1)[0]?.toLowerCase();

    function resolveNames(players, projTeam) {
      if (!players?.length || !projTeam?.starters?.length) return null;
      return projTeam.starters.map(s => {
        const match = players.find(p =>
          p.name?.toLowerCase() === s.name?.toLowerCase() ||
          lastName(p.name) === lastName(s.name)
        );
        return match?.name || s.name;
      });
    }

    const homeAbbr = norm(fixture?.home?.short);
    const awayAbbr = norm(fixture?.away?.short);
    const homeProj = projLineup.starters?.[homeAbbr] ?? projLineup.starters?.[fixture?.home?.short?.toUpperCase()];
    const awayProj = projLineup.starters?.[awayAbbr] ?? projLineup.starters?.[fixture?.away?.short?.toUpperCase()];

    const top5Names = players => [...(players || [])]
      .filter(p => !p.injury)
      .sort((a, b) => (b.stats?.pts ?? 0) - (a.stats?.pts ?? 0))
      .slice(0, 5).map(p => p.name);

    if (isEuro) return; // EU : cour vide, placement manuel uniquement

    if (homePlayers && homeProj) {
      const names = resolveNames(homePlayers, homeProj);
      if (names) setHomeNames(names);
    } else if (homePlayers && !homeProj) {
      setHomeNames(top5Names(homePlayers));
    }
    if (awayPlayers && awayProj) {
      const names = resolveNames(awayPlayers, awayProj);
      if (names) setAwayNames(names);
    } else if (awayPlayers && !awayProj) {
      setAwayNames(top5Names(awayPlayers));
    }
  }, [projLineup, homePlayers, awayPlayers]);

  // Charge la compo sauvegardée une seule fois au mount (EU uniquement)
  useEffect(() => {
    if (!isEuro || !fixture || savedLineupLoaded.current) return;
    const homeId = fixture.home?.id;
    const awayId = fixture.away?.id;
    if (!homeId || !awayId) return;
    Promise.all([
      cachedFetch(`/api/euro/${euroLeague}/team-lineup/${homeId}`, 5 * 60_000).catch(()=>null),
      cachedFetch(`/api/euro/${euroLeague}/team-lineup/${awayId}`, 5 * 60_000).catch(()=>null),
    ]).then(([homeRes, awayRes]) => {
      savedLineupLoaded.current = true;
      const homeStarters = homeRes?.found && homeRes.starters?.length ? homeRes.starters : [];
      const awayStarters = awayRes?.found && awayRes.starters?.length ? awayRes.starters : [];
      if (homeStarters.length) setHomeNames(homeStarters.concat(Array(5).fill('')).slice(0,5));
      if (awayStarters.length) setAwayNames(awayStarters.concat(Array(5).fill('')).slice(0,5));
      // Baseline = ce qui était affiché avant toute modif (carry-over non confirmé le plus souvent)
      baselineNames.current = { home: homeStarters, away: awayStarters };
    });
  }, [fixture?.home?.id, fixture?.away?.id]);

  // Fetch schedules des deux équipes pour le modèle O/U
  useEffect(() => {
    if (!fixture || isCompleted) return;
    if (isEuro) {
      Promise.all([
        cachedFetch(`/api/euro/${euroLeague}/teamschedule/${fixture.home.id}`, 30 * 60_000).catch(() => ({ games: [] })),
        cachedFetch(`/api/euro/${euroLeague}/teamschedule/${fixture.away.id}`, 30 * 60_000).catch(() => ({ games: [] })),
      ]).then(([h, a]) => setGameSchedules({ home: h.games || [], away: a.games || [] }));
      return;
    }
    if (isEuroleague) {
      Promise.all([
        cachedFetch(`/api/euroleague/teamschedule/${fixture.home.short}`, 30 * 60_000).catch(() => ({ games: [] })),
        cachedFetch(`/api/euroleague/teamschedule/${fixture.away.short}`, 30 * 60_000).catch(() => ({ games: [] })),
      ]).then(([h, a]) => setGameSchedules({ home: h.games || [], away: a.games || [] }));
      return;
    }
    if (isWNBA) {
      const homeId = ESPN_WNBA[fixture.home.name];
      const awayId = ESPN_WNBA[fixture.away.name];
      if (!homeId || !awayId) { setGameSchedules({ home: [], away: [] }); return; }
      Promise.all([
        fetch(`/api/wnba/teamschedule/${homeId}`).then(r => r.json()).catch(() => ({ games: [] })),
        fetch(`/api/wnba/teamschedule/${awayId}`).then(r => r.json()).catch(() => ({ games: [] })),
      ]).then(([h, a]) => setGameSchedules({ home: h.games || [], away: a.games || [] }));
      return;
    }
    const homeId = ESPN_NBA[fixture.home.name];
    const awayId = ESPN_NBA[fixture.away.name];
    if (!homeId || !awayId) return;
    Promise.all([
      fetch(`/api/nba/teamschedule/${homeId}`).then(r => r.json()).catch(() => ({ games: [] })),
      fetch(`/api/nba/teamschedule/${awayId}`).then(r => r.json()).catch(() => ({ games: [] })),
    ]).then(([h, a]) => setGameSchedules({ home: h.games || [], away: a.games || [] }));
  }, [fixture?.id]);

  // Calcule l'estimation O/U dès que les schedules sont prêts (total bookmaker en bonus si dispo)
  // Source unique — même modèle (computeGameTotalFull) que les alertes game_total, pour que ce
  // widget affiche exactement le même chiffre que l'alerte (22 juin 2026 ; remplace l'ancien calcul
  // local computeGameTotal + générateur d'alertes local, qui pouvaient diverger du serveur et qui
  // ne vérifiaient pas la cote minimum — même classe de bug déjà corrigée sur les props le 8 juin).
  useEffect(() => {
    if (!gameSchedules || !fixture) return;
    // /api/wnba/players renvoie toujours injury:null (ESPN WNBA jugé pas fiable, cf. CLAUDE.md) —
    // sans ce patch RotoWire (déjà fetché pour l'affichage des badges), la pénalité Out et le
    // garde-fou Q/GTD ne pouvaient jamais se déclencher ici (8 juillet 2026, même bug que côté
    // alertes en arrière-plan).
    const patchWNBA = arr => !isWNBA ? (arr || []) : (arr || []).map(p => {
      const hit = Object.entries(outerInjuryData).find(([n]) => n === p.name || n.toLowerCase() === p.name.toLowerCase());
      return hit ? { ...p, injury: hit[1].status } : p;
    });
    const patchedHomePlayers = patchWNBA(homePlayers);
    const patchedAwayPlayers = patchWNBA(awayPlayers);

    const bks = bballOdds?.markets?.totals?.bookmakers ?? {};
    const refBk = ['unibet', 'betclic'].find(b => bks[b]?.line);
    const refTotal = refBk ? bks[refBk].line : null;
    if (refTotal) {
      fetch('/api/basketball/total', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeGames: gameSchedules.home, awayGames: gameSchedules.away,
          gameDate: fixture.date, round: fixture.round, league: fixture.league, refTotal,
          awayTeamKey: isEuro ? fixture.away.id : fixture.away.short,
          homePlayers: patchedHomePlayers, awayPlayers: patchedAwayPlayers,
        }),
      }).then(r => r.json()).then(d => setGameTotalEstimate(d?.error ? null : { ...d, refBk })).catch(() => setGameTotalEstimate(null));
    } else {
      setGameTotalEstimate(null);
    }

    // Proba de victoire — même modèle (computeTeamWinProb) que les alertes basketball_result,
    // pour que ce widget affiche exactement le même chiffre que l'alerte (pas une formule locale).
    fetch('/api/basketball/result', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        homeGames: gameSchedules.home, awayGames: gameSchedules.away,
        gameDate: fixture.date, round: fixture.round, league: fixture.league,
        homePlayers: patchedHomePlayers, awayPlayers: patchedAwayPlayers,
      }),
    }).then(r => r.json()).then(d => setResultEstimate(d?.error ? null : d)).catch(() => setResultEstimate(null));

    // Écart de points (Handicap, 9 juillet 2026) — même source unique que Résultat/Total, réutilise
    // computeTeamWinProb côté serveur (marge attendue + écart-type déjà ancrés saison).
    const spBks = bballOdds?.markets?.spread?.bookmakers ?? {};
    const spRefBk = ['unibet', 'betclic'].find(b => spBks[b]?.home?.line != null);
    const spHomeLine = spRefBk ? spBks[spRefBk].home.line : null;
    if (spHomeLine != null) {
      fetch('/api/basketball/spread', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeGames: gameSchedules.home, awayGames: gameSchedules.away,
          gameDate: fixture.date, round: fixture.round, league: fixture.league, homeLine: spHomeLine,
          homePlayers: patchedHomePlayers, awayPlayers: patchedAwayPlayers,
        }),
      }).then(r => r.json()).then(d => setGameSpreadEstimate(d?.error ? null : { ...d, refBk: spRefBk })).catch(() => setGameSpreadEstimate(null));
    } else {
      setGameSpreadEstimate(null);
    }
  }, [gameSchedules, bballOdds, outerInjuryData]);

  // Reset + fetch cotes quand le match change
  useEffect(() => {
    if (!fixture) return;
    setBballOdds(null);
    const oddsKey = `bball_odds_${fixture.id}`;
    // Live ou terminé → cotes gelées depuis localStorage (pas de fetch live)
    if (isLive || isCompleted) {
      try {
        const saved = JSON.parse(localStorage.getItem(oddsKey) || 'null');
        if (saved?.found) { setBballOdds(saved); return; }
      } catch {}
    }
    fetch(`/api/basketball/odds?home=${encodeURIComponent(fixture.home.name)}&away=${encodeURIComponent(fixture.away.name)}&league=${fixture.league}&date=${encodeURIComponent(fixture.date)}`)
      .then(r => r.json())
      .then(d => {
        if (d?.found) {
          try { localStorage.setItem(oddsKey, JSON.stringify(d)); } catch {}
          setBballOdds(d);
        } else {
          try {
            const saved = JSON.parse(localStorage.getItem(oddsKey) || 'null');
            if (saved?.found) { setBballOdds(saved); return; }
          } catch {}
          setBballOdds(d);
        }
      })
      .catch(() => {
        try {
          const saved = JSON.parse(localStorage.getItem(oddsKey) || 'null');
          if (saved?.found) { setBballOdds(saved); return; }
        } catch {}
        setBballOdds({ found: false });
      });
  }, [fixture?.id]);

  function refreshOdds() {
    if (!fixture || oddsRefreshing || isLive) return;
    setOddsRefreshing(true);
    const start = Date.now();
    fetch(`/api/basketball/odds?home=${encodeURIComponent(fixture.home.name)}&away=${encodeURIComponent(fixture.away.name)}&league=${fixture.league}&date=${encodeURIComponent(fixture.date)}&refresh=1`)
      .then(r => r.json())
      .then(d => setBballOdds(d))
      .catch(() => {})
      .finally(() => {
        const remaining = 500 - (Date.now() - start);
        setTimeout(() => setOddsRefreshing(false), Math.max(0, remaining));
      });
  }

  // Action partagée par le chip "Odds" et le bouton "Analyse Props" — les deux ouvrent
  // exactement la même boîte Odds (même comportement, même indicateur actif orange)
  function toggleOddsView() {
    if (!isEuroleague) {
      if (bballOdds === null) return;
      if (!bballOdds?.found) { refreshOdds(); return; }
    }
    const opening = !showOddsDropdown;
    setShowOddsDropdown(v => !v);
    if (opening) {
      setShowLineup(false);
      setLineupCollapsed(false);
      setShowProps(true);
      setPropsCollapsed(false);
    } else {
      setShowProps(false);
      setPropsCollapsed(false);
    }
  }

  // Auto-refresh cotes toutes les 2 min (pré-match uniquement — gelées en live)
  useEffect(() => {
    if (!fixture || isCompleted || isLive) return;
    const id = setInterval(() => {
      fetch(`/api/basketball/odds?home=${encodeURIComponent(fixture.home.name)}&away=${encodeURIComponent(fixture.away.name)}&league=${fixture.league}&date=${encodeURIComponent(fixture.date)}&refresh=1`)
        .then(r => r.json())
        .then(d => setBballOdds(d))
        .catch(() => {});
    }, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [fixture?.id, isCompleted]);

  // Auto-peuplement depuis box score (matchs terminés ou EU live → starters réels)
  useEffect(() => {
    if (!boxscore || (!isCompleted && !isEuroLive)) return;
    const ESPN_SHORT = { SA: 'SAS', NY: 'NYK', GS: 'GSW', NO: 'NOP', UT: 'UTA' };
    const norm = a => ESPN_SHORT[a?.toUpperCase()] || a?.toUpperCase() || '';

    function extractStarters(abbr) {
      const key = Object.keys(boxscore).find(k => norm(k) === norm(abbr)) ?? abbr;
      return (boxscore[key] || [])
        .filter(p => p.starter && !p.dnp)
        .sort((a, b) => b.stats.pts - a.stats.pts)
        .slice(0, 5)
        .map(p => p.name);
    }

    const homeStarters = extractStarters(fixture.home.short);
    const awayStarters = extractStarters(fixture.away.short);
    if (homeStarters.length) setHomeNames(homeStarters);
    if (awayStarters.length) setAwayNames(awayStarters);
  }, [boxscore, isCompleted]);

  if (loadingLive) {
    return <div className="page"><div className="loading-state"><div className="loading-dot"/><div className="loading-dot"/><div className="loading-dot"/></div></div>;
  }

  if (!fixture) {
    return <div className="page"><div className="empty-state">Match introuvable.</div></div>;
  }

  const league = getBballLeagueById(fixture.league);
  const { venue, round } = fixture;

  // Calcule forme (W/L/D) depuis teamschedule pour les ligues sans form statique
  const computeForm = games => (games || [])
    .filter(g => g.ptsScored != null && g.ptsAllowed != null)
    .slice(0, 5)
    .map(g => g.ptsScored > g.ptsAllowed ? 'W' : 'L');

  const dynamicHomeForm = (isEuro || isWNBA) && gameSchedules?.home?.length
    ? computeForm(gameSchedules.home) : null;
  const dynamicAwayForm = (isEuro || isWNBA) && gameSchedules?.away?.length
    ? computeForm(gameSchedules.away) : null;

  // Calcule rpg/apg équipe depuis les stats individuelles des joueurs (EU uniquement)
  const teamStat = (players, key) => {
    const active = (players || []).filter(p => p.stats?.[key] != null && (p.recentActive || p.stats?.pts) > 0);
    if (!active.length) return null;
    return +active.reduce((s, p) => s + (p.stats[key] || 0), 0).toFixed(1);
  };

  // Enrichit home/away avec stats standings EU + rpg/apg calculés + forme dynamique si dispo
  const home = (isEuro && euroTeamStats.home)
    ? { ...fixture.home, ppg: euroTeamStats.home.ppg, oppg: euroTeamStats.home.oppg, wins: euroTeamStats.home.wins ?? fixture.home.wins, losses: euroTeamStats.home.losses ?? fixture.home.losses, form: dynamicHomeForm || fixture.home.form, rpg: teamStat(homePlayers, 'reb'), apg: teamStat(homePlayers, 'ast') }
    : { ...fixture.home, form: dynamicHomeForm || fixture.home.form };
  const away = (isEuro && euroTeamStats.away)
    ? { ...fixture.away, ppg: euroTeamStats.away.ppg, oppg: euroTeamStats.away.oppg, wins: euroTeamStats.away.wins ?? fixture.away.wins, losses: euroTeamStats.away.losses ?? fixture.away.losses, form: dynamicAwayForm || fixture.away.form, rpg: teamStat(awayPlayers, 'reb'), apg: teamStat(awayPlayers, 'ast') }
    : { ...fixture.away, form: dynamicAwayForm || fixture.away.form };
  const h2h = isWNBA ? wnbaH2H : isEuro ? euroH2H : (nbaH2H.length > 0 ? nbaH2H : (fixture.h2h || []));
  const isLive = fixture.isLive || fixture.status === 'STATUS_IN_PROGRESS';

  return (
    <div className="page detail-page">

      <button className="back-btn" onClick={() => navigate(-1)}>← Retour</button>
      <div className="detail-breadcrumb">
        <span style={{ color: '#fb923c' }}>{league?.flag} {league?.name}</span>
        <span className="bc-sep">·</span>
        <span>{round}</span>
      </div>

      {/* ── Hero ── */}
      <div className="detail-hero">
        <div className="detail-team home-team">
          <BballLogo team={home} size={52} />
          <div className="dt-position">{home.position != null ? `#${home.position} · ` : ''}{home.wins}V-{home.losses}D</div>
          <div className="dt-name">{home.name}</div>
          {home.ppg != null && <div className="dt-pts">{home.ppg} pts/match</div>}
          {home.form?.length > 0 && <FormStrip form={home.form} size="lg" />}
        </div>

        <div className="detail-center">
          {!isLive && (isCompleted
            ? <div className="finished-badge">Terminé</div>
            : <div className="detail-vs">vs</div>
          )}
          {isLive ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: '0.8cm' }}>
              <div className="detail-datetime">{formatFullDate(fixture.date)}</div>
              <div className="live-badge" style={{ marginTop: '0.5cm' }}>LIVE</div>
              {home.score != null && away.score != null && (
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#c62828', letterSpacing: '0.02em' }}>
                  {home.score} – {away.score}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="detail-datetime">{formatFullDate(fixture.date)}</div>
              {!isCompleted && <div className="detail-time-big">{formatMatchTime(fixture.date)}</div>}
              {isCompleted && home.score != null && away.score != null && (
                <div style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.03em', marginTop: '0.3rem' }}>
                  <span style={{ color: home.score > away.score ? '#2e7d32' : 'var(--text)' }}>{home.score}</span>
                  <span style={{ color: 'var(--text-dim)', margin: '0 4px' }}>–</span>
                  <span style={{ color: away.score > home.score ? '#2e7d32' : 'var(--text)' }}>{away.score}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="detail-team away-team">
          <BballLogo team={away} size={52} />
          <div className="dt-position">{away.position != null ? `#${away.position} · ` : ''}{away.wins}V-{away.losses}D</div>
          <div className="dt-name">{away.name}</div>
          {away.ppg != null && <div className="dt-pts">{away.ppg} pts/match</div>}
          {away.form?.length > 0 && <FormStrip form={away.form} size="lg" />}
        </div>

        {/* Dropdown autres matchs du championnat */}
        {(() => {
          const now = Date.now();
          let others;
          const isDone = f => f.status === 'STATUS_FINAL' || f.round?.includes('Terminé') || new Date(f.date).getTime() < now - LIVE_WINDOW_MS;
          if (isWNBA) {
            others = allLiveGames
              .filter(g => String(g.id) !== String(fixture.id) && (isCompleted ? isDone(g) : !isDone(g)))
              .sort((a, b) => new Date(a.date) - new Date(b.date));
          } else if (isEuro) {
            others = euroLeagueGames
              .filter(g => String(g.id) !== String(fixture.id) && (isCompleted ? isDone(g) : !isDone(g)))
              .sort((a, b) => new Date(a.date) - new Date(b.date));
          } else {
            const fixtureMs = new Date(fixture.date).getTime();
            const sameGame = f =>
              (f.home.name === fixture.home.name || f.home.short === fixture.home.short) &&
              (f.away.name === fixture.away.name || f.away.short === fixture.away.short) &&
              Math.abs(new Date(f.date).getTime() - fixtureMs) < 24 * 3600_000;
            others = allLeagueFixtures
              .filter(f => f.id !== fixture.id && !sameGame(f) && (isCompleted ? isDone(f) : !isDone(f)))
              .sort((a, b) => new Date(a.date) - new Date(b.date));
          }
          if (!others.length) return null;
          return (
            <div ref={dropRef} style={{ position: 'absolute', bottom: 10, right: 12 }}>
              <button onClick={() => setDropOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-dim)', fontSize: 11, fontWeight: 600, padding: '3px 8px', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}>
                <span style={{ transform: dropOpen ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▾</span>
              </button>
              {dropOpen && (
                <div onMouseLeave={() => setDropOpen(false)} style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 0', zIndex: 100, minWidth: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                  {others.map(f => (
                    <button key={f.id} onClick={() => { setDropOpen(false); navigate(`/basketball/${f.id}${isWNBA ? '?league=wnba' : isEuro ? `?league=${euroLeague}` : ''}`); }} style={{ display: 'block', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '7px 14px', textAlign: 'left', fontSize: 12, color: 'var(--text-sub)', whiteSpace: 'nowrap' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      {f.home.name} <span style={{ color: 'var(--text-dim)' }}>vs</span> {f.away.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Info bar ── */}
      <div className="detail-infobar">
        {venue && (
          <div className="info-chip">
            🏟️ {venue.name}{venue.city ? `, ${venue.city}` : ''}
            {venue.capacity && (
              <span className="info-sub">{formatCapacity(venue.capacity)} places</span>
            )}
          </div>
        )}

        <div
          className="info-chip"
          onClick={toggleOddsView}
          style={{ cursor: isEuroleague || bballOdds !== null ? 'pointer' : 'default', userSelect: 'none', opacity: !isEuroleague && bballOdds === null ? 0.5 : 1 }}
        >
          {bballOdds === null && !isEuroleague ? 'Odds…' : bballOdds?.found ? 'Odds' : isEuroleague ? 'Odds' : oddsRefreshing ? 'Odds…' : 'Odds N/D ↻'}
        </div>


        <button
          className={`info-chip info-chip--btn info-chip--pitch ${showLineup ? 'active' : ''}`}
          onClick={() => { if (lineupCollapsed) { setLineupCollapsed(false); setShowOddsDropdown(false); } else { setShowLineup(v => !v); setShowOddsDropdown(false); } }}
          title="Compositions"
          style={{ marginLeft: 'auto' }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="9" fill="none" stroke="white" strokeWidth="1"/>
            <path d="M 11 2 C 7.5 5 7.5 17 11 20" fill="none" stroke="white" strokeWidth="0.8"/>
            <path d="M 11 2 C 14.5 5 14.5 17 11 20" fill="none" stroke="white" strokeWidth="0.8"/>
            <line x1="2" y1="11" x2="20" y2="11" stroke="white" strokeWidth="0.8"/>
          </svg>
        </button>
        <button
          className={`info-chip info-chip--btn info-chip--pitch ${showOddsDropdown ? 'active' : ''}`}
          onClick={toggleOddsView}
          title="Analyse Props"
        >
          <svg width="20" height="18" viewBox="0 0 20 18" fill="none">
            <rect x="1" y="8" width="4" height="9" fill="none" stroke="white" strokeWidth="0.9"/>
            <rect x="8" y="4" width="4" height="13" fill="none" stroke="white" strokeWidth="0.9"/>
            <rect x="15" y="1" width="4" height="16" fill="none" stroke="white" strokeWidth="0.9"/>
          </svg>
        </button>
      </div>

      {/* Emplacement du panneau classement ligue (PropsSection) — entre les chips et la boîte
          Odds, pousse le contenu en dessous plutôt que de flotter par-dessus. */}
      <div ref={rankSlotRef} />

      {showOddsDropdown && (bballOdds?.found || (isEuroleague && bballOdds !== null)) && (
        <section className="detail-card compact-card" style={{ marginBottom: '0.5rem' }}>
          <OddsCard key={fixture?.id} odds={bballOdds} home={home} away={away} league={fixture.league} homePlayers={homePlayers} awayPlayers={(awayPlayers||[]).filter(p=>!new Set((homePlayers||[]).map(p=>String(p.id))).has(String(p.id)))} onRefresh={refreshOdds} refreshing={oddsRefreshing} defaultTab={fromAlert ? 'joueurs' : 'all'} gameTotalEstimate={!isCompleted ? gameTotalEstimate : null} resultEstimate={!isCompleted ? resultEstimate : null} gameSpreadEstimate={!isCompleted ? gameSpreadEstimate : null} fixture={fixture} onTabChange={(id) => { setOddsTab(id); if (id === 'joueurs') { setShowProps(true); setPropsCollapsed(false); } else { setPropsCollapsed(true); } }} onTeamChange={setOddsTeam} showHomeOverride={oddsTeam} eventId={bballOdds?.eventId ?? null} onLegendToggle={setOddsLegendOpen} />
        </section>
      )}

      {showProps && propsCollapsed && showOddsDropdown && oddsTab === 'joueurs' && (
        <div className="detail-card" style={{ padding: '0.55rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}
          onClick={() => { setPropsCollapsed(false); }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Analyse Props</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>▾ Ouvrir</span>
        </div>
      )}

      {showProps && !propsCollapsed && showOddsDropdown && oddsTab === 'joueurs' && (fixture.league === 'nba' || fixture.league === 'euroleague' || fixture.league === 'wnba' || EURO_LEAGUES_IDS.includes(fixture.league)) && (
        <div ref={el => { if (el && fromAlert && propsSectionRef.current !== el) { propsSectionRef.current = el; setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200); } }} style={{ marginBottom: '0.5rem' }}>
          <PropsSection
            key={fixture?.id}
            fixture={fixture}
            homePlayers={homePlayers}
            awayPlayers={awayPlayers}
            rosterLoading={rosterLoading}
            isCompleted={isCompleted}
            projLineup={projLineup}
            gameTotal={(() => { const bks = bballOdds?.markets?.totals?.bookmakers ?? {}; return bks.pinnacle?.line ?? bks.unibet?.line ?? bks.betclic?.line ?? null; })()}
            eventId={bballOdds?.eventId ?? null}
            pinnacleH2H={bballOdds?.markets?.h2h?.bookmakers?.pinnacle ?? bballOdds?.markets?.h2h?.bookmakers?.unibet ?? null}
            onClose={() => { setPropsCollapsed(true); if (bballOdds?.found) setShowOddsDropdown(true); }}
            showHomeOverride={oddsTeam}
            onTeamChange={setOddsTeam}
            homeNames={homeNames}
            awayNames={awayNames}
            rankSlotRef={rankSlotRef}
            forceLegendOpen={oddsTab === 'joueurs' && oddsLegendOpen}
          />
        </div>
      )}

      {/* ── Grid ── */}
      <div className="detail-grid">

        {showLineup && lineupCollapsed && (
          <div className="detail-card" style={{ padding: '0.55rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            onClick={() => { setLineupCollapsed(false); setShowOddsDropdown(false); }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Compositions</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>▾ Ouvrir</span>
          </div>
        )}

        {showLineup && !lineupCollapsed && (
          <div className="lineup-row-wrap">
            <RosterPanel
              home={home} away={away}
              homePlayers={homePlayers} awayPlayers={awayPlayers}
              loading={rosterLoading}
              homeNames={homeNames} awayNames={awayNames}
              onAssign={(team, name) => {
                const names  = team === 'home' ? homeNames : awayNames;
                const setter = team === 'home' ? setHomeNames : setAwayNames;
                const used   = names.findIndex(n => euNameEq(n, name));
                if (used !== -1) {
                  setter(n => { const c=[...n]; c[used]=''; return c; });
                } else {
                  const idx = names.findIndex(n => !n);
                  if (idx === -1) return;
                  setter(n => { const c=[...n]; c[idx]=name; return c; });
                }
              }}
              injuryData={outerInjuryData}
            />
            <div className="detail-card lineup-card">
              {(() => {
                const ESPN_SHORT = { SA: 'SAS', NY: 'NYK', GS: 'GSW', NO: 'NOP', UT: 'UTA' };
                const norm = a => ESPN_SHORT[a?.toUpperCase()] || a?.toUpperCase() || '';
                const homeProj = projLineup?.starters?.[norm(home.short)] ?? projLineup?.starters?.[home.short?.toUpperCase()];
                const awayProj = projLineup?.starters?.[norm(away.short)] ?? projLineup?.starters?.[away.short?.toUpperCase()];
                const rotoConfirmed = homeProj?.status === 'Confirmé' || awayProj?.status === 'Confirmé';
                const sofaConfirmedInner = (projLineup?.source === 'sofascore' || projLineup?.source === 'bzzoiro' || projLineup?.source === 'legabasket') && projLineup?.confirmed;
                const hasLineup = projLineup?.starters && Object.keys(projLineup.starters).length > 0;
                const isConfirmed = isCompleted || isLive || projLineup?.source === 'espn' || projLineup?.source === 'api-sports' || sofaConfirmedInner || rotoConfirmed || (projLineup?.source === 'saved' && projLineup?.confirmed);
                const hasEuroPlayers = EURO_LEAGUES_IDS.includes(fixture.league) && (homePlayers?.length || awayPlayers?.length);
                const hasNames = homeNames.some(n => n) || awayNames.some(n => n);
                const label = isCompleted
                  ? 'Compos confirmées'
                  : isConfirmed ? 'Compos confirmées'
                  : (projLineup?.source === 'rotowire' || projLineup?.source === 'sofascore' || projLineup?.source === 'gamelog' || projLineup?.source === 'saved' || hasEuroPlayers || hasNames) ? 'Compos probables'
                  : null;
                const canSaveEuro = isEuro && fixture?.home?.id && fixture?.away?.id;
                return (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:'0.5rem' }}>
                    {label && <span style={{
                      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
                      padding: '2px 8px', borderRadius: 4,
                      background: isConfirmed ? 'rgba(34,197,94,0.12)' : 'rgba(251,191,36,0.12)',
                      color: isConfirmed ? '#22c55e' : '#fbbf24',
                      border: `1px solid ${isConfirmed ? 'rgba(34,197,94,0.3)' : 'rgba(251,191,36,0.3)'}`,
                    }}>{label}</span>}
                    {canSaveEuro && (
                      <button onClick={handleSaveClick} style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 10px', borderRadius: 4, cursor: 'pointer',
                        background: savedOk ? 'rgba(34,197,94,0.15)' : 'rgba(96,165,250,0.12)',
                        color: savedOk ? '#22c55e' : '#60a5fa',
                        border: `1px solid ${savedOk ? 'rgba(34,197,94,0.4)' : 'rgba(96,165,250,0.3)'}`,
                        textTransform: 'uppercase', letterSpacing: '0.07em', transition: 'all .2s',
                      }}>{savedOk ? 'Enregistré ✓' : 'Enregistrer'}</button>
                    )}
                  </div>
                );
              })()}
              {outPrompt && (
                <div className="detail-card" style={{ padding: '0.6rem 0.8rem', marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 6, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Joueur(s) retiré(s) de la compo — précise leur statut
                  </div>
                  {[...outPrompt.home.map(n => ({ name: n, side: 'home' })), ...outPrompt.away.map(n => ({ name: n, side: 'away' }))].map(({ name, side }) => (
                    <div key={`${side}_${name}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0' }}>
                      <span style={{ fontSize: 11 }}>{name}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {['out', 'bench'].map(status => {
                          const active = outPrompt.choices[`${side}_${name}`] === status;
                          return (
                            <button
                              key={status}
                              onClick={() => setOutPrompt(p => ({ ...p, choices: { ...p.choices, [`${side}_${name}`]: status } }))}
                              style={{
                                fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', textTransform: 'uppercase',
                                background: active ? (status === 'out' ? 'rgba(239,68,68,0.2)' : 'rgba(96,165,250,0.2)') : 'rgba(255,255,255,0.06)',
                                color: active ? (status === 'out' ? '#ef4444' : '#60a5fa') : 'var(--text-dim)',
                                border: `1px solid ${active ? (status === 'out' ? 'rgba(239,68,68,0.4)' : 'rgba(96,165,250,0.4)') : 'rgba(255,255,255,0.1)'}`,
                              }}
                            >{status === 'out' ? 'OUT' : 'BENCH'}</button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button
                      disabled={Object.keys(outPrompt.choices).length < (outPrompt.home.length + outPrompt.away.length)}
                      onClick={() => {
                        const outHome = outPrompt.home.filter(n => outPrompt.choices[`home_${n}`]).map(n => ({ name: n, status: outPrompt.choices[`home_${n}`] }));
                        const outAway = outPrompt.away.filter(n => outPrompt.choices[`away_${n}`]).map(n => ({ name: n, status: outPrompt.choices[`away_${n}`] }));
                        saveEuroLineup({ home: outHome, away: outAway });
                      }}
                      style={{
                        fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: 4, cursor: 'pointer', textTransform: 'uppercase',
                        background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)',
                        opacity: Object.keys(outPrompt.choices).length < (outPrompt.home.length + outPrompt.away.length) ? 0.4 : 1,
                      }}
                    >Confirmer</button>
                    <button onClick={() => setOutPrompt(null)} style={{
                      fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: 4, cursor: 'pointer', textTransform: 'uppercase',
                      background: 'rgba(255,255,255,0.06)', color: 'var(--text-dim)', border: '1px solid rgba(255,255,255,0.1)',
                    }}>Annuler</button>
                  </div>
                </div>
              )}
              <LineupBuilder
                home={home} away={away}
                homeNames={homeNames} awayNames={awayNames}
                confirmed={(() => {
                  const ESPN_SHORT = { SA: 'SAS', NY: 'NYK', GS: 'GSW', NO: 'NOP', UT: 'UTA' };
                  const norm = a => ESPN_SHORT[a?.toUpperCase()] || a?.toUpperCase() || '';
                  const homeProj = projLineup?.starters?.[norm(home.short)] ?? projLineup?.starters?.[home.short?.toUpperCase()];
                  const awayProj = projLineup?.starters?.[norm(away.short)] ?? projLineup?.starters?.[away.short?.toUpperCase()];
                  const sofaConf = (projLineup?.source === 'sofascore' || projLineup?.source === 'bzzoiro' || projLineup?.source === 'legabasket') && projLineup?.confirmed;
                  const hasLu = projLineup?.starters && Object.keys(projLineup.starters).length > 0;
                  return isCompleted || (isLive && (hasLu || homeNames.some(n => n))) || projLineup?.source === 'espn' || projLineup?.source === 'api-sports' || sofaConf || homeProj?.status === 'Confirmé' || awayProj?.status === 'Confirmé' || (projLineup?.source === 'saved' && projLineup?.confirmed);
                })()}
              />
            </div>
          </div>
        )}



        {/* Visible sur Composition + onglets Résultat/Points ; masquée uniquement sur l'onglet Joueurs (remplacée par Analyse Props) */}
        {(!showOddsDropdown || oddsTab !== 'joueurs') && (home.ppg != null || (isWNBA && wnbaStats.home?.ppg != null) || (fixture.league === 'nba' && nbaStats.home?.ppg != null)) && (() => {
          const isNBA = fixture.league === 'nba';
          const r1 = v => v != null ? Math.round(v * 10) / 10 : null;
          const hS = k => r1(isWNBA ? wnbaStats.home?.[k] : isNBA ? nbaStats.home?.[k] : home[k]);
          const aS = k => r1(isWNBA ? wnbaStats.away?.[k] : isNBA ? nbaStats.away?.[k] : away[k]);
          // EU: rpg/apg/fg non disponibles dans standings, on affiche uniquement ppg/oppg
          return (
            <CollapsibleCard title="Statistiques saison" className="compact-card" defaultOpen>
              <div className="stats-teams-header">
                <span>{home.short}</span>
                <span>{away.short}</span>
              </div>
              <div className="stat-bars">
                <StatBar label="Pts marqués / match"   home={hS('ppg')}  away={aS('ppg')} />
                <StatBar label="Pts encaissés / match" home={hS('oppg')} away={aS('oppg')} higherIsBetter={false} />
                {hS('rpg') != null && <StatBar label="Rebonds / match"     home={hS('rpg')} away={aS('rpg')} />}
                {hS('apg') != null && <StatBar label="Passes déc. / match" home={hS('apg')} away={aS('apg')} />}
                {hS('fg')  != null && <StatBar label="Field Goal (%)"      home={hS('fg')}  away={aS('fg')}  unit="%" />}
              </div>
            </CollapsibleCard>
          );
        })()}


        {/* Confrontations directes masquée dès que la boîte Odds est ouverte (Résultat/Points/Joueurs) */}
        {!showOddsDropdown && (h2h?.length > 0 || isWNBA) && (
          <CollapsibleCard title="Confrontations directes" className="h2h-card">
            <div className="h2h-list">
              {h2h?.length > 0
                ? [...h2h].sort((a, b) => new Date(b.date) - new Date(a.date)).map((m, i) => <H2HRow key={i} match={m} />)
                : <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '0.5rem 0' }}>Première confrontation de la saison</div>
              }
            </div>
          </CollapsibleCard>
        )}

      </div>
    </div>
  );
}
