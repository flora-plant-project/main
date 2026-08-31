import { renderRouter, screen } from 'expo-router/testing-library';
import { fireEvent } from '@testing-library/react-native';
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
    diagnoses: {
      create: jest.fn(),
      get: jest.fn(),
      attach: jest.fn(),
      escalate: jest.fn(),
    },
    setNextDiagnosisFixture: jest.fn(),
  },
}));

const originalMode = process.env.EXPO_PUBLIC_API_MODE;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: demoUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: demoUser } });
  client.plants.list.mockResolvedValue({ ok: true, data: [] });
  client.species.list.mockResolvedValue({ ok: true, data: [] });
});

afterEach(() => {
  if (originalMode === undefined) delete process.env.EXPO_PUBLIC_API_MODE;
  else process.env.EXPO_PUBLIC_API_MODE = originalMode;
});

it('shows the DEV fixture chip in mock mode and cycles the canned results', async () => {
  process.env.EXPO_PUBLIC_API_MODE = 'mock';
  await renderRouter('./app', { initialUrl: '/camera' });
  const chip = await screen.findByTestId('dev-fixture');
  expect(chip).toBeTruthy();
  await fireEvent.press(chip);
  expect(client.setNextDiagnosisFixture).toHaveBeenCalledWith('diseased-tomato');
});

it('hides the DEV fixture chip in live mode', async () => {
  process.env.EXPO_PUBLIC_API_MODE = 'live';
  await renderRouter('./app', { initialUrl: '/camera' });
  expect(await screen.findByTestId('mode-identify')).toBeTruthy();
  expect(screen.queryByTestId('dev-fixture')).toBeNull();
});
