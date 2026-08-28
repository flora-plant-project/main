import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as diagnosisController from './diagnosis.controller';
import {
  createDiagnosisSchema,
  diagnosisIdParamSchema,
  listDiagnosesQuerySchema,
  uploadUrlSchema,
} from './diagnosis.schema';

const router = Router();

router.use(requireAuth);

/**
 * Two-step upload. Step 1 hands out a presigned S3 URL; the client PUTs the image
 * straight to S3, then calls step 2 with the returned key.
 *
 * Objects that are presigned and uploaded but never confirmed are cleaned up by an S3
 * lifecycle rule expiring the `uploads/` prefix after 24h — bucket configuration, not
 * application code.
 */
router.post('/upload-url', validate({ body: uploadUrlSchema }), diagnosisController.uploadUrl);

router.post('/', validate({ body: createDiagnosisSchema }), diagnosisController.create);

router.get('/', validate({ query: listDiagnosesQuerySchema }), diagnosisController.list);

router.get('/:id', validate({ params: diagnosisIdParamSchema }), diagnosisController.get);

export default router;
