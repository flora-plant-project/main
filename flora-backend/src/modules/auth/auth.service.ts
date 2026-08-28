import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { UnauthorizedError } from '../../lib/errors';
import * as cognito from './cognito.client';
import type { AuthTokens } from './cognito.client';
import type { LoginInput, LogoutInput, SignupInput } from './auth.schema';

/**
 * Fields safe to return to the client. `satisfies` keeps this honest — a typo or a field
 * that does not exist on User fails to compile rather than silently selecting nothing.
 */
const publicUser = {
  id: true,
  username: true,
  language: true,
  role: true,
} as const satisfies Prisma.UserSelect;

/** Derived from the select above, so the two can never drift apart. */
export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUser }>;

export interface SessionResult {
  user: PublicUser;
  tokens: AuthTokens;
}

/**
 * Creates the Cognito account and the local row, then signs the user straight in.
 *
 * No account recovery exists by design (demo scope): there is no email and no recovery
 * code, so a forgotten password means a new account.
 */
export const signup = async (input: SignupInput): Promise<SessionResult> => {
  const { username, password, language } = input;

  const sub = await cognito.createUser(username);

  try {
    await cognito.setPermanentPassword(username, password);

    const user = await prisma.user.create({
      data: { cognitoSub: sub, username, language },
      select: publicUser,
    });

    const tokens = await cognito.authenticate(username, password);

    return { user, tokens };
  } catch (error) {
    // Cognito and Postgres share no transaction. Undo the Cognito side so a failed
    // signup leaves neither an orphaned account nor a burned username.
    await cognito.deleteUser(username);
    throw error;
  }
};

export const login = async (input: LoginInput): Promise<SessionResult> => {
  const tokens = await cognito.authenticate(input.username, input.password);

  const user = await prisma.user.findUnique({
    where: { username: input.username },
    select: publicUser,
  });

  // Valid credentials with no local row means signup rollback failed partway. Surface it
  // as an ordinary credential failure rather than exposing an inconsistent account.
  if (!user) {
    throw new UnauthorizedError('Incorrect username or password.');
  }

  return { user, tokens };
};

/**
 * Ends the persistent session by revoking the refresh token. Access tokens already
 * issued remain valid until they expire — revocation is not instantaneous.
 */
export const logout = async (input: LogoutInput): Promise<void> => {
  await cognito.revokeRefreshToken(input.refreshToken);
};
