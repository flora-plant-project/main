import { describe, expect, it, vi } from 'vitest';
import { SpeciesCareProfileSchema } from '@flora/shared';
import { createStubProvider } from '../stub.js';
import {
  SPECIES_CARE_TASK,
  buildSpeciesCarePrompt,
  fallbackCareProfile,
  requestSpeciesCare,
} from '../speciesCare.js';

const PROFILE = {
  care: { waterEveryDays: 7, sun: 'bright indirect light', tempC: { min: 15, max: 29 } },
  zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.3, BEKAA: 0.8, SOUTH: 0.9 },
};

const silent = { error: vi.fn() };

describe('buildSpeciesCarePrompt', () => {
  it('names the species and its common names', () => {
    const prompt = buildSpeciesCarePrompt({
      scientificName: 'Epipremnum aureum',
      commonNames: ['Golden pothos', 'ديفنباخيا'],
    });

    expect(prompt).toContain('Epipremnum aureum');
    expect(prompt).toContain('Golden pothos, ديفنباخيا');
  });

  it('omits the alias line when there are no common names', () => {
    expect(buildSpeciesCarePrompt({ scientificName: 'Pothos longipes' })).not.toContain(
      'Also known as',
    );
  });
});

describe('requestSpeciesCare', () => {
  it('returns the model profile and marks it generated', async () => {
    const generate = vi.fn(async () => PROFILE);
    const result = await requestSpeciesCare(generate, { scientificName: 'Epipremnum aureum' });

    expect(result).toEqual({ profile: PROFILE, generated: true });
  });

  it('asks for the shared schema under the fixture task name', async () => {
    const generate = vi.fn(async () => PROFILE);
    await requestSpeciesCare(generate, { scientificName: 'Epipremnum aureum' });

    const call = generate.mock.calls[0][0];
    expect(call.task).toBe(SPECIES_CARE_TASK);
    expect(call.schema).toBe(SpeciesCareProfileSchema);
    // Recall, not reasoning — thinking longer will not change what a pothos wants.
    expect(call.effort).toBe('low');
  });

  it('downgrades to the neutral profile when the model fails, and never throws', async () => {
    const generate = vi.fn(async () => {
      throw new Error('model unavailable');
    });

    const result = await requestSpeciesCare(
      generate,
      { scientificName: 'Epipremnum aureum' },
      { logger: silent },
    );

    // Adoption has a person waiting to add a plant at the end of it.
    expect(result).toEqual({ profile: fallbackCareProfile(), generated: false });
    expect(silent.error).toHaveBeenCalled();
  });

  it('hands back a fresh fallback each time, so callers cannot poison it', async () => {
    const first = fallbackCareProfile();
    first.care.waterEveryDays = 999;

    expect(fallbackCareProfile().care.waterEveryDays).toBe(7);
  });

  it('has a fallback that satisfies the schema it stands in for', () => {
    expect(SpeciesCareProfileSchema.safeParse(fallbackCareProfile()).success).toBe(true);
  });

  it('reads the checked-in fixture through the stub provider', async () => {
    // Proves the offline path end to end: no key, no model, still a valid profile.
    const result = await requestSpeciesCare(createStubProvider(), {
      scientificName: 'Epipremnum aureum',
    });

    expect(result.generated).toBe(true);
    expect(SpeciesCareProfileSchema.safeParse(result.profile).success).toBe(true);
  });
});

describe('SpeciesCareProfileSchema', () => {
  it('rejects a watering interval no plant has', () => {
    // A hallucinated 400-day interval would go on to drive real reminders.
    for (const waterEveryDays of [0, 31, 400]) {
      const candidate = { ...PROFILE, care: { ...PROFILE.care, waterEveryDays } };
      expect(SpeciesCareProfileSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it('rejects a zone multiplier outside sane bounds', () => {
    for (const COASTAL of [0.1, 12]) {
      const candidate = { ...PROFILE, zoneMultipliers: { ...PROFILE.zoneMultipliers, COASTAL } };
      expect(SpeciesCareProfileSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it('requires every Lebanese zone, not just the ones the model felt like', () => {
    const partial = { ...PROFILE.zoneMultipliers };
    delete partial.MOUNTAIN;
    expect(
      SpeciesCareProfileSchema.safeParse({ ...PROFILE, zoneMultipliers: partial }).success,
    ).toBe(false);
  });
});
