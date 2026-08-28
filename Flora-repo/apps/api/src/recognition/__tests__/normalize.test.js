import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { IssueCode } from '@flora/shared';
import { normalizePlantIdResponse } from '../normalize.js';
import { resolveSpeciesId } from '../../modules/species/catalog.js';

/**
 * @param {string} name
 * @returns {object}
 */
function fixture(name) {
  const url = new URL(`../../../test/fixtures/plantid-${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8'));
}

describe('normalizePlantIdResponse', () => {
  it('maps a healthy identification onto the catalog', () => {
    const result = normalizePlantIdResponse(fixture('healthy-basil'), {
      mode: 'identify',
      resolveSpeciesId,
    });

    expect(result.species[0]).toEqual({
      speciesId: 'sp1',
      scientificName: 'Ocimum basilicum',
      commonNames: ['Basil', 'Sweet basil'],
      probability: 0.93,
    });
    expect(result.health.isHealthy).toBe(true);
    // Healthy verdict hides the provider's low-probability disease guesses.
    expect(result.health.issues).toEqual([]);
    // min(is_plant 0.998, top species 0.93)
    expect(result.health.confidence).toBeCloseTo(0.93, 5);
  });

  it('leaves speciesId unset for species outside the catalog', () => {
    const result = normalizePlantIdResponse(fixture('healthy-basil'), {
      mode: 'identify',
      resolveSpeciesId,
    });

    expect(result.species[1].scientificName).toBe('Ocimum tenuiflorum');
    expect(result.species[1].speciesId).toBeUndefined();
  });

  it('maps diseases to issue codes and flattens treatment steps', () => {
    const result = normalizePlantIdResponse(fixture('diseased-tomato'), {
      mode: 'health',
      resolveSpeciesId,
    });

    expect(result.health.isHealthy).toBe(false);
    expect(result.health.issues.map((issue) => issue.code)).toEqual([
      IssueCode.EARLY_BLIGHT,
      IssueCode.NUTRIENT_DEFICIENCY,
    ]);
    // prevention -> biological -> chemical, in that order
    expect(result.health.issues[0].treatmentHints).toEqual([
      'Water at the base and keep the foliage dry',
      'Rotate crops so tomatoes do not follow tomatoes',
      'Remove and destroy the affected lower leaves',
      'Apply a copper-based fungicide every 7-10 days',
    ]);
    // min(is_plant 0.997, top issue 0.81)
    expect(result.health.confidence).toBeCloseTo(0.81, 5);
  });

  it('drops the long tail of near-zero disease guesses', () => {
    const result = normalizePlantIdResponse(fixture('diseased-tomato'), { mode: 'health' });
    expect(result.health.issues.map((issue) => issue.name)).not.toContain('mechanical damage');
  });

  it('floors confidence by is_plant so a non-plant photo reads as uncertain', () => {
    const result = normalizePlantIdResponse(fixture('blurry'), {
      mode: 'identify',
      resolveSpeciesId,
    });

    // Species probability is 0.31 but is_plant is only 0.34 — the floor is what
    // stops a confident-looking match on a photo that may not be a plant.
    expect(result.health.confidence).toBeCloseTo(0.31, 5);
    expect(result.health.confidence).toBeLessThan(0.55);
  });

  it('matches species names carrying an authority citation', () => {
    const payload = {
      result: {
        is_plant: { probability: 1 },
        classification: {
          suggestions: [{ name: "Ocimum basilicum L. 'Genovese'", probability: 0.9 }],
        },
      },
    };

    const result = normalizePlantIdResponse(payload, { mode: 'identify', resolveSpeciesId });
    expect(result.species[0].speciesId).toBe('sp1');
  });

  it('survives a payload with nothing in it', () => {
    const result = normalizePlantIdResponse({}, { mode: 'identify' });

    expect(result.species).toEqual([]);
    expect(result.health).toEqual({ isHealthy: true, issues: [], confidence: 0 });
  });

  it('clamps out-of-range probabilities instead of emitting an invalid result', () => {
    const payload = {
      result: {
        is_plant: { probability: 1.4 },
        classification: { suggestions: [{ name: 'Mentha spicata', probability: 3 }] },
      },
    };

    const result = normalizePlantIdResponse(payload, { mode: 'identify', resolveSpeciesId });
    expect(result.species[0].probability).toBe(1);
    expect(result.health.confidence).toBe(1);
  });
});
