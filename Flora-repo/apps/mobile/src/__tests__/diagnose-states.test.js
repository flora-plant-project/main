import { renderRouter, screen } from 'expo-router/testing-library';
import { act, fireEvent } from '@testing-library/react-native';
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
  client.diagnoses.create.mockResolvedValue({ ok: true, data: { id: 'dg1', status: 'PENDING' } });
  client.diagnoses.get.mockResolvedValue({ ok: true, data: { id: 'dg1', status: 'PENDING' } });
});

it('shows camera controls, then the animated progress state with rotating copy', async () => {
  await renderRouter('./app', { initialUrl: '/camera' });
  expect(await screen.findByTestId('mode-identify')).toBeTruthy();
  expect(screen.getByTestId('mode-health')).toBeTruthy();
  expect(screen.getByTestId('diagnose-capture')).toBeTruthy();
  expect(screen.getByTestId('diagnose-gallery')).toBeTruthy();

  await fireEvent.press(screen.getByTestId('diagnose-gallery'));
  expect(await screen.findByTestId('diagnose-progress')).toBeTruthy();
  expect(client.diagnoses.create).toHaveBeenCalledWith({
    imageUri: 'file://leaf.jpg',
    mode: 'identify',
  });
  expect(screen.getByText('Reading the leaves…')).toBeTruthy();

  await act(async () => {
    await jest.advanceTimersByTimeAsync(2600);
  });
  expect(screen.getByText('Checking against Lebanese seasons…')).toBeTruthy();
});
