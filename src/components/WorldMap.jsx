import { useState, useRef, useEffect } from 'react';
import { ComposableMap, Geographies, Geography, Graticule, Sphere, Marker } from 'react-simple-maps';
import { getAllLeagueStats } from '../utils/leagueStats';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const COUNTRY_LEAGUE = {
  '250': 'ligue1', '826': 'pl', '724': 'laliga',
  '276': 'bundes', '380': 'seriea', '528': 'eredivisie',
};

const MARKERS = {
  ligue1: [2.35, 48.85], pl: [-0.12, 51.50], laliga: [-3.70, 40.41],
  bundes: [13.40, 52.52], seriea: [12.49, 41.90], eredivisie: [4.90, 52.36],
};

function poisson(l, k) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }
function overPct(l, k) { let c = 0; for (let i = 0; i <= k; i++) c += poisson(l, i); return Math.round((1 - c) * 100); }

export default function WorldMap({ onOpenChange }) {
  const [open, setOpen]       = useState(false);
  const [selected, setSel]    = useState(null);
  const [rotation, setRotation] = useState([-14, -46, 0]);
  const isDragging  = useRef(false);
  const lastMouse   = useRef(null);
  const hasDragged  = useRef(false);
  const allStats = getAllLeagueStats();
  const byId     = Object.fromEntries(allStats.map(s => [s.league.id, s]));
  const toggle   = (id) => { if (!hasDragged.current) setSel(p => p?.league.id === id ? null : byId[id]); };

  const onMouseDown = (e) => {
    isDragging.current = true;
    hasDragged.current = false;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e) => {
    if (!isDragging.current || !lastMouse.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasDragged.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setRotation(r => [
      r[0] - dx * 0.4,
      Math.max(-80, Math.min(80, r[1] + dy * 0.4)),
      r[2],
    ]);
  };
  const onMouseUp = () => { isDragging.current = false; lastMouse.current = null; };

  useEffect(() => {
    if (!selected) return;
    const clear = () => setSel(null);
    document.addEventListener('click', clear);
    return () => document.removeEventListener('click', clear);
  }, [selected]);

  return (
    <div className="holo-root">

      {/* Bouton flottant */}
      <button className="holo-btn" onClick={() => { setOpen(o => { onOpenChange?.(!o); return !o; }); setSel(null); }}>
        <span className="holo-btn-icon">🌍</span>
        <span className="holo-btn-ring" />
      </button>

      {open && (
        <div className="holo-popup" onClick={e => e.stopPropagation()}>

          {/* Globe */}
          <div
            className="holo-sphere-wrap"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            style={{ cursor: isDragging.current ? 'grabbing' : 'grab' }}
          >
            <div className="holo-atmo" />
            <div className="holo-sphere-clip">
              <ComposableMap
                projection="geoOrthographic"
                projectionConfig={{ rotate: rotation, scale: 322 }}
                width={270} height={270}
                style={{ width: '100%', height: 'auto', display: 'block' }}
              >
                <defs>
                  <radialGradient id="hg-ocean" cx="38%" cy="33%" r="65%">
                    <stop offset="0%"   stopColor="#041230" />
                    <stop offset="100%" stopColor="#010810" />
                  </radialGradient>
                  <radialGradient id="hg-depth" cx="50%" cy="50%" r="50%">
                    <stop offset="50%"  stopColor="transparent" />
                    <stop offset="100%" stopColor="rgba(1,6,18,0.8)" />
                  </radialGradient>
                  <filter id="hg-glow">
                    <feGaussianBlur stdDeviation="1.5" result="b"/>
                    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                  <filter id="hg-glow2">
                    <feGaussianBlur stdDeviation="3" result="b"/>
                    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                </defs>

                <Sphere fill="url(#hg-ocean)" stroke="rgba(0,180,255,0.3)" strokeWidth={0.8} />
                <Graticule stroke="rgba(0,160,255,0.15)" strokeWidth={0.4} />

                <Geographies geography={GEO_URL}>
                  {({ geographies }) => geographies.map(geo => {
                    const lid    = COUNTRY_LEAGUE[geo.id];
                    const stats  = lid ? byId[lid] : null;
                    const active = selected?.league.id === lid;
                    return (
                      <Geography key={geo.rsmKey} geography={geo}
                        onClick={() => lid && stats && toggle(lid)}
                        style={{
                          default: {
                            fill:        active ? 'rgba(0,210,255,0.22)' : stats ? 'rgba(0,160,255,0.08)' : 'rgba(3,15,45,0.5)',
                            stroke:      active ? 'rgba(0,240,255,1)'    : stats ? 'rgba(0,200,255,0.65)' : 'rgba(0,100,200,0.2)',
                            strokeWidth: active ? 0.9 : stats ? 0.6 : 0.25,
                            outline: 'none',
                            filter: active ? 'url(#hg-glow2)' : stats ? 'url(#hg-glow)' : 'none',
                            transition: 'all 0.2s',
                          },
                          hover: {
                            fill: stats ? 'rgba(0,210,255,0.18)' : 'rgba(3,18,55,0.5)',
                            stroke: stats ? 'rgba(0,240,255,0.9)' : 'rgba(0,120,210,0.25)',
                            strokeWidth: stats ? 0.7 : 0.25,
                            outline: 'none', cursor: stats ? 'pointer' : 'default',
                            filter: stats ? 'url(#hg-glow)' : 'none',
                          },
                          pressed: { outline: 'none' },
                        }}
                      />
                    );
                  })}
                </Geographies>

                {/* Overlay profondeur */}
                <Sphere fill="url(#hg-depth)" stroke="none" />

                {/* Markers */}
                {allStats.map(s => {
                  const coords = MARKERS[s.league.id];
                  if (!coords) return null;
                  const active = selected?.league.id === s.league.id;
                  return (
                    <Marker key={s.league.id} coordinates={coords}>
                      {active && <>
                        <circle r={20} fill="none" stroke="rgba(0,210,255,0.15)" strokeWidth={0.8} className="hm-r3"/>
                        <circle r={13} fill="none" stroke="rgba(0,210,255,0.3)"  strokeWidth={0.8} className="hm-r2"/>
                        <circle r={7}  fill="none" stroke="rgba(0,220,255,0.6)"  strokeWidth={1}   className="hm-r1"/>
                      </>}
                      <circle r={active ? 4.5 : 3.5} fill={active ? '#00eeff' : '#00c8ff'}
                        stroke={active ? '#fff' : 'rgba(150,240,255,0.7)'} strokeWidth={active ? 1.2 : 0.8}
                        style={{ filter: `drop-shadow(0 0 ${active ? 10 : 6}px rgba(0,200,255,0.9))`, cursor: 'pointer' }}
                        onClick={() => toggle(s.league.id)}
                      />
                    </Marker>
                  );
                })}
              </ComposableMap>
            </div>
          </div>

          {/* Stats */}
          {selected && (
            <div className="holo-stats">
              <div className="hs-head">
                <span className="hs-flag">{selected.league.flag}</span>
                <div>
                  <div className="hs-name">{selected.league.name}</div>
                  <div className="hs-gpg">{selected.avgGPG.toFixed(2)} buts/match</div>
                </div>
              </div>
              <div className="hs-pills">
                {[
                  { l: 'Over 1.5', v: overPct(selected.avgGPG, 1), c: '#00d4ff' },
                  { l: 'Over 2.5', v: selected.over25,             c: '#7c6fff' },
                  { l: 'Over 3.5', v: overPct(selected.avgGPG, 3), c: '#ff9020' },
                  { l: 'BTTS',     v: selected.btts,               c: '#00ffb0' },
                ].map(({ l, v, c }) => (
                  <div key={l} className="hs-pill">
                    <span className="hs-pill-l">{l}</span>
                    <span className="hs-pill-v" style={{ color: c }}>{v}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
