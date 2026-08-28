import { renderRouter, screen } from 'expo-router/testing-library';
import { fireEvent, waitFor } from '@testing-library/react-native';
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
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://leaf.jpg' }],
  });
  client.diagnoses.create.mockResolvedValue({
    ok: false,
    error: { code: 'PROVIDER_ERROR', message: 'provider down' },
  });
});

it('shows the friendly failed state and retries on tap', async () => {
  await renderRouter('./app', { initialUrl: '/camera' });
  await fireEvent.press(await screen.findByTestId('diagnose-gallery'));

  expect(await screen.findByTestId('diagnose-failed')).toBeTruthy();
  expect(screen.getByText('Something wilted')).toBeTruthy();

  await fireEvent.press(screen.getByTestId('diagnose-retry'));
  await waitFor(() => expect(client.diagnoses.create).toHaveBeenCalledTimes(2));
});
