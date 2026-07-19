import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAppTheme } from '../hooks/use-theme';
import { scaleFontSizes, spacing, radius, type Palette } from '../lib/theme';
import type { MessageTemplate } from '../lib/types';

// Ported from src/components/inbox/template-picker.tsx (web). Header-
// text and URL-button variables aren't supported here — every template
// this account has used so far only needs body variables, and typing
// URL-suffix values on a phone keyboard is a rare enough case to leave
// web-only for now, same call as skipping the Flows builder on mobile.

export interface TemplateSendValues {
  body: string[];
}

interface TemplatePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (template: MessageTemplate, values: TemplateSendValues) => void;
}

export function extractVariableIndices(text: string): number[] {
  const matches = text.matchAll(/\{\{(\d+)\}\}/g);
  const set = new Set<number>();
  for (const m of matches) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

export function renderBodyPreview(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, raw) => {
    const idx = Number(raw) - 1;
    const value = params[idx];
    return value && value.trim().length > 0 ? value : `{{${raw}}}`;
  });
}

export function TemplatePicker({ visible, onClose, onSelect }: TemplatePickerProps) {
  const { colors, fontScale } = useAppTheme();
  const styles = useMemo(() => scaleFontSizes(makeStyles(colors), fontScale), [colors, fontScale]);

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MessageTemplate | null>(null);
  const [params, setParams] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .eq('status', 'APPROVED')
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error('Failed to fetch templates:', error.message);
        setTemplates([]);
      } else {
        setTemplates((data as MessageTemplate[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  function reset() {
    setSelected(null);
    setParams([]);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function pickTemplate(template: MessageTemplate) {
    const bodyVars = extractVariableIndices(template.body_text);
    if (bodyVars.length === 0) {
      onSelect(template, { body: [] });
      handleClose();
      return;
    }
    setSelected(template);
    setParams(new Array(bodyVars.length).fill(''));
  }

  const bodyVars = selected ? extractVariableIndices(selected.body_text) : [];
  const canConfirm = selected != null && bodyVars.every((_, i) => (params[i] ?? '').trim().length > 0);

  function confirm() {
    if (!selected) return;
    onSelect(selected, { body: params });
    handleClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          {selected ? (
            <Pressable onPress={reset} hitSlop={8} style={styles.headerButton}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
          ) : (
            <View style={styles.headerButton} />
          )}
          <Text style={styles.headerTitle} numberOfLines={1}>
            {selected ? selected.name : 'Send template'}
          </Text>
          <Pressable onPress={handleClose} hitSlop={8} style={styles.headerButton}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        {!selected ? (
          loading ? (
            <View style={styles.centerFill}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : templates.length === 0 ? (
            <View style={styles.centerFill}>
              <Text style={styles.emptyTitle}>No approved templates</Text>
              <Text style={styles.emptySubtitle}>
                Create and get one approved under Settings → Templates on the web app first.
              </Text>
            </View>
          ) : (
            <FlatList
              data={templates}
              keyExtractor={(t) => t.id}
              contentContainerStyle={{ padding: spacing.md }}
              renderItem={({ item }) => (
                <Pressable style={styles.templateCard} onPress={() => pickTemplate(item)}>
                  <View style={styles.templateCardHeader}>
                    <Text style={styles.templateName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryBadgeText}>{item.category}</Text>
                    </View>
                  </View>
                  <Text style={styles.templateBody} numberOfLines={2}>
                    {item.body_text}
                  </Text>
                </Pressable>
              )}
            />
          )
        ) : (
          <View style={{ flex: 1, padding: spacing.md }}>
            <View style={styles.previewCard}>
              <Text style={styles.previewLabel}>Preview</Text>
              <Text style={styles.previewBody}>{renderBodyPreview(selected.body_text, params)}</Text>
              {selected.footer_text ? <Text style={styles.previewFooter}>{selected.footer_text}</Text> : null}
            </View>
            {bodyVars.map((v, i) => (
              <View key={v} style={{ marginTop: spacing.md }}>
                <Text style={styles.fieldLabel}>{`Body {{${v}}}`}</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={params[i] ?? ''}
                  onChangeText={(text) => {
                    const next = [...params];
                    next[i] = text;
                    setParams(next);
                  }}
                  placeholder={`Value for {{${v}}}`}
                  placeholderTextColor={colors.textFaint}
                />
              </View>
            ))}
            <Pressable
              style={[styles.confirmButton, !canConfirm && styles.confirmButtonDisabled]}
              disabled={!canConfirm}
              onPress={confirm}
            >
              <Text style={styles.confirmButtonText}>Send template</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: colors.text },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.xs },
    emptyTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
    emptySubtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
    templateCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    templateCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
    templateName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
    categoryBadge: {
      backgroundColor: colors.primaryMuted,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
    },
    categoryBadgeText: { fontSize: 10, color: colors.primary, fontWeight: '600' },
    templateBody: { fontSize: 13, color: colors.textSecondary },
    previewCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    previewLabel: { fontSize: 11, color: colors.textFaint, marginBottom: spacing.xs },
    previewBody: { fontSize: 14, color: colors.text },
    previewFooter: { fontSize: 12, color: colors.textFaint, marginTop: spacing.xs, fontStyle: 'italic' },
    fieldLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs },
    fieldInput: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      fontSize: 14,
      color: colors.text,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    confirmButton: {
      marginTop: spacing.lg,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    confirmButtonDisabled: { opacity: 0.4 },
    confirmButtonText: { color: colors.white, fontSize: 15, fontWeight: '600' },
  });
