import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { z } from 'zod';

/** Raised when the model is reachable but the call did not produce usable JSON. */
export class LlmProviderError extends Error {
  /**
   * @param {string} message
   * @param {{status?: number, cause?: unknown}} [options]
   */
  constructor(message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'LlmProviderError';
    this.status = status;
  }
}

/**
 * Turn a zod schema into the JSON Schema the model is constrained to.
 *
 * `strict: false` is deliberate. OpenAI's strict mode demands that every
 * property appear in `required`, and our schemas carry genuinely optional
 * fields — DraftPlantContext.speciesName and friends — which zod correctly
 * leaves out. (Fields with a `.default()` do land in `required`: after parsing
 * they are always present.) The real guarantee is the zod parse on the way out;
 * the JSON Schema here is strong steering, not the contract.
 *
 * @param {import('zod').ZodType} schema
 * @param {string} name
 */
function toResponseFormat(schema, name) {
  const jsonSchema = z.toJSONSchema(schema);
  // `$schema` is metadata the JSON Schema spec puts at the root; Bedrock wants
  // a bare schema object, so drop it.
  delete jsonSchema.$schema;
  return { type: 'json_schema', json_schema: { name, strict: false, schema: jsonSchema } };
}

/**
 * Build a Bedrock-backed generator.
 *
 * The returned function is the only thing the rest of the API knows about the
 * model: a prompt and a zod schema in, a validated object out. Every LLM
 * feature (care advice, post drafts) is a prompt module on top of this one
 * signature, so swapping models — or providers — is a single file.
 *
 * Uses the Converse API rather than InvokeModel: Converse is model-agnostic, so
 * moving between gpt-oss and any other Bedrock model is a config change instead
 * of a rewrite. OpenAI-native fields that Converse has no slot for ride along in
 * `additionalModelRequestFields`, which is the documented escape hatch.
 *
 * Credentials come from the standard AWS chain — env vars, shared config, or
 * the task role in deployment. There is no Flora-specific key to leak, which is
 * why the stub/live switch keys off an explicit flag instead of a secret.
 *
 * @param {{
 *   region: string,
 *   modelId: string,
 *   timeoutMs: number,
 *   client?: { send: Function },
 * }} options
 */
export function createBedrockProvider({ region, modelId, timeoutMs, client }) {
  if (!region) {
    throw new Error('createBedrockProvider requires an AWS region');
  }
  if (!modelId) {
    throw new Error('createBedrockProvider requires a model id');
  }

  const bedrock =
    client ??
    new BedrockRuntimeClient({
      region,
      maxAttempts: 2,
      requestHandler: { requestTimeout: timeoutMs },
    });

  /**
   * @param {{
   *   task: string,
   *   system: string,
   *   user: string,
   *   schema: import('zod').ZodType,
   *   maxTokens?: number,
   *   effort?: 'low'|'medium'|'high',
   * }} input
   * @returns {Promise<unknown>} the model's answer, parsed and schema-validated
   */
  return async function generate({ task, system, user, schema, maxTokens = 8000, effort = 'medium' }) {
    let response;
    try {
      response = await bedrock.send(
        new ConverseCommand({
          modelId,
          system: [{ text: system }],
          messages: [{ role: 'user', content: [{ text: user }] }],
          inferenceConfig: { maxTokens, temperature: 0.3 },
          additionalModelRequestFields: {
            // gpt-oss exposes an adjustable reasoning budget. These are bounded,
            // well-specified tasks; 'high' buys accuracy we do not need and
            // latency the user waits through.
            reasoning_effort: effort,
            response_format: toResponseFormat(schema, task.replace(/-/g, '_')),
          },
        }),
      );
    } catch (error) {
      throw new LlmProviderError(`Bedrock call for "${task}" failed: ${error?.message ?? error}`, {
        status: error?.$metadata?.httpStatusCode,
        cause: error,
      });
    }

    if (response.stopReason === 'max_tokens') {
      throw new LlmProviderError(`Bedrock hit max_tokens on "${task}" — the JSON is truncated`);
    }
    if (response.stopReason === 'content_filtered' || response.stopReason === 'guardrail_intervened') {
      throw new LlmProviderError(`Bedrock filtered the "${task}" response (${response.stopReason})`);
    }

    // Reasoning arrives in its own block type, so pick the text one rather than
    // assuming content[0].
    const text = response.output?.message?.content?.find((block) => block.text)?.text;
    if (!text) {
      throw new LlmProviderError(`Bedrock returned no text block for "${task}"`);
    }

    let payload;
    try {
      payload = JSON.parse(stripFence(text));
    } catch (error) {
      throw new LlmProviderError(`Bedrock returned non-JSON for "${task}"`, { cause: error });
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const where = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
      throw new LlmProviderError(`Bedrock output for "${task}" failed validation at: ${where}`);
    }
    return parsed.data;
  };
}

/**
 * Unwrap a ```json fenced block if the model wrapped its answer in one.
 *
 * `response_format` should make this unnecessary. It costs one regex to not
 * care whether every model on every Bedrock region honours it.
 * @param {string} text
 */
function stripFence(text) {
  const fenced = text.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
  return fenced ? fenced[1] : text;
}
