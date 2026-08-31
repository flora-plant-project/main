import { renderRouter, screen } from 'expo-router/testing-library';
import { userEvent, waitFor } from '@testing-library/react-native';
import { queryClient } from '../../app/_layout.js';
import { client } from '../api/index.js';
import { useAuthStore } from '../store/authStore.js';

const demoUser = {
  id: 'u1',
  username: 'flora_demo',
  displayName: 'Flora Demo',
  climateZone: 'BEKAA',
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
    plants: { list: jest.fn(), create: jest.fn() },
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
    diagnoses: { create: jest.fn(), get: jest.fn(), attach: jest.fn() },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  queryClient.clear();
  useAuthStore.setState({ user: demoUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: demoUser } });
  client.plants.list.mockResolvedValue({ ok: true, data: [] });
  client.plants.create.mockResolvedValue({ ok: true, data: { id: 'p9', nickname: 'Tomato' } });
  client.species.list.mockResolvedValue({ ok: true, data: [tomato] });
  client.species.get.mockResolvedValue({ ok: true, data: tomato });
  client.schedules.create.mockResolvedValue({ ok: true, data: { id: 'sch9' } });
  client.diagnoses.attach.mockResolvedValue({ ok: true, data: { id: 'dg7', plantId: 'p9' } });
});

/** The deep link camera.js builds when you tap "New plant" on a scan result. */
const DEEP_LINK =
  '/add-plant?speciesId=sp2&photoUri=file%3A%2F%2Fleaf.jpg&diagnosisId=dg7';

it('keeps the photo and the scan when a scan becomes a new plant', async () => {
  const user = userEvent.setup();
  await renderRouter('./app', { initialUrl: DEEP_LINK });

  const nickname = await screen.findByTestId('confirm-nickname');
  expect(nickname.props.value).toBe('Tomato');

  await user.press(screen.getByTestId('confirm-save'));

  // The photo taken during the scan becomes the plant's photo.
  await waitFor(() =>
    expect(client.plants.create).toHaveBeenCalledWith({
      nickname: 'Tomato',
      speciesId: 'sp2',
      photoKey: 'file://leaf.jpg',
    }),
  );

  // And the scan itself is attached, so the health findings and the LLM care
  // plan land on the new plant's timeline instead of being orphaned.
  await waitFor(() => expect(client.diagnoses.attach).toHaveBeenCalledWith('dg7', 'p9'));
});

it('adds a plant normally when there is no scan to carry', async () => {
  const user = userEvent.setup();
  await renderRouter('./app', { initialUrl: '/add-plant?speciesId=sp2' });

  await user.press(await screen.findByTestId('confirm-save'));

  await waitFor(() =>
    expect(client.plants.create).toHaveBeenCalledWith({ nickname: 'Tomato', speciesId: 'sp2' }),
  );
  expect(client.diagnoses.attach).not.toHaveBeenCalled();
});
