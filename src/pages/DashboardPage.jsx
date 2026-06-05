import { useState, useEffect } from 'react';

const ALERT_KEY       = 'nba_prop_alerts';
const GAME_TOTAL_KEY  = 'nba_game_total_alerts';

function KpiCard({ icon, label, value, color, sub }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      padding: '1.75rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${color} 0%, transparent 100%)`,
      }} />
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        background: `${color}18`,
        border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 17,
      }}>{icon}</div>
      <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.03em', marginTop: '0.25rem' }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-sub)', fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color, fontWeight: 600 }}>{sub}</div>}
    </div>
  );
}

const DONUT_CATEGORIES = [
  { key: 'perfs_players', label: 'Perfs players', color: '#3b82f6' },
  { key: 'ppm',           label: 'PPM',           color: '#10b981' },
  { key: 'resultat',      label: 'Résultat',      color: '#f59e0b' },
];

function DonutChart({ accepted, acceptedTotals, allAlerts, allTotals }) {
  const [hovered, setHovered] = useState(null);

  const counts = {};
  DONUT_CATEGORIES.forEach(c => { counts[c.key] = 0; });
  accepted.forEach(() => { counts['perfs_players']++; });
  (acceptedTotals || []).forEach(() => { counts['ppm']++; });

  // Taux de réussite par catégorie
  const wonOf   = key => key === 'perfs_players' ? (allAlerts  || []).filter(a => a.status === 'won').length
                       : key === 'ppm'           ? (allTotals  || []).filter(a => a.status === 'won').length : 0;
  const lostOf  = key => key === 'perfs_players' ? (allAlerts  || []).filter(a => a.status === 'lost').length
                       : key === 'ppm'           ? (allTotals  || []).filter(a => a.status === 'lost').length : 0;
  const rateOf  = key => { const w = wonOf(key), l = lostOf(key); return w + l > 0 ? Math.round(w / (w + l) * 100) : null; };

  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  const segments = DONUT_CATEGORIES.map(c => ({ ...c, count: counts[c.key], pct: total ? counts[c.key] / total : 0 })).filter(s => s.count > 0);

  const R = 90, r = 57, cx = 127.5, cy = 127.5;
  let angle = -Math.PI / 2;
  const arcs = segments.map(s => {
    const startAngle = angle;
    const sweep = s.pct * 2 * Math.PI;
    angle += sweep;
    const endAngle = angle;
    const x1 = cx + R * Math.cos(startAngle), y1 = cy + R * Math.sin(startAngle);
    const x2 = cx + R * Math.cos(endAngle),   y2 = cy + R * Math.sin(endAngle);
    const ix1 = cx + r * Math.cos(startAngle), iy1 = cy + r * Math.sin(startAngle);
    const ix2 = cx + r * Math.cos(endAngle),   iy2 = cy + r * Math.sin(endAngle);
    const large = sweep > Math.PI ? 1 : 0;
    const d = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${r} ${r} 0 ${large} 0 ${ix1} ${iy1} Z`;
    return { ...s, d };
  });

  const hovSeg  = hovered ? (DONUT_CATEGORIES.find(c => c.key === hovered) || null) : null;
  const hovRate = hovered ? rateOf(hovered) : null;
  const hovWon  = hovered ? wonOf(hovered)  : 0;
  const hovLost = hovered ? lostOf(hovered) : 0;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1rem', marginBottom: '1.5rem', width: 'fit-content' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textAlign: 'center', marginBottom: '0.75rem' }}>
        Répartition par type de pari
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg width={255} height={255} viewBox="0 0 255 255" style={{ cursor: 'default' }}>
          {total === 0 ? (
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={R - r} />
          ) : arcs.length === 1 ? (
            /* Un seul segment = 100% : l'arc SVG dégénère (start=end) → cercle complet */
            <circle
              cx={cx} cy={cy} r={(R + r) / 2}
              fill="none" stroke={arcs[0].color} strokeWidth={R - r}
              opacity={hovered && hovered !== arcs[0].key ? 0.35 : 1}
              style={{ transition: 'opacity 0.15s' }}
              onMouseEnter={() => setHovered(arcs[0].key)}
              onMouseLeave={() => setHovered(null)}
            />
          ) : (
            arcs.map(s => (
              <path
                key={s.key}
                d={s.d}
                fill={s.color}
                opacity={hovered && hovered !== s.key ? 0.35 : 1}
                style={{ transition: 'opacity 0.15s' }}
                onMouseEnter={() => setHovered(s.key)}
                onMouseLeave={() => setHovered(null)}
              />
            ))
          )}
          {/* Tooltip centre */}
          {hovSeg && (
            <>
              <text x={cx} y={cy - 18} textAnchor="middle" fontSize="11" fill={hovSeg.color} fontWeight="700" fontFamily="inherit">
                {hovSeg.label}
              </text>
              {hovRate != null ? (
                <>
                  <text x={cx} y={cy + 10} textAnchor="middle" fontSize="22" fill="white" fontWeight="800" fontFamily="inherit">
                    {hovRate}%
                  </text>
                  <text x={cx} y={cy + 28} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.4)" fontFamily="inherit">
                    {hovWon}G · {hovLost}P
                  </text>
                </>
              ) : (
                <text x={cx} y={cy + 10} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.35)" fontFamily="inherit">
                  Pas encore résolu
                </text>
              )}
            </>
          )}
          {/* Valeur par défaut au centre */}
          {!hovered && total > 0 && (
            <>
              <text x={cx} y={cy + 6} textAnchor="middle" fontSize="22" fill="white" fontWeight="800" fontFamily="inherit">
                {total}
              </text>
              <text x={cx} y={cy + 22} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.35)" fontFamily="inherit">
                paris
              </text>
            </>
          )}
        </svg>
        {total === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: '-1rem' }}>Aucun pari accepté</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 1.5rem', marginTop: '-0.5rem' }}>
            {DONUT_CATEGORIES.filter(c => counts[c.key] > 0).map(c => (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'default' }}
                onMouseEnter={() => setHovered(c.key)} onMouseLeave={() => setHovered(null)}>
                <span style={{ width: 14, height: 14, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: hovered === c.key ? 'var(--text)' : 'var(--text-dim)', transition: 'color 0.15s' }}>{c.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SportStatsTable({ allAlerts, allTotals }) {
  const all = [...(allAlerts || []), ...(allTotals || [])];

  const SPORTS = [
    { key: 'nba',        label: 'NBA',        logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png',  test: a => !a.league || a.league === 'nba' },
    { key: 'wnba',       label: 'WNBA',       logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png', test: a => a.league === 'wnba' },
    { key: 'acb',        label: 'ACB',        logo: 'https://media.api-sports.io/basketball/leagues/120.png', test: a => a.league === 'acb' },
    { key: 'euroleague', label: 'Euroleague', logo: 'https://media.api-sports.io/basketball/leagues/23.png',  test: a => a.league === 'euroleague' },
  ];

  const rows = SPORTS.map(s => {
    const group = all.filter(s.test);
    const accepted = group.filter(a => ['accepted','won','lost'].includes(a.status));
    const won    = group.filter(a => a.status === 'won').length;
    const lost   = group.filter(a => a.status === 'lost').length;
    const inPlay = group.filter(a => a.status === 'accepted').length;
    const total  = accepted.length;
    const rate   = won + lost > 0 ? (won / (won + lost) * 100).toFixed(1) : null;
    return { ...s, total, won, lost, voided: 0, inPlay, rate };
  }).filter(r => r.total > 0);

  const rateColor = r => r >= 65 ? '#4ade80' : r >= 45 ? '#facc15' : '#f87171';

  const TH = ({ children, align = 'right' }) => (
    <th style={{ padding: '0.5rem 0.85rem', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textAlign: align, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
      {children}
    </th>
  );
  const TD = ({ children, color, align = 'right' }) => (
    <td style={{ padding: '0.7rem 0.85rem', fontSize: 13, fontWeight: 600, color: color || 'var(--text)', textAlign: align, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      {children}
    </td>
  );

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1rem 0.5rem', flex: 1, alignSelf: 'flex-start' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', padding: '0 0.85rem', marginBottom: '0.75rem' }}>
        Statistiques par sport
      </p>
      {rows.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-dim)', padding: '0.5rem 0.85rem' }}>Aucun résultat résolu.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <TH align="left">Sport</TH>
              <TH>Paris</TH>
              <TH>Gagné</TH>
              <TH>Perdu</TH>
              <TH>En jeu</TH>
              <TH>Réussite %</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key}>
                <TD align="left">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <img src={r.logo} alt={r.label} width={20} height={20} style={{ objectFit: 'contain', borderRadius: 3 }} onError={e => e.target.style.display='none'} />
                    {r.label}
                  </span>
                </TD>
                <TD>{r.total}</TD>
                <TD color="#4ade80">{r.won}</TD>
                <TD color="#f87171">{r.lost}</TD>
                <TD color="#60a5fa">{r.inPlay}</TD>
                <TD color={r.rate != null ? rateColor(parseFloat(r.rate)) : 'var(--text-dim)'}>
                  {r.rate != null ? `${r.rate} %` : '—'}
                </TD>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AlertsChart({ accepted, days: numDays = 30 }) {
  const W = 1000, H = 300;
  const padL = 52, padR = 10, padT = 20, padB = 36;
  const cW = W - padL - padR;
  const cH = H - padT - padB;

  const now = new Date();
  // Minimum 2 points pour que la courbe SVG soit visible
  const effectiveDays = Math.max(numDays, 2);
  const days = Array.from({ length: effectiveDays }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (effectiveDays - 1 - i));
    return d.toISOString().slice(0, 10);
  });

  const byDay = {};
  accepted.forEach(a => {
    // Priorité : acceptedAt → savedAt → maintenant (jamais fixtureDate qui peut être dans le futur)
    const ts = a.acceptedAt ?? a.savedAt ?? Date.now();
    const raw = new Date(ts);
    const day = new Date(raw.getTime() - raw.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  });

  const vals = days.map(d => byDay[d] || 0);
  const maxV = Math.max(...vals, 1);
  const nTicks = 5;
  const step = Math.ceil(maxV / (nTicks - 1)) || 1;
  const yTicks = Array.from({ length: nTicks }, (_, i) => i * step);

  const px = i => days.length === 1 ? padL + cW / 2 : padL + (i / (days.length - 1)) * cW;
  const py = v => padT + cH - (v / (yTicks[yTicks.length - 1] || 1)) * cH;

  const pts = vals.map((v, i) => [px(i), py(v)]);
  const linePath = `M ${pts.map(([x, y]) => `${x},${y}`).join(' L ')}`;
  const areaPath = `${linePath} L ${px(days.length - 1)},${padT + cH} L ${px(0)},${padT + cH} Z`;
  const n = days.length;
  const xIdxs = [...new Set([0, Math.round(n * 0.25), Math.round(n * 0.5), Math.round(n * 0.75), n - 1])];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="dash-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00e5a0" stopOpacity="0.75" />
          <stop offset="60%" stopColor="#00c896" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#00a07a" stopOpacity="0" />
        </linearGradient>
      </defs>

      {yTicks.map(v => (
        <line key={v} x1={padL} y1={py(v)} x2={W - padR} y2={py(v)}
          stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}

      <path d={areaPath} fill="url(#dash-grad)" />
      <path d={linePath} fill="none" stroke="#00e5a0" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4" fill="#00e5a0" stroke="#0d1117" strokeWidth="2" />
      ))}

      {yTicks.map(v => (
        <text key={v} x={padL - 10} y={py(v) + 4} textAnchor="end"
          fontSize="11" fill="rgba(255,255,255,0.3)" fontFamily="inherit">{v}</text>
      ))}

      {xIdxs.map(i => (
        <text key={i} x={px(i)} y={H - 8} textAnchor="middle"
          fontSize="11" fill="rgba(255,255,255,0.3)" fontFamily="inherit">
          {new Date(days[i]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </text>
      ))}
    </svg>
  );
}

const PERIODS = [
  { label: '1 jour',   days: 1  },
  { label: '3 jours',  days: 3  },
  { label: '5 jours',  days: 5  },
  { label: '10 jours', days: 10 },
  { label: '20 jours', days: 20 },
  { label: '30 jours', days: 30 },
];

export default function DashboardPage() {
  const [alerts, setAlerts]           = useState([]);
  const [totalAlerts, setTotalAlerts] = useState([]);
  const [period, setPeriod]           = useState(5);


  const load = () => {
    const RESOLVED = ['accepted', 'won', 'lost', 'void'];
    const backfill = a =>
      RESOLVED.includes(a.status) && !a.acceptedAt && a.savedAt
        ? { ...a, acceptedAt: a.savedAt }
        : a;
    try { setAlerts((JSON.parse(localStorage.getItem(ALERT_KEY) || '[]')).map(backfill)); }
    catch { setAlerts([]); }
    try { setTotalAlerts((JSON.parse(localStorage.getItem(GAME_TOTAL_KEY) || '[]')).map(backfill)); }
    catch { setTotalAlerts([]); }
  };

  useEffect(() => {
    load();
    window.addEventListener('nba_alerts_updated', load);
    const id = setInterval(load, 5000);
    return () => { window.removeEventListener('nba_alerts_updated', load); clearInterval(id); };
  }, []);

  const now = Date.now();
  const RESOLVED = ['accepted', 'won', 'lost', 'void'];
  const pending  = alerts.filter(a => (a.status || 'pending') === 'pending' && new Date(a.fixtureDate).getTime() > now);

  // Déduplique par (player + date + stat + direction) — garde la probabilité la plus haute
  const dedupAlerts = (arr) => {
    const map = {};
    for (const a of arr) {
      const key = `${a.player}__${(a.fixtureDate||'').slice(0,10)}__${a.stat}__${a.direction}`;
      if (!map[key] || (a.probability || 0) > (map[key].probability || 0)) map[key] = a;
    }
    return Object.values(map);
  };

  const accepted        = dedupAlerts(alerts.filter(a => RESOLVED.includes(a.status)));
  const acceptedTotals  = totalAlerts.filter(a => RESOLVED.includes(a.status));
  const allDedupAlerts  = dedupAlerts(alerts);

  return (
    <div style={{ padding: '0.9rem 2.5rem 2rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p id="vue-ensemble" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#3b82f6', marginBottom: '0.6rem' }}>
            Vue d'ensemble
          </p>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1.1 }}>
            Tableau de bord
          </h1>
          <p style={{ color: 'var(--text-sub)', marginTop: '0.6rem', fontSize: 14, maxWidth: 420, lineHeight: 1.6 }}>
            Suivi des alertes
          </p>
        </div>
        <button
          onClick={() => {
            if (!window.confirm('Supprimer toutes les alertes et l\'historique ?')) return;
            // Preserve Dallas vs Seattle under alert before clearing
            const keepTotal = JSON.parse(localStorage.getItem('nba_game_total_alerts') || '[]').filter(a => {
              const h = (a.home || a.homeShort || '').toLowerCase();
              const aw = (a.away || a.awayShort || '').toLowerCase();
              return (h.includes('dallas') || aw.includes('dallas')) &&
                     (h.includes('seattle') || aw.includes('seattle')) &&
                     a.direction === 'under';
            });
            ['nba_prop_alerts','nba_game_total_alerts','nba_earlywin_alerts','fb_btts_alerts','nba_bet_history','nba_has_history'].forEach(k => localStorage.removeItem(k));
            if (keepTotal.length) localStorage.setItem('nba_game_total_alerts', JSON.stringify(keepTotal));
            window.dispatchEvent(new Event('nba_alerts_updated'));
            load();
          }}
          style={{
            marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.35rem 0.75rem', borderRadius: 7, cursor: 'pointer',
            fontSize: 11, fontWeight: 600,
            border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.07)',
            color: '#f87171',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          Réinitialiser les données
        </button>
      </div>

      {/* Chart */}
      <div style={{
        background: 'rgba(13,17,23,0.35)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '1.25rem 1.5rem 0' }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)' }}>
            Paris acceptés
          </span>
          <select
            value={period}
            onChange={e => setPeriod(Number(e.target.value))}
            style={{
              fontSize: 11, color: 'var(--text-dim)', background: 'transparent',
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '0.2rem 0.5rem', cursor: 'pointer', outline: 'none',
            }}
          >
            {PERIODS.map(p => (
              <option key={p.days} value={p.days} style={{ background: '#1a1a2e' }}>{p.label}</option>
            ))}
          </select>
        </div>
        <AlertsChart accepted={[...accepted, ...acceptedTotals]} days={period} />
      </div>

      {/* Donut + Stats table */}
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <DonutChart accepted={accepted} acceptedTotals={acceptedTotals} allAlerts={allDedupAlerts} allTotals={totalAlerts} />
        <SportStatsTable allAlerts={allDedupAlerts} allTotals={totalAlerts} />
      </div>


    </div>
  );
}
