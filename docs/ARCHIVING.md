```markdown
# Weekly Archive & Deployment Notes

Overview
--------
This repo automates scraping EveryPlate's weekly menu, verifies recipes, and stores a "latest" file plus an archive per week:

- Latest: `docs/week.json`
- Weekly archives: `docs/weeks/YYYY-Www.json` (ISO week format)
- Index: `docs/weeks_index.json` (array of entries with { year, week, path, archived_at })

Files are used by the static front-end in `docs/` and optionally can be served by the Flask app.

How it works
------------
1. The scraper `scrape_week.py`:
   - collects candidate recipe cards using `weekly_menu_scraper.scrape_weekly_menu()`
   - verifies & scrapes ingredients using `recipe_scraper.scrape_ingredients()`
   - requires at least 2 ingredients to qualify
   - generates an EveryPlate PDF link when it can infer the recipe ID (stored as `meal["pdf"]`)
   - writes `docs/week.json` (latest) and `docs/weeks/YYYY-Www.json` (archive)
   - updates `docs/weeks_index.json` with an entry that references the archive relative path

2. GitHub Actions (`.github/workflows/scrape-week.yml`) runs the scraper on a schedule (and supports manual dispatch), installs dependencies, runs the script, and commits any changes in `docs/` back to the repository so GitHub Pages is updated automatically.

3. Front-end (`docs/index.html` + `docs/app.js`):
   - fetches `docs/weeks_index.json` (if present) and loads the latest archive file
   - provides Prev/Next navigation to browse archived weeks
   - falls back to `docs/week.json` if no index exists

4. Flask app (`app.py`) (optional):
   - supports a query parameter to render a particular archived week instead of scraping live:
     - `/?archive=weeks/2025-W44.json` or `/?year=2025&week=44`

Developer notes & troubleshooting
-------------------------------
- If the GitHub Action is failing:
  - check Action logs for any Selenium/driver or network errors.
  - ensure the runner environment can run the required dependencies (the workflow installs from `requirements.txt`).
- If your repo uses GitHub Pages to serve `docs/`, the Action commits `docs/*` changes so those updates are published automatically.
- To re-run and overwrite an existing archive for the current week, run locally:
  ```
  python scrape_week.py --force
  ```
- The `docs/.verify_cache.json` file caches verification results to avoid re-scraping recipe pages. You may remove it to force re-verification.

Manual import of historical weeks
---------------------------------
- Place historic JSON files in `docs/weeks/` using the naming convention `YYYY-Www.json`.
- Update `docs/weeks_index.json` with entries for each imported file; each entry should include:
  ```
  {
    "year": 2025,
    "week": 44,
    "path": "weeks/2025-W44.json",
    "archived_at": 1699999999
  }
  ```
- Sort `weeks_index.json` so latest entries come first.

Security & etiquette
--------------------
- Scraping external sites should respect robots.txt and the site's terms of service.
- Keep polite request delays in `scrape_week.py` via `REQUEST_DELAY_SECONDS`.
