import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '../hooks/use-auth';
import { ThemeProvider, useAppTheme } from '../hooks/use-theme';

function RootNavigator() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === 'login';

    if (!user && !inAuthGroup) {
      router.replace('/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments, router]);

  // Explicit safety net for the Android hardware/nav-bar back button.
  // Expo Router's Stack/Tabs are supposed to pop their own history
  // automatically, but leaving it fully implicit meant any edge case
  // in how a screen got pushed (e.g. a route reached via `replace`
  // somewhere upstream, leaving no history entry) fell through to
  // Android's OS-level default — exiting the whole app — instead of
  // just doing nothing or surfacing the gap. This makes the intended
  // behavior explicit: pop one screen if there's anywhere to pop to,
  // only let the app exit when there genuinely isn't.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) {
        router.back();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [router]);

  // Tapping a push notification deep-links straight to the
  // conversation it's about — `data.conversationId` is set server-side
  // in src/lib/push/dispatch.ts. Two paths: the app was already
  // running (listener fires live) or was killed and got launched by
  // the tap (checked once via getLastNotificationResponse on mount).
  //
  // Push/local notifications aren't a web platform — several of these
  // APIs throw (not just no-op) when called there, which would crash
  // the whole app on this debugging-only target. Android/iOS are the
  // real targets (per the mobile plan), so just skip entirely on web.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    function openConversation(response: Notifications.NotificationResponse) {
      const conversationId = response.notification.request.content.data?.conversationId;
      if (typeof conversationId === 'string') {
        router.push(`/inbox/${conversationId}`);
      }
    }

    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) openConversation(lastResponse);

    const subscription = Notifications.addNotificationResponseReceivedListener(openConversation);
    return () => subscription.remove();
  }, [router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

function ThemedStatusBar() {
  const { resolvedScheme } = useAppTheme();
  return <StatusBar style={resolvedScheme === 'light' ? 'dark' : 'light'} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <ThemedStatusBar />
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
