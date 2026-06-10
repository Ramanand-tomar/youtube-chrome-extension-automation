const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { downloadFile } = require('./downloader');

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
  const options = {
    method: 'GET',
    url: 'https://instagram-reels-downloader-api.p.rapidapi.com/download',
    params: { url: reelUrl },
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY || '7bb80227bemsh50cc3a7ae12938fp16806ajsn1978e3268063',
      'x-rapidapi-host': 'instagram-reels-downloader-api.p.rapidapi.com',
      'Content-Type': 'application/json'
    }
  };

  try {
    console.log(`[Instagram Download] Calling RapidAPI for reel: ${reelUrl}`);
    const response = await axios.request(options);
    const data = response.data;

    if (!data || !data.success || !data.data) {
      throw new Error(`RapidAPI failed: ${data?.message || 'Unknown error'}`);
    }

    const igData = data.data;
    let videoUrl = null;

    if (igData.medias && igData.medias.length > 0) {
      const videoMedia = igData.medias.find(m => m.type === 'video');
      if (videoMedia) {
        videoUrl = videoMedia.url;
      }
    } else if (igData.url) {
      // Fallback if url contains the direct mp4 link
      videoUrl = igData.url;
    }

    if (!videoUrl) {
      throw new Error('No video URL found in RapidAPI response');
    }

    console.log(`[Instagram Download] Format found. Downloading MP4 to ${outputPath}...`);
    await downloadFile(videoUrl, outputPath);
    return outputPath;
  } catch (error) {
    console.error('[Instagram Download Error]', error.message);
    throw new Error(`Instagram download failed: ${error.message}`);
  }
}

/**
 * Extract metadata from Instagram reel using yt-dlp --dump-json
 */
async function extractInstagramMetadata(reelUrl, userId, userAgent = null) {
  const options = {
    method: 'GET',
    url: 'https://instagram-reels-downloader-api.p.rapidapi.com/download',
    params: { url: reelUrl },
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY || '7bb80227bemsh50cc3a7ae12938fp16806ajsn1978e3268063',
      'x-rapidapi-host': 'instagram-reels-downloader-api.p.rapidapi.com',
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await axios.request(options);
    const data = response.data;
    
    if (!data || !data.success || !data.data) {
      throw new Error(`RapidAPI failed: ${data?.message || 'Unknown error'}`);
    }

    const igData = data.data;

    const metadata = {
      uploader: igData.author || (igData.owner && igData.owner.username) || 'Unknown',
      caption: igData.title || '',
      uploadDate: '',
      duration: igData.duration || 0,
      title: igData.title || '',
      url: reelUrl,
    };

    if (metadata.duration > 180) {
      throw new Error(
        `Video duration (${metadata.duration}s) exceeds 180 seconds (3 minutes) limit for YouTube Shorts. Please trim the video manually.`
      );
    }

    return metadata;
  } catch (error) {
    throw new Error(`Failed to extract Instagram metadata: ${error.message}`);
  }
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
