import { useState } from 'react';
import MatchRow from './MatchRow';
import { getLeagueById } from '../utils/fixtures';

export default function LeagueGroup({ leagueId, fixtures }) {
  const ssKey = `league_open_${leagueId}`;
  const [collapsed, setCollapsed] = useState(() => sessionStorage.getItem(ssKey) !== 'open');
  const league = getLeagueById(leagueId);
  if (!league) return null;

  const toggle = () => setCollapsed(c => {
    const next = !c;
    sessionStorage.setItem(ssKey, next ? 'closed' : 'open');
    return next;
  });

  return (
    <section className="league-group">
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${league.accent} 0%, transparent 100%)` }} />
      <div className="league-header" style={{ '--accent': league.accent }}>
        <button className="league-header-toggle" onClick={toggle}>
          <div className="league-header-left">
            <span className="league-flag">{league.flag}</span>
            <span className="league-name">{league.name}</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }}>{league.country}</span>
          </div>
          <div className="league-header-right">
            {league.standingsUrl && (
              <a href={league.standingsUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}
                onClick={e => e.stopPropagation()}>
                Classement ↗
              </a>
            )}
            <span className={`league-chevron ${collapsed ? '' : 'open'}`}>▾</span>
          </div>
        </button>
      </div>

      {!collapsed && (
        <div className="league-matches">
          {fixtures.length === 0
            ? <div style={{ padding: '1rem 1.25rem', color: 'var(--text-sub)', fontSize: 13 }}>Saison terminée</div>
            : fixtures.map(f => <MatchRow key={f.id} fixture={f} />)
          }
        </div>
      )}
    </section>
  );
}
