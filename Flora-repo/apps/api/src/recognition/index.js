import { config } from '../config.js';
import { createPlantIdProvider } from './plantId.js';
import { createStubProvider } from './stub.js';

export { RecognitionProviderError } from './plantId.js';
export { normalizePlantIdResponse } from './normalize.js';
export { STUB_FIXTURES, createStubProvider } from './stub.js';

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
