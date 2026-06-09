import React, { createContext, useState, useEffect, ReactNode, useRef } from 'react';
import { Platform, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { getAuthUrl, getAuthStatus, logout } from '../services/api';

WebBrowser.maybeCompleteAuthSession();

// Secure Storage wrapper with Web fallback
async function saveSecureItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function getSecureItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  } else {
    return await SecureStore.getItemAsync(key);
  }
}

async function deleteSecureItem(key: string) {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface AuthContextType {
  userId: string | null;
  isConnected: boolean;
  email: string | null;
  isChecking: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [email, setEmail] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const pollInterval = useRef<any>(null);


  // Initialize userId
  useEffect(() => {
    async function initUserId() {
      try {
        let storedId = await getSecureItem('userId');
        if (!storedId) {
          storedId = generateUUID();
          await saveSecureItem('userId', storedId);
        }
        setUserId(storedId);
        // Initial connection status check
        await checkStatus(storedId);
      } catch (err) {
        console.error('Failed to initialize user identity:', err);
      } finally {
        setIsChecking(false);
      }
    }
    initUserId();

    return () => {
      stopPolling();
    };
  }, []);

  const checkStatus = async (uid: string) => {
    try {
      const status = await getAuthStatus(uid);
      setIsConnected(status.connected);
      setEmail(status.email || null);
      if (status.connected && pollInterval.current) {
        stopPolling();
      }
    } catch (err) {
      console.warn('Auth status check failed:', err);
    }
  };

  const refreshStatus = async () => {
    if (userId) {
      setIsChecking(true);
      await checkStatus(userId);
      setIsChecking(false);
    }
  };

  const stopPolling = () => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }
  };

  const startPolling = (uid: string) => {
    stopPolling();
    let attempts = 0;
    pollInterval.current = setInterval(async () => {
      attempts++;
      if (attempts > 40) {
        // Timeout after 2 minutes (40 * 3s)
        stopPolling();
        return;
      }
      await checkStatus(uid);
    }, 3000);
  };

  const connect = async () => {
    if (!userId) return;
    try {
      const authUrl = await getAuthUrl(userId);
      // Open WebBrowser session
      await WebBrowser.openAuthSessionAsync(authUrl);
      // Start polling status
      startPolling(userId);
    } catch (err) {
      console.error('Failed to initiate login flow:', err);
      Alert.alert('Connection Error', 'Failed to open the sign-in page. Please try again.');
    }
  };

  const executeDisconnect = async () => {
    if (!userId) return;
    try {
      await logout(userId);
      setIsConnected(false);
      setEmail(null);
    } catch (err) {
      console.error('Logout failed:', err);
      Alert.alert('Logout Error', 'Failed to disconnect account from server. Resetting client UI state.');
      setIsConnected(false);
      setEmail(null);
    }
  };

  const disconnect = async () => {
    if (Platform.OS === 'web') {
      if (confirm('Are you sure you want to disconnect your YouTube channel?')) {
        await executeDisconnect();
      }
    } else {
      Alert.alert(
        'Disconnect YouTube',
        'Are you sure you want to disconnect your YouTube channel? You will not be able to upload until you reconnect.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Disconnect', style: 'destructive', onPress: executeDisconnect },
        ]
      );
    }
  };

  return (
    <AuthContext.Provider
      value={{
        userId,
        isConnected,
        email,
        isChecking,
        connect,
        disconnect,
        refreshStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
