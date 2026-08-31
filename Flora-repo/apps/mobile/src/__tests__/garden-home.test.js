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

it('renders the app bar, today card and grid, and filters by placement (design 3a)', async () => {
  await renderRouter('./app', { initialUrl: '/' });

  expect(await screen.findByText('My garden')).toBeTruthy();
  expect(screen.getByText('2 plants · Beirut')).toBeTruthy();
  expect(screen.getByText('M')).toBeTruthy(); // avatar initial

  expect(screen.getByTestId('today-card')).toBeTruthy();
  expect(screen.getByText('Water Basil Buddy')).toBeTruthy();
  expect(screen.getByText('Basil · Balcony')).toBeTruthy();
  expect(screen.getByTestId('today-counter').children).toEqual(['1 left']);

  expect(screen.getByText('All plants')).toBeTruthy();
  expect(screen.getByTestId('plant-card-p1')).toBeTruthy();
  expect(screen.getByTestId('plant-card-p4')).toBeTruthy();

  // the monstera is an indoor plant, so the Balcony filter drops it
  fireEvent.press(screen.getByTestId('garden-filter-balcony'));
  await waitFor(() => expect(screen.queryByTestId('plant-card-p4')).toBeNull());
  expect(screen.getByTestId('plant-card-p1')).toBeTruthy();
  expect(screen.getByTestId('garden-filter-balcony').props.accessibilityState.selected).toBe(true);
  expect(screen.getByTestId('garden-filter-all').props.accessibilityState.selected).toBe(false);
});
