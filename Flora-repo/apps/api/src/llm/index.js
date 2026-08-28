import { config } from '../config.js';
import { createBedrockProvider } from './bedrock.js';
import { createStubProvider } from './stub.js';

export { LlmProviderError, createBedrockProvider } from './bedrock.js';
export { createStubProvider } from './stub.js';

/**
 * Pick a generator.
 *
 * Unlike recognition, there is no API key whose presence can decide this:
 * Bedrock authenticates off the ambient AWS chain, which may well be populated
 * for unrelated reasons. So the switch is an explicit opt-in, and the choice is
 * logged rather than silent — "why is every plant getting the same advice"
 * should take one glance at the startup output.
 *
 * The live path is verified by `pnpm -F api smoke:bedrock`, not by the test
 * suite: unit tests mock AWS and never make a real call.
 *
 * @param {ReturnType<import('../config.js').loadConfig>} [settings]
 * @param {{logger?: Pick<Console, 'info'>}} [options]
 */
export function createLlmProvider(settings = config, { logger = console } = {}) {
  if (!settings.llmEnabled) {
    logger.info(
      '[llm] FLORA_LLM_ENABLED is not 1 — using fixture stubs. Set it to call Bedrock.',
    );
    return createStubProvider();
  }

  logger.info(`[llm] using Bedrock (${settings.bedrockModelId} in ${settings.bedrockRegion})`);
  return createBedrockProvider({
    region: settings.bedrockRegion,
    modelId: settings.bedrockModelId,
    timeoutMs: settings.llmTimeoutMs,
  });
}
