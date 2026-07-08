import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useAppTheme } from '../hooks/use-theme';
import { spacing } from '../lib/theme';
import { resolveAuthedSource, type AuthedSource } from '../lib/media';

const BAR_COUNT = 27;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * A stable, WhatsApp-style bar pattern per message — Meta's inbound
 * webhook payload doesn't include per-sample amplitude data (and we
 * don't persist it for our own recordings either), so this isn't the
 * literal loudness envelope of the recording. It's a deterministic
 * pseudo-random pattern seeded by the message's own URL, so it looks
 * like a real waveform and — crucially — renders identically every
 * time this exact message is displayed, instead of a flat progress
 * line or random jitter on every re-render.
 */
function seededBars(seed: string, count: number): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  let x = Math.abs(hash) || 1;
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    bars.push(0.28 + ((x % 1000) / 1000) * 0.72);
  }
  return bars;
}

function Waveform({
  seed,
  progress,
  activeColor,
  mutedColor,
}: {
  seed: string;
  progress: number;
  activeColor: string;
  mutedColor: string;
}) {
  const bars = useMemo(() => seededBars(seed, BAR_COUNT), [seed]);
  const activeCount = Math.round(progress * BAR_COUNT);
  return (
    <View style={styles.waveformRow}>
      {bars.map((h, i) => (
        <View
          key={i}
          style={[
            styles.waveformBar,
            { height: `${h * 100}%`, backgroundColor: i < activeCount ? activeColor : mutedColor },
          ]}
        />
      ))}
    </View>
  );
}

/** Voice-note style player for `content_type: 'audio'` messages, matching the web app's <audio> playback but as a WhatsApp-style bubble control. */
export function AudioMessage({ url, tint }: { url: string; tint: 'agent' | 'customer' }) {
  // Inbound audio is served from an auth-gated proxy route
  // (`/api/whatsapp/media/[mediaId]`) — the web app gets that for free
  // via cookies, but this native player does a raw HTTP GET with no
  // cookie jar, so without an explicit Bearer header it 401s silently
  // and just never loads (the bubble renders but never plays).
  const [source, setSource] = useState<AuthedSource | null>(null);
  useEffect(() => {
    let cancelled = false;
    resolveAuthedSource(url).then((resolved) => {
      if (!cancelled) setSource(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const { colors } = useAppTheme();

  // Release the player when this bubble unmounts (e.g. scrolled far
  // enough out of the virtualized list) so playback doesn't keep
  // running in the background.
  useEffect(() => {
    return () => {
      player.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    if (status.playing) {
      player.pause();
    } else {
      if (status.didJustFinish || status.currentTime >= status.duration) {
        player.seekTo(0);
      }
      player.play();
    }
  }

  const isReady = !!source && status.isLoaded;
  const progress = status.duration > 0 ? status.currentTime / status.duration : 0;
  const iconColor = tint === 'agent' ? colors.white : colors.text;
  const mutedBarColor = tint === 'agent' ? 'rgba(255,255,255,0.35)' : colors.borderStrong;
  const activeBarColor = tint === 'agent' ? colors.white : colors.accent;

  return (
    <View style={styles.row}>
      <Pressable onPress={toggle} style={styles.playButton} hitSlop={8} disabled={!isReady}>
        {isReady ? (
          <Ionicons name={status.playing ? 'pause' : 'play'} size={18} color={iconColor} />
        ) : (
          <ActivityIndicator size="small" color={iconColor} />
        )}
      </Pressable>
      <View style={styles.trackWrap}>
        <Waveform seed={url} progress={progress} activeColor={activeBarColor} mutedColor={mutedBarColor} />
        {isReady && (
          <Text style={[styles.time, { color: iconColor }]}>
            {formatTime(status.playing || status.currentTime > 0 ? status.currentTime : status.duration)}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 190 },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  trackWrap: { flex: 1, gap: 3 },
  waveformRow: { flexDirection: 'row', alignItems: 'flex-end', height: 22, gap: 2 },
  waveformBar: { flex: 1, minWidth: 2, borderRadius: 1 },
  time: { fontSize: 10, opacity: 0.8 },
});
