import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as gardenController from './garden.controller';
import {
  createSpaceSchema,
  listSpacesQuerySchema,
  spaceIdParamSchema,
  updateSpaceSchema,
} from './garden.schema';

const router = Router();

/**
 * Applied once, at the router level, rather than per route. A route added later is then
 * authenticated by default — making a route public becomes a deliberate act instead of
 * an omission nobody notices in review.
 *
 * Ownership is a separate concern and is enforced in the service layer: this only
 * establishes *who* is asking.
 */
router.use(requireAuth);

router.get('/', validate({ query: listSpacesQuerySchema }), gardenController.list);

router.post('/', validate({ body: createSpaceSchema }), gardenController.create);

router.get('/:id', validate({ params: spaceIdParamSchema }), gardenController.get);

router.patch(
  '/:id',
  validate({ params: spaceIdParamSchema, body: updateSpaceSchema }),
  gardenController.update,
);

/** Refuses with 409 if the space still has plants — see deleteSpace in the service. */
router.delete('/:id', validate({ params: spaceIdParamSchema }), gardenController.remove);

export default router;
