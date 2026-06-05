import { useState } from 'react';

export default function TeamLogo({ name, logoId, size = 24 }) {
  const [err, setErr] = useState(false);

  if (!logoId || err) {
    return (
      <span className="team-logo-fallback" style={{ width: size, height: size, fontSize: size * 0.38 }}>
        {name.slice(0, 2).toUpperCase()}
      </span>
    );
  }

  const src = String(logoId).startsWith('http')
    ? logoId
    : `https://media.api-sports.io/football/teams/${logoId}.png`;

  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      className="team-logo-img"
      onError={() => setErr(true)}
    />
  );
}
