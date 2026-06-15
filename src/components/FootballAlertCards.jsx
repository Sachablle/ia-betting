import { useNavigate } from 'react-router-dom';

export const FB_LEAGUE_META = {
  ligue1:     { name: 'Ligue 1',        flag: '🇫🇷' },
  pl:         { name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  laliga:     { name: 'La Liga',        flag: '🇪🇸' },
  bundes:     { name: 'Bundesliga',     flag: '🇩🇪' },
  seriea:     { name: 'Serie A',        flag: '🇮🇹' },
  cdm:        { name: 'Coupe du Monde', flag: '🌍' },
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
    >
      {isPending
        ? <button onClick={e => { e.stopPropagation(); onReject(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}><svg width="14" height="14" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7.5" stroke="#ef4444" strokeWidth="1.5"/><path d="M6 6l6 6M12 6l-6 6" stroke="#ef4444" strokeWidth="1.75" strokeLinecap="round"/></svg></button>
        : <button onClick={e => { e.stopPropagation(); onDismiss(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      }
      <div className="bc-header">
        <span className="bc-flag">{meta.flag}</span>
        <span className="bc-league">{meta.name}</span>
        {!isPending && (
          <span style={{ marginLeft: 'auto', marginRight: 24, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: isAccepted ? '#4ade80' : '#f87171', background: isAccepted ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)' }}>
            {isAccepted ? '✓ Accepté' : '✗ Rejeté'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: '0.4rem', paddingRight: '4px' }}>
        <span className="bc-team bc-team-home">{alert.fixture}</span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem', flexShrink: 0 }}>
          <span className={`bc-edge-badge ${alert.probability >= 85 ? 'high' : 'mid'}`}>{alert.probability}%</span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            {new Date(alert.fixtureDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{alert.round ? ` · ${alert.round}` : ''}
          </span>
        </div>
      </div>

      <div style={{ margin: '0.4rem 0 0', padding: '0.45rem 0.6rem', borderRadius: 6, background: 'rgba(16,185,129,0.06)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>✓ Les deux équipes marquent</div>
        {alert.edge != null && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
            Edge vs Pinnacle : <b style={{ color: alert.edge >= 3 ? '#10b981' : 'var(--text-dim)' }}>{alert.edge >= 0 ? '+' : ''}{alert.edge}%</b>
          </div>
        )}
      </div>

      <div className="bc-stats" style={{ margin: '0.35rem 0 0.25rem' }}>
        <div className="bc-prob">
          <div className="bc-prob-bar-track">
            <div className="bc-prob-bar-fill" style={{ width: `${barPct}%`, background: '#10b981' }} />
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
    >
      {isPending
        ? <button onClick={e => { e.stopPropagation(); onReject(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}><svg width="14" height="14" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7.5" stroke="#ef4444" strokeWidth="1.5"/><path d="M6 6l6 6M12 6l-6 6" stroke="#ef4444" strokeWidth="1.75" strokeLinecap="round"/></svg></button>
        : <button onClick={e => { e.stopPropagation(); onDismiss(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      }
      <div className="bc-header">
        <span className="bc-flag">{meta.flag}</span>
        <span className="bc-league">{meta.name}</span>
        {!isPending && (
          <span style={{ marginLeft: 'auto', marginRight: 24, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: isAccepted ? '#4ade80' : '#f87171', background: isAccepted ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)' }}>
            {isAccepted ? '✓ Accepté' : '✗ Rejeté'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: '0.4rem', paddingRight: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span className="bc-team bc-team-home">{alert.homeShort || alert.home}</span>
          <span className="bc-vs">vs</span>
          <span className="bc-team bc-team-away">{alert.awayShort || alert.away}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem', flexShrink: 0 }}>
          <span className={`bc-edge-badge ${alert.probability >= 85 ? 'high' : 'mid'}`}>{alert.probability}%</span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            {new Date(alert.fixtureDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{alert.round ? ` · ${alert.round}` : ''}
          </span>
        </div>
      </div>

      <div style={{ margin: '0.6rem 0', padding: '0.45rem 0.6rem', borderRadius: 6, background: isOver ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: accent }}>
          {isOver ? '▲ Plus' : '▼ Moins'} de {alert.line} buts
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
          Modèle : <b style={{ color: 'var(--text)' }}>{alert.estimated}</b> buts attendus
          {alert.edge != null && <span> · Edge <b style={{ color: accent }}>{alert.edge >= 0 ? '+' : ''}{alert.edge}%</b></span>}
        </div>
      </div>

      <div className="bc-stats" style={{ margin: '0.35rem 0 0.25rem' }}>
        <div className="bc-prob">
          <div className="bc-prob-bar-track">
            <div className="bc-prob-bar-fill" style={{ width: `${barPct}%`, background: accent }} />
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
    >
      {isPending
        ? <button onClick={e => { e.stopPropagation(); onReject(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}><svg width="14" height="14" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7.5" stroke="#ef4444" strokeWidth="1.5"/><path d="M6 6l6 6M12 6l-6 6" stroke="#ef4444" strokeWidth="1.75" strokeLinecap="round"/></svg></button>
        : <button onClick={e => { e.stopPropagation(); onDismiss(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      }
      <div className="bc-header">
        <span className="bc-flag">{meta.flag}</span>
        <span className="bc-league">{meta.name}</span>
        {!isPending && (
          <span style={{ marginLeft: 'auto', marginRight: 24, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: isAccepted ? '#4ade80' : '#f87171', background: isAccepted ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)' }}>
            {isAccepted ? '✓ Accepté' : '✗ Rejeté'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: '0.4rem', paddingRight: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span className="bc-team bc-team-home">{alert.homeShort || alert.home}</span>
          <span className="bc-vs">vs</span>
          <span className="bc-team bc-team-away">{alert.awayShort || alert.away}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem', flexShrink: 0 }}>
          <span className={`bc-edge-badge ${alert.probability >= 85 ? 'high' : 'mid'}`}>{alert.probability}%</span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            {new Date(alert.fixtureDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{alert.round ? ` · ${alert.round}` : ''}
          </span>
        </div>
      </div>

      <div style={{ margin: '0.6rem 0', padding: '0.45rem 0.6rem', borderRadius: 6, background: 'rgba(251,191,36,0.06)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: accent }}>
          🏆 {resultLabel}
        </div>
        {alert.edge != null && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
            Edge : <b style={{ color: accent }}>{alert.edge >= 0 ? '+' : ''}{alert.edge}%</b>
          </div>
        )}
      </div>

      <div className="bc-stats" style={{ margin: '0.35rem 0 0.25rem' }}>
        <div className="bc-prob">
          <div className="bc-prob-bar-track">
            <div className="bc-prob-bar-fill" style={{ width: `${barPct}%`, background: accent }} />
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
