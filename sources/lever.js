/**
 * sources/lever.js
 * 
 * Fetches open job postings from Lever public postings API.
 * Endpoint: https://api.lever.co/v0/postings/{company}?mode=json
 * 
 * Filters for India-based openings and skips 404/inactive company slugs gracefully.
 */

const { normalizeJob, isIndiaLocation } = require('../lib/normalize');

/**
 * Fetches all jobs for a single Lever company slug.
 * 
 * @param {string} slug - Lever company slug (e.g. "groww").
 * @returns {Promise<Array<Object>>} Normalized jobs in India.
 */
async function fetchLeverCompany(slug) {
  const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'beep-jobs-aggregator/1.0'
      }
    });

    if (response.status === 404) {
      console.warn(`[Lever] Company "${slug}" returned 404 (not found). Skipping.`);
      return [];
    }

    if (!response.ok) {
      console.warn(`[Lever] Company "${slug}" returned HTTP ${response.status}. Skipping.`);
      return [];
    }

    const rawList = await response.json();
    if (!Array.isArray(rawList)) return [];

    // The first item's `team` or posting URL tells us the company display name
    // Fall back to capitalizing the slug
    const companyDisplay = rawList[0]?.categories?.team
      ? rawList[0].hostedUrl?.split('jobs.lever.co/')?.[1]?.split('/')?.[0] || slug
      : slug;
    // Build a nice title-cased company name
    const companyName = companyDisplay.charAt(0).toUpperCase() + companyDisplay.slice(1);

    const indiaJobs = [];
    for (const item of rawList) {
      const locationName = item.categories?.location || '';
      if (isIndiaLocation(locationName) || isIndiaLocation(item.text)) {
        const description = `${item.descriptionPlain || ''}\n${item.additionalPlain || ''}`;
        indiaJobs.push(
          normalizeJob({
            id: `lever-${slug}-${item.id}`,
            title: item.text,
            company: companyName,
            location: locationName || 'India',
            description,
            url: item.hostedUrl,  // Real direct deep-link to the specific Lever job posting
            source: 'lever',
            postedAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString()
          })
        );
      }
    }

    return indiaJobs;
  } catch (err) {
    console.warn(`[Lever] Failed to fetch Lever company "${slug}": ${err.message}`);
    return [];
  }
}

/**
 * Iterates through all Lever slugs listed in config/boards.json.
 * 
 * @param {Array<string>} slugs - List of Lever company slugs.
 * @returns {Promise<Array<Object>>} All collected India jobs from Lever.
 */
async function fetchLeverJobs(slugs = []) {
  if (!slugs || slugs.length === 0) {
    console.log('[Lever] No Lever slugs provided.');
    return [];
  }

  console.log(`[Lever] Checking ${slugs.length} Lever company accounts for India postings...`);
  const results = [];

  for (const slug of slugs) {
    const jobs = await fetchLeverCompany(slug);
    if (jobs.length > 0) {
      console.log(`[Lever] Found ${jobs.length} India posting(s) for "${slug}".`);
      results.push(...jobs);
    }
  }

  console.log(`[Lever] Total India jobs found across Lever accounts: ${results.length}`);
  return results;
}

module.exports = {
  fetchLeverJobs
};
