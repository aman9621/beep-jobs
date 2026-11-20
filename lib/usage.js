/**
 * lib/usage.js
 * 
 * Tracks LLM token usage and calculates operational costs.
 * Persists invocation logs to data/usage_log.json for cost auditing and analytics.
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE_PATH = path.join(__dirname, '..', 'data', 'usage_log.json');

/**
 * Loads the existing usage log file or creates a default empty structure.
 * 
 * @returns {{ calls: Array<Object>, summary: Object }} Current usage log data.
 */
function loadUsageLog() {
  try {
    if (fs.existsSync(LOG_FILE_PATH)) {
      const raw = fs.readFileSync(LOG_FILE_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn(`[Usage] Failed to parse existing usage log, resetting: ${err.message}`);
  }

  return {
    summary: {
      totalCalls: 0,
      totalPromptTokens: 0,
      totalCandidatesTokens: 0,
      totalTokens: 0
    },
    calls: []
  };
}

/**
 * Appends a Gemini API call record to data/usage_log.json.
 * 
 * @param {Object} entry - Call metadata.
 * @param {string} entry.jobId - Unique identifier of the classified job.
 * @param {string} entry.model - Model name (e.g. "gemini-1.5-flash").
 * @param {number} entry.promptTokens - Number of input prompt tokens.
 * @param {number} entry.candidatesTokens - Number of completion output tokens.
 * @param {boolean} entry.success - Whether classification succeeded.
 */
function recordUsage({ jobId, model, promptTokens = 0, candidatesTokens = 0, success = true }) {
  const data = loadUsageLog();

  const totalTokens = (promptTokens || 0) + (candidatesTokens || 0);

  data.summary.totalCalls = (data.summary.totalCalls || 0) + 1;
  data.summary.totalPromptTokens = (data.summary.totalPromptTokens || 0) + promptTokens;
  data.summary.totalCandidatesTokens = (data.summary.totalCandidatesTokens || 0) + candidatesTokens;
  data.summary.totalTokens = (data.summary.totalTokens || 0) + totalTokens;

  data.calls.push({
    timestamp: new Date().toISOString(),
    jobId,
    model,
    promptTokens,
    candidatesTokens,
    totalTokens,
    success
  });

  // Keep last 5,000 call entries in file to avoid unbounded growth
  if (data.calls.length > 5000) {
    data.calls = data.calls.slice(-5000);
  }

  try {
    const dir = path.dirname(LOG_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOG_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[Usage] Failed to write usage log: ${err.message}`);
  }
}

module.exports = {
  loadUsageLog,
  recordUsage
};
