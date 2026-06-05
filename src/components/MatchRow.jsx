import { useNavigate } from 'react-router-dom';
import { formatMatchDate, formatMatchTime } from '../utils/formatters';

const FINAL_STATUSES = new Set(['STATUS_FULL_TIME', 'STATUS_FINAL', 'STATUS_FT', 'STATUS_AFTER_EXTRA_TIME', 'STATUS_AFTER_PENALTIES']);

export default function MatchRow({ fixture }) {
  const navigate = useNavigate();
  const { home, away, date, status, statusDetail, round } = fixture;

  const isLive  = status === 'STATUS_IN_PROGRESS';
  const isFinal = FINAL_STATUSES.has(status);
  const hasScore = (isLive || isFinal) && home.score != null && away.score != null;

  const homeScore = hasScore ? parseInt(home.score) : null;
  const awayScore = hasScore ? parseInt(away.score) : null;
  const homeWon = isFinal && hasScore && homeScore > awayScore;
  const awayWon = isFinal && hasScore && awayScore > homeScore;

  const homeColor = isLive ? '#c62828' : isFinal ? (homeWon ? '#2e7d32' : 'var(--text)') : null;
  const awayColor = isLive ? '#c62828' : isFinal ? (awayWon ? '#2e7d32' : 'var(--text)') : null;

  const handleClick = () => {
    sessionStorage.setItem(`league_open_${fixture.league}`, 'open');
    sessionStorage.setItem('sports_active', 'football');
    sessionStorage.setItem('scroll_sports', window.scrollY);
    navigate(`/football/${fixture.id}`);
  };

  const Logo = ({ src }) => src
    ? <img src={src} alt="" className="match-row-logo" onError={e => { e.target.style.display = 'none'; }} />
    : null;

  // logoId peut être une URL complète ou un ID API-Sports (numérique)
  const homeSrc = home.logoId
    ? (String(home.logoId).startsWith('http') ? home.logoId : `https://media.api-sports.io/football/teams/${home.logoId}.png`)
    : null;
  const awaySrc = away.logoId
    ? (String(away.logoId).startsWith('http') ? away.logoId : `https://media.api-sports.io/football/teams/${away.logoId}.png`)
    : null;

  return (
    <button className="match-row" onClick={handleClick}>
      <div className="match-row-date">
        {isLive ? (
          <span className="mrd-live">LIVE</span>
        ) : (
          <>
            <span className="mrd-day">{formatMatchDate(date)}</span>
            <span className="mrd-time">{formatMatchTime(date)}</span>
          </>
        )}
        {(isLive || isFinal) && (
          <span className="mrd-detail">{statusDetail || (isFinal ? 'Terminé' : '')}</span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div className="match-row-teams">
          <div className="match-row-team home">
            {home.position != null && <span className="team-pos">#{home.position}</span>}
            <span className="team-name">{home.name}</span>
            <Logo src={homeSrc} />
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
            <Logo src={awaySrc} />
            <span className="team-name">{away.name}</span>
            {away.position != null && <span className="team-pos">#{away.position}</span>}
          </div>
        </div>

        {round && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '0.2rem' }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.03em' }}>
              {round}
            </span>
          </div>
        )}
      </div>

      <span className="match-row-arrow">›</span>
    </button>
  );
}
