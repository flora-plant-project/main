import { renderRouter, screen } from 'expo-router/testing-library';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { client } from '../api/index.js';
import { useAuthStore } from '../store/authStore.js';

const demoUser = { id: 'u1', username: 'flora_demo', displayName: 'Flora Demo', climateZone: null };

jest.mock('../api/index.js', () => ({
  client: {
    auth: { me: jest.fn(), login: jest.fn(), signup: jest.fn(), logout: jest.fn() },
    me: { update: jest.fn() },
  },
}));

/** Flush pending React work so state from fireEvent.changeText lands before the next event. */
const flush = () => act(async () => {});

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: null, hydrated: false, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: null });
  client.auth.login.mockResolvedValue({ ok: true, data: { user: demoUser } });
});

it('signs in through the client and navigates to zone selection', async () => {
  const app = renderRouter('./app', { initialUrl: '/auth/sign-in' });
  await app;
  fireEvent.changeText(await screen.findByTestId('auth-username'), 'flora_demo');
  fireEvent.changeText(screen.getByTestId('auth-password'), 'password123');
  await flush();
  fireEvent.press(screen.getByTestId('auth-submit'));
  await waitFor(() =>
    expect(client.auth.login).toHaveBeenCalledWith({
      username: 'flora_demo',
      password: 'password123',
    }),
  );
  await waitFor(() => expect(app.getPathname()).toBe('/auth/zone'));
});
