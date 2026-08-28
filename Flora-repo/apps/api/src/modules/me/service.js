import { UpdateMeSchema, ok } from '@flora/shared';
import { parseWith } from '../../lib/validate.js';
import { publicUser } from '../auth/service.js';

/**
 * Create the profile service.
 * @param {{prisma: import('@prisma/client').PrismaClient}} deps
 */
export function createMeService({ prisma }) {
  return {
    /**
     * Update the signed-in user's profile.
     *
     * Climate zone is the only editable field today, and it is not cosmetic:
     * every watering interval is scaled by it (see plants.markWatered).
     *
     * @param {{id: string}} user
     * @param {unknown} input
     */
    async update(user, input) {
      const { data, error } = parseWith(UpdateMeSchema, input);
      if (error) return error;

      const updated = await prisma.user.update({ where: { id: user.id }, data });
      return ok({ user: publicUser(updated) });
    },
  };
}
