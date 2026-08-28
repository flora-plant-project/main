import type { RequestHandler } from 'express';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';

export interface AuthUser {
  id: string;
  cognitoSub: string;
  username: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Verifies the access token's signature, issuer, audience and expiry against the pool's
 * JWKS. The verifier caches the signing keys, so this stays an in-process check.
 *
 * Session length is deliberately not our concern: the client holds a long-lived refresh
 * token and keeps itself signed in until the user logs out. We only ever ask "is this
 * access token valid right now".
 */
const verifier = CognitoJwtVerifier.create({
  userPoolId: env.COGNITO_USER_POOL_ID,
  tokenUse: 'access',
  clientId: env.COGNITO_CLIENT_ID,
});

const extractBearerToken = (header: string | undefined): string => {
  if (!header) throw new UnauthorizedError('Authorization header is missing.');

  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new UnauthorizedError('Expected an "Authorization: Bearer <token>" header.');
  }

  return token;
};

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractBearerToken(req.headers.authorization);

    // Throws on any verification failure; the reason is not echoed to the client.
    const payload = await verifier.verify(token);

    const user = await prisma.user.findUnique({
      where: { cognitoSub: payload.sub },
      select: { id: true, cognitoSub: true, username: true, role: true },
    });

    // Valid token with no local row means signup did not finish. Treat as unauthenticated.
    if (!user) {
      throw new UnauthorizedError('Account is not provisioned. Please sign up again.');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error);
      return;
    }
    next(new UnauthorizedError('Invalid or expired token.'));
  }
};

/** Role gate for moderation and admin routes. Always mount after `requireAuth`. */
export const requireRole =
  (...allowed: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required.'));
      return;
    }

    if (!allowed.includes(req.user.role)) {
      next(new ForbiddenError('This action requires elevated permissions.'));
      return;
    }

    next();
  };
