import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radii, typeScale } from '../../src/theme.js';

/** Raised 58px camera button with a 4px white ring (design 3c). */
function CameraButton() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <View style={styles.cameraSlot}>
      <Pressable
        testID="camera-tab-button"
        accessibilityRole="button"
        accessibilityLabel={t('tabs.camera')}
        onPress={() => router.push('/camera')}
        style={({ pressed }) => [styles.cameraButton, pressed && styles.cameraButtonPressed]}
      >
        <Ionicons name="camera-outline" size={25} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

/** Stroked 22px tab icon — icon and label share the tab's tint. */
const tabIcon = (name) =>
  function TabIcon({ color }) {
    return <Ionicons name={name} size={22} color={color} />;
  };

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.sage,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.garden'), tabBarIcon: tabIcon('leaf-outline') }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: t('tabs.explore'), tabBarIcon: tabIcon('search-outline') }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: '',
          tabBarButton: () => <CameraButton />,
        }}
      />
      <Tabs.Screen
        name="community"
        options={{ title: t('tabs.community'), tabBarIcon: tabIcon('people-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person-outline') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 78,
    paddingBottom: 22,
    paddingHorizontal: 12,
    paddingTop: 9,
  },
  tabLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.tab,
  },
  cameraSlot: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  cameraButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 4,
    elevation: 5,
    height: 58,
    justifyContent: 'center',
    marginTop: -22,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.34,
    shadowRadius: 18,
    width: 58,
  },
  cameraButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
});
