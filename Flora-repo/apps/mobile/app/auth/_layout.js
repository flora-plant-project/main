import { Stack } from 'expo-router';
import { colors } from '../../src/theme.js';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
  );
}
