/**
 * lib/dedupe.js
 * 
 * Removes duplicate job postings using:
 * 1. Normalized composite key: lowercase(title + company + city) without punctuation/spacing.
 * 2. Exact URL deduplication.
 * 3. Optional fuzzy similarity matching on title + company.
 */

/**
 * Creates a clean alphanumeric slug from a string by removing punctuation and extra whitespace.
 * 
 * @param {string} str - Raw input string.
 * @returns {string} Sanitized alphanumeric string.
 */
function cleanKey(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Calculates Jaccard similarity between two strings based on character 3-grams (trigrams).
 * Used for optional fuzzy deduplication to catch minor phrasing differences (e.g. "React Intern" vs "React.js Intern").
 * 
 * @param {string} a - First string.
 * @param {string} b - Second string.
 * @returns {number} Similarity score between 0.0 and 1.0.
 */
function calculateSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const getTrigrams = (str) => {
    const clean = str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const trigrams = new Set();
    for (let i = 0; i <= clean.length - 3; i++) {
      trigrams.add(clean.substring(i, i + 3));
    }
    return trigrams;
  };

  const setA = getTrigrams(a);
  const setB = getTrigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Deduplicates a list of normalized job records.
 * 
 * @param {Array<Object>} jobs - Array of normalized job objects.
 * @param {Object} options - Deduplication options.
 * @param {boolean} [options.enableFuzzy=false] - Whether to apply fuzzy matching.
 * @param {number} [options.fuzzyThreshold=0.85] - Similarity cutoff score (0.0 to 1.0).
 * @returns {{ uniqueJobs: Array<Object>, stats: { totalFetched: number, duplicatesRemoved: number, finalCount: number } }}
 */
function dedupeJobs(jobs, options = {}) {
  const { enableFuzzy = false, fuzzyThreshold = 0.85 } = options;
  const totalFetched = jobs.length;

  const seenUrls = new Set();
  const seenExactKeys = new Set();
  const uniqueJobs = [];

  for (const job of jobs) {
    // Step 1: Check URL collision
    const cleanUrl = (job.url || '').split('?')[0].trim().toLowerCase();
    if (cleanUrl && seenUrls.has(cleanUrl)) {
      continue;
    }

    // Step 2: Check composite key collision: title + company + city/location
    const titleKey = cleanKey(job.title);
    const companyKey = cleanKey(job.company);
    const locationKey = cleanKey(job.location);
    const exactCompositeKey = `${titleKey}__${companyKey}__${locationKey}`;

    if (seenExactKeys.has(exactCompositeKey)) {
      continue;
    }

    // Step 3 (Optional): Fuzzy comparison against already accepted jobs
    if (enableFuzzy) {
      const candidateString = `${job.title} ${job.company}`;
      const isFuzzyDuplicate = uniqueJobs.some(existing => {
        // Only compare if same company
        if (cleanKey(existing.company) !== companyKey) return false;
        const existingString = `${existing.title} ${existing.company}`;
        const score = calculateSimilarity(candidateString, existingString);
        return score >= fuzzyThreshold;
      });

      if (isFuzzyDuplicate) {
        continue;
      }
    }

    // Mark as seen and retain job
    if (cleanUrl) seenUrls.add(cleanUrl);
    seenExactKeys.add(exactCompositeKey);
    uniqueJobs.push(job);
  }

  const duplicatesRemoved = totalFetched - uniqueJobs.length;
  const stats = {
    totalFetched,
    duplicatesRemoved,
    finalCount: uniqueJobs.length
  };

  return { uniqueJobs, stats };
}

module.exports = {
  cleanKey,
  calculateSimilarity,
  dedupeJobs
};
