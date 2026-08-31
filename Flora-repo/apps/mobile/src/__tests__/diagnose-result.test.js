import { renderRouter, screen } from 'expo-router/testing-library';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { client } from '../api/index.js';
import { useAuthStore } from '../store/authStore.js';

const demoUser = {
  id: 'u1',
  username: 'flora_demo',
  displayName: 'Flora Demo',
  climateZone: 'COASTAL',
};

const tomato = {
  id: 'sp2',
  scientificName: 'Solanum lycopersicum',
  commonNames: ['Tomato', 'بندورة'],
  care: { waterEveryDays: 3, sun: 'full sun', tempC: { min: 15, max: 32 } },
  zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.3, BEKAA: 0.7, SOUTH: 0.85 },
};

const completeDiagnosis = {
  id: 'dg1',
  plantId: 'p1',
  imageUri: 'file://leaf.jpg',
  status: 'COMPLETE',
  lowConfidence: false,
  result: {
    species: [
      {
        speciesId: 'sp2',
        scientificName: 'Solanum lycopersicum',
        commonNames: ['Tomato', 'بندورة'],
        probability: 0.88,
      },
    ],
    health: {
      isHealthy: false,
      issues: [
        {
          name: 'Early blight',
          probability: 0.81,
          treatmentHints: ['Remove the affected lower leaves', 'Apply a copper-based fungicide'],
        },
        {
          name: 'Nitrogen deficiency',
          probability: 0.22,
          treatmentHints: ['Feed with a balanced fertilizer'],
        },
      ],
      confidence: 0.84,
    },
  },
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
    posts: { draft: jest.fn() },
    diagnoses: {
      create: jest.fn(),
      get: jest.fn(),
      attach: jest.fn(),
      escalate: jest.fn(),
    },
    setNextDiagnosisFixture: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: demoUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: demoUser } });
  client.plants.list.mockResolvedValue({ ok: true, data: [] });
  client.species.list.mockResolvedValue({ ok: true, data: [] });
  client.species.get.mockResolvedValue({ ok: true, data: tomato });
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://leaf.jpg' }],
  });
  client.diagnoses.create.mockResolvedValue({ ok: true, data: { id: 'dg1', status: 'PENDING' } });
  client.diagnoses.get.mockResolvedValue({ ok: true, data: completeDiagnosis });
  client.diagnoses.escalate.mockResolvedValue({
    ok: true,
    data: { id: 'post9', type: 'HELP' },
  });
  client.posts.draft.mockResolvedValue({
    ok: true,
    data: { body: 'My tomato has brown spots spreading up the lower leaves. Any advice?' },
  });
});

it('renders the result card and escalates to the community post', async () => {
  const app = renderRouter('./app', { initialUrl: '/camera?plantId=p1' });
  await app;
  await fireEvent.press(await screen.findByTestId('diagnose-gallery'));

  // launched from a plant → health mode with plantId attached
  await waitFor(() =>
    expect(client.diagnoses.create).toHaveBeenCalledWith({
      imageUri: 'file://leaf.jpg',
      mode: 'health',
      plantId: 'p1',
    }),
  );

  await act(async () => {
    await jest.advanceTimersByTimeAsync(2100);
  });

  expect(await screen.findByText('Needs a little care')).toBeTruthy();
  // appears in the banner subtitle and the issue row
  expect(screen.getAllByText('Early blight').length).toBeGreaterThan(0);
  expect(screen.getByTestId('issue-bar-0')).toBeTruthy();
  expect(screen.getByTestId('issue-bar-1')).toBeTruthy();
  expect(screen.getByText('Remove the affected lower leaves')).toBeTruthy();
  expect(await screen.findByText(/Water every 3 days in your zone/)).toBeTruthy();

  // Asking the community drafts the post first and shows it for review —
  // nothing is published until the user presses post.
  await fireEvent.press(screen.getByTestId('diagnose-ask'));
  await waitFor(() =>
    expect(screen.getByTestId('ask-body').props.value).toMatch(/brown spots/),
  );
  expect(client.diagnoses.escalate).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByTestId('ask-post'));
  await waitFor(() =>
    expect(client.diagnoses.escalate).toHaveBeenCalledWith('dg1', {
      body: 'My tomato has brown spots spreading up the lower leaves. Any advice?',
    }),
  );
  await waitFor(() => expect(app.getPathname()).toBe('/post/post9'));
});

it('still lets you ask the community when drafting fails', async () => {
  client.posts.draft.mockResolvedValue({
    ok: false,
    error: { code: 'PROVIDER_ERROR', message: 'Could not draft a post right now' },
  });
  const app = renderRouter('./app', { initialUrl: '/camera?plantId=p1' });
  await app;
  await fireEvent.press(await screen.findByTestId('diagnose-gallery'));
  // The result phase is gated on the poll cycle, same as the test above.
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2100);
  });

  await fireEvent.press(await screen.findByTestId('diagnose-ask'));
  // The sheet opens with an empty field to write in — a drafting failure must
  // not block the escalation path.
  await waitFor(() => expect(screen.getByTestId('ask-body')).toBeTruthy());
  expect(screen.getByTestId('ask-body').props.value).toBe('');
  await waitFor(() => expect(app.getPathname()).not.toBe('/post/post9'));
});
