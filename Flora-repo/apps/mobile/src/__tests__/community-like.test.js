import { renderRouter, screen } from 'expo-router/testing-library';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { client } from '../api/index.js';
import { useAuthStore } from '../store/authStore.js';

const demoUser = {
  id: 'u1',
  username: 'flora_demo',
  displayName: 'Flora Demo',
  climateZone: 'COASTAL',
};

const page = {
  items: [
    {
      id: 'post1',
      authorId: 'u2',
      author: { id: 'u2', username: 'rana_gardens', displayName: 'Rana', climateZone: null },
      type: 'GENERAL',
      status: 'PUBLISHED',
      body: 'Like me if you can.',
      images: [],
      attachment: null,
      createdAt: '2026-08-07T09:00:00.000Z',
      likeCount: 2,
      likedByMe: false,
      commentCount: 0,
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
  client.feed.list.mockResolvedValue({ ok: true, data: page });
  // fails after 5s so the optimistic state is observable first
  client.posts.like.mockImplementation(
    () =>
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ ok: false, error: { code: 'INTERNAL', message: 'boom' } }),
          5000,
        ),
      ),
  );
});

it('bumps the like count optimistically and rolls back on failure', async () => {
  await renderRouter('./app', { initialUrl: '/community' });
  await screen.findByText('Like me if you can.');
  expect(screen.getByTestId('like-count-post1').props.children).toBe(2);

  await fireEvent.press(screen.getByTestId('like-post1'));
  await waitFor(() => expect(screen.getByTestId('like-count-post1').props.children).toBe(3));

  await act(async () => {
    await jest.advanceTimersByTimeAsync(5100);
  });
  await waitFor(() => expect(screen.getByTestId('like-count-post1').props.children).toBe(2));
});
