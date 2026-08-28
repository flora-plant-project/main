import { RegisterDeviceSchema, ok } from '@flora/shared';
import { parseWith } from '../../lib/validate.js';

/**
 * Create the push-device service.
 * @param {{prisma: import('@prisma/client').PrismaClient}} deps
 */
export function createDevicesService({ prisma }) {
  return {
    /**
     * Register a push token for the signed-in user.
     *
     * Upserts on (userId, pushToken): the app re-registers on every launch, and
     * without this the table would grow a row per cold start. The reminder
     * dispatcher in services/workers reads these.
     *
     * Returns only `{ registered: true }` — the row's id is of no use to the
     * client, which addresses the device by its token.
     */
    async register(user, input) {
      const { data, error } = parseWith(RegisterDeviceSchema, input);
      if (error) return error;

      await prisma.device.upsert({
        where: { userId_pushToken: { userId: user.id, pushToken: data.pushToken } },
        create: { userId: user.id, pushToken: data.pushToken, platform: data.platform },
        // A device can be reinstalled onto the other platform under the same
        // token in dev; keep the record honest.
        update: { platform: data.platform },
      });

      return ok({ registered: true });
    },
  };
}
