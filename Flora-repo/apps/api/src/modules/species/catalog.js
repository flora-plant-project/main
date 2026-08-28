import { seedSpecies } from '@flora/shared';

/**
 * Scientific name -> catalog id, for resolving what the recognition provider
 * returns against species we actually know about.
 *
 * Derived from the shared seed rather than hand-listed: the same data seeds the
 * Species table and the mobile mock, so there is one place a species is defined
 * and no third list to drift out of step.
 *
 * Deliberately not a database read. This runs inside response normalization,
 * once per candidate, and making it async would push a promise through the whole
 * recognition path to look up rows that change about once a release.
 */
const SPECIES_BY_SCIENTIFIC_NAME = new Map(
  seedSpecies.map((species) => [binomial(species.scientificName), species.id]),
);

/**
 * Reduce a scientific name to its leading genus + species binomial.
 *
 * Providers append authority citations and cultivar suffixes ("Ocimum
 * basilicum L.", "Ocimum basilicum 'Genovese'"), so match on the binomial
 * rather than the full string.
 *
 * @param {unknown} scientificName
 * @returns {string}
 */
function binomial(scientificName) {
  return String(scientificName ?? '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

/**
 * Resolve a provider-supplied scientific name to a catalog id.
 *
 * No match returns null, which the result screen renders as a suggestion you
 * cannot tap through.
 *
 * @param {string} scientificName
 * @returns {string|null}
 */
export function resolveSpeciesId(scientificName) {
  return SPECIES_BY_SCIENTIFIC_NAME.get(binomial(scientificName)) ?? null;
}
