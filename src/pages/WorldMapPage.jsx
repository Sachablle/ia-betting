import { useState, useEffect, useRef } from 'react';
import { ComposableMap, Geographies, Geography, Graticule } from 'react-simple-maps';
import { useNavigate, useLocation } from 'react-router-dom';
import { cachedFetch, invalidateCache } from '../utils/fetchCache';

import GEO_DATA from 'world-atlas/countries-110m.json';
const GEO_URL = GEO_DATA;

// Ordre du tableau `leagues` = ordre d'affichage/sport par défaut (cf. _firstSport plus bas) —
// football en premier partout sauf États-Unis (pas de foot couvert là-bas, basket reste devant).
const COVERED = {
  // WNBA avant NBA (31 juillet 2026, demande explicite) — saison WNBA en cours, NBA hors-saison ;
  // à réinverser manuellement quand la NBA reprend et que la WNBA se termine (pas de détection
  // automatique de saison, même logique que _preferredBasketLeague dans Panel).
  '840': { name: 'États-Unis', flag: '🇺🇸', leagues: ['wnba','nba'] },
  '250': { name: 'France',     flag: '🇫🇷', leagues: ['ligue1','lnb'] },
  '724': { name: 'Espagne',    flag: '🇪🇸', leagues: ['laliga','acb'] },
  '276': { name: 'Allemagne',  flag: '🇩🇪', leagues: ['bundes','bbl'] },
  '380': { name: 'Italie',     flag: '🇮🇹', leagues: ['seriea','legaa'] },
  '826': { name: 'Angleterre', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', leagues: ['pl'] },
  '076': { name: 'Brésil',     flag: '🇧🇷', leagues: ['bresil'] },
  // Australie (NBL, 1er septembre 2026) — nouveau pays, pas de foot couvert ici (comme les USA).
  '036': { name: 'Australie',  flag: '🇦🇺', leagues: ['nbl'] },
  // Grèce (8 septembre 2026) — 1ère des nouvelles ligues foot, 100% api-football dès le départ.
  // 'gbl' (basket, 9 septembre 2026) ajoutée à l'image des championnats EU (ACB/BBL/Lega A) —
  // aucune cote bookmaker confirmée pour l'instant (voir EURO_LEAGUES.gbl côté backend), calendrier/
  // classement/effectifs déjà fonctionnels.
  '300': { name: 'Grèce',      flag: '🇬🇷', leagues: ['grece','gbl'] },
  '682': { name: 'Arabie Saoudite', flag: '🇸🇦', leagues: ['arabie'] },
  // Portugal (9 septembre 2026) — 3e nouvelle ligue foot, même patron 100% api-football.
  '620': { name: 'Portugal',   flag: '🇵🇹', leagues: ['portugal'] },
  // Pays-Bas/Belgique/Suisse/Norvège/Turquie (17 septembre 2026) — même patron 100% api-football,
  // isNewLeague actif (observation seule, pas d'alerte réelle) le temps d'accumuler du near-miss.
  '528': { name: 'Pays-Bas',   flag: '🇳🇱', leagues: ['paysbas'] },
  '056': { name: 'Belgique',   flag: '🇧🇪', leagues: ['belgique'] },
  '756': { name: 'Suisse',     flag: '🇨🇭', leagues: ['suisse'] },
  '578': { name: 'Norvège',    flag: '🇳🇴', leagues: ['norvege'] },
  '792': { name: 'Turquie',    flag: '🇹🇷', leagues: ['turquie'] },
};

const LEAGUE_META = {
  nba: 'NBA', wnba: 'WNBA', lnb: 'Betclic Élite',
  acb: 'ACB', bbl:  'BBL',  legaa: 'Lega A', nbl: 'NBL',
  ligue1: 'Ligue 1', laliga: 'La Liga', bundes: 'Bundesliga', seriea: 'Serie A', pl: 'Premier League',
  euroleague: 'EuroLeague', cdm: 'Coupe du Monde', bresil: 'Brasileirão',
  europa: 'Europa League', conference: 'Conference League', champions: 'Ligue des Champions',
  grece: 'Super League', arabie: 'Pro League', gbl: 'Basket League', portugal: 'Liga Betclic',
  paysbas: 'Eredivisie', belgique: 'Pro League', suisse: 'Super League', norvege: 'Eliteserien', turquie: 'Süper Lig',
};

// Coupes européennes de clubs (23 juillet 2026) — source api-football, /api/football/eucup/:comp/matches
const EU_CUP_LEAGUES = ['europa', 'conference', 'champions'];
const FOOTBALL_LEAGUES = new Set(['ligue1','laliga','bundes','seriea','pl','cdm','bresil','grece','arabie','portugal','paysbas','belgique','suisse','norvege','turquie', ...EU_CUP_LEAGUES]);
const sportOf = l => FOOTBALL_LEAGUES.has(l) ? 'football' : 'basket';

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
    } else if (l === 'cdm') {
      cachedFetch('/api/fd/worldcup', 30_000).catch(()=>{});
    } else if (EU_CUP_LEAGUES.includes(l)) {
      cachedFetch(`/api/football/eucup/${l}/matches`, 30_000).catch(()=>{});
    } else if (l === 'bresil') {
      cachedFetch('/api/fd/bresil', 30_000).catch(()=>{});
    } else if (l === 'grece') {
      cachedFetch('/api/football/grece', 30_000).catch(()=>{});
    } else if (l === 'arabie') {
      cachedFetch('/api/football/arabie', 30_000).catch(()=>{});
    } else if (l === 'portugal') {
      cachedFetch('/api/football/portugal', 30_000).catch(()=>{});
    } else if (l === 'paysbas') {
      cachedFetch('/api/football/paysbas', 30_000).catch(()=>{});
    } else if (l === 'belgique') {
      cachedFetch('/api/football/belgique', 30_000).catch(()=>{});
    } else if (l === 'suisse') {
      cachedFetch('/api/football/suisse', 30_000).catch(()=>{});
    } else if (l === 'norvege') {
      cachedFetch('/api/football/norvege', 30_000).catch(()=>{});
    } else if (l === 'turquie') {
      cachedFetch('/api/football/turquie', 30_000).catch(()=>{});
    } else if (l === 'euroleague') {
      cachedFetch('/api/euroleague/scoreboard', 20_000).catch(()=>{});
    } else if (FOOTBALL_LEAGUES.has(l)) {
      cachedFetch('/api/fd/matches', 30_000).catch(()=>{});
    } else {
      cachedFetch(`/api/euro/${l}/scoreboard`, 20_000).catch(()=>{});
    }
  }
}


// Ordre demandé le 23 juillet 2026 : LDC, Europa, Conference, EuroLeague.
// 'cdm' retirée de l'affichage le 23 juillet 2026 — Coupe du Monde 2026 terminée, prochaine édition
// en 2030. Le code CDM (backend + settlement + useFootballFixtures) reste intact, juste masquée ici
// (pas dans MONDE.leagues) — au cas où une vieille alerte CDM ait encore besoin d'être réglée, et
// pour ne pas devoir tout reconstruire si la catégorie doit revenir un jour.
const MONDE = { name: 'Monde', flag: '🌍', leagues: ['champions','europa','conference','euroleague'], isMonde: true };

// "Plus belles affiches" (23 juillet 2026, panneau Monde uniquement) — pas de classement/popularité
// disponible côté données, donc heuristique best-effort : repère un club connu par son nom dans une
// liste courte de clubs européens à forte notoriété/historique continental. Un match avec au moins
// un de ces clubs remonte en premier ; le reste suit par ordre chronologique. Approximatif par
// nature (liste non exhaustive), mais bien mieux qu'un tri purement chronologique pour mettre en
// avant les affiches qui comptent parmi des tours de qualification à faible enjeu par ailleurs.
const BIG_CLUB_PATTERN = /benfica|be[sş]ikta[sş]|anderlecht|paok|dynamo kyiv|dynamo kiev|ferencv|sporting|porto|ajax|feyenoord|celtic|rangers|galatasaray|fenerbahce|olympiacos|panathinaikos|shakhtar|red star|crvena zvezda|dinamo zagreb|slavia praha|sparta praha|salzburg|young boys|club brugge|club bruges|antwerp|besiktas|st\.?\s?gallen|midtjylland/i;
function isLiveGame(g) {
  return g.status === 'STATUS_IN_PROGRESS' || (g.home?.score > 0 && g.status !== 'STATUS_FINAL');
}
// Un match en cours remonte toujours en tête de liste, même hors panneau Monde (26 juillet 2026) —
// tri stable, ne touche pas l'ordre chronologique du reste.
function sortLiveFirst(games) {
  return [...games].sort((a, b) => (isLiveGame(b) ? 1 : 0) - (isLiveGame(a) ? 1 : 0));
}
function pickHighlightMatches(games, n) {
  // Un match en cours passe toujours devant, même sans club connu (26 juillet 2026) — avant ce fix,
  // le tri par notoriété de club pouvait laisser un match live derrière une affiche connue pas encore
  // jouée, alors qu'un match en direct est toujours le plus pertinent à montrer en premier.
  const withAppeal = games.map(g => ({ g, live: isLiveGame(g) ? 1 : 0, appeal: BIG_CLUB_PATTERN.test(`${g.home?.name || ''} ${g.away?.name || ''}`) ? 1 : 0 }));
  withAppeal.sort((a, b) => b.live - a.live || b.appeal - a.appeal || new Date(a.g.date) - new Date(b.g.date));
  return withAppeal.slice(0, n).map(x => x.g);
}

// Légende bas-gauche (23 juillet 2026) — 2 lignes : Monde/USA/Brésil, puis les 5 pays européens.
// Australie (NBL) ajoutée en 3e ligne le 1er septembre 2026.
const LEGEND_ROWS = [
  [MONDE, COVERED['840'], COVERED['076']],
  [COVERED['250'], COVERED['724'], COVERED['826'], COVERED['276'], COVERED['380']],
  [COVERED['036'], COVERED['300'], COVERED['682'], COVERED['620']],
  // Pays-Bas/Belgique/Suisse/Norvège/Turquie (17 septembre 2026) — 4e ligne.
  [COVERED['528'], COVERED['056'], COVERED['756'], COVERED['578'], COVERED['792']],
];

const STAT_CATS = [
  { key: 'pts', label: 'PTS', sub: 'Points / match',    color: '#60a5fa' },
  { key: 'reb', label: 'REB', sub: 'Rebonds / match',   color: '#4ade80' },
  { key: 'ast', label: 'AST', sub: 'Assists / match',   color: '#fb923c' },
  { key: 'tpm', label: '3PM', sub: '3 pts / match',     color: '#c084fc' },
];

// Buteurs/Passeurs (31 juillet 2026) — équivalent foot de STAT_CATS, 2 catégories au lieu de 4.
const FOOTBALL_CATS = [
  { key: 'buteurs',  label: 'BUTEURS',  sub: 'Buts / saison',   color: '#4ade80' },
  { key: 'passeurs', label: 'PASSEURS', sub: 'Passes / saison', color: '#60a5fa' },
];

// Championnats basket EU (31 juillet 2026) — même overlay Classement+leaders que NBA/WNBA/ACB,
// juste une source de données différente côté backend (/api/euro/:league/standings|leaders).
const EURO_BASKET_STATS_LEAGUES = ['lnb', 'bbl', 'legaa', 'nbl', 'gbl'];
// Foot (31 juillet 2026) — 5 grands championnats + Brasileirão seulement, pas les 3 coupes d'Europe
// (LDC/Europa/Conference n'ont pas de classement unique — groupes puis élimination directe, décision
// utilisateur explicite de ne pas leur donner cet overlay du tout).
const FOOTBALL_STATS_LEAGUES = ['ligue1', 'pl', 'laliga', 'bundes', 'seriea', 'bresil', 'grece', 'arabie', 'portugal', 'paysbas', 'belgique', 'suisse', 'norvege', 'turquie'];

function StatsOverlay({ league, onClose, standData, cats }) {
  const [standView, setStandView] = useState('ligue');

  const BASKET_STATS_LEAGUES = new Set(['nba', 'wnba', 'acb', ...EURO_BASKET_STATS_LEAGUES]);
  const isFootball = FOOTBALL_STATS_LEAGUES.includes(league);
  if (!isFootball && !BASKET_STATS_LEAGUES.has(league)) return null;
  const activeCats = isFootball ? FOOTBALL_CATS : STAT_CATS;
  const hasConferences = league === 'nba' || league === 'wnba';

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

  // Foot (31 juillet 2026) : J/V/N/D/PTS (classement classique) au lieu de V/D/.PCT/GB — pas de
  // notion de %victoires/games-behind en foot, mais un classement par points avec nuls.
  const StandTable = ({ teams }) => (
    <table style={{ width:'100%', borderCollapse:'collapse' }}>
      <thead>
        <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.06)', position:'sticky', top:0, background:'rgba(0,6,20,0.98)' }}>
          {(isFootball ? ['#','ÉQUIPE','J','V','N','D','PTS'] : ['#','ÉQUIPE','V','D','.PCT','GB']).map(h => (
            <th key={h} style={{ fontSize:8, fontWeight:700, color:'rgba(255,255,255,0.3)', fontFamily:'monospace', padding:'4px 6px', textAlign: h==='ÉQUIPE'?'left':'center', letterSpacing:'0.08em' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {teams.map((t, i) => (
          <tr key={t.id ?? t.abbr} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)', background: i%2===0?'rgba(255,255,255,0.01)':'none' }}>
            <td style={{ fontSize:9, color:'rgba(255,255,255,0.35)', padding:'4px 6px', textAlign:'center', fontFamily:'monospace' }}>{t.rank}</td>
            <td style={{ padding:'4px 6px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                {t.logo && <img src={t.logo} alt="" width={14} height={14} style={{ objectFit:'contain' }} onError={e=>e.target.style.display='none'}/>}
                <span style={{ fontSize:10, fontWeight:700, color:'#fff' }}>{t.abbr}</span>
              </div>
            </td>
            {isFootball ? (
              <>
                <td style={{ fontSize:10, color:'rgba(255,255,255,0.5)', textAlign:'center', padding:'4px 4px', fontFamily:'monospace' }}>{t.played}</td>
                <td style={{ fontSize:10, color:'#4ade80', fontWeight:700, textAlign:'center', padding:'4px 4px', fontFamily:'monospace' }}>{t.wins}</td>
                <td style={{ fontSize:10, color:'rgba(255,255,255,0.5)', textAlign:'center', padding:'4px 4px', fontFamily:'monospace' }}>{t.draws}</td>
                <td style={{ fontSize:10, color:'rgba(255,255,255,0.5)', textAlign:'center', padding:'4px 4px', fontFamily:'monospace' }}>{t.losses}</td>
                <td style={{ fontSize:10, color:'#fff', fontWeight:800, textAlign:'center', padding:'4px 4px', fontFamily:'monospace' }}>{t.points}</td>
              </>
            ) : (
              <>
                <td style={{ fontSize:10, color:'#4ade80', fontWeight:700, textAlign:'center', padding:'4px 4px', fontFamily:'monospace' }}>{t.wins}</td>
                <td style={{ fontSize:10, color:'rgba(255,255,255,0.5)', textAlign:'center', padding:'4px 4px', fontFamily:'monospace' }}>{t.losses}</td>
                <td style={{ fontSize:10, color:'rgba(255,255,255,0.7)', textAlign:'center', padding:'4px 4px', fontFamily:'monospace' }}>{t.pct != null ? t.pct.toFixed(3) : '—'}</td>
                <td style={{ fontSize:10, color:'rgba(255,255,255,0.4)', textAlign:'center', padding:'4px 4px', fontFamily:'monospace' }}>{t.gb != null && t.gb > 0 ? t.gb : '—'}</td>
              </>
            )}
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
          {hasConferences && <button style={btnToggle(standView==='conf')} onClick={()=>setStandView('conf')}>Conf.</button>}
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

      {/* Fenêtres stats — 4 (basket) ou 2 (foot, Buteurs/Passeurs), s'étendent jusqu'à la légende */}
      <div style={{ display:'grid', gridTemplateColumns:`repeat(${activeCats.length}, 1fr)`, gap:6, flex:1, minHeight:0 }}>
        {activeCats.map(({ key, label, sub, color }, ci) => (
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

function Panel({ country, onClose, statsLeague, setStatsLeague }) {
  const navigate = useNavigate();
  const [matches, setMatches] = useState({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState({}); // { [league]: 'upcoming' | 'done' } — bouton À venir / Terminés par championnat
  // Tous les championnats repliés par défaut à l'ouverture d'un pays — décision du 24 juillet 2026,
  // **revenue en arrière le 31 juillet 2026** (demande explicite) : la liste de matchs doit s'afficher
  // directement dépliée pour tous les pays, comme c'était déjà le cas pour les pays à un seul
  // championnat (Angleterre, Brésil) depuis plus tôt le 31 juillet. Le repli par jour (juste en
  // dessous, `openDays`) ajouté le même jour compense la densité que le dépliage systématique
  // rouvre — seul le jour le plus proche par championnat est visible sans clic supplémentaire.
  // Ne touche PAS `statsLeague` (overlay Classement/leaders basket, plus bas) qui reste gated sur un
  // clic explicite — un overlay plein écran qui s'ouvrirait tout seul serait trop intrusif.
  const _allLeaguesOpen = Object.fromEntries(country.leagues.map(l => [l, true]));
  const [openLeagues, setOpenLeagues] = useState(_allLeaguesOpen);
  // Repli par jour (31 juillet 2026, demande explicite) — dans la liste de matchs d'un championnat
  // déplié, seul le jour le plus proche s'affiche ouvert par défaut ; les jours suivants sont repliés
  // sous leur séparateur de date (clic pour dérouler). Clé `${league}::${dateLabel}`, ouverture par
  // défaut décidée par l'ordre d'apparition (1er jour rencontré = le plus proche, les matchs arrivent
  // déjà triés chronologiquement) plutôt qu'une comparaison de date en dur.
  const [openDays, setOpenDays] = useState({});
  // Bouton "recharger" manuel (1er septembre 2026, demande explicite) — force un refetch immédiat
  // au lieu d'attendre le prochain cycle de 60s, pour un match en direct dont l'affichage semble en
  // retard. Incrémenter refreshNonce relance l'effet de chargement ci-dessous (même chemin que le
  // montage initial), après invalidation des caches concernés côté frontend ET du cache 30s côté
  // backend (_liveStatusCache, /api/football/live-refresh).
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // true seulement pour le déclenchement du bouton manuel — évite de replaquer l'écran "CHARGEMENT..."
  // (prévu pour le tout 1er montage/changement de pays) sur un simple refresh de quelques matchs déjà affichés.
  const isManualRefreshRef = useRef(false);
  // Fix 17 septembre 2026 — filet contre "aucun match" affiché à tort malgré de vrais matchs à venir.
  // Avant ce fix, une seule ligue en échec réseau transitoire (timeout 5s de cachedFetch, cf.
  // fetchCache.js) sur un cycle de 60s faisait retomber son panneau sur {soon:[],upcoming:[],done:[]}
  // — cachedFetch garde pourtant les bonnes données en interne, mais le `.then()` qui les
  // consommerait n'est jamais atteint puisque la promesse est rejetée. Persiste le dernier split
  // réussi par ligue (indépendant du pays affiché — une clé de ligue est globalement unique) pour
  // que le panneau reste sur la dernière vraie donnée connue plutôt que de se vider, jusqu'au
  // prochain cycle réussi (60s).
  const lastGoodMatchesRef = useRef({});
  const _hasFootball = country.leagues.some(l => sportOf(l) === 'football');
  const _hasBasket   = country.leagues.some(l => sportOf(l) === 'basket');
  // Par défaut : sport de la première ligue du pays (acb avant laliga → basket ; cdm avant euroleague
  // → football).
  const _firstSport = sportOf(country.leagues[0]);
  const _sportsPresent = [_hasFootball && 'football', _hasBasket && 'basket'].filter(Boolean);
  const [sportFilter, setSportFilter] = useState(_sportsPresent.length > 1 ? _firstSport : _sportsPresent[0] || null);
  // Ligue basket à ouvrir automatiquement dans l'overlay Classement/leaders (31 juillet 2026, demande
  // explicite) quand l'onglet Basket devient actif — WNBA privilégiée sur NBA tant que la NBA est
  // hors-saison (préférence en dur, pas de détection automatique de saison : l'utilisateur redemandera
  // explicitement le switch vers NBA quand la WNBA se terminera). Pays à une seule ligue basket
  // (ACB/LNB/BBL/Lega A) : cette ligue-là, pas d'ambiguïté.
  const _basketLeagues = country.leagues.filter(l => sportOf(l) === 'basket');
  const _preferredBasketLeague = _basketLeagues.includes('wnba') ? 'wnba' : (_basketLeagues[0] || null);
  // Même principe côté foot (31 juillet 2026) — un seul championnat domestique éligible par pays
  // (les 3 coupes d'Europe, sous "Monde", ne sont jamais dans FOOTBALL_STATS_LEAGUES donc jamais
  // sélectionnées ici, cohérent avec la décision de ne pas leur donner cet overlay).
  const _footballLeagues = country.leagues.filter(l => FOOTBALL_STATS_LEAGUES.includes(l));
  const _preferredFootballLeague = _footballLeagues[0] || null;
  const _preferredStatsLeague = sport => sport === 'basket' ? _preferredBasketLeague : sport === 'football' ? _preferredFootballLeague : null;

  // Le panneau n'est pas remonté quand on change de pays sans le fermer (pas de `key` côté parent) —
  // sportFilter restait donc bloqué sur le sport du pays précédent (ex: basket vu sur États-Unis
  // puis clic direct sur Espagne → ACB au lieu de La Liga). Réinitialise explicitement au sport par
  // défaut du nouveau pays à chaque changement (26 juillet 2026).
  useEffect(() => {
    const nextSport = _sportsPresent.length > 1 ? _firstSport : _sportsPresent[0] || null;
    setSportFilter(nextSport);
    setOpenLeagues(_allLeaguesOpen);
    setOpenDays({});
    setStatsLeague(_preferredStatsLeague(nextSport));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country?.name]);

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
        // Plus de plafond à 8 (10-11 septembre 2026, demande explicite) — safe pour la plupart des
        // championnats (1 match/jour en général), mais coupait la liste des coupes d'Europe (format
        // ligue unique à 36 équipes, une journée peut avoir bien plus de 8 matchs le même soir) : la
        // Ligue des Champions n'affichait que les 8 premiers résultats de sa J1, le reste invisible
        // malgré la fenêtre de 48h qui les couvrait déjà. La fenêtre KEEP_MS (48h) reste le seul
        // garde-fou contre une liste illimitée.
        done:     games.filter(g=>g.status==='STATUS_FINAL'&&Date.now()-new Date(g.date).getTime()<KEEP_MS),
      });
      if (l === 'nba')  return cachedFetch('/api/nba/scoreboard', 20_000).then(d=>{const s=splitGames(d.games||[]);return{l,...s};});
      if (l === 'wnba') return cachedFetch('/api/wnba/scoreboard', 20_000).then(d=>{const s=splitGames(d.games||[]);return{l,...s};});
      if (l === 'euroleague') return cachedFetch('/api/euroleague/scoreboard', 20_000).then(d=>{const s=splitGames(d.games||[]);return{l,...s};});
      // 5 grands championnats — football-data.org (même source/même id `fd_<id>` que MatchDetailPage
      // via useFootballFixtures, cf. src/utils/useFootballFixtures.js). /api/fd/results (16 août 2026,
      // jusque-là utilisé uniquement pour le règlement des alertes) apporte les scores finaux —
      // fusionnés ici pour que l'onglet "Terminés" ne reste plus vide pour ces 5 ligues comme avant.
      // Fix 29 août 2026 : /api/fd/matches renvoie désormais aussi les matchs récemment terminés
      // (fix "Match introuvable" sur la fiche match) — `f.status !== 'STATUS_FINAL'` exclut ces
      // entrées ici pour ne pas les compter deux fois (déjà couvertes par `dr.matches` ci-dessous) ni
      // les afficher à tort dans l'onglet "À venir" (le hardcode `status:'STATUS_SCHEDULED'`
      // précédent ignorait le vrai statut renvoyé par le backend).
      if (FOOTBALL_LEAGUES.has(l) && l !== 'cdm' && l !== 'bresil' && l !== 'grece' && l !== 'arabie' && l !== 'portugal' && l !== 'paysbas' && l !== 'belgique' && l !== 'suisse' && l !== 'norvege' && l !== 'turquie' && !EU_CUP_LEAGUES.includes(l)) return Promise.all([
        cachedFetch('/api/fd/matches', 30_000),
        cachedFetch('/api/fd/results', 30_000),
      ]).then(([dm, dr])=>{
        // Fix 30 août 2026 — /api/fd/matches peut rester périmé plus longtemps que son cache 30min
        // (429 répétés côté football-data.org qui bloquent le rafraîchissement), au point de garder
        // un match en "STATUS_SCHEDULED" alors qu'il a été joué il y a 2 jours et que /api/fd/results
        // (source séparée, plus fraîche) a déjà le vrai résultat — cas réel signalé : AC Milan-Venezia
        // affiché à la fois dans "À venir" ET "Terminés". /api/fd/results fait foi dès qu'il connaît
        // déjà l'id, quel que soit le statut (même périmé) renvoyé par /api/fd/matches.
        const freshIds = new Set((dr.matches||[]).filter(f=>f.league===l).map(f=>String(f.id)));
        // Fix 31 août 2026 — cas plus grave que le précédent : un match dont le coup d'envoi côté
        // football-data.org est parfois RÉELLEMENT resté bloqué sur TIMED/SCHEDULED des heures après
        // l'heure prévue (vérifié en direct sur leur API brute — Celta Vigo-Athletic Club, coup
        // d'envoi 19h30, encore "TIMED" à 1h du matin) — jamais transitionné vers IN_PLAY, donc
        // absent aussi de /api/fd/results (freshIds ne le voit jamais). Sans donnée fraîche possible,
        // on arrête au moins d'afficher un coup d'envoi manifestement dépassé comme "à venir" — plus
        // honnête de le retirer que de laisser un horaire qui ment silencieusement depuis des heures.
        const STALE_KICKOFF_MS = 4 * 3600_000;
        const scheduled=(dm.matches||[]).filter(f=>f.league===l && f.status!=='STATUS_FINAL' && !freshIds.has(String(f.id)) && (Date.now() - new Date(f.date).getTime()) < STALE_KICKOFF_MS).map(f=>({
          id:`fd_${f.id}`,date:f.date,status:f.status||'STATUS_SCHEDULED',round:f.round,
          // score (3 septembre 2026) — avant la migration, /api/fd/matches ne renvoyait JAMAIS de
          // match en direct (filtré ?status=SCHEDULED côté football-data.org), donc score:null en dur
          // était toujours correct ici. Depuis la migration api-football, cette route renvoie aussi
          // les matchs en cours avec leur vrai score — le hardcode n'avait jamais été retiré, un
          // match "EN COURS" affichait donc le badge mais jamais le score (cas réel : Real Sociedad-
          // Celta 0-0 affiché sans score, alors que la donnée était déjà disponible).
          // elapsed (9 septembre 2026) — le backend le renvoie déjà depuis le 8 septembre, jamais
          // recopié ici : la minute live n'a donc jamais atteint le panneau Monde pour AUCUN
          // championnat malgré le badge "63'" déjà codé côté rendu (fallback "EN COURS" systématique).
          elapsed:f.elapsed ?? null,
          home:{name:f.home?.name,short:f.home?.short,logo:f.home?.logoId,score:f.home?.score ?? null},
          away:{name:f.away?.name,short:f.away?.short,logo:f.away?.logoId,score:f.away?.score ?? null},
        }));
        const finished=(dr.matches||[]).filter(f=>f.league===l).map(f=>({
          id:`fd_${f.id}`,date:f.date,status:f.status,round:f.round,elapsed:f.elapsed ?? null,
          home:{name:f.home?.name,short:f.home?.short,logo:f.home?.logo,score:f.home?.score},
          away:{name:f.away?.name,short:f.away?.short,logo:f.away?.logo,score:f.away?.score},
        }));
        return{l,...splitGames([...scheduled, ...finished])};
      });
      if (l === 'cdm') return cachedFetch('/api/fd/worldcup', 30_000).then(d => {
        const games = (d.games || []).map(g => ({ ...g, id: `fdcdm_${g.id}` }));
        return {l, ...splitGames(games)};
      });
      // Coupes européennes de clubs (23 juillet 2026) — source api-football, mêmes préfixes que
      // generateBackgroundAlerts (server.js) pour que fixtureId corresponde partout (snapshot inclus).
      if (EU_CUP_LEAGUES.includes(l)) return cachedFetch(`/api/football/eucup/${l}/matches`, 30_000).then(d => {
        const prefix = { europa: 'afel', conference: 'afcl', champions: 'afch' }[l];
        const games = (d.matches || []).map(m => ({
          id: `${prefix}_${m.id}`, date: m.date, status: m.status, round: m.round, elapsed: m.elapsed ?? null,
          home: { name: m.home?.name, short: m.home?.short, logo: m.home?.logoId, score: m.home?.score ?? null },
          away: { name: m.away?.name, short: m.away?.short, logo: m.away?.logoId, score: m.away?.score ?? null },
        }));
        return {l, ...splitGames(games)};
      });
      // Brasileirão (17 juillet 2026) — source isolée /api/fd/bresil, même prefixe fdbr_ que
      // generateBackgroundAlerts (server.js) pour que fixtureId corresponde partout.
      if (l === 'bresil') return cachedFetch('/api/fd/bresil', 30_000).then(d => {
        // Fix 31 août 2026 — même garde-fou que les 5 grands championnats ci-dessus (voir
        // STALE_KICKOFF_MS) : un match resté bloqué en STATUS_SCHEDULED des heures après son coup
        // d'envoi (football-data.org ne transitionne jamais vers IN_PLAY) restait affiché "à venir"
        // indéfiniment — jamais branché ici lors du fix du 31 août sur les 5 ligues, oublié pour le
        // Brésil. Pas besoin du croisement freshIds des 5 ligues : /api/fd/bresil renvoie déjà
        // scheduled ET finished dans le même appel (contrairement à /api/fd/matches qui exclut les
        // terminés), donc pas de 2e source à croiser pour distinguer "vraiment pas encore joué" de
        // "bloqué côté football-data.org". Cas réel : Grêmio-Chapecoense, Mirassol-Palmeiras,
        // coup d'envoi dépassé de 17h, toujours "à venir".
        const STALE_KICKOFF_MS = 4 * 3600_000;
        const all=(d.matches||[])
          .filter(f => f.status === 'STATUS_FINAL' || (Date.now() - new Date(f.date).getTime()) < STALE_KICKOFF_MS)
          .map(f=>({
          id:`fdbr_${f.id}`,date:f.date,status:f.status||'STATUS_SCHEDULED',round:f.round,elapsed:f.elapsed ?? null,
          home:{name:f.home?.name,short:f.home?.short,logo:f.home?.logoId,score:f.home?.score ?? null},
          away:{name:f.away?.name,short:f.away?.short,logo:f.away?.logoId,score:f.away?.score ?? null},
        }));
        return{l,...splitGames(all)};
      });
      // Grèce Super League (8 septembre 2026) — même patron que Brasileirão ci-dessus (source isolée
      // /api/football/grece, jamais passée par football-data.org, préfixe grc_).
      if (l === 'grece') return cachedFetch('/api/football/grece', 30_000).then(d => {
        const STALE_KICKOFF_MS = 4 * 3600_000;
        const all=(d.matches||[])
          .filter(f => f.status === 'STATUS_FINAL' || (Date.now() - new Date(f.date).getTime()) < STALE_KICKOFF_MS)
          .map(f=>({
          id:`grc_${f.id}`,date:f.date,status:f.status||'STATUS_SCHEDULED',round:f.round,elapsed:f.elapsed ?? null,
          home:{name:f.home?.name,short:f.home?.short,logo:f.home?.logoId,score:f.home?.score ?? null},
          away:{name:f.away?.name,short:f.away?.short,logo:f.away?.logoId,score:f.away?.score ?? null},
        }));
        return{l,...splitGames(all)};
      });
      // Arabie Saoudite Pro League (8 septembre 2026) — même patron que la Grèce ci-dessus.
      if (l === 'arabie') return cachedFetch('/api/football/arabie', 30_000).then(d => {
        const STALE_KICKOFF_MS = 4 * 3600_000;
        const all=(d.matches||[])
          .filter(f => f.status === 'STATUS_FINAL' || (Date.now() - new Date(f.date).getTime()) < STALE_KICKOFF_MS)
          .map(f=>({
          id:`arb_${f.id}`,date:f.date,status:f.status||'STATUS_SCHEDULED',round:f.round,elapsed:f.elapsed ?? null,
          home:{name:f.home?.name,short:f.home?.short,logo:f.home?.logoId,score:f.home?.score ?? null},
          away:{name:f.away?.name,short:f.away?.short,logo:f.away?.logoId,score:f.away?.score ?? null},
        }));
        return{l,...splitGames(all)};
      });
      // Portugal Primeira Liga (9 septembre 2026) — même patron que la Grèce/l'Arabie ci-dessus.
      if (l === 'portugal') return cachedFetch('/api/football/portugal', 30_000).then(d => {
        const STALE_KICKOFF_MS = 4 * 3600_000;
        const all=(d.matches||[])
          .filter(f => f.status === 'STATUS_FINAL' || (Date.now() - new Date(f.date).getTime()) < STALE_KICKOFF_MS)
          .map(f=>({
          id:`por_${f.id}`,date:f.date,status:f.status||'STATUS_SCHEDULED',round:f.round,elapsed:f.elapsed ?? null,
          home:{name:f.home?.name,short:f.home?.short,logo:f.home?.logoId,score:f.home?.score ?? null},
          away:{name:f.away?.name,short:f.away?.short,logo:f.away?.logoId,score:f.away?.score ?? null},
        }));
        return{l,...splitGames(all)};
      });
      // Pays-Bas/Belgique/Suisse/Norvège/Turquie (17 septembre 2026) — même patron que Grèce/Arabie/
      // Portugal ci-dessus.
      if (l === 'paysbas') return cachedFetch('/api/football/paysbas', 30_000).then(d => {
        const STALE_KICKOFF_MS = 4 * 3600_000;
        const all=(d.matches||[])
          .filter(f => f.status === 'STATUS_FINAL' || (Date.now() - new Date(f.date).getTime()) < STALE_KICKOFF_MS)
          .map(f=>({
          id:`nl_${f.id}`,date:f.date,status:f.status||'STATUS_SCHEDULED',round:f.round,elapsed:f.elapsed ?? null,
          home:{name:f.home?.name,short:f.home?.short,logo:f.home?.logoId,score:f.home?.score ?? null},
          away:{name:f.away?.name,short:f.away?.short,logo:f.away?.logoId,score:f.away?.score ?? null},
        }));
        return{l,...splitGames(all)};
      });
      if (l === 'belgique') return cachedFetch('/api/football/belgique', 30_000).then(d => {
        const STALE_KICKOFF_MS = 4 * 3600_000;
        const all=(d.matches||[])
          .filter(f => f.status === 'STATUS_FINAL' || (Date.now() - new Date(f.date).getTime()) < STALE_KICKOFF_MS)
          .map(f=>({
          id:`be_${f.id}`,date:f.date,status:f.status||'STATUS_SCHEDULED',round:f.round,elapsed:f.elapsed ?? null,
          home:{name:f.home?.name,short:f.home?.short,logo:f.home?.logoId,score:f.home?.score ?? null},
          away:{name:f.away?.name,short:f.away?.short,logo:f.away?.logoId,score:f.away?.score ?? null},
        }));
        return{l,...splitGames(all)};
      });
      if (l === 'suisse') return cachedFetch('/api/football/suisse', 30_000).then(d => {
        const STALE_KICKOFF_MS = 4 * 3600_000;
        const all=(d.matches||[])
          .filter(f => f.status === 'STATUS_FINAL' || (Date.now() - new Date(f.date).getTime()) < STALE_KICKOFF_MS)
          .map(f=>({
          id:`ch_${f.id}`,date:f.date,status:f.status||'STATUS_SCHEDULED',round:f.round,elapsed:f.elapsed ?? null,
          home:{name:f.home?.name,short:f.home?.short,logo:f.home?.logoId,score:f.home?.score ?? null},
          away:{name:f.away?.name,short:f.away?.short,logo:f.away?.logoId,score:f.away?.score ?? null},
        }));
        return{l,...splitGames(all)};
      });
      if (l === 'norvege') return cachedFetch('/api/football/norvege', 30_000).then(d => {
        const STALE_KICKOFF_MS = 4 * 3600_000;
        const all=(d.matches||[])
          .filter(f => f.status === 'STATUS_FINAL' || (Date.now() - new Date(f.date).getTime()) < STALE_KICKOFF_MS)
          .map(f=>({
          id:`no_${f.id}`,date:f.date,status:f.status||'STATUS_SCHEDULED',round:f.round,elapsed:f.elapsed ?? null,
          home:{name:f.home?.name,short:f.home?.short,logo:f.home?.logoId,score:f.home?.score ?? null},
          away:{name:f.away?.name,short:f.away?.short,logo:f.away?.logoId,score:f.away?.score ?? null},
        }));
        return{l,...splitGames(all)};
      });
      if (l === 'turquie') return cachedFetch('/api/football/turquie', 30_000).then(d => {
        const STALE_KICKOFF_MS = 4 * 3600_000;
        const all=(d.matches||[])
          .filter(f => f.status === 'STATUS_FINAL' || (Date.now() - new Date(f.date).getTime()) < STALE_KICKOFF_MS)
          .map(f=>({
          id:`tr_${f.id}`,date:f.date,status:f.status||'STATUS_SCHEDULED',round:f.round,elapsed:f.elapsed ?? null,
          home:{name:f.home?.name,short:f.home?.short,logo:f.home?.logoId,score:f.home?.score ?? null},
          away:{name:f.away?.name,short:f.away?.short,logo:f.away?.logoId,score:f.away?.score ?? null},
        }));
        return{l,...splitGames(all)};
      });
      return cachedFetch(`/api/euro/${l}/scoreboard`, 20_000).then(d=>{const s=splitGames(d.games||[]);return{l,...s};});
    };
    const load = (first=false) => Promise.all(country.leagues.map(l => fetchLeague(l).catch(()=>lastGoodMatchesRef.current[l] ? {l,...lastGoodMatchesRef.current[l]} : {l,soon:[],upcoming:[],done:[]}))).then(res => {
      if (cancelled) return;
      const m={};
      res.forEach(({l,soon=[],upcoming=[],done=[]})=>{m[l]={soon,upcoming,done};lastGoodMatchesRef.current[l]={soon,upcoming,done};});
      setMatches(m);
      if (first) {
        clearTimeout(loadTimer); setLoading(false);
        // Le préchargement "tous les matchs visibles d'un coup" (jusqu'à ~30 requêtes de 800ms+ pour
        // un pays avec beaucoup de matchs, ex. WNBA) a été retiré le 18 septembre 2026 — il saturait
        // les 6 connexions HTTP par origine du navigateur dès l'ouverture d'un pays, retardant TOUT
        // le reste de la page (y compris le classement/leaders de StatsOverlay, pourtant déjà rapides
        // — 3-4ms en cache — mais coincés en file d'attente derrière cette rafale). Le préchargement
        // au survol (onMouseEnter, cf. _prefetchMatch plus bas) suffit largement à garder un clic
        // réactif sans bloquer le chargement initial du panneau.
      } else setLoading(false);
    });
    const wasManual = isManualRefreshRef.current;
    isManualRefreshRef.current = false;
    const loadPromise = load(!wasManual);
    if (wasManual) loadPromise.finally(() => { if (!cancelled) setRefreshing(false); });
    // Rafraîchit régulièrement pour faire passer un match terminé de "À venir" à "Terminés"
    // sans devoir fermer/réouvrir le panneau (settlement plus rapide pour la CDM).
    const t = setInterval(() => load(false), 60_000);
    return () => { cancelled = true; clearTimeout(loadTimer); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country?.name, refreshNonce]);

  // Bouton "recharger" (1er septembre 2026, repositionné + réduit le 3 septembre) — affiché sous la
  // ligne À venir/Terminés de CHAQUE championnat foot ayant un match en direct (cf. plus bas dans le
  // rendu par championnat), plutôt qu'un seul bouton global en haut du panneau.
  const handleManualRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    isManualRefreshRef.current = true;
    fetch('/api/football/live-refresh', { method: 'POST' }).catch(() => {}).finally(() => {
      // Invalide uniquement les caches foot concernés par ce pays — pas de refetch inutile côté basket.
      country.leagues.forEach(l => {
        if (l === 'cdm') invalidateCache('/api/fd/worldcup');
        else if (l === 'bresil') invalidateCache('/api/fd/bresil');
        else if (l === 'grece') invalidateCache('/api/football/grece');
        else if (l === 'arabie') invalidateCache('/api/football/arabie');
        // 'portugal' ajouté ici le 17 septembre 2026 — bug pré-existant trouvé en passant (jamais
        // dans cette liste depuis son ajout le 9 septembre), retombait à tort sur /api/fd/matches.
        else if (l === 'portugal') invalidateCache('/api/football/portugal');
        else if (l === 'paysbas') invalidateCache('/api/football/paysbas');
        else if (l === 'belgique') invalidateCache('/api/football/belgique');
        else if (l === 'suisse') invalidateCache('/api/football/suisse');
        else if (l === 'norvege') invalidateCache('/api/football/norvege');
        else if (l === 'turquie') invalidateCache('/api/football/turquie');
        else if (EU_CUP_LEAGUES.includes(l)) invalidateCache(`/api/football/eucup/${l}/matches`);
        else if (FOOTBALL_LEAGUES.has(l)) { invalidateCache('/api/fd/matches'); invalidateCache('/api/fd/results'); }
      });
      setRefreshNonce(n => n + 1);
    });
  };

  const visibleLeagues = sportFilter
    ? country.leagues.filter(l => sportOf(l) === sportFilter)
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
            </div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'1px solid rgba(251,146,60,0.15)',borderRadius:6,color:'rgba(251,146,60,0.5)',cursor:'pointer',width:32,height:32,fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s'}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(251,146,60,0.4)';e.currentTarget.style.color='rgba(251,146,60,0.8)';}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(251,146,60,0.15)';e.currentTarget.style.color='rgba(251,146,60,0.5)';}}>×</button>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:'1rem'}}>
          <div style={{flex:1,height:1,background:'linear-gradient(90deg,rgba(251,146,60,0.4),transparent)'}}/>
          {[
            ...(_hasFootball
              // Icône basket désactivée retirée pour le Brésil spécifiquement (26 juillet 2026,
              // demande explicite) — pas de ligue basket couverte là-bas, contrairement aux 4 autres
              // pays foot+basket (France/Espagne/Allemagne/Italie). L'Angleterre (foot seul aussi)
              // garde son 🏀 grisé comme avant, non concernée par la demande.
              ? (country.name === 'Brésil'
                  ? [['football','⚽','#2d8a2d','rgba(45,138,45,',_hasFootball]]
                  : [['football','⚽','#2d8a2d','rgba(45,138,45,',_hasFootball],['basket','🏀','#fb923c','rgba(251,146,60,',_hasBasket]])
              : [['basket','🏀','#fb923c','rgba(251,146,60,',_hasBasket],['football','⚽','#2d8a2d','rgba(45,138,45,',_hasFootball]]),
          ].map(([sport, icon, col, rgba, has]) => {
            const active = sportFilter === sport;
            return (
              <button key={sport} onClick={() => {
                  if (!has) return;
                  const willActivate = sportFilter !== sport;
                  setSportFilter(willActivate ? sport : null);
                  // Cliquer sur l'onglet Basket ou Football rouvre directement l'overlay
                  // Classement/leaders (31 juillet 2026, demande explicite, étendu au foot le même
                  // jour) — les autres sports/désactivations le referment comme avant.
                  setStatsLeague(willActivate ? _preferredStatsLeague(sport) : null);
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
      <div style={{flex:1,overflowY:'auto',padding: country.isMonde ? '0.6rem 1.75rem' : '1.25rem 1.75rem'}}>
        {loading ? (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'rgba(251,146,60,0.25)',fontFamily:'monospace',fontSize:11,letterSpacing:'0.1em'}}>CHARGEMENT...</div>
        ) : visibleLeagues.map(league => {
          const isFootball = FOOTBALL_LEAGUES.has(league);
          const lp = league==='wnba'?'?league=wnba':['nba'].includes(league)?'':`?league=${league}`;
          const { soon=[], upcoming=[], done=[] } = matches[league] || {};
          // Si rien dans les 30h mais des matchs plus loin (ex: reprise de saison à plusieurs
          // semaines), les montrer directement plutôt que forcer un clic sur "À venir" pour voir
          // un onglet "soon" vide.
          const isExplicitUpcoming = view[league] === 'upcoming';
          const mode = view[league] || (soon.length === 0 && upcoming.length > 0 ? 'upcoming' : 'soon');
          // Panneau Monde — le cap "3 affiches vedettes" (23 juillet 2026, pickHighlightMatches)
          // s'appliquait aussi au mode "soon" normal, empêchant d'afficher tous les matchs des 2
          // jours les plus proches (repli par jour du 31 août/9 septembre) même quand une seule
          // journée en contient plus de 3 (ex. LDC, plusieurs affiches le même soir) — retiré le
          // 9 septembre 2026 (demande explicite) : le repli par jour gère déjà la densité, plus
          // besoin de ce 2e filtre par-dessus. Cap gardé UNIQUEMENT pour le repli "upcoming" (aucun
          // match sous 30h, cf. commentaire plus haut) — sans lui, une compétition sans match proche
          // (ex. LDC avant son 1er match) afficherait toute la liste non filtrée par défaut.
          const games = mode === 'upcoming'
            ? (country.isMonde && !isExplicitUpcoming ? pickHighlightMatches([...soon, ...upcoming], 3) : sortLiveFirst([...soon, ...upcoming]))
            : sortLiveFirst(soon);
          const collapsed = !openLeagues[league];
          return (
            <div key={league} style={{marginBottom: country.isMonde ? '0.6rem' : '1.5rem'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,position:'sticky',top:0,zIndex:1,background:'linear-gradient(180deg,rgba(0,8,25,0.99) 85%,transparent)',paddingTop:4,paddingBottom:4,marginTop:-4}}>
                {(() => {
                  const isFoot = FOOTBALL_LEAGUES.has(league);
                  const col = isFoot ? '#2d8a2d' : '#fb923c';
                  const colFade = isFoot ? 'rgba(45,138,45,0.7)' : 'rgba(251,146,60,0.7)';
                  return <>
                    <div onClick={()=>{
                        const willOpen = !openLeagues[league];
                        setOpenLeagues(s=>({...s,[league]:willOpen}));
                        // Widgets Classement/leaders alignés sur le dépliage — se montrent quand le
                        // championnat basket s'ouvre, se cachent quand il se referme (demande
                        // explicite du 24 juillet 2026, remplace l'ancien bouton stats séparé).
                        if (!isFoot) setStatsLeague(willOpen ? league : (statsLeague===league ? null : statsLeague));
                      }}
                      style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
                      <span style={{fontSize:8,color:col,transform:collapsed?'rotate(-90deg)':'none',transition:'transform .15s',display:'inline-block',width:8}}>▾</span>
                      <div style={{width:5,height:5,borderRadius:'50%',background:col,boxShadow:`0 0 8px ${col}`}}/>
                      <span style={{fontSize:10,fontWeight:700,color:col,fontFamily:'monospace',textTransform:'uppercase',letterSpacing:'0.1em',whiteSpace:'nowrap'}}>{LEAGUE_META[league]}</span>
                    </div>
                    <div style={{flex:1,height:1,background:`${col}18`}}/>
                    {!collapsed && <div style={{ flexShrink:0, display:'flex', alignItems:'center', border:'1px solid rgba(255,255,255,0.25)', borderRadius:4, overflow:'hidden', visibility: (soon.length > 0 || upcoming.length > 0 || done.length > 0) ? 'visible' : 'hidden' }}>
                      <span onClick={() => setView(s => ({...s, [league]: 'upcoming'}))}
                        style={{ fontSize:8, fontWeight:700, fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.06em', padding:'3px 7px', cursor:'pointer', color:'#60a5fa', background: mode==='upcoming' ? 'rgba(96,165,250,0.12)' : 'transparent', transition:'background .15s' }}>
                        À venir
                      </span>
                      <span style={{ fontSize:8, color:'rgba(255,255,255,0.2)', userSelect:'none' }}>/</span>
                      <span onClick={() => setView(s => ({...s, [league]: 'done'}))}
                        style={{ fontSize:8, fontWeight:700, fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.06em', padding:'3px 7px', cursor:'pointer', color:'#4ade80', background: mode==='done' ? 'rgba(74,222,128,0.12)' : 'transparent', transition:'background .15s' }}>
                        Terminés
                      </span>
                    </div>}
                  </>;
                })()}
              </div>
              {collapsed ? null : mode !== 'done' ? (
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
                  return Object.entries(byDate).map(([dateLabel, dayGames], dayIdx) => {
                    const dayKey = `${league}::${dateLabel}`;
                    const dayOpen = openDays[dayKey] ?? (dayIdx <= 1);
                    return (
                    <div key={dateLabel}>
                      {/* Séparateur date — plus compact dans le panneau Monde (23 juillet 2026). Cliquable
                          depuis le 31 juillet 2026 : les 2 jours les plus proches (dayIdx 0 et 1, élargi le
                          9 septembre 2026 — auparavant un seul jour) sont dépliés par défaut, les suivants se
                          déroulent au clic sur le libellé. */}
                      <div
                        onClick={() => setOpenDays(s => ({ ...s, [dayKey]: !dayOpen }))}
                        style={{display:'flex',alignItems:'center',gap:8,padding: country.isMonde ? '2px 4px' : '6px 4px',margin: country.isMonde ? '1px 0' : '4px 0',cursor:'pointer'}}
                      >
                        <div style={{flex:1,height:'1px',background:'rgba(255,255,255,0.08)'}}/>
                        <span style={{fontSize:7,color:'rgba(255,255,255,0.35)',transform:dayOpen?'none':'rotate(-90deg)',transition:'transform .15s',display:'inline-block'}}>▾</span>
                        <span style={{fontSize: country.isMonde ? 8 : 9,fontWeight:700,color:'rgba(255,255,255,0.35)',textTransform:'capitalize',letterSpacing:'0.06em',whiteSpace:'nowrap'}}>{dateLabel}</span>
                        <div style={{flex:1,height:'1px',background:'rgba(255,255,255,0.08)'}}/>
                      </div>
                      {dayOpen && FOOTBALL_LEAGUES.has(league) && dayGames.some(isLiveGame) && (
                        <div style={{display:'flex',justifyContent:'flex-end',padding:'2px 4px 4px'}}>
                          <button
                            className={`icon-refresh-btn icon-refresh-btn--football icon-refresh-btn--sm${refreshing ? ' spinning' : ''}`}
                            onClick={handleManualRefresh} disabled={refreshing}
                            title="Recharger les scores en direct">↻</button>
                        </div>
                      )}
                      {dayOpen && dayGames.map((g,i) => {
                        const live = isLiveGame(g);
                        const logoSize = country.isMonde ? 14 : 20;
                        return (
                          <button key={i} onClick={()=>{
                            // Met à jour le state de /carte AVANT de naviguer → navigate(-1) restaurera returnCountry
                            navigate(location.pathname+location.search, { replace:true, state:{ returnCountry: country } });
                            setTimeout(()=>navigate(isFootball?`/football/${g.id}`:`/basketball/${g.id}${lp}`), 0);
                          }}
                            style={{width:'100%',background:'none',border:'none',borderTop:i>0?'1px solid rgba(255,255,255,0.04)':'none',padding: country.isMonde ? '0.3rem 0.5rem' : '0.65rem 0.5rem',cursor:'pointer',textAlign:'center',transition:'background .15s'}}
                            onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.04)';_prefetchMatch(g,league);}}
                            onMouseLeave={e=>e.currentTarget.style.background='none'}>
                            <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',alignItems:'center',gap:8,marginBottom: country.isMonde ? 1 : 3}}>
                              <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:6,minWidth:0}}>
                                <span style={{fontSize: country.isMonde ? 11 : 12,fontWeight:700,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{g.home?.name||g.home?.short}</span>
                                {g.home?.logo&&<img src={g.home.logo} alt="" width={logoSize} height={logoSize} style={{objectFit:'contain',borderRadius:'50%',flexShrink:0}} onError={e=>e.target.style.display='none'}/>}
                              </div>
                              <div style={{flexShrink:0}}>
                                {live&&g.home?.score!=null
                                  ? <span style={{fontSize:13,fontWeight:800,color:'#60a5fa',fontFamily:'monospace',whiteSpace:'nowrap'}}>{g.home.score} – {g.away.score}</span>
                                  : <span style={{fontSize:10,color:'rgba(255,255,255,0.25)',whiteSpace:'nowrap'}}>vs</span>
                                }
                              </div>
                              <div style={{display:'flex',alignItems:'center',justifyContent:'flex-start',gap:6,minWidth:0}}>
                                {g.away?.logo&&<img src={g.away.logo} alt="" width={logoSize} height={logoSize} style={{objectFit:'contain',borderRadius:'50%',flexShrink:0}} onError={e=>e.target.style.display='none'}/>}
                                <span style={{fontSize: country.isMonde ? 11 : 12,fontWeight:700,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{g.away?.name||g.away?.short}</span>
                              </div>
                            </div>
                            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                              {live
                                ? <span style={{fontSize:8,color:'#60a5fa',fontFamily:'monospace',fontWeight:800}}>● {g.elapsed != null ? `${g.elapsed}'` : 'EN COURS'}</span>
                                : <>
                                    {g.round&&!country.isMonde&&<span style={{fontSize:9,color:'rgba(255,255,255,0.3)',fontStyle:'italic'}}>{g.round}</span>}
                                    <span style={{fontSize: country.isMonde ? 8 : 9,color:'rgba(255,255,255,0.4)'}}>{new Date(g.date).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span>
                                  </>
                              }
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );});
                })()
              ) : (
                done.length === 0 ? (
                  <p style={{fontSize:11,color:'rgba(251,146,60,0.18)',fontFamily:'monospace',margin:0,paddingLeft:13}}>Aucun match terminé récemment</p>
                ) : (() => {
                  // Repli par jour (10-11 septembre 2026, demande explicite) — même principe que la
                  // liste "À venir" (byDate/openDays plus haut), jusque-là absent de "Terminés" : une
                  // journée de coupe d'Europe à plusieurs matchs se retrouvait tous mélangés sans
                  // repère de date. Jours triés du plus récent au plus ancien (résultat le plus frais
                  // en premier), tous ouverts par défaut (volume raisonnable une fois la fenêtre 48h
                  // appliquée, contrairement à "À venir" qui peut couvrir des semaines).
                  const byDateDone = {};
                  done.forEach(g => {
                    const dk = new Date(g.date).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'long'});
                    if (!byDateDone[dk]) byDateDone[dk] = [];
                    byDateDone[dk].push(g);
                  });
                  const sortedDays = Object.entries(byDateDone).sort((a, b) => new Date(b[1][0].date) - new Date(a[1][0].date));
                  return sortedDays.map(([dateLabel, dayGames]) => {
                    const dayKey = `${league}::done::${dateLabel}`;
                    const dayOpen = openDays[dayKey] ?? true;
                    return (
                    <div key={dateLabel}>
                      <div
                        onClick={() => setOpenDays(s => ({ ...s, [dayKey]: !dayOpen }))}
                        style={{display:'flex',alignItems:'center',gap:8,padding: country.isMonde ? '2px 4px' : '6px 4px',margin: country.isMonde ? '1px 0' : '4px 0',cursor:'pointer'}}
                      >
                        <div style={{flex:1,height:'1px',background:'rgba(255,255,255,0.08)'}}/>
                        <span style={{fontSize:7,color:'rgba(255,255,255,0.35)',transform:dayOpen?'none':'rotate(-90deg)',transition:'transform .15s',display:'inline-block'}}>▾</span>
                        <span style={{fontSize: country.isMonde ? 8 : 9,fontWeight:700,color:'rgba(255,255,255,0.35)',textTransform:'capitalize',letterSpacing:'0.06em',whiteSpace:'nowrap'}}>{dateLabel}</span>
                        <div style={{flex:1,height:'1px',background:'rgba(255,255,255,0.08)'}}/>
                      </div>
                      {dayOpen && dayGames.map((g,i)=>{
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
                      })}
                    </div>
                    );
                  });
                })()
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
      ...['acb','lnb','bbl','legaa','gbl'].map(l=>cachedFetch(`/api/euro/${l}/scoreboard`, 20_000).catch(()=>({games:[]}))),
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

  // Étendu le 31 juillet 2026 : basket EU (LNB/BBL/Lega A, même overlay que NBA/WNBA/ACB) et foot
  // (5 grands championnats + Brasileirão, Classement+Buteurs+Passeurs) — pas les 3 coupes d'Europe
  // (décision explicite, pas de classement unique pour elles).
  const STATS_LEAGUES = new Set(['nba', 'wnba', 'acb', ...EURO_BASKET_STATS_LEAGUES, ...FOOTBALL_STATS_LEAGUES]);
  const statsBase = l => l === 'nba' ? '/api/nba' : l === 'wnba' ? '/api/wnba' : `/api/euro/${l}`;

  // Pré-fetch standings + leaders dès qu'un pays avec basket/foot éligible est sélectionné
  useEffect(() => {
    if (!selected) return;
    const leagues = selected.leagues.filter(l => STATS_LEAGUES.has(l));
    leagues.forEach(l => {
      if (FOOTBALL_STATS_LEAGUES.includes(l)) {
        // Forme différente côté backend (/api/football/standings + /api/football/topscorers,
        // pas un seul couple standings+leaders comme le basket) — normalisée ici en {standData,cats}
        // pour que StatsOverlay n'ait à connaître qu'une seule forme de données côté basket vs foot.
        Promise.all([
          cachedFetch(`/api/football/standings/${l}`, 30 * 60_000),
          cachedFetch(`/api/football/topscorers/${l}`, 6 * 3600_000),
        ]).then(([standRaw, catsRaw]) => {
          const standData = { standings: (standRaw.table || []).map(t => ({
            id: t.id, rank: t.position, abbr: t.tla, logo: t.crest,
            played: t.played, wins: t.wins, draws: t.draws, losses: t.losses, points: t.points,
          })) };
          const cats = { buteurs: catsRaw.buteurs || [], passeurs: catsRaw.passeurs || [] };
          setPrefetch(p => ({ ...p, [l]: { standData, cats } }));
        }).catch(() => {});
        return;
      }
      const base = statsBase(l);
      Promise.all([
        cachedFetch(`${base}/standings`, 6 * 3600_000),
        cachedFetch(`${base}/leaders`,   6 * 3600_000),
      ]).then(([standData, cats]) => {
        setPrefetch(p => ({ ...p, [l]: { standData, cats } }));
      }).catch(() => {});
    });
  }, [selected]);

  // Politique du 24 juillet 2026 ("jamais d'auto-ouverture") inversée le 31 juillet 2026 — le
  // panneau Classement/leaders s'ouvre maintenant automatiquement (cf. Panel, _preferredStatsLeague).
  // Ne reste ici que le nettoyage du prefetch à la fermeture — `setStatsLeague` est entièrement
  // piloté par Panel désormais ; le forcer à `null` ici à chaque changement de `selected` entrait en
  // course avec l'effet de montage de Panel et annulait l'auto-ouverture par défaut (sans clic sur
  // l'icône sport) un coup sur deux, trouvé en testant l'enchaînement direct d'un pays à l'autre.
  useEffect(() => {
    if (!selected) setPrefetch({});
  }, [selected]);

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

      {/* Légende bas gauche — 2 lignes (23 juillet 2026, ordre demandé) : Monde/USA/Brésil, puis
          France/Espagne/Angleterre/Allemagne/Italie. */}
      <div style={{ position:'absolute', bottom:24, left:24, display:'flex', flexDirection:'column', alignItems:'flex-start', gap:4, zIndex:8, pointerEvents:'none', animation:'mapReveal 0.8s ease-out 0.2s both' }}>
        {LEGEND_ROWS.map((row, ri) => (
          <div key={ri} style={{ display:'flex', alignItems:'center', gap:4, pointerEvents:'auto' }}>
            {row.map(c => (
              <button key={c.name} onClick={(e) => { e.stopPropagation(); const desel=c===selected; setSelected(desel?null:c); if(desel) setStatsLeague(null); }} title={c.leagues.map(l => LEAGUE_META[l]).join(' · ')}
                style={{ display:'flex', alignItems:'center', gap:4, background:'none', border:'none', borderRadius:6, padding:'2px 6px', cursor:'pointer', transition:'opacity .15s', opacity: selected===c ? 1 : 0.55 }}
                onMouseEnter={e => { e.currentTarget.style.opacity='1'; _prefetchCountry(c); }}
                onMouseLeave={e => e.currentTarget.style.opacity = selected===c ? '1' : '0.55'}
              >
                <span style={{ fontSize:13 }}>{c.flag}</span>
                <span style={{ fontSize:10, fontWeight:600, color:'#fff', whiteSpace:'nowrap' }}>{c.name}</span>
              </button>
            ))}
          </div>
        ))}
      </div>


      {/* Panel */}
      {selected && <Panel country={selected} onClose={()=>{setSelected(null);setSelectedGeoId(null);setStatsLeague(null);}} statsLeague={statsLeague} setStatsLeague={setStatsLeague}/>}

      {/* StatsOverlay — rendu ici (hors Panel) pour que position:fixed soit relatif au viewport */}
      {statsLeague && <StatsOverlay league={statsLeague} onClose={() => setStatsLeague(null)} standData={prefetch[statsLeague]?.standData || null} cats={prefetch[statsLeague]?.cats || null} />}
    </div>
  );
}
