import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Express 4 does not catch rejections from async handlers — an unhandled rejection there
 * hangs the request until the client times out, and never reaches the error middleware.
 * Wrapping forwards the rejection to `next`, so every async controller ends up in the
 * same error handler as a synchronous throw.
 *
 * Express 5 does this natively; this wrapper becomes removable on that upgrade.
 */
export const asyncHandler =
  (handler: AsyncRequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
