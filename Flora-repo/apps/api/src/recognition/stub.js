import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizePlantIdResponse } from './normalize.js';

/**
 * Canned Plant.id responses, named to match the mobile mock's fixtures so the
 * mock, the stub and the live provider all describe the same three scenarios.
 */
export const STUB_FIXTURES = Object.freeze(['healthy-basil', 'diseased-tomato', 'blurry']);

const FIXTURE_DIR = new URL('../../test/fixtures/', import.meta.url);

/**
 * Fixture-backed recognition provider. This is what runs when PLANT_ID_API_KEY
 * is unset, so the API is fully usable with no credentials and no network —
 * most of the team never needs a key.
 *
 * Fixtures are raw provider payloads, not pre-normalized results, so the stub
 * exercises the same normalizer the live path does. A fixture that stops
 * matching the real API shape fails here first.
 *
 * `delayMs` imitates provider latency. Reading a local file is effectively
 * instant, which makes the PENDING state unobservable — a client would go
 * straight to COMPLETE and never exercise its polling path. Set it to make the
 * stub behave like something that has to cross a network.
 *
 * @param {{fixture?: string, delayMs?: number}} [options]
 */
export function createStubProvider({ fixture = 'healthy-basil', delayMs = 0 } = {}) {
  if (!STUB_FIXTURES.includes(fixture)) {
    throw new Error(
      `Unknown stub fixture "${fixture}" — expected one of: ${STUB_FIXTURES.join(', ')}`,
    );
  }

  /**
   * @param {{mode?: string, resolveSpeciesId?: (name: string) => (string|null)}} input
   * @returns {Promise<import('@flora/shared/src/types.js').RecognitionResult>}
   */
  return async function recognize({ mode, resolveSpeciesId }) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));

    // Read lazily so importing this module never depends on the fixture files
    // being present in a deployed bundle.
    const path = fileURLToPath(new URL(`plantid-${fixture}.json`, FIXTURE_DIR));
    const payload = JSON.parse(await readFile(path, 'utf8'));
    return normalizePlantIdResponse(payload, { mode, resolveSpeciesId });
  };
}
