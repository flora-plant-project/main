/**
 * Shared JSDoc typedefs for Flora. This module has no runtime exports —
 * import the types with `import('./types.js').TypeName` in JSDoc annotations.
 *
 * @template T
 * @typedef {{ ok: true, data: T } | { ok: false, error: { code: string, message: string } }} ApiResponse
 */

/**
 * Care requirements for a species.
 * @typedef {Object} SpeciesCare
 * @property {number} waterEveryDays
 * @property {string} sun e.g. "full sun", "partial shade"
 * @property {{ min: number, max: number }} tempC comfortable temperature range in °C
 */

/**
 * A plant species as returned by the API.
 * @typedef {Object} SpeciesDto
 * @property {string} scientificName
 * @property {string[]} commonNames
 * @property {SpeciesCare} care
 */

/**
 * One candidate species from the recognition provider.
 * @typedef {Object} SpeciesCandidate
 * @property {string} scientificName
 * @property {string[]} commonNames
 * @property {number} probability 0..1
 * @property {string} [speciesId] catalog id when the candidate maps to a known species
 */

/**
 * A detected health issue with suggested treatments.
 * @typedef {Object} HealthIssue
 * @property {string} code canonical IssueCode; provider wording is matched onto
 *   this so localized copy can key off a stable value (see issues.js)
 * @property {string} name provider-supplied display name, English for now
 * @property {number} probability 0..1
 * @property {string[]} treatmentHints
 */

/**
 * Health assessment of a photographed plant.
 * @typedef {Object} HealthAssessment
 * @property {boolean} isHealthy
 * @property {HealthIssue[]} issues
 * @property {number} confidence 0..1
 */

/**
 * One actionable step in a care plan.
 * @typedef {Object} CareStep
 * @property {string} action what to do
 * @property {string} when today, this week, every watering
 * @property {string} why the reasoning, so the advice is learnable rather than obeyed
 */

/**
 * Care advice derived from a completed diagnosis, written per species, issue
 * and climate zone rather than looked up from a table.
 * @typedef {Object} CareAdvice
 * @property {string} summary plain-language read of what is going on
 * @property {CareStep[]} steps 1..5, ordered most urgent first
 * @property {string[]} watchFor up to 3 signals that change the diagnosis
 */

/**
 * Result of running a photo through plant recognition.
 * @typedef {Object} RecognitionResult
 * @property {SpeciesCandidate[]} species best matches, most likely first
 * @property {HealthAssessment} health
 * @property {CareAdvice|null} advice null when the model call was skipped or failed
 */

/**
 * A drafted community post body. Never posted automatically — it fills the
 * composer and the user edits and submits it.
 * @typedef {Object} PostDraft
 * @property {string} body
 */

/**
 * Summary card of how to care for a plant, shown on the mobile home screen.
 * @typedef {Object} CareCard
 * @property {string} plantId
 * @property {string} nickname
 * @property {SpeciesCare} care
 * @property {string[]} tips
 */

export {};
