import { useState, useRef, useEffect } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

const CITY_TO_FIPS = {
  'Atlanta':       '13', 'Boston':        '25', 'Brooklyn':      '36',
  'Charlotte':     '37', 'Chicago':       '17', 'Cleveland':     '39',
  'Dallas':        '48', 'Denver':        '08', 'Detroit':       '26',
  'San Francisco': '06', 'Houston':       '48', 'Indianapolis':  '18',
  'Inglewood':     '06', 'Los Angeles':   '06', 'Memphis':       '47',
  'Miami':         '12', 'Milwaukee':     '55', 'Minneapolis':   '27',
  'New Orleans':   '22', 'New York':      '36', 'Oklahoma City': '40',
  'Orlando':       '12', 'Philadelphia':  '42', 'Phoenix':       '04',
  'Portland':      '41', 'Sacramento':    '06', 'San Antonio':   '48',
  'Salt Lake City':'49', 'Washington':    '11',
};

export default function USMap({ onOpenChange }) {
  const [open, setOpen]      = useState(false);
  const [games, setGames]    = useState([]);
  const [selectedId, setSel] = useState(null);
  const hasDragged           = useRef(false);

  const selected = games.find(g => g.id === selectedId) || null;

  useEffect(() => {
    if (!open) return;
    let timer;
    const load = () => {
      fetch('/api/nba/scoreboard')
        .then(r => r.json())
        .then(d => {
          const gs = d.games || [];
          setGames(gs);
          const hasLive = gs.some(g => g.status === 'STATUS_IN_PROGRESS');
          timer = setTimeout(load, hasLive ? 30_000 : 60_000);
        })
        .catch(() => { timer = setTimeout(load, 60_000); });
    };
    load();
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!selectedId) return;
    const clear = () => setSel(null);
    document.addEventListener('click', clear);
    return () => document.removeEventListener('click', clear);
  }, [selectedId]);

  const now = Date.now();
  const games24h = games.filter(g => {
    const t = new Date(g.date).getTime();
    const isActive = g.status === 'STATUS_IN_PROGRESS' || g.status === 'STATUS_HALFTIME';
    return isActive || (t > now - 3 * 3600_000 && t < now + 24 * 3600_000);
  });

  const statesWithGames = new Set(games24h.map(g => CITY_TO_FIPS[g.venue.city]).filter(Boolean));

  // FIPS → meilleur match (live en priorité)
  const fipsToGame = {};
  for (const g of games24h) {
    const fips = CITY_TO_FIPS[g.venue.city];
    if (!fips) continue;
    const existing = fipsToGame[fips];
    const isLive = g.status === 'STATUS_IN_PROGRESS' || g.status === 'STATUS_HALFTIME';
    if (!existing || isLive) fipsToGame[fips] = g;
  }

  const handleStateClick = (fips) => {
    if (!fipsToGame[fips]) return;
    const g = fipsToGame[fips];
    setSel(p => p === g.id ? null : g.id);
  };

  return (
    <div className="holo-root">
      <button className="holo-btn" onClick={() => { setOpen(o => { onOpenChange?.(!o); return !o; }); setSel(null); }}>
        <span className="holo-btn-icon">🌍</span>
        <span className="holo-btn-ring" />
      </button>

      {open && (
        <div className="holo-popup" onClick={e => e.stopPropagation()}>
          <div className="holo-sphere-wrap">
            <div className="holo-atmo" />
            <div className="holo-sphere-clip">
              <ComposableMap
                projection="geoAlbersUsa"
                projectionConfig={{ scale: 550 }}
                width={270} height={270}
                style={{ width: '100%', height: 'auto', display: 'block' }}
              >
                <defs>
                  <radialGradient id="hm-bg" cx="38%" cy="33%" r="65%">
                    <stop offset="0%" stopColor="#041230" />
                    <stop offset="100%" stopColor="#010810" />
                  </radialGradient>
                  <filter id="hm-glow">
                    <feGaussianBlur stdDeviation="1.5" result="b"/>
                    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                  <filter id="hm-glow2">
                    <feGaussianBlur stdDeviation="3" result="b"/>
                    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                </defs>

                <rect x={0} y={0} width={270} height={270} fill="url(#hm-bg)" />

                <Geographies geography={GEO_URL}>
                  {({ geographies }) => geographies.map(geo => {
                    const hasGame   = statesWithGames.has(geo.id);
                    const isActive  = selected && CITY_TO_FIPS[selected.venue.city] === geo.id;
                    const gameFips  = fipsToGame[geo.id];
                    const hasLive   = gameFips && (gameFips.status === 'STATUS_IN_PROGRESS' || gameFips.status === 'STATUS_HALFTIME');
                    const inRetrait = !!selectedId && !isActive;

                    const activeFill   = hasLive ? 'rgba(0,230,118,0.28)' : 'rgba(0,210,255,0.28)';
                    const activeStroke = hasLive ? 'rgba(0,230,118,1)'    : 'rgba(0,240,255,1)';
                    const gameFill     = hasLive ? 'rgba(0,210,118,0.18)' : 'rgba(0,180,255,0.16)';
                    const gameStroke   = hasLive ? 'rgba(0,220,118,0.9)'  : 'rgba(0,210,255,0.85)';

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onClick={() => hasGame && handleStateClick(geo.id)}
                        style={{
                          default: {
                            fill:        isActive  ? activeFill         : inRetrait ? 'rgba(1,4,12,0.88)'  : hasGame ? gameFill   : 'rgba(3,15,45,0.5)',
                            stroke:      isActive  ? activeStroke       : inRetrait ? 'rgba(0,30,80,0.12)' : hasGame ? gameStroke : 'rgba(0,100,200,0.2)',
                            strokeWidth: isActive  ? 1.1                : inRetrait ? 0.15                 : hasGame ? 0.8        : 0.25,
                            outline: 'none',
                            filter:      isActive  ? 'url(#hm-glow2)'  : inRetrait ? 'none'               : hasGame ? 'url(#hm-glow2)' : 'none',
                            transition: 'all 0.25s',
                          },
                          hover: {
                            fill:        hasGame ? (hasLive ? 'rgba(0,230,118,0.32)' : 'rgba(0,200,255,0.28)') : 'rgba(3,18,55,0.5)',
                            stroke:      hasGame ? (hasLive ? 'rgba(0,230,118,1)'    : 'rgba(0,240,255,1)')    : 'rgba(0,120,210,0.25)',
                            strokeWidth: hasGame ? 1.1 : 0.25,
                            outline: 'none', cursor: hasGame ? 'pointer' : 'default',
                            filter: hasGame ? 'url(#hm-glow2)' : 'none',
                          },
                          pressed: { outline: 'none' },
                        }}
                      />
                    );
                  })}
                </Geographies>
              </ComposableMap>
            </div>
          </div>

          {selected && selected.home && selected.away && (() => {
            const selLive   = selected.status === 'STATUS_IN_PROGRESS' || selected.status === 'STATUS_HALFTIME';
            const showScore = selected.status !== 'STATUS_SCHEDULED' && selected.home.score != null && selected.away.score != null;
            return (
              <div className="holo-stats">
                <div className="hs-head">
                  <span className="hs-flag">📍</span>
                  <div>
                    <div className="hs-name">{selected.venue.name}</div>
                    <div className="hs-gpg" style={{ color: '#00c8ff' }}>{selected.venue.city}</div>
                  </div>
                </div>
                <div className="hs-matchup" style={{ justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}>
                    {selected.home.logo && <img src={selected.home.logo} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />}
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{selected.home.short}</span>
                    {showScore && <span style={{ fontSize: 12, fontWeight: 800, color: selLive ? '#00e676' : '#fff' }}>{selected.home.score}</span>}
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{showScore ? '–' : 'vs'}</span>
                    {showScore && <span style={{ fontSize: 12, fontWeight: 800, color: selLive ? '#00e676' : '#fff' }}>{selected.away.score}</span>}
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{selected.away.short}</span>
                    {selected.away.logo && <img src={selected.away.logo} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />}
                  </div>
                </div>
              </div>
            );
          })()}

          {games.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', marginTop: '0.75rem' }}>
              Chargement…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
