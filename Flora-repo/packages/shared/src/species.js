/**
 * Species identity, shared by the API and the mobile mock.
 *
 * Both sides de-duplicate species the same way and offer the same offline
 * suggestions, because the contract suite runs against both and a difference
 * here would show up as one client adopting a duplicate the other found.
 */

/**
 * Reduce a scientific name to its leading genus + species binomial.
 *
 * Recognition providers append authority citations and cultivar suffixes
 * ("Ocimum basilicum L.", "Ocimum basilicum 'Genovese'"), so identity has to be
 * the binomial rather than the full string — otherwise a scan creates a second
 * basil next to the one the catalog already had.
 *
 * Non-Latin characters are stripped, which means an Arabic common name reduces
 * to an empty string. That is deliberate: a common name is not an identity, and
 * an empty key is rejected by the callers rather than matching everything.
 *
 * @param {unknown} scientificName
 * @returns {string}
 */
export function binomial(scientificName) {
  return String(scientificName ?? '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

/**
 * Species offered when there is no Plant.id key and no network.
 *
 * Deliberately common houseplants and Lebanese garden staples that are NOT in
 * the seeded catalog: the point of a suggestion is to be something you could
 * not already find, so a list that echoed the curated ten would demonstrate
 * nothing. Short on purpose — it exists to keep the adoption path exercisable
 * offline, not to be a plant encyclopedia.
 */
export const SUGGESTABLE_SPECIES = Object.freeze([
  { scientificName: 'Epipremnum aureum', commonNames: ['Golden pothos'] },
  { scientificName: 'Cucumis sativus', commonNames: ['Cucumber', 'خيار'] },
  { scientificName: 'Citrus limon', commonNames: ['Lemon', 'ليمون'] },
  { scientificName: 'Petroselinum crispum', commonNames: ['Parsley', 'بقدونس'] },
  { scientificName: 'Vitis vinifera', commonNames: ['Grapevine', 'عنب'] },
  { scientificName: 'Punica granatum', commonNames: ['Pomegranate', 'رمان'] },
  { scientificName: 'Thymus vulgaris', commonNames: ['Thyme', 'زعتر'] },
  { scientificName: 'Capsicum annuum', commonNames: ['Pepper', 'فليفلة'] },
  { scientificName: 'Sansevieria trifasciata', commonNames: ['Snake plant'] },
  { scientificName: 'Rosa damascena', commonNames: ['Damask rose', 'ورد جوري'] },
]);

/**
 * The neutral care profile for a species nobody has described yet.
 *
 * Used when the model is unavailable (the API) or absent entirely (the offline
 * mock), so both clients answer with the same numbers. A weekly interval with
 * near-neutral multipliers is the honest "we do not know yet" — the plant's own
 * schedule can be edited afterwards.
 */
export const DEFAULT_CARE_PROFILE = Object.freeze({
  care: { waterEveryDays: 7, sun: 'partial sun', tempC: { min: 10, max: 30 } },
  zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.2, BEKAA: 0.85, SOUTH: 0.9 },
});

/** A fresh, mutable copy of the neutral profile. */
export function defaultCareProfile() {
  return structuredClone(DEFAULT_CARE_PROFILE);
}
