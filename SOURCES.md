# beep-jobs | Data Sources, Compliance & Technical Evaluation

**Author:** Aman Kumar  
**Live Application:** https://beep-jobs-4v5x.onrender.com  
**Repository:** https://github.com/aman9621/beep-jobs

---

## 1. Overview

**beep-jobs** is an India-focused job discovery platform built to help freshers find internships and entry-level opportunities without searching across multiple company career pages.

The application aggregates publicly available job listings through official, unauthenticated job board APIs, applies eligibility and location filters, removes duplicate listings, and uses AI-assisted classification to organize jobs by role and city.

The project prioritizes **relevance and data quality over listing volume**, aiming to provide opportunities that are more suitable for candidates beginning their careers.

### Key Capabilities

- Aggregation of jobs from multiple public job board APIs.
- India-focused fresher, internship, and entry-level filtering.
- Duplicate detection across job listings.
- AI-powered job categorization.
- Search, role, and city filtering.
- Direct links to original job postings.
- Automated daily refresh workflow using GitHub Actions.
- Resilient handling of API failures and tagging errors.

---

## 2. Data Sources & Compliance

The final pipeline uses publicly accessible, unauthenticated, read-only job board APIs. It does not scrape HTML pages, crawl websites, or access authenticated user data.

### Active Data Sources

| Source | API Endpoint | Application Link Field |
|---|---|---|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true` | `absolute_url` |
| Lever | `api.lever.co/v0/postings/{company}?mode=json` | `hostedUrl` |
| Ashby | `api.ashbyhq.com/posting-api/job-board/{organization}` | `jobUrl` |

**Authentication:** None required for the public endpoints used.

Company board identifiers are maintained in `config/boards.json`. Unavailable boards, including those returning HTTP 404, are skipped and logged without interrupting the refresh pipeline.

Ashby currently contributes limited listings due to the number of configured boards successfully responding during testing.

### Sources Evaluated but Excluded

| Source | Status | Reason |
|---|---|---|
| Remotive | Removed | Listings were primarily global remote opportunities and did not sufficiently align with the India-focused target. |
| Jobicy | Removed | Global remote listings were not sufficiently relevant to the target dataset. |
| Adzuna | Excluded from final pipeline | API registration required additional credentials; signup requested credit card information. |

Adzuna integration code remains in the repository but is not part of the active pipeline.

### Platforms Deliberately Avoided

LinkedIn, Naukri, Internshala, Indeed, Monster, and Foundit were excluded from automated collection due to restrictions or concerns regarding automated extraction and crawling.

These exclusion decisions reflect my understanding of the respective platform terms during development. I have not independently re-verified every applicable clause. This document is a technical description of my source-selection decisions, not a legal certification.

---

## 3. Data Processing Pipeline

The collection pipeline follows a structured workflow:

`Fetch → Normalize → Filter → Deduplicate → Merge → Tag → Persist`

| Stage | Description |
|---|---|
| Fetch | Retrieve job listings from configured public APIs. |
| Normalize | Convert source-specific responses into a common schema and clean descriptions. |
| Filter | Retain relevant India-based fresher, internship, and entry-level opportunities. |
| Deduplicate | Remove repeated listings using normalized job details and job URLs. |
| Merge | Combine newly collected listings with the existing dataset. |
| Tag | Categorize eligible untagged jobs using Gemini. |
| Persist | Update `jobs.json` with listings, timestamps, and refresh statistics. |

### Normalized Job Schema

```json
{
  "id": "",
  "title": "",
  "company": "",
  "location": "",
  "description": "",
  "url": "",
  "source": "",
  "postedAt": "",
  "fetchedAt": ""
}
```

Descriptions are cleaned by removing HTML and trimming unnecessary content.

---

## 4. Eligibility Filtering & Dataset Quality

The filtering system evaluates job titles, descriptions, locations, experience requirements, and fresher-related signals.

It aims to retain opportunities for:

- Fresh graduates
- Interns
- Entry-level candidates
- Graduate trainees
- Candidates with limited or no professional experience

Senior, lead, manager, and other unsuitable roles are excluded, particularly when they require significant prior experience.

### Filtering Results

During testing, 969 India-related listings were collected before the final filtering process.

| Filter | Listings Removed |
|---|---:|
| Senior or unsuitable titles | 658 |
| Roles requiring 2+ years of experience | 53 |
| Listings without a clear fresher signal | 127 |
| Duplicate listings | 41 |
| **Final dataset** | **Approximately 90** |

The final dataset is smaller than the initial 200+ target by design. The decision was to prioritize relevance over volume rather than include experienced roles simply to increase the number of listings.

Filtering is intentionally conservative, meaning some valid entry-level opportunities may be excluded when their eligibility is unclear.

---

## 5. AI Classification

Google Gemini is used to classify newly collected job listings into structured categories.

### Classification Attributes

- Job role
- City
- Eligibility
- Skills
- Work mode

### Role Taxonomy

The classifier uses a predefined set of categories:

Software Engineering, Frontend, Backend, Full Stack, Data/Analytics, AI/ML, DevOps/Cloud, QA/Testing, Design/UX, Product, Marketing, Sales/Business Development, Operations, HR/Recruiting, Finance/Accounting, Content/Writing, Customer Support, and Other.

### Location Normalization

Common city variations are standardized, for example:

- Bangalore → Bengaluru
- Gurgaon / Noida → Delhi NCR

Locations are not intentionally inferred without supporting information. Unknown locations are represented as `Unknown`, and remote opportunities may be classified as `Remote`.

### Reliability & Error Handling

During development, the tagging system encountered model availability issues, rate limits, and unreliable fallback behavior.

Improvements included:

- Configurable Gemini model selection.
- Structured output validation.
- Retry handling.
- Exponential backoff for rate limits.
- Request throttling.
- Reuse of existing tags.
- Explicit tracking of failed tagging attempts.

Failed tagging requests are not intended to be saved as fabricated classifications and are retried during subsequent refreshes.

---

## 6. Classification Evaluation

AI classification was evaluated using a manually reviewed sample of 50 job listings.

| Metric | Result |
|---|---:|
| Sample size | 50 listings |
| Role classification accuracy | 100% |
| City classification accuracy | 100% |
| Overall accuracy | 100% |

### Methodology

1. Generate a reproducible sample using `npm run eval:sample`.
2. Manually inspect each sampled job against its original posting.
3. Record verified labels in `eval/sample_50_checked.csv`.
4. Run `npm run eval:score` to compare predicted labels against the manually verified values.

All 50 evaluated listings matched the manually verified role and city labels.

### Limitations

- The sample size is limited to 50 listings.
- The results represent the evaluated sample, not guaranteed production-wide accuracy.
- Fixed role categories and city normalization rules simplify the classification task.
- Ambiguous role classifications may introduce errors at larger scale.

Accordingly, the reported 100% accuracy should be interpreted strictly as **accuracy on the manually evaluated sample**.

---

## 7. AI Usage & Cost Analysis

**Model:** `gemini-3.5-flash-lite`

### Average Token Usage

| Metric | Tokens per listing |
|---|---:|
| Input | 659 |
| Output | 46 |
| Total | 705 |

### Estimated Cost per 1,000 Tagged Listings

| Metric | Estimate |
|---|---:|
| Input pricing used | $0.075 / 1M tokens |
| Output pricing used | $0.30 / 1M tokens |
| Estimated total | $0.063 |
| Approximate INR equivalent | ₹5.40 |

The estimate is calculated using the pricing constants configured in the cost-reporting script. Pricing should be verified against the current Gemini pricing before treating this estimate as a current billing projection.

### Usage Tracking & Optimization

Actual token usage is logged in:

`data/usage_log.json`

The log contains approximately 517 API calls across development and testing, including retries.

Previously tagged listings are reused from `jobs.json`, preventing unnecessary repeat requests. Consequently, the expected cost of daily refreshes is significantly lower than processing the entire dataset repeatedly.

---

## 8. Automation & Deployment

### Automated Refresh

GitHub Actions is configured to:

- Run the refresh workflow once per day.
- Support manual execution through `workflow_dispatch`.
- Execute the collection, filtering, deduplication, and tagging pipeline.
- Access required credentials through GitHub Secrets.
- Commit and push updated `jobs.json` only when changes are detected.

### Technology Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Backend | Express.js |
| Frontend | HTML, CSS, Vanilla JavaScript |
| Data storage | JSON file (`jobs.json`) |
| AI classification | Google Gemini API |
| Data sources | Greenhouse, Lever, Ashby |
| Automation | GitHub Actions |
| Hosting | Render |
| Version control | Git / GitHub |

### Deployment Status

- **Application:** Deployed on Render.
- **Refresh workflow:** Implemented.
- **Scheduled workflow verification:** Pending first verified run.

The application uses Render's free tier, so cold starts may cause delays of approximately 50 seconds after inactivity.

---

## 9. Limitations & Roadmap

### Known Limitations

- Approximately 90 listings currently available.
- Job coverage depends on configured company boards and source availability.
- Conservative filtering may exclude valid fresher opportunities.
- AI tagging can fail and require retries.
- Automated scheduled refresh has not yet been fully verified.
- Job expiration after 30 days is planned but not implemented.
- Free-tier hosting may introduce cold-start latency.

### Planned Improvements

- Implement automatic expiration of outdated job listings.
- Verify and monitor scheduled GitHub Actions executions.
- Expand validated company board coverage.
- Improve fresher eligibility detection.
- Increase the manual classification evaluation sample.
- Improve monitoring and reporting of API and tagging failures.

---

## 10. Development Tools & AI Assistance

| Tool | Contribution |
|---|---|
| Antigravity | Initial project generation and implementation assistance. |
| Claude | Planning, debugging, filtering improvements, tagging reliability, workflow refinements, and documentation. |
| Gemini API | Job classification and structured tagging. |
| Node.js / Express | Backend processing and API development. |
| Vanilla JavaScript | Frontend implementation. |
| GitHub Actions | Scheduled data refresh automation. |
| Render | Deployment and hosting. |
| Loom | Project walkthrough recording. |

AI tools assisted with code generation, debugging, and iteration. The implementation was refined through testing, troubleshooting, and follow-up changes during development.

---

## 11. Engineering Challenges

| Challenge | Resolution |
|---|---|
| Incorrect Apply links | Updated integrations to use source-provided job-specific URLs. |
| Limited job coverage | Expanded board configuration and validated company board identifiers. |
| Retired Gemini model | Switched to a supported configurable model. |
| Too few fresher listings | Refined title, location, experience, and description filtering. |
| Incorrect Greenhouse endpoint | Corrected the API domain to `boards-api.greenhouse.io`. |
| Invalid board identifiers | Added a board validation script to identify working company slugs. |
| Gemini rate limits | Added throttling, retries, and exponential backoff. |
| Failed tags saved as fallback values | Improved failure handling and retry behavior. |

---

## 12. Project Links

| Resource | Link |
|---|---|
| Live Application | https://beep-jobs-4v5x.onrender.com |
| GitHub Repository | https://github.com/aman9621/beep-jobs |
| Walkthrough | *Loom link to be added* |
| Evaluation Dataset | `eval/sample_50_checked.csv` |

---

## 13. Key Learnings

Building beep-jobs provided practical experience with:

- Integrating multiple REST APIs.
- Normalizing inconsistent external data.
- Building filtering and deduplication pipelines.
- Designing resilient data collection workflows.
- Using AI for structured classification.
- Handling rate limits, retries, and API failures.
- Evaluating model output against manually verified data.
- Tracking token consumption and estimating AI costs.
- Automating scheduled tasks with GitHub Actions.
- Deploying and maintaining a production-hosted application.

A key engineering decision was to prioritize the relevance of listings over dataset size. The final dataset is smaller than the initial target, but the filtering process is designed to better align opportunities with fresher and entry-level candidates.

---

*beep-jobs is an actively evolving project. The current application is deployed, while scheduled refresh verification, stale listing cleanup, and further improvements to source coverage and filtering remain ongoing work.*
