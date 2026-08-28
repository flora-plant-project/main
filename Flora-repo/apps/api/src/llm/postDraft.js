import { PostDraftSchema } from '@flora/shared';

/** Fixture/task name. The stub reads test/fixtures/llm-post-draft.json for it. */
export const POST_DRAFT_TASK = 'post-draft';

/** Below this, an issue is a guess and must not be stated as fact in a post. */
const CONFIDENT_PROBABILITY = 0.5;

const SYSTEM_PROMPT = `You draft community posts for Flora, a plant-care app used in Lebanon.

A person is about to post to the community feed and wants help writing it.
You return the post body as JSON. You are writing AS them, in first person.

Rules:
- Write the way a real person posts: casual, specific, a bit human. Not a
  press release and not a support ticket.
- Describe what is actually visible or known. Never invent details you were
  not given — no made-up symptoms, timelines, or things they "tried".
- If there is a diagnosis, mention what the app suggested but keep it as a
  suggestion, not a fact. Low-probability guesses must be phrased as maybes
  or left out entirely.
- End with a specific question. "Any advice?" is weak; "has anyone treated
  this without copper spray?" gets answers.
- 2-4 sentences. Short enough that someone scrolling actually reads it.
- No hashtags, no emoji, no greeting like "Hi everyone".
- Answer in English only.`;

/**
 * Turn a day count into how a person would actually say it.
 * @param {number} days
 */
function humanAge(days) {
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  const years = Math.floor(days / 365);
  return years === 1 ? 'a year' : `${years} years`;
}

/**
 * Render whatever the client knows into the user turn.
 *
 * Both halves are optional and either is enough: a diagnosis produces a HELP
 * post about symptoms, a bare plant produces a show-and-tell post from its age
 * and care history.
 *
 * @param {{diagnosis: object|null, plant: object|null}} input
 */
export function buildPostDraftPrompt({ diagnosis, plant }) {
  const lines = [];

  if (plant) {
    lines.push('About the plant:');
    lines.push(`  - The owner calls it "${plant.nickname}"`);
    if (plant.speciesName) lines.push(`  - Species: ${plant.speciesName}`);
    if (typeof plant.ageDays === 'number') {
      lines.push(`  - They have had it for ${humanAge(plant.ageDays)}`);
    }
    if (typeof plant.logCount === 'number' && plant.logCount > 0) {
      lines.push(`  - They have logged its progress ${plant.logCount} times`);
    }
    if (plant.lastWateredAt) lines.push(`  - Last watered: ${plant.lastWateredAt}`);
  }

  if (diagnosis) {
    const top = diagnosis.species?.[0];
    lines.push('', 'What the scan found:');
    if (top) {
      lines.push(
        `  - Species guess: ${top.scientificName}` +
          `${top.commonNames?.length ? ` (${top.commonNames[0]})` : ''}` +
          ` at ${Math.round(top.probability * 100)}%`,
      );
    }

    const issues = diagnosis.health?.issues ?? [];
    const confident = issues.filter((i) => i.probability >= CONFIDENT_PROBABILITY);
    const unsure = issues.filter((i) => i.probability < CONFIDENT_PROBABILITY);

    if (confident.length) {
      lines.push(
        '  - Likely problem(s):',
        ...confident.map((i) => `      ${i.name} (${Math.round(i.probability * 100)}%)`),
      );
    }
    if (unsure.length) {
      lines.push(
        '  - Much less certain, mention only as a maybe or not at all:',
        ...unsure.map((i) => `      ${i.name} (${Math.round(i.probability * 100)}%)`),
      );
    }
    if (!issues.length) {
      lines.push('  - No problems detected; the plant looks healthy.');
    }

    lines.push(
      `  - Overall confidence: ${Math.round((diagnosis.health?.confidence ?? 0) * 100)}%`,
    );
    lines.push(
      confident.length
        ? 'Write a post asking the community for help with this problem.'
        : 'Write a show-and-tell post — there is nothing wrong to ask about.',
    );
  } else {
    lines.push('', 'No scan was run. Write a show-and-tell post about the plant itself.');
  }

  return lines.join('\n');
}

/**
 * Ask the model to draft a post body.
 *
 * Returns text only — nothing is posted. The draft lands in the composer for
 * the person to edit and submit themselves, which is both cheaper and the
 * honest way to put machine-written words under someone's name.
 *
 * @param {(input: object) => Promise<unknown>} generate an LLM provider
 * @param {{diagnosis: object|null, plant: object|null}} input
 * @returns {Promise<import('@flora/shared/src/types.js').PostDraft>}
 */
export function requestPostDraft(generate, input) {
  return generate({
    task: POST_DRAFT_TASK,
    system: SYSTEM_PROMPT,
    user: buildPostDraftPrompt(input),
    schema: PostDraftSchema,
    effort: 'low',
    maxTokens: 2000,
  });
}
