import { renderRouter, screen } from 'expo-router/testing-library';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { client } from '../api/index.js';
import { useAuthStore } from '../store/authStore.js';

const demoUser = { id: 'u1', username: 'flora_demo', displayName: 'Flora Demo', climateZone: null };

jest.mock('../api/index.js', () => ({
  client: {
    auth: { me: jest.fn(), login: jest.fn(), signup: jest.fn(), logout: jest.fn() },
    me: { update: jest.fn() },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: null, hydrated: false, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: null });
  client.me.update.mockResolvedValue({
    ok: true,
    data: { user: { ...demoUser, climateZone: 'COASTAL' } },
  });
});

it('updates the climate zone on tap and lands on the garden', async () => {
  const app = renderRouter('./app', { initialUrl: '/auth/zone' });
  await app;
  fireEvent.press(await screen.findByTestId('zone-COASTAL'));
  await waitFor(() => expect(client.me.update).toHaveBeenCalledWith({ climateZone: 'COASTAL' }));
  await waitFor(() => expect(app.getPathname()).toBe('/'));
});
