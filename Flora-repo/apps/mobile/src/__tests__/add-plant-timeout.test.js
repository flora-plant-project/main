import { renderRouter, screen } from 'expo-router/testing-library';
import { act, userEvent } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { client } from '../api/index.js';
import { useAuthStore } from '../store/authStore.js';

const demoUser = {
  id: 'u1',
  username: 'flora_demo',
  displayName: 'Flora Demo',
  climateZone: 'COASTAL',
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
    diagnoses: { create: jest.fn(), get: jest.fn() },
  },
}));

const flush = () => act(async () => {});

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: demoUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: demoUser } });
  client.plants.list.mockResolvedValue({ ok: true, data: [] });
  client.species.list.mockResolvedValue({ ok: true, data: [] });
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://plant.jpg' }],
  });
  client.diagnoses.create.mockResolvedValue({ ok: true, data: { id: 'dg1', status: 'PENDING' } });
  client.diagnoses.get.mockResolvedValue({ ok: true, data: { id: 'dg1', status: 'PENDING' } });
});

it('shows a retry screen after the 90s polling budget and retries on tap', async () => {
  const user = userEvent.setup();
  await renderRouter('./app', { initialUrl: '/add-plant' });
  await user.press(await screen.findByTestId('tab-photo'));
  await user.press(await screen.findByTestId('photo-library'));
  await flush();

  await act(async () => {
    await jest.advanceTimersByTimeAsync(91_000);
  });
  expect(client.diagnoses.get).toHaveBeenCalledTimes(45);
  expect(screen.getByTestId('diagnosis-retry')).toBeTruthy();

  await user.press(screen.getByTestId('diagnosis-retry'));
  await flush();
  expect(client.diagnoses.create).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId('diagnosis-progress')).toBeTruthy();
});
