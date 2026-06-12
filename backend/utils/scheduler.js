const { randomUUID } = require('crypto');
const { pool } = require('../db');

function rowToJob(row) {
  return {
    id: row.id,
    userId: row.user_id,
    videoUrl: row.video_url,
    title: row.title,
    description: row.description,
    privacy: row.privacy,
    platform: row.platform,
    scheduledAt: row.scheduled_at?.toISOString(),
    status: row.status,
    error: row.error,
    videoId: row.video_id,
    videoUrlResult: row.video_url_result,
    createdAt: row.created_at?.toISOString(),
    postToYouTube: row.post_to_youtube,
    crossPostToInstagram: row.cross_post_to_instagram,
  };
}

async function addJob({ userId, videoUrl, title, description, privacy, platform, scheduledAt, postToYouTube, crossPostToInstagram }) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO scheduled_jobs
       (id, user_id, video_url, title, description, privacy, platform, scheduled_at, post_to_youtube, cross_post_to_instagram)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      userId,
      videoUrl,
      title   || null,
      description || null,
      privacy || 'unlisted',
      platform || 'youtube',
      scheduledAt,
      postToYouTube !== false,
      !!crossPostToInstagram,
    ]
  );
  const { rows } = await pool.query('SELECT * FROM scheduled_jobs WHERE id = $1', [id]);
  return rowToJob(rows[0]);
}

async function getJobs(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM scheduled_jobs WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return rows.map(rowToJob);
}

async function getDueJobs() {
  const { rows } = await pool.query(
    `SELECT * FROM scheduled_jobs
     WHERE status = 'pending' AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC`
  );
  return rows.map(rowToJob);
}

async function updateJob(id, updates) {
  const colMap = {
    status:        'status',
    error:         'error',
    videoId:       'video_id',
    videoUrlResult: 'video_url_result',
  };

  const sets = ['updated_at = NOW()'];
  const values = [];
  let idx = 1;

  for (const [key, col] of Object.entries(colMap)) {
    if (key in updates) {
      sets.push(`${col} = $${idx++}`);
      values.push(updates[key] ?? null);
    }
  }

  values.push(id);
  await pool.query(
    `UPDATE scheduled_jobs SET ${sets.join(', ')} WHERE id = $${idx}`,
    values
  );
}

async function claimDueJobs() {
  const { rows } = await pool.query(
    `UPDATE scheduled_jobs
     SET status = 'processing', updated_at = NOW()
     WHERE id IN (
       SELECT id FROM scheduled_jobs
       WHERE status = 'pending' AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`
  );
  return rows.map(rowToJob);
}

async function removeJob(id) {
  const { rowCount } = await pool.query(
    `DELETE FROM scheduled_jobs WHERE id = $1 AND status = 'pending'`,
    [id]
  );
  return rowCount > 0;
}

module.exports = { addJob, getJobs, getDueJobs, claimDueJobs, updateJob, removeJob };
