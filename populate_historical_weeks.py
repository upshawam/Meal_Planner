#!/usr/bin/env python3
"""
Manual script to populate historical weeks.
Run this LOCALLY to backfill your archive with past weeks.

Usage:
    python populate_historical_weeks.py 44 45 46
"""
import sys
import os
import subprocess
import time

# Force UTF-8 encoding on Windows consoles so emojis don't break
if os.name == "nt":
    sys.stdout.reconfigure(encoding="utf-8")

def run_command(cmd, description):
    """Run a shell command and print results in real-time."""
    print(f"\n{'='*60}")
    print(f"  {description}")
    print(f"{'='*60}")
    print(f"Command: {cmd}")
    print(f"Starting...\n")
    sys.stdout.flush()
    
    # Run with real-time output
    result = subprocess.run(cmd, shell=True, text=True)
    return result.returncode == 0

def main():
    if len(sys.argv) < 2:
        print("Usage: python populate_historical_weeks.py <week1> <week2> ...")
        print("Example: python populate_historical_weeks.py 44 45 46")
        sys.exit(1)
    
    weeks = [int(w) for w in sys.argv[1:]]
    print(f"Will populate {len(weeks)} historical week(s): {weeks}")
    
    successful = 0
    failed = 0
    
    for week in weeks:
        print(f"\n\n{'#'*60}")
        print(f"# Processing Week {week}")
        print(f"{'#'*60}")
        print(f"[INFO] Starting week {week} processing...")
        sys.stdout.flush()
        
        # Step 1: Scrape the week
        print(f"\n[INFO] Step 1/2: About to scrape menu data for week {week}...")
        sys.stdout.flush()
        if not run_command(
            f"python scrape_specific_week.py {week}",
            f"Step 1/2: Scraping week {week}"
        ):
            print(f"\n[FAILED] Failed to scrape week {week}")
            failed += 1
            continue
        print(f"\n[INFO] Step 1/2 completed for week {week}")
        sys.stdout.flush()
        
        # Step 2: Download PDFs
        week_file = f"docs/weeks/2025-W{week:02d}.json"
        print(f"\n[INFO] Step 2/2: About to download PDFs for week {week}...")
        sys.stdout.flush()
        if not run_command(
            f"python enrich_and_download_pdfs.py --input {week_file} --output {week_file} --delay 0.5",
            f"Step 2/2: Downloading PDFs for week {week}"
        ):
            print(f"\n[WARNING] PDF download had issues for week {week}, but week data was saved")
        
        print(f"\n[SUCCESS] Week {week} completed successfully!")
        successful += 1
        sys.stdout.flush()
        
        # Be polite - wait between weeks
        if week != weeks[-1]:
            print("\nWaiting 3 seconds before next week...")
            time.sleep(3)
    
    print(f"\n\n{'='*60}")
    print(f"  SUMMARY")
    print(f"{'='*60}")
    print(f"[OK] Successfully processed: {successful} week(s)")
    print(f"[FAILED] Failed: {failed} week(s)")
    print(f"\nNext steps:")
    print(f"1. Review the files in docs/weeks/")
    print(f"2. Commit and push to GitHub:")
    print(f"   git add docs/weeks/*.json docs/pdfs/*.pdf docs/weeks_index.json")
    print(f"   git commit -m 'Add historical weeks data'")
    print(f"   git push")

if __name__ == "__main__":
    main()
