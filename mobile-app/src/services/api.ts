export const BACKEND_URL = 'https://youtube-chrome-extension-automation.onrender.com';

export async function getAuthUrl(userId: string): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/api/auth/youtube?userId=${userId}`);
  if (!res.ok) {
    throw new Error('Failed to fetch Auth URL');
  }
  const data = await res.json();
  return data.authUrl;
}

export async function getAuthStatus(userId: string): Promise<{ connected: boolean; email?: string }> {
  const res = await fetch(`${BACKEND_URL}/api/auth/status?userId=${userId}`);
  if (!res.ok) {
    throw new Error('Failed to fetch Auth status');
  }
  return await res.json();
}

export async function logout(userId: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/auth/logout?userId=${userId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('Failed to log out');
  }
}
