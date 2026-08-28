import { renderRouter } from 'expo-router/testing-library';
import { act, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { client } from '../api/index.js';
import { useAuthStore } from '../store/authStore.js';

const demoUser = {
  id: 'u1',
  username: 'flora_demo',
  displayName: 'Flora Demo',
  climateZone: 'COASTAL',
};

const plant = {
  id: 'p1',
  ownerId: 'u1',
  nickname: 'Basil Buddy',
  speciesId: null,
  photoKey: null,
  createdAt: '2026-06-20T10:00:00.000Z',
  lastWateredAt: null,
  nextDueAt: null,
  schedules: [],
  growthLogs: [],
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
    diagnoses: { create: jest.fn(), get: jest.fn(), attach: jest.fn(), escalate: jest.fn() },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: demoUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: demoUser } });
  client.plants.list.mockResolvedValue({ ok: true, data: [] });
  client.plants.get.mockResolvedValue({ ok: true, data: plant });
  client.plants.timeline.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
  client.species.list.mockResolvedValue({ ok: true, data: [] });
});

it('routes a notification tap to the plant screen via data.plantId', async () => {
  const app = renderRouter('./app', { initialUrl: '/' });
  await app;

  expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalled();
  const listener = Notifications.addNotificationResponseReceivedListener.mock.calls[0][0];
  await act(async () => {
    listener({ notification: { request: { content: { data: { plantId: 'p1' } } } } });
  });
  await waitFor(() => expect(app.getPathname()).toBe('/plant/p1'));
});
