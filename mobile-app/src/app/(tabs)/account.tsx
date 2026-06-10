import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, View, Pressable, ActivityIndicator,
  Alert, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '@/hooks/use-theme';
import {
  getYouTubeCookiesStatus,
  uploadYouTubeCookies,
  deleteYouTubeCookies,
} from '../../services/api';

export default function AccountScreen() {
  const theme = useTheme();
  const { userId, isConnected, email, isChecking, connect, disconnect, refreshStatus } = useAuth();

  // ── YouTube Cookies state ──
  const [cookiesStatus, setCookiesStatus] = useState<boolean | null>(null);
  const [cookiesChecking, setCookiesChecking] = useState(false);
  const [cookiesText, setCookiesText] = useState('');
  const [cookiesUploading, setCookiesUploading] = useState(false);
  const [showCookieInput, setShowCookieInput] = useState(false);

  const fetchCookiesStatus = useCallback(async () => {
    try {
      setCookiesChecking(true);
      const { hasCookies } = await getYouTubeCookiesStatus();
      setCookiesStatus(hasCookies);
    } catch {
      setCookiesStatus(false);
    } finally {
      setCookiesChecking(false);
    }
  }, []);

  useEffect(() => {
    fetchCookiesStatus();
  }, [fetchCookiesStatus]);

  const handleCopyId = async () => {
    if (userId) {
      await Clipboard.setStringAsync(userId);
      Alert.alert(
        'ID Copied',
        'Device ID copied to clipboard! Use this in your Chrome Extension to sync settings.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleUploadCookies = async () => {
    const text = cookiesText.trim();
    if (!text) {
      Alert.alert('Empty Input', 'Please paste your YouTube cookies.txt content first.');
      return;
    }
    setCookiesUploading(true);
    try {
      const result = await uploadYouTubeCookies(text);
      Alert.alert('Cookies Saved ✅', result.message);
      setCookiesText('');
      setShowCookieInput(false);
      await fetchCookiesStatus();
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Could not upload cookies.');
    } finally {
      setCookiesUploading(false);
    }
  };

  const handleDeleteCookies = () => {
    Alert.alert(
      'Remove Cookies',
      'Remove the saved YouTube cookies? Downloads may start failing again without them.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteYouTubeCookies();
              setCookiesStatus(false);
              Alert.alert('Removed', 'YouTube cookies deleted from the server.');
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Section */}
          <View style={styles.header}>
            <ThemedText type="subtitle" style={styles.headerTitle}>Account Settings</ThemedText>
            <ThemedText style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              Manage your Google / YouTube login settings.
            </ThemedText>
          </View>

          {/* ── OAuth Status Card ──────────────────────────────────────── */}
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            {isChecking ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.primary} />
                <ThemedText style={[styles.loadingText, { color: theme.textSecondary }]}>
                  Checking account status...
                </ThemedText>
              </View>
            ) : isConnected ? (
              <View style={styles.connectedContainer}>
                <View style={styles.statusRow}>
                  <View style={[styles.statusIndicator, { backgroundColor: theme.success }]} />
                  <ThemedText type="smallBold" style={{ color: theme.success }}>
                    YouTube Connected
                  </ThemedText>
                </View>

                <ThemedText type="subtitle" style={styles.channelTitle}>Active Channel</ThemedText>

                {email && (
                  <View style={[styles.emailBadge, { backgroundColor: theme.backgroundSelected }]}>
                    <Ionicons name="mail-outline" size={16} color={theme.primary} />
                    <ThemedText type="code" style={[styles.emailText, { color: theme.text }]}>
                      {email}
                    </ThemedText>
                  </View>
                )}

                <ThemedText style={[styles.infoText, { color: theme.textSecondary }]}>
                  Your YouTube channel is authenticated. You can upload videos directly or schedule uploads from the Upload screen.
                </ThemedText>

                <View style={styles.buttonRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionButton,
                      styles.refreshButton,
                      { borderColor: theme.textSecondary, opacity: pressed ? 0.7 : 1 },
                    ]}
                    onPress={refreshStatus}
                  >
                    <Ionicons name="refresh-outline" size={18} color={theme.text} />
                    <ThemedText style={[styles.buttonText, { color: theme.text }]}>Refresh</ThemedText>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.actionButton,
                      { backgroundColor: theme.error, opacity: pressed ? 0.8 : 1 },
                    ]}
                    onPress={disconnect}
                  >
                    <Ionicons name="log-out-outline" size={18} color="#fff" />
                    <ThemedText style={[styles.buttonText, { color: '#fff' }]}>Disconnect</ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.disconnectedContainer}>
                <View style={styles.statusRow}>
                  <View style={[styles.statusIndicator, { backgroundColor: theme.error }]} />
                  <ThemedText type="smallBold" style={{ color: theme.error }}>
                    Not Connected
                  </ThemedText>
                </View>

                <ThemedText type="subtitle" style={styles.channelTitle}>Link YouTube Channel</ThemedText>

                <ThemedText style={[styles.infoText, { color: theme.textSecondary }]}>
                  Connect your Google account to authorize automated video uploads to YouTube.
                </ThemedText>

                <View style={styles.stepsContainer}>
                  {['Tap "Connect Account" below to launch authentication',
                    'Sign in with Google and approve YouTube access',
                    'Return to the app to complete connection status',
                  ].map((text, i) => (
                    <View key={i} style={styles.stepItem}>
                      <View style={[styles.stepNumber, { backgroundColor: theme.backgroundSelected }]}>
                        <ThemedText type="smallBold" style={{ color: theme.primary }}>{i + 1}</ThemedText>
                      </View>
                      <ThemedText style={[styles.stepText, { color: theme.textSecondary }]}>{text}</ThemedText>
                    </View>
                  ))}
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.connectButton,
                    { backgroundColor: theme.primary, opacity: pressed ? 0.9 : 1 },
                  ]}
                  onPress={connect}
                >
                  <Ionicons name="logo-youtube" size={20} color="#fff" />
                  <ThemedText style={styles.connectButtonText}>Connect Account</ThemedText>
                </Pressable>
              </View>
            )}
          </View>

          {/* ── YouTube Cookies Card ───────────────────────────────────── */}
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            {/* Header row */}
            <View style={styles.cookiesHeader}>
              <View style={styles.syncHeader}>
                <Ionicons name="shield-checkmark-outline" size={22} color="#f59e0b" />
                <ThemedText type="smallBold" style={[styles.syncTitle, { color: theme.text }]}>
                  YouTube Download Cookies
                </ThemedText>
              </View>

              {/* Status badge */}
              {cookiesChecking ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : cookiesStatus === true ? (
                <View style={[styles.cookiesBadge, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                  <Ionicons name="checkmark-circle" size={13} color={theme.success} />
                  <ThemedText style={[styles.badgeText, { color: theme.success }]}>Active</ThemedText>
                </View>
              ) : (
                <View style={[styles.cookiesBadge, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                  <Ionicons name="warning-outline" size={13} color="#f59e0b" />
                  <ThemedText style={[styles.badgeText, { color: '#f59e0b' }]}>Not Set</ThemedText>
                </View>
              )}
            </View>

            {/* Explanation */}
            <ThemedText style={[styles.syncDesc, { color: theme.textSecondary }]}>
              YouTube may block server-side downloads with a "Sign in to confirm you're not a bot" error.
              Uploading a{' '}
              <ThemedText type="smallBold" style={{ color: theme.text }}>cookies.txt</ThemedText>
              {' '}file (Netscape format) from your YouTube-logged-in browser fixes this instantly.
            </ThemedText>

            {/* How-to steps */}
            <View style={[styles.howToBox, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="smallBold" style={[styles.howToTitle, { color: theme.text }]}>
                How to export cookies:
              </ThemedText>
              {[
                'Install "Get cookies.txt LOCALLY" Chrome extension',
                'Open youtube.com while signed into your account',
                'Click the extension → Export cookies → Save file',
                'Open the saved file, copy ALL its contents',
                'Paste below and tap "Save Cookies"',
              ].map((step, i) => (
                <View key={i} style={styles.howToRow}>
                  <ThemedText style={{ color: theme.primary, fontSize: 12, fontWeight: '700', minWidth: 18 }}>
                    {i + 1}.
                  </ThemedText>
                  <ThemedText style={[styles.howToText, { color: theme.textSecondary }]}>{step}</ThemedText>
                </View>
              ))}
            </View>

            {/* Expand/collapse input */}
            {!showCookieInput ? (
              <View style={styles.cookiesActionRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.cookiesBtn,
                    { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1, flex: 1 },
                  ]}
                  onPress={() => setShowCookieInput(true)}
                >
                  <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                  <ThemedText style={[styles.buttonText, { color: '#fff' }]}>
                    {cookiesStatus ? 'Update Cookies' : 'Upload Cookies'}
                  </ThemedText>
                </Pressable>

                {cookiesStatus && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.cookiesBtn,
                      styles.deleteCookiesBtn,
                      { borderColor: theme.error, opacity: pressed ? 0.75 : 1 },
                    ]}
                    onPress={handleDeleteCookies}
                  >
                    <Ionicons name="trash-outline" size={16} color={theme.error} />
                    <ThemedText style={[styles.buttonText, { color: theme.error }]}>Remove</ThemedText>
                  </Pressable>
                )}
              </View>
            ) : (
              <View style={{ gap: Spacing.two }}>
                <ThemedText type="smallBold" style={{ color: theme.text }}>
                  Paste cookies.txt content:
                </ThemedText>
                <TextInput
                  style={[
                    styles.cookiesInput,
                    {
                      backgroundColor: theme.backgroundSelected,
                      color: theme.text,
                      borderColor: 'rgba(255,255,255,0.1)',
                    },
                  ]}
                  multiline
                  numberOfLines={6}
                  placeholder="# Netscape HTTP Cookie File&#10;.youtube.com TRUE / FALSE ..."
                  placeholderTextColor={theme.textSecondary}
                  value={cookiesText}
                  onChangeText={setCookiesText}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <View style={styles.cookiesActionRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.cookiesBtn,
                      { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1 },
                    ]}
                    onPress={() => { setShowCookieInput(false); setCookiesText(''); }}
                  >
                    <ThemedText style={[styles.buttonText, { color: theme.textSecondary }]}>Cancel</ThemedText>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.cookiesBtn,
                      { backgroundColor: theme.primary, flex: 1, opacity: (pressed || cookiesUploading) ? 0.8 : 1 },
                    ]}
                    onPress={handleUploadCookies}
                    disabled={cookiesUploading}
                  >
                    {cookiesUploading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="save-outline" size={16} color="#fff" />
                    )}
                    <ThemedText style={[styles.buttonText, { color: '#fff' }]}>
                      {cookiesUploading ? 'Saving...' : 'Save Cookies'}
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          {/* ── Chrome Extension Sync Card ─────────────────────────────── */}
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.syncHeader}>
              <Ionicons name="sync-circle-outline" size={24} color={theme.primary} />
              <ThemedText type="smallBold" style={styles.syncTitle}>Chrome Extension Sync</ThemedText>
            </View>

            <ThemedText style={[styles.syncDesc, { color: theme.textSecondary }]}>
              To sync scheduled queues and upload history between this app and your browser extension, copy the Device ID below and enter it in the extension settings page.
            </ThemedText>

            <View style={[styles.idContainer, { backgroundColor: theme.backgroundSelected }]}>
              <View style={styles.idTextWrapper}>
                <ThemedText type="code" style={styles.idText} numberOfLines={1} ellipsizeMode="middle">
                  {userId || 'Generating Device ID...'}
                </ThemedText>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.copyButton,
                  { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={handleCopyId}
                disabled={!userId}
              >
                <Ionicons name="copy-outline" size={16} color={theme.text} />
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.five,
  },
  header: { marginBottom: Spacing.one },
  headerTitle: { fontSize: 28, fontWeight: '800', lineHeight: 36 },
  headerSubtitle: { fontSize: 14, marginTop: 4 },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.five,
  },
  loadingText: { marginTop: Spacing.two, fontSize: 14 },
  connectedContainer: { gap: Spacing.two },
  disconnectedContainer: { gap: Spacing.two },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  statusIndicator: { width: 8, height: 8, borderRadius: 4 },
  channelTitle: { fontSize: 20, fontWeight: '700' },
  emailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  emailText: { fontSize: 14, fontWeight: '600' },
  infoText: { fontSize: 13, lineHeight: 20, marginTop: Spacing.one },
  buttonRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two + 2,
    borderRadius: Spacing.two,
    gap: Spacing.two,
  },
  refreshButton: { borderWidth: 1 },
  buttonText: { fontSize: 14, fontWeight: '700' },
  stepsContainer: { gap: Spacing.two, marginVertical: Spacing.one },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { flex: 1, fontSize: 13, lineHeight: 18 },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two + 2,
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  connectButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Cookies card
  cookiesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cookiesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  howToBox: {
    borderRadius: Spacing.two,
    padding: Spacing.two + 2,
    gap: Spacing.one + 2,
  },
  howToTitle: { fontSize: 12, marginBottom: 2 },
  howToRow: { flexDirection: 'row', gap: 6 },
  howToText: { flex: 1, fontSize: 12, lineHeight: 17 },
  cookiesActionRow: { flexDirection: 'row', gap: Spacing.two },
  cookiesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.two + 4,
    borderRadius: Spacing.two,
    gap: Spacing.one + 2,
  },
  deleteCookiesBtn: { borderWidth: 1 },
  cookiesInput: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two + 2,
    fontSize: 11,
    fontFamily: 'monospace',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  // Sync card
  syncHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  syncTitle: { fontSize: 16, fontWeight: '700' },
  syncDesc: { fontSize: 13, lineHeight: 18 },
  idContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    gap: Spacing.two,
  },
  idTextWrapper: { flex: 1 },
  idText: { fontSize: 13, fontWeight: '500' },
  copyButton: {
    padding: Spacing.two,
    borderRadius: Spacing.one + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
