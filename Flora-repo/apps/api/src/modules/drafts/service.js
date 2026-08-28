import { ErrorCode, fail, ok } from '@flora/shared';
import { DraftPostSchema, parseWith } from './validators.js';

/**
 * Create the drafts service.
 *
 * Deliberately its own module rather than part of a posts module: posts, plants
 * and auth are being built in parallel and this needs none of them. Everything
 * it writes about arrives in the request body, so it has no database, no
 * session, and nothing to coordinate.
 *
 * It also creates nothing. The draft goes back to the composer for the person
 * to edit and submit under their own name.
 *
 * @param {{
 *   draft: (input: object) => Promise<{body: string}>,
 *   logger?: Pick<Console, 'error'>,
 * }} deps
 */
export function createDraftService({ draft, logger = console }) {
  return {
    /**
     * Draft a community post from a diagnosis, a plant, or both.
     * @param {unknown} input
     */
    async post(input) {
      const { data, error } = parseWith(DraftPostSchema, input);
      if (error) return error;

      try {
        const { body } = await draft(data);
        return ok({ body });
      } catch (failure) {
        // A drafting failure is a dead end for this request, not a broken app:
        // the composer stays usable and the person writes their own post. Say
        // so plainly rather than dressing it up as an internal error.
        logger.error('[drafts] post draft failed:', failure);
        return fail(
          ErrorCode.PROVIDER_ERROR,
          'Could not draft a post right now — write your own and try again later.',
        );
      }
    },
  };
}
