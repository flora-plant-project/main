import { liveClient } from '../api/liveClient.js';
import { resolveBaseUrl } from '../api/http.js';

jest.mock('expo-constants', () => ({ expoConfig: { hostUri: '192.168.1.20:8081' } }));

const UPLOAD_KEY = 'uploads/2026/11111111-2222-3333-4444-555555555555.jpg';
const UPLOAD_URL = 'http://192.168.1.20:4000/' + UPLOAD_KEY + '?expires=1&signature=abc';

/**
 * @param {{ok?: boolean, status?: number, body?: unknown}} [options]
 */
function mockFetch({ ok = true, status = 200, body = { ok: true, data: {} } } = {}) {
  const impl = jest.fn(async () => ({
    ok,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }));
  global.fetch = impl;
  return impl;
}

/**
 * @param {unknown} body
 * @param {number} [status]
 */
const jsonResponse = (body, status = 200) => ({
  ok: status < 400,
  status,
  text: async () => JSON.stringify(body),
});

/**
 * A fetch that plays the three calls a scan now makes: sign, PUT, scan.
 * @param {object} scanData what POST /diagnoses answers with
 */
function mockUploadThen(scanData) {
  const impl = jest.fn(async (url) => {
    if (String(url).endsWith('/uploads')) {
      return jsonResponse({
        ok: true,
        data: {
          key: UPLOAD_KEY,
          method: 'PUT',
          uploadUrl: UPLOAD_URL,
          headers: { 'Content-Type': 'image/jpeg' },
          url: 'http://192.168.1.20:4000/' + UPLOAD_KEY,
        },
      });
    }
    if (String(url) === UPLOAD_URL) return { ok: true, status: 201, text: async () => '' };
    return jsonResponse({ ok: true, data: scanData });
  });
  global.fetch = impl;
  return impl;
}

describe('resolveBaseUrl', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_API_URL;
  });

  it('derives the LAN address from the Metro host so a phone can reach it', () => {
    // localhost on a physical device is the phone itself — this is the bug the
    // derivation exists to prevent.
    expect(resolveBaseUrl()).toBe('http://192.168.1.20:4000');
  });

  it('prefers an explicit override and strips a trailing slash', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com/';
    expect(resolveBaseUrl()).toBe('https://api.example.com');
  });
});

describe('liveClient.diagnoses', () => {
  afterEach(() => {
    delete global.fetch;
  });

  it('uploads the photo first and posts only its key', async () => {
    const fetchImpl = mockUploadThen({ id: 'dg_x1', status: 'PENDING' });

    const res = await liveClient.diagnoses.create({
      imageUri: 'file:///tmp/photo.jpg',
      imageBase64: 'aGVsbG8=',
      mode: 'health',
      plantId: 'p2',
    });

    expect(res).toEqual({ ok: true, data: { id: 'dg_x1', status: 'PENDING' } });

    const [signUrl, signInit] = fetchImpl.mock.calls[0];
    expect(signUrl).toBe('http://192.168.1.20:4000/uploads');
    // 'aGVsbG8=' is five bytes decoded, and the signature is bound to that.
    expect(JSON.parse(signInit.body)).toEqual({ contentType: 'image/jpeg', byteLength: 5 });

    const [putUrl, putInit] = fetchImpl.mock.calls[1];
    expect(putUrl).toBe(UPLOAD_URL);
    expect(putInit.method).toBe('PUT');
    expect(putInit.body).toBeInstanceOf(Uint8Array);

    const [scanUrl, scanInit] = fetchImpl.mock.calls[2];
    expect(scanUrl).toBe('http://192.168.1.20:4000/diagnoses');
    expect(JSON.parse(scanInit.body)).toEqual({
      imageKey: UPLOAD_KEY,
      mode: 'health',
      plantId: 'p2',
    });
    // Neither the local file URI nor the bytes belong in the scan request now.
    expect(scanInit.body).not.toContain('file:///');
    expect(scanInit.body).not.toContain('aGVsbG8=');
  });

  it('falls back to inline bytes when the upload fails', async () => {
    const fetchImpl = jest.fn(async (url) => {
      if (String(url).endsWith('/uploads')) {
        return jsonResponse({ ok: false, error: { code: 'INTERNAL', message: 'nope' } }, 500);
      }
      return jsonResponse({ ok: true, data: { id: 'dg_x2', status: 'PENDING' } });
    });
    global.fetch = fetchImpl;

    const res = await liveClient.diagnoses.create({ imageBase64: 'aGVsbG8=' });

    // A scan the user is waiting on matters more than the photo attached to it.
    expect(res).toEqual({ ok: true, data: { id: 'dg_x2', status: 'PENDING' } });
    const [, scanInit] = fetchImpl.mock.calls.at(-1);
    expect(JSON.parse(scanInit.body)).toEqual({ imageBase64: 'aGVsbG8=' });
  });

  it('rejects a capture with neither bytes nor a photo on the device', async () => {
    const fetchImpl = mockFetch();

    const res = await liveClient.diagnoses.create({ imageUri: 'assets/demo/plant-1.jpg' });

    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('VALIDATION');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('passes an error envelope straight through', async () => {
    mockFetch({
      ok: false,
      status: 404,
      body: { ok: false, error: { code: 'NOT_FOUND', message: 'diagnosis dg_x1 not found' } },
    });

    const res = await liveClient.diagnoses.get('dg_x1');
    expect(res).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'diagnosis dg_x1 not found' },
    });
  });

  it('url-encodes the diagnosis id', async () => {
    const fetchImpl = mockFetch({ body: { ok: true, data: {} } });
    await liveClient.diagnoses.get('dg /1');
    expect(fetchImpl.mock.calls[0][0]).toBe('http://192.168.1.20:4000/diagnoses/dg%20%2F1');
  });

  it('turns an unreachable API into an envelope, not a thrown error', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });

    const res = await liveClient.diagnoses.get('dg_x1');
    expect(res.ok).toBe(false);
    expect(res.error.message).toMatch(/Could not reach the API/);
  });

  it('turns a non-JSON response into an envelope', async () => {
    mockFetch({ body: '<html>502 Bad Gateway</html>' });

    const res = await liveClient.diagnoses.get('dg_x1');
    expect(res.ok).toBe(false);
    expect(res.error.message).toMatch(/Unexpected response/);
  });

  it('routes the rest of the interface at the API instead of throwing', async () => {
    const fetchImpl = mockFetch({ body: { ok: true, data: {} } });

    await liveClient.diagnoses.attach('dg_x1', 'p1');
    await liveClient.plants.list();

    expect(fetchImpl.mock.calls.map(([url, init]) => [init?.method ?? 'GET', url])).toEqual([
      ['PUT', 'http://192.168.1.20:4000/diagnoses/dg_x1/plant'],
      ['GET', 'http://192.168.1.20:4000/plants'],
    ]);
  });
});
