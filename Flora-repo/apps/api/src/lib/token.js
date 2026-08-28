import { randomBytes } from 'node:crypto';

/**
 * Mint an opaque session token.
 *
 * 32 random bytes, not a JWT: the token is a primary key in the Session table,
 * so a lookup is the auth check and logout is a delete. Revocation matters more
 * here than statelessness.
 *
 * @returns {string}
 */
export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}
