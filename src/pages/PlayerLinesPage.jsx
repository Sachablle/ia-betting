import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

const COMBO_LABELS = { pr: 'Points + Rebonds', pa: 'Points + Passes', ra: 'Rebonds + Passes', pra: 'Points + Rebonds + Passes' };
const BOOK_LABELS = { unibet: 'Unibet', betclic: 'Betclic' };
const BOOK_COLORS = { unibet: '#1db954', betclic: '#e0292e' };

function OddsPill({ label, value, color }) {
  if (value == null) return null;
  return (
    <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
      {label} <b style={{ color: color || 'var(--text)' }}>{value.toFixed ? value.toFixed(2) : value}</b>
    </span>
  );
}

function LineRow({ line, over, under, highlight, onClick, borderColor }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
      padding: '0.3rem 0.6rem', borderRadius: 6, cursor: onClick ? 'pointer' : 'default',
      background: highlight ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${borderColor || (highlight ? 'rgba(74,222,128,0.3)' : 'var(--border)')}`,
    }}>
      <span style={{ fontSize: 12, fontWeight: 700 }}>Ligne {line}</span>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <OddsPill label="Plus" value={over} color="#4ade80" />
        <OddsPill label="Moins" value={under} color="#f87171" />
      </div>
    </div>
  );
}

function BookmakerBlock({ book, lines, mainLine }) {
  const [expanded, setExpanded] = useState(false);
  if (!lines?.length) return null;
  const main = mainLine != null ? lines.find(l => l.line === mainLine) : lines[0];
  const sorted = lines.slice().sort((a, b) => a.line - b.line);
  const canExpand = sorted.length > 1;
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: BOOK_COLORS[book] || 'var(--text-dim)', marginBottom: '0.3rem' }}>
        {BOOK_LABELS[book] || book}
        {canExpand && <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-dim)', marginLeft: 6 }}>({sorted.length} lignes — cliquer pour {expanded ? 'replier' : 'déplier'})</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {!expanded && main && (
          <LineRow line={main.line} over={main.over} under={main.under} highlight borderColor={BOOK_COLORS[book]} onClick={canExpand ? () => setExpanded(true) : undefined} />
        )}
        {expanded && sorted.map((l, i) => (
          <LineRow key={i} line={l.line} over={l.over} under={l.under}
            highlight={main != null && l.line === main.line} borderColor={BOOK_COLORS[book]}
            onClick={l.line === main?.line ? () => setExpanded(false) : undefined} />
        ))}
      </div>
    </div>
  );
}

function StatSection({ title, statKey, player, allLinesKey }) {
  const books = ['betclic', 'unibet'];
  const blocks = [];
  for (const book of books) {
    const single = player[book]?.[statKey];
    const all = player[`${book}${allLinesKey}`]?.[statKey];
    const lines = (all && all.length > 0) ? all : (single ? [single] : []);
    if (lines.length) blocks.push(<BookmakerBlock key={book} book={book} lines={lines} mainLine={single?.line} />);
  }
  if (!blocks.length) return null;
  return (
    <div style={{ marginBottom: '1rem' }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: '0.5rem', color: 'var(--text)' }}>{title}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem' }}>
        {blocks}
      </div>
    </div>
  );
}

function ComboSection({ player }) {
  const books = ['unibet'];
  const keys = ['pr', 'pa', 'ra', 'pra'];
  const sections = [];
  for (const key of keys) {
    const blocks = [];
    for (const book of books) {
      const single = player.combos?.[book]?.[key];
      const all = player.combosAllLines?.[book]?.[key];
      const lines = (all && all.length > 0) ? all : (single ? [single] : []);
      if (lines.length) blocks.push(<BookmakerBlock key={book} book={book} lines={lines} mainLine={single?.line} />);
    }
    if (blocks.length) {
      sections.push(
        <div key={key} style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: '0.3rem' }}>{COMBO_LABELS[key] || key}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem' }}>
            {blocks}
          </div>
        </div>
      );
    }
  }
  if (!sections.length) return null;
  return (
    <div style={{ marginTop: '7rem', marginBottom: '1rem' }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: '0.5rem', color: 'var(--text)' }}>Marchés combinés</h3>
      {sections}
    </div>
  );
}

function MilestoneSection({ player }) {
  const books = ['betclic', 'unibet'];
  const keys = [['dd', 'Double-double'], ['td', 'Triple-double']];
  const rows = [];
  for (const [key, label] of keys) {
    const odds = books.map(book => ({ book, value: player.milestones?.[book]?.[key] })).filter(o => o.value != null);
    if (odds.length) {
      rows.push(
        <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.3rem 0.6rem', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {odds.map(o => <OddsPill key={o.book} label={BOOK_LABELS[o.book]} value={o.value} color={BOOK_COLORS[o.book]} />)}
          </div>
        </div>
      );
    }
  }
  if (!rows.length) return null;
  return (
    <div style={{ marginBottom: '1rem' }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: '0.5rem', color: 'var(--text)' }}>Performances spéciales</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>{rows}</div>
    </div>
  );
}

function PraLadderSection({ player }) {
  const ladder = player.betclicPraLadder;
  if (!ladder?.length) return null;
  return (
    <div style={{ marginBottom: '1rem' }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: '0.5rem', color: 'var(--text)' }}>Performance (Pts + Rebs + Passes) — Betclic</h3>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: '0.4rem' }}>Paliers « Plus de » uniquement (pas de marché Moins chez Betclic)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.4rem' }}>
        {ladder.map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', padding: '0.3rem 0.6rem', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: `1px solid ${BOOK_COLORS.betclic}` }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>+ de {l.line}</span>
            <OddsPill label="Plus" value={l.over} color="#4ade80" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PlayerLinesPage() {
  const { playerName: rawPlayerName } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const playerName = decodeURIComponent(rawPlayerName || '');

  const ctx = location.state || {};
  const { fixture, league, eventId } = ctx;

  const [playerProps, setPlayerProps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fixture?.home?.name || !fixture?.away?.name) { setError('missing_context'); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const url = `/api/basketball/player-props?league=${league || fixture.league || 'nba'}&home=${encodeURIComponent(fixture.home.name)}&away=${encodeURIComponent(fixture.away.name)}&date=${encodeURIComponent(fixture.date || '')}` + (eventId ? `&eventId=${eventId}` : '');
    fetch(url)
      .then(r => r.json())
      .then(d => { setPlayerProps(d); setLoading(false); })
      .catch(() => { setError('fetch_failed'); setLoading(false); });
  }, [fixture?.home?.name, fixture?.away?.name, league, eventId]);

  const player = playerProps?.players ? (
    playerProps.players[playerName]
    || Object.entries(playerProps.players).find(([name]) => name.toLowerCase() === playerName.toLowerCase())?.[1]
    || null
  ) : null;

  return (
    <div className="page detail-page">
      <button className="back-btn" onClick={() => navigate(-1)}>← Retour au match</button>

      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0.75rem 0 5rem', display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
        <span style={{ color: '#fb923c' }}>{playerName}</span>
        <span style={{ fontSize: 12, fontWeight: 400, color: '#ffffff' }}>Toutes les lignes</span>
      </h1>

      {error === 'missing_context' && (
        <div className="rp-status">Contexte du match indisponible — revenez à la page du match et cliquez à nouveau sur le joueur.</div>
      )}
      {error === 'fetch_failed' && <div className="rp-status">Erreur de chargement des cotes.</div>}
      {loading && !error && <div className="rp-status">Chargement des lignes…</div>}

      {!loading && !error && !player && (
        <div className="rp-status">Aucune ligne trouvée pour ce joueur sur ce match.</div>
      )}

      {!loading && player && (
        <div style={{ maxWidth: 880 }}>
          <StatSection title="Points"           statKey="pts" player={player} allLinesKey="AllLines" />
          <StatSection title="Rebonds"          statKey="reb" player={player} allLinesKey="AllLines" />
          <StatSection title="Passes décisives" statKey="ast" player={player} allLinesKey="AllLines" />
          <ComboSection player={player} />
          <PraLadderSection player={player} />
          <MilestoneSection player={player} />
        </div>
      )}
    </div>
  );
}
