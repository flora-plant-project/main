import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as scheduleController from './wateringSchedule.controller';
import {
  createWateringScheduleSchema,
  listWateringSchedulesQuerySchema,
  updateWateringScheduleSchema,
  wateringScheduleIdParamSchema,
} from './wateringSchedule.schema';

const router = Router();

router.use(requireAuth);

/**
 * We own the schedule data and its CRUD only. Dispatch is a teammate's concern: their
 * EventBridge-triggered Lambda polls for `active = true AND nextDueAt <= now()` and sends
 * the push through SNS. Nothing in this module sends anything.
 */
router.post('/', validate({ body: createWateringScheduleSchema }), scheduleController.create);

router.get(
  '/',
  validate({ query: listWateringSchedulesQuerySchema }),
  scheduleController.list,
);

router.get(
  '/:id',
  validate({ params: wateringScheduleIdParamSchema }),
  scheduleController.get,
);

/** Setting `active: true` transactionally deactivates the plant's current schedule. */
router.patch(
  '/:id',
  validate({ params: wateringScheduleIdParamSchema, body: updateWateringScheduleSchema }),
  scheduleController.update,
);

router.delete(
  '/:id',
  validate({ params: wateringScheduleIdParamSchema }),
  scheduleController.remove,
);

export default router;
