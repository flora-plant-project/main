import * as Notifications from 'expo-notifications';
import { cancelForPlant, scheduleWatering } from '../notifications/local.js';

beforeEach(() => {
  jest.clearAllMocks();
  Notifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
  Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
});

it('schedules the watering payload with a date trigger, one per plant', async () => {
  Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
    { identifier: 'old-1', content: { data: { plantId: 'p1' } } },
  ]);
  const at = new Date('2026-08-09T07:00:00.000Z');
  await scheduleWatering({ plantId: 'p1', nickname: 'Basil Buddy', at });

  // the previous reminder for the plant is cancelled first
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old-1');
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
    content: {
      title: 'Time to water Basil Buddy 🌿',
      data: { plantId: 'p1', at: at.toISOString() },
    },
    trigger: { type: 'date', date: at },
  });
});

it('resolves null and schedules nothing when permission is denied', async () => {
  Notifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
  Notifications.requestPermissionsAsync.mockResolvedValue({ granted: false });
  await expect(
    scheduleWatering({ plantId: 'p1', nickname: 'Basil Buddy', at: new Date() }),
  ).resolves.toBeNull();
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it("cancelForPlant removes only that plant's reminders", async () => {
  Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
    { identifier: 'a', content: { data: { plantId: 'p1' } } },
    { identifier: 'b', content: { data: { plantId: 'p2' } } },
  ]);
  await cancelForPlant('p1');
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('a');
});
