import { Router } from 'express';
import { send } from '../../lib/respond.js';
import { requireAuth } from '../../middleware/auth.js';

/**
 * @param {{service: ReturnType<import('./service.js').createDevicesService>}} deps
 */
export function createDevicesRoutes({ service }) {
  const router = Router();

  router.post('/', requireAuth, async (req, res) => {
    send(res, await service.register(req.user, req.body), 201);
  });

  return router;
}
