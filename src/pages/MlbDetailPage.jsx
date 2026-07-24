import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { cachedFetch } from '../utils/fetchCache';
import { formatFullDate, formatMatchTime } from '../utils/formatters';
import TeamLogo from '../components/TeamLogo';
import { OddsCell } from '../components/OddsCell';

// Page match MLB (24 juillet 2026) — même arborescence ET même bloc cotes que
// MatchDetailPage/BasketballDetailPage : mêmes classes CSS (.detail-hero/.detail-infobar), mêmes
// composants (TeamLogo/OddsCell), et le bloc cotes reprend explicitement le pattern du basket
// (onglets, grille par bookmaker, BK_LABELS/BK_COLORS identiques) — demande explicite de
// l'utilisateur le 24 juillet 2026 après un premier jet trop différent visuellement (tableau
// générique .util-table au lieu du composant partagé). Différence assumée : MLB scrappe 5 lignes
// Over/Under par match (contrairement au basket qui n'a qu'une ligne "Total" par bookmaker) — donc
// l'onglet "Total runs" répète le bloc par ligne plutôt qu'une seule fois.
// Chantier en mode fantôme (bandeau plus bas) — MLB_ALERTS_ENABLED=false côté backend tant que la
// calibration near-miss n'est pas vérifiée, aucune alerte ne peut donc apparaître sur cette page.
const BK_LABELS = { betclic: 'Betclic', unibet: 'Unibet' };
const BK_COLORS = { unibet: '#1db954', betclic: '#e0292e' };
const BOOKS = ['betclic', 'unibet'];
const COLS_H2H = '80px 1fr 1fr';
const ch = { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', textAlign: 'center', letterSpacing: '0.05em' };

const tabStyle = active => ({
  padding: '0.25rem 0.75rem', borderRadius: 5, border: '1px solid', cursor: 'pointer',
  fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
  background: active ? 'rgba(251,146,60,0.25)' : 'rgba(251,146,60,0.08)',
  color: '#ffffff',
  borderColor: active ? 'rgba(251,146,60,0.55)' : 'rgba(251,146,60,0.22)',
  boxShadow: '0 0 0 1px rgba(255,255,255,0.22)',
  transition: 'background 0.15s, border-color 0.15s',
});

export default function MlbDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const gameId = (id || '').replace('mlb_', '');
  const [match, setMatch] = useState(null);
  const [odds, setOdds] = useState(null);
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('h2h');

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
  ])].sort((a, b) => parseFloat(a) - parseFloat(b));
  const modelByLine = new Map((model?.lines || []).map(l => [String(l.line), l]));
  const hasTotals = lines.length > 0;

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

      {odds && (
        <div style={{ marginTop: '1rem' }}>
          {/* Onglets — même style que BasketballDetailPage */}
          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.75rem', alignItems: 'center' }}>
            <button style={tabStyle(tab === 'h2h')} onClick={() => setTab('h2h')}>Vainqueur</button>
            {hasTotals && <button style={tabStyle(tab === 'total')} onClick={() => setTab('total')}>Total runs</button>}
          </div>

          {tab === 'h2h' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: COLS_H2H, gap: '0 0.25rem', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border)', marginBottom: '0.2rem' }}>
                <div />
                <div style={ch}>{home.short || home.name}</div>
                <div style={ch}>{away.short || away.name}</div>
              </div>
              {BOOKS.map(bk => (
                <div key={bk} style={{ display: 'grid', gridTemplateColumns: COLS_H2H, gap: '0 0.25rem', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text)' }}>{BK_LABELS[bk]}</span>
                  <OddsCell value={odds[bk]?.h2h?.home} color={BK_COLORS[bk]} />
                  <OddsCell value={odds[bk]?.h2h?.away} color={BK_COLORS[bk]} />
                </div>
              ))}
            </>
          )}

          {/* Total runs — bookmakers en lignes (à gauche), lignes de paris en colonnes (en haut) :
              demande explicite de l'utilisateur le 24 juillet 2026 après le premier jet (un bloc par
              ligne, bookmakers empilés dedans) jugé moins lisible pour comparer d'un coup d'œil. */}
          {tab === 'total' && hasTotals && (() => {
            const gridCols = `80px repeat(${lines.length * 2}, 1fr)`;
            return (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '0 0.2rem', minWidth: lines.length * 100 + 80 }}>
                  <div />
                  {lines.map(line => (
                    <div key={line} style={{ gridColumn: 'span 2', textAlign: 'center', paddingBottom: '0.2rem' }}>
                      <span style={{ ...ch, fontVariantNumeric: 'tabular-nums' }}>{line}</span>
                    </div>
                  ))}
                  <div />
                  {lines.map(line => {
                    const m = modelByLine.get(String(line));
                    return (
                      <div key={line} style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr 1fr', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border)', marginBottom: '0.2rem' }}>
                        <div style={{ ...ch, fontSize: 8 }}>Over{m && <><br />{Math.round(m.pOver * 100)}%</>}</div>
                        <div style={{ ...ch, fontSize: 8 }}>Under{m && <><br />{Math.round(m.pUnder * 100)}%</>}</div>
                      </div>
                    );
                  })}
                  {BOOKS.flatMap(bk => [
                    <div key={`${bk}-label`} style={{ display: 'flex', alignItems: 'center', fontSize: 11, color: 'var(--text)', padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {BK_LABELS[bk]}
                    </div>,
                    ...lines.map(line => (
                      <div key={`${bk}-${line}`} style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <OddsCell value={odds[bk]?.totals?.[line]?.over} color={BK_COLORS[bk]} />
                        <OddsCell value={odds[bk]?.totals?.[line]?.under} color={BK_COLORS[bk]} />
                      </div>
                    )),
                  ])}
                </div>
              </div>
            );
          })()}

          {model && (
            <p style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: '0.5rem' }}>
              λ estimé (interne, pas une alerte) : {home.name} {model.lambdaHome} · {away.name} {model.lambdaAway}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
