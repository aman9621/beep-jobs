/**
 * scripts/cost_report.js
 * 
 * Computes token usage statistics and financial cost estimates from data/usage_log.json.
 * Provides:
 * - Total calls logged
 * - Average input (prompt) and output (candidates) tokens per classified job
 * - Operational cost per 1,000 posts based on configurable Gemini pricing tiers
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// GEMINI PRICING CONSTANTS (Update as Google updates pricing)
// Pricing in USD per 1,000,000 (1M) tokens for Gemini Flash
// ============================================================================
const PRICE_INPUT_PER_1M = 0.075;   // $0.075 per 1M input tokens
const PRICE_OUTPUT_PER_1M = 0.300;  // $0.300 per 1M output tokens

const USAGE_LOG_PATH = path.join(__dirname, '..', 'data', 'usage_log.json');

function runCostReport() {
  if (!fs.existsSync(USAGE_LOG_PATH)) {
    console.log(`[Cost Report] No usage log found at: ${USAGE_LOG_PATH}`);
    console.log(`Run "npm run refresh" with your GEMINI_API_KEY to generate usage logs.`);
    return;
  }

  const raw = fs.readFileSync(USAGE_LOG_PATH, 'utf-8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`[Cost Report] Failed to parse ${USAGE_LOG_PATH}: ${err.message}`);
    process.exit(1);
  }

  const summary = data.summary || {};
  const totalCalls = summary.totalCalls || (data.calls ? data.calls.length : 0);

  if (!totalCalls || totalCalls === 0) {
    console.log('[Cost Report] Usage log contains 0 API calls.');
    return;
  }

  const totalPromptTokens = summary.totalPromptTokens || 0;
  const totalCandidatesTokens = summary.totalCandidatesTokens || 0;
  const totalTokens = summary.totalTokens || (totalPromptTokens + totalCandidatesTokens);

  const avgPromptTokens = Math.round(totalPromptTokens / totalCalls);
  const avgCandidatesTokens = Math.round(totalCandidatesTokens / totalCalls);
  const avgTotalTokens = avgPromptTokens + avgCandidatesTokens;

  // Cost calculation for actual usage
  const actualInputCost = (totalPromptTokens / 1_000_000) * PRICE_INPUT_PER_1M;
  const actualOutputCost = (totalCandidatesTokens / 1_000_000) * PRICE_OUTPUT_PER_1M;
  const actualTotalCost = actualInputCost + actualOutputCost;

  // Cost calculation projected per 1,000 posts
  const promptTokensPer1k = avgPromptTokens * 1000;
  const candidatesTokensPer1k = avgCandidatesTokens * 1000;
  const costInputPer1k = (promptTokensPer1k / 1_000_000) * PRICE_INPUT_PER_1M;
  const costOutputPer1k = (candidatesTokensPer1k / 1_000_000) * PRICE_OUTPUT_PER_1M;
  const costPer1kPosts = costInputPer1k + costOutputPer1k;

  console.log('====================================================');
  console.log('            GEMINI TOKEN & COST REPORT              ');
  console.log('====================================================');
  console.log(`Total API Invocations:       ${totalCalls.toLocaleString()}`);
  console.log(`Total Tokens Consumed:       ${totalTokens.toLocaleString()}`);
  console.log(`- Prompt (Input) Tokens:     ${totalPromptTokens.toLocaleString()}`);
  console.log(`- Candidates (Output) Tokens:${totalCandidatesTokens.toLocaleString()}`);
  console.log('----------------------------------------------------');
  console.log(`Average Tokens per Job:`);
  console.log(`- Input Tokens / Job:        ${avgPromptTokens}`);
  console.log(`- Output Tokens / Job:       ${avgCandidatesTokens}`);
  console.log(`- Total Tokens / Job:        ${avgTotalTokens}`);
  console.log('----------------------------------------------------');
  console.log(`Pricing Rates Configured:`);
  console.log(`- Input Rate:                $${PRICE_INPUT_PER_1M.toFixed(3)} per 1M tokens`);
  console.log(`- Output Rate:               $${PRICE_OUTPUT_PER_1M.toFixed(3)} per 1M tokens`);
  console.log('----------------------------------------------------');
  console.log(`Actual Cumulative Cost:      $${actualTotalCost.toFixed(5)} USD`);
  console.log(`PROJECTED COST PER 1,000 JOBS: $${costPer1kPosts.toFixed(4)} USD (~ ₹${(costPer1kPosts * 86).toFixed(2)} INR)`);
  console.log('====================================================');
}

runCostReport();
