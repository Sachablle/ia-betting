import { useNavigate } from 'react-router-dom';
import { cachedFetch } from '../utils/fetchCache';

const _prefetchedFb = new Set();
function _prefetchFbMatch(alert) {
  const key = alert.fixtureId || `${alert.league}__${alert.home}__${alert.away}`;
  if (!key || _prefetchedFb.has(key)) return;
  _prefetchedFb.add(key);
  import('../pages/MatchDetailPage').catch(() => {});
  cachedFetch('/api/odds', 30_000).catch(() => {});
  const euCupLeagues = ['europa', 'conference', 'champions'];
  if (alert.league === 'cdm') cachedFetch('/api/fd/worldcup', 30_000).catch(() => {});
  else if (euCupLeagues.includes(alert.league)) cachedFetch(`/api/football/eucup/${alert.league}/matches`, 30_000).catch(() => {});
  else if (alert.league) cachedFetch(`/api/football/standings/${alert.league}`, 30 * 60_000).catch(() => {});
}

export const FB_LEAGUE_META = {
  ligue1:     { name: 'Ligue 1',        flag: '🇫🇷' },
  pl:         { name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  laliga:     { name: 'La Liga',        flag: '🇪🇸' },
  bundes:     { name: 'Bundesliga',     flag: '🇩🇪' },
  seriea:     { name: 'Serie A',        flag: '🇮🇹' },
  cdm:        { name: 'Coupe du Monde', flag: '🌍' },
  bresil:     { name: 'Brasileirão',    flag: '🇧🇷' },
  europa:     { name: 'Europa League',  flag: '🏆' },
  conference: { name: 'Conference League', flag: '🥉' },
  champions:  { name: 'Ligue des Champions', flag: '⭐' },
};

export function BTTSAlertCard({ alert, onAccept, onReject, onDismiss }) {
  const navigate = useNavigate();
  const meta = FB_LEAGUE_META[alert.league] || { name: alert.league, flag: '⚽' };
  const isPending  = alert.status === 'pending';
  const isAccepted = alert.status === 'accepted';

  const now = Date.now();
  const msLeft    = new Date(alert.fixtureDate).getTime() - now;
  const hoursLeft = msLeft / 3_600_000;
  const daysLeft  = Math.floor(hoursLeft / 24);
  const hRem      = Math.floor(hoursLeft % 24);
  const mRem      = Math.floor((msLeft % 3_600_000) / 60_000);
  const timeLabel = msLeft <= 0 ? 'Imminent' : daysLeft > 0 ? `${daysLeft}j ${hRem}h` : hoursLeft >= 1 ? `${Math.floor(hoursLeft)}h ${mRem}m` : `${mRem}m`;
  const barPct    = Math.min(Math.max(msLeft / (7 * 24 * 3_600_000) * 100, 0), 100);

  return (
    <div
      className="bet-card"
      style={{ position: 'relative', '--league-accent': '#10b981', borderColor: 'rgba(16,185,129,0.25)', cursor: alert.fixtureId ? 'pointer' : 'default' }}
      onClick={() => { if (alert.fixtureId) navigate(`/football/${alert.fixtureId}`); }}
      onMouseEnter={alert.fixtureId ? () => _prefetchFbMatch(alert) : undefined}
    >
      {isPending
        ? <button onClick={e => { e.stopPropagation(); onReject(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}><svg width="14" height="14" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7.5" stroke="#ef4444" strokeWidth="1.5"/><path d="M6 6l6 6M12 6l-6 6" stroke="#ef4444" strokeWidth="1.75" strokeLinecap="round"/></svg></button>
        : <button onClick={e => { e.stopPropagation(); onDismiss(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      }
      <div className="bc-header">
        <span className="bc-flag">{meta.flag}</span>
        <span className="bc-league">{meta.name}</span>
        <div style={{ marginLeft: 'auto', marginRight: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`bc-edge-badge ${alert.probability >= 85 ? 'high' : 'mid'}`}>{alert.probability}%</span>
          {!isPending && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: isAccepted ? '#4ade80' : '#f87171', background: isAccepted ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)' }}>
              {isAccepted ? '✓ Accepté' : '✗ Rejeté'}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.35rem', minWidth: 0 }}>
        <span className="bc-team bc-team-home" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alert.fixture}</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, whiteSpace: 'nowrap' }}>
          {new Date(alert.fixtureDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{alert.round ? ` · ${alert.round}` : ''}
        </span>
      </div>

      <div style={{ margin: '0.3rem 0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '0.25rem 0.5rem', borderRadius: 6 }}>✓ Les deux équipes marquent</span>
        {alert.edge != null && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
            edge <b style={{ color: alert.edge >= 3 ? '#10b981' : 'var(--text-dim)' }}>{alert.edge >= 0 ? '+' : ''}{alert.edge}%</b>
          </span>
        )}
      </div>

      <div className="bc-stats" style={{ margin: '0 0 0.35rem' }}>
        <div className="bc-prob">
          <div className="bc-prob-bar-track">
            <div className="bc-prob-bar-fill" style={{ width: `${barPct}%`, background: '#60a5fa' }} />
          </div>
          <span className="bc-prob-pct" style={{ color: '#60a5fa', fontSize: 10 }}>{timeLabel}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {[{ label: 'Pinnacle', odds: alert.pinnacleOdds, color: 'var(--text)' }, { label: 'Unibet', odds: alert.unibetOdds, color: '#1db954' }, { label: 'Betclic', odds: alert.betclicOdds, color: '#e0292e' }, { label: 'Winamax', odds: alert.winamaxOdds, color: '#e5e7eb' }]
          .filter(b => b.odds)
          .map(({ label, odds, color }) => (
            <div key={label}
              onClick={isPending ? e => { e.stopPropagation(); onAccept(alert.id, label.toLowerCase(), odds); } : undefined}
              style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '0.3rem', cursor: isPending ? 'pointer' : 'default', transition: 'background 0.15s' }}
              onMouseEnter={isPending ? e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)' : undefined}
              onMouseLeave={isPending ? e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)' : undefined}
            >
              <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{odds.toFixed(2)}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

export function FootballTotalCard({ alert, onAccept, onReject, onDismiss }) {
  const navigate = useNavigate();
  const meta = FB_LEAGUE_META[alert.league] || { name: alert.league, flag: '⚽' };
  const isPending  = alert.status === 'pending';
  const isAccepted = alert.status === 'accepted';
  const isOver     = alert.direction === 'over';
  const accent     = isOver ? '#4ade80' : '#f87171';

  const now = Date.now();
  const msLeft    = new Date(alert.fixtureDate).getTime() - now;
  const hoursLeft = msLeft / 3_600_000;
  const daysLeft  = Math.floor(hoursLeft / 24);
  const hRem      = Math.floor(hoursLeft % 24);
  const mRem      = Math.floor((msLeft % 3_600_000) / 60_000);
  const timeLabel = msLeft <= 0 ? 'Imminent' : daysLeft > 0 ? `${daysLeft}j ${hRem}h` : hoursLeft >= 1 ? `${Math.floor(hoursLeft)}h ${mRem}m` : `${mRem}m`;
  const barPct    = Math.min(Math.max(msLeft / (7 * 24 * 3_600_000) * 100, 0), 100);

  return (
    <div
      className="bet-card"
      style={{ position: 'relative', '--league-accent': '#10b981', borderColor: 'rgba(16,185,129,0.25)', cursor: alert.fixtureId ? 'pointer' : 'default' }}
      onClick={() => { if (alert.fixtureId) navigate(`/football/${alert.fixtureId}`); }}
      onMouseEnter={alert.fixtureId ? () => _prefetchFbMatch(alert) : undefined}
    >
      {isPending
        ? <button onClick={e => { e.stopPropagation(); onReject(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}><svg width="14" height="14" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7.5" stroke="#ef4444" strokeWidth="1.5"/><path d="M6 6l6 6M12 6l-6 6" stroke="#ef4444" strokeWidth="1.75" strokeLinecap="round"/></svg></button>
        : <button onClick={e => { e.stopPropagation(); onDismiss(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      }
      <div className="bc-header">
        <span className="bc-flag">{meta.flag}</span>
        <span className="bc-league">{meta.name}</span>
        <div style={{ marginLeft: 'auto', marginRight: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`bc-edge-badge ${alert.probability >= 85 ? 'high' : 'mid'}`}>{alert.probability}%</span>
          {!isPending && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: isAccepted ? '#4ade80' : '#f87171', background: isAccepted ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)' }}>
              {isAccepted ? '✓ Accepté' : '✗ Rejeté'}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.35rem', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
          <span className="bc-team bc-team-home" style={{ whiteSpace: 'nowrap' }}>{alert.home || alert.homeShort}</span>
          <span className="bc-vs">vs</span>
          <span className="bc-team bc-team-away" style={{ whiteSpace: 'nowrap' }}>{alert.away || alert.awayShort}</span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {new Date(alert.fixtureDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{alert.round ? ` · ${alert.round}` : ''}
        </span>
      </div>

      <div style={{ margin: '0.3rem 0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent, background: isOver ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', padding: '0.25rem 0.5rem', borderRadius: 6, whiteSpace: 'nowrap' }}>
          {isOver ? '▲ Plus' : '▼ Moins'} de {alert.line} buts
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, whiteSpace: 'nowrap' }}>
          modèle <b style={{ color: 'var(--text)' }}>{alert.estimated}</b>
          {alert.edge != null && <> · <b style={{ color: accent }}>{alert.edge >= 0 ? '+' : ''}{alert.edge}%</b></>}
        </span>
      </div>

      <div className="bc-stats" style={{ margin: '0 0 0.35rem' }}>
        <div className="bc-prob">
          <div className="bc-prob-bar-track">
            <div className="bc-prob-bar-fill" style={{ width: `${barPct}%`, background: '#60a5fa' }} />
          </div>
          <span className="bc-prob-pct" style={{ color: '#60a5fa', fontSize: 10 }}>{timeLabel}</span>
        </div>
      </div>

      {(alert.unibetOdds || alert.betclicOdds || alert.winamaxOdds) && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { label: 'Unibet',  odds: alert.unibetOdds,  color: '#1db954' },
            { label: 'Betclic', odds: alert.betclicOdds, color: '#e0292e' },
            { label: 'Winamax', odds: alert.winamaxOdds, color: '#e5e7eb' },
          ].filter(b => b.odds).map(({ label, odds, color }) => (
            <div key={label}
              onClick={isPending ? e => { e.stopPropagation(); onAccept(alert.id, label.toLowerCase(), odds); } : undefined}
              style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '0.3rem', cursor: isPending ? 'pointer' : 'default', transition: 'background 0.15s' }}
              onMouseEnter={isPending ? e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)' : undefined}
              onMouseLeave={isPending ? e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)' : undefined}
            >
              <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{odds.toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FootballResultCard({ alert, onAccept, onReject, onDismiss }) {
  const navigate = useNavigate();
  const meta = FB_LEAGUE_META[alert.league] || { name: alert.league, flag: '⚽' };
  const isPending  = alert.status === 'pending';
  const isAccepted = alert.status === 'accepted';
  const accent     = '#fbbf24';

  const now = Date.now();
  const msLeft    = new Date(alert.fixtureDate).getTime() - now;
  const hoursLeft = msLeft / 3_600_000;
  const daysLeft  = Math.floor(hoursLeft / 24);
  const hRem      = Math.floor(hoursLeft % 24);
  const mRem      = Math.floor((msLeft % 3_600_000) / 60_000);
  const timeLabel = msLeft <= 0 ? 'Imminent' : daysLeft > 0 ? `${daysLeft}j ${hRem}h` : hoursLeft >= 1 ? `${Math.floor(hoursLeft)}h ${mRem}m` : `${mRem}m`;
  const barPct    = Math.min(Math.max(msLeft / (7 * 24 * 3_600_000) * 100, 0), 100);

  const resultLabel = alert.direction === 'draw'
    ? 'Match nul'
    : `Victoire ${alert.direction === 'home' ? (alert.homeShort || alert.home) : (alert.awayShort || alert.away)}`;

  return (
    <div
      className="bet-card"
      style={{ position: 'relative', '--league-accent': '#10b981', borderColor: 'rgba(16,185,129,0.25)', cursor: alert.fixtureId ? 'pointer' : 'default' }}
      onClick={() => { if (alert.fixtureId) navigate(`/football/${alert.fixtureId}`); }}
      onMouseEnter={alert.fixtureId ? () => _prefetchFbMatch(alert) : undefined}
    >
      {isPending
        ? <button onClick={e => { e.stopPropagation(); onReject(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}><svg width="14" height="14" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7.5" stroke="#ef4444" strokeWidth="1.5"/><path d="M6 6l6 6M12 6l-6 6" stroke="#ef4444" strokeWidth="1.75" strokeLinecap="round"/></svg></button>
        : <button onClick={e => { e.stopPropagation(); onDismiss(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      }
      <div className="bc-header">
        <span className="bc-flag">{meta.flag}</span>
        <span className="bc-league">{meta.name}</span>
        <div style={{ marginLeft: 'auto', marginRight: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`bc-edge-badge ${alert.probability >= 85 ? 'high' : 'mid'}`}>{alert.probability}%</span>
          {!isPending && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: isAccepted ? '#4ade80' : '#f87171', background: isAccepted ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)' }}>
              {isAccepted ? '✓ Accepté' : '✗ Rejeté'}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.35rem', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
          <span className="bc-team bc-team-home" style={{ whiteSpace: 'nowrap' }}>{alert.home || alert.homeShort}</span>
          <span className="bc-vs">vs</span>
          <span className="bc-team bc-team-away" style={{ whiteSpace: 'nowrap' }}>{alert.away || alert.awayShort}</span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {new Date(alert.fixtureDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{alert.round ? ` · ${alert.round}` : ''}
        </span>
      </div>

      <div style={{ margin: '0.3rem 0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent, background: 'rgba(251,191,36,0.1)', padding: '0.25rem 0.5rem', borderRadius: 6, whiteSpace: 'nowrap' }}>
          🏆 {resultLabel}
        </span>
        {alert.edge != null && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
            edge <b style={{ color: accent }}>{alert.edge >= 0 ? '+' : ''}{alert.edge}%</b>
          </span>
        )}
      </div>

      <div className="bc-stats" style={{ margin: '0 0 0.35rem' }}>
        <div className="bc-prob">
          <div className="bc-prob-bar-track">
            <div className="bc-prob-bar-fill" style={{ width: `${barPct}%`, background: '#60a5fa' }} />
          </div>
          <span className="bc-prob-pct" style={{ color: '#60a5fa', fontSize: 10 }}>{timeLabel}</span>
        </div>
      </div>

      {(alert.unibetOdds || alert.betclicOdds || alert.winamaxOdds) && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { label: 'Unibet',  odds: alert.unibetOdds,  color: '#1db954' },
            { label: 'Betclic', odds: alert.betclicOdds, color: '#e0292e' },
            { label: 'Winamax', odds: alert.winamaxOdds, color: '#e5e7eb' },
          ].filter(b => b.odds).map(({ label, odds, color }) => (
            <div key={label}
              onClick={isPending ? e => { e.stopPropagation(); onAccept(alert.id, label.toLowerCase(), odds); } : undefined}
              style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '0.3rem', cursor: isPending ? 'pointer' : 'default', transition: 'background 0.15s' }}
              onMouseEnter={isPending ? e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)' : undefined}
              onMouseLeave={isPending ? e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)' : undefined}
            >
              <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{odds.toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Value Bet vs Pinnacle (25 juin 2026) — méthode indépendante de FootballResultCard : ici l'edge
// vient de la comparaison cote bookmaker / ligne Pinnacle démarginée, pas de notre modèle Poisson
// (même si les deux portent parfois sur la même issue du même match). Accent cyan dédié + mention
// explicite "vs Pinnacle" pour qu'on ne confonde jamais les deux méthodes au premier coup d'œil.
export function PinnacleEdgeCard({ alert, onAccept, onReject, onDismiss }) {
  const navigate = useNavigate();
  const meta = FB_LEAGUE_META[alert.league] || { name: alert.league, flag: '⚽' };
  const isPending  = alert.status === 'pending';
  const isAccepted = alert.status === 'accepted';
  const accent     = '#22d3ee';

  const now = Date.now();
  const msLeft    = new Date(alert.fixtureDate).getTime() - now;
  const hoursLeft = msLeft / 3_600_000;
  const daysLeft  = Math.floor(hoursLeft / 24);
  const hRem      = Math.floor(hoursLeft % 24);
  const mRem      = Math.floor((msLeft % 3_600_000) / 60_000);
  const timeLabel = msLeft <= 0 ? 'Imminent' : daysLeft > 0 ? `${daysLeft}j ${hRem}h` : hoursLeft >= 1 ? `${Math.floor(hoursLeft)}h ${mRem}m` : `${mRem}m`;
  const barPct    = Math.min(Math.max(msLeft / (7 * 24 * 3_600_000) * 100, 0), 100);

  const isTotals = alert.market === 'totals';
  const resultLabel = isTotals
    ? `${alert.direction === 'over' ? '▲ Plus' : '▼ Moins'} de ${alert.line} buts`
    : alert.direction === 'draw'
      ? 'Match nul'
      : `Victoire ${alert.direction === 'home' ? (alert.homeShort || alert.home) : (alert.awayShort || alert.away)}`;

  return (
    <div
      className="bet-card"
      style={{ position: 'relative', '--league-accent': accent, borderColor: 'rgba(34,211,238,0.25)', cursor: alert.fixtureId ? 'pointer' : 'default' }}
      onClick={() => { if (alert.fixtureId) navigate(`/football/${alert.fixtureId}`); }}
      onMouseEnter={alert.fixtureId ? () => _prefetchFbMatch(alert) : undefined}
    >
      {isPending
        ? <button onClick={e => { e.stopPropagation(); onReject(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}><svg width="14" height="14" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7.5" stroke="#ef4444" strokeWidth="1.5"/><path d="M6 6l6 6M12 6l-6 6" stroke="#ef4444" strokeWidth="1.75" strokeLinecap="round"/></svg></button>
        : <button onClick={e => { e.stopPropagation(); onDismiss(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      }
      <div className="bc-header">
        <span className="bc-flag">{meta.flag}</span>
        <span className="bc-league">{meta.name}</span>
        <span style={{ fontSize: 8, fontWeight: 700, color: accent, border: `1px solid ${accent}55`, background: 'rgba(34,211,238,0.1)', borderRadius: 4, padding: '1px 5px', marginLeft: 6 }}>VS PINNACLE</span>
        <div style={{ marginLeft: 'auto', marginRight: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`bc-edge-badge ${alert.probability >= 85 ? 'high' : 'mid'}`}>{alert.probability}%</span>
          {!isPending && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: isAccepted ? '#4ade80' : '#f87171', background: isAccepted ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)' }}>
              {isAccepted ? '✓ Accepté' : '✗ Rejeté'}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.35rem', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
          <span className="bc-team bc-team-home" style={{ whiteSpace: 'nowrap' }}>{alert.home || alert.homeShort}</span>
          <span className="bc-vs">vs</span>
          <span className="bc-team bc-team-away" style={{ whiteSpace: 'nowrap' }}>{alert.away || alert.awayShort}</span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {new Date(alert.fixtureDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{alert.round ? ` · ${alert.round}` : ''}
        </span>
      </div>

      <div style={{ margin: '0.3rem 0' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent, background: 'rgba(34,211,238,0.1)', padding: '0.25rem 0.5rem', borderRadius: 6, display: 'inline-block' }}>
          💎 {resultLabel}
        </span>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3 }}>
          Pinnacle <b style={{ color: 'var(--text)' }}>{alert.pinnacleOdds?.toFixed(2)}</b>
          {' '}vs {alert.bookmaker} <b style={{ color: accent }}>{(alert[`${alert.bookmaker}Odds`])?.toFixed(2)}</b>
          {alert.edge != null && <> · <b style={{ color: accent }}>{alert.edge >= 0 ? '+' : ''}{alert.edge}%</b></>}
        </div>
      </div>

      <div className="bc-stats" style={{ margin: '0.3rem 0 0.35rem' }}>
        <div className="bc-prob">
          <div className="bc-prob-bar-track">
            <div className="bc-prob-bar-fill" style={{ width: `${barPct}%`, background: '#60a5fa' }} />
          </div>
          <span className="bc-prob-pct" style={{ color: '#60a5fa', fontSize: 10 }}>{timeLabel}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {[
          { label: 'Pinnacle', odds: alert.pinnacleOdds, color: 'var(--text)', ref: true },
          { label: 'Unibet',   odds: alert.unibetOdds,    color: '#1db954' },
          { label: 'Betclic',  odds: alert.betclicOdds,   color: '#e0292e' },
          { label: 'Winamax',  odds: alert.winamaxOdds,   color: '#e5e7eb' },
        ].filter(b => b.odds).map(({ label, odds, color, ref }) => {
          const isBest = !ref && label.toLowerCase() === alert.bookmaker;
          return (
            <div key={label}
              onClick={(isPending && !ref) ? e => { e.stopPropagation(); onAccept(alert.id, label.toLowerCase(), odds); } : undefined}
              style={{
                flex: 1, textAlign: 'center', borderRadius: 6, padding: '0.3rem',
                background: isBest ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.04)',
                border: isBest ? `1px solid ${accent}66` : '1px solid transparent',
                cursor: (isPending && !ref) ? 'pointer' : 'default', transition: 'background 0.15s',
              }}
              onMouseEnter={(isPending && !ref) ? e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)' : undefined}
              onMouseLeave={(isPending && !ref) ? e => e.currentTarget.style.background = isBest ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.04)' : undefined}
            >
              <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 2 }}>{label}{ref ? ' (réf.)' : ''}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{odds.toFixed(2)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DC_DIR_LABEL = { '1x': '1X', 'x2': 'X2', '12': '12' };
const DC_DIR_DESC  = { '1x': 'Dom. ou Nul', 'x2': 'Nul ou Ext.', '12': 'Dom. ou Ext.' };
const DC_ACCENT    = '#f59e0b'; // orange ambré

function DCBaseCard({ alert, suffix, onAccept, onReject, onDismiss }) {
  const navigate = useNavigate();
  const meta     = FB_LEAGUE_META[alert.league] || { name: alert.league, flag: '⚽' };
  const isPending  = alert.status === 'pending';
  const isAccepted = alert.status === 'accepted';
  const dir        = alert.direction || '1x';
  const now        = Date.now();
  const msLeft     = new Date(alert.fixtureDate).getTime() - now;
  const hoursLeft  = msLeft / 3_600_000;
  const daysLeft   = Math.floor(hoursLeft / 24);
  const hRem       = Math.floor(hoursLeft % 24);
  const mRem       = Math.floor((msLeft % 3_600_000) / 60_000);
  const timeLabel  = msLeft <= 0 ? 'Imminent' : daysLeft > 0 ? `${daysLeft}j ${hRem}h` : hoursLeft >= 1 ? `${Math.floor(hoursLeft)}h ${mRem}m` : `${mRem}m`;
  const barPct     = Math.min(Math.max(msLeft / (7 * 24 * 3_600_000) * 100, 0), 100);

  return (
    <div
      className="bet-card"
      style={{ position: 'relative', '--league-accent': DC_ACCENT, borderColor: 'rgba(245,158,11,0.25)', cursor: alert.fixtureId ? 'pointer' : 'default' }}
      onClick={() => { if (alert.fixtureId) navigate(`/football/${alert.fixtureId}`); }}
      onMouseEnter={alert.fixtureId ? () => _prefetchFbMatch(alert) : undefined}
    >
      {isPending
        ? <button onClick={e => { e.stopPropagation(); onReject(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}><svg width="14" height="14" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7.5" stroke="#ef4444" strokeWidth="1.5"/><path d="M6 6l6 6M12 6l-6 6" stroke="#ef4444" strokeWidth="1.75" strokeLinecap="round"/></svg></button>
        : <button onClick={e => { e.stopPropagation(); onDismiss(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      }
      <div className="bc-header">
        <span className="bc-flag">{meta.flag}</span>
        <span className="bc-league">{meta.name}</span>
        <div style={{ marginLeft: 'auto', marginRight: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`bc-edge-badge ${alert.probability >= 75 ? 'high' : 'mid'}`}>{alert.probability}%</span>
          {!isPending && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: isAccepted ? '#4ade80' : '#f87171', background: isAccepted ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)' }}>
              {isAccepted ? '✓ Accepté' : '✗ Rejeté'}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.35rem', minWidth: 0 }}>
        <span className="bc-team bc-team-home" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alert.home ?? alert.fixture} <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>vs</span> {alert.away}</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, whiteSpace: 'nowrap' }}>
          {new Date(alert.fixtureDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{alert.round ? ` · ${alert.round}` : ''}
        </span>
      </div>

      <div style={{ margin: '0.3rem 0' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: DC_ACCENT, background: 'rgba(245,158,11,0.1)', padding: '0.25rem 0.5rem', borderRadius: 6, display: 'inline-block' }}>
          {DC_DIR_LABEL[dir]} ({DC_DIR_DESC[dir]}) &amp; {suffix}
        </span>
      </div>

      <div className="bc-stats" style={{ margin: '0 0 0.35rem' }}>
        <div className="bc-prob">
          <div className="bc-prob-bar-track">
            <div className="bc-prob-bar-fill" style={{ width: `${barPct}%`, background: '#60a5fa' }} />
          </div>
          <span className="bc-prob-pct" style={{ color: '#60a5fa', fontSize: 10 }}>{timeLabel}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {[{ label: 'Unibet', odds: alert.unibetOdds, color: '#1db954' }, { label: 'Betclic', odds: alert.betclicOdds, color: '#e0292e' }]
          .filter(b => b.odds)
          .map(({ label, odds, color }) => (
            <div key={label}
              onClick={isPending ? e => { e.stopPropagation(); onAccept(alert.id, label.toLowerCase(), odds); } : undefined}
              style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '0.3rem', cursor: isPending ? 'pointer' : 'default', transition: 'background 0.15s' }}
              onMouseEnter={isPending ? e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)' : undefined}
              onMouseLeave={isPending ? e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)' : undefined}
            >
              <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{odds.toFixed(2)}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

export function DCBTTSAlertCard({ alert, onAccept, onReject, onDismiss }) {
  return <DCBaseCard alert={alert} suffix="BTTS Oui" onAccept={onAccept} onReject={onReject} onDismiss={onDismiss} />;
}

export function DCOUAlertCard({ alert, onAccept, onReject, onDismiss }) {
  return <DCBaseCard alert={alert} suffix={`+${alert.line ?? 1.5} buts`} onAccept={onAccept} onReject={onReject} onDismiss={onDismiss} />;
}

// ─── Helpers pour FootballGroupCard ───────────────────────────────────────────
const DC_DIR_LABEL_G = { '1x': '1X', 'x2': 'X2', '12': '12' };

function alertRowMeta(alert) {
  switch (alert.type) {
    case 'football_btts':
      return { label: 'Les deux équipes marquent', accent: '#10b981' };
    case 'football_total': {
      const over = alert.direction === 'over';
      return {
        label: `${over ? 'Plus' : 'Moins'} de ${alert.line} buts${alert.estimated ? `  ·  modèle ${alert.estimated}` : ''}`,
        accent: over ? '#4ade80' : '#f87171',
      };
    }
    case 'football_result': {
      const dir = alert.direction;
      const name = dir === 'draw' ? 'Match nul' : `Victoire ${dir === 'home' ? (alert.homeShort || alert.home) : (alert.awayShort || alert.away)}`;
      return { label: name, accent: '#fbbf24' };
    }
    case 'football_pinnacle_edge': {
      const isTot = alert.market === 'totals';
      const name = isTot
        ? `${alert.direction === 'over' ? 'Plus' : 'Moins'} de ${alert.line}`
        : alert.direction === 'draw' ? 'Match nul' : `Victoire ${alert.direction === 'home' ? (alert.homeShort || alert.home) : (alert.awayShort || alert.away)}`;
      return { label: `${name}  ·  vs Pinnacle`, accent: '#22d3ee' };
    }
    case 'football_dc_btts':
      return { label: `${DC_DIR_LABEL_G[alert.direction] ?? alert.direction}  &  BTTS`, accent: '#f59e0b' };
    case 'football_dc_ou':
      return { label: `${DC_DIR_LABEL_G[alert.direction] ?? alert.direction}  &  +${alert.line ?? 1.5} buts`, accent: '#f59e0b' };
    default:
      return { label: alert.type, accent: '#6b7280' };
  }
}

function AlertRow({ alert, onAccept, onReject }) {
  const { label, accent } = alertRowMeta(alert);
  const isAccepted = alert.status === 'accepted';

  if (isAccepted) {
    const acceptedBk   = alert.acceptedBookmaker;
    const acceptedOdds = acceptedBk === 'unibet'  ? alert.acceptedUnibetOdds
                       : acceptedBk === 'betclic' ? alert.acceptedBetclicOdds
                       : null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.5rem 0.3rem 0.65rem', borderLeft: `2px solid ${accent}55`, opacity: 0.6 }}>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-dim)' }}>{label}</span>
        <span style={{ fontSize: 11, color: accent, flexShrink: 0 }}>{alert.acceptedProbability ?? alert.probability}%</span>
        {acceptedOdds && <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{acceptedOdds.toFixed(2)}</span>}
        <span style={{ fontSize: 10, color: '#4ade80', flexShrink: 0 }}>joué</span>
      </div>
    );
  }

  const books = [
    { key: 'unibet',  label: 'Unibet',  odds: alert.unibetOdds,  color: '#1db954' },
    { key: 'betclic', label: 'Betclic', odds: alert.betclicOdds, color: '#e0292e' },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.35rem 0.3rem 0.65rem', borderLeft: `2px solid ${accent}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#fff' }}>{label}</div>
        {alert.edge != null && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
            edge <span style={{ color: alert.edge >= 3 ? accent : 'var(--text-dim)' }}>{alert.edge >= 0 ? '+' : ''}{alert.edge}%</span>
          </div>
        )}
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: accent, flexShrink: 0, width: 36, textAlign: 'right' }}>{alert.probability}%</span>
      {books.map(({ key, label: bkLabel, odds, color }) => (
        <div key={key}
          onClick={odds ? e => { e.stopPropagation(); onAccept(alert, key, odds); } : undefined}
          style={{ textAlign: 'center', borderRadius: 4, padding: '0.15rem 0', flexShrink: 0, width: 54, border: '1px solid rgba(255,255,255,0.08)', transition: 'border-color 0.15s', cursor: odds ? 'pointer' : 'default', opacity: odds ? 1 : 0.35 }}
          onMouseEnter={odds ? e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' : undefined}
          onMouseLeave={odds ? e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' : undefined}
        >
          <div style={{ fontSize: 8, color: 'var(--text-dim)', marginBottom: 1 }}>{bkLabel}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: odds ? color : 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>{odds ? odds.toFixed(2) : '—'}</div>
        </div>
      ))}
      <button onClick={e => { e.stopPropagation(); onReject(alert); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', lineHeight: 1, flexShrink: 0, color: 'var(--text-dim)', fontSize: 14, opacity: 0.5 }}
        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
      >×</button>
    </div>
  );
}

export function FootballGroupCard({ group, onAccept, onReject, onDismissAll }) {
  const navigate = useNavigate();
  const { fixtureId, fixtureDate, alerts } = group;
  const first = alerts[0];
  const meta = FB_LEAGUE_META[first?.league] || { name: first?.league ?? '', flag: '⚽' };
  const homeLabel = first?.homeShort || first?.home || first?.fixture?.split(' vs ')[0] || '';
  const awayLabel = first?.awayShort || first?.away || first?.fixture?.split(' vs ')[1] || '';

  const now = Date.now();
  const msLeft    = new Date(fixtureDate).getTime() - now;
  const hoursLeft = msLeft / 3_600_000;
  const daysLeft  = Math.floor(hoursLeft / 24);
  const hRem      = Math.floor(hoursLeft % 24);
  const mRem      = Math.floor((msLeft % 3_600_000) / 60_000);
  const timeLabel = msLeft <= 0 ? 'Imminent' : daysLeft > 0 ? `${daysLeft}j ${hRem}h` : hoursLeft >= 1 ? `${Math.floor(hoursLeft)}h ${mRem}m` : `${mRem}m`;

  const sorted = [...alerts].sort((a, b) => {
    const aP = a.status === 'pending' ? 1 : 0;
    const bP = b.status === 'pending' ? 1 : 0;
    if (aP !== bP) return bP - aP;
    return b.probability - a.probability;
  });

  return (
    <div
      className="bet-card"
      style={{ position: 'relative', cursor: fixtureId ? 'pointer' : 'default', '--league-accent': '#10b981', borderColor: 'rgba(16,185,129,0.35)' }}
      onClick={() => { if (fixtureId) navigate(`/football/${fixtureId}`); }}
      onMouseEnter={fixtureId ? () => { import('../pages/MatchDetailPage').catch(()=>{}); cachedFetch('/api/odds',30_000).catch(()=>{}); } : undefined}
    >
      {/* Dismiss all */}
      <button
        onClick={e => { e.stopPropagation(); onDismissAll(alerts); }}
        style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'var(--text-dim)', fontSize: 16, opacity: 0.4 }}
        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
      >×</button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.45rem' }}>
        <span style={{ fontSize: 12 }}>{meta.flag}</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 500 }}>{meta.name}</span>
        {first?.round && first.round !== 'Jnull' && <span style={{ fontSize: 10, color: 'var(--text-dim)', opacity: 0.6 }}>· {first.round}</span>}
      </div>

      {/* Match + temps */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', paddingRight: 18, marginBottom: '0.4rem', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {homeLabel} <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 11 }}>vs</span> {awayLabel}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, whiteSpace: 'nowrap' }}>
          {new Date(fixtureDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          {msLeft > 0 && <span style={{ color: '#60a5fa', marginLeft: 4 }}>· {timeLabel}</span>}
        </div>
      </div>

      {/* Séparateur fin */}
      <div style={{ height: 1, background: 'var(--border)', marginBottom: '0.35rem', opacity: 0.5 }} />

      {/* Lignes alertes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {sorted.map(alert => (
          <AlertRow key={alert.id} alert={alert} onAccept={onAccept} onReject={onReject} />
        ))}
      </div>
    </div>
  );
}
