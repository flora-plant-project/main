import { describe, expect, it, vi } from 'vitest';
import { RecognitionProviderError } from '../plantId.js';
import { createPlantIdNameSearch, normalizeNameSearch, scoreNameMatch } from '../plantIdNames.js';
import { createStubNameSearch } from '../nameSearchStub.js';

/** A fetch that never touches the network, per the CLAUDE.md rule. */
function fetchReturning({ status = 200, body, text }) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (text !== undefined) throw new SyntaxError('not json');
      return body;
    },
    text: async () => (text !== undefined ? text : JSON.stringify(body)),
  }));
}

function makeSearch(fetchImpl) {
  return createPlantIdNameSearch({
    apiKey: 'test-key',
    baseUrl: 'https://plant.id/api/v3',
    timeoutMs: 10_000,
    fetchImpl,
  });
}

describe('createPlantIdNameSearch', () => {
  it('requires an API key', () => {
    expect(() => createPlantIdNameSearch({ baseUrl: 'x', timeoutMs: 1 })).toThrow(
      /requires an API key/,
    );
  });

  it('calls the free knowledge-base endpoint, key in a header', async () => {
    const fetchImpl = fetchReturning({ body: { entities: [] } });
    await makeSearch(fetchImpl)('pothos');

    const [url, init] = fetchImpl.mock.calls[0];
    // Not /identification — that one costs a credit per call.
    expect(url).toBe('https://plant.id/api/v3/kb/plants/name_search?q=pothos');
    expect(init.headers['Api-Key']).toBe('test-key');
  });

  it('encodes a query that would otherwise break the URL', async () => {
    const fetchImpl = fetchReturning({ body: { entities: [] } });
    await makeSearch(fetchImpl)('ward & rose');

    expect(fetchImpl.mock.calls[0][0]).toContain('q=ward%20%26%20rose');
  });

  it('reports an HTTP failure with its status', async () => {
    const fetchImpl = fetchReturning({ status: 429, text: 'slow down' });

    const error = await makeSearch(fetchImpl)('pothos').catch((e) => e);
    expect(error).toBeInstanceOf(RecognitionProviderError);
    expect(error.status).toBe(429);
  });

  it('distinguishes a timeout from an unreachable host', async () => {
    const timeout = vi.fn(async () => {
      throw Object.assign(new Error('t'), { name: 'TimeoutError' });
    });
    await expect(makeSearch(timeout)('x')).rejects.toThrow(/did not respond within 10000ms/);

    const offline = vi.fn(async () => {
      throw Object.assign(new Error('ENOTFOUND'), { name: 'TypeError' });
    });
    await expect(makeSearch(offline)('x')).rejects.toThrow(/Could not reach/);
  });

  it('rejects a non-JSON body', async () => {
    const fetchImpl = fetchReturning({ text: '<html>nope</html>' });
    await expect(makeSearch(fetchImpl)('x')).rejects.toThrow(/non-JSON body/);
  });
});

describe('normalizeNameSearch', () => {
  it('keeps the scientific name of each entity', () => {
    expect(
      normalizeNameSearch({
        entities: [{ entity_name: 'Pothos longipes' }, { entity_name: 'Pothos chinensis' }],
      }),
    ).toEqual([
      { scientificName: 'Pothos longipes', commonNames: [] },
      { scientificName: 'Pothos chinensis', commonNames: [] },
    ]);
  });

  it('keeps a matched common name, because it is what the person typed', () => {
    expect(
      normalizeNameSearch({
        entities: [
          {
            entity_name: 'Epipremnum aureum',
            matched_in: 'Golden pothos',
            matched_in_type: 'common_name',
          },
        ],
      }),
    ).toEqual([{ scientificName: 'Epipremnum aureum', commonNames: ['Golden pothos'] }]);
  });

  it('drops a "common name" that merely repeats the scientific one', () => {
    expect(
      normalizeNameSearch({
        entities: [
          {
            entity_name: 'Pothos longipes',
            matched_in: 'pothos longipes',
            matched_in_type: 'common_name',
          },
        ],
      })[0].commonNames,
    ).toEqual([]);
  });

  it('de-duplicates a species that matched twice', () => {
    // The same plant comes back once for its scientific name and again for a
    // common name that hit the same query.
    const result = normalizeNameSearch({
      entities: [
        { entity_name: 'Epipremnum aureum', matched_in_type: 'entity_name' },
        {
          entity_name: 'Epipremnum aureum',
          matched_in: 'pothos',
          matched_in_type: 'common_name',
        },
      ],
    });

    expect(result).toHaveLength(1);
  });

  it('skips entities with no usable name, and caps the list', () => {
    const entities = [{ entity_name: '' }, { entity_name: '  ' }, {}];
    expect(normalizeNameSearch({ entities })).toEqual([]);

    const many = Array.from({ length: 40 }, (_, i) => ({ entity_name: `Genus species${i}` }));
    expect(normalizeNameSearch({ entities: many })).toHaveLength(8);
  });

  it('survives a response with no entities at all', () => {
    expect(normalizeNameSearch({})).toEqual([]);
    expect(normalizeNameSearch(null)).toEqual([]);
  });
});

describe('createStubNameSearch', () => {
  it('matches on a common name, in English or Arabic', async () => {
    const search = createStubNameSearch();

    const english = await search('pothos');
    expect(english[0].scientificName).toBe('Epipremnum aureum');

    const arabic = await search('زعتر');
    expect(arabic[0].scientificName).toBe('Thymus vulgaris');
  });

  it('matches on the scientific name too, case-insensitively', async () => {
    const search = createStubNameSearch();
    await expect(search('CITRUS')).resolves.toEqual([
      { scientificName: 'Citrus limon', commonNames: ['Lemon', 'ليمون'] },
    ]);
  });

  it('answers empty for a blank query rather than the whole list', async () => {
    const search = createStubNameSearch();
    for (const query of ['', '   ', undefined]) {
      await expect(search(query)).resolves.toEqual([]);
    }
  });

  it('hands back copies, so a caller cannot mutate the stub list', async () => {
    const search = createStubNameSearch();
    const [first] = await search('pothos');
    first.commonNames.push('mutated');

    const [again] = await search('pothos');
    expect(again.commonNames).toEqual(['Golden pothos']);
  });
});

describe('scoreNameMatch — ranking, not the provider order', () => {
  /** One entities[] item, in the shape the knowledge base returns. */
  const hit = (entity_name, matched_in, matched_in_type = 'entity_name') => ({
    entity_name,
    matched_in,
    matched_in_type,
  });

  it('puts the plant whose common name IS the query first', () => {
    // The real case: Plant.id answers "basil" with Basilicum polystachyon,
    // whose Latin name merely starts with those letters, ahead of the plant
    // people actually call basil.
    const ranked = normalizeNameSearch(
      {
        entities: [
          hit('Basilicum polystachyon', 'Basilicum polystachyon'),
          hit('Basilicum', 'Basilicum'),
          hit('Ocimum basilicum', 'basil', 'common_name'),
          hit('Clinopodium acinos', 'basil thyme', 'common_name'),
        ],
      },
      'basil',
    );

    expect(ranked[0].scientificName).toBe('Ocimum basilicum');
  });

  it('ranks a phrase that merely contains the query below one that is the query', () => {
    const ranked = normalizeNameSearch(
      {
        entities: [
          hit('Clinopodium acinos', 'basil thyme', 'common_name'),
          hit('Ocimum basilicum', 'basil', 'common_name'),
        ],
      },
      'basil',
    );

    expect(ranked.map((r) => r.scientificName)).toEqual([
      'Ocimum basilicum',
      'Clinopodium acinos',
    ]);
  });

  it('prefers the species over its cultivars', () => {
    const ranked = normalizeNameSearch(
      {
        entities: [
          hit("Dracaena trifasciata 'Laurentii'", 'snake plant', 'common_name'),
          hit('Dracaena trifasciata var. laurentii', 'snake plant', 'common_name'),
          hit('Dracaena trifasciata', 'snake plant', 'common_name'),
        ],
      },
      'snake plant',
    );

    expect(ranked[0].scientificName).toBe('Dracaena trifasciata');
  });

  it('sorts before the cap, so a good match sitting last is not sliced away', () => {
    // Nine near-misses ahead of the answer: an unsorted slice(0, 8) would drop it.
    const filler = Array.from({ length: 9 }, (_, i) =>
      hit(`Mentha lookalike ${i} species`, `Mentha lookalike ${i} species`),
    );
    const ranked = normalizeNameSearch(
      { entities: [...filler, hit('Mentha', 'mint', 'common_name')] },
      'mint',
    );

    expect(ranked[0].scientificName).toBe('Mentha');
  });

  it('leaves the provider order alone when there is no query to score against', () => {
    const ranked = normalizeNameSearch({
      entities: [hit('Pothos longipes', 'Pothos longipes'), hit('Pothos', 'Pothos')],
    });

    expect(ranked.map((r) => r.scientificName)).toEqual(['Pothos longipes', 'Pothos']);
  });

  it('scores an exact common-name hit above a bare prefix of a longer Latin name', () => {
    expect(scoreNameMatch(hit('Mentha', 'mint', 'common_name'), 'mint')).toBeGreaterThan(
      scoreNameMatch(hit('Minthostachys', 'Minthostachys'), 'mint'),
    );
  });

  it('is unfazed by junk entities', () => {
    expect(scoreNameMatch({}, 'mint')).toBe(0);
    expect(scoreNameMatch(hit('Mentha', 'mint', 'common_name'), '   ')).toBe(0);
  });
});
