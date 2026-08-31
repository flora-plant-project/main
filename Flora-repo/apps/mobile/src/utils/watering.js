const DAY_MS = 24 * 60 * 60 * 1000;
/** Beyond this many days out a plant reads as "All good" rather than a countdown. */
const ALL_GOOD_AFTER_DAYS = 7;

/**
 * Watering chip status derived from a plant's nextDueAt.
 * Calendar-day comparison: due before today → overdue, same day → today.
 * A plant with no schedule yet (null) needs its first watering now, and
 * anything further out than a week reads as settled rather than a countdown.
 * @param {string|null} nextDueAt ISO timestamp or null
 * @param {number} [now] epoch ms, defaults to Date.now()
 * @returns {{ key: 'waterNow' } | { key: 'today' } | { key: 'inDays'|'allGood', days: number }}
 */
export function waterStatus(nextDueAt, now = Date.now()) {
  if (!nextDueAt) return { key: 'waterNow' };
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const dueStart = new Date(nextDueAt).setHours(0, 0, 0, 0);
  if (dueStart < todayStart) return { key: 'waterNow' };
  if (dueStart === todayStart) return { key: 'today' };
  const days = Math.round((dueStart - todayStart) / DAY_MS);
  return { key: days > ALL_GOOD_AFTER_DAYS ? 'allGood' : 'inDays', days };
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

/** Arabic-Indic ٠-٩ and Persian ۰-۹, which an Arabic keyboard emits and parseInt cannot read. */
const ARABIC_INDIC_DIGITS = /[٠-٩]/g;
const PERSIAN_DIGITS = /[۰-۹]/g;

/**
 * Read a watering interval the user typed.
 *
 * Returns null when there is no number in the text at all — an empty field, a
 * half-deleted entry — so the caller can keep the interval it already had
 * rather than writing a schedule of NaN days. A number outside the range
 * clamps rather than failing: someone typing 90 means "as long as you allow",
 * not "reject this".
 *
 * @param {unknown} text
 * @returns {number|null} a whole number of days within the allowed range, or null
 */
export function parseIntervalDays(text) {
  const digits = String(text ?? '')
    .replace(ARABIC_INDIC_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(PERSIAN_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '');

  if (!digits) return null;
  const days = Number.parseInt(digits, 10);
  return Math.min(MAX_INTERVAL_DAYS, Math.max(MIN_INTERVAL_DAYS, days));
}
