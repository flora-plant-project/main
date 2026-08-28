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

const basil = {
  id: 'sp1',
  scientificName: 'Ocimum basilicum',
  commonNames: ['Basil', 'حبق'],
  care: { waterEveryDays: 2, sun: 'full sun', tempC: { min: 15, max: 30 } },
  zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.4, BEKAA: 0.8, SOUTH: 0.9 },
};

jest.mock('../api/index.js', () => ({
  client: {
    auth: { me: jest.fn(), login: jest.fn(), signup: jest.fn(), logout: jest.fn() },
    me: { update: jest.fn() },
    plants: { list: jest.fn(), create: jest.fn() },
    species: { list: jest.fn(), search: jest.fn(), get: jest.fn() },
    schedules: { create: jest.fn() },
    diagnoses: { create: jest.fn(), get: jest.fn() },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: demoUser, hydrated: true, busy: false });
  client.auth.me.mockResolvedValue({ ok: true, data: { user: demoUser } });
  client.plants.list.mockResolvedValue({ ok: true, data: [] });
  client.plants.create.mockResolvedValue({ ok: true, data: { id: 'p9', nickname: 'Basil' } });
  client.species.list.mockResolvedValue({ ok: true, data: [basil] });
  client.species.search.mockResolvedValue({ ok: true, data: [basil] });
  client.species.get.mockResolvedValue({ ok: true, data: basil });
  client.schedules.create.mockResolvedValue({ ok: true, data: { id: 'sch9' } });
});

it('debounces search to a single call, then confirms without a schedule when toggled off', async () => {
  await renderRouter('./app', { initialUrl: '/add-plant' });
  const input = await screen.findByTestId('species-search-input');
  // fireEvent is async in RNTL v14 — award each so act scopes never overlap
  await fireEvent.changeText(input, 'ba');
  await fireEvent.changeText(input, 'bas');
  await fireEvent.changeText(input, 'basil');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(350);
  });
  await waitFor(() => expect(client.species.search).toHaveBeenCalledTimes(1));
  expect(client.species.search).toHaveBeenCalledWith('basil');

  await fireEvent.press(await screen.findByTestId('species-row-sp1'));
  const nickname = await screen.findByTestId('confirm-nickname');
  expect(nickname.props.value).toBe('Basil');

  await fireEvent(screen.getByTestId('confirm-auto-schedule'), 'valueChange', false);
  await fireEvent.press(screen.getByTestId('confirm-save'));
  await waitFor(() =>
    expect(client.plants.create).toHaveBeenCalledWith({ nickname: 'Basil', speciesId: 'sp1' }),
  );
  expect(client.schedules.create).not.toHaveBeenCalled();
});
