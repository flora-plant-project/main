import { asyncHandler } from '../../lib/asyncHandler';
import { ok } from '../../lib/apiResponse';
import { currentUserId } from '../../lib/currentUser';
import * as plantsService from './plants.service';
import type {
  CreatePlantInput,
  ListPlantsQuery,
  PlantIdParam,
  UpdatePlantInput,
} from './plants.schema';

export const list = asyncHandler(async (req, res) => {
  const plants = await plantsService.listPlants(
    currentUserId(req),
    req.query as ListPlantsQuery,
  );
  res.json(ok(plants));
});

export const get = asyncHandler(async (req, res) => {
  const { id } = req.params as PlantIdParam;
  const plant = await plantsService.getPlant(currentUserId(req), id);
  res.json(ok(plant));
});

export const create = asyncHandler(async (req, res) => {
  const plant = await plantsService.createPlant(
    currentUserId(req),
    req.body as CreatePlantInput,
  );
  res.status(201).json(ok(plant));
});

export const update = asyncHandler(async (req, res) => {
  const { id } = req.params as PlantIdParam;
  const plant = await plantsService.updatePlant(
    currentUserId(req),
    id,
    req.body as UpdatePlantInput,
  );
  res.json(ok(plant));
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = req.params as PlantIdParam;
  await plantsService.deletePlant(currentUserId(req), id);
  res.json(ok(null));
});
