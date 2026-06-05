const BM_LABELS = {
  pinnacle: 'Pinnacle',
  betfair:  'Betfair',
  unibet:   'Unibet',
  betclic:  'Betclic',
  winamax:  'Winamax',
};

const BM_COLORS = {
  unibet:  '#1db954',
  betclic: '#e0292e',
  winamax: '#ffffff',
};

function getBest(bookmakers, outcomes) {
  const best = {};
  for (const o of outcomes) {
    const vals = Object.values(bookmakers).map(b => b?.[o]).filter(v => v != null);
    best[o] = vals.length ? Math.max(...vals) : null;
  }
  return best;
}

function getEdge(pinnacle, bookOdds, outcome, marketType) {
  if (!pinnacle || !bookOdds?.[outcome] || !pinnacle?.[outcome]) return null;
  const keys = marketType === 'h2h' ? ['home', 'draw', 'away'] : ['yes', 'no'];
  const overround = keys.reduce((s, k) => s + 1 / (pinnacle[k] || Infinity), 0);
  const fairProb = (1 / pinnacle[outcome]) / overround;
  return +((bookOdds[outcome] * fairProb - 1) * 100).toFixed(1);
}

function OddsRow({ bm, odds, best, pinnacle, outcomes, marketType }) {
  const color = BM_COLORS[bm];
  return (
    <tr>
      <td className="bm-name">{BM_LABELS[bm] || bm}</td>
      {outcomes.map(outcome => {
        const val = odds?.[outcome];
        const isBest = val != null && val === best[outcome];
        const edge = bm !== 'pinnacle' && pinnacle ? getEdge(pinnacle, odds, outcome, marketType) : null;
        return (
          <td key={outcome} className={`odds-cell${isBest ? ' odds-best' : ''}${edge > 0 ? ' odds-value' : ''}`}>
            <span className="odds-val" style={color ? { color } : undefined}>{val != null ? val.toFixed(2) : '—'}</span>
            {edge != null && edge > 0 && <span className="odds-edge">+{edge}%</span>}
          </td>
        );
      })}
    </tr>
  );
}

export default function OddsTable({ markets, homeTeam, awayTeam }) {
  if (!markets || Object.keys(markets).length === 0) {
    return <p className="odds-empty">Cotes non disponibles pour ce match.</p>;
  }

  const homeLast = homeTeam.split(' ').slice(-1)[0];
  const awayLast = awayTeam.split(' ').slice(-1)[0];

  return (
    <div className="odds-tables">
      {markets.h2h?.bookmakers && (() => {
        const bms = markets.h2h.bookmakers;
        const outcomes = ['home', 'draw', 'away'];
        const best = getBest(bms, outcomes);
        const pinnacle = bms.pinnacle;
        return (
          <div className="odds-section">
            <p className="odds-market-label">1X2</p>
            <table className="odds-table">
              <thead>
                <tr>
                  <th className="bm-col">Bookmaker</th>
                  <th>1 · {homeLast}</th>
                  <th>X</th>
                  <th>2 · {awayLast}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(bms).map(([bm, odds]) => (
                  <OddsRow key={bm} bm={bm} odds={odds} best={best} pinnacle={bm !== 'pinnacle' ? pinnacle : null} outcomes={outcomes} marketType="h2h" />
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {markets.btts?.bookmakers && (() => {
        const bms = markets.btts.bookmakers;
        const outcomes = ['yes', 'no'];
        const best = getBest(bms, outcomes);
        const pinnacle = bms.pinnacle;
        return (
          <div className="odds-section">
            <p className="odds-market-label">Les deux équipes marquent (BTTS)</p>
            <table className="odds-table">
              <thead>
                <tr>
                  <th className="bm-col">Bookmaker</th>
                  <th>Oui</th>
                  <th>Non</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(bms).map(([bm, odds]) => (
                  <OddsRow key={bm} bm={bm} odds={odds} best={best} pinnacle={bm !== 'pinnacle' ? pinnacle : null} outcomes={outcomes} marketType="btts" />
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}
