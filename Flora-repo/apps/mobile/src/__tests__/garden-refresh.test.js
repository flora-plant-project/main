import { renderRouter, screen } from 'expo-router/testing-library';
import { act, waitFor } from '@testing-library/react-native';
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
    photoKey: 'assets/demo/plant-1.jpg',
    createdAt: '2026-06-20T10:00:00.000Z',
    lastWateredAt: null,
    nextDueAt: null,
  },
];

const species = [
  {
    id: 'sp1',
    scientificName: 'Ocimum basilicum',
    commonNames: ['Basil', 'حبق'],
    care: { waterEveryDays: 2, sun: 'full sun', tempC: { min: 15, max: 30 } },
    zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.4, BEKAA: 0.8, SOUTH: 0.9 },
  },
];

jest.mock('../api/index.js', () => ({
  client: {
    auth: { me: jest.fn(), login: jest.fn(), signup: jest.fn(), logout: jest.fn() },
    me: { update: jest.fn() },
    plants: { list: jest.fn() },
    species: { list: jest.fn() },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: demoUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: demoUser } });
  client.plants.list.mockResolvedValue({ ok: true, data: plants });
  client.species.list.mockResolvedValue({ ok: true, data: species });
});

it('pull-to-refresh refetches the plant list', async () => {
  const app = renderRouter('./app', { initialUrl: '/' });
  await app;
  await screen.findByTestId('plant-card-p1');
  expect(client.plants.list).toHaveBeenCalledTimes(1);

  const list = screen.getByTestId('garden-list');
  await act(async () => {
    list.props.refreshControl.props.onRefresh();
  });
  await waitFor(() => expect(client.plants.list).toHaveBeenCalledTimes(2));
});
