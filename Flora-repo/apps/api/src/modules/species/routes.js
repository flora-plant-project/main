import { Router } from 'express';
import { send } from '../../lib/respond.js';

/**
 * @param {{service: ReturnType<import('./service.js').createSpeciesService>}} deps
 */
export function createSpeciesRoutes({ service }) {
  const router = Router();

  // One route for browse and search: `?q=` present means search. A blank `q=`
  // is a search for nothing, not a browse — the client contract expects
  // VALIDATION there, so it must not fall through to list().
  router.get('/', async (req, res) => {
    const query = req.query.q;
    send(res, query === undefined ? await service.list() : await service.search(query));
  });

  router.get('/:id', async (req, res) => {
    send(res, await service.get(req.params.id));
  });

  return router;
}
