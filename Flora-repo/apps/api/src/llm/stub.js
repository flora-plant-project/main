import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { LlmProviderError } from './bedrock.js';

const FIXTURE_DIR = new URL('../../test/fixtures/', import.meta.url);

/**
 * Fixture-backed generator. This is what runs unless FLORA_LLM_ENABLED=1, so
 * the API stays fully usable with no AWS credentials, no Bedrock model access
 * and no spend — which is the state most of the team works in.
 *
 * Fixtures are validated against the caller's schema on the way out, exactly
 * like the live path. A canned response that drifts from the schema fails here
 * first, in a test, rather than in whatever renders it.
 *
 * One file per task, named `llm-<task>.json`. Each task module owns its own.
 *
 * @param {{fixtureDir?: URL}} [options]
 */
export function createStubProvider({ fixtureDir = FIXTURE_DIR } = {}) {
  /**
   * @param {{task: string, schema: import('zod').ZodType}} input
   * @returns {Promise<unknown>}
   */
  return async function generate({ task, schema }) {
    const path = fileURLToPath(new URL(`llm-${task}.json`, fixtureDir));

    let payload;
    try {
      // Read lazily so importing this module never depends on the fixtures
      // being present in a deployed bundle.
      payload = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      throw new LlmProviderError(
        `No stub fixture for task "${task}" — expected ${path}. Add one, or set ` +
          `FLORA_LLM_ENABLED=1 to call Bedrock.`,
        { cause: error },
      );
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const where = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
      throw new LlmProviderError(`Stub fixture for "${task}" failed validation at: ${where}`);
    }
    return parsed.data;
  };
}
