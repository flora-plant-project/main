import { ErrorCode, fail } from '@flora/shared';

/**
 * Pull the bearer token off a request, or null.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function bearerToken(req) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  return token.trim() || null;
}

/**
 * Resolve the session on every request and hang the user off `req.user`.
 *
 * Attaches rather than rejects: `auth.me` and the public reads need to know who
 * is asking without requiring it. `requireAuth` is what turns absence into a 401.
 *
 * @param {{prisma: import('@prisma/client').PrismaClient}} deps
 */
export function createSessionLoader({ prisma }) {
  return async function loadSession(req, _res, next) {
    const token = bearerToken(req);
    req.token = token;
    req.user = null;

    if (token) {
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: true },
      });
      // A token whose row is gone (logged out, user deleted) is simply anonymous.
      if (session) req.user = session.user;
    }

    next();
  };
}

/**
 * Gate a route on a valid session.
 * @type {import('express').RequestHandler}
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    res.status(401).json(fail(ErrorCode.UNAUTHORIZED, 'not logged in'));
    return;
  }
  next();
}
