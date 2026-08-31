import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecognitionProviderError } from '../../../recognition/index.js';
import { createDiagnosisService } from '../service.js';
import { createDiagnosisStore } from '../store.js';

const IMAGE = Buffer.from('a fake jpeg').toString('base64');

/** A minimal healthy RecognitionResult. */
const healthy = {
  species: [
    {
      speciesId: 'sp1',
      scientificName: 'Ocimum basilicum',
      commonNames: ['Basil'],
      probability: 0.93,
    },
  ],
  health: { isHealthy: true, issues: [], confidence: 0.91 },
};

/** Same shape, but under the low-confidence threshold. */
const uncertain = {
  species: [{ scientificName: 'Hedera helix', commonNames: [], probability: 0.31 }],
  health: { isHealthy: true, issues: [], confidence: 0.31 },
};

/**
 * The in-memory store, not Prisma: these tests are about the job lifecycle —
 * PENDING/COMPLETE/FAILED, the timeout sweep, concurrency — none of which
 * involves the database. The Prisma-backed path is covered by the live contract
 * suite.
 *
 * @param {{recognize?: Function, now?: () => number, timeoutMs?: number, maxImageBytes?: number}} [overrides]
 */
function makeService(overrides = {}) {
  const store = createDiagnosisStore();
  const logger = overrides.logger ?? { error: vi.fn() };
  const service = createDiagnosisService({
    store,
    recognize: overrides.recognize ?? (async () => healthy),
    maxImageBytes: overrides.maxImageBytes ?? 1024 * 1024,
    timeoutMs: overrides.timeoutMs ?? 45_000,
    logger,
    ...(overrides.advise ? { advise: overrides.advise } : {}),
    ...(overrides.now ? { now: overrides.now } : {}),
  });
  return { service, store, logger };
}

/** Scans are anonymous unless someone is signed in; these all are. */
const ANON = null;

/** A schema-valid care plan, as the LLM provider would return it. */
const advice = {
  summary: 'Healthy basil. Keep it productive.',
  steps: [
    { action: 'Pinch off flower buds', when: 'Weekly', why: 'Flowering turns the leaves bitter' },
  ],
  watchFor: [],
};

describe('diagnoses service', () => {
  let service;

  beforeEach(() => {
    ({ service } = makeService());
  });

  it('returns PENDING immediately, before recognition finishes', async () => {
    // Hold the provider open. The default fake recognizer resolves on the next
    // microtask, which is faster than any real network call and fast enough to
    // beat the poll below — that would test the fake, not the service.
    let finish;
    ({ service } = makeService({
      recognize: () => new Promise((resolve) => (finish = () => resolve(healthy))),
    }));

    const response = await service.create(ANON, { imageBase64: IMAGE, mode: 'identify' });

    expect(response.ok).toBe(true);
    expect(response.data.status).toBe('PENDING');
    expect((await service.get(response.data.id)).data.status).toBe('PENDING');

    finish();
    await service.settled(response.data.id);
    expect((await service.get(response.data.id)).data.status).toBe('COMPLETE');
  });

  it('flips to COMPLETE with the recognition result', async () => {
    const { id } = (await service.create(ANON, { imageBase64: IMAGE })).data;
    await service.settled(id);

    const view = (await service.get(id)).data;
    expect(view.status).toBe('COMPLETE');
    expect(view.result).toEqual(healthy);
    expect(view.lowConfidence).toBe(false);
  });

  it('flags results below the confidence threshold', async () => {
    ({ service } = makeService({ recognize: async () => uncertain }));
    const { id } = (await service.create(ANON, { imageBase64: IMAGE })).data;
    await service.settled(id);

    expect((await service.get(id)).data.lowConfidence).toBe(true);
  });

  it('passes the mode and a species resolver through to the provider', async () => {
    const recognize = vi.fn(async () => healthy);
    ({ service } = makeService({ recognize }));

    const { id } = (await service.create(ANON, { imageBase64: IMAGE, mode: 'health' })).data;
    await service.settled(id);

    expect(recognize).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'health', resolveSpeciesId: expect.any(Function) }),
    );
  });

  it('defaults the mode to identify', async () => {
    const recognize = vi.fn(async () => healthy);
    ({ service } = makeService({ recognize }));

    const { id } = (await service.create(ANON, { imageBase64: IMAGE })).data;
    await service.settled(id);

    expect(recognize.mock.calls[0][0].mode).toBe('identify');
  });

  it('keeps no image when the deployment has no storage', async () => {
    const { id } = (await service.create(ANON, { imageBase64: IMAGE })).data;

    // These tests build the service without a storage driver, which is a real
    // configuration: the scan still answers, it just remembers no photo. The
    // stored-and-served path is covered in modules/uploads/__tests__.
    expect((await service.get(id)).data.imageUri).toBeNull();
  });

  it('records a provider failure as FAILED rather than rejecting', async () => {
    ({ service } = makeService({
      recognize: async () => {
        throw new RecognitionProviderError('Plant.id returned 401', { status: 401 });
      },
    }));

    const { id } = (await service.create(ANON, { imageBase64: IMAGE })).data;
    await service.settled(id);

    const view = (await service.get(id)).data;
    expect(view.status).toBe('FAILED');
    expect(view.error).toEqual({ code: 'PROVIDER_ERROR', message: 'Plant.id returned 401' });
  });

  it('does not leak internal error text on an unexpected failure', async () => {
    ({ service } = makeService({
      recognize: async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.1:5432');
      },
    }));

    const { id } = (await service.create(ANON, { imageBase64: IMAGE })).data;
    await service.settled(id);

    const view = (await service.get(id)).data;
    expect(view.error).toEqual({ code: 'INTERNAL', message: 'Recognition failed' });
  });

  it('sweeps a PENDING row that outlived the provider timeout', async () => {
    let clock = 1_000;
    ({ service } = makeService({
      now: () => clock,
      timeoutMs: 45_000,
      // Never settles — simulates a wedged call or a restarted process.
      recognize: () => new Promise(() => {}),
    }));

    const { id } = (await service.create(ANON, { imageBase64: IMAGE })).data;
    expect((await service.get(id)).data.status).toBe('PENDING');

    clock += 45_001;
    const view = (await service.get(id)).data;
    expect(view.status).toBe('FAILED');
    expect(view.error.message).toMatch(/timed out/);
  });

  it('rejects an oversized image with a readable message', async () => {
    ({ service } = makeService({ maxImageBytes: 10 }));
    const response = await service.create(ANON, { imageBase64: IMAGE });

    expect(response.ok).toBe(false);
    expect(response.error.code).toBe('VALIDATION');
    expect(response.error.message).toMatch(/the limit is/);
  });

  it('strips a data URL prefix before measuring or forwarding the image', async () => {
    const recognize = vi.fn(async () => healthy);
    ({ service } = makeService({ recognize }));

    const { id } = (await service.create(ANON, { imageBase64: `data:image/jpeg;base64,${IMAGE}` }))
      .data;
    await service.settled(id);

    expect(recognize.mock.calls[0][0].imageBase64).toBe(IMAGE);
  });

  it.each([
    ['a missing image', {}],
    ['an empty image', { imageBase64: '' }],
    ['a non-base64 image', { imageBase64: 'not base64!!' }],
    ['an unknown mode', { imageBase64: IMAGE, mode: 'vibes' }],
  ])('rejects %s', async (_label, input) => {
    const response = await service.create(ANON, input);
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe('VALIDATION');
  });

  it('reports an unknown id as NOT_FOUND', async () => {
    const response = await service.get('dg_nope');
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe('NOT_FOUND');
  });

  it('keeps concurrent diagnoses separate', async () => {
    const recognize = vi.fn(async ({ mode }) => (mode === 'health' ? uncertain : healthy));
    ({ service } = makeService({ recognize }));

    const first = (await service.create(ANON, { imageBase64: IMAGE, mode: 'identify' })).data;
    const second = (await service.create(ANON, { imageBase64: IMAGE, mode: 'health' })).data;
    await Promise.all([service.settled(first.id), service.settled(second.id)]);

    expect(first.id).not.toBe(second.id);
    expect((await service.get(first.id)).data.lowConfidence).toBe(false);
    expect((await service.get(second.id)).data.lowConfidence).toBe(true);
  });

  it('refuses to escalate a diagnosis that has not finished', async () => {
    ({ service } = makeService({ recognize: () => new Promise(() => {}) }));
    const { id } = (await service.create(ANON, { imageBase64: IMAGE })).data;

    const response = await service.escalate({ id: 'u1' }, id);
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe('VALIDATION');
  });

  it('escalates a completed diagnosis into a HELP post', async () => {
    const createHelpPost = vi.fn(async (_user, attachment) => ({ ok: true, data: { attachment } }));
    const store = createDiagnosisStore();
    service = createDiagnosisService({
      store,
      recognize: async () => uncertain,
      posts: { createHelpPost },
      maxImageBytes: 1024 * 1024,
      timeoutMs: 45_000,
      logger: { error: vi.fn() },
    });

    const { id } = (await service.create(ANON, { imageBase64: IMAGE })).data;
    await service.settled(id);

    const response = await service.escalate({ id: 'u1' }, id);
    expect(response.ok).toBe(true);
    // No storage in these tests, so there is no photo to carry — the post is
    // the question and the confidence. No reviewed body was passed, so the
    // post service gets undefined and falls back to its plain wording.
    expect(createHelpPost).toHaveBeenCalledWith(
      { id: 'u1' },
      { imageUri: null, topIssue: null, confidence: 0.31 },
      undefined,
    );
  });

  it('publishes the reviewed body the user actually read', async () => {
    const createHelpPost = vi.fn(async (_user, _attachment, body) => ({
      ok: true,
      data: { body },
    }));
    service = createDiagnosisService({
      store: createDiagnosisStore(),
      recognize: async () => uncertain,
      posts: { createHelpPost },
      maxImageBytes: 1024 * 1024,
      timeoutMs: 45_000,
      logger: { error: vi.fn() },
    });

    const { id } = (await service.create(ANON, { imageBase64: IMAGE })).data;
    await service.settled(id);

    const response = await service.escalate({ id: 'u1' }, id, {
      body: '  Reviewed draft about my tomato.  ',
    });
    expect(response.ok).toBe(true);
    // Trimmed, and carried through instead of the canned sentence.
    expect(createHelpPost).toHaveBeenCalledWith(
      { id: 'u1' },
      expect.anything(),
      'Reviewed draft about my tomato.',
    );
  });

  it('treats a blank reviewed body as absent so the fallback still applies', async () => {
    const createHelpPost = vi.fn(async () => ({ ok: true, data: {} }));
    service = createDiagnosisService({
      store: createDiagnosisStore(),
      recognize: async () => uncertain,
      posts: { createHelpPost },
      maxImageBytes: 1024 * 1024,
      timeoutMs: 45_000,
      logger: { error: vi.fn() },
    });

    const { id } = (await service.create(ANON, { imageBase64: IMAGE })).data;
    await service.settled(id);

    expect((await service.escalate({ id: 'u1' }, id, { body: '   ' })).ok).toBe(true);
    expect(createHelpPost).toHaveBeenCalledWith({ id: 'u1' }, expect.anything(), undefined);
  });
});

describe('care advice', () => {
  it('attaches advice to a completed diagnosis', async () => {
    const { service } = makeService({ advise: async () => advice });
    const { id } = (await service.create(ANON, { imageBase64: IMAGE })).data;
    await service.settled(id);

    const view = (await service.get(id)).data;
    expect(view.status).toBe('COMPLETE');
    expect(view.result.advice).toEqual(advice);
    // The recognition half must come through untouched alongside it.
    expect(view.result.species).toEqual(healthy.species);
  });

  it('passes the climate zone through to the advice call', async () => {
    const advise = vi.fn().mockResolvedValue(advice);
    const { service } = makeService({ advise });
    const { id } = (await service.create(ANON, { imageBase64: IMAGE, climateZone: 'BEKAA' })).data;
    await service.settled(id);

    expect(advise).toHaveBeenCalledWith(healthy, { climateZone: 'BEKAA' });
  });

  it('skips the call entirely on a low-confidence result', async () => {
    const advise = vi.fn().mockResolvedValue(advice);
    const { service } = makeService({ recognize: async () => uncertain, advise });
    const { id } = (await service.create(ANON, { imageBase64: IMAGE })).data;
    await service.settled(id);

    // Advice built on a bad ID is worse than none — and this is what keeps
    // model spend off unusable photos.
    expect(advise).not.toHaveBeenCalled();
    expect((await service.get(id)).data.status).toBe('COMPLETE');
  });

  it('still completes the diagnosis when the model fails', async () => {
    const logger = { error: vi.fn() };
    const { service } = makeService({
      advise: async () => {
        throw new Error('Bedrock exploded');
      },
      logger,
    });
    const { id } = (await service.create(ANON, { imageBase64: IMAGE })).data;
    await service.settled(id);

    const view = (await service.get(id)).data;
    expect(view.status).toBe('COMPLETE');
    expect(view.result.species).toEqual(healthy.species);
    expect(view.error).toBeNull();
    expect(logger.error.mock.calls[0][0]).toMatch(/care advice failed/);
  });

  it('completes normally when no advice provider is configured', async () => {
    const { service } = makeService();
    const { id } = (await service.create(ANON, { imageBase64: IMAGE })).data;
    await service.settled(id);

    expect((await service.get(id)).data.status).toBe('COMPLETE');
  });

  it('never lets advice rescue a failed recognition', async () => {
    const advise = vi.fn().mockResolvedValue(advice);
    const { service } = makeService({
      recognize: async () => {
        throw new RecognitionProviderError('Plant.id returned 503', { status: 503 });
      },
      advise,
    });
    const { id } = (await service.create(ANON, { imageBase64: IMAGE })).data;
    await service.settled(id);

    expect((await service.get(id)).data.status).toBe('FAILED');
    expect(advise).not.toHaveBeenCalled();
  });
});
