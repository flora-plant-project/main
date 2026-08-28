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

const author = (id, username, displayName) => ({ id, username, displayName, climateZone: null });

const helpPost = {
  id: 'post2',
  authorId: 'u3',
  author: author('u3', 'ziad_bekaa', 'Ziad'),
  type: 'HELP',
  status: 'PUBLISHED',
  body: 'Tomato leaves are yellowing from below.',
  images: [],
  attachment: { imageUri: 'assets/demo/plant-2.jpg', topIssue: 'Early blight', confidence: 0.71 },
  createdAt: '2026-08-06T18:30:00.000Z',
  likeCount: 1,
  likedByMe: false,
  commentCount: 2,
};

const page1 = {
  items: [
    {
      id: 'post1',
      authorId: 'u2',
      author: author('u2', 'rana_gardens', 'Rana'),
      type: 'GENERAL',
      status: 'PUBLISHED',
      body: 'New monstera leaf this morning!',
      images: [],
      attachment: null,
      createdAt: '2026-08-07T09:00:00.000Z',
      likeCount: 2,
      likedByMe: false,
      commentCount: 1,
    },
    helpPost,
  ],
  nextCursor: 'c2',
};

const page2 = {
  items: [
    {
      id: 'post3',
      authorId: 'u1',
      author: author('u1', 'flora_demo', 'Flora Demo'),
      type: 'GENERAL',
      status: 'PUBLISHED',
      body: 'Third post body',
      images: [],
      attachment: null,
      createdAt: '2026-08-05T09:00:00.000Z',
      likeCount: 0,
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
  client.feed.list.mockImplementation(async (options = {}) => ({
    ok: true,
    data: options.cursor === 'c2' ? page2 : page1,
  }));
});

it('renders the feed with a HELP context card and loads page 2', async () => {
  await renderRouter('./app', { initialUrl: '/community' });
  expect(await screen.findByText('New monstera leaf this morning!')).toBeTruthy();

  // HELP posts show the diagnosis context card above the body
  expect(screen.getByTestId('help-context-post2')).toBeTruthy();
  expect(screen.getByText('Early blight')).toBeTruthy();
  expect(screen.getByText('71% confidence')).toBeTruthy();

  await fireEvent.press(screen.getByTestId('feed-load-more'));
  expect(await screen.findByText('Third post body')).toBeTruthy();
  await waitFor(() => expect(client.feed.list).toHaveBeenCalledWith({ cursor: 'c2' }));
});
