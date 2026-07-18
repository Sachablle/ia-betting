import { useState, useEffect, useRef } from 'react';
import { ComposableMap, Geographies, Geography, Graticule } from 'react-simple-maps';
import { useNavigate, useLocation } from 'react-router-dom';
import { cachedFetch } from '../utils/fetchCache';

import GEO_DATA from 'world-atlas/countries-110m.json';
const GEO_URL = GEO_DATA;

// Ordre du tableau `leagues` = ordre d'affichage/sport par défaut (cf. _firstSport plus bas) —
// football en premier partout sauf États-Unis (pas de foot couvert là-bas, basket reste devant).
const COVERED = {
  '840': { name: 'États-Unis', flag: '🇺🇸', leagues: ['nba','wnba'] },
  '250': { name: 'France',     flag: '🇫🇷', leagues: ['ligue1','lnb'] },
  '724': { name: 'Espagne',    flag: '🇪🇸', leagues: ['laliga','acb'] },
  '276': { name: 'Allemagne',  flag: '🇩🇪', leagues: ['bundes','bbl'] },
  '380': { name: 'Italie',     flag: '🇮🇹', leagues: ['seriea','legaa'] },
  '826': { name: 'Angleterre', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', leagues: ['pl'] },
  '076': { name: 'Brésil',     flag: '🇧🇷', leagues: ['bresil'] },
};

const LEAGUE_META = {
  nba: 'NBA', wnba: 'WNBA', lnb: 'Betclic Élite',
  acb: 'ACB', bbl:  'BBL',  legaa: 'Lega A',
  ligue1: 'Ligue 1', laliga: 'La Liga', bundes: 'Bundesliga', seriea: 'Serie A', pl: 'Premier League',
  euroleague: 'EuroLeague', cdm: 'Coupe du Monde', bresil: 'Brasileirão',
};

const FOOTBALL_LEAGUES = new Set(['ligue1','laliga','bundes','seriea','pl','cdm','bresil']);

const _ESPN_WNBA = { 'Atlanta Dream':20,'Chicago Sky':19,'Connecticut Sun':18,'Dallas Wings':3,'Golden State Valkyries':129689,'Indiana Fever':5,'Las Vegas Aces':17,'Los Angeles Sparks':6,'Minnesota Lynx':8,'New York Liberty':9,'Phoenix Mercury':11,'Portland Fire':132052,'Seattle Storm':14,'Toronto Tempo':131935,'Washington Mystics':16 };
const _ESPN_NBA  = { 'Atlanta Hawks':1,'Boston Celtics':2,'New Orleans Pelicans':3,'Chicago Bulls':4,'Cleveland Cavaliers':5,'Dallas Mavericks':6,'Denver Nuggets':7,'Detroit Pistons':8,'Golden State Warriors':9,'Houston Rockets':10,'Indiana Pacers':11,'LA Clippers':12,'Los Angeles Lakers':13,'Miami Heat':14,'Milwaukee Bucks':15,'Minnesota Timberwolves':16,'Brooklyn Nets':17,'New York Knicks':18,'Orlando Magic':19,'Philadelphia 76ers':20,'Phoenix Suns':21,'Portland Trail Blazers':22,'Sacramento Kings':23,'San Antonio Spurs':24,'Oklahoma City Thunder':25,'Utah Jazz':26,'Washington Wizards':27,'Toronto Raptors':28,'Memphis Grizzlies':29,'Charlotte Hornets':30 };
function _prefetchMatch(g, league) {
  if (FOOTBALL_LEAGUES.has(league)) { import('./MatchDetailPage').catch(()=>{}); return; }
  import('./BasketballDetailPage').catch(()=>{});
  const map = league==='wnba' ? _ESPN_WNBA : _ESPN_NBA;
  const api = league==='wnba' ? 'wnba' : 'nba';
  const hId = map[g.home?.name]; const aId = map[g.away?.name];
  if (hId) { cachedFetch(`/api/${api}/players/${hId}`,3_600_000).catch(()=>{}); cachedFetch(`/api/${api}/teamschedule/${hId}`,300_000).catch(()=>{}); }
  if (aId) { cachedFetch(`/api/${api}/players/${aId}`,3_600_000).catch(()=>{}); cachedFetch(`/api/${api}/teamschedule/${aId}`,300_000).catch(()=>{}); }
}
const _prefetchedCountries = new Set();
function _prefetchCountry(country) {
  if (!country) return;
  const key = country.name;
  if (_prefetchedCountries.has(key)) return;
  _prefetchedCountries.add(key);
  for (const l of country.leagues) {
    if (l === 'nba' || l === 'wnba') {
      const base = `/api/${l}`;
      cachedFetch(`${base}/scoreboard`, 20_000).catch(()=>{});
      cachedFetch(`${base}/standings`,  6*3_600_000).catch(()=>{});
      cachedFetch(`${base}/leaders`,    6*3_600_000).catch(()=>{});
    } else if (l === 'acb') {
      cachedFetch('/api/euro/acb/scoreboard', 20_000).catch(()=>{});
      cachedFetch('/api/acb/standings', 6*3_600_000).catch(()=>{});
      cachedFetch('/api/acb/leaders',   6*3_600_000).catch(()=>{});
    } else if (l === 'cdm') {
      cachedFetch('/api/fd/worldcup', 30_000).catch(()=>{});
    } else if (l === 'bresil') {
      cachedFetch('/api/fd/bresil', 30_000).catch(()=>{});
    } else if (l === 'euroleague') {
      cachedFetch('/api/euroleague/scoreboard', 20_000).catch(()=>{});
    } else if (FOOTBALL_LEAGUES.has(l)) {
      cachedFetch('/api/fd/matches', 30_000).catch(()=>{});
    } else {
      cachedFetch(`/api/euro/${l}/scoreboard`, 20_000).catch(()=>{});
    }
  }
}


const MONDE = { name: 'Monde', flag: '🌍', leagues: ['cdm','euroleague'], isMonde: true };

const STAT_CATS = [
  { key: 'pts', label: 'PTS', sub: 'Points / match',    color: '#60a5fa' },
  { key: 'reb', label: 'REB', sub: 'Rebonds / match',   color: '#4ade80' },
  { key: 'ast', label: 'AST', sub: 'Assists / match',   color: '#fb923c' },
  { key: 'tpm', label: '3PM', sub: '3 pts / match',     color: '#c084fc' },
];

function StatsOverlay({ league, onClose, standData, cats }) {
  const [standView, setStandView] = useState('ligue');

  if (league !== 'wnba' && league !== 'nba' && league !== 'acb') return null;

  const card = {
    background:'rgba(0,6,20,0.97)', border:'1px solid rgba(96,165,250,0.15)',
    borderRadius:10, boxShadow:'0 8px 32px rgba(0,0,0,0.8)', overflow:'hidden',
  };
  const btnToggle = (active) => ({
    fontSize:8, fontWeight:700, fontFamily:'monospace', letterSpacing:'0.06em',
    padding:'2px 6px', borderRadius:4, cursor:'pointer', border:'none',
    background: active ? 'rgba(96,165,250,0.2)' : 'transparent',
    color: active ? '#60a5fa' : 'rgba(255,255,255,0.3)',
    textTransform:'uppercase',
  });

  const StandTable = ({ teams }) => (
    <table style={{ width:'100%', borderCollapse:'collapse' }}>
      <thead>
        <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.06)', position:'sticky', top:0, background:'rgba(0,6,20,0.98)' }}>
          {['#','ÉQUIPE','V','D','.PCT','GB'].map(h => (
            <th key={h} style={{ fontSize:8, fontWeight:700, color:'rgba(255,255,255,0.3)', fontFamily:'monospace', padding:'4px 6px', textAlign: h==='ÉQUIPE'?'left':'center', letterSpacing:'0.08em' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {teams.map((t, i) => (
          <tr key={t.abbr} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)', background: i%2===0?'rgba(255,255,255,0.01)':'none' }}>
            <td style={{ fontSize:9, color:'rgba(255,255,255,0.35)', padding:'4px 6px', textAlign:'center', fontFamily:'monospace' }}>{t.rank}</td>
            <td style={{ padding:'4px 6px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                {t.logo && <img src={t.logo} alt="" width={14} height={14} style={{ objectFit:'contain' }} onError={e=>e.target.style.display='none'}/>}
                <span style={{ fontSize:10, fontWeight:700, color:'#fff' }}>{t.abbr}</span>
              </div>
            </td>
            <td style={{ fontSize:10, color:'#4ade80', fontWeight:700, textAlign:'center', padding:'4px 4px', fontFamily:'monospace' }}>{t.wins}</td>
            <td style={{ fontSize:10, color:'rgba(255,255,255,0.5)', textAlign:'center', padding:'4px 4px', fontFamily:'monospace' }}>{t.losses}</td>
            <td style={{ fontSize:10, color:'rgba(255,255,255,0.7)', textAlign:'center', padding:'4px 4px', fontFamily:'monospace' }}>{t.pct != null ? t.pct.toFixed(3) : '—'}</td>
            <td style={{ fontSize:10, color:'rgba(255,255,255,0.4)', textAlign:'center', padding:'4px 4px', fontFamily:'monospace' }}>{t.gb != null && t.gb > 0 ? t.gb : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const LEFT    = 208;
  const PANEL_W = 480;
  const GAP     = 10; // marge droite avant le panel

  return (
    <div style={{ position:'fixed', top:110, bottom:70, left:LEFT, right: PANEL_W + GAP, zIndex:30, display:'flex', flexDirection:'column', gap:24, pointerEvents:'none' }}>
      {/* Classement — largeur fixe */}
      <div key={`stand-${league}`} onClick={(e) => e.stopPropagation()} style={{ ...card, width:380, flexShrink:0, animation:'mapReveal 1.4s ease-out both', animationDelay:'0.1s', pointerEvents:'auto' }}>
        <div style={{ padding:'8px 12px 6px', borderBottom:'1px solid rgba(96,165,250,0.1)', display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:10, fontWeight:800, color:'#60a5fa', fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.1em', flex:1 }}>Classement {league?.toUpperCase()}</span>
          <button style={btnToggle(standView==='ligue')} onClick={()=>setStandView('ligue')}>Ligue</button>
          {league !== 'acb' && <button style={btnToggle(standView==='conf')} onClick={()=>setStandView('conf')}>Conf.</button>}
          <button onClick={onClose} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.3)', cursor:'pointer', fontSize:14, lineHeight:1, padding:0, marginLeft:4 }}>×</button>
        </div>
        <div style={{ maxHeight:'calc(50vh - 60px)', overflowY:'auto' }}>
          {!standData ? (
            <div style={{ padding:'1.2rem', textAlign:'center', fontSize:10, color:'rgba(255,255,255,0.2)', fontFamily:'monospace' }}>CHARGEMENT...</div>
          ) : standView === 'ligue' ? (
            <StandTable teams={standData.standings || []} />
          ) : (
            (standData.conferences || []).map(conf => (
              <div key={conf.name}>
                <div style={{ padding:'5px 12px', fontSize:8, fontWeight:800, color:'rgba(96,165,250,0.5)', fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.1em', borderBottom:'1px solid rgba(255,255,255,0.04)', background:'rgba(96,165,250,0.04)' }}>{conf.short}</div>
                <StandTable teams={conf.teams || []} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* 4 fenêtres stats — s'étendent jusqu'à la légende */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6, flex:1, minHeight:0 }}>
        {STAT_CATS.map(({ key, label, sub, color }, ci) => (
          <div key={`${league}-${key}`} onClick={(e) => e.stopPropagation()} style={{ ...card, display:'flex', flexDirection:'column', minHeight:0, animation:'mapReveal 1.4s ease-out both', animationDelay:`${0.25 + ci * 0.18}s`, pointerEvents:'auto' }}>
            <div style={{ padding:'6px 10px 4px', borderBottom:`1px solid ${color}22`, flexShrink:0 }}>
              <span style={{ fontSize:11, fontWeight:800, color, fontFamily:'monospace' }}>{label}</span>
              <span style={{ fontSize:8, color:'rgba(255,255,255,0.3)', marginLeft:5, textTransform:'uppercase', letterSpacing:'0.06em' }}>{sub.split('/')[1]?.trim()}</span>
            </div>
            <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', justifyContent:'space-evenly' }}>
              {!cats?.[key] ? (
                <div style={{ padding:'1rem', textAlign:'center', fontSize:9, color:'rgba(255,255,255,0.2)', fontFamily:'monospace' }}>…</div>
              ) : cats[key].map((l, i) => (
                <div key={l.id} style={{
                  display:'flex', alignItems:'center', gap:6, padding:'6px 10px',
                  borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  background: i === 0 ? `${color}0a` : 'none',
                }}>
                  <span style={{ fontSize:9, color:'rgba(255,255,255,0.3)', fontFamily:'monospace', width:12, flexShrink:0, textAlign:'right' }}>{l.rank}</span>
                  <img src={l.photo} alt="" width={24} height={24} style={{ borderRadius:'50%', objectFit:'cover', border: i===0?`1px solid ${color}55`:'1px solid rgba(255,255,255,0.08)', flexShrink:0 }} onError={e=>e.target.style.display='none'}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:10, fontWeight: i===0?800:600, color: i===0?'#fff':'rgba(255,255,255,0.75)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{(n=>{const p=n.split(' ');return p.length>1?p[0][0]+'. '+p.slice(1).join(' '):n;})(l.name)}</div>
                    <div style={{ fontSize:8, color:'rgba(255,255,255,0.3)' }}>{l.team}</div>
                  </div>
                  <div style={{ fontSize: i===0?14:11, fontWeight:800, color: i===0?color:'rgba(255,255,255,0.6)', fontFamily:'monospace', flexShrink:0 }}>{l.displayValue}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Panel({ country, onClose, statsLeague, setStatsLeague, onOpenBasketStats }) {
  const navigate = useNavigate();
  const [matches, setMatches] = useState({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState({}); // { [league]: 'upcoming' | 'done' } — bouton À venir / Terminés par championnat
  const _hasFootball = country.leagues.some(l => FOOTBALL_LEAGUES.has(l));
  const _hasBasket   = country.leagues.some(l => !FOOTBALL_LEAGUES.has(l));
  // Par défaut : sport de la première ligue du pays (acb avant laliga → basket ; cdm avant euroleague → football)
  const _firstSport = FOOTBALL_LEAGUES.has(country.leagues[0]) ? 'football' : 'basket';
  const [sportFilter, setSportFilter] = useState(_hasBasket && _hasFootball ? _firstSport : _hasBasket ? 'basket' : _hasFootball ? 'football' : null);

  useEffect(() => {
    if (!country) return;
    // Ne montrer le spinner qu'après 120ms — évite le flash quand les données sont déjà en cache
    let cancelled = false;
    const loadTimer = setTimeout(() => { if (!cancelled) setLoading(true); }, 120);
    const fetchLeague = l => {
      const KEEP_MS = 48*3600_000;
      const UPCOMING_MS = 30*3600_000; // page principale = matchs imminents (<30h) ; onglet "À venir" = matchs programmés à 30h ou plus
      const splitGames = games => ({
        soon:     games.filter(g=>g.status!=='STATUS_FINAL' && g.status!=='STATUS_POSTPONED' && new Date(g.date).getTime()-Date.now() < UPCOMING_MS),
        upcoming: games.filter(g=>g.status!=='STATUS_FINAL' && g.status!=='STATUS_POSTPONED' && new Date(g.date).getTime()-Date.now() >= UPCOMING_MS),
        done:     games.filter(g=>g.status==='STATUS_FINAL'&&Date.now()-new Date(g.date).getTime()<KEEP_MS).slice(0,8),
      });
      if (l === 'nba')  return cachedFetch('/api/nba/scoreboard', 20_000).then(d=>{const s=splitGames(d.games||[]);return{l,...s};});
      if (l === 'wnba') return cachedFetch('/api/wnba/scoreboard', 20_000).then(d=>{const s=splitGames(d.games||[]);return{l,...s};});
      if (l === 'euroleague') return cachedFetch('/api/euroleague/scoreboard', 20_000).then(d=>{const s=splitGames(d.games||[]);return{l,...s};});
      // 5 grands championnats — football-data.org (même source/même id `fd_<id>` que MatchDetailPage
      // via useFootballFixtures, cf. src/utils/useFootballFixtures.js). Seuls les matchs SCHEDULED
      // sont renvoyés par /api/fd/matches (pas encore de source de score final pour ces 5 ligues,
      // contrairement à la CDM) — l'onglet "Terminés" restera vide pour elles, comme documenté.
      if (FOOTBALL_LEAGUES.has(l) && l !== 'cdm' && l !== 'bresil') return cachedFetch('/api/fd/matches', 30_000).then(d=>{
        const all=(d.matches||[]).filter(f=>f.league===l).map(f=>({
          id:`fd_${f.id}`,date:f.date,status:'STATUS_SCHEDULED',round:f.round,
          home:{name:f.home?.name,short:f.home?.short,logo:f.home?.logoId,score:null},
          away:{name:f.away?.name,short:f.away?.short,logo:f.away?.logoId,score:null},
        }));
        return{l,...splitGames(all)};
      });
      if (l === 'cdm') return cachedFetch('/api/fd/worldcup', 30_000).then(d => {
        const games = (d.games || []).map(g => ({ ...g, id: `fdcdm_${g.id}` }));
        return {l, ...splitGames(games)};
      });
      // Brasileirão (17 juillet 2026) — source isolée /api/fd/bresil, même prefixe fdbr_ que
      // generateBackgroundAlerts (server.js) pour que fixtureId corresponde partout.
      if (l === 'bresil') return cachedFetch('/api/fd/bresil', 30_000).then(d => {
        const all=(d.matches||[]).map(f=>({
          id:`fdbr_${f.id}`,date:f.date,status:f.status||'STATUS_SCHEDULED',round:f.round,
          home:{name:f.home?.name,short:f.home?.short,logo:f.home?.logoId,score:f.home?.score ?? null},
          away:{name:f.away?.name,short:f.away?.short,logo:f.away?.logoId,score:f.away?.score ?? null},
        }));
        return{l,...splitGames(all)};
      });
      return cachedFetch(`/api/euro/${l}/scoreboard`, 20_000).then(d=>{const s=splitGames(d.games||[]);return{l,...s};});
    };
    const load = (first=false) => Promise.all(country.leagues.map(l => fetchLeague(l).catch(()=>({l,soon:[],upcoming:[],done:[]})))).then(res => {
      if (cancelled) return;
      const m={};
      res.forEach(({l,soon=[],upcoming=[],done=[]})=>{m[l]={soon,upcoming,done};});
      setMatches(m);
      if (first) {
        clearTimeout(loadTimer); setLoading(false);
        // Pré-charge les données de tous les matchs visibles dès l'ouverture du panneau
        Object.entries(m).forEach(([l, { soon=[], upcoming=[] }]) => {
          [...soon, ...upcoming].forEach(g => _prefetchMatch(g, l));
        });
      } else setLoading(false);
    });
    load(true);
    // Rafraîchit régulièrement pour faire passer un match terminé de "À venir" à "Terminés"
    // sans devoir fermer/réouvrir le panneau (settlement plus rapide pour la CDM).
    const t = setInterval(() => load(false), 60_000);
    return () => { cancelled = true; clearTimeout(loadTimer); clearInterval(t); };
  }, [country?.name]);

  const hasFootball   = country.leagues.some(l => FOOTBALL_LEAGUES.has(l));
  const hasBasket     = country.leagues.some(l => !FOOTBALL_LEAGUES.has(l));
  const visibleLeagues = sportFilter
    ? country.leagues.filter(l => sportFilter === 'football' ? FOOTBALL_LEAGUES.has(l) : !FOOTBALL_LEAGUES.has(l))
    : country.leagues;

  return (
    <div onClick={(e) => e.stopPropagation()} style={{  // empêche le clic panel de remonter au root
      position:'fixed', top:0, right:0, bottom:0, width:480,
      background:'linear-gradient(160deg,rgba(0,6,20,0.98),rgba(0,12,35,0.99))',
      borderLeft:'1px solid rgba(251,146,60,0.15)',
      boxShadow:'-20px 0 60px rgba(0,0,0,0.8)',
      display:'flex', flexDirection:'column',
      animation:'mapReveal 1s ease-out both',
      zIndex:20,
    }}>
      {/* Header */}
      <div style={{padding:'2rem 1.75rem 1.25rem', borderBottom:'1px solid rgba(251,146,60,0.08)'}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'0.5rem'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:32}}>{country.flag}</span>
            <div>
              <div style={{fontSize:20,fontWeight:800,color:'#fff',letterSpacing:'-0.02em'}}>{country.name}</div>
              <div style={{fontSize:9,color:'rgba(251,146,60,0.5)',fontFamily:'monospace',textTransform:'uppercase',letterSpacing:'0.12em',marginTop:4}}>
                {country.leagues.map(l=>LEAGUE_META[l]).join(' · ')}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'1px solid rgba(251,146,60,0.15)',borderRadius:6,color:'rgba(251,146,60,0.5)',cursor:'pointer',width:32,height:32,fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s'}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(251,146,60,0.4)';e.currentTarget.style.color='rgba(251,146,60,0.8)';}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(251,146,60,0.15)';e.currentTarget.style.color='rgba(251,146,60,0.5)';}}>×</button>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:'1rem'}}>
          <div style={{flex:1,height:1,background:'linear-gradient(90deg,rgba(251,146,60,0.4),transparent)'}}/>
          {(_hasFootball
            ? [['football','⚽','#2d8a2d','rgba(45,138,45,',_hasFootball],['basket','🏀','#fb923c','rgba(251,146,60,',_hasBasket]]
            : [['basket','🏀','#fb923c','rgba(251,146,60,',_hasBasket],['football','⚽','#2d8a2d','rgba(45,138,45,',_hasFootball]]
          ).map(([sport, icon, col, rgba, has]) => {
            const active = sportFilter === sport;
            return (
              <button key={sport} onClick={() => {
                  if (!has) return;
                  const next = sportFilter === sport ? null : sport;
                  setSportFilter(next);
                  // Le panneau classement/leaders ne s'affiche que quand le basket est explicitement
                  // sélectionné — sinon il restait visible même sur l'onglet Football (Espagne, etc.)
                  if (next === 'basket') onOpenBasketStats(country); else setStatsLeague(null);
                }}
                title={sport === 'football' ? 'Football uniquement' : 'Basket uniquement'}
                style={{
                  background: active ? `${rgba}0.15)` : 'none',
                  border: `1px solid ${active ? col : has ? `${rgba}0.2)` : 'rgba(255,255,255,0.06)'}`,
                  borderRadius:5, cursor: has ? 'pointer' : 'default',
                  width:22, height:22, fontSize:11,
                  display:'flex', alignItems:'center', justifyContent:'center', transition:'all .15s',
                  boxShadow: active ? `0 0 6px ${rgba}0.3)` : 'none',
                  opacity: has ? 1 : 0.25,
                }}
                onMouseEnter={e=>{ if(has){e.currentTarget.style.borderColor=col;e.currentTarget.style.background=`${rgba}0.1)`;} }}
                onMouseLeave={e=>{ if(has){e.currentTarget.style.borderColor=active?col:`${rgba}0.2)`;e.currentTarget.style.background=active?`${rgba}0.15)`:'none';} }}>
                {icon}
              </button>
            );
          })}
        </div>
      </div>

      {/* Matchs */}
      <div style={{flex:1,overflowY:'auto',padding:'1.25rem 1.75rem'}}>
        {loading ? (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'rgba(251,146,60,0.25)',fontFamily:'monospace',fontSize:11,letterSpacing:'0.1em'}}>CHARGEMENT...</div>
        ) : visibleLeagues.map(league => {
          const isFootball = FOOTBALL_LEAGUES.has(league);
          const lp = league==='wnba'?'?league=wnba':['nba'].includes(league)?'':`?league=${league}`;
          const { soon=[], upcoming=[], done=[] } = matches[league] || {};
          // Si rien dans les 30h mais des matchs plus loin (ex: reprise de saison à plusieurs
          // semaines), les montrer directement plutôt que forcer un clic sur "À venir" pour voir
          // un onglet "soon" vide.
          const mode = view[league] || (soon.length === 0 && upcoming.length > 0 ? 'upcoming' : 'soon');
          const games = mode === 'upcoming' ? [...soon, ...upcoming] : soon;
          return (
            <div key={league} style={{marginBottom:'1.5rem'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,position:'sticky',top:0,zIndex:1,background:'linear-gradient(180deg,rgba(0,8,25,0.99) 85%,transparent)',paddingTop:4,paddingBottom:4,marginTop:-4}}>
                {(() => {
                  const isFoot = FOOTBALL_LEAGUES.has(league);
                  const col = isFoot ? '#2d8a2d' : '#fb923c';
                  const colFade = isFoot ? 'rgba(45,138,45,0.7)' : 'rgba(251,146,60,0.7)';
                  return <>
                    <div style={{width:5,height:5,borderRadius:'50%',background:col,boxShadow:`0 0 8px ${col}`}}/>
                    <span style={{fontSize:10,fontWeight:700,color:col,fontFamily:'monospace',textTransform:'uppercase',letterSpacing:'0.1em',whiteSpace:'nowrap'}}>{LEAGUE_META[league]}</span>
                    {!FOOTBALL_LEAGUES.has(league) && <button onClick={()=>setStatsLeague(sl=>sl===league?null:league)}
                      title="Stats du championnat"
                      style={{flexShrink:0,width:11,height:11,borderRadius:2,
                        border:`1px solid ${statsLeague===league?'rgba(96,165,250,0.8)':'rgba(96,165,250,0.5)'}`,
                        background: statsLeague===league?'rgba(96,165,250,0.15)':'transparent',
                        display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',padding:0,transition:'all .15s'}}>
                      <svg width="7" height="6" viewBox="0 0 9 9" fill="none">
                        <rect x="1" y="6" width="1.5" height="2.5" fill="#60a5fa"/>
                        <rect x="3.75" y="3.5" width="1.5" height="5" fill="#4ade80"/>
                        <rect x="6.5" y="1" width="1.5" height="7.5" fill="#60a5fa"/>
                      </svg>
                    </button>}
                    <div style={{flex:1,height:1,background:`${col}18`}}/>
                    <div style={{ flexShrink:0, display:'flex', alignItems:'center', border:'1px solid rgba(255,255,255,0.25)', borderRadius:4, overflow:'hidden', visibility: (soon.length > 0 || upcoming.length > 0 || done.length > 0) ? 'visible' : 'hidden' }}>
                      <span onClick={() => setView(s => ({...s, [league]: 'upcoming'}))}
                        style={{ fontSize:8, fontWeight:700, fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.06em', padding:'3px 7px', cursor:'pointer', color:'#60a5fa', background: mode==='upcoming' ? 'rgba(96,165,250,0.12)' : 'transparent', transition:'background .15s' }}>
                        À venir
                      </span>
                      <span style={{ fontSize:8, color:'rgba(255,255,255,0.2)', userSelect:'none' }}>/</span>
                      <span onClick={() => setView(s => ({...s, [league]: 'done'}))}
                        style={{ fontSize:8, fontWeight:700, fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.06em', padding:'3px 7px', cursor:'pointer', color:'#4ade80', background: mode==='done' ? 'rgba(74,222,128,0.12)' : 'transparent', transition:'background .15s' }}>
                        Terminés
                      </span>
                    </div>
                  </>;
                })()}
              </div>
              {mode !== 'done' ? (
                games.length===0 ? (
                  <p style={{fontSize:11,color:'rgba(251,146,60,0.18)',fontFamily:'monospace',margin:0,paddingLeft:13}}>{mode === 'upcoming' ? 'Aucun match à venir' : 'Aucun match dans les prochaines 30h'}</p>
                ) : (() => {
                  // Grouper par date
                  const byDate = {};
                  games.forEach(g => {
                    const dk = new Date(g.date).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'long'});
                    if (!byDate[dk]) byDate[dk] = [];
                    byDate[dk].push(g);
                  });
                  return Object.entries(byDate).map(([dateLabel, dayGames]) => (
                    <div key={dateLabel}>
                      {/* Séparateur date */}
                      <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 4px',margin:'4px 0'}}>
                        <div style={{flex:1,height:'1px',background:'rgba(255,255,255,0.08)'}}/>
                        <span style={{fontSize:9,fontWeight:700,color:'rgba(255,255,255,0.35)',textTransform:'capitalize',letterSpacing:'0.06em',whiteSpace:'nowrap'}}>{dateLabel}</span>
                        <div style={{flex:1,height:'1px',background:'rgba(255,255,255,0.08)'}}/>
                      </div>
                      {dayGames.map((g,i) => {
                        const live = g.status==='STATUS_IN_PROGRESS' || (g.home?.score > 0 && g.status!=='STATUS_FINAL');
                        return (
                          <button key={i} onClick={()=>{
                            // Met à jour le state de /carte AVANT de naviguer → navigate(-1) restaurera returnCountry
                            navigate(location.pathname+location.search, { replace:true, state:{ returnCountry: country } });
                            setTimeout(()=>navigate(isFootball?`/football/${g.id}`:`/basketball/${g.id}${lp}`), 0);
                          }}
                            style={{width:'100%',background:'none',border:'none',borderTop:i>0?'1px solid rgba(255,255,255,0.04)':'none',padding:'0.65rem 0.5rem',cursor:'pointer',textAlign:'center',transition:'background .15s'}}
                            onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.04)';_prefetchMatch(g,league);}}
                            onMouseLeave={e=>e.currentTarget.style.background='none'}>
                            <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',alignItems:'center',gap:8,marginBottom:3}}>
                              <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:6,minWidth:0}}>
                                <span style={{fontSize:12,fontWeight:700,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{g.home?.name||g.home?.short}</span>
                                {g.home?.logo&&<img src={g.home.logo} alt="" width={20} height={20} style={{objectFit:'contain',borderRadius:'50%',flexShrink:0}} onError={e=>e.target.style.display='none'}/>}
                              </div>
                              <div style={{flexShrink:0}}>
                                {live&&g.home?.score!=null
                                  ? <span style={{fontSize:13,fontWeight:800,color:'#60a5fa',fontFamily:'monospace',whiteSpace:'nowrap'}}>{g.home.score} – {g.away.score}</span>
                                  : <span style={{fontSize:10,color:'rgba(255,255,255,0.25)',whiteSpace:'nowrap'}}>vs</span>
                                }
                              </div>
                              <div style={{display:'flex',alignItems:'center',justifyContent:'flex-start',gap:6,minWidth:0}}>
                                {g.away?.logo&&<img src={g.away.logo} alt="" width={20} height={20} style={{objectFit:'contain',borderRadius:'50%',flexShrink:0}} onError={e=>e.target.style.display='none'}/>}
                                <span style={{fontSize:12,fontWeight:700,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{g.away?.name||g.away?.short}</span>
                              </div>
                            </div>
                            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                              {live
                                ? <span style={{fontSize:8,color:'#60a5fa',fontFamily:'monospace',fontWeight:800}}>● EN COURS</span>
                                : <>
                                    {g.round&&<span style={{fontSize:9,color:'rgba(255,255,255,0.3)',fontStyle:'italic'}}>{g.round}</span>}
                                    <span style={{fontSize:9,color:'rgba(255,255,255,0.4)'}}>{new Date(g.date).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span>
                                  </>
                              }
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ));
                })()
              ) : (
                done.length === 0 ? (
                  <p style={{fontSize:11,color:'rgba(251,146,60,0.18)',fontFamily:'monospace',margin:0,paddingLeft:13}}>Aucun match terminé récemment</p>
                ) : done.map((g,i)=>{
                  const lp2=league==='wnba'?'?league=wnba':['nba'].includes(league)?'':`?league=${league}`;
                  return(
                    <button key={i} onClick={()=>{
                      navigate(location.pathname+location.search, { replace:true, state:{ returnCountry: country } });
                      setTimeout(()=>navigate(isFootball?`/football/${g.id}`:`/basketball/${g.id}${lp2}`), 0);
                    }}
                      style={{width:'100%',background:'none',border:'none',borderTop:i>0?'1px solid rgba(255,255,255,0.04)':'none',padding:'0.55rem 0.5rem',cursor:'pointer',textAlign:'center',transition:'background .15s',opacity:0.6}}
                      onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.04)';e.currentTarget.style.opacity='1';_prefetchMatch(g,league);}}
                      onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.opacity='0.6';}}>
                      {(() => {
                        const hs = g.home?.score, as = g.away?.score;
                        const homeWon = hs != null && as != null && hs > as;
                        const awayWon = hs != null && as != null && as > hs;
                        const WIN = '#2d8a2d', DIM = 'rgba(255,255,255,0.35)';
                        return (
                          <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',alignItems:'center',gap:7,marginBottom:2}}>
                            <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:5,minWidth:0}}>
                              <span style={{fontSize:11,fontWeight:homeWon?700:500,color:homeWon?'#fff':'rgba(255,255,255,0.55)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{g.home?.name||g.home?.short}</span>
                              {g.home?.logo&&<img src={g.home.logo} alt="" width={16} height={16} style={{objectFit:'contain',borderRadius:'50%',flexShrink:0}} onError={e=>e.target.style.display='none'}/>}
                            </div>
                            <div style={{flexShrink:0,display:'flex',alignItems:'center',gap:5}}>
                              {hs!=null&&<>
                                <span style={{fontSize:13,fontWeight:800,color:homeWon?WIN:DIM,fontFamily:'monospace'}}>{hs}</span>
                                <span style={{fontSize:10,color:'rgba(255,255,255,0.2)'}}>–</span>
                                <span style={{fontSize:13,fontWeight:800,color:awayWon?WIN:DIM,fontFamily:'monospace'}}>{as}</span>
                              </>}
                            </div>
                            <div style={{display:'flex',alignItems:'center',justifyContent:'flex-start',gap:5,minWidth:0}}>
                              {g.away?.logo&&<img src={g.away.logo} alt="" width={16} height={16} style={{objectFit:'contain',borderRadius:'50%',flexShrink:0}} onError={e=>e.target.style.display='none'}/>}
                              <span style={{fontSize:11,fontWeight:awayWon?700:500,color:awayWon?'#fff':'rgba(255,255,255,0.55)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{g.away?.name||g.away?.short}</span>
                            </div>
                          </div>
                        );
                      })()}
                      {g.round&&<div style={{fontSize:9,color:'rgba(255,255,255,0.25)',textAlign:'center'}}>{g.round}</div>}
                    </button>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function useTodayCount() {
  const [counts, setCounts] = useState(null);
  useEffect(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const tom   = new Date(today); tom.setDate(tom.getDate()+1);
    const inRange = g => { const t=new Date(g.date).getTime(); return g.status!=='STATUS_FINAL'&&t>=today.getTime()&&t<tom.getTime(); };
    Promise.all([
      cachedFetch('/api/nba/scoreboard', 20_000).catch(()=>({games:[]})),
      cachedFetch('/api/wnba/scoreboard', 20_000).catch(()=>({games:[]})),
      ...['acb','lnb','bbl','legaa'].map(l=>cachedFetch(`/api/euro/${l}/scoreboard`, 20_000).catch(()=>({games:[]}))),
      cachedFetch('/api/fd/matches', 30_000).catch(()=>({matches:[]})),
    ]).then(([nba,wnba,...rest]) => {
      const foot = rest.pop();
      const basket = [nba,wnba,...rest].flatMap(d=>d.games||[]).filter(inRange).length;
      const football = (foot.matches||[]).filter(g=>{
        const t=new Date(g.utcDate||g.date).getTime();
        return t>=today.getTime()&&t<tom.getTime();
      }).length;
      setCounts({ basket, football, total: basket + football });
    });
  }, []);
  return counts;
}

export default function WorldMapPage() {
  const [selected,      setSelected]      = useState(null);
  const [selectedGeoId, setSelectedGeoId] = useState(null);
  const [hovered,  setHovered]  = useState(null);
  const [tooltip,  setTooltip]  = useState(null);
  const [statsLeague, setStatsLeague] = useState(null);
  const [prefetch,    setPrefetch]    = useState({}); // { nba: {standData, cats}, wnba: {standData, cats} }

  const STATS_LEAGUES = new Set(['nba', 'wnba', 'acb']);
  const statsBase = l => l === 'nba' ? '/api/nba' : l === 'wnba' ? '/api/wnba' : '/api/acb';
  const scoreboardUrl = l => l === 'wnba' ? '/api/wnba/scoreboard' : l === 'acb' ? '/api/euro/acb/scoreboard' : '/api/nba/scoreboard';

  // Pré-fetch standings + leaders dès qu'un pays avec basket est sélectionné
  useEffect(() => {
    if (!selected) return;
    const leagues = selected.leagues.filter(l => STATS_LEAGUES.has(l));
    leagues.forEach(l => {
      const base = statsBase(l);
      Promise.all([
        cachedFetch(`${base}/standings`, 6 * 3600_000),
        cachedFetch(`${base}/leaders`,   6 * 3600_000),
      ]).then(([standData, cats]) => {
        setPrefetch(p => ({ ...p, [l]: { standData, cats } }));
      }).catch(() => {});
    });
  }, [selected]);

  // Le panneau classement/leaders ne s'ouvre plus automatiquement à l'ouverture d'un pays qui a
  // aussi du football — il ne s'affiche que sur clic explicite de l'icône 🏀 (cf.
  // openBestBasketLeague, appelée depuis Panel). Sans ça, les stats ACB apparaissaient même quand
  // l'onglet Football était affiché en premier (France/Espagne/Allemagne/Italie, depuis le
  // rebranchement football-data.org du 12 juillet). Mais pour un pays 100% basket (États-Unis),
  // il n'y a aucune ambiguïté de sport à lever — s'ouvre directement, pas la peine de cliquer.
  useEffect(() => {
    if (!selected) { setStatsLeague(null); setPrefetch({}); return; }
    const hasFootball = selected.leagues.some(l => FOOTBALL_LEAGUES.has(l));
    if (hasFootball) setStatsLeague(null);
    else openBestBasketLeague(selected);
  }, [selected]);

  // Ouvre la ligue basket la plus active du pays sélectionné — plusieurs ligues basket possibles
  // seulement pour les États-Unis (NBA/WNBA), une seule pour les autres pays couverts.
  const openBestBasketLeague = (country) => {
    const leagues = country.leagues.filter(l => STATS_LEAGUES.has(l));
    if (!leagues.length) { setStatsLeague(null); return; }
    if (leagues.length === 1) { setStatsLeague(leagues[0]); return; }

    const NOW = Date.now();
    Promise.all(leagues.map(async l => {
      try {
        const d = await cachedFetch(scoreboardUrl(l), 30_000);
        const hasActive = (d.games || []).some(g =>
          g.status !== 'STATUS_FINAL' || NOW - new Date(g.date).getTime() < 48 * 3600_000
        );
        return { l, hasActive };
      } catch { return { l, hasActive: false }; }
    })).then(results => {
      const active = results.find(r => r.hasActive);
      setStatsLeague(active ? active.l : leagues[0]);
    });
  };

  // Position approximative de chaque pays sur la map (transform-origin pour le zoom)
  const ZOOM_ORIGIN = {
    '840': '18% 33%',   // États-Unis
    '250': '50% 28%',   // France
    '724': '47% 32%',   // Espagne
    '276': '52% 26%',   // Allemagne
    '380': '53% 31%',   // Italie
    '826': '48% 23%',   // Angleterre
  };
  const todayCount = useTodayCount();
  const [matchOpen, setMatchOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const showScan = location.state?.fromNav === true;
  const returnCountry = location.state?.returnCountry ?? null;

  // Consomme le state fromNav dès qu'il arrive — retour arrière ne rejoue pas la barre
  useEffect(() => {
    if (showScan) {
      navigate(location.pathname + location.search, { replace: true, state: returnCountry ? { returnCountry } : {} });
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restaure le pays sélectionné au retour arrière depuis un match
  const returnHandled = useRef(false);
  const ignoreClicks = useRef(false);
  useEffect(() => {
    if (returnCountry && !returnHandled.current) {
      returnHandled.current = true;
      ignoreClicks.current = true;
      setSelected(returnCountry);
      const geoId = Object.entries(COVERED).find(([, c]) => c === returnCountry)?.[0] ?? null;
      setSelectedGeoId(geoId);
      // Ignore les clics pendant 600ms (geste trackpad Mac déclenche un clic parasite)
      setTimeout(() => { ignoreClicks.current = false; }, 600);
    }
    if (!returnCountry) returnHandled.current = false;
  }, [returnCountry]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeAll = () => { setSelected(null); setSelectedGeoId(null); setStatsLeague(null); };

  return (
    <div
      onClick={() => { if (statsLeague && !ignoreClicks.current) closeAll(); }}
      style={{position:'fixed',top:0,left:200,right:0,bottom:0,overflow:'hidden',background:'transparent'}}
    >
      <style>{`
        @keyframes panelIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes mapGlide{from{transform:translateX(0)}to{transform:translateX(-180px)}}
        @keyframes fadeCountry{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes scanLine{0%{top:-2px;opacity:1}90%{opacity:0.8}100%{top:100%;opacity:0;visibility:hidden}}
        @keyframes dotBlink{0%,100%{opacity:1;box-shadow:0 0 6px #60a5fa}50%{opacity:0.2;box-shadow:none}}
        @keyframes mapReveal{
          0%   { opacity: 0; transform: scale(0.96); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes uiReveal{
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes mapRing{
          0%  { opacity: 0.9; transform: scale(0.02); }
          60% { opacity: 0.6; transform: scale(1.2); }
          100%{ opacity: 0;   transform: scale(2.0); }
        }
      `}</style>

      {/* Mention "Matchs à venir" — même format/position que le titre "Carte championnats"
          (Base de données) : texte gras blanc en haut à gauche, plus un bouton/pill. */}
      {todayCount !== null && (
        <div style={{ position:'absolute', top:20, left:24, zIndex:10, animation:'mapReveal 0.8s ease-out 0.2s both' }}>
          <div onClick={()=>setMatchOpen(o=>!o)} style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', width:'fit-content' }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#60a5fa', flexShrink:0, animation: todayCount.total > 0 ? 'dotBlink 1.4s ease-in-out infinite' : 'none' }}/>
            <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>Matchs à venir</span>
          </div>

          {matchOpen && (
            <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, background:'rgba(0,5,18,0.95)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'8px 12px', boxShadow:'0 6px 20px rgba(0,0,0,0.6)', animation:'fadeCountry .15s ease-out', display:'flex', flexDirection:'column', gap:5 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:20 }}>
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ fontSize:12 }}>🏀</span>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)' }}>Basket</span>
                </div>
                <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{todayCount.basket}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:20 }}>
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ fontSize:12 }}>⚽</span>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)' }}>Football</span>
                </div>
                <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{todayCount.football}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scan line — 4s au chargement */}
      {showScan && <div style={{ position:'absolute', left:0, right:0, height:2, background:'linear-gradient(90deg,transparent,rgba(96,165,250,0.8),rgba(147,197,253,0.9),rgba(96,165,250,0.8),transparent)', animation:'scanLine 2s ease-in forwards', zIndex:20, pointerEvents:'none' }}/>}

      {/* Ligne horizontale déco haut/bas */}
      <div style={{position:'absolute',top:'12%',left:0,right:0,height:'1px',background:'linear-gradient(90deg,transparent,rgba(251,146,60,0.06),transparent)',pointerEvents:'none'}}/>
      <div style={{position:'absolute',bottom:'12%',left:0,right:0,height:'1px',background:'linear-gradient(90deg,transparent,rgba(251,146,60,0.06),transparent)',pointerEvents:'none'}}/>

      {/* Map */}
      <div
        onClick={() => { if (selected && !ignoreClicks.current) { setSelected(null); setSelectedGeoId(null); setStatsLeague(null); } }}
        style={{
        position:'absolute', inset:0,
        display:'flex', alignItems:'center', justifyContent:'center', paddingTop:'4vh',
        transition:'transform .55s cubic-bezier(.25,.46,.45,.94), transform-origin .55s, filter .8s ease',
        transform: selected ? `translateX(-180px) scale(1.55)` : 'translateX(0) scale(1)',
        filter: statsLeague ? 'blur(4px) brightness(0.5)' : 'none',
        transformOrigin: selectedGeoId && ZOOM_ORIGIN[selectedGeoId] ? ZOOM_ORIGIN[selectedGeoId] : '50% 50%',
      }}>
        <ComposableMap
          projectionConfig={{scale:195, center:[10,8]}}
          style={{width:'95%', height:'90%', animation:'mapReveal 0.8s ease-out both'}}
        >
          <Geographies geography={GEO_URL}>
            {({geographies})=>geographies.filter(g=>g.id!=='010').map(geo=>{
              const c = COVERED[geo.id];
              const isHov = hovered===geo.id;
              const isSel = selected===c;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onClick={(e)=>{e.stopPropagation();if(c){const desel=selected===c;setSelected(desel?null:c);setSelectedGeoId(desel?null:geo.id);setTooltip(null);}}}
                  onMouseEnter={e=>{if(c){setHovered(geo.id);setTooltip({name:c.name,flag:c.flag,x:e.clientX,y:e.clientY});_prefetchCountry(c);}}}
                  onMouseMove={e=>{if(c)setTooltip(t=>t?{...t,x:e.clientX,y:e.clientY}:null);}}
                  onMouseLeave={()=>{setHovered(null);setTooltip(null);}}
                  style={{
                    default:{
                      fill: 'rgba(15,45,90,0.3)',
                      stroke: c ? 'rgba(0,190,255,0.55)' : 'rgba(0,80,130,0.2)',
                      strokeWidth: c ? 0.6 : 0.2,
                      outline:'none',
                      cursor: c ? 'pointer' : 'default',
                    },
                    hover:{
                      fill: 'rgba(15,45,90,0.3)',
                      stroke: c ? 'rgba(0,190,255,0.55)' : 'rgba(0,80,130,0.2)',
                      strokeWidth: c ? 0.6 : 0.2,
                      outline:'none',
                      cursor: c ? 'pointer' : 'default',
                    },
                    pressed:{ outline:'none' },
                  }}
                />
              );
            })}
          </Geographies>
        </ComposableMap>
      </div>

      {/* Tooltip hover */}
      {tooltip && (
        <div style={{
          position:'fixed', left:tooltip.x+14, top:tooltip.y-36,
          background:'rgba(0,8,24,0.95)', border:'1px solid rgba(251,146,60,0.3)',
          borderRadius:6, padding:'5px 10px',
          fontSize:11, fontWeight:700, color:'#fff',
          pointerEvents:'none', zIndex:20,
          display:'flex', alignItems:'center', gap:6,
          boxShadow:'0 4px 20px rgba(0,0,0,0.5)',
          animation:'fadeCountry .1s ease-out',
        }}>
          <span>{tooltip.flag}</span>
          <span>{tooltip.name}</span>
        </div>
      )}

      {/* Légende bas gauche */}
      <div style={{ position:'absolute', bottom:24, left:24, display:'flex', alignItems:'center', gap:8, zIndex:8, pointerEvents:'none', animation:'mapReveal 0.8s ease-out 0.2s both' }}>
        <div style={{ display:'flex', alignItems:'center', gap:4, pointerEvents:'auto' }}>
          {[...Object.values(COVERED), MONDE].map((c, i) => (
            <button key={i} onClick={() => { const desel=c===selected; setSelected(desel?null:c); if(desel) setStatsLeague(null); }} title={c.leagues.map(l => LEAGUE_META[l]).join(' · ')}
              style={{ display:'flex', alignItems:'center', gap:4, background:'none', border:'none', borderRadius:6, padding:'2px 6px', cursor:'pointer', transition:'opacity .15s', opacity: selected===c ? 1 : 0.55 }}
              onMouseEnter={e => { e.currentTarget.style.opacity='1'; _prefetchCountry(c); }}
              onMouseLeave={e => e.currentTarget.style.opacity = selected===c ? '1' : '0.55'}
            >
              <span style={{ fontSize:13 }}>{c.flag}</span>
              <span style={{ fontSize:10, fontWeight:600, color:'#fff', whiteSpace:'nowrap' }}>{c.name}</span>
            </button>
          ))}
        </div>
      </div>


      {/* Panel */}
      {selected && <Panel country={selected} onClose={()=>{setSelected(null);setSelectedGeoId(null);setStatsLeague(null);}} statsLeague={statsLeague} setStatsLeague={setStatsLeague} onOpenBasketStats={openBestBasketLeague}/>}

      {/* StatsOverlay — rendu ici (hors Panel) pour que position:fixed soit relatif au viewport */}
      {statsLeague && <StatsOverlay league={statsLeague} onClose={() => setStatsLeague(null)} standData={prefetch[statsLeague]?.standData || null} cats={prefetch[statsLeague]?.cats || null} />}
    </div>
  );
}
