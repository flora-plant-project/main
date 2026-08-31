import { renderRouter, screen } from 'expo-router/testing-library';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { client } from '../api/index.js';
import { useAuthStore } from '../store/authStore.js';

const DAY = 24 * 60 * 60 * 1000;

const demoUser = {
  id: 'u1',
  username: 'flora_demo',
  displayName: 'Maya',
  climateZone: 'COASTAL',
};

// basil lives on the balcony (full sun) and is due today; the monstera is an
// indoor plant (bright indirect) that is settled for another fortnight.
const species = [
  {
    id: 'sp1',
    scientificName: 'Ocimum basilicum',
    commonNames: ['Basil', 'حبق'],
    care: { waterEveryDays: 2, sun: 'full sun', tempC: { min: 15, max: 30 } },
    zoneMultipliers: { COASTAL: 1 },
  },
  {
    id: 'sp7',
    scientificName: 'Monstera deliciosa',
    commonNames: ['Swiss cheese plant', 'مونستيرا'],
    care: { waterEveryDays: 7, sun: 'bright indirect', tempC: { min: 16, max: 30 } },
    zoneMultipliers: { COASTAL: 1 },
  },
];

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
  {
    id: 'p4',
    ownerId: 'u1',
    nickname: 'Monstie',
    speciesId: 'sp7',
    photoKey: 'assets/demo/plant-4.jpg',
    createdAt: '2026-07-10T12:00:00.000Z',
    lastWateredAt: null,
    nextDueAt: new Date(Date.now() + 14 * DAY).toISOString(),
  },
];

jest.mock('../api/index.js', () => ({
  client: {
    auth: { me: jest.fn(), login: jest.fn(), signup: jest.fn(), logout: jest.fn() },
    me: { update: jest.fn() },
    plants: { list: jest.fn(), markWatered: jest.fn() },
    species: { list: jest.fn() },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: demoUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: demoUser } });
  client.plants.list.mockResolvedValue({ ok: true, data: plants });
  client.species.list.mockResolvedValue({ ok: true, data: species });
  client.plants.markWatered.mockResolvedValue({ ok: true, data: plants[0] });
});

it('checking off a task waters the plant and recomputes the counter', async () => {
  await renderRouter('./app', { initialUrl: '/' });
  await screen.findByTestId('today-card');

  fireEvent.press(screen.getByTestId('task-p1'));

  await waitFor(() => expect(client.plants.markWatered).toHaveBeenCalledWith('p1'));
  await waitFor(() => expect(screen.getByTestId('today-counter').children).toEqual(['All done']));
});
