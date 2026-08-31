import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { LlmProviderError } from '../errors.js';
import { createGeminiProvider } from '../gemini.js';

const Schema = z.object({ verdict: z.string().min(1), score: z.number() });

const call = { task: 'smoke', system: 'You are a test.', user: 'Judge this.', schema: Schema };

/** A well-formed generateContent reply carrying `payload` as its JSON text part. */
function reply(payload, overrides = {}) {
  return {
    candidates: [
      {
        finishReason: 'STOP',
        content: { role: 'model', parts: [{ text: JSON.stringify(payload) }] },
      },
    ],
    ...overrides,
  };
}

/**
 * A fetch that never touches the network, per the CLAUDE.md rule that unit
 * tests never call a real provider.
 * @param {{status?: number, body?: unknown, text?: string}} response
 */
function fetchReturning({ status = 200, body, text }) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (text !== undefined) throw new SyntaxError('not json');
      return body;
    },
    text: async () => (text !== undefined ? text : JSON.stringify(body)),
  }));
}

function makeProvider(fetchImpl) {
  return createGeminiProvider({
    apiKey: 'test-key',
    modelId: 'gemini-3.6-flash',
    timeoutMs: 30_000,
    fetchImpl,
  });
}

/** The URL and parsed body of the single request sent. */
function sentRequest(fetchImpl) {
  const [url, init] = fetchImpl.mock.calls[0];
  return { url, init, body: JSON.parse(init.body) };
}

describe('createGeminiProvider', () => {
  it('requires an API key and a model id', () => {
    expect(() => createGeminiProvider({ modelId: 'm', timeoutMs: 1 })).toThrow(
      /requires an API key/,
    );
    expect(() => createGeminiProvider({ apiKey: 'k', timeoutMs: 1 })).toThrow(
      /requires a model id/,
    );
  });

  it('returns the parsed, schema-validated payload', async () => {
    const fetchImpl = fetchReturning({ body: reply({ verdict: 'healthy', score: 0.9 }) });
    await expect(makeProvider(fetchImpl)(call)).resolves.toEqual({
      verdict: 'healthy',
      score: 0.9,
    });
  });

  it('posts to the model endpoint with the key in a header, never the URL', async () => {
    const fetchImpl = fetchReturning({ body: reply({ verdict: 'ok', score: 1 }) });
    await makeProvider(fetchImpl)(call);

    const { url, init } = sentRequest(fetchImpl);
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
    );
    // A credential in a query string ends up in proxy logs and error messages.
    expect(url).not.toContain('test-key');
    expect(init.method).toBe('POST');
    expect(init.headers['x-goog-api-key']).toBe('test-key');
  });

  it('sends the system prompt and user turn in generateContent shape', async () => {
    const fetchImpl = fetchReturning({ body: reply({ verdict: 'ok', score: 1 }) });
    await makeProvider(fetchImpl)(call);

    const { body } = sentRequest(fetchImpl);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'You are a test.' }] });
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'Judge this.' }] }]);
  });

  it('constrains decoding with the schema, minus the $schema key Gemini rejects', async () => {
    const fetchImpl = fetchReturning({ body: reply({ verdict: 'ok', score: 1 }) });
    await makeProvider(fetchImpl)(call);

    const { generationConfig } = sentRequest(fetchImpl).body;
    expect(generationConfig.responseMimeType).toBe('application/json');
    expect(generationConfig.responseJsonSchema).toBeDefined();
    expect(generationConfig.responseJsonSchema.$schema).toBeUndefined();
    expect(generationConfig.responseJsonSchema.properties.verdict).toMatchObject({
      type: 'string',
    });
    expect(generationConfig.responseJsonSchema.required).toEqual(['verdict', 'score']);
  });

  it('maps effort onto thinkingLevel — never the 2.5-era thinkingBudget', async () => {
    for (const [effort, level] of [
      ['low', 'low'],
      ['medium', 'medium'],
      ['high', 'high'],
    ]) {
      const fetchImpl = fetchReturning({ body: reply({ verdict: 'ok', score: 1 }) });
      await makeProvider(fetchImpl)({ ...call, effort });

      const { generationConfig } = sentRequest(fetchImpl).body;
      expect(generationConfig.thinkingConfig).toEqual({ thinkingLevel: level });
      // Gemini 3.x answers a thinkingBudget with a bare 400.
      expect(generationConfig.thinkingConfig.thinkingBudget).toBeUndefined();
    }
  });

  it('falls back to low thinking for an unknown effort rather than sending it raw', async () => {
    const fetchImpl = fetchReturning({ body: reply({ verdict: 'ok', score: 1 }) });
    await makeProvider(fetchImpl)({ ...call, effort: 'exhaustive' });

    expect(sentRequest(fetchImpl).body.generationConfig.thinkingConfig).toEqual({
      thinkingLevel: 'low',
    });
  });

  it('passes maxTokens through as maxOutputTokens', async () => {
    const fetchImpl = fetchReturning({ body: reply({ verdict: 'ok', score: 1 }) });
    await makeProvider(fetchImpl)({ ...call, maxTokens: 1234 });

    expect(sentRequest(fetchImpl).body.generationConfig.maxOutputTokens).toBe(1234);
  });

  it('reports an HTTP failure with its status and body', async () => {
    const fetchImpl = fetchReturning({
      status: 404,
      text: '{"error":{"message":"model is no longer available"}}',
    });

    const error = await makeProvider(fetchImpl)(call).catch((e) => e);
    expect(error).toBeInstanceOf(LlmProviderError);
    expect(error.status).toBe(404);
    expect(error.message).toMatch(/Gemini returned 404 on "smoke"/);
    expect(error.message).toMatch(/no longer available/);
  });

  it('survives an error body it cannot read', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error('socket closed');
      },
    }));

    await expect(makeProvider(fetchImpl)(call)).rejects.toThrow(/Gemini returned 500/);
  });

  it('reports a timeout as such', async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    });

    await expect(makeProvider(fetchImpl)(call)).rejects.toThrow(/did not respond within 30000ms/);
  });

  it('reports an unreachable host distinctly from a timeout', async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { name: 'TypeError' });
    });

    await expect(makeProvider(fetchImpl)(call)).rejects.toThrow(/Could not reach Gemini/);
  });

  it('rejects a blocked prompt by name instead of reading into a missing candidate', async () => {
    const fetchImpl = fetchReturning({ body: { promptFeedback: { blockReason: 'SAFETY' } } });

    await expect(makeProvider(fetchImpl)(call)).rejects.toThrow(
      /blocked the "smoke" prompt \(SAFETY\)/,
    );
  });

  it('rejects an empty candidate list', async () => {
    const fetchImpl = fetchReturning({ body: { candidates: [] } });
    await expect(makeProvider(fetchImpl)(call)).rejects.toThrow(/no candidates/);
  });

  it('calls out truncation rather than reporting it as bad JSON', async () => {
    const fetchImpl = fetchReturning({
      body: {
        candidates: [
          { finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"verdict":"heal' }] } },
        ],
      },
    });

    await expect(makeProvider(fetchImpl)(call)).rejects.toThrow(/hit maxOutputTokens/);
  });

  it('rejects any other early stop, naming the reason', async () => {
    const fetchImpl = fetchReturning({
      body: { candidates: [{ finishReason: 'RECITATION', content: { parts: [{ text: '{}' }] } }] },
    });

    await expect(makeProvider(fetchImpl)(call)).rejects.toThrow(/stopped early.*RECITATION/);
  });

  it('picks the text part rather than assuming parts[0]', async () => {
    const fetchImpl = fetchReturning({
      body: {
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                { thought: true, thoughtSignature: 'abc' },
                { text: JSON.stringify({ verdict: 'healthy', score: 0.4 }) },
              ],
            },
          },
        ],
      },
    });

    await expect(makeProvider(fetchImpl)(call)).resolves.toEqual({
      verdict: 'healthy',
      score: 0.4,
    });
  });

  it('rejects a candidate carrying no text part at all', async () => {
    const fetchImpl = fetchReturning({
      body: { candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true }] } }] },
    });

    await expect(makeProvider(fetchImpl)(call)).rejects.toThrow(/no text part/);
  });

  it('unwraps a fenced code block if the model sends one anyway', async () => {
    const fetchImpl = fetchReturning({
      body: {
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: '```json\n{"verdict":"ok","score":2}\n```' }] },
          },
        ],
      },
    });

    await expect(makeProvider(fetchImpl)(call)).resolves.toEqual({ verdict: 'ok', score: 2 });
  });

  it('rejects text that is not JSON', async () => {
    const fetchImpl = fetchReturning({
      body: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'sure thing!' }] } }] },
    });

    await expect(makeProvider(fetchImpl)(call)).rejects.toThrow(/returned non-JSON for "smoke"/);
  });

  it('rejects a non-JSON HTTP body', async () => {
    const fetchImpl = fetchReturning({ text: '<html>gateway error</html>' });
    await expect(makeProvider(fetchImpl)(call)).rejects.toThrow(/non-JSON body/);
  });

  it('enforces the zod schema even when decoding was constrained by it', async () => {
    // The schema steers decoding; it does not guarantee the result. `score` is
    // a string here, which the JSON Schema said it would not be.
    const fetchImpl = fetchReturning({ body: reply({ verdict: 'healthy', score: 'high' }) });

    await expect(makeProvider(fetchImpl)(call)).rejects.toThrow(
      /failed validation at: score/,
    );
  });

  it('honours a base URL override, for pointing at a mock server', async () => {
    const fetchImpl = fetchReturning({ body: reply({ verdict: 'ok', score: 1 }) });
    await createGeminiProvider({
      apiKey: 'k',
      modelId: 'gemini-3.6-flash',
      timeoutMs: 1000,
      baseUrl: 'http://localhost:9999/v1beta/',
      fetchImpl,
    })(call);

    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://localhost:9999/v1beta/models/gemini-3.6-flash:generateContent',
    );
  });
});
