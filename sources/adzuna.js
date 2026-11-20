/**
 * sources/adzuna.js
 * 
 * Fetches job postings from the Adzuna API for India ("in").
 * NOTE: Adzuna is 100% OPTIONAL. If you do not have Adzuna keys or do not wish to provide
 * credit card details to Adzuna, this source is automatically skipped with zero impact on the app.
 * Greenhouse, Lever, and Ashby provide 100% free data without any credit card or keys.
 */

const { normalizeJob } = require('../lib/normalize');

// Predefined search queries designed to find entry-level/fresher roles
const SEARCH_QUERIES = [
  'fresher',
  'intern',
  'internship',
  'entry level',
  'graduate trainee',
  'junior developer'
];

/**
 * Fetches one page of Adzuna job results for a specific search term.
 * 
 * @param {string} query - The search query term.
 * @param {number} page - Page number (1-based).
 * @param {string} appId - Adzuna Application ID.
 * @param {string} appKey - Adzuna Application Key.
 * @returns {Promise<Array<Object>>} Raw job objects.
 */
async function fetchAdzunaPage(query, page, appId, appKey) {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://api.adzuna.com/v1/api/jobs/in/search/${page}?app_id=${appId}&app_key=${appKey}&what=${encodedQuery}&results_per_page=50&content-type=application/json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return Array.isArray(data.results) ? data.results : [];
}

/**
 * Main fetcher for Adzuna India jobs.
 * Iterates through targeted queries with pagination if credentials are provided.
 * 
 * @param {Object} options - Configuration options.
 * @param {number} [options.maxPagesPerQuery=2] - Max pages to fetch per query.
 * @returns {Promise<Array<Object>>} Normalized job objects.
 */
async function fetchAdzunaJobs(options = {}) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  const { maxPagesPerQuery = 2 } = options;

  if (!appId || !appKey) {
    // Completely normal and expected if user does not want Adzuna
    console.log('[Adzuna] Adzuna credentials omitted (100% optional, no credit card needed). Skipping Adzuna.');
    return [];
  }

  console.log(`[Adzuna] Initiating Adzuna India API fetch across ${SEARCH_QUERIES.length} search queries...`);
  const rawJobs = [];

  for (const query of SEARCH_QUERIES) {
    for (let page = 1; page <= maxPagesPerQuery; page++) {
      try {
        const results = await fetchAdzunaPage(query, page, appId, appKey);
        rawJobs.push(...results);
        if (results.length < 50) break;
      } catch (err) {
        console.warn(`[Adzuna] Warning: Query "${query}" page ${page} failed: ${err.message}`);
        break;
      }
    }
  }

  const normalized = rawJobs.map(item => {
    const locationName = item.location?.display_name || (Array.isArray(item.location?.area) ? item.location.area.join(', ') : 'India');
    return normalizeJob({
      id: `adzuna-${item.id}`,
      title: item.title,
      company: item.company?.display_name || 'Hiring Company',
      location: locationName,
      description: item.description || '',
      url: item.redirect_url,
      source: 'adzuna',
      postedAt: item.created
    });
  });

  console.log(`[Adzuna] Retrieved ${normalized.length} raw listings from Adzuna.`);
  return normalized;
}

module.exports = {
  fetchAdzunaJobs
};
