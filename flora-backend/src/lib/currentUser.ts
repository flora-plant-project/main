import type { Request } from 'express';
import type { AuthUser } from '../middleware/auth';
import { UnauthorizedError } from './errors';

/**
 * Reads the user attached by `requireAuth`.
 *
 * `req.user` is typed optional because it is unset on public routes. Asserting it away
 * with `!` would turn a route accidentally mounted without `requireAuth` into a crash on
 * `undefined.id`; this turns the same mistake into a 401, which is both correct and
 * obvious in the logs.
 */
export const currentUser = (req: Request): AuthUser => {
  if (!req.user) throw new UnauthorizedError('Authentication required.');
  return req.user;
};

/** Shorthand for the common case: services are scoped by the local User id. */
export const currentUserId = (req: Request): string => currentUser(req).id;
