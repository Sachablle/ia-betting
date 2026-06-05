import { useState } from 'react';
import BasketballMatchRow from './BasketballMatchRow';
import { getBballLeagueById } from '../utils/basketball';

export default function BasketballLeagueGroup({ leagueId, fixtures }) {
  const ssKey = `league_open_${leagueId}`;
  const [collapsed, setCollapsed] = useState(() => sessionStorage.getItem(ssKey) !== 'open');
  const league = getBballLeagueById(leagueId);
  if (!league) return null;

  const toggle = () => setCollapsed(c => { const next = !c; sessionStorage.setItem(ssKey, next ? 'closed' : 'open'); return next; });

  return (
    <section className="league-group" style={{ borderRadius: 10, overflow: 'hidden', marginBottom: '1.5rem', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${league.accent} 0%, transparent 100%)` }} />
      <div className="league-header" style={{ '--accent': league.accent }}>
        <button className="league-header-toggle" onClick={toggle}>
          <div className="league-header-left">
            {leagueId === 'euroleague'
              ? <img src="https://media.api-sports.io/basketball/leagues/120.png" alt="EuroLeague" className="league-flag" style={{ width: 26, height: 26, objectFit: 'contain' }} />
              : <span className="league-flag">{league.flag}</span>
            }
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
          {fixtures.map(f => <BasketballMatchRow key={f.id} fixture={f} />)}
        </div>
      )}
    </section>
  );
}
