import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Colors, Spacing } from '@/constants/theme';

const YT_REGEX = /^(https?:\/\/)?(www\.)?youtube\.com\/(watch\?v=|shorts\/)/;
const IG_REGEX = /^(https?:\/\/)?(www\.)?instagram\.com\/(reels?|p)\//;

export type Platform = 'youtube' | 'instagram' | null;

function detectPlatform(url: string): Platform {
  if (YT_REGEX.test(url)) return 'youtube';
  if (IG_REGEX.test(url)) return 'instagram';
  return null;
}

interface UrlInputCardProps {
  youtubeUrl: string;
  instagramUrl: string;
  onYoutubeChange: (url: string) => void;
  onInstagramChange: (url: string) => void;
}

export default function UrlInputCard({
  youtubeUrl,
  instagramUrl,
  onYoutubeChange,
  onInstagramChange,
}: UrlInputCardProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [ytError, setYtError] = useState('');
  const [igError, setIgError] = useState('');

  const handleYoutubeChange = useCallback((val: string) => {
    // Filling YouTube clears Instagram
    onYoutubeChange(val);
    if (val) onInstagramChange('');
    if (val && !YT_REGEX.test(val)) {
      setYtError('Enter a valid YouTube or YouTube Shorts URL');
    } else {
      setYtError('');
    }
  }, [onYoutubeChange, onInstagramChange]);

  const handleInstagramChange = useCallback((val: string) => {
    // Filling Instagram clears YouTube
    onInstagramChange(val);
    if (val) onYoutubeChange('');
    if (val && !IG_REGEX.test(val)) {
      setIgError('Enter a valid Instagram Reel or post URL');
    } else {
      setIgError('');
    }
  }, [onInstagramChange, onYoutubeChange]);

  const pasteYoutube = useCallback(async () => {
    const text = await Clipboard.getStringAsync();
    if (text) handleYoutubeChange(text.trim());
  }, [handleYoutubeChange]);

  const pasteInstagram = useCallback(async () => {
    const text = await Clipboard.getStringAsync();
    if (text) handleInstagramChange(text.trim());
  }, [handleInstagramChange]);

  const ytPlatform = detectPlatform(youtubeUrl);
  const igPlatform = detectPlatform(instagramUrl);

  const inputBg = scheme === 'dark' ? 'rgba(30,41,59,0.6)' : '#f1f5f9';
  const borderColor = scheme === 'dark' ? 'rgba(100,116,139,0.3)' : '#e2e8f0';

  return (
    <View style={styles.container}>
      {/* YouTube Input */}
      <View style={styles.inputSection}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>🎬 YouTube / Shorts URL</Text>
          {ytPlatform === 'youtube' && (
            <View style={[styles.badge, { backgroundColor: 'rgba(239,68,68,0.2)' }]}>
              <Text style={[styles.badgeText, { color: '#f87171' }]}>▶ YouTube</Text>
            </View>
          )}
        </View>
        <View style={[styles.inputRow, { backgroundColor: inputBg, borderColor }]}>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="https://youtube.com/shorts/..."
            placeholderTextColor={colors.textSecondary}
            value={youtubeUrl}
            onChangeText={handleYoutubeChange}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Pressable style={styles.pasteBtn} onPress={pasteYoutube}>
            <Text style={[styles.pasteBtnText, { color: colors.primary }]}>📋 Paste</Text>
          </Pressable>
        </View>
        {ytError ? <Text style={styles.errorText}>{ytError}</Text> : null}
      </View>

      {/* Divider */}
      <View style={styles.divider}>
        <View style={[styles.dividerLine, { backgroundColor: borderColor }]} />
        <Text style={[styles.dividerText, { color: colors.textSecondary }]}>or</Text>
        <View style={[styles.dividerLine, { backgroundColor: borderColor }]} />
      </View>

      {/* Instagram Input */}
      <View style={styles.inputSection}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>📸 Instagram Reel URL</Text>
          {igPlatform === 'instagram' && (
            <View style={[styles.badge, { backgroundColor: 'rgba(168,85,247,0.2)' }]}>
              <Text style={[styles.badgeText, { color: '#c084fc' }]}>♦ Instagram</Text>
            </View>
          )}
        </View>
        <View style={[styles.inputRow, { backgroundColor: inputBg, borderColor }]}>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="https://instagram.com/reels/..."
            placeholderTextColor={colors.textSecondary}
            value={instagramUrl}
            onChangeText={handleInstagramChange}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Pressable style={styles.pasteBtn} onPress={pasteInstagram}>
            <Text style={[styles.pasteBtnText, { color: colors.primary }]}>📋 Paste</Text>
          </Pressable>
        </View>
        {igError ? <Text style={styles.errorText}>{igError}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  inputSection: {
    gap: Spacing.one,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.two + 2,
    fontSize: 14,
  },
  pasteBtn: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  pasteBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginVertical: Spacing.one,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
