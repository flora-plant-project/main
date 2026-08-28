import { CareAdviceSchema, LOW_CONFIDENCE_THRESHOLD } from '@flora/shared';

/** Fixture/task name. The stub reads test/fixtures/llm-care-advice.json for it. */
export const CARE_ADVICE_TASK = 'care-advice';

/**
 * Issues below this probability are context, not instructions.
 *
 * Plant.id routinely returns a long tail of low-probability guesses. Writing
 * treatment steps for a 0.22 hunch produces confident-sounding advice for a
 * problem the plant probably does not have, which is worse than silence — so
 * they are passed to the model as things to watch for instead.
 */
const ACTIONABLE_PROBABILITY = 0.5;

/**
 * What each Lebanese climate zone means for plant care.
 *
 * The app's whole premise is local advice, and "Lebanon" is not one climate:
 * a tomato in the Bekaa and the same tomato in Beirut have different problems
 * in the same week. Without this the model writes generic gardening copy.
 */
const ZONE_NOTES = Object.freeze({
  COASTAL:
    'Coastal strip (Beirut, Saida, Tripoli). Humid, mild winters, hot muggy summers, ' +
    'salt-laden air. High humidity drives fungal disease year-round; airflow matters more ' +
    'than watering frequency.',
  MOUNTAIN:
    'Mount Lebanon and the highlands. Cold winters with frost and snow, mild dry summers, ' +
    'strong sun at altitude. Short growing season; frost dates dominate timing advice.',
  BEKAA:
    'Bekaa valley. Continental and dry — hot days, sharply cooler nights, low humidity, ' +
    'cold winters. The big day-night swing leaves heavy dew on foliage each morning, which ' +
    'is the main fungal vector despite the dry air.',
  SOUTH:
    'South Lebanon. Hot, dry, long summers with limited rainfall and often thin soils. ' +
    'Heat and water stress outrank disease as the usual cause of trouble.',
});

const SYSTEM_PROMPT = `You write plant care advice for Flora, a plant-care app used in Lebanon.

You receive the output of an image-based plant recognition service: a species
guess, any detected health issues, and a confidence score. You return a short,
practical care plan as JSON.

Rules:
- Write for a home grower, not a botanist. Plain language, no jargon without a
  plain-language gloss.
- Every step must be something the person can actually do this week with what a
  Lebanese hardware shop or nursery stocks. No lab tests, no products that need
  importing.
- Order steps by urgency: what to do today first.
- The "why" on each step must teach the underlying cause, so the person can
  recognise the problem next time without the app.
- Use the climate zone. Mention the local factor explicitly when it changes the
  advice (dew, frost dates, humidity, heat).
- Issues listed as "watch for" are unconfirmed. Never write treatment steps for
  them. Put them in watchFor as observable signals that would confirm or rule
  them out.
- If the plant is healthy, give upkeep and productivity advice instead of
  treatment. Do not invent problems.
- Aim for a summary of 2-3 sentences and 2-4 steps. Fewer good steps beat more
  padded ones.
- Answer in English only.`;

/**
 * Render the recognition result as the user turn.
 *
 * Deliberately a compact briefing rather than raw JSON: the model reads issue
 * codes and probabilities more reliably as labelled prose, and it keeps the
 * cached system prompt doing the structural work.
 *
 * @param {import('@flora/shared/src/types.js').RecognitionResult} result
 * @param {{climateZone?: string, month?: string}} context
 */
export function buildCareAdvicePrompt(result, { climateZone, month } = {}) {
  const top = result.species[0];
  const species = top
    ? `${top.scientificName}${top.commonNames.length ? ` (${top.commonNames[0]})` : ''}` +
      ` — ${Math.round(top.probability * 100)}% confident`
    : 'Unknown species';

  const actionable = result.health.issues.filter((i) => i.probability >= ACTIONABLE_PROBABILITY);
  const suspected = result.health.issues.filter((i) => i.probability < ACTIONABLE_PROBABILITY);

  const lines = [
    `Species: ${species}`,
    `Overall health confidence: ${Math.round(result.health.confidence * 100)}%`,
    `Verdict: ${result.health.isHealthy ? 'appears healthy' : 'problems detected'}`,
  ];

  if (actionable.length) {
    lines.push(
      'Confirmed issues (write treatment steps for these):',
      ...actionable.map(
        (issue) => `  - ${issue.code} (${issue.name}) — ${Math.round(issue.probability * 100)}%`,
      ),
    );
  }
  if (suspected.length) {
    lines.push(
      'Possible but unconfirmed (watch for only, no treatment steps):',
      ...suspected.map(
        (issue) => `  - ${issue.code} (${issue.name}) — ${Math.round(issue.probability * 100)}%`,
      ),
    );
  }
  if (!actionable.length && !suspected.length) {
    lines.push('No health issues detected.');
  }

  lines.push(
    `Climate zone: ${climateZone ?? 'unspecified'}`,
    ZONE_NOTES[climateZone] ?? 'No zone given — keep advice usable anywhere in Lebanon.',
  );
  if (month) lines.push(`Current month: ${month}`);

  return lines.join('\n');
}

/**
 * Should this result get advice at all?
 *
 * Below the low-confidence threshold the species guess is unreliable, and advice
 * built on a bad identification is worse than no advice — it is confidently
 * wrong about the wrong plant. Those diagnoses route to the second-opinion path
 * instead. This also keeps model spend off unusable photos.
 *
 * @param {import('@flora/shared/src/types.js').RecognitionResult} result
 */
export function shouldAdvise(result) {
  return result.health.confidence >= LOW_CONFIDENCE_THRESHOLD;
}

/**
 * Ask the model for a care plan.
 *
 * @param {(input: object) => Promise<unknown>} generate an LLM provider
 * @param {import('@flora/shared/src/types.js').RecognitionResult} result
 * @param {{climateZone?: string, month?: string}} [context]
 * @returns {Promise<import('@flora/shared/src/types.js').CareAdvice>}
 */
export function requestCareAdvice(generate, result, context = {}) {
  return generate({
    task: CARE_ADVICE_TASK,
    system: SYSTEM_PROMPT,
    user: buildCareAdvicePrompt(result, context),
    schema: CareAdviceSchema,
    // Bounded task with the reasoning already done by the recognizer. Low keeps
    // the diagnosis snappy; the person is watching a spinner.
    effort: 'low',
    maxTokens: 4000,
  });
}
