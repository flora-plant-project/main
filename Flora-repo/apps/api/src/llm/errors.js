/**
 * The one error every generator raises.
 *
 * It lives in its own file because three providers now throw it — Bedrock,
 * Gemini and the fixture stub — and an error class shared by all of them has no
 * business living inside one of them. Importing it from `bedrock.js`, as the
 * stub used to, dragged the AWS SDK into code paths that never call AWS.
 *
 * `bedrock.js` re-exports it, so `import { LlmProviderError } from './bedrock.js'`
 * keeps working.
 */

/** Raised when a model is reachable but the call did not produce usable JSON. */
export class LlmProviderError extends Error {
  /**
   * @param {string} message
   * @param {{status?: number, cause?: unknown}} [options]
   */
  constructor(message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'LlmProviderError';
    this.status = status;
  }
}
