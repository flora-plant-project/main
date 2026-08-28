import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as plantsController from './plants.controller';
import {
  createPlantSchema,
  listPlantsQuerySchema,
  plantIdParamSchema,
  updatePlantSchema,
} from './plants.schema';

const router = Router();

/** Router-level, so a route added later is authenticated by default. */
router.use(requireAuth);

router.get('/', validate({ query: listPlantsQuerySchema }), plantsController.list);

/** Referenced space is ownership-checked in the service, on create and on move. */
router.post('/', validate({ body: createPlantSchema }), plantsController.create);

router.get('/:id', validate({ params: plantIdParamSchema }), plantsController.get);

router.patch(
  '/:id',
  validate({ params: plantIdParamSchema, body: updatePlantSchema }),
  plantsController.update,
);

/** Cascades to the plant's diagnoses, growth logs and schedules — intended loss. */
router.delete('/:id', validate({ params: plantIdParamSchema }), plantsController.remove);

export default router;
