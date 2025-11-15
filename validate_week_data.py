#!/usr/bin/env python3
"""
Validate week data to ensure all recipes have PDFs.
Exit with error code if any recipes are missing PDFs.
"""
import json
import sys
from pathlib import Path

def validate_week_file(file_path):
    """Check a single week file for missing PDFs"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        week_num = data.get('week', 'unknown')
        year = data.get('year', 'unknown')
        meals = data.get('meals', [])
        
        # Filter out recipes with less than 3 ingredients (add-ons)
        real_recipes = [m for m in meals if len(m.get('ingredients', [])) >= 3]
        
        missing_pdfs = [m for m in real_recipes if not m.get('pdf') or m.get('pdf') == '']
        
        if missing_pdfs:
            print(f"❌ VALIDATION FAILED: {file_path.name}")
            print(f"   Week {week_num}, {year}")
            print(f"   {len(missing_pdfs)} recipe(s) missing PDFs:")
            for meal in missing_pdfs:
                print(f"      - {meal.get('title', 'Unknown')}")
            return False
        else:
            print(f"✅ {file_path.name}: All {len(real_recipes)} recipes have PDFs")
            return True
    
    except Exception as e:
        print(f"❌ ERROR reading {file_path}: {e}")
        return False

def main():
    """Validate all week files"""
    print("Validating week data files...\n")
    
    all_valid = True
    
    # Check week.json (current week)
    week_json = Path("docs/week.json")
    if week_json.exists():
        if not validate_week_file(week_json):
            all_valid = False
    
    # Check all archived weeks
    weeks_dir = Path("docs/weeks")
    if weeks_dir.exists():
        week_files = sorted(weeks_dir.glob("*.json"))
        for file_path in week_files:
            if not validate_week_file(file_path):
                all_valid = False
    
    print()
    if all_valid:
        print("✅ All validations passed!")
        sys.exit(0)
    else:
        print("❌ Validation failed - some recipes are missing PDFs")
        sys.exit(1)

if __name__ == "__main__":
    main()
