#!/usr/bin/env python3
"""
scrape_multiple_weeks.py

Scrape multiple weeks at once (past, current, and future weeks).
Each week is saved to docs/weeks/ and the latest is copied to docs/week.json.
PDFs are downloaded for each week automatically.
"""
import argparse
import datetime
import os
from scrape_week import verify_and_enrich_meals, save_json_atomic, ensure_dir, make_archive_filename, update_weeks_index
from weekly_menu_scraper import scrape_weekly_menu
from enrich_and_download_pdfs import enrich_with_pdfs

ARCHIVE_DIR = "docs/weeks"
LATEST_PATH = "docs/week.json"
PDF_DIR = "docs/pdfs"

def scrape_week_by_number(year, week, verbose=True):
    """Scrape a specific week number."""
    # Temporarily modify the scraper to target a specific week
    import weekly_menu_scraper
    original_func = weekly_menu_scraper.current_week_url
    
    # Override the function to return our target week
    weekly_menu_scraper.current_week_url = lambda: f"https://www.everyplate.com/weekly-menu/{year}-W{week:02d}"
    
    try:
        print(f"\n{'='*60}")
        print(f"Scraping Week {week} of {year}")
        print(f"{'='*60}")
        
        # Scrape the menu
        candidates = scrape_weekly_menu()
        print(f"[Week {week}] Collected {len(candidates)} candidate cards")
        
        # Verify candidates
        meals = verify_and_enrich_meals(candidates, verbose=verbose)
        print(f"[Week {week}] Verified {len(meals)} recipes")
        
        # Build payload
        payload = {
            "week": week,
            "year": year,
            "meals": meals
        }
        
        # Save to archive
        ensure_dir(ARCHIVE_DIR)
        archive_name = make_archive_filename(year, week)
        archive_path = os.path.join(ARCHIVE_DIR, archive_name)
        archive_relpath = os.path.join("weeks", archive_name)
        
        print(f"[Week {week}] Saving to {archive_path}")
        save_json_atomic(archive_path, payload)
        update_weeks_index(archive_relpath, year, week)
        
        # Download PDFs for this week
        print(f"[Week {week}] Downloading PDFs...")
        enrich_with_pdfs(
            input_file=archive_path,
            output_file=archive_path,
            out_dir=PDF_DIR,
            locale="en-US",
            delay=0.5,
            force=False
        )
        
        return payload
        
    finally:
        # Restore original function
        weekly_menu_scraper.current_week_url = original_func

def main():
    parser = argparse.ArgumentParser(description="Scrape multiple weeks from EveryPlate")
    parser.add_argument("--weeks", "-w", type=int, nargs="+", help="Specific week numbers to scrape (e.g., 46 47 48)")
    parser.add_argument("--range", "-r", type=int, nargs=2, metavar=("START", "END"), help="Range of weeks to scrape (e.g., 44 48)")
    parser.add_argument("--current", "-c", action="store_true", help="Scrape current week")
    parser.add_argument("--future", "-f", type=int, default=0, help="Number of future weeks to scrape (default: 0)")
    parser.add_argument("--past", "-p", type=int, default=0, help="Number of past weeks to scrape (default: 0)")
    parser.add_argument("--year", "-y", type=int, help="Year (default: current year)")
    args = parser.parse_args()
    
    today = datetime.date.today()
    current_year, current_week, _ = today.isocalendar()
    year = args.year or current_year
    
    weeks_to_scrape = set()
    
    # Determine which weeks to scrape
    if args.weeks:
        weeks_to_scrape.update(args.weeks)
    
    if args.range:
        start, end = args.range
        weeks_to_scrape.update(range(start, end + 1))
    
    if args.current:
        weeks_to_scrape.add(current_week)
    
    if args.future:
        for i in range(1, args.future + 1):
            weeks_to_scrape.add(current_week + i)
    
    if args.past:
        for i in range(1, args.past + 1):
            weeks_to_scrape.add(current_week - i)
    
    # Default: scrape current week if nothing specified
    if not weeks_to_scrape:
        weeks_to_scrape.add(current_week)
    
    # Sort weeks
    weeks_list = sorted(weeks_to_scrape)
    
    print(f"Will scrape {len(weeks_list)} week(s): {weeks_list}")
    
    latest_payload = None
    for week in weeks_list:
        try:
            payload = scrape_week_by_number(year, week, verbose=True)
            # Keep track of the most recent week as "latest"
            if latest_payload is None or week > latest_payload["week"]:
                latest_payload = payload
        except Exception as e:
            print(f"[ERROR] Failed to scrape week {week}: {e}")
            continue
    
    # Save the latest week to docs/week.json
    if latest_payload:
        print(f"\n{'='*60}")
        print(f"Saving latest week ({latest_payload['week']}) to {LATEST_PATH}")
        save_json_atomic(LATEST_PATH, latest_payload)
        print(f"✅ Done! Scraped {len(weeks_list)} week(s)")
    else:
        print("\n❌ No weeks were successfully scraped")

if __name__ == "__main__":
    main()
