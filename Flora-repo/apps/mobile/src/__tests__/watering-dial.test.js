import {
  MAX_INTERVAL_DAYS,
  MIN_INTERVAL_DAYS,
  dialFractionForDays,
  parseIntervalDays,
  waterProgress,
} from '../utils/watering.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('waterProgress', () => {
  const watered = '2026-08-20T09:00:00.000Z';
  const due = '2026-08-24T09:00:00.000Z';

  it('is 0 the moment a plant is watered and 1 when it falls due', () => {
    expect(waterProgress(watered, due, Date.parse(watered))).toBe(0);
    expect(waterProgress(watered, due, Date.parse(due))).toBe(1);
  });

  it('tracks the cycle in between', () => {
    expect(waterProgress(watered, due, Date.parse(watered) + 2 * DAY)).toBeCloseTo(0.5, 5);
    expect(waterProgress(watered, due, Date.parse(watered) + DAY)).toBeCloseTo(0.25, 5);
  });

  it('clamps rather than running past the ring when overdue', () => {
    expect(waterProgress(watered, due, Date.parse(due) + 10 * DAY)).toBe(1);
  });

  it('reads as due when there is no schedule yet', () => {
    // Must agree with waterStatus(null) → 'waterNow', or the ring and the chip
    // would tell the user different things about the same plant.
    expect(waterProgress(null, null)).toBe(1);
    expect(waterProgress(null, due)).toBe(1);
    expect(waterProgress(watered, null)).toBe(1);
  });

  it('does not divide by zero on a broken or inverted range', () => {
    expect(waterProgress(due, watered)).toBe(1);
    expect(waterProgress(watered, watered)).toBe(1);
    expect(waterProgress('not a date', due)).toBe(1);
  });
});

describe('dialFractionForDays', () => {
  it('puts the minimum at the start of the sweep and the maximum at the end', () => {
    expect(dialFractionForDays(MIN_INTERVAL_DAYS)).toBe(0);
    expect(dialFractionForDays(MAX_INTERVAL_DAYS)).toBe(1);
  });

  it('clamps values outside the range', () => {
    expect(dialFractionForDays(0)).toBe(0);
    expect(dialFractionForDays(999)).toBe(1);
  });
});

describe('parseIntervalDays', () => {
  it('reads a plain number of days', () => {
    expect(parseIntervalDays('12')).toBe(12);
    expect(parseIntervalDays('7')).toBe(7);
  });

  it('returns null when there is no number to read', () => {
    // The caller keeps the interval it already had rather than writing NaN.
    expect(parseIntervalDays('')).toBeNull();
    expect(parseIntervalDays('   ')).toBeNull();
    expect(parseIntervalDays(null)).toBeNull();
    expect(parseIntervalDays(undefined)).toBeNull();
  });

  it('clamps rather than rejecting a number outside the range', () => {
    expect(parseIntervalDays('0')).toBe(MIN_INTERVAL_DAYS);
    expect(parseIntervalDays('999')).toBe(MAX_INTERVAL_DAYS);
  });

  it('reads Arabic-Indic and Persian digits', () => {
    // An Arabic keyboard emits ٥ for five, which parseInt reads as nothing.
    expect(parseIntervalDays('٥')).toBe(5);
    expect(parseIntervalDays('١٤')).toBe(14);
    expect(parseIntervalDays('۱۴')).toBe(14);
  });
});
