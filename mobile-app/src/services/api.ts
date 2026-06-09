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

export async function scheduleUpload(payload: SchedulePayload): Promise<{ id: string }> {
  const res = await fetch(`${BACKEND_URL}/api/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to schedule upload');
  return res.json();
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
