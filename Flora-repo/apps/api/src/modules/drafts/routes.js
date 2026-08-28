import { Router } from 'express';
import { ErrorCode } from '@flora/shared';

/** ErrorCode -> HTTP status. The envelope carries the real code; this is for proxies and logs. */
const STATUS_BY_CODE = Object.freeze({
  [ErrorCode.VALIDATION]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.PROVIDER_ERROR]: 502,
  [ErrorCode.INTERNAL]: 500,
});

/**
 * @param {import('@flora/shared/src/types.js').ApiResponse<unknown>} response
 * @param {number} okStatus
 */
function statusFor(response, okStatus) {
  if (response.ok) return okStatus;
  return STATUS_BY_CODE[response.error.code] ?? 500;
}

/**
 * Draft routes. Thin by design — everything decidable lives in service.js.
 *
 * NOTE: this is an unauthenticated endpoint that spends money on every call.
 * That is fine for local development and the offline demo, but it must go
 * behind the auth middleware — or a rate limit — before the API is deployed
 * anywhere reachable. See infra/README.md.
 *
 * @param {{service: ReturnType<import('./service.js').createDraftService>}} deps
 */
export function createDraftRoutes({ service }) {
  const router = Router();

  // 200, not 201: nothing was created. The body comes back for the composer.
  router.post('/post', async (req, res) => {
    const response = await service.post(req.body);
    res.status(statusFor(response, 200)).json(response);
  });

  return router;
}
