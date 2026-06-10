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

const instagram = require('./utils/instagram');
const quota = require('./utils/quota');
const scheduler = require('./utils/scheduler');
const db = require('./db');


const PORT = process.env.PORT || 3000;
const DOWNLOADS_DIR = path.resolve(__dirname, 'downloads');
const COOKIES_DIR = path.resolve(__dirname, 'cookies');
const YOUTUBE_COOKIES_PATH = path.join(COOKIES_DIR, 'youtube.txt');

fs.ensureDirSync(DOWNLOADS_DIR);
fs.ensureDirSync(COOKIES_DIR);

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

function buildYtdlpArgs(videoUrl, outputPath, strategy = 'best') {
  // strategy: 'best' (full), 'simple' (-f best), 'video-only' (best video without audio merge)
  const baseArgs = [
    '--no-playlist',
    '--retries', '5',
    '--fragment-retries', '5',
    '--extractor-args', 'youtube:player_client=android,skip=hls/dash',
    '--user-agent', 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    '--socket-timeout', '30',
    '--sleep-interval', '2',
    '--max-sleep-interval', '8',
    '-o', outputPath,
    videoUrl,
  ];

  if (strategy === 'best') {
    baseArgs.splice(1, 0, '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best', '--merge-output-format', 'mp4');
  } else if (strategy === 'video-only') {
    baseArgs.splice(1, 0, '-f', 'best[ext=mp4]');
  } else if (strategy === 'simple') {
    baseArgs.splice(1, 0, '-f', 'b');
  } else if (strategy === 'any') {
    // No format spec - let yt-dlp choose
  }

  if (fs.pathExistsSync(YOUTUBE_COOKIES_PATH)) {
    baseArgs.unshift(`--cookies=${YOUTUBE_COOKIES_PATH}`);
    console.log('[yt-dlp] Using YouTube cookies file for download');
  } else {
    console.warn('[yt-dlp] No YouTube cookies file found. If downloads fail with bot-check errors, upload cookies via /api/youtube/cookies');
  }

  return baseArgs;
}

function runYtdlp(args) {
  return new Promise((resolve, reject) => {
    const ytProcess = spawn('yt-dlp', args);
    let stderr = '';

    ytProcess.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    ytProcess.on('error', reject);
    ytProcess.on('close', async (code) => {
      if (code !== 0) {
        const errText = stderr.trim();
        return reject(new Error(`yt-dlp exited with code ${code}: ${errText}`));
      }
      resolve();
    });
  });
}

async function downloadVideo(videoUrl, outputPath) {
  const strategies = ['best', 'video-only', 'simple', 'any'];
  let lastError = null;

  for (const strategy of strategies) {
    try {
      console.log(`[yt-dlp] Attempting download with strategy: ${strategy}`);
      const args = buildYtdlpArgs(videoUrl, outputPath, strategy);
      await runYtdlp(args);
      console.log(`[yt-dlp] Download succeeded with strategy: ${strategy}`);
      break;
    } catch (error) {
      lastError = error;
      const message = error.message || '';
      console.warn(`[yt-dlp] Strategy "${strategy}" failed. Trying next strategy...`);

      if (message.includes('Sign in to confirm') || message.includes('not a bot')) {
        throw new Error(
          'YouTube is blocking the download (bot check). Please upload YouTube cookies via the Account tab → "Upload YouTube Cookies" to fix this.'
        );
      }

      if (strategy === 'any') {
        throw new Error(`All download strategies failed. Last error: ${message}`);
      }
    }
  }

  const exists = await fs.pathExists(outputPath);
  if (!exists) throw new Error('Downloaded video file not found.');
  return outputPath;
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

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Auth Endpoints ───────────────────────────────────────────────────────────

/**
 * GET /api/auth/youtube?userId=<uuid>
 * Returns Google OAuth URL with userId embedded in state param.
 */
app.get('/api/auth/youtube', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const authUrl = baseOAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    prompt: 'consent',
    state: userId,
  });

  res.json({ authUrl });
});

/**
 * GET /api/auth/callback?code=...&state=<userId>
 * Exchanges auth code for tokens and saves them to NeonDB.
 */
app.get('/api/auth/callback', async (req, res, next) => {
  const { code, state: userId } = req.query;
  if (!code) return res.status(400).send('<h1>Missing authorization code</h1>');
  if (!userId) return res.status(400).send('<h1>Missing state (userId)</h1>');

  try {
    const { tokens } = await baseOAuth2Client.getToken(code);

    let email = null;
    try {
      const tokenInfo = await baseOAuth2Client.getTokenInfo(tokens.access_token);
      email = tokenInfo.email;
    } catch { }

    await db.saveTokens(userId, tokens, email);

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
 * GET /api/auth/status?userId=<uuid>
 * Returns whether the user has connected their account.
 */
app.get('/api/auth/status', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    const userInfo = await db.getUserInfo(userId);
    if (!userInfo) return res.json({ connected: false });
    res.json({ connected: true, email: userInfo.email });
  } catch (error) {
    console.error('Error checking auth status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/auth/logout?userId=<uuid>
 * Removes the user's tokens from NeonDB.
 */
app.delete('/api/auth/logout', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    await db.deleteTokens(userId);
    res.json({ success: true, message: 'Account disconnected successfully.' });
  } catch (error) {
    console.error('Error logging out:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Upload Endpoints ─────────────────────────────────────────────────────────

/**
 * POST /api/process
 * Single YouTube video upload. Requires userId in body.
 */
app.post('/api/process', async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendStep = (payload) => res.write(`${JSON.stringify(payload)}\n`);

  let downloadedPath = null;
  let cloudinaryPublicId = null;

  try {
    const { videoUrl, title, description, privacy, userId } = req.body || {};

    if (!userId) throw new Error('Missing userId — please connect your YouTube account.');
    if (!videoUrl || typeof videoUrl !== 'string') throw new Error('Missing videoUrl');

    downloadedPath = path.join(DOWNLOADS_DIR, `download-${Date.now()}.mp4`);
    sendStep({ step: 'downloading', message: 'Starting video download...' });
    await downloadVideo(videoUrl, downloadedPath);
    sendStep({ step: 'downloading', message: 'Video download complete.' });

    sendStep({ step: 'cloudinary', message: 'Uploading video to Cloudinary...' });
    const cloudinaryResult = await uploadToCloudinary(downloadedPath);
    cloudinaryPublicId = cloudinaryResult.public_id;
    sendStep({ step: 'cloudinary', message: 'Cloudinary upload complete.', secureUrl: cloudinaryResult.secure_url });

    sendStep({ step: 'youtube', message: 'Starting YouTube upload...' });
    const youtubeResult = await uploadToYouTube(downloadedPath, title, description, privacy, videoUrl, null, userId);
    sendStep({ step: 'youtube', message: 'YouTube upload complete.', videoId: youtubeResult.id, videoUrl: youtubeResult.url });

    sendStep({ step: 'cleanup', message: 'Cleaning temporary files...' });
    await cleanupCloudinaryVideo(cloudinaryPublicId);
    cloudinaryPublicId = null;
    if (downloadedPath) { await fs.remove(downloadedPath); downloadedPath = null; }

    sendStep({ step: 'complete', message: 'Process completed successfully.', videoId: youtubeResult.id, videoUrl: youtubeResult.url });
  } catch (error) {
    console.error('Process error:', error);
    sendStep({ step: 'error', message: error.message || 'Unknown error' });
  } finally {
    if (cloudinaryPublicId) await cleanupCloudinaryVideo(cloudinaryPublicId);
    if (downloadedPath) await fs.remove(downloadedPath).catch(() => {});
    res.end();
  }
});

/**
 * POST /api/process-batch
 * Batch upload Instagram Reels. Requires userId in body.
 */
app.post('/api/process-batch', async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendStep = (payload) => res.write(`${JSON.stringify(payload)}\n`);

  try {
    const { urls = [], defaultCredit = true, globalTitle = '', globalDescription = '', userId } = req.body || {};

    if (!userId) throw new Error('Missing userId — please connect your YouTube account.');
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
          userId
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

app.get('/api/instagram/cookies/status', async (req, res) => {
  try {
    const hasCookies = await instagram.hasCookies();
    res.json({ hasCookies, message: hasCookies ? 'Cookies available' : 'No cookies found.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/instagram/cookies', upload.single('cookies'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileContent = await fs.readFile(req.file.path);
    await instagram.saveCookies(fileContent);
    await fs.remove(req.file.path);
    res.json({ success: true, message: 'Instagram cookies uploaded and saved successfully' });
  } catch (error) {
    if (req.file) await fs.remove(req.file.path).catch(() => {});
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/instagram/cookies', async (req, res) => {
  try {
    await instagram.deleteCookies();
    res.json({ success: true, message: 'Instagram cookies deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── YouTube Cookie Endpoints ────────────────────────────────────────────────

/**
 * GET /api/youtube/cookies/status
 * Check whether a YouTube cookies file has been uploaded.
 */
app.get('/api/youtube/cookies/status', async (req, res) => {
  try {
    const hasCookies = await fs.pathExists(YOUTUBE_COOKIES_PATH);
    res.json({ hasCookies, message: hasCookies ? 'YouTube cookies available' : 'No YouTube cookies found.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/youtube/cookies
 * Upload a Netscape-format cookies.txt file for YouTube authentication.
 */
app.post('/api/youtube/cookies', upload.single('cookies'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileContent = await fs.readFile(req.file.path, 'utf8');
    // Basic validation: ensure it looks like a Netscape cookies file
    if (!fileContent.includes('youtube.com') && !fileContent.includes('Netscape')) {
      await fs.remove(req.file.path);
      return res.status(400).json({ error: 'File does not appear to be a valid YouTube cookies file (Netscape format). Make sure to export cookies from youtube.com.' });
    }
    await fs.copy(req.file.path, YOUTUBE_COOKIES_PATH);
    await fs.remove(req.file.path);
    console.log('[Cookies] YouTube cookies saved successfully');
    res.json({ success: true, message: 'YouTube cookies uploaded and saved successfully. Downloads will now use your account to bypass bot checks.' });
  } catch (error) {
    if (req.file) await fs.remove(req.file.path).catch(() => {});
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/youtube/cookies
 * Remove the YouTube cookies file.
 */
app.delete('/api/youtube/cookies', async (req, res) => {
  try {
    await fs.remove(YOUTUBE_COOKIES_PATH);
    console.log('[Cookies] YouTube cookies deleted');
    res.json({ success: true, message: 'YouTube cookies deleted.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Quota ────────────────────────────────────────────────────────────────────
app.get('/api/quota', async (req, res) => {
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
  let cloudinaryPublicId = null;

  try {
    progressCallback('Extracting metadata...');
    const metadata = await instagram.extractInstagramMetadata(reelUrl);

    progressCallback('Downloading reel...');
    downloadedPath = path.join(DOWNLOADS_DIR, `instagram-${Date.now()}.mp4`);
    await instagram.downloadInstagramReel(reelUrl, downloadedPath);

    progressCallback('Uploading to Cloudinary...');
    const cloudinaryResult = await uploadToCloudinary(downloadedPath);
    cloudinaryPublicId = cloudinaryResult.public_id;

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
    await cleanupCloudinaryVideo(cloudinaryPublicId);
    cloudinaryPublicId = null;
    if (downloadedPath) { await fs.remove(downloadedPath); downloadedPath = null; }

    progressCallback(`Uploaded: ${youtubeResult.url}`);
    return youtubeResult;
  } catch (error) {
    throw error;
  } finally {
    if (cloudinaryPublicId) await cleanupCloudinaryVideo(cloudinaryPublicId).catch(() => {});
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
  let cloudinaryPublicId = null;

  try {
    const allowed = await quota.isUploadAllowed(1);
    if (!allowed) throw new Error('Daily upload quota exceeded. Scheduled job failed.');

    await scheduler.updateJob(job.id, { status: 'processing' });
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
      await downloadVideo(job.videoUrl, downloadedPath);

      console.log(`[Job ${job.id}] Uploading to Cloudinary...`);
      const cloudinaryResult = await uploadToCloudinary(downloadedPath);
      cloudinaryPublicId = cloudinaryResult.public_id;

      console.log(`[Job ${job.id}] Uploading to YouTube...`);
      youtubeResult = await uploadToYouTube(
        downloadedPath, job.title, job.description, job.privacy,
        job.videoUrl, job.scheduledAt, job.userId
      );

      await cleanupCloudinaryVideo(cloudinaryPublicId);
      cloudinaryPublicId = null;
      if (downloadedPath) { await fs.remove(downloadedPath); downloadedPath = null; }
    }

    await quota.incrementUploadCount(1);
    await scheduler.updateJob(job.id, { status: 'done', videoId: youtubeResult.id, videoUrlResult: youtubeResult.url });
    console.log(`[Scheduler] Job ${job.id} complete: ${youtubeResult.url}`);
  } catch (error) {
    console.error(`[Scheduler] Job ${job.id} failed:`, error);
    await scheduler.updateJob(job.id, { status: 'error', error: error.message || 'Unknown error' });
  } finally {
    if (cloudinaryPublicId) await cleanupCloudinaryVideo(cloudinaryPublicId).catch(() => {});
    if (downloadedPath) await fs.remove(downloadedPath).catch(() => {});
  }
}

cron.schedule('* * * * *', async () => {
  try {
    const dueJobs = await scheduler.getDueJobs();
    if (dueJobs.length > 0) {
      console.log(`[Scheduler] Found ${dueJobs.length} due job(s)`);
      for (const job of dueJobs) await executeScheduledJob(job);
    }
  } catch (error) {
    console.error('[Scheduler] Error running due jobs check:', error);
  }
});

// ─── Schedule Endpoints ───────────────────────────────────────────────────────

/**
 * POST /api/schedule
 * Schedule a video upload. Requires userId in body.
 */
app.post('/api/schedule', async (req, res) => {
  try {
    const { videoUrl, title, description, privacy, platform, scheduledAt, userId } = req.body || {};

    if (!userId) return res.status(400).json({ error: 'Missing userId' });
    if (!videoUrl) return res.status(400).json({ error: 'Missing videoUrl' });
    if (!scheduledAt) return res.status(400).json({ error: 'Missing scheduledAt' });

    const parsedDate = new Date(scheduledAt);
    if (isNaN(parsedDate.getTime())) return res.status(400).json({ error: 'Invalid scheduledAt format' });
    if (parsedDate <= new Date()) return res.status(400).json({ error: 'scheduledAt must be in the future' });

    const job = await scheduler.addJob({
      userId, videoUrl, title, description, privacy, platform,
      scheduledAt: parsedDate.toISOString(),
    });

    res.json(job);
  } catch (error) {
    console.error('Error adding scheduled job:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/schedule?userId=<uuid>
 * List all jobs for the given user.
 */
app.get('/api/schedule', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });
    const jobs = await scheduler.getJobs(userId);
    res.json(jobs);
  } catch (error) {
    console.error('Error listing scheduled jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/schedule/:id
 * Cancel a pending job.
 */
app.delete('/api/schedule/:id', async (req, res) => {
  try {
    const removed = await scheduler.removeJob(req.params.id);
    if (removed) {
      res.json({ success: true, message: 'Job cancelled successfully.' });
    } else {
      res.status(404).json({ error: 'Job not found or already running/completed.' });
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
db.initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error('[FATAL] DB init failed:', err);
    process.exit(1);
  });
