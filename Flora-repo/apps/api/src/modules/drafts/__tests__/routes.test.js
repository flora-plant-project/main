import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config.js';

const plant = { nickname: 'Minty', speciesName: 'Mentha spicata', ageDays: 92 };

const diagnosis = {
  species: [{ scientificName: 'Solanum lycopersicum', commonNames: ['Tomato'], probability: 0.88 }],
  health: {
    isHealthy: false,
    issues: [{ code: 'EARLY_BLIGHT', name: 'Early blight', probability: 0.81, treatmentHints: [] }],
    confidence: 0.84,
  },
};

/** @param {{draft?: Function}} [overrides] */
function makeApp(overrides = {}) {
  return createApp({
    config: loadConfig({ PLANT_ID_API_KEY: '', FLORA_MAX_IMAGE_BYTES: '2048' }),
    recognize: async () => ({ species: [], health: { isHealthy: true, issues: [], confidence: 1 } }),
    advise: async () => null,
    draft: overrides.draft ?? (async () => ({ body: 'Look at my mint, three months in.' })),
    logger: { info: vi.fn(), error: vi.fn() },
  });
}

describe('POST /drafts/post', () => {
  it('drafts from a plant alone', async () => {
    const response = await request(makeApp()).post('/drafts/post').send({ plant });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, data: { body: expect.any(String) } });
  });

  it('drafts from a diagnosis alone', async () => {
    const draft = vi.fn().mockResolvedValue({ body: 'Help with my tomato' });
    const response = await request(makeApp({ draft })).post('/drafts/post').send({ diagnosis });

    expect(response.status).toBe(200);
    // Both halves reach the service; the missing one arrives as an explicit null.
    expect(draft).toHaveBeenCalledWith({ diagnosis: expect.any(Object), plant: null });
  });

  it('creates nothing — the draft only comes back as text', async () => {
    const response = await request(makeApp()).post('/drafts/post').send({ plant });

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.data)).toEqual(['body']);
    expect(response.body.data.id).toBeUndefined();
  });

  it('rejects a request with nothing to write about', async () => {
    const response = await request(makeApp()).post('/drafts/post').send({});

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION');
    expect(response.body.error.message).toMatch(/diagnosis, a plant, or both/);
  });

  it('rejects a plant with no nickname', async () => {
    const response = await request(makeApp())
      .post('/drafts/post')
      .send({ plant: { speciesName: 'Mentha spicata' } });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/plant.nickname/);
  });

  it('reports a model failure as PROVIDER_ERROR without leaking internals', async () => {
    const draft = vi.fn().mockRejectedValue(new Error('Bedrock ValidationException: bad field'));
    const response = await request(makeApp({ draft })).post('/drafts/post').send({ plant });

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('PROVIDER_ERROR');
    expect(response.body.error.message).toMatch(/write your own/);
    expect(response.body.error.message).not.toMatch(/Bedrock/);
  });

  it('drafts through the default provider when none is injected', async () => {
    const app = createApp({
      config: loadConfig({ PLANT_ID_API_KEY: '' }),
      logger: { info: vi.fn(), error: vi.fn() },
    });
    const response = await request(app).post('/drafts/post').send({ plant });

    // No FLORA_LLM_ENABLED, so this replays the committed fixture — but through
    // the same wiring the live provider uses.
    expect(response.status).toBe(200);
    expect(response.body.data.body.length).toBeGreaterThan(0);
  });
});
