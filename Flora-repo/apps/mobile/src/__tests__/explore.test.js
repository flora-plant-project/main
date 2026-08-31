import { renderRouter, screen } from 'expo-router/testing-library';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
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

const tomato = {
  id: 'sp2',
  scientificName: 'Solanum lycopersicum',
  commonNames: ['Tomato', 'بندورة'],
  care: { waterEveryDays: 3, sun: 'full sun', tempC: { min: 15, max: 32 } },
  zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.3, BEKAA: 0.7, SOUTH: 0.85 },
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
    diagnoses: { create: jest.fn(), get: jest.fn(), attach: jest.fn(), escalate: jest.fn() },
    feed: { list: jest.fn() },
    users: { get: jest.fn(), posts: jest.fn() },
    posts: {
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      comments: jest.fn(),
      like: jest.fn(),
      unlike: jest.fn(),
      comment: jest.fn(),
    },
    social: { follow: jest.fn(), unfollow: jest.fn() },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: demoUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: demoUser } });
  client.plants.list.mockResolvedValue({ ok: true, data: [] });
  client.species.list.mockResolvedValue({ ok: true, data: [basil, tomato] });
  client.species.search.mockResolvedValue({ ok: true, data: [basil] });
  client.species.get.mockResolvedValue({ ok: true, data: basil });
});

it('browses the catalog, searches with a debounce, and adds a species', async () => {
  const app = renderRouter('./app', { initialUrl: '/explore' });
  await app;
  expect(await screen.findByText('Basil')).toBeTruthy();
  expect(screen.getByText('Tomato')).toBeTruthy();

  const input = screen.getByTestId('explore-search');
  await fireEvent.changeText(input, 'ba');
  await fireEvent.changeText(input, 'bas');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(350);
  });
  await waitFor(() => expect(client.species.search).toHaveBeenCalledTimes(1));
  expect(client.species.search).toHaveBeenCalledWith('bas');
  await waitFor(() => expect(screen.queryByText('Tomato')).toBeNull());

  // Awaited rather than fetched synchronously: search results arrive through
  // react-query now, so the row renders a tick after the call is observed.
  await fireEvent.press(await screen.findByTestId('explore-add-sp1'));
  // lands on the add-plant confirm step with the species preselected
  await waitFor(() => expect(app.getPathnameWithParams()).toBe('/add-plant?speciesId=sp1'));
  expect(await screen.findByTestId('confirm-nickname')).toBeTruthy();
  expect(screen.getByTestId('confirm-nickname').props.value).toBe('Basil');
});
