import { SpeciesCareProfileSchema, defaultCareProfile } from '@flora/shared';

/** Fixture/task name. The stub reads test/fixtures/llm-species-care.json for it. */
export const SPECIES_CARE_TASK = 'species-care';

/**
 * Fallback profile for a species the model could not describe.
 *
 * Adoption must never fail: someone tapped a plant they want to grow, and
 * refusing them because an optional model call timed out would be absurd. The
 * neutral profile lives in @flora/shared so the offline mock answers with the
 * same numbers — the contract suite compares them.
 */
export { defaultCareProfile as fallbackCareProfile };

const SYSTEM_PROMPT = `You write care data for Flora, a plant-care app used in Lebanon.

You are given a plant species. You return its baseline care profile as JSON.
This is data, not prose: it drives watering reminders, so it must be a
defensible average for a home grower, not a range and not a caveat.

Rules:
- waterEveryDays is the base interval in a mild coastal Lebanese climate, for a
  plant in the ground or a reasonably sized pot. Succulents and established
  trees are long intervals; herbs and thin-leaved annuals are short ones.
- sun is a short phrase: "full sun", "partial shade", "bright indirect light".
- tempC is the range the plant is comfortable in, not its survival extremes.
- zoneMultipliers scale waterEveryDays per Lebanese climate zone. Above 1 means
  water LESS often than the base; below 1 means MORE often.
    COASTAL  — Beirut, Saida, Tripoli. Humid, mild. This is the baseline, so it
               is usually 1.
    MOUNTAIN — Mount Lebanon highlands. Cooler, slower growth, less evaporation,
               so the interval stretches: usually above 1.
    BEKAA    — hot, dry, low humidity, big day-night swing. Soil dries fastest
               here, so the interval shortens: usually below 1.
    SOUTH    — hot, dry, long summers, often thin soils. Usually slightly below 1.
- A desert or drought-adapted plant has multipliers closer to 1 in every zone,
  because it is not tracking evaporation as tightly.
- Answer in English only.`;

/**
 * Render the species as the user turn.
 * @param {{scientificName: string, commonNames?: string[]}} species
 */
export function buildSpeciesCarePrompt({ scientificName, commonNames = [] }) {
  const lines = [`Species: ${scientificName}`];
  if (commonNames.length) lines.push(`Also known as: ${commonNames.join(', ')}`);
  lines.push('Give the baseline care profile for growing this in Lebanon.');
  return lines.join('\n');
}

/**
 * Ask the model for a species' care profile.
 *
 * Never rejects. Adoption is a user action with a plant at the end of it, so a
 * model failure downgrades to the neutral profile rather than propagating — the
 * species still gets created, just with care data nobody vouched for. The
 * caller decides whether to say so in the UI.
 *
 * @param {(input: object) => Promise<unknown>} generate an LLM provider
 * @param {{scientificName: string, commonNames?: string[]}} species
 * @param {{logger?: Pick<Console, 'error'>}} [options]
 * @returns {Promise<{profile: object, generated: boolean}>}
 */
export async function requestSpeciesCare(generate, species, { logger = console } = {}) {
  try {
    const profile = await generate({
      task: SPECIES_CARE_TASK,
      system: SYSTEM_PROMPT,
      user: buildSpeciesCarePrompt(species),
      schema: SpeciesCareProfileSchema,
      // Recall, not reasoning: the model either knows how often a pothos wants
      // water or it does not, and thinking longer will not change that.
      effort: 'low',
      maxTokens: 2000,
    });
    return { profile, generated: true };
  } catch (error) {
    logger.error(
      `[species] care profile for "${species.scientificName}" failed, using the neutral default:`,
      error,
    );
    return { profile: defaultCareProfile(), generated: false };
  }
}
