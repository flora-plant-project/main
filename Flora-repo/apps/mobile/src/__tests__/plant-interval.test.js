import { renderRouter, screen } from 'expo-router/testing-library';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { queryClient } from '../../app/_layout.js';
import { client } from '../api/index.js';
import { useAuthStore } from '../store/authStore.js';

const coastalUser = {
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
  nickname: 'Basil',
  speciesId: 'sp1',
  photoKey: 'assets/demo/plant-1.jpg',
  createdAt: '2026-08-01T09:00:00.000Z',
  lastWateredAt: null,
  nextDueAt: null,
  // No schedule row, so the interval starts at the species' 2 days for COASTAL.
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
      suggest: jest.fn(async () => ({ ok: true, data: [] })),
      adopt: jest.fn(async () => ({
        ok: false,
        error: { code: 'INTERNAL', message: 'not stubbed' },
      })),
    },
    schedules: { create: jest.fn() },
    diagnoses: { create: jest.fn(), get: jest.fn() },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  // The QueryClient is module-level and its cache outlives a test, so a plant
  // cached by one case would answer the next before these mocks are read.
  queryClient.clear();
  useAuthStore.setState({ user: coastalUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: coastalUser } });
  client.plants.get.mockResolvedValue({ ok: true, data: plant });
  client.plants.list.mockResolvedValue({ ok: true, data: [] });
  client.species.get.mockResolvedValue({ ok: true, data: basil });
  client.plants.timeline.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
  client.schedules.create.mockResolvedValue({ ok: true, data: { id: 'sch1' } });
});

/**
 * Open the plant and return its interval field, once the species has loaded.
 *
 * The screen shows a 7-day fallback until the species query resolves, so the
 * field has to settle on the real interval before a test edits it.
 */
async function openInterval() {
  await renderRouter('./app', { initialUrl: '/plant/p1' });
  await waitFor(() => expect(screen.getByTestId('interval-value').props.value).toBe('2'));
  return screen.getByTestId('interval-value');
}

/** Type into the field. Awaited and flushed, or the state update never lands. */
async function type(field, text) {
  await fireEvent.changeText(field, text);
  await act(async () => {});
}

it('saves the interval typed into the dial', async () => {
  const field = await openInterval();

  await type(field, '12');
  await fireEvent(screen.getByTestId('interval-value'), 'submitEditing');

  await waitFor(() =>
    expect(client.schedules.create).toHaveBeenCalledWith('p1', {
      type: 'WATER',
      intervalDays: 12,
    }),
  );
});

it('does not save a partial number mid-typing', async () => {
  const field = await openInterval();

  // "1" on the way to "12" must not write a one-day schedule.
  await type(field, '1');
  await type(field, '12');
  expect(client.schedules.create).not.toHaveBeenCalled();

  await fireEvent(screen.getByTestId('interval-value'), 'blur');
  await waitFor(() =>
    expect(client.schedules.create).toHaveBeenCalledWith('p1', {
      type: 'WATER',
      intervalDays: 12,
    }),
  );
  expect(client.schedules.create).toHaveBeenCalledTimes(1);
});

it('keeps the current interval when the field is cleared and left', async () => {
  const field = await openInterval();

  await type(field, '');
  await fireEvent(screen.getByTestId('interval-value'), 'blur');
  await act(async () => {});

  expect(client.schedules.create).not.toHaveBeenCalled();
  // Snapped back to the interval it already had, not to zero or NaN.
  expect(screen.getByTestId('interval-value').props.value).toBe('2');
});

it('clamps an interval beyond the allowed range', async () => {
  const field = await openInterval();

  await type(field, '99');
  await fireEvent(screen.getByTestId('interval-value'), 'submitEditing');

  await waitFor(() =>
    expect(client.schedules.create).toHaveBeenCalledWith('p1', {
      type: 'WATER',
      intervalDays: 60,
    }),
  );
});
