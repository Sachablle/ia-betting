// Cellule de cote partagée entre MatchDetailPage (foot) et BasketballDetailPage (basket) —
// avant le 22 juin 2026 chacune avait sa propre copie (tailles/styles divergents : foot 13px,
// basket 11px). Source unique désormais, pour que les deux sports affichent toujours pareil.

export function EdgeBadge({ val }) {
  if (val == null) return null;
  return (
    <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 4, color: '#ffffff' }}>
      (P = {val > 0 ? '+' : ''}{val.toFixed(1)}%)
    </span>
  );
}

export function OddsCell({ value, edge, isPinnacle, fairProb, color, trend }) {
  if (value == null) return <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>—</div>;
  return (
    <div style={{ textAlign: 'center' }}>
      <span style={{ fontWeight: isPinnacle ? 700 : 500, fontVariantNumeric: 'tabular-nums', fontSize: 11, color: isPinnacle ? '#60a5fa' : (color ?? undefined) }}>
        {value.toFixed(2)}
      </span>
      {trend && (
        <span style={{ fontSize: 8, marginLeft: 5, color: trend === 'up' ? '#4ade80' : '#f87171' }} title={trend === 'up' ? 'Cote en hausse' : 'Cote en baisse'}>
          {trend === 'up' ? '▲' : '▼'}
        </span>
      )}
      {!isPinnacle && <EdgeBadge val={edge} />}
    </div>
  );
}
