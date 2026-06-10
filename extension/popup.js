const BACKEND_URL = 'https://youtube-chrome-extension-automation.onrender.com';

// ─── DOM references ───────────────────────────────────────────────────────────
const videoPreview        = document.getElementById('videoPreview');
const titleInput          = document.getElementById('title');
const descriptionInput    = document.getElementById('description');
const privacySelect       = document.getElementById('privacy');
const uploadButton        = document.getElementById('uploadButton');
const statusMessage       = document.getElementById('statusMessage');
const progressContainer   = document.getElementById('progressContainer');
const progressBar         = document.getElementById('progressBar');
const processLog          = document.getElementById('processLog');

const platformBadge       = document.getElementById('platformBadge');
const tabUploadNow        = document.getElementById('tabUploadNow');
const tabScheduled        = document.getElementById('tabScheduled');
const tabAccount          = document.getElementById('tabAccount');
const panelUploadNow      = document.getElementById('panelUploadNow');
const panelScheduled      = document.getElementById('panelScheduled');
const panelAccount        = document.getElementById('panelAccount');

const scheduleToggle      = document.getElementById('scheduleToggle');
const scheduleTimeContainer = document.getElementById('scheduleTimeContainer');
const scheduleTimeInput   = document.getElementById('scheduleTime');
const scheduledList       = document.getElementById('scheduledList');
const scheduledEmptyState = document.getElementById('scheduledEmptyState');

// Account tab elements
const authGate            = document.getElementById('authGate');
const authChecking        = document.getElementById('authChecking');
const authDisconnected    = document.getElementById('authDisconnected');
const authConnected       = document.getElementById('authConnected');
const connectBtn          = document.getElementById('connectBtn');
const disconnectBtn       = document.getElementById('disconnectBtn');
const userAvatar          = document.getElementById('userAvatar');
const userEmail           = document.getElementById('userEmail');

// ─── State ────────────────────────────────────────────────────────────────────
let currentVideoUrl  = '';
let currentPlatform  = null;
let currentUserId    = null;
let isConnected      = false;
let authPollInterval = null;

// ─── UUID / user identity ─────────────────────────────────────────────────────
function getUserId() {
  return new Promise((resolve) => {
    chrome.storage.local.get('userId', (data) => {
      if (data.userId) {
        resolve(data.userId);
      } else {
        const uuid = crypto.randomUUID();
        chrome.storage.local.set({ userId: uuid }, () => resolve(uuid));
      }
    });
  });
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function updateStatus(text, type) {
  statusMessage.textContent = text;
  statusMessage.className = `status ${type || 'info'}`;
  statusMessage.style.display = text ? 'flex' : 'none';
}

function setProgress(value) {
  progressContainer.style.display = 'block';
  progressBar.style.width = `${value}%`;
}

function resetUi() {
  uploadButton.disabled = false;
  setProgress(0);
  progressContainer.style.display = 'none';
  if (processLog) {
    processLog.innerHTML = '';
    processLog.style.display = 'none';
  }
}

function appendLog(message) {
  if (!processLog) return;
  processLog.style.display = 'block';
  const line = document.createElement('div');
  line.className = 'log-line';
  line.textContent = message;
  processLog.appendChild(line);
  processLog.scrollTop = processLog.scrollHeight;
}

function activateTab(tab) {
  // Deactivate all
  [tabUploadNow, tabScheduled, tabAccount].forEach((t) => t.classList.remove('active'));
  [panelUploadNow, panelScheduled, panelAccount].forEach((p) => p.classList.remove('active'));
  statusMessage.style.display = 'none';

  if (tab === 'upload') {
    tabUploadNow.classList.add('active');
    panelUploadNow.classList.add('active');
  } else if (tab === 'scheduled') {
    tabScheduled.classList.add('active');
    panelScheduled.classList.add('active');
    loadScheduledJobs();
  } else if (tab === 'account') {
    tabAccount.classList.add('active');
    panelAccount.classList.add('active');
    checkAuthStatus();
  }
}

// ─── Tab listeners ────────────────────────────────────────────────────────────
tabUploadNow.addEventListener('click', () => activateTab('upload'));
tabScheduled.addEventListener('click', () => activateTab('scheduled'));
tabAccount.addEventListener('click',   () => activateTab('account'));

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function checkAuthStatus() {
  authChecking.style.display    = 'block';
  authDisconnected.style.display = 'none';
  authConnected.style.display   = 'none';

  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/status?userId=${currentUserId}`);
    const data = await res.json();

    isConnected = data.connected;

    authChecking.style.display = 'none';
    if (data.connected) {
      authDisconnected.style.display = 'none';
      authConnected.style.display    = 'flex';
      userEmail.textContent          = data.email || 'Connected';
      userAvatar.textContent         = (data.email || 'U').charAt(0).toUpperCase();
    } else {
      authDisconnected.style.display = 'block';
      authConnected.style.display    = 'none';
    }
  } catch {
    authChecking.style.display  = 'none';
    authDisconnected.style.display = 'block';
    isConnected = false;
  }

  updateAuthGate();
}

function updateAuthGate() {
  if (!isConnected) {
    authGate.style.display = 'block';
  } else {
    authGate.style.display = 'none';
  }
}

// Auth gate banner → jump to Account tab
authGate.addEventListener('click', () => activateTab('account'));

async function connectAccount() {
  connectBtn.disabled = true;
  connectBtn.textContent = 'Opening Google…';

  try {
    const res  = await fetch(`${BACKEND_URL}/api/auth/youtube?userId=${currentUserId}`);
    const data = await res.json();

    if (!data.authUrl) throw new Error('No auth URL returned');

    // Open OAuth in a new tab
    chrome.tabs.create({ url: data.authUrl });

    // Poll every 3 seconds until connected (up to 2 minutes)
    connectBtn.textContent = 'Waiting for auth…';
    let attempts = 0;
    authPollInterval = setInterval(async () => {
      attempts++;
      try {
        const statusRes  = await fetch(`${BACKEND_URL}/api/auth/status?userId=${currentUserId}`);
        const statusData = await statusRes.json();

        if (statusData.connected) {
          clearInterval(authPollInterval);
          authPollInterval = null;
          isConnected = true;
          await checkAuthStatus(); // re-renders account UI
        }
      } catch { }

      if (attempts >= 40) { // 40 × 3s = 2 min timeout
        clearInterval(authPollInterval);
        authPollInterval = null;
        connectBtn.disabled = false;
        connectBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/><path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg> Sign in with Google';
      }
    }, 3000);

  } catch (err) {
    connectBtn.disabled = false;
    connectBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/><path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg> Sign in with Google';
    console.error('Connect error:', err);
  }
}

async function disconnectAccount() {
  if (!confirm('Disconnect your YouTube account from ShortsFlow?')) return;

  disconnectBtn.disabled = true;
  disconnectBtn.textContent = 'Disconnecting…';

  try {
    await fetch(`${BACKEND_URL}/api/auth/logout?userId=${currentUserId}`, { method: 'DELETE' });
    isConnected = false;
    updateAuthGate();
    await checkAuthStatus();
  } catch (err) {
    console.error('Disconnect error:', err);
    disconnectBtn.disabled = false;
    disconnectBtn.textContent = 'Disconnect Account';
  }
}

connectBtn.addEventListener('click', connectAccount);
disconnectBtn.addEventListener('click', disconnectAccount);

// ─── Schedule Toggle ──────────────────────────────────────────────────────────
scheduleToggle.addEventListener('change', () => {
  if (scheduleToggle.checked) {
    scheduleTimeContainer.style.display = 'block';
    const now = new Date();
    now.setMinutes(now.getMinutes() + 10);
    scheduleTimeInput.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    uploadButton.textContent = 'Schedule Upload';
  } else {
    scheduleTimeContainer.style.display = 'none';
    uploadButton.textContent = 'Upload';
  }
});

// ─── Load scheduled jobs ──────────────────────────────────────────────────────
async function loadScheduledJobs() {
  try {
    scheduledList.innerHTML = '';
    const res = await fetch(`${BACKEND_URL}/api/schedule?userId=${currentUserId}`);
    if (!res.ok) throw new Error(`Failed to load jobs: ${res.statusText}`);
    const jobs = await res.json();

    if (!jobs || jobs.length === 0) {
      scheduledEmptyState.style.display = 'flex';
      scheduledList.style.display = 'none';
      return;
    }

    scheduledEmptyState.style.display = 'none';
    scheduledList.style.display = 'flex';
    jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    jobs.forEach((job) => {
      const card = document.createElement('div');
      card.className = 'job-card';
      const scheduledTimeStr = new Date(job.scheduledAt).toLocaleString();
      const statusClass = job.status || 'pending';

      let detailsHtml = '';
      if (job.status === 'error' && job.error) {
        detailsHtml = `<div class="job-error-msg">⚠️ ${job.error}</div>`;
      } else if (job.status === 'done' && job.videoUrlResult) {
        detailsHtml = `<div style="margin-top:8px"><a href="${job.videoUrlResult}" target="_blank" class="upload-link" style="font-size:0.8rem">View on YouTube</a></div>`;
      }

      card.innerHTML = `
        <div class="job-meta">
          <span class="job-platform ${job.platform}">${job.platform}</span>
          <span class="job-status-badge ${statusClass}">${job.status}</span>
        </div>
        <div class="job-details">
          <p class="job-title-text" title="${job.title || job.videoUrl}">${job.title || job.videoUrl}</p>
          <div class="job-time-text">
            <svg style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            ${scheduledTimeStr}
          </div>
          ${detailsHtml}
        </div>
      `;

      if (job.status === 'pending') {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-job-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', async () => {
          cancelBtn.disabled = true;
          cancelBtn.textContent = 'Canceling…';
          try {
            const delRes = await fetch(`${BACKEND_URL}/api/schedule/${job.id}`, { method: 'DELETE' });
            if (delRes.ok) {
              loadScheduledJobs();
            } else {
              alert('Failed to cancel job');
              cancelBtn.disabled = false;
              cancelBtn.textContent = 'Cancel';
            }
          } catch (err) {
            alert('Error: ' + err.message);
            cancelBtn.disabled = false;
            cancelBtn.textContent = 'Cancel';
          }
        });
        card.appendChild(cancelBtn);
      }

      scheduledList.appendChild(card);
    });
  } catch (error) {
    console.error('Error loading scheduled jobs:', error);
    scheduledList.innerHTML = `<div class="job-error-msg" style="margin:10px 0">Error loading jobs: ${error.message}</div>`;
  }
}

// ─── Page info injection ──────────────────────────────────────────────────────
function isValidYouTubeUrl(url) {
  return /^(https:\/\/)?(www\.)?youtube\.com\/(watch\?v=|shorts\/)/.test(url);
}
function isValidInstagramReelUrl(url) {
  return /^(https:\/\/)?(www\.)?instagram\.com\/(reels?|p)\//.test(url);
}

function getVideoInfoFromPage(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: () => {
          const url      = window.location.href;
          const hostname = window.location.hostname;
          const pathname = window.location.pathname;

          if (hostname.includes('youtube.com')) {
            return { title: document.title || 'YouTube Video', url, platform: 'youtube' };
          }

          if (hostname.includes('instagram.com') && (pathname.includes('/reel/') || pathname.includes('/reels/') || pathname.includes('/p/'))) {
            const getInstagramCaption = () => {
              try {
                const a9zs = document.querySelector('span._a9zs, div._a9zs');
                if (a9zs && a9zs.textContent.trim()) return a9zs.textContent.trim();
              } catch { }
              try {
                const testId = document.querySelector('[data-testid="post-caption"]');
                if (testId && testId.innerText) return testId.innerText.trim();
              } catch { }
              try {
                const title = document.title;
                if (title) {
                  const match = title.match(/["""']([^"""']+)["""']/);
                  if (match && match[1]) return match[1].trim();
                }
              } catch { }
              try {
                const metaDesc = document.querySelector('meta[property="og:description"], meta[name="description"]');
                if (metaDesc) {
                  const content = metaDesc.getAttribute('content');
                  if (content) {
                    const m = content.match(/on\s+Instagram\s*:\s*["""'](.*)["""']/i);
                    if (m && m[1]) return m[1].trim();
                  }
                }
              } catch { }
              return 'Instagram Reel';
            };
            const caption = getInstagramCaption();
            return { title: caption.substring(0, 100), url, platform: 'instagram', caption };
          }

          return { title: null, url, platform: null };
        },
      },
      (results) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!results || !results[0] || !results[0].result) return reject(new Error('Failed to retrieve page info.'));
        resolve(results[0].result);
      }
    );
  });
}

async function loadVideoInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) { updateStatus('Unable to detect active tab.', 'error'); return; }

  let response;
  try {
    response = await getVideoInfoFromPage(tab.id);
  } catch (error) {
    updateStatus('Could not access the current page. Make sure you are on YouTube or Instagram Reel and reload the page.', 'error');
    return;
  }

  if (!response) { updateStatus('Could not retrieve page info.', 'error'); return; }

  currentVideoUrl  = response.url;
  currentPlatform  = response.platform;

  if (currentPlatform === 'youtube') {
    platformBadge.textContent  = 'YouTube';
    platformBadge.className    = 'platform-badge youtube';
    videoPreview.textContent   = `📺 YouTube: ${response.title}`;
    titleInput.value           = response.title || '';
    uploadButton.textContent   = 'Upload to YouTube';
    privacySelect.style.display = 'block';
    document.getElementById('privacyGroup').style.display = 'block';
    updateStatus('Ready to upload to YouTube.', 'success');
  } else if (currentPlatform === 'instagram') {
    platformBadge.textContent  = 'Instagram';
    platformBadge.className    = 'platform-badge instagram';
    videoPreview.textContent   = `📸 Instagram Reel`;
    titleInput.value           = response.caption?.substring(0, 100) || 'Instagram Reel';
    descriptionInput.value     = response.caption || '';
    uploadButton.textContent   = 'Upload to YouTube';
    privacySelect.style.display = 'none';
    document.getElementById('privacyGroup').style.display = 'none';
    updateStatus('Ready to upload Instagram Reel to YouTube.', 'success');
  } else {
    platformBadge.textContent = 'Unknown';
    platformBadge.className   = 'platform-badge';
    updateStatus('This extension works on YouTube or Instagram Reel pages.', 'error');
  }
}

// ─── NDJSON stream ────────────────────────────────────────────────────────────
async function parseNdjsonStream(reader) {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try { handleStreamEvent(JSON.parse(line)); } catch { }
    }
  }
  if (buffer.trim()) {
    try { handleStreamEvent(JSON.parse(buffer)); } catch { }
  }
}

function handleStreamEvent(event) {
  const { step, message } = event;

  if (step === 'downloading') {
    setProgress(10); updateStatus('⬇️ ' + message, '');
  } else if (step === 'cloudinary') {
    setProgress(40); updateStatus('☁️ ' + message, '');
  } else if (step === 'youtube') {
    setProgress(70); updateStatus('📤 ' + message, '');
  } else if (step === 'cleanup') {
    setProgress(90); updateStatus('🧹 ' + message, '');
  } else if (step === 'init') {
    setProgress(5);  updateStatus(`🚀 ${message}`, '');
  } else if (step === 'batch-processing') {
    const total       = event.total || 1;
    const reel        = event.reel  || 1;
    const status      = event.status;
    const reelFraction = (reel - 1) / total;
    const msgFraction  = (status === 'success' || status === 'error') ? 1 : 0.5;
    const progress     = Math.round(5 + 85 * (reelFraction + msgFraction / total));
    setProgress(Math.min(progress, 90));
    const icon = status === 'starting' ? '▶️' : status === 'processing' ? '🔄' : status === 'success' ? '✅' : '❌';
    appendLog(`${icon} [${reel}/${total}] ${message}`);
    updateStatus(`${icon} ${message}`, status === 'error' ? 'error' : '');
  } else if (step === 'complete') {
    setProgress(100);
    if (event.videoUrl) {
      statusMessage.innerHTML = '';
      const link = document.createElement('a');
      link.href = event.videoUrl; link.target = '_blank';
      link.textContent = 'View uploaded video'; link.className = 'upload-link';
      statusMessage.appendChild(link);
    } else {
      const msg = `✅ Done! ${event.success || 0} uploaded, ${event.failures || 0} failed.`;
      updateStatus(msg, event.failures ? 'error' : 'success');
      appendLog(msg);
    }
    uploadButton.disabled = false;
  } else if (step === 'error') {
    updateStatus('❌ ' + (message || 'Upload failed.'), 'error');
    uploadButton.disabled = false;
  }
}

// ─── Upload button ────────────────────────────────────────────────────────────
uploadButton.addEventListener('click', async () => {
  if (!currentVideoUrl) { updateStatus('No video detected.', 'error'); return; }
  if (currentPlatform === 'youtube'   && !isValidYouTubeUrl(currentVideoUrl))     { updateStatus('Invalid YouTube URL.', 'error'); return; }
  if (currentPlatform === 'instagram' && !isValidInstagramReelUrl(currentVideoUrl)) { updateStatus('Invalid Instagram URL.', 'error'); return; }

  if (!isConnected) {
    updateStatus('⚠️ Please connect your YouTube account first.', 'error');
    setTimeout(() => activateTab('account'), 1200);
    return;
  }

  // ── Schedule path ──────────────────────────────────────────────────────────
  if (scheduleToggle.checked) {
    const scheduledTime = scheduleTimeInput.value;
    if (!scheduledTime) { updateStatus('Please select a publish date and time.', 'error'); return; }

    const scheduledDate = new Date(scheduledTime);
    if (scheduledDate.getTime() - Date.now() < 5 * 60 * 1000) {
      updateStatus('Scheduled time must be at least 5 minutes in the future.', 'error');
      return;
    }

    uploadButton.disabled    = true;
    uploadButton.textContent = '⏳ Scheduling…';
    updateStatus('Scheduling video...', 'info');

    try {
      await syncYouTubeCookiesIfNeeded();
      const res = await fetch(`${BACKEND_URL}/api/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId:      currentUserId,
          videoUrl:    currentVideoUrl,
          title:       titleInput.value.trim()       || undefined,
          description: descriptionInput.value.trim() || undefined,
          privacy:     privacySelect.value,
          platform:    currentPlatform,
          scheduledAt: scheduledDate.toISOString(),
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || res.statusText); }

      updateStatus('✅ Video scheduled successfully!', 'success');
      titleInput.value = ''; descriptionInput.value = '';
      scheduleToggle.checked = false;
      scheduleTimeContainer.style.display = 'none';
      uploadButton.textContent = 'Upload';
      setTimeout(() => activateTab('scheduled'), 1500);
    } catch (error) {
      updateStatus('❌ ' + (error.message || 'Scheduling failed.'), 'error');
    } finally {
      uploadButton.disabled = false;
    }
    return;
  }

  // ── Immediate upload path ──────────────────────────────────────────────────
  resetUi();
  uploadButton.disabled = true;
  uploadButton.classList.add('processing');
  const originalLabel = uploadButton.textContent;
  uploadButton.textContent = '⏳ Processing…';
  updateStatus('🚀 Starting upload…', '');
  setProgress(5);

  const restoreButton = () => {
    uploadButton.classList.remove('processing');
    uploadButton.textContent = originalLabel;
  };

  try {
    if (currentPlatform === 'instagram') {
      const res = await fetch(`${BACKEND_URL}/api/process-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId:            currentUserId,
          urls:              [currentVideoUrl],
          defaultCredit:     true,
          globalTitle:       titleInput.value.trim()       || undefined,
          globalDescription: descriptionInput.value.trim() || undefined,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Backend error: ${res.statusText || res.status}`);
      await parseNdjsonStream(res.body.getReader());
    } else {
      await syncYouTubeCookiesIfNeeded();
      const res = await fetch(`${BACKEND_URL}/api/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId:      currentUserId,
          videoUrl:    currentVideoUrl,
          title:       titleInput.value.trim()       || undefined,
          description: descriptionInput.value.trim() || undefined,
          privacy:     privacySelect.value,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Backend error: ${res.statusText || res.status}`);
      await parseNdjsonStream(res.body.getReader());
    }
  } catch (error) {
    updateStatus('❌ ' + (error.message || 'Upload failed.'), 'error');
    uploadButton.disabled = false;
  } finally {
    restoreButton();
  }
});

function getBrowserYouTubeCookies() {
  return new Promise((resolve, reject) => {
    chrome.cookies.getAll({ domain: '.youtube.com' }, (cookies) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(cookies || []);
      }
    });
  });
}

function formatCookiesAsNetscape(cookies) {
  const lines = ['# Netscape HTTP Cookie File', '# This file is generated by the extension for yt-dlp.', ''];
  for (const cookie of cookies) {
    const host = cookie.domain.startsWith('.') ? cookie.domain : `.${cookie.domain}`;
    const includeSubDomains = cookie.hostOnly ? 'FALSE' : 'TRUE';
    const path = cookie.path || '/';
    const secure = cookie.secure ? 'TRUE' : 'FALSE';
    const expires = cookie.expirationDate ? Math.floor(cookie.expirationDate) : 0;
    lines.push([host, includeSubDomains, path, secure, expires, cookie.name, cookie.value].join('\t'));
  }
  return lines.join('\n');
}

async function uploadYouTubeCookiesToBackend() {
  const cookies = await getBrowserYouTubeCookies();
  if (!cookies.length) {
    return false;
  }

  const fileContent = formatCookiesAsNetscape(cookies);
  const formData = new FormData();
  formData.append('cookies', new File([fileContent], 'youtube_cookies.txt', { type: 'text/plain' }));

  const res = await fetch(`${BACKEND_URL}/api/youtube/cookies`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error || message;
    } catch (e) {}
    throw new Error(`Failed to upload YouTube cookies: ${message}`);
  }

  return true;
}

async function syncYouTubeCookiesIfNeeded() {
  if (currentPlatform !== 'youtube') {
    return true;
  }

  updateStatus('🔐 Syncing YouTube browser cookies…', 'info');
  try {
    const synced = await uploadYouTubeCookiesToBackend();
    if (!synced) {
      throw new Error('No YouTube cookies were detected in your browser. Please sign in to YouTube and try again.');
    }
    return true;
  } catch (error) {
    updateStatus('❌ ' + (error.message || 'Cookie sync failed.'), 'error');
    throw error;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  currentUserId = await getUserId();
  await Promise.all([loadVideoInfo(), checkAuthStatus()]);
});
