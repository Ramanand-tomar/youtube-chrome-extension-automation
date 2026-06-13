import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, 
  ActivityIndicator, Switch, Alert, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import WebView from 'react-native-webview';

let CookieManager: any = null;
try {
  CookieManager = require('@react-native-cookies/cookies').default;
} catch (e) {
  console.warn('CookieManager native module not available. Build a dev client to use this feature.');
}

// Simple polyfill-ish random generator for nonce
const generateNonce = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

export default function App() {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload', 'scheduled', 'account'
  const [showYouTubeLogin, setShowYouTubeLogin] = useState(false);
  
  const handleExtractCookies = async () => {
    try {
      if (!CookieManager) {
        Alert.alert('Error', 'Native cookie manager is not installed. Please build a custom dev client (npx expo run:android) to use this feature.');
        return;
      }
      const cookies = await CookieManager.get('https://youtube.com');
      // Format cookies into a string like "name=value; name=value"
      const cookieString = Object.keys(cookies).map(key => `${key}=${cookies[key].value}`).join('; ');
      
      if (!cookieString || cookieString.length === 0) {
        Alert.alert('Error', 'No cookies found. Did you log in?');
        return;
      }

      await axios.post(`${API_BASE_URL}/youtube/cookies`, { cookies: cookieString }, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      Alert.alert('Success', 'YouTube cookies uploaded successfully to bypass bot detection!');
      setShowYouTubeLogin(false);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to extract cookies');
    }
  };
  
  // Auth state
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Form state
  const [videoUrl, setVideoUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState('public');
  const [postToYouTube, setPostToYouTube] = useState(true);
  const [crossPostToInstagram, setCrossPostToInstagram] = useState(true);
  const [scheduleToggle, setScheduleToggle] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('');
  
  // Suppress unused warnings for schedule logic since it will be used later
  console.log(scheduleToggle, scheduleTime);
  
  // Status state
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Load session on startup
    const loadSession = async () => {
      try {
        const storedToken = await AsyncStorage.getItem('sessionToken');
        const storedEmail = await AsyncStorage.getItem('email');
        if (storedToken) {
          // Verify with backend
          try {
            const res = await axios.get(`${API_BASE_URL}/auth/status`, {
              headers: { Authorization: `Bearer ${storedToken}` }
            });
            if (res.data.connected) {
              setSessionToken(storedToken);
              setEmail(res.data.email || storedEmail);
            } else {
              await AsyncStorage.removeItem('sessionToken');
              await AsyncStorage.removeItem('email');
            }
          } catch (e) {
            // Keep token if offline, or clear it if backend returns 401
            setSessionToken(storedToken);
            setEmail(storedEmail);
          }
        }
      } catch (e) {
        console.error('Failed to load session');
      }
    };
    loadSession();
  }, []);

  // Start Auth Flow
  const handleConnect = async () => {
    setIsAuthenticating(true);
    
    try {
      // 1. Get the auth URL and generated nonce from the backend
      const { data } = await axios.get(`${API_BASE_URL}/auth/youtube`);
      const { authUrl, nonce } = data;
      
      // 2. Open browser for OAuth
      WebBrowser.openBrowserAsync(authUrl);
      
      // Poll for status
      const pollInterval = setInterval(async () => {
        try {
          const res = await axios.get(`${API_BASE_URL}/auth/poll?nonce=${nonce}`);
          if (res.data.connected && res.data.sessionToken) {
            clearInterval(pollInterval);
            setSessionToken(res.data.sessionToken);
            setEmail(res.data.email);
            setIsAuthenticating(false);
            WebBrowser.dismissBrowser();
            
            // Persist
            await AsyncStorage.setItem('sessionToken', res.data.sessionToken);
            if (res.data.email) await AsyncStorage.setItem('email', res.data.email);
            
            Alert.alert('Success', 'YouTube Connected!');
          }
        } catch (e: any) {
          // Keep polling, ignore 404
        }
      }, 3000);

      // Timeout after 3 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setIsAuthenticating(false);
      }, 180000);
      
    } catch (e: any) {
      setIsAuthenticating(false);
      Alert.alert('Error', 'Failed to open browser');
    }
  };

  const handleDisconnect = async () => {
    if (!sessionToken) return;
    try {
      await axios.delete(`${API_BASE_URL}/auth/logout`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      setSessionToken(null);
      setEmail(null);
      await AsyncStorage.removeItem('sessionToken');
      await AsyncStorage.removeItem('email');
    } catch (err: any) {
      Alert.alert('Logout Error', err.message);
    }
  };

  // Main Upload Flow
  const handleUpload = async () => {
    if (!videoUrl) {
      Alert.alert('Error', 'Please enter a video URL');
      return;
    }
    if (!sessionToken) {
      Alert.alert('Error', 'Please connect your YouTube account first');
      return;
    }

    setIsProcessing(true);
    setStatus('Extracting video URL via backend...');
    setProgress(0.1);

    try {
      setStatus('Sending request to backend...');
      setProgress(0.5);

      const res = await fetch(`${API_BASE_URL}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          videoUrl,
          title,
          description,
          privacy,
          postToYouTube,
          crossPostToInstagram
        })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Upload failed: ${res.status} ${text}`);
      }

      setStatus('Success! Video uploaded and processed.');
      setProgress(1.0);
      Alert.alert('Success', 'Video is processing on the backend');

    } catch (error: any) {
      console.error(error);
      setStatus(`Error: ${error.response?.data?.error || error.message}`);
      Alert.alert('Error', error.response?.data?.error || error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ShortsFlow Mobile</Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'upload' && styles.tabBtnActive]} onPress={() => setActiveTab('upload')}>
          <Text style={[styles.tabText, activeTab === 'upload' && styles.tabTextActive]}>Upload</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'account' && styles.tabBtnActive]} onPress={() => setActiveTab('account')}>
          <Text style={[styles.tabText, activeTab === 'account' && styles.tabTextActive]}>Account</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {activeTab === 'account' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>YouTube Account</Text>
            {sessionToken ? (
              <View>
                <Text style={styles.statusText}>Connected as: {email}</Text>

                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#10b981', marginTop: 20 }]} onPress={() => setShowYouTubeLogin(true)}>
                  <Text style={styles.primaryBtnText}>Connect YouTube Cookies (Anti-Bot)</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#f87171', marginTop: 20 }]} onPress={handleDisconnect}>
                  <Text style={styles.primaryBtnText}>Disconnect</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.statusText}>Not connected.</Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleConnect} disabled={isAuthenticating}>
                  {isAuthenticating ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Connect YouTube</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {activeTab === 'upload' && (
          <View style={styles.card}>
            {!sessionToken && (
              <TouchableOpacity onPress={() => setActiveTab('account')}>
                <Text style={styles.warningText}>⚠️ Please connect your YouTube account first.</Text>
              </TouchableOpacity>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Video URL (YouTube/Instagram)</Text>
              <TextInput style={styles.input} value={videoUrl} onChangeText={setVideoUrl} placeholder="https://..." placeholderTextColor="#64748b" />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Title (Optional)</Text>
              <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Custom Title" placeholderTextColor="#64748b" />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description (Optional)</Text>
              <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} placeholder="Description..." multiline placeholderTextColor="#64748b" />
            </View>

            <View style={styles.switchGroup}>
              <Text style={styles.label}>Upload to YouTube</Text>
              <Switch value={postToYouTube} onValueChange={setPostToYouTube} trackColor={{ true: '#38bdf8' }} />
            </View>

            <View style={styles.switchGroup}>
              <Text style={styles.label}>Cross-post to Instagram</Text>
              <Switch value={crossPostToInstagram} onValueChange={setCrossPostToInstagram} trackColor={{ true: '#38bdf8' }} />
            </View>

            {status !== '' && (
              <View style={styles.statusBox}>
                <Text style={styles.statusText}>{status}</Text>
                {isProcessing && (
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity 
              style={[styles.primaryBtn, (!sessionToken || isProcessing || !videoUrl) && styles.primaryBtnDisabled]} 
              onPress={handleUpload}
              disabled={!sessionToken || isProcessing || !videoUrl}
            >
              {isProcessing ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.primaryBtnText}>Download & Upload</Text>}
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      <Modal visible={showYouTubeLogin} animationType="slide" onRequestClose={() => setShowYouTubeLogin(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: '#1e293b' }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Please Log In to YouTube</Text>
            <TouchableOpacity onPress={handleExtractCookies}>
              <Text style={{ color: '#38bdf8', fontSize: 16, fontWeight: '700' }}>Done</Text>
            </TouchableOpacity>
          </View>
          <WebView 
            source={{ uri: 'https://m.youtube.com' }} 
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  header: { padding: 20, alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#f8fafc' },
  tabs: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 20 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 8, marginHorizontal: 4 },
  tabBtnActive: { backgroundColor: '#38bdf8' },
  tabText: { color: '#94a3b8', fontWeight: '600' },
  tabTextActive: { color: '#0f172a' },
  content: { padding: 20 },
  card: { backgroundColor: '#1e293b', padding: 20, borderRadius: 16, marginBottom: 20 },
  cardTitle: { fontSize: 18, color: '#f8fafc', fontWeight: '700', marginBottom: 15 },
  inputGroup: { marginBottom: 16 },
  label: { color: '#94a3b8', marginBottom: 6, fontSize: 14, fontWeight: '500' },
  input: { backgroundColor: '#0f172a', color: '#f8fafc', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155' },
  textArea: { height: 80, textAlignVertical: 'top' },
  switchGroup: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  primaryBtn: { backgroundColor: '#38bdf8', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  primaryBtnDisabled: { backgroundColor: '#334155' },
  primaryBtnText: { color: '#0f172a', fontWeight: '700', fontSize: 16 },
  warningText: { color: '#fbbf24', marginBottom: 20, padding: 12, backgroundColor: 'rgba(251, 191, 36, 0.1)', borderRadius: 8 },
  statusBox: { padding: 12, backgroundColor: 'rgba(56, 189, 248, 0.1)', borderRadius: 8, marginBottom: 16 },
  statusText: { color: '#38bdf8', fontSize: 14 },
  progressBarBg: { height: 6, backgroundColor: '#334155', borderRadius: 3, marginTop: 8 },
  progressBarFill: { height: '100%', backgroundColor: '#38bdf8', borderRadius: 3 },
});
