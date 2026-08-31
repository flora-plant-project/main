/**
 * One real Gemini call, run by hand.
 *
 *   FLORA_LLM_ENABLED=1 FLORA_LLM_PROVIDER=gemini pnpm -F api smoke:gemini
 *
 * (Both are already set in .env, so `pnpm -F api smoke:gemini` is enough there.)
 *
 * Everything in the test suite injects a fake fetch, by design — CLAUDE.md
 * forbids unit tests from calling a real provider. That leaves nothing proving
 * the request shape is one Gemini actually accepts, and Gemini rejects several
 * plausible-looking bodies with a bare "Request contains an invalid argument":
 * a `thinkingBudget` (the 2.5 spelling) on a 3.x model, or a JSON response mime
 * type with no schema beside it. This script is the proof, and it is
 * deliberately not wired into `pnpm test`.
 */
import { z } from 'zod';
import { loadConfig } from '../src/config.js';
import { createLlmProvider } from '../src/llm/index.js';

const SmokeSchema = z.object({
  ok: z.boolean(),
  greeting: z.string().min(1),
  plants: z.array(z.string()).max(3),
});

const config = loadConfig();

if (!config.llmEnabled) {
  console.error(
    'FLORA_LLM_ENABLED is not 1, so this would only exercise the fixture stub.\n' +
      'Re-run as: FLORA_LLM_ENABLED=1 FLORA_LLM_PROVIDER=gemini pnpm -F api smoke:gemini',
  );
  process.exit(1);
}
if (config.llmProvider !== 'gemini') {
  console.error(
    `FLORA_LLM_PROVIDER is "${config.llmProvider}", so this would smoke-test that instead.\n` +
      'Re-run with FLORA_LLM_PROVIDER=gemini, or use `pnpm -F api smoke:bedrock`.',
  );
  process.exit(1);
}
if (!config.geminiApiKey) {
  console.error('GEMINI_API_KEY is unset — get a key at https://aistudio.google.com/apikey');
  process.exit(1);
}

console.log(`[smoke] model  : ${config.geminiModel}`);
console.log(`[smoke] timeout: ${config.llmTimeoutMs}ms\n`);

const generate = createLlmProvider(config);
const startedAt = Date.now();

try {
  const result = await generate({
    task: 'smoke',
    system:
      'You are a plant care assistant being smoke-tested. Answer only with the requested JSON.',
    user: 'Say hello and name up to three herbs that grow well in Lebanon.',
    schema: SmokeSchema,
    maxTokens: 2000,
    effort: 'low',
  });

  console.log(`[smoke] PASS in ${Date.now() - startedAt}ms`);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`[smoke] FAIL in ${Date.now() - startedAt}ms`);
  console.error(`[smoke] status: ${error?.status ?? 'n/a'}`);
  console.error(`[smoke] ${error?.message ?? error}`);
  // The message carries Gemini's own error body, which is what says which field
  // it rejected — the whole point of running this.
  if (error?.cause) console.error('[smoke] cause:', error.cause);
  process.exit(1);
}
