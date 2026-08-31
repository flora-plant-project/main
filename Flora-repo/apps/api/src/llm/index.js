import { config } from '../config.js';
import { createBedrockProvider } from './bedrock.js';
import { createGeminiProvider } from './gemini.js';
import { createStubProvider } from './stub.js';

export { LlmProviderError } from './errors.js';
export { createBedrockProvider } from './bedrock.js';
export { createGeminiProvider } from './gemini.js';
export { createStubProvider } from './stub.js';

/**
 * Pick a generator.
 *
 * Two switches, because they answer different questions. FLORA_LLM_ENABLED is
 * "may this process spend money on inference at all", and it stays an explicit
 * opt-in rather than a key check: Bedrock authenticates off the ambient AWS
 * chain, which is often populated for reasons that have nothing to do with
 * wanting to pay for tokens. FLORA_LLM_PROVIDER is "which service", and it
 * defaults to bedrock so a checkout that predates Gemini is unaffected.
 *
 * Gemini additionally needs its key, and a missing one falls back to the stub
 * rather than throwing. Refusing to boot would mean a mistyped variable takes
 * down the whole API — including scanning, watering and the feed — over a
 * feature every caller already treats as optional.
 *
 * The choice is logged rather than silent: "why is every plant getting the same
 * advice" should take one glance at the startup output.
 *
 * The live paths are verified by `pnpm -F api smoke:gemini` and
 * `smoke:bedrock`, not by the test suite: unit tests mock the network.
 *
 * @param {ReturnType<import('../config.js').loadConfig>} [settings]
 * @param {{logger?: Pick<Console, 'info'>}} [options]
 */
export function createLlmProvider(settings = config, { logger = console } = {}) {
  if (!settings.llmEnabled) {
    logger.info(
      '[llm] FLORA_LLM_ENABLED is not 1 — using fixture stubs. Set it to call a model.',
    );
    return createStubProvider();
  }

  if (settings.llmProvider === 'gemini') {
    if (!settings.geminiApiKey) {
      logger.info(
        '[llm] FLORA_LLM_PROVIDER is gemini but GEMINI_API_KEY is unset — using fixture stubs.',
      );
      return createStubProvider();
    }

    logger.info(`[llm] using Gemini (${settings.geminiModel})`);
    return createGeminiProvider({
      apiKey: settings.geminiApiKey,
      modelId: settings.geminiModel,
      timeoutMs: settings.llmTimeoutMs,
    });
  }

  logger.info(`[llm] using Bedrock (${settings.bedrockModelId} in ${settings.bedrockRegion})`);
  return createBedrockProvider({
    region: settings.bedrockRegion,
    modelId: settings.bedrockModelId,
    timeoutMs: settings.llmTimeoutMs,
  });
}
