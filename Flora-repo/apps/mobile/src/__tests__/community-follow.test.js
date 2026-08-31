import { renderRouter, screen } from 'expo-router/testing-library';
import { act, fireEvent } from '@testing-library/react-native';
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
    plants: {
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      markWatered: jest.fn(),
      timeline: jest.fn(),
      logs: { create: jest.fn() },
    },
    species: {
      list: jest.fn(),
      search: jest.fn(),
      get: jest.fn(),
      // Defaulted here rather than per-file: the screens now search the
      // wider species database on every keystroke, and a suite that does
      // not care about suggestions still has to not crash on them.
      suggest: jest.fn(async () => ({ ok: true, data: [] })),
      adopt: jest.fn(async () => ({ ok: false, error: { code: 'INTERNAL', message: 'not stubbed' } })),
    },
    schedules: { create: jest.fn() },
    diagnoses: { create: jest.fn(), get: jest.fn(), attach: jest.fn(), escalate: jest.fn() },
    feed: { list: jest.fn() },
    users: { get: jest.fn(), posts: jest.fn() },
    posts: {
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      comments: jest.fn(),
      like: jest.fn(),
      unlike: jest.fn(),
      comment: jest.fn(),
    },
    social: { follow: jest.fn(), unfollow: jest.fn() },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: demoUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: demoUser } });
  client.plants.list.mockResolvedValue({ ok: true, data: [] });
  client.species.list.mockResolvedValue({ ok: true, data: [] });
  client.users.get.mockResolvedValue({
    ok: true,
    data: {
      user: { id: 'u2', username: 'rana_gardens', displayName: 'Rana', climateZone: 'MOUNTAIN' },
      following: false,
    },
  });
  client.users.posts.mockResolvedValue({ ok: true, data: [] });
  // resolves after 2s so the double-tap window is realistic
  client.social.follow.mockImplementation(
    () =>
      new Promise((resolve) =>
        setTimeout(() => resolve({ ok: true, data: { following: true } }), 2000),
      ),
  );
});

it('double-tapping follow stays idempotent (one request, no unfollow)', async () => {
  await renderRouter('./app', { initialUrl: '/user/u2' });
  const button = await screen.findByTestId('follow-button');
  expect(screen.getByText('Follow')).toBeTruthy();

  await fireEvent.press(button);
  // optimistic flip while the request is in flight
  expect(await screen.findByText('Following')).toBeTruthy();
  await fireEvent.press(button);
  await fireEvent.press(button);

  await act(async () => {
    await jest.advanceTimersByTimeAsync(2100);
  });
  expect(client.social.follow).toHaveBeenCalledTimes(1);
  expect(client.social.unfollow).not.toHaveBeenCalled();
});
