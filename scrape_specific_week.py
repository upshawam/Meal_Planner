#!/usr/bin/env python3
"""
Simple script to scrape a specific week by number.
Usage: python scrape_specific_week.py 47
"""
import sys
import os
import json
import datetime

# Get week number from command line
if len(sys.argv) < 2:
    print("Usage: python scrape_specific_week.py <week_number>")
    sys.exit(1)

target_week = int(sys.argv[1])
target_year = datetime.date.today().isocalendar()[0]

print(f"Scraping week {target_week} of {target_year}...")

# Temporarily modify environment to target specific week
os.environ['TARGET_WEEK'] = str(target_week)
os.environ['TARGET_YEAR'] = str(target_year)

# Now run the scraper
from scrape_week import run

# Monkey-patch the current_week_url function
import weekly_menu_scraper
weekly_menu_scraper.current_week_url = lambda: f"https://www.everyplate.com/weekly-menu/{target_year}-W{target_week:02d}"

# Run the scraper with target week
run(force=True, verbose=True, year=target_year, week=target_week)

print(f"\n[OK] Week {target_week} scraped successfully!")
print(f"Note: Run PDF enrichment manually if needed: python enrich_and_download_pdfs.py --input docs/weeks/2025-W{target_week:02d}.json --output docs/weeks/2025-W{target_week:02d}.json")
