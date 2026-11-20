/**
 * sources/jobicy.js
 *
 * Fetches real remote tech jobs from the Jobicy Public API.
 * Endpoint: https://jobicy.com/api/v2/remote-jobs
 *
 * - 100% FREE, NO API KEY, NO CREDIT CARD REQUIRED.
 * - Each job has a direct deep link to its own apply page.
 * - Covers global & India-remote jobs from diverse non-unicorn companies.
 */

const { normalizeJob, isIndiaLocation } = require('../lib/normalize');

/**
 * Fetches remote tech/developer jobs from Jobicy and keeps
 * those open to India / worldwide candidates.
 *
 * @param {Object} options
 * @param {number} [options.count=50] - Max jobs to fetch (API max is 50 per call).
 * @returns {Promise<Array<Object>>} Normalized job objects with real apply links.
 */
async function fetchJobicyJobs(options = {}) {
  const { count = 50 } = options;
  // Jobicy API: free, public, returns direct job URLs
  const url = `https://jobicy.com/api/v2/remote-jobs?count=${count}&tag=engineer,developer,intern,software,data,design,product`;

  try {
    console.log('[Jobicy] Fetching remote jobs from Jobicy Public API (free, no key)...');
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'beep-jobs-aggregator/1.0'
      }
    });

    if (!response.ok) {
      console.warn(`[Jobicy] API returned HTTP ${response.status}. Skipping.`);
      return [];
    }

    const data = await response.json();
    const rawJobs = Array.isArray(data.jobs) ? data.jobs : [];

    const eligibleJobs = [];
    for (const item of rawJobs) {
      // jobRegion can be "Worldwide", "India", "Asia", etc.
      const region = (item.jobRegion || '').toLowerCase();
      const isEligible =
        region.includes('worldwide') ||
        region.includes('anywhere') ||
        region.includes('global') ||
        region.includes('asia') ||
        isIndiaLocation(region);

      if (!isEligible) continue;

      // Build a readable location string
      const location = isIndiaLocation(region)
        ? item.jobRegion
        : `Remote - ${item.jobRegion || 'Worldwide'}`;

      eligibleJobs.push(
        normalizeJob({
          id: `jobicy-${item.id}`,
          title: item.jobTitle || 'Software Role',
          company: item.companyName || 'Tech Company',
          location,
          // jobDescription is HTML — normalizeJob strips it automatically
          description: item.jobDescription || item.jobExcerpt || '',
          url: item.url, // Direct apply link to the specific job page
          source: 'jobicy',
          postedAt: item.pubDate || new Date().toISOString()
        })
      );
    }

    console.log(`[Jobicy] Retrieved ${eligibleJobs.length} eligible remote jobs.`);
    return eligibleJobs;
  } catch (err) {
    console.warn(`[Jobicy] Failed to fetch Jobicy API: ${err.message}`);
    return [];
  }
}

module.exports = { fetchJobicyJobs };
