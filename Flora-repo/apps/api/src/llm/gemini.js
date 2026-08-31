import { z } from 'zod';
import { LlmProviderError } from './errors.js';

/** Where the Gemini REST API lives. An option rather than an env var — the only
 * reason to change it is to point the suite at a mock server, and tests inject
 * `fetchImpl` for that instead. */
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * How the shared `effort` knob maps onto Gemini's reasoning control.
 *
 * Gemini 3 renamed this: 2.5 took `thinkingBudget` (a token count), 3.x takes
 * `thinkingLevel` (a word). They are not interchangeable — sending
 * `thinkingBudget` to a 3.x model is a flat 400 with no hint as to which field
 * it disliked, which is a miserable thing to debug at demo time.
 *
 * The levels are worth real latency. Measured on gemini-3.6-flash writing one
 * care plan: 'low' answers in ~2s having spent no thinking tokens, while
 * omitting the field entirely lets the model spend 554 of them and take ~5s.
 * Both features here are bounded tasks with someone watching a spinner, so they
 * ask for 'low' and mean it.
 */
const THINKING_LEVELS = Object.freeze({ low: 'low', medium: 'medium', high: 'high' });

/**
 * Strip the keywords Gemini's schema validator rejects.
 *
 * Only `$schema` needs removing today — the rest of what `z.toJSONSchema`
 * emits, `additionalProperties` and `minLength` included, is accepted as-is by
 * `responseJsonSchema`. It is a copy rather than a `delete` on the caller's
 * object because the schemas are module-level constants shared with every other
 * caller in the process.
 *
 * @param {import('zod').ZodType} schema
 * @returns {object} JSON Schema Gemini will accept
 */
function toResponseSchema(schema) {
  const jsonSchema = { ...z.toJSONSchema(schema) };
  // `$schema` is metadata the JSON Schema spec puts at the root; Gemini wants a
  // bare schema object, exactly as Bedrock does.
  delete jsonSchema.$schema;
  return jsonSchema;
}

/**
 * Build a Gemini-backed generator.
 *
 * Same signature as the Bedrock one, deliberately: a prompt and a zod schema
 * in, a validated object out. That is the whole contract the rest of the API
 * knows about a model, so which provider is answering is a config line rather
 * than a change to any feature.
 *
 * Talks to the REST endpoint over plain `fetch` instead of taking on
 * `@google/genai`. The surface actually used here is one POST and one response
 * shape; a dependency for that would be more code to keep current, not less. It
 * also matches how the Plant.id adapter is written.
 *
 * Unlike Bedrock, which reads the ambient AWS credential chain, Gemini
 * authenticates with a plain API key. That key is a secret: it must never be
 * given an EXPO_PUBLIC_ name, or it ships inside the app bundle.
 *
 * @param {{
 *   apiKey: string,
 *   modelId: string,
 *   timeoutMs: number,
 *   baseUrl?: string,
 *   fetchImpl?: typeof fetch,
 * }} options
 */
export function createGeminiProvider({
  apiKey,
  modelId,
  timeoutMs,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = fetch,
}) {
  if (!apiKey) {
    throw new Error('createGeminiProvider requires an API key');
  }
  if (!modelId) {
    throw new Error('createGeminiProvider requires a model id');
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/models/${modelId}:generateContent`;

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
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          // The key rides a header, not the query string: a URL ends up in
          // proxy logs and error messages, and this one is a credential.
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: maxTokens,
            // These two travel together and must: asking for the JSON mime type
            // without also naming a schema is rejected with a 400. Gemini reads
            // it as "constrained decoding, constrained to what exactly?".
            responseMimeType: 'application/json',
            responseJsonSchema: toResponseSchema(schema),
            thinkingConfig: { thinkingLevel: THINKING_LEVELS[effort] ?? 'low' },
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      throw new LlmProviderError(
        timedOut
          ? `Gemini did not respond within ${timeoutMs}ms on "${task}"`
          : `Could not reach Gemini for "${task}": ${error?.message ?? 'network error'}`,
        { cause: error },
      );
    }

    if (!response.ok) {
      // Read the body for the message, but never let a huge error page or a
      // second failure mask the status we actually want to report.
      let detail = '';
      try {
        detail = (await response.text()).slice(0, 300);
      } catch {
        detail = '';
      }
      throw new LlmProviderError(
        `Gemini returned ${response.status} on "${task}"${detail ? `: ${detail}` : ''}`,
        { status: response.status },
      );
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new LlmProviderError(`Gemini returned a non-JSON body for "${task}"`, { cause: error });
    }

    const candidate = payload.candidates?.[0];

    // A blocked prompt comes back 200 with no candidate at all, so this is
    // checked before anything reads into one.
    if (!candidate) {
      const blocked = payload.promptFeedback?.blockReason;
      throw new LlmProviderError(
        blocked
          ? `Gemini blocked the "${task}" prompt (${blocked})`
          : `Gemini returned no candidates for "${task}"`,
      );
    }
    if (candidate.finishReason === 'MAX_TOKENS') {
      throw new LlmProviderError(`Gemini hit maxOutputTokens on "${task}" — the JSON is truncated`);
    }
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      throw new LlmProviderError(
        `Gemini stopped early on "${task}" (${candidate.finishReason})`,
      );
    }

    // Reasoning, when a model emits it, arrives as its own part — so pick the
    // text one rather than assuming parts[0].
    const text = candidate.content?.parts?.find((part) => part.text)?.text;
    if (!text) {
      throw new LlmProviderError(`Gemini returned no text part for "${task}"`);
    }

    let parsedJson;
    try {
      parsedJson = JSON.parse(stripFence(text));
    } catch (error) {
      throw new LlmProviderError(`Gemini returned non-JSON for "${task}"`, { cause: error });
    }

    // The schema steers decoding; it does not guarantee the result. This parse
    // is the actual contract, and it is the same one the stub and Bedrock paths
    // answer to — a provider swap cannot quietly change the shape a feature gets.
    const parsed = schema.safeParse(parsedJson);
    if (!parsed.success) {
      const where = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
      throw new LlmProviderError(`Gemini output for "${task}" failed validation at: ${where}`);
    }
    return parsed.data;
  };
}

/**
 * Unwrap a ```json fenced block if the model wrapped its answer in one.
 *
 * `responseMimeType` should make this unnecessary. It costs one regex to not
 * care whether every model on every API version honours it.
 * @param {string} text
 */
function stripFence(text) {
  const fenced = text.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
  return fenced ? fenced[1] : text;
}
