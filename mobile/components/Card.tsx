import { View, StyleSheet, type ViewProps } from 'react-native';
import { colors, radius, spacing } from '../lib/theme';

/** Shared elevated surface used for dashboard cards, list containers, form sections. */
export function Card({ style, ...rest }: ViewProps) {
  return <View style={[styles.card, style]} {...rest} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
