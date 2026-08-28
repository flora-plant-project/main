import { Router } from 'express';
import { send } from '../../lib/respond.js';
import { requireAuth } from '../../middleware/auth.js';

/**
 * Profiles and the follow graph.
 *
 * Authenticated throughout: every response is relative to the viewer (whether
 * they follow this person, whether they can see a post under review), so there
 * is no meaningful anonymous answer.
 *
 * @param {{service: ReturnType<import('./service.js').createUsersService>}} deps
 */
export function createUsersRoutes({ service }) {
  const router = Router();

  router.use(requireAuth);

  router.get('/:id', async (req, res) => {
    send(res, await service.get(req.user, req.params.id));
  });

  router.get('/:id/posts', async (req, res) => {
    send(res, await service.posts(req.user, req.params.id));
  });

  // The follow relationship is a resource that exists or does not, so PUT and
  // DELETE are both safe to repeat.
  router.put('/:id/follow', async (req, res) => {
    send(res, await service.follow(req.user, req.params.id));
  });

  router.delete('/:id/follow', async (req, res) => {
    send(res, await service.unfollow(req.user, req.params.id));
  });

  return router;
}
