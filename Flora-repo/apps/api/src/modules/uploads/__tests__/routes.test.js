import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config.js';
import { createDiagnosisStore } from '../../diagnoses/store.js';
import { createLocalStorage } from '../../../storage/index.js';

const BYTES = Buffer.from('pretend this is a jpeg');

/**
 * The app with uploads on a throwaway directory.
 *
 * The local driver is the point of these tests: it is what a developer, the
 * live contract suite and the mentor demo all run against, and it is the only
 * driver whose PUT and GET routes this API serves itself.
 */
async function makeApp({ onAttach } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'flora-uploads-'));
  const local = createLocalStorage({
    dir,
    secret: 'test-secret',
    baseUrl: 'http://127.0.0.1',
    ttlMs: 60_000,
  });
  // The local driver's markAttached is a no-op by design (nothing sweeps a dev
  // disk), so observing the call is how the lifecycle wiring is tested here.
  const storage = onAttach
    ? {
        ...local,
        markAttached: async (key) => {
          onAttach(key);
          return local.markAttached(key);
        },
      }
    : local;

  return createApp({
    config: loadConfig({ PLANT_ID_API_KEY: '', FLORA_MAX_IMAGE_BYTES: '2048' }),
    prisma: /** @type {any} */ ({
      session: {
        findUnique: async () => {
          throw new Error('these tests must not hit the database');
        },
      },
    }),
    storage,
    store: createDiagnosisStore(),
    recognize: async () => ({
      species: [],
      health: { isHealthy: true, issues: [], confidence: 0.9 },
    }),
    logger: { info: vi.fn(), error: vi.fn() },
  });
}

/** The path and query of an upload URL, which is what supertest needs. */
const pathOf = (uploadUrl) => uploadUrl.replace('http://127.0.0.1', '');

describe('upload routes', () => {
  it('signs an upload, accepts the bytes, and serves them back', async () => {
    const app = await makeApp();

    const signed = await request(app)
      .post('/uploads')
      .send({ contentType: 'image/jpeg', byteLength: BYTES.length });

    expect(signed.status).toBe(201);
    expect(signed.body.data.key).toMatch(/^uploads\/\d{4}\/[0-9a-f-]{36}\.jpg$/);
    expect(signed.body.data.url).toBe(`http://127.0.0.1/${signed.body.data.key}`);

    const put = await request(app)
      .put(pathOf(signed.body.data.uploadUrl))
      .set('Content-Type', 'image/jpeg')
      .send(BYTES);

    expect(put.status).toBe(201);
    expect(put.body).toEqual({ ok: true, data: { key: signed.body.data.key } });

    const read = await request(app).get(`/${signed.body.data.key}`);

    expect(read.status).toBe(200);
    expect(read.headers['content-type']).toContain('image/jpeg');
    expect(read.body).toEqual(BYTES);
  });

  it('refuses to sign an upload larger than the limit', async () => {
    const response = await request(await makeApp())
      .post('/uploads')
      .send({ contentType: 'image/jpeg', byteLength: 999_999 });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION' });
    expect(response.body.error.message).toContain('the limit is');
  });

  it('refuses an unsupported content type', async () => {
    const response = await request(await makeApp())
      .post('/uploads')
      .send({ contentType: 'application/pdf', byteLength: 10 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION');
  });

  it('refuses bytes that do not match the signed claim', async () => {
    const app = await makeApp();
    const signed = await request(app)
      .post('/uploads')
      .send({ contentType: 'image/jpeg', byteLength: BYTES.length });

    // The signature pins the byte count, so a bigger body is a different upload.
    const put = await request(app)
      .put(pathOf(signed.body.data.uploadUrl))
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.concat([BYTES, Buffer.from('!')]));

    expect(put.status).toBe(400);
    expect(put.body.error.code).toBe('VALIDATION');
  });

  it('refuses an unsigned PUT', async () => {
    const app = await makeApp();
    const signed = await request(app)
      .post('/uploads')
      .send({ contentType: 'image/jpeg', byteLength: BYTES.length });

    const put = await request(app)
      .put(`/${signed.body.data.key}`)
      .set('Content-Type', 'image/jpeg')
      .send(BYTES);

    expect(put.status).toBe(400);
  });

  it('404s an image that was never uploaded', async () => {
    const app = await makeApp();
    const signed = await request(app)
      .post('/uploads')
      .send({ contentType: 'image/jpeg', byteLength: BYTES.length });

    const read = await request(app).get(`/${signed.body.data.key}`);

    expect(read.status).toBe(404);
    expect(read.body.error.code).toBe('NOT_FOUND');
  });

  it('scans an uploaded key without the bytes crossing the API again', async () => {
    const app = await makeApp();
    const signed = await request(app)
      .post('/uploads')
      .send({ contentType: 'image/jpeg', byteLength: BYTES.length });
    await request(app)
      .put(pathOf(signed.body.data.uploadUrl))
      .set('Content-Type', 'image/jpeg')
      .send(BYTES);

    const scan = await request(app).post('/diagnoses').send({ imageKey: signed.body.data.key });

    expect(scan.status).toBe(202);

    const diagnosis = await request(app).get(`/diagnoses/${scan.body.data.id}`);
    // The URL, not the key: the row stores the key and the view expands it.
    expect(diagnosis.body.data.imageUri).toBe(`http://127.0.0.1/${signed.body.data.key}`);
  });

  it('marks an uploaded photo attached once the scan row exists', async () => {
    const attached = [];
    const app = await makeApp({ onAttach: (key) => attached.push(key) });
    const signed = await request(app)
      .post('/uploads')
      .send({ contentType: 'image/jpeg', byteLength: BYTES.length });
    await request(app)
      .put(pathOf(signed.body.data.uploadUrl))
      .set('Content-Type', 'image/jpeg')
      .send(BYTES);

    // Until this happens the object is collectable: uploads land tagged pending
    // and the bucket deletes them a week later.
    expect(attached).toEqual([]);

    await request(app).post('/diagnoses').send({ imageKey: signed.body.data.key });

    expect(attached).toEqual([signed.body.data.key]);
  });

  it('rejects a scan whose key has nothing behind it', async () => {
    const app = await makeApp();
    const signed = await request(app)
      .post('/uploads')
      .send({ contentType: 'image/jpeg', byteLength: BYTES.length });

    const scan = await request(app).post('/diagnoses').send({ imageKey: signed.body.data.key });

    expect(scan.status).toBe(404);
    expect(scan.body.error.code).toBe('NOT_FOUND');
  });

  it('stores an inline base64 scan too, so its photo outlives the device', async () => {
    const app = await makeApp();

    const scan = await request(app)
      .post('/diagnoses')
      .send({ imageBase64: BYTES.toString('base64') });
    const diagnosis = await request(app).get(`/diagnoses/${scan.body.data.id}`);

    expect(diagnosis.body.data.imageUri).toMatch(
      /^http:\/\/127\.0\.0\.1\/uploads\/\d{4}\/[0-9a-f-]{36}\.jpg$/,
    );
  });

  it('refuses a scan that names neither an image nor a key', async () => {
    const response = await request(await makeApp()).post('/diagnoses').send({ mode: 'identify' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('imageBase64');
  });
});
