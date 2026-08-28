import { tmpdir } from 'node:os';
import path from 'node:path';
import { CareAdviceSchema } from '@flora/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config.js';
import { createDiagnosisStore } from '../store.js';

const IMAGE = Buffer.from('a fake jpeg').toString('base64');

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

/**
 * These exercise the HTTP edge of the scan flow only, so the app gets the
 * in-memory diagnosis store and a Prisma stand-in. Every route touched here is
 * anonymous, which means the session loader never reaches the database — the
 * stub exists to satisfy the modules the app wires up at construction, not to
 * answer queries.
 *
 * @param {{recognize?: Function}} [overrides]
 */
function makeApp(overrides = {}) {
  return createApp({
    config: loadConfig({
      PLANT_ID_API_KEY: '',
      FLORA_MAX_IMAGE_BYTES: '2048',
      // Scans are stored now; keep these ones out of the working tree.
      FLORA_UPLOAD_DIR: path.join(tmpdir(), 'flora-diagnoses-test-uploads'),
    }),
    prisma: /** @type {any} */ ({
      session: {
        findUnique: async () => {
          throw new Error('these tests must not hit the database');
        },
      },
    }),
    store: createDiagnosisStore(),
    recognize: overrides.recognize ?? (async () => healthy),
    logger: { info: vi.fn(), error: vi.fn() },
  });
}

/** Poll until the diagnosis leaves PENDING, the way the mobile client does. */
async function pollUntilSettled(app, id, attempts = 20) {
  for (let i = 0; i < attempts; i += 1) {
    const response = await request(app).get(`/diagnoses/${id}`);
    if (response.body.data.status !== 'PENDING') return response;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`diagnosis ${id} never settled`);
}

describe('diagnoses routes', () => {
  it('accepts a scan with 202 and an ApiResponse envelope', async () => {
    const response = await request(makeApp())
      .post('/diagnoses')
      .send({ imageBase64: IMAGE, mode: 'identify' });

    expect(response.status).toBe(202);
    expect(response.body.ok).toBe(true);
    expect(response.body.data).toEqual({ id: expect.any(String), status: 'PENDING' });
  });

  it('completes over the poll cycle', async () => {
    const app = makeApp();
    const created = await request(app).post('/diagnoses').send({ imageBase64: IMAGE });

    const settled = await pollUntilSettled(app, created.body.data.id);
    expect(settled.status).toBe(200);
    expect(settled.body.data.status).toBe('COMPLETE');
    expect(settled.body.data.result).toMatchObject(healthy);
    expect(settled.body.data.lowConfidence).toBe(false);
  });

  it('attaches care advice through the default provider', async () => {
    const app = makeApp();
    const created = await request(app).post('/diagnoses').send({ imageBase64: IMAGE });

    // No FLORA_LLM_ENABLED here, so this runs the fixture stub — but it runs it
    // through the same wiring the live provider uses, which is the point.
    const settled = await pollUntilSettled(app, created.body.data.id);
    expect(CareAdviceSchema.safeParse(settled.body.data.result.advice).success).toBe(true);
  });

  it('returns 400 with a VALIDATION envelope for a bad payload', async () => {
    const response = await request(makeApp()).post('/diagnoses').send({ mode: 'identify' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('imageBase64') },
    });
  });

  it('returns 404 with a NOT_FOUND envelope for an unknown diagnosis', async () => {
    const response = await request(makeApp()).get('/diagnoses/dg_nope');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('surfaces a provider failure as FAILED on the polled row, not a 5xx on create', async () => {
    const app = makeApp({
      recognize: async () => {
        throw new Error('provider exploded');
      },
    });
    const created = await request(app).post('/diagnoses').send({ imageBase64: IMAGE });
    expect(created.status).toBe(202);

    const settled = await pollUntilSettled(app, created.body.data.id);
    expect(settled.status).toBe(200);
    expect(settled.body.data.status).toBe('FAILED');
  });

  // Two guards sit in front of an oversized image: express.json caps the request
  // body, and the service caps the decoded image. The body cap has headroom
  // above the image cap, so a moderately oversized image gets the service's
  // readable message and only a wildly oversized one trips the body cap.
  it('rejects an oversized image with a readable message', async () => {
    // 3000 base64 chars ≈ 2250 decoded bytes: over the 2048 image cap, under
    // the body cap.
    const response = await request(makeApp())
      .post('/diagnoses')
      .send({ imageBase64: 'A'.repeat(3000) });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION');
    expect(response.body.error.message).toMatch(/limit is/);
  });

  it('rejects a body past the request-size cap with an envelope, not an HTML 413', async () => {
    const response = await request(makeApp())
      .post('/diagnoses')
      .send({ imageBase64: 'A'.repeat(100_000) });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: 'Image is too large' },
    });
  });

  it('answers the health check', async () => {
    const response = await request(makeApp()).get('/health');
    expect(response.body).toEqual({ ok: true, data: { status: 'up' } });
  });

  it('returns an envelope, not an HTML page, for an unknown route', async () => {
    const response = await request(makeApp()).get('/nope');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'route not found' },
    });
  });
});
