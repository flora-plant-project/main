import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as growthLogController from './growthLog.controller';
import {
  createGrowthLogSchema,
  growthLogIdParamSchema,
  growthLogUploadUrlSchema,
  listGrowthLogsQuerySchema,
  updateGrowthLogSchema,
} from './growthLog.schema';

const router = Router();

router.use(requireAuth);

/** Same two-step presigned upload as diagnosis; both share src/lib/s3.ts. */
router.post(
  '/upload-url',
  validate({ body: growthLogUploadUrlSchema }),
  growthLogController.uploadUrl,
);

router.post('/', validate({ body: createGrowthLogSchema }), growthLogController.create);

router.get('/', validate({ query: listGrowthLogsQuerySchema }), growthLogController.list);

router.get('/:id', validate({ params: growthLogIdParamSchema }), growthLogController.get);

/** Note only — the photo is immutable, see growthLog.schema.ts. */
router.patch(
  '/:id',
  validate({ params: growthLogIdParamSchema, body: updateGrowthLogSchema }),
  growthLogController.update,
);

router.delete(
  '/:id',
  validate({ params: growthLogIdParamSchema }),
  growthLogController.remove,
);

export default router;
