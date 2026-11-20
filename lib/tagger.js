/**
 * lib/tagger.js
 * 
 * Classifies jobs into normalized roles, Indian cities, candidate eligibility verdicts,
 * skill tags, and work modes using Google Gemini Flash REST API.
 * 
 * Features:
 * - Direct REST call via global fetch (no external SDK).
 * - Gemini JSON response mode (responseMimeType: "application/json").
 * - Strict enum validation for roles and Indian city normalization.
 * - Extracts "Quick Verdict" eligibility summary and top 3-4 skills.
 * - Retry logic for JSON errors & exponential backoff for HTTP 429 rate limits.
 * - Resumability: skips jobs already possessing valid tags.
 * - Token usage logging to data/usage_log.json.
 * - Offline mock mode for keyless local testing.
 */

const fs = require('fs');
const path = require('path');
const { recordUsage } = require('./usage');

// Standard allowed roles list
const ALLOWED_ROLES = [
  'Software Engineering',
  'Frontend',
  'Backend',
  'Full Stack',
  'Data/Analytics',
  'AI/ML',
  'DevOps/Cloud',
  'QA/Testing',
  'Design/UX',
  'Product',
  'Marketing',
  'Sales/Business Development',
  'Operations',
  'HR/Recruiting',
  'Finance/Accounting',
  'Content/Writing',
  'Customer Support',
  'Other'
];

// Read prompt template once
const PROMPT_TEMPLATE_PATH = path.join(__dirname, '..', 'prompts', 'tagging_prompt.txt');
let promptTemplate = '';
try {
  promptTemplate = fs.readFileSync(PROMPT_TEMPLATE_PATH, 'utf-8');
} catch (e) {
  console.warn(`[Tagger] Warning: could not load ${PROMPT_TEMPLATE_PATH}, using fallback prompt.`);
}

/**
 * Normalizes common Indian city variations and aliases.
 * 
 * @param {string} rawCity - City output string from model.
 * @returns {string} Standardized city name or "Remote" or "Unknown".
 */
function normalizeCityName(rawCity) {
  if (!rawCity || typeof rawCity !== 'string') return 'Unknown';
  const c = rawCity.trim().toLowerCase();

  if (c.includes('remote') || c.includes('wfh') || c.includes('work from home')) return 'Remote';
  if (c.includes('bangalore') || c.includes('bengaluru')) return 'Bengaluru';
  if (c.includes('gurgaon') || c.includes('gurugram') || c.includes('noida') || c.includes('delhi') || c.includes('ncr') || c.includes('faridabad')) return 'Delhi NCR';
  if (c.includes('mumbai') || c.includes('bombay') || c.includes('navi mumbai') || c.includes('thane')) return 'Mumbai';
  if (c.includes('pune')) return 'Pune';
  if (c.includes('hyderabad') || c.includes('secunderabad')) return 'Hyderabad';
  if (c.includes('chennai') || c.includes('madras')) return 'Chennai';
  if (c.includes('kolkata') || c.includes('calcutta')) return 'Kolkata';
  if (c.includes('ahmedabad')) return 'Ahmedabad';
  if (c.includes('kochi') || c.includes('cochin') || c.includes('trivandrum') || c.includes('thiruvananthapuram')) return 'Kochi';
  if (c.includes('chandigarh')) return 'Chandigarh';
  if (c.includes('jaipur')) return 'Jaipur';
  if (c.includes('indore')) return 'Indore';
  if (c.includes('coimbatore')) return 'Coimbatore';

  if (rawCity.length > 2 && rawCity.length < 30) {
    return rawCity
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  return 'Unknown';
}

/**
 * Heuristic/rule-based mock tagger used for offline local testing without an API key.
 * 
 * @param {Object} job - Standardized job object.
 * @returns {{ role: string, city: string, eligibility: string, skills: Array<string>, workMode: string }}
 */
function mockTagJob(job) {
  const text = `${job.title} ${job.description} ${job.location}`.toLowerCase();

  let role = 'Software Engineering';
  let skills = ['Data Structures', 'Java', 'Python', 'Algorithms'];
  let eligibility = 'Batch 2024 / 2025 • B.Tech / BE • 0-1 yrs exp';

  if (text.includes('frontend') || text.includes('react') || text.includes('angular') || text.includes('vue')) {
    role = 'Frontend';
    skills = ['React.js', 'TypeScript', 'Tailwind CSS', 'HTML/CSS'];
    eligibility = 'Batch 2024 / 2025 • Web development projects';
  } else if (text.includes('backend') || text.includes('node') || text.includes('django') || text.includes('spring') || text.includes('golang')) {
    role = 'Backend';
    skills = ['Node.js', 'PostgreSQL', 'REST APIs', 'Docker'];
    eligibility = 'Batch 2024 / 2025 • CS / IT • 0-1 yrs exp';
  } else if (text.includes('full stack') || text.includes('fullstack') || text.includes('mern')) {
    role = 'Full Stack';
    skills = ['React.js', 'Node.js', 'MongoDB', 'Express'];
    eligibility = 'Batch 2024 / 2025 • MERN / Full-stack projects';
  } else if (text.includes('machine learning') || text.includes('ai') || text.includes('nlp') || text.includes('data science') || text.includes('deep learning')) {
    role = 'AI/ML';
    skills = ['Python', 'PyTorch', 'Machine Learning', 'Transformers'];
    eligibility = 'Final year students / 2024 / 2025 graduates';
  } else if (text.includes('data') || text.includes('analytics') || text.includes('business analyst') || text.includes('sql')) {
    role = 'Data/Analytics';
    skills = ['SQL', 'Python Pandas', 'PowerBI', 'Excel'];
    eligibility = 'Any graduate with analytical & SQL skills';
  } else if (text.includes('devops') || text.includes('cloud') || text.includes('aws') || text.includes('docker') || text.includes('kubernetes')) {
    role = 'DevOps/Cloud';
    skills = ['AWS', 'Docker', 'Linux', 'Kubernetes'];
    eligibility = '0-1 yrs exp • Cloud & Linux trainees welcome';
  } else if (text.includes('qa') || text.includes('tester') || text.includes('testing') || text.includes('quality') || text.includes('sdet')) {
    role = 'QA/Testing';
    skills = ['Selenium', 'Cypress', 'API Testing', 'Postman'];
    eligibility = 'Freshers • Automation testing enthusiasts';
  } else if (text.includes('design') || text.includes('ui/ux') || text.includes('ux') || text.includes('figma')) {
    role = 'Design/UX';
    skills = ['Figma', 'UI/UX Design', 'Wireframing', 'Prototyping'];
    eligibility = 'Design portfolio required • Freshers eligible';
  } else if (text.includes('product manager') || text.includes('product intern') || text.includes('associate product')) {
    role = 'Product';
    skills = ['Product Analytics', 'PRDs', 'User Stories', 'Market Research'];
    eligibility = 'Engineering / BBA grads • Analytical mind';
  } else if (text.includes('marketing') || text.includes('seo') || text.includes('growth')) {
    role = 'Marketing';
    skills = ['SEO', 'Content Strategy', 'Social Media', 'Analytics'];
    eligibility = 'Creative communicators • Any graduate';
  } else if (text.includes('sales') || text.includes('business development') || text.includes('bde')) {
    role = 'Sales/Business Development';
    skills = ['B2B Sales', 'Lead Generation', 'Client Outreach', 'Negotiation'];
    eligibility = 'Any graduate • Strong verbal communication';
  } else if (text.includes('hr') || text.includes('recruiting') || text.includes('talent')) {
    role = 'HR/Recruiting';
    skills = ['Talent Sourcing', 'Interview Scheduling', 'HR Operations'];
    eligibility = 'BBA / MBA / Any Graduate • Freshers';
  } else if (text.includes('finance') || text.includes('accounting') || text.includes('accountant')) {
    role = 'Finance/Accounting';
    skills = ['GST', 'Tally', 'Financial Reporting', 'Excel'];
    eligibility = 'B.Com / M.Com / CA Inter freshers';
  } else if (text.includes('content') || text.includes('writer') || text.includes('copywriter')) {
    role = 'Content/Writing';
    skills = ['Technical Writing', 'Copywriting', 'SEO Content', 'Markdown'];
    eligibility = 'Writing samples / portfolio required';
  } else if (text.includes('customer support') || text.includes('customer service') || text.includes('operations')) {
    role = 'Customer Support';
    skills = ['Customer Support', 'Ticketing', 'Communication', 'CRM'];
    eligibility = 'Any graduate • Rotational shifts';
  }

  const city = normalizeCityName(job.location);
  let workMode = 'In-office';
  if (city === 'Remote' || text.includes('remote') || text.includes('wfh')) {
    workMode = 'Remote';
  } else if (text.includes('hybrid')) {
    workMode = 'Hybrid';
  }

  return {
    role,
    city: city === 'Unknown' ? 'Bengaluru' : city,
    eligibility,
    skills,
    workMode
  };
}

/**
 * Pauses execution for a specified duration in milliseconds.
 * 
 * @param {number} ms - Delay time in ms.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Builds the user prompt string by substituting job metadata into the prompt template.
 * 
 * @param {Object} job - Standardized job object.
 * @returns {string} Fully rendered prompt string.
 */
function buildPrompt(job) {
  if (promptTemplate) {
    return promptTemplate
      .replace('{{TITLE}}', job.title || '')
      .replace('{{COMPANY}}', job.company || '')
      .replace('{{LOCATION}}', job.location || '')
      .replace('{{DESCRIPTION}}', (job.description || '').slice(0, 1200));
  }

  return `Classify this job posting into role, Indian city, eligibility verdict, skills, and workMode:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Description: ${(job.description || '').slice(0, 1200)}

Allowed roles: ${ALLOWED_ROLES.join(', ')}.
Respond with JSON only: {"role": "...", "city": "...", "eligibility": "...", "skills": ["..."], "workMode": "..."}`;
}

/**
 * Invokes the Google Gemini REST API to tag a single job post.
 * Includes rate limit handling (429 backoff) and schema validation retries.
 * 
 * @param {Object} job - Standardized job object.
 * @param {Object} options - Configuration options.
 * @returns {Promise<{ role: string, city: string, eligibility: string, skills: Array<string>, workMode: string }>} Validated tag object.
 */
async function tagJobWithGemini(job, options = {}) {
  const { apiKey, model = process.env.GEMINI_MODEL || 'gemini-1.5-flash', isMock = false } = options;

  if (isMock || !apiKey) {
    return mockTagJob(job);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const promptText = buildPrompt(job);

  const payload = {
    contents: [
      {
        parts: [{ text: promptText }]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0
    }
  };

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.status === 429) {
        const backoffMs = Math.pow(2, attempt + 1) * 2000;
        console.warn(`[Tagger] HTTP 429 rate limit hit. Backing off for ${backoffMs / 1000}s...`);
        await sleep(backoffMs);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error (status ${response.status}): ${errorText.slice(0, 200)}`);
      }

      const data = await response.json();

      const usageMetadata = data.usageMetadata || {};
      const promptTokens = usageMetadata.promptTokenCount || 0;
      const candidatesTokens = usageMetadata.candidatesTokenCount || 0;

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error('Gemini response contained no content text.');
      }

      let parsed;
      try {
        parsed = JSON.parse(rawText.trim());
      } catch (jsonErr) {
        throw new Error(`Failed to parse model output as JSON: ${rawText}`);
      }

      let role = parsed.role;
      if (!ALLOWED_ROLES.includes(role)) {
        const matched = ALLOWED_ROLES.find(r => r.toLowerCase() === (role || '').toLowerCase());
        if (matched) {
          role = matched;
        } else {
          role = 'Other';
        }
      }

      const city = normalizeCityName(parsed.city);
      const eligibility = (parsed.eligibility || 'Batch 2024 / 2025 • Freshers welcome').trim();
      
      let skills = Array.isArray(parsed.skills) ? parsed.skills.slice(0, 4) : [];
      if (skills.length === 0) {
        skills = ['Problem Solving', 'Communication', 'Core Tech'];
      }

      let workMode = parsed.workMode || (city === 'Remote' ? 'Remote' : 'In-office');
      if (!['Remote', 'In-office', 'Hybrid'].includes(workMode)) {
        workMode = city === 'Remote' ? 'Remote' : 'In-office';
      }

      recordUsage({
        jobId: job.id,
        model,
        promptTokens,
        candidatesTokens,
        success: true
      });

      return { role, city, eligibility, skills, workMode };
    } catch (err) {
      console.warn(`[Tagger] Attempt ${attempt + 1}/${maxRetries + 1} failed for job "${job.title}": ${err.message}`);
      if (attempt < maxRetries) {
        await sleep(1500 * (attempt + 1));
      }
    }
  }

  console.error(`[Tagger] Exhausted retries for job "${job.title}". Falling back to mock defaults.`);
  return mockTagJob(job);
}

/**
 * Tags an array of jobs in small batches with rate limiting, skipping already-tagged jobs.
 * 
 * @param {Array<Object>} jobs - List of standardized jobs.
 * @param {Object} existingJobMap - Map of existing jobs by ID or URL with known tags.
 * @param {Object} options - Tagger options.
 * @returns {Promise<Array<Object>>} Jobs with { role, city, eligibility, skills, workMode } appended.
 */
async function tagJobsBatch(jobs, existingJobMap = {}, options = {}) {
  const {
    apiKey = process.env.GEMINI_API_KEY,
    model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    isMock = false,
    batchSize = 5,
    delayBetweenBatchesMs = 1200
  } = options;

  let taggedCount = 0;
  let reusedCount = 0;
  const taggedJobs = [];

  for (let i = 0; i < jobs.length; i += batchSize) {
    const chunk = jobs.slice(i, i + batchSize);

    const chunkPromises = chunk.map(async (job) => {
      // Check if already tagged previously (Resumability)
      const existing = existingJobMap[job.id] || existingJobMap[job.url];
      if (existing && existing.role && existing.city && existing.eligibility && existing.skills) {
        reusedCount++;
        return {
          ...job,
          role: existing.role,
          city: existing.city,
          eligibility: existing.eligibility,
          skills: existing.skills,
          workMode: existing.workMode || (existing.city === 'Remote' ? 'Remote' : 'In-office')
        };
      }

      // Call Gemini or mock
      const tags = await tagJobWithGemini(job, { apiKey, model, isMock });
      taggedCount++;
      return {
        ...job,
        role: tags.role,
        city: tags.city,
        eligibility: tags.eligibility,
        skills: tags.skills,
        workMode: tags.workMode
      };
    });

    const results = await Promise.all(chunkPromises);
    taggedJobs.push(...results);

    if (i + batchSize < jobs.length && !isMock) {
      await sleep(delayBetweenBatchesMs);
    }

    if ((i + chunk.length) % 25 === 0 || i + chunk.length === jobs.length) {
      console.log(`[Tagger] Progress: ${i + chunk.length}/${jobs.length} jobs processed (${reusedCount} cached, ${taggedCount} newly tagged).`);
    }
  }

  return taggedJobs;
}

module.exports = {
  ALLOWED_ROLES,
  normalizeCityName,
  mockTagJob,
  tagJobWithGemini,
  tagJobsBatch
};
