import { asyncHandler } from '../../lib/asyncHandler';
import { ok } from '../../lib/apiResponse';
import { currentUserId } from '../../lib/currentUser';
import * as scheduleService from './wateringSchedule.service';
import type {
  CreateWateringScheduleInput,
  ListWateringSchedulesQuery,
  UpdateWateringScheduleInput,
  WateringScheduleIdParam,
} from './wateringSchedule.schema';

export const create = asyncHandler(async (req, res) => {
  const schedule = await scheduleService.createSchedule(
    currentUserId(req),
    req.body as CreateWateringScheduleInput,
  );
  res.status(201).json(ok(schedule));
});

export const list = asyncHandler(async (req, res) => {
  const schedules = await scheduleService.listSchedules(
    currentUserId(req),
    req.query as ListWateringSchedulesQuery,
  );
  res.json(ok(schedules));
});

export const get = asyncHandler(async (req, res) => {
  const { id } = req.params as WateringScheduleIdParam;
  const schedule = await scheduleService.getSchedule(currentUserId(req), id);
  res.json(ok(schedule));
});

export const update = asyncHandler(async (req, res) => {
  const { id } = req.params as WateringScheduleIdParam;
  const schedule = await scheduleService.updateSchedule(
    currentUserId(req),
    id,
    req.body as UpdateWateringScheduleInput,
  );
  res.json(ok(schedule));
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = req.params as WateringScheduleIdParam;
  await scheduleService.deleteSchedule(currentUserId(req), id);
  res.json(ok(null));
});
