import React, { useState, useCallback, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  useColorScheme,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/constants/theme';
import { getQuota } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useUpload } from '../../hooks/useUpload';
import AuthGateBanner from '../../components/AuthGateBanner';
import UrlInputCard from '../../components/UrlInputCard';
import UploadForm, { UploadFormData } from '../../components/UploadForm';
import ProgressCard from '../../components/ProgressCard';

const YT_REGEX = /^(https?:\/\/)?(www\.)?youtube\.com\/(watch\?v=|shorts\/)/;
const IG_REGEX = /^(https?:\/\/)?(www\.)?instagram\.com\/(reels?|p)\//;

export default function UploadScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const { userId, isConnected } = useAuth();
  const { progress, logs, status, videoUrl, errorMessage, isUploading, startYouTubeUpload, startInstagramUpload, startSchedule, resetUpload } = useUpload();

  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [quota, setQuota] = useState<{ used: number; limit: number; remaining: number } | null>(null);

  const activeUrl = youtubeUrl || instagramUrl;
  const isYoutube = YT_REGEX.test(youtubeUrl);
  const isInstagram = IG_REGEX.test(instagramUrl);
  const hasValidUrl = isYoutube || isInstagram;

  // Fetch quota on screen focus
  useFocusEffect(
    useCallback(() => {
      getQuota().then(setQuota).catch(() => {});
    }, [])
  );

  const handleUpload = useCallback((formData: UploadFormData) => {
    if (!userId || !hasValidUrl) return;

    if (isYoutube) {
      startYouTubeUpload({
        userId,
        videoUrl: youtubeUrl,
        title: formData.title || undefined,
        description: formData.description || undefined,
        privacy: formData.privacy,
      });
    } else if (isInstagram) {
      startInstagramUpload({
        userId,
        urls: [instagramUrl],
        globalTitle: formData.title || undefined,
        globalDescription: formData.description || undefined,
      });
    }
  }, [userId, hasValidUrl, isYoutube, isInstagram, youtubeUrl, instagramUrl, startYouTubeUpload, startInstagramUpload]);

  const handleSchedule = useCallback((formData: UploadFormData) => {
    if (!userId || !hasValidUrl) return;

    startSchedule({
      userId,
      videoUrl: activeUrl,
      title: formData.title || undefined,
      description: formData.description || undefined,
      privacy: formData.privacy,
      platform: isYoutube ? 'youtube' : 'instagram',
      scheduledAt: formData.scheduledAt.toISOString(),
    });
  }, [userId, hasValidUrl, activeUrl, isYoutube, startSchedule]);

  const handleReset = useCallback(() => {
    resetUpload();
    setYoutubeUrl('');
    setInstagramUrl('');
  }, [resetUpload]);

  const showProgress = status !== 'idle';
  const canUpload = isConnected && hasValidUrl;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Upload Now</Text>
          {quota && (
            <View style={[styles.quotaChip, { backgroundColor: colors.backgroundElement }]}>
              <Text style={[styles.quotaText, { color: colors.textSecondary }]}>
                {quota.remaining}/{quota.limit} remaining
              </Text>
            </View>
          )}
        </View>

        {/* Auth gate */}
        <AuthGateBanner />

        {/* URL inputs */}
        <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
          <UrlInputCard
            youtubeUrl={youtubeUrl}
            instagramUrl={instagramUrl}
            onYoutubeChange={setYoutubeUrl}
            onInstagramChange={setInstagramUrl}
          />
        </View>

        {/* Upload form */}
        {!showProgress && (
          <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
            <UploadForm
              isYouTube={isYoutube}
              isDisabled={!canUpload}
              isUploading={isUploading}
              onUpload={handleUpload}
              onSchedule={handleSchedule}
            />
          </View>
        )}

        {/* Progress card */}
        {showProgress && (
          <ProgressCard
            progress={progress}
            logs={logs}
            status={status}
            videoUrl={videoUrl}
            errorMessage={errorMessage}
            onReset={handleReset}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  quotaChip: {
    borderRadius: 20,
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.one,
  },
  quotaText: {
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
});
