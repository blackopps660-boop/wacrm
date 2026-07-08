import { Component, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level safety net. Without this, any uncaught error thrown during
 * render anywhere in the tree takes down the whole app with no
 * recovery — on Android that shows as the OS's "App keeps stopping"
 * dialog, which is what's been happening. This won't fix the
 * underlying bug wherever it is, but it turns a hard crash into a
 * recoverable screen, and the console.error below at least surfaces
 * what actually broke instead of leaving a bare native crash with no
 * trace of the cause.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[ErrorBoundary] caught:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Pressable style={styles.button} onPress={() => this.setState({ error: null })}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111B21',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: { color: '#E9EDEF', fontSize: 18, fontWeight: '700' },
  message: { color: '#8696A0', fontSize: 13, textAlign: 'center' },
  button: {
    marginTop: 12,
    backgroundColor: '#00A884',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
});
