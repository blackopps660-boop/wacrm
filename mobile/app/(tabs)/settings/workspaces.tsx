import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase, apiFetch } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/use-auth';
import { useAppTheme } from '../../../hooks/use-theme';
import { scaleFontSizes, type Palette } from '../../../lib/theme';
import { loadWorkspaces, switchWorkspace, type Workspace } from '../../../lib/workspaces/queries';
import { syncPushTokenWithBackend } from '../../../lib/push-notifications';

/**
 * Rename + lock for the CURRENT workspace — ported from
 * src/components/settings/workspace-general-settings.tsx (web). Goes
 * through the same PATCH /api/account route (admin+, and rejects a
 * rename with 423 while locked), so this can't drift from web's rules.
 */
function WorkspaceGeneralCard({
  colors,
  styles,
  canEditSettings,
  refreshProfile,
}: {
  colors: Palette;
  styles: ReturnType<typeof makeStyles>;
  canEditSettings: boolean;
  refreshProfile: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [togglingLock, setTogglingLock] = useState(false);
  const [originalName, setOriginalName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/account');
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          account: { name: string; is_locked: boolean };
        };
        if (!cancelled) {
          setName(data.account.name);
          setOriginalName(data.account.name);
          setIsLocked(data.account.is_locked);
          setLoaded(true);
        }
      } catch (err) {
        console.error('[WorkspaceGeneralCard] load error:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = loaded && name.trim() !== originalName;

  async function handleSaveName() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSavingName(true);
    setError(null);
    try {
      const res = await apiFetch('/api/account', {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to rename workspace');
        return;
      }
      setOriginalName(trimmed);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server');
    } finally {
      setSavingName(false);
    }
  }

  async function handleToggleLock() {
    const next = !isLocked;
    setTogglingLock(true);
    setError(null);
    try {
      const res = await apiFetch('/api/account', {
        method: 'PATCH',
        body: JSON.stringify({ is_locked: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to update lock');
        return;
      }
      setIsLocked(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server');
    } finally {
      setTogglingLock(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Workspace name</Text>
      {error && <Text style={styles.errorTextInline}>{error}</Text>}
      <TextInput
        style={[styles.input, (isLocked || !canEditSettings) && { opacity: 0.6 }]}
        value={name}
        onChangeText={setName}
        editable={!isLocked && canEditSettings && loaded}
        placeholder="Workspace name"
        placeholderTextColor={colors.textFaint}
      />
      {isLocked ? (
        <Text style={styles.lockHint}>Locked — unlock below before renaming.</Text>
      ) : !canEditSettings ? (
        <Text style={styles.lockHint}>Only account admins can rename the workspace.</Text>
      ) : null}

      {canEditSettings && (
        <Pressable
          style={[styles.smallButton, (!dirty || isLocked || savingName) && { opacity: 0.5 }]}
          onPress={handleSaveName}
          disabled={!dirty || isLocked || savingName}
        >
          {savingName ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.smallButtonText}>Save name</Text>
          )}
        </Pressable>
      )}

      <View style={styles.lockRow}>
        <Ionicons
          name={isLocked ? 'lock-closed' : 'lock-open'}
          size={16}
          color={isLocked ? colors.dangerMuted : colors.accent}
        />
        <Text style={styles.lockRowText}>
          {isLocked ? 'Locked' : 'Unlocked'} — protects only the name above; messaging keeps working either way.
        </Text>
      </View>
      {canEditSettings && (
        <Pressable
          style={[styles.outlineButton, togglingLock && { opacity: 0.6 }]}
          onPress={handleToggleLock}
          disabled={togglingLock || !loaded}
        >
          {togglingLock ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Text style={styles.outlineButtonText}>
              {isLocked ? 'Unlock workspace' : 'Lock workspace'}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

export default function WorkspacesScreen() {
  const router = useRouter();
  const { user, accountId, canEditSettings, refreshProfile } = useAuth();
  const { colors, fontScale } = useAppTheme();
  const styles = useMemo(() => scaleFontSizes(makeStyles(colors), fontScale), [colors, fontScale]);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const rows = await loadWorkspaces(supabase, user.id, accountId);
      setWorkspaces(rows);
    } catch (err) {
      console.error('[Workspaces] load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load workspaces');
    }
  }, [user, accountId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleSwitch(workspace: Workspace) {
    if (workspace.isCurrent || switchingId) return;
    setSwitchingId(workspace.id);
    setError(null);
    try {
      await switchWorkspace(supabase, workspace.id);
      // Mirrors the web app's full-page reload after a switch: refresh
      // the auth context's profile/account, then remount the tab stack
      // so Dashboard/Inbox/Contacts re-fetch under the new account_id.
      await refreshProfile();
      // Re-point this device's push token at the new account — otherwise
      // it stays registered under the workspace it was on at login time,
      // so pushes for the new workspace's messages never reach it.
      void syncPushTokenWithBackend();
      router.replace('/(tabs)');
    } catch (err) {
      console.error('[Workspaces] switch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to switch workspace');
      setSwitchingId(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      <FlatList
        data={workspaces}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            <WorkspaceGeneralCard
              colors={colors}
              styles={styles}
              canEditSettings={canEditSettings}
              refreshProfile={refreshProfile}
            />
            {workspaces.length > 1 && <Text style={styles.sectionLabel}>Switch workspace</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, item.isCurrent && styles.rowActive]}
            onPress={() => handleSwitch(item)}
            disabled={switchingId !== null}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.role}>{item.role}</Text>
            </View>
            {switchingId === item.id ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : item.isCurrent ? (
              <Text style={styles.checkmark}>✓</Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    errorBox: { backgroundColor: colors.dangerBg, margin: 16, borderRadius: 8, padding: 10 },
    errorText: { color: colors.dangerMuted, fontSize: 12 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowActive: { borderColor: colors.primary },
    name: { color: colors.text, fontSize: 15, fontWeight: '600' },
    role: { color: colors.textFaint, fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
    checkmark: { color: colors.accent, fontSize: 18, fontWeight: '700' },
    sectionLabel: {
      color: colors.textFaint,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: 4,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    cardTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
    errorTextInline: { color: colors.dangerMuted, fontSize: 12 },
    input: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
    },
    lockHint: { color: colors.textFaint, fontSize: 11 },
    smallButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 10,
      alignItems: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: 16,
    },
    smallButtonText: { color: colors.white, fontWeight: '600', fontSize: 13 },
    lockRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
    },
    lockRowText: { color: colors.textFaint, fontSize: 11, flex: 1 },
    outlineButton: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingVertical: 10,
      alignItems: 'center',
    },
    outlineButtonText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  });
}
