import { CareAdviceSchema } from '@flora/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  CARE_ADVICE_TASK,
  buildCareAdvicePrompt,
  requestCareAdvice,
  shouldAdvise,
} from '../careAdvice.js';
import { createStubProvider } from '../stub.js';

/** A diseased-tomato-shaped result: one confirmed issue, one long-tail guess. */
const diseasedTomato = {
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

const healthyBasil = {
  species: [{ scientificName: 'Ocimum basilicum', commonNames: ['Basil'], probability: 0.93 }],
  health: { isHealthy: true, issues: [], confidence: 0.91 },
  advice: null,
};

const blurry = {
  species: [{ scientificName: 'Unknown', commonNames: [], probability: 0.31 }],
  health: { isHealthy: true, issues: [], confidence: 0.34 },
  advice: null,
};

describe('shouldAdvise', () => {
  it('advises on a confident result', () => {
    expect(shouldAdvise(diseasedTomato)).toBe(true);
    expect(shouldAdvise(healthyBasil)).toBe(true);
  });

  it('skips low-confidence results — advice on a bad ID is worse than none', () => {
    expect(shouldAdvise(blurry)).toBe(false);
  });

  it('advises exactly at the threshold', () => {
    expect(shouldAdvise({ ...blurry, health: { ...blurry.health, confidence: 0.55 } })).toBe(true);
    expect(shouldAdvise({ ...blurry, health: { ...blurry.health, confidence: 0.54 } })).toBe(false);
  });
});

describe('buildCareAdvicePrompt', () => {
  it('names the species and its confidence', () => {
    const prompt = buildCareAdvicePrompt(diseasedTomato, { climateZone: 'BEKAA' });
    expect(prompt).toContain('Solanum lycopersicum (Tomato) — 88% confident');
    expect(prompt).toContain('Overall health confidence: 84%');
  });

  it('separates confirmed issues from unconfirmed ones', () => {
    const prompt = buildCareAdvicePrompt(diseasedTomato, { climateZone: 'BEKAA' });
    const confirmed = prompt.indexOf('Confirmed issues');
    const possible = prompt.indexOf('Possible but unconfirmed');

    expect(confirmed).toBeGreaterThan(-1);
    expect(possible).toBeGreaterThan(confirmed);
    // The 0.81 blight is actionable; the 0.22 deficiency is not.
    expect(prompt.slice(confirmed, possible)).toContain('EARLY_BLIGHT');
    expect(prompt.slice(confirmed, possible)).not.toContain('NUTRIENT_DEFICIENCY');
    expect(prompt.slice(possible)).toContain('NUTRIENT_DEFICIENCY');
  });

  it('expands the climate zone into what it means for care', () => {
    const prompt = buildCareAdvicePrompt(diseasedTomato, { climateZone: 'BEKAA' });
    expect(prompt).toContain('Climate zone: BEKAA');
    expect(prompt).toMatch(/dew/i);
  });

  it('stays usable when no zone is given', () => {
    const prompt = buildCareAdvicePrompt(diseasedTomato, {});
    expect(prompt).toContain('Climate zone: unspecified');
    expect(prompt).toMatch(/anywhere in Lebanon/);
  });

  it('says so plainly when nothing is wrong', () => {
    const prompt = buildCareAdvicePrompt(healthyBasil, { climateZone: 'COASTAL' });
    expect(prompt).toContain('appears healthy');
    expect(prompt).toContain('No health issues detected.');
  });

  it('survives a result with no species candidates', () => {
    const prompt = buildCareAdvicePrompt({ ...healthyBasil, species: [] }, {});
    expect(prompt).toContain('Unknown species');
  });

  it('includes the month when given, for seasonal advice', () => {
    expect(buildCareAdvicePrompt(healthyBasil, { month: 'August' })).toContain(
      'Current month: August',
    );
  });
});

describe('requestCareAdvice', () => {
  it('asks for the care-advice task under the shared schema', async () => {
    const generate = vi.fn().mockResolvedValue({ summary: 's', steps: [], watchFor: [] });
    await requestCareAdvice(generate, diseasedTomato, { climateZone: 'SOUTH' });

    const [input] = generate.mock.calls[0];
    expect(input.task).toBe(CARE_ADVICE_TASK);
    expect(input.schema).toBe(CareAdviceSchema);
    expect(input.effort).toBe('low');
    expect(input.system).toMatch(/Lebanon/);
    expect(input.user).toMatch(/Solanum lycopersicum/);
  });

  it('produces schema-valid advice through the fixture stub', async () => {
    const advice = await requestCareAdvice(createStubProvider(), diseasedTomato, {
      climateZone: 'BEKAA',
    });

    // The committed fixture must satisfy the schema the live path returns —
    // that is what keeps the offline demo honest.
    expect(CareAdviceSchema.safeParse(advice).success).toBe(true);
    expect(advice.steps.length).toBeGreaterThan(0);
  });
});
