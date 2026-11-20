/**
 * sources/ashby.js
 * 
 * Fetches open postings directly from Ashby public job board APIs.
 * Endpoint: https://api.ashbyhq.com/posting-api/job-board/{organization}
 * 
 * 100% FREE, NO API KEY, NO CREDIT CARD, NO SIGNUP REQUIRED.
 * Ashby is an official unauthenticated public REST API used by modern tech startups.
 */

const { normalizeJob, isIndiaLocation } = require('../lib/normalize');

/**
 * Fetches all jobs for a single Ashby company board slug.
 * 
 * @param {string} slug - Ashby organization slug (e.g. "meesho").
 * @returns {Promise<Array<Object>>} Normalized jobs located in India.
 */
async function fetchAshbyBoard(slug) {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'beep-jobs-aggregator/1.0'
      }
    });

    if (response.status === 404) {
      // Company does not use Ashby or slug changed
      return [];
    }

    if (!response.ok) {
      console.warn(`[Ashby] Board "${slug}" returned HTTP ${response.status}. Skipping.`);
      return [];
    }

    const data = await response.json();
    const rawJobs = Array.isArray(data.jobs) ? data.jobs : [];

    const indiaJobs = [];
    for (const item of rawJobs) {
      // Check primary location and secondary locations
      const primaryLoc = item.location || '';
      const secondaryLocs = Array.isArray(item.secondaryLocations) 
        ? item.secondaryLocations.map(l => l.location || '').join(', ')
        : '';
      const fullLoc = `${primaryLoc} ${secondaryLocs}`.trim();

      if (isIndiaLocation(fullLoc) || isIndiaLocation(item.title)) {
        indiaJobs.push(
          normalizeJob({
            id: `ashby-${slug}-${item.id}`,
            title: item.title,
            company: slug.charAt(0).toUpperCase() + slug.slice(1),
            location: primaryLoc || 'India',
            description: `${item.title} at ${slug}. Department: ${item.department || 'Engineering'}. Employment: ${item.employmentType || 'Full-time'}.`,
            url: item.jobUrl || `https://jobs.ashbyhq.com/${slug}/${item.id}`,
            source: 'ashby',
            postedAt: item.publishedAt || new Date().toISOString()
          })
        );
      }
    }

    return indiaJobs;
  } catch (err) {
    console.warn(`[Ashby] Failed to fetch board "${slug}": ${err.message}`);
    return [];
  }
}

/**
 * Iterates through all Ashby slugs listed in config/boards.json.
 * 
 * @param {Array<string>} slugs - List of Ashby company slugs.
 * @returns {Promise<Array<Object>>} All collected India jobs from Ashby.
 */
async function fetchAshbyJobs(slugs = []) {
  if (!slugs || slugs.length === 0) {
    return [];
  }

  console.log(`[Ashby] Checking ${slugs.length} Ashby company boards for India postings... (No credit card or API key required)`);
  const results = [];

  for (const slug of slugs) {
    const jobs = await fetchAshbyBoard(slug);
    if (jobs.length > 0) {
      console.log(`[Ashby] Found ${jobs.length} India posting(s) for "${slug}".`);
      results.push(...jobs);
    }
  }

  console.log(`[Ashby] Total India jobs found across Ashby boards: ${results.length}`);
  return results;
}

module.exports = {
  fetchAshbyJobs
};
