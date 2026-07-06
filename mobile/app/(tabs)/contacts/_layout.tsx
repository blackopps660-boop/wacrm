import { Stack } from 'expo-router';
import { colors } from '../../../lib/theme';

export default function ContactsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Contacts' }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
      <Stack.Screen name="new" options={{ title: 'New Contact', presentation: 'modal' }} />
    </Stack>
  );
}
