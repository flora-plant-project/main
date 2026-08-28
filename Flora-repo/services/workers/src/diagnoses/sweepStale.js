import { ErrorCode } from '@flora/shared';

/**
 * Fail diagnoses that no worker is coming back for.
 *
 * `create` starts recognition without awaiting it, so a process that restarts
 * mid-call leaves a PENDING row with nothing running behind it. The API already
 * sweeps such a row when someone polls it — but only then. A scan the user
 * abandoned, or one whose result screen was closed, stays PENDING forever: it
 * shows as "still working" in a plant's history and is never counted as failed.
 *
 * This is that same sweep, on a schedule instead of on a read. The outcome is
 * written to match the API's version exactly, so a row looks identical however
 * it was swept.
 *
 * Injected store rather than Prisma directly: the decision here is "which rows
 * are too old", which is worth testing without a database.
 *
 * @param {{
 *   store: {
 *     findStalePending: (before: Date) => Promise<Array<{id: string}>>,
 *     markFailed: (id: string, patch: object) => Promise<unknown>,
 *   },
 *   timeoutMs: number,
 *   now?: () => number,
 *   logger?: Pick<Console, 'info'|'error'>,
 * }} deps
 */
export function createStaleDiagnosisSweeper({ store, timeoutMs, now = Date.now, logger = console }) {
  return {
    /**
     * @returns {Promise<{swept: number, failed: number}>} how many rows were
     *   closed out, and how many could not be.
     */
    async run() {
      const before = new Date(now() - timeoutMs);
      const stale = await store.findStalePending(before);

      let swept = 0;
      let failed = 0;

      for (const row of stale) {
        try {
          await store.markFailed(row.id, {
            status: 'FAILED',
            error: { code: ErrorCode.PROVIDER_ERROR, message: 'Recognition timed out' },
            completedAt: new Date(now()),
          });
          swept += 1;
        } catch (error) {
          // One unwritable row must not strand the rest of the batch: the next
          // run will pick it up again, because it is still PENDING and still old.
          failed += 1;
          logger.error(`[sweep] could not fail diagnosis ${row.id}:`, error);
        }
      }

      logger.info(
        `[sweep] ${stale.length} stale PENDING diagnoses older than ` +
          `${before.toISOString()}: ${swept} failed out, ${failed} could not be written`,
      );
      return { swept, failed };
    },
  };
}

/**
 * The Prisma-backed store the sweeper runs against in production.
 * @param {{prisma: import('@prisma/client').PrismaClient}} deps
 */
export function createPrismaSweepStore({ prisma }) {
  return {
    /** @param {Date} before */
    findStalePending(before) {
      return prisma.diagnosis.findMany({
        where: { status: 'PENDING', createdAt: { lt: before } },
        select: { id: true },
      });
    },

    /**
     * @param {string} id
     * @param {object} patch
     */
    markFailed(id, patch) {
      // Still PENDING in the WHERE clause: recognition may have completed
      // between the query and this write, and a late success must not be
      // overwritten with a timeout.
      return prisma.diagnosis.updateMany({ where: { id, status: 'PENDING' }, data: patch });
    },
  };
}
