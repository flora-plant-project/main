import { CreateDiagnosisSchema } from '@flora/shared';
import { IdSchema, parseWith } from '../../lib/validate.js';

// Re-exported so this module's own files import one thing. The implementations
// are shared with every other module — see src/lib/validate.js.
export { CreateDiagnosisSchema, IdSchema, parseWith };

/**
 * Decoded byte length of a base64 string, without allocating a Buffer for it.
 * @param {string} base64
 * @returns {number}
 */
export function base64ByteLength(base64) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}
