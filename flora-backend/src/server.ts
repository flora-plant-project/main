import app from './app';
import { env } from './config/env';
import { disconnectPrisma } from './lib/prisma';

/**
 * How long we allow in-flight requests to finish before killing the process.
 * Must stay comfortably below the ECS task StopTimeout (30s default), otherwise the
 * container is SIGKILLed mid-drain and we lose the connection cleanup anyway.
 */
const SHUTDOWN_TIMEOUT_MS = 10_000;

const server = app.listen(env.PORT, () => {
  console.info(`Flora API listening on port ${env.PORT} (${env.NODE_ENV})`);
});

let shuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
  // A second Ctrl-C (or a retried SIGTERM) should not start a parallel teardown.
  if (shuttingDown) return;
  shuttingDown = true;

  console.info(`${signal} received — shutting down.`);

  const forceExit = setTimeout(() => {
    console.error('Shutdown timed out; forcing exit.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  // Do not let this timer keep an otherwise-idle process alive.
  forceExit.unref();

  try {
    // Stop accepting new connections, let existing requests finish.
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    await disconnectPrisma();

    clearTimeout(forceExit);
    console.info('Shutdown complete.');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

/**
 * Past this point the process is in an unknown state — the only safe move is to log
 * and let the orchestrator replace the task.
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  void shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  void shutdown('unhandledRejection');
});
