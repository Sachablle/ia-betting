// Détail d'un facteur du modèle (pace, défense, repos, redistribution...) — une ligne = un facteur,
// barre proportionnelle à son écart par rapport à 1.0 (neutre). Partagé entre la fiche match
// (BasketballDetailPage.jsx, panneau "Facteurs du modèle") et les cartes d'alerte (PlaceBetPage.jsx,
// 28 août 2026 — demande explicite de voir le détail de la barre "% du plafond" directement sur la
// carte, figé au moment où l'alerte est sortie).
export function fmtFactor(val) {
  const pct = ((val - 1) * 100);
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

export function FactorBar({ name, val, desc }) {
  const pct = (val - 1) * 100;
  const isPos = pct >= 0.5;
  const isNeg = pct <= -0.5;
  const barW = Math.min(100, Math.abs(pct) * 5);
  return (
    <div className="pf-row">
      <span className="pf-name">{name}</span>
      <div className="pf-bar-wrap">
        <div className={`pf-bar ${isPos ? 'pf-bar--pos' : isNeg ? 'pf-bar--neg' : 'pf-bar--neu'}`}
          style={{ width: `${barW}%` }} />
      </div>
      <span className={`pf-pct ${isPos ? 'pos' : isNeg ? 'neg' : ''}`}>
        {fmtFactor(val)}
      </span>
      <span className="pf-desc">{desc}</span>
    </div>
  );
}
