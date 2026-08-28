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

const plants = [
  {
    id: 'p1',
    ownerId: 'u1',
    nickname: 'Basil Buddy',
    speciesId: 'sp1',
    photoKey: null,
    nextDueAt: null,
    lastWateredAt: null,
    createdAt: '2026-06-20T10:00:00.000Z',
  },
];

const completeDiagnosis = {
  id: 'dg1',
  plantId: null,
  imageUri: 'file://leaf.jpg',
  status: 'COMPLETE',
  lowConfidence: false,
  result: {
    species: [
      {
        speciesId: 'sp1',
        scientificName: 'Ocimum basilicum',
        commonNames: ['Basil', 'حبق'],
        probability: 0.93,
      },
    ],
    health: { isHealthy: true, issues: [], confidence: 0.91 },
  },
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
  client.plants.list.mockResolvedValue({ ok: true, data: plants });
  client.species.list.mockResolvedValue({ ok: true, data: [] });
  client.species.get.mockResolvedValue({
    ok: true,
    data: {
      id: 'sp1',
      scientificName: 'Ocimum basilicum',
      commonNames: ['Basil', 'حبق'],
      care: { waterEveryDays: 2, sun: 'full sun', tempC: { min: 15, max: 30 } },
      zoneMultipliers: { COASTAL: 1 },
    },
  });
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://leaf.jpg' }],
  });
  client.diagnoses.create.mockResolvedValue({ ok: true, data: { id: 'dg1', status: 'PENDING' } });
  client.diagnoses.get.mockResolvedValue({ ok: true, data: completeDiagnosis });
  client.diagnoses.attach.mockResolvedValue({ ok: true, data: { id: 'dg1', plantId: 'p1' } });
});

it('saves the diagnosis to an existing plant via the bottom sheet', async () => {
  await renderRouter('./app', { initialUrl: '/camera' });
  await fireEvent.press(await screen.findByTestId('diagnose-gallery'));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2100);
  });
  expect(await screen.findByText('Looking healthy!')).toBeTruthy();

  await fireEvent.press(screen.getByTestId('diagnose-save'));
  expect(await screen.findByTestId('save-new-plant')).toBeTruthy();
  await fireEvent.press(await screen.findByTestId('save-plant-p1'));

  await waitFor(() => expect(client.diagnoses.attach).toHaveBeenCalledWith('dg1', 'p1'));
  expect(await screen.findByText('Saved ✓')).toBeTruthy();
});
