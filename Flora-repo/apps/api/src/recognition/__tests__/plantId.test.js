import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { RecognitionProviderError, createPlantIdProvider } from '../plantId.js';

const healthyBasil = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../test/fixtures/plantid-healthy-basil.json', import.meta.url)),
    'utf8',
  ),
);

/**
 * @param {{ok?: boolean, status?: number, json?: object, text?: string}} [options]
 */
function fakeFetch(options = {}) {
  const { ok = true, status = 200, json = healthyBasil, text = '' } = options;
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => json,
    text: async () => text,
  }));
}

/**
 * @param {ReturnType<typeof fakeFetch>} fetchImpl
 */
function provider(fetchImpl) {
  return createPlantIdProvider({
    apiKey: 'test-key',
    baseUrl: 'https://plant.id/api/v3',
    timeoutMs: 1000,
    fetchImpl,
  });
}

describe('createPlantIdProvider', () => {
  it('refuses to build without an API key', () => {
    expect(() => createPlantIdProvider({ apiKey: '', baseUrl: '', timeoutMs: 1 })).toThrow(
      /requires an API key/,
    );
  });

  it('sends the key, the image, and health as a query modifier', async () => {
    const fetchImpl = fakeFetch();
    await provider(fetchImpl)({ imageBase64: 'aGVsbG8=', mode: 'identify' });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('/identification');
    // Treatment details are opt-in; without them the result screen has no steps.
    expect(url).toContain('treatment');
    // Modifiers belong in the query string. Sending them in the body makes
    // Plant.id reject the entire request with a 400.
    expect(url).toContain('health=all');
    expect(init.headers['Api-Key']).toBe('test-key');

    expect(JSON.parse(init.body)).toEqual({ images: ['aGVsbG8='] });
  });

  it('never puts modifiers in the body', async () => {
    const fetchImpl = fakeFetch();
    await provider(fetchImpl)({ imageBase64: 'aGVsbG8=', mode: 'health' });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('health');
    // There is no `similar_images=false` — you opt in by adding the modifier,
    // and sending it as `false` is a 400.
    expect(body).not.toHaveProperty('similar_images');
    expect(fetchImpl.mock.calls[0][0]).not.toContain('similar_images');
  });

  it('returns a normalized result, not the raw payload', async () => {
    const result = await provider(fakeFetch())({ imageBase64: 'aGVsbG8=', mode: 'identify' });

    // advice is defaulted in by the schema and stays null until the LLM pass.
    expect(Object.keys(result)).toEqual(['species', 'health', 'advice']);
    expect(result.advice).toBeNull();
    expect(result.species[0].scientificName).toBe('Ocimum basilicum');
  });

  it('reports a non-2xx response as a provider error carrying the status', async () => {
    const fetchImpl = fakeFetch({ ok: false, status: 401, text: 'invalid api key' });

    await expect(provider(fetchImpl)({ imageBase64: 'aGVsbG8=' })).rejects.toMatchObject({
      name: 'RecognitionProviderError',
      status: 401,
    });
  });

  it('still reports the status when the error body cannot be read', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error('stream already consumed');
      },
    }));

    await expect(provider(fetchImpl)({ imageBase64: 'aGVsbG8=' })).rejects.toMatchObject({
      status: 500,
    });
  });

  it('translates a timeout into a provider error', async () => {
    const fetchImpl = vi.fn(async () => {
      const error = new Error('The operation was aborted');
      error.name = 'TimeoutError';
      throw error;
    });

    await expect(provider(fetchImpl)({ imageBase64: 'aGVsbG8=' })).rejects.toThrow(
      /did not respond within 1000ms/,
    );
  });

  it('translates a non-JSON body into a provider error', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Unexpected token <');
      },
    }));

    await expect(provider(fetchImpl)({ imageBase64: 'aGVsbG8=' })).rejects.toBeInstanceOf(
      RecognitionProviderError,
    );
  });
});
