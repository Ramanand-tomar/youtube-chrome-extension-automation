import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '../hooks/useAuth';

export default function AuthGateBanner() {
  const { isConnected } = useAuth();

  if (isConnected) return null;

  return (
    <Pressable
      style={styles.banner}
      onPress={() => router.push('/(tabs)/account')}
    >
      <Text style={styles.icon}>⚠️</Text>
      <View style={styles.textContainer}>
        <Text style={styles.title}>YouTube Account Not Connected</Text>
        <Text style={styles.subtitle}>Tap here to link your channel before uploading.</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#f59e0b',
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginVertical: Spacing.two,
  },
  icon: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#fbbf24',
    fontWeight: 'bold',
    fontSize: 14,
  },
  subtitle: {
    color: '#fbbf24',
    fontSize: 12,
    opacity: 0.85,
    marginTop: 2,
  },
});
