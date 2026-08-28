import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Baloo2_600SemiBold, Baloo2_700Bold } from '@expo-google-fonts/baloo-2';
import { Mulish_400Regular, Mulish_600SemiBold, Mulish_700Bold } from '@expo-google-fonts/mulish';
import {
  BalooBhaijaan2_600SemiBold,
  BalooBhaijaan2_700Bold,
} from '@expo-google-fonts/baloo-bhaijaan-2';
import { setPersistentStorage } from '../src/api/storage.js';
import { initLocale } from '../src/i18n/index.js';
import { addWateringResponseListener, configureNotifications } from '../src/notifications/local.js';
import { useAuthStore } from '../src/store/authStore.js';
import { colors } from '../src/theme.js';

// On-device, the mock client persists through AsyncStorage (in tests/node it
// falls back to the in-memory storage registered in src/api/storage.js).
setPersistentStorage(AsyncStorage);

/**
 * One client for the whole app.
 *
 * Exported so tests can clear it between cases: it lives at module scope, so a
 * cached result from one test is still fresh (staleTime) when the next renders,
 * and the second test would silently assert against the first one's data.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 30 * 1000, refetchOnWindowFocus: false },
  },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Baloo2_600SemiBold,
    Baloo2_700Bold,
    Mulish_400Regular,
    Mulish_600SemiBold,
    Mulish_700Bold,
    BalooBhaijaan2_600SemiBold,
    BalooBhaijaan2_700Bold,
  });
  const user = useAuthStore((state) => state.user);
  const hydrated = useAuthStore((state) => state.hydrated);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    initLocale();
    useAuthStore.getState().hydrate();
  }, []);

  // Notification taps deep-link into the plant that needs water.
  useEffect(() => {
    configureNotifications();
    const subscription = addWateringResponseListener((plantId) => router.push(`/plant/${plantId}`));
    return () => subscription.remove();
  }, [router]);

  // Auth guard: once the session state is known, anonymous users only see /auth/*.
  useEffect(() => {
    if (!hydrated) return;
    if (!user && segments[0] !== 'auth') {
      router.replace('/auth/sign-in');
    }
  }, [hydrated, user, segments, router]);

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="camera" options={{ presentation: 'modal' }} />
      </Stack>
    </QueryClientProvider>
  );
}
