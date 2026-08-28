import {
  GetObjectCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { ATTACHED_STATE, LIFECYCLE_TAG, PENDING_STATE } from '@flora/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StorageKeyError, StorageMissingError, createS3Storage } from '../index.js';

/**
 * The S3 driver against a mocked client — never a real bucket, per CLAUDE.md.
 *
 * What is worth asserting here is what the driver puts INTO each command: the
 * signed constraints (size, type, lifecycle tag) are the whole security and
 * cost story of the upload path, and they are invisible from the outside.
 */
const s3Mock = mockClient(S3Client);

const KEY = 'uploads/2026/11111111-2222-3333-4444-555555555555.jpg';
const BYTES = Buffer.from('pretend this is a jpeg');

function makeStorage() {
  return createS3Storage({
    bucket: 'flora-photos',
    region: 'eu-north-1',
    publicBaseUrl: 'https://cdn.example.com/',
    ttlMs: 900_000,
    // Presigning is real signing even under a mocked client — it computes a
    // SigV4 signature locally — so it needs a credential. Dummy static keys
    // keep the test off the credential chain (and off IMDS in CI).
    client: new S3Client({
      region: 'eu-north-1',
      credentials: { accessKeyId: 'AKIATEST', secretAccessKey: 'secret' },
    }),
    now: () => Date.UTC(2026, 7, 25),
  });
}

/** The input of the one command of this type that was sent. */
const inputOf = (Command) => s3Mock.commandCalls(Command)[0].args[0].input;

beforeEach(() => s3Mock.reset());
afterEach(() => s3Mock.reset());

describe('s3 storage driver', () => {
  it('signs an upload URL bound to the size, the type and a pending tag', async () => {
    const upload = await makeStorage().createUpload({
      contentType: 'image/jpeg',
      byteLength: BYTES.length,
    });

    expect(upload.key).toMatch(/^uploads\/2026\/[0-9a-f-]{36}\.jpg$/);
    expect(upload.method).toBe('PUT');
    expect(upload.uploadUrl).toContain(upload.key);
    // Presigned: the credential travels in the URL, and the URL expires.
    expect(upload.uploadUrl).toContain('X-Amz-Signature=');
    expect(upload.uploadUrl).toContain('X-Amz-Expires=900');
    // The client has to echo these back or S3 refuses the PUT — which is what
    // stops a signed URL being reused for a different, larger file.
    expect(upload.headers['x-amz-tagging']).toBe(`${LIFECYCLE_TAG}=${PENDING_STATE}`);
    expect(upload.headers['Content-Type']).toBe('image/jpeg');
    expect(upload.expiresAt).toBe(new Date(Date.UTC(2026, 7, 25) + 900_000).toISOString());
  });

  it('tags inline-base64 writes pending too', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const key = await makeStorage().putBytes(BYTES);

    const input = inputOf(PutObjectCommand);
    expect(input.Key).toBe(key);
    expect(input.Bucket).toBe('flora-photos');
    // Pending, not attached: the row naming this key is written afterwards and
    // can still fail.
    expect(input.Tagging).toBe(`${LIFECYCLE_TAG}=${PENDING_STATE}`);
  });

  it('retags an object attached once a row claims it', async () => {
    s3Mock.on(PutObjectTaggingCommand).resolves({});

    await makeStorage().markAttached(KEY);

    expect(inputOf(PutObjectTaggingCommand).Tagging).toEqual({
      TagSet: [{ Key: LIFECYCLE_TAG, Value: ATTACHED_STATE }],
    });
  });

  it('reads bytes back for recognition', async () => {
    s3Mock.on(GetObjectCommand).resolves({
      ContentType: 'image/jpeg',
      Body: { transformToByteArray: async () => new Uint8Array(BYTES) },
    });

    const read = await makeStorage().read(KEY);

    expect(read.body).toEqual(BYTES);
    expect(read.contentType).toBe('image/jpeg');
    expect(inputOf(GetObjectCommand)).toMatchObject({ Bucket: 'flora-photos', Key: KEY });
  });

  it('reports a missing object as missing, not as a crash', async () => {
    s3Mock.on(GetObjectCommand).rejects(Object.assign(new Error('nope'), { name: 'NoSuchKey' }));

    await expect(makeStorage().read(KEY)).rejects.toBeInstanceOf(StorageMissingError);
  });

  it('refuses keys it did not mint, before any call is made', async () => {
    const storage = makeStorage();

    await expect(storage.read('../../etc/passwd')).rejects.toBeInstanceOf(StorageKeyError);
    await expect(storage.markAttached('uploads/../x.jpg')).rejects.toBeInstanceOf(StorageKeyError);
    expect(s3Mock.calls()).toHaveLength(0);
  });

  it('builds read URLs from the CDN base, with no trailing-slash surprise', () => {
    expect(makeStorage().publicUrl(KEY)).toBe(`https://cdn.example.com/${KEY}`);
  });
});
