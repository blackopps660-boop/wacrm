import { View, Text, StyleSheet } from 'react-native';

// Placeholder — Dashboard analytics land in Phase 2 (ports the 5 query
// functions from src/lib/dashboard/queries.ts on the web app).
export default function DashboardScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>Analytics are coming in Phase 2.</Text>
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
