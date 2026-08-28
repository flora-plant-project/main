import { ErrorCode } from '@flora/shared';

/**
 * ErrorCode -> HTTP status. The envelope carries the real code; this is for
 * proxies, logs and anything that reads status without parsing a body.
 */
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
 * @returns {number}
 */
export function statusFor(response, okStatus) {
  if (response.ok) return okStatus;
  return STATUS_BY_CODE[response.error.code] ?? 500;
}

/**
 * Send an ApiResponse with the status its code maps to.
 *
 * @param {import('express').Response} res
 * @param {import('@flora/shared/src/types.js').ApiResponse<unknown>} response
 * @param {number} [okStatus]
 */
export function send(res, response, okStatus = 200) {
  res.status(statusFor(response, okStatus)).json(response);
}
