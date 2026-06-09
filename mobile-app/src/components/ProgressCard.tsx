import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
  useColorScheme,
} from 'react-native';
import * as Linking from 'expo-linking';
import { Colors, Spacing } from '@/constants/theme';
import { UploadLog, UploadStatus } from '../hooks/useUpload';

interface ProgressCardProps {
  progress: number;
  logs: UploadLog[];
  status: UploadStatus;
  videoUrl: string | null;
  onReset: () => void;
}

export default function ProgressCard({ progress, logs, status, videoUrl, onReset }: ProgressCardProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const progressAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  // Animate progress bar
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logs.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [logs.length]);

  const barWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  const barColor = status === 'error' ? '#f87171' : status === 'complete' ? '#34d399' : colors.primary;

  const getStatusText = () => {
    switch (status) {
      case 'uploading': return `Processing… ${progress}%`;
      case 'complete': return '✅ Upload Complete!';
      case 'error': return '❌ Upload Failed';
      case 'scheduled': return '🕐 Upload Scheduled!';
      default: return '';
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: scheme === 'dark' ? 'rgba(30,41,59,0.6)' : '#f8fafc', borderColor: scheme === 'dark' ? 'rgba(100,116,139,0.25)' : '#e2e8f0' }]}>
      {/* Status label */}
      <Text style={[styles.statusText, { color: barColor }]}>{getStatusText()}</Text>

      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: scheme === 'dark' ? 'rgba(100,116,139,0.2)' : '#e2e8f0' }]}>
        <Animated.View style={[styles.progressFill, { width: barWidth, backgroundColor: barColor }]} />
      </View>

      {/* Log console */}
      <ScrollView
        ref={scrollRef}
        style={styles.logConsole}
        contentContainerStyle={styles.logContent}
        showsVerticalScrollIndicator={false}
      >
        {logs.map((log) => (
          <Text
            key={log.id}
            style={[
              styles.logLine,
              log.type === 'error' && styles.logError,
              log.type === 'success' && styles.logSuccess,
              log.type === 'info' && { color: colors.textSecondary },
            ]}
          >
            {log.type === 'error' ? '✗ ' : log.type === 'success' ? '✓ ' : '› '}{log.message}
          </Text>
        ))}
      </ScrollView>

      {/* Post-completion actions */}
      {(status === 'complete' || status === 'error' || status === 'scheduled') && (
        <View style={styles.actions}>
          {status === 'complete' && videoUrl && (
            <Pressable
              style={[styles.actionBtn, { backgroundColor: '#34d399' }]}
              onPress={() => Linking.openURL(videoUrl)}
            >
              <Text style={styles.actionBtnText}>▶ View on YouTube</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.actionBtn, { backgroundColor: scheme === 'dark' ? 'rgba(100,116,139,0.3)' : '#e2e8f0' }]}
            onPress={onReset}
          >
            <Text style={[styles.actionBtnText, { color: colors.text }]}>+ New Upload</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two + 2,
  },
  statusText: {
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  logConsole: {
    maxHeight: 180,
    borderRadius: Spacing.one,
  },
  logContent: {
    gap: 4,
    paddingBottom: 4,
  },
  logLine: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  logError: {
    color: '#f87171',
  },
  logSuccess: {
    color: '#34d399',
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  actionBtn: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
  },
  actionBtnText: {
    fontWeight: '700',
    fontSize: 14,
    color: '#fff',
  },
});
