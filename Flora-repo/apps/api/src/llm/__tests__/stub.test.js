import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createStubProvider } from '../stub.js';

const Schema = z.object({ verdict: z.string().min(1), score: z.number() });

/** A throwaway fixture directory holding `llm-<task>.json`. */
async function fixtureDir(task, contents) {
  const dir = await mkdtemp(join(tmpdir(), 'flora-llm-'));
  await writeFile(join(dir, `llm-${task}.json`), JSON.stringify(contents), 'utf8');
  // Trailing slash matters: without it the last segment is treated as a file
  // and `new URL(name, dir)` resolves against the parent.
  return pathToFileURL(`${dir}/`);
}

describe('createStubProvider', () => {
  it('replays the fixture for a task', async () => {
    const dir = await fixtureDir('care-advice', { verdict: 'healthy', score: 0.9 });
    const generate = createStubProvider({ fixtureDir: dir });

    await expect(generate({ task: 'care-advice', schema: Schema })).resolves.toEqual({
      verdict: 'healthy',
      score: 0.9,
    });
  });

  it('names the missing file and the way out when a task has no fixture', async () => {
    const dir = await fixtureDir('care-advice', { verdict: 'ok', score: 1 });
    const generate = createStubProvider({ fixtureDir: dir });

    const error = await generate({ task: 'post-draft', schema: Schema }).catch((thrown) => thrown);
    expect(error.message).toMatch(/llm-post-draft\.json/);
    expect(error.message).toMatch(/FLORA_LLM_ENABLED=1/);
  });

  it('validates the fixture against the caller schema, so drift fails here first', async () => {
    const dir = await fixtureDir('care-advice', { verdict: 'healthy', score: 'high' });
    const generate = createStubProvider({ fixtureDir: dir });

    await expect(generate({ task: 'care-advice', schema: Schema })).rejects.toThrow(
      /failed validation at: score/,
    );
  });

  it('applies schema defaults the same way the live path does', async () => {
    const WithDefault = Schema.extend({ notes: z.array(z.string()).default([]) });
    const dir = await fixtureDir('care-advice', { verdict: 'healthy', score: 0.9 });
    const generate = createStubProvider({ fixtureDir: dir });

    const result = await generate({ task: 'care-advice', schema: WithDefault });
    expect(result.notes).toEqual([]);
  });
});
