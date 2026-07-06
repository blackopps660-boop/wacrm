import { View, Text, StyleSheet } from 'react-native';
import { colorForSeed } from '../lib/theme';

interface AvatarProps {
  label: string;
  size?: number;
  seed?: string;
}

/** Consistent initials avatar used across Inbox, Contacts, Settings. */
export function Avatar({ label, size = 44, seed }: AvatarProps) {
  const bg = colorForSeed(seed ?? label);
  const initial = (label || '?').charAt(0).toUpperCase();
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${bg}26`,
        },
      ]}
    >
      <Text style={[styles.text, { color: bg, fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '700' },
});
