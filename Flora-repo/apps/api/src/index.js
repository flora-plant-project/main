export { createApp } from './app.js';
// The shared Prisma client, so scheduled work (services/workers) uses the same
// handle and connection pool the API does rather than opening a second one.
export { prisma } from './db.js';
export { loadConfig, config } from './config.js';
export { createRecognitionProvider, normalizePlantIdResponse } from './recognition/index.js';

/**
 * Package identifier.
 * @returns {string}
 */
export function serviceName() {
  return 'api';
}
