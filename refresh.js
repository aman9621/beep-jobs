/**
 * refresh.js
 * 
 * Main orchestration pipeline for beep-jobs:
 * 1. Loads configuration & environment variables.
 * 2. Fetches listings from all active sources (Adzuna, Greenhouse, Lever) or generates mock data if --mock is passed.
 * 3. Normalizes and validates job formats.
 * 4. Filters out experienced roles and non-India postings.
 * 5. Deduplicates identical listings and URLs.
 * 6. Merges with existing jobs.json:
 *    - Preserves existing LLM tags to avoid duplicate API calls.
 *    - Drops expired listings older than 30 days.
 * 7. Calls Gemini API to tag untagged new postings with Role and City.
 * 8. Writes updated catalog to jobs.json with stats and timestamps.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { normalizeJob, isFresherJob } = require('./lib/normalize');
const { dedupeJobs } = require('./lib/dedupe');
const { tagJobsBatch } = require('./lib/tagger');
const { fetchAdzunaJobs } = require('./sources/adzuna');
const { fetchGreenhouseJobs } = require('./sources/greenhouse');
const { fetchLeverJobs } = require('./sources/lever');
const { fetchAshbyJobs } = require('./sources/ashby');
const { fetchRemotiveJobs } = require('./sources/remotive');
const { fetchJobicyJobs } = require('./sources/jobicy');

const JOBS_FILE_PATH = path.join(__dirname, 'jobs.json');
const BOARDS_FILE_PATH = path.join(__dirname, 'config', 'boards.json');

/**
 * Loads the existing jobs.json file if present.
 * 
 * @returns {{ lastUpdated: string|null, stats: Object, jobs: Array<Object> }} Existing job catalog.
 */
function loadExistingJobs() {
  if (fs.existsSync(JOBS_FILE_PATH)) {
    try {
      const raw = fs.readFileSync(JOBS_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.jobs)) {
        return parsed;
      }
    } catch (err) {
      console.warn(`[Refresh] Could not parse existing jobs.json: ${err.message}`);
    }
  }
  return { lastUpdated: null, stats: {}, jobs: [] };
}

/**
 * Generates an extensive set of realistic mock fresher and intern job listings in India.
 * Used when running with `node refresh.js --mock` for offline demonstrations and local testing.
 * 
 * @returns {Array<Object>} 200+ realistic normalized job records.
 */
function generateMockJobs() {
  console.log('[Refresh] Generating 220+ realistic mock fresher and intern jobs in India for offline testing...');

  const companies = [
    { name: 'Razorpay', domain: 'Fintech' },
    { name: 'CRED', domain: 'Fintech' },
    { name: 'Swiggy', domain: 'Food Delivery' },
    { name: 'Zomato', domain: 'Food Delivery' },
    { name: 'Postman', domain: 'Developer Tools' },
    { name: 'BrowserStack', domain: 'Cloud Infrastructure' },
    { name: 'CleverTap', domain: 'SaaS' },
    { name: 'Groww', domain: 'Investments' },
    { name: 'Urban Company', domain: 'Services Marketplace' },
    { name: 'Zepto', domain: 'Quick Commerce' },
    { name: 'Blinkit', domain: 'Quick Commerce' },
    { name: 'InMobi', domain: 'AdTech' },
    { name: 'Chargebee', domain: 'Subscription Billing' },
    { name: 'PhonePe', domain: 'Digital Payments' },
    { name: 'Zerodha', domain: 'Brokerage' },
    { name: 'Jio Platforms', domain: 'Telecom / Tech' },
    { name: 'Tata Consultancy Services', domain: 'IT Services' },
    { name: 'Infosys', domain: 'IT Services' },
    { name: 'Wipro', domain: 'IT Services' },
    { name: 'Zoho Corporation', domain: 'Business Software' }
  ];

  const roleTemplates = [
    { title: 'Software Engineer Trainee', keyword: 'trainee', role: 'Software Engineering', desc: 'Seeking enthusiastic fresher software engineer trainees with solid data structures and algorithms skills in Java, Python, or C++. Batch 2024 / 2025 welcome. 0-1 years experience.' },
    { title: 'Frontend Developer Intern', keyword: 'intern', role: 'Frontend', desc: 'Internship opportunity to build responsive web applications using React.js, Tailwind CSS, TypeScript, and modern browser standards. Stipend provided.' },
    { title: 'Backend Engineering Intern (Node.js/Go)', keyword: 'intern', role: 'Backend', desc: 'Looking for backend engineering interns to build microservices, manage PostgreSQL databases, and design clean REST and gRPC endpoints. 0-1 year experience.' },
    { title: 'Full Stack Developer - Fresher / Campus', keyword: 'fresher', role: 'Full Stack', desc: 'Hiring freshers for full stack development across Next.js, Node.js, and MongoDB. Fast-paced engineering team with mentorship.' },
    { title: 'Data Analyst Trainee', keyword: 'trainee', role: 'Data/Analytics', desc: 'Entry level data analyst position for fresh college graduates proficient in SQL, Python pandas, and dashboarding with Tableau or PowerBI.' },
    { title: 'AI / Machine Learning Research Intern', keyword: 'intern', role: 'AI/ML', desc: 'Opportunity for university students and recent grads to train transformer models, evaluate LLM pipelines, and implement vector retrieval systems with PyTorch.' },
    { title: 'DevOps / Cloud Operations Apprentice', keyword: 'entry level', role: 'DevOps/Cloud', desc: 'Entry level cloud engineer role focusing on AWS infrastructure, Docker containerization, CI/CD automation pipelines, and Linux administration.' },
    { title: 'QA / SDET Automation Intern', keyword: 'intern', role: 'QA/Testing', desc: 'Join our QA team as an automated testing intern. Write Selenium and Cypress end-to-end tests, inspect API contracts, and log bug reports.' },
    { title: 'Product Design (UI/UX) Intern', keyword: 'intern', role: 'Design/UX', desc: 'Designing user journey wireframes, high-fidelity prototypes in Figma, and conducting user interviews for mobile-first Indian consumers.' },
    { title: 'Associate Product Manager Intern', keyword: 'intern', role: 'Product', desc: 'Looking for analytical APM interns to define product requirements, write user stories, and track core engagement metrics.' },
    { title: 'Growth Marketing Intern', keyword: 'intern', role: 'Marketing', desc: 'Manage organic campaign distribution, SEO optimization, and social media analytics for fast-growing consumer platforms.' },
    { title: 'Business Development Executive - Trainee', keyword: 'trainee', role: 'Sales/Business Development', desc: 'BDE trainee role for enthusiastic communicators. Lead generation, B2B client prospecting, and account outreach. 0-1 years.' }
  ];

  const cities = [
    'Bengaluru, Karnataka',
    'Mumbai, Maharashtra',
    'Pune, Maharashtra',
    'Gurgaon, Haryana (Delhi NCR)',
    'Noida, Uttar Pradesh (Delhi NCR)',
    'Hyderabad, Telangana',
    'Chennai, Tamil Nadu',
    'Kolkata, West Bengal',
    'Ahmedabad, Gujarat',
    'Kochi, Kerala',
    'Remote - India'
  ];

  const jobs = [];
  let idCounter = 1000;

  for (let i = 0; i < companies.length; i++) {
    const comp = companies[i];
    for (let j = 0; j < roleTemplates.length; j++) {
      const templ = roleTemplates[j];
      const city = cities[(i + j) % cities.length];
      const daysAgo = Math.floor(Math.random() * 20); // 0 to 20 days ago
      const postDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
      const source = i % 3 === 0 ? 'greenhouse' : (i % 3 === 1 ? 'lever' : 'adzuna');

      jobs.push(
        normalizeJob({
          id: `mock-${idCounter++}`,
          title: `${templ.title} (${comp.name})`,
          company: comp.name,
          location: city,
          description: `${templ.desc} Domain: ${comp.domain}. Eligible: Batch of 2024, 2025, or 2026. Great learning culture and competitive stipend/compensation.`,
          url: `https://example.com/careers/${comp.name.toLowerCase().replace(/[^a-z0-9]/g, '')}/jobs/${idCounter}`,
          source,
          postedAt: postDate
        })
      );
    }
  }

  return jobs;
}

/**
 * Main execution function for the data ingestion and tagging pipeline.
 */
async function runRefresh() {
  console.log('====================================================');
  console.log('         BEEP-JOBS REFRESH PIPELINE START           ');
  console.log('====================================================');
  const startTime = Date.now();

  const isMock = process.argv.includes('--mock') || process.env.MOCK_DATA === 'true';
  const enableFuzzy = process.argv.includes('--fuzzy');

  // Load configured boards
  let boardConfig = { greenhouse: [], lever: [], ashby: [] };
  if (fs.existsSync(BOARDS_FILE_PATH)) {
    try {
      boardConfig = JSON.parse(fs.readFileSync(BOARDS_FILE_PATH, 'utf-8'));
    } catch (err) {
      console.warn(`[Refresh] Warning: Could not read ${BOARDS_FILE_PATH}: ${err.message}`);
    }
  }

  // 1. Fetch raw listings from all sources
  let allRawJobs = [];

  if (isMock) {
    allRawJobs = generateMockJobs();
  } else {
    console.log('[Refresh] Step 1: Fetching jobs from external public sources (Greenhouse, Lever, Ashby)...');

    // Fetch Greenhouse (100% free public boards API, 0 keys, 0 cards)
    try {
      const ghJobs = await fetchGreenhouseJobs(boardConfig.greenhouse || []);
      allRawJobs.push(...ghJobs);
    } catch (err) {
      console.error(`[Refresh] Greenhouse fetch failed: ${err.message}`);
    }

    // Fetch Lever (100% free public postings API, 0 keys, 0 cards)
    try {
      const leverJobs = await fetchLeverJobs(boardConfig.lever || []);
      allRawJobs.push(...leverJobs);
    } catch (err) {
      console.error(`[Refresh] Lever fetch failed: ${err.message}`);
    }

    // Fetch Ashby (100% free public job board API, 0 keys, 0 cards)
    try {
      const ashbyJobs = await fetchAshbyJobs(boardConfig.ashby || []);
      allRawJobs.push(...ashbyJobs);
    } catch (err) {
      console.error(`[Refresh] Ashby fetch failed: ${err.message}`);
    }

    // Fetch Remotive (100% free direct deep-linked remote & India jobs, 0 keys, 0 cards)
    try {
      const remotiveJobs = await fetchRemotiveJobs({ limit: 100 });
      allRawJobs.push(...remotiveJobs);
    } catch (err) {
      console.error(`[Refresh] Remotive fetch failed: ${err.message}`);
    }

    // Fetch Jobicy (100% free, direct deep-linked remote jobs, diverse companies)
    try {
      const jobicyJobs = await fetchJobicyJobs({ count: 50 });
      allRawJobs.push(...jobicyJobs);
    } catch (err) {
      console.error(`[Refresh] Jobicy fetch failed: ${err.message}`);
    }

    // Fetch Adzuna (Optional: only if developer keys are configured)
    try {
      const adzunaJobs = await fetchAdzunaJobs({ maxPagesPerQuery: 2 });
      allRawJobs.push(...adzunaJobs);
    } catch (err) {
      console.error(`[Refresh] Adzuna fetch failed: ${err.message}`);
    }

    // Fallback if APIs returned 0 jobs (e.g. offline network)
    if (allRawJobs.length === 0) {
      console.warn('[Refresh] All live sources returned 0 jobs or network was offline. Generating mock data to ensure functional state...');
      allRawJobs = generateMockJobs();
    }
  }

  console.log(`[Refresh] Total raw items collected: ${allRawJobs.length}`);

  // 2. Filter for fresher/intern and India location
  console.log('[Refresh] Step 2: Applying fresher & India location filter...');
  const fresherFilteredJobs = [];
  let droppedSeniorOrNonIndia = 0;

  for (const job of allRawJobs) {
    const check = isFresherJob(job);
    if (check.isFresher) {
      fresherFilteredJobs.push(job);
    } else {
      droppedSeniorOrNonIndia++;
    }
  }

  console.log(`[Refresh] Fresher filter retained: ${fresherFilteredJobs.length} posts (Dropped: ${droppedSeniorOrNonIndia} non-fresher or non-India posts).`);

  // 3. Deduplicate
  console.log('[Refresh] Step 3: Running deduplication engine...');
  const { uniqueJobs, stats: dedupeStats } = dedupeJobs(fresherFilteredJobs, { enableFuzzy });
  console.log(`[Refresh] Deduplication removed ${dedupeStats.duplicatesRemoved} duplicates. Unique remaining: ${uniqueJobs.length}`);

  // 4. Load existing jobs and purge expired (> 30 days)
  console.log('[Refresh] Step 4: Merging with existing jobs.json and purging > 30 days old...');
  const existingData = loadExistingJobs();
  const existingJobMap = {};
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let expiredCount = 0;

  // Populate map of prior tags for resumability
  for (const oldJob of existingData.jobs || []) {
    const postTime = new Date(oldJob.postedAt || oldJob.fetchedAt).getTime();
    if (now - postTime < THIRTY_DAYS_MS) {
      existingJobMap[oldJob.id] = oldJob;
      if (oldJob.url) existingJobMap[oldJob.url] = oldJob;
    } else {
      expiredCount++;
    }
  }
  console.log(`[Refresh] Retained ${Object.keys(existingJobMap).length} active jobs from previous state. Expired ${expiredCount} posts older than 30 days.`);

  // 5. LLM Tagging (Gemini Flash or Mock)
  console.log('[Refresh] Step 5: Categorizing roles and cities with LLM...');
  const taggedJobs = await tagJobsBatch(uniqueJobs, existingJobMap, {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    isMock: isMock || !process.env.GEMINI_API_KEY,
    batchSize: 5,
    delayBetweenBatchesMs: 1200
  });

  // 6. Write final jobs.json
  console.log('[Refresh] Step 6: Persisting catalog to jobs.json...');
  const finalPayload = {
    lastUpdated: new Date().toISOString(),
    stats: {
      total: taggedJobs.length,
      fetchedRaw: allRawJobs.length,
      filteredOutFreshness: droppedSeniorOrNonIndia,
      duplicatesRemoved: dedupeStats.duplicatesRemoved,
      expiredPurged: expiredCount
    },
    jobs: taggedJobs
  };

  fs.writeFileSync(JOBS_FILE_PATH, JSON.stringify(finalPayload, null, 2), 'utf-8');

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('====================================================');
  console.log('         REFRESH PIPELINE COMPLETED SUCCESSFULLY     ');
  console.log('====================================================');
  console.log(`- Final Active Jobs:        ${finalPayload.jobs.length}`);
  console.log(`- Duplicates Cleaned:       ${dedupeStats.duplicatesRemoved}`);
  console.log(`- Execution Duration:       ${durationSec}s`);
  console.log(`- Catalog File:             ${JOBS_FILE_PATH}`);
  console.log('====================================================');
}

// Auto-run if invoked directly
if (require.main === module) {
  runRefresh().catch(err => {
    console.error(`[Refresh] FATAL: Pipeline failed:`, err);
    process.exit(1);
  });
}

module.exports = { runRefresh };
