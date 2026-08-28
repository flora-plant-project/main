import { getPersistentStorage } from './storage.js';

const TOKEN_KEY = 'flora-session-token';

/**
 * The bearer token for the live API.
 *
 * Held in memory so apiFetch can read it synchronously on every request, and
 * mirrored to persistent storage so a restart does not log the user out.
 * Storage is the slow path: `restore()` runs once at startup, and every read
 * after that is the cached value.
 *
 * @type {string|null}
 */
let token = null;

/** @returns {string|null} */
export function getToken() {
  return token;
}

/**
 * Store the token, or clear it with null.
 *
 * Writes are fire-and-forget: a storage failure means the session does not
 * survive a restart, which is not a reason to fail the login that just
 * succeeded.
 *
 * @param {string|null} value
 */
export function setToken(value) {
  token = value ?? null;
  const storage = getPersistentStorage();
  const write = token ? storage.setItem(TOKEN_KEY, token) : storage.removeItem(TOKEN_KEY);
  Promise.resolve(write).catch(() => {});
}

/**
 * Load a persisted token into memory. Call once, before the first request.
 * @returns {Promise<string|null>}
 */
export async function restoreToken() {
  try {
    token = await getPersistentStorage().getItem(TOKEN_KEY);
  } catch {
    token = null;
  }
  return token;
}
