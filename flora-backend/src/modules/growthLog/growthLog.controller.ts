import { asyncHandler } from '../../lib/asyncHandler';
import { ok } from '../../lib/apiResponse';
import { currentUserId } from '../../lib/currentUser';
import * as growthLogService from './growthLog.service';
import type {
  CreateGrowthLogInput,
  GrowthLogIdParam,
  GrowthLogUploadUrlInput,
  ListGrowthLogsQuery,
  UpdateGrowthLogInput,
} from './growthLog.schema';

export const uploadUrl = asyncHandler(async (req, res) => {
  const { contentType } = req.body as GrowthLogUploadUrlInput;
  const result = await growthLogService.createUploadUrl(currentUserId(req), contentType);
  res.json(ok(result));
});

export const create = asyncHandler(async (req, res) => {
  const log = await growthLogService.createGrowthLog(
    currentUserId(req),
    req.body as CreateGrowthLogInput,
  );
  res.status(201).json(ok(log));
});

export const list = asyncHandler(async (req, res) => {
  const logs = await growthLogService.listGrowthLogs(
    currentUserId(req),
    // Double cast: see the note in diagnosis.controller — defaulted `limit` vs ParsedQs.
    req.query as unknown as ListGrowthLogsQuery,
  );
  res.json(ok(logs));
});

export const get = asyncHandler(async (req, res) => {
  const { id } = req.params as GrowthLogIdParam;
  const log = await growthLogService.getGrowthLog(currentUserId(req), id);
  res.json(ok(log));
});

export const update = asyncHandler(async (req, res) => {
  const { id } = req.params as GrowthLogIdParam;
  const log = await growthLogService.updateGrowthLog(
    currentUserId(req),
    id,
    req.body as UpdateGrowthLogInput,
  );
  res.json(ok(log));
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = req.params as GrowthLogIdParam;
  await growthLogService.deleteGrowthLog(currentUserId(req), id);
  res.json(ok(null));
});
