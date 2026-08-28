/**
 * ---------------------------------------------------------------------------
 * COGNITO POOL CONTRACT — what this file assumes about the user pool.
 * A mismatch here is the most likely cause of auth failing at runtime, so the
 * expectations live next to the calls that depend on them.
 *
 * App client:
 *   - Created WITHOUT a client secret. The mobile app refreshes tokens directly
 *     against Cognito, which it can only do safely when no SECRET_HASH is required.
 *   - Auth flow ADMIN_USER_PASSWORD_AUTH enabled (the backend proxies login).
 *   - PreventUserExistenceErrors = ENABLED, so Cognito itself returns a generic
 *     NotAuthorizedException instead of UserNotFoundException.
 *   - Refresh token validity set to the desired session length. Users stay signed in
 *     until they log out, so this is long-lived by design.
 *   - Access token validity left at 1 hour. Logout revokes the refresh token only —
 *     an issued access token stays valid until it expires, and that window is exactly
 *     this setting.
 *
 * User pool:
 *   - No required attributes and no auto-verified attributes. Signup is username +
 *     password with no email, and either setting would reject it.
 *   - Password policy must match the rules in auth.schema.ts.
 *
 * IAM permissions required by the backend's task role:
 *   cognito-idp:AdminCreateUser
 *   cognito-idp:AdminSetUserPassword
 *   cognito-idp:AdminInitiateAuth
 *   cognito-idp:AdminDeleteUser   (signup rollback only)
 *   cognito-idp:RevokeToken
 * ---------------------------------------------------------------------------
 */

import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  RevokeTokenCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { env } from '../../config/env';
import {
  ConflictError,
  InternalError,
  UnauthorizedError,
  UpstreamError,
  ValidationError,
} from '../../lib/errors';

const client = new CognitoIdentityProviderClient({ region: env.AWS_REGION });

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Translates AWS exceptions into our error types. Credential failures collapse to one
 * message on purpose: distinguishing "no such user" from "wrong password" would let
 * anyone enumerate registered usernames, and username is the only identifier we have.
 */
const mapCognitoError = (error: unknown): never => {
  const name = error instanceof Error ? error.name : '';

  switch (name) {
    case 'UsernameExistsException':
      throw new ConflictError('That username is taken.');
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
      throw new UnauthorizedError('Incorrect username or password.');
    case 'InvalidPasswordException':
      throw new ValidationError('Password does not meet the password policy.');
    case 'TooManyRequestsException':
    case 'LimitExceededException':
      throw new UpstreamError('Too many requests. Please try again shortly.');
    default:
      throw new UpstreamError('Authentication service is unavailable.');
  }
};

/**
 * Creates the Cognito user and returns its `sub`, which is the key our local User row
 * hangs off. MessageAction SUPPRESS stops Cognito attempting a welcome message — there
 * is no email address to send one to.
 */
export const createUser = async (username: string): Promise<string> => {
  try {
    const result = await client.send(
      new AdminCreateUserCommand({
        UserPoolId: env.COGNITO_USER_POOL_ID,
        Username: username,
        MessageAction: 'SUPPRESS',
      }),
    );

    const sub = result.User?.Attributes?.find((attr) => attr.Name === 'sub')?.Value;
    if (!sub) {
      throw new InternalError('Cognito returned a user without a subject identifier.');
    }

    return sub;
  } catch (error) {
    if (error instanceof InternalError) throw error;
    return mapCognitoError(error);
  }
};

/**
 * AdminCreateUser leaves the account in FORCE_CHANGE_PASSWORD with a temporary password.
 * Setting a permanent one moves it to CONFIRMED, which is what makes signup a single
 * step from the user's point of view. Also used to complete a recovery redemption.
 */
export const setPermanentPassword = async (
  username: string,
  password: string,
): Promise<void> => {
  try {
    await client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: env.COGNITO_USER_POOL_ID,
        Username: username,
        Password: password,
        Permanent: true,
      }),
    );
  } catch (error) {
    mapCognitoError(error);
  }
};

/**
 * Signup rollback only. Cognito and Postgres cannot share a transaction, so if the local
 * User row fails to write we undo the Cognito side by hand — otherwise the username is
 * burned and the account is unreachable forever (a valid login with no local row is
 * rejected by requireAuth).
 *
 * Swallows its own failures: it runs inside a catch block, and masking the original
 * error with a cleanup error would hide why signup actually failed.
 */
export const deleteUser = async (username: string): Promise<void> => {
  try {
    await client.send(
      new AdminDeleteUserCommand({
        UserPoolId: env.COGNITO_USER_POOL_ID,
        Username: username,
      }),
    );
  } catch (error) {
    console.error('[auth] Cognito rollback failed for username:', username, error);
  }
};

export const authenticate = async (
  username: string,
  password: string,
): Promise<AuthTokens> => {
  try {
    const result = await client.send(
      new AdminInitiateAuthCommand({
        UserPoolId: env.COGNITO_USER_POOL_ID,
        ClientId: env.COGNITO_CLIENT_ID,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: { USERNAME: username, PASSWORD: password },
      }),
    );

    const tokens = result.AuthenticationResult;
    // A challenge (MFA, forced password change) means the pool is configured in a way
    // this flow does not support, rather than a user error.
    if (!tokens?.AccessToken || !tokens.RefreshToken) {
      throw new UpstreamError('Authentication did not complete. Check the pool configuration.');
    }

    return {
      accessToken: tokens.AccessToken,
      refreshToken: tokens.RefreshToken,
      expiresIn: tokens.ExpiresIn ?? 3600,
    };
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    return mapCognitoError(error);
  }
};

/**
 * Ends the persistent session. Revoking invalidates the refresh token and every access
 * token derived from it going forward — but not one already in the client's hands.
 */
export const revokeRefreshToken = async (refreshToken: string): Promise<void> => {
  try {
    await client.send(
      new RevokeTokenCommand({
        ClientId: env.COGNITO_CLIENT_ID,
        Token: refreshToken,
      }),
    );
  } catch (error) {
    mapCognitoError(error);
  }
};
