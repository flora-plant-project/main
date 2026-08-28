import { renderRouter, screen } from 'expo-router/testing-library';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { queryClient } from '../../app/_layout.js';
import { client } from '../api/index.js';
import { useAuthStore } from '../store/authStore.js';

const demoUser = {
  id: 'u1',
  username: 'flora_demo',
  displayName: 'Flora Demo',
  climateZone: 'BEKAA',
};

const plant = { id: 'p1', nickname: 'Basil Buddy', speciesId: 'sp1', createdAt: '2026-06-20T10:00:00.000Z' };

const completeDiagnosis = {
  id: 'dg1',
  status: 'COMPLETE',
  lowConfidence: false,
  result: {
    species: [
      { speciesId: 'sp1', scientificName: 'Ocimum basilicum', commonNames: ['Basil'], probability: 0.93 },
    ],
    health: { isHealthy: true, issues: [], confidence: 0.91 },
    advice: null,
  },
};

jest.mock('../api/index.js', () => ({
  client: {
    auth: { me: jest.fn(), login: jest.fn(), signup: jest.fn(), logout: jest.fn() },
    plants: { list: jest.fn(), get: jest.fn(), timeline: jest.fn() },
    species: { list: jest.fn(), get: jest.fn() },
    schedules: { list: jest.fn() },
    posts: { draft: jest.fn() },
    diagnoses: { create: jest.fn(), get: jest.fn(), attach: jest.fn(), escalate: jest.fn() },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  queryClient.clear();
  useAuthStore.setState({ user: demoUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: demoUser } });
  client.plants.list.mockResolvedValue({ ok: true, data: [plant] });
  client.plants.get.mockResolvedValue({ ok: true, data: { ...plant, schedules: [], growthLogs: [] } });
  client.plants.timeline.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
  client.species.list.mockResolvedValue({ ok: true, data: [] });
  client.species.get.mockResolvedValue({
    ok: true,
    data: {
      id: 'sp1',
      scientificName: 'Ocimum basilicum',
      commonNames: ['Basil'],
      care: { waterEveryDays: 3, sun: 'full sun', tempC: { min: 15, max: 32 } },
      zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.3, BEKAA: 0.7, SOUTH: 0.85 },
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

/** Run a scan through to the result card. */
async function scanTo(url) {
  const app = renderRouter('./app', { initialUrl: url });
  await app;
  await fireEvent.press(await screen.findByTestId('diagnose-gallery'));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2100);
  });
  await screen.findByTestId('diagnose-done');
  // Wrapped: renderRouter returns a thenable, and returning it straight out of
  // an async function would unwrap it and lose getPathname.
  return { app };
}

it('lands on the plant page when the scan was launched from a plant', async () => {
  const { app } = await scanTo('/camera?plantId=p1');

  await fireEvent.press(screen.getByTestId('diagnose-done'));

  // A scan is about a plant, so finishing one shows that plant rather than
  // dropping the user back where they started.
  await waitFor(() => expect(app.getPathname()).toBe('/plant/p1'));
});

it('lands on the plant the scan was just saved to', async () => {
  const { app } = await scanTo('/camera');

  await fireEvent.press(screen.getByTestId('diagnose-save'));
  await fireEvent.press(await screen.findByTestId('save-plant-p1'));
  await waitFor(() => expect(client.diagnoses.attach).toHaveBeenCalledWith('dg1', 'p1'));

  await fireEvent.press(screen.getByTestId('diagnose-done'));
  await waitFor(() => expect(app.getPathname()).toBe('/plant/p1'));
});

it('just goes back when the scan belongs to no plant', async () => {
  const { app } = await scanTo('/camera');

  await fireEvent.press(screen.getByTestId('diagnose-done'));

  // A one-off lookup has no plant to show, so there is nowhere to route to.
  await waitFor(() => expect(app.getPathname()).not.toBe('/plant/p1'));
});
