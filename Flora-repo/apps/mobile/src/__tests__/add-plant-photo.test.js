import { renderRouter, screen } from 'expo-router/testing-library';
import { act, userEvent, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { client } from '../api/index.js';
import { useAuthStore } from '../store/authStore.js';

const demoUser = {
  id: 'u1',
  username: 'flora_demo',
  displayName: 'Flora Demo',
  climateZone: 'COASTAL',
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

const flush = () => act(async () => {});

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: demoUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: demoUser } });
  client.plants.list.mockResolvedValue({ ok: true, data: [] });
  client.plants.create.mockResolvedValue({ ok: true, data: { id: 'p9', nickname: 'Tomato' } });
  client.species.list.mockResolvedValue({ ok: true, data: [tomato] });
  client.species.get.mockResolvedValue({ ok: true, data: tomato });
  client.schedules.create.mockResolvedValue({ ok: true, data: { id: 'sch9' } });
  client.diagnoses.attach.mockResolvedValue({ ok: true, data: { id: 'dg1', plantId: 'p9' } });
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://plant.jpg' }],
  });
  client.diagnoses.create.mockResolvedValue({ ok: true, data: { id: 'dg1', status: 'PENDING' } });
  let polls = 0;
  client.diagnoses.get.mockImplementation(async () => {
    polls += 1;
    if (polls < 3) return { ok: true, data: { id: 'dg1', status: 'PENDING' } };
    return {
      ok: true,
      data: {
        id: 'dg1',
        status: 'COMPLETE',
        lowConfidence: false,
        result: {
          species: [
            {
              speciesId: 'sp2',
              scientificName: 'Solanum lycopersicum',
              commonNames: ['Tomato', 'بندورة'],
              probability: 0.88,
            },
          ],
          health: { isHealthy: false, issues: [], confidence: 0.84 },
        },
      },
    };
  });
});

it('runs the photo flow in order and saves with an automatic watering schedule', async () => {
  const user = userEvent.setup();
  await renderRouter('./app', { initialUrl: '/add-plant' });
  await user.press(await screen.findByTestId('tab-photo'));
  await user.press(await screen.findByTestId('photo-library'));
  await flush();

  // create fires first; polling only starts after the 2s interval
  expect(client.diagnoses.create).toHaveBeenCalledWith({
    imageUri: 'file://plant.jpg',
    mode: 'identify',
  });
  expect(client.diagnoses.get).not.toHaveBeenCalled();
  expect(screen.getByTestId('diagnosis-progress')).toBeTruthy();

  await act(async () => {
    await jest.advanceTimersByTimeAsync(2100);
  });
  expect(client.diagnoses.get).toHaveBeenCalledTimes(1);

  await act(async () => {
    await jest.advanceTimersByTimeAsync(4200);
  });
  expect(client.diagnoses.get).toHaveBeenCalledTimes(3);

  await user.press(await screen.findByTestId('suggestion-sp2'));
  const nickname = await screen.findByTestId('confirm-nickname');
  expect(nickname.props.value).toBe('Tomato');

  await user.press(screen.getByTestId('confirm-save'));
  await waitFor(() =>
    expect(client.plants.create).toHaveBeenCalledWith({
      nickname: 'Tomato',
      speciesId: 'sp2',
      photoKey: 'file://plant.jpg',
    }),
  );
  await waitFor(() =>
    expect(client.schedules.create).toHaveBeenCalledWith('p9', { type: 'WATER' }),
  );
  // The scan that identified this plant follows it onto the timeline, carrying
  // the health findings and the care plan with it.
  await waitFor(() => expect(client.diagnoses.attach).toHaveBeenCalledWith('dg1', 'p9'));
});

it('still saves the plant when attaching the scan fails', async () => {
  client.diagnoses.attach.mockResolvedValue({
    ok: false,
    error: { code: 'NOT_FOUND', message: 'diagnosis dg1 not found' },
  });
  const user = userEvent.setup();
  await renderRouter('./app', { initialUrl: '/add-plant' });
  await user.press(await screen.findByTestId('tab-photo'));
  await user.press(await screen.findByTestId('photo-library'));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(6300);
  });

  await user.press(await screen.findByTestId('suggestion-sp2'));
  await user.press(await screen.findByTestId('confirm-save'));

  // Losing the scan's history must not cost the user the plant itself.
  await waitFor(() => expect(client.plants.create).toHaveBeenCalled());
  expect(screen.queryByTestId('confirm-error')).toBeNull();
});
