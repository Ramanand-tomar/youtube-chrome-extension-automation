const { pool } = require('../db');

const MAX_DAILY_UPLOADS = parseInt(process.env.MAX_DAILY_UPLOADS || '10', 10);

/**
 * Get today's date as YYYY-MM-DD string
 */
function getTodayDate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Get today's upload count
 */
async function getTodayUploadCount() {
  const today = getTodayDate();
  try {
    const { rows } = await pool.query(
      'SELECT upload_count FROM daily_quotas WHERE upload_date = $1',
      [today]
    );
    return rows[0]?.upload_count || 0;
  } catch (error) {
    console.error('Error fetching today upload count:', error);
    throw error;
  }
}

/**
 * Check if upload is allowed (has not exceeded quota)
 */
async function isUploadAllowed(count = 1) {
  const currentCount = await getTodayUploadCount();
  return currentCount + count <= MAX_DAILY_UPLOADS;
}

/**
 * Increment upload count for today using transactional/atomic insert & update
 */
async function incrementUploadCount(count = 1) {
  const today = getTodayDate();
  try {
    const { rows } = await pool.query(
      `INSERT INTO daily_quotas (upload_date, upload_count)
       VALUES ($1, $2)
       ON CONFLICT (upload_date)
       DO UPDATE SET upload_count = daily_quotas.upload_count + $2
       RETURNING upload_count`,
      [today, count]
    );

    // Clean up old dates (older than 7 days)
    try {
      await pool.query(
        "DELETE FROM daily_quotas WHERE upload_date < NOW() - INTERVAL '7 days'"
      );
    } catch (err) {
      console.error('Failed to clean up old daily_quotas:', err);
    }

    return rows[0]?.upload_count || 0;
  } catch (error) {
    console.error('Error incrementing upload count:', error);
    throw error;
  }
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
    resetDate: getTodayDate(),
  };
}

/**
 * Reset quota for a specific date (for testing)
 */
async function resetQuota(date = null) {
  const targetDate = date || getTodayDate();
  try {
    await pool.query(
      'DELETE FROM daily_quotas WHERE upload_date = $1',
      [targetDate]
    );
  } catch (error) {
    console.error('Error resetting quota:', error);
    throw error;
  }
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
