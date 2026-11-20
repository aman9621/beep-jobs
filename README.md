# ⚡ Beep Jobs

> **Live Fresher & Internship Aggregator for India**  
> Collects 200+ authentic fresher job and internship posts across India from official public APIs, strips duplicates, classifies role and city with Google Gemini Flash, and serves a lightning-fast, zero-build search portal that refreshes daily on autopilot.

---

## Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                               DATA INGESTION SOURCES                              |
|                                                                                   |
|  [Greenhouse Boards]    [Lever Postings]    [Ashby Job Boards]   [Adzuna API (Optional)]|
| (boards-api.greenhouse)  (api.lever.co)    (api.ashbyhq.com)      (100% optional, no CC)|
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                             REFRESH PIPELINE (refresh.js)                         |
|                                                                                   |
|  1. Normalize      --> lib/normalize.js (strips HTML, truncates text)             |
|  2. Fresher Filter --> Keeps 0-2 yrs / interns in India; excludes seniors/leads   |
|  3. Deduplication  --> lib/dedupe.js (Exact composite key + URL + optional fuzzy)|
|  4. Retention      --> Preserves active listings, purges postings > 30 days old   |
|  5. AI Tagging     --> lib/tagger.js (Gemini Flash REST API with JSON mode)       |
|  6. Cost Logging   --> lib/usage.js (logs tokens to data/usage_log.json)          |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
                                    [ jobs.json ]
                               (Single source of truth)
                                          |
             +----------------------------+----------------------------+
             |                                                         |
             v                                                         v
+-----------------------------+                           +-------------------------+
|       EXPRESS SERVER        |                           |   GITHUB ACTIONS CRON   |
|        (server.js)          |                           |  (.github/workflows)    |
|                             |                           |                         |
| - Serves public/ (UI)       |                           | - Runs daily at 02:00   |
| - GET /api/jobs (Search)    |                           | - Commits new jobs.json |
| - GET /api/filters (Facets) |                           | - Triggers Render deploy|
+-----------------------------+                           +-------------------------+
             |
             v
+-----------------------------+
|    VANILLA FRONTEND UI      |
|     (public/index.html)     |
|                             |
| - Zero build step           |
| - Instant debounced search  |
| - Role & City dropdowns     |
| - 100% Mobile friendly      |
+-----------------------------+
```

---

## Features

- **100% Legal & Public Data**: Strictly queries official developer endpoints (Adzuna, Greenhouse, Lever). Never scrapes LinkedIn, Naukri, or forbidden platforms.
- **Strict Fresher & India Filtering**: Drops senior, lead, architect, or manager roles requiring 3+ years experience. Keeps only legitimate intern/entry-level/fresher openings in India.
- **Dual-Layer Deduplication**: Normalizes titles, companies, locations, and direct application URLs.
- **Smart & Cost-Efficient Gemini Tagging**:
  - Direct REST fetch (no heavy SDK).
  - Uses Gemini Flash with temperature `0` and JSON mode (`responseMimeType: application/json`).
  - Strict enum validation for roles with automatic retries and exponential backoff for rate limits.
  - **Resumable**: Jobs already classified in `jobs.json` are never re-sent to Gemini, saving ~95% of API costs.
- **Zero-Build Vanilla Frontend**: Single responsive HTML file with CSS variables, debounced search, faceted dropdown filters, and mobile-ready cards.
- **Autonomous Daily Refresh**: GitHub Actions cron updates `jobs.json` daily and pushes back to GitHub, auto-triggering Render's build pipeline.

---

## Project Structure

```
beep-jobs/
├── refresh.js              # Orchestrator: fetch -> normalize -> filter -> dedupe -> tag -> write
├── server.js               # Express: serves public/ and GET /api/jobs
├── sources/
│   ├── adzuna.js           # Adzuna API, country "in"
│   ├── greenhouse.js       # Greenhouse public boards API
│   └── lever.js            # Lever public postings API
├── config/boards.json      # Pre-filled Greenhouse and Lever company slugs
├── lib/
│   ├── normalize.js        # Standard schema, HTML sanitization, fresher heuristics
│   ├── dedupe.js           # Exact composite & URL deduplication
│   ├── tagger.js           # Gemini Flash REST caller, retries, JSON validation
│   └── usage.js            # Token usage logger
├── prompts/tagging_prompt.txt # System prompt for role and Indian city extraction
├── scripts/
│   ├── make_eval_sample.js # Seeds 50 random samples -> eval/sample_50.csv
│   ├── score_eval.js       # Calculates accuracy of LLM tags vs human ground truth
│   └── cost_report.js      # Calculates token usage and cost per 1,000 posts
├── jobs.json               # Current job database file
├── data/usage_log.json     # Token tracking and cost records
├── eval/                   # Evaluation dataset directory
├── public/index.html       # Single-file clean frontend UI
├── .github/workflows/daily.yml # Daily cron job for continuous data updates
├── .env.example            # Sample environment variables
├── .gitignore
├── package.json
├── SOURCES.md              # Documentation of source terms & compliance
├── NOTES.md                # Plain-English walkthrough of every file
├── BUGS.md                 # Troubleshooting & bug tracking template
└── README.md
```

---

## Quickstart (Local Development)

### 1. Prerequisites
- Node.js 18 or higher (uses native global `fetch`)

### 2. Clone and Install
```bash
git clone <your-repo-url>
cd beep-jobs
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your credentials (only Gemini API key is needed; NO credit card is required):
```env
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-flash
# Adzuna is 100% optional! Greenhouse, Lever, and Ashby fetch real jobs with zero keys and zero credit cards.
```

> **Testing without API keys?** No problem! You can run the pipeline immediately using the `--mock` flag, which generates 220+ realistic mock fresher openings across Indian tech hubs and uses an intelligent rule-based tagger:
> ```bash
> npm run refresh:mock
> ```

### 4. Run Job Ingestion & AI Tagging
```bash
npm run refresh
```

### 5. Start the Web Server
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser!

---

## Evaluation Tools

### 1. Generate 50-Job Evaluation Sample
Picks 50 random jobs using a deterministic random seed and creates `eval/sample_50.csv`:
```bash
npm run eval:sample
```

### 2. Hand-Check Ground Truth
Open `eval/sample_50.csv` in Excel or VS Code. Fill in your preferred `correct_role` and `correct_city` for the sample rows.

### 3. Score Model Accuracy
Evaluates the LLM predictions against your manual entries and prints a scorecard:
```bash
npm run eval:score
```

### 4. Token & Cost Report
Inspect total tokens consumed and estimated cost per 1,000 posts:
```bash
npm run cost
```

---

## Deploying to Render (Free Web Service)

1. **Create a GitHub Repository**:
   ```bash
   git init
   git add .
   git commit -m "feat: initial beep-jobs setup"
   git remote add origin https://github.com/<your-username>/beep-jobs.git
   git push -u origin main
   ```

2. **Add GitHub Secrets** (for the automated daily refresh):
   Go to your GitHub repository **Settings -> Secrets and variables -> Actions** and add:
   - `GEMINI_API_KEY`: Your Gemini API key from Google AI Studio.
   - `ADZUNA_APP_ID`: Your Adzuna App ID.
   - `ADZUNA_APP_KEY`: Your Adzuna App Key.

3. **Deploy on Render**:
   - Log into [Render.com](https://render.com).
   - Click **New +** -> **Web Service**.
   - Connect your `beep-jobs` GitHub repository.
   - Configure:
     - **Name**: `beep-jobs`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Instance Type**: `Free`
   - Click **Deploy Web Service**.

4. **How Continuous Updates Work**:
   - Every day at 02:00 UTC, the GitHub Actions cron runs `node refresh.js`.
   - New jobs are tagged with Gemini and committed directly to `main` branch.
   - Render detects the git push and automatically redeploys your updated live site!
