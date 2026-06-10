const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const cloudinary = require('cloudinary').v2;
const { google } = require('googleapis');
const cron = require('node-cron');
const multer = require('multer');

const YTDLP_COMMAND = process.env.YTDLP_COMMAND || 'yt-dlp';

const instagram = require('./utils/instagram');
const quota = require('./utils/quota');
const scheduler = require('./utils/scheduler');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const DOWNLOADS_DIR = path.resolve(__dirname, 'downloads');

fs.ensureDirSync(DOWNLOADS_DIR);
fs.ensureDirSync(path.resolve(__dirname, 'cookies'));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Shared OAuth2 client — used only for auth URL generation & token exchange
const baseOAuth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  process.env.YOUTUBE_REDIRECT_URI
);

// ─── Per-user YouTube client ─────────────────────────────────────────────────
async function getYouTubeClient(userId) {
  const tokens = await db.loadTokens(userId);
  if (!tokens) {
    throw new Error('YouTube account not connected. Please connect your account in the extension.');
  }
  const client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI
  );
  client.setCredentials(tokens);
  // Persist refreshed tokens automatically
  client.on('tokens', async (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    await db.saveTokens(userId, merged);
    console.log(`[Auth] Tokens refreshed for user ${userId}`);
  });
  return google.youtube({ version: 'v3', auth: client });
}

// ─── Video helpers ───────────────────────────────────────────────────────────
function getYoutubeCookiesPath(userId) {
  return path.resolve(__dirname, 'cookies', `youtube_cookies_${userId}.txt`);
}

function hasYoutubeCookies(userId) {
  return fs.pathExists(getYoutubeCookiesPath(userId));
}

async function saveYoutubeCookies(userId, fileContent) {
  const cookiePath = getYoutubeCookiesPath(userId);
  await fs.ensureDir(path.dirname(cookiePath));
  await fs.writeFile(cookiePath, fileContent);
}

async function deleteYoutubeCookies(userId) {
  const cookiePath = getYoutubeCookiesPath(userId);
  await fs.remove(cookiePath);
}

function extractTitleFromUrl(videoUrl) {
  try {
    const url = new URL(videoUrl);
    if (url.hostname.includes('youtube.com')) {
      const videoId = url.searchParams.get('v');
      if (videoId) return `YouTube Short ${videoId}`;
      return url.pathname.split('/').filter(Boolean).pop() || 'YouTube Short';
    }
  } catch { }
  return 'YouTube Short';
}

function downloadVideo(videoUrl, outputPath, userId) {
  return new Promise((resolve, reject) => {
    const attempts = [];
    const userCookiesPath = getYoutubeCookiesPath(userId);
    const hasCookiesFile = userId && fs.existsSync(userCookiesPath);

    const formats = ['bestvideo[height<=1080]+bestaudio/best', 'best[height<=1080]/best', 'best'];
    const clientConfigs = [
      { name: 'android,ios', args: ['--extractor-args', 'youtube:player-client=android,ios'] },
      { name: 'web_embedded,web,tv', args: ['--extractor-args', 'youtube:player-client=web_embedded,web,tv'] },
      { name: 'default', args: [] }
    ];

    // Build combinations: cookies first, then anonymous.
    if (hasCookiesFile) {
      for (const clientConfig of clientConfigs) {
        for (const format of formats) {
          attempts.push({ format, clientConfig, useCookies: true });
        }
      }
    }
    for (const clientConfig of clientConfigs) {
      for (const format of formats) {
        attempts.push({ format, clientConfig, useCookies: false });
      }
    }

    const buildArgs = (formatString, clientConfig, useCookies) => {
      const args = [
        '--no-playlist',
        '--no-warnings',
        '--js-runtimes', 'node',
        '--merge-output-format', 'mp4',
        '--recode-video', 'mp4',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '-o', outputPath
      ];
      // Add client configuration arguments (e.g., extractor args)
      if (clientConfig && clientConfig.args) {
        args.push(...clientConfig.args);
      }
      if (formatString) {
        args.unshift('-f', formatString);
      }
      if (useCookies && hasCookiesFile) {
        args.unshift('--cookies', userCookiesPath);
      }
      args.push(videoUrl);
      return args;
    };

    const tryAttempt = (index, lastError = null) => {
      if (index >= attempts.length) {
        return reject(lastError || new Error('yt-dlp failed to download the video after trying all format, client, and cookie fallbacks.'));
      }

      const { format, clientConfig, useCookies } = attempts[index];
      const args = buildArgs(format, clientConfig, useCookies);
      
      console.log(`[Download] Attempt ${index + 1}/${attempts.length}: format=${format}, client=${clientConfig.name}, cookies=${useCookies}`);
      
      const ytProcess = spawn(YTDLP_COMMAND, args);
      let stderr = '';
      let stdout = '';

      ytProcess.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      ytProcess.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      ytProcess.on('error', (error) => {
        if (error.code === 'ENOENT') {
          return reject(new Error('yt-dlp executable not found. Install yt-dlp or set YTDLP_COMMAND to a valid command.'));
        }
        reject(error);
      });

      ytProcess.on('close', async (code) => {
        const errorMsg = stderr.trim() || stdout.trim();
        if (code !== 0) {
          const isBotBlock = 
            errorMsg.includes('Sign in to confirm you\'re not a bot') ||
            errorMsg.includes('confirm you are not a bot') ||
            errorMsg.includes('403 Forbidden') ||
            errorMsg.includes('429 Too Many Requests');

          let nextIndex = index + 1;
          if (isBotBlock) {
            // Skip other formats under the current group (useCookies + clientConfig)
            while (
              nextIndex < attempts.length &&
              attempts[nextIndex].useCookies === useCookies &&
              attempts[nextIndex].clientConfig.name === clientConfig.name
            ) {
              nextIndex++;
            }
            console.warn(`yt-dlp attempt ${index} blocked (bot detection). Skipping remaining formats in group ${clientConfig.name} (cookies=${useCookies}). Trying next group at index ${nextIndex}...`);
          } else {
            console.warn(`yt-dlp attempt ${index} failed: format=${format}, client=${clientConfig.name}, cookies=${useCookies}. Error: ${errorMsg}. Trying next attempt...`);
          }

          return tryAttempt(nextIndex, new Error(`yt-dlp exited with code ${code}: ${errorMsg}`));
        }

        try {
          const exists = await fs.pathExists(outputPath);
          if (!exists) return reject(new Error('Downloaded video file not found.'));
          resolve(outputPath);
        } catch (error) {
          reject(error);
        }
      });
    };

    tryAttempt(0);
  });
}

async function uploadToCloudinary(localPath) {
  const publicId = `temp_${Date.now()}`;
  const result = await cloudinary.uploader.upload(localPath, {
    public_id: publicId,
    resource_type: 'video',
    folder: 'youtube_shorts_temp',
  });
  return { secure_url: result.secure_url, public_id: result.public_id };
}

async function uploadToYouTube(localPath, title, description, privacy = 'unlisted', videoUrl, publishAt = null, userId) {
  const ytClient = await getYouTubeClient(userId);

  const rawTitle = title || extractTitleFromUrl(videoUrl || localPath);
  let preparedTitle = rawTitle.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (preparedTitle.length > 95) preparedTitle = preparedTitle.substring(0, 92) + '...';
  const finalTitle = preparedTitle || 'YouTube Short';
  const preparedDescription = `${description || ''}\n\n#Shorts`.trim();

  let privacyStatus = privacy === 'public' ? 'public' : 'unlisted';
  const statusBody = { privacyStatus };
  if (publishAt) {
    statusBody.privacyStatus = 'private';
    statusBody.publishAt = new Date(publishAt).toISOString();
  }

  const response = await ytClient.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title: finalTitle, description: preparedDescription, tags: ['Shorts'] },
      status: statusBody,
    },
    media: { body: fs.createReadStream(localPath) },
  });

  return { id: response.data.id, url: `https://youtu.be/${response.data.id}` };
}

async function cleanupCloudinaryVideo(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
    console.log(`Cloudinary cleanup: ${publicId}`);
  } catch (error) {
    console.error(`Error cleaning Cloudinary resource ${publicId}:`, error.message);
  }
}

async function cleanupOrphanCloudinaryVideos() {
  try {
    const response = await cloudinary.api.resources({
      type: 'upload',
      resource_type: 'video',
      prefix: 'youtube_shorts_temp/',
      max_results: 100,
    });
    const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
    for (const resource of (response.resources || [])) {
      if (new Date(resource.created_at).getTime() < cutoffMs) {
        await cloudinary.uploader.destroy(resource.public_id, { resource_type: 'video' });
        console.log(`Deleted orphan Cloudinary video: ${resource.public_id}`);
      }
    }
  } catch (error) {
    console.error('Error running orphan Cloudinary cleanup:', error.message);
  }
}

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  dest: instagram.COOKIES_DIR,
  limits: { fileSize: 1 * 1024 * 1024 },
});

// ─── Authentication Middleware ────────────────────────────────────────────────
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  try {
    const { rows } = await db.pool.query(
      'SELECT user_id, expires_at FROM sessions WHERE session_id = $1',
      [token]
    );
    const session = rows[0];
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    if (new Date(session.expires_at) <= new Date()) {
      await db.pool.query('DELETE FROM sessions WHERE session_id = $1', [token]);
      return res.status(401).json({ error: 'Session expired' });
    }

    req.userId = session.user_id;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
}

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Auth Endpoints ───────────────────────────────────────────────────────────

/**
 * GET /api/auth/youtube
 * Initiates YouTube OAuth flow by generating state nonce and temporary user record.
 */
app.get('/api/auth/youtube', async (req, res) => {
  try {
    const crypto = require('crypto');
    const userId = crypto.randomUUID();
    const nonce = crypto.randomBytes(32).toString('hex');

    await db.pool.query(
      'INSERT INTO oauth_nonces (nonce, user_id) VALUES ($1, $2)',
      [nonce, userId]
    );

    const authUrl = baseOAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      prompt: 'consent',
      state: nonce,
    });

    res.json({ authUrl, nonce });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auth/callback?code=...&state=<nonce>
 * Exchanges auth code for tokens and saves them, generating sessionToken.
 */
app.get('/api/auth/callback', async (req, res, next) => {
  const { code, state: nonce } = req.query;
  if (!code) return res.status(400).send('<h1>Missing authorization code</h1>');
  if (!nonce) return res.status(400).send('<h1>Missing state/nonce</h1>');

  try {
    const { rows: nonceRows } = await db.pool.query(
      'SELECT user_id FROM oauth_nonces WHERE nonce = $1',
      [nonce]
    );
    if (nonceRows.length === 0) {
      return res.status(400).send('<h1>Invalid or expired state nonce</h1>');
    }
    const userId = nonceRows[0].user_id;

    const { tokens } = await baseOAuth2Client.getToken(code);

    let email = null;
    try {
      const tokenInfo = await baseOAuth2Client.getTokenInfo(tokens.access_token);
      email = tokenInfo.email;
    } catch { }

    await db.saveTokens(userId, tokens, email);

    const crypto = require('crypto');
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90); // 90 days

    await db.pool.query(
      'INSERT INTO sessions (session_id, user_id, expires_at) VALUES ($1, $2, $3)',
      [sessionToken, userId, expiresAt]
    );

    await db.pool.query(
      'UPDATE oauth_nonces SET session_token = $1, email = $2 WHERE nonce = $3',
      [sessionToken, email, nonce]
    );

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>YouTube Connected!</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: system-ui, sans-serif;
              background: #090d16;
              color: #f8fafc;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
            }
            .card {
              background: rgba(30,41,59,0.8);
              border: 1px solid rgba(255,255,255,0.1);
              border-radius: 20px;
              padding: 48px 40px;
              text-align: center;
              max-width: 420px;
              width: 90%;
              backdrop-filter: blur(16px);
            }
            .icon { font-size: 3.5rem; margin-bottom: 20px; }
            h1 { font-size: 1.6rem; font-weight: 700; color: #34d399; margin-bottom: 8px; }
            .email { color: #38bdf8; font-size: 1rem; font-weight: 500; margin: 12px 0; }
            p { color: #94a3b8; font-size: 0.9rem; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✅</div>
            <h1>YouTube Connected!</h1>
            ${email ? `<div class="email">${email}</div>` : ''}
            <p>Your account has been linked successfully. You can close this tab and return to the extension.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/poll?nonce=<nonce>
 * Allows Chrome extension to poll and check if the YouTube connection has finished, returning sessionToken.
 */
app.get('/api/auth/poll', async (req, res) => {
  const { nonce } = req.query;
  if (!nonce) return res.status(400).json({ error: 'Missing nonce' });

  try {
    const { rows } = await db.pool.query(
      'SELECT session_token, email FROM oauth_nonces WHERE nonce = $1',
      [nonce]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Nonce not found or expired' });
    }

    const { session_token, email } = rows[0];
    if (session_token) {
      await db.pool.query('DELETE FROM oauth_nonces WHERE nonce = $1', [nonce]);
      res.json({ connected: true, sessionToken: session_token, email });
    } else {
      res.json({ connected: false });
    }
  } catch (error) {
    console.error('Error polling auth status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auth/status
 * Verifies if user session is valid.
 */
app.get('/api/auth/status', authenticateToken, async (req, res) => {
  try {
    const userInfo = await db.getUserInfo(req.userId);
    if (!userInfo) return res.json({ connected: false });
    res.json({ connected: true, email: userInfo.email });
  } catch (error) {
    console.error('Error checking auth status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/auth/logout
 * Logs out user by destroying tokens and current session.
 */
app.delete('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    await db.deleteTokens(req.userId);
    await db.pool.query('DELETE FROM sessions WHERE user_id = $1', [req.userId]);
    res.json({ success: true, message: 'Account disconnected successfully.' });
  } catch (error) {
    console.error('Error logging out:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Upload Endpoints ─────────────────────────────────────────────────────────

/**
 * POST /api/process
 * Single YouTube video upload. Bypasses Cloudinary and respects quotas.
 */
app.post('/api/process', authenticateToken, async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendStep = (payload) => res.write(`${JSON.stringify(payload)}\n`);

  let downloadedPath = null;

  try {
    const { videoUrl, title, description, privacy } = req.body || {};

    if (!videoUrl || typeof videoUrl !== 'string') throw new Error('Missing videoUrl');

    const allowed = await quota.isUploadAllowed(1);
    if (!allowed) {
      const remaining = await quota.getRemainingUploads();
      throw new Error(`Daily quota exceeded. Remaining uploads: ${remaining}`);
    }

    downloadedPath = path.join(DOWNLOADS_DIR, `download-${Date.now()}.mp4`);
    sendStep({ step: 'downloading', message: 'Starting video download...' });
    await downloadVideo(videoUrl, downloadedPath, req.userId);
    sendStep({ step: 'downloading', message: 'Video download complete.' });

    // Cloudinary upload bypassed - directly uploading downloadedPath to YouTube

    sendStep({ step: 'youtube', message: 'Starting YouTube upload...' });
    const youtubeResult = await uploadToYouTube(downloadedPath, title, description, privacy, videoUrl, null, req.userId);
    sendStep({ step: 'youtube', message: 'YouTube upload complete.', videoId: youtubeResult.id, videoUrl: youtubeResult.url });

    await quota.incrementUploadCount(1);

    sendStep({ step: 'cleanup', message: 'Cleaning temporary files...' });
    if (downloadedPath) { await fs.remove(downloadedPath); downloadedPath = null; }

    sendStep({ step: 'complete', message: 'Process completed successfully.', videoId: youtubeResult.id, videoUrl: youtubeResult.url });
  } catch (error) {
    console.error('Process error:', error);
    sendStep({ step: 'error', message: error.message || 'Unknown error' });
  } finally {
    if (downloadedPath) await fs.remove(downloadedPath).catch(() => {});
    res.end();
  }
});

/**
 * POST /api/process-batch
 * Batch upload Instagram Reels. Respects quotas.
 */
app.post('/api/process-batch', authenticateToken, async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendStep = (payload) => res.write(`${JSON.stringify(payload)}\n`);

  try {
    const { urls = [], defaultCredit = true, globalTitle = '', globalDescription = '' } = req.body || {};

    if (!Array.isArray(urls) || urls.length === 0) throw new Error('Missing or empty urls array');
    if (urls.length > 10) throw new Error('Maximum 10 reels per batch submission');

    const allowed = await quota.isUploadAllowed(urls.length);
    if (!allowed) {
      const remaining = await quota.getRemainingUploads();
      throw new Error(`Daily quota exceeded. Remaining uploads: ${remaining}`);
    }

    sendStep({ step: 'init', message: `Starting batch processing of ${urls.length} reel(s)`, total: urls.length });

    let successCount = 0;
    let failureCount = 0;

    for (let index = 0; index < urls.length; index++) {
      const url = urls[index];
      const reelIndex = index + 1;

      try {
        sendStep({ step: 'batch-processing', message: `Processing reel ${reelIndex}/${urls.length}: ${url}`, reel: reelIndex, total: urls.length, status: 'starting' });

        if (index > 0) {
          const delay = Math.random() * 3000 + 2000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        await processInstagramReel(
          url,
          globalTitle,
          globalDescription,
          defaultCredit,
          (message) => {
            sendStep({ step: 'batch-processing', message: `Reel ${reelIndex}: ${message}`, reel: reelIndex, total: urls.length, status: 'processing' });
          },
          null,
          req.userId
        );

        successCount++;
        sendStep({ step: 'batch-processing', message: `Reel ${reelIndex} uploaded successfully`, reel: reelIndex, total: urls.length, status: 'success' });
      } catch (error) {
        failureCount++;
        console.error(`Reel ${reelIndex} failed:`, error.message);
        sendStep({ step: 'batch-processing', message: `Reel ${reelIndex} failed: ${error.message}`, reel: reelIndex, total: urls.length, status: 'error' });
      }
    }

    await quota.incrementUploadCount(successCount);
    const quotaInfo = await quota.getQuotaInfo();

    sendStep({ step: 'complete', message: `Batch complete. Success: ${successCount}, Failures: ${failureCount}`, success: successCount, failures: failureCount, quota: quotaInfo });
  } catch (error) {
    console.error('Batch process error:', error);
    sendStep({ step: 'error', message: error.message || 'Unknown error' });
  }

  res.end();
});

// ─── Instagram Cookie Endpoints ───────────────────────────────────────────────

app.get('/api/instagram/cookies/status', authenticateToken, async (req, res) => {
  try {
    const hasCookies = await instagram.hasCookies(req.userId);
    res.json({ hasCookies, message: hasCookies ? 'Cookies available' : 'No cookies found.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/instagram/cookies', authenticateToken, upload.single('cookies'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileContent = await fs.readFile(req.file.path);
    await instagram.saveCookies(req.userId, fileContent);
    await fs.remove(req.file.path);
    res.json({ success: true, message: 'Instagram cookies uploaded and saved successfully' });
  } catch (error) {
    if (req.file) await fs.remove(req.file.path).catch(() => {});
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/instagram/cookies', authenticateToken, async (req, res) => {
  try {
    await instagram.deleteCookies(req.userId);
    res.json({ success: true, message: 'Instagram cookies deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/youtube/cookies/status', authenticateToken, async (req, res) => {
  try {
    const hasCookies = await hasYoutubeCookies(req.userId);
    res.json({ hasCookies, message: hasCookies ? 'YouTube cookies available' : 'No YouTube cookies found.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/youtube/cookies', authenticateToken, upload.single('cookies'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileContent = await fs.readFile(req.file.path);
    await saveYoutubeCookies(req.userId, fileContent);
    await fs.remove(req.file.path);
    res.json({ success: true, message: 'YouTube cookies uploaded and saved successfully' });
  } catch (error) {
    if (req.file) await fs.remove(req.file.path).catch(() => {});
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/youtube/cookies', authenticateToken, async (req, res) => {
  try {
    await deleteYoutubeCookies(req.userId);
    res.json({ success: true, message: 'YouTube cookies deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Quota ────────────────────────────────────────────────────────────────────
app.get('/api/quota', authenticateToken, async (req, res) => {
  try {
    const quotaInfo = await quota.getQuotaInfo();
    res.json(quotaInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── processInstagramReel ─────────────────────────────────────────────────────
async function processInstagramReel(reelUrl, globalTitle, globalDescription, creditUser, progressCallback, publishAt = null, userId) {
  let downloadedPath = null;

  try {
    progressCallback('Extracting metadata...');
    const metadata = await instagram.extractInstagramMetadata(reelUrl, userId);

    progressCallback('Downloading reel...');
    downloadedPath = path.join(DOWNLOADS_DIR, `instagram-${Date.now()}.mp4`);
    await instagram.downloadInstagramReel(reelUrl, downloadedPath, userId);

    // Cloudinary upload bypassed

    progressCallback('Uploading to YouTube...');
    const rawCaption = (metadata.caption || '').replace(/[\r\n]+/g, ' ').trim();
    const title = (globalTitle && globalTitle.trim()) ||
                  (rawCaption && rawCaption.substring(0, 80)) ||
                  'Instagram Reel';

    let description = globalDescription || metadata.caption || '';
    if (creditUser) {
      const formatDate = metadata.uploadDate ? formatInstagramDate(metadata.uploadDate) : '';
      description += `\n\n🔄 Originally posted on Instagram by @${metadata.uploader}`;
      if (formatDate) description += `\n📅 Date: ${formatDate}`;
      description += '\n#Shorts #InstagramReels';
    } else {
      description += '\n\n#Shorts';
    }

    const privacy = publishAt ? 'private' : 'unlisted';
    const youtubeResult = await uploadToYouTube(downloadedPath, title, description, privacy, reelUrl, publishAt, userId);

    progressCallback('Cleaning up...');
    if (downloadedPath) { await fs.remove(downloadedPath); downloadedPath = null; }

    progressCallback(`Uploaded: ${youtubeResult.url}`);
    return youtubeResult;
  } catch (error) {
    throw error;
  } finally {
    if (downloadedPath) await fs.remove(downloadedPath).catch(() => {});
  }
}

function formatInstagramDate(uploadDate) {
  if (!uploadDate || uploadDate.length !== 8) return '';
  return `${uploadDate.substring(6, 8)}/${uploadDate.substring(4, 6)}/${uploadDate.substring(0, 4)}`;
}

// ─── Scheduling Helper & Cron ─────────────────────────────────────────────────
async function executeScheduledJob(job) {
  let downloadedPath = null;

  try {
    const allowed = await quota.isUploadAllowed(1);
    if (!allowed) throw new Error('Daily upload quota exceeded. Scheduled job failed.');

    console.log(`[Scheduler] Processing job ${job.id} for user ${job.userId}`);

    let youtubeResult;

    if (job.platform === 'instagram') {
      youtubeResult = await processInstagramReel(
        job.videoUrl,
        job.title,
        job.description,
        true,
        (msg) => console.log(`[Job ${job.id}]: ${msg}`),
        job.scheduledAt,
        job.userId
      );
    } else {
      downloadedPath = path.join(DOWNLOADS_DIR, `scheduled-${Date.now()}.mp4`);
      console.log(`[Job ${job.id}] Downloading...`);
      await downloadVideo(job.videoUrl, downloadedPath, job.userId);

      console.log(`[Job ${job.id}] Uploading to YouTube...`);
      youtubeResult = await uploadToYouTube(
        downloadedPath, job.title, job.description, job.privacy,
        job.videoUrl, job.scheduledAt, job.userId
      );

      if (downloadedPath) { await fs.remove(downloadedPath); downloadedPath = null; }
    }

    await quota.incrementUploadCount(1);
    await scheduler.updateJob(job.id, { status: 'done', videoId: youtubeResult.id, videoUrlResult: youtubeResult.url });
    console.log(`[Scheduler] Job ${job.id} complete: ${youtubeResult.url}`);
  } catch (error) {
    console.error(`[Scheduler] Job ${job.id} failed:`, error);
    await scheduler.updateJob(job.id, { status: 'error', error: error.message || 'Unknown error' });
  } finally {
    if (downloadedPath) await fs.remove(downloadedPath).catch(() => {});
  }
}

cron.schedule('* * * * *', async () => {
  try {
    const claimedJobs = await scheduler.claimDueJobs();
    if (claimedJobs.length > 0) {
      console.log(`[Scheduler] Claimed ${claimedJobs.length} due job(s)`);
      for (const job of claimedJobs) await executeScheduledJob(job);
    }
  } catch (error) {
    console.error('[Scheduler] Error running due jobs check:', error);
  }
});

// ─── Schedule Endpoints ───────────────────────────────────────────────────────

/**
 * POST /api/schedule
 * Schedule a video upload.
 */
app.post('/api/schedule', authenticateToken, async (req, res) => {
  try {
    const { videoUrl, title, description, privacy, platform, scheduledAt } = req.body || {};

    if (!videoUrl) return res.status(400).json({ error: 'Missing videoUrl' });
    if (!scheduledAt) return res.status(400).json({ error: 'Missing scheduledAt' });

    const parsedDate = new Date(scheduledAt);
    if (isNaN(parsedDate.getTime())) return res.status(400).json({ error: 'Invalid scheduledAt format' });
    if (parsedDate <= new Date()) return res.status(400).json({ error: 'scheduledAt must be in the future' });

    const job = await scheduler.addJob({
      userId: req.userId, videoUrl, title, description, privacy, platform,
      scheduledAt: parsedDate.toISOString(),
    });

    res.json(job);
  } catch (error) {
    console.error('Error adding scheduled job:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/schedule
 * List all jobs for the authenticated user.
 */
app.get('/api/schedule', authenticateToken, async (req, res) => {
  try {
    const jobs = await scheduler.getJobs(req.userId);
    res.json(jobs);
  } catch (error) {
    console.error('Error listing scheduled jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/schedule/:id
 * Cancel a pending job for the authenticated user.
 */
app.delete('/api/schedule/:id', authenticateToken, async (req, res) => {
  try {
    const job = await db.pool.query('SELECT user_id FROM scheduled_jobs WHERE id = $1', [req.params.id]);
    if (job.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found.' });
    }
    if (job.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized to cancel this job.' });
    }

    const removed = await scheduler.removeJob(req.params.id);
    if (removed) {
      res.json({ success: true, message: 'Job cancelled successfully.' });
    } else {
      res.status(400).json({ error: 'Job not found or already running/completed.' });
    }
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ─── Periodic cleanup ─────────────────────────────────────────────────────────
cron.schedule('0 */6 * * *', async () => {
  console.log('Running orphan Cloudinary cleanup...');
  await cleanupOrphanCloudinaryVideos();
});

cleanupOrphanCloudinaryVideos().catch((err) => {
  console.error('Initial Cloudinary cleanup error:', err.message);
});

// ─── Start ────────────────────────────────────────────────────────────────────
console.log('[backend] Using yt-dlp command:', YTDLP_COMMAND);
db.initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error('[FATAL] DB init failed:', err);
    process.exit(1);
  });
