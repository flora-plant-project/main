import { asyncHandler } from '../../lib/asyncHandler';
import { ok } from '../../lib/apiResponse';
import * as authService from './auth.service';
import type { LoginInput, LogoutInput, SignupInput } from './auth.schema';

/**
 * Controllers stay deliberately thin: read the already-validated body, call the service,
 * shape the HTTP response. No business logic, no database access, no AWS calls.
 *
 * The `as` casts are safe because `validate()` has already parsed and replaced the body
 * with the schema's output — Express types `req.body` as `any` regardless.
 */

export const signup = asyncHandler(async (req, res) => {
  const result = await authService.signup(req.body as SignupInput);
  // 201: signup creates the account and returns an active session.
  res.status(201).json(ok(result));
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body as LoginInput);
  res.json(ok(result));
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.body as LogoutInput);
  // Nothing meaningful to return; the contract has no empty-payload variant.
  res.json(ok(null));
});
