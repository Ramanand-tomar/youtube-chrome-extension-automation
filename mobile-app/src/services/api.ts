export const BACKEND_URL = 'https://youtube-chrome-extension-automation.onrender.com';

// ─── Auth endpoints ───────────────────────────────────────────────────────────

export async function getAuthUrl(userId: string): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/api/auth/youtube?userId=${userId}`);
  if (!res.ok) throw new Error('Failed to fetch Auth URL');
  const data = await res.json();
  return data.authUrl;
}

export async function getAuthStatus(userId: string): Promise<{ connected: boolean; email?: string }> {
  const res = await fetch(`${BACKEND_URL}/api/auth/status?userId=${userId}`);
  if (!res.ok) throw new Error('Failed to fetch Auth status');
  return res.json();
}

export async function logout(userId: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/auth/logout?userId=${userId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to log out');
}

// ─── YouTube Cookies ──────────────────────────────────────────────────────────

export async function getYouTubeCookiesStatus(): Promise<{ hasCookies: boolean; message: string }> {
  const res = await fetch(`${BACKEND_URL}/api/youtube/cookies/status`);
  if (!res.ok) throw new Error('Failed to check YouTube cookies status');
  return res.json();
}

export async function uploadYouTubeCookies(cookiesText: string): Promise<{ success: boolean; message: string }> {
  const formData = new FormData();
  // Create a Blob from the cookies text and attach as a file
  const blob = new Blob([cookiesText], { type: 'text/plain' });
  formData.append('cookies', blob, 'youtube.txt');
  const res = await fetch(`${BACKEND_URL}/api/youtube/cookies`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to upload YouTube cookies');
  return data;
}

export async function deleteYouTubeCookies(): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/youtube/cookies`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete YouTube cookies');
}

// ─── Quota ────────────────────────────────────────────────────────────────────

export async function getQuota(): Promise<{ used: number; limit: number; remaining: number }> {
  const res = await fetch(`${BACKEND_URL}/api/quota`);
  if (!res.ok) throw new Error('Failed to fetch quota');
  return res.json();
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

export interface SchedulePayload {
  userId: string;
  videoUrl: string;
  title?: string;
  description?: string;
  privacy?: string;
  platform?: 'youtube' | 'instagram';
  scheduledAt: string; // ISO string
}

export interface ScheduledJob {
  id: string;
  userId: string;
  videoUrl: string;
  title?: string;
  description?: string;
  privacy?: string;
  platform: 'youtube' | 'instagram';
  scheduledAt: string; // ISO string
  status: 'pending' | 'processing' | 'done' | 'error';
  videoId?: string;
  videoUrlResult?: string;
  error?: string;
  createdAt?: string;
}

export async function scheduleUpload(payload: SchedulePayload): Promise<{ id: string }> {
  const res = await fetch(`${BACKEND_URL}/api/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to schedule upload');
  return res.json();
}

export async function getScheduledJobs(userId: string): Promise<ScheduledJob[]> {
  const res = await fetch(`${BACKEND_URL}/api/schedule?userId=${userId}`);
  if (!res.ok) throw new Error('Failed to fetch scheduled uploads');
  return res.json();
}

export async function cancelScheduledJob(id: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/schedule/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to cancel scheduled upload');
}

// ─── Upload (XHR-based for NDJSON streaming) ─────────────────────────────────

export interface YouTubeUploadPayload {
  userId: string;
  videoUrl: string;
  title?: string;
  description?: string;
  privacy?: string;
}

export interface InstagramUploadPayload {
  userId: string;
  urls: string[];
  globalTitle?: string;
  globalDescription?: string;
}

/** Returns XHR so the caller can attach onprogress / onload / onerror handlers */
export function uploadYouTube(payload: YouTubeUploadPayload): XMLHttpRequest {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${BACKEND_URL}/api/process`, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(JSON.stringify(payload));
  return xhr;
}

export function uploadInstagram(payload: InstagramUploadPayload): XMLHttpRequest {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${BACKEND_URL}/api/process-batch`, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(JSON.stringify(payload));
  return xhr;
}
