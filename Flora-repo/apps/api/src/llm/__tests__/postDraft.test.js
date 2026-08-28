import { PostDraftSchema } from '@flora/shared';
import { describe, expect, it, vi } from 'vitest';
import { POST_DRAFT_TASK, buildPostDraftPrompt, requestPostDraft } from '../postDraft.js';
import { createStubProvider } from '../stub.js';

const diagnosis = {
  species: [
    { scientificName: 'Solanum lycopersicum', commonNames: ['Tomato'], probability: 0.88 },
  ],
  health: {
    isHealthy: false,
    issues: [
      { code: 'EARLY_BLIGHT', name: 'Early blight', probability: 0.81, treatmentHints: [] },
      {
        code: 'NUTRIENT_DEFICIENCY',
        name: 'Nitrogen deficiency',
        probability: 0.22,
        treatmentHints: [],
      },
    ],
    confidence: 0.84,
  },
  advice: null,
};

const plant = { nickname: 'Minty', speciesName: 'Mentha spicata', ageDays: 92, logCount: 4 };

describe('buildPostDraftPrompt', () => {
  it('describes the plant when there is no diagnosis', () => {
    const prompt = buildPostDraftPrompt({ diagnosis: null, plant });
    expect(prompt).toContain('"Minty"');
    expect(prompt).toContain('Mentha spicata');
    expect(prompt).toContain('logged its progress 4 times');
    expect(prompt).toMatch(/show-and-tell/);
  });

  it('says how long they have had it, the way a person would', () => {
    expect(buildPostDraftPrompt({ diagnosis: null, plant })).toContain('3 months');
    expect(buildPostDraftPrompt({ diagnosis: null, plant: { ...plant, ageDays: 9 } })).toContain(
      '9 days',
    );
    expect(buildPostDraftPrompt({ diagnosis: null, plant: { ...plant, ageDays: 21 } })).toContain(
      '3 weeks',
    );
    expect(buildPostDraftPrompt({ diagnosis: null, plant: { ...plant, ageDays: 400 } })).toContain(
      'a year',
    );
  });

  it('omits plant details that were not provided', () => {
    const prompt = buildPostDraftPrompt({ diagnosis: null, plant: { nickname: 'Minty' } });
    expect(prompt).toContain('"Minty"');
    expect(prompt).not.toMatch(/Species:/);
    expect(prompt).not.toMatch(/They have had it/);
    expect(prompt).not.toMatch(/logged its progress/);
  });

  it('separates likely problems from guesses that must not be stated as fact', () => {
    const prompt = buildPostDraftPrompt({ diagnosis, plant: null });
    const likely = prompt.indexOf('Likely problem');
    const unsure = prompt.indexOf('Much less certain');

    expect(likely).toBeGreaterThan(-1);
    expect(unsure).toBeGreaterThan(likely);
    expect(prompt.slice(likely, unsure)).toContain('Early blight');
    expect(prompt.slice(unsure)).toContain('Nitrogen deficiency');
  });

  it('asks for a help post when something is wrong', () => {
    expect(buildPostDraftPrompt({ diagnosis, plant: null })).toMatch(/asking the community/);
  });

  it('asks for show-and-tell when the scan found nothing wrong', () => {
    const healthy = { ...diagnosis, health: { isHealthy: true, issues: [], confidence: 0.91 } };
    const prompt = buildPostDraftPrompt({ diagnosis: healthy, plant: null });
    expect(prompt).toContain('No problems detected');
    expect(prompt).toMatch(/show-and-tell/);
  });

  it('uses both halves when both are given', () => {
    const prompt = buildPostDraftPrompt({ diagnosis, plant });
    expect(prompt).toContain('"Minty"');
    expect(prompt).toContain('Early blight');
  });
});

describe('requestPostDraft', () => {
  it('asks for the post-draft task under the shared schema', async () => {
    const generate = vi.fn().mockResolvedValue({ body: 'draft' });
    await requestPostDraft(generate, { diagnosis, plant: null });

    const [input] = generate.mock.calls[0];
    expect(input.task).toBe(POST_DRAFT_TASK);
    expect(input.schema).toBe(PostDraftSchema);
    expect(input.system).toMatch(/first person/);
  });

  it('produces a schema-valid draft through the fixture stub', async () => {
    const draft = await requestPostDraft(createStubProvider(), { diagnosis, plant: null });
    expect(PostDraftSchema.safeParse(draft).success).toBe(true);
    expect(draft.body.length).toBeGreaterThan(0);
  });
});
