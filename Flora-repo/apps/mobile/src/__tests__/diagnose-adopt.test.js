import { renderRouter, screen } from 'expo-router/testing-library';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { client } from '../api/index.js';
import { useAuthStore } from '../store/authStore.js';

const demoUser = {
  id: 'u1',
  username: 'flora_demo',
  displayName: 'Flora Demo',
  climateZone: 'COASTAL',
};

/**
 * What a real scan of an uncatalogued plant looks like.
 *
 * Plant.id knows tens of thousands of species; the seeded catalog knows ten. So
 * `speciesId: null` is the normal case, not the edge case — which is why these
 * rows used to render greyed out and refuse the tap.
 */
const unknownSpeciesDiagnosis = {
  id: 'dg1',
  plantId: null,
  imageUri: 'file://leaf.jpg',
  status: 'COMPLETE',
  lowConfidence: false,
  result: {
    species: [
      {
        speciesId: null,
        scientificName: 'Epipremnum aureum',
        commonNames: ['Golden pothos'],
        probability: 0.88,
      },
      {
        speciesId: null,
        scientificName: 'Monstera adansonii',
        commonNames: ['Swiss cheese vine'],
        probability: 0.07,
      },
    ],
    health: { isHealthy: true, issues: [], confidence: 0.9 },
    advice: null,
  },
};

const adoptedPothos = {
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
      suggest: jest.fn(),
      adopt: jest.fn(),
    },
    schedules: { create: jest.fn() },
    diagnoses: {
      create: jest.fn(),
      get: jest.fn(),
      attach: jest.fn(),
      escalate: jest.fn(),
    },
    setNextDiagnosisFixture: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: demoUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: demoUser } });
  client.plants.list.mockResolvedValue({ ok: true, data: [] });
  client.species.list.mockResolvedValue({ ok: true, data: [] });
  client.species.get.mockResolvedValue({ ok: true, data: adoptedPothos });
  client.species.adopt.mockResolvedValue({ ok: true, data: adoptedPothos });
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://leaf.jpg' }],
  });
  client.diagnoses.create.mockResolvedValue({ ok: true, data: { id: 'dg1', status: 'PENDING' } });
  client.diagnoses.get.mockResolvedValue({ ok: true, data: unknownSpeciesDiagnosis });
});

/**
 * Run a scan from the gallery and land on the result screen.
 *
 * The router handle comes back in an object: renderRouter is a thenable, and
 * returning it straight out of an async function would lose getPathname.
 */
async function scan() {
  const app = renderRouter('./app', { initialUrl: '/camera' });
  await app;
  await fireEvent.press(await screen.findByTestId('diagnose-gallery'));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2100);
  });
  return { app };
}

it('adopts an uncatalogued candidate on tap and opens the add-plant flow', async () => {
  const { app } = await scan();

  // Keyed by index because the candidate has no species id to key on.
  const row = await screen.findByTestId('diagnose-suggestion-0');
  await act(async () => {
    fireEvent.press(row);
  });

  await waitFor(() =>
    expect(client.species.adopt).toHaveBeenCalledWith({
      scientificName: 'Epipremnum aureum',
      commonNames: ['Golden pothos'],
    }),
  );
  await waitFor(() => expect(app.getPathname()).toBe('/add-plant'));
  // Carrying the new species id, which is what add-plant preselects from.
  await waitFor(() => expect(client.species.get).toHaveBeenCalledWith('sp11'));
});

it('does not adopt a candidate the catalog already knows', async () => {
  client.diagnoses.get.mockResolvedValue({
    ok: true,
    data: {
      ...unknownSpeciesDiagnosis,
      result: {
        ...unknownSpeciesDiagnosis.result,
        species: [
          {
            speciesId: 'sp1',
            scientificName: 'Ocimum basilicum',
            commonNames: ['Basil'],
            probability: 0.93,
          },
        ],
      },
    },
  });

  const { app } = await scan();
  await act(async () => {
    fireEvent.press(await screen.findByTestId('diagnose-suggestion-sp1'));
  });

  await waitFor(() => expect(app.getPathname()).toBe('/add-plant'));
  // Already curated — adopting would spend a model call to re-describe it.
  expect(client.species.adopt).not.toHaveBeenCalled();
});

it('stays put and explains when adoption fails', async () => {
  client.species.adopt.mockResolvedValue({
    ok: false,
    error: { code: 'PROVIDER_ERROR', message: 'nope' },
  });

  const { app } = await scan();
  await act(async () => {
    fireEvent.press(await screen.findByTestId('diagnose-suggestion-0'));
  });

  expect(await screen.findByTestId('diagnose-adopt-error')).toBeTruthy();
  expect(app.getPathname()).toBe('/camera');
});
