#!/usr/bin/env python3
"""
Test ingredient categorization against actual meal data.
Shows how many ingredients match each category and which ones are uncategorized.
"""
import json
import os

def load_categories():
    """Load ingredient categories from JSON file."""
    with open('docs/ingredient_categories.json', 'r') as f:
        return json.load(f)

def normalize(text):
    """Normalize text for matching (lowercase, strip spaces, remove accents)."""
    import unicodedata
    # Remove accents by decomposing and filtering
    text = unicodedata.normalize('NFD', text)
    text = ''.join(char for char in text if unicodedata.category(char) != 'Mn')
    return text.lower().strip()

def categorize_ingredient(ingredient_name, categories, spice_blends):
    """
    Categorize an ingredient by matching against keywords.
    Returns tuple: (category, matched_keyword)
    """
    normalized = normalize(ingredient_name)
    
    # First check if it's a known spice blend
    if ingredient_name in spice_blends:
        return ("spices", ingredient_name)
    
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
    
    # Try to match against each category's keywords
    for cat_key, keywords in categories.items():
        for keyword in keywords:
            if normalize(keyword) in normalized:
                return (category_map.get(cat_key, "Other"), keyword)
    
    return ("Uncategorized", None)

def collect_all_ingredients(weeks_dir='docs/weeks'):
    """Collect all unique ingredients from all weeks."""
    all_ingredients = {}
    
    for filename in sorted(os.listdir(weeks_dir)):
        if filename.endswith('.json'):
            filepath = os.path.join(weeks_dir, filename)
            with open(filepath, 'r') as f:
                data = json.load(f)
                week = filename.replace('.json', '')
                
                for meal in data.get('meals', []):
                    meal_title = meal.get('title', 'Unknown')
                    for ing in meal.get('ingredients', []):
                        ingredient_name = ing.get('ingredient', '')
                        if ingredient_name:
                            if ingredient_name not in all_ingredients:
                                all_ingredients[ingredient_name] = {
                                    'count': 0,
                                    'examples': []
                                }
                            all_ingredients[ingredient_name]['count'] += 1
                            if len(all_ingredients[ingredient_name]['examples']) < 2:
                                all_ingredients[ingredient_name]['examples'].append({
                                    'week': week,
                                    'meal': meal_title
                                })
    
    return all_ingredients

def main():
    print("=" * 80)
    print("INGREDIENT CATEGORIZATION AUDIT")
    print("=" * 80)
    print()
    
    # Load data
    categories = load_categories()
    
    # Load spice blends
    with open('docs/spice_blends.json', 'r') as f:
        spice_blends = json.load(f)
    
    # Collect all ingredients
    all_ingredients = collect_all_ingredients()
    
    print(f"Total unique ingredients found: {len(all_ingredients)}")
    print()
    
    # Categorize all ingredients
    categorized = {}
    for ingredient_name, data in all_ingredients.items():
        category, matched = categorize_ingredient(ingredient_name, categories, spice_blends)
        
        if category not in categorized:
            categorized[category] = []
        
        categorized[category].append({
            'name': ingredient_name,
            'matched': matched,
            'count': data['count'],
            'examples': data['examples']
        })
    
    # Sort categories in shopping order
    category_order = [
        "Produce",
        "Meat", 
        "Dairy",
        "Bakery",
        "Pantry",
        "Condiments",
        "Spices",
        "Uncategorized"
    ]
    
    # Display results by category
    for category in category_order:
        if category not in categorized:
            continue
        
        items = sorted(categorized[category], key=lambda x: x['name'])
        print(f"\n{'='*80}")
        print(f"📦 {category.upper()} ({len(items)} ingredients)")
        print(f"{'='*80}")
        
        for item in items:
            print(f"\n  ✓ {item['name']}")
            if item['matched']:
                print(f"    └─ Matched keyword: '{item['matched']}'")
            print(f"    └─ Used {item['count']} times across all weeks")
            if item['examples']:
                print(f"    └─ Examples:")
                for ex in item['examples']:
                    print(f"       • {ex['week']}: {ex['meal']}")
    
    # Summary statistics
    print(f"\n\n{'='*80}")
    print("SUMMARY STATISTICS")
    print(f"{'='*80}")
    total = len(all_ingredients)
    uncategorized_count = len(categorized.get('Uncategorized', []))
    categorized_count = total - uncategorized_count
    
    print(f"\nTotal ingredients: {total}")
    print(f"Successfully categorized: {categorized_count} ({categorized_count/total*100:.1f}%)")
    print(f"Uncategorized: {uncategorized_count} ({uncategorized_count/total*100:.1f}%)")
    
    print(f"\nBreakdown by category:")
    for category in category_order:
        if category in categorized:
            count = len(categorized[category])
            print(f"  {category:15} {count:3} ingredients ({count/total*100:.1f}%)")
    
    # Show uncategorized items that need attention
    if uncategorized_count > 0:
        print(f"\n\n{'='*80}")
        print("⚠️  UNCATEGORIZED INGREDIENTS THAT NEED ATTENTION")
        print(f"{'='*80}")
        print("\nThese ingredients should be added to ingredient_categories.json:")
        print()
        
        uncategorized = sorted(categorized.get('Uncategorized', []), 
                              key=lambda x: x['count'], 
                              reverse=True)
        
        for item in uncategorized[:20]:  # Show top 20 most common
            print(f"  • {item['name']} (used {item['count']} times)")

if __name__ == "__main__":
    main()
