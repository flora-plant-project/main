import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../config.js';
import { createLlmProvider } from '../index.js';

describe('createLlmProvider', () => {
  it('falls back to fixtures when the flag is unset, and says so', () => {
    const logger = { info: vi.fn() };
    const generate = createLlmProvider(loadConfig({ FLORA_LLM_ENABLED: '' }), { logger });

    expect(typeof generate).toBe('function');
    expect(logger.info.mock.calls[0][0]).toMatch(/fixture stubs/);
  });

  it('uses Bedrock when the flag is 1, naming the model and region', () => {
    const logger = { info: vi.fn() };
    createLlmProvider(
      loadConfig({ FLORA_LLM_ENABLED: '1', FLORA_BEDROCK_REGION: 'eu-central-1' }),
      { logger },
    );

    expect(logger.info).toHaveBeenCalledWith(
      '[llm] using Bedrock (openai.gpt-oss-120b-1:0 in eu-central-1)',
    );
  });

  it('treats any value other than 1 as off — no accidental spend', () => {
    for (const value of ['0', 'true', 'yes', ' ']) {
      const logger = { info: vi.fn() };
      createLlmProvider(loadConfig({ FLORA_LLM_ENABLED: value }), { logger });
      expect(logger.info.mock.calls[0][0]).toMatch(/fixture stubs/);
    }
  });

  it('uses Gemini when the provider says so, naming the model', () => {
    const logger = { info: vi.fn() };
    const generate = createLlmProvider(
      loadConfig({
        FLORA_LLM_ENABLED: '1',
        FLORA_LLM_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'test-key',
      }),
      { logger },
    );

    expect(typeof generate).toBe('function');
    expect(logger.info).toHaveBeenCalledWith('[llm] using Gemini (gemini-3.6-flash)');
  });

  it('reads the provider case-insensitively, as a hand-edited .env supplies it', () => {
    const logger = { info: vi.fn() };
    createLlmProvider(
      loadConfig({
        FLORA_LLM_ENABLED: '1',
        FLORA_LLM_PROVIDER: ' Gemini ',
        GEMINI_API_KEY: 'test-key',
      }),
      { logger },
    );

    expect(logger.info.mock.calls[0][0]).toMatch(/using Gemini/);
  });

  it('falls back to fixtures when Gemini is chosen with no key — never crashes the API', () => {
    const logger = { info: vi.fn() };
    const generate = createLlmProvider(
      loadConfig({ FLORA_LLM_ENABLED: '1', FLORA_LLM_PROVIDER: 'gemini', GEMINI_API_KEY: '' }),
      { logger },
    );

    expect(typeof generate).toBe('function');
    expect(logger.info.mock.calls[0][0]).toMatch(/GEMINI_API_KEY is unset/);
  });

  it('still defaults to Bedrock, so a pre-Gemini .env is unaffected', () => {
    const logger = { info: vi.fn() };
    createLlmProvider(loadConfig({ FLORA_LLM_ENABLED: '1', GEMINI_API_KEY: 'test-key' }), {
      logger,
    });

    expect(logger.info.mock.calls[0][0]).toMatch(/using Bedrock/);
  });
});

describe('llm config defaults', () => {
  it('defaults to gpt-oss-120b in us-east-1 with a 30s ceiling', () => {
    const settings = loadConfig({});
    expect(settings.llmEnabled).toBe(false);
    expect(settings.llmProvider).toBe('bedrock');
    expect(settings.bedrockModelId).toBe('openai.gpt-oss-120b-1:0');
    expect(settings.bedrockRegion).toBe('us-east-1');
    expect(settings.llmTimeoutMs).toBe(30_000);
  });

  it('defaults Gemini to a 3.x model — 2.5 is closed to keys issued today', () => {
    // A key issued now gets a 404 for gemini-2.5-flash, naming 3.6-flash as the
    // replacement. Defaulting to 2.5 would break every new checkout.
    expect(loadConfig({}).geminiModel).toBe('gemini-3.6-flash');
    expect(loadConfig({}).geminiModel).not.toMatch(/^gemini-2/);
  });

  it('falls back to the default timeout when the value is unparseable', () => {
    expect(loadConfig({ FLORA_LLM_TIMEOUT_MS: 'soon' }).llmTimeoutMs).toBe(30_000);
  });
});
