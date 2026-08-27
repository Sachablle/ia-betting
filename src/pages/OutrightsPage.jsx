import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const SPORT_ICONS = [
  ['football',   '⚽', '#2d8a2d', 'rgba(45,138,45,'],
  ['basketball', '🏀', '#fb923c', 'rgba(251,146,60,'],
];

function SportToggle({ sport, setSport, has }) {
  return (
    <div style={{ display: 'flex', gap: '0.4rem' }}>
      {SPORT_ICONS.map(([key, icon, col, rgba]) => {
        const active = sport === key;
        const available = has[key];
        return (
          <button
            key={key}
            onClick={() => available && setSport(key)}
            title={key === 'football' ? 'Football' : 'Basketball'}
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, borderRadius: 8, cursor: available ? 'pointer' : 'default',
              background: active ? `${rgba}0.15)` : 'none',
              border: `1px solid ${active ? col : available ? `${rgba}0.25)` : 'rgba(255,255,255,0.08)'}`,
              boxShadow: active ? `0 0 8px ${rgba}0.35)` : 'none',
              opacity: available ? 1 : 0.3,
              transition: 'all 0.15s',
            }}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}

const COMP_ORDER = ['ligue1', 'pl', 'laliga', 'seriea', 'bundesliga', 'nba', 'wnba'];
export const BOOK_ORDER = ['pinnacle', 'betclic', 'pmu'];
export const BOOK_LABELS = { betclic: 'Betclic', pinnacle: 'Pinnacle', pmu: 'PMU' };
export const BOOK_ODDS_COLORS = { betclic: '#ef4444', pinnacle: '#60a5fa', pmu: '#166534' };
export const BOOK_COL_WIDTH = 52;

export function Card({ title, books, children, onTitleClick }) {
  const cols = `18px 1fr ${books.length ? Array(books.length).fill(`${BOOK_COL_WIDTH}px`).join(' ') : '56px'}`;
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 16, overflow: 'hidden',
      width: '100%', aspectRatio: '1 / 1',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: cols, alignItems: 'center', gap: '0.85rem',
        padding: '0.8rem 1rem 0.5rem',
        flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <span
          onClick={onTitleClick}
          title="Voir tous les marchés de cette compétition"
          style={{ gridColumn: '1 / span 2', fontSize: 11, fontWeight: 700, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.09em', cursor: onTitleClick ? 'pointer' : 'default' }}
        >
          {title}
        </span>
        {books.map(b => (
          <span key={b} style={{ fontSize: 8, fontWeight: 700, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>{BOOK_LABELS[b]}</span>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.9rem 0.4rem 0.4rem' }}>
        {children}
      </div>
    </div>
  );
}

const FORM_COLORS = { W: '#22c55e', D: '#9ca3af', L: '#ef4444' };

function ScoreBar({ label, value, max }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
      <span style={{ fontSize: 9, color: 'var(--text-dim)', width: 78, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#60a5fa', borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 9, color: 'var(--text-dim)', width: 28, textAlign: 'right', flexShrink: 0 }}>{value}</span>
    </div>
  );
}

const COMPONENT_LABELS_FOOT = { pace: 'Classement', form: 'Forme', attackDefense: 'Attaque/Déf.', schedule: 'Calendrier', trophy: 'Historique' };
const COMPONENT_LABELS_BBALL = { winPct: 'Bilan V-D', netRating: 'Net rating', schedule: 'Calendrier', trophy: 'Historique' };
const COMPONENT_MAX_FOOT = { pace: 40, form: 25, attackDefense: 20, schedule: 10, trophy: 5 };
const COMPONENT_MAX_BBALL = { winPct: 40, netRating: 30, schedule: 20, trophy: 10 };

function TeamDetailPanel({ compKey, teamName }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/outrights/teamdetail?comp=${encodeURIComponent(compKey)}&team=${encodeURIComponent(teamName)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [compKey, teamName]);

  if (error) return <div style={{ fontSize: 10, color: 'var(--text-dim)', padding: '0.5rem 0' }}>Impossible de charger le détail.</div>;
  if (!data) return <div style={{ fontSize: 10, color: 'var(--text-dim)', padding: '0.5rem 0' }}>Chargement…</div>;
  if (!data.found) return <div style={{ fontSize: 10, color: 'var(--text-dim)', padding: '0.5rem 0' }}>Données insuffisantes pour cette équipe pour le moment.</div>;

  const isFoot = data.sport === 'football';
  const labels = isFoot ? COMPONENT_LABELS_FOOT : COMPONENT_LABELS_BBALL;
  const maxes = isFoot ? COMPONENT_MAX_FOOT : COMPONENT_MAX_BBALL;

  return (
    <div style={{ padding: '0.6rem 0.5rem 0.9rem', fontSize: 10.5, color: 'var(--text)', background: 'rgba(255,255,255,0.015)', borderRadius: 8, marginTop: '0.2rem', marginBottom: '0.3rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem', marginBottom: '0.55rem' }}>
        {isFoot ? (
          <>
            <span>Classement : <b>{data.standings.position}e</b> — {data.standings.points} pts ({data.standings.played} matchs)</span>
            <span>Écart au leader : <b>{data.pointsGap}</b> pts</span>
          </>
        ) : (
          <span>Bilan : <b>{data.standings.wins}-{data.standings.losses}</b> ({(data.standings.pct * 100).toFixed(1)}%) — rang {data.standings.rank}</span>
        )}
        {data.plausible === false && (
          <span style={{ color: '#f87171', fontWeight: 700 }}>⚠ Hors course mathématiquement</span>
        )}
      </div>

      {isFoot && data.form?.length > 0 && (
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.55rem' }}>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', marginRight: '0.3rem' }}>Forme :</span>
          {data.form.map((r, i) => (
            <span key={i} style={{ width: 15, height: 15, borderRadius: '50%', background: FORM_COLORS[r], color: '#0d1117', fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r}</span>
          ))}
        </div>
      )}

      {data.score != null && (
        <div style={{ marginBottom: '0.6rem' }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: '0.3rem' }}>Score modèle : <b style={{ color: '#60a5fa' }}>{data.score}/100</b></div>
          {Object.entries(data.components || {}).map(([k, v]) => (
            <ScoreBar key={k} label={labels[k] || k} value={v} max={maxes[k] || 100} />
          ))}
        </div>
      )}

      {data.edgeVsPinnacle && Object.keys(data.edgeVsPinnacle).length > 0 && (
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Edge vs Pinnacle : </span>
          {Object.entries(data.edgeVsPinnacle).map(([bk, e]) => (
            <span key={bk} style={{ fontSize: 9.5, fontWeight: 700, color: e >= 0 ? '#22c55e' : '#f87171', marginRight: '0.5rem' }}>{BOOK_LABELS[bk]} {e >= 0 ? '+' : ''}{e}%</span>
          ))}
        </div>
      )}

      {data.injuries?.length > 0 && (
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Blessures : </span>
          <span style={{ fontSize: 9.5, color: '#fb923c' }}>{data.injuries.join(', ')}</span>
        </div>
      )}

      {data.nextOpponents?.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: '0.2rem' }}>Prochains matchs :</div>
          {data.nextOpponents.map((o, i) => (
            <div key={i} style={{ fontSize: 9.5, color: 'var(--text)', display: 'flex', justifyContent: 'space-between', padding: '0.1rem 0' }}>
              <span>{o.isHome ? 'vs' : '@'} {o.opponent}</span>
              <span style={{ color: 'var(--text-dim)' }}>{new Date(o.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
            </div>
          ))}
        </div>
      )}

      {data.trophyCount > 0 && (
        <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: '0.3rem' }}>🏆 {data.trophyCount} titre{data.trophyCount > 1 ? 's' : ''} (10 dernières saisons, approximatif)</div>
      )}
    </div>
  );
}

function TeamRow({ rank, name, teamBooks, isFavorite, books, expanded, onToggle, compKey }) {
  const cols = `18px 1fr ${books.length ? Array(books.length).fill(`${BOOK_COL_WIDTH}px`).join(' ') : '56px'}`;
  return (
    <div>
      <div
        onClick={onToggle}
        style={{
          display: 'grid', gridTemplateColumns: cols, alignItems: 'center', gap: '0.85rem',
          padding: '0.45rem 0.6rem', borderRadius: 8, cursor: 'pointer',
          background: expanded ? 'rgba(96,165,250,0.18)' : isFavorite ? 'rgba(96,165,250,0.12)' : 'transparent',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>{rank}</span>
        <span style={{ fontSize: 11.5, fontWeight: isFavorite ? 700 : 500, color: isFavorite ? '#60a5fa' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
        {books.map(b => (
          <span key={b} style={{ fontSize: 11, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: BOOK_ODDS_COLORS[b] }}>
            {teamBooks[b] != null ? teamBooks[b].toFixed(2) : '—'}
          </span>
        ))}
      </div>
      {expanded && <TeamDetailPanel compKey={compKey} teamName={name} />}
    </div>
  );
}

export default function OutrightsPage() {
  const [data, setData] = useState(null);
  const [blockedUntil, setBlockedUntil] = useState(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [nextRefreshAt, setNextRefreshAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [expandedTeam, setExpandedTeam] = useState(null); // `${compKey}__${teamName}`
  const [params, setParams] = useSearchParams();
  const sport = params.get('sport') || 'football';
  const navigate = useNavigate();

  // Même correctif que BacktestingPage.jsx (2 août 2026) — `data` démarre à null et se remplit
  // via un fetch réseau, jamais instantané. Si ce swap "Chargement…" → contenu tombe pendant les
  // 0.8s de l'animation d'entrée de .page (pageEnterFade), WebKit affiche un chevauchement visuel
  // (glitch signalé par l'utilisateur, identique à celui vu sur Backtesting). Le tout 1er affichage
  // est retenu jusqu'à la fin de l'animation, mesuré depuis le montage — un `handleRefresh` manuel
  // plus tard reste instantané (revealedRef déjà vrai à ce moment).
  const mountedAtRef = useRef(Date.now());
  const revealedRef  = useRef(false);
  const PAGE_ANIM_MS = 850;
  const revealOutrights = (d) => {
    const commit = () => { revealedRef.current = true; setData(d.competitions); setBlockedUntil(d.blockedUntil); setNextRefreshAt(d.nextRefreshAt ?? null); };
    if (revealedRef.current) { commit(); return; }
    const wait = PAGE_ANIM_MS - (Date.now() - mountedAtRef.current);
    if (wait > 0) setTimeout(commit, wait); else commit();
  };

  useEffect(() => {
    fetch('/api/outrights')
      .then(r => r.json())
      .then(revealOutrights)
      .catch(() => setError(true));
  }, []);

  // Tick chaque seconde pour faire vivre le minuteur — seulement pendant le cooldown, pas besoin
  // de tourner en continu le reste du temps.
  useEffect(() => {
    if (!nextRefreshAt || nextRefreshAt <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [nextRefreshAt]);

  const msLeft   = nextRefreshAt ? nextRefreshAt - now : 0;
  const onCooldown = msLeft > 0;

  const handleRefresh = () => {
    if (onCooldown) return;
    setRefreshing(true);
    fetch('/api/outrights?refresh=1')
      .then(r => r.json())
      .then(d => { setData(d.competitions); setBlockedUntil(d.blockedUntil); setNextRefreshAt(d.nextRefreshAt ?? null); setNow(Date.now()); setError(false); setLastRefreshed(new Date()); })
      .catch(() => setError(true))
      .finally(() => setRefreshing(false));
  };

  const has = {
    football:   !!data && Object.values(data).some(c => c.sport === 'football'),
    basketball: !!data && Object.values(data).some(c => c.sport === 'basketball'),
  };
  const filtered = data
    ? Object.entries(data)
        .filter(([, c]) => c.sport === sport)
        .sort(([a], [b]) => COMP_ORDER.indexOf(a) - COMP_ORDER.indexOf(b))
    : [];

  return (
    <div className="page" style={{ padding: '0.9rem 2.5rem 2rem' }}>
      <div style={{ marginBottom: '2.75rem' }}>
        <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#3b82f6', marginBottom: '0.6rem' }}>
          Paris longterme
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1.1 }}>
            Outrights
          </h1>
          {data && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                className={`icon-refresh-btn${refreshing ? ' spinning' : ''}`}
                onClick={handleRefresh}
                disabled={refreshing || onCooldown}
                title={onCooldown ? 'Un vrai scraping a déjà eu lieu récemment (anti-ban) — réessaie plus tard' : 'Rafraîchir'}
                style={onCooldown ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
              >
                ↻
              </button>
              <SportToggle sport={sport} setSport={s => setParams({ sport: s })} has={has} />
            </div>
          )}
        </div>
        {data && (
          <div style={{ textAlign: 'right', marginTop: '0.4rem' }}>
            {onCooldown ? (
              <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                Prochain vrai scrape dans {Math.floor(msLeft / 60_000)}:{String(Math.floor((msLeft % 60_000) / 1000)).padStart(2, '0')}
              </div>
            ) : lastRefreshed && (
              <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                {lastRefreshed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* error ne doit jamais masquer des données déjà chargées (ex: échec d'un refresh après une
          1ère charge réussie) — sinon les outrights affichés disparaissent tant qu'on n'a pas
          navigué ailleurs et qu'un nouveau montage ne relance pas la 1ère charge. */}
      {error && !data && <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Impossible de charger les outrights.</div>}
      {error && data && <div style={{ color: '#f87171', fontSize: 11, marginBottom: '0.75rem' }}>Le dernier rafraîchissement a échoué — cotes précédentes affichées.</div>}
      {!error && !data && <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Chargement…</div>}
      {data && filtered.length === 0 && (
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Aucune compétition disponible pour ce sport pour le moment.</div>
      )}

      {filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
          {filtered.map(([key, comp]) => {
            const books = BOOK_ORDER.filter(b => comp.teams.some(t => t.books?.[b] != null));
            return (
              <Card key={key} title={comp.label} books={books} onTitleClick={() => navigate(`/outrights/${key}`)}>
                {comp.teams.map((t, i) => {
                  const rowKey = `${key}__${t.name}`;
                  return (
                    <TeamRow
                      key={t.name} rank={i + 1} name={t.name} teamBooks={t.books} isFavorite={i === 0} books={books}
                      compKey={key}
                      expanded={expandedTeam === rowKey}
                      onToggle={() => setExpandedTeam(expandedTeam === rowKey ? null : rowKey)}
                    />
                  );
                })}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
