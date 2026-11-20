/**
 * sources/remotive.js
 * 
 * Fetches real, active tech jobs from the official Remotive Public API.
 * Endpoint: https://remotive.com/api/remote-jobs
 * 
 * Features:
 * - 100% FREE, NO API KEY, NO CREDIT CARD REQUIRED.
 * - Deep-links directly to the specific job position application page.
 * - Covers diverse global & Indian startups beyond just the famous unicorns.
 */

const { normalizeJob, isIndiaLocation, isFresherJob } = require('../lib/normalize');

/**
 * Fetches active software and tech jobs eligible for India/Worldwide candidates.
 * 
 * @param {Object} options
 * @param {number} [options.limit=100]
 * @returns {Promise<Array<Object>>} Normalized job objects with direct deep links.
 */
async function fetchRemotiveJobs(options = {}) {
  const { limit = 100 } = options;
  const url = `https://remotive.com/api/remote-jobs?limit=${limit}`;

  try {
    console.log('[Remotive] Fetching active deep-linked jobs from Remotive Public API...');
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'beep-jobs-aggregator/1.0'
      }
    });

    if (!response.ok) {
      console.warn(`[Remotive] API returned HTTP ${response.status}. Skipping.`);
      return [];
    }

    const data = await response.json();
    const rawJobs = Array.isArray(data.jobs) ? data.jobs : [];

    const eligibleJobs = [];
    for (const item of rawJobs) {
      const loc = (item.candidate_required_location || '').toLowerCase();
      // Keep jobs that allow candidates from India or Worldwide/Anywhere
      const isEligibleLocation = loc.includes('worldwide') || loc.includes('anywhere') || isIndiaLocation(loc);

      if (isEligibleLocation) {
        const normalized = normalizeJob({
          id: `remotive-${item.id}`,
          title: item.title,
          company: item.company_name || 'Tech Startup',
          location: isIndiaLocation(loc) ? item.candidate_required_location : 'Remote - India & Worldwide',
          description: item.description || '',
          url: item.url, // Exact direct deep link to the specific job post!
          source: 'remotive',
          postedAt: item.publication_date
        });

        eligibleJobs.push(normalized);
      }
    }

    console.log(`[Remotive] Retrieved ${eligibleJobs.length} active deep-linked jobs eligible for India/Remote.`);
    return eligibleJobs;
  } catch (err) {
    console.warn(`[Remotive] Failed to fetch Remotive API: ${err.message}`);
    return [];
  }
}

module.exports = {
  fetchRemotiveJobs
};
