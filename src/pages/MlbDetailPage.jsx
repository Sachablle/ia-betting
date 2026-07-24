import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { cachedFetch } from '../utils/fetchCache';
import { formatFullDate, formatMatchTime } from '../utils/formatters';
import TeamLogo from '../components/TeamLogo';
import FormStrip from '../components/FormStrip';
import { OddsCell } from '../components/OddsCell';

// Page match MLB (24 juillet 2026) — homogénéisée avec MatchDetailPage/BasketballDetailPage :
// hero avec bilan V-D + forme (FormStrip partagé), barre d'info avec chip Odds repliable + bouton
// Compositions, panneau compositions RotoWire (liste + schéma du terrain). Composants réutilisés
// tels quels (TeamLogo/FormStrip/OddsCell) ; LineupBuilder/RosterPanel du basket NON réutilisés —
// trop couplés à l'édition de compo pour les props joueurs (fonctionnalité qui n'existe pas pour ce
// sport), un panneau plus simple et en lecture seule est reconstruit ici avec le même style visuel.
// Chantier en mode fantôme (bandeau plus bas) — MLB_ALERTS_ENABLED=false côté backend.
const BK_LABELS = { betclic: 'Betclic', unibet: 'Unibet' };
const BK_COLORS = { unibet: '#1db954', betclic: '#e0292e' };
const BOOKS = ['betclic', 'unibet'];
const COLS_H2H = '80px 1fr 1fr';
const ch = { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', textAlign: 'center', letterSpacing: '0.05em' };
// Logos MLB — CDN RotoWire écarté (bloque les requêtes cross-origin par Referer, vérifié en
// direct : 403 avec un Referer localhost, 200 sans Referer ou avec Referer rotowire.com — donc
// jamais chargeable en <img> depuis notre propre site). CDN ESPN à la place, pas de restriction de
// ce type (déjà utilisé ailleurs dans l'app pour NBA/WNBA/foot). Une seule exception trouvée sur
// les 30 franchises : Arizona ("az" chez MLB Stats API, 404 côté ESPN qui attend "ari").
const ESPN_MLB_ALIASES = { az: 'ari' };
const mlbLogo = short => {
  if (!short) return null;
  const code = short.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/mlb/500/${ESPN_MLB_ALIASES[code] || code}.png`;
};

const tabStyle = active => ({
  padding: '0.25rem 0.75rem', borderRadius: 5, border: '1px solid', cursor: 'pointer',
  fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
  background: active ? 'rgba(251,146,60,0.25)' : 'rgba(251,146,60,0.08)',
  color: '#ffffff',
  borderColor: active ? 'rgba(251,146,60,0.55)' : 'rgba(251,146,60,0.22)',
  boxShadow: '0 0 0 1px rgba(255,255,255,0.22)',
  transition: 'background 0.15s, border-color 0.15s',
});

// Coordonnées approximatives des 9 positions défensives sur un losange (viewBox 0-100). Le DH ne
// défend pas (bat à la place du lanceur) — pas de point sur le terrain pour cette entrée.
const FIELD_POS = {
  P: [50, 58], C: [50, 87],
  '1B': [70, 60], '2B': [58, 45], '3B': [30, 60], SS: [42, 45],
  LF: [16, 24], CF: [50, 8], RF: [84, 24],
};

function BaseballField({ team, lineup }) {
  if (!lineup) return <p style={{ color: 'var(--text-dim)', fontSize: 11, textAlign: 'center' }}>Compo pas encore disponible.</p>;
  const dots = [
    lineup.pitcher && { pos: 'P', name: lineup.pitcher.name },
    ...lineup.batting.filter(b => FIELD_POS[b.pos]),
  ].filter(Boolean);
  return (
    <div>
      <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{team}</div>
      <svg viewBox="0 0 100 100" style={{ width: '100%', maxWidth: 320, display: 'block', margin: '0 auto' }}>
        <polygon points="50,95 15,60 50,25 85,60" fill="rgba(74,58,42,0.35)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
        <path d="M 10 30 A 60 60 0 0 1 90 30" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
        {dots.map(d => {
          const [x, y] = FIELD_POS[d.pos];
          return (
            <g key={d.pos}>
              <circle cx={x} cy={y} r="3.2" fill="#fb923c" stroke="#000819" strokeWidth="0.6" />
              <text x={x} y={y - 5} textAnchor="middle" fontSize="4.2" fill="#fff" fontWeight="700">{d.pos}</text>
              <text x={x} y={y + 8.5} textAnchor="middle" fontSize="3.4" fill="rgba(255,255,255,0.75)">{d.name.split(' ').slice(-1)[0]}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function LineupColumn({ team, lineup }) {
  if (!lineup) return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{team}</div>
      <p style={{ color: 'var(--text-dim)', fontSize: 11 }}>Compo pas encore disponible.</p>
    </div>
  );
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{team}</span>
        <span style={{
          fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
          padding: '1px 6px', borderRadius: 4,
          background: lineup.status === 'Confirmé' ? 'rgba(34,197,94,0.12)' : 'rgba(251,191,36,0.12)',
          color: lineup.status === 'Confirmé' ? '#22c55e' : '#fbbf24',
        }}>{lineup.status}</span>
      </div>
      {lineup.pitcher && (
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: '1.5rem' }}>
          Lanceur : <span style={{ color: 'var(--text)' }}>{lineup.pitcher.name}</span> ({lineup.pitcher.throws})
        </div>
      )}
      {lineup.batting.map(b => (
        <div key={b.order} style={{ display: 'grid', gridTemplateColumns: '16px 28px 1fr 16px', gap: 4, padding: '8px 0', fontSize: 11 }}>
          <span style={{ color: 'var(--text-dim)' }}>{b.order}</span>
          <span style={{ color: '#fb923c', fontWeight: 700, fontSize: 9 }}>{b.pos}</span>
          <span style={{ color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>{b.bats}</span>
        </div>
      ))}
    </div>
  );
}

export default function MlbDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const gameId = (id || '').replace('mlb_', '');
  const [match, setMatch] = useState(null);
  const [odds, setOdds] = useState(null);
  const [model, setModel] = useState(null);
  const [homeForm, setHomeForm] = useState(null);
  const [awayForm, setAwayForm] = useState(null);
  const [lineups, setLineups] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('h2h');
  const [showOdds, setShowOdds] = useState(false);
  const [showLineups, setShowLineups] = useState(true);
  const [fieldTeam, setFieldTeam] = useState('home');
  const [selectedLine, setSelectedLine] = useState(null);
  const [linePopupOpen, setLinePopupOpen] = useState(false);
  const linePopupRef = useRef(null);

  useEffect(() => {
    if (!linePopupOpen) return;
    const onDocClick = e => { if (!linePopupRef.current?.contains(e.target)) setLinePopupOpen(false); };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [linePopupOpen]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelectedLine(null);
    // Une seule route pour cotes + modèle (/api/mlb/preview inclut désormais les deux) — évite de
    // déclencher deux scrapings Betclic/Unibet en parallèle pour la même page.
    Promise.all([
      cachedFetch('/api/mlb/matches', 5 * 60_000).catch(() => ({ matches: [] })),
      cachedFetch('/api/mlb/preview', 5 * 60_000).catch(() => ({ games: [] })),
      cachedFetch('/api/mlb/lineups', 5 * 60_000).catch(() => ({})),
    ]).then(([matchesData, previewData, lineupsData]) => {
      if (cancelled) return;
      const m = (matchesData.matches || []).find(x => x.id === gameId);
      setMatch(m || null);
      if (m) {
        const p = (previewData.games || []).find(x => x.home === m.home.name && x.away === m.away.name);
        setOdds(p?.odds || null);
        setModel(p?.model || null);
        setHomeForm(p?.homeForm || null);
        setAwayForm(p?.awayForm || null);
        setLineups({ home: lineupsData[m.home.short] || null, away: lineupsData[m.away.short] || null });
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
  const hasLineups = lineups?.home || lineups?.away;

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
          <TeamLogo name={home.name} logoId={mlbLogo(home.short)} size={52} />
          {home.record && <div className="dt-position">{home.record}</div>}
          <div className="dt-name">{home.name}</div>
          {homeForm?.last5 && <FormStrip form={homeForm.last5} size="lg" />}
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
          <TeamLogo name={away.name} logoId={mlbLogo(away.short)} size={52} />
          {away.record && <div className="dt-position">{away.record}</div>}
          <div className="dt-name">{away.name}</div>
          {awayForm?.last5 && <FormStrip form={awayForm.last5} size="lg" />}
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

      {/* ── Info bar ── */}
      <div className="detail-infobar">
        {match.venue && <div className="info-chip">🏟️ {match.venue}</div>}
        <div className="info-chip" onClick={() => setShowOdds(v => !v)} style={{ cursor: odds ? 'pointer' : 'default', opacity: odds ? 1 : 0.5 }}>
          {odds ? 'Odds' : 'Odds N/D'}
        </div>
        {hasLineups && (
          <button
            className={`info-chip info-chip--btn info-chip--pitch ${showLineups ? 'active' : ''}`}
            onClick={() => setShowLineups(v => !v)}
            title="Compositions"
            style={{ marginLeft: 'auto' }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="9" fill="none" stroke="white" strokeWidth="1" />
              <path d="M 11 2 C 7.5 5 7.5 17 11 20" fill="none" stroke="white" strokeWidth="0.8" />
              <path d="M 11 2 C 14.5 5 14.5 17 11 20" fill="none" stroke="white" strokeWidth="0.8" />
              <line x1="2" y1="11" x2="20" y2="11" stroke="white" strokeWidth="0.8" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Panneau cotes (repliable) ── */}
      {showOdds && odds && (
        <div className="detail-card" style={{ marginBottom: '0.75rem', padding: '0.75rem 1rem' }}>
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

          {/* Total runs — une seule ligne affichée à la fois ("Ligne ⇄"), clic ouvre un popup
              listant toutes les lignes dispo avec leurs cotes pour changer de ligne affichée. */}
          {tab === 'total' && hasTotals && (() => {
            const line = lines.includes(String(selectedLine)) ? String(selectedLine) : lines[Math.floor((lines.length - 1) / 2)];
            const m = modelByLine.get(String(line));
            return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'center', position: 'relative', marginBottom: '0.6rem' }}>
                  <span
                    onClick={e => { e.stopPropagation(); setLinePopupOpen(v => !v); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)',
                    }}
                  >
                    Ligne
                    <span style={{
                      fontSize: 14, fontWeight: 800, color: '#fff',
                      textDecoration: 'underline dotted', textDecorationColor: 'rgba(255,255,255,0.35)',
                    }}>{line}</span>
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.6 }}>
                      <path d="M2 4.5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>

                  {linePopupOpen && (
                    <div
                      ref={linePopupRef}
                      onClick={e => e.stopPropagation()}
                      style={{
                        position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 8,
                        background: 'var(--bg-card, #11141c)', border: '1px solid var(--border)', borderRadius: 8,
                        padding: '0.5rem', boxShadow: '0 8px 20px rgba(0,0,0,0.45)', zIndex: 50, minWidth: 320,
                      }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr 1fr 1fr', gap: '0.15rem 0.4rem', paddingBottom: '0.3rem', borderBottom: '1px solid var(--border)', marginBottom: '0.2rem' }}>
                        <span style={ch}>Ligne</span>
                        <span style={ch}>Modèle</span>
                        <span style={ch}>Betclic</span>
                        <span style={ch}>Unibet</span>
                      </div>
                      {lines.map(l => {
                        const lm = modelByLine.get(String(l));
                        return (
                          <div
                            key={l}
                            onClick={() => { setSelectedLine(l); setLinePopupOpen(false); }}
                            style={{
                              display: 'grid', gridTemplateColumns: '46px 1fr 1fr 1fr', gap: '0.15rem 0.4rem', alignItems: 'center',
                              padding: '0.3rem 0.2rem', borderRadius: 5, cursor: 'pointer',
                              background: l === line ? 'rgba(251,146,60,0.15)' : 'transparent',
                            }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{l}</span>
                            <span style={{ fontSize: 8, textAlign: 'center', color: 'var(--text-dim)' }}>
                              {lm ? `${Math.round(lm.pOver * 100)}% / ${Math.round(lm.pUnder * 100)}%` : '—'}
                            </span>
                            <span style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                              <OddsCell value={odds.betclic?.totals?.[l]?.over} color={BK_COLORS.betclic} />
                              <OddsCell value={odds.betclic?.totals?.[l]?.under} color={BK_COLORS.betclic} />
                            </span>
                            <span style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                              <OddsCell value={odds.unibet?.totals?.[l]?.over} color={BK_COLORS.unibet} />
                              <OddsCell value={odds.unibet?.totals?.[l]?.under} color={BK_COLORS.unibet} />
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: COLS_H2H, gap: '0 0.25rem', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border)', marginBottom: '0.2rem' }}>
                  <div />
                  <div style={ch}>Over<br />{line}</div>
                  <div style={ch}>Under<br />{line}</div>
                </div>
                {BOOKS.map(bk => (
                  <div key={bk} style={{ display: 'grid', gridTemplateColumns: COLS_H2H, gap: '0 0.25rem', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 11, color: 'var(--text)' }}>{BK_LABELS[bk]}</span>
                    <OddsCell value={odds[bk]?.totals?.[line]?.over} color={BK_COLORS[bk]} />
                    <OddsCell value={odds[bk]?.totals?.[line]?.under} color={BK_COLORS[bk]} />
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                    Modèle : Over {m ? Math.round(m.pOver * 100) : '—'}% · Under {m ? Math.round(m.pUnder * 100) : '—'}%
                  </span>
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

      {/* ── Panneau compositions (RotoWire) ── */}
      {showLineups && hasLineups && (
        <div className="detail-grid">
          <div className="detail-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '0.8rem 1rem' }}>
            <LineupColumn team={home.short || home.name} lineup={lineups.home} />
            <LineupColumn team={away.short || away.name} lineup={lineups.away} />
          </div>
          <div className="detail-card lineup-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: '2.5rem' }}>
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
                padding: '2px 8px', borderRadius: 4,
                background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)',
              }}>Compos probables</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: '1.75rem' }}>
              {[{ key: 'home', label: home.short || home.name }, { key: 'away', label: away.short || away.name }].map(({ key, label }) => (
                <button key={key} onClick={() => setFieldTeam(key)} style={{
                  padding: '0.18rem 0.55rem', borderRadius: 5, border: '1px solid',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: fieldTeam === key ? 'var(--accent)' : 'transparent',
                  color: fieldTeam === key ? '#fff' : 'var(--text-dim)',
                  borderColor: fieldTeam === key ? 'var(--accent)' : 'var(--border)',
                }}>{label}</button>
              ))}
            </div>
            <BaseballField team={fieldTeam === 'home' ? (home.short || home.name) : (away.short || away.name)} lineup={fieldTeam === 'home' ? lineups.home : lineups.away} />
          </div>
        </div>
      )}
    </div>
  );
}
