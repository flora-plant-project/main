/**
 * Compact relative-time parts for feed timestamps.
 * @param {string} iso
 * @param {number} [now]
 * @returns {{ key: 'now' } | { key: 'M'|'H'|'D', count: number }}
 */
export function timeAgoParts(iso, now = Date.now()) {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return { key: 'now' };
  if (minutes < 60) return { key: 'M', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: 'H', count: hours };
  return { key: 'D', count: Math.floor(hours / 24) };
}
