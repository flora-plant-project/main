/** @typedef {import('./types.js')} Types */

/**
 * Canonical machine-readable error codes used in every failed ApiResponse.
 * @readonly
 * @enum {string}
 */
export const ErrorCode = Object.freeze({
  VALIDATION: 'VALIDATION',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  INTERNAL: 'INTERNAL',
});

/**
 * Wrap a successful payload in the standard API envelope.
 * @template T
 * @param {T} data
 * @returns {import('./types.js').ApiResponse<T>}
 */
export function ok(data) {
  return { ok: true, data };
}

/**
 * Wrap an error in the standard API envelope.
 * @param {string} code one of {@link ErrorCode}
 * @param {string} message human-readable description
 * @returns {import('./types.js').ApiResponse<never>}
 */
export function fail(code, message) {
  return { ok: false, error: { code, message } };
}
