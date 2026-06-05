export function formatMatchDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatMatchTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function formatFullDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function formatCapacity(n) {
  return new Intl.NumberFormat('fr-FR').format(n);
}

export function formatRecord(w, d, l) {
  return `${w}V · ${d}N · ${l}D`;
}
