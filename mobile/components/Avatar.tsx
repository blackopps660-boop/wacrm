import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colorForSeed } from '../lib/theme';

interface AvatarProps {
  label: string;
  size?: number;
  seed?: string;
  /** Small WhatsApp glyph badge in the corner, matching how multi-channel inbox tools (e.g. respond.io) mark which channel a contact came in on — every contact in this app is WhatsApp, but the visual cue is still expected. */
  showChannelBadge?: boolean;
}

/** Consistent initials avatar used across Inbox, Contacts, Settings. */
export function Avatar({ label, size = 44, seed, showChannelBadge = false }: AvatarProps) {
  const bg = colorForSeed(seed ?? label);
  const initial = (label || '?').charAt(0).toUpperCase();
  const badgeSize = Math.max(14, Math.round(size * 0.36));
  return (
    <View style={{ width: size, height: size }}>
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
      {showChannelBadge && (
        <View
          style={[
            styles.badge,
            { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2 },
          ]}
        >
          <Ionicons name="logo-whatsapp" size={badgeSize * 0.72} color="#fff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '700' },
  badge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    backgroundColor: '#25D366',
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
