import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Switch,
  Pressable,
  StyleSheet,
  useColorScheme,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors, Spacing } from '@/constants/theme';

export type Privacy = 'unlisted' | 'public';

export interface UploadFormData {
  title: string;
  description: string;
  privacy: Privacy;
  scheduleEnabled: boolean;
  scheduledAt: Date;
}

interface UploadFormProps {
  isYouTube: boolean;
  isDisabled: boolean;
  isUploading: boolean;
  onUpload: (data: UploadFormData) => void;
  onSchedule: (data: UploadFormData) => void;
}

export default function UploadForm({
  isYouTube,
  isDisabled,
  isUploading,
  onUpload,
  onSchedule,
}: UploadFormProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('unlisted');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<Date>(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);

  const inputBg = scheme === 'dark' ? 'rgba(30,41,59,0.6)' : '#f1f5f9';
  const borderColor = scheme === 'dark' ? 'rgba(100,116,139,0.3)' : '#e2e8f0';
  const primary = scheme === 'dark' ? colors.primary : '#6366f1';

  const formData: UploadFormData = { title, description, privacy, scheduleEnabled, scheduledAt };

  const handleAction = () => {
    if (scheduleEnabled) {
      onSchedule(formData);
    } else {
      onUpload(formData);
    }
  };

  return (
    <View style={styles.container}>
      {/* Title */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Title (optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: inputBg, borderColor, color: colors.text }]}
          placeholder="Auto-detected from video"
          placeholderTextColor={colors.textSecondary}
          value={title}
          onChangeText={setTitle}
        />
      </View>

      {/* Description */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.textarea, { backgroundColor: inputBg, borderColor, color: colors.text }]}
          placeholder="Video description…"
          placeholderTextColor={colors.textSecondary}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Privacy (YouTube only) */}
      {isYouTube && (
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Privacy</Text>
          <View style={styles.privacyRow}>
            {(['unlisted', 'public'] as Privacy[]).map((opt) => (
              <Pressable
                key={opt}
                style={[
                  styles.privacyBtn,
                  { borderColor },
                  privacy === opt && { backgroundColor: primary, borderColor: primary },
                ]}
                onPress={() => setPrivacy(opt)}
              >
                <Text style={[
                  styles.privacyBtnText,
                  { color: privacy === opt ? '#fff' : colors.textSecondary },
                ]}>
                  {opt === 'unlisted' ? '🔒 Unlisted' : '🌍 Public'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Schedule toggle */}
      <View style={styles.scheduleRow}>
        <View>
          <Text style={[styles.label, { color: colors.text }]}>Schedule for later</Text>
          <Text style={[styles.sublabel, { color: colors.textSecondary }]}>Upload at a specific time</Text>
        </View>
        <Switch
          value={scheduleEnabled}
          onValueChange={setScheduleEnabled}
          trackColor={{ true: primary, false: borderColor }}
          thumbColor="#fff"
        />
      </View>

      {/* DateTime Picker */}
      {scheduleEnabled && (
        <View style={styles.field}>
          {Platform.OS === 'android' && (
            <Pressable
              style={[styles.input, { backgroundColor: inputBg, borderColor, justifyContent: 'center' }]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ color: colors.text }}>
                📅 {scheduledAt.toLocaleString()}
              </Text>
            </Pressable>
          )}
          {(Platform.OS === 'ios' || Platform.OS === 'web' || showDatePicker) && (
            <DateTimePicker
              value={scheduledAt}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'compact' : 'default'}
              minimumDate={new Date()}
              onChange={(_: any, date?: Date) => {
                setShowDatePicker(false);
                if (date) setScheduledAt(date);
              }}
            />
          )}
        </View>
      )}

      {/* Action button */}
      <Pressable
        style={[
          styles.actionBtn,
          { backgroundColor: primary },
          (isDisabled || isUploading) && styles.actionBtnDisabled,
        ]}
        onPress={handleAction}
        disabled={isDisabled || isUploading}
      >
        <Text style={styles.actionBtnText}>
          {isUploading ? '⏳ Processing…' :
            scheduleEnabled ? '🕐 Schedule Upload' : '🚀 Upload Now'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  field: {
    gap: Spacing.one,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  sublabel: {
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  textarea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  privacyRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  privacyBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  privacyBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionBtn: {
    borderRadius: Spacing.two + 4,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.5,
  },
});
