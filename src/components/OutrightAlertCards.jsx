// Cartes d'alerte Outrights (28 juillet 2026) — modelées sur FootballResultCard/BTTSAlertCard
// (FootballAlertCards.jsx), réutilise les mêmes classes CSS partagées (bet-card, bc-header,
// bc-team, bc-edge-badge...). Pas de fixtureDate/countdown ici (un outright n'a pas de coup
// d'envoi précis, la "fenêtre" c'est la saison entière) — pas de navigation vers une page match
// non plus (pas de fiche dédiée par équipe hors de la page Outrights elle-même).
//
// Distinction des 2 types : texte entre parenthèses à côté du titre (pas la couleur, revu le 28
// juillet 2026 suite retour utilisateur) — la couleur/bordure code le SPORT (vert foot, orange
// basket, mêmes couleurs que le compte à rebours du Dashboard), pas le type d'alerte.

import { marketLabel } from '../utils/outrightMarkets';

const OUTRIGHT_COMP_META = {
  ligue1:     { name: 'Ligue 1',        flag: '🇫🇷' },
  pl:         { name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  laliga:     { name: 'La Liga',        flag: '🇪🇸' },
  seriea:     { name: 'Serie A',        flag: '🇮🇹' },
  bundesliga: { name: 'Bundesliga',     flag: '🇩🇪' },
  nba:        { name: 'NBA',            flag: '🏀' },
  wnba:       { name: 'WNBA',           flag: '🏀' },
};

const BOOK_LABELS = { betclic: 'Betclic', pmu: 'PMU', pinnacle: 'Pinnacle' };
const BOOK_COLORS = { betclic: '#e0292e', pmu: '#166534', pinnacle: '#e5e7eb' };

// Mêmes clés/mêmes libellés que OutrightsPage.jsx (fiche de compétition) — évite d'afficher les
// noms de variables bruts (pace/attackDefense/winPct...) tels quels dans la carte d'alerte.
const COMPONENT_LABELS = {
  pace: 'Classement', form: 'Forme', attackDefense: 'Attaque/Déf.', schedule: 'Calendrier', trophy: 'Historique',
  winPct: 'Bilan V-D', netRating: 'Net rating',
};

const SPORT_COLOR = { football: '#4ade80', basketball: '#fb923c' };

function CardShell({ alert, typeLabel, icon, headline, children, onAccept, onReject, onDismiss }) {
  const meta = OUTRIGHT_COMP_META[alert.compKey] || { name: alert.compLabel || alert.compKey, flag: '🏆' };
  const sportColor = SPORT_COLOR[alert.sport] || '#60a5fa';
  const isPending  = alert.status === 'pending';
  const isAccepted = alert.status === 'accepted';
  const isSettled  = alert.status === 'won' || alert.status === 'lost';

  return (
    <div className="bet-card" style={{ position: 'relative', overflow: 'hidden', '--league-accent': sportColor, borderColor: `${sportColor}40` }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${sportColor}, transparent)` }} />
      {isPending && (
        <button onClick={e => { e.stopPropagation(); onReject(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7.5" stroke="#ef4444" strokeWidth="1.5" /><path d="M6 6l6 6M12 6l-6 6" stroke="#ef4444" strokeWidth="1.75" strokeLinecap="round" /></svg>
        </button>
      )}
      {!isPending && !isSettled && (
        <button onClick={e => { e.stopPropagation(); onDismiss(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      )}

      <div className="bc-header">
        <span className="bc-flag">{meta.flag}</span>
        <span className="bc-league">{meta.name} — Outright</span>
        <div style={{ marginLeft: 'auto', marginRight: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
          {!isPending && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
              color: isAccepted ? '#4ade80' : alert.status === 'won' ? '#4ade80' : alert.status === 'lost' ? '#f87171' : '#f87171',
              background: isAccepted ? 'rgba(74,222,128,0.12)' : alert.status === 'won' ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)',
            }}>
              {isAccepted ? '✓ Accepté' : alert.status === 'won' ? '✓ Gagné' : alert.status === 'lost' ? '✗ Perdu' : '✗ Rejeté'}
            </span>
          )}
        </div>
      </div>

      <div style={{ marginTop: '0.35rem' }}>
        <span className="bc-team" style={{ fontSize: 14, fontWeight: 700 }}>{alert.team}</span>
        <span style={{ fontSize: 10.5, color: 'var(--text-dim)', marginLeft: 6 }}>
          ({typeLabel}{alert.market ? ` · ${marketLabel(alert.market)}` : ''})
        </span>
      </div>

      <div style={{ margin: '0.3rem 0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: sportColor, background: `${sportColor}1a`, padding: '0.25rem 0.5rem', borderRadius: 6, whiteSpace: 'nowrap' }}>
          {icon} {headline}
        </span>
      </div>

      {alert.valueUpFrom != null && (
        <div style={{ fontSize: 10, color: '#4ade80', marginBottom: '0.4rem' }}>
          🔼 Meilleure cote qu'à ta 1ère prise ({Number(alert.valueUpFrom).toFixed(2)}) — mise supplémentaire optionnelle
        </div>
      )}

      {children}
    </div>
  );
}

export function OutrightModelCard({ alert, onAccept, onReject, onDismiss }) {
  const isPending = alert.status === 'pending';
  return (
    <CardShell alert={alert} typeLabel="Modèle perso" icon="📊" headline={`Score modèle ${alert.score}/100`} onAccept={onAccept} onReject={onReject} onDismiss={onDismiss}>
      {alert.components && (
        <div style={{ fontSize: 9.5, color: 'var(--text-dim)', margin: '0.3rem 0 0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {Object.entries(alert.components).map(([k, v]) => <span key={k}>{COMPONENT_LABELS[k] || k} : <b style={{ color: 'var(--text)' }}>{v}</b></span>)}
        </div>
      )}
      {alert.books && Object.keys(alert.books).length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {Object.entries(alert.books).map(([bk, odds]) => (
            <div key={bk}
              onClick={isPending ? () => onAccept(alert.id, bk, odds) : undefined}
              style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '0.3rem', cursor: isPending ? 'pointer' : 'default' }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{BOOK_LABELS[bk] || bk}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: BOOK_COLORS[bk] || 'var(--text)' }}>{Number(odds).toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}

export function OutrightGapCard({ alert, onAccept, onReject, onDismiss }) {
  const isPending = alert.status === 'pending';
  return (
    <CardShell alert={alert} typeLabel="Écart de cote" icon="💎" headline={`Edge +${alert.edge}% vs Pinnacle`} onAccept={onAccept} onReject={onReject} onDismiss={onDismiss}>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <div style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: '0.3rem' }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>Pinnacle (réf.)</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: BOOK_COLORS.pinnacle }}>{Number(alert.pinnacleOdds).toFixed(2)}</div>
        </div>
        <div
          onClick={isPending ? () => onAccept(alert.id, alert.bookmaker, alert.odds) : undefined}
          style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '0.3rem', cursor: isPending ? 'pointer' : 'default' }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{BOOK_LABELS[alert.bookmaker] || alert.bookmaker}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: BOOK_COLORS[alert.bookmaker] || 'var(--text)' }}>{Number(alert.odds).toFixed(2)}</div>
        </div>
      </div>
    </CardShell>
  );
}
