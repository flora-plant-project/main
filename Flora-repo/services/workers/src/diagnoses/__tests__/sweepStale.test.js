import { describe, expect, it, vi } from 'vitest';
import { createStaleDiagnosisSweeper } from '../sweepStale.js';

const NOW = Date.UTC(2026, 7, 25, 12, 0, 0);
const TIMEOUT_MS = 45_000;

const silent = { info: vi.fn(), error: vi.fn() };

/**
 * A store over an in-memory list, applying the same staleness rule the Prisma
 * one does — so what the test exercises is the sweeper's decision, not a fake.
 * @param {Array<{id: string, status: string, createdAt: Date}>} rows
 */
function makeStore(rows, { failOn = [] } = {}) {
  const writes = [];
  return {
    writes,
    rows,
    async findStalePending(before) {
      return rows.filter((row) => row.status === 'PENDING' && row.createdAt < before);
    },
    async markFailed(id, patch) {
      if (failOn.includes(id)) throw new Error('write failed');
      writes.push({ id, patch });
      const row = rows.find((entry) => entry.id === id);
      Object.assign(row, patch);
    },
  };
}

/** @param {number} msAgo */
const at = (msAgo) => new Date(NOW - msAgo);

function sweeperOver(store) {
  return createStaleDiagnosisSweeper({
    store,
    timeoutMs: TIMEOUT_MS,
    now: () => NOW,
    logger: silent,
  });
}

describe('stale diagnosis sweeper', () => {
  it('fails out a PENDING row older than the recognition timeout', async () => {
    const store = makeStore([{ id: 'dg1', status: 'PENDING', createdAt: at(60_000) }]);

    const result = await sweeperOver(store).run();

    expect(result).toEqual({ swept: 1, failed: 0 });
    // Byte-identical to what the API writes when it sweeps on read, so a row
    // gives no clue which path closed it.
    expect(store.writes[0].patch).toEqual({
      status: 'FAILED',
      error: { code: 'PROVIDER_ERROR', message: 'Recognition timed out' },
      completedAt: new Date(NOW),
    });
  });

  it('leaves a PENDING row that still has time on the clock', async () => {
    const store = makeStore([{ id: 'dg1', status: 'PENDING', createdAt: at(TIMEOUT_MS - 1_000) }]);

    expect(await sweeperOver(store).run()).toEqual({ swept: 0, failed: 0 });
    expect(store.writes).toEqual([]);
  });

  it('never touches a diagnosis that already finished', async () => {
    const store = makeStore([
      { id: 'done', status: 'COMPLETE', createdAt: at(10 * 60_000) },
      { id: 'dead', status: 'FAILED', createdAt: at(10 * 60_000) },
    ]);

    expect(await sweeperOver(store).run()).toEqual({ swept: 0, failed: 0 });
    expect(store.writes).toEqual([]);
  });

  it('finishes the batch when one row cannot be written', async () => {
    const store = makeStore(
      [
        { id: 'dg1', status: 'PENDING', createdAt: at(60_000) },
        { id: 'dg2', status: 'PENDING', createdAt: at(60_000) },
        { id: 'dg3', status: 'PENDING', createdAt: at(60_000) },
      ],
      { failOn: ['dg2'] },
    );

    const result = await sweeperOver(store).run();

    // The unwritable row is left PENDING on purpose: it is still old, so the
    // next run picks it up again.
    expect(result).toEqual({ swept: 2, failed: 1 });
    expect(store.writes.map((write) => write.id)).toEqual(['dg1', 'dg3']);
    expect(store.rows.find((row) => row.id === 'dg2').status).toBe('PENDING');
  });

  it('is safe to run twice — the second pass finds nothing left', async () => {
    const store = makeStore([{ id: 'dg1', status: 'PENDING', createdAt: at(60_000) }]);
    const sweeper = sweeperOver(store);

    await sweeper.run();

    expect(await sweeper.run()).toEqual({ swept: 0, failed: 0 });
    expect(store.writes).toHaveLength(1);
  });
});
