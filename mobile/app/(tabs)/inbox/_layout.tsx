import { Stack } from 'expo-router';

export default function InboxLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#f8fafc',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Inbox' }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
    </Stack>
  );
}
