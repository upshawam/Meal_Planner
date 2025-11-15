import json
import os
from pathlib import Path

def check_missing_pdfs():
    """Check all week JSON files for recipes missing PDFs"""
    
    weeks_dir = Path("docs/weeks")
    week_json = Path("docs/week.json")
    
    all_files = []
    if weeks_dir.exists():
        all_files.extend(list(weeks_dir.glob("*.json")))
    if week_json.exists():
        all_files.append(week_json)
    
    for file_path in sorted(all_files):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            week_num = data.get('week', 'unknown')
            year = data.get('year', 'unknown')
            meals = data.get('meals', [])
            
            missing_pdfs = [m for m in meals if not m.get('pdf')]
            
            if missing_pdfs:
                print(f"\n{file_path.name} (Week {week_num}, {year}):")
                print(f"  Total recipes: {len(meals)}")
                print(f"  Missing PDFs: {len(missing_pdfs)}")
                for meal in missing_pdfs:
                    print(f"    - {meal.get('title', 'Unknown')}")
        
        except Exception as e:
            print(f"Error reading {file_path}: {e}")

if __name__ == "__main__":
    check_missing_pdfs()
