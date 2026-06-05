import { useState, useEffect } from 'react';

const SPORTS = [
  { key: 'football',   label: 'Football',   emoji: '',   color: '#52C4A0' },
  { key: 'basketball', label: 'Basketball', emoji: '',   color: '#5B8FF9' },
];

function loadCounts() {
  try {
    const RESOLVED = ['accepted', 'won', 'lost', 'void'];
    const foot  = JSON.parse(localStorage.getItem('fb_btts_alerts') || '[]')
      .filter(a => RESOLVED.includes(a.status)).length;
    const bask  = [
      ...JSON.parse(localStorage.getItem('nba_prop_alerts')       || '[]'),
      ...JSON.parse(localStorage.getItem('nba_game_total_alerts') || '[]'),
    ].filter(a => RESOLVED.includes(a.status)).length;
    return { football: foot, basketball: bask };
  } catch { return { football: 0, basketball: 0 }; }
}

function loadResults() {
  try {
    const all = [
      ...JSON.parse(localStorage.getItem('nba_prop_alerts')       || '[]'),
      ...JSON.parse(localStorage.getItem('nba_game_total_alerts') || '[]'),
      ...JSON.parse(localStorage.getItem('fb_btts_alerts')        || '[]'),
    ];
    return {
      won:      all.filter(a => a.status === 'won').length,
      lost:     all.filter(a => a.status === 'lost').length,
      accepted: all.filter(a => a.status === 'accepted').length,
      void:     all.filter(a => a.status === 'void').length,
    };
  } catch { return { won: 0, lost: 0, accepted: 0, void: 0 }; }
}

function loadAlertsByStatus(status) {
  try {
    const props  = JSON.parse(localStorage.getItem('nba_prop_alerts')       || '[]');
    const totals = JSON.parse(localStorage.getItem('nba_game_total_alerts') || '[]');
    const btts   = JSON.parse(localStorage.getItem('fb_btts_alerts')        || '[]');
    const all = [
      ...props.filter(a => a.status === status).map(a => ({ ...a, _type: 'prop' })),
      ...totals.filter(a => a.status === status).map(a => ({ ...a, _type: 'total' })),
      ...btts.filter(a => a.status === status).map(a => ({ ...a, _type: 'btts' })),
    ];
    return all.sort((a, b) => (b.acceptedAt || 0) - (a.acceptedAt || 0));
  } catch { return []; }
}

const STATUS_COLORS = { won: '#4ade80', lost: '#f87171', accepted: '#60a5fa', void: '#94a3b8' };
const DIR_LABEL = { over: '▲ Over', under: '▼ Under' };

function AlertRow({ alert }) {
  const isTotal = alert._type === 'total';
  const isBtts  = alert._type === 'btts';
  const isOver  = alert.direction === 'over';
  const accentDir = isOver ? '#4ade80' : '#f87171';
  const statusColor = STATUS_COLORS[alert.status] || 'var(--text-dim)';
  const date = alert.fixtureDate || alert.date;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.4rem 0.75rem', borderRadius: 8,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
      gap: '0.5rem', fontSize: 12,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {isTotal ? `${alert.homeShort || alert.home} vs ${alert.awayShort || alert.away}`
           : isBtts ? alert.fixture
           : alert.player}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
          {date ? new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, color: isBtts ? '#10b981' : accentDir, fontSize: 11 }}>
          {isBtts ? '✓ BTTS'
           : `${DIR_LABEL[alert.direction] || ''} ${alert.line}${alert.stat ? ' ' + alert.stat : ''}`}
        </span>
        {(alert.acceptedOdds || alert.acceptedUnibetOdds || alert.acceptedBetclicOdds || alert.acceptedWinamaxOdds) && (
          <span style={{ fontWeight: 800, color: 'var(--text)', fontSize: 12 }}>
            {(alert.acceptedOdds || alert.acceptedUnibetOdds || alert.acceptedBetclicOdds || alert.acceptedWinamaxOdds)?.toFixed(2)}
          </span>
        )}
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: `${statusColor}18`, color: statusColor }}>
          {alert.status === 'won' ? 'Gagné' : alert.status === 'lost' ? 'Perdu' : alert.status === 'void' ? 'Void' : 'En jeu'}
        </span>
      </div>
    </div>
  );
}

const RESULT_SEGMENTS = [
  { key: 'won',      label: 'Gagné',      color: '#4ade80' },
  { key: 'lost',     label: 'Perdu',      color: '#f87171' },
  { key: 'accepted', label: 'En jeu',     color: '#60a5fa' },
  { key: 'void',     label: 'Remboursé',  color: '#94a3b8' },
];

function DonutResultats({ results, selected, onSelect }) {
  const [hovered, setHovered] = useState(null);
  const total = Object.values(results).reduce((s, v) => s + v, 0);
  if (total === 0) return (
    <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, padding: '2rem 0' }}>
      Aucun résultat enregistré
    </div>
  );

  const R = 80, r = 50, cx = 110, cy = 110;
  const polarToCartesian = (pct, radius) => {
    const angle = pct * 2 * Math.PI - Math.PI / 2;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  };
  const arcPath = (startPct, pct) => {
    const start = polarToCartesian(startPct, R), end = polarToCartesian(startPct + pct, R);
    const is_   = polarToCartesian(startPct, r), ie  = polarToCartesian(startPct + pct, r);
    const large = pct > 0.5 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${R} ${R} 0 ${large} 1 ${end.x} ${end.y} L ${ie.x} ${ie.y} A ${r} ${r} 0 ${large} 0 ${is_.x} ${is_.y} Z`;
  };

  let offset = 0;
  const arcs = RESULT_SEGMENTS.map(seg => {
    const count = results[seg.key] || 0;
    const pct   = count / total;
    const arc   = { ...seg, count, pct, offset };
    offset += pct;
    return arc;
  }).filter(a => a.count > 0);

  const hov = hovered ? arcs.find(a => a.key === hovered) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
      <svg width={220} height={220} viewBox="0 0 220 220" style={{ cursor: 'default', overflow: 'visible' }}>
        {arcs.map(a => a.pct >= 0.9999
          ? <circle key={`bg-${a.key}`} cx={cx} cy={cy} r={R} fill="none" stroke={a.color} strokeWidth={R - r} opacity={0.25} />
          : <path   key={`bg-${a.key}`} d={arcPath(a.offset, a.pct)} fill={a.color} opacity={0.25} />
        )}
        {arcs.map(a => a.pct >= 0.9999
          ? <circle key={a.key} cx={cx} cy={cy} r={R} fill="none" stroke={a.color} strokeWidth={R - r}
              opacity={(hovered && hovered !== a.key) || (selected && selected !== a.key) ? 0.3 : 1}
              style={{ transition: 'opacity 0.15s', cursor: 'pointer' }}
              onMouseEnter={() => setHovered(a.key)} onMouseLeave={() => setHovered(null)}
              onClick={() => onSelect(k => k === a.key ? null : a.key)} />
          : <path key={a.key} d={arcPath(a.offset, a.pct)} fill={a.color}
              opacity={(hovered && hovered !== a.key) || (selected && selected !== a.key) ? 0.3 : 1}
              style={{ transition: 'opacity 0.15s', cursor: 'pointer' }}
              onMouseEnter={() => setHovered(a.key)} onMouseLeave={() => setHovered(null)}
              onClick={() => onSelect(k => k === a.key ? null : a.key)} />
        )}
        {hov ? (<>
          <text x={cx} y={cy - 8}  textAnchor="middle" fontSize="22" fontWeight="800" fill={hov.color} fontFamily="inherit">{hov.count}</text>
          <text x={cx} y={cy + 12} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.5)" fontFamily="inherit">{hov.label}</text>
          <text x={cx} y={cy + 28} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.35)" fontFamily="inherit">{Math.round(hov.pct * 100)}%</text>
        </>) : (<>
          <text x={cx} y={cy - 4}  textAnchor="middle" fontSize="24" fontWeight="800" fill="var(--text)" fontFamily="inherit">{total}</text>
          <text x={cx} y={cy + 16} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.4)" fontFamily="inherit">résultats</text>
        </>)}
      </svg>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        {arcs.map(a => (
          <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'default' }}
            onMouseEnter={() => setHovered(a.key)} onMouseLeave={() => setHovered(null)}>
            <div style={{ width: 28, height: 10, borderRadius: 3, background: a.color, opacity: hovered && hovered !== a.key ? 0.3 : 1, transition: 'opacity 0.15s' }} />
            <span style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>{a.label} <b>{a.count}</b></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutSport({ counts }) {
  const [hovered, setHovered] = useState(null);
  const total = SPORTS.reduce((s, sp) => s + (counts[sp.key] || 0), 0);
  if (total === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, padding: '2rem 0' }}>
        Aucun pari enregistré
      </div>
    );
  }

  const R = 80, r = 50, cx = 110, cy = 110;

  let offset = 0;
  const arcs = SPORTS.map(sp => {
    const pct = (counts[sp.key] || 0) / total;
    const arc = { ...sp, pct, count: counts[sp.key] || 0, offset };
    offset += pct;
    return arc;
  }).filter(a => a.count > 0);

  const polarToCartesian = (pct, radius) => {
    const angle = pct * 2 * Math.PI - Math.PI / 2;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  };

  const arcPath = (startPct, pct) => {
    const start = polarToCartesian(startPct, R);
    const end   = polarToCartesian(startPct + pct, R);
    const is_   = polarToCartesian(startPct, r);
    const ie    = polarToCartesian(startPct + pct, r);
    const large = pct > 0.5 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${R} ${R} 0 ${large} 1 ${end.x} ${end.y} L ${ie.x} ${ie.y} A ${r} ${r} 0 ${large} 0 ${is_.x} ${is_.y} Z`;
  };

  const hov = hovered ? arcs.find(a => a.key === hovered) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
      <svg width={220} height={220} viewBox="0 0 220 220" style={{ cursor: 'default', overflow: 'visible' }}>
        {arcs.map(a =>
          a.pct >= 0.9999
            ? <circle key={`bg-${a.key}`} cx={cx} cy={cy} r={R} fill="none" stroke={a.color} strokeWidth={R - r} opacity={0.25} />
            : <path   key={`bg-${a.key}`} d={arcPath(a.offset, a.pct)} fill={a.color} opacity={0.25} />
        )}
        {arcs.map(a => a.pct >= 0.9999
          ? (<circle key={a.key} cx={cx} cy={cy} r={R} fill="none" stroke={a.color} strokeWidth={R - r}
              opacity={hovered && hovered !== a.key ? 0.3 : 1}
              style={{ transition: 'opacity 0.15s' }}
              onMouseEnter={() => setHovered(a.key)} onMouseLeave={() => setHovered(null)} />)
          : (<path key={a.key} d={arcPath(a.offset, a.pct)} fill={a.color}
              opacity={hovered && hovered !== a.key ? 0.3 : 1}
              style={{ transition: 'opacity 0.15s' }}
              onMouseEnter={() => setHovered(a.key)} onMouseLeave={() => setHovered(null)} />)
        )}
        {hov ? (
          <>
            <text x={cx} y={cy - 8} textAnchor="middle" fontSize="22" fontWeight="800" fill={hov.color} fontFamily="inherit">{hov.count}</text>
            <text x={cx} y={cy + 12} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.5)" fontFamily="inherit">{hov.label}</text>
            <text x={cx} y={cy + 28} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.35)" fontFamily="inherit">{Math.round(hov.pct * 100)}%</text>
          </>
        ) : (
          <>
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize="24" fontWeight="800" fill="var(--text)" fontFamily="inherit">{total}</text>
            <text x={cx} y={cy + 16} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.4)" fontFamily="inherit">paris</text>
          </>
        )}
      </svg>

      <div style={{ display: 'flex', gap: '1.5rem' }}>
        {SPORTS.map(sp => (
          <div key={sp.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'default', opacity: (counts[sp.key] || 0) === 0 ? 0.4 : 1 }}
            onMouseEnter={() => setHovered(sp.key)} onMouseLeave={() => setHovered(null)}>
            <div style={{ width: 28, height: 10, borderRadius: 3, background: sp.color, opacity: hovered && hovered !== sp.key ? 0.3 : 1, transition: 'opacity 0.15s' }} />
            <span style={{ fontSize: 12, color: '#ffffff', fontWeight: 500 }}>
              {sp.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const CARD = {
  background: 'transparent', border: '1px solid var(--border)',
  borderRadius: 18, padding: '1.5rem 2rem',
  display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
};

export default function AnalyserPage() {
  const [counts,    setCounts]    = useState({ football: 0, basketball: 0 });
  const [results,   setResults]   = useState({ won: 0, lost: 0, accepted: 0, void: 0 });
  const [filter,    setFilter]    = useState(null);
  const [details,   setDetails]   = useState([]);

  useEffect(() => {
    setCounts(loadCounts());
    setResults(loadResults());
  }, []);

  useEffect(() => {
    if (filter) setDetails(loadAlertsByStatus(filter));
    else setDetails([]);
  }, [filter]);

  const filterLabel = { won: 'Gagné', lost: 'Perdu', accepted: 'En jeu', void: 'Remboursé' };

  return (
    <div className="page">
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 'calc(5rem - 0.9cm)' }}>
        <div style={CARD}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            Répartition par sports
          </h2>
          <DonutSport counts={counts} />
        </div>
        <div style={CARD}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            Répartition des résultats
          </h2>
          <DonutResultats results={results} selected={filter} onSelect={setFilter} />
        </div>
      </div>

      {filter && (
        <div style={{ marginTop: '1.5rem', maxWidth: 560 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: STATUS_COLORS[filter] }}>{filterLabel[filter]}</span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>— {details.length} pari{details.length > 1 ? 's' : ''}</span>
            <button onClick={() => setFilter(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14 }}>×</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {details.length === 0
              ? <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>Aucun pari dans cette catégorie.</p>
              : details.map((a, i) => <AlertRow key={a.id || i} alert={a} />)
            }
          </div>
        </div>
      )}
    </div>
  );
}
