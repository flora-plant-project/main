import { Router } from 'express';
import { send } from '../../lib/respond.js';
import { requireAuth } from '../../middleware/auth.js';

/**
 * Plant routes, including the sub-resources that only exist under a plant:
 * growth logs, the timeline, and care schedules.
 *
 * A garden is private, so every route here is authenticated.
 *
 * @param {{
 *   service: ReturnType<import('./service.js').createPlantsService>,
 *   schedules: ReturnType<import('../schedules/service.js').createSchedulesService>,
 * }} deps
 */
export function createPlantsRoutes({ service, schedules }) {
  const router = Router();

  router.use(requireAuth);

  router.get('/', async (req, res) => {
    send(res, await service.list(req.user));
  });

  router.post('/', async (req, res) => {
    send(res, await service.create(req.user, req.body), 201);
  });

  router.get('/:id', async (req, res) => {
    send(res, await service.get(req.user, req.params.id));
  });

  // POST, not PATCH: recording a watering appends an event, and posting twice
  // means the plant was watered twice.
  router.post('/:id/water', async (req, res) => {
    send(res, await service.markWatered(req.user, req.params.id));
  });

  router.post('/:id/logs', async (req, res) => {
    send(res, await service.logs.create(req.user, req.params.id, req.body), 201);
  });

  router.get('/:id/timeline', async (req, res) => {
    send(res, await service.timeline(req.user, req.params.id, req.query));
  });

  router.get('/:id/schedules', async (req, res) => {
    send(res, await schedules.list(req.user, req.params.id));
  });

  router.post('/:id/schedules', async (req, res) => {
    send(res, await schedules.create(req.user, req.params.id, req.body), 201);
  });

  return router;
}
