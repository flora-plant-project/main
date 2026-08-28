/**
 * Canonical health-issue codes.
 *
 * Recognition providers return free-text disease names ("Alternaria solani",
 * "water-related issue"). Those strings are provider-specific and English-only,
 * so the normalizer matches them onto a code and everything downstream keys off
 * the code instead of the provider's wording.
 *
 * This is the seam the translation layer plugs into: adding Arabic means
 * filling a code -> localized copy table here, not touching the provider or the
 * normalizer. Until then `HealthIssue.name` and `treatmentHints` carry the
 * provider's own English text.
 *
 * @readonly
 * @enum {string}
 */
export const IssueCode = Object.freeze({
  EARLY_BLIGHT: 'EARLY_BLIGHT',
  LATE_BLIGHT: 'LATE_BLIGHT',
  POWDERY_MILDEW: 'POWDERY_MILDEW',
  DOWNY_MILDEW: 'DOWNY_MILDEW',
  LEAF_SPOT: 'LEAF_SPOT',
  RUST: 'RUST',
  ROOT_ROT: 'ROOT_ROT',
  NUTRIENT_DEFICIENCY: 'NUTRIENT_DEFICIENCY',
  WATER_STRESS: 'WATER_STRESS',
  SUNBURN: 'SUNBURN',
  PEST_INFESTATION: 'PEST_INFESTATION',
  OTHER: 'OTHER',
});

/** All codes as a plain array, for zod enums and exhaustiveness checks. */
export const IssueCodes = Object.freeze(Object.values(IssueCode));

/**
 * Ordered keyword table. First match wins, so narrower phrases must precede
 * broader ones ("late blight" before "blight", "root rot" before "rot").
 * @type {ReadonlyArray<[string, string]>}
 */
const KEYWORD_TABLE = Object.freeze([
  ['early blight', IssueCode.EARLY_BLIGHT],
  ['alternaria', IssueCode.EARLY_BLIGHT],
  ['late blight', IssueCode.LATE_BLIGHT],
  ['phytophthora', IssueCode.LATE_BLIGHT],
  ['powdery mildew', IssueCode.POWDERY_MILDEW],
  ['downy mildew', IssueCode.DOWNY_MILDEW],
  ['root rot', IssueCode.ROOT_ROT],
  ['leaf spot', IssueCode.LEAF_SPOT],
  ['septoria', IssueCode.LEAF_SPOT],
  ['anthracnose', IssueCode.LEAF_SPOT],
  ['rust', IssueCode.RUST],
  ['puccinia', IssueCode.RUST],
  ['rot', IssueCode.ROOT_ROT],
  ['deficiency', IssueCode.NUTRIENT_DEFICIENCY],
  ['nutrient', IssueCode.NUTRIENT_DEFICIENCY],
  ['nitrogen', IssueCode.NUTRIENT_DEFICIENCY],
  ['chlorosis', IssueCode.NUTRIENT_DEFICIENCY],
  ['overwatering', IssueCode.WATER_STRESS],
  ['underwatering', IssueCode.WATER_STRESS],
  ['drought', IssueCode.WATER_STRESS],
  ['water', IssueCode.WATER_STRESS],
  ['sunburn', IssueCode.SUNBURN],
  ['sunscald', IssueCode.SUNBURN],
  ['aphid', IssueCode.PEST_INFESTATION],
  ['mite', IssueCode.PEST_INFESTATION],
  ['whitefly', IssueCode.PEST_INFESTATION],
  ['thrips', IssueCode.PEST_INFESTATION],
  ['scale insect', IssueCode.PEST_INFESTATION],
  ['insect', IssueCode.PEST_INFESTATION],
  ['pest', IssueCode.PEST_INFESTATION],
]);

/**
 * Match a provider's disease name onto a canonical {@link IssueCode}.
 * Unrecognized names fall back to OTHER — the caller keeps the provider's
 * own text so an unmapped disease still reads sensibly in the app.
 * @param {string} [name] provider-supplied disease name
 * @returns {string} one of {@link IssueCode}
 */
export function matchIssueCode(name) {
  const haystack = String(name ?? '').toLowerCase();
  if (!haystack) return IssueCode.OTHER;
  for (const [keyword, code] of KEYWORD_TABLE) {
    if (haystack.includes(keyword)) return code;
  }
  return IssueCode.OTHER;
}
