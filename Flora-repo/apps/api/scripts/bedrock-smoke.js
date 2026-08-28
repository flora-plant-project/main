/**
 * One real Bedrock call, run by hand.
 *
 *   FLORA_LLM_ENABLED=1 pnpm -F api smoke:bedrock
 *
 * Everything in the test suite injects a mock, by design — CLAUDE.md forbids
 * unit tests from touching real AWS. That leaves nothing proving the request
 * shape is one Bedrock actually accepts. This script is that proof, and it is
 * deliberately not wired into `pnpm test`: it costs money and needs credentials.
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
      'Re-run as: FLORA_LLM_ENABLED=1 pnpm -F api smoke:bedrock',
  );
  process.exit(1);
}

console.log(`[smoke] model  : ${config.bedrockModelId}`);
console.log(`[smoke] region : ${config.bedrockRegion}`);
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
  // The underlying AWS error carries the detail that says which field Bedrock
  // rejected — the whole point of running this.
  if (error?.cause) console.error('[smoke] cause:', error.cause);
  process.exit(1);
}
