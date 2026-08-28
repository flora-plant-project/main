import { z } from 'zod';
import { CreatePlantSchema, ErrorCode, fail, ok } from '@flora/shared';
import { IdSchema, PageOptionsSchema, paginate, parseWith } from '../../lib/validate.js';
import { identityImage, noopAttach } from '../../lib/media.js';
import { growthLogView, plantView, scheduleView } from '../../lib/views.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fallback cadence for a plant whose species is unknown or uncatalogued. */
const DEFAULT_WATER_EVERY_DAYS = 7;

/** A growth log is a photo, a note, or both — but not nothing. */
const GrowthLogSchema = z
  .object({ photoKey: z.string().optional(), note: z.string().optional() })
  .refine((log) => Boolean(log.photoKey) || Boolean(log.note), {
    message: 'a growth log needs a photo or a note',
    path: ['note'],
  });

/**
 * Days between waterings for this plant, for this owner.
 *
 * The species sets a base cadence and the owner's climate zone scales it: cool
 * mountain air stretches the interval, the hot dry Bekaa shortens it. Rounded
 * and floored at 1 so an aggressive multiplier can never produce a zero-day
 * (or negative) interval, which would make nextDueAt land in the past.
 *
 * @param {{care: object, zoneMultipliers: object}|null|undefined} species
 * @param {string} climateZone
 * @returns {number}
 */
export function wateringIntervalDays(species, climateZone) {
  const base = species?.care?.waterEveryDays ?? DEFAULT_WATER_EVERY_DAYS;
  const multiplier = species?.zoneMultipliers?.[climateZone] ?? 1;
  return Math.max(1, Math.round(base * multiplier));
}

/**
 * Create the plants service.
 * @param {{
 *   prisma: import('@prisma/client').PrismaClient,
 *   mapImage?: (value: string|null) => (string|null),
 *   attachImages?: (...values: any[]) => Promise<void>,
 *   now?: () => number,
 * }} deps
 */
export function createPlantsService({
  prisma,
  mapImage = identityImage,
  attachImages = noopAttach,
  now = Date.now,
}) {
  /**
   * Fetch a plant the user owns, or the NOT_FOUND envelope.
   *
   * Ownership is part of the lookup, not a check after it: a plant belonging to
   * someone else must be indistinguishable from one that does not exist.
   *
   * @param {string} ownerId
   * @param {string} plantId
   */
  async function findOwned(ownerId, plantId) {
    const plant = await prisma.plant.findFirst({ where: { id: plantId, ownerId } });
    return plant ?? null;
  }

  return {
    /** The session user's plants, newest first. */
    async list(user) {
      const plants = await prisma.plant.findMany({
        where: { ownerId: user.id },
        orderBy: { createdAt: 'asc' },
      });
      return ok(plants.map((plant) => plantView(plant, mapImage)));
    },

    /** One plant with its schedules and growth logs. */
    async get(user, id) {
      const check = parseWith(IdSchema, id);
      if (check.error) return check.error;

      const plant = await prisma.plant.findFirst({
        where: { id: check.data, ownerId: user.id },
        include: {
          schedules: { orderBy: { createdAt: 'asc' } },
          growthLogs: { orderBy: { createdAt: 'asc' } },
        },
      });
      if (!plant) return fail(ErrorCode.NOT_FOUND, `plant ${check.data} not found`);

      return ok({
        ...plantView(plant, mapImage),
        schedules: plant.schedules.map(scheduleView),
        growthLogs: plant.growthLogs.map((log) => growthLogView(log, mapImage)),
      });
    },

    /** Add a plant to the user's garden. */
    async create(user, input) {
      const { data, error } = parseWith(CreatePlantSchema, input);
      if (error) return error;

      // A speciesId the catalog does not know would fail the foreign key with a
      // 500; treat it as what it is — bad input.
      if (data.speciesId) {
        const species = await prisma.species.findUnique({ where: { id: data.speciesId } });
        if (!species) return fail(ErrorCode.VALIDATION, `speciesId: ${data.speciesId} not found`);
      }

      const plant = await prisma.plant.create({
        data: {
          ownerId: user.id,
          nickname: data.nickname,
          speciesId: data.speciesId ?? null,
          photoKey: data.photoKey ?? null,
        },
      });
      await attachImages(plant.photoKey);
      return ok(plantView(plant, mapImage));
    },

    /**
     * Record a watering and schedule the next one.
     *
     * lastWateredAt and nextDueAt are derived from a single instant so the gap
     * between them is exactly the interval — the client renders the countdown
     * from their difference.
     */
    async markWatered(user, plantId) {
      const check = parseWith(IdSchema, plantId);
      if (check.error) return check.error;

      const plant = await prisma.plant.findFirst({
        where: { id: check.data, ownerId: user.id },
        include: {
          species: true,
          // Newest first: a grower who changes their mind twice means the last
          // interval they set, not the first.
          schedules: { where: { type: 'WATER' }, orderBy: { createdAt: 'desc' } },
        },
      });
      if (!plant) return fail(ErrorCode.NOT_FOUND, `plant ${check.data} not found`);

      // A custom WATER schedule wins over the species default: the grower is
      // looking at the actual pot. A schedule with no intervalDays is the
      // add-plant flow's auto-schedule, which expresses no opinion — reading it
      // as zero would set nextDueAt to the moment of watering.
      const custom = plant.schedules.find((schedule) => schedule.intervalDays);
      const intervalDays =
        custom?.intervalDays ?? wateringIntervalDays(plant.species, user.climateZone);
      const wateredAt = new Date(now());
      const nextDueAt = new Date(wateredAt.getTime() + intervalDays * DAY_MS);

      const updated = await prisma.plant.update({
        where: { id: plant.id },
        data: { lastWateredAt: wateredAt, nextDueAt },
      });

      return ok({
        plantId: updated.id,
        wateredAt: wateredAt.toISOString(),
        nextDueAt: nextDueAt.toISOString(),
      });
    },

    logs: {
      /** Append a growth log entry. */
      async create(user, plantId, input) {
        const idCheck = parseWith(IdSchema, plantId);
        if (idCheck.error) return idCheck.error;

        const { data, error } = parseWith(GrowthLogSchema, input);
        if (error) return error;

        const plant = await findOwned(user.id, idCheck.data);
        if (!plant) return fail(ErrorCode.NOT_FOUND, `plant ${idCheck.data} not found`);

        const log = await prisma.growthLog.create({
          data: {
            plantId: plant.id,
            photoKey: data.photoKey ?? null,
            note: data.note ?? null,
          },
        });
        await attachImages(log.photoKey);
        return ok(growthLogView(log, mapImage));
      },
    },

    /**
     * The plant's history: growth logs and completed diagnoses interleaved,
     * newest first, cursor-paginated.
     *
     * Merged in memory rather than in SQL. A UNION over two tables with
     * different columns would need either a materialized view or a hand-written
     * query that Prisma cannot type, and a single plant's history is small
     * enough that fetching both sides costs less than that complexity. Revisit
     * if a plant ever accumulates thousands of entries.
     */
    async timeline(user, plantId, options) {
      const idCheck = parseWith(IdSchema, plantId);
      if (idCheck.error) return idCheck.error;

      const { data, error } = parseWith(PageOptionsSchema, options ?? {});
      if (error) return error;

      const plant = await findOwned(user.id, idCheck.data);
      if (!plant) return fail(ErrorCode.NOT_FOUND, `plant ${idCheck.data} not found`);

      const [logs, diagnoses] = await Promise.all([
        prisma.growthLog.findMany({ where: { plantId: plant.id } }),
        // PENDING and FAILED runs are noise in a history view — the result
        // screen is where an in-flight scan belongs.
        prisma.diagnosis.findMany({ where: { plantId: plant.id, status: 'COMPLETE' } }),
      ]);

      const items = [
        ...logs.map((log) => ({
          type: 'log',
          id: log.id,
          createdAt: log.createdAt.toISOString(),
          photoKey: mapImage(log.photoKey),
          note: log.note,
        })),
        ...diagnoses.map((diagnosis) => ({
          type: 'diagnosis',
          id: diagnosis.id,
          createdAt: diagnosis.createdAt.toISOString(),
          isHealthy: diagnosis.result?.health?.isHealthy ?? null,
          topIssue: diagnosis.result?.health?.issues?.[0]?.name ?? null,
          confidence: diagnosis.result?.health?.confidence ?? null,
          lowConfidence: diagnosis.lowConfidence,
        })),
      ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

      return ok(paginate(items, data));
    },
  };
}
