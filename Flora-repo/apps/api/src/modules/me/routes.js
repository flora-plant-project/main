import { Router } from 'express';
import { send } from '../../lib/respond.js';
import { requireAuth } from '../../middleware/auth.js';

/**
 * @param {{service: ReturnType<import('./service.js').createMeService>}} deps
 */
export function createMeRoutes({ service }) {
  const router = Router();

  router.patch('/', requireAuth, async (req, res) => {
    send(res, await service.update(req.user, req.body));
  });

  return router;
}
