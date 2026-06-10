const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const YTDLP_COMMAND = process.env.YTDLP_COMMAND || 'yt-dlp';
const COOKIES_DIR = path.resolve(__dirname, '../cookies');

// Ensure cookies directory exists
fs.ensureDirSync(COOKIES_DIR);

function getInstagramCookiesPath(userId) {
  return path.join(COOKIES_DIR, `instagram_cookies_${userId}.txt`);
}

/**
 * Download Instagram Reel with retry logic and metadata extraction
 */
async function downloadInstagramReel(reelUrl, outputPath, userId, userAgent = null, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Add exponential backoff delay before retry
      if (attempt > 1) {
        const delay = Math.pow(2, attempt - 2) * 1000; // 1s, 2s, 4s
        console.log(`Retry attempt ${attempt}/${maxRetries} for Instagram reel. Waiting ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      return await _executeDownload(reelUrl, outputPath, userId, userAgent);
    } catch (error) {
      lastError = error;
      console.warn(`Instagram reel download attempt ${attempt}/${maxRetries} failed:`, error.message);

      // Check for specific errors
      if (error.message.includes('Login required') || error.message.includes('Private')) {
        throw error; // Don't retry for these errors
      }
    }
  }

  throw new Error(
    `Failed to download Instagram reel after ${maxRetries} attempts. ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Execute yt-dlp download for Instagram reel
 */
async function _executeDownload(reelUrl, outputPath, userId, userAgent = null) {
  return new Promise((resolve, reject) => {
    const attempts = [];
    const userCookiesPath = getInstagramCookiesPath(userId);
    const hasCookiesFile = userId && fs.pathExistsSync(userCookiesPath);

    const formats = ['bestvideo[height<=1080]+bestaudio/best', 'best[height<=1080]/best', 'best'];

    if (hasCookiesFile) {
      for (const fmt of formats) {
        attempts.push({ format: fmt, useCookies: true });
      }
    }
    for (const fmt of formats) {
      attempts.push({ format: fmt, useCookies: false });
    }

    const buildArgs = (formatString, useCookies) => {
      const activeUserAgent = userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      const args = [
        '-4', // Force IPv4
        '--no-playlist',
        '--no-warnings',
        '--js-runtimes', 'node',
        '--merge-output-format', 'mp4',
        '--recode-video', 'mp4',
        '--user-agent', activeUserAgent,
        '-o', outputPath, reelUrl
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
        return reject(lastError || new Error('yt-dlp failed to download the Instagram reel after trying all formats and cookie fallbacks.'));
      }

      const { format, useCookies } = attempts[index];
      const args = buildArgs(format, useCookies);
      
      console.log(`[Instagram Download] Attempt ${index + 1}/${attempts.length}: format=${format}, cookies=${useCookies}`);
      
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
              console.warn(`Instagram cookie attempt failed with login/private warning. Trying anonymous fallback...`);
              return tryAttempt(nextIndex, new Error(`yt-dlp exited with code ${code}: ${errorMsg}`));
            }
            return reject(new Error('Login required: Please upload cookies.txt to proceed.'));
          }
          if (errorMsg.includes('HTTP Error 429')) {
            return reject(new Error('Rate limited: Instagram blocked the request. Please wait 15 minutes and retry.'));
          }
          if (errorMsg.includes('not found') || errorMsg.includes('does not exist')) {
            return reject(new Error('Reel not found or deleted.'));
          }

          if (nextIndex < attempts.length) {
            console.warn(`yt-dlp Instagram attempt ${index} failed: format=${format}, cookies=${useCookies}. Error: ${errorMsg}. Trying next fallback...`);
            return tryAttempt(nextIndex, new Error(`yt-dlp exited with code ${code}: ${errorMsg}`));
          }
          return reject(new Error(`yt-dlp exited with code ${code}: ${errorMsg}`));
        }

        try {
          const exists = await fs.pathExists(outputPath);
          if (!exists) {
            return reject(new Error('Downloaded reel file not found.'));
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
 * Extract metadata from Instagram reel using yt-dlp --dump-json
 */
async function extractInstagramMetadata(reelUrl, userId, userAgent = null) {
  return new Promise((resolve, reject) => {
    const activeUserAgent = userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const args = [
      '-4', // Force IPv4
      '--dump-json',
      '--no-warnings',
      '--js-runtimes', 'node',
      '--user-agent', activeUserAgent,
      reelUrl
    ];

    // Add cookies if available
    const userCookiesPath = getInstagramCookiesPath(userId);
    if (userId && fs.pathExistsSync(userCookiesPath)) {
      args.splice(0, 0, `--cookies=${userCookiesPath}`);
    }

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
      if (error.code === 'ENOENT') {
        return reject(new Error('yt-dlp executable not found. Install yt-dlp or set YTDLP_COMMAND to a valid command.'));
      }
      reject(error);
    });

    ytProcess.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Failed to extract metadata: ${stderr.trim()}`));
      }

      try {
        const data = JSON.parse(stdout);
        const metadata = {
          uploader: data.uploader || data.uploader_id || 'Unknown',
          caption: data.description || '',
          uploadDate: data.upload_date || '',
          duration: data.duration || 0,
          title: data.title || '',
          url: data.webpage_url || reelUrl,
        };

        // Validate duration (must be ≤ 180 seconds for YouTube Shorts)
        if (metadata.duration > 180) {
          return reject(
            new Error(
              `Video duration (${metadata.duration}s) exceeds 180 seconds (3 minutes) limit for YouTube Shorts. Please trim the video manually.`
            )
          );
        }

        resolve(metadata);
      } catch (error) {
        reject(new Error(`Failed to parse yt-dlp metadata: ${error.message}`));
      }
    });
  });
}

/**
 * Check if Instagram cookies are available
 */
async function hasCookies(userId) {
  const userCookiesPath = getInstagramCookiesPath(userId);
  return fs.pathExists(userCookiesPath);
}

/**
 * Save Instagram cookies from uploaded file
 */
async function saveCookies(userId, cookieBuffer) {
  try {
    const userCookiesPath = getInstagramCookiesPath(userId);
    await fs.writeFile(userCookiesPath, cookieBuffer);
    console.log(`Instagram cookies saved successfully for user ${userId}`);
    return true;
  } catch (error) {
    console.error(`Error saving cookies for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Delete Instagram cookies
 */
async function deleteCookies(userId) {
  try {
    const userCookiesPath = getInstagramCookiesPath(userId);
    await fs.remove(userCookiesPath);
    console.log(`Instagram cookies deleted for user ${userId}`);
    return true;
  } catch (error) {
    console.error(`Error deleting cookies for user ${userId}:`, error);
    throw error;
  }
}

module.exports = {
  downloadInstagramReel,
  extractInstagramMetadata,
  hasCookies,
  saveCookies,
  deleteCookies,
  COOKIES_DIR,
};
