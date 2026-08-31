/** Sun requirements that put a plant outside on the balcony. */
const OUTDOOR_SUN = ['full sun', 'partial sun'];

/** The segmented filters on the garden home (design 3a), `all` first. */
export const PLACEMENTS = Object.freeze(['all', 'balcony', 'indoors']);

/**
 * Where a plant lives, derived from its species' sun requirement — the garden
 * home filters on this. Unknown species default to the balcony.
 * @param {{ care?: { sun?: string } } | null | undefined} species
 * @returns {'balcony' | 'indoors'}
 */
export function placementFor(species) {
  const sun = species?.care?.sun?.toLowerCase?.() ?? '';
  if (!sun) return 'balcony';
  return OUTDOOR_SUN.includes(sun) ? 'balcony' : 'indoors';
}
