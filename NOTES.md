# 📝 Beep Jobs: Plain-English Code Walkthrough & Video Cheatsheet

Use this guide for a 5-minute video walkthrough, job interview explanation, or live coding session. Every file and key function is explained here in plain English.

---

## 1. High-Level Flow (30-Second Summary)

1. `refresh.js` runs every morning via GitHub Actions.
2. It calls official public APIs (`sources/`) for job openings.
3. It cleans HTML, filters for India & freshers (`lib/normalize.js`), and drops duplicate posts (`lib/dedupe.js`).
4. It asks Google Gemini Flash to tag the job with a standardized role and Indian city (`lib/tagger.js`).
5. It saves everything to a single file: `jobs.json`.
6. Express (`server.js`) serves `public/index.html` with instant client-side search and filtering.

---

## 2. File-by-File Breakdown

### `refresh.js` (The Orchestrator)
- **What it is**: The conductor of the entire pipeline. It calls all modules in the exact required order.
- **Main function**: `runRefresh()`
  - Calls `fetchAdzunaJobs()`, `fetchGreenhouseJobs()`, and `fetchLeverJobs()`.
  - Runs `isFresherJob()` to discard senior/manager listings and keep 0-2 year postings.
  - Runs `dedupeJobs()` to eliminate reposted or identical jobs.
  - Purges postings older than 30 days to keep listings fresh.
  - Passes new jobs to `tagJobsBatch()` for AI classification.
  - Writes the final output to `jobs.json`.
- **How to modify live in a video**: Show how easy it is to add a new source or change the retention threshold from 30 days to 14 days by editing `const THIRTY_DAYS_MS`.

---

### `server.js` (The Backend)
- **What it is**: A clean, lightweight Express.js server that hosts the web page and handles API search requests.
- **Key endpoints**:
  1. `GET /api/jobs`:
     - Reads `jobs.json`.
     - Supports query parameters `q` (keyword & skill search), `role` (role filter), `city` (city filter), `workMode` (Remote / In-office / Hybrid), `page`, and `limit`.
     - Slices the results and returns JSON pagination.
  2. `GET /api/filters`:
     - Loops through all jobs and tallies the count of each role, city, work mode, and top skills.
     - Feeds the frontend dropdown menus with live counts.
  3. `GET /api/apply/:id`:
     - Increments click conversion metrics (`applyClicks`) before redirecting the candidate directly to the application portal.
- **Key function**: `getJobCatalog()`
  - Checks the file modification time (`mtime`) of `jobs.json`. If updated by the daily cron, it automatically refreshes memory without needing a server reboot.

---

### `sources/` (Public Data Fetchers)

#### `sources/greenhouse.js`
- **What it is**: Queries the official, unauthenticated Greenhouse public boards API (`boards-api.greenhouse.io`).
- **Main function**: `fetchGreenhouseJobs()`
  - Loops through company slugs in `config/boards.json` (like Razorpay, Postman, CRED).
  - Skips 404s gracefully without stopping the script.
  - Keeps only jobs located in Indian tech hubs or marked India remote.
  - **100% FREE**: Requires zero API keys and zero credit cards.

#### `sources/lever.js`
- **What it is**: Queries Lever's public career posting API (`api.lever.co/v0/postings/{company}?mode=json`).
- **Main function**: `fetchLeverJobs()`
  - Queries companies listed in `config/boards.json` (like Groww, Urban Company, Zepto, Blinkit).
  - Parses plaintext descriptions and checks for India locations.
  - **100% FREE**: Requires zero API keys and zero credit cards.

#### `sources/ashby.js`
- **What it is**: Queries Ashby's official public REST API (`api.ashbyhq.com/posting-api/job-board/{organization}`).
- **Main function**: `fetchAshbyJobs()`
  - Queries modern tech startups (Meesho, Slice, FamPay, Mudrex, etc.).
  - Filters for India locations and junior/intern opportunities.
  - **100% FREE**: Requires zero API keys, zero signup, and zero credit cards.

#### `sources/adzuna.js` (Optional)
- **What it is**: Connects to the Adzuna developer API for India.
- **Credit Card Note**: Because Adzuna now requires credit cards during onboarding, **it is 100% optional in beep-jobs**. If keys are omitted in `.env`, it skips Adzuna automatically with no errors. Greenhouse, Lever, and Ashby provide all the jobs needed completely free!

---

### `lib/` (The Helper Utilities)

#### `lib/normalize.js`
- **What it is**: Cleans messy data and applies quality filters.
- **Key functions**:
  - `stripHtml(html)`: Strips `<p>`, `<br>`, `<div>`, and entities from raw job descriptions.
  - `truncateText(text, maxLen)`: Limits descriptions to ~1,500 characters so we don't blow through LLM token limits.
  - `isIndiaLocation(locationStr)`: Checks if the city/state belongs to India.
  - `isFresherJob(job)`: The core gatekeeper. Checks for fresher terms (`fresher`, `intern`, `trainee`, `0-1 years`) while actively rejecting titles with `senior`, `lead`, `architect`, `manager`, or `3+ years`.

#### `lib/dedupe.js`
- **What it is**: Prevents duplicate jobs from cluttering the user interface.
- **Key function**: `dedupeJobs(jobs)`
  - **Step 1**: Drops posts with identical URLs.
  - **Step 2**: Creates a composite key: `lowercase(title + company + city)` with all punctuation and spaces removed.
  - **Step 3**: Optional fuzzy matching using trigram Jaccard similarity.

#### `lib/tagger.js`
- **What it is**: Communicates with Google Gemini Flash to categorize roles and cities.
- **Key functions**:
  - `tagJobWithGemini(job)`:
    - Calls `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` using standard Node.js `fetch`.
    - Forces JSON output using Gemini's `responseMimeType: "application/json"` and `temperature: 0`.
    - Enforces that the role is strictly one of the 18 allowed categories.
    - Normalizes Indian city names (e.g. converts `"Bangalore"` to `"Bengaluru"`, `"Noida"` to `"Delhi NCR"`).
    - Features automatic exponential backoff for HTTP 429 rate limits.
  - `tagJobsBatch(jobs, existingJobMap)`:
    - Checks `existingJobMap`. If a job already has tags, it **skips calling Gemini**. This makes the script resume safely and saves API costs!
    - Processes jobs in small batches of 5 with a polite delay.

#### `lib/usage.js`
- **What it is**: Tracks LLM token usage.
- **Key function**: `recordUsage({ jobId, promptTokens, candidatesTokens })`
  - Saves real usage numbers from Gemini's `usageMetadata` into `data/usage_log.json`.

---

### `public/index.html` (The Frontend)
- **What it is**: A single, clean, self-contained HTML page containing CSS and vanilla JavaScript. No React, no build steps, no external CDNs.
- **Key founder-grade features**:
  - **AI Quick Verdict Banner**: Decodes 2,000-word descriptions into a 1-line eligibility summary (e.g. `🎓 Batch 2024 / 2025 • B.Tech / BE • 0-1 yrs`).
  - **Clickable Skill Pills**: Displays top 3-4 skills (e.g. `#React.js`, `#Python`). Clicking any skill instantly filters the job board.
  - **Shareable URL Synchronization**: Automatically syncs filter selections into the browser URL bar (`?role=Frontend&city=Bengaluru`). Users can copy the link and share it directly on college WhatsApp/Telegram groups.
  - **Direct "Share Job" Button**: Copies a clean direct search link for that specific role to clipboard with toast notification.
  - **Save / Bookmark Jobs**: Star button stores bookmarked jobs in `localStorage`, with a "⭐ Saved Jobs" toggle tab.
  - **Debounced search & Faceted Dropdowns**: Instant search with 300ms debounce across titles, companies, descriptions, and skills.
  - **Conversion / Application Intent Tracking**: Routes applies through `/api/apply/:id` and shows live applicant count badges (`🔥 52 applicants`).

---

### `scripts/` (Evaluation & Cost Auditing)

#### `scripts/make_eval_sample.js`
- Picks 50 jobs at random from `jobs.json` using a fixed seed (Seed 42) so the sample is 100% reproducible.
- Exports `eval/sample_50.csv` with empty columns for human ground truth.

#### `scripts/score_eval.js`
- Reads your annotated CSV and calculates:
  - Role classification accuracy (%)
  - City classification accuracy (%)
  - Overall accuracy (both correct)
  - Prints a breakdown of every error made by the model.

#### `scripts/cost_report.js`
- Reads `data/usage_log.json`.
- Calculates average input and output tokens per job.
- Multiplies by Gemini Flash pricing to output your exact cost per 1,000 jobs (usually less than $0.15 / ₹13).

---

### `.github/workflows/daily.yml` (The Automation)
- Runs every night at 02:00 UTC (07:30 AM IST).
- Installs dependencies, runs `node refresh.js`, and commits the updated `jobs.json` back to GitHub.
- If you deploy on Render, Render auto-deploys every time a commit lands on `main`. Zero manual maintenance!
