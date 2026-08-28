import type { RequestHandler } from 'express';
import type { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../lib/errors';

interface RequestSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

type RequestPart = keyof RequestSchemas;

const formatIssues = (part: RequestPart, error: ZodError): string =>
  error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${part}.${path}: ${issue.message}` : `${part}: ${issue.message}`;
    })
    .join('; ');

/**
 * Validates the request against per-part zod schemas and swaps in the parsed values.
 *
 * Two things follow from replacing rather than merely checking: controllers get numbers
 * and dates instead of strings, and unknown keys are stripped, so a client cannot smuggle
 * extra fields into a Prisma call.
 *
 * NOTE: `req.query` is writable on Express 4. Express 5 makes it a getter — this
 * assignment is what will need reworking on that upgrade.
 */
export const validate = (schemas: RequestSchemas): RequestHandler => {
  const parts = Object.keys(schemas) as RequestPart[];

  return (req, _res, next) => {
    for (const part of parts) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part]);

      if (!result.success) {
        next(new ValidationError(formatIssues(part, result.error)));
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any)[part] = result.data;
    }

    next();
  };
};
