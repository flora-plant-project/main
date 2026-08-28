import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { StorageKeyError, StorageMissingError, createLocalStorage } from '../index.js';

const BYTES = Buffer.from('pretend this is a jpeg');

/** A driver on a throwaway directory, with a clock the test controls. */
async function makeStorage({ now = () => 1_000_000 } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'flora-storage-'));
  return {
    dir,
    storage: createLocalStorage({
      dir,
      secret: 'test-secret',
      baseUrl: 'http://localhost:4000/',
      ttlMs: 60_000,
      now,
    }),
  };
}

/** The claim a PUT to `uploadUrl` would arrive with. */
function claimFor(upload, overrides = {}) {
  const query = new URL(upload.uploadUrl).searchParams;
  return {
    key: upload.key,
    contentType: 'image/jpeg',
    byteLength: BYTES.length,
    expires: query.get('expires'),
    signature: query.get('signature'),
    ...overrides,
  };
}

describe('local storage driver', () => {
  it('mints a key, signs an upload URL, and accepts the matching claim', async () => {
    const { storage } = await makeStorage();
    const upload = await storage.createUpload({
      contentType: 'image/jpeg',
      byteLength: BYTES.length,
    });

    expect(upload.key).toMatch(/^uploads\/\d{4}\/[0-9a-f-]{36}\.jpg$/);
    expect(upload.method).toBe('PUT');
    expect(upload.uploadUrl.startsWith(`http://localhost:4000/${upload.key}?`)).toBe(true);
    expect(storage.verifyUpload(claimFor(upload))).toBeNull();
  });

  it('round-trips bytes and serves them from the key', async () => {
    const { dir, storage } = await makeStorage();
    const upload = await storage.createUpload({ contentType: 'image/png', byteLength: 3 });

    await storage.put(upload.key, BYTES);

    expect(await readFile(path.join(dir, upload.key))).toEqual(BYTES);
    const read = await storage.read(upload.key);
    expect(read.body).toEqual(BYTES);
    expect(read.contentType).toBe('image/png');
    expect(storage.publicUrl(upload.key)).toBe(`http://localhost:4000/${upload.key}`);
  });

  it('mints its own key for bytes the API already holds', async () => {
    const { storage } = await makeStorage();
    // A real PNG header, so the driver names the key from the bytes.
    const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), BYTES]);

    const key = await storage.putBytes(png);

    expect(key).toMatch(/\.png$/);
    expect((await storage.read(key)).body).toEqual(png);
  });

  it.each([
    ['a different byte count', { byteLength: BYTES.length + 1 }],
    ['a different content type', { contentType: 'image/png' }],
    ['a forged signature', { signature: 'f'.repeat(64) }],
    ['a signature of the wrong length', { signature: 'nope' }],
    ['a malformed expiry', { expires: 'soon' }],
  ])('refuses an upload claim with %s', async (_label, overrides) => {
    const { storage } = await makeStorage();
    const upload = await storage.createUpload({
      contentType: 'image/jpeg',
      byteLength: BYTES.length,
    });

    expect(storage.verifyUpload(claimFor(upload, overrides))).toBeTruthy();
  });

  it('refuses an expired upload URL', async () => {
    let clock = 1_000_000;
    const { storage } = await makeStorage({ now: () => clock });
    const upload = await storage.createUpload({
      contentType: 'image/jpeg',
      byteLength: BYTES.length,
    });

    clock += 61_000;

    expect(storage.verifyUpload(claimFor(upload))).toBe('this upload URL has expired');
  });

  it('refuses keys it did not mint, including traversal attempts', async () => {
    const { storage } = await makeStorage();

    expect(storage.verifyUpload({ ...claimFor({ uploadUrl: 'http://x/?' }), key: '../secrets' }))
      .toBe('not an upload key');
    await expect(storage.read('uploads/../../etc/passwd')).rejects.toBeInstanceOf(StorageKeyError);
  });

  it('reports a missing object distinctly from a bad key', async () => {
    const { storage } = await makeStorage();
    const upload = await storage.createUpload({ contentType: 'image/jpeg', byteLength: 1 });

    await expect(storage.read(upload.key)).rejects.toBeInstanceOf(StorageMissingError);
  });
});
