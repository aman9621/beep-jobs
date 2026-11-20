# Data Sources & Zero-Cost Compliance Guide for beep-jobs

All job data in `beep-jobs` comes strictly from publicly accessible, official APIs and career board endpoints that permit programmatic retrieval for indexation and applicant discovery. We strictly respect platform terms of service, `robots.txt` guidelines, and **guarantee a 100% zero-cost stack requiring NO credit cards**.

---

## 1. Zero-Key & Zero-Card Public Sources (Primary)

These sources require **NO API key, NO user account, NO credit card, and NO subscription**:

### A. Greenhouse Public Job Board API
- **Endpoint**: `https://job-boards.greenhouse.io/v1/boards/{board_token}/jobs?content=true`
- **Authentication**: None required (public REST API).
- **Credit Card / Subscription**: None (\$0.00).
- **Terms & robots status**: Greenhouse provides this public, unauthenticated read-only REST API specifically so companies can display their open vacancies on external websites, job aggregators, and custom career pages without scraping HTML.
- **Link type**: Each job returns `absolute_url` — a **direct deep link to the specific job posting**.

### B. Lever Public Postings API
- **Endpoint**: `https://api.lever.co/v0/postings/{company}?mode=json`
- **Authentication**: None required (public REST API).
- **Credit Card / Subscription**: None (\$0.00).
- **Terms & robots status**: Lever officially provides this read-only JSON endpoint for querying published job openings.
- **Link type**: Each job returns `hostedUrl` — a **direct deep link to the specific Lever job page**.

### C. Ashby Public Job Board API
- **Endpoint**: `https://api.ashbyhq.com/posting-api/job-board/{organization}`
- **Authentication**: None required (public REST API).
- **Credit Card / Subscription**: None (\$0.00).
- **Terms & robots status**: Ashby officially provides this unauthenticated REST API for companies (like Meesho, Slice, FamPay, Linear, Mistral) to syndicate job listings publicly.
- **Link type**: Each job returns `jobUrl` — a **direct deep link to the specific job on Ashby**.

### D. Remotive Public API
- **Endpoint**: `https://remotive.com/api/remote-jobs`
- **Authentication**: None required (public REST API).
- **Credit Card / Subscription**: None (\$0.00).
- **Terms & robots status**: Remotive officially exposes this free public API for syndicating remote job listings.
- **Link type**: Each job returns `url` — a **direct deep link to the specific job on Remotive**.

### E. Jobicy Public API
- **Endpoint**: `https://jobicy.com/api/v2/remote-jobs`
- **Authentication**: None required (public REST API).
- **Credit Card / Subscription**: None (\$0.00).
- **Terms & robots status**: Jobicy provides a free, official public REST API for remote job discovery.
- **Link type**: Each job returns `url` — a **direct deep link to the specific job on Jobicy**.

---

## 2. Optional Sources

### Adzuna API
- **Status**: **100% Optional**.
- **Credit Card Note**: Because Adzuna may require credit card verification or subscription details during developer sign-up, **it is completely optional in beep-jobs**.
- If `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` are not set in your `.env`, the pipeline automatically skips Adzuna without errors and collects listings from Greenhouse, Lever, and Ashby.

---

## 3. Strictly Prohibited & Disallowed Sources

We explicitly **do NOT** scrape or access the following websites:

| Platform | Why Disallowed |
| :--- | :--- |
| **LinkedIn** | Prohibited by LinkedIn User Agreement Section 8.2 (anti-scraping clause) and enforced via robots.txt and automated bot defenses. |
| **Naukri** | Prohibited by Info Edge / Naukri.com Terms of Use (unauthorized crawling/scraping strictly forbidden). |
| **Internshala** | Prohibited by Internshala Terms & Conditions (automated data extraction not permitted). |
| **Indeed** | Prohibited by Indeed Terms of Service and automated scraping policies. |
| **Monster / Foundit** | Prohibited by Terms of Service for automated bots. |

---

## 4. Best Practices Implemented

1. **Zero Credit Card Guarantee**: The pipeline runs completely on free public endpoints and Google Gemini's free tier.
2. **Graceful Failures**: If a company slug in `config/boards.json` returns `404 Not Found` (e.g. company moved platforms), the pipeline logs a warning and proceeds without crashing.
3. **Resumable Tagging**: Job IDs are tracked in `jobs.json`. Jobs that have already been classified are never re-sent to the LLM, preserving API quotas.
4. **Data Retention**: Posts older than 30 days are automatically retired to keep listings fresh.
