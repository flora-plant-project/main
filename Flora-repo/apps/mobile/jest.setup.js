jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Report reduced motion by default, which makes entrance animations resolve to
// their final state instantly. Waiting out real animation timers turned one
// suite from 5s into 18s and buys nothing — the animations are decoration.
// A test that wants the animated path overrides this itself.
// Assigned rather than jest.spyOn'd: restoreMocks would undo a spy after the
// first test in every file.
require('react-native').AccessibilityInfo.isReduceMotionEnabled = () => Promise.resolve(true);

// Fonts resolve instantly in tests so the root layout renders synchronously.
jest.mock('expo-font', () => {
  const actual = jest.requireActual('expo-font');
  return {
    ...actual,
    useFonts: () => [true, null],
    isLoaded: () => true,
    loadAsync: jest.fn(async () => {}),
  };
});

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', textDirection: 'ltr' }],
}));

// expo-image is a native module; render a plain host element in tests.
jest.mock('expo-image', () => {
  const React = jest.requireActual('react');
  return { Image: (props) => React.createElement('ExpoImage', props) };
});

// expo-image-picker is native; tests override the launch mocks per scenario.
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

// expo-notifications is native; tests assert against these mocks.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'notif-1'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { DEFAULT: 3 },
}));

// expo-camera is native; render a plain host element with granted permissions.
jest.mock('expo-camera', () => {
  const React = jest.requireActual('react');
  return {
    CameraView: React.forwardRef((props, ref) =>
      React.createElement('CameraView', { ...props, ref }),
    ),
    useCameraPermissions: () => [{ granted: true }, jest.fn(async () => ({ granted: true }))],
  };
});
