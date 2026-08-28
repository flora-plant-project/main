import { z } from 'zod';
import { ErrorCode, fail, ok } from '@flora/shared';
import { IdSchema, parseWith } from '../../lib/validate.js';

const SearchQuerySchema = z.string().trim().min(1);

/**
 * Create the species catalog service.
 * @param {{prisma: import('@prisma/client').PrismaClient}} deps
 */
export function createSpeciesService({ prisma }) {
  return {
    /** The whole catalog, in the curator's order. */
    async list() {
      return ok(await prisma.species.findMany({ orderBy: { sortOrder: 'asc' } }));
    },

    /**
     * Case-insensitive substring search across the scientific name and every
     * common name, English and Arabic alike.
     *
     * Raw SQL because the match has to reach inside a text[]: Prisma's array
     * filters are exact-membership only, and `commonNames: { has: q }` would
     * miss "basil" inside "Sweet basil". `unnest` + ILIKE does the substring
     * match per element, and ILIKE is already Unicode-aware so Arabic works
     * without a separate path.
     *
     * @param {unknown} query
     */
    async search(query) {
      const { data, error } = parseWith(SearchQuerySchema, query);
      if (error) return error;

      // Escape the LIKE metacharacters so a query of "100%" is a literal search.
      const pattern = `%${data.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

      return ok(
        await prisma.$queryRaw`
          SELECT * FROM "Species"
          WHERE "scientificName" ILIKE ${pattern}
             OR EXISTS (
               SELECT 1 FROM unnest("commonNames") AS name WHERE name ILIKE ${pattern}
             )
          ORDER BY "sortOrder" ASC
        `,
      );
    },

    /**
     * One species by id.
     * @param {unknown} id
     */
    async get(id) {
      const { data, error } = parseWith(IdSchema, id);
      if (error) return error;

      const species = await prisma.species.findUnique({ where: { id: data } });
      return species ? ok(species) : fail(ErrorCode.NOT_FOUND, `species ${data} not found`);
    },
  };
}
