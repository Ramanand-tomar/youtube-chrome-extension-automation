const fs = require('fs-extra');
const path = require('path');

const QUOTA_DIR = path.resolve(__dirname, '../quota');
const QUOTA_FILE = path.join(QUOTA_DIR, 'daily-uploads.json');
const MAX_DAILY_UPLOADS = parseInt(process.env.MAX_DAILY_UPLOADS || '10', 10);

// Ensure quota directory exists
fs.ensureDirSync(QUOTA_DIR);

/**
 * Get today's date as YYYY-MM-DD string
 */
function getTodayDate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Load quota data from file
 */
async function loadQuotaData() {
  try {
    if (await fs.pathExists(QUOTA_FILE)) {
      return await fs.readJson(QUOTA_FILE);
    }
  } catch (error) {
    console.error('Error loading quota data:', error);
  }
  return {};
}

/**
 * Save quota data to file
 */
async function saveQuotaData(data) {
  try {
    const tempPath = `${QUOTA_FILE}.tmp`;
    await fs.writeJson(tempPath, data, { spaces: 2 });
    await fs.move(tempPath, QUOTA_FILE, { overwrite: true });
  } catch (error) {
    console.error('Error saving quota data:', error);
    throw error;
  }
}

/**
 * Get today's upload count
 */
async function getTodayUploadCount() {
  const data = await loadQuotaData();
  const today = getTodayDate();
  return data[today] || 0;
}

/**
 * Check if upload is allowed (has not exceeded quota)
 */
async function isUploadAllowed(count = 1) {
  const today = getTodayDate();
  const currentCount = await getTodayUploadCount();
  return currentCount + count <= MAX_DAILY_UPLOADS;
}

/**
 * Increment upload count for today
 */
async function incrementUploadCount(count = 1) {
  const data = await loadQuotaData();
  const today = getTodayDate();

  // Clean up old dates (older than 7 days)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  for (const date in data) {
    if (date < cutoffDateStr) {
      delete data[date];
    }
  }

  data[today] = (data[today] || 0) + count;
  await saveQuotaData(data);
  return data[today];
}

/**
 * Get remaining uploads for today
 */
async function getRemainingUploads() {
  const currentCount = await getTodayUploadCount();
  return Math.max(0, MAX_DAILY_UPLOADS - currentCount);
}

/**
 * Get upload quota info
 */
async function getQuotaInfo() {
  const current = await getTodayUploadCount();
  const remaining = await getRemainingUploads();

  return {
    current,
    max: MAX_DAILY_UPLOADS,
    remaining,
    resetDate: new Date().toISOString().split('T')[0],
  };
}

/**
 * Reset quota for a specific date (for testing)
 */
async function resetQuota(date = null) {
  const data = await loadQuotaData();
  const targetDate = date || getTodayDate();
  delete data[targetDate];
  await saveQuotaData(data);
}

module.exports = {
  getTodayUploadCount,
  isUploadAllowed,
  incrementUploadCount,
  getRemainingUploads,
  getQuotaInfo,
  resetQuota,
  MAX_DAILY_UPLOADS,
};
