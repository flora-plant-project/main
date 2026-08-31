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
  client.feed.list.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
});

it('shows the author-only review banner when the post lands in PENDING_REVIEW', async () => {
  client.posts.create.mockResolvedValue({
    ok: true,
    data: {
      id: 'post9',
      status: 'PENDING_REVIEW',
      body: 'sus post',
      images: ['assets/demo/flagged.jpg'],
    },
  });

  await renderRouter('./app', { initialUrl: '/compose' });
  await fireEvent.changeText(await screen.findByTestId('compose-body'), 'sus post');
  await fireEvent.press(screen.getByTestId('dev-flagged-image'));
  await fireEvent.press(screen.getByTestId('compose-submit'));

  await waitFor(() =>
    expect(client.posts.create).toHaveBeenCalledWith({
      body: 'sus post',
      images: ['assets/demo/flagged.jpg'],
    }),
  );
  expect(await screen.findByTestId('pending-banner')).toBeTruthy();
  expect(screen.getAllByText('Being reviewed — only you can see this').length).toBeGreaterThan(0);
});
