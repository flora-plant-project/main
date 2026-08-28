import { config, prisma } from 'api';
import { createPrismaSweepStore, createStaleDiagnosisSweeper } from './diagnoses/sweepStale.js';

export { createStaleDiagnosisSweeper, createPrismaSweepStore } from './diagnoses/sweepStale.js';

/**
 * Flora's scheduled work.
 *
 * One job so far: closing out diagnoses that were left PENDING. Handlers are
 * written as plain async functions over an injected store, so what runs on a
 * schedule in a deployed environment is the same code `pnpm -F @flora/workers
 * sweep` runs against a local database.
 *
 * The database handle is the API's shared Prisma client (CLAUDE.md) rather than
 * a second one: two clients against one database means two connection pools and
 * two places to configure.
 *
 * @param {{prisma?: object, timeoutMs?: number, logger?: Console}} [overrides]
 */
export function createWorkers({
  prisma: client = prisma,
  timeoutMs = config.recognitionTimeoutMs,
  logger = console,
} = {}) {
  return {
    sweepStaleDiagnoses: createStaleDiagnosisSweeper({
      store: createPrismaSweepStore({ prisma: client }),
      timeoutMs,
      logger,
    }),
  };
}

/**
 * Lambda entry point for the sweep. Returns its summary so a failed run is
 * visible in the invocation record rather than only in the logs.
 */
export async function sweepStaleDiagnosesHandler() {
  return createWorkers().sweepStaleDiagnoses.run();
}
