import { z } from 'zod';
import { AdoptSpeciesSchema, ErrorCode, fail, ok } from '@flora/shared';
import { IdSchema, parseWith } from '../../lib/validate.js';
import { binomial } from './catalog.js';

const SearchQuerySchema = z.string().trim().min(1);

/**
 * Create the species catalog service.
 *
 * `searchNames` and `describe` are what make the catalog open-ended rather than
 * the fixed ten it used to be. Both are optional: without them the service
 * still answers list/search/get exactly as before, which is what keeps the unit
 * tests that never wanted a network or a model working unchanged.
 *
 * @param {{
 *   prisma: import('@prisma/client').PrismaClient,
 *   searchNames?: (query: string) => Promise<Array<{scientificName: string, commonNames: string[]}>>,
 *   describe?: (species: {scientificName: string, commonNames: string[]}) => Promise<{profile: object, generated: boolean}>,
 *   logger?: Pick<Console, 'error'>,
 * }} deps
 */
export function createSpeciesService({ prisma, searchNames, describe, logger = console }) {
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

    /**
     * Species the catalog does NOT have yet, from the provider's name database.
     *
     * Separate from `search` rather than folded into it, deliberately. `search`
     * answers "what do I already know about", and a screen that adds a plant
     * from it can trust every row has an id. `suggest` answers "what else
     * exists", and its rows have no id until someone adopts one. Keeping them
     * apart means neither caller has to branch on whether a row is real.
     *
     * Anything already in the catalog is filtered out: a suggestion you can
     * already find by searching is just a confusing duplicate.
     *
     * @param {unknown} query
     */
    async suggest(query) {
      const { data, error } = parseWith(SearchQuerySchema, query);
      if (error) return error;

      if (!searchNames) return ok([]);

      let found;
      try {
        found = await searchNames(data);
      } catch (cause) {
        logger.error('[species] name search failed:', cause);
        return fail(ErrorCode.PROVIDER_ERROR, 'Could not reach the species database');
      }

      const known = new Set(
        (await prisma.species.findMany({ select: { scientificName: true } })).map((row) =>
          binomial(row.scientificName),
        ),
      );

      return ok(found.filter((entry) => !known.has(binomial(entry.scientificName))));
    },

    /**
     * Give a species a catalog row so a plant can point at it.
     *
     * Idempotent on the binomial, which is what makes it safe to call from a
     * button: two people adopting the same plant, or one person double-tapping,
     * converge on the same row instead of racing to create duplicates. The
     * provider's authority citations and cultivar suffixes are normalized away
     * for the same reason — "Ocimum basilicum L." must not become a second basil.
     *
     * The care profile is written by the model at this moment rather than when
     * the plant is watered, because it is per-species data that many plants
     * will share, and because the person is waiting on exactly one thing.
     *
     * @param {unknown} input
     */
    async adopt(input) {
      const { data, error } = parseWith(AdoptSpeciesSchema, input);
      if (error) return error;

      const key = binomial(data.scientificName);
      if (!key) {
        return fail(ErrorCode.VALIDATION, 'scientificName must name a genus and species');
      }

      // Exact name first — it is the unique index, and the common case is a
      // second person adopting a species someone already added under the same
      // spelling. Only then fall back to comparing binomials across the table,
      // which is what catches a provider's decorated name ("Ocimum basilicum
      // L.") matching a plain row. The table is the curated ten plus whatever
      // has been adopted, so the scan stays small by construction.
      const exact = await prisma.species.findUnique({
        where: { scientificName: data.scientificName },
      });
      if (exact) return ok(exact);

      const existing = (await prisma.species.findMany()).find(
        (row) => binomial(row.scientificName) === key,
      );
      if (existing) return ok(existing);

      const { profile, generated } = describe
        ? await describe({ scientificName: data.scientificName, commonNames: data.commonNames })
        : { profile: null, generated: false };

      if (!profile) {
        return fail(ErrorCode.INTERNAL, 'No care profile source is configured');
      }

      // Adopted species sort after the curated ten. sortOrder is the curator's
      // ordering and nobody curated this one, so it takes the back of the queue
      // rather than interleaving with hand-placed rows.
      const created = await prisma.species.create({
        data: {
          scientificName: data.scientificName,
          commonNames: data.commonNames,
          care: profile.care,
          zoneMultipliers: profile.zoneMultipliers,
          source: 'ADOPTED',
          sortOrder: 1000,
        },
      });

      logger.info?.(
        `[species] adopted ${created.scientificName} ` +
          `(care profile ${generated ? 'written by the model' : 'defaulted — model unavailable'})`,
      );
      return ok(created);
    },
  };
}
