const BACKEND_URL = 'http://localhost:3000';
// const BACKEND_URL = 'https://your-backend.onrender.com';

const videoPreview = document.getElementById('videoPreview');
const titleInput = document.getElementById('title');
const descriptionInput = document.getElementById('description');
const privacySelect = document.getElementById('privacy');
const uploadButton = document.getElementById('uploadButton');
const statusMessage = document.getElementById('statusMessage');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const processLog = document.getElementById('processLog');

const platformBadge = document.getElementById('platformBadge');
const tabUploadNow = document.getElementById('tabUploadNow');
const tabScheduled = document.getElementById('tabScheduled');
const panelUploadNow = document.getElementById('panelUploadNow');
const panelScheduled = document.getElementById('panelScheduled');
const scheduleToggle = document.getElementById('scheduleToggle');
const scheduleTimeContainer = document.getElementById('scheduleTimeContainer');
const scheduleTimeInput = document.getElementById('scheduleTime');
const scheduledList = document.getElementById('scheduledList');
const scheduledEmptyState = document.getElementById('scheduledEmptyState');

let currentVideoUrl = '';
let currentPlatform = null;

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

function isValidYouTubeUrl(url) {
  return /^(https:\/\/)?(www\.)?youtube\.com\/(watch\?v=|shorts\/)/.test(url);
}

// Support mobile/desktop instagram video links
function isValidInstagramReelUrl(url) {
  return /^(https:\/\/)?(www\.)?instagram\.com\/(reels?|p)\//.test(url);
}

// Tab Switching Logic
tabUploadNow.addEventListener('click', () => {
  tabUploadNow.classList.add('active');
  tabScheduled.classList.remove('active');
  panelUploadNow.classList.add('active');
  panelScheduled.classList.remove('active');
  statusMessage.style.display = 'none';
});

tabScheduled.addEventListener('click', () => {
  tabScheduled.classList.add('active');
  tabUploadNow.classList.remove('active');
  panelScheduled.classList.add('active');
  panelUploadNow.classList.remove('active');
  statusMessage.style.display = 'none';
  loadScheduledJobs();
});

// Schedule Toggle logic
scheduleToggle.addEventListener('change', () => {
  if (scheduleToggle.checked) {
    scheduleTimeContainer.style.display = 'block';
    const now = new Date();
    now.setMinutes(now.getMinutes() + 10);
    const localISOString = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    scheduleTimeInput.value = localISOString;
    uploadButton.textContent = 'Schedule Upload';
  } else {
    scheduleTimeContainer.style.display = 'none';
    uploadButton.textContent = 'Upload';
  }
});

async function loadScheduledJobs() {
  try {
    scheduledList.innerHTML = '';
    const response = await fetch(`${BACKEND_URL}/api/schedule`);
    if (!response.ok) {
      throw new Error(`Failed to load jobs: ${response.statusText}`);
    }
    const jobs = await response.json();
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
        detailsHtml = `
          <div style="margin-top: 8px;">
            <a href="${job.videoUrlResult}" target="_blank" class="upload-link" style="font-size: 0.8rem;">View on YouTube</a>
          </div>
        `;
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
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
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
          cancelBtn.textContent = 'Canceling...';
          try {
            const delRes = await fetch(`${BACKEND_URL}/api/schedule/${job.id}`, {
              method: 'DELETE',
            });
            if (delRes.ok) {
              loadScheduledJobs();
            } else {
              alert('Failed to cancel job');
              cancelBtn.disabled = false;
              cancelBtn.textContent = 'Cancel';
            }
          } catch (err) {
            console.error(err);
            alert('Error canceling job: ' + err.message);
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
    scheduledList.innerHTML = `<div class="job-error-msg" style="margin: 10px 0;">Error loading jobs: ${error.message}</div>`;
  }
}

function getVideoInfoFromPage(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: () => {
          const url = window.location.href;
          const hostname = window.location.hostname;
          const pathname = window.location.pathname;

          if (hostname.includes('youtube.com')) {
            return {
              title: document.title || 'YouTube Video',
              url,
              platform: 'youtube',
            };
          }

          if (hostname.includes('instagram.com') && (pathname.includes('/reel/') || pathname.includes('/reels/') || pathname.includes('/p/'))) {
            const getInstagramCaption = () => {
              try {
                const a9zs = document.querySelector('span._a9zs, div._a9zs');
                if (a9zs && a9zs.textContent.trim()) {
                  return a9zs.textContent.trim();
                }
              } catch (e) {}

              try {
                const testIdElement = document.querySelector('[data-testid="post-caption"]');
                if (testIdElement && testIdElement.innerText) {
                  return testIdElement.innerText.trim();
                }
              } catch (e) {}

              try {
                const followEl = Array.from(document.querySelectorAll('button, span, div, a')).find(el => {
                  const txt = el.textContent.trim();
                  return txt === 'Follow' || txt === 'Following';
                });
                if (followEl) {
                  let current = followEl.parentElement;
                  for (let i = 0; i < 6 && current; i++) {
                    const leafElements = Array.from(current.querySelectorAll('span, div, h1'));
                    
                    const ignoredUsernames = new Set();
                    const usernameLinks = Array.from(current.querySelectorAll('a[href^="/"]')).filter(a => {
                      const href = a.getAttribute('href');
                      return href && href.length > 2 && !href.includes('/reels/') && !href.includes('/p/') && !href.includes('/explore/');
                    });
                    usernameLinks.forEach(a => {
                      const txt = a.textContent.trim();
                      if (txt) ignoredUsernames.add(txt.toLowerCase());
                    });

                    for (const el of leafElements) {
                      if (el.children.length === 0) {
                        const txt = el.textContent.trim();
                        if (txt && txt.length > 10 && !ignoredUsernames.has(txt.toLowerCase()) && txt !== 'Follow' && txt !== 'Following' && !txt.includes('original audio') && !txt.includes('Audio')) {
                          return txt;
                        }
                      }
                    }
                    current = current.parentElement;
                  }
                }
              } catch (e) {}

              try {
                const links = Array.from(document.querySelectorAll('a'));
                const profileLinks = links.filter(a => {
                  const href = a.getAttribute('href');
                  if (!href) return false;
                  return /^\/[a-zA-Z0-9_.]+\/?$/.test(href) && 
                         href !== '/explore/' && 
                         href !== '/reels/' && 
                         href !== '/direct/' && 
                         href !== '/emails/' &&
                         href !== '/';
                });

                const globalIgnoredUsernames = new Set();
                profileLinks.forEach(a => {
                  const txt = a.textContent.trim();
                  if (txt) globalIgnoredUsernames.add(txt.toLowerCase());
                });

                for (const link of profileLinks) {
                  const username = link.textContent.trim();
                  if (!username) continue;

                  let current = link.parentElement;
                  for (let i = 0; i < 4 && current; i++) {
                    const leafElements = Array.from(current.querySelectorAll('span, div, h1'));
                    for (const el of leafElements) {
                      if (el.children.length === 0) {
                        const txt = el.textContent.trim();
                        if (txt && txt.length > 15 && !globalIgnoredUsernames.has(txt.toLowerCase()) && txt !== 'Follow' && txt !== 'Following' && !txt.includes('original audio') && !txt.includes('Audio')) {
                          return txt;
                        }
                      }
                    }
                    current = current.parentElement;
                  }
                }
              } catch (e) {}

              try {
                const title = document.title;
                if (title) {
                  const match = title.match(/["'“‘]([^"'”’]+)["'”’]/);
                  if (match && match[1]) {
                    return match[1].trim();
                  }
                }
              } catch (e) {}

              try {
                const metaDesc = document.querySelector('meta[property="og:description"], meta[name="description"]');
                if (metaDesc) {
                  const descContent = metaDesc.getAttribute('content');
                  if (descContent) {
                    const metaMatch = descContent.match(/on\s+Instagram\s*:\s*["'“‘](.*)["'”’]/i);
                    if (metaMatch && metaMatch[1]) {
                      return metaMatch[1].trim();
                    }
                  }
                }
              } catch (e) {}

              try {
                const h1 = document.querySelector('h1');
                if (h1) {
                  const userLink = h1.querySelector('a');
                  if (userLink) {
                    const username = userLink.textContent.trim();
                    const fullText = h1.textContent.trim();
                    if (username && fullText.startsWith(username)) {
                      const parsed = fullText.substring(username.length).trim();
                      if (parsed) return parsed;
                    }
                  }
                  const h1Text = h1.textContent.trim();
                  if (h1Text) return h1Text;
                }
              } catch (e) {}

              return 'Instagram Reel';
            };

            const caption = getInstagramCaption();
            return {
              title: caption.substring(0, 100),
              url,
              platform: 'instagram',
              caption,
            };
          }

          return {
            title: null,
            url,
            platform: null,
          };
        },
      },
      (results) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!results || !results[0] || !results[0].result) {
          return reject(new Error('Failed to retrieve page info.'));
        }
        resolve(results[0].result);
      }
    );
  });
}

async function loadVideoInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id) {
    updateStatus('Unable to detect active tab.', 'error');
    return;
  }

  let response;
  try {
    response = await getVideoInfoFromPage(tab.id);
  } catch (error) {
    updateStatus('Could not access the current page. Make sure you are on YouTube or Instagram Reel and reload the page.', 'error');
    console.error('Page info injection failed:', error.message);
    return;
  }

  if (!response) {
    updateStatus('Could not retrieve page info.', 'error');
    return;
  }

  currentVideoUrl = response.url;
  currentPlatform = response.platform;

  if (currentPlatform === 'youtube') {
    platformBadge.textContent = 'YouTube';
    platformBadge.className = 'platform-badge youtube';
    videoPreview.textContent = `📺 YouTube: ${response.title}`;
    titleInput.value = response.title || '';
    uploadButton.textContent = 'Upload to YouTube';
    privacySelect.style.display = 'block';
    document.getElementById('privacyGroup').style.display = 'block';
    updateStatus('Ready to upload to YouTube.', 'success');
  } else if (currentPlatform === 'instagram') {
    platformBadge.textContent = 'Instagram';
    platformBadge.className = 'platform-badge instagram';
    videoPreview.textContent = `📸 Instagram Reel`;
    titleInput.value = response.caption?.substring(0, 100) || 'Instagram Reel';
    descriptionInput.value = response.caption || '';
    uploadButton.textContent = 'Upload to YouTube';
    privacySelect.style.display = 'none';
    document.getElementById('privacyGroup').style.display = 'none';
    updateStatus('Ready to upload Instagram Reel to YouTube.', 'success');
  } else {
    platformBadge.textContent = 'Unknown';
    platformBadge.className = 'platform-badge';
    updateStatus('This extension works on YouTube or Instagram Reel pages.', 'error');
  }
}

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
      try {
        const data = JSON.parse(line);
        handleStreamEvent(data);
      } catch (e) {
        console.warn('Invalid NDJSON chunk:', line);
      }
    }
  }

  if (buffer.trim()) {
    try {
      handleStreamEvent(JSON.parse(buffer));
    } catch (e) {
      console.warn('Invalid NDJSON final chunk:', buffer);
    }
  }
}

function handleStreamEvent(event) {
  const step = event.step;

  if (step === 'downloading') {
    setProgress(10);
    updateStatus('⬇️ ' + event.message, '');
  } else if (step === 'cloudinary') {
    setProgress(40);
    updateStatus('☁️ ' + event.message, '');
  } else if (step === 'youtube') {
    setProgress(70);
    updateStatus('📤 ' + event.message, '');
  } else if (step === 'cleanup') {
    setProgress(90);
    updateStatus('🧹 ' + event.message, '');
  } else if (step === 'init') {
    setProgress(5);
    updateStatus(`🚀 ${event.message}`, '');
  } else if (step === 'batch-processing') {
    const total = event.total || 1;
    const reel  = event.reel  || 1;
    const status = event.status;

    const reelFraction = (reel - 1) / total;
    const msgFraction  = status === 'success' ? 1 : status === 'error' ? 1 : 0.5;
    const progress = Math.round(5 + 85 * (reelFraction + msgFraction / total));
    setProgress(Math.min(progress, 90));

    let icon = '⚙️';
    if (status === 'starting')    icon = '▶️';
    if (status === 'processing')  icon = '🔄';
    if (status === 'success')     icon = '✅';
    if (status === 'error')       icon = '❌';

    appendLog(`${icon} [${reel}/${total}] ${event.message}`);
    updateStatus(`${icon} ${event.message}`, status === 'error' ? 'error' : '');

  } else if (step === 'complete') {
    setProgress(100);
    if (event.videoUrl) {
      updateStatus('✅ Upload completed successfully!', 'success');
      const link = document.createElement('a');
      link.href = event.videoUrl;
      link.target = '_blank';
      link.textContent = 'View uploaded video';
      link.className = 'upload-link';
      statusMessage.innerHTML = '';
      statusMessage.appendChild(link);
    } else {
      const success  = event.success  || 0;
      const failures = event.failures || 0;
      const msg = `✅ Done! ${success} uploaded, ${failures} failed.`;
      updateStatus(msg, failures ? 'error' : 'success');
      appendLog(msg);
    }
    uploadButton.disabled = false;
  } else if (step === 'error') {
    updateStatus('❌ ' + (event.message || 'Upload failed.'), 'error');
    uploadButton.disabled = false;
  }
}

uploadButton.addEventListener('click', async () => {
  if (!currentVideoUrl) {
    updateStatus('No video detected.', 'error');
    return;
  }

  if (currentPlatform === 'youtube' && !isValidYouTubeUrl(currentVideoUrl)) {
    updateStatus('Invalid YouTube URL.', 'error');
    return;
  }

  if (currentPlatform === 'instagram' && !isValidInstagramReelUrl(currentVideoUrl)) {
    updateStatus('Invalid Instagram URL.', 'error');
    return;
  }

  // Handle schedule path
  if (scheduleToggle.checked) {
    const scheduledTime = scheduleTimeInput.value;
    if (!scheduledTime) {
      updateStatus('Please select a publish date and time.', 'error');
      return;
    }

    const scheduledDate = new Date(scheduledTime);
    const minLeadTime = 5 * 60 * 1000; // 5 mins
    const now = new Date();

    if (scheduledDate.getTime() - now.getTime() < minLeadTime) {
      updateStatus('Scheduled time must be at least 5 minutes in the future.', 'error');
      return;
    }

    uploadButton.disabled = true;
    uploadButton.textContent = '⏳ Scheduling…';
    updateStatus('Scheduling video...', 'info');

    try {
      const trimmedTitle = titleInput.value.trim();
      const trimmedDesc  = descriptionInput.value.trim();
      
      const response = await fetch(`${BACKEND_URL}/api/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: currentVideoUrl,
          title: trimmedTitle || undefined,
          description: trimmedDesc || undefined,
          privacy: privacySelect.value,
          platform: currentPlatform,
          scheduledAt: scheduledDate.toISOString(),
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Failed to schedule: ${response.statusText}`);
      }

      updateStatus('✅ Video scheduled successfully!', 'success');
      
      titleInput.value = '';
      descriptionInput.value = '';
      scheduleToggle.checked = false;
      scheduleTimeContainer.style.display = 'none';
      uploadButton.textContent = 'Upload';

      setTimeout(() => {
        tabScheduled.click();
      }, 1500);

    } catch (error) {
      updateStatus('❌ ' + (error.message || 'Scheduling failed.'), 'error');
    } finally {
      uploadButton.disabled = false;
    }
    return;
  }

  // Regular Upload Now Path
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
      const trimmedTitle = titleInput.value.trim();
      const trimmedDesc  = descriptionInput.value.trim();
      const response = await fetch(`${BACKEND_URL}/api/process-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: [currentVideoUrl],
          defaultCredit: true,
          globalTitle: trimmedTitle || undefined,
          globalDescription: trimmedDesc || undefined,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Backend request failed: ${response.statusText || response.status}`);
      }

      const reader = response.body.getReader();
      await parseNdjsonStream(reader);
    } else {
      const trimmedTitle = titleInput.value.trim();
      const trimmedDesc  = descriptionInput.value.trim();
      const response = await fetch(`${BACKEND_URL}/api/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: currentVideoUrl,
          title: trimmedTitle || undefined,
          description: trimmedDesc || undefined,
          privacy: privacySelect.value,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Backend request failed: ${response.statusText || response.status}`);
      }

      const reader = response.body.getReader();
      await parseNdjsonStream(reader);
    }
  } catch (error) {
    updateStatus('❌ ' + (error.message || 'Upload failed.'), 'error');
    uploadButton.disabled = false;
  } finally {
    restoreButton();
  }
});

window.addEventListener('DOMContentLoaded', loadVideoInfo);
