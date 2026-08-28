import { createMockClient } from '../mockClient.js';
import { createMemoryStorage } from '../storage.js';
import { runClientContract } from './client.contract.test.js';

/** Advance fake timers past the mock's max simulated latency (800ms), then await. */
const settle = async (promise) => {
  await jest.advanceTimersByTimeAsync(1000);
  return promise;
};

/** Wall-clock waiting under fake timers (drives the ~3s diagnosis flip). */
const wait = (ms) => jest.advanceTimersByTimeAsync(ms);

describe('mockClient', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  runClientContract(() => createMockClient({ storage: createMemoryStorage() }), { settle, wait });

  describe('mock-specific behaviour', () => {
    it('simulates 300-800ms of network latency', async () => {
      const client = createMockClient({ storage: createMemoryStorage() });
      let settled = false;
      const promise = client.species.list().then((res) => {
        settled = true;
        return res;
      });
      await jest.advanceTimersByTimeAsync(250);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(800);
      expect(settled).toBe(true);
      const res = await promise;
      expect(res.ok).toBe(true);
    });

    it('persists debounced to the flora-mock-v1 key and rehydrates on start', async () => {
      const storage = createMemoryStorage();
      const first = createMockClient({ storage });
      const created = await settle(first.plants.create({ nickname: 'Persisted Fern' }));
      expect(created.ok).toBe(true);
      await jest.advanceTimersByTimeAsync(600); // flush the 500ms debounce
      const raw = await storage.getItem('flora-mock-v1');
      expect(raw).toContain('Persisted Fern');
      const second = createMockClient({ storage });
      const plants = await settle(second.plants.list());
      expect(plants.data.some((plant) => plant.nickname === 'Persisted Fern')).toBe(true);
    });

    it('recovers from a corrupted snapshot by reseeding', async () => {
      const storage = createMemoryStorage();
      await storage.setItem('flora-mock-v1', '{not json');
      const client = createMockClient({ storage });
      const plants = await settle(client.plants.list());
      expect(plants.ok).toBe(true);
      expect(plants.data).toHaveLength(6);
    });

    it('reset() restores the seed data', async () => {
      const storage = createMemoryStorage();
      const client = createMockClient({ storage });
      await settle(client.plants.create({ nickname: 'Doomed' }));
      await client.reset();
      const plants = await settle(client.plants.list());
      expect(plants.data).toHaveLength(6);
    });

    it('rejects an unknown diagnosis fixture name', () => {
      const client = createMockClient({ storage: createMemoryStorage() });
      expect(() => client.setNextDiagnosisFixture('nonsense')).toThrow(/unknown diagnosis fixture/);
    });
  });
});
