import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { fail } from '../lib/apiResponse';
import { AppError, ERROR_CODE, isAppError } from '../lib/errors';
import { env } from '../config/env';

/** Flatten zod issues into the contract's single `message` field. */
const formatZodError = (error: ZodError): string =>
  error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');

/**
 * Prisma's own errors are mapped here rather than in each service, so services stay
 * free of database-driver details.
 */
const fromPrismaError = (error: Prisma.PrismaClientKnownRequestError): AppError | null => {
  switch (error.code) {
    case 'P2002':
      return new AppError('That value is already taken.', 409, ERROR_CODE.CONFLICT);
    case 'P2025':
      return new AppError('Resource not found.', 404, ERROR_CODE.NOT_FOUND);
    case 'P2003':
      return new AppError('Referenced resource does not exist.', 400, ERROR_CODE.VALIDATION_ERROR);
    default:
      return null;
  }
};

const toAppError = (error: unknown): AppError | null => {
  if (isAppError(error)) return error;
  if (error instanceof ZodError) {
    return new AppError(formatZodError(error), 400, ERROR_CODE.VALIDATION_ERROR);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return fromPrismaError(error);
  }
  return null;
};

/** Unmatched route. Registered after all routers so it only sees genuine misses. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(fail(ERROR_CODE.NOT_FOUND, `Route ${req.method} ${req.path} not found.`));
};

/**
 * The only place an error becomes an HTTP response. Must keep all four parameters —
 * Express identifies error middleware by arity.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  // Response already streaming: hand off to Express, which will destroy the socket.
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = toAppError(error);

  if (appError && appError.isOperational) {
    res.status(appError.statusCode).json(fail(appError.code, appError.message));
    return;
  }

  // Unexpected — log everything we have, return nothing that reveals internals.
  console.error('[unhandled]', `${req.method} ${req.originalUrl}`, error);

  const message = env.isProduction
    ? 'Something went wrong.'
    : error instanceof Error
      ? error.message
      : String(error);

  res.status(appError?.statusCode ?? 500).json(fail(ERROR_CODE.INTERNAL_ERROR, message));
};
