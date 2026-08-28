import { RecognitionResultSchema, matchIssueCode } from '@flora/shared';

/** Candidates beyond this add noise to the suggestion list, not signal. */
const MAX_SPECIES = 4;
/** Issues beyond this crowd the result card. */
const MAX_ISSUES = 3;
/** Plant.id returns a long tail of near-zero disease guesses; drop them. */
const MIN_ISSUE_PROBABILITY = 0.1;
/** Treatment steps beyond this stop being actionable. */
const MAX_TREATMENT_HINTS = 5;

/**
 * Clamp anything provider-shaped into 0..1. Missing or non-numeric probabilities
 * become 0 rather than throwing — a malformed field should degrade the result,
 * not fail the whole diagnosis.
 * @param {unknown} value
 * @returns {number}
 */
function clamp01(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(1, Math.max(0, num));
}

/**
 * Flatten Plant.id's treatment object (biological / chemical / prevention) into
 * the ordered step list the result screen renders.
 * @param {{biological?: string[], chemical?: string[], prevention?: string[]}} [treatment]
 * @returns {string[]}
 */
function flattenTreatment(treatment) {
  const ordered = [
    ...(treatment?.prevention ?? []),
    ...(treatment?.biological ?? []),
    ...(treatment?.chemical ?? []),
  ];
  const seen = new Set();
  const hints = [];
  for (const entry of ordered) {
    const hint = String(entry ?? '').trim();
    if (!hint || seen.has(hint)) continue;
    seen.add(hint);
    hints.push(hint);
    if (hints.length >= MAX_TREATMENT_HINTS) break;
  }
  return hints;
}

/**
 * Map one Plant.id classification suggestion to a SpeciesCandidate.
 * @param {object} suggestion
 * @param {(scientificName: string) => (string|null)} resolveSpeciesId
 */
function toSpeciesCandidate(suggestion, resolveSpeciesId) {
  const scientificName = String(suggestion?.name ?? '').trim() || 'Unknown';
  // Never trust a provider-supplied identifier as our catalog key — resolve the
  // scientific name against the catalog ourselves. An unmatched candidate keeps
  // speciesId undefined, which the result screen already renders as a
  // non-tappable row.
  const speciesId = resolveSpeciesId(scientificName) ?? undefined;
  const commonNames = (suggestion?.details?.common_names ?? [])
    .map((name) => String(name ?? '').trim())
    .filter(Boolean);

  return {
    ...(speciesId ? { speciesId } : {}),
    scientificName,
    commonNames,
    probability: clamp01(suggestion?.probability),
  };
}

/**
 * Map one Plant.id disease suggestion to a HealthIssue.
 * @param {object} suggestion
 */
function toHealthIssue(suggestion) {
  const name = String(suggestion?.name ?? '').trim() || 'Unknown issue';
  return {
    code: matchIssueCode(name),
    name,
    probability: clamp01(suggestion?.probability),
    treatmentHints: flattenTreatment(suggestion?.details?.treatment),
  };
}

/**
 * Convert a raw Plant.id v3 identification payload into a RecognitionResult.
 *
 * Confidence is the model's confidence in the answer we are actually showing —
 * the top species in identify mode, the top issue (or the healthy verdict) in
 * health mode — floored by how sure it is the photo contains a plant at all.
 * That floor is what makes a photo of a wall or a blurry shot surface as low
 * confidence instead of a spuriously certain species match.
 *
 * @param {object} payload raw provider JSON
 * @param {{mode?: string, resolveSpeciesId?: (name: string) => (string|null)}} [options]
 * @returns {import('@flora/shared/src/types.js').RecognitionResult}
 */
export function normalizePlantIdResponse(payload, { mode, resolveSpeciesId } = {}) {
  const resolve = resolveSpeciesId ?? (() => null);
  const result = payload?.result ?? {};

  // A provider that omits is_plant is telling us nothing, not telling us "no".
  const isPlantProbability = clamp01(result.is_plant?.probability ?? 1);

  const species = (result.classification?.suggestions ?? [])
    .slice(0, MAX_SPECIES)
    .map((suggestion) => toSpeciesCandidate(suggestion, resolve));

  const issues = (result.disease?.suggestions ?? [])
    .map(toHealthIssue)
    .filter((issue) => issue.probability >= MIN_ISSUE_PROBABILITY)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, MAX_ISSUES);

  const isHealthy = result.is_healthy?.binary ?? issues.length === 0;

  const primaryProbability =
    mode === 'health'
      ? isHealthy
        ? clamp01(result.is_healthy?.probability ?? 0)
        : (issues[0]?.probability ?? 0)
      : (species[0]?.probability ?? 0);

  const normalized = {
    species,
    health: {
      isHealthy,
      // A healthy verdict has no issues to show, even if the provider listed
      // low-probability guesses alongside it.
      issues: isHealthy ? [] : issues,
      confidence: Math.min(isPlantProbability, primaryProbability),
    },
  };

  // Validate at the boundary: whatever the provider did, what leaves this
  // module is a RecognitionResult or an error.
  return RecognitionResultSchema.parse(normalized);
}
