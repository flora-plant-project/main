import express from 'express';
import { ErrorCode, fail, ok } from '@flora/shared';
import { config as defaultConfig } from './config.js';
import { prisma as defaultPrisma } from './db.js';
import { createSessionLoader } from './middleware/auth.js';
import { createRecognitionProvider } from './recognition/index.js';
import { createLlmProvider } from './llm/index.js';
import { requestCareAdvice } from './llm/careAdvice.js';
import { requestPostDraft } from './llm/postDraft.js';
import { createStorage } from './storage/index.js';
import { createImageAttacher, createImageMapper } from './lib/media.js';
import { createAuthRoutes } from './modules/auth/routes.js';
import { createAuthService } from './modules/auth/service.js';
import { createMeRoutes } from './modules/me/routes.js';
import { createMeService } from './modules/me/service.js';
import { createSpeciesRoutes } from './modules/species/routes.js';
import { createSpeciesService } from './modules/species/service.js';
import { createPlantsRoutes } from './modules/plants/routes.js';
import { createPlantsService } from './modules/plants/service.js';
import { createSchedulesService } from './modules/schedules/service.js';
import { createFeedRoutes, createPostsRoutes } from './modules/posts/routes.js';
import { createPostsService } from './modules/posts/service.js';
import { createUsersRoutes } from './modules/users/routes.js';
import { createUsersService } from './modules/users/service.js';
import { createDevicesRoutes } from './modules/devices/routes.js';
import { createDevicesService } from './modules/devices/service.js';
import { createDiagnosisRoutes } from './modules/diagnoses/routes.js';
import { createDraftRoutes } from './modules/drafts/routes.js';
import { createDraftService } from './modules/drafts/service.js';
import { createDiagnosisService } from './modules/diagnoses/service.js';
import { createPrismaDiagnosisStore } from './modules/diagnoses/prismaStore.js';
import { createUploadsRoutes } from './modules/uploads/routes.js';
import { createUploadsService } from './modules/uploads/service.js';

/**
 * Bind the LLM provider into the shape the diagnosis service wants.
 *
 * Built once at startup rather than per request so the "using Bedrock" /
 * "using fixture stubs" line is logged once, not on every scan.
 *
 * @param {ReturnType<import('./config.js').loadConfig>} config
 */
function defaultLlm(config) {
  const generate = createLlmProvider(config);
  return {
    advise: (result, context) => requestCareAdvice(generate, result, context),
    draft: (input) => requestPostDraft(generate, input),
  };
}

/**
 * Build the Express app.
 *
 * Dependencies are injectable so tests can supply a fake recognizer and an
 * isolated store without touching the environment or the network.
 *
 * @param {{
 *   config?: ReturnType<import('./config.js').loadConfig>,
 *   prisma?: import('@prisma/client').PrismaClient,
 *   recognize?: (input: object) => Promise<object>,
 *   advise?: (result: object, context: object) => Promise<object>,
 *   draft?: (input: object) => Promise<{body: string}>,
 *   storage?: object,
 *   store?: {insert: Function, find: Function, update: Function},
 *   logger?: Console,
 * }} [overrides]
 */
export function createApp({
  config = defaultConfig,
  prisma = defaultPrisma,
  recognize = createRecognitionProvider(config),
  advise,
  draft,
  storage = createStorage(config, { logger: console }),
  store,
  logger = console,
} = {}) {
  const app = express();

  // One provider shared by both features, so the "using Bedrock / using fixture
  // stubs" line is logged once at startup rather than twice. Skipped entirely
  // when a test injects both, so no client is ever constructed there.
  const fallback = advise && draft ? null : defaultLlm(config);
  const resolvedAdvise = advise ?? fallback.advise;
  const resolvedDraft = draft ?? fallback.draft;

  // Base64 images inflate ~33%, and the ceiling is a request-size guard, not the
  // real image check — service.create rejects oversized images with a VALIDATION
  // envelope so the client gets a usable message instead of a bare 413.
  app.use(express.json({ limit: Math.ceil((config.maxImageBytes * 4) / 3) + 1024 }));

  // Resolves the bearer token for every route, including the anonymous ones —
  // /posts renders differently when it knows who is reading.
  app.use(createSessionLoader({ prisma }));

  // Rows hold storage keys; every view expands them to URLs on the way out, so
  // no hostname is ever written to the database.
  const mapImage = createImageMapper(storage);
  // Uploads are collectable until a row names them; this is what says one does.
  const attachImages = createImageAttacher(storage, logger);

  const posts = createPostsService({ prisma, mapImage, attachImages });
  const plants = createPlantsService({ prisma, mapImage, attachImages });

  const diagnoses = createDiagnosisService({
    store: store ?? createPrismaDiagnosisStore({ prisma }),
    recognize,
    advise: resolvedAdvise,
    posts,
    findOwnedPlant: (ownerId, plantId) =>
      prisma.plant.findFirst({ where: { id: plantId, ownerId } }),
    storage,
    mapImage,
    attachImages,
    maxImageBytes: config.maxImageBytes,
    timeoutMs: config.recognitionTimeoutMs,
    logger,
  });

  const drafts = createDraftService({ draft: resolvedDraft, logger });

  app.get('/health', (_req, res) => res.json(ok({ status: 'up' })));

  app.use('/auth', createAuthRoutes({ service: createAuthService({ prisma }) }));
  app.use('/me', createMeRoutes({ service: createMeService({ prisma }) }));
  app.use('/species', createSpeciesRoutes({ service: createSpeciesService({ prisma }) }));
  app.use(
    '/plants',
    createPlantsRoutes({ service: plants, schedules: createSchedulesService({ prisma }) }),
  );
  app.use('/posts', createPostsRoutes({ service: posts }));
  app.use('/feed', createFeedRoutes({ service: posts }));
  app.use('/users', createUsersRoutes({ service: createUsersService({ prisma, mapImage }) }));
  app.use('/devices', createDevicesRoutes({ service: createDevicesService({ prisma }) }));
  app.use('/diagnoses', createDiagnosisRoutes({ service: diagnoses }));
  app.use('/drafts', createDraftRoutes({ service: drafts }));
  app.use(
    '/uploads',
    createUploadsRoutes({
      service: createUploadsService({ storage, maxImageBytes: config.maxImageBytes }),
      storage,
      maxImageBytes: config.maxImageBytes,
    }),
  );

  app.use((_req, res) => {
    res.status(404).json(fail(ErrorCode.NOT_FOUND, 'route not found'));
  });

  // Four-arg signature is what marks this as Express's error handler — `next`
  // is unused but removing it silently turns this into ordinary middleware.
  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    logger.error('[api] unhandled error:', error);
    const tooLarge = error?.type === 'entity.too.large';
    res
      .status(tooLarge ? 413 : 500)
      .json(
        tooLarge
          ? fail(ErrorCode.VALIDATION, 'Image is too large')
          : fail(ErrorCode.INTERNAL, 'Something went wrong'),
      );
  });

  return app;
}
