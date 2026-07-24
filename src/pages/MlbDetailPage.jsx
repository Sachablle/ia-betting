import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { cachedFetch } from '../utils/fetchCache';
import { formatFullDate, formatMatchTime } from '../utils/formatters';
import TeamLogo from '../components/TeamLogo';
import { OddsCell } from '../components/OddsCell';

// Page match MLB (24 juillet 2026) — même arborescence que MatchDetailPage/BasketballDetailPage
// (mêmes classes CSS .detail-hero/.detail-infobar/.info-chip, mêmes composants TeamLogo/OddsCell),
// mais volontairement plus légère : un seul marché existe pour ce sport (Over/Under runs), pas de
// composition d'équipe ni de props joueurs. Chantier en mode fantôme (voir bandeau "estimation
// interne" plus bas) — MLB_ALERTS_ENABLED=false côté backend tant que la calibration near-miss
// n'est pas vérifiée, donc aucune alerte ne peut apparaître sur cette page, juste des cotes et une
// estimation affichées à titre indicatif.
const LINES_ORDER = (a, b) => parseFloat(a) - parseFloat(b);

export default function MlbDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const gameId = (id || '').replace('mlb_', '');
  const [match, setMatch] = useState(null);
  const [odds, setOdds] = useState(null);
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Une seule route pour cotes + modèle (/api/mlb/preview inclut désormais les deux) — évite de
    // déclencher deux scrapings Betclic/Unibet en parallèle pour la même page.
    Promise.all([
      cachedFetch('/api/mlb/matches', 5 * 60_000).catch(() => ({ matches: [] })),
      cachedFetch('/api/mlb/preview', 5 * 60_000).catch(() => ({ games: [] })),
    ]).then(([matchesData, previewData]) => {
      if (cancelled) return;
      const m = (matchesData.matches || []).find(x => x.id === gameId);
      setMatch(m || null);
      if (m) {
        const p = (previewData.games || []).find(x => x.home === m.home.name && x.away === m.away.name);
        setOdds(p?.odds || null);
        setModel(p?.model || null);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [gameId]);

  if (loading) return <div className="page detail-page"><p style={{ color: 'var(--text-dim)' }}>Chargement…</p></div>;
  if (!match) return (
    <div className="page detail-page">
      <button className="back-btn" onClick={() => navigate('/sports')}>← Retour</button>
      <p style={{ color: 'var(--text-dim)' }}>Match introuvable.</p>
    </div>
  );

  const { home, away } = match;
  const isLive = match.status === 'STATUS_IN_PROGRESS';
  const isFinal = match.status === 'STATUS_FINAL';
  const homeWon = isFinal && home.score > away.score;
  const awayWon = isFinal && away.score > home.score;

  const lines = [...new Set([
    ...Object.keys(odds?.betclic?.totals || {}),
    ...Object.keys(odds?.unibet?.totals || {}),
  ])].sort(LINES_ORDER);
  const modelByLine = new Map((model?.lines || []).map(l => [String(l.line), l]));

  return (
    <div className="page detail-page">
      <button className="back-btn" onClick={() => navigate('/sports')}>← Retour</button>
      <div className="detail-breadcrumb">
        <span style={{ color: '#fb923c' }}>⚾ MLB</span>
        {match.venue && <><span className="bc-sep">·</span><span>{match.venue}</span></>}
      </div>

      {/* ── Hero ── */}
      <div className="detail-hero">
        <div className="detail-team home-team">
          <TeamLogo name={home.name} logoId={null} size={52} />
          <div className="dt-name">{home.name}</div>
        </div>

        <div className="detail-center">
          {isLive || isFinal ? (
            <>
              {isLive && <span className="mrd-live">● LIVE</span>}
              <div className="detail-time-big" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: isLive ? '#c62828' : (homeWon ? '#2e7d32' : 'var(--text)') }}>{home.score ?? '–'}</span>
                <span style={{ margin: '0 0.3em', color: 'var(--text-dim)' }}>–</span>
                <span style={{ color: isLive ? '#c62828' : (awayWon ? '#2e7d32' : 'var(--text)') }}>{away.score ?? '–'}</span>
              </div>
              {isFinal && <div className="detail-datetime">Terminé</div>}
            </>
          ) : (
            <>
              <div className="detail-vs">vs</div>
              <div className="detail-datetime">{formatFullDate(match.date)}</div>
              <div className="detail-time-big">{formatMatchTime(match.date)}</div>
            </>
          )}
        </div>

        <div className="detail-team away-team">
          <TeamLogo name={away.name} logoId={null} size={52} />
          <div className="dt-name">{away.name}</div>
        </div>
      </div>

      {/* ── Bandeau mode fantôme ── */}
      <div style={{
        margin: '0.75rem 0', padding: '8px 14px', borderRadius: 8,
        background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)',
        fontSize: 11, color: 'rgba(255,255,255,0.6)',
      }}>
        ⚾ Sport en phase de test — le modèle tourne et enregistre ses estimations pour vérifier sa fiabilité, mais aucune alerte n'est encore générée sur ce marché.
      </div>

      {!odds && !isFinal && (
        <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>Cotes pas encore disponibles pour ce match.</p>
      )}

      {/* ── Vainqueur (moneyline) ── */}
      {odds && (odds.betclic?.h2h || odds.unibet?.h2h) && (
        <div className="util-subsection" style={{ marginTop: '1rem' }}>
          <h3 className="util-subsection-title">Vainqueur</h3>
          <table className="util-table">
            <thead><tr><th></th><th>Betclic</th><th>Unibet</th></tr></thead>
            <tbody>
              <tr>
                <td>{home.name}</td>
                <td><OddsCell value={odds.betclic?.h2h?.home} /></td>
                <td><OddsCell value={odds.unibet?.h2h?.home} /></td>
              </tr>
              <tr>
                <td>{away.name}</td>
                <td><OddsCell value={odds.betclic?.h2h?.away} /></td>
                <td><OddsCell value={odds.unibet?.h2h?.away} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Total runs (Over/Under) ── */}
      {lines.length > 0 && (
        <div className="util-subsection" style={{ marginTop: '1rem' }}>
          <h3 className="util-subsection-title">Total runs</h3>
          <table className="util-table">
            <thead>
              <tr>
                <th>Ligne</th>
                <th>Sens</th>
                <th>Betclic</th>
                <th>Unibet</th>
                {model && <th title="Estimation interne, pas une alerte">Estimation</th>}
              </tr>
            </thead>
            <tbody>
              {lines.flatMap(line => {
                const bc = odds.betclic?.totals?.[line], ub = odds.unibet?.totals?.[line];
                const m = modelByLine.get(String(line));
                return ['over', 'under'].map(dir => (
                  <tr key={`${line}-${dir}`}>
                    {dir === 'over' && <td rowSpan={2} style={{ fontVariantNumeric: 'tabular-nums' }}>{line}</td>}
                    <td>{dir === 'over' ? '+ de' : '- de'}</td>
                    <td><OddsCell value={bc?.[dir]} /></td>
                    <td><OddsCell value={ub?.[dir]} /></td>
                    {model && (
                      <td style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                        {m ? `${Math.round((dir === 'over' ? m.pOver : m.pUnder) * 100)}%` : '—'}
                      </td>
                    )}
                  </tr>
                ));
              })}
            </tbody>
          </table>
          {model && (
            <p style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: '0.5rem' }}>
              λ estimé : {home.name} {model.lambdaHome} · {away.name} {model.lambdaAway}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
