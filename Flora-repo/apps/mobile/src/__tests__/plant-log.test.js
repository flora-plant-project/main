import { renderRouter, screen } from 'expo-router/testing-library';
import { fireEvent, waitFor } from '@testing-library/react-native';
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
  photoKey: 'assets/demo/plant-1.jpg',
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
    diagnoses: { create: jest.fn(), get: jest.fn() },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: demoUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: demoUser } });
  client.plants.get.mockResolvedValue({ ok: true, data: plant });
  client.plants.list.mockResolvedValue({ ok: true, data: [] });
  client.plants.timeline.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
  client.plants.logs.create.mockResolvedValue({
    ok: true,
    data: {
      id: 'gl9',
      plantId: 'p1',
      photoKey: null,
      note: 'New leaf!',
      createdAt: '2026-08-07T12:00:00.000Z',
    },
  });
});

it('creates a log from the sheet, then refetches the timeline', async () => {
  await renderRouter('./app', { initialUrl: '/plant/p1' });
  await screen.findByTestId('timeline-add-log');
  await waitFor(() => expect(client.plants.timeline).toHaveBeenCalledTimes(1));

  await fireEvent.press(screen.getByTestId('timeline-add-log'));
  const noteField = await screen.findByTestId('log-note');
  await fireEvent.changeText(noteField, 'New leaf!');
  await fireEvent.press(screen.getByTestId('log-save'));

  await waitFor(() =>
    expect(client.plants.logs.create).toHaveBeenCalledWith('p1', { note: 'New leaf!' }),
  );
  await waitFor(() => expect(client.plants.timeline).toHaveBeenCalledTimes(2));
  // strict order: the log is created before the timeline refetch
  expect(client.plants.logs.create.mock.invocationCallOrder[0]).toBeLessThan(
    client.plants.timeline.mock.invocationCallOrder[1],
  );
  // sheet closes on success
  await waitFor(() => expect(screen.queryByTestId('log-save')).toBeNull());
});
