#!/usr/bin/env python3
"""
scrape_multiple_weeks.py

Scrape multiple weeks at once (past, current, and future weeks).
Each week is saved to docs/weeks/ and the latest is copied to docs/week.json.
PDFs are downloaded for each week automatically.

Matches the proven workflow from scrape-weekly-menu.yml
"""
import argparse
import datetime
import os
import subprocess
import sys
import time

ARCHIVE_DIR = "docs/weeks"
LATEST_PATH = "docs/week.json"
WEEK_WITH_PDFS = "docs/week_with_pdfs.json"
PDF_DIR = "docs/pdfs"

def scrape_week_by_number(year, week, force=False, verbose=True):
    """
    Scrape a specific week number using the same process as scrape-weekly-menu.yml:
    1. Run scrape_specific_week.py to get basic data
    2. Enrich with PDFs using enrich_and_download_pdfs.py
    3. Copy enriched data to archive
    """
    print(f"\n{'='*60}")
    print(f"🍽️  Scraping Week {week} of {year}")
    print(f"{'='*60}")
    
    archive_name = f"{year}-W{week:02d}.json"
    archive_path = os.path.join(ARCHIVE_DIR, archive_name)
    temp_week_file = "docs/week.json"
    
    print(f"[Week {week}] 📂 Archive target: {archive_path}")
    
    # Check if already exists and skip if not forcing
    if os.path.exists(archive_path) and not force:
        print(f"[Week {week}] ⤴  Already exists, skipping (use --force to overwrite)")
        return None
    
    print(f"[Week {week}] 🚀 Starting scrape process...")
    
    try:
        # Step 1: Scrape the week data
        print(f"[Week {week}] 📋 Step 1/3: Scraping menu data from EveryPlate...")
        print(f"[Week {week}]    Running: python scrape_specific_week.py {week}")
        
        start_time = time.time()
        result = subprocess.run(
            [sys.executable, "scrape_specific_week.py", str(week)],
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout per week
        )
        elapsed = time.time() - start_time
        
        if result.returncode != 0:
            print(f"[Week {week}] ❌ Scraping failed after {elapsed:.1f}s:")
            print(result.stderr)
            return None
        
        print(f"[Week {week}] ✓  Menu data scraped in {elapsed:.1f}s")
        if verbose:
            print(result.stdout)
        
        # Step 2: Enrich with PDFs
        print(f"[Week {week}] 📥 Step 2/3: Downloading recipe PDFs...")
        print(f"[Week {week}]    Running: python enrich_and_download_pdfs.py")
        
        start_time = time.time()
        result = subprocess.run(
            [sys.executable, "enrich_and_download_pdfs.py", 
             "--input", temp_week_file,
             "--output", WEEK_WITH_PDFS,
             "--delay", "0.5"],
            capture_output=True,
            text=True,
            timeout=600  # 10 minute timeout for PDFs
        )
        elapsed = time.time() - start_time
        
        if result.returncode != 0:
            print(f"[Week {week}] ⚠️  PDF download had issues after {elapsed:.1f}s:")
            print(result.stderr)
            # Continue anyway - we have the recipe data
        else:
            print(f"[Week {week}] ✓  PDFs downloaded in {elapsed:.1f}s")
        
        if verbose:
            print(result.stdout)
        
        # Step 3: Copy enriched data to archive
        print(f"[Week {week}] 💾 Step 3/3: Archiving enriched data...")
        print(f"[Week {week}]    Target: {archive_path}")
        
        if os.path.exists(WEEK_WITH_PDFS):
            import shutil
            os.makedirs(ARCHIVE_DIR, exist_ok=True)
            shutil.copy2(WEEK_WITH_PDFS, archive_path)
            file_size = os.path.getsize(archive_path) / 1024  # KB
            print(f"[Week {week}] ✅ Successfully saved ({file_size:.1f} KB)")
            print(f"[Week {week}] 🎉 Week {week} complete!")
            return archive_path
        else:
            print(f"[Week {week}] ⚠️  Enriched file not found at {WEEK_WITH_PDFS}")
            print(f"[Week {week}]    Check logs above for errors")
            return None
            
    except subprocess.TimeoutExpired:
        print(f"[Week {week}] ❌ Timeout - operation took too long (>15 minutes)")
        return None
    except Exception as e:
        print(f"[Week {week}] ❌ Unexpected error: {e}")
        import traceback
        if verbose:
            traceback.print_exc()
        return None

def main():
    parser = argparse.ArgumentParser(description="Scrape multiple weeks from EveryPlate")
    parser.add_argument("--weeks", "-w", type=int, nargs="+", help="Specific week numbers to scrape (e.g., 46 47 48)")
    parser.add_argument("--range", "-r", type=int, nargs=2, metavar=("START", "END"), help="Range of weeks to scrape (e.g., 44 48)")
    parser.add_argument("--current", "-c", action="store_true", help="Scrape current week")
    parser.add_argument("--future", "-f", type=int, default=0, help="Number of future weeks to scrape (default: 0)")
    parser.add_argument("--past", "-p", type=int, default=0, help="Number of past weeks to scrape (default: 0)")
    parser.add_argument("--year", "-y", type=int, help="Year (default: current year)")
    parser.add_argument("--force", action="store_true", help="Force overwrite existing week data")
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
    
    print(f"\n{'='*60}")
    print(f"🚀 BATCH SCRAPE: {len(weeks_list)} week(s)")
    print(f"{'='*60}")
    print(f"📅 Year: {year}")
    print(f"📋 Weeks: {weeks_list}")
    print(f"⏱️  Estimated time: {len(weeks_list) * 2}-{len(weeks_list) * 3} minutes")
    print(f"{'='*60}\n")
    
    successful = []
    failed = []
    skipped = []
    
    for i, week in enumerate(weeks_list, 1):
        print(f"\n[PROGRESS] Processing week {i}/{len(weeks_list)} (Week {week})...")
        try:
            result = scrape_week_by_number(year, week, force=args.force, verbose=True)
            if result:
                successful.append(week)
            elif result is None:
                skipped.append(week)
            else:
                failed.append(week)
        except Exception as e:
            print(f"[ERROR] Failed to scrape week {week}: {e}")
            failed.append(week)
            continue
    
    # Print final summary
    print(f"\n{'='*60}")
    print(f"📊 SCRAPE COMPLETE")
    print(f"{'='*60}")
    print(f"✅ Successful: {len(successful)} week(s) {successful if successful else ''}")
    print(f"⤴️  Skipped:    {len(skipped)} week(s) {skipped if skipped else ''}")
    print(f"❌ Failed:     {len(failed)} week(s) {failed if failed else ''}")
    print(f"{'='*60}")
    
    if successful:
        print(f"\n✨ {len(successful)} week(s) successfully scraped and archived!")
        print(f"📁 Check docs/weeks/ for archived files")
        print(f"📥 PDFs saved to docs/pdfs/")
    
    if failed:
        print(f"\n⚠️  {len(failed)} week(s) failed - review logs above")
    
    if not successful and not skipped:
        print("\n❌ No weeks were successfully scraped")
        sys.exit(1)

if __name__ == "__main__":
    main()
