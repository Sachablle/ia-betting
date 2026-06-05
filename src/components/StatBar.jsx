export default function StatBar({ label, home, away, unit = '', higherIsBetter = true }) {
  const total = home + away || 1;
  const homePct = (home / total) * 100;
  const awayPct = (away / total) * 100;
  const homeLeads = higherIsBetter ? home > away : home < away;
  const awayLeads = higherIsBetter ? away > home : away < home;

  return (
    <div className="stat-bar-row">
      <span className={`stat-val-left ${homeLeads ? 'stat-leading' : ''}`}>
        {home}{unit}
      </span>
      <div className="stat-bar-center">
        <span className="stat-label">{label}</span>
        <div className="stat-bar-track">
          <div
            className={`stat-bar-fill home ${homeLeads ? 'leading' : ''}`}
            style={{ width: `${homePct}%` }}
          />
          <div
            className={`stat-bar-fill away ${awayLeads ? 'leading' : ''}`}
            style={{ width: `${awayPct}%` }}
          />
        </div>
      </div>
      <span className={`stat-val-right ${awayLeads ? 'stat-leading' : ''}`}>
        {away}{unit}
      </span>
    </div>
  );
}
