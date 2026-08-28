import { asyncHandler } from '../../lib/asyncHandler';
import { ok } from '../../lib/apiResponse';
import { currentUserId } from '../../lib/currentUser';
import * as diagnosisService from './diagnosis.service';
import type {
  CreateDiagnosisInput,
  DiagnosisIdParam,
  ListDiagnosesQuery,
  UploadUrlInput,
} from './diagnosis.schema';

/** Step 1 of the two-step upload: issue a presigned S3 URL. */
export const uploadUrl = asyncHandler(async (req, res) => {
  const { contentType } = req.body as UploadUrlInput;
  const result = await diagnosisService.createUploadUrl(currentUserId(req), contentType);
  res.json(ok(result));
});

/** Step 2: confirm the uploaded object and run recognition against it. */
export const create = asyncHandler(async (req, res) => {
  const result = await diagnosisService.createDiagnosis(
    currentUserId(req),
    req.body as CreateDiagnosisInput,
  );
  res.status(201).json(ok(result));
});

export const list = asyncHandler(async (req, res) => {
  const results = await diagnosisService.listDiagnoses(
    currentUserId(req),
    // Double cast: paginated query shapes carry a defaulted `limit`, which ParsedQs
    // cannot overlap. validate() has already replaced req.query with the parsed output.
    req.query as unknown as ListDiagnosesQuery,
  );
  res.json(ok(results));
});

export const get = asyncHandler(async (req, res) => {
  const { id } = req.params as DiagnosisIdParam;
  const result = await diagnosisService.getDiagnosis(currentUserId(req), id);
  res.json(ok(result));
});
