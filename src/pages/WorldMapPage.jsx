import { useState, useEffect, useRef } from 'react';
import { ComposableMap, Geographies, Geography, Graticule } from 'react-simple-maps';
import { useNavigate, useLocation } from 'react-router-dom';

import GEO_DATA from 'world-atlas/countries-110m.json';
const GEO_URL = GEO_DATA;

const COVERED = {
  '840': { name: 'États-Unis', flag: '🇺🇸', leagues: ['nba','wnba'] },
  '250': { name: 'France',     flag: '🇫🇷', leagues: ['lnb','ligue1'] },
  '724': { name: 'Espagne',    flag: '🇪🇸', leagues: ['acb','laliga'] },
  '276': { name: 'Allemagne',  flag: '🇩🇪', leagues: ['bbl','bundes'] },
  '380': { name: 'Italie',     flag: '🇮🇹', leagues: ['legaa','seriea'] },
  '826': { name: 'Angleterre', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', leagues: ['pl'] },
};

const LEAGUE_META = {
  nba: 'NBA', wnba: 'WNBA', lnb: 'Betclic Élite',
  acb: 'ACB', bbl:  'BBL',  legaa: 'Lega A',
  ligue1: 'Ligue 1', laliga: 'La Liga', bundes: 'Bundesliga', seriea: 'Serie A', pl: 'Premier League',
  euroleague: 'EuroLeague', cdm: 'Coupe du Monde',
};

const FOOTBALL_LEAGUES = new Set(['ligue1','laliga','bundes','seriea','pl','cdm']);

const MONDE = { name: 'Monde', flag: '🌍', leagues: ['euroleague','cdm'], isMonde: true };

function Panel({ country, onClose }) {
  const navigate = useNavigate();
  const [matches, setMatches] = useState({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState({}); // { [league]: 'upcoming' | 'done' } — bouton À venir / Terminés par championnat

  useEffect(() => {
    if (!country) return;
    setLoading(true);
    const fetchLeague = l => {
      const KEEP_MS = 48*3600_000;
      const UPCOMING_MS = 30*3600_000; // page principale = matchs imminents (<30h) ; onglet "À venir" = matchs programmés à 30h ou plus
      const splitGames = games => ({
        soon:     games.filter(g=>g.status!=='STATUS_FINAL' && new Date(g.date).getTime()-Date.now() < UPCOMING_MS),
        upcoming: games.filter(g=>g.status!=='STATUS_FINAL' && new Date(g.date).getTime()-Date.now() >= UPCOMING_MS),
        done:     games.filter(g=>g.status==='STATUS_FINAL'&&Date.now()-new Date(g.date).getTime()<KEEP_MS).slice(0,3),
      });
      if (l === 'nba')  return fetch('/api/nba/scoreboard').then(r=>r.json()).then(d=>{const s=splitGames(d.games||[]);return{l,...s};});
      if (l === 'wnba') return fetch('/api/wnba/scoreboard').then(r=>r.json()).then(d=>{const s=splitGames(d.games||[]);return{l,...s};});
      if (l === 'euroleague') return fetch('/api/euroleague/scoreboard').then(r=>r.json()).then(d=>{const s=splitGames(d.games||[]);return{l,...s};});
      if (FOOTBALL_LEAGUES.has(l) && l !== 'cdm') return fetch('/api/football/matches').then(r=>r.json()).then(d=>{
        const all=(d.fixtures||[]).filter(f=>f.league?.key===l).map(f=>({
          id:f.id,date:f.date,status:f.status==='STATUS_FULL_TIME'?'STATUS_FINAL':'STATUS_SCHEDULED',round:f.round,
          home:{name:f.homeTeam?.name,short:f.homeTeam?.shortName,logo:f.homeTeam?.crest,score:f.score?.home??null},
          away:{name:f.awayTeam?.name,short:f.awayTeam?.shortName,logo:f.awayTeam?.crest,score:f.score?.away??null},
        }));
        return{l,...splitGames(all)};
      });
      if (l === 'cdm') return fetch('/api/fd/worldcup').then(r=>r.json()).then(d => {
        const games = (d.games || []).map(g => ({ ...g, id: `fdcdm_${g.id}` }));
        return {l, ...splitGames(games)};
      });
      if (l === 'euroleague') return fetch('/api/euroleague/scoreboard').then(r=>r.json()).then(d=>({l,games:(d.games||[]).filter(g=>g.status!=='STATUS_FINAL').slice(0,5)}));
      if (FOOTBALL_LEAGUES.has(l)) return fetch('/api/football/matches').then(r=>r.json()).then(d=>{
        const today = new Date(); today.setHours(0,0,0,0);
        const soon  = new Date(today); soon.setDate(soon.getDate()+7);
        const games = (d.fixtures||[]).filter(f=>f.league?.key===l&&f.status==='STATUS_SCHEDULED').map(f=>({
          id: f.id, date: f.date, status: f.status, round: f.round,
          home:{ name:f.homeTeam?.name, short:f.homeTeam?.shortName, logo:f.homeTeam?.crest, score:null },
          away:{ name:f.awayTeam?.name, short:f.awayTeam?.shortName, logo:f.awayTeam?.crest, score:null },
        })).slice(0,4);
        return {l, games};
      });
      return fetch(`/api/euro/${l}/scoreboard`).then(r=>r.json()).then(d=>{const s=splitGames(d.games||[]);return{l,...s};});
    };
    const load = () => Promise.all(country.leagues.map(l => fetchLeague(l).catch(()=>({l,soon:[],upcoming:[],done:[]})))).then(res => {
      const m={};
      res.forEach(({l,soon=[],upcoming=[],done=[]})=>{m[l]={soon,upcoming,done};});
      setMatches(m);
      setLoading(false);
    });
    load();
    // Rafraîchit régulièrement pour faire passer un match terminé de "À venir" à "Terminés"
    // sans devoir fermer/réouvrir le panneau (settlement plus rapide pour la CDM).
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [country?.name]);

  return (
    <div style={{
      position:'fixed', top:0, right:0, bottom:0, width:480,
      background:'linear-gradient(160deg,rgba(0,6,20,0.98),rgba(0,12,35,0.99))',
      borderLeft:'1px solid rgba(251,146,60,0.15)',
      boxShadow:'-20px 0 60px rgba(0,0,0,0.8)',
      display:'flex', flexDirection:'column',
      animation:'panelIn .35s cubic-bezier(.25,.46,.45,.94)',
      zIndex:10,
    }}>
      {/* Header */}
      <div style={{padding:'2rem 1.75rem 1.25rem', borderBottom:'1px solid rgba(251,146,60,0.08)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.5rem'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:32}}>{country.flag}</span>
            <div>
              <div style={{fontSize:20,fontWeight:800,color:'#fff',letterSpacing:'-0.02em'}}>{country.name}</div>
              <div style={{fontSize:9,color:'rgba(251,146,60,0.5)',fontFamily:'monospace',textTransform:'uppercase',letterSpacing:'0.12em',marginTop:2}}>
                {country.leagues.map(l=>LEAGUE_META[l]).join(' · ')}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'1px solid rgba(251,146,60,0.15)',borderRadius:6,color:'rgba(251,146,60,0.5)',cursor:'pointer',width:32,height:32,fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s'}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(251,146,60,0.4)';e.currentTarget.style.color='rgba(251,146,60,0.8)';}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(251,146,60,0.15)';e.currentTarget.style.color='rgba(251,146,60,0.5)';}}>×</button>
        </div>
        <div style={{height:1,background:'linear-gradient(90deg,rgba(251,146,60,0.4),transparent)',marginTop:'1rem'}}/>
      </div>

      {/* Matchs */}
      <div style={{flex:1,overflowY:'auto',padding:'1.25rem 1.75rem'}}>
        {loading ? (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'rgba(251,146,60,0.25)',fontFamily:'monospace',fontSize:11,letterSpacing:'0.1em'}}>CHARGEMENT...</div>
        ) : country.leagues.map(league => {
          const isFootball = FOOTBALL_LEAGUES.has(league);
          const lp = league==='wnba'?'?league=wnba':['nba'].includes(league)?'':`?league=${league}`;
          const { soon=[], upcoming=[], done=[] } = matches[league] || {};
          // Page principale = matchs imminents (<30h) ; "À venir" = matchs à 30h+ ; "Terminés" = résultats récents
          const mode = view[league] || 'soon';
          const games = mode === 'upcoming' ? upcoming : soon;
          return (
            <div key={league} style={{marginBottom:'1.5rem'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                {(() => {
                  const isFoot = FOOTBALL_LEAGUES.has(league);
                  const col = isFoot ? '#2d8a2d' : '#fb923c';
                  const colFade = isFoot ? 'rgba(45,138,45,0.7)' : 'rgba(251,146,60,0.7)';
                  return <>
                    <div style={{width:5,height:5,borderRadius:'50%',background:col,boxShadow:`0 0 8px ${col}`}}/>
                    <span style={{fontSize:10,fontWeight:700,color:col,fontFamily:'monospace',textTransform:'uppercase',letterSpacing:'0.1em'}}>{LEAGUE_META[league]}</span>
                    <div style={{flex:1,height:1,background:`${col}18`}}/>
                    {(soon.length > 0 || upcoming.length > 0 || done.length > 0) && (
                      <div style={{display:'flex',gap:4}}>
                        {[['upcoming','À venir','#60a5fa'],['done','Terminés','#4ade80']].map(([v,label,vcol]) => {
                          const active = mode === v;
                          return (
                            <button key={v} onClick={()=>setView(s=>({...s,[league]: active ? 'soon' : v}))}
                              style={{
                                fontSize:8,fontWeight:700,fontFamily:'monospace',textTransform:'uppercase',letterSpacing:'0.06em',
                                padding:'3px 7px',borderRadius:4,cursor:'pointer',transition:'all .15s',
                                background: active ? `${vcol}1f` : 'none',
                                border: `1px solid ${active ? vcol : `${vcol}55`}`,
                                color: active ? vcol : `${vcol}99`,
                              }}>
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    )}
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
                            onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                            onMouseLeave={e=>e.currentTarget.style.background='none'}>
                            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:3}}>
                              {g.home?.logo&&<img src={g.home.logo} alt="" width={20} height={20} style={{objectFit:'contain'}} onError={e=>e.target.style.display='none'}/>}
                              <span style={{fontSize:12,fontWeight:700,color:'#fff'}}>{g.home?.name||g.home?.short}</span>
                              {live&&g.home?.score!=null
                                ? <span style={{fontSize:13,fontWeight:800,color:'#ef4444',fontFamily:'monospace',margin:'0 4px'}}>{g.home.score} – {g.away.score}</span>
                                : <span style={{fontSize:10,color:'rgba(255,255,255,0.25)',margin:'0 5px'}}>vs</span>
                              }
                              <span style={{fontSize:12,fontWeight:700,color:'#fff'}}>{g.away?.name||g.away?.short}</span>
                              {g.away?.logo&&<img src={g.away.logo} alt="" width={20} height={20} style={{objectFit:'contain'}} onError={e=>e.target.style.display='none'}/>}
                            </div>
                            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                              {live
                                ? <span style={{fontSize:8,color:'#ef4444',fontFamily:'monospace',fontWeight:800}}>● EN COURS</span>
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
                      onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.04)';e.currentTarget.style.opacity='1';}}
                      onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.opacity='0.6';}}>
                      {(() => {
                        const hs = g.home?.score, as = g.away?.score;
                        const homeWon = hs != null && as != null && hs > as;
                        const awayWon = hs != null && as != null && as > hs;
                        const WIN = '#2d8a2d', DIM = 'rgba(255,255,255,0.35)';
                        return (
                          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:7,marginBottom:2}}>
                            {g.home?.logo&&<img src={g.home.logo} alt="" width={16} height={16} style={{objectFit:'contain'}} onError={e=>e.target.style.display='none'}/>}
                            <span style={{fontSize:11,fontWeight:homeWon?700:500,color:homeWon?'#fff':'rgba(255,255,255,0.55)'}}>{g.home?.name||g.home?.short}</span>
                            {hs!=null&&<>
                              <span style={{fontSize:13,fontWeight:800,color:homeWon?WIN:DIM,fontFamily:'monospace'}}>{hs}</span>
                              <span style={{fontSize:10,color:'rgba(255,255,255,0.2)'}}>–</span>
                              <span style={{fontSize:13,fontWeight:800,color:awayWon?WIN:DIM,fontFamily:'monospace'}}>{as}</span>
                            </>}
                            <span style={{fontSize:11,fontWeight:awayWon?700:500,color:awayWon?'#fff':'rgba(255,255,255,0.55)'}}>{g.away?.name||g.away?.short}</span>
                            {g.away?.logo&&<img src={g.away.logo} alt="" width={16} height={16} style={{objectFit:'contain'}} onError={e=>e.target.style.display='none'}/>}
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
      fetch('/api/nba/scoreboard').then(r=>r.json()).catch(()=>({games:[]})),
      fetch('/api/wnba/scoreboard').then(r=>r.json()).catch(()=>({games:[]})),
      ...['acb','lnb','bbl','legaa'].map(l=>fetch(`/api/euro/${l}/scoreboard`).then(r=>r.json()).catch(()=>({games:[]}))),
      fetch('/api/fd/matches').then(r=>r.json()).catch(()=>({matches:[]})),
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

  return (
    <div style={{position:'fixed',top:0,left:180,right:0,bottom:0,overflow:'hidden',background:'transparent'}}>
      <style>{`
        @keyframes panelIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes mapGlide{from{transform:translateX(0)}to{transform:translateX(-180px)}}
        @keyframes fadeCountry{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes scanLine{0%{top:-2px;opacity:1}90%{opacity:0.8}100%{top:100%;opacity:0;visibility:hidden}}
        @keyframes dotBlink{0%,100%{opacity:1;box-shadow:0 0 6px #ef4444}50%{opacity:0.2;box-shadow:none}}
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

      {/* Bouton matchs à venir — haut droite */}
      {todayCount !== null && (
        <div style={{ position:'absolute', top:'calc(20px + 2.2cm)', right:20, zIndex:10, animation:'uiReveal 0.6s ease-out 1.4s both' }}>
          <button onClick={()=>setMatchOpen(o=>!o)} style={{ display:'flex', alignItems:'center', gap:7, background:'rgba(0,5,18,0.8)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'7px 14px', cursor:'pointer', transition:'border-color .15s' }}
            onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.22)'}
            onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.1)'}
          >
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#ef4444', flexShrink:0, animation: todayCount.total > 0 ? 'dotBlink 1.4s ease-in-out infinite' : 'none' }}/>
            <span style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.7)' }}>Matchs à venir</span>
          </button>

          {matchOpen && (
            <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, background:'rgba(0,5,18,0.95)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'8px 12px', boxShadow:'0 6px 20px rgba(0,0,0,0.6)', animation:'fadeCountry .15s ease-out', display:'flex', flexDirection:'column', gap:5 }}>
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
        onClick={() => { if (selected && !ignoreClicks.current) { setSelected(null); setSelectedGeoId(null); } }}
        style={{
        position:'absolute', inset:0,
        display:'flex', alignItems:'center', justifyContent:'center', paddingTop:'4vh',
        transition:'transform .55s cubic-bezier(.25,.46,.45,.94), transform-origin .55s',
        transform: selected ? `translateX(-180px) scale(1.55)` : 'translateX(0) scale(1)',
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
                  onMouseEnter={e=>{if(c){setHovered(geo.id);setTooltip({name:c.name,flag:c.flag,x:e.clientX,y:e.clientY});}}}
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
      <div style={{ position:'absolute', bottom:24, left:24, display:'flex', alignItems:'center', gap:8, zIndex:8, pointerEvents:'none', animation:'uiReveal 0.6s ease-out 1.4s both' }}>
        <div style={{ display:'flex', alignItems:'center', gap:4, pointerEvents:'auto' }}>
          {[...Object.values(COVERED), MONDE].map((c, i) => (
            <button key={i} onClick={() => setSelected(c === selected ? null : c)} title={c.leagues.map(l => LEAGUE_META[l]).join(' · ')}
              style={{ display:'flex', alignItems:'center', gap:4, background:'none', border:'none', borderRadius:6, padding:'2px 6px', cursor:'pointer', transition:'opacity .15s', opacity: selected===c ? 1 : 0.55 }}
              onMouseEnter={e => e.currentTarget.style.opacity='1'}
              onMouseLeave={e => e.currentTarget.style.opacity = selected===c ? '1' : '0.55'}
            >
              <span style={{ fontSize:13 }}>{c.flag}</span>
              <span style={{ fontSize:10, fontWeight:600, color:'#fff', whiteSpace:'nowrap' }}>{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Panel */}
      {selected && <Panel country={selected} onClose={()=>{setSelected(null);setSelectedGeoId(null);}}/>}
    </div>
  );
}
