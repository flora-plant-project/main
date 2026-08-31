import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@flora/shared';
import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config.js';
import { createDiagnosisStore } from '../../diagnoses/store.js';

const SESSION_TOKEN = 'test-session-token';

const CATALOG = [
  {
    id: 'sp1',
    scientificName: 'Ocimum basilicum',
    commonNames: ['Basil', 'حبق'],
    sortOrder: 0,
    source: 'CATALOG',
  },
];

const PROFILE = {
  care: { waterEveryDays: 7, sun: 'bright indirect light', tempC: { min: 15, max: 29 } },
  zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.3, BEKAA: 0.8, SOUTH: 0.9 },
};

/**
 * The app with the species table faked and every other dependency inert.
 *
 * These tests are about routing and auth — that `/suggest` is not swallowed by
 * `/:id`, and that adopting needs a session — so nothing here touches a real
 * database, a provider or a model.
 */
function makeApp({ searchNames, describe: desc, rows = CATALOG } = {}) {
  const species = [...rows];
  const prisma = /** @type {any} */ ({
    session: {
      findUnique: async ({ where }) =>
        where.token === SESSION_TOKEN
          ? { token: SESSION_TOKEN, user: { id: 'u1', username: 'flora_demo' } }
          : null,
    },
    species: {
      findMany: async () => species.map((row) => ({ ...row })),
      findUnique: async ({ where }) =>
        species.find((row) =>
          where.id ? row.id === where.id : row.scientificName === where.scientificName,
        ) ?? null,
      create: async ({ data }) => {
        const row = { id: `sp${species.length + 1}`, ...data };
        species.push(row);
        return { ...row };
      },
    },
  });

  return createApp({
    config: loadConfig({ PLANT_ID_API_KEY: '' }),
    prisma,
    searchNames: searchNames ?? (async () => []),
    describe: desc ?? (async () => ({ profile: PROFILE, generated: true })),
    advise: async () => null,
    draft: async () => ({ body: 'unused' }),
    store: createDiagnosisStore(),
    logger: { error: vi.fn(), info: vi.fn() },
  });
}

describe('GET /species/suggest', () => {
  it('is routed as suggest, not read as a species id', async () => {
    // '/suggest' would match '/:id' if it were declared after it, and the
    // failure mode is a confusing 404 for a species named "suggest".
    const app = makeApp({
      searchNames: async () => [{ scientificName: 'Epipremnum aureum', commonNames: ['Pothos'] }],
    });

    const res = await request(app).get('/species/suggest').query({ q: 'pothos' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      data: [{ scientificName: 'Epipremnum aureum', commonNames: ['Pothos'] }],
    });
  });

  it('answers 400 for a blank query, the way search does', async () => {
    const res = await request(makeApp()).get('/species/suggest').query({ q: '  ' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION);
  });

  it('answers 502 when the name provider is unreachable', async () => {
    const app = makeApp({
      searchNames: async () => {
        throw new Error('upstream down');
      },
    });

    const res = await request(app).get('/species/suggest').query({ q: 'pothos' });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe(ErrorCode.PROVIDER_ERROR);
  });

  it('is readable without a session — browsing is anonymous', async () => {
    const app = makeApp({
      searchNames: async () => [{ scientificName: 'Epipremnum aureum', commonNames: [] }],
    });

    expect((await request(app).get('/species/suggest').query({ q: 'pothos' })).status).toBe(200);
  });
});

describe('POST /species/adopt', () => {
  it('creates the species for a signed-in caller', async () => {
    const app = makeApp();

    const res = await request(app)
      .post('/species/adopt')
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .send({ scientificName: 'Epipremnum aureum', commonNames: ['Golden pothos'] });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      scientificName: 'Epipremnum aureum',
      source: 'ADOPTED',
      care: PROFILE.care,
    });
  });

  it('refuses an anonymous caller — writing to the catalog costs a model call', async () => {
    const res = await request(makeApp())
      .post('/species/adopt')
      .send({ scientificName: 'Epipremnum aureum' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('answers 400 for a name that is not a species', async () => {
    const res = await request(makeApp())
      .post('/species/adopt')
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .send({ scientificName: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION);
  });

  it('returns the existing row instead of a duplicate', async () => {
    const app = makeApp();
    const send = () =>
      request(app)
        .post('/species/adopt')
        .set('Authorization', `Bearer ${SESSION_TOKEN}`)
        .send({ scientificName: 'Epipremnum aureum' });

    const first = await send();
    const second = await send();

    expect(second.body.data.id).toBe(first.body.data.id);
  });
});

describe('GET /species/:id', () => {
  it('still resolves a real id now that /suggest sits above it', async () => {
    const res = await request(makeApp()).get('/species/sp1');

    expect(res.status).toBe(200);
    expect(res.body.data.scientificName).toBe('Ocimum basilicum');
  });
});
