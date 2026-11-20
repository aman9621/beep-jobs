/**
 * scripts/score_eval.js
 * 
 * Evaluates LLM tagging accuracy against human ground-truth labels in eval/sample_50.csv.
 * Calculates:
 * - Role classification accuracy
 * - City extraction accuracy
 * - Overall exact-match accuracy (both role and city correct)
 * - Detailed error listing of misclassifications
 */

const fs = require('fs');
const path = require('path');

const EVAL_DIR = path.join(__dirname, '..', 'eval');
const DEFAULT_CSV_PATH = path.join(EVAL_DIR, 'sample_50.csv');
const CHECKED_CSV_PATH = path.join(EVAL_DIR, 'sample_50_checked.csv');

/**
 * Basic CSV line parser respecting quoted strings with commas and escaped quotes.
 * 
 * @param {string} text - Raw CSV content.
 * @returns {Array<Array<string>>} 2D array of parsed rows and columns.
 */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  const rows = [];

  for (const line of lines) {
    const fields = [];
    let insideQuote = false;
    let currentField = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (insideQuote && nextChar === '"') {
          currentField += '"';
          i++; // Skip escaped quote
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        fields.push(currentField);
        currentField = '';
      } else {
        currentField += char;
      }
    }
    fields.push(currentField);
    rows.push(fields);
  }

  return rows;
}

function runScoreEval() {
  const targetPath = fs.existsSync(CHECKED_CSV_PATH) ? CHECKED_CSV_PATH : DEFAULT_CSV_PATH;

  if (!fs.existsSync(targetPath)) {
    console.error(`[Score Eval] Could not find evaluation CSV at: ${targetPath}`);
    console.error(`Run "npm run eval:sample" first, add your ground-truth labels, and retry.`);
    process.exit(1);
  }

  console.log(`[Score Eval] Reading evaluation dataset from: ${targetPath}`);
  const rawCsv = fs.readFileSync(targetPath, 'utf-8');
  const rows = parseCsv(rawCsv);

  if (rows.length <= 1) {
    console.error('[Score Eval] CSV contains no data rows.');
    process.exit(1);
  }

  const header = rows[0].map(h => h.trim().toLowerCase());
  const roleIdx = header.indexOf('llm_role');
  const cityIdx = header.indexOf('llm_city');
  const correctRoleIdx = header.indexOf('correct_role');
  const correctCityIdx = header.indexOf('correct_city');
  const titleIdx = header.indexOf('title');
  const companyIdx = header.indexOf('company');

  if (roleIdx === -1 || cityIdx === -1 || correctRoleIdx === -1 || correctCityIdx === -1) {
    console.error('[Score Eval] CSV is missing required headers: llm_role, llm_city, correct_role, correct_city');
    process.exit(1);
  }

  let evaluatedCount = 0;
  let roleCorrect = 0;
  let cityCorrect = 0;
  let bothCorrect = 0;
  const errors = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const llmRole = (row[roleIdx] || '').trim();
    const llmCity = (row[cityIdx] || '').trim();
    const correctRole = (row[correctRoleIdx] || '').trim();
    const correctCity = (row[correctCityIdx] || '').trim();
    const title = row[titleIdx] || 'Unknown';
    const company = row[companyIdx] || 'Unknown';

    // Only score rows where human evaluator filled in at least one ground-truth field
    if (!correctRole && !correctCity) {
      continue;
    }

    evaluatedCount++;
    const isRoleMatch = correctRole ? llmRole.toLowerCase() === correctRole.toLowerCase() : true;
    const isCityMatch = correctCity ? llmCity.toLowerCase() === correctCity.toLowerCase() : true;

    if (isRoleMatch) roleCorrect++;
    if (isCityMatch) cityCorrect++;
    if (isRoleMatch && isCityMatch) bothCorrect++;

    if (!isRoleMatch || !isCityMatch) {
      errors.push({
        title,
        company,
        llmRole,
        correctRole: correctRole || '(blank)',
        llmCity,
        correctCity: correctCity || '(blank)',
        roleMismatch: !isRoleMatch,
        cityMismatch: !isCityMatch
      });
    }
  }

  if (evaluatedCount === 0) {
    console.log('\n⚠️  No evaluated rows found! Both "correct_role" and "correct_city" are currently blank.');
    console.log('👉 Please open eval/sample_50.csv, fill in the correct roles and cities for at least a few jobs, and re-run.');
    return;
  }

  const rolePct = ((roleCorrect / evaluatedCount) * 100).toFixed(1);
  const cityPct = ((cityCorrect / evaluatedCount) * 100).toFixed(1);
  const overallPct = ((bothCorrect / evaluatedCount) * 100).toFixed(1);

  console.log('\n====================================================');
  console.log('           LLM EVALUATION SCORECARD                  ');
  console.log('====================================================');
  console.log(`Evaluated Rows:        ${evaluatedCount}`);
  console.log(`Role Tag Accuracy:     ${roleCorrect}/${evaluatedCount} (${rolePct}%)`);
  console.log(`City Tag Accuracy:     ${cityCorrect}/${evaluatedCount} (${cityPct}%)`);
  console.log(`Overall Accuracy:      ${bothCorrect}/${evaluatedCount} (${overallPct}%)`);
  console.log('====================================================\n');

  if (errors.length > 0) {
    console.log(`--- Misclassification Breakdown (${errors.length} mismatches) ---`);
    errors.forEach((err, idx) => {
      console.log(`\n[${idx + 1}] "${err.title}" at ${err.company}`);
      if (err.roleMismatch) {
        console.log(`    ❌ Role: Model predicted "${err.llmRole}" | Human marked "${err.correctRole}"`);
      }
      if (err.cityMismatch) {
        console.log(`    ❌ City: Model predicted "${err.llmCity}" | Human marked "${err.correctCity}"`);
      }
    });
  } else {
    console.log('🎉 100% Accuracy on all evaluated rows!');
  }
}

runScoreEval();
