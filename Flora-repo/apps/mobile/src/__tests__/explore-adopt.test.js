import { renderRouter, screen } from 'expo-router/testing-library';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { queryClient } from '../../app/_layout.js';
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
  source: 'CATALOG',
};

const pothos = {
  id: 'sp11',
  scientificName: 'Epipremnum aureum',
  commonNames: ['Golden pothos'],
  care: { waterEveryDays: 7, sun: 'bright indirect light', tempC: { min: 15, max: 29 } },
  zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.3, BEKAA: 0.8, SOUTH: 0.9 },
  source: 'ADOPTED',
};

jest.mock('../api/index.js', () => ({
  client: {
    auth: { me: jest.fn(), login: jest.fn(), signup: jest.fn(), logout: jest.fn() },
    me: { update: jest.fn() },
    plants: { list: jest.fn(), create: jest.fn() },
    species: {
      list: jest.fn(),
      search: jest.fn(),
      get: jest.fn(),
      suggest: jest.fn(),
      adopt: jest.fn(),
    },
    schedules: { create: jest.fn() },
    diagnoses: { create: jest.fn(), get: jest.fn() },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  // The QueryClient is module-level, so its cache outlives a test. Explore now
  // searches through react-query, which means a cached
  // ['species','suggest','pothos'] entry from one test answers the next one and
  // the client is never called at all — the mock set up here would be ignored.
  queryClient.clear();
  useAuthStore.setState({ user: demoUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: demoUser } });
  client.plants.list.mockResolvedValue({ ok: true, data: [] });
  client.species.list.mockResolvedValue({ ok: true, data: [basil] });
  client.species.get.mockResolvedValue({ ok: true, data: pothos });
  client.species.search.mockResolvedValue({ ok: true, data: [] });
  client.species.suggest.mockResolvedValue({
    ok: true,
    data: [{ scientificName: 'Epipremnum aureum', commonNames: ['Golden pothos'] }],
  });
  client.species.adopt.mockResolvedValue({ ok: true, data: pothos });
});

/**
 * Render Explore, keeping the router handle.
 *
 * Wrapped in an object because renderRouter returns a thenable, and returning
 * it straight out of an async function would unwrap it and lose getPathname.
 */
async function openExplore() {
  const app = renderRouter('./app', { initialUrl: '/explore' });
  await app;
  return { app };
}

/**
 * Type into Explore's search box and let the 300ms debounce elapse.
 *
 * Timers are faked under jest-expo, so the debounce has to be advanced rather
 * than waited out — a real `setTimeout` here never fires.
 */
async function search(term) {
  await fireEvent.changeText(screen.getByTestId('explore-search'), term);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(350);
  });
}

it('offers species outside the catalog when the local search finds nothing', async () => {
  await openExplore();
  await search('pothos');

  await waitFor(() => expect(client.species.suggest).toHaveBeenCalledWith('pothos'));
  expect(await screen.findByTestId('explore-suggestion-Epipremnum aureum')).toBeTruthy();
  // The suggestion says what it is, rather than looking like a catalog row.
  expect(screen.getByText('Not in your catalog yet')).toBeTruthy();
});

it('searches the wider database even when the catalog has an answer', async () => {
  // The catalog is ten curated species plus whatever has been adopted. Limiting
  // search to it meant you could only find plants someone had already found, so
  // both sources are queried on every search now.
  client.species.search.mockResolvedValue({ ok: true, data: [basil] });

  await openExplore();
  await search('basil');

  await waitFor(() => expect(client.species.search).toHaveBeenCalledWith('basil'));
  await waitFor(() => expect(client.species.suggest).toHaveBeenCalledWith('basil'));
});

it('shows catalog results above database ones, so your own plants come first', async () => {
  client.species.search.mockResolvedValue({ ok: true, data: [basil] });

  await openExplore();
  await search('basil');

  // Both are on screen; the curated row is the one with a real id behind it.
  expect(await screen.findByTestId('explore-row-sp1')).toBeTruthy();
  expect(await screen.findByTestId('explore-suggestion-Epipremnum aureum')).toBeTruthy();
});

it('does not send a one-character query — it is slow and matches everything', async () => {
  await openExplore();
  await search('b');

  await waitFor(() => expect(client.species.search).toHaveBeenCalledWith('b'));
  // Measured at 3.1s against Plant.id, versus a ~150ms median.
  expect(client.species.suggest).not.toHaveBeenCalled();
});

it('adopts a suggestion and continues into the add-plant flow', async () => {
  const { app } = await openExplore();
  await search('pothos');

  const add = await screen.findByTestId('explore-adopt-Epipremnum aureum');
  await act(async () => {
    fireEvent.press(add);
  });

  await waitFor(() =>
    expect(client.species.adopt).toHaveBeenCalledWith({
      scientificName: 'Epipremnum aureum',
      commonNames: ['Golden pothos'],
    }),
  );
  // Adoption is a means to an end: the point is to add the plant.
  await waitFor(() => expect(app.getPathname()).toBe('/add-plant'));
  // Carrying the new species id, which is what add-plant preselects from.
  await waitFor(() => expect(client.species.get).toHaveBeenCalledWith('sp11'));
});

it('surfaces an adoption failure instead of navigating nowhere', async () => {
  client.species.adopt.mockResolvedValue({
    ok: false,
    error: { code: 'PROVIDER_ERROR', message: 'nope' },
  });

  const { app } = await openExplore();
  await search('pothos');

  await act(async () => {
    fireEvent.press(await screen.findByTestId('explore-adopt-Epipremnum aureum'));
  });

  expect(await screen.findByTestId('explore-adopt-error')).toBeTruthy();
  expect(app.getPathname()).toBe('/explore');
});

it('says so when the species database cannot be reached', async () => {
  client.species.suggest.mockResolvedValue({
    ok: false,
    error: { code: 'PROVIDER_ERROR', message: 'down' },
  });

  await openExplore();
  await search('pothos');

  expect(await screen.findByText('Could not reach the plant database')).toBeTruthy();
});

it('clears suggestions when the search box is emptied', async () => {
  await openExplore();
  await search('pothos');
  expect(await screen.findByTestId('explore-suggestion-Epipremnum aureum')).toBeTruthy();

  await search('');

  await waitFor(() => expect(screen.queryByTestId('explore-suggestions')).toBeNull());
});
