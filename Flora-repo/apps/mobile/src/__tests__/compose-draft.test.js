import { renderRouter, screen } from 'expo-router/testing-library';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { queryClient } from '../../app/_layout.js';
import { client } from '../api/index.js';
import { useAuthStore } from '../store/authStore.js';

const demoUser = {
  id: 'u1',
  username: 'flora_demo',
  displayName: 'Flora Demo',
  climateZone: 'BEKAA',
};

jest.mock('../api/index.js', () => ({
  client: {
    auth: { me: jest.fn(), login: jest.fn(), signup: jest.fn(), logout: jest.fn() },
    plants: { list: jest.fn() },
    species: { list: jest.fn() },
    posts: { draft: jest.fn(), create: jest.fn() },
  },
}));

const plant = {
  id: 'p3',
  nickname: 'Minty',
  speciesName: 'Mentha spicata',
  createdAt: '2026-05-24T16:45:00.000Z',
  lastWateredAt: null,
};

const DRAFT = 'Look at Minty after three months — finally filling out. Any tips?';

beforeEach(() => {
  jest.clearAllMocks();
  // The app's query client is module-scoped, so without this a cached plants
  // list from an earlier case is still fresh and the next case asserts on it.
  queryClient.clear();
  useAuthStore.setState({ user: demoUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: demoUser } });
  client.species.list.mockResolvedValue({ ok: true, data: [] });
  client.plants.list.mockResolvedValue({ ok: true, data: [plant] });
  client.posts.draft.mockResolvedValue({ ok: true, data: { body: DRAFT } });
});

it('drafts a post about a chosen plant and puts it in the editor', async () => {
  const app = renderRouter('./app', { initialUrl: '/compose' });
  await app;

  await fireEvent.press(await screen.findByTestId('compose-draft'));
  await fireEvent.press(await screen.findByTestId('draft-plant-p3'));

  await waitFor(() => expect(screen.getByTestId('compose-body').props.value).toBe(DRAFT));

  // Plant details travel inline — there is no plants API to resolve an id yet.
  const [sent] = client.posts.draft.mock.calls[0];
  expect(sent.plant.nickname).toBe('Minty');
  expect(sent.plant.speciesName).toBe('Mentha spicata');
  expect(sent.plant.ageDays).toBeGreaterThan(80);

  // Drafting must never post. Submitting stays the user's explicit action.
  expect(client.posts.create).not.toHaveBeenCalled();
});

it('does not fetch plants until the picker is opened', async () => {
  const app = renderRouter('./app', { initialUrl: '/compose' });
  await app;

  expect(await screen.findByTestId('compose-draft')).toBeTruthy();
  expect(client.plants.list).not.toHaveBeenCalled();
});

it('explains what to do when there are no plants to write about', async () => {
  client.plants.list.mockResolvedValue({ ok: true, data: [] });
  const app = renderRouter('./app', { initialUrl: '/compose' });
  await app;

  await fireEvent.press(await screen.findByTestId('compose-draft'));
  expect(await screen.findByTestId('draft-no-plants')).toBeTruthy();
});

it('surfaces a drafting failure and leaves the editor untouched', async () => {
  client.posts.draft.mockResolvedValue({
    ok: false,
    error: { code: 'PROVIDER_ERROR', message: 'Could not draft a post right now' },
  });
  const app = renderRouter('./app', { initialUrl: '/compose' });
  await app;

  await fireEvent.press(await screen.findByTestId('compose-draft'));
  await fireEvent.press(await screen.findByTestId('draft-plant-p3'));

  expect(await screen.findByText('Could not draft a post right now')).toBeTruthy();
  expect(screen.getByTestId('compose-body').props.value).toBe('');
});
