/**
 * scripts/test_slugs.js
 * Tests many candidate company names against Greenhouse, Lever and Ashby,
 * and prints only the boards that work, with their India job counts.
 * Run: node scripts/test_slugs.js
 */
const { isIndiaLocation } = require('../lib/normalize');

// Candidate names are from memory and UNVERIFIED. Add more of your own.
const CANDIDATES = [
  'phonepe','swiggy','zomato','flipkart','myntra','dream11','sharechat','zeta','rapido','ola',
  'ather','lenskart','nykaa','policybazaar','upgrad','cleartax','zerodha','druva','icertis',
  'whatfix','gupshup','yellowai','hashedin','mindtickle','uniphore','sprinklr','innovaccer',
  'zendesk','twilio','nutanix','samsara','intuit','cloudflare','datadog','mongodb','dropbox',
  'pinterest','airbnb','toast','zscaler','thoughtspot','grammarly','figma','discord','asana',
  'airtable','amplitude','mixpanel','highspot','workato','zuora','netskope','cohesity','pubmatic',
  'lendingkart','kreditbee','moneyview','groww','navi','jupiter','cred','slice','razorpay',
  'postman','browserstack','clevertap','freshworks','hasura','wingify','chargebee','moengage',
  'inmobi','cars24','spinny','vedantu','unacademy','meesho','khatabook','coindcx','fampay',
  'juspay','cashfree','setu','dehaat','zetwerk','tracxn','smallcase','oyo','darwinbox',
  'rubrik','okta','elastic','gitlab','hashicorp','databricks','confluent','snyk','harness',
  'appsmith','sumologic','pagerduty','contentful','benchling','expensify','gusto','coinbase','stripe'
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'beep-jobs/1.0' } });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

(async () => {
  const found = { greenhouse: [], lever: [], ashby: [] };
  for (const s of CANDIDATES) {
    const gh = await get(`https://boards-api.greenhouse.io/v1/boards/${s}/jobs`);
    if (gh && gh.jobs) {
      const n = gh.jobs.filter((j) => isIndiaLocation((j.location && j.location.name) || '')).length;
      if (n > 0) { found.greenhouse.push(s); console.log(`greenhouse ${s}: ${n} India jobs`); }
    }
    const lv = await get(`https://api.lever.co/v0/postings/${s}?mode=json`);
    if (Array.isArray(lv)) {
      const n = lv.filter((j) => isIndiaLocation((j.categories && j.categories.location) || '')).length;
      if (n > 0) { found.lever.push(s); console.log(`lever ${s}: ${n} India jobs`); }
    }
    const ab = await get(`https://api.ashbyhq.com/posting-api/job-board/${s}`);
    if (ab && ab.jobs) {
      const n = ab.jobs.filter((j) => isIndiaLocation(j.location || '')).length;
      if (n > 0) { found.ashby.push(s); console.log(`ashby ${s}: ${n} India jobs`); }
    }
    await sleep(120);
  }
  console.log('\nWorking boards (copy into config/boards.json):');
  console.log(JSON.stringify(found, null, 2));
})();