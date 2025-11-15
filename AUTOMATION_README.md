# Meal Planner - Weekly Menu Automation

This project automatically scrapes EveryPlate weekly menus and recipe PDFs.

## 📁 Project Structure

```
docs/
  ├── week.json              # Current week (used by frontend)
  ├── week_with_pdfs.json    # Current week with PDF paths
  ├── weeks/                 # Archive of all weeks
  │   ├── 2025-W44.json
  │   ├── 2025-W45.json
  │   └── ...
  ├── weeks_index.json       # Index of all archived weeks
  └── pdfs/                  # Downloaded recipe PDFs
      ├── <recipe-id>-en-US.pdf
      └── ...
```

## 🔄 Automation Workflow

### GitHub Actions (Automated)
The workflow runs **every Monday at 6 AM UTC** to capture new weekly menus:

1. Scrapes the current week's menu from EveryPlate
2. Downloads recipe PDFs
3. Updates `docs/week.json` and `docs/week_with_pdfs.json`
4. Archives to `docs/weeks/YYYY-Www.json`
5. Commits and pushes changes

**Manual Trigger:**
- Go to Actions → "Scrape Weekly Menu" → Run workflow
- Optional: Specify a week number to scrape a specific week

### Local Setup (One-time Historical Data)

#### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

#### 2. Populate Historical Weeks
```bash
# Backfill past weeks (run this once)
python populate_historical_weeks.py 44 45 46 47 48

# Or scrape a single specific week
python scrape_specific_week.py 47
```

#### 3. Download PDFs
```bash
# Enrich with PDFs
python enrich_and_download_pdfs.py --input docs/week.json --output docs/week_with_pdfs.json
```

#### 4. Commit and Push
```bash
git add docs/weeks/*.json docs/pdfs/*.pdf docs/weeks_index.json docs/week*.json
git commit -m "Add historical weeks data"
git push
```

## 🛠️ Manual Scripts

### `scrape_week.py`
Scrapes the **current** week automatically:
```bash
python scrape_week.py
```

### `scrape_specific_week.py`
Scrapes a **specific** week number:
```bash
python scrape_specific_week.py 47
```

### `enrich_and_download_pdfs.py`
Downloads PDFs and updates JSON with local paths:
```bash
python enrich_and_download_pdfs.py --input docs/week.json --output docs/week_with_pdfs.json
```

### `populate_historical_weeks.py`
Batch scrape multiple historical weeks:
```bash
python populate_historical_weeks.py 44 45 46 47 48
```

## 🌐 Frontend

The web interface (`docs/index.html`) displays:
- Current week's recipes
- Recipe cards with images and descriptions
- "View Recipe" button (opens local PDF in browser)
- "Print Recipe" button (opens PDF for printing)
- Grocery list builder with ingredient aggregation

### Future Enhancements
- Week navigation (prev/next arrows)
- Load archived weeks from `docs/weeks/`
- Calendar view of all weeks

## 🔧 Configuration

### GitHub Actions Secrets
No secrets required - uses `GITHUB_TOKEN` automatically.

### Scraping Settings
Edit in respective Python files:
- **Delay between requests**: `--delay 0.5` (500ms)
- **Locale**: `--locale en-US`
- **Force overwrite**: `--force`

## 📝 Notes

- PDFs are scraped from: `https://www.everyplate.com/recipecards/card/<recipe-id>-en-US.pdf`
- Week numbers follow ISO 8601 format (YYYY-Www)
- Chrome/ChromeDriver required for Selenium scraping
- Rate limiting: 0.5s delay between requests (be respectful!)

## 🐛 Troubleshooting

### Chrome driver not found
```bash
# Install ChromeDriver manually
# Or use: pip install webdriver-manager
```

### JSON decode errors
```bash
# Clear verification cache
rm docs/.verify_cache.json
```

### PDFs not downloading
- Check network connection
- Verify recipe ID extraction from URL
- Some recipes may not have PDFs available
