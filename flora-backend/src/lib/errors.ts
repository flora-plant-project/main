/**
 * Typed application errors. Services throw these; the error middleware is the only
 * place that turns them into an HTTP response.
 *
 * `isOperational` marks an error we anticipated (bad input, missing row, denied access).
 * Anything else — a bug, a dead connection — is non-operational and is reported to the
 * client as a generic 500 so internals never leak.
 */

export const ERROR_CODE = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: ErrorCode, isOperational = true) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, new.target);
  }
}

/** Request body, params, or query failed validation. Zod issues are flattened into `message`. */
export class ValidationError extends AppError {
  constructor(message = 'Invalid request.') {
    super(message, 400, ERROR_CODE.VALIDATION_ERROR);
  }
}

/** No credentials, or a token that failed verification. */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.') {
    super(message, 401, ERROR_CODE.UNAUTHORIZED);
  }
}

/**
 * Authenticated, but not allowed. Note: for another user's private records, services
 * should prefer NotFoundError — a 403 confirms the row exists.
 */
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource.') {
    super(message, 403, ERROR_CODE.FORBIDDEN);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found.') {
    super(message, 404, ERROR_CODE.NOT_FOUND);
  }
}

/** Uniqueness or state conflict — duplicate username, double like, already following. */
export class ConflictError extends AppError {
  constructor(message = 'Resource already exists.') {
    super(message, 409, ERROR_CODE.CONFLICT);
  }
}

/** A dependency we do not control failed: Cognito, S3, the recognition provider. */
export class UpstreamError extends AppError {
  constructor(message = 'An upstream service is unavailable.') {
    super(message, 502, ERROR_CODE.UPSTREAM_ERROR);
  }
}

/** Thrown deliberately; unexpected throws are wrapped by the error middleware instead. */
export class InternalError extends AppError {
  constructor(message = 'Something went wrong.') {
    super(message, 500, ERROR_CODE.INTERNAL_ERROR, false);
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;
