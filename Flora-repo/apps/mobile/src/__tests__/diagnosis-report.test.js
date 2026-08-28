import { AccessibilityInfo } from 'react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
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
    diagnoses: { get: jest.fn() },
  },
}));

const result = {
  species: [
    { speciesId: 'sp2', scientificName: 'Solanum lycopersicum', commonNames: ['Tomato'], probability: 0.88 },
  ],
  health: {
    isHealthy: false,
    issues: [
      {
        code: 'EARLY_BLIGHT',
        name: 'Early blight',
        probability: 0.81,
        treatmentHints: ['Remove the affected lower leaves'],
      },
    ],
    confidence: 0.84,
  },
  advice: {
    summary: 'Your tomato has early blight, caught early and very treatable.',
    steps: [
      {
        action: 'Cut off every leaf with brown target-shaped spots',
        when: 'Today',
        why: 'Spores survive on fallen leaves and splash back up.',
      },
    ],
    watchFor: ['Dark sunken patches on the fruit itself'],
  },
};

/** @param {object} data */
function mockDiagnosis(data) {
  client.diagnoses.get.mockResolvedValue({ ok: true, data });
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: demoUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: demoUser } });
  client.plants.list.mockResolvedValue({ ok: true, data: [] });
  client.species.list.mockResolvedValue({ ok: true, data: [] });
});

it('renders the care plan for a completed diagnosis', async () => {
  mockDiagnosis({ id: 'dg1', status: 'COMPLETE', result, lowConfidence: false, error: null });
  const app = renderRouter('./app', { initialUrl: '/diagnosis/dg1' });
  await app;

  expect(await screen.findByTestId('advice-summary')).toBeTruthy();
  expect(screen.getByText(result.advice.summary)).toBeTruthy();
  expect(screen.getByText(result.advice.steps[0].action)).toBeTruthy();
  // The "why" is the part that teaches — it must not be dropped for brevity.
  expect(screen.getByText(result.advice.steps[0].why)).toBeTruthy();
  expect(screen.getByText(result.advice.watchFor[0])).toBeTruthy();
  expect(screen.getByTestId('diagnosis-species')).toBeTruthy();
  expect(client.diagnoses.get).toHaveBeenCalledWith('dg1');
});

it('falls back to provider treatment hints when there is no care plan', async () => {
  mockDiagnosis({
    id: 'dg2',
    status: 'COMPLETE',
    result: { ...result, advice: null },
    lowConfidence: false,
    error: null,
  });
  const app = renderRouter('./app', { initialUrl: '/diagnosis/dg2' });
  await app;

  // advice: null is the documented outcome when the model is skipped or fails.
  // The screen must still show something useful, never an empty report.
  expect(await screen.findByText('Remove the affected lower leaves')).toBeTruthy();
  expect(screen.queryByTestId('advice-summary')).toBeNull();
});

it('flags a low-confidence diagnosis', async () => {
  mockDiagnosis({
    id: 'dg3',
    status: 'COMPLETE',
    result: { ...result, advice: null },
    lowConfidence: true,
    error: null,
  });
  const app = renderRouter('./app', { initialUrl: '/diagnosis/dg3' });
  await app;

  expect(await screen.findByTestId('diagnosis-low-confidence')).toBeTruthy();
});

it('shows the provider message on a failed diagnosis', async () => {
  mockDiagnosis({
    id: 'dg4',
    status: 'FAILED',
    result: null,
    lowConfidence: null,
    error: { code: 'PROVIDER_ERROR', message: 'Plant.id did not respond within 45000ms' },
  });
  const app = renderRouter('./app', { initialUrl: '/diagnosis/dg4' });
  await app;

  expect(await screen.findByTestId('diagnosis-failed')).toBeTruthy();
  expect(screen.getByText('Plant.id did not respond within 45000ms')).toBeTruthy();
});

it('keeps the whole care plan reachable while it is still animating in', async () => {
  // Tests run with reduced motion on (jest.setup.js), so this opts back into
  // the animated path — the one everybody actually sees.
  AccessibilityInfo.isReduceMotionEnabled = () => Promise.resolve(false);
  mockDiagnosis({ id: 'dg5', status: 'COMPLETE', result, lowConfidence: false, error: null });
  const app = renderRouter('./app', { initialUrl: '/diagnosis/dg5' });
  await app;

  // The stagger animates opacity only. Every step stays mounted throughout, so
  // it is readable by a screen reader from the first frame rather than popping
  // into the tree on a timer.
  expect(await screen.findByTestId('advice-summary')).toBeTruthy();
  expect(screen.getByTestId('advice-step-0')).toBeTruthy();
  expect(screen.getByText(result.advice.watchFor[0])).toBeTruthy();
});

it('reports a missing diagnosis instead of rendering an empty report', async () => {
  client.diagnoses.get.mockResolvedValue({
    ok: false,
    error: { code: 'NOT_FOUND', message: 'diagnosis dg9 not found' },
  });
  const app = renderRouter('./app', { initialUrl: '/diagnosis/dg9' });
  await app;

  expect(await screen.findByTestId('diagnosis-error')).toBeTruthy();
});
