import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { mockClient } from 'aws-sdk-client-mock';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LlmProviderError, createBedrockProvider } from '../bedrock.js';

const Schema = z.object({ verdict: z.string().min(1), score: z.number() });

// Intercepts every BedrockRuntimeClient send — no credentials resolved, no
// network, per the CLAUDE.md rule that unit tests never hit real AWS.
const bedrock = mockClient(BedrockRuntimeClient);

/** A well-formed Converse reply carrying `payload` as its JSON text block. */
function reply(payload, overrides = {}) {
  return {
    stopReason: 'end_turn',
    output: { message: { role: 'assistant', content: [{ text: JSON.stringify(payload) }] } },
    ...overrides,
  };
}

function makeProvider() {
  return createBedrockProvider({
    region: 'us-east-1',
    modelId: 'openai.gpt-oss-120b-1:0',
    timeoutMs: 30_000,
  });
}

/** The input of the single Converse command sent. */
function sentCommand() {
  return bedrock.commandCalls(ConverseCommand)[0].args[0].input;
}

const call = { task: 'smoke', system: 'You are a test.', user: 'Judge this.', schema: Schema };

beforeEach(() => bedrock.reset());
afterAll(() => bedrock.restore());

describe('createBedrockProvider', () => {
  it('requires a region and a model id', () => {
    expect(() => createBedrockProvider({ modelId: 'm', timeoutMs: 1 })).toThrow(
      /requires an AWS region/,
    );
    expect(() => createBedrockProvider({ region: 'us-east-1', timeoutMs: 1 })).toThrow(
      /requires a model id/,
    );
  });

  it('returns the parsed, schema-validated payload', async () => {
    bedrock.on(ConverseCommand).resolves(reply({ verdict: 'healthy', score: 0.9 }));
    await expect(makeProvider()(call)).resolves.toEqual({ verdict: 'healthy', score: 0.9 });
  });

  it('sends the model id, system prompt and user turn in Converse shape', async () => {
    bedrock.on(ConverseCommand).resolves(reply({ verdict: 'ok', score: 1 }));
    await makeProvider()(call);

    const input = sentCommand();
    expect(input.modelId).toBe('openai.gpt-oss-120b-1:0');
    expect(input.system).toEqual([{ text: 'You are a test.' }]);
    expect(input.messages).toEqual([{ role: 'user', content: [{ text: 'Judge this.' }] }]);
    expect(input.inferenceConfig.maxTokens).toBe(8000);
  });

  it('passes the zod schema through as an OpenAI response_format', async () => {
    bedrock.on(ConverseCommand).resolves(reply({ verdict: 'ok', score: 1 }));
    await makeProvider()(call);

    const { response_format: format } = sentCommand().additionalModelRequestFields;
    expect(format.type).toBe('json_schema');
    expect(format.json_schema.name).toBe('smoke');
    expect(format.json_schema.schema.required).toEqual(['verdict', 'score']);
    // Bedrock wants a bare schema object, not one carrying JSON Schema metadata.
    expect(format.json_schema.schema.$schema).toBeUndefined();
  });

  it('leaves strict mode off, so optional fields survive', async () => {
    // Strict mode requires every property in `required`. zod leaves optional
    // fields out (defaults stay in — after parsing they are always present), so
    // strict would reject schemas we actually use.
    const WithOptional = Schema.extend({
      notes: z.string().optional(),
      tags: z.array(z.string()).default([]),
    });
    bedrock.on(ConverseCommand).resolves(reply({ verdict: 'ok', score: 1 }));
    await makeProvider()({ ...call, schema: WithOptional });

    const { json_schema: jsonSchema } = sentCommand().additionalModelRequestFields.response_format;
    expect(jsonSchema.strict).toBe(false);
    expect(jsonSchema.schema.properties.notes).toBeDefined();
    expect(jsonSchema.schema.required).not.toContain('notes');
    expect(jsonSchema.schema.required).toContain('tags');
  });

  it('defaults the reasoning budget to medium and honours an override', async () => {
    bedrock.on(ConverseCommand).resolves(reply({ verdict: 'ok', score: 1 }));
    const generate = makeProvider();

    await generate(call);
    expect(sentCommand().additionalModelRequestFields.reasoning_effort).toBe('medium');

    bedrock.reset();
    bedrock.on(ConverseCommand).resolves(reply({ verdict: 'ok', score: 1 }));
    await generate({ ...call, effort: 'low' });
    expect(sentCommand().additionalModelRequestFields.reasoning_effort).toBe('low');
  });

  it('wraps a transport failure, keeping the HTTP status and the cause', async () => {
    const cause = Object.assign(new Error('connection reset'), {
      $metadata: { httpStatusCode: 503 },
    });
    bedrock.on(ConverseCommand).rejects(cause);

    const error = await makeProvider()(call).catch((thrown) => thrown);
    expect(error).toBeInstanceOf(LlmProviderError);
    expect(error.status).toBe(503);
    expect(error.message).toMatch(/connection reset/);
  });

  it('rejects truncated output instead of parsing half a document', async () => {
    bedrock.on(ConverseCommand).resolves(
      reply({}, {
        stopReason: 'max_tokens',
        output: { message: { content: [{ text: '{"verdict":"heal' }] } },
      }),
    );
    await expect(makeProvider()(call)).rejects.toThrow(/truncated/);
  });

  it('reports a filtered response rather than returning nothing', async () => {
    bedrock.on(ConverseCommand).resolves(
      reply({}, { stopReason: 'content_filtered', output: { message: { content: [] } } }),
    );
    await expect(makeProvider()(call)).rejects.toThrow(/filtered the "smoke" response/);
  });

  it('rejects a response with no text block', async () => {
    bedrock.on(ConverseCommand).resolves(
      reply({}, { output: { message: { content: [{ reasoningContent: {} }] } } }),
    );
    await expect(makeProvider()(call)).rejects.toThrow(/no text block/);
  });

  it('skips the reasoning block when picking the text to parse', async () => {
    bedrock.on(ConverseCommand).resolves(
      reply({}, {
        output: {
          message: {
            content: [
              { reasoningContent: { reasoningText: { text: 'thinking…' } } },
              { text: JSON.stringify({ verdict: 'ok', score: 0.5 }) },
            ],
          },
        },
      }),
    );
    await expect(makeProvider()(call)).resolves.toEqual({ verdict: 'ok', score: 0.5 });
  });

  it('unwraps a fenced code block when the model adds one anyway', async () => {
    bedrock.on(ConverseCommand).resolves(
      reply({}, {
        output: {
          message: { content: [{ text: '```json\n{"verdict":"ok","score":0.2}\n```' }] },
        },
      }),
    );
    await expect(makeProvider()(call)).resolves.toEqual({ verdict: 'ok', score: 0.2 });
  });

  it('rejects a non-JSON body', async () => {
    bedrock.on(ConverseCommand).resolves(
      reply({}, { output: { message: { content: [{ text: 'Sure! Here is the answer:' }] } } }),
    );
    await expect(makeProvider()(call)).rejects.toThrow(/non-JSON/);
  });

  it('names the offending field when output does not match the schema', async () => {
    bedrock.on(ConverseCommand).resolves(reply({ verdict: 'healthy', score: 'high' }));
    await expect(makeProvider()(call)).rejects.toThrow(/failed validation at: score/);
  });
});
