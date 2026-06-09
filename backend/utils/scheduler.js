const fs = require('fs-extra');
const path = require('path');

const SCHEDULE_DIR = path.resolve(__dirname, '../schedule');
const QUEUE_PATH = path.join(SCHEDULE_DIR, 'queue.json');

// Ensure schedule directory exists
fs.ensureDirSync(SCHEDULE_DIR);
if (!fs.pathExistsSync(QUEUE_PATH)) {
  fs.writeJsonSync(QUEUE_PATH, []);
}

async function getJobs() {
  try {
    return await fs.readJson(QUEUE_PATH);
  } catch (error) {
    return [];
  }
}

async function saveJobs(jobs) {
  const tempPath = `${QUEUE_PATH}.tmp`;
  await fs.writeJson(tempPath, jobs, { spaces: 2 });
  await fs.move(tempPath, QUEUE_PATH, { overwrite: true });
}

async function addJob(jobData) {
  const jobs = await getJobs();
  const newJob = {
    id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    videoUrl: jobData.videoUrl,
    title: jobData.title || '',
    description: jobData.description || '',
    privacy: jobData.privacy || 'unlisted',
    platform: jobData.platform || 'youtube', // 'youtube' (generic) or 'instagram'
    scheduledAt: jobData.scheduledAt, // ISO string or timestamp
    createdAt: new Date().toISOString(),
    status: 'pending', // 'pending', 'processing', 'done', 'error'
    error: null,
    videoId: null,
    videoUrlResult: null,
  };
  jobs.push(newJob);
  await saveJobs(jobs);
  return newJob;
}

async function removeJob(id) {
  const jobs = await getJobs();
  const filteredJobs = jobs.filter((job) => job.id !== id);
  if (jobs.length !== filteredJobs.length) {
    await saveJobs(filteredJobs);
    return true;
  }
  return false;
}

async function updateJob(id, updates) {
  const jobs = await getJobs();
  const jobIndex = jobs.findIndex((job) => job.id === id);
  if (jobIndex !== -1) {
    jobs[jobIndex] = { ...jobs[jobIndex], ...updates };
    await saveJobs(jobs);
    return jobs[jobIndex];
  }
  return null;
}

async function getDueJobs() {
  const jobs = await getJobs();
  const now = new Date();
  return jobs.filter((job) => job.status === 'pending' && new Date(job.scheduledAt) <= now);
}

module.exports = {
  getJobs,
  addJob,
  removeJob,
  updateJob,
  getDueJobs,
  SCHEDULE_DIR,
};
