import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Share,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/use-auth';
import { useAppTheme } from '../../../hooks/use-theme';
import { scaleFontSizes, type Palette } from '../../../lib/theme';
import type { AccountRole } from '../../../lib/roles';

// Uses the existing /api/account/members (+ /[userId]) routes, now
// Bearer-auth capable — same SECURITY DEFINER RPCs
// (set_member_role / remove_account_member) the web Members tab
// uses, so no new backend logic, just a new client of it.

interface AccountMember {
  user_id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  role: AccountRole;
  joined_at: string;
}

const ROLES: AccountRole[] = ['admin', 'agent', 'viewer'];
const INVITE_ROLES: Exclude<AccountRole, 'owner'>[] = ['admin', 'agent', 'viewer'];
const EXPIRY_OPTIONS = [
  { value: 1, label: '1 day' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
];

interface CreatedInvite {
  url: string;
  role: AccountRole;
  expiresInDays: number;
}

/**
 * Invite creation — ported from
 * src/components/settings/invite-member-dialog.tsx (web). Same
 * self-hosted link-token model (POST /api/account/invitations,
 * plaintext URL returned once), but mobile has no mailto/wa.me split
 * the way a browser does — RN's built-in Share sheet already covers
 * WhatsApp, email, Messages, and "Copy" in one native picker, so
 * that's the primary path here instead of two separate buttons. A
 * direct WhatsApp deep link stays alongside it for one-tap convenience.
 */
function InviteMemberModal({
  visible,
  onClose,
  onCreated,
  colors,
  styles,
  accountName,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  colors: Palette;
  styles: ReturnType<typeof makeStyles>;
  accountName: string;
}) {
  const [role, setRole] = useState<Exclude<AccountRole, 'owner'>>('agent');
  const [expiry, setExpiry] = useState(7);
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedInvite | null>(null);

  function reset() {
    setRole('agent');
    setExpiry(7);
    setLabel('');
    setError(null);
    setResult(null);
    setSubmitting(false);
  }

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/account/invitations', {
        method: 'POST',
        body: JSON.stringify({ role, expiresInDays: expiry, label: label.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to create invitation');
      setResult({ url: body.url, role, expiresInDays: body.expiresInDays });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invitation');
    } finally {
      setSubmitting(false);
    }
  }

  function inviteMessage(url: string) {
    return `Join ${accountName} on wacrm using this link (valid for ${result?.expiresInDays} days): ${url}`;
  }

  async function handleShare() {
    if (!result) return;
    try {
      await Share.share({ message: inviteMessage(result.url) });
    } catch (err) {
      console.error('[InviteMemberModal] share error:', err);
    }
  }

  function handleShareWhatsApp() {
    if (!result) return;
    const url = `https://wa.me/?text=${encodeURIComponent(inviteMessage(result.url))}`;
    Linking.openURL(url).catch((err) => console.error('[InviteMemberModal] whatsapp open error:', err));
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => {
        reset();
        onClose();
      }}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          {result ? (
            <>
              <Text style={styles.modalTitle}>Invite created</Text>
              <Text style={styles.modalSubtitle}>
                Valid for {result.expiresInDays} day{result.expiresInDays === 1 ? '' : 's'} — joins as{' '}
                {result.role}.
              </Text>
              <Text style={styles.inviteUrl} selectable>
                {result.url}
              </Text>
              <Text style={styles.lockHint}>
                Long-press the link above to copy it, or share it directly below.
              </Text>
              <Pressable style={styles.smallButton} onPress={handleShareWhatsApp}>
                <Ionicons name="logo-whatsapp" size={16} color={colors.white} />
                <Text style={styles.smallButtonText}>Send via WhatsApp</Text>
              </Pressable>
              <Pressable style={styles.outlineButton} onPress={handleShare}>
                <Ionicons name="share-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.outlineButtonText}>Share…</Text>
              </Pressable>
              <Pressable
                style={styles.doneButton}
                onPress={() => {
                  reset();
                  onClose();
                }}
              >
                <Text style={styles.doneButtonText}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.modalTitle}>Invite a teammate</Text>
              <Text style={styles.modalSubtitle}>
                Generates a one-time link — share it via WhatsApp, email, or any app.
              </Text>
              {error && <Text style={styles.errorTextInline}>{error}</Text>}

              <Text style={styles.fieldLabel}>Role</Text>
              <View style={styles.roleOptions}>
                {INVITE_ROLES.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setRole(r)}
                    style={[styles.roleOption, r === role && styles.roleOptionActive]}
                  >
                    <Text style={styles.roleOptionText}>{r}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Link valid for</Text>
              <View style={styles.roleOptions}>
                {EXPIRY_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setExpiry(opt.value)}
                    style={[styles.roleOption, opt.value === expiry && styles.roleOptionActive]}
                  >
                    <Text style={styles.roleOptionText}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Label (optional)</Text>
              <TextInput
                style={styles.input}
                value={label}
                onChangeText={setLabel}
                placeholder="e.g. Sara — support team"
                placeholderTextColor={colors.textFaint}
                maxLength={80}
              />

              <View style={styles.modalActionsRow}>
                <Pressable
                  style={styles.outlineButtonFlex}
                  onPress={() => {
                    reset();
                    onClose();
                  }}
                >
                  <Text style={styles.outlineButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.smallButtonFlex, submitting && { opacity: 0.6 }]}
                  onPress={handleCreate}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <Text style={styles.smallButtonText}>Generate link</Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function TeamScreen() {
  const { user, account, canManageMembers } = useAuth();
  const { colors, fontScale } = useAppTheme();
  const styles = useMemo(() => scaleFontSizes(makeStyles(colors), fontScale), [colors, fontScale]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch('/api/account/members', { method: 'GET' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load members');
      setMembers(body.members ?? []);
    } catch (err) {
      console.error('[Team] load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load members');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleRoleChange(userId: string, role: AccountRole) {
    setBusyUserId(userId);
    setError(null);
    try {
      const res = await apiFetch(`/api/account/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to change role');
      setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role } : m)));
      setEditingUserId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change role');
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRemove(userId: string) {
    setBusyUserId(userId);
    setError(null);
    try {
      const res = await apiFetch(`/api/account/members/${userId}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to remove member');
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setBusyUserId(null);
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
        data={members}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListHeaderComponent={
          canManageMembers ? (
            <Pressable style={styles.inviteButton} onPress={() => setInviteOpen(true)}>
              <Ionicons name="person-add-outline" size={16} color={colors.white} />
              <Text style={styles.inviteButtonText}>Invite member</Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => {
          const isSelf = item.user_id === user?.id;
          const isOwner = item.role === 'owner';
          const canEdit = canManageMembers && !isSelf && !isOwner;
          const isBusy = busyUserId === item.user_id;
          const isEditing = editingUserId === item.user_id;

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.full_name || item.email || 'Unnamed'}</Text>
                  {item.email && <Text style={styles.email}>{item.email}</Text>}
                </View>
                {isBusy ? (
                  <ActivityIndicator color={colors.accent} size="small" />
                ) : (
                  <Pressable
                    disabled={!canEdit}
                    onPress={() => setEditingUserId(isEditing ? null : item.user_id)}
                    style={styles.roleBadge}
                  >
                    <Text style={styles.roleBadgeText}>{item.role}</Text>
                  </Pressable>
                )}
              </View>

              {isEditing && canEdit && (
                <View style={styles.roleOptions}>
                  {ROLES.map((r) => (
                    <Pressable
                      key={r}
                      onPress={() => handleRoleChange(item.user_id, r)}
                      style={[styles.roleOption, r === item.role && styles.roleOptionActive]}
                    >
                      <Text style={styles.roleOptionText}>{r}</Text>
                    </Pressable>
                  ))}
                  <Pressable onPress={() => handleRemove(item.user_id)} style={styles.removeButton}>
                    <Text style={styles.removeButtonText}>Remove from workspace</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
      />
      <InviteMemberModal
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onCreated={load}
        colors={colors}
        styles={styles}
        accountName={account?.name ?? 'our wacrm account'}
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
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { color: colors.text, fontSize: 15, fontWeight: '600' },
    email: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
    roleBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
      backgroundColor: colors.surfaceRaised,
    },
    roleBadgeText: { color: colors.accent, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
    roleOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    roleOption: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    roleOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    roleOptionText: { color: colors.textSecondary, fontSize: 12, textTransform: 'capitalize' },
    removeButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: colors.dangerBg,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
    },
    removeButtonText: { color: colors.dangerMuted, fontSize: 12 },
    inviteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 12,
      marginBottom: 4,
    },
    inviteButtonText: { color: colors.white, fontWeight: '600', fontSize: 14 },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 20,
      gap: 10,
    },
    modalTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
    modalSubtitle: { color: colors.textMuted, fontSize: 13 },
    errorTextInline: { color: colors.dangerMuted, fontSize: 12 },
    fieldLabel: { color: colors.textFaint, fontSize: 12, marginTop: 8 },
    input: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
    },
    inviteUrl: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: 8,
      padding: 12,
      color: colors.text,
      fontSize: 12,
      marginTop: 4,
    },
    lockHint: { color: colors.textFaint, fontSize: 11 },
    modalActionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    smallButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 12,
      marginTop: 8,
    },
    smallButtonFlex: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 12,
    },
    smallButtonText: { color: colors.white, fontWeight: '600', fontSize: 13 },
    outlineButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingVertical: 12,
    },
    outlineButtonFlex: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingVertical: 12,
    },
    outlineButtonText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
    doneButton: {
      alignItems: 'center',
      paddingVertical: 12,
      marginTop: 4,
    },
    doneButtonText: { color: colors.textFaint, fontWeight: '600', fontSize: 13 },
  });
}
