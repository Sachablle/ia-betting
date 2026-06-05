import { useState, useEffect, useRef, Fragment, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { BBALL_FIXTURES } from '../utils/basketball';

const ALERT_KEY        = 'nba_prop_alerts';
const HISTORY_KEY      = 'nba_bet_history';
const GAME_TOTAL_KEY   = 'nba_game_total_alerts';
const EARLYWIN_KEY     = 'nba_earlywin_alerts';
const FB_BTTS_KEY      = 'fb_btts_alerts';

const FB_LEAGUE_META = {
  ligue1:     { name: 'Ligue 1',        flag: '🇫🇷' },
  pl:         { name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  laliga:     { name: 'La Liga',        flag: '🇪🇸' },
  bundes:     { name: 'Bundesliga',     flag: '🇩🇪' },
  seriea:     { name: 'Serie A',        flag: '🇮🇹' },
};

const ESPN_SHORT = { SA: 'SAS', NY: 'NYK', GS: 'GSW', NO: 'NOP', UT: 'UTA' };
const normAbbr = a => ESPN_SHORT[a?.toUpperCase()] || a?.toUpperCase() || '';
const lastName = n => n?.split(' ').slice(-1)[0]?.toLowerCase();

async function resolveCompletedBets(alerts, save) {
  const now = Date.now();
  const toResolve = alerts.filter(a => {
    if (a.status !== 'accepted') return false;
    // Commence à checker 2h après le tip-off
    return new Date(a.fixtureDate).getTime() + 2 * 3600_000 < now;
  });
  if (!toResolve.length) return;

  const byMatch = {};
  for (const a of toResolve) {
    const k = `${a.fixture}__${a.fixtureDate}`;
    if (!byMatch[k]) {
      const [home, away] = (a.fixture || '').split(' vs ');
      byMatch[k] = { home, away, date: a.fixtureDate, alerts: [] };
    }
    byMatch[k].alerts.push(a);
  }

  let changed = false;
  for (const { home, away, date, alerts: matchAlerts } of Object.values(byMatch)) {
    if (!home || !away) continue;
    try {
      const league = matchAlerts[0]?.league;
      const EU_LEAGUES = ['acb','lnb','bbl','legaa'];
      const bsUrl = league === 'euroleague'
        ? `/api/euroleague/boxscore?date=${encodeURIComponent(date)}&home=${home}&away=${away}`
        : league === 'wnba'
        ? `/api/wnba/boxscore?date=${encodeURIComponent(date)}&home=${home}&away=${away}`
        : EU_LEAGUES.includes(league)
        ? `/api/euro/${league}/boxscore?date=${encodeURIComponent(date)}&home=${home}&away=${away}`
        : `/api/nba/boxscore?date=${encodeURIComponent(date)}&home=${home}&away=${away}`;
      const bs = await fetch(bsUrl).then(r => r.json());
      if (!bs || bs.error || !Object.keys(bs).length) continue;
      if (!bs.status?.includes('STATUS_FINAL')) continue;

      for (const a of matchAlerts) {
        const bsKeys = Object.keys(bs).filter(k => !['gameId','status','homeScore','awayScore'].includes(k));
        // Matching flexible : exact, préfixe, ou sous-chaîne (gère "BON"↔"BONN", "BAR"↔"BARCELONA")
        const teamKey = bsKeys.find(k => normAbbr(k) === normAbbr(a.team))
          || bsKeys.find(k => normAbbr(k).startsWith(normAbbr(a.team)) || normAbbr(a.team).startsWith(normAbbr(k).slice(0,3)))
          || bsKeys[0]; // fallback première équipe
        const players = bs[teamKey] || [];
        const player = players.find(p =>
          p.name === a.player ||
          p.name?.toLowerCase() === a.player?.toLowerCase() ||
          lastName(p.name) === lastName(a.player)
        );
        if (!player || player.dnp) { if (players.length > 0) { a._delete = true; changed = true; } continue; }
        const actual = player.stats?.[a.stat];
        if (actual == null) continue;
        a.actualStat = actual;
        a.resolvedAt = Date.now();
        a.status = (a.direction === 'over' ? actual > a.line : actual < a.line) ? 'won' : 'lost';
        changed = true;
      }
    } catch {}
  }

  if (changed) save(alerts.filter(a => !a._delete));
}

function groupAlerts(alerts) {
  const map = {};
  for (const a of alerts) {
    if (!['over','under'].includes(a.direction)) continue;
    const dateKey = new Date(a.fixtureDate).toISOString().slice(0, 10); // normalise YYYY-MM-DD
    const key = `${a.player}__${dateKey}__${a.stat}__${a.direction}`;
    if (!map[key]) {
      map[key] = {
        key,
        player:      a.player,
        team:        a.team,
        fixture:     a.fixture,
        round:       a.round,
        fixtureDate: a.fixtureDate,
        homeTeam:    a.homeTeam || null,
        awayTeam:    a.awayTeam || null,
        eventId:     a.eventId  || null,
        league:      a.league || 'nba',
        stats:       [],
        maxProb:     0,
        ids:         [],
        status:           a.status || 'pending',
        injury:           a.injury || null,
        acceptedAt:       0,
        acceptedBookmaker: a.acceptedBookmaker || null,
      };
    }
    // Priorité statut : accepted > rejected > pending
    const STATUS_RANK = { accepted: 2, rejected: 1, pending: 0 };
    const rank = s => STATUS_RANK[s] ?? 0;
    if (rank(a.status) > rank(map[key].status)) map[key].status = a.status;
    // Déduplique par stat+direction : garde la meilleure probabilité
    const statKey = `${a.stat}__${a.direction}`;
    const existing = map[key].stats.findIndex(s => `${s.stat}__${s.direction}` === statKey);
    const entry = { stat: a.stat, direction: a.direction, line: a.line, unibetLine: a.unibetLine, betclicLine: a.betclicLine, winamaxLine: a.winamaxLine, estimate: a.estimate, probability: a.probability, pinnacleOdds: a.pinnacleOdds, unibetOdds: a.unibetOdds, betclicOdds: a.betclicOdds, winamaxOdds: a.winamaxOdds, acceptedUnibetOdds: a.acceptedUnibetOdds ?? null, acceptedBetclicOdds: a.acceptedBetclicOdds ?? null, acceptedWinamaxOdds: a.acceptedWinamaxOdds ?? null, oddsAlert: a.oddsAlert || null };
    if (existing === -1) map[key].stats.push(entry);
    else if (a.probability > map[key].stats[existing].probability) map[key].stats[existing] = entry;
    if (a.oddsAlert) map[key].hasOddsAlert = true;
    if (a.injuryAlert) map[key].hasInjuryAlert = true;
    map[key].maxProb = Math.max(map[key].maxProb, a.probability);
    map[key].ids.push(a.id);
    if (a.acceptedAt) map[key].acceptedAt = Math.max(map[key].acceptedAt, a.acceptedAt);
    if (a.acceptedBookmaker && !map[key].acceptedBookmaker) map[key].acceptedBookmaker = a.acceptedBookmaker;
  }
  return Object.values(map).sort((a, b) => {
    if (a.acceptedAt && b.acceptedAt) return b.acceptedAt - a.acceptedAt;
    const dateDiff = new Date(a.fixtureDate) - new Date(b.fixtureDate);
    if (dateDiff !== 0) return dateDiff;
    return b.maxProb - a.maxProb;
  });
}

function groupResultAlerts(alerts) {
  const map = {};
  for (const a of alerts) {
    if (!['won', 'lost', 'void'].includes(a.status)) continue;
    const key = `${a.player}__${a.fixtureDate}`;
    if (!map[key]) map[key] = {
      key, player: a.player, team: a.team, fixture: a.fixture,
      fixtureDate: a.fixtureDate, league: a.league || 'nba', results: [], ids: [],
    };
    map[key].results.push({
      stat: a.stat, direction: a.direction, line: a.line,
      actualStat: a.actualStat, status: a.status,
      unibetOdds: a.unibetOdds, betclicOdds: a.betclicOdds, winamaxOdds: a.winamaxOdds,
    });
    map[key].ids.push(a.id);
  }
  return Object.values(map).sort((a, b) => new Date(b.fixtureDate) - new Date(a.fixtureDate));
}

function groupByAcceptedDate(groups, totalAlerts) {
  const byDate = {};
  const add = (item, ts, type) => {
    const dateKey = ts ? new Date(ts).toISOString().slice(0, 10) : 'no-date';
    const label   = ts
      ? new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'Sans date';
    if (!byDate[dateKey]) byDate[dateKey] = { dateKey, label, sortKey: ts || 0, items: [] };
    byDate[dateKey].items.push({ ...item, _itemType: type });
  };
  groups.forEach(g  => add(g, g.acceptedAt || 0, 'group'));
  totalAlerts.forEach(a => add(a, a.acceptedAt || 0, 'total'));
  return Object.values(byDate).sort((a, b) => a.sortKey - b.sortKey);
}

function DateGroup({ dateLabel, items, variant, onDismissGroup, onDismissTotal, onVoid }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '6px', padding: '0.3rem 0.6rem', cursor: 'pointer',
          color: 'var(--text-dim)', fontSize: 11, textAlign: 'left',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
          {dateLabel}
        </span>
        <span style={{
          background: 'rgba(255,255,255,0.08)', borderRadius: '10px',
          padding: '1px 7px', fontSize: 10,
        }}>
          {items.length} pari{items.length > 1 ? 's' : ''}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && items.map(item =>
        item._itemType === 'group'
          ? <CompactAcceptedCard key={item.key} group={item} onDismiss={onDismissGroup} onVoid={onVoid} variant={variant} />
          : <CompactAcceptedTotalCard key={item.id} alert={item} onDismiss={onDismissTotal} variant={variant} />
      )}
    </div>
  );
}

const STAT_LABEL = { pts: 'Pts', reb: 'Reb', ast: 'Ast' };

const CARD_ACCENT = {
  won:      { border: 'rgba(74,222,128,0.3)',   bg: 'rgba(74,222,128,0.06)',  bgHover: 'rgba(74,222,128,0.12)' },
  lost:     { border: 'rgba(248,113,113,0.3)',  bg: 'rgba(248,113,113,0.06)', bgHover: 'rgba(248,113,113,0.12)' },
  accepted: { border: 'rgba(96,165,250,0.25)',  bg: 'rgba(96,165,250,0.05)',  bgHover: 'rgba(96,165,250,0.1)'  },
  void:     { border: 'rgba(148,163,184,0.25)', bg: 'rgba(148,163,184,0.05)', bgHover: 'rgba(148,163,184,0.1)' },
};

// Trouve le fixture BBALL le plus proche de l'alerte (date + équipes)
function resolveMatchId({ ids, fixture, fixtureDate, homeTeam, awayTeam, eventId, league }) {
  // WNBA — l'ID ESPN est suffisant ; la page le charge via le scoreboard live
  if (league === 'wnba' && eventId) return `${eventId}?league=wnba`;
  // EU basket (ACB/BBL/LegaA/LNB) — eventId = api-sports game ID
  const EU_BBALL = ['acb', 'lnb', 'bbl', 'legaa'];
  if (EU_BBALL.includes(league) && eventId) return `${eventId}?league=${league}`;

  const norm  = s => (s || '').toLowerCase().replace(/[^a-z]/g, '');
  const fuzzy = (a, b) => { const na = norm(a), nb = norm(b); return na.includes(nb) || nb.includes(na) || (na.length >= 5 && nb.length >= 5 && na.slice(0,5) === nb.slice(0,5)); };
  const targetMs = new Date(fixtureDate).getTime();
  const isDone = f => /terminé/i.test(f.round || '');
  // Préfère les fixtures non-terminés ; à égalité, prend le plus proche par date
  const byDate = arr => [...arr].sort((a, b) => {
    const diff = (isDone(a) ? 1 : 0) - (isDone(b) ? 1 : 0);
    if (diff !== 0) return diff;
    return Math.abs(new Date(a.date) - targetMs) - Math.abs(new Date(b.date) - targetMs);
  });

  // 1. IDs statiques 'b...' — choisit le plus proche chronologiquement de fixtureDate
  const staticIds = (ids || []).map(id => id?.split('_')[0]).filter(p => p?.startsWith('b'));
  if (staticIds.length) {
    const candidates = staticIds.map(sid => BBALL_FIXTURES.find(f => f.id === sid)).filter(Boolean);
    if (candidates.length) return byDate(candidates)[0].id;
  }

  // 2. Noms complets homeTeam / awayTeam → fixture le plus proche
  if (homeTeam || awayTeam) {
    const matches = BBALL_FIXTURES.filter(f =>
      (!homeTeam || fuzzy(f.home.name, homeTeam)) &&
      (!awayTeam || fuzzy(f.away.name, awayTeam))
    );
    if (matches.length) return byDate(matches)[0].id;
  }

  // 3. Abbréviations ESPN
  const ESPN_TO_STD = { NY: 'NYK', SA: 'SAS', GS: 'GSW', NO: 'NOP', UT: 'UTA' };
  const normAbbr = a => { const u = (a || '').trim().toUpperCase(); return ESPN_TO_STD[u] || u; };
  const [ha, aw] = (fixture || '').split(' vs ').map(normAbbr);
  const abbrvMatches = BBALL_FIXTURES.filter(f =>
    f.home?.short?.toUpperCase() === ha && f.away?.short?.toUpperCase() === aw
  );
  return abbrvMatches.length ? byDate(abbrvMatches)[0].id : null;
}

function ResultCard({ group, onDismiss }) {
  const wonCount  = group.results.filter(r => r.status === 'won').length;
  const lostCount = group.results.filter(r => r.status === 'lost').length;
  const voidCount = group.results.filter(r => r.status === 'void').length;
  const allWon  = wonCount > 0 && lostCount === 0 && voidCount === 0;
  const allLost = lostCount > 0 && wonCount === 0 && voidCount === 0;
  const accent  = allWon ? '#4ade80' : allLost ? '#f87171' : '#94a3b8';
  const accentBg = allWon ? 'rgba(74,222,128,0.08)' : allLost ? 'rgba(248,113,113,0.06)' : 'rgba(148,163,184,0.07)';

  return (
    <div className="bet-card" style={{ '--league-accent': accent, borderColor: `${accent}33`, position: 'relative' }}>
      <button
        onClick={() => onDismiss(group.ids)}
        style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
      >×</button>

      <div className="bc-header">
        <span className="bc-flag">🏀</span>
        <span className="bc-league">{group.league === 'wnba' ? 'WNBA Props' : group.league === 'euroleague' ? 'EL Props' : group.league === 'acb' ? 'ACB Props' : group.league === 'bbl' ? 'BBL Props' : group.league === 'legaa' ? 'Lega A Props' : group.league === 'lnb' ? 'LNB Props' : 'NBA Props'} · {group.fixture}</span>
        <span style={{
          marginLeft: 'auto', marginRight: 24, fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 10,
          color: accent, background: accentBg,
        }}>
          {allWon ? '✓ GAGNÉ' : allLost ? '✗ PERDU' : `${wonCount}W / ${lostCount}L${voidCount ? ` / ${voidCount}V` : ''}`}
        </span>
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, margin: '0.4rem 0 0.15rem' }}>{group.player}</div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: '0.6rem' }}>
        {new Date(group.fixtureDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {group.results.map((r, i) => {
          const isWon  = r.status === 'won';
          const isVoid = r.status === 'void';
          const rc     = isVoid ? '#94a3b8' : isWon ? '#4ade80' : '#f87171';
          const rbg    = isVoid ? 'rgba(148,163,184,0.07)' : isWon ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.06)';
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr auto', gap: '0 0.5rem', alignItems: 'center', padding: '0.3rem 0.5rem', borderRadius: 6, background: rbg }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>{STAT_LABEL[r.stat] ?? r.stat}</span>
              <span style={{ fontSize: 11 }}>
                {r.direction === 'over'
                  ? <span style={{ color: '#4ade80', fontWeight: 700 }}>▲ Over {r.line}</span>
                  : <span style={{ color: '#f87171', fontWeight: 700 }}>▼ Under {r.line}</span>}
                {r.actualStat != null && (
                  <span style={{ color: 'var(--text-dim)', marginLeft: 6, fontSize: 10 }}>→ réalisé : <b style={{ color: 'var(--text)' }}>{r.actualStat}</b></span>
                )}
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, color: rc }}>
                {isVoid ? 'Void' : isWon ? '✓' : '✗'}
              </span>
            </div>
          );
        })}
      </div>

      {(group.results[0]?.unibetOdds || group.results[0]?.betclicOdds || group.results[0]?.winamaxOdds) && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', fontSize: 10, color: 'var(--text-dim)' }}>
          {group.results[0].unibetOdds && <span>Unibet <b style={{ color: '#1db954' }}>{group.results[0].unibetOdds.toFixed(2)}</b></span>}
          {group.results[0].betclicOdds && <span>Betclic <b style={{ color: '#e0292e' }}>{group.results[0].betclicOdds.toFixed(2)}</b></span>}
          {group.results[0].winamaxOdds && <span>Winamax <b style={{ color: '#fff' }}>{group.results[0].winamaxOdds.toFixed(2)}</b></span>}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', margin: '1.2rem 0 0.5rem' }}>
      {children}
    </h2>
  );
}

function CompactAcceptedCard({ group, onDismiss, onVoid, variant = 'accepted' }) {
  const navigate = useNavigate();
  const [oddsOpen, setOddsOpen] = useState(false);
  const { player, fixtureDate, stats, maxProb, ids } = group;
  const oddsAlerts = stats.filter(s => s.oddsAlert);
  const colors = group.hasOddsAlert
    ? { border: 'rgba(239,68,68,0.4)', bg: 'rgba(239,68,68,0.05)', bgHover: 'rgba(239,68,68,0.1)' }
    : (CARD_ACCENT[variant] || CARD_ACCENT.accepted);

  const dismissingRef = useRef(false);
  const goToMatch = (e) => {
    if (dismissingRef.current) { dismissingRef.current = false; return; }
    e?.stopPropagation();
    const id = resolveMatchId(group);
    if (!id) return;
    const path = id.includes('?')
      ? `/basketball/${id}&props=1`
      : `/basketball/${id}?props=1`;
    startTransition(() => navigate(path));
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', padding: '0.45rem 0.75rem', borderRadius: 7, border: `1px solid ${colors.border}`, background: colors.bg, transition: 'background 0.15s', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = colors.bgHover}
      onMouseLeave={e => e.currentTarget.style.background = colors.bg}
      onClick={goToMatch}
    >
      {/* Ligne principale : [badge + colonne gauche] + [colonne stat+cote] + prob + × */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
        {group.hasOddsAlert && (
          <span style={{ width: 14, height: 14, borderRadius: 7, background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>!</span>
        )}

        {/* Colonne gauche : nom + mouvement cotes collé dessous */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: 12, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player}</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
              {new Date(fixtureDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            </span>
          </div>
          {oddsAlerts.map(s => (
            <div key={s.stat} style={{ fontSize: 9, color: '#fca5a5', lineHeight: 1.5 }}>
              {s.oddsAlert.lineTo   != null && <span>Cut : <b>{s.oddsAlert.lineFrom}</b> → <b>{s.oddsAlert.lineTo}</b> · </span>}
              {s.oddsAlert.ubTo    != null && <span>Unibet : {s.oddsAlert.ubFrom?.toFixed(2)} → <b>{s.oddsAlert.ubTo?.toFixed(2)}</b> · </span>}
              {s.oddsAlert.bcTo    != null && <span>Betclic : {s.oddsAlert.bcFrom?.toFixed(2)} → <b>{s.oddsAlert.bcTo?.toFixed(2)}</b> · </span>}
              {s.oddsAlert.wmTo    != null && <span>Winamax : {s.oddsAlert.wmFrom?.toFixed(2)} → <b>{s.oddsAlert.wmTo?.toFixed(2)}</b></span>}
            </div>
          ))}
        </div>

        {/* Colonne droite : stat + cote alignées */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.1rem', flexShrink: 0 }}>
          {stats.map(s => {
            // Si un bookmaker a été sélectionné au clic, n'afficher que celui-là
            const bk = group.acceptedBookmaker;
            const bkOdds = bk
              ? [
                  bk === 'unibet'  && { value: s.acceptedUnibetOdds  ?? s.unibetOdds,  color: '#1db954', label: 'Unibet' },
                  bk === 'betclic' && { value: s.acceptedBetclicOdds ?? s.betclicOdds, color: '#e0292e', label: 'Betclic' },
                  bk === 'winamax' && { value: s.acceptedWinamaxOdds ?? s.winamaxOdds, color: '#e5e7eb', label: 'Winamax' },
                ].filter(Boolean).filter(o => o.value != null)
              : [
                  { value: s.acceptedUnibetOdds  ?? s.unibetOdds,  color: '#1db954' },
                  { value: s.acceptedBetclicOdds ?? s.betclicOdds, color: '#e0292e' },
                  { value: s.acceptedWinamaxOdds ?? s.winamaxOdds, color: '#e5e7eb' },
                ].filter(o => o.value != null);
            const best = bkOdds.length ? bkOdds.reduce((a, b) => a.value > b.value ? a : b) : null;
            const others = best ? bkOdds.filter(o => o !== best) : [];
            return (
              <div key={s.stat} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.1rem' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: s.direction === 'over' ? '#4ade80' : '#f87171' }}>
                  {s.direction === 'over' ? '▲' : '▼'} {s.line} {STAT_LABEL[s.stat] ?? s.stat}
                </span>
                {best && (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.25rem' }}>
                    {oddsOpen && others.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.1rem' }}>
                        {others.map((o, i) => (
                          <span key={i} style={{ fontSize: 10, fontWeight: 700, color: o.color, fontVariantNumeric: 'tabular-nums',
                            background: 'rgba(255,255,255,0.04)', border: `1px solid ${o.color}33`,
                            borderRadius: 4, padding: '1px 5px' }}>
                            {o.value.toFixed(2)}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                      <span
                        onClick={e => { e.stopPropagation(); setOddsOpen(x => !x); }}
                        style={{ fontSize: 11, fontWeight: 800, color: best.color, fontVariantNumeric: 'tabular-nums', cursor: bk ? 'default' : 'pointer' }}
                      >
                        {best.value.toFixed(2)}
                      </span>
                      {best.label && <span style={{ fontSize: 9, color: best.color, opacity: 0.7 }}>{best.label}</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <span style={{ fontSize: 10, fontWeight: 800, color: '#60a5fa', minWidth: 28, textAlign: 'right', marginTop: 1 }}>{maxProb}%</span>
        <button
          onMouseDown={() => { dismissingRef.current = true; }}
          onClick={e => { e.stopPropagation(); onDismiss(ids); }}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 15, padding: '0 0 0 4px', lineHeight: 1 }}
        >×</button>
      </div>
    </div>
  );
}

function CompactAcceptedTotalCard({ alert, onDismiss, variant = 'accepted' }) {
  const navigate = useNavigate();
  const { id, homeShort, awayShort, home, away, date, direction, line, prob, unibetOdds, betclicOdds, winamaxOdds, acceptedUnibetOdds, acceptedBetclicOdds, acceptedWinamaxOdds, acceptedBookmaker, acceptedOdds, league } = alert;
  const fixtureId = id?.replace('_total', '') ?? null;
  const leagueParam = league && league !== 'nba' ? `?league=${league}` : '';
  const isOver = direction === 'over';
  const accent = isOver ? '#4ade80' : '#f87171';
  // Si un bookmaker a été sélectionné au clic, n'afficher que celui-là
  const bkColors = { unibet: '#1db954', betclic: '#e0292e', winamax: '#e5e7eb' };
  const bkLabels = { unibet: 'Unibet', betclic: 'Betclic', winamax: 'Winamax' };
  const dispUnibet  = acceptedBookmaker ? (acceptedBookmaker === 'unibet'  ? (acceptedUnibetOdds  ?? unibetOdds)  : null) : (acceptedUnibetOdds  ?? unibetOdds);
  const dispBetclic = acceptedBookmaker ? (acceptedBookmaker === 'betclic' ? (acceptedBetclicOdds ?? betclicOdds) : null) : (acceptedBetclicOdds ?? betclicOdds);
  const dispWinamax = acceptedBookmaker ? (acceptedBookmaker === 'winamax' ? (acceptedWinamaxOdds ?? winamaxOdds) : null) : (acceptedWinamaxOdds ?? winamaxOdds);
  const hasOdds = dispUnibet || dispBetclic || dispWinamax;
  const colors = CARD_ACCENT[variant] || CARD_ACCENT.accepted;

  return (
    <div
      onClick={() => fixtureId && startTransition(() => navigate(`/basketball/${fixtureId}${leagueParam}`))}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', padding: '0.45rem 0.75rem', borderRadius: 7, border: `1px solid ${colors.border}`, background: colors.bg, cursor: fixtureId ? 'pointer' : 'default', transition: 'background 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.background = colors.bgHover}
      onMouseLeave={e => e.currentTarget.style.background = colors.bg}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{homeShort || home} vs {awayShort || away}</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
          {new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: accent, marginLeft: 'auto', flexShrink: 0 }}>
          {isOver ? '▲' : '▼'} {line}
        </span>
        {prob != null && (
          <span style={{ fontSize: 10, fontWeight: 800, color: '#60a5fa', minWidth: 28, textAlign: 'right' }}>{prob}%</span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onDismiss(id); }}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 15, padding: '0 0 0 4px', lineHeight: 1 }}
        >×</button>
      </div>
      {hasOdds && (
        <div style={{ display: 'flex', gap: '0.6rem', paddingLeft: 4, marginTop: 1 }}>
          {dispUnibet  && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Unibet <b style={{ color: '#1db954', fontVariantNumeric: 'tabular-nums' }}>{dispUnibet.toFixed(2)}</b></span>}
          {dispBetclic && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Betclic <b style={{ color: '#e0292e', fontVariantNumeric: 'tabular-nums' }}>{dispBetclic.toFixed(2)}</b></span>}
          {dispWinamax && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Winamax <b style={{ color: '#e5e7eb', fontVariantNumeric: 'tabular-nums' }}>{dispWinamax.toFixed(2)}</b></span>}
        </div>
      )}
    </div>
  );
}

function GameTotalCard({ alert, onAccept, onReject, onDismiss }) {
  const { id, home, away, homeShort, awayShort, date, estimated, line, edge, direction, prob, status, league, unibetOdds, betclicOdds, winamaxOdds } = alert;
  const navigate   = useNavigate();
  const isPending  = status === 'pending';
  const isAccepted = status === 'accepted';
  const fixtureId   = id?.replace('_total', '') ?? null;
  const leagueParam = league && league !== 'nba' ? `?league=${league}` : '';
  const isOver      = direction === 'over';
  const accent     = isOver ? '#4ade80' : '#f87171';
  const leagueLabel = league === 'euroleague' ? 'EL Total' : league === 'wnba' ? 'WNBA Total' : 'NBA Total';

  const now      = Date.now();
  const msLeft   = new Date(date).getTime() - now;
  const hoursLeft = msLeft / 3_600_000;
  const daysLeft  = Math.floor(hoursLeft / 24);
  const hRem      = Math.floor(hoursLeft % 24);
  const mRem      = Math.floor((msLeft % 3_600_000) / 60_000);
  const timeLabel = msLeft <= 0 ? 'Imminent' : daysLeft > 0 ? `${daysLeft}j ${hRem}h` : hoursLeft >= 1 ? `${Math.floor(hoursLeft)}h ${mRem}m` : `${mRem}m`;
  const barPct    = Math.min(Math.max(msLeft / (7 * 24 * 3_600_000) * 100, 0), 100);

  return (
    <div
      className="bet-card"
      style={{ position: 'relative', '--league-accent': '#f47c20', cursor: fixtureId ? 'pointer' : 'default' }}
      onClick={() => fixtureId && startTransition(() => navigate(`/basketball/${fixtureId}${leagueParam}`))}
    >
      {isPending
        ? <button onClick={e => { e.stopPropagation(); onReject(id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}><svg width="14" height="14" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7.5" stroke="#ef4444" strokeWidth="1.5"/><path d="M6 6l6 6M12 6l-6 6" stroke="#ef4444" strokeWidth="1.75" strokeLinecap="round"/></svg></button>
        : <button onClick={e => { e.stopPropagation(); onDismiss(id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      }
      <div className="bc-header">
        <span className="bc-flag">🏀</span>
        <span className="bc-league">{leagueLabel}</span>
        {!isPending && (
          <span style={{ marginLeft: 'auto', marginRight: 24, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: isAccepted ? '#4ade80' : '#f87171', background: isAccepted ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)' }}>
            {isAccepted ? '✓ Accepté' : '✗ Rejeté'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: '0.4rem', paddingRight: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span className="bc-team bc-team-home">{homeShort || home}</span>
          <span className="bc-vs">vs</span>
          <span className="bc-team bc-team-away">{awayShort || away}</span>
        </div>
        {prob != null && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem', flexShrink: 0 }}>
            <span className={`bc-edge-badge ${prob >= 90 ? 'high' : 'mid'}`}>{prob}%</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              {new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
      </div>

      <div style={{ margin: '0.6rem 0', padding: '0.45rem 0.6rem', borderRadius: 6, background: isOver ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: accent }}>
          {isOver ? '▲ Over' : '▼ Under'} {line}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
          Modèle : <b style={{ color: 'var(--text)' }}>{estimated}</b> pts
          {edge != null && <span> · Edge <b style={{ color: accent }}>{edge > 0 ? '+' : ''}{edge}%</b></span>}
        </div>
      </div>

      <div className="bc-stats" style={{ margin: '0.35rem 0 0.25rem' }}>
        <div className="bc-prob">
          <div className="bc-prob-bar-track">
            <div className="bc-prob-bar-fill" style={{ width: `${barPct}%`, background: accent }} />
          </div>
          <span className="bc-prob-pct" style={{ color: '#60a5fa', fontSize: 10 }}>{timeLabel}</span>
        </div>
      </div>

      {(unibetOdds || betclicOdds || winamaxOdds) && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { label: 'Unibet',  odds: unibetOdds,  color: '#1db954' },
            { label: 'Betclic', odds: betclicOdds, color: '#e0292e' },
            { label: 'Winamax', odds: winamaxOdds, color: '#e5e7eb' },
          ].filter(b => b.odds).map(({ label, odds, color }) => (
            <div key={label}
              onClick={isPending ? e => { e.stopPropagation(); onAccept(id, label.toLowerCase(), odds); } : undefined}
              style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '0.3rem', cursor: isPending ? 'pointer' : 'default', transition: 'background 0.15s' }}
              onMouseEnter={isPending ? e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)' : undefined}
              onMouseLeave={isPending ? e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)' : undefined}
            >
              <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{odds.toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EarlyWinCard({ alert, onAccept, onReject, onDismiss }) {
  const { id, home, away, homeShort, awayShort, date, teamName, teamShort, threshold, prob, edge, odds, bookmaker, status, league } = alert;
  const navigate   = useNavigate();
  const isPending  = status === 'pending';
  const isAccepted = status === 'accepted';
  const fixtureId  = id?.replace(/_earlywin.*/, '') ?? null;
  const leagueParam = league && league !== 'nba' ? `?league=${league}` : '';
  const leagueLabel = league === 'euroleague' ? 'EL EarlyWin' : league === 'wnba' ? 'WNBA EarlyWin' : 'NBA EarlyWin';

  const now = Date.now();
  const msLeft = new Date(date).getTime() - now;
  const hoursLeft = msLeft / 3_600_000;
  const daysLeft  = Math.floor(hoursLeft / 24);
  const hRem      = Math.floor(hoursLeft % 24);
  const mRem      = Math.floor((msLeft % 3_600_000) / 60_000);
  const timeLabel = msLeft <= 0 ? 'Imminent' : daysLeft > 0 ? `${daysLeft}j ${hRem}h` : hoursLeft >= 1 ? `${Math.floor(hoursLeft)}h ${mRem}m` : `${mRem}m`;
  const barPct    = Math.min(Math.max(msLeft / (7 * 24 * 3_600_000) * 100, 0), 100);
  const bkColor   = bookmaker === 'unibet' ? '#1db954' : bookmaker === 'betclic' ? '#e0292e' : '#e5e7eb';

  return (
    <div
      className="bet-card"
      style={{ position: 'relative', '--league-accent': '#f59e0b', cursor: fixtureId ? 'pointer' : 'default' }}
      onClick={() => fixtureId && startTransition(() => navigate(`/basketball/${fixtureId}${leagueParam}`))}
    >
      {!isPending && (
        <button onClick={e => { e.stopPropagation(); onDismiss(id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      )}
      {prob != null && (
        <span className={`bc-edge-badge ${prob >= 80 ? 'high' : 'mid'}`} style={{ position: 'absolute', top: 34, right: 10 }}>{prob}%</span>
      )}
      <div className="bc-header">
        <span className="bc-flag">⏱</span>
        <span className="bc-league">{leagueLabel}</span>
        {!isPending && (
          <span style={{ marginLeft: 'auto', marginRight: 24, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: isAccepted ? '#4ade80' : '#f87171', background: isAccepted ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)' }}>
            {isAccepted ? '✓ Accepté' : '✗ Rejeté'}
          </span>
        )}
      </div>
      <div className="bc-matchup" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.1rem', marginTop: '0.5rem', paddingRight: '52px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span className="bc-team bc-team-home">{homeShort || home}</span>
          <span className="bc-vs">vs</span>
          <span className="bc-team bc-team-away">{awayShort || away}</span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          · {new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div style={{ margin: '0.6rem 0', padding: '0.45rem 0.6rem', borderRadius: 6, background: 'rgba(245,158,11,0.08)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>
          {teamShort || teamName} mène +{threshold} ou gagne
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
          P(EarlyWin) <b style={{ color: 'var(--text)' }}>{prob}%</b>
          {edge != null && <span> · Edge <b style={{ color: '#f59e0b' }}>{edge > 0 ? '+' : ''}{edge}%</b></span>}
        </div>
      </div>
      <div className="bc-stats" style={{ marginBottom: isPending ? '0.5rem' : '0.6rem' }}>
        <div className="bc-prob">
          <div className="bc-prob-bar-track">
            <div className="bc-prob-bar-fill" style={{ width: `${barPct}%`, background: '#f59e0b' }} />
          </div>
          <span className="bc-prob-pct" style={{ color: '#60a5fa', fontSize: 10 }}>{timeLabel}</span>
        </div>
      </div>
      {odds && (
        <div style={{ marginBottom: '0.5rem' }}>
          <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '0.3rem' }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 2, textTransform: 'capitalize' }}>{bookmaker}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: bkColor, fontVariantNumeric: 'tabular-nums' }}>{odds.toFixed(2)}</div>
          </div>
        </div>
      )}
      {isPending ? (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={e => { e.stopPropagation(); onAccept(id); }} style={{ flex: 1, padding: '0.4rem', borderRadius: 6, border: '1px solid rgba(74,222,128,0.5)', background: 'rgba(74,222,128,0.08)', color: '#4ade80', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>✓ Accepter</button>
          <button onClick={e => { e.stopPropagation(); onReject(id); }} style={{ flex: 1, padding: '0.4rem', borderRadius: 6, border: '1px solid rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.06)', color: '#f87171', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>✗ Rejeter</button>
        </div>
      ) : null}
    </div>
  );
}

function TotalResultCard({ alert, onDismiss }) {
  const { id, home, away, homeShort, awayShort, date, direction, line, actualTotal, status } = alert;
  const isWon   = status === 'won';
  const accent  = isWon ? '#4ade80' : '#f87171';
  const accentBg = isWon ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.06)';
  const isOver  = direction === 'over';

  return (
    <div className="bet-card" style={{ '--league-accent': accent, borderColor: `${accent}33`, position: 'relative' }}>
      <button onClick={() => onDismiss(id)} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      <div className="bc-header">
        <span className="bc-flag">🏀</span>
        <span className="bc-league">{alert.league === 'euroleague' ? 'EL Total' : alert.league === 'wnba' ? 'WNBA Total' : 'NBA Total'} · {homeShort || home} vs {awayShort || away}</span>
        <span style={{ marginLeft: 'auto', marginRight: 24, fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 10, color: accent, background: accentBg }}>
          {isWon ? '✓ GAGNÉ' : '✗ PERDU'}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
        {new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.3rem 0.5rem', borderRadius: 6, background: accentBg }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: isOver ? '#4ade80' : '#f87171' }}>
          {isOver ? '▲ Over' : '▼ Under'} {line}
        </span>
        {actualTotal != null && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>
            → réalisé : <b style={{ color: 'var(--text)' }}>{actualTotal}</b>
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: accent }}>{isWon ? '✓' : '✗'}</span>
      </div>
    </div>
  );
}

function PropAlertCard({ group, onDismiss, onAccept, onReject }) {
  const { player, fixtureDate, stats, maxProb, ids, status, injury, league } = group;
  const leagueLabel = league === 'wnba' ? 'WNBA Props' : league === 'euroleague' ? 'EL Props' : league === 'acb' ? 'ACB Props' : league === 'bbl' ? 'BBL Props' : league === 'legaa' ? 'Lega A Props' : league === 'lnb' ? 'LNB Props' : 'NBA Props';
  const navigate = useNavigate();

  const goToMatch = (e) => {
    e?.stopPropagation();
    const id = resolveMatchId(group);
    if (!id) return;
    const path = id.includes('?') ? `/basketball/${id}&props=1` : `/basketball/${id}?props=1`;
    startTransition(() => navigate(path));
  };
  const isPending  = status === 'pending';
  const isAccepted = status === 'accepted';

  const now = Date.now();
  const msLeft    = new Date(fixtureDate).getTime() - now;
  const hoursLeft = msLeft / 3_600_000;
  const daysLeft  = Math.floor(hoursLeft / 24);
  const hRem      = Math.floor(hoursLeft % 24);
  const mRem      = Math.floor((msLeft % 3_600_000) / 60_000);
  const timeLabel = msLeft <= 0 ? 'Imminent' : daysLeft > 0 ? `${daysLeft}j ${hRem}h` : hoursLeft >= 1 ? `${Math.floor(hoursLeft)}h ${mRem}m` : `${mRem}m`;
  const barPct    = Math.min(Math.max(msLeft / (7 * 24 * 3_600_000) * 100, 0), 100);
  const primaryStat = stats[0];
  const primaryIsOver = primaryStat?.direction === 'over';
  const barColor  = primaryIsOver ? '#4ade80' : '#f87171';

  return (
    <div className="bet-card" style={{ position: 'relative', cursor: 'pointer', '--league-accent': '#f47c20' }} onClick={goToMatch}>
      {isPending
        ? <button onClick={e => { e.stopPropagation(); onReject(ids); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}><svg width="14" height="14" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7.5" stroke="#ef4444" strokeWidth="1.5"/><path d="M6 6l6 6M12 6l-6 6" stroke="#ef4444" strokeWidth="1.75" strokeLinecap="round"/></svg></button>
        : <button onClick={e => { e.stopPropagation(); onDismiss(ids); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      }
      {(group.hasOddsAlert || group.hasInjuryAlert) && (
        <span style={{ position: 'absolute', top: 8, left: 10, width: 16, height: 16, borderRadius: 8, background: group.hasInjuryAlert ? '#f59e0b' : '#ef4444', color: '#fff', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>!</span>
      )}

      <div className="bc-header">
        <span className="bc-flag">🏀</span>
        <span className="bc-league">{leagueLabel}</span>
        {!isPending && (
          <span style={{ marginLeft: 'auto', marginRight: 24, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: isAccepted ? '#4ade80' : '#f87171', background: isAccepted ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)' }}>
            {isAccepted ? '✓ Accepté' : '✗ Rejeté'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: '0.4rem' }}>
        <span className="bc-team bc-team-home">{player}</span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {group.hasInjuryAlert && <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)' }}>OUT</span>}
            {!group.hasInjuryAlert && injury === 'Questionable' && <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(251,146,60,0.15)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.4)' }}>Q</span>}
            <span className={`bc-edge-badge ${maxProb >= 85 ? 'high' : 'mid'}`}>{maxProb}%</span>
          </div>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'right', whiteSpace: 'nowrap' }}>
            {new Date(fixtureDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {stats.map(({ stat, direction, line, estimate, unibetOdds, betclicOdds, winamaxOdds, oddsAlert }) => {
        const isO = direction === 'over';
        const clr = isO ? '#4ade80' : '#f87171';
        const bg  = isO ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)';
        return (
          <Fragment key={stat}>
            {/* Boîte ligne */}
            <div style={{ margin: '0.4rem 0 0', padding: '0.45rem 0.6rem', borderRadius: 6, background: oddsAlert ? 'rgba(239,68,68,0.08)' : bg }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: clr }}>
                {isO ? '▲ Over' : '▼ Under'} {line} {STAT_LABEL[stat] ?? stat}
              </div>
              {estimate != null && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
                  Proj. <b style={{ color: 'var(--text)' }}>{estimate.toFixed(1)}</b>
                </div>
              )}
              {oddsAlert && (
                <div style={{ fontSize: 9, color: '#fca5a5', marginTop: 2 }}>
                  {oddsAlert.ubTo != null && `Unibet ${oddsAlert.ubFrom?.toFixed(2)} → ${oddsAlert.ubTo?.toFixed(2)}`}
                  {oddsAlert.bcTo != null && ` · Betclic ${oddsAlert.bcFrom?.toFixed(2)} → ${oddsAlert.bcTo?.toFixed(2)}`}
                  {oddsAlert.wmTo != null && ` · Winamax ${oddsAlert.wmFrom?.toFixed(2)} → ${oddsAlert.wmTo?.toFixed(2)}`}
                </div>
              )}
            </div>
            {/* Barre temps */}
            <div className="bc-stats" style={{ margin: '0.35rem 0 0.25rem' }}>
              <div className="bc-prob">
                <div className="bc-prob-bar-track">
                  <div className="bc-prob-bar-fill" style={{ width: `${barPct}%`, background: barColor }} />
                </div>
                <span className="bc-prob-pct" style={{ color: '#60a5fa', fontSize: 10 }}>{timeLabel}</span>
              </div>
            </div>
            {/* Cotes séparées — cliquer = accepter */}
            {(unibetOdds || betclicOdds || winamaxOdds) && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[{ label: 'Unibet', odds: unibetOdds, color: '#1db954' }, { label: 'Betclic', odds: betclicOdds, color: '#e0292e' }, { label: 'Winamax', odds: winamaxOdds, color: '#e5e7eb' }]
                  .filter(b => b.odds)
                  .map(({ label, odds, color }) => (
                    <div key={label}
                      onClick={isPending ? e => { e.stopPropagation(); onAccept(ids, label.toLowerCase(), odds); } : undefined}
                      style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '0.3rem', cursor: isPending ? 'pointer' : 'default', transition: 'background 0.15s' }}
                      onMouseEnter={isPending ? e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)' : undefined}
                      onMouseLeave={isPending ? e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)' : undefined}
                    >
                      <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{odds.toFixed(2)}</div>
                    </div>
                  ))}
              </div>
            )}
          </Fragment>
        );
      })}

      {!isPending && <button className="bc-cta" onClick={goToMatch}>Voir le match →</button>}
    </div>
  );
}


function BTTSAlertCard({ alert, onAccept, onReject, onDismiss }) {
  const navigate = useNavigate();
  const meta = FB_LEAGUE_META[alert.league] || { name: alert.league, flag: '⚽' };
  const isPending  = alert.status === 'pending';
  const isAccepted = alert.status === 'accepted';

  const now = Date.now();
  const msLeft    = new Date(alert.fixtureDate).getTime() - now;
  const hoursLeft = msLeft / 3_600_000;
  const daysLeft  = Math.floor(hoursLeft / 24);
  const hRem      = Math.floor(hoursLeft % 24);
  const mRem      = Math.floor((msLeft % 3_600_000) / 60_000);
  const timeLabel = msLeft <= 0 ? 'Imminent' : daysLeft > 0 ? `${daysLeft}j ${hRem}h` : hoursLeft >= 1 ? `${Math.floor(hoursLeft)}h ${mRem}m` : `${mRem}m`;
  const barPct    = Math.min(Math.max(msLeft / (7 * 24 * 3_600_000) * 100, 0), 100);

  return (
    <div
      className="bet-card"
      style={{ position: 'relative', '--league-accent': '#10b981', borderColor: 'rgba(16,185,129,0.25)', cursor: alert.fixtureId ? 'pointer' : 'default' }}
      onClick={() => { if (alert.fixtureId) navigate(`/football/${alert.fixtureId}`); }}
    >
      {isPending
        ? <button onClick={e => { e.stopPropagation(); onReject(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}><svg width="14" height="14" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7.5" stroke="#ef4444" strokeWidth="1.5"/><path d="M6 6l6 6M12 6l-6 6" stroke="#ef4444" strokeWidth="1.75" strokeLinecap="round"/></svg></button>
        : <button onClick={e => { e.stopPropagation(); onDismiss(alert.id); }} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      }
      <div className="bc-header">
        <span className="bc-flag">{meta.flag}</span>
        <span className="bc-league">{meta.name}</span>
        {!isPending && (
          <span style={{ marginLeft: 'auto', marginRight: 24, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: isAccepted ? '#4ade80' : '#f87171', background: isAccepted ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)' }}>
            {isAccepted ? '✓ Accepté' : '✗ Rejeté'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: '0.4rem', paddingRight: '4px' }}>
        <span className="bc-team bc-team-home">{alert.fixture}</span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem', flexShrink: 0 }}>
          <span className={`bc-edge-badge ${alert.probability >= 85 ? 'high' : 'mid'}`}>{alert.probability}%</span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            {new Date(alert.fixtureDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{alert.round ? ` · ${alert.round}` : ''}
          </span>
        </div>
      </div>

      <div style={{ margin: '0.4rem 0 0', padding: '0.45rem 0.6rem', borderRadius: 6, background: 'rgba(16,185,129,0.06)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>✓ Les deux équipes marquent</div>
        {alert.edge != null && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
            Edge vs Pinnacle : <b style={{ color: alert.edge >= 3 ? '#10b981' : 'var(--text-dim)' }}>{alert.edge >= 0 ? '+' : ''}{alert.edge}%</b>
          </div>
        )}
      </div>

      <div className="bc-stats" style={{ margin: '0.35rem 0 0.25rem' }}>
        <div className="bc-prob">
          <div className="bc-prob-bar-track">
            <div className="bc-prob-bar-fill" style={{ width: `${barPct}%`, background: '#10b981' }} />
          </div>
          <span className="bc-prob-pct" style={{ color: '#60a5fa', fontSize: 10 }}>{timeLabel}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {[{ label: 'Pinnacle', odds: alert.pinnacleOdds, color: 'var(--text)' }, { label: 'Unibet', odds: alert.unibetOdds, color: '#1db954' }, { label: 'Betclic', odds: alert.betclicOdds, color: '#e0292e' }]
          .filter(b => b.odds)
          .map(({ label, odds, color }) => (
            <div key={label}
              onClick={isPending ? e => { e.stopPropagation(); onAccept(alert.id, label.toLowerCase(), odds); } : undefined}
              style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '0.3rem', cursor: isPending ? 'pointer' : 'default', transition: 'background 0.15s' }}
              onMouseEnter={isPending ? e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)' : undefined}
              onMouseLeave={isPending ? e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)' : undefined}
            >
              <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{odds.toFixed(2)}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ── Hook live boxscore NBA/WNBA (B) ──────────────────────────────────────────
function useLiveBoxscore(acceptedGroups) {
  const [liveStats, setLiveStats] = useState({});
  const NBA_WNBA = new Set(['nba', 'wnba']);
  const keys = acceptedGroups.filter(g => NBA_WNBA.has(g.league)).map(g => g.key).join(',');

  useEffect(() => {
    const now = Date.now();
    const active = acceptedGroups.filter(g => {
      if (!NBA_WNBA.has(g.league)) return false;
      const t = new Date(g.fixtureDate).getTime();
      return t > 0 && now > t - 3600_000 && now < t + 6 * 3600_000;
    });
    if (!active.length) { setLiveStats({}); return; }

    const doFetch = async () => {
      const result = {};
      const byMatch = {};
      for (const g of active) {
        const mk = `${g.homeShort||''}__${g.awayShort||''}`;
        if (!byMatch[mk]) byMatch[mk] = { ...g, alerts: [] };
        byMatch[mk].alerts.push(g);
      }
      for (const match of Object.values(byMatch)) {
        try {
          const base = match.league === 'wnba' ? '/api/wnba' : '/api/nba';
          const bs = await fetch(`${base}/boxscore?date=${encodeURIComponent(match.fixtureDate)}&home=${match.homeShort}&away=${match.awayShort}`)
            .then(r => r.ok ? r.json() : null).catch(() => null);
          if (!bs || bs.error) continue;
          const allPlayers = Object.entries(bs)
            .filter(([k]) => !['gameId','status','homeScore','awayScore','error'].includes(k))
            .flatMap(([,ps]) => ps || []);
          const ln = n => n?.split(' ').pop()?.toLowerCase();
          for (const g of match.alerts) {
            const p = allPlayers.find(p => p.name === g.player || ln(p.name) === ln(g.player));
            if (p?.stats) result[g.key] = p.stats;
          }
        } catch {}
      }
      setLiveStats(result);
    };

    doFetch();
    const t = setInterval(doFetch, 30_000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  return liveStats;
}

// Ligne de stat en direct sous une carte acceptée
function LiveStatRow({ group, playerStats }) {
  if (!playerStats || !group.stats?.length) return null;
  const s = group.stats[0];
  if (!s?.stat || s.line == null) return null;
  const val = playerStats[s.stat];
  if (val == null) return null;
  const onTrack = s.direction === 'over' ? val >= s.line : val <= s.line;
  const c = onTrack ? '#4ade80' : '#f87171';
  const SL = { pts: 'Pts', reb: 'Reb', ast: 'Ast' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.15rem 0.75rem 0.3rem', fontSize: 10 }}>
      <span style={{ color: 'var(--text-dim)' }}>📊 {SL[s.stat] ?? s.stat} :</span>
      <span style={{ fontWeight: 800, color: c, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
      <span style={{ color: 'var(--text-dim)' }}>/ {s.line} {s.direction === 'over' ? '▲' : '▼'}</span>
      <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: c, padding: '1px 6px', borderRadius: 3, background: onTrack ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${c}44` }}>
        {onTrack ? 'ON TRACK ✓' : 'AT RISK ✗'}
      </span>
    </div>
  );
}

// DateGroup avec live stats (D+B) — composant neuf, ne touche pas DateGroup
function InPlayGroup({ dateLabel, items, liveStats, onDismissGroup, onDismissTotal, onVoid }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: 6, padding: '0.3rem 0.6rem', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 11, textAlign: 'left' }}
      >
        <span style={{ fontWeight: 600, color: '#60a5fa', letterSpacing: '0.02em' }}>{dateLabel}</span>
        <span style={{ background: 'rgba(96,165,250,0.15)', borderRadius: 10, padding: '1px 7px', fontSize: 10, color: '#60a5fa' }}>{items.length} pari{items.length > 1 ? 's' : ''}</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && items.map(item =>
        item._itemType === 'group' ? (
          <div key={item.key} style={{ borderRadius: 7, overflow: 'hidden', border: '1px solid rgba(96,165,250,0.1)', background: 'rgba(96,165,250,0.03)' }}>
            <CompactAcceptedCard group={item} onDismiss={onDismissGroup} onVoid={onVoid} variant="accepted" />
            {liveStats[item.key] && <LiveStatRow group={item} playerStats={liveStats[item.key]} />}
          </div>
        ) : (
          <CompactAcceptedTotalCard key={item.id} alert={item} onDismiss={onDismissTotal} variant="accepted" />
        )
      )}
    </div>
  );
}

function RunningSection({ dated, liveStats, donutTotal, onDismissGroup, onDismissTotal, onVoid }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: '2rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
          background: open ? 'rgba(96,165,250,0.08)' : 'rgba(96,165,250,0.04)',
          border: `1px solid ${open ? 'rgba(96,165,250,0.3)' : 'rgba(96,165,250,0.15)'}`,
          borderRadius: 10, padding: '0.6rem 1rem', cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#60a5fa', flexShrink: 0, boxShadow: open ? '0 0 8px #60a5fa' : 'none', transition: 'box-shadow 0.2s' }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: '#60a5fa', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Running</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#60a5fa', background: 'rgba(96,165,250,0.15)', borderRadius: 10, padding: '1px 8px' }}>
          {donutTotal} pari{donutTotal > 1 ? 's' : ''}
        </span>
        <svg style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: '#60a5fa' }} width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
          {dated.length > 0
            ? dated.map(d => (
              <InPlayGroup key={d.dateKey} dateLabel={d.label} items={d.items} liveStats={liveStats}
                onDismissGroup={onDismissGroup} onDismissTotal={onDismissTotal} onVoid={onVoid} />
            ))
            : <p style={{ color: 'var(--text-dim)', fontSize: 11 }}>Aucun pari en cours.</p>
          }
        </div>
      )}
    </div>
  );
}

export default function PlaceBetPage() {
  const [rawAlerts, setRawAlerts] = useState(() => {
    try {
      ['nba_prop_alerts', 'nba_bet_history'].forEach(key => {
        const raw = JSON.parse(localStorage.getItem(key) || '[]');
        const clean = raw.filter(a => a.status !== 'void');
        if (clean.length !== raw.length) localStorage.setItem(key, JSON.stringify(clean));
      });
      return JSON.parse(localStorage.getItem('nba_prop_alerts') || '[]');
    } catch { return []; }
  });
  const [rawTotalAlerts, setRawTotalAlerts]     = useState([]);
  const [rawEarlywinAlerts, setRawEarlywinAlerts] = useState([]);
  const [bttsAlerts, setBttsAlerts]             = useState([]);
  // historyExists : true dès qu'une alerte a été acceptée/rejetée, ne repasse jamais à false
  const [historyExists, setHistoryExists] = useState(() => {
    try {
      return localStorage.getItem('nba_has_history') === '1' ||
             JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]').length > 0;
    } catch { return false; }
  });

  const loadBttsAlerts = () => {
    try {
      const now = Date.now();
      const raw = JSON.parse(localStorage.getItem(FB_BTTS_KEY) || '[]');
      const valid = raw.filter(a => {
        const t = new Date(a.fixtureDate).getTime();
        if (isNaN(t)) return false;
        if (['accepted', 'rejected'].includes(a.status)) return t > now - 7 * 24 * 3600_000;
        return t > now;
      });
      if (valid.length !== raw.length) localStorage.setItem(FB_BTTS_KEY, JSON.stringify(valid));
      setBttsAlerts(valid);
    } catch { setBttsAlerts([]); }
  };

  const updateBttsStatus = (id, status, bk = null, odds = null) => {
    const now = Date.now();
    const updated = bttsAlerts.map(a => a.id === id ? {
      ...a, status,
      ...(status === 'accepted' && !a.acceptedAt ? {
        acceptedAt: now,
        acceptedBookmaker:    bk ?? null,
        acceptedPinnacleOdds: bk === 'pinnacle' ? (odds ?? a.pinnacleOdds) : null,
        acceptedUnibetOdds:   bk === 'unibet'   ? (odds ?? a.unibetOdds)   : null,
        acceptedBetclicOdds:  bk === 'betclic'  ? (odds ?? a.betclicOdds)  : null,
      } : {})
    } : a);
    try { localStorage.setItem(FB_BTTS_KEY, JSON.stringify(updated)); } catch {}
    setBttsAlerts(updated);
  };

  const dismissBtts = (id) => {
    const updated = bttsAlerts.filter(a => a.id !== id);
    try { localStorage.setItem(FB_BTTS_KEY, JSON.stringify(updated)); } catch {}
    setBttsAlerts(updated);
  };

  const saveAlerts = (alerts) => {
    try {
      localStorage.setItem(ALERT_KEY, JSON.stringify(alerts));
      setRawAlerts([...alerts]);
      window.dispatchEvent(new Event('nba_alerts_updated'));
    } catch {}
  };

  // Sync backend settlements → applique won/lost/void sur les alertes acceptées
  const applySettlements = async () => {
    try {
      const settlements = await fetch('/api/settlements').then(r => r.json());
      if (!settlements?.length) return;
      const raw = JSON.parse(localStorage.getItem(ALERT_KEY) || '[]');
      let changed = false;
      const purges = settlements.filter(s => s.purge);
      const updated = raw
        .filter(a => {
          const s = settlements.find(x => x.id === a.id);
          if (s?.status === 'void' && a.status === 'accepted') { changed = true; return false; }
          // Purge par nom de joueur
          if (purges.some(p => p.player === a.player && (!p.date || a.fixtureDate?.startsWith(p.date)))) { changed = true; return false; }
          return true;
        })
        .map(a => {
          const s = settlements.find(x => x.id === a.id);
          if (!s || a.status !== 'accepted' || s.status === 'void') return a;
          changed = true;
          return { ...a, status: s.status, actualStat: s.actualStat ?? null, resolvedAt: s.settledAt };
        });
      if (changed) saveAlerts(updated);
    } catch {}
  };

  const loadAlerts = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(ALERT_KEY) || '[]');
      const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      const now = Date.now();
      const cutoff7d = now - 7 * 24 * 3600 * 1000;
      // Restaure les alertes acceptées/rejetées depuis le backup si elles ont été filtrées de ALERT_KEY
      const byId = {};
      raw.forEach(a => { byId[a.id] = a; });
      history.forEach(a => {
        if (!byId[a.id] && new Date(a.fixtureDate).getTime() > cutoff7d) byId[a.id] = a;
      });
      const merged = Object.values(byId);
      const valid = merged.filter(a => {
        // Purge alertes malformées (champs critiques manquants)
        if (!a.player || !a.fixtureDate || !a.stat || a.line == null || !['over','under'].includes(a.direction)) return false;
        const matchTime = new Date(a.fixtureDate).getTime();
        if (isNaN(matchTime)) return false;
        const status = a.status || 'pending';
        // Bloquer les alertes pending sans probabilité réelle (gap alerts, bugs)
        if (status === 'pending' && !(a.probability > 0)) return false;
        if (status === 'won' || status === 'lost' || status === 'void') return matchTime > cutoff7d;
        if (status === 'accepted' || status === 'rejected') return matchTime > cutoff7d;
        return matchTime > now;
      });
      // Revert alertes résolues prématurément (match encore en cours : fixtureDate + 3h > now)
      let reverted = false;
      const validated = valid.map(a => {
        if ((a.status === 'won' || a.status === 'lost' || a.status === 'void') &&
            new Date(a.fixtureDate).getTime() + 30 * 60_000 > now) {
          reverted = true;
          const { actualStat: _, resolvedAt: __, ...rest } = a;
          return { ...rest, status: 'accepted' };
        }
        return a;
      });
      // Backfill acceptedAt pour les alertes acceptées sans timestamp (sessions précédentes)
      const RESOLVED_S = ['accepted', 'won', 'lost', 'void'];
      let backfilled = false;
      const finalAlerts = validated.map(a => {
        if (RESOLVED_S.includes(a.status) && !a.acceptedAt && a.savedAt) {
          backfilled = true;
          return { ...a, acceptedAt: a.savedAt };
        }
        return a;
      });
      if (valid.length !== merged.length || reverted || backfilled) {
        localStorage.setItem(ALERT_KEY, JSON.stringify(finalAlerts));
        if (backfilled) window.dispatchEvent(new Event('nba_alerts_updated'));
      }
      setRawAlerts(finalAlerts);
      enrichUnibet(valid);
      resolveCompletedBets(valid, saveAlerts);
    } catch { setRawAlerts([]); }
  };

  const enrichUnibet = async (alerts) => {
    const REFRESH_MS = 10 * 60 * 1000;
    const now = Date.now();
    const toEnrich = alerts.filter(a =>
      ['pts', 'reb', 'ast'].includes(a.stat) &&
      (a.homeTeam || a.awayTeam) &&
      (a.league !== 'euroleague') &&
      new Date(a.fixtureDate).getTime() > now &&
      (a.unibetOdds == null || a.betclicOdds == null || a.winamaxOdds == null ||
       !a.lastEnriched || now - a.lastEnriched > REFRESH_MS)
    );
    if (!toEnrich.length) return;
    const byGame = {};
    for (const a of toEnrich) {
      const key = `${a.homeTeam}__${a.awayTeam}`;
      if (!byGame[key]) byGame[key] = { homeTeam: a.homeTeam, awayTeam: a.awayTeam, ids: new Set() };
      byGame[key].ids.add(a.id);
    }
    let updated = false;
    const ln = n => n?.split(' ').slice(-1)[0]?.toLowerCase();
    for (const { homeTeam, awayTeam, ids } of Object.values(byGame)) {
      try {
        const url = `/api/basketball/player-props?league=nba&refresh=1` +
          (homeTeam ? `&home=${encodeURIComponent(homeTeam)}` : '') +
          (awayTeam ? `&away=${encodeURIComponent(awayTeam)}` : '');
        const data = await fetch(url).then(r => r.json());
        if (!data?.found) continue;
        for (const a of alerts) {
          if (!ids.has(a.id)) continue;
          const stat = a.stat;
          const entry = Object.entries(data.players || {}).find(([n]) =>
            n === a.player || n.toLowerCase() === a.player.toLowerCase() || ln(n) === ln(a.player)
          );
          const ubStat = entry?.[1]?.unibet?.[stat];
          const bcStat = entry?.[1]?.betclic?.[stat];
          const wmStat = entry?.[1]?.winamax?.[stat];
          if (ubStat?.over != null) { a.unibetOdds = ubStat.over; a.unibetLine = ubStat.line; updated = true; }
          if (bcStat?.over != null) { a.betclicOdds = bcStat.over; a.betclicLine = bcStat.line; updated = true; }
          if (wmStat?.over != null) { a.winamaxOdds = wmStat.over; a.winamaxLine = wmStat.line; updated = true; }
          a.lastEnriched = Date.now();
        }
      } catch {}
    }
    if (updated) {
      try { localStorage.setItem(ALERT_KEY, JSON.stringify(alerts)); } catch {}
      setRawAlerts([...alerts]);
    }
  };

  const resolveCompletedTotalAlerts = async (alerts, save) => {
    const toResolve = alerts.filter(a =>
      a.status === 'accepted' && new Date(a.date).getTime() + 3 * 3600_000 < Date.now()
    );
    if (!toResolve.length) return;
    let changed = false;

    // EL — score depuis le scoreboard officiel
    const elAlerts = toResolve.filter(a => a.league === 'euroleague');
    if (elAlerts.length) {
      try {
        const sb = await fetch('/api/euroleague/scoreboard').then(r => r.json());
        for (const a of elAlerts) {
          const fx = BBALL_FIXTURES.find(f => f.id === a.id.replace('_total', ''));
          if (!fx?.elGameCode) continue;
          const game = (sb.games || []).find(g => g.gameCode === fx.elGameCode);
          if (!game || game.localScore == null || game.roadScore == null) continue;
          const total = game.localScore + game.roadScore;
          if (total <= 0) continue;
          a.actualTotal = total;
          a.status = (a.direction === 'over' ? total > a.line : total < a.line) ? 'won' : 'lost';
          changed = true;
        }
      } catch {}
    }

    // NBA / WNBA — score depuis le boxscore ESPN (homeScore/awayScore ajoutés au endpoint)
    const nbaAlerts = toResolve.filter(a => a.league !== 'euroleague');
    for (const a of nbaAlerts) {
      try {
        const hTeam = a.homeShort || (a.fixture || '').split(' vs ')[0];
        const aTeam = a.awayShort || (a.fixture || '').split(' vs ')[1];
        if (!hTeam || !aTeam) continue;
        const bsEndpoint = a.league === 'wnba' ? '/api/wnba/boxscore' : '/api/nba/boxscore';
        const bsUrl = `${bsEndpoint}?date=${encodeURIComponent(a.date)}&home=${hTeam}&away=${aTeam}`;
        const bs = await fetch(bsUrl).then(r => r.json());
        if (!bs || bs.error) continue;
        if (!bs.status?.includes('STATUS_FINAL')) continue;
        if (bs.homeScore == null || bs.awayScore == null) continue;
        const total = bs.homeScore + bs.awayScore;
        if (!total) continue;
        a.actualTotal = total;
        a.status = (a.direction === 'over' ? total > a.line : total < a.line) ? 'won' : 'lost';
        changed = true;
      } catch {}
    }

    if (changed) save([...alerts]);
  };

  const saveTotalAlerts = (alerts) => {
    try { localStorage.setItem(GAME_TOTAL_KEY, JSON.stringify(alerts)); } catch {}
    setRawTotalAlerts([...alerts]);
  };

  const loadTotalAlerts = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(GAME_TOTAL_KEY) || '[]');
      const now = Date.now();
      const cutoff7d = now - 7 * 24 * 3600 * 1000;
      const valid = raw.filter(a => {
        const matchTime = new Date(a.date).getTime();
        if (isNaN(matchTime)) return false;
        const status = a.status || 'pending';
        if (status === 'won' || status === 'lost') return matchTime > cutoff7d;
        if (status === 'accepted' || status === 'rejected') return matchTime > cutoff7d;
        return matchTime > now;
      });
      if (valid.length !== raw.length) localStorage.setItem(GAME_TOTAL_KEY, JSON.stringify(valid));
      setRawTotalAlerts(valid);
      resolveCompletedTotalAlerts(valid, saveTotalAlerts);
    } catch { setRawTotalAlerts([]); }
  };

  const updateTotalStatus = (id, status, bk = null, odds = null) => {
    const now = Date.now();
    const updated = rawTotalAlerts.map(a => a.id === id ? {
      ...a, status,
      ...(status === 'accepted' && !a.acceptedAt ? {
        acceptedAt: now,
        acceptedBookmaker:   bk ?? null,
        acceptedOdds:        odds ?? null,
        acceptedUnibetOdds:  bk === 'unibet'  ? (odds ?? a.unibetOdds)  : null,
        acceptedBetclicOdds: bk === 'betclic' ? (odds ?? a.betclicOdds) : null,
        acceptedWinamaxOdds: bk === 'winamax' ? (odds ?? a.winamaxOdds) : null,
      } : {})
    } : a);
    try { localStorage.setItem(GAME_TOTAL_KEY, JSON.stringify(updated)); } catch {}
    setRawTotalAlerts(updated);
    notify();
  };

  const dismissTotal = (id) => {
    const updated = rawTotalAlerts.filter(a => a.id !== id);
    try { localStorage.setItem(GAME_TOTAL_KEY, JSON.stringify(updated)); } catch {}
    setRawTotalAlerts(updated);
    notify();
  };

  const loadEarlywinAlerts = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(EARLYWIN_KEY) || '[]');
      const now = Date.now();
      const cutoff7d = now - 7 * 24 * 3600 * 1000;
      const valid = raw.filter(a => {
        const matchTime = new Date(a.date).getTime();
        if (isNaN(matchTime)) return false;
        const status = a.status || 'pending';
        if (status === 'won' || status === 'lost') return matchTime > cutoff7d;
        if (status === 'accepted' || status === 'rejected') return matchTime > cutoff7d;
        return matchTime > now;
      });
      if (valid.length !== raw.length) localStorage.setItem(EARLYWIN_KEY, JSON.stringify(valid));
      setRawEarlywinAlerts(valid);
    } catch { setRawEarlywinAlerts([]); }
  };

  const updateEarlywinStatus = (id, status) => {
    const updated = rawEarlywinAlerts.map(a => a.id === id ? {
      ...a, status,
      ...(status === 'accepted' && !a.acceptedAt ? { acceptedAt: Date.now() } : {})
    } : a);
    try { localStorage.setItem(EARLYWIN_KEY, JSON.stringify(updated)); } catch {}
    setRawEarlywinAlerts(updated);
    notify();
  };

  const dismissEarlywin = (id) => {
    const updated = rawEarlywinAlerts.filter(a => a.id !== id);
    try { localStorage.setItem(EARLYWIN_KEY, JSON.stringify(updated)); } catch {}
    setRawEarlywinAlerts(updated);
    notify();
  };

  // Merge backend background alerts into localStorage
  const fetchBackgroundAlerts = async () => {
    try {
      const { alerts: bgAlerts } = await fetch('/api/nba/background-alerts').then(r => r.json());
      if (!bgAlerts?.length) return;
      const existing = JSON.parse(localStorage.getItem(ALERT_KEY) || '[]');
      const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      // On cherche dans existing + history pour bloquer les re-générations post-dismiss
      const allKnown = [...existing, ...history];
      const byId = {};
      existing.forEach(a => { byId[a.id] = a; });

      // Cherche un match par empreinte (joueur+stat+direction+line ±1, même jour ±36h)
      const findByFingerprint = (a, status) => {
        const aTime = new Date(a.fixtureDate).getTime();
        return allKnown.find(p => {
          if (status && p.status !== status) return false;
          if (p.player !== a.player || p.stat !== a.stat || p.direction !== a.direction) return false;
          if (Math.abs((p.line ?? 0) - (a.line ?? 0)) >= 1.0) return false;
          const pTime = new Date(p.fixtureDate).getTime();
          if (!isNaN(pTime) && !isNaN(aTime) && Math.abs(pTime - aTime) > 36 * 3600_000) return false;
          return true;
        });
      };

      let changed = false;
      bgAlerts.forEach(a => {
        // Bloquer toute alerte sans probabilité réelle (probability=0 → gap alert ou bug)
        if (!(a.probability > 0)) return;
        // Rejeté/terminé (même empreinte, même jour) → jamais renvoyé
        if (findByFingerprint(a, 'rejected')) return;
        if (findByFingerprint(a, 'won')) return;
        if (findByFingerprint(a, 'lost')) return;
        if (findByFingerprint(a, 'void')) return;

        const prev = byId[a.id];

        // Accepté avec un ID différent (PropsSection vs background) → cherche par empreinte
        const acceptedMatch = (!prev || prev.status !== 'accepted')
          ? findByFingerprint(a, 'accepted')
          : null;

        if (acceptedMatch) {
          // Pour les alertes acceptées : référence = cotes au moment du clic (acceptedXxxOdds)
          // Tout mouvement ≥ 0.02 est affiché (1.70→1.65 = 0.05 → visible)
          const refUb = acceptedMatch.acceptedUnibetOdds  ?? acceptedMatch.unibetOdds;
          const refBc = acceptedMatch.acceptedBetclicOdds ?? acceptedMatch.betclicOdds;
          const refWm = acceptedMatch.acceptedWinamaxOdds ?? acceptedMatch.winamaxOdds;
          const lineShift = Math.abs((a.line ?? 0) - (acceptedMatch.line ?? 0)) >= 1.0;
          const ubShift   = a.unibetOdds  != null && refUb != null && Math.abs(a.unibetOdds  - refUb) >= 0.02;
          const bcShift   = a.betclicOdds != null && refBc != null && Math.abs(a.betclicOdds - refBc) >= 0.02;
          const wmShift   = a.winamaxOdds != null && refWm != null && Math.abs(a.winamaxOdds - refWm) >= 0.02;
          if (lineShift || ubShift || bcShift || wmShift) {
            byId[acceptedMatch.id] = {
              ...acceptedMatch,
              oddsAlert: {
                lineFrom: acceptedMatch.line, lineTo: lineShift ? a.line : null,
                ubFrom: refUb, ubTo: ubShift ? a.unibetOdds : null,
                bcFrom: refBc, bcTo: bcShift ? a.betclicOdds : null,
                wmFrom: refWm, wmTo: wmShift ? a.winamaxOdds : null,
              },
              unibetOdds:  a.unibetOdds  ?? acceptedMatch.unibetOdds,
              betclicOdds: a.betclicOdds ?? acceptedMatch.betclicOdds,
              winamaxOdds: a.winamaxOdds ?? acceptedMatch.winamaxOdds,
            };
            changed = true;
          }
          return; // on ne crée pas de nouvelle alerte
        }

        // Pending avec un ID différent (PropsSection vs background) → cherche par empreinte
        const pendingMatch = (!prev || prev.status !== 'pending')
          ? findByFingerprint(a, 'pending')
          : null;

        if (pendingMatch) {
          // Alerte pending identique existe déjà — mettre à jour les cotes si elles ont bougé
          const lineShift = Math.abs((a.line ?? 0) - (pendingMatch.line ?? 0)) >= 1.0;
          const ubShift   = a.unibetOdds  != null && pendingMatch.unibetOdds  != null && Math.abs(a.unibetOdds  - pendingMatch.unibetOdds)  >= 0.05;
          const bcShift   = a.betclicOdds != null && pendingMatch.betclicOdds != null && Math.abs(a.betclicOdds - pendingMatch.betclicOdds) >= 0.05;
          const wmShift   = a.winamaxOdds != null && pendingMatch.winamaxOdds != null && Math.abs(a.winamaxOdds - pendingMatch.winamaxOdds) >= 0.05;
          if (lineShift || ubShift || bcShift || wmShift) {
            byId[pendingMatch.id] = {
              ...pendingMatch,
              oddsAlert: {
                lineFrom: pendingMatch.line, lineTo: lineShift ? a.line : null,
                ubFrom: pendingMatch.unibetOdds, ubTo: ubShift ? a.unibetOdds : null,
                bcFrom: pendingMatch.betclicOdds, bcTo: bcShift ? a.betclicOdds : null,
                wmFrom: pendingMatch.winamaxOdds, wmTo: wmShift ? a.winamaxOdds : null,
              },
              unibetOdds:  a.unibetOdds  ?? pendingMatch.unibetOdds,
              betclicOdds: a.betclicOdds ?? pendingMatch.betclicOdds,
              winamaxOdds: a.winamaxOdds ?? pendingMatch.winamaxOdds,
            };
            changed = true;
          }
          return; // Ne pas créer de doublon
        }

        if (!prev || (prev.status || 'pending') === 'pending') {
          byId[a.id] = { ...a, status: prev?.status || 'pending' };
          changed = true;
        } else if (prev.status === 'accepted') {
          // Même ID, cote/cut bougé
          const lineShift = a.line != null && prev.line != null && Math.abs(a.line - prev.line) >= 0.5;
          const ubShift   = a.unibetOdds  != null && prev.unibetOdds  != null && Math.abs(a.unibetOdds  - prev.unibetOdds)  >= 0.05;
          const bcShift   = a.betclicOdds != null && prev.betclicOdds != null && Math.abs(a.betclicOdds - prev.betclicOdds) >= 0.05;
          const wmShift   = a.winamaxOdds != null && prev.winamaxOdds != null && Math.abs(a.winamaxOdds - prev.winamaxOdds) >= 0.05;
          if (lineShift || ubShift || bcShift || wmShift) {
            byId[a.id] = {
              ...prev,
              oddsAlert: {
                lineFrom: prev.line, lineTo: lineShift ? a.line : null,
                ubFrom: prev.unibetOdds, ubTo: ubShift ? a.unibetOdds : null,
                bcFrom: prev.betclicOdds, bcTo: bcShift ? a.betclicOdds : null,
                wmFrom: prev.winamaxOdds, wmTo: wmShift ? a.winamaxOdds : null,
              },
              unibetOdds:  a.unibetOdds  ?? prev.unibetOdds,
              betclicOdds: a.betclicOdds ?? prev.betclicOdds,
              winamaxOdds: a.winamaxOdds ?? prev.winamaxOdds,
              line: lineShift ? a.line : prev.line,
            };
            changed = true;
          }
        }
        // rejeté même ID : on ne touche pas
      });
      if (changed) {
        localStorage.setItem(ALERT_KEY, JSON.stringify(Object.values(byId)));
        window.dispatchEvent(new Event('nba_alerts_updated'));
      }
    } catch {}
  };

  useEffect(() => {
    // Purge immédiate des alertes void + alertes spécifiques à supprimer
    try {
      const PURGE_PLAYERS = ['Sabrina Ionescu', 'Justin Bean', 'Jack Kayil', 'Leandro Bolmaro'];
      const raw = JSON.parse(localStorage.getItem(ALERT_KEY) || '[]');
      const clean = raw.filter(a => a.status !== 'void' && !PURGE_PLAYERS.includes(a.player));
      if (clean.length !== raw.length) localStorage.setItem(ALERT_KEY, JSON.stringify(clean));
    } catch {}
    loadAlerts();
    loadTotalAlerts();
    loadEarlywinAlerts();
    loadBttsAlerts();
    fetchBackgroundAlerts();
    applySettlements();
    // Sync initiale : remonte toutes les alertes accepted du localStorage vers le backend
    try {
      const existing = JSON.parse(localStorage.getItem(ALERT_KEY) || '[]');
      existing.filter(a => a.status === 'accepted').forEach(a =>
        fetch('/api/accepted-alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) }).catch(() => {})
      );
    } catch {}
    window.addEventListener('nba_alerts_updated', loadAlerts);
    window.addEventListener('nba_alerts_updated', loadTotalAlerts);
    window.addEventListener('nba_alerts_updated', loadEarlywinAlerts);
    window.addEventListener('fb_btts_alerts_updated', loadBttsAlerts);
    // Refresh cotes toutes les 2 min (mouvements de cotes sur alertes en jeu)
    const timer = setInterval(() => { loadAlerts(); loadTotalAlerts(); loadEarlywinAlerts(); fetchBackgroundAlerts(); applySettlements(); }, 2 * 60 * 1000);
    // Aussi au retour sur la page (changement d'onglet / navigation)
    const onVisible = () => { if (document.visibilityState === 'visible') fetchBackgroundAlerts(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('nba_alerts_updated', loadAlerts);
      window.removeEventListener('nba_alerts_updated', loadTotalAlerts);
      window.removeEventListener('nba_alerts_updated', loadEarlywinAlerts);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('fb_btts_alerts_updated', loadBttsAlerts);
      clearInterval(timer);
    };
  }, []);

  const notify = () => window.dispatchEvent(new Event('nba_alerts_updated'));

  const updateStatus = (ids, status, bk = null, odds = null) => {
    const idSet = new Set(ids);
    const groupKeys = new Set(
      rawAlerts.filter(a => idSet.has(a.id)).map(a => {
        const dateKey = new Date(a.fixtureDate).toISOString().slice(0, 10);
        return `${a.player}__${dateKey}__${a.stat}__${a.direction}`;
      })
    );
    const now = Date.now();
    const updated = rawAlerts.map(a => {
      const patch = { status, ...(status === 'accepted' && !a.acceptedAt ? {
        acceptedAt: now,
        acceptedBookmaker:   bk ?? null,
        acceptedUnibetOdds:  bk === 'unibet'  ? (odds ?? a.unibetOdds)  : (bk ? null : a.unibetOdds  ?? null),
        acceptedBetclicOdds: bk === 'betclic' ? (odds ?? a.betclicOdds) : (bk ? null : a.betclicOdds ?? null),
        acceptedWinamaxOdds: bk === 'winamax' ? (odds ?? a.winamaxOdds) : (bk ? null : a.winamaxOdds ?? null),
      } : {}) };
      if (idSet.has(a.id)) return { ...a, ...patch };
      const dateKey = new Date(a.fixtureDate).toISOString().slice(0, 10);
      if (groupKeys.has(`${a.player}__${dateKey}__${a.stat}__${a.direction}`)) return { ...a, ...patch };
      return a;
    });
    try {
      localStorage.setItem(ALERT_KEY, JSON.stringify(updated));
      // Sync backend : POST les acceptées, DELETE les rejetées
      if (status === 'accepted') {
        updated.filter(a => idSet.has(a.id)).forEach(a => fetch('/api/accepted-alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) }).catch(() => {}));
      } else if (status === 'rejected') {
        ids.forEach(id => fetch(`/api/accepted-alerts/${id}`, { method: 'DELETE' }).catch(() => {}));
      }
      // Backup immuable : on sauvegarde les acceptées/rejetées séparément
      if (status === 'accepted' || status === 'rejected') {
        const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        const histById = {};
        history.forEach(a => { histById[a.id] = a; });
        updated.filter(a => idSet.has(a.id)).forEach(a => { histById[a.id] = a; });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(Object.values(histById)));
        localStorage.setItem('nba_has_history', '1');
        setHistoryExists(true);
      }
    } catch {}
    setRawAlerts(updated);
    notify();
  };

  const dismiss = (ids) => {
    const idSet = new Set(ids);
    const dismissed = rawAlerts.filter(a => idSet.has(a.id));
    const updated = rawAlerts.filter(a => !idSet.has(a.id));
    try {
      localStorage.setItem(ALERT_KEY, JSON.stringify(updated));
      // Archive les alertes terminées dans l'historique (bloque la re-génération par le background)
      const TERMINAL = ['accepted', 'won', 'lost', 'void', 'rejected'];
      const toArchive = dismissed.filter(a => TERMINAL.includes(a.status));
      if (toArchive.length) {
        const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        const histById = {};
        history.forEach(a => { histById[a.id] = a; });
        toArchive.forEach(a => { histById[a.id] = a; });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(Object.values(histById)));
      }
    } catch {}
    setRawAlerts(updated);
    notify();
  };

  const [openPanel, setOpenPanel] = useState(null);
  const [hiddenKeys, setHiddenKeys] = useState(new Set());
  const hideCard    = key => setHiddenKeys(prev => new Set([...prev, key]));
  const dismissIds  = (ids) => {
    setHiddenKeys(prev => new Set([...prev, ...ids]));
    dismiss(ids);
  };

  const voidIds = (ids) => {
    const idSet = new Set(ids);
    const updated = rawAlerts.map(a => idSet.has(a.id) ? { ...a, status: 'void', actualStat: null, resolvedAt: Date.now() } : a);
    try { localStorage.setItem(ALERT_KEY, JSON.stringify(updated)); } catch {}
    setRawAlerts(updated);
    notify();
  };

  const groups              = groupAlerts(rawAlerts);
  const pendingGroups       = groups.filter(g => g.status === 'pending');
  const acceptedGroups      = groups.filter(g => g.status === 'accepted');
  const liveStats = useLiveBoxscore(acceptedGroups);
  const pendingTotalAlerts    = rawTotalAlerts.filter(a => a.status === 'pending');
  const acceptedTotalAlerts   = rawTotalAlerts.filter(a => a.status === 'accepted').sort((a, b) => (b.acceptedAt || 0) - (a.acceptedAt || 0));
  const pendingEarlywinAlerts = rawEarlywinAlerts.filter(a => a.status === 'pending');
  const acceptedEarlywinAlerts = rawEarlywinAlerts.filter(a => a.status === 'accepted');
  const totalGroups           = groups.filter(g => g.status !== 'rejected').length + rawTotalAlerts.filter(a => a.status !== 'rejected').length + rawEarlywinAlerts.filter(a => a.status !== 'rejected').length;
  const totalAccepted       = acceptedGroups.length + acceptedTotalAlerts.length;
  const kpiAcceptRate       = totalGroups > 0 ? Math.round(totalAccepted / totalGroups * 100) : null;
  const kpiAvgProb          = acceptedGroups.length > 0
    ? Math.round(acceptedGroups.reduce((s, g) => s + (g.maxProb || 0), 0) / acceptedGroups.length)
    : null;
  const wonTotalAlerts      = rawTotalAlerts.filter(a => a.status === 'won').sort((a, b) => (b.acceptedAt || 0) - (a.acceptedAt || 0));
  const lostTotalAlerts     = rawTotalAlerts.filter(a => a.status === 'lost').sort((a, b) => (b.acceptedAt || 0) - (a.acceptedAt || 0));
  const rejectedGroups = groups.filter(g => g.status === 'rejected');
  const allResultGroups = groupResultAlerts(rawAlerts).filter(g => !hiddenKeys.has(g.key));
  const wonGroups      = allResultGroups.filter(g => g.results.some(r => r.status === 'won') && g.results.every(r => r.status !== 'lost'));
  const lostGroups     = allResultGroups.filter(g => g.results.some(r => r.status === 'lost') && g.results.every(r => r.status !== 'won'));
  const mixedGroups    = allResultGroups.filter(g => g.results.some(r => r.status === 'won') && g.results.some(r => r.status === 'lost'));
  const wonCount       = wonGroups.length + mixedGroups.length + wonTotalAlerts.length;
  const lostCount      = lostGroups.length + mixedGroups.length + lostTotalAlerts.length;
  const hasResults     = allResultGroups.length > 0 || wonTotalAlerts.length > 0 || lostTotalAlerts.length > 0;
  const hasHistory     = historyExists || acceptedGroups.length > 0 || acceptedTotalAlerts.length > 0 || acceptedEarlywinAlerts.length > 0 || hasResults;

  const togglePanel = (panel) => setOpenPanel(p => p === panel ? null : panel);

  const HistoryBtn = ({ type, count, label, accent, accentBg, badge }) => (
    <button
      onClick={() => togglePanel(type)}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem',
        padding: '0.35rem 0.75rem', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
        border: openPanel === type ? `1px solid ${accent}99` : '1px solid var(--border)',
        background: openPanel === type ? accentBg : 'transparent',
        color: openPanel === type ? accent : 'var(--text-dim)',
      }}
    >
      {badge ?? <span style={{ fontSize: 10, fontWeight: 800, minWidth: 16, height: 16, borderRadius: 8, background: accentBg, color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{count}</span>}
      {label}
      <svg style={{ transform: openPanel === type ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
  );

  const donutTotal = acceptedGroups.length + acceptedTotalAlerts.length;
  const voidTotalAlerts = rawTotalAlerts.filter(a => a.status === 'void').sort((a, b) => (b.acceptedAt || 0) - (a.acceptedAt || 0));

  const clearPending = () => {
    const kept = rawAlerts.filter(a => a.status !== 'pending');
    try { localStorage.setItem(ALERT_KEY, JSON.stringify(kept)); } catch {}
    setRawAlerts(kept);
    const keptTotals = rawTotalAlerts.filter(a => a.status !== 'pending');
    try { localStorage.setItem(GAME_TOTAL_KEY, JSON.stringify(keptTotals)); } catch {}
    setRawTotalAlerts(keptTotals);
    const keptEarlywin = rawEarlywinAlerts.filter(a => a.status !== 'pending');
    try { localStorage.setItem(EARLYWIN_KEY, JSON.stringify(keptEarlywin)); } catch {}
    setRawEarlywinAlerts(keptEarlywin);
    notify();
  };

  return (
    <div className="page placebet-page">

      {/* ── KPI STRIP ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div />
        {(pendingGroups.length > 0 || pendingTotalAlerts.length > 0) && (
          <button
            onClick={clearPending}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.3rem 0.7rem', borderRadius: 6, cursor: 'pointer',
              fontSize: 11, fontWeight: 600,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-dim)',
            }}
          >
            Tout effacer
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { icon: '📨', label: 'Alertes générées', value: totalGroups, color: '#3b82f6' },
          { icon: '⏳', label: 'En attente',        value: pendingGroups.length + pendingTotalAlerts.length, color: '#f59e0b' },
          { icon: '✅', label: 'Paris pris',         value: totalAccepted, color: '#10b981', sub: kpiAcceptRate != null ? `${kpiAcceptRate}% du total` : null },
          { icon: '🎯', label: 'Proba moyenne',      value: kpiAvgProb != null ? `${kpiAvgProb}%` : '—', color: '#8b5cf6', sub: totalAccepted > 0 ? `sur ${totalAccepted} pari${totalAccepted > 1 ? 's' : ''}` : null },
        ].map(({ icon, label, value, color, sub }) => (
          <div key={label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '0.85rem 1rem',
            display: 'flex', alignItems: 'center', gap: '0.85rem',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${color} 0%, transparent 100%)` }} />
            <div style={{ width: 34, height: 34, borderRadius: 9, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{icon}</div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.03em' }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-sub)', fontWeight: 500, marginTop: 2 }}>{label}</div>
              {sub && <div style={{ fontSize: 10, color, fontWeight: 600, marginTop: 1 }}>{sub}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* ── BTTS FOOT ── */}
      {bttsAlerts.filter(a => a.status === 'pending').length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
            ⚽ Football · BTTS
          </div>
          {bttsAlerts.filter(a => a.status === 'pending').map(a => (
            <BTTSAlertCard key={a.id} alert={a} onAccept={(id, bk, odds) => updateBttsStatus(id, 'accepted', bk, odds)} onReject={id => updateBttsStatus(id, 'rejected')} onDismiss={dismissBtts} />
          ))}
        </div>
      )}
      {bttsAlerts.filter(a => a.status === 'accepted').length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
            ⚽ Football BTTS · Acceptés
          </div>
          {bttsAlerts.filter(a => a.status === 'accepted').map(a => (
            <BTTSAlertCard key={a.id} alert={a} onAccept={(id, bk, odds) => updateBttsStatus(id, 'accepted', bk, odds)} onReject={id => updateBttsStatus(id, 'rejected')} onDismiss={dismissBtts} />
          ))}
        </div>
      )}

      {/* ── EN ATTENTE ── */}
      {pendingGroups.length === 0 && pendingTotalAlerts.length === 0 && !hasHistory && (
        <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 'calc(0.5rem - 1.5cm)', marginLeft: 'calc(-2.5rem + 0.5cm)' }}>
          Les alertes NBA Props apparaissent ici dès qu'un joueur atteint 85% de confiance dans l'Analyse Props.
        </p>
      )}
      {pendingGroups.length === 0 && pendingTotalAlerts.length === 0 && hasHistory && (
        <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: '0.5rem' }}>Aucune alerte en attente.</p>
      )}
      {(pendingGroups.length > 0 || pendingTotalAlerts.length > 0 || pendingEarlywinAlerts.length > 0) && (
        <div className="bet-grid">
          {pendingGroups.map(g => (
            <PropAlertCard
              key={g.key} group={g}
              onDismiss={dismiss}
              onAccept={(ids, bk, odds) => updateStatus(ids, 'accepted', bk, odds)}
              onReject={ids => updateStatus(ids, 'rejected')}
            />
          ))}
          {pendingTotalAlerts.map(a => (
            <GameTotalCard
              key={a.id} alert={a}
              onAccept={(id, bk, odds) => updateTotalStatus(id, 'accepted', bk, odds)}
              onReject={id => updateTotalStatus(id, 'rejected')}
              onDismiss={dismissTotal}
            />
          ))}
          {pendingEarlywinAlerts.map(a => (
            <EarlyWinCard
              key={a.id} alert={a}
              onAccept={id => updateEarlywinStatus(id, 'accepted')}
              onReject={id => updateEarlywinStatus(id, 'rejected')}
              onDismiss={dismissEarlywin}
            />
          ))}
        </div>
      )}

    </div>
  );
}
