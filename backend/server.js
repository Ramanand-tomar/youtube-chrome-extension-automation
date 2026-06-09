const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const cloudinary = require('cloudinary').v2;
const { google } = require('googleapis');
const cron = require('node-cron');
const pLimitModule = require('p-limit');
const pLimit = typeof pLimitModule === 'function' ? pLimitModule : pLimitModule.default;
const multer = require('multer');

const instagram = require('./utils/instagram');
const quota = require('./utils/quota');
const scheduler = require('./utils/scheduler');

dotenv.config();

const PORT = process.env.PORT || 3000;
const TOKENS_PATH = path.resolve(__dirname, 'tokens.json');
const DOWNLOADS_DIR = path.resolve(__dirname, 'downloads');

fs.ensureDirSync(DOWNLOADS_DIR);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  process.env.YOUTUBE_REDIRECT_URI
);

const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

async function loadTokens() {
  try {
    return await fs.readJson(TOKENS_PATH);
  } catch (error) {
    return {};
  }
}

async function saveTokens(tokens) {
  const tempPath = `${TOKENS_PATH}.tmp`;
  await fs.writeJson(tempPath, tokens, { spaces: 2 });
  await fs.move(tempPath, TOKENS_PATH, { overwrite: true });
}

function extractTitleFromUrl(videoUrl) {
  try {
    const url = new URL(videoUrl);
    if (url.hostname.includes('youtube.com')) {
      const videoId = url.searchParams.get('v');
      if (videoId) {
        return `YouTube Short ${videoId}`;
      }
      return url.pathname.split('/').filter(Boolean).pop() || 'YouTube Short';
    }
  } catch (error) {
    // ignore
  }

  return 'YouTube Short';
}

function downloadVideo(videoUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const args = ['--no-playlist', '-f', 'best[ext=mp4]/best', '-o', outputPath, videoUrl];
    const ytProcess = spawn('yt-dlp', args);
    let stderr = '';

    ytProcess.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ytProcess.on('error', (error) => {
      reject(error);
    });

    ytProcess.on('close', async (code) => {
      if (code !== 0) {
        return reject(new Error(`yt-dlp exited with code ${code}: ${stderr.trim()}`));
      }

      try {
        const exists = await fs.pathExists(outputPath);
        if (!exists) {
          return reject(new Error('Downloaded video file not found.'));
        }
        resolve(outputPath);
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function uploadToCloudinary(localPath) {
  const publicId = `temp_${Date.now()}`;
  const result = await cloudinary.uploader.upload(localPath, {
    public_id: publicId,
    resource_type: 'video',
    folder: 'youtube_shorts_temp',
  });
  return {
    secure_url: result.secure_url,
    public_id: result.public_id,
  };
}

async function uploadToYouTube(localPath, title, description, privacy = 'unlisted', videoUrl, publishAt = null) {
  const tokens = await loadTokens();
  oauth2Client.setCredentials(tokens);

  const rawTitle = title || extractTitleFromUrl(videoUrl || localPath);
  let preparedTitle = rawTitle
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (preparedTitle.length > 95) {
    preparedTitle = preparedTitle.substring(0, 92) + '...';
  }
  
  const finalTitle = preparedTitle || 'YouTube Short';
  const preparedDescription = `${description || ''}\n\n#Shorts`.trim();
  
  let privacyStatus = privacy === 'public' ? 'public' : 'unlisted';
  const statusBody = {
    privacyStatus,
  };

  if (publishAt) {
    statusBody.privacyStatus = 'private';
    statusBody.publishAt = new Date(publishAt).toISOString();
  }

  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: finalTitle,
        description: preparedDescription,
        tags: ['Shorts'],
      },
      status: statusBody,
    },
    media: {
      body: fs.createReadStream(localPath),
    },
  });

  return {
    id: response.data.id,
    url: `https://youtu.be/${response.data.id}`,
  };
}

async function cleanupCloudinaryVideo(publicId) {
  if (!publicId) {
    return;
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'video',
    });
    console.log(`Cloudinary cleanup result for ${publicId}:`, result);
  } catch (error) {
    console.error(`Error cleaning Cloudinary resource ${publicId}:`, error.message || error);
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

    const resources = response.resources || [];
    const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;

    for (const resource of resources) {
      const createdAt = new Date(resource.created_at).getTime();
      if (createdAt && createdAt < cutoffMs) {
        await cloudinary.uploader.destroy(resource.public_id, {
          resource_type: 'video',
        });
        console.log(`Deleted orphan Cloudinary video ${resource.public_id}`);
      }
    }
  } catch (error) {
    console.error('Error running orphan Cloudinary cleanup:', error.message || error);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// Multer configuration for file uploads (cookies)
const upload = multer({
  dest: instagram.COOKIES_DIR,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB max
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/auth/youtube', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/youtube.upload'],
    prompt: 'consent',
  });

  res.json({ authUrl });
});

app.get('/api/auth/callback', async (req, res, next) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('<h1>Missing authorization code</h1>');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    await saveTokens(tokens);
    res.send('<h1>YouTube authorization successful. Tokens have been saved.</h1>');
  } catch (error) {
    next(error);
  }
});

app.post('/api/process', async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendStep = (payload) => {
    res.write(`${JSON.stringify(payload)}\n`);
  };

  let downloadedPath = null;
  let cloudinaryPublicId = null;

  try {
    const { videoUrl, title, description, privacy } = req.body || {};

    if (!videoUrl || typeof videoUrl !== 'string') {
      throw new Error('Missing videoUrl in request body');
    }

    downloadedPath = path.join(DOWNLOADS_DIR, `download-${Date.now()}.mp4`);
    sendStep({ step: 'downloading', message: 'Starting video download...' });
    await downloadVideo(videoUrl, downloadedPath);
    sendStep({ step: 'downloading', message: 'Video download complete.' });

    sendStep({ step: 'cloudinary', message: 'Uploading video to Cloudinary...' });
    const cloudinaryResult = await uploadToCloudinary(downloadedPath);
    cloudinaryPublicId = cloudinaryResult.public_id;
    sendStep({ step: 'cloudinary', message: 'Cloudinary upload complete.', secureUrl: cloudinaryResult.secure_url });

    sendStep({ step: 'youtube', message: 'Starting YouTube upload...' });
    const youtubeResult = await uploadToYouTube(downloadedPath, title, description, privacy, videoUrl);
    sendStep({ step: 'youtube', message: 'YouTube upload complete.', videoId: youtubeResult.id, videoUrl: youtubeResult.url });

    sendStep({ step: 'cleanup', message: 'Cleaning temporary files...' });
    await cleanupCloudinaryVideo(cloudinaryPublicId);
    cloudinaryPublicId = null;

    if (downloadedPath) {
      await fs.remove(downloadedPath);
      downloadedPath = null;
    }

    sendStep({ step: 'complete', message: 'Process completed successfully.', videoId: youtubeResult.id, videoUrl: youtubeResult.url });
  } catch (error) {
    console.error('Process error:', error);
    sendStep({ step: 'error', message: error.message || 'Unknown error' });
  } finally {
    if (cloudinaryPublicId) {
      await cleanupCloudinaryVideo(cloudinaryPublicId);
    }

    if (downloadedPath) {
      try {
        await fs.remove(downloadedPath);
      } catch (cleanupError) {
        console.error('Error removing downloaded file:', cleanupError.message || cleanupError);
      }
    }

    res.end();
  }
});

// ============ Instagram Reels Endpoints ============

/**
 * POST /api/process-batch
 * Batch process Instagram Reels with sequential processing
 */
app.post('/api/process-batch', async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendStep = (payload) => {
    res.write(`${JSON.stringify(payload)}\n`);
  };

  try {
    const { urls = [], defaultCredit = true, globalTitle = '', globalDescription = '' } = req.body || {};

    if (!Array.isArray(urls) || urls.length === 0) {
      throw new Error('Missing or empty urls array');
    }

    if (urls.length > 10) {
      throw new Error('Maximum 10 reels per batch submission');
    }

    // Check quota before processing
    const allowed = await quota.isUploadAllowed(urls.length);
    if (!allowed) {
      const remaining = await quota.getRemainingUploads();
      throw new Error(`Daily quota exceeded. Remaining uploads: ${remaining}`);
    }

    sendStep({
      step: 'init',
      message: `Starting batch processing of ${urls.length} reel(s)`,
      total: urls.length,
    });

    // Process sequentially with concurrency limit of 1
    const limit = pLimit(1);
    let successCount = 0;
    let failureCount = 0;

    for (let index = 0; index < urls.length; index++) {
      const url = urls[index];
      const reelIndex = index + 1;

      try {
        sendStep({
          step: 'batch-processing',
          message: `Processing reel ${reelIndex}/${urls.length}: ${url}`,
          reel: reelIndex,
          total: urls.length,
          status: 'starting',
        });

        // Add random delay (2-5 seconds) between downloads to avoid rate limiting
        if (index > 0) {
          const delay = Math.random() * 3000 + 2000; // 2-5 seconds
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        await limit(async () => {
          await processInstagramReel(
            url,
            globalTitle,
            globalDescription,
            defaultCredit,
            (message) => {
              sendStep({
                step: 'batch-processing',
                message: `Reel ${reelIndex}: ${message}`,
                reel: reelIndex,
                total: urls.length,
                status: 'processing',
              });
            }
          );
        });

        successCount++;
        sendStep({
          step: 'batch-processing',
          message: `Reel ${reelIndex} uploaded successfully`,
          reel: reelIndex,
          total: urls.length,
          status: 'success',
        });
      } catch (error) {
        failureCount++;
        console.error(`Reel ${reelIndex} processing failed:`, error.message);
        sendStep({
          step: 'batch-processing',
          message: `Reel ${reelIndex} failed: ${error.message}`,
          reel: reelIndex,
          total: urls.length,
          status: 'error',
        });
      }
    }

    // Increment quota
    await quota.incrementUploadCount(successCount);
    const quotaInfo = await quota.getQuotaInfo();

    sendStep({
      step: 'complete',
      message: `Batch processing complete. Success: ${successCount}, Failures: ${failureCount}`,
      success: successCount,
      failures: failureCount,
      quota: quotaInfo,
    });
  } catch (error) {
    console.error('Batch process error:', error);
    sendStep({ step: 'error', message: error.message || 'Unknown error' });
  }

  res.end();
});

/**
 * GET /api/instagram/cookies/status
 * Check if Instagram cookies are available
 */
app.get('/api/instagram/cookies/status', async (req, res) => {
  try {
    const hasCookies = await instagram.hasCookies();
    res.json({
      hasCookies,
      message: hasCookies ? 'Cookies available' : 'No cookies found. Please upload cookies.txt to enable Instagram Reels support.',
    });
  } catch (error) {
    console.error('Error checking cookies:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/instagram/cookies
 * Upload Instagram cookies file
 */
app.post('/api/instagram/cookies', upload.single('cookies'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read the uploaded file and save it
    const fileContent = await fs.readFile(req.file.path);
    await instagram.saveCookies(fileContent);

    // Delete temporary uploaded file
    await fs.remove(req.file.path);

    res.json({
      success: true,
      message: 'Instagram cookies uploaded and saved successfully',
    });
  } catch (error) {
    console.error('Error uploading cookies:', error);
    if (req.file) {
      await fs.remove(req.file.path).catch(() => {});
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/instagram/cookies
 * Delete Instagram cookies
 */
app.delete('/api/instagram/cookies', async (req, res) => {
  try {
    await instagram.deleteCookies();
    res.json({
      success: true,
      message: 'Instagram cookies deleted',
    });
  } catch (error) {
    console.error('Error deleting cookies:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/quota
 * Get current daily upload quota status
 */
app.get('/api/quota', async (req, res) => {
  try {
    const quotaInfo = await quota.getQuotaInfo();
    res.json(quotaInfo);
  } catch (error) {
    console.error('Error getting quota:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Process a single Instagram Reel
 */
async function processInstagramReel(reelUrl, globalTitle, globalDescription, creditUser, progressCallback, publishAt = null) {
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
    // Build title — ensure it is never empty (YouTube rejects empty titles)
    const rawCaption = (metadata.caption || '').replace(/[\r\n]+/g, ' ').trim();
    const title = (globalTitle && globalTitle.trim()) ||
                  (rawCaption && rawCaption.substring(0, 80)) ||
                  'Instagram Reel';

    // Build description with credit
    let description = globalDescription || metadata.caption || '';
    if (creditUser) {
      const formatDate = metadata.uploadDate ? formatInstagramDate(metadata.uploadDate) : '';
      const creditLine = `\n\n🔄 Originally posted on Instagram by @${metadata.uploader}`;
      const dateInfo = formatDate ? `\n📅 Date: ${formatDate}` : '';
      description += creditLine + dateInfo + '\n#Shorts #InstagramReels';
    } else {
      description += '\n\n#Shorts';
    }

    const privacy = publishAt ? 'private' : 'unlisted';
    const youtubeResult = await uploadToYouTube(downloadedPath, title, description, privacy, reelUrl, publishAt);

    progressCallback('Cleaning up...');
    await cleanupCloudinaryVideo(cloudinaryPublicId);
    cloudinaryPublicId = null;

    if (downloadedPath) {
      await fs.remove(downloadedPath);
      downloadedPath = null;
    }

    progressCallback(`Uploaded: ${youtubeResult.url}`);
    return youtubeResult;
  } catch (error) {
    throw error;
  } finally {
    if (cloudinaryPublicId) {
      await cleanupCloudinaryVideo(cloudinaryPublicId).catch(() => {});
    }

    if (downloadedPath) {
      await fs.remove(downloadedPath).catch(() => {});
    }
  }
}

/**
 * Format Instagram upload date from YYYYMMDD format
 */
function formatInstagramDate(uploadDate) {
  if (!uploadDate || uploadDate.length !== 8) {
    return '';
  }
  const year = uploadDate.substring(0, 4);
  const month = uploadDate.substring(4, 6);
  const day = uploadDate.substring(6, 8);
  return `${day}/${month}/${year}`;
}

// ============ Scheduling Helper & Cron ============

async function executeScheduledJob(job) {
  let downloadedPath = null;
  let cloudinaryPublicId = null;
  
  try {
    const allowed = await quota.isUploadAllowed(1);
    if (!allowed) {
      throw new Error('Daily upload quota exceeded. Scheduled job failed.');
    }

    await scheduler.updateJob(job.id, { status: 'processing' });
    console.log(`[Scheduler] Processing job ${job.id}: ${job.videoUrl}`);

    let youtubeResult;

    if (job.platform === 'instagram') {
      youtubeResult = await processInstagramReel(
        job.videoUrl,
        job.title,
        job.description,
        true,
        (msg) => console.log(`[Job ${job.id}]: ${msg}`),
        job.scheduledAt
      );
    } else {
      downloadedPath = path.join(DOWNLOADS_DIR, `scheduled-download-${Date.now()}.mp4`);
      console.log(`[Job ${job.id}] Downloading video...`);
      await downloadVideo(job.videoUrl, downloadedPath);

      console.log(`[Job ${job.id}] Uploading to Cloudinary...`);
      const cloudinaryResult = await uploadToCloudinary(downloadedPath);
      cloudinaryPublicId = cloudinaryResult.public_id;

      console.log(`[Job ${job.id}] Uploading to YouTube...`);
      youtubeResult = await uploadToYouTube(
        downloadedPath,
        job.title,
        job.description,
        job.privacy,
        job.videoUrl,
        job.scheduledAt
      );

      console.log(`[Job ${job.id}] Cleaning up...`);
      await cleanupCloudinaryVideo(cloudinaryPublicId);
      cloudinaryPublicId = null;

      if (downloadedPath) {
        await fs.remove(downloadedPath);
        downloadedPath = null;
      }
    }

    await quota.incrementUploadCount(1);

    await scheduler.updateJob(job.id, {
      status: 'done',
      videoId: youtubeResult.id,
      videoUrlResult: youtubeResult.url,
    });
    console.log(`[Scheduler] Job ${job.id} completed successfully: ${youtubeResult.url}`);

  } catch (error) {
    console.error(`[Scheduler] Job ${job.id} failed:`, error);
    await scheduler.updateJob(job.id, {
      status: 'error',
      error: error.message || 'Unknown error during execution',
    });
  } finally {
    if (cloudinaryPublicId) {
      await cleanupCloudinaryVideo(cloudinaryPublicId).catch(() => {});
    }
    if (downloadedPath) {
      await fs.remove(downloadedPath).catch(() => {});
    }
  }
}

cron.schedule('* * * * *', async () => {
  try {
    const dueJobs = await scheduler.getDueJobs();
    if (dueJobs.length > 0) {
      console.log(`[Scheduler] Found ${dueJobs.length} due job(s)`);
      for (const job of dueJobs) {
        await executeScheduledJob(job);
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error running due jobs check:', error);
  }
});

// ============ Scheduling Endpoints ============

app.post('/api/schedule', async (req, res) => {
  try {
    const { videoUrl, title, description, privacy, platform, scheduledAt } = req.body || {};

    if (!videoUrl || typeof videoUrl !== 'string') {
      return res.status(400).json({ error: 'Missing videoUrl' });
    }

    if (!scheduledAt) {
      return res.status(400).json({ error: 'Missing scheduledAt' });
    }

    const parsedScheduledDate = new Date(scheduledAt);
    if (isNaN(parsedScheduledDate.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduledAt format' });
    }

    if (parsedScheduledDate <= new Date()) {
      return res.status(400).json({ error: 'scheduledAt must be in the future' });
    }

    const job = await scheduler.addJob({
      videoUrl,
      title,
      description,
      privacy,
      platform,
      scheduledAt: parsedScheduledDate.toISOString(),
    });

    res.json(job);
  } catch (error) {
    console.error('Error adding scheduled job:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/schedule', async (req, res) => {
  try {
    const jobs = await scheduler.getJobs();
    res.json(jobs);
  } catch (error) {
    console.error('Error listing scheduled jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/schedule/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const removed = await scheduler.removeJob(id);
    if (removed) {
      res.json({ success: true, message: 'Job canceled and removed successfully.' });
    } else {
      res.status(404).json({ error: 'Job not found' });
    }
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ error: error.message });
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

cron.schedule('0 */6 * * *', async () => {
  console.log('Running scheduled orphan cleanup...');
  await cleanupOrphanCloudinaryVideos();
});

cleanupOrphanCloudinaryVideos().catch((error) => {
  console.error('Initial Cloudinary cleanup error:', error.message || error);
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
