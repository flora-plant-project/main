import { ErrorCode, SignupSchema, fail, ok } from '@flora/shared';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { createSessionToken } from '../../lib/token.js';
import { parseWith } from '../../lib/validate.js';

/** Login takes the same fields as signup. */
const LoginSchema = SignupSchema;

/**
 * The public shape of a user. Never widen this — passwordHash lives one property
 * away and a spread would ship it.
 * @param {{id: string, username: string, displayName: string, climateZone: string}} user
 */
export function publicUser({ id, username, displayName, climateZone }) {
  return { id, username, displayName, climateZone };
}

/**
 * Create the auth service.
 * @param {{prisma: import('@prisma/client').PrismaClient}} deps
 */
export function createAuthService({ prisma }) {
  return {
    /**
     * Register an account and start a session.
     * @param {unknown} input
     */
    async signup(input) {
      const { data, error } = parseWith(SignupSchema, input);
      if (error) return error;

      const taken = await prisma.user.findUnique({ where: { username: data.username } });
      if (taken) return fail(ErrorCode.VALIDATION, 'username: already taken');

      const user = await prisma.user.create({
        data: {
          username: data.username,
          passwordHash: await hashPassword(data.password),
          // Nothing asks for a display name at signup; the username stands in
          // until the profile screen offers one.
          displayName: data.username,
        },
      });

      const token = createSessionToken();
      await prisma.session.create({ data: { token, userId: user.id } });

      return ok({ user: publicUser(user), token });
    },

    /**
     * Exchange credentials for a session token.
     * @param {unknown} input
     */
    async login(input) {
      const { data, error } = parseWith(LoginSchema, input);
      if (error) return error;

      const user = await prisma.user.findUnique({ where: { username: data.username } });
      // One message for both "no such user" and "wrong password" — telling them
      // apart tells an attacker which usernames exist.
      const valid = user && (await verifyPassword(data.password, user.passwordHash));
      if (!valid) return fail(ErrorCode.UNAUTHORIZED, 'invalid username or password');

      const token = createSessionToken();
      await prisma.session.create({ data: { token, userId: user.id } });

      return ok({ user: publicUser(user), token });
    },

    /**
     * End one session. Idempotent: logging out twice, or with a token that was
     * never valid, is a success — the caller's goal is already met.
     * @param {string|null} token
     */
    async logout(token) {
      if (token) await prisma.session.deleteMany({ where: { token } });
      return ok(null);
    },

    /**
     * The session user, or null when logged out.
     *
     * Returns ok(null) rather than UNAUTHORIZED: "am I logged in?" is answered,
     * not refused, and the mobile app boots by calling this before it has a token.
     * @param {{id: string, username: string, displayName: string, climateZone: string}|null} user
     */
    async me(user) {
      return ok(user ? { user: publicUser(user) } : null);
    },
  };
}
