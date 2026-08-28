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

const page1 = {
  items: [
    {
      type: 'log',
      id: 'gl1',
      createdAt: '2026-08-01T10:00:00.000Z',
      photoKey: null,
      note: 'Moved to a sunnier corner.',
    },
    {
      type: 'diagnosis',
      id: 'dg1',
      createdAt: '2026-07-30T17:00:00.000Z',
      isHealthy: false,
      topIssue: 'Early blight',
      confidence: 0.84,
      lowConfidence: false,
    },
  ],
  nextCursor: 'c2',
};

const page2 = {
  items: [
    {
      type: 'log',
      id: 'gl2',
      createdAt: '2026-07-20T09:00:00.000Z',
      photoKey: null,
      note: 'First sprout!',
    },
  ],
  nextCursor: null,
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
  client.plants.timeline.mockImplementation(async (_id, options = {}) => ({
    ok: true,
    data: options.cursor === 'c2' ? page2 : page1,
  }));
});

it('renders a mixed timeline, loads page 2, and opens a diagnosis', async () => {
  const app = renderRouter('./app', { initialUrl: '/plant/p1' });
  await app;
  expect(await screen.findByText('Moved to a sunnier corner.')).toBeTruthy();
  expect(screen.getByText('Early blight')).toBeTruthy();

  await fireEvent.press(screen.getByTestId('timeline-load-more'));
  expect(await screen.findByText('First sprout!')).toBeTruthy();
  expect(client.plants.timeline).toHaveBeenCalledWith('p1', { cursor: 'c2' });

  await fireEvent.press(screen.getByTestId('timeline-diagnosis-dg1'));
  await waitFor(() => expect(app.getPathname()).toBe('/diagnosis/dg1'));
});
