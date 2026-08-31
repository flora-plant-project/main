import { SUGGESTABLE_SPECIES } from '@flora/shared';

/**
 * Re-exported under the name this module has always used, so the recognition
 * barrel keeps its shape. The list itself lives in @flora/shared because the
 * mobile mock offers exactly the same species offline.
 */
export const STUB_SPECIES_NAMES = SUGGESTABLE_SPECIES;

/**
 * Fixture-backed name search, used when PLANT_ID_API_KEY is unset.
 *
 * Matches the live provider's contract exactly — a query in, bare names out —
 * so the adoption path is fully exercisable with no key and no network, which
 * is the state most of the team works in and the state the offline demo runs in.
 *
 * @param {{names?: ReadonlyArray<{scientificName: string, commonNames: string[]}>}} [options]
 */
export function createStubNameSearch({ names = STUB_SPECIES_NAMES } = {}) {
  /**
   * @param {string} query
   * @returns {Promise<Array<{scientificName: string, commonNames: string[]}>>}
   */
  return async function searchNames(query) {
    const needle = String(query ?? '')
      .trim()
      .toLowerCase();
    if (!needle) return [];

    return names
      .filter(
        (entry) =>
          entry.scientificName.toLowerCase().includes(needle) ||
          entry.commonNames.some((name) => name.toLowerCase().includes(needle)),
      )
      .map((entry) => ({ ...entry, commonNames: [...entry.commonNames] }));
  };
}
