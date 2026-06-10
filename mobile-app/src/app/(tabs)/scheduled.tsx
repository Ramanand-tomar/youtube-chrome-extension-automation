import React, { useState, useCallback } from 'react';
import { StyleSheet, View, Pressable, ActivityIndicator, Alert, RefreshControl, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '@/hooks/use-theme';
import { getScheduledJobs, cancelScheduledJob, ScheduledJob } from '../../services/api';

export default function ScheduledScreen() {
  const theme = useTheme();
  const { userId } = useAuth();
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchJobs = useCallback(async (showIndicator = false) => {
    if (!userId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (showIndicator) setLoading(true);
    try {
      const data = await getScheduledJobs(userId);
      // Sort jobs by scheduledAt (earliest first or latest first? Typically earliest scheduled upload first)
      const sorted = data.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
      setJobs(sorted);
    } catch (err: any) {
      console.error('Failed to fetch scheduled uploads:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      fetchJobs(true);
    }, [fetchJobs])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchJobs(false);
  };

  const handleCancelJob = (id: string) => {
    Alert.alert(
      'Cancel Upload',
      'Are you sure you want to cancel this scheduled upload? The video will be removed from the queue.',
      [
        { text: 'Keep Scheduled', style: 'cancel' },
        {
          text: 'Cancel Upload',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelScheduledJob(id);
              Alert.alert('Success', 'Upload has been cancelled.');
              fetchJobs(false);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel the schedule.');
            }
          },
        },
      ]
    );
  };

  const getStatusStyles = (status: ScheduledJob['status']) => {
    switch (status) {
      case 'done':
        return {
          bg: 'rgba(16, 185, 129, 0.12)',
          text: theme.success,
          label: 'Completed',
          icon: 'checkmark-circle-outline' as const,
        };
      case 'error':
        return {
          bg: 'rgba(239, 68, 68, 0.12)',
          text: theme.error,
          label: 'Failed',
          icon: 'alert-circle-outline' as const,
        };
      case 'processing':
        return {
          bg: 'rgba(245, 158, 11, 0.12)',
          text: '#f59e0b',
          label: 'Uploading',
          icon: 'sync-outline' as const,
        };
      case 'pending':
      default:
        return {
          bg: 'rgba(56, 189, 248, 0.12)',
          text: theme.primary,
          label: 'Scheduled',
          icon: 'time-outline' as const,
        };
    }
  };

  const getPlatformStyles = (platform: ScheduledJob['platform']) => {
    switch (platform) {
      case 'instagram':
        return {
          icon: 'logo-instagram' as const,
          color: '#e1306c',
          label: 'Instagram Reels',
        };
      case 'youtube':
      default:
        return {
          icon: 'logo-youtube' as const,
          color: '#ef4444',
          label: 'YouTube Short',
        };
    }
  };

  const renderItem = ({ item }: { item: ScheduledJob }) => {
    const statusStyle = getStatusStyles(item.status);
    const platformStyle = getPlatformStyles(item.platform);
    const dateStr = new Date(item.scheduledAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <View style={[styles.jobCard, { backgroundColor: theme.backgroundElement }]}>
        {/* Top section: Platform and Status */}
        <View style={styles.cardHeader}>
          <View style={styles.platformBadge}>
            <Ionicons name={platformStyle.icon} size={16} color={platformStyle.color} />
            <ThemedText type="smallBold" style={{ color: theme.text }}>
              {platformStyle.label}
            </ThemedText>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            {item.status === 'processing' ? (
              <ActivityIndicator size="small" color={statusStyle.text} style={styles.badgeSpinner} />
            ) : (
              <Ionicons name={statusStyle.icon} size={14} color={statusStyle.text} />
            )}
            <ThemedText type="smallBold" style={{ color: statusStyle.text, fontSize: 11 }}>
              {statusStyle.label}
            </ThemedText>
          </View>
        </View>

        {/* Video info */}
        <View style={styles.videoInfo}>
          <ThemedText type="smallBold" style={styles.videoTitle} numberOfLines={1}>
            {item.title || 'Untitled Video'}
          </ThemedText>
          <ThemedText type="code" style={[styles.videoUrl, { color: theme.textSecondary }]} numberOfLines={1}>
            {item.videoUrl}
          </ThemedText>
          {item.description ? (
            <ThemedText style={[styles.videoDesc, { color: theme.textSecondary }]} numberOfLines={2}>
              {item.description}
            </ThemedText>
          ) : null}
        </View>

        {/* Footer: Date & Cancel action */}
        <View style={[styles.cardFooter, { borderTopColor: theme.backgroundSelected }]}>
          <View style={styles.timeWrapper}>
            <Ionicons name={item.status === 'done' ? 'calendar-outline' : 'alarm-outline'} size={14} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {item.status === 'done' ? `Published: ${dateStr}` : `Upload: ${dateStr}`}
            </ThemedText>
          </View>

          {item.status === 'pending' && (
            <Pressable
              style={({ pressed }) => [
                styles.cancelButton,
                { opacity: pressed ? 0.7 : 1 }
              ]}
              onPress={() => handleCancelJob(item.id)}
            >
              <Ionicons name="trash-outline" size={14} color={theme.error} />
              <ThemedText type="smallBold" style={{ color: theme.error, fontSize: 12 }}>
                Cancel
              </ThemedText>
            </Pressable>
          )}
        </View>

        {/* Error message detail if failed */}
        {item.status === 'error' && item.error && (
          <View style={[styles.errorCard, { backgroundColor: 'rgba(239,68,68,0.08)' }]}>
            <Ionicons name="warning-outline" size={14} color={theme.error} />
            <ThemedText style={[styles.errorText, { color: theme.error }]}>
              {item.error}
            </ThemedText>
          </View>
        )}
      </View>
    );
  };

  const renderEmptyState = () => {
    if (loading) return null;

    return (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIconContainer, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="calendar-clear-outline" size={48} color={theme.textSecondary} />
        </View>
        <ThemedText type="subtitle" style={styles.emptyTitle}>No Uploads Scheduled</ThemedText>
        <ThemedText style={[styles.emptyDesc, { color: theme.textSecondary }]}>
          You don't have any uploads in the queue. Go to the Upload screen to schedule your next YouTube Short or Instagram Reel.
        </ThemedText>
        <Pressable
          style={({ pressed }) => [
            styles.goToUploadButton,
            { backgroundColor: theme.primary, opacity: pressed ? 0.9 : 1 }
          ]}
          onPress={() => router.push('/(tabs)/upload')}
        >
          <Ionicons name="arrow-up-circle-outline" size={18} color="#fff" />
          <ThemedText style={styles.goToUploadButtonText}>Go to Upload</ThemedText>
        </Pressable>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* Header */}
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.headerTitle}>Scheduled Uploads</ThemedText>
          <ThemedText style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            Manage and monitor your queued automation uploads.
          </ThemedText>
        </View>

        {loading && jobs.length === 0 ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <ThemedText style={[styles.loadingLabel, { color: theme.textSecondary }]}>
              Fetching scheduled queue...
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={jobs}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={renderEmptyState}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={theme.primary}
                colors={[theme.primary]}
              />
            }
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 36,
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 64,
  },
  loadingLabel: {
    marginTop: Spacing.two,
    fontSize: 14,
  },
  listContent: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.five,
  },
  jobCard: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    paddingBottom: Spacing.two,
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  badgeSpinner: {
    transform: [{ scale: 0.7 }],
    marginRight: -2,
  },
  videoInfo: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    gap: 4,
  },
  videoTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  videoUrl: {
    fontSize: 11,
    opacity: 0.7,
  },
  videoDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderTopWidth: 1,
  },
  timeWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 6,
    borderRadius: 6,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.one + 2,
    padding: Spacing.two + 2,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    borderRadius: Spacing.two,
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.five + 16,
    paddingHorizontal: Spacing.four,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: Spacing.one,
  },
  emptyDesc: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing.four,
  },
  goToUploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 2,
    borderRadius: Spacing.two,
    gap: Spacing.two,
  },
  goToUploadButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
