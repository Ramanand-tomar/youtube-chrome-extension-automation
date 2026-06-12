import React, { useState } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, 
  ActivityIndicator, Switch, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';
import axios from 'axios';
import { API_BASE_URL } from '../config';

// Simple polyfill-ish random generator for nonce
const generateNonce = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

export default function App() {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload', 'scheduled', 'account'
  
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
      // 1. Extract direct MP4 URL via Backend
      const extractRes = await axios.get(`${API_BASE_URL}/mobile/extract-url`, {
        params: { url: videoUrl },
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      
      const directUrl = extractRes.data.directUrl;
      if (!directUrl) throw new Error('Failed to extract direct video URL');

      setStatus('Downloading video to device...');
      setProgress(0.3);

      // 2. Download directly to client device
      // eslint-disable-next-line import/namespace
      const localUri = FileSystem.cacheDirectory + `temp_video_${Date.now()}.mp4`;
      
      const downloadRes = await FileSystem.downloadAsync(directUrl, localUri);
      if (downloadRes.status !== 200) {
        throw new Error('Failed to download video locally');
      }

      setStatus('Uploading video to server...');
      setProgress(0.6);

      // 3. Upload the downloaded file to Backend
      const formData = new FormData();
      formData.append('video', {
        uri: localUri,
        name: 'video.mp4',
        type: 'video/mp4'
      } as any);
      formData.append('title', title);
      formData.append('description', description);
      formData.append('privacy', privacy);
      formData.append('postToYouTube', String(postToYouTube));
      formData.append('crossPostToInstagram', String(crossPostToInstagram));
      formData.append('originalUrl', videoUrl);

      // If scheduled, maybe call a different endpoint, but for now we just use process-upload
      // Note: Backend currently doesn't schedule from process-upload, it expects /api/schedule
      // We will handle schedule separately or just upload now for this demo.
      
      await axios.post(`${API_BASE_URL}/mobile/process-upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${sessionToken}`
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const pct = 0.6 + (progressEvent.loaded / progressEvent.total) * 0.3;
            setProgress(pct);
          }
        }
      });

      setStatus('Success! Video uploaded and processed.');
      setProgress(1.0);
      Alert.alert('Success', 'Video uploaded successfully');

      // 4. Clean up local file
      await FileSystem.deleteAsync(localUri, { idempotent: true });

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
