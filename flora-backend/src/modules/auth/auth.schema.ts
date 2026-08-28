import { z } from 'zod';

/**
 * Username is the only identifier we have — there is no email — so it is immutable in
 * practice and worth constraining tightly. ASCII only: Cognito accepts unicode
 * usernames, but mixing Arabic script with case-insensitive lookups and RTL rendering
 * invites lookalike-character impersonation in the community feed.
 */
const username = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters.')
  .max(30, 'Username must be at most 30 characters.')
  .regex(
    /^[a-zA-Z0-9._]+$/,
    'Username may contain only letters, numbers, dots and underscores.',
  );

/**
 * Mirrors the Cognito default password policy so validation fails here, with a clear
 * message, rather than as an opaque InvalidPasswordException from AWS.
 * If the pool policy is changed, change this with it.
 */
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(256, 'Password must be at most 256 characters.')
  .regex(/[a-z]/, 'Password must contain a lowercase letter.')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter.')
  .regex(/[0-9]/, 'Password must contain a number.');

export const signupSchema = z.object({
  username,
  password,
  /** Drives care guidance and notification language; defaults to English. */
  language: z.enum(['AR', 'EN']).default('EN'),
});

/**
 * NOTE: no rate limiter exists yet, so this endpoint is brute-forceable. Known
 * pre-production gap. With no account recovery, a locked-out user has no path back,
 * which makes a limiter's lockout behaviour worth designing carefully when one is added.
 */
export const loginSchema = z.object({
  username,
  // Deliberately unconstrained: an existing password predating a policy change must
  // still be submittable, and echoing rules on login leaks the policy.
  password: z.string().min(1, 'Password is required.'),
});

/**
 * Logout revokes the refresh token, which ends the persistent session. Any access token
 * already issued stays valid until it expires — revocation is not immediate.
 */
export const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required.'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
