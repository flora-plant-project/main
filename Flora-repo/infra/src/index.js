export { FloraMediaStack } from './media-stack.js';

/**
 * Prefix every Flora stack shares. Stack names read `flora-<what>`, so one
 * account can host more than one environment without a naming collision.
 * @returns {string} package identifier
 */
export function stackPrefix() {
  return 'flora';
}
