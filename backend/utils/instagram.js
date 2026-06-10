const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const YTDLP_COMMAND = process.env.YTDLP_COMMAND || 'yt-dlp';
const COOKIES_DIR = path.resolve(__dirname, '../cookies');
const INSTAGRAM_COOKIES_PATH = path.join(COOKIES_DIR, 'instagram.txt');

// Ensure cookies directory exists
fs.ensureDirSync(COOKIES_DIR);

/**
 * Download Instagram Reel with retry logic and metadata extraction
 */
async function downloadInstagramReel(reelUrl, outputPath, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Add exponential backoff delay before retry
      if (attempt > 1) {
        const delay = Math.pow(2, attempt - 2) * 1000; // 1s, 2s, 4s
        console.log(`Retry attempt ${attempt}/${maxRetries} for Instagram reel. Waiting ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      return await _executeDownload(reelUrl, outputPath);
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
async function _executeDownload(reelUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const targetFormats = ['bestvideo[height<=1080]+bestaudio/best', 'best[height<=1080]/best', 'best'];

    const buildArgs = (formatString) => {
      const args = ['--no-playlist', '--no-warnings', '--js-runtimes', 'node', '-f', formatString, '--merge-output-format', 'mp4', '--recode-video', 'mp4', '-o', outputPath, reelUrl];
      if (fs.pathExistsSync(INSTAGRAM_COOKIES_PATH)) {
        args.unshift(`--cookies=${INSTAGRAM_COOKIES_PATH}`);
      }
      return args;
    };

    const tryFormat = (index, lastError = null) => {
      if (index >= targetFormats.length) {
        return reject(lastError || new Error('yt-dlp failed to download the Instagram reel.'));
      }

      const args = buildArgs(targetFormats[index]);
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
          if (nextIndex < targetFormats.length) {
            console.warn(`yt-dlp format ${targetFormats[index]} failed: ${errorMsg}. Trying fallback ${targetFormats[nextIndex]}.`);
            return tryFormat(nextIndex, new Error(`yt-dlp exited with code ${code}: ${errorMsg}`));
          }

          if (errorMsg.includes('Login required') || errorMsg.includes('Private account')) {
            return reject(new Error('Login required: Please upload cookies.txt to proceed.'));
          }
          if (errorMsg.includes('HTTP Error 429')) {
            return reject(new Error('Rate limited: Instagram blocked the request. Please wait 15 minutes and retry.'));
          }
          if (errorMsg.includes('not found') || errorMsg.includes('does not exist')) {
            return reject(new Error('Reel not found or deleted.'));
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

    tryFormat(0);
  });
}

/**
 * Extract metadata from Instagram reel using yt-dlp --dump-json
 */
async function extractInstagramMetadata(reelUrl) {
  return new Promise((resolve, reject) => {
    const args = ['--dump-json', '--no-warnings', '--js-runtimes', 'node', reelUrl];

    // Add cookies if available
    if (fs.pathExistsSync(INSTAGRAM_COOKIES_PATH)) {
      args.splice(0, 0, `--cookies=${INSTAGRAM_COOKIES_PATH}`);
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
        return reject(new Error(`yt-dlp executable not found. Install yt-dlp or set YTDLP_COMMAND to a valid command.`));
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
async function hasCookies() {
  return fs.pathExists(INSTAGRAM_COOKIES_PATH);
}

/**
 * Save Instagram cookies from uploaded file
 */
async function saveCookies(cookieBuffer) {
  try {
    await fs.writeFile(INSTAGRAM_COOKIES_PATH, cookieBuffer);
    console.log('Instagram cookies saved successfully');
    return true;
  } catch (error) {
    console.error('Error saving cookies:', error);
    throw error;
  }
}

/**
 * Delete Instagram cookies
 */
async function deleteCookies() {
  try {
    await fs.remove(INSTAGRAM_COOKIES_PATH);
    console.log('Instagram cookies deleted');
    return true;
  } catch (error) {
    console.error('Error deleting cookies:', error);
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
