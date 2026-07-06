import { Stack } from 'expo-router';
import { colors } from '../../../lib/theme';

export default function InboxLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Inbox' }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
    </Stack>
  );
}
