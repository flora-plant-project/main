import { Router } from 'express';
import { send } from '../../lib/respond.js';
import { requireAuth } from '../../middleware/auth.js';

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

  // Declared before '/:id' or Express would read "suggest" as a species id.
  router.get('/suggest', async (req, res) => {
    send(res, await service.suggest(req.query.q));
  });

  // Authenticated: this writes a row and, on the live path, spends a model call
  // doing it. Anonymous callers get no say in what enters the catalog.
  router.post('/adopt', requireAuth, async (req, res) => {
    send(res, await service.adopt(req.body));
  });

  router.get('/:id', async (req, res) => {
    send(res, await service.get(req.params.id));
  });

  return router;
}
