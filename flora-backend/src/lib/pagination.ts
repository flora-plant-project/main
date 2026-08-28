import { Prisma } from '@prisma/client';
import { z } from 'zod';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * Cursor pagination, keyed on `(createdAt DESC, id DESC)`.
 *
 * Offset pagination is wrong for a live feed: a post created between page 1 and page 2
 * shifts every subsequent row, so the client sees duplicates and silently misses others.
 * A cursor anchors on a row, so insertions ahead of it change nothing.
 *
 * `createdAt` alone cannot be the key — it is not unique, and a tie straddling the page
 * boundary drops or repeats rows. The `id` tiebreaker makes the ordering total.
 */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  /** Validated as a well-formed id here; whether it resolves is decided at query time. */
  cursor: z.string().uuid('Invalid cursor.').optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Page<T> {
  items: T[];
  /** Null means this is the last page — the client stops without a wasted request. */
  nextCursor: string | null;
}

/** Stable total ordering. Every paginated query must use exactly this. */
export const CURSOR_ORDER_BY = [{ createdAt: 'desc' }, { id: 'desc' }] as const;

interface CursorArgs {
  take: number;
  cursor?: { id: string };
  skip?: number;
}

const emptyPage = <T>(): Page<T> => ({ items: [], nextCursor: null });

/**
 * Runs a cursor-paginated query.
 *
 * Two behaviours callers inherit rather than reimplement:
 *
 *  1. It fetches `limit + 1` rows as a probe. Without the extra row there is no way to
 *     tell a full final page from a full page with more behind it, so the last page
 *     would carry a non-null cursor and the client would burn a round-trip discovering
 *     an empty result.
 *
 *  2. A cursor that does not resolve — deleted row, or an id from outside the caller's
 *     scope — yields an empty page rather than an error. Same rule as everywhere else:
 *     an out-of-scope reference is indistinguishable from a nonexistent one, so it can
 *     never confirm that a row exists somewhere else in the system.
 */
export const paginate = async <T extends { id: string }>(
  query: PaginationQuery,
  fetch: (args: CursorArgs) => Promise<T[]>,
): Promise<Page<T>> => {
  const args: CursorArgs = {
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  };

  let rows: T[];
  try {
    rows = await fetch(args);
  } catch (error) {
    // P2025: Prisma could not resolve the cursor record.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return emptyPage<T>();
    }
    throw error;
  }

  if (rows.length > query.limit) {
    const items = rows.slice(0, query.limit);
    return { items, nextCursor: items[items.length - 1]!.id };
  }

  return { items: rows, nextCursor: null };
};

/** Maps a page's items while preserving the cursor — for public-shape conversion. */
export const mapPage = <T, U>(page: Page<T>, fn: (item: T) => U): Page<U> => ({
  items: page.items.map(fn),
  nextCursor: page.nextCursor,
});
