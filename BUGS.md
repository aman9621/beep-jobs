# 🐛 BUGS.md — Issue Log & Troubleshooting Guide

Use this log to record issues encountered, how they were identified, and how they were solved. This makes for a great section in a video or interview walkthrough to show engineering problem-solving.

---

## Issue Log

| Problem | How I Found It | Fix |
| :--- | :--- | :--- |
| **Adzuna onboarding asks for credit card details & subscription.** | Attempted to sign up for Adzuna API, but the platform now requires credit card verification and subscription plans. | Made Adzuna **100% optional** in `sources/adzuna.js`. Added **Ashby public job board API** (`sources/ashby.js`) and expanded `config/boards.json` across 60+ Indian tech companies (Greenhouse + Lever + Ashby). Now runs **completely free with zero credit cards and zero API keys** for data sources! |
| **Greenhouse board slug returned 404** when a company changed their recruiting platform. | The pipeline crashed during the fetch step when calling `fetchBoard()`. | Added status code checks in `sources/greenhouse.js` and `sources/lever.js`. If status is 404 or 403, log a friendly warning and return `[]` instead of throwing an error. |
| **Senior roles appearing in fresher results** (e.g. "Lead Developer" with "mentors freshers" in the body). | In the UI, a job titled "Lead Engineer" was displayed because the description mentioned "freshers". | In `lib/normalize.js`, updated `isFresherJob()` to check job titles against senior words (`lead`, `senior`, `principal`, `architect`, `manager`) using regex word boundaries `\b` before searching the description. |
| **Duplicate postings when companies listed jobs on both Lever and Adzuna.** | Noticed identical roles for the same company with slightly different URLs. | Implemented normalized composite key deduplication in `lib/dedupe.js`: `lowercase(title + company + city)` stripping whitespace and punctuation. |
| **Gemini API rate limiting (HTTP 429)** during large batch processing. | Received `HTTP 429: Resource exhausted` when sending concurrent requests without throttling. | Implemented batching (batches of 5), polite delay (`1200ms`), and exponential backoff retry loop in `lib/tagger.js`. |
| **City names having multiple spellings** (e.g. "Bangalore" vs "Bengaluru", "Gurgaon" vs "Gurugram" vs "Delhi"). | Filter dropdown had 10 different variations of Delhi NCR and Bengaluru. | Built `normalizeCityName()` in `lib/tagger.js` to standardize variants to canonical hubs (Bengaluru, Delhi NCR, Mumbai, Pune, Hyderabad, Chennai, etc.). |
| **Unnecessary re-tagging of existing jobs** wasting API tokens and money. | Noticeable API spend even when only a few new jobs were added. | Added resumability in `tagJobsBatch()`: if an incoming job ID or URL already exists with tags in `jobs.json`, reuse existing tags without making an LLM call. |
| **CSV formatting broken when exporting job titles with commas or quotes.** | `eval/sample_50.csv` misaligned rows in Excel or spreadsheet viewers. | Implemented RFC 4180 compliant CSV quoting in `scripts/make_eval_sample.js` using `escapeCsv()` to escape double quotes with `""` and wrap fields. |
| **GitHub Actions workflow failing to push back to repository.** | Action run failed with `permission denied to github-actions[bot]`. | Added `permissions: contents: write` to `.github/workflows/daily.yml`. |

---

## Log Template for New Bugs

When you encounter a new bug, copy and paste this row into the table above:

```markdown
| <Short description of problem> | <How you identified or reproduced it> | <Exact fix implemented> |
```
