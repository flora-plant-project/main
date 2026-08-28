import { Router } from 'express';
import { send } from '../../lib/respond.js';
import { requireAuth } from '../../middleware/auth.js';

/**
 * Diagnosis routes. Thin by design — everything decidable lives in service.js.
 * @param {{service: ReturnType<import('./service.js').createDiagnosisService>}} deps
 */
export function createDiagnosisRoutes({ service }) {
  const router = Router();

  // 202: the row exists, the recognition is still running. Poll the GET below.
  //
  // Anonymous scans are allowed. Identifying a plant is the app's front door —
  // requiring an account before the first scan would be the wrong trade — so
  // the row simply has no userId until someone signs in.
  router.post('/', async (req, res) => {
    send(res, await service.create(req.user, req.body), 202);
  });

  router.get('/:id', async (req, res) => {
    send(res, await service.get(req.params.id));
  });

  // Both of these write to a user's own data, so unlike the scan they need one.
  router.put('/:id/plant', requireAuth, async (req, res) => {
    send(res, await service.attach(req.user, req.params.id, req.body?.plantId));
  });

  router.post('/:id/escalate', requireAuth, async (req, res) => {
    send(res, await service.escalate(req.user, req.params.id), 201);
  });

  return router;
}
