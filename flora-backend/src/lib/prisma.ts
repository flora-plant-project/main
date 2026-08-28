import { PrismaClient, Prisma } from '@prisma/client';
import { env } from '../config/env';

/**
 * Query logging is noisy and leaks values, so it is opt-in via LOG_LEVEL=debug
 * and never enabled in production.
 */
const logLevels: Prisma.LogLevel[] =
  env.LOG_LEVEL === 'debug' && !env.isProduction
    ? ['query', 'warn', 'error']
    : ['warn', 'error'];

const createPrismaClient = (): PrismaClient => new PrismaClient({ log: logLevels });

/**
 * `tsx watch` reloads the module graph on every save. Without this cache each reload
 * would open a fresh connection pool and exhaust Postgres within a few edits.
 */
const globalForPrisma = globalThis as typeof globalThis & {
  __floraPrisma?: PrismaClient;
};

export const prisma: PrismaClient = globalForPrisma.__floraPrisma ?? createPrismaClient();

if (!env.isProduction) {
  globalForPrisma.__floraPrisma = prisma;
}

/** Called by the server's shutdown handler so in-flight queries can drain. */
export const disconnectPrisma = async (): Promise<void> => {
  await prisma.$disconnect();
};
