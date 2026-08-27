import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, BOOK_ORDER, BOOK_LABELS, BOOK_ODDS_COLORS, BOOK_COL_WIDTH } from './OutrightsPage';
import { marketLabel, marketSortIndex, hasAlert } from '../utils/outrightMarkets';

// Marchés "par équipe" (30 juillet 2026) — Nombre de victoires (Plus/Moins) et Atteint les
// Playoffs (Oui/Non) : forme différente d'un classement (2 issues par équipe), affichés via un
// menu déroulant équipe plutôt qu'un onglet par équipe (illisible à 30 équipes NBA).
const TEAM_PROP_LABELS = { win_total: 'Nombre de victoires', reaches_playoffs: 'Atteint les Playoffs' };

function TeamPropPanel({ propType, teams, books }) {
  const teamNames = Object.keys(teams).sort();
  const [selected, setSelected] = useState(teamNames[0] || null);
  useEffect(() => { if (!teamNames.includes(selected)) setSelected(teamNames[0] || null); }, [propType]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!teamNames.length) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Aucune donnée pour ce marché.</div>;
  const team = selected ? teams[selected] : null;
  const isWinTotal = propType === 'win_total';
  const outcomes = isWinTotal
    ? [{ key: 'over', label: team?.line != null ? `+ de ${team.line}` : 'Plus' }, { key: 'under', label: team?.line != null ? `- de ${team.line}` : 'Moins' }]
    : [{ key: 'yes', label: 'Oui' }, { key: 'no', label: 'Non' }];

  return (
    <div style={{ maxWidth: 420 }}>
      <select
        value={selected || ''}
        onChange={e => setSelected(e.target.value)}
        style={{ width: '100%', marginBottom: '0.75rem', padding: '0.5rem 0.7rem', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600 }}
      >
        {teamNames.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      {team && (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `1fr ${books.map(() => `${BOOK_COL_WIDTH}px`).join(' ')}`, padding: '0.6rem 0.85rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <span />
            {books.map(b => <span key={b} style={{ fontSize: 10, fontWeight: 700, textAlign: 'right', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{BOOK_LABELS[b]}</span>)}
          </div>
          {outcomes.map(o => (
            <div key={o.key} style={{ display: 'grid', gridTemplateColumns: `1fr ${books.map(() => `${BOOK_COL_WIDTH}px`).join(' ')}`, padding: '0.5rem 0.85rem' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{o.label}</span>
              {books.map(b => (
                <span key={b} style={{ fontSize: 11.5, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: BOOK_ODDS_COLORS[b] }}>
                  {team.books?.[b]?.[o.key] != null ? team.books[b][o.key].toFixed(2) : '—'}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SimpleTeamRow({ rank, name, teamBooks, isFavorite, books }) {
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

export default function OutrightCompetitionPage() {
  const { compKey } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [activeMarket, setActiveMarket] = useState(null);
  const [activeTeamProp, setActiveTeamProp] = useState(null);

  useEffect(() => {
    setData(null); setError(false); setActiveMarket(null); setActiveTeamProp(null);
    fetch(`/api/outrights/${compKey}/markets`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        const keys = Object.keys(d.markets || {}).sort((a, b) => marketSortIndex(a) - marketSortIndex(b));
        setActiveMarket(keys[0] || null);
      })
      .catch(() => setError(true));
  }, [compKey]);

  const marketKeys = data
    ? Object.keys(data.markets || {}).sort((a, b) => marketSortIndex(a) - marketSortIndex(b))
    : [];
  const teamPropKeys = data ? Object.keys(data.teamProps || {}) : [];
  const teams = activeMarket && !activeTeamProp ? data.markets[activeMarket] : [];
  const books = activeTeamProp
    ? BOOK_ORDER.filter(b => Object.values(data.teamProps[activeTeamProp]).some(t => t.books?.[b] != null))
    : BOOK_ORDER.filter(b => teams.some(t => t.books?.[b] != null));

  return (
    <div className="page" style={{ padding: '0.9rem 2.5rem 2rem' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <button
          onClick={() => navigate('/outrights')}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: '0.9rem' }}
        >
          ← Retour aux Outrights
        </button>
        <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#3b82f6', marginBottom: '0.6rem' }}>
          Paris longterme — tous les marchés
        </p>
        <h1 style={{ fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1.1 }}>
          {data?.label || '…'}
        </h1>
      </div>

      {error && <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Impossible de charger les marchés de cette compétition.</div>}
      {!error && !data && <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Chargement…</div>}
      {data && marketKeys.length === 0 && teamPropKeys.length === 0 && (
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Aucun marché supplémentaire détecté pour cette compétition pour le moment.</div>
      )}

      {data && (marketKeys.length > 0 || teamPropKeys.length > 0) && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {marketKeys.map(k => {
              const active = k === activeMarket && !activeTeamProp;
              const alerted = hasAlert(compKey, k);
              return (
                <button
                  key={k}
                  onClick={() => { setActiveMarket(k); setActiveTeamProp(null); }}
                  title={alerted ? 'Alertes activées sur ce marché' : undefined}
                  style={{
                    padding: '0.4rem 0.9rem', borderRadius: 20, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: active ? 'rgba(96,165,250,0.18)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${active ? '#60a5fa' : 'rgba(255,255,255,0.08)'}`,
                    color: active ? '#60a5fa' : 'var(--text-dim)',
                  }}
                >
                  {alerted && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />}
                  {marketLabel(k)}
                </button>
              );
            })}
            {teamPropKeys.map(k => {
              const active = k === activeTeamProp;
              return (
                <button
                  key={k}
                  onClick={() => setActiveTeamProp(k)}
                  style={{
                    padding: '0.4rem 0.9rem', borderRadius: 20, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                    background: active ? 'rgba(251,191,36,0.18)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${active ? '#fbbf24' : 'rgba(255,255,255,0.08)'}`,
                    color: active ? '#fbbf24' : 'var(--text-dim)',
                  }}
                >
                  {TEAM_PROP_LABELS[k] || k}
                </button>
              );
            })}
          </div>

          {activeTeamProp ? (
            <TeamPropPanel propType={activeTeamProp} teams={data.teamProps[activeTeamProp]} books={books} />
          ) : (
            <div style={{ maxWidth: 420 }}>
              <Card title={marketLabel(activeMarket)} books={books}>
                {teams.map((t, i) => (
                  <SimpleTeamRow key={t.name} rank={i + 1} name={t.name} teamBooks={t.books} isFavorite={i === 0} books={books} />
                ))}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
