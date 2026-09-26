const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const localYtDlp = path.resolve(__dirname, '../yt-dlp.exe');
const YTDLP_COMMAND = fs.existsSync(localYtDlp) ? localYtDlp : (process.env.YTDLP_COMMAND || 'yt-dlp');

const COOKIES_DIR = path.resolve(__dirname, '../cookies');

// Ensure cookies directory exists
fs.ensureDirSync(COOKIES_DIR);

function getTikTokCookiesPath(userId) {
  return path.join(COOKIES_DIR, `tiktok_cookies_${userId}.txt`);
}

/**
 * Download TikTok Video with retry logic and format fallback
 */
async function downloadTikTokVideo(tiktokUrl, outputPath, userId, userAgent = null, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        const delay = Math.pow(2, attempt - 2) * 1000;
        console.log(`Retry attempt ${attempt}/${maxRetries} for TikTok video. Waiting ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      return await _executeDownload(tiktokUrl, outputPath, userId, userAgent);
    } catch (error) {
      lastError = error;
      console.warn(`TikTok download attempt ${attempt}/${maxRetries} failed:`, error.message);

      if (error.message.includes('Login required') || error.message.includes('Private')) {
        throw error;
      }
    }
  }

  throw new Error(
    `Failed to download TikTok video after ${maxRetries} attempts. ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Execute yt-dlp download for TikTok video
 */
async function _executeDownload(tiktokUrl, outputPath, userId, userAgent = null) {
  return new Promise((resolve, reject) => {
    const attempts = [];
    const userCookiesPath = getTikTokCookiesPath(userId);
    const hasCookiesFile = userId && fs.pathExistsSync(userCookiesPath);

    const formats = ['bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best', 'best'];

    if (hasCookiesFile) {
      for (const fmt of formats) {
        attempts.push({ format: fmt, useCookies: true });
      }
    }
    for (const fmt of formats) {
      attempts.push({ format: fmt, useCookies: false });
    }

    const buildArgs = (formatString, useCookies) => {
      const activeUserAgent = userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
      const args = [
        '-4',
        '--socket-timeout', '15',
        '--no-check-certificates',
        '--no-playlist',
        '--no-warnings',
        '--add-header', 'Referer: https://www.tiktok.com/',
        '--js-runtimes', 'node',
        '--merge-output-format', 'mp4',
        '--recode-video', 'mp4',
        '--user-agent', activeUserAgent,
        '-o', outputPath, tiktokUrl
      ];
      if (formatString) {
        args.unshift('-f', formatString);
      }
      if (useCookies && hasCookiesFile) {
        args.unshift(`--cookies=${userCookiesPath}`);
      }
      return args;
    };

    const tryAttempt = (index, lastError = null) => {
      if (index >= attempts.length) {
        return reject(lastError || new Error('yt-dlp failed to download the TikTok video after trying all formats and cookie fallbacks.'));
      }

      const { format, useCookies } = attempts[index];
      const args = buildArgs(format, useCookies);

      console.log(`[TikTok Download] Attempt ${index + 1}/${attempts.length}: format=${format}, cookies=${useCookies}, cmd=${YTDLP_COMMAND}`);

      const ytProcess = spawn(YTDLP_COMMAND, args);
      let stderr = '';
      let stdout = '';

      ytProcess.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      ytProcess.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      ytProcess.on('error', (error) => {
        if (error.code === 'ENOENT') {
          return reject(new Error('yt-dlp executable not found. Install yt-dlp or set YTDLP_COMMAND to a valid command.'));
        }
        reject(error);
      });

      ytProcess.on('close', async (code) => {
        const errorMsg = stderr.trim() || stdout.trim();
        if (code !== 0) {
          const nextIndex = index + 1;

          if (errorMsg.includes('Login required') || errorMsg.includes('Private account')) {
            if (useCookies && nextIndex < attempts.length) {
              console.warn(`TikTok cookie attempt failed with login/private warning. Trying anonymous fallback...`);
              return tryAttempt(nextIndex, new Error(`yt-dlp exited with code ${code}: ${errorMsg}`));
            }
            return reject(new Error('Login required: Please upload TikTok cookies.txt to proceed.'));
          }
          if (errorMsg.includes('HTTP Error 429')) {
            return reject(new Error('Rate limited: TikTok blocked the request. Please wait 15 minutes and retry.'));
          }
          if (errorMsg.includes('not found') || errorMsg.includes('does not exist')) {
            return reject(new Error('TikTok video not found or deleted.'));
          }

          if (nextIndex < attempts.length) {
            console.warn(`yt-dlp TikTok attempt ${index} failed: format=${format}, cookies=${useCookies}. Error: ${errorMsg}. Trying next fallback...`);
            return tryAttempt(nextIndex, new Error(`yt-dlp exited with code ${code}: ${errorMsg}`));
          }
          return reject(new Error(`yt-dlp exited with code ${code}: ${errorMsg}`));
        }

        try {
          const exists = await fs.pathExists(outputPath);
          if (!exists) {
            return reject(new Error('Downloaded TikTok video file not found.'));
          }
          resolve(outputPath);
        } catch (error) {
          reject(error);
        }
      });
    };

    tryAttempt(0);
  });
}

/**
 * Extract metadata from TikTok video using yt-dlp --dump-json with fallback handling
 */
async function extractTikTokMetadata(tiktokUrl, userId, userAgent = null) {
  return new Promise((resolve) => {
    const activeUserAgent = userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    const args = [
      '-4',
      '--socket-timeout', '10',
      '--no-check-certificates',
      '--add-header', 'Referer: https://www.tiktok.com/',
      '--dump-json',
      '--no-warnings',
      '--js-runtimes', 'node',
      '--user-agent', activeUserAgent,
      tiktokUrl
    ];

    const userCookiesPath = getTikTokCookiesPath(userId);
    if (userId && fs.pathExistsSync(userCookiesPath)) {
      args.splice(0, 0, `--cookies=${userCookiesPath}`);
    }

    console.log(`[TikTok Metadata] Running metadata extraction via ${YTDLP_COMMAND}`);
    const ytProcess = spawn(YTDLP_COMMAND, args);
    let stdout = '';
    let stderr = '';

    ytProcess.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    ytProcess.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ytProcess.on('error', (error) => {
      console.warn(`[TikTok Metadata Error] Spawn error: ${error.message}. Using URL fallback.`);
      return resolve(getFallbackMetadata(tiktokUrl));
    });

    ytProcess.on('close', (code) => {
      if (code !== 0) {
        console.warn(`[TikTok Metadata Warning] yt-dlp metadata extraction returned code ${code}: ${stderr.trim()}. Using URL fallback metadata.`);
        return resolve(getFallbackMetadata(tiktokUrl));
      }

      try {
        const data = JSON.parse(stdout);
        const uploader = data.uploader || data.uploader_id || data.creator || 'Unknown';
        const metadata = {
          uploader: uploader.startsWith('@') ? uploader : `@${uploader}`,
          caption: data.description || data.title || '',
          uploadDate: data.upload_date || '',
          duration: data.duration || 0,
          title: data.title || '',
          url: data.webpage_url || tiktokUrl,
          viewCount: data.view_count || 0,
          likeCount: data.like_count || 0,
        };

        if (metadata.duration > 180) {
          console.warn(`Video duration (${metadata.duration}s) exceeds 180s Shorts limit.`);
        }

        resolve(metadata);
      } catch (error) {
        console.warn(`[TikTok Metadata Warning] JSON parse failed: ${error.message}. Using URL fallback metadata.`);
        resolve(getFallbackMetadata(tiktokUrl));
      }
    });
  });
}

function getFallbackMetadata(tiktokUrl) {
  let uploader = 'Unknown';
  const match = tiktokUrl.match(/@([a-zA-Z0-9._]+)/);
  if (match && match[1]) {
    uploader = `@${match[1]}`;
  }
  return {
    uploader,
    caption: 'TikTok Video',
    uploadDate: '',
    duration: 60,
    title: 'TikTok Video',
    url: tiktokUrl,
    viewCount: 0,
    likeCount: 0,
  };
}

/**
 * Check if TikTok cookies are available
 */
async function hasCookies(userId) {
  const userCookiesPath = getTikTokCookiesPath(userId);
  return fs.pathExists(userCookiesPath);
}

/**
 * Save TikTok cookies from uploaded file
 */
async function saveCookies(userId, cookieBuffer) {
  try {
    const userCookiesPath = getTikTokCookiesPath(userId);
    await fs.writeFile(userCookiesPath, cookieBuffer);
    console.log(`TikTok cookies saved successfully for user ${userId}`);
    return true;
  } catch (error) {
    console.error(`Error saving TikTok cookies for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Delete TikTok cookies
 */
async function deleteCookies(userId) {
  try {
    const userCookiesPath = getTikTokCookiesPath(userId);
    await fs.remove(userCookiesPath);
    console.log(`TikTok cookies deleted for user ${userId}`);
    return true;
  } catch (error) {
    console.error(`Error deleting TikTok cookies for user ${userId}:`, error);
    throw error;
  }
}

module.exports = {
  downloadTikTokVideo,
  extractTikTokMetadata,
  hasCookies,
  saveCookies,
  deleteCookies,
  COOKIES_DIR,
};
