import { Router } from 'express';
import { send } from '../../lib/respond.js';
import { requireAuth } from '../../middleware/auth.js';

/**
 * Community post routes.
 *
 * Reads are open to anonymous callers and writes are not — the same split the
 * mock client makes. An anonymous reader simply gets `likedByMe: false` and
 * sees nothing that is under review.
 *
 * @param {{service: ReturnType<import('./service.js').createPostsService>}} deps
 */
export function createPostsRoutes({ service }) {
  const router = Router();

  router.get('/', async (req, res) => {
    send(res, await service.list(req.user, req.query));
  });

  router.post('/', requireAuth, async (req, res) => {
    send(res, await service.create(req.user, req.body), 201);
  });

  router.get('/:id', async (req, res) => {
    send(res, await service.get(req.user, req.params.id));
  });

  router.get('/:id/comments', async (req, res) => {
    send(res, await service.comments(req.user, req.params.id, req.query));
  });

  router.post('/:id/comments', requireAuth, async (req, res) => {
    send(res, await service.comment(req.user, req.params.id, req.body?.body), 201);
  });

  // PUT/DELETE rather than POST /like + POST /unlike: a like is a thing that
  // either exists or does not, which is what makes both verbs idempotent.
  router.put('/:id/like', requireAuth, async (req, res) => {
    send(res, await service.like(req.user, req.params.id));
  });

  router.delete('/:id/like', requireAuth, async (req, res) => {
    send(res, await service.unlike(req.user, req.params.id));
  });

  return router;
}

/**
 * The feed is its own top-level resource, not `/posts?feed=1`: it is
 * viewer-scoped and paginated, where /posts is a plain collection.
 *
 * @param {{service: ReturnType<import('./service.js').createPostsService>}} deps
 */
export function createFeedRoutes({ service }) {
  const router = Router();

  router.get('/', requireAuth, async (req, res) => {
    send(res, await service.feed(req.user, req.query));
  });

  return router;
}
