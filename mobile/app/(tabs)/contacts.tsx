import { View, Text, StyleSheet } from 'react-native';

// Placeholder — Contacts land in Phase 3.
export default function ContactsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Contacts</Text>
      <Text style={styles.subtitle}>Coming in Phase 3.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { color: '#f8fafc', fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#94a3b8', fontSize: 14, marginTop: 8 },
});
