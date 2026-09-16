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
  // fontSize explicite (14 septembre 2026) — sans lui, ce "—" hérite de la taille de police ambiante
  // (plus grande que le 11px du cas normal ci-dessous), ce qui rend UNIQUEMENT cette ligne plus haute
  // quand une cote manque — décale tout ce qui suit sur ce côté d'une colonne à deux équipes (ex.
  // "Buts par équipe") dès qu'un bookmaker manque des deux côtés Over ET Under à la fois.
  if (value == null) return <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 11 }}>—</div>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontWeight: isPinnacle ? 700 : 500, fontVariantNumeric: 'tabular-nums', fontSize: 11, color: isPinnacle ? '#60a5fa' : (color ?? undefined) }}>
        {value.toFixed(2)}
      </span>
      {/* Emplacement toujours réservé (même sans tendance) — sinon la présence/absence de la
          flèche décale le centrage de la cote elle-même d'une ligne à l'autre (30 juillet 2026). */}
      <span style={{ fontSize: 8, marginLeft: 5, width: 8, flexShrink: 0, display: 'inline-block', color: trend === 'up' ? '#4ade80' : '#f87171' }} title={trend === 'up' ? 'Cote en hausse' : trend === 'down' ? 'Cote en baisse' : undefined}>
        {trend === 'up' ? '▲' : trend === 'down' ? '▼' : ''}
      </span>
      {!isPinnacle && <EdgeBadge val={edge} />}
    </div>
  );
}
