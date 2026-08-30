import { useState, useEffect } from 'react';
import { cachedFetch } from '../utils/fetchCache';

// Historique near-miss PAR JOUEUSE (29 août 2026, demande explicite) — combien de fois elle a passé
// sa ligne par rapport à la probabilité annoncée, stat par stat (pts/reb/ast/tpm). La donnée
// (nom du joueur + résultat réel) est déjà collectée depuis le début dans `_nearMissCandidates`,
// juste jamais filtrée/regroupée par joueur avant — voir `/api/analysis/near-miss-player` (server.js).
// `players` accepte un nom seul ou un tableau (fiche match : tout l'effectif en une seule requête).
export function usePlayerNearMiss(players, league) {
  const [data, setData] = useState({});
  const key = Array.isArray(players) ? players.filter(Boolean).join(',') : (players || '');
  useEffect(() => {
    if (!key) { setData({}); return; }
    const url = `/api/analysis/near-miss-player?players=${encodeURIComponent(key)}${league ? `&league=${league}` : ''}`;
    cachedFetch(url, 5 * 60_000).then(d => setData(d.players || {})).catch(() => {});
  }, [key, league]);
  return data; // { [playerName]: { byStat: { pts: {combined,over,under}, reb: {...}, ... }, totalResolved } }
}

// Petit badge ✔ discret — n/N (win%) pour une joueuse + une stat, DANS LE SENS de l'alerte affichée
// (over ou under) — fix 29 août 2026, demande explicite après une question de l'utilisateur ("est-ce
// que c'est la direction under qui a gagné 9x, ou juste la projection ?"). Avant ce fix, `stat` seul
// mélangeait Over et Under ensemble, ce qui ne répondait à aucune question exploitable pour juger une
// alerte précise (qui n'a toujours qu'UN sens). `direction` est maintenant obligatoire pour afficher un
// chiffre correct — sans lui, retombe sur `combined` (mélangé) à titre de compat, marqué comme tel.
// `compact` (29 août 2026, demande explicite) — rendu "(n/N)" nu, pensé pour être collé sur la même
// ligne qu'un autre texte (ex: le roster "Analyse Props", qui affichait avant ce fix deux lignes
// empilées "▼55%" puis "✔ 6/7" — jugé trop épais visuellement). Le badge par défaut (✔ n/N, sa propre
// ligne) reste inchangé pour les emplacements qui ont la place (carte d'alerte).
// `color` — override optionnel, calcul par défaut inchangé si omis (utilisé nulle part pour l'instant,
// gardé au cas où un futur emplacement afficherait le badge sur un fond dont il faut hériter la couleur).
// Code couleur du badge lui-même (29 août 2026, demande explicite, ajusté le même jour) — reflète la
// qualité de l'historique near-miss de la joueuse sur CETTE stat/direction, indépendamment de la couleur
// du "%" projeté juste à côté (les deux mesurent des choses différentes : le % est la confiance du
// modèle aujourd'hui, le "(n/N)" est le bilan réel passé) : rouge = mauvais, bleu = plutôt bien,
// vert = bien à très bien. Basé sur la borne basse de l'IC95% de Wilson (`winRateCI95[0]`), pas le taux
// brut, pour ne pas sur-valoriser un petit échantillon chanceux.
export function PlayerStatBadge({ stat, direction, byStat, minN = 3, compact = false, color: colorOverride }) {
  const bucket = byStat?.[stat];
  const s = direction ? bucket?.[direction] : bucket?.combined;
  if (!s || s.n < minN) return null; // sous le minimum, pas assez de cas pour être informatif
  const color = colorOverride ?? (s.winRateCI95[0] >= 60 ? '#4ade80' : s.winRateCI95[0] >= 45 ? '#60a5fa' : '#f87171');
  const dirLabel = direction === 'over' ? 'Over' : direction === 'under' ? 'Under' : 'Over+Under mélangés';
  const title = `Historique réel de cette joueuse, ${dirLabel} uniquement sur cette stat (90 derniers jours) : ${s.wins}/${s.n} lignes passées (${s.winRate}%), probabilité annoncée en moyenne ${s.avgProbability}%`;
  if (compact) {
    return (
      <span title={title} style={{ fontSize: '0.85em', fontWeight: 700, color, whiteSpace: 'nowrap' }}>
        {' '}({s.wins}/{s.n})
      </span>
    );
  }
  return (
    <span title={title} style={{ fontSize: 9, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
      ✔ {s.wins}/{s.n}
    </span>
  );
}
