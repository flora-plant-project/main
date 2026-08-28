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
  client.plants.list.mockResolvedValue({ ok: true, data: [] });
  client.species.list.mockResolvedValue({ ok: true, data: [] });
});

it('shows the empty state and its CTA navigates to add-plant', async () => {
  const app = renderRouter('./app', { initialUrl: '/' });
  await app;
  fireEvent.press(await screen.findByTestId('garden-empty-cta'));
  await waitFor(() => expect(app.getPathname()).toBe('/add-plant'));
});
