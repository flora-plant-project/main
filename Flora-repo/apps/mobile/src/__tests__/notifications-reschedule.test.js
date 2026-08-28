import * as Notifications from 'expo-notifications';
import { createMockClient } from '../api/mockClient.js';
import { createMemoryStorage } from '../api/storage.js';

/** Advance fake timers past the mock's simulated latency, then await. */
const settle = async (promise) => {
  await jest.advanceTimersByTimeAsync(1000);
  return promise;
};

describe('mockClient watering reminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    Notifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'stale-p1', content: { data: { plantId: 'p1' } } },
    ]);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('markWatered reschedules exactly one reminder at the new nextDueAt', async () => {
    const client = createMockClient({ storage: createMemoryStorage() });
    const res = await settle(client.plants.markWatered('p1'));
    expect(res.ok).toBe(true);
    await jest.advanceTimersByTimeAsync(10); // flush the fire-and-forget sync

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('stale-p1');
    const scheduled = Notifications.scheduleNotificationAsync.mock.calls.at(-1)[0];
    expect(scheduled.content.data.plantId).toBe('p1');
    expect(scheduled.content.title).toBe('Time to water Basil Buddy 🌿');
    expect(new Date(scheduled.trigger.date).toISOString()).toBe(res.data.nextDueAt);
  });

  it('setting a WATER schedule re-anchors the reminder from lastWateredAt', async () => {
    const client = createMockClient({ storage: createMemoryStorage() });
    const watered = await settle(client.plants.markWatered('p1'));
    await jest.advanceTimersByTimeAsync(10);
    jest.clearAllMocks();
    Notifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);

    const schedule = await settle(
      client.schedules.create('p1', { type: 'WATER', intervalDays: 5 }),
    );
    expect(schedule.ok).toBe(true);
    await jest.advanceTimersByTimeAsync(10);

    const scheduled = Notifications.scheduleNotificationAsync.mock.calls.at(-1)[0];
    expect(scheduled.content.data.plantId).toBe('p1');
    const expected = new Date(
      new Date(watered.data.wateredAt).getTime() + 5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(new Date(scheduled.trigger.date).toISOString()).toBe(expected);
  });
});
