import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

const SALT_BYTES = 16;
const KEY_BYTES = 64;

/**
 * Hash a password for storage.
 *
 * scrypt from node:crypto rather than bcrypt/argon2: it is memory-hard, it is in
 * the standard library, and it keeps the API free of a native dependency that
 * would have to compile on every teammate's machine and in CI.
 *
 * The salt is stored alongside the hash as `salt:key`, both hex — one column,
 * and every stored hash carries the parameters needed to verify it.
 *
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const key = /** @type {Buffer} */ (await scrypt(password, salt, KEY_BYTES));
  return `${salt}:${key.toString('hex')}`;
}

/**
 * Check a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed stored value, so a corrupt
 * row is a failed login and not a 500.
 *
 * @param {string} password
 * @param {string} stored value produced by {@link hashPassword}
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  const [salt, keyHex] = String(stored ?? '').split(':');
  if (!salt || !keyHex) return false;

  const expected = Buffer.from(keyHex, 'hex');
  if (expected.length !== KEY_BYTES) return false;

  const actual = /** @type {Buffer} */ (await scrypt(password, salt, KEY_BYTES));
  return timingSafeEqual(actual, expected);
}
