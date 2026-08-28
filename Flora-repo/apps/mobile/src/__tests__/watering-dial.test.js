import {
  MAX_INTERVAL_DAYS,
  MIN_INTERVAL_DAYS,
  daysForDialTouch,
  dialFractionForDays,
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

describe('daysForDialTouch', () => {
  // The dial starts at twelve o'clock and sweeps clockwise, so these are the
  // four positions a user can hit exactly.
  it('reads the minimum at the top', () => {
    expect(daysForDialTouch(0, -50)).toBe(MIN_INTERVAL_DAYS);
  });

  it('reads a quarter turn clockwise as a quarter of the range', () => {
    const span = MAX_INTERVAL_DAYS - MIN_INTERVAL_DAYS;
    expect(daysForDialTouch(50, 0)).toBe(Math.round(span * 0.25) + MIN_INTERVAL_DAYS);
    expect(daysForDialTouch(0, 50)).toBe(Math.round(span * 0.5) + MIN_INTERVAL_DAYS);
    expect(daysForDialTouch(-50, 0)).toBe(Math.round(span * 0.75) + MIN_INTERVAL_DAYS);
  });

  it('never returns a value outside the allowed range', () => {
    for (let angle = 0; angle < 360; angle += 7) {
      const radians = (angle * Math.PI) / 180;
      const days = daysForDialTouch(Math.sin(radians) * 60, -Math.cos(radians) * 60);
      expect(days).toBeGreaterThanOrEqual(MIN_INTERVAL_DAYS);
      expect(days).toBeLessThanOrEqual(MAX_INTERVAL_DAYS);
      expect(Number.isInteger(days)).toBe(true);
    }
  });

  it('is unaffected by how far from the centre the touch lands', () => {
    // Only the angle matters — dragging outwards must not change the value.
    expect(daysForDialTouch(10, 10)).toBe(daysForDialTouch(80, 80));
  });
});
