import { renderRouter, screen } from 'expo-router/testing-library';
import { zoneAdjustedInterval } from '../utils/watering.js';
import { client } from '../api/index.js';
import { useAuthStore } from '../store/authStore.js';

const bekaaUser = { id: 'u1', username: 'ziad_bekaa', displayName: 'Ziad', climateZone: 'BEKAA' };

const aloe = {
  id: 'sp8',
  scientificName: 'Aloe vera',
  commonNames: ['Aloe', 'صبار'],
  care: { waterEveryDays: 21, sun: 'full sun', tempC: { min: 10, max: 40 } },
  zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.2, BEKAA: 0.8, SOUTH: 0.9 },
};

const plant = {
  id: 'p5',
  ownerId: 'u1',
  nickname: 'صبورة',
  speciesId: 'sp8',
  photoKey: 'assets/demo/plant-5.jpg',
  createdAt: '2026-07-18T09:15:00.000Z',
  lastWateredAt: null,
  nextDueAt: null,
  schedules: [],
  growthLogs: [],
};

jest.mock('../api/index.js', () => ({
  client: {
    auth: { me: jest.fn(), login: jest.fn(), signup: jest.fn(), logout: jest.fn() },
    me: { update: jest.fn() },
    plants: {
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      markWatered: jest.fn(),
      timeline: jest.fn(),
      logs: { create: jest.fn() },
    },
    species: { list: jest.fn(), search: jest.fn(), get: jest.fn() },
    schedules: { create: jest.fn() },
    diagnoses: { create: jest.fn(), get: jest.fn() },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: bekaaUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: bekaaUser } });
  client.plants.get.mockResolvedValue({ ok: true, data: plant });
  client.plants.list.mockResolvedValue({ ok: true, data: [] });
  client.species.get.mockResolvedValue({ ok: true, data: aloe });
  client.plants.timeline.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
});

it('computes the zone-adjusted watering interval', () => {
  expect(zoneAdjustedInterval(aloe, 'BEKAA')).toBe(17); // 21 × 0.8 = 16.8 → 17
  expect(zoneAdjustedInterval(aloe, 'COASTAL')).toBe(21);
  expect(zoneAdjustedInterval(aloe, null)).toBe(21);
  expect(
    zoneAdjustedInterval({ care: { waterEveryDays: 1 }, zoneMultipliers: { X: 0.3 } }, 'X'),
  ).toBe(1); // floor at one day
});

it('shows the zone-adjusted interval in the water care card', async () => {
  await renderRouter('./app', { initialUrl: '/plant/p5' });
  const matches = await screen.findAllByText('Every 17 days');
  expect(matches.length).toBeGreaterThan(0);
});
