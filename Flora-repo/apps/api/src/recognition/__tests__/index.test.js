import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../config.js';
import { STUB_FIXTURES, createRecognitionProvider, createStubProvider } from '../index.js';
import { resolveSpeciesId } from '../../modules/species/catalog.js';

describe('createRecognitionProvider', () => {
  it('falls back to the stub when no key is set, and says so', () => {
    const logger = { info: vi.fn() };
    const recognize = createRecognitionProvider(loadConfig({ PLANT_ID_API_KEY: '' }), { logger });

    expect(typeof recognize).toBe('function');
    expect(logger.info.mock.calls[0][0]).toMatch(/stub provider/);
  });

  it('uses Plant.id when a key is set', () => {
    const logger = { info: vi.fn() };
    createRecognitionProvider(loadConfig({ PLANT_ID_API_KEY: 'live-key' }), { logger });

    expect(logger.info).toHaveBeenCalledWith('[recognition] using Plant.id');
  });

  it('treats whitespace as an unset key', () => {
    const logger = { info: vi.fn() };
    createRecognitionProvider(loadConfig({ PLANT_ID_API_KEY: '   ' }), { logger });

    expect(logger.info.mock.calls[0][0]).toMatch(/stub provider/);
  });
});

describe('createStubProvider', () => {
  it('rejects an unknown fixture name', () => {
    expect(() => createStubProvider({ fixture: 'nope' })).toThrow(/Unknown stub fixture/);
  });

  it.each(STUB_FIXTURES)('replays %s through the real normalizer', async (fixture) => {
    const recognize = createStubProvider({ fixture });
    const result = await recognize({ mode: 'identify', resolveSpeciesId });

    // Every fixture must survive normalization — that is what keeps the canned
    // payloads honest about the shape Plant.id actually returns.
    // Recognition knows nothing about advice — it is attached later, by a model
    // call that is allowed to fail. Providers must leave it null.
    expect(Object.keys(result)).toEqual(['species', 'health', 'advice']);
    expect(result.advice).toBeNull();
    expect(result.health.confidence).toBeGreaterThanOrEqual(0);
    expect(result.health.confidence).toBeLessThanOrEqual(1);
  });

  it('defaults to the healthy fixture', async () => {
    const result = await createStubProvider()({ mode: 'identify', resolveSpeciesId });
    expect(result.species[0].speciesId).toBe('sp1');
  });
});
