import { z } from 'zod';
import { ErrorCode, fail } from '@flora/shared';

/** Path/route identifiers. */
export const IdSchema = z.string().min(1);

/**
 * Cursor pagination options.
 *
 * The cursor is a numeric offset rendered as a string. Opaque to the client by
 * convention, which is what lets it become a real keyset cursor later without a
 * client change.
 */
export const PageOptionsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/** Default page size, matching the mock client. */
export const DEFAULT_PAGE_LIMIT = 10;

/**
 * Parse with a zod schema, converting a failure into a VALIDATION ApiResponse.
 *
 * Mirrors the mock client's parseWith — same first-issue-wins rule and same
 * `path: message` formatting — so the contract suite sees identical validation
 * messages from either client.
 *
 * @template T
 * @param {import('zod').ZodType<T>} schema
 * @param {unknown} input
 * @returns {{data: T, error: null} | {data: null, error: import('@flora/shared/src/types.js').ApiResponse<never>}}
 */
export function parseWith(schema, input) {
  const result = schema.safeParse(input);
  if (result.success) return { data: result.data, error: null };

  const issue = result.error.issues[0];
  const path = issue.path.join('.');
  return {
    data: null,
    error: fail(ErrorCode.VALIDATION, path ? `${path}: ${issue.message}` : issue.message),
  };
}

/**
 * Slice an already-ordered array into a page.
 *
 * @template T
 * @param {T[]} items
 * @param {{cursor?: string, limit?: number}} options
 * @returns {{items: T[], nextCursor: string|null}}
 */
export function paginate(items, { cursor, limit } = {}) {
  const start = cursor ? Number(cursor) : 0;
  const size = limit ?? DEFAULT_PAGE_LIMIT;
  const next = start + size;
  return {
    items: items.slice(start, next),
    nextCursor: next < items.length ? String(next) : null,
  };
}
