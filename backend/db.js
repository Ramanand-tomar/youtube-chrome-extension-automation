const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/**
 * Create tables if they don't exist yet.
 * Called once on server startup.
 */
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id     VARCHAR(36)  PRIMARY KEY,
      tokens      JSONB        NOT NULL DEFAULT '{}'::jsonb,
      email       VARCHAR(255),
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id               VARCHAR(36)  PRIMARY KEY,
      user_id          VARCHAR(36)  NOT NULL,
      video_url        TEXT         NOT NULL,
      title            TEXT,
      description      TEXT,
      privacy          VARCHAR(20)  NOT NULL DEFAULT 'unlisted',
      platform         VARCHAR(20)  NOT NULL DEFAULT 'youtube',
      scheduled_at     TIMESTAMPTZ  NOT NULL,
      status           VARCHAR(20)  NOT NULL DEFAULT 'pending',
      error            TEXT,
      video_id         VARCHAR(50),
      video_url_result TEXT,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);
  console.log('[DB] Schema initialized');
}

// ─── Token / User helpers ────────────────────────────────────────────────────

async function loadTokens(userId) {
  const { rows } = await pool.query(
    'SELECT tokens FROM users WHERE user_id = $1',
    [userId]
  );
  return rows[0]?.tokens || null;
}

async function saveTokens(userId, tokens, email = null) {
  await pool.query(
    `INSERT INTO users (user_id, tokens, email, updated_at)
     VALUES ($1, $2::jsonb, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET tokens     = $2::jsonb,
           email      = COALESCE($3, users.email),
           updated_at = NOW()`,
    [userId, JSON.stringify(tokens), email]
  );
}

async function deleteTokens(userId) {
  await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
}

async function getUserInfo(userId) {
  const { rows } = await pool.query(
    'SELECT email, updated_at FROM users WHERE user_id = $1',
    [userId]
  );
  return rows[0] || null;
}

module.exports = { pool, initDb, loadTokens, saveTokens, deleteTokens, getUserInfo };
