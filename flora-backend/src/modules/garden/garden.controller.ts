import { asyncHandler } from '../../lib/asyncHandler';
import { ok } from '../../lib/apiResponse';
import { currentUserId } from '../../lib/currentUser';
import * as gardenService from './garden.service';
import type {
  CreateSpaceInput,
  ListSpacesQuery,
  SpaceIdParam,
  UpdateSpaceInput,
} from './garden.schema';

export const list = asyncHandler(async (req, res) => {
  const spaces = await gardenService.listSpaces(
    currentUserId(req),
    req.query as ListSpacesQuery,
  );
  res.json(ok(spaces));
});

export const get = asyncHandler(async (req, res) => {
  const { id } = req.params as SpaceIdParam;
  const space = await gardenService.getSpace(currentUserId(req), id);
  res.json(ok(space));
});

export const create = asyncHandler(async (req, res) => {
  const space = await gardenService.createSpace(
    currentUserId(req),
    req.body as CreateSpaceInput,
  );
  res.status(201).json(ok(space));
});

export const update = asyncHandler(async (req, res) => {
  const { id } = req.params as SpaceIdParam;
  const space = await gardenService.updateSpace(
    currentUserId(req),
    id,
    req.body as UpdateSpaceInput,
  );
  res.json(ok(space));
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = req.params as SpaceIdParam;
  await gardenService.deleteSpace(currentUserId(req), id);
  res.json(ok(null));
});
