export default function BetCard({ bet }) {
  const { league, round, home, away, event, eventLabel, probability, odds, bookmaker, edge } = bet;

  return (
    <div className="bet-card" style={{ '--league-accent': league.accent }}>

      {/* Header ligue */}
      <div className="bc-header">
        <span className="bc-flag">{league.flag}</span>
        <span className="bc-league">{league.name}</span>
        <span className="bc-round">{round}</span>
        <span className={`bc-edge-badge ${edge >= 10 ? 'high' : edge >= 5 ? 'mid' : 'low'}`}>
          +{edge}% edge
        </span>
      </div>

      {/* Matchup */}
      <div className="bc-matchup">
        <span className="bc-team bc-team-home">{home.name}</span>
        <span className="bc-vs">vs</span>
        <span className="bc-team bc-team-away">{away.name}</span>
      </div>

      {/* Event */}
      <div className="bc-event">
        <span className="bc-event-tag">{event}</span>
        <span className="bc-event-label">{eventLabel}</span>
      </div>

      {/* Stats */}
      <div className="bc-stats">
        <div className="bc-prob">
          <div className="bc-prob-bar-track">
            <div className="bc-prob-bar-fill" style={{ width: `${probability}%` }} />
          </div>
          <span className="bc-prob-pct">{probability}%</span>
        </div>
        <div className="bc-odds">
          <span className="bc-odds-val">{odds.toFixed(2)}</span>
          <span className="bc-odds-book">{bookmaker}</span>
        </div>
      </div>

      {/* CTA */}
      <button className="bc-cta">Placer le bet →</button>

    </div>
  );
}
