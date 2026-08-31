import { renderRouter, screen } from 'expo-router/testing-library';
import { act, fireEvent } from '@testing-library/react-native';
import { client } from '../api/index.js';
import { useAuthStore } from '../store/authStore.js';

const demoUser = {
  id: 'u1',
  username: 'flora_demo',
  displayName: 'Flora Demo',
  climateZone: 'COASTAL',
};

const basil = {
  id: 'sp1',
  scientificName: 'Ocimum basilicum',
  commonNames: ['Basil', 'حبق'],
  care: { waterEveryDays: 2, sun: 'full sun', tempC: { min: 15, max: 30 } },
  zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.4, BEKAA: 0.8, SOUTH: 0.9 },
};

const plant = {
  id: 'p1',
  ownerId: 'u1',
  nickname: 'Basil Buddy',
  speciesId: 'sp1',
  photoKey: 'assets/demo/plant-1.jpg',
  createdAt: '2026-06-20T10:00:00.000Z',
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
    species: {
      list: jest.fn(),
      search: jest.fn(),
      get: jest.fn(),
      // Defaulted here rather than per-file: the screens now search the
      // wider species database on every keystroke, and a suite that does
      // not care about suggestions still has to not crash on them.
      suggest: jest.fn(async () => ({ ok: true, data: [] })),
      adopt: jest.fn(async () => ({ ok: false, error: { code: 'INTERNAL', message: 'not stubbed' } })),
    },
    schedules: { create: jest.fn() },
    diagnoses: { create: jest.fn(), get: jest.fn() },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: demoUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: demoUser } });
  client.plants.get.mockResolvedValue({ ok: true, data: plant });
  client.plants.list.mockResolvedValue({ ok: true, data: [] });
  client.species.get.mockResolvedValue({ ok: true, data: basil });
  client.plants.timeline.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
  // fails after 5s so the optimistic state is visible first
  client.plants.markWatered.mockImplementation(
    () =>
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ ok: false, error: { code: 'INTERNAL', message: 'boom' } }),
          5000,
        ),
      ),
  );
});

it('updates the chip optimistically and rolls back when markWatered fails', async () => {
  await renderRouter('./app', { initialUrl: '/plant/p1' });
  expect(await screen.findByText('Water today')).toBeTruthy();
  // wait for the species query so the optimistic update uses the real 2-day interval
  expect((await screen.findAllByText('Every 2 days')).length).toBeGreaterThan(0);

  // Watering asks first — it restarts the cycle and there is no undo.
  await fireEvent.press(screen.getByTestId('mark-watered'));
  await fireEvent.press(await screen.findByTestId('confirm-water'));
  // optimistic: basil at COASTAL waters every 2 days
  expect(await screen.findByText('In 2 days')).toBeTruthy();
  expect(screen.queryByText('Water today')).toBeNull();

  await act(async () => {
    await jest.advanceTimersByTimeAsync(5100);
  });
  expect(await screen.findByText('Water today')).toBeTruthy();
  expect(screen.queryByText('In 2 days')).toBeNull();
});
