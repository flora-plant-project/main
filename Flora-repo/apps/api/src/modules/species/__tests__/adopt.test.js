import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@flora/shared';
import { createSpeciesService } from '../service.js';

const PROFILE = {
  care: { waterEveryDays: 7, sun: 'bright indirect light', tempC: { min: 15, max: 29 } },
  zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.3, BEKAA: 0.8, SOUTH: 0.9 },
};

/**
 * An in-memory stand-in for the Species table.
 *
 * Only the four calls the service makes, so a test reads as the behaviour under
 * test rather than as Prisma choreography.
 * @param {Array<object>} [rows]
 */
function fakePrisma(rows = []) {
  const species = [...rows];
  return {
    rows: species,
    species: {
      findMany: vi.fn(async () => species.map((row) => ({ ...row }))),
      findUnique: vi.fn(async ({ where }) => {
        const found = species.find((row) => row.scientificName === where.scientificName);
        return found ? { ...found } : null;
      }),
      create: vi.fn(async ({ data }) => {
        const row = { id: `sp${species.length + 1}`, ...data };
        species.push(row);
        return { ...row };
      }),
    },
  };
}

const silent = { error: vi.fn(), info: vi.fn() };

function makeService({ prisma = fakePrisma(), searchNames, describe: desc } = {}) {
  return {
    prisma,
    service: createSpeciesService({ prisma, searchNames, describe: desc, logger: silent }),
  };
}

describe('species.adopt', () => {
  it('creates a row with the model-written care profile, marked ADOPTED', async () => {
    const describeFn = vi.fn(async () => ({ profile: PROFILE, generated: true }));
    const { service, prisma } = makeService({ describe: describeFn });

    const res = await service.adopt({
      scientificName: 'Epipremnum aureum',
      commonNames: ['Golden pothos'],
    });

    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({
      scientificName: 'Epipremnum aureum',
      commonNames: ['Golden pothos'],
      care: PROFILE.care,
      zoneMultipliers: PROFILE.zoneMultipliers,
      source: 'ADOPTED',
    });
    expect(describeFn).toHaveBeenCalledWith({
      scientificName: 'Epipremnum aureum',
      commonNames: ['Golden pothos'],
    });
    expect(prisma.species.create).toHaveBeenCalledTimes(1);
  });

  it('sorts adopted species after the curated catalog', async () => {
    const { service } = makeService({
      describe: async () => ({ profile: PROFILE, generated: true }),
    });

    const res = await service.adopt({ scientificName: 'Epipremnum aureum' });
    // The seeded ten occupy 0..9; nobody curated this one's position.
    expect(res.data.sortOrder).toBeGreaterThan(9);
  });

  it('is idempotent on an exact name — a double tap adopts once', async () => {
    const describeFn = vi.fn(async () => ({ profile: PROFILE, generated: true }));
    const { service, prisma } = makeService({ describe: describeFn });

    const first = await service.adopt({ scientificName: 'Epipremnum aureum' });
    const second = await service.adopt({ scientificName: 'Epipremnum aureum' });

    expect(second.data.id).toBe(first.data.id);
    expect(prisma.species.create).toHaveBeenCalledTimes(1);
    // The second call must not spend another model call either.
    expect(describeFn).toHaveBeenCalledTimes(1);
  });

  it('matches an existing species on the binomial, ignoring authority citations', async () => {
    // This is the case that stops a scan creating a second basil: Plant.id
    // returns decorated names, the catalog stores plain ones.
    const prisma = fakePrisma([
      { id: 'sp1', scientificName: 'Ocimum basilicum', source: 'CATALOG' },
    ]);
    const describeFn = vi.fn();
    const { service } = makeService({ prisma, describe: describeFn });

    for (const name of ['Ocimum basilicum L.', "Ocimum basilicum 'Genovese'"]) {
      const res = await service.adopt({ scientificName: name });
      expect(res.data.id).toBe('sp1');
    }
    expect(prisma.species.create).not.toHaveBeenCalled();
    expect(describeFn).not.toHaveBeenCalled();
  });

  it('still adopts when the model failed, using whatever profile it was handed', async () => {
    // requestSpeciesCare downgrades to a neutral profile rather than throwing;
    // adoption must go through regardless, because a person is waiting to add
    // a plant.
    const { service } = makeService({
      describe: async () => ({ profile: PROFILE, generated: false }),
    });

    const res = await service.adopt({ scientificName: 'Epipremnum aureum' });
    expect(res.ok).toBe(true);
    expect(res.data.source).toBe('ADOPTED');
  });

  it('rejects a name that is not a genus and species', async () => {
    const { service } = makeService({ describe: async () => ({ profile: PROFILE }) });

    for (const scientificName of ['123', '!!!']) {
      const res = await service.adopt({ scientificName });
      expect(res.ok).toBe(false);
      expect(res.error.code).toBe(ErrorCode.VALIDATION);
    }
  });

  it('rejects a missing or blank name', async () => {
    const { service } = makeService({ describe: async () => ({ profile: PROFILE }) });

    for (const input of [{}, { scientificName: '   ' }, null]) {
      const res = await service.adopt(input);
      expect(res.ok).toBe(false);
      expect(res.error.code).toBe(ErrorCode.VALIDATION);
    }
  });

  it('defaults commonNames to an empty list rather than null', async () => {
    const { service } = makeService({
      describe: async () => ({ profile: PROFILE, generated: true }),
    });

    const res = await service.adopt({ scientificName: 'Epipremnum aureum' });
    expect(res.data.commonNames).toEqual([]);
  });

  it('fails cleanly when no care-profile source is configured', async () => {
    const { service } = makeService();
    const res = await service.adopt({ scientificName: 'Epipremnum aureum' });

    expect(res.ok).toBe(false);
    expect(res.error.code).toBe(ErrorCode.INTERNAL);
  });
});

describe('species.suggest', () => {
  it('returns provider names that are not already in the catalog', async () => {
    const prisma = fakePrisma([{ id: 'sp1', scientificName: 'Ocimum basilicum' }]);
    const { service } = makeService({
      prisma,
      searchNames: async () => [
        { scientificName: 'Ocimum basilicum', commonNames: ['Basil'] },
        { scientificName: 'Epipremnum aureum', commonNames: ['Golden pothos'] },
      ],
    });

    const res = await service.suggest('bas');
    expect(res.ok).toBe(true);
    // Basil is already searchable; offering it again would be a confusing duplicate.
    expect(res.data).toEqual([
      { scientificName: 'Epipremnum aureum', commonNames: ['Golden pothos'] },
    ]);
  });

  it('filters a catalog match even when the provider decorates the name', async () => {
    const prisma = fakePrisma([{ id: 'sp1', scientificName: 'Ocimum basilicum' }]);
    const { service } = makeService({
      prisma,
      searchNames: async () => [{ scientificName: 'Ocimum basilicum L.', commonNames: [] }],
    });

    await expect(service.suggest('basil')).resolves.toEqual({ ok: true, data: [] });
  });

  it('rejects a blank query the way search does', async () => {
    const { service } = makeService({ searchNames: async () => [] });

    for (const query of ['', '   ', undefined]) {
      const res = await service.suggest(query);
      expect(res.ok).toBe(false);
      expect(res.error.code).toBe(ErrorCode.VALIDATION);
    }
  });

  it('reports a provider failure as PROVIDER_ERROR, not a crash', async () => {
    const { service } = makeService({
      searchNames: async () => {
        throw new Error('upstream is down');
      },
    });

    const res = await service.suggest('pothos');
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe(ErrorCode.PROVIDER_ERROR);
  });

  it('answers empty when no name search is configured', async () => {
    const { service } = makeService();
    await expect(service.suggest('pothos')).resolves.toEqual({ ok: true, data: [] });
  });
});
