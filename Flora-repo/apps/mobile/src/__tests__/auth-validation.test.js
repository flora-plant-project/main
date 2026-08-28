import { renderRouter, screen } from 'expo-router/testing-library';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { client } from '../api/index.js';
import { useAuthStore } from '../store/authStore.js';

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
  client.auth.login.mockResolvedValue({ ok: false, error: { code: 'UNAUTHORIZED', message: 'x' } });
});

it('shows the zod validation message inline and does not call the client', async () => {
  await renderRouter('./app', { initialUrl: '/auth/sign-in' });
  fireEvent.changeText(await screen.findByTestId('auth-username'), 'Flora!');
  fireEvent.changeText(screen.getByTestId('auth-password'), 'supersecret');
  await flush();
  fireEvent.press(screen.getByTestId('auth-submit'));
  expect(await screen.findByText('lowercase letters, digits and underscores only')).toBeTruthy();
  expect(client.auth.login).not.toHaveBeenCalled();
});

it('redirects to sign-in when there is no session', async () => {
  const app = renderRouter('./app', { initialUrl: '/' });
  await app;
  await waitFor(() => expect(app.getPathname()).toBe('/auth/sign-in'));
});
