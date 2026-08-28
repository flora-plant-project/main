import { PrismaClient } from '@prisma/client';

/**
 * The shared Prisma client — the only database handle in the API (CLAUDE.md).
 *
 * Cached on globalThis because `node --watch` re-imports this module on every
 * save; without the cache each reload would open a fresh connection pool and
 * Postgres would run out of connections after a handful of edits.
 *
 * @type {PrismaClient}
 */
export const prisma =
  globalThis.__floraPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalThis.__floraPrisma = prisma;
