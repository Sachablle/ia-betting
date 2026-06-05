import { useNavigate } from 'react-router-dom';
import { startTransition } from 'react';
import { formatMatchDate, formatMatchTime } from '../utils/formatters';

const EL_LOGOS = {
  FEN: 'https://upload.wikimedia.org/wikipedia/en/thumb/0/0b/Fenerbah%C3%A7e_Men%27s_Basketball_logo.svg/120px-Fenerbah%C3%A7e_Men%27s_Basketball_logo.svg.png',
  PAO: 'https://upload.wikimedia.org/wikipedia/en/thumb/1/18/Panathinaikos_BC_logo.svg/120px-Panathinaikos_BC_logo.svg.png',
  OLY: 'https://upload.wikimedia.org/wikipedia/en/thumb/7/7f/Olympiacos_BC_logo.svg/120px-Olympiacos_BC_logo.svg.png',
  RMB: 'https://upload.wikimedia.org/wikipedia/en/b/be/Real_Madrid_Baloncesto.png',
  VBC: 'https://upload.wikimedia.org/wikipedia/en/thumb/e/e8/Valencia_Basket_logo.svg/120px-Valencia_Basket_logo.svg.png',
};

export default function BasketballMatchRow({ fixture }) {
  const navigate = useNavigate();
  const { home, away, date, status, statusDetail, note, seriesSummary } = fixture;
  const isEL = fixture.league === 'euroleague';
  const homeLogo = home.logo || (isEL ? EL_LOGOS[home.short] : null);
  const awayLogo = away.logo || (isEL ? EL_LOGOS[away.short] : null);

  const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;
  const elapsed = Date.now() - new Date(date).getTime();

  const isLive         = status === 'STATUS_IN_PROGRESS';
  const isFinalESPN    = status === 'STATUS_FINAL';
  // Pour les fixtures EL avec status injecté depuis l'API, on utilise le status directement
  // Sinon fallback sur la fenêtre temporelle
  const isLiveStatic   = !isLive && !isFinalESPN && !fixture.round?.includes('Terminé') && elapsed >= 0 && elapsed < LIVE_WINDOW_MS;
  const isFinalStatic  = !isLive && !isFinalESPN && (fixture.round?.includes('Terminé') || elapsed >= LIVE_WINDOW_MS);
  const isFinal        = isFinalESPN || isFinalStatic;
  const hasScore       = (isLive || isLiveStatic || isFinal) && home.score != null && away.score != null;

  const homeScore = hasScore ? parseInt(home.score) : null;
  const awayScore = hasScore ? parseInt(away.score) : null;
  const homeWon   = isFinal && hasScore && homeScore > awayScore;
  const awayWon   = isFinal && hasScore && awayScore > homeScore;

  const homeColor = (isLive || isLiveStatic) ? '#c62828' : isFinal ? (homeWon ? '#2e7d32' : 'var(--text)') : null;
  const awayColor = (isLive || isLiveStatic) ? '#c62828' : isFinal ? (awayWon ? '#2e7d32' : 'var(--text)') : null;

  const [prefix, gameLabel] = note?.includes(' - ') ? note.split(' - ') : ['', note || ''];
  const hasDetail = note || seriesSummary;

  const handleClick = () => {
    const EURO = ['acb', 'lnb', 'bbl', 'legaa'];
    const leagueKey = isEL ? 'euroleague' : EURO.includes(fixture.league) ? fixture.league : fixture.league === 'wnba' ? 'wnba' : 'nba';
    sessionStorage.setItem(`league_open_${leagueKey}`, 'open');
    sessionStorage.setItem('sports_active', 'basketball');
    sessionStorage.setItem('scroll_sports', window.scrollY);
    const qs = EURO.includes(fixture.league) ? `?league=${fixture.league}` : fixture.league === 'wnba' ? '?league=wnba' : '';
    startTransition(() => navigate(`/basketball/${fixture.id}${qs}`));
  };

  return (
    <button className="match-row" onClick={handleClick}>
      <div className="match-row-date">
        {isLive || isLiveStatic ? (
          <span className="mrd-live">LIVE</span>
        ) : (
          <>
            <span className="mrd-day">{formatMatchDate(date)}</span>
            <span className="mrd-time">{formatMatchTime(date)}</span>
          </>
        )}
        {(isLive || isLiveStatic || isFinal) && (
          <span className="mrd-detail">{statusDetail || (isFinal ? 'Terminé' : '')}</span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div className="match-row-teams">
          <div className="match-row-team home">
            {homeLogo && <img src={homeLogo} alt="" className="match-row-logo" />}
            <span className="team-name">{home.name}</span>
          </div>

          <div className="match-row-score" style={hasScore ? { fontSize: 12, fontWeight: 700 } : {}}>
            {hasScore ? (
              <>
                <span style={{ color: homeColor }}>{home.score}</span>
                <span className="score-sep">–</span>
                <span style={{ color: awayColor }}>{away.score}</span>
              </>
            ) : (
              <span className="match-row-vs">vs</span>
            )}
          </div>

          <div className="match-row-team away">
            <span className="team-name">{away.name}</span>
            {awayLogo && <img src={awayLogo} alt="" className="match-row-logo" />}
          </div>
        </div>

        {hasDetail && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', paddingBottom: '0.2rem', gap: '0 0.3rem' }}>
            <div style={{ textAlign: 'right', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
              {prefix}{seriesSummary && !prefix ? seriesSummary : ''}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
              {gameLabel}
            </span>
            <div style={{ textAlign: 'left', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
              {prefix && seriesSummary ? seriesSummary : ''}
            </div>
          </div>
        )}
      </div>

      <span className="match-row-arrow">›</span>
    </button>
  );
}
