import { config } from '../config.js';
import { createPlantIdProvider } from './plantId.js';
import { createPlantIdNameSearch } from './plantIdNames.js';
import { createStubProvider } from './stub.js';
import { createStubNameSearch } from './nameSearchStub.js';

export { RecognitionProviderError } from './plantId.js';
export { normalizePlantIdResponse } from './normalize.js';
export { STUB_FIXTURES, createStubProvider } from './stub.js';
export { createPlantIdNameSearch, normalizeNameSearch } from './plantIdNames.js';
export { STUB_SPECIES_NAMES, createStubNameSearch } from './nameSearchStub.js';

/**
 * Pick a recognition provider.
 *
 * With a Plant.id key set you get the real thing; without one you get the
 * fixture-backed stub. The choice is logged rather than silent — "why is every
 * scan returning basil" should take one glance at the startup output, not a
 * debugging session.
 *
 * @param {ReturnType<import('../config.js').loadConfig>} [settings]
 * @param {{logger?: Pick<Console, 'info'>}} [options]
 */
export function createRecognitionProvider(settings = config, { logger = console } = {}) {
  if (!settings.plantIdApiKey) {
    logger.info(
      `[recognition] PLANT_ID_API_KEY is unset — using the stub provider ` +
        `(fixture: ${settings.stubFixture}). Set a key to call Plant.id.`,
    );
    return createStubProvider({ fixture: settings.stubFixture, delayMs: settings.stubDelayMs });
  }

  logger.info('[recognition] using Plant.id');
  return createPlantIdProvider({
    apiKey: settings.plantIdApiKey,
    baseUrl: settings.plantIdBaseUrl,
    timeoutMs: settings.recognitionTimeoutMs,
  });
}

/**
 * Pick a species name search.
 *
 * Keyed off the same Plant.id credential as recognition, and for the same
 * reason: with a key you get the provider's full species database, without one
 * you get a short offline list. Logged at the same volume as its sibling — one
 * line, once, at startup.
 *
 * Worth knowing when reading spend: this endpoint is free. It is the
 * `/identification` call in `createRecognitionProvider` that costs a credit.
 *
 * @param {ReturnType<import('../config.js').loadConfig>} [settings]
 * @param {{logger?: Pick<Console, 'info'>}} [options]
 */
export function createNameSearch(settings = config, { logger = console } = {}) {
  if (!settings.plantIdApiKey) {
    logger.info(
      '[species] PLANT_ID_API_KEY is unset — name search uses the offline stub list.',
    );
    return createStubNameSearch();
  }

  logger.info('[species] name search using Plant.id (free — no credits)');
  return createPlantIdNameSearch({
    apiKey: settings.plantIdApiKey,
    baseUrl: settings.plantIdBaseUrl,
    timeoutMs: settings.recognitionTimeoutMs,
  });
}
