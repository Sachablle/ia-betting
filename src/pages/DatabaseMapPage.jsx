import { useState, useEffect } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import GEO_DATA from 'world-atlas/countries-110m.json';
import { LEAGUES, renderLeagueItem } from './EffectifPage';

const GEO_URL = GEO_DATA;
const FOOTBALL_IDS = new Set(['ligue1', 'pl', 'laliga', 'bundes', 'seriea']);

// LNB/BBL/Lega A n'ont pas de liste d'équipes statique dans EffectifPage (seul l'ACB y était) —
// on la récupère dynamiquement via /api/euro/:league/standings (même source que les alertes props
// EU), et on la fait passer par EULeagueItem comme l'ACB (roster générique par nom d'équipe).
const EU_BASKET_META = {
  lnb:   { flag: '🇫🇷', name: 'Betclic Élite', country: 'France' },
  bbl:   { flag: '🇩🇪', name: 'BBL',           country: 'Allemagne' },
  legaa: { flag: '🇮🇹', name: 'Lega A',        country: 'Italie' },
};

// Mêmes pays que la Carte du Monde (Sports).
const COVERED = {
  '840': { name: 'États-Unis', flag: '🇺🇸' },
  '250': { name: 'France',     flag: '🇫🇷' },
  '724': { name: 'Espagne',    flag: '🇪🇸' },
  '276': { name: 'Allemagne',  flag: '🇩🇪' },
  '380': { name: 'Italie',     flag: '🇮🇹' },
  '826': { name: 'Angleterre', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
};

const ZOOM_ORIGIN = {
  '840': '18% 33%', '250': '50% 28%', '724': '47% 32%',
  '276': '52% 26%', '380': '53% 31%', '826': '48% 23%',
};

export default function DatabaseMapPage() {
  const [selected,      setSelected]      = useState(null);
  const [selectedGeoId, setSelectedGeoId] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  const closeAll = () => { setSelected(null); setSelectedGeoId(null); };
  const pick = (c, geoId) => {
    const desel = selected === c;
    setSelected(desel ? null : c);
    setSelectedGeoId(desel ? null : geoId);
    setTooltip(null);
  };

  // Équipes LNB/BBL/Lega A chargées une fois au montage (3 requêtes légères, mises en cache 6h
  // côté backend) — pas besoin de les recharger à chaque sélection de pays.
  const [euBasket, setEuBasket] = useState({});
  useEffect(() => {
    Object.entries(EU_BASKET_META).forEach(([id, meta]) => {
      fetch(`/api/euro/${id}/standings`)
        .then(r => r.json())
        .then(d => setEuBasket(prev => ({ ...prev, [id]: { id, ...meta, teams: (d.teams || []).map(t => ({ name: t.name })) } })))
        .catch(() => {});
    });
  }, []);

  const countryLeagues = selected
    ? [
        ...LEAGUES.filter(l => l.country === selected.name),
        ...Object.values(euBasket).filter(l => l.country === selected.name),
      ]
    : [];
  const hasFootball = countryLeagues.some(l => FOOTBALL_IDS.has(l.id));
  const hasBasket   = countryLeagues.some(l => !FOOTBALL_IDS.has(l.id));

  const [sportFilter, setSportFilter] = useState(null);
  useEffect(() => {
    if (!selected) { setSportFilter(null); return; }
    if (!(hasFootball && hasBasket)) { setSportFilter(null); return; }
    const firstIsFootball = countryLeagues.length && FOOTBALL_IDS.has(countryLeagues[0].id);
    setSportFilter(firstIsFootball ? 'football' : 'basket');
  }, [selected?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleLeagues = sportFilter
    ? countryLeagues.filter(l => sportFilter === 'football' ? FOOTBALL_IDS.has(l.id) : !FOOTBALL_IDS.has(l.id))
    : countryLeagues;

  return (
    <div
      onClick={() => { if (selected) closeAll(); }}
      style={{ position: 'fixed', top: 0, left: 200, right: 0, bottom: 0, overflow: 'hidden', background: 'transparent' }}
    >
      <style>{`
        @keyframes dbFadeIn  { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dbMapReveal { 0% { opacity: 0; transform: scale(0.96); } 100% { opacity: 1; transform: scale(1); } }
      `}</style>

      <div style={{ position: 'absolute', top: 20, left: 24, zIndex: 10, animation: 'dbMapReveal 0.8s ease-out both' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Carte championnats</span>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Clique un pays pour voir ses équipes</div>
      </div>

      {/* Map */}
      <div
        onClick={() => { if (selected) closeAll(); }}
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: '4vh',
          transition: 'transform .55s cubic-bezier(.25,.46,.45,.94), transform-origin .55s',
          transform: selected ? 'translateX(-180px) scale(1.55)' : 'translateX(0) scale(1)',
          transformOrigin: selectedGeoId && ZOOM_ORIGIN[selectedGeoId] ? ZOOM_ORIGIN[selectedGeoId] : '50% 50%',
        }}
      >
        <ComposableMap
          projectionConfig={{ scale: 195, center: [10, 8] }}
          style={{ width: '95%', height: '90%', animation: 'dbMapReveal 0.8s ease-out both' }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) => geographies.filter(g => g.id !== '010').map(geo => {
              const c = COVERED[geo.id];
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onClick={(e) => { e.stopPropagation(); if (c) pick(c, geo.id); }}
                  onMouseEnter={(e) => { if (c) { setHovered(geo.id); setTooltip({ name: c.name, flag: c.flag, x: e.clientX, y: e.clientY }); } }}
                  onMouseMove={(e) => { if (c) setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null); }}
                  onMouseLeave={() => { setHovered(null); setTooltip(null); }}
                  style={{
                    default: { fill: 'rgba(15,45,90,0.3)', stroke: c ? 'rgba(0,190,255,0.55)' : 'rgba(0,80,130,0.2)', strokeWidth: c ? 0.6 : 0.2, outline: 'none', cursor: c ? 'pointer' : 'default' },
                    hover:   { fill: 'rgba(15,45,90,0.3)', stroke: c ? 'rgba(0,190,255,0.55)' : 'rgba(0,80,130,0.2)', strokeWidth: c ? 0.6 : 0.2, outline: 'none', cursor: c ? 'pointer' : 'default' },
                    pressed: { outline: 'none' },
                  }}
                />
              );
            })}
          </Geographies>
        </ComposableMap>
      </div>

      {/* Tooltip hover */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 36,
          background: 'rgba(0,8,24,0.95)', border: '1px solid rgba(251,146,60,0.3)',
          borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: '#fff',
          pointerEvents: 'none', zIndex: 20, display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)', animation: 'dbFadeIn .1s ease-out',
        }}>
          <span>{tooltip.flag}</span>
          <span>{tooltip.name}</span>
        </div>
      )}

      {/* Légende bas gauche */}
      <div style={{ position: 'absolute', bottom: 24, left: 24, display: 'flex', alignItems: 'center', gap: 4, zIndex: 8, animation: 'dbMapReveal 0.8s ease-out 0.2s both' }}>
        {Object.entries(COVERED).map(([geoId, c]) => (
          <button key={geoId} onClick={() => pick(c, geoId)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', transition: 'opacity .15s', opacity: selected === c ? 1 : 0.55 }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = selected === c ? '1' : '0.55'}
          >
            <span style={{ fontSize: 13 }}>{c.flag}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap' }}>{c.name}</span>
          </button>
        ))}
      </div>

      {/* Panel équipes du pays sélectionné — mêmes caractéristiques que le panel matchs de la
          Carte du Monde (Sport) : largeur, dégradé, liseré orange, ombre, header. */}
      {selected && (
        <div onClick={(e) => e.stopPropagation()} style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: 480,
          background: 'linear-gradient(160deg,rgba(0,6,20,0.98),rgba(0,12,35,0.99))',
          borderLeft: '1px solid rgba(251,146,60,0.15)',
          boxShadow: '-20px 0 60px rgba(0,0,0,0.8)',
          display: 'flex', flexDirection: 'column',
          animation: 'dbMapReveal 1s ease-out both',
          zIndex: 20,
        }}>
          {/* Header */}
          <div style={{ padding: '2rem 1.75rem 1.25rem', borderBottom: '1px solid rgba(251,146,60,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 32 }}>{selected.flag}</span>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{selected.name}</div>
                  <div style={{ fontSize: 9, color: 'rgba(251,146,60,0.5)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 4 }}>
                    {countryLeagues.length ? countryLeagues.map(l => l.name).join(' · ') : 'Aucun championnat'}
                  </div>
                </div>
              </div>
              <button onClick={closeAll} style={{ background: 'none', border: '1px solid rgba(251,146,60,0.15)', borderRadius: 6, color: 'rgba(251,146,60,0.5)', cursor: 'pointer', width: 32, height: 32, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(251,146,60,0.4)'; e.currentTarget.style.color = 'rgba(251,146,60,0.8)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(251,146,60,0.15)'; e.currentTarget.style.color = 'rgba(251,146,60,0.5)'; }}
              >×</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: '1rem' }}>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(251,146,60,0.4),transparent)' }} />
              {(hasFootball
                ? [['football', '⚽', '#2d8a2d', 'rgba(45,138,45,', hasFootball], ['basket', '🏀', '#fb923c', 'rgba(251,146,60,', hasBasket]]
                : [['basket', '🏀', '#fb923c', 'rgba(251,146,60,', hasBasket], ['football', '⚽', '#2d8a2d', 'rgba(45,138,45,', hasFootball]]
              ).map(([sport, icon, col, rgba, has]) => {
                const active = sportFilter === sport;
                return (
                  <button key={sport} onClick={() => { if (has) setSportFilter(f => f === sport ? null : sport); }}
                    title={sport === 'football' ? 'Football uniquement' : 'Basket uniquement'}
                    style={{
                      background: active ? `${rgba}0.15)` : 'none',
                      border: `1px solid ${active ? col : has ? `${rgba}0.2)` : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: 5, cursor: has ? 'pointer' : 'default',
                      width: 22, height: 22, fontSize: 11,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
                      boxShadow: active ? `0 0 6px ${rgba}0.3)` : 'none',
                      opacity: has ? 1 : 0.25,
                    }}
                    onMouseEnter={e => { if (has) { e.currentTarget.style.borderColor = col; e.currentTarget.style.background = `${rgba}0.1)`; } }}
                    onMouseLeave={e => { if (has) { e.currentTarget.style.borderColor = active ? col : `${rgba}0.2)`; e.currentTarget.style.background = active ? `${rgba}0.15)` : 'none'; } }}
                  >{icon}</button>
                );
              })}
            </div>
          </div>

          {/* Équipes */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.75rem' }}>
            {visibleLeagues.length === 0 ? (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Aucun championnat référencé pour ce pays pour le moment.</div>
            ) : (
              <div className="ef-list">
                {visibleLeagues.map(renderLeagueItem)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
