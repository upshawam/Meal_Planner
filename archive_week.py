#!/usr/bin/env python3
"""
Archive the current week's data and update the weeks index.
This should run after scraping and PDF enrichment is complete.
"""
import json
import shutil
import time
from pathlib import Path
from datetime import datetime

def archive_current_week():
    """Copy week.json to the weeks archive and update index"""
    
    # Load current week data
    week_json = Path("docs/week.json")
    if not week_json.exists():
        print("❌ Error: docs/week.json not found")
        return False
    
    with open(week_json, 'r', encoding='utf-8') as f:
        week_data = json.load(f)
    
    week_num = week_data.get('week')
    year = week_data.get('year')
    
    if not week_num or not year:
        print("❌ Error: week.json missing week or year field")
        return False
    
    # Create weeks directory if needed
    weeks_dir = Path("docs/weeks")
    weeks_dir.mkdir(exist_ok=True)
    
    # Archive file path
    archive_path = weeks_dir / f"{year}-W{str(week_num).zfill(2)}.json"
    
    # Copy to archive
    shutil.copy2(week_json, archive_path)
    print(f"✅ Archived week {week_num} to {archive_path}")
    
    # Update weeks index
    index_path = Path("docs/weeks_index.json")
    
    # Load existing index or create new
    if index_path.exists():
        with open(index_path, 'r', encoding='utf-8') as f:
            index = json.load(f)
    else:
        index = []
    
    # Check if this week already exists in index
    week_entry = {
        "year": year,
        "week": week_num,
        "path": f"weeks/{year}-W{str(week_num).zfill(2)}.json",
        "archived_at": int(time.time())
    }
    
    # Remove existing entry for this week if it exists
    index = [entry for entry in index if not (entry.get('year') == year and entry.get('week') == week_num)]
    
    # Add new entry
    index.append(week_entry)
    
    # Sort by year and week (newest first)
    index.sort(key=lambda x: (x.get('year', 0), x.get('week', 0)), reverse=True)
    
    # Save index
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=2)
    
    print(f"✅ Updated weeks_index.json (now contains {len(index)} weeks)")
    return True

if __name__ == "__main__":
    import sys
    success = archive_current_week()
    sys.exit(0 if success else 1)
