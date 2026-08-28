import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let configured = false;

/**
 * One-time setup: foreground banner behaviour ("toast") and the Android channel.
 * Called from the root layout on app start.
 */
export function configureNotifications() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('watering', {
      name: 'Watering reminders',
      importance: Notifications.AndroidImportance?.DEFAULT ?? 3,
    });
  }
}

/**
 * Ask for permission the first time it is needed — right after the user sets a
 * watering schedule, so the system prompt lands in a meaningful context.
 * @returns {Promise<boolean>} whether notifications are allowed
 */
async function ensurePermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain === false) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return Boolean(requested.granted);
}

/**
 * Cancel every pending watering reminder for one plant.
 * @param {string} plantId
 */
export async function cancelForPlant(plantId) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((entry) => entry?.content?.data?.plantId === plantId)
      .map((entry) => Notifications.cancelScheduledNotificationAsync(entry.identifier)),
  );
}

/**
 * Schedule the plant's single watering reminder (cancels any previous one first).
 * Resolves null when permission is denied — never throws for that.
 * @param {{ plantId: string, nickname: string, at: Date|string }} input
 * @returns {Promise<string|null>} the notification identifier, or null
 */
export async function scheduleWatering({ plantId, nickname, at }) {
  const when = at instanceof Date ? at : new Date(at);
  const allowed = await ensurePermission();
  if (!allowed) return null;
  await cancelForPlant(plantId); // exactly one pending reminder per plant
  return Notifications.scheduleNotificationAsync({
    content: {
      title: `Time to water ${nickname} 🌿`,
      data: { plantId, at: when.toISOString() },
    },
    trigger: {
      type: 'date',
      date: when,
      ...(Platform.OS === 'android' && { channelId: 'watering' }),
    },
  });
}

/**
 * Route notification taps: extracts data.plantId and hands it to the callback.
 * @param {(plantId: string) => void} onPlant
 * @returns {{ remove: () => void }} subscription
 */
export function addWateringResponseListener(onPlant) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const plantId = response?.notification?.request?.content?.data?.plantId;
    if (plantId) onPlant(String(plantId));
  });
}
