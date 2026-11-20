/**
 * lib/normalize.js
 *
 * 1. Converts raw job data from any source into one common format.
 * 2. Cleans HTML from descriptions.
 * 3. Filters: India-only and fresher/intern/entry-level only.
 */

/** Removes HTML tags and extra spaces so text is clean for the LLM and the UI. */
function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cuts text at a word boundary so prompts stay small (fewer tokens = lower cost). */
function truncateText(text, maxLen = 1500) {
  if (!text || text.length <= maxLen) return text || '';
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

/** Converts any provider's job object into the standard beep-jobs format. */
function normalizeJob({
  id,
  title,
  company,
  location,
  description,
  url,
  source,
  postedAt
}) {
  const cleanTitle = (title || 'Untitled Role').trim();
  const cleanCompany = (company || 'Unknown Company').trim();
  // Missing location is "Unknown" (NOT "India"), so it cannot sneak past the India filter.
  const cleanLocation = (location || 'Unknown').trim();
  const cleanDescription = truncateText(stripHtml(description || ''), 1500);

  let posted;
  try {
    posted = postedAt ? new Date(postedAt).toISOString() : new Date().toISOString();
  } catch (e) {
    posted = new Date().toISOString(); // invalid date from the API
  }

  return {
    id: String(id || `${source}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`),
    title: cleanTitle,
    company: cleanCompany,
    location: cleanLocation,
    description: cleanDescription,
    url: (url || '').trim(),
    source: (source || 'generic').toLowerCase(),
    postedAt: posted,
    fetchedAt: new Date().toISOString()
  };
}

// Indian cities/states. Matched with word boundaries so "Indiana" does NOT match "india".
const INDIA_REGEX = new RegExp(
  '\\b(' +
  [
    'india', 'bengaluru', 'bangalore', 'mumbai', 'pune', 'delhi', 'new delhi',
    'noida', 'gurgaon', 'gurugram', 'hyderabad', 'chennai', 'kolkata',
    'ahmedabad', 'kochi', 'cochin', 'trivandrum', 'thiruvananthapuram',
    'indore', 'jaipur', 'chandigarh', 'coimbatore', 'surat', 'nagpur',
    'bhubaneswar', 'lucknow', 'vadodara', 'mysuru', 'mysore', 'visakhapatnam',
    'kerala', 'karnataka', 'tamil nadu', 'maharashtra', 'telangana',
    'haryana', 'gujarat', 'rajasthan', 'uttar pradesh'
  ].join('|') +
  ')\\b'
);

/** True if the LOCATION string is in India. */
function isIndiaLocation(locationStr) {
  if (!locationStr) return false;
  return INDIA_REGEX.test(locationStr.toLowerCase());
}

/**
 * Finds the lowest "years of experience" number mentioned in the text.
 * Examples: "3+ years of experience" -> 3, "2-5 years experience" -> 2, "0-2 years" -> 0.
 * Only counts a number if the word "experience"/"exp" is near it,
 * so "founded 3 years ago" is ignored.
 */
function minYearsRequired(text) {
  const regex = /(\d{1,2})\s*(?:\+|(?:-|–|to)\s*\d{1,2})?\s*(?:years?|yrs?)\b/g;
  let min = null;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const start = Math.max(0, m.index - 40);
    const end = Math.min(text.length, m.index + m[0].length + 40);
    const windowText = text.slice(start, end);
    if (!/\b(experience|exp)\b/.test(windowText)) continue;
    const n = parseInt(m[1], 10);
    if (min === null || n < min) min = n;
  }
  return min;
}

/**
 * Decides if a job is for freshers/interns/entry-level in India.
 * A job must show a POSITIVE fresher signal to pass.
 *
 * @param {Object} job - normalized job
 * @returns {{ isFresher: boolean, reason: string }}
 */
function isFresherJob(job) {
  const title = (job.title || '').toLowerCase();
  const desc = (job.description || '').toLowerCase();
  const loc = (job.location || '').toLowerCase();

  // STEP 1: India check (location field only).
  // - Adzuna is queried with country "in", so an unknown location is trusted as India.
  // - A bare "Remote" location counts only if India is mentioned in title/description.
  let inIndia = isIndiaLocation(loc);
  if (!inIndia && job.source === 'adzuna' && (loc === 'unknown' || loc === '')) {
    inIndia = true;
  }
  if (!inIndia && /\bremote\b/.test(loc) && /\bindia\b/.test(`${title} ${desc}`)) {
    inIndia = true;
  }
  if (!inIndia) return { isFresher: false, reason: 'Non-India location' };

  // STEP 2: reject if the description asks for 2+ years of experience.
  const minYears = minYearsRequired(desc);
  if (minYears !== null && minYears >= 2) {
    return { isFresher: false, reason: `Requires ${minYears}+ years of experience` };
  }

  // STEP 3: a fresher word in the TITLE wins over seniority words
  // (so "Product Manager Intern" is kept).
  const titleSignal =
    /\b(intern|interns|internship|trainee|fresher|freshers|apprentice|graduate|entry[- ]level|junior|jr)\b/;
  if (titleSignal.test(title)) {
    return { isFresher: true, reason: 'Fresher keyword in title' };
  }

  // STEP 4: seniority words in the title reject the job.
  const seniorTitle =
    /\b(senior|sr|lead|principal|architect|manager|director|head|vp|vice president|staff|chief|sde[- ]?(ii|iii|2|3)|engineer (ii|iii))\b/;
  if (seniorTitle.test(title)) {
    return { isFresher: false, reason: 'Senior title keyword' };
  }

  // STEP 5: fresher signal in the description (word boundaries, so "internal" does not match).
  const descSignal =
    /\b(freshers?|internship|interns?|trainee|entry[- ]level|recent graduates?|fresh graduates?|new graduates?|campus|0\s*[-–]\s*[12]\s*years?|no (prior )?experience|batch of 20\d\d|20\d\d (passout|graduate|batch))\b/;
  if (descSignal.test(desc)) {
    return { isFresher: true, reason: 'Fresher keyword in description' };
  }

  // STEP 5b: entry-level style titles with no seniority and no 2+ years requirement
  const entryTitle = /\b(associate|analyst|engineer i|sde[- ]?(1|i)|software engineer|developer|executive|coordinator|specialist|representative|assistant)\b/;
  if (entryTitle.test(title) && (minYears === null || minYears < 2)) {
    return { isFresher: true, reason: 'Entry-level style title, no seniority or 2+ years found' };
  }

  // STEP 6: no positive signal means not a fresher job.
  return { isFresher: false, reason: 'No fresher signal found' };
}

module.exports = {
  stripHtml,
  truncateText,
  normalizeJob,
  isIndiaLocation,
  minYearsRequired,
  isFresherJob
};