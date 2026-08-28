const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Watering chip status derived from a plant's nextDueAt.
 * Calendar-day comparison: due before today → overdue, same day → today.
 * A plant with no schedule yet (null) needs its first watering now.
 * @param {string|null} nextDueAt ISO timestamp or null
 * @param {number} [now] epoch ms, defaults to Date.now()
 * @returns {{ key: 'waterNow' } | { key: 'today' } | { key: 'inDays', days: number }}
 */
export function waterStatus(nextDueAt, now = Date.now()) {
  if (!nextDueAt) return { key: 'waterNow' };
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const dueStart = new Date(nextDueAt).setHours(0, 0, 0, 0);
  if (dueStart < todayStart) return { key: 'waterNow' };
  if (dueStart === todayStart) return { key: 'today' };
  return { key: 'inDays', days: Math.round((dueStart - todayStart) / DAY_MS) };
}

/**
 * True when the plant needs water today (overdue or due today).
 * @param {string|null} nextDueAt
 * @param {number} [now]
 */
export function needsWaterToday(nextDueAt, now = Date.now()) {
  const status = waterStatus(nextDueAt, now);
  return status.key === 'waterNow' || status.key === 'today';
}

/**
 * Zone-adjusted watering interval in days — the same formula the API applies on
 * markWatered: round(waterEveryDays × zone multiplier), never below 1 day.
 * @param {{ care?: { waterEveryDays?: number }, zoneMultipliers?: Record<string, number> }} species
 * @param {string|null|undefined} climateZone
 * @returns {number}
 */
export function zoneAdjustedInterval(species, climateZone) {
  const base = species?.care?.waterEveryDays ?? 7;
  const multiplier = (climateZone && species?.zoneMultipliers?.[climateZone]) ?? 1;
  return Math.max(1, Math.round(base * multiplier));
}

/** Smallest and largest interval the dial can pick, in days. */
export const MIN_INTERVAL_DAYS = 1;
export const MAX_INTERVAL_DAYS = 60;

/**
 * How far through the current watering cycle a plant is, 0..1.
 *
 * 0 is freshly watered, 1 is due (or overdue — it clamps rather than running
 * past the ring). A plant with no schedule yet reads as due, matching
 * waterStatus, so the ring and the chip never disagree.
 *
 * @param {string|null} lastWateredAt ISO timestamp or null
 * @param {string|null} nextDueAt ISO timestamp or null
 * @param {number} [now] epoch ms
 * @returns {number} 0..1
 */
export function waterProgress(lastWateredAt, nextDueAt, now = Date.now()) {
  if (!nextDueAt || !lastWateredAt) return 1;
  const start = Date.parse(lastWateredAt);
  const end = Date.parse(nextDueAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

/**
 * Map a day count onto its fraction of the dial, 0..1.
 * @param {number} days
 */
export function dialFractionForDays(days) {
  const clamped = Math.min(MAX_INTERVAL_DAYS, Math.max(MIN_INTERVAL_DAYS, days));
  return (clamped - MIN_INTERVAL_DAYS) / (MAX_INTERVAL_DAYS - MIN_INTERVAL_DAYS);
}

/**
 * Map a touch on the dial back to a day count.
 *
 * Angle is measured clockwise from twelve o'clock, which is where the track
 * starts, so the maths matches what the user sees rather than SVG's default
 * three-o'clock origin.
 *
 * @param {number} dx horizontal distance from the dial centre
 * @param {number} dy vertical distance from the dial centre
 * @returns {number} a whole number of days within the allowed range
 */
export function daysForDialTouch(dx, dy) {
  // atan2(dx, -dy) puts 0 at the top and grows clockwise.
  const radians = Math.atan2(dx, -dy);
  const fraction = (radians < 0 ? radians + 2 * Math.PI : radians) / (2 * Math.PI);
  const span = MAX_INTERVAL_DAYS - MIN_INTERVAL_DAYS;
  return Math.min(MAX_INTERVAL_DAYS, Math.max(MIN_INTERVAL_DAYS, Math.round(fraction * span) + MIN_INTERVAL_DAYS));
}
