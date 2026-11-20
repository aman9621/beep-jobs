/**
 * scripts/make_eval_sample.js
 * 
 * Extracts 50 random job entries from jobs.json using a deterministic pseudo-random seed.
 * Outputs to eval/sample_50.csv with columns:
 * id,title,company,location,url,llm_role,llm_city,correct_role,correct_city
 * 
 * The last two columns are left blank for human evaluation & ground-truth annotation.
 */

const fs = require('fs');
const path = require('path');

const JOBS_FILE_PATH = path.join(__dirname, '..', 'jobs.json');
const EVAL_DIR = path.join(__dirname, '..', 'eval');
const OUTPUT_CSV_PATH = path.join(EVAL_DIR, 'sample_50.csv');

/**
 * Deterministic pseudo-random number generator (Mulberry32).
 * Ensures reproducible sampling so every run with the same seed yields the same sample.
 * 
 * @param {number} seed - Integer seed.
 * @returns {Function} Function returning float between 0 and 1.
 */
function createSeededRandom(seed) {
  return function() {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Escapes a string field for standard RFC 4180 CSV compliance.
 * 
 * @param {string} val - Input text.
 * @returns {string} CSV safe escaped field.
 */
function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
  return `"${str}"`;
}

function runSampleGenerator() {
  if (!fs.existsSync(JOBS_FILE_PATH)) {
    console.error(`[Eval Sample] Error: ${JOBS_FILE_PATH} does not exist. Run "npm run refresh" first.`);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(JOBS_FILE_PATH, 'utf-8'));
  const jobs = catalog.jobs || [];

  if (jobs.length === 0) {
    console.error('[Eval Sample] Error: jobs.json contains 0 jobs. Run refresh first.');
    process.exit(1);
  }

  const sampleSize = Math.min(50, jobs.length);
  console.log(`[Eval Sample] Sampling ${sampleSize} jobs deterministically from ${jobs.length} total jobs...`);

  // Use fixed seed for reproducible sampling
  const random = createSeededRandom(42);

  // Fisher-Yates shuffle copy using seeded random
  const shuffled = [...jobs];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const sample = shuffled.slice(0, sampleSize);

  // CSV Header
  const headers = ['id', 'title', 'company', 'location', 'url', 'llm_role', 'llm_city', 'correct_role', 'correct_city'];
  const rows = [headers.join(',')];

  for (const job of sample) {
    const row = [
      escapeCsv(job.id),
      escapeCsv(job.title),
      escapeCsv(job.company),
      escapeCsv(job.location),
      escapeCsv(job.url),
      escapeCsv(job.role || 'Other'),
      escapeCsv(job.city || 'Unknown'),
      '""', // correct_role (blank for human annotator)
      '""'  // correct_city (blank for human annotator)
    ];
    rows.push(row.join(','));
  }

  if (!fs.existsSync(EVAL_DIR)) {
    fs.mkdirSync(EVAL_DIR, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_CSV_PATH, rows.join('\n'), 'utf-8');
  console.log(`[Eval Sample] Generated sample file at: ${OUTPUT_CSV_PATH}`);
  console.log(`[Eval Sample] Next step: Open eval/sample_50.csv and fill in "correct_role" and "correct_city", then run "npm run eval:score".`);
}

runSampleGenerator();
