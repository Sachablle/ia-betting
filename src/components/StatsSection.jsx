import { useMemo } from 'react';
import { getAllLeagueStats } from '../utils/leagueStats';
import WorldMap from './WorldMap';

function Ring({ pct, color, label }) {
  const r = 24;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(pct, 100) / 100);
  return (
    <div className="stat-ring">
      <svg width="62" height="62" viewBox="0 0 62 62">
        <circle cx="31" cy="31" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4.5"/>
        <circle
          cx="31" cy="31" r={r}
          fill="none" stroke={color} strokeWidth="4.5"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 31 31)"
          style={{ filter: `drop-shadow(0 0 5px ${color})` }}
        />
      </svg>
      <div className="stat-ring-inner">
        <span className="stat-ring-val">{pct}%</span>
      </div>
      <span className="stat-ring-label">{label}</span>
    </div>
  );
}

export default function StatsSection() {
  const stats = useMemo(() => getAllLeagueStats(), []);
  const maxGPG = stats[0]?.avgGPG ?? 3.5;

  return (
    <div className="stats-section">
      <div className="stats-section-header">
        <div className="stats-section-title-row">
          <span className="stats-section-title">Analyse des ligues</span>
          <span className="stats-section-dot">·</span>
          <span className="stats-section-sub">Saison 2025–26</span>
        </div>
        <span className="stats-live-badge">● LIVE STATS</span>
      </div>

      <div className="stats-panels">

        {/* Module 1 — Bar chart */}
        <div className="stats-panel">
          <p className="stats-panel-label">⚽ Buts par match — classement</p>
          <div className="stats-bars">
            {stats.map((s, i) => (
              <div key={s.league.id} className="stats-bar-row">
                <div className="stats-bar-meta">
                  <span className="stats-bar-rank">#{i + 1}</span>
                  <span className="stats-bar-flag">{s.league.flag}</span>
                  <span className="stats-bar-name">{s.league.name}</span>
                </div>
                <div className="stats-bar-track">
                  <div
                    className="stats-bar-fill"
                    style={{ width: `${(s.avgGPG / maxGPG) * 100}%` }}
                  />
                </div>
                <span className="stats-bar-value">{s.avgGPG.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Module 2 — KPI cards */}
        <div className="stats-panel">
          <p className="stats-panel-label">📊 BTTS &amp; Over 2.5 par ligue</p>
          <div className="stats-kpi-grid">
            {stats.map(s => (
              <div key={s.league.id} className="stats-kpi-card">
                <div className="stats-kpi-top">
                  <span className="stats-kpi-flag">{s.league.flag}</span>
                  <span className="stats-kpi-name">{s.league.name}</span>
                </div>
                <div className="stats-kpi-gpg">
                  <span className="stats-kpi-gpg-val">{s.avgGPG.toFixed(2)}</span>
                  <span className="stats-kpi-gpg-unit">buts/match</span>
                </div>
                <div className="stats-kpi-rings">
                  <Ring pct={s.btts}   color="#e040fb" label="BTTS" />
                  <Ring pct={s.over25} color="#4fc3f7" label="+2.5" />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      <WorldMap />
    </div>
  );
}
