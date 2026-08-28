import { CreateScheduleSchema, ErrorCode, fail, ok } from '@flora/shared';
import { IdSchema, parseWith } from '../../lib/validate.js';
import { scheduleView } from '../../lib/views.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Create the care-schedule service.
 * @param {{prisma: import('@prisma/client').PrismaClient}} deps
 */
export function createSchedulesService({ prisma }) {
  /**
   * @param {string} ownerId
   * @param {string} plantId
   */
  const findOwned = (ownerId, plantId) =>
    prisma.plant.findFirst({ where: { id: plantId, ownerId } });

  return {
    /** Care schedules for one plant. */
    async list(user, plantId) {
      const check = parseWith(IdSchema, plantId);
      if (check.error) return check.error;

      const plant = await findOwned(user.id, check.data);
      if (!plant) return fail(ErrorCode.NOT_FOUND, `plant ${check.data} not found`);

      const schedules = await prisma.schedule.findMany({
        where: { plantId: plant.id },
        orderBy: { createdAt: 'asc' },
      });
      return ok(schedules.map(scheduleView));
    },

    /**
     * Add or update a care schedule.
     *
     * Upserts on (plantId, type) — setting a new interval replaces the existing
     * schedule rather than stacking a second one, which is what the user means
     * by "water every 3 days instead". The unique index makes that atomic.
     *
     * Changing the WATER interval re-anchors the plant's nextDueAt from its last
     * watering, so the countdown on the garden screen updates immediately
     * instead of waiting for the next markWatered.
     */
    async create(user, plantId, input) {
      const idCheck = parseWith(IdSchema, plantId);
      if (idCheck.error) return idCheck.error;

      const { data, error } = parseWith(CreateScheduleSchema, input);
      if (error) return error;

      const plant = await findOwned(user.id, idCheck.data);
      if (!plant) return fail(ErrorCode.NOT_FOUND, `plant ${idCheck.data} not found`);

      const schedule = await prisma.schedule.upsert({
        where: { plantId_type: { plantId: plant.id, type: data.type } },
        create: {
          plantId: plant.id,
          type: data.type,
          intervalDays: data.intervalDays ?? null,
        },
        // Omitting intervalDays means "leave the cadence alone" — only the rows
        // the caller actually supplied are touched.
        update: data.intervalDays === undefined ? {} : { intervalDays: data.intervalDays },
      });

      if (data.type === 'WATER' && data.intervalDays && plant.lastWateredAt) {
        await prisma.plant.update({
          where: { id: plant.id },
          data: {
            nextDueAt: new Date(plant.lastWateredAt.getTime() + data.intervalDays * DAY_MS),
          },
        });
      }

      return ok(scheduleView(schedule));
    },
  };
}
