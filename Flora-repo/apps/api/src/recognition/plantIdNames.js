import { RecognitionProviderError } from './plantId.js';

/** How many suggestions to hand back. Enough to find the plant, few enough to read. */
const MAX_SUGGESTIONS = 8;

/**
 * Score how well one knowledge-base hit answers the query.
 *
 * The provider orders results by raw substring position, which is not the same
 * question as "which plant did they mean". Searching `basil` puts
 * *Basilicum polystachyon* first — a real plant whose name merely starts with
 * those letters — while the species whose common name IS "basil" ranks below
 * it, and *Ocimum basilicum* misses the top six entirely.
 *
 * Coverage is the signal that separates the two: how much of the matched string
 * does the query actually account for? "basil" is all of `basil` (1.0), under
 * half of `basil thyme` (0.45), and a fifth of `Basilicum polystachyon` (0.23).
 *
 * Measured against the live API, this ordering fixes `basil` → *Ocimum
 * basilicum*, `mint` → *Mentha*, and leaves already-good queries like
 * `snake plant` alone. It cannot fix a query whose answer is absent from the
 * provider's ten candidates — `rose` never returns a *Rosa* at all.
 *
 * @param {object} entity one `entities[]` item
 * @param {string} query the search term, trimmed
 * @returns {number}
 */
export function scoreNameMatch(entity, query) {
  const matched = String(entity?.matched_in ?? entity?.entity_name ?? '').toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!matched || !needle) return 0;

  // 1.0 when the name IS the query; falls away as the name grows around it.
  const coverage = needle.length / matched.length;
  const exact = matched === needle ? 2 : 0;
  const prefix = matched.startsWith(needle) ? 0.25 : 0;
  // A common-name hit is how people actually refer to a plant, so it beats an
  // accident of Latin spelling.
  const viaCommonName = entity?.matched_in_type === 'common_name' ? 0.35 : 0;
  // Cultivars and varieties are variants of an answer, not the answer itself:
  // someone searching "snake plant" wants the species before 'Futura Superba'.
  const cultivar = /['‘’"]|\bvar\.|\bsubsp\./.test(String(entity?.entity_name ?? ''))
    ? -0.3
    : 0;

  return exact + coverage + prefix + viaCommonName + cultivar;
}

/**
 * Build a Plant.id knowledge-base name search.
 *
 * This is the "I know what my plant is called, it just is not in your list"
 * path. It answers with species names only — no identification, no image — and
 * measurably costs NO credits, unlike `/identification` (1 credit) and the
 * knowledge-base detail endpoint (0.5). That is what makes it usable as a
 * search-as-you-type backend rather than something to ration.
 *
 * Returns bare names on purpose. Care data does not come from here: the
 * knowledge base has no notion of Lebanese climate zones, so a species picked
 * up this way gets its profile written at adoption time instead.
 *
 * @param {{
 *   apiKey: string,
 *   baseUrl: string,
 *   timeoutMs: number,
 *   fetchImpl?: typeof fetch,
 * }} options
 */
export function createPlantIdNameSearch({ apiKey, baseUrl, timeoutMs, fetchImpl = fetch }) {
  if (!apiKey) {
    throw new Error('createPlantIdNameSearch requires an API key');
  }

  const root = `${baseUrl.replace(/\/+$/, '')}/kb/plants/name_search`;

  /**
   * @param {string} query
   * @returns {Promise<Array<{scientificName: string, commonNames: string[]}>>}
   */
  return async function searchNames(query) {
    let response;
    try {
      response = await fetchImpl(`${root}?q=${encodeURIComponent(query)}`, {
        headers: { 'Api-Key': apiKey },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      throw new RecognitionProviderError(
        timedOut
          ? `Plant.id name search did not respond within ${timeoutMs}ms`
          : `Could not reach Plant.id name search: ${error?.message ?? 'network error'}`,
        { cause: error },
      );
    }

    if (!response.ok) {
      let detail = '';
      try {
        detail = (await response.text()).slice(0, 300);
      } catch {
        detail = '';
      }
      throw new RecognitionProviderError(
        `Plant.id name search returned ${response.status}${detail ? `: ${detail}` : ''}`,
        { status: response.status },
      );
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new RecognitionProviderError('Plant.id name search returned a non-JSON body', {
        cause: error,
      });
    }

    return normalizeNameSearch(payload, query);
  };
}

/**
 * Reduce the knowledge-base response to names we can adopt, best match first.
 *
 * Entries arrive keyed by what matched, and the same species can appear more
 * than once — once for its scientific name and again for a common name that
 * matched the same query. De-duplicated on the entity name so the list reads as
 * distinct plants.
 *
 * Re-ordered by `scoreNameMatch` rather than trusting the provider's order:
 * sorted BEFORE the cap, so a good match sitting tenth is not thrown away by a
 * slice that only ever saw the first eight.
 *
 * @param {{entities?: Array<object>}} payload
 * @param {string} [query] the search term; without it the provider order stands
 * @returns {Array<{scientificName: string, commonNames: string[]}>}
 */
export function normalizeNameSearch(payload, query = '') {
  const seen = new Set();
  const results = [];

  const entities = [...(payload?.entities ?? [])];
  if (query.trim()) {
    entities.sort((a, b) => scoreNameMatch(b, query) - scoreNameMatch(a, query));
  }

  for (const entity of entities) {
    const scientificName = String(entity?.entity_name ?? '').trim();
    if (!scientificName) continue;

    const key = scientificName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // `matched_in` is the string the query hit. When that was a common name it
    // is worth keeping — it is what the person typed and how they think of the
    // plant — but when it merely repeats the scientific name it is noise.
    const matched = String(entity?.matched_in ?? '').trim();
    const isCommonName =
      entity?.matched_in_type === 'common_name' &&
      matched &&
      matched.toLowerCase() !== key;

    results.push({ scientificName, commonNames: isCommonName ? [matched] : [] });
    if (results.length >= MAX_SUGGESTIONS) break;
  }

  return results;
}
