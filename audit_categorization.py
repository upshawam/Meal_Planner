#!/usr/bin/env python3
"""
Audit ingredient categorization and generate a report.
Run automatically by GitHub Actions after weekly scraping.
Creates docs/uncategorized_ingredients.json with items needing review.
"""
import json
import os
from datetime import datetime
import unicodedata

def normalize(text):
    """Normalize text for matching (lowercase, strip accents)."""
    if not text:
        return ""
    text = unicodedata.normalize('NFD', text)
    text = ''.join(char for char in text if unicodedata.category(char) != 'Mn')
    return text.lower().strip()

def load_categories():
    """Load ingredient categories from JSON file."""
    with open('docs/ingredient_categories.json', 'r') as f:
        return json.load(f)

def load_spice_blends():
    """Load spice blends from JSON file."""
    try:
        with open('docs/spice_blends.json', 'r') as f:
            return json.load(f)
    except:
        return {}

def categorize_ingredient(ingredient_name, categories, spice_blends):
    """
    Categorize an ingredient using the same logic as app.js.
    Returns tuple: (category, matched_keyword)
    """
    normalized = normalize(ingredient_name)
    
    # Check if it's a known spice blend first
    if ingredient_name in spice_blends:
        return ("Spices", ingredient_name)
    
    # Map category keys to display names
    category_map = {
        "produce": "Produce",
        "meat": "Meat", 
        "dairy": "Dairy",
        "bakery": "Bakery",
        "dry_goods": "Pantry",
        "condiments": "Condiments",
        "spices": "Spices",
        "packaged": "Pantry",
        "snacks": "Pantry"
    }
    
    # Priority order (matches app.js)
    category_priority = [
        "spices",
        "bakery",
        "dry_goods",
        "condiments",
        "dairy",
        "meat",
        "packaged",
        "produce",
        "snacks"
    ]
    
    # Try to match in priority order
    for cat_key in category_priority:
        keywords = categories.get(cat_key, [])
        for keyword in keywords:
            if normalize(keyword) in normalized:
                return (category_map.get(cat_key, "Other"), keyword)
    
    return ("Uncategorized", None)

def collect_all_ingredients(weeks_dir='docs/weeks'):
    """Collect all unique ingredients from all weeks."""
    all_ingredients = {}
    
    if not os.path.exists(weeks_dir):
        print(f"Warning: {weeks_dir} does not exist")
        return all_ingredients
    
    for filename in sorted(os.listdir(weeks_dir)):
        if filename.endswith('.json'):
            filepath = os.path.join(weeks_dir, filename)
            with open(filepath, 'r') as f:
                data = json.load(f)
                week = filename.replace('.json', '')
                
                for meal in data.get('meals', []):
                    for ing in meal.get('ingredients', []):
                        ingredient_name = ing.get('ingredient', '')
                        if ingredient_name:
                            if ingredient_name not in all_ingredients:
                                all_ingredients[ingredient_name] = {
                                    'count': 0,
                                    'weeks': set()
                                }
                            all_ingredients[ingredient_name]['count'] += 1
                            all_ingredients[ingredient_name]['weeks'].add(week)
    
    return all_ingredients

def main():
    print("Running ingredient categorization audit...")
    
    # Load data
    categories = load_categories()
    spice_blends = load_spice_blends()
    all_ingredients = collect_all_ingredients()
    
    if not all_ingredients:
        print("No ingredients found. Skipping audit.")
        return
    
    print(f"Found {len(all_ingredients)} unique ingredients")
    
    # Categorize all ingredients
    uncategorized = []
    
    for ingredient_name, data in all_ingredients.items():
        category, matched = categorize_ingredient(ingredient_name, categories, spice_blends)
        
        if category == "Uncategorized":
            uncategorized.append({
                'ingredient': ingredient_name,
                'count': data['count'],
                'weeks': sorted(list(data['weeks']))
            })
    
    # Sort by frequency (most common first)
    uncategorized.sort(key=lambda x: x['count'], reverse=True)
    
    # Generate report with instructions
    report = {
        "_README": "This file tracks ingredients that don't match any category. To fix: open docs/ingredient_categories.json and add the ingredient name (or a keyword from it) to the appropriate category array.",
        "_INSTRUCTIONS": {
            "step_1": "Review the 'items' list below - these ingredients show up in 'Other' category on your site",
            "step_2": "Open docs/ingredient_categories.json in your editor",
            "step_3": "For each ingredient, add a relevant keyword to the appropriate category (produce, meat, dairy, bakery, dry_goods, condiments, or spices)",
            "step_4": "Example: For 'Sweet Chili Lime Sauce', add 'chili lime sauce' to the 'condiments' array",
            "step_5": "Commit the changes to ingredient_categories.json - this report will auto-update next week"
        },
        "last_updated": datetime.now().strftime("%Y-%m-%d"),
        "total_ingredients": len(all_ingredients),
        "total_uncategorized": len(uncategorized),
        "uncategorized_percentage": round(len(uncategorized) / len(all_ingredients) * 100, 1) if all_ingredients else 0,
        "items": uncategorized[:50]  # Top 50 most common
    }
    
    # Write report
    report_path = 'docs/uncategorized_ingredients.json'
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    # Print summary
    print(f"\n✓ Audit complete!")
    print(f"  Total ingredients: {len(all_ingredients)}")
    print(f"  Uncategorized: {len(uncategorized)} ({report['uncategorized_percentage']}%)")
    print(f"  Report saved to: {report_path}")
    
    if uncategorized:
        print(f"\n  Top 5 uncategorized ingredients:")
        for item in uncategorized[:5]:
            print(f"    • {item['ingredient']} (used {item['count']} times)")
        print(f"\n  → See {report_path} for full list and instructions")
    else:
        print("\n  🎉 All ingredients categorized!")

if __name__ == "__main__":
    main()
