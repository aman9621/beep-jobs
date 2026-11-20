/**
 * scripts/seed_live.js
 *
 * Fetches REAL fresher/entry-level jobs in India from free, keyless public job boards:
 *   - Greenhouse (boards-api.greenhouse.io)
 *   - Lever      (api.lever.co)
 *   - Ashby      (api.ashbyhq.com)
 * Company slugs come from config/boards.json.
 *
 * Pipeline: fetch -> India + fresher filter -> dedupe -> Gemini tagging -> jobs.json
 *
 * Usage:
 *   npm run seed            # real Gemini tagging
 *   node scripts/seed_live.js --mock   # fake tags
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { normalizeJob, isFresherJob, isIndiaLocation } = require('../lib/normalize');
const { dedupeJobs } = require('../lib/dedupe');
const { tagJobsBatch } = require('../lib/tagger');

const JOBS_PATH = path.join(__dirname, '..', 'jobs.json');
const BOARDS_PATH = path.join(__dirname, '..', 'config', 'boards.json');
const isMock = process.argv.includes('--mock') || !process.env.GEMINI_API_KEY;

const boards = JSON.parse(fs.readFileSync(BOARDS_PATH, 'utf-8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "razorpaysoftwareprivatelimited" -> "Razorpay", "urbancompany" -> "Urbancompany" */
function prettyCompany(slug) {
  const s = slug.replace(/(softwareprivatelimited|privatelimited|pvtltd)$/i, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Greenhouse sends HTML escaped as &lt;p&gt;. Decode it first so stripHtml can clean it. */
function decodeEntities(s) {
  return (s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'beep-jobs/1.0' } });
  if (!res.ok) return null; // 404 = company not on this board, skip quietly
  return res.json();
}

// ─── Greenhouse ───────────────────────────────────────────────────────────────
async function fetchGreenhouse() {
  console.log('[Seed] Fetching from Greenhouse...');
  const jobs = [];
  let working = 0;
  for (const slug of boards.greenhouse || []) {
    try {
      const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
      if (!data) continue;
      working++;
      for (const j of data.jobs || []) {
        const loc = (j.location && j.location.name) || '';
        if (!isIndiaLocation(loc)) continue;
        jobs.push(
          normalizeJob({
            id: `gh-${slug}-${j.id}`,
            title: j.title,
            company: prettyCompany(slug),
            location: loc,
            description: decodeEntities(j.content),
            url: j.absolute_url, // specific job page
            source: 'greenhouse',
            postedAt: j.updated_at
          })
        );
      }
    } catch (e) {
      console.warn(`[Seed] Greenhouse ${slug} failed: ${e.message}`);
    }
    await sleep(150);
  }
  console.log(`[Seed] Greenhouse: ${jobs.length} India jobs (${working} boards responded)`);
  return jobs;
}

// ─── Lever ────────────────────────────────────────────────────────────────────
async function fetchLever() {
  console.log('[Seed] Fetching from Lever...');
  const jobs = [];
  let working = 0;
  for (const slug of boards.lever || []) {
    try {
      const list = await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
      if (!Array.isArray(list)) continue;
      working++;
      for (const j of list) {
        const loc = (j.categories && j.categories.location) || '';
        if (!isIndiaLocation(loc)) continue;
        jobs.push(
          normalizeJob({
            id: `lever-${slug}-${j.id}`,
            title: j.text,
            company: prettyCompany(slug),
            location: loc,
            description: `${j.descriptionPlain || ''} ${j.additionalPlain || ''}`,
            url: j.hostedUrl, // specific job page
            source: 'lever',
            postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : undefined
          })
        );
      }
    } catch (e) {
      console.warn(`[Seed] Lever ${slug} failed: ${e.message}`);
    }
    await sleep(150);
  }
  console.log(`[Seed] Lever: ${jobs.length} India jobs (${working} boards responded)`);
  return jobs;
}

// ─── Ashby ────────────────────────────────────────────────────────────────────
async function fetchAshby() {
  console.log('[Seed] Fetching from Ashby...');
  const jobs = [];
  let working = 0;
  for (const slug of boards.ashby || []) {
    try {
      const data = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
      if (!data) continue;
      working++;
      for (const j of data.jobs || []) {
        const loc = j.location || '';
        if (!isIndiaLocation(loc)) continue;
        jobs.push(
          normalizeJob({
            id: `ashby-${slug}-${j.id}`,
            title: j.title,
            company: prettyCompany(slug),
            location: loc,
            description: j.descriptionPlain || j.descriptionHtml || `${j.title}. ${j.department || ''}`,
            url: j.jobUrl || `https://jobs.ashbyhq.com/${slug}/${j.id}`,
            source: 'ashby',
            postedAt: j.publishedAt
          })
        );
      }
    } catch (e) {
      console.warn(`[Seed] Ashby ${slug} failed: ${e.message}`);
    }
    await sleep(150);
  }
  console.log(`[Seed] Ashby: ${jobs.length} India jobs (${working} boards responded)`);
  return jobs;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n====================================================');
  console.log('  BEEP-JOBS LIVE SEED — real fresher jobs, India only');
  console.log('====================================================\n');

  const [greenhouse, lever, ashby] = await Promise.all([
    fetchGreenhouse(),
    fetchLever(),
    fetchAshby()
  ]);

  const all = [...greenhouse, ...lever, ...ashby];
  console.log(`\n[Seed] Total India jobs collected: ${all.length}`);

  // Fresher filter, and count WHY jobs are dropped (useful for the video)
  const reasons = {};
  const filtered = [];
  const noSignal = [];
  for (const j of all) {
    const r = isFresherJob(j);
    if (r.isFresher) {
      filtered.push(j);
    } else {
      if (r.reason === 'No fresher signal found') noSignal.push(`${j.company} | ${j.title}`);
      const key = r.reason.replace(/\d+/g, 'N');
      reasons[key] = (reasons[key] || 0) + 1;
    }
  }
  console.log(`[Seed] After fresher filter: ${filtered.length} jobs`);
  console.log('[Seed] Dropped because:', reasons);

  // Dry run: print the titles with no fresher signal, then stop (no tagging, no API cost)
  if (process.argv.includes('--dry')) {
    console.log('\n[Seed] Titles with no fresher signal:\n' + noSignal.join('\n'));
    process.exit(0);
  }

  const { uniqueJobs } = dedupeJobs(filtered, { enableFuzzy: false });
  console.log(`[Seed] After dedupe: ${uniqueJobs.length} unique jobs`);

  // Reuse tags from the previous jobs.json so only NEW jobs call Gemini
  const existingMap = {};
  try {
    const prev = JSON.parse(fs.readFileSync(JOBS_PATH, 'utf-8'));
    for (const j of prev.jobs || []) existingMap[j.id] = j;
  } catch (e) { /* first run, nothing cached */ }

  console.log(`\n[Seed] Tagging with Gemini (mock=${isMock})...`);
  const taggedAll = await tagJobsBatch(uniqueJobs, existingMap, {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    isMock,
    batchSize: 1,
    delayBetweenBatchesMs: 5000
  });
  const tagged = taggedAll.filter((j) => !j.tagFailed);
  console.log(`[Seed] Tag failures skipped (retry next run): ${taggedAll.length - tagged.length}`);

  const payload = {
    lastUpdated: new Date().toISOString(),
    stats: {
      total: tagged.length,
      fetchedRaw: all.length,
      filteredOutFreshness: all.length - filtered.length,
      duplicatesRemoved: filtered.length - uniqueJobs.length,
      expiredPurged: 0
    },
    jobs: tagged
  };

  fs.writeFileSync(JOBS_PATH, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`\n✅ Wrote ${tagged.length} jobs to jobs.json`);
  console.log('   Run "npm start" then open http://localhost:3000\n');
}

main().catch((err) => {
  console.error('[Seed] FATAL:', err);
  process.exit(1);
});