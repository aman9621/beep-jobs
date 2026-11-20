/**
 * sources/greenhouse.js
 * 
 * Fetches open postings directly from Greenhouse public job board APIs.
 * Endpoint: https://job-boards.greenhouse.io/v1/boards/{board_token}/jobs?content=true
 * 
 * Filters for India-based openings and gracefully skips nonexistent (404) boards.
 */

const { normalizeJob, isIndiaLocation } = require('../lib/normalize');

/**
 * Fetches all jobs for a single Greenhouse company board slug.
 * 
 * @param {string} slug - Company board identifier (e.g. "razorpay").
 * @returns {Promise<Array<Object>>} Normalized jobs located in India.
 */
async function fetchBoard(slug) {
  const url = `https://job-boards.greenhouse.io/v1/boards/${slug}/jobs?content=true`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'beep-jobs-aggregator/1.0'
      }
    });

    if (response.status === 404) {
      console.warn(`[Greenhouse] Board "${slug}" returned 404 (not found). Skipping.`);
      return [];
    }

    if (!response.ok) {
      console.warn(`[Greenhouse] Board "${slug}" returned HTTP ${response.status}. Skipping.`);
      return [];
    }

    const data = await response.json();
    const rawJobs = Array.isArray(data.jobs) ? data.jobs : [];

    // Use the company name from the board metadata if available
    const companyName = data.name || slug.charAt(0).toUpperCase() + slug.slice(1).replace(/software.*privatelimited.*/i, '');

    const indiaJobs = [];
    for (const item of rawJobs) {
      const locationName = item.location?.name || '';
      // Check if this specific opening has an India location
      if (isIndiaLocation(locationName) || isIndiaLocation(item.title)) {
        indiaJobs.push(
          normalizeJob({
            id: `gh-${slug}-${item.id}`,
            title: item.title,
            company: companyName,
            location: locationName || 'India',
            description: item.content || '',
            url: item.absolute_url,  // Real direct deep-link to the specific job posting
            source: 'greenhouse',
            postedAt: item.updated_at
          })
        );
      }
    }

    return indiaJobs;
  } catch (err) {
    console.warn(`[Greenhouse] Failed to fetch board "${slug}": ${err.message}`);
    return [];
  }
}

/**
 * Iterates through all Greenhouse slugs listed in config/boards.json.
 * 
 * @param {Array<string>} slugs - List of company slugs.
 * @returns {Promise<Array<Object>>} All collected India jobs from Greenhouse.
 */
async function fetchGreenhouseJobs(slugs = []) {
  if (!slugs || slugs.length === 0) {
    console.log('[Greenhouse] No Greenhouse slugs provided.');
    return [];
  }

  console.log(`[Greenhouse] Checking ${slugs.length} Greenhouse company boards for India postings...`);
  const results = [];

  // Polite sequential / small parallel processing to respect board limits
  for (const slug of slugs) {
    const jobs = await fetchBoard(slug);
    if (jobs.length > 0) {
      console.log(`[Greenhouse] Found ${jobs.length} India posting(s) for "${slug}".`);
      results.push(...jobs);
    }
  }

  console.log(`[Greenhouse] Total India jobs found across Greenhouse boards: ${results.length}`);
  return results;
}

module.exports = {
  fetchGreenhouseJobs
};
