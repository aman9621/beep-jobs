
/**
 * server.js
 * 
 * Express HTTP server providing:
 * - Static file hosting for public/ (vanilla single-page frontend).
 * - GET /api/jobs: Fast in-memory filtering, skill/keyword search, workMode filters, and pagination.
 * - GET /api/filters: Dynamic aggregation of roles, cities, work modes, and top skills.
 * - GET /api/apply/:id: Intent tracking for application clicks with direct redirect.
 * - Auto-reloads jobs.json when updated without requiring process restart.
 */

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JOBS_FILE_PATH = path.join(__dirname, 'jobs.json');

app.use(express.json());

// In-memory cache of jobs with mtime tracking
let cachedData = {
  lastUpdated: null,
  stats: {},
  jobs: []
};
let lastMtime = 0;

/**
 * Reads jobs.json from disk if modified or if cache is cold.
 * 
 * @returns {{ lastUpdated: string|null, stats: Object, jobs: Array<Object> }}
 */
function getJobCatalog() {
  try {
    if (fs.existsSync(JOBS_FILE_PATH)) {
      const stats = fs.statSync(JOBS_FILE_PATH);
      if (stats.mtimeMs !== lastMtime) {
        const raw = fs.readFileSync(JOBS_FILE_PATH, 'utf-8');
        cachedData = JSON.parse(raw);
        lastMtime = stats.mtimeMs;
      }
    }
  } catch (err) {
    console.warn(`[Server] Error refreshing job cache from disk: ${err.message}`);
  }
  return cachedData;
}

// Serve static assets from public/ directory
app.use(express.static(path.join(__dirname, 'public')));

/**
 * GET /api/jobs
 * Query parameters:
 * - q: Search query (matches title, company, description, eligibility, skills).
 * - role: Exact match filter on classified role.
 * - city: Exact match filter on classified city.
 * - workMode: Filter by "Remote", "In-office", or "Hybrid".
 * - page: 1-indexed page number (default 1).
 * - limit: Number of jobs per page (default 21).
 */
app.get('/api/jobs', (req, res) => {
  const catalog = getJobCatalog();
  const allJobs = catalog.jobs || [];

  const {
    q = '',
    role = '',
    city = '',
    workMode = '',
    page = '1',
    limit = '21'
  } = req.query;

  const searchQuery = String(q).trim().toLowerCase();
  const roleFilter = String(role).trim().toLowerCase();
  const cityFilter = String(city).trim().toLowerCase();
  const workModeFilter = String(workMode).trim().toLowerCase();

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 21));

  // Filter matching records
  const filtered = allJobs.filter(job => {
    // Role filter
    if (roleFilter && (job.role || '').toLowerCase() !== roleFilter) {
      return false;
    }

    // City filter
    if (cityFilter && (job.city || '').toLowerCase() !== cityFilter) {
      return false;
    }

    // Work Mode filter (Remote, In-office, Hybrid)
    if (workModeFilter && (job.workMode || '').toLowerCase() !== workModeFilter) {
      return false;
    }

    // Keyword search over title, company, description, eligibility, and skill tags
    if (searchQuery) {
      const skillsStr = Array.isArray(job.skills) ? job.skills.join(' ') : '';
      const searchableContent = `${job.title} ${job.company} ${job.location} ${job.description} ${job.eligibility || ''} ${skillsStr}`.toLowerCase();
      if (!searchableContent.includes(searchQuery)) {
        return false;
      }
    }

    return true;
  });

  // Calculate pagination slices
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageLimit) || 1;
  const startIndex = (pageNum - 1) * pageLimit;
  const paginatedJobs = filtered.slice(startIndex, startIndex + pageLimit);

  res.json({
    total,
    page: pageNum,
    limit: pageLimit,
    totalPages,
    lastUpdated: catalog.lastUpdated,
    stats: catalog.stats || {},
    jobs: paginatedJobs
  });
});

/**
 * GET /api/filters
 * Returns distinct roles, cities, work modes, and top skills with current job counts for faceted UI.
 */
app.get('/api/filters', (req, res) => {
  const catalog = getJobCatalog();
  const allJobs = catalog.jobs || [];

  const roleCounts = {};
  const cityCounts = {};
  const workModeCounts = {};
  const skillCounts = {};

  for (const job of allJobs) {
    const r = job.role || 'Other';
    const c = job.city || 'Unknown';
    const wm = job.workMode || (job.city === 'Remote' ? 'Remote' : 'In-office');

    roleCounts[r] = (roleCounts[r] || 0) + 1;
    cityCounts[c] = (cityCounts[c] || 0) + 1;
    workModeCounts[wm] = (workModeCounts[wm] || 0) + 1;

    if (Array.isArray(job.skills)) {
      for (const skill of job.skills) {
        skillCounts[skill] = (skillCounts[skill] || 0) + 1;
      }
    }
  }

  const roles = Object.entries(roleCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const cities = Object.entries(cityCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const workModes = Object.entries(workModeCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const topSkills = Object.entries(skillCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  res.json({
    totalJobs: allJobs.length,
    lastUpdated: catalog.lastUpdated,
    roles,
    cities,
    workModes,
    topSkills
  });
});

/**
 * GET or POST /api/apply/:id
 * Tracks student apply clicks for conversion analytics and redirects or returns JSON.
 */
app.all('/api/apply/:id', (req, res) => {
  const catalog = getJobCatalog();
  const job = (catalog.jobs || []).find(j => j.id === req.params.id);

  if (job) {
    job.applyClicks = (job.applyClicks || 0) + 1;
  }

  if (req.method === 'POST') {
    return res.json({ success: true, applyClicks: job ? job.applyClicks : 0 });
  }

  if (job && job.url) {
    return res.redirect(job.url);
  }

  res.redirect('/');
});

// Start Express listening
app.listen(PORT, () => {
  console.log(`[Server] beep-jobs running at http://localhost:${PORT}`);
  console.log(`[Server] Serving static UI from public/`);
  console.log(`[Server] Total jobs currently in catalog: ${getJobCatalog().jobs?.length || 0}`);
});

module.exports = app;
