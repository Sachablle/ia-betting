import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { cachedFetch, getCached } from '../utils/fetchCache';

const ALERT_KEY       = 'nba_prop_alerts';
const GAME_TOTAL_KEY  = 'nba_game_total_alerts';
const FB_BTTS_KEY     = 'fb_btts_alerts';
const FB_TOTAL_KEY    = 'fb_total_alerts';
const FB_RESULT_KEY   = 'fb_result_alerts';
const FB_DC_BTTS_KEY  = 'fb_dc_btts_alerts';
const FB_DC_OU_KEY    = 'fb_dc_ou_alerts';
const BBALL_RESULT_KEY = 'basketball_result_alerts';

// ── Widget : Countdown prochain match ────────────────────────────────────────
const LIVE_WINDOW_MS  = 3 * 60 * 60 * 1000; // 3h — un match basket dure max ~3h
const COUNT_WINDOW_MS = 48 * 60 * 60 * 1000; // cherche jusqu'à J+2

function CountdownWidget() {
  const [matches, setMatches] = useState([]);
  const [, setTick] = useState(0);
  const [bgHealth, setBgHealth] = useState(() => getCached('/api/system/health', 60_000));

  // Fusionne alertes backend + localStorage → liste de matchs avec alertes
  useEffect(() => {
    const buildMatches = (bgAlerts) => {
      const now = Date.now();
      let local = [];
      try { local = JSON.parse(localStorage.getItem(ALERT_KEY) || '[]'); } catch {}
      try { local = [...local, ...JSON.parse(localStorage.getItem(GAME_TOTAL_KEY) || '[]')]; } catch {}
      try { local = [...local, ...JSON.parse(localStorage.getItem(FB_BTTS_KEY) || '[]')]; } catch {}
      try { local = [...local, ...JSON.parse(localStorage.getItem(FB_TOTAL_KEY) || '[]')]; } catch {}
      try { local = [...local, ...JSON.parse(localStorage.getItem(FB_RESULT_KEY) || '[]')]; } catch {}
      try { local = [...local, ...JSON.parse(localStorage.getItem(FB_DC_BTTS_KEY) || '[]')]; } catch {}
      try { local = [...local, ...JSON.parse(localStorage.getItem(FB_DC_OU_KEY) || '[]')]; } catch {}
      try { local = [...local, ...JSON.parse(localStorage.getItem(BBALL_RESULT_KEY) || '[]')]; } catch {}

      // Normalise l'ID : tronque après 'over'/'under' pour fusionner ancien format (avec ligne) et nouveau
      const normId = id => {
        if (!id) return id;
        const parts = id.split('_');
        const di = parts.findLastIndex(p => p === 'over' || p === 'under');
        return di >= 0 ? parts.slice(0, di + 1).join('_') : id;
      };
      // localStorage a priorité (contient le statut) — déduplication par ID normalisé
      const byId = {};
      for (const a of local)    { if (a.id) byId[normId(a.id)] = a; }
      for (const a of bgAlerts) { const k = normId(a.id); if (a.id && !byId[k]) byId[k] = a; }

      // "En cours" = paris réellement acceptés, pas suggestions pending ni déjà réglés (won/lost/
      // void) — le filtre précédent (tout sauf rejected) comptait des alertes juste proposées par
      // le modèle comme si elles étaient "en cours" (bug du 7 juillet 2026, ex. les 2 alertes DC
      // pending USA-Belgique comptées comme des paris en cours alors qu'aucun n'était accepté).
      const active = Object.values(byId).filter(a => a.status === 'accepted');

      const byKey = {};
      for (const a of active) {
        if (!a.fixtureDate) continue;
        const ts = new Date(a.fixtureDate).getTime();
        if (ts < now - LIVE_WINDOW_MS) continue;
        if (ts > now + COUNT_WINDOW_MS) continue;
        // football : champs home/away ; basket : homeTeam/awayTeam ; certains ont fixture directement
        const label = a.fixture || (a.home && a.away ? `${a.home} vs ${a.away}` : null) || (a.homeTeam && a.awayTeam ? `${a.homeTeam}v${a.awayTeam}` : null) || a.id;
        const matchKey = a.fixtureId || a.eventId || label;
        if (!byKey[matchKey]) byKey[matchKey] = { fixture: label, fixtureDate: a.fixtureDate, league: a.league || 'nba', ts, alertIds: new Set() };
        // Déduplique les alertes par ID
        byKey[matchKey].alertIds.add(a.id);
      }
      // Convertit le Set en count
      Object.values(byKey).forEach(m => { m.count = m.alertIds.size; });
      const list = Object.values(byKey).sort((a, b) => a.ts - b.ts);
      setMatches(list);
    };

    const load = () =>
      cachedFetch('/api/nba/background-alerts', 30_000)
        .then(d => buildMatches(d.alerts || []))
        .catch(() => buildMatches([]));

    load();
    const id = setInterval(load, 60_000);
    // Sans ça, ce widget pouvait rester figé jusqu'à 60s après un accept/reject ou un rechargement
    // cloud (bug du 7 juillet 2026 : un pari tout juste accepté n'apparaissait pas dans "En cours"
    // tant que le prochain polling n'était pas passé).
    window.addEventListener('nba_alerts_updated', load);
    window.addEventListener('cloud_synced', load);
    return () => {
      clearInterval(id);
      window.removeEventListener('nba_alerts_updated', load);
      window.removeEventListener('cloud_synced', load);
    };
  }, []);

  useEffect(() => {
    const loadH = () => cachedFetch('/api/system/health', 12_000).then(setBgHealth).catch(() => {});
    loadH();
    const id = setInterval(loadH, 15_000);
    return () => clearInterval(id);
  }, []);

  // Tick chaque seconde pour rafraîchir le décompte
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const now  = Date.now();
  const live = matches.filter(m => m.ts <= now);
  const upcoming = matches.filter(m => m.ts > now);
  const next = upcoming[0] ?? null;
  const liveCount = live.reduce((s, m) => s + m.count, 0);

  const msToNext = next ? next.ts - now : null;

  const fmt = ms => {
    if (ms == null || ms <= 0) return '00:00:00';
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / 60_000) % 60;
    const h = Math.floor(ms / 3_600_000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };

  const orange = '#fb923c';
  const green  = '#4ade80';
  const dim    = 'var(--text-dim)';

  // Couleur décompte selon le sport du prochain match
  const isFootball = l => ['cdm','ligue1','pl','laliga','bundes','seriea','foot'].includes(l?.toLowerCase());
  const isBasket   = l => !isFootball(l);
  const nextTs = next?.ts ?? null;
  // Tous les matchs qui démarrent en même temps que le prochain (tolérance 1min)
  const nextGroup = next ? upcoming.filter(m => Math.abs(m.ts - next.ts) < 60_000) : [];
  const hasFoot   = nextGroup.some(m => isFootball(m.league));
  const hasBasket = nextGroup.some(m => isBasket(m.league));
  const countdownColor = hasFoot && hasBasket
    ? 'transparent'
    : hasFoot ? green : orange;
  const countdownStyle = hasFoot && hasBasket
    ? { background: `linear-gradient(90deg, ${orange}, ${green})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }
    : { color: countdownColor };

  const bgPct = bgHealth?.bgLastRun
    ? Math.min((Date.now() - bgHealth.bgLastRun) / BG_INTERVAL_MS, 1)
    : 0;
  const bgRemMin = bgHealth?.bgNextRun
    ? Math.max(0, Math.floor((bgHealth.bgNextRun - Date.now()) / 60_000))
    : null;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column' }}>
      {/* Ligne du haut — En cours + Prochain match */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {/* Section gauche — En cours */}
        <div style={{ padding: '0.3rem 0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', minWidth: 130 }}>
          <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-sub)', borderBottom: '1px solid var(--border)', paddingBottom: '0.3rem', marginBottom: '0.25rem' }}>
            En cours
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: liveCount > 0 ? '#4ade80' : dim, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {liveCount}
              </span>
              <span style={{ fontSize: 10, color: dim }}>alerte{liveCount !== 1 ? 's' : ''}</span>
            </div>
            {live.length > 0 && (
              <div style={{ fontSize: 9, color: dim, marginTop: '0.2rem', maxWidth: 140, lineHeight: 1.3 }}>
                {live.map(m => m.fixture).join(' · ')}
              </div>
            )}
          </div>
        </div>
        {/* Séparateur vertical */}
        <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />
        {/* Section droite — Prochain match */}
        <div style={{ padding: '0.3rem 0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', minWidth: 160 }}>
          <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-sub)', borderBottom: '1px solid var(--border)', paddingBottom: '0.3rem', marginBottom: '0.25rem' }}>
            Prochain match
          </div>
          {next ? (
            <>
              <div style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: '0.4rem', ...countdownStyle }}>
                {fmt(msToNext)}
              </div>
              <div style={{ fontSize: 9, color: dim, marginTop: '0.2rem' }}>
                {next.fixture} · <span style={{ color: 'var(--text-sub)' }}>{next.league.toUpperCase()}</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: dim }}>—</div>
          )}
        </div>
      </div>
      {/* Bande bas — Cycle alertes. Étiquette fixe en haut, barre centrée dans l'espace
          restant en dessous (flex:1 sur ce bloc + wrapper centré autour de la barre) — sans
          ça la barre restait collée juste sous l'étiquette avec tout le vide en dessous
          quand la carte s'étire pour matcher la hauteur de ses voisines. */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '0.35rem 0.75rem 0.4rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Cycle alertes</span>
          <span style={{ fontSize: 9, color: dim }}>
            {bgHealth?.bgLastRun ? (bgRemMin != null ? `dans ${bgRemMin}min` : '—') : 'jamais'}
          </span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <div style={{ height: 4, width: '100%', borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${bgPct * 100}%`, background: 'linear-gradient(to right, #facc15, #4ade80)', borderRadius: 99, transition: 'width 0.5s ease' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section : Santé du système ────────────────────────────────────────────────
const BG_INTERVAL_MS = 20 * 60 * 1000;

// Icône signal futuriste WiFi-style — 3 niveaux d'arcs + point central
function SignalIcon({ label, ts, ok, lastOk, greenMs = 10 * 60_000, yellowMs = 20 * 60_000 }) {
  const now       = Date.now();
  const ageMs     = ts ? now - ts : null;
  const fresh     = ageMs !== null && ageMs < BG_INTERVAL_MS + 2 * 60_000;
  const lastOkAge = lastOk ? now - lastOk : Infinity;
  const agoMin    = ageMs !== null ? Math.floor(ageMs / 60_000) : null;

  const lastOkMin = lastOk ? Math.floor(lastOkAge / 60_000) : null;
  let level, color, sub;
  if (lastOkAge < greenMs) {
    level = 3; color = '#4ade80';
    sub = lastOkMin === 0 ? '<1min' : `${lastOkMin}min`;
  } else if (lastOkAge < yellowMs) {
    level = 2; color = '#facc15';
    sub = `${lastOkMin}min`;
  } else {
    level = 0; color = '#f87171';
    sub = lastOkMin !== null ? `${lastOkMin}min` : '—';
  }

  const dim = 'rgba(255,255,255,0.1)';
  // Arc WiFi : centre (12, 15), angles -150° → -30°
  const wifiArc = (r, active) => {
    const a0 = -Math.PI * 5 / 6, a1 = -Math.PI / 6;
    const x0 = (12 + r * Math.cos(a0)).toFixed(2), y0 = (15 + r * Math.sin(a0)).toFixed(2);
    const x1 = (12 + r * Math.cos(a1)).toFixed(2), y1 = (15 + r * Math.sin(a1)).toFixed(2);
    return (
      <path key={r}
        d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`}
        stroke={active ? color : dim} fill="none" strokeWidth="2.2" strokeLinecap="round"
      />
    );
  };

  // Juste milieu entre l'ancien gabarit "Cotes & données" (28px/10px, jugé trop gros une fois
  // aligné avec Taux de scraping) et l'ancien gabarit "Taux de scraping" (26px/7px, jugé trop
  // épuré tout seul) — les deux catégories convergent maintenant vers cette même taille réduite.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem', minWidth: 46 }}>
      <div style={{ position: 'relative', width: 24, height: 19 }}>
        {level === 3 && (
          <div style={{
            position: 'absolute', inset: -4,
            background: `radial-gradient(ellipse at 50% 75%, ${color}35 0%, transparent 70%)`,
            pointerEvents: 'none',
          }} />
        )}
        <svg width={24} height={19} viewBox="0 0 24 20" style={{ filter: level > 0 ? `drop-shadow(0 0 3px ${color}80)` : 'none' }}>
          {wifiArc(11, level >= 3)}
          {wifiArc(7,  level >= 2)}
          {wifiArc(3.5, level >= 1)}
          <circle cx={12} cy={15.5} r={2} fill={level > 0 ? color : dim} />
        </svg>
      </div>
      <span style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--text-sub)', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: 8, color, opacity: level === 0 ? 0.5 : 0.85 }}>{sub}</span>
    </div>
  );
}

function HealthBar({ label, lastRun, nextRun, intervalMs = BG_INTERVAL_MS }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const now      = Date.now();
  const elapsed  = lastRun ? now - lastRun : 0;
  const pct      = lastRun ? Math.min(elapsed / intervalMs, 1) : 0;
  const remMin   = nextRun ? Math.max(0, Math.floor((nextRun - now) / 60_000)) : null;
  const color    = pct < 0.7 ? '#4ade80' : pct < 0.9 ? '#facc15' : '#f87171';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)' }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
          {lastRun ? (remMin != null ? `dans ${remMin}min` : `il y a ${Math.floor(elapsed / 60_000)}min`) : 'jamais'}
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct * 100}%`, background: color, borderRadius: 99, transition: 'width 0.5s ease, background 0.5s ease' }} />
      </div>
    </div>
  );
}

function SystemHealthSection() {
  const [health, setHealth] = useState(() => getCached('/api/system/health', 60_000));
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const cardRef = useRef(null);
  const [cardRect, setCardRect] = useState({ w: 420, h: 120 });

  useEffect(() => {
    const measure = () => {
      if (!cardRef.current) return;
      const r = cardRef.current.getBoundingClientRect();
      const gridRight = cardRef.current.parentElement?.getBoundingClientRect().right ?? (r.right + 200);
      const gap = 12;
      const panelW = Math.max(200, gridRight - r.right - gap);
      setCardRect({ w: panelW, h: r.height });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    const load = () => cachedFetch('/api/system/health', 12_000).then(setHealth).catch(() => {});
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    const triggerTs = Date.now();
    const TIMEOUT_MS = 25_000;
    const POLL_MS    = 2_000;
    let timer = null;

    // Déclenche le scraping
    fetch('/api/system/health?refresh=1').catch(() => {});

    const poll = () => {
      fetch('/api/system/health')
        .then(r => r.json())
        .then(data => {
          const scrapers = data?.scrapers ?? {};
          // Considère le refresh terminé quand TOUS les scrapers connus ont un ts postérieur au clic
          const allDone = Object.values(scrapers).every(s => !s || (s.ts ?? 0) >= triggerTs);
          const timedOut = Date.now() - triggerTs >= TIMEOUT_MS;
          if (allDone || timedOut) {
            setHealth(data);
            setRefreshing(false);
            setLastRefreshed(new Date());
          } else {
            timer = setTimeout(poll, POLL_MS);
          }
        })
        .catch(() => { timer = setTimeout(poll, POLL_MS); });
    };
    timer = setTimeout(poll, POLL_MS);
  };

  const sc = health?.scrapers ?? {};

  // Combine foot + basket pour un bookmaker : ok seulement si les deux sont ok, ts = le plus ancien
  const merge = (a, b) => {
    if (!a && !b) return {};
    if (!a) return b;
    if (!b) return a;
    const ok = !!(a.ok && b.ok);
    const ts = (a.ts && b.ts) ? Math.max(a.ts, b.ts) : (a.ts || b.ts);
    const lastOk = (a.lastOk && b.lastOk) ? Math.max(a.lastOk, b.lastOk) : (a.lastOk || b.lastOk);
    return { ok, ts, lastOk };
  };

  const pinnacle = merge(sc.pinnacle_foot, sc.pinnacle_wnba);
  const unibet   = merge(sc.unibet_foot,   sc.unibet);
  const betclic  = merge(sc.betclic_foot,  sc.betclic);

  return (
    <div ref={cardRef} style={{ position: 'relative', height: '100%', justifySelf: 'start' }}>
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', alignItems: 'stretch', height: '100%', boxSizing: 'border-box' }}>

      <div style={{ padding: '0.3rem 0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: '0.75rem' }}>
        {/* position:relative + bouton/horodatage en absolute — sans ça, ce bloc plus haut que le
            simple libellé des autres panneaux (En cours, Prochain match, Taux de scraping)
            étirait la ligne de séparation plus bas que les leurs. */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.3rem', marginBottom: '0' }}>
          <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-sub)' }}>Cotes &amp; Données</span>
          {/* Bouton + horodatage réduits et mis côte à côte (pas empilés) — pour rester dans la
              hauteur de la ligne sans déborder sur le trait de séparation du dessous. */}
          <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {lastRefreshed && (
              <span style={{ fontSize: 7, color: 'var(--text-dim)' }}>
                {lastRefreshed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              className={`icon-refresh-btn${refreshing ? ' spinning' : ''}`}
              onClick={handleRefresh}
              disabled={refreshing}
              title="Rafraîchir"
              style={{ width: 11, height: 11, fontSize: 8, lineHeight: 1, padding: 0, flexShrink: 0 }}
            >↻</button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0' }}>
          {/* Cotes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingRight: '1rem' }}>
            <div style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>Cotes</div>
            <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'flex-end' }}>
              <SignalIcon label="Pinnacle" ts={pinnacle.ts} ok={pinnacle.ok} lastOk={pinnacle.lastOk} greenMs={22 * 60_000} yellowMs={45 * 60_000} />
              <SignalIcon label="Unibet"   ts={unibet.ts}   ok={unibet.ok}   lastOk={unibet.lastOk}   />
              <SignalIcon label="Betclic"  ts={betclic.ts}  ok={betclic.ok}  lastOk={betclic.lastOk}  />
            </div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', alignSelf: 'stretch', flexShrink: 0 }} />
          {/* Données */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingLeft: '1rem' }}>
            <div style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>Données</div>
            <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'flex-end' }}>
              <SignalIcon label="ESPN"     ts={sc.espn?.ts}     ok={sc.espn?.ok}     lastOk={sc.espn?.lastOk}     />
              <SignalIcon label="RotoWire" ts={sc.rotowire?.ts} ok={sc.rotowire?.ok} lastOk={sc.rotowire?.lastOk} />
              <SignalIcon label="ACB"      ts={sc.acb?.ts}      ok={sc.acb?.ok}      lastOk={sc.acb?.lastOk}      />
            </div>
          </div>
        </div>
      </div>

    </div>

    <div className="no-scrollbar" style={{
      position: 'absolute', top: 0, left: `calc(100% + 0.75rem)`, zIndex: 2,
      width: cardRect.w, height: '100%',
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16,
      padding: '0.3rem 0.75rem', boxSizing: 'border-box', overflowY: 'auto',
    }}>
      <ScrapingRatePanel sc={sc} />
    </div>
    </div>
  );
}

function QuotasWidget() {
  const [health, setHealth] = useState(() => getCached('/api/system/health', 60_000));
  const dim = 'var(--text-dim)';

  useEffect(() => {
    const load = () => cachedFetch('/api/system/health', 12_000).then(setHealth).catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const q = health?.quotas;

  // Même code couleur que les anneaux "Taux de scraping" (cyan / bleu / violet par position)
  const POS_COLORS = ['#22d3ee', '#60a5fa', '#a78bfa'];

  const fdRem    = q?.footballData?.remaining;
  const fdLim    = q?.footballData?.limit ?? 10;
  const bballRem = q?.basketballApi?.remaining;
  const bballLim = q?.basketballApi?.limit ?? 7500;

  const cards = [
    { label: 'football-data.org', rem: fdRem,    lim: fdLim,    period: 'requêtes /min'  },
    { label: 'API-Basketball',    rem: bballRem, lim: bballLim, period: 'requêtes /jour' },
  ];

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '0.3rem 0.75rem 0' }}>
        <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.1em', borderBottom: '1px solid var(--border)', paddingBottom: '0.3rem' }}>Requêtes restantes</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', marginTop: 'auto', marginBottom: '0.6rem' }}>
        {cards.map((c, i) => (
          <div key={c.label} style={{ display: 'flex', alignItems: 'stretch' }}>
            {i > 0 && <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />}
            <div style={{ padding: '0.25rem 0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 130 }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: dim, marginBottom: '0.25rem' }}>{c.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem' }}>
                <span style={{ fontSize: '1rem', fontWeight: 800, color: c.rem != null ? POS_COLORS[i] : dim, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {c.rem != null ? c.lim - c.rem : '—'}
                </span>
                <span style={{ fontSize: '1rem', fontWeight: 800, color: dim, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>/{c.lim}</span>
              </div>
              <div style={{ fontSize: 9, color: dim, marginTop: '0.2rem' }}>{c.period}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScrapingRatePanel({ sc }) {
  const pctFor = key => {
    const h = sc[key]?.history ?? [];
    return h.length ? Math.round(h.reduce((s, v) => s + v, 0) / h.length * 100) : null;
  };

  // Même pictogramme WiFi que "Cotes & données" (SignalIcon) pour une harmonie visuelle totale —
  // seule la source du niveau change : ici le taux de succès (%), là-bas la fraîcheur (temps).
  const dim = 'rgba(255,255,255,0.1)';
  const levelFor = pct => {
    if (pct == null) return { level: 0, color: '#f87171' };
    if (pct >= 90) return { level: 3, color: '#4ade80' };
    if (pct >= 60) return { level: 2, color: '#facc15' };
    return { level: 0, color: '#f87171' };
  };
  const wifiArc = (r, active, color) => {
    const a0 = -Math.PI * 5 / 6, a1 = -Math.PI / 6;
    const x0 = (12 + r * Math.cos(a0)).toFixed(2), y0 = (15 + r * Math.sin(a0)).toFixed(2);
    const x1 = (12 + r * Math.cos(a1)).toFixed(2), y1 = (15 + r * Math.sin(a1)).toFixed(2);
    return <path key={r} d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`} stroke={active ? color : dim} fill="none" strokeWidth="2.2" strokeLinecap="round" />;
  };

  const WifiIcon = ({ level, color, size = 24 }) => {
    const h = size * (19 / 24);
    return (
      <div style={{ position: 'relative', width: size, height: h }}>
        {level > 0 && (
          <div style={{ position: 'absolute', inset: -4, background: `radial-gradient(ellipse at 50% 75%, ${color}35 0%, transparent 70%)`, pointerEvents: 'none' }} />
        )}
        <svg width={size} height={h} viewBox="0 0 24 20" style={{ filter: level > 0 ? `drop-shadow(0 0 3px ${color}80)` : 'none' }}>
          {wifiArc(11, level >= 3, color)}
          {wifiArc(7,  level >= 2, color)}
          {wifiArc(3.5, level >= 1, color)}
          <circle cx={12} cy={15.5} r={2} fill={level > 0 ? color : dim} />
        </svg>
      </div>
    );
  };

  // Un bookmaker scrape à la fois le foot et le basket (deux historiques distincts) — fusionnés
  // en une seule moyenne pour rester au même format qu'un SignalIcon "Cotes & données" (une seule
  // icône/valeur par entrée), quitte à perdre le détail par sport.
  const pctMerged = (...keys) => {
    const vals = keys.map(pctFor).filter(v => v != null);
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
  };

  // Format strictement identique à SignalIcon dans "Cotes & données" : icône → nom → valeur.
  // `detail` (survol) redonne accès au détail foot/basket perdu par la fusion en une moyenne.
  const WifiStat = ({ label, pct, detail }) => {
    const { level, color } = levelFor(pct);
    return (
      <div title={detail} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem', minWidth: 46 }}>
        <WifiIcon level={level} color={color} />
        <span style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--text-sub)', letterSpacing: '0.04em' }}>{label}</span>
        <span style={{ fontSize: 8, color, opacity: pct == null ? 0.5 : 0.85 }}>{pct != null ? `${pct}%` : '—'}</span>
      </div>
    );
  };

  const detailFor = (footKey, basketKey) => {
    const f = pctFor(footKey), b = pctFor(basketKey);
    return `⚽ ${f != null ? f + '%' : '—'} · 🏀 ${b != null ? b + '%' : '—'}`;
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-sub)', borderBottom: '1px solid var(--border)', paddingBottom: '0.3rem' }}>Taux de scraping</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '0.5rem' }}>
        <WifiStat label="Pinnacle" pct={pctMerged('pinnacle_foot', 'pinnacle_wnba')} detail={detailFor('pinnacle_foot', 'pinnacle_wnba')} />
        <WifiStat label="Unibet"   pct={pctMerged('unibet_foot', 'unibet')}           detail={detailFor('unibet_foot', 'unibet')} />
        <WifiStat label="Betclic"  pct={pctMerged('betclic_foot', 'betclic')}         detail={detailFor('betclic_foot', 'betclic')} />
        <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', alignSelf: 'stretch', flexShrink: 0 }} />
        <WifiStat label="ESPN"     pct={pctFor('espn')} />
        <WifiStat label="RotoWire" pct={pctFor('rotowire')} />
        <WifiStat label="ACB"      pct={pctFor('acb')} />
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, color, sub }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      padding: '1.75rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${color} 0%, transparent 100%)`,
      }} />
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        background: `${color}18`,
        border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 17,
      }}>{icon}</div>
      <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.03em', marginTop: '0.25rem' }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-sub)', fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color, fontWeight: 600 }}>{sub}</div>}
    </div>
  );
}

const DONUT_CATEGORIES = [
  { key: 'perfs_players', label: 'Perfs players', color: '#3b82f6' },
  { key: 'ppm',           label: 'PPM',           color: '#10b981' },
  { key: 'resultat',      label: 'Résultat',      color: '#f59e0b' },
];

function DonutChart({ accepted, acceptedTotals, allAlerts, allTotals }) {
  const [hovered, setHovered] = useState(null);

  const counts = {};
  DONUT_CATEGORIES.forEach(c => { counts[c.key] = 0; });
  accepted.forEach(() => { counts['perfs_players']++; });
  (acceptedTotals || []).forEach(() => { counts['ppm']++; });

  // Taux de réussite par catégorie
  const wonOf   = key => key === 'perfs_players' ? (allAlerts  || []).filter(a => a.status === 'won').length
                       : key === 'ppm'           ? (allTotals  || []).filter(a => a.status === 'won').length : 0;
  const lostOf  = key => key === 'perfs_players' ? (allAlerts  || []).filter(a => a.status === 'lost').length
                       : key === 'ppm'           ? (allTotals  || []).filter(a => a.status === 'lost').length : 0;
  const rateOf  = key => { const w = wonOf(key), l = lostOf(key); return w + l > 0 ? Math.round(w / (w + l) * 100) : null; };

  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  const segments = DONUT_CATEGORIES.map(c => ({ ...c, count: counts[c.key], pct: total ? counts[c.key] / total : 0 })).filter(s => s.count > 0);

  const R = 90, r = 57, cx = 127.5, cy = 127.5;
  let angle = -Math.PI / 2;
  const arcs = segments.map(s => {
    const startAngle = angle;
    const sweep = s.pct * 2 * Math.PI;
    angle += sweep;
    const endAngle = angle;
    const x1 = cx + R * Math.cos(startAngle), y1 = cy + R * Math.sin(startAngle);
    const x2 = cx + R * Math.cos(endAngle),   y2 = cy + R * Math.sin(endAngle);
    const ix1 = cx + r * Math.cos(startAngle), iy1 = cy + r * Math.sin(startAngle);
    const ix2 = cx + r * Math.cos(endAngle),   iy2 = cy + r * Math.sin(endAngle);
    const large = sweep > Math.PI ? 1 : 0;
    const d = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${r} ${r} 0 ${large} 0 ${ix1} ${iy1} Z`;
    return { ...s, d };
  });

  const hovSeg  = hovered ? (DONUT_CATEGORIES.find(c => c.key === hovered) || null) : null;
  const hovRate = hovered ? rateOf(hovered) : null;
  const hovWon  = hovered ? wonOf(hovered)  : 0;
  const hovLost = hovered ? lostOf(hovered) : 0;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1rem', marginBottom: '1.5rem', width: 'fit-content' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textAlign: 'center', marginBottom: '0.75rem' }}>
        Répartition par type de pari
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg width={255} height={255} viewBox="0 0 255 255" style={{ cursor: 'default' }}>
          {total === 0 ? (
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={R - r} />
          ) : arcs.length === 1 ? (
            /* Un seul segment = 100% : l'arc SVG dégénère (start=end) → cercle complet */
            <circle
              cx={cx} cy={cy} r={(R + r) / 2}
              fill="none" stroke={arcs[0].color} strokeWidth={R - r}
              opacity={hovered && hovered !== arcs[0].key ? 0.35 : 1}
              style={{ transition: 'opacity 0.15s' }}
              onMouseEnter={() => setHovered(arcs[0].key)}
              onMouseLeave={() => setHovered(null)}
            />
          ) : (
            arcs.map(s => (
              <path
                key={s.key}
                d={s.d}
                fill={s.color}
                opacity={hovered && hovered !== s.key ? 0.35 : 1}
                style={{ transition: 'opacity 0.15s' }}
                onMouseEnter={() => setHovered(s.key)}
                onMouseLeave={() => setHovered(null)}
              />
            ))
          )}
          {/* Tooltip centre */}
          {hovSeg && (
            <>
              <text x={cx} y={cy - 18} textAnchor="middle" fontSize="11" fill={hovSeg.color} fontWeight="700" fontFamily="inherit">
                {hovSeg.label}
              </text>
              {hovRate != null ? (
                <>
                  <text x={cx} y={cy + 10} textAnchor="middle" fontSize="22" fill="white" fontWeight="800" fontFamily="inherit">
                    {hovRate}%
                  </text>
                  <text x={cx} y={cy + 28} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.4)" fontFamily="inherit">
                    {hovWon}G · {hovLost}P
                  </text>
                </>
              ) : (
                <text x={cx} y={cy + 10} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.35)" fontFamily="inherit">
                  Pas encore résolu
                </text>
              )}
            </>
          )}
          {/* Valeur par défaut au centre */}
          {!hovered && total > 0 && (
            <>
              <text x={cx} y={cy + 6} textAnchor="middle" fontSize="22" fill="white" fontWeight="800" fontFamily="inherit">
                {total}
              </text>
              <text x={cx} y={cy + 22} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.35)" fontFamily="inherit">
                paris
              </text>
            </>
          )}
        </svg>
        {total === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: '-1rem' }}>Aucun pari accepté</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 1.5rem', marginTop: '-0.5rem' }}>
            {DONUT_CATEGORIES.filter(c => counts[c.key] > 0).map(c => (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'default' }}
                onMouseEnter={() => setHovered(c.key)} onMouseLeave={() => setHovered(null)}>
                <span style={{ width: 14, height: 14, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: hovered === c.key ? 'var(--text)' : 'var(--text-dim)', transition: 'color 0.15s' }}>{c.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SportStatsTable({ allAlerts, allTotals }) {
  const all = [...(allAlerts || []), ...(allTotals || [])];

  const SPORTS = [
    { key: 'nba',        label: 'NBA',        logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png',  test: a => !a.league || a.league === 'nba' },
    { key: 'wnba',       label: 'WNBA',       logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png', test: a => a.league === 'wnba' },
    { key: 'acb',        label: 'ACB',        logo: 'https://media.api-sports.io/basketball/leagues/120.png', test: a => a.league === 'acb' },
    { key: 'euroleague', label: 'Euroleague', logo: 'https://media.api-sports.io/basketball/leagues/23.png',  test: a => a.league === 'euroleague' },
  ];

  const rows = SPORTS.map(s => {
    const group = all.filter(s.test);
    const accepted = group.filter(a => ['accepted','won','lost'].includes(a.status));
    const won    = group.filter(a => a.status === 'won').length;
    const lost   = group.filter(a => a.status === 'lost').length;
    const inPlay = group.filter(a => a.status === 'accepted').length;
    const total  = accepted.length;
    const rate   = won + lost > 0 ? (won / (won + lost) * 100).toFixed(1) : null;
    return { ...s, total, won, lost, voided: 0, inPlay, rate };
  }).filter(r => r.total > 0);

  const rateColor = r => r >= 65 ? '#4ade80' : r >= 45 ? '#facc15' : '#f87171';

  const TH = ({ children, align = 'right' }) => (
    <th style={{ padding: '0.5rem 0.85rem', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textAlign: align, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
      {children}
    </th>
  );
  const TD = ({ children, color, align = 'right' }) => (
    <td style={{ padding: '0.7rem 0.85rem', fontSize: 13, fontWeight: 600, color: color || 'var(--text)', textAlign: align, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      {children}
    </td>
  );

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1rem 0.5rem', flex: 1, alignSelf: 'flex-start' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', padding: '0 0.85rem', marginBottom: '0.75rem' }}>
        Statistiques par sport
      </p>
      {rows.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-dim)', padding: '0.5rem 0.85rem' }}>Aucun résultat résolu.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <TH align="left">Sport</TH>
              <TH>Paris</TH>
              <TH>Gagné</TH>
              <TH>Perdu</TH>
              <TH>En jeu</TH>
              <TH>Réussite %</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key}>
                <TD align="left">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <img src={r.logo} alt={r.label} width={20} height={20} style={{ objectFit: 'contain', borderRadius: 3 }} onError={e => e.target.style.display='none'} />
                    {r.label}
                  </span>
                </TD>
                <TD>{r.total}</TD>
                <TD color="#4ade80">{r.won}</TD>
                <TD color="#f87171">{r.lost}</TD>
                <TD color="#60a5fa">{r.inPlay}</TD>
                <TD color={r.rate != null ? rateColor(parseFloat(r.rate)) : 'var(--text-dim)'}>
                  {r.rate != null ? `${r.rate} %` : '—'}
                </TD>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AlertsChart({ accepted, days: numDays = 30 }) {
  const W = 1000, H = 300;
  const padL = 52, padR = 10, padT = 20, padB = 36;
  const cW = W - padL - padR;
  const cH = H - padT - padB;

  const now = new Date();
  // Minimum 2 points pour que la courbe SVG soit visible
  const effectiveDays = Math.max(numDays, 2);
  const days = Array.from({ length: effectiveDays }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (effectiveDays - 1 - i));
    return d.toISOString().slice(0, 10);
  });

  const byDay = {};
  accepted.forEach(a => {
    // Priorité : acceptedAt → savedAt → settledAt → fixtureDate (si déjà réglé, donc forcément
    // dans le passé) → maintenant en tout dernier recours. D'anciennes alertes foot n'ont ni
    // acceptedAt ni savedAt enregistré ; les compter sur "maintenant" les faisait apparaître comme
    // acceptées aujourd'hui alors qu'elles datent de plusieurs semaines (bug du 7 juillet 2026).
    const resolved = ['won', 'lost', 'void'].includes(a.status);
    const ts = a.acceptedAt ?? a.savedAt ?? a.settledAt ?? (resolved ? (a.fixtureDate ?? a.date) : null) ?? Date.now();
    const raw = new Date(ts);
    const day = new Date(raw.getTime() - raw.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  });

  const vals = days.map(d => byDay[d] || 0);
  const maxV = Math.max(...vals, 1);
  const nTicks = 5;
  const step = Math.ceil(maxV / (nTicks - 1)) || 1;
  const yTicks = Array.from({ length: nTicks }, (_, i) => i * step);

  const px = i => days.length === 1 ? padL + cW / 2 : padL + (i / (days.length - 1)) * cW;
  const py = v => padT + cH - (v / (yTicks[yTicks.length - 1] || 1)) * cH;

  const pts = vals.map((v, i) => [px(i), py(v)]);
  const linePath = `M ${pts.map(([x, y]) => `${x},${y}`).join(' L ')}`;
  const areaPath = `${linePath} L ${px(days.length - 1)},${padT + cH} L ${px(0)},${padT + cH} Z`;
  const n = days.length;
  // Math.round(n*0.75) peut dépasser n-1 pour un petit n (ex. n=2 → index 2, hors tableau →
  // "Invalid Date" affiché sur l'axe) — on clamp chaque index à la plage valide.
  const clamp = i => Math.max(0, Math.min(i, n - 1));
  const xIdxs = [...new Set([0, clamp(Math.round(n * 0.25)), clamp(Math.round(n * 0.5)), clamp(Math.round(n * 0.75)), n - 1])];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="dash-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.75" />
          <stop offset="60%" stopColor="#60a5fa" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
        </linearGradient>
      </defs>

      {yTicks.map(v => (
        <line key={v} x1={padL} y1={py(v)} x2={W - padR} y2={py(v)}
          stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}

      <path d={areaPath} fill="url(#dash-grad)" />
      <path d={linePath} fill="none" stroke="#60a5fa" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4" fill="#60a5fa" stroke="#0d1117" strokeWidth="2" />
      ))}

      {yTicks.map(v => (
        <text key={v} x={padL - 10} y={py(v) + 4} textAnchor="end"
          fontSize="11" fill="rgba(255,255,255,0.3)" fontFamily="inherit">{v}</text>
      ))}

      {xIdxs.map(i => (
        <text key={i} x={px(i)} y={H - 8} textAnchor="middle"
          fontSize="11" fill="rgba(255,255,255,0.3)" fontFamily="inherit">
          {new Date(days[i]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </text>
      ))}
    </svg>
  );
}

// ── Widget : Matchs à venir ──────────────────────────────────────────────────

const FOOT_LEAGUES_SET = new Set(['ligue1','pl','laliga','bundes','seriea','cdm']);

const LEAGUE_LABEL_MAP = {
  nba:'NBA', wnba:'WNBA', cdm:'CDM', euroleague:'EL',
  acb:'ACB', lnb:'LNB', bbl:'BBL', legaa:'LegA',
  ligue1:'L1', pl:'PL', laliga:'Liga', bundes:'BL', seriea:'SA',
};
const LEAGUE_COLOR_MAP = {
  nba:'#fb923c', wnba:'#fb923c', cdm:'#facc15', euroleague:'#c084fc',
  acb:'#60a5fa', lnb:'#60a5fa', bbl:'#60a5fa', legaa:'#60a5fa',
  ligue1:'#3b82f6', pl:'#a78bfa', laliga:'#f97316', bundes:'#e11d48', seriea:'#10b981',
};

function UpcomingMatchesWidget() {
  const [games, setGames]   = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [open, setOpen]     = useState(false);
  const navigate = useNavigate();

  const goToMatch = g => {
    if (g.sport === 'foot') {
      navigate(`/football/${g.id}`);
    } else {
      const leagueParam = g.league !== 'nba' ? `?league=${g.league}` : '';
      navigate(`/basketball/${g.id}${leagueParam}`);
    }
  };

  useEffect(() => {
    const LIVE_MS = 3 * 3600_000;
    const KEEP_MS = 48 * 3600_000;

    const norm = (g, league) => ({
      id:         String(g.id),
      date:       g.date,
      status:     g.status,
      league,
      sport:      FOOT_LEAGUES_SET.has(league) ? 'foot' : 'basket',
      home:       FOOT_LEAGUES_SET.has(league) ? (g.home?.short || g.home?.name || '?') : (g.home?.name || '?'),
      away:       FOOT_LEAGUES_SET.has(league) ? (g.away?.short || g.away?.name || '?') : (g.away?.name || '?'),
      homeScore:  g.home?.score ?? null,
      awayScore:  g.away?.score ?? null,
    });

    const load = async () => {
      const EU_BASKET = ['acb','bbl','legaa'];
      const EU_FOOT   = ['ligue1','pl','laliga','bundes','seriea'];

      const results = await Promise.allSettled([
        cachedFetch('/api/nba/scoreboard', 30_000).then(d=>(d.games||[]).map(g=>norm(g,'nba'))),
        cachedFetch('/api/wnba/scoreboard', 30_000).then(d=>(d.games||[]).map(g=>norm(g,'wnba'))),
        cachedFetch('/api/fd/worldcup', 30_000).then(d=>(d.games||[]).map(g=>norm({...g,id:`fdcdm_${g.id}`},'cdm'))),
        ...EU_BASKET.map(l=>cachedFetch(`/api/euro/${l}/scoreboard`, 30_000).then(d=>(d.games||[]).map(g=>norm(g,l)))),
        cachedFetch('/api/fd/matches', 30_000).then(d=>
          (d.matches||[])
            .filter(f=>EU_FOOT.includes(f.league))
            .map(f=>norm({
              id:`fd_${f.id}`, date:f.date, status:'STATUS_SCHEDULED',
              home:{name:f.home?.name, short:f.home?.short},
              away:{name:f.away?.name, short:f.away?.short},
            }, f.league))
        ),
      ]);

      const now = Date.now();
      const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      const visible = all
        .filter(g => {
          const ts = new Date(g.date).getTime();
          return ts > now - LIVE_MS && ts < now + KEEP_MS;
        })
        .sort((a,b) => new Date(a.date) - new Date(b.date));

      setGames(visible);
      setLoading(false);
    };

    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  // IDs des matchs qui ont au moins une alerte non rejetée
  const alertedIds = useMemo(() => {
    const ids = new Set();
    const KEYS = ['nba_prop_alerts','nba_game_total_alerts','fb_btts_alerts','fb_total_alerts','fb_result_alerts','basketball_result_alerts'];
    for (const key of KEYS) {
      try {
        JSON.parse(localStorage.getItem(key)||'[]')
          .filter(a => a.status !== 'rejected')
          .forEach(a => { if (a.fixtureId) ids.add(a.fixtureId); if (a.eventId) ids.add(String(a.eventId)); });
      } catch {}
    }
    return ids;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games]);

  const now      = Date.now();
  const LIVE_STATUSES = new Set(['STATUS_IN_PLAY','STATUS_IN_PROGRESS','STATUS_HALFTIME','STATUS_PAUSED','IN_PLAY','HALFTIME','PAUSED','IN_PROGRESS']);
  const isLive   = g => LIVE_STATUSES.has(g.status);
  const hasAlert = g => alertedIds.has(g.id);

  const fmtTime = date => new Date(date).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
  const dayLabel = date => {
    const d = new Date(date); const t = new Date();
    if (d.toDateString() === t.toDateString()) return "Aujourd'hui";
    const tm = new Date(t); tm.setDate(t.getDate()+1);
    if (d.toDateString() === tm.toDateString()) return 'Demain';
    return d.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' });
  };

  const visible = filter === 'all' ? games : games.filter(g => g.sport === filter);

  // Grouper par jour
  const groups = [];
  let curDay = null;
  for (const g of visible) {
    const day = new Date(g.date).toDateString();
    if (day !== curDay) { curDay = day; groups.push({ label: dayLabel(g.date), games: [] }); }
    groups[groups.length-1].games.push(g);
  }

  const dim = 'var(--text-dim)';

  return (
    <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:16, display:'flex', flexDirection:'column', alignSelf:'start', overflow:'hidden' }}>
      {/* Header — clic partout pour ouvrir/fermer */}
      <div onClick={()=>setOpen(o=>!o)} style={{ padding:'0.3rem 0.75rem 0', flexShrink:0, cursor:'pointer', userSelect:'none' }}>
        <div style={{ fontSize:8, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-sub)', borderBottom: open ? '1px solid var(--border)' : '1px solid var(--border)', paddingBottom:'0.3rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span>Matchs à venir</span>
        <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
          {open && [['all','Tous'],['foot','⚽'],['basket','🏀']].map(([k,l])=>(
            <button key={k} onClick={e=>{e.stopPropagation();setFilter(k);}} style={{
              fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:4, border:'none', cursor:'pointer',
              background: filter===k ? 'rgba(96,165,250,0.2)' : 'transparent',
              color:      filter===k ? '#60a5fa' : dim,
            }}>{l}</button>
          ))}
          <svg style={{ transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.2s', color:dim }} width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        </div>
      </div>

      {/* Liste — scrollable dans les deux états */}
      <div className="no-scrollbar" style={{ overflowY: 'auto', maxHeight: open ? 320 : 78, padding:'0.15rem 0', transition:'max-height 0.25s ease' }}>
        {loading ? (
          <div style={{ padding:'0.5rem 0.75rem', fontSize:10, color:dim }}>Chargement…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding:'0.5rem 0.75rem', fontSize:10, color:dim }}>Aucun match à venir</div>
        ) : (open ? groups : [{ label: null, games: visible }]).map((group, gi) => (
          <div key={group.label || gi}>
            {open && group.label && <div style={{ padding:'0.2rem 0.75rem 0.1rem', fontSize:8, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'rgba(255,255,255,0.18)' }}>
              {group.label}
            </div>}
            {group.games.map(g => {
              const live  = isLive(g);
              const alert = hasAlert(g);
              const color = LEAGUE_COLOR_MAP[g.league] || '#94a3b8';
              const lbl   = LEAGUE_LABEL_MAP[g.league] || g.league.toUpperCase();
              return (
                <div key={g.id} onClick={() => goToMatch(g)} style={{
                  display:'flex', alignItems:'center', gap:'0.5rem',
                  padding:'0.28rem 0.75rem 0.28rem 0.65rem',
                  borderLeft: `2px solid #60a5fa55`,
                  marginLeft: 2,
                  background: alert && !live ? 'rgba(251,146,60,0.03)' : 'transparent',
                  transition:'background 0.15s', cursor:'pointer',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = alert && !live ? 'rgba(251,146,60,0.03)' : 'transparent'}
                >
                  {/* Live dot ou heure */}
                  {live ? (
                    <span style={{ display:'flex', alignItems:'center', gap:3, width:36, flexShrink:0 }}>
                      <span style={{ width:5, height:5, borderRadius:'50%', background:'#60a5fa', flexShrink:0, boxShadow:'0 0 4px #60a5fa' }} />
                      <span style={{ fontSize:9, fontWeight:700, color:'#60a5fa', fontVariantNumeric:'tabular-nums' }}>{fmtTime(g.date)}</span>
                    </span>
                  ) : (
                    <span style={{ fontSize:9, color:dim, width:36, flexShrink:0, fontVariantNumeric:'tabular-nums' }}>{fmtTime(g.date)}</span>
                  )}
                  {/* Badge ligue — pill coloré */}
                  {g.league === 'cdm' ? (
                    <span style={{ fontSize:11, lineHeight:1, flexShrink:0 }}>🌍</span>
                  ) : g.league === 'wnba' ? (
                    <img src="https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png" alt="WNBA" style={{ width:12, height:12, objectFit:'contain', flexShrink:0 }} />
                  ) : (
                    <span style={{
                      fontSize:7, fontWeight:800, letterSpacing:'0.06em',
                      color, background:`${color}15`, borderRadius:20,
                      padding:'2px 6px', flexShrink:0, minWidth:20, textAlign:'center',
                    }}>
                      {lbl}
                    </span>
                  )}
                  {/* Équipes */}
                  <span style={{ fontSize:10, color: live ? '#60a5fa' : 'var(--text)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight: live ? 600 : 400 }}>
                    {g.home}
                    <span style={{ color:'rgba(255,255,255,0.2)', margin:'0 4px', fontSize:8 }}>·</span>
                    {g.away}
                  </span>
                  {/* Score live */}
                  {live && g.homeScore !== null && (
                    <span style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                      <span style={{ fontSize:8, fontWeight:800, color:'#60a5fa', background:'rgba(96,165,250,0.12)', border:'1px solid rgba(96,165,250,0.3)', padding:'1px 5px', borderRadius:4, letterSpacing:'0.05em' }}>LIVE</span>
                      <span style={{ fontSize:10, fontWeight:700, color:'var(--text)', fontVariantNumeric:'tabular-nums', background:'rgba(255,255,255,0.07)', padding:'1px 5px', borderRadius:4 }}>
                        {g.homeScore}–{g.awayScore}
                      </span>
                    </span>
                  )}
                  {/* Alerte */}
                  {alert && !live && (
                    <span style={{ width:5, height:5, borderRadius:'50%', background:'#fb923c', flexShrink:0, boxShadow:'0 0 4px #fb923c88' }} title="Alerte active" />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

    </div>
  );
}

const PERIODS = [
  { label: '1 jour',   days: 1  },
  { label: '3 jours',  days: 3  },
  { label: '5 jours',  days: 5  },
  { label: '10 jours', days: 10 },
  { label: '20 jours', days: 20 },
  { label: '30 jours', days: 30 },
];

export default function DashboardPage() {
  const [alerts, setAlerts]           = useState([]);
  const [totalAlerts, setTotalAlerts] = useState([]);
  const [resultAlerts, setResultAlerts] = useState([]);
  // Toutes les alertes foot (BTTS/O-U/Résultat/DC) — le graphique "Paris acceptés" les ignorait
  // entièrement avant ce fix (7 juillet 2026), ne comptant que les props/totaux basket.
  const [footballAlerts, setFootballAlerts] = useState([]);
  const [period, setPeriod]           = useState(5);


  const load = () => {
    const RESOLVED = ['accepted', 'won', 'lost', 'void'];
    const backfill = a =>
      RESOLVED.includes(a.status) && !a.acceptedAt && a.savedAt
        ? { ...a, acceptedAt: a.savedAt }
        : a;
    try { setAlerts((JSON.parse(localStorage.getItem(ALERT_KEY) || '[]')).map(backfill)); }
    catch { setAlerts([]); }
    try { setTotalAlerts((JSON.parse(localStorage.getItem(GAME_TOTAL_KEY) || '[]')).map(backfill)); }
    catch { setTotalAlerts([]); }
    try { setResultAlerts(JSON.parse(localStorage.getItem(BBALL_RESULT_KEY) || '[]')); }
    catch { setResultAlerts([]); }
    try {
      const fb = [FB_BTTS_KEY, FB_TOTAL_KEY, FB_RESULT_KEY, FB_DC_BTTS_KEY, FB_DC_OU_KEY]
        .flatMap(k => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } })
        .map(backfill);
      setFootballAlerts(fb);
    } catch { setFootballAlerts([]); }
  };

  useEffect(() => {
    load();
    window.addEventListener('nba_alerts_updated', load);
    const id = setInterval(load, 5000);
    return () => { window.removeEventListener('nba_alerts_updated', load); clearInterval(id); };
  }, []);

  const now = Date.now();
  const RESOLVED = ['accepted', 'won', 'lost', 'void'];
  const pending  = alerts.filter(a => (a.status || 'pending') === 'pending' && new Date(a.fixtureDate).getTime() > now);

  // Déduplique par (player + date + stat + direction) — garde la probabilité la plus haute
  const dedupAlerts = (arr) => {
    const map = {};
    for (const a of arr) {
      const key = `${a.player}__${(a.fixtureDate||'').slice(0,10)}__${a.stat}__${a.direction}`;
      if (!map[key] || (a.probability || 0) > (map[key].probability || 0)) map[key] = a;
    }
    return Object.values(map);
  };

  const accepted        = dedupAlerts(alerts.filter(a => RESOLVED.includes(a.status)));
  const acceptedTotals  = totalAlerts.filter(a => RESOLVED.includes(a.status));
  // Pas de dedupAlerts ici : ces alertes n'ont pas de champ `player`, la clé de dédup collapserait
  // à tort plusieurs matchs/marchés différents ensemble.
  const acceptedFootball    = footballAlerts.filter(a => RESOLVED.includes(a.status));
  const acceptedBballResult = resultAlerts.filter(a => RESOLVED.includes(a.status));
  const allDedupAlerts  = dedupAlerts(alerts);

  return (
    <div style={{ padding: '0.9rem 2.5rem 2rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p id="vue-ensemble" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#3b82f6', marginBottom: '0.6rem' }}>
            Vue d'ensemble
          </p>
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1.1 }}>
            Tableau de bord
          </h1>
          <p style={{ color: 'var(--text-sub)', marginTop: '0.6rem', fontSize: 14, maxWidth: 420, lineHeight: 1.6 }}>
            Suivi des alertes
          </p>
        </div>
      </div>

      {/* Chart */}
      <div style={{
        background: 'rgba(13,17,23,0.35)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '1.25rem 1.5rem 0' }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)' }}>
            Paris acceptés
          </span>
          <select
            value={period}
            onChange={e => setPeriod(Number(e.target.value))}
            style={{
              fontSize: 11, color: 'var(--text-dim)', background: 'transparent',
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '0.2rem 0.5rem', cursor: 'pointer', outline: 'none',
            }}
          >
            {PERIODS.map(p => (
              <option key={p.days} value={p.days} style={{ background: '#1a1a2e' }}>{p.label}</option>
            ))}
          </select>
        </div>
        <AlertsChart accepted={[...accepted, ...acceptedTotals, ...acceptedFootball, ...acceptedBballResult]} days={period} />
      </div>

      {/* Grid 2 colonnes : chaque ligne partage la même hauteur */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1.5rem', marginBottom: '1.5rem', width: '100%' }}>
        <CountdownWidget />
        <SystemHealthSection />
        <QuotasWidget />
        <UpcomingMatchesWidget />
      </div>

    </div>
  );
}
