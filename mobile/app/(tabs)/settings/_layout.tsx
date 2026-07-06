import { Stack } from 'expo-router';
import { colors } from '../../../lib/theme';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="workspaces" options={{ title: 'Switch Workspace' }} />
      <Stack.Screen name="profile" options={{ title: 'Your Profile' }} />
      <Stack.Screen name="team" options={{ title: 'Team Members' }} />
      <Stack.Screen name="whatsapp" options={{ title: 'WhatsApp Status' }} />
    </Stack>
  );
}
