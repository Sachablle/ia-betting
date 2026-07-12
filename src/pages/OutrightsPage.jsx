import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

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
const BOOK_ORDER = ['pinnacle', 'betclic', 'pmu'];
const BOOK_LABELS = { betclic: 'Betclic', pinnacle: 'Pinnacle', pmu: 'PMU' };
const BOOK_ODDS_COLORS = { betclic: '#ef4444', pinnacle: '#ffffff', pmu: '#166534' };
const BOOK_COL_WIDTH = 52;

function Card({ title, books, children }) {
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
        <span />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.09em' }}>{title}</span>
        {books.map(b => (
          <span key={b} style={{ fontSize: 8, fontWeight: 700, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' }}>{BOOK_LABELS[b]}</span>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.9rem 0.4rem 0.4rem' }}>
        {children}
      </div>
    </div>
  );
}

function TeamRow({ rank, name, teamBooks, isFavorite, books }) {
  const cols = `18px 1fr ${books.length ? Array(books.length).fill(`${BOOK_COL_WIDTH}px`).join(' ') : '56px'}`;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: cols, alignItems: 'center', gap: '0.85rem',
      padding: '0.45rem 0.6rem', borderRadius: 8,
      background: isFavorite ? 'rgba(96,165,250,0.12)' : 'transparent',
    }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>{rank}</span>
      <span style={{ fontSize: 11.5, fontWeight: isFavorite ? 700 : 500, color: isFavorite ? '#60a5fa' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      {books.map(b => (
        <span key={b} style={{ fontSize: 11, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: BOOK_ODDS_COLORS[b] }}>
          {teamBooks[b] != null ? teamBooks[b].toFixed(2) : '—'}
        </span>
      ))}
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
  const [params, setParams] = useSearchParams();
  const sport = params.get('sport') || 'football';

  useEffect(() => {
    fetch('/api/outrights')
      .then(r => r.json())
      .then(d => { setData(d.competitions); setBlockedUntil(d.blockedUntil); setNextRefreshAt(d.nextRefreshAt ?? null); })
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
    <div style={{ padding: '0.9rem 2.5rem 2rem' }}>
      <div style={{ marginBottom: '2.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#3b82f6', marginBottom: '0.6rem' }}>
            Paris longterme
          </p>
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1.1 }}>
            Outrights
          </h1>
        </div>
        {data && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
              <button
                className={`icon-refresh-btn${refreshing ? ' spinning' : ''}`}
                onClick={handleRefresh}
                disabled={refreshing || onCooldown}
                title={onCooldown ? 'Un vrai scraping a déjà eu lieu récemment (anti-ban) — réessaie plus tard' : 'Rafraîchir'}
                style={onCooldown ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
              >
                ↻
              </button>
              {onCooldown ? (
                <div style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'right' }}>
                  Prochain vrai scrape dans {Math.floor(msLeft / 60_000)}:{String(Math.floor((msLeft % 60_000) / 1000)).padStart(2, '0')}
                </div>
              ) : lastRefreshed && (
                <div style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'right' }}>
                  {lastRefreshed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
            <SportToggle sport={sport} setSport={s => setParams({ sport: s })} has={has} />
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
              <Card key={key} title={comp.label} books={books}>
                {comp.teams.map((t, i) => (
                  <TeamRow key={t.name} rank={i + 1} name={t.name} teamBooks={t.books} isFavorite={i === 0} books={books} />
                ))}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
