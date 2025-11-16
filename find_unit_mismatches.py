#!/usr/bin/env python3
"""
Script to find ingredient name mismatches between week data and unit conversion table.
Identifies ingredients with "unit" measurement that don't have conversions.
"""
import json
import os
from pathlib import Path
from collections import defaultdict

# Unit conversion table from app.js
UNIT_CONVERSIONS = {
    "apricot jam spread": {"quantity": 1, "unit": "oz"},
    "arborio rice": {"quantity": 5.75, "unit": "oz"},
    "baby lettuce": {"quantity": 5.75, "unit": "oz"},
    "balsamic vinegar": {"quantity": 25, "unit": "mL"},
    "basmati rice": {"quantity": 0.5, "unit": "cup"},
    "beef stock concentrate": {"quantity": 0.42, "unit": "oz"},
    "black beans": {"quantity": 15.5, "unit": "oz"},
    "buttermilk ranch dressing": {"quantity": 1.5, "unit": "oz"},
    "button mushrooms": {"quantity": 4, "unit": "oz"},
    "cavatappi pasta": {"quantity": 6, "unit": "oz"},
    "cherry jam": {"quantity": 1, "unit": "oz"},
    "chicken demi-glace": {"quantity": 1.32, "unit": "oz"},
    "chicken stock concentrate": {"quantity": 0.34, "unit": "oz"},
    "chickpeas": {"quantity": 13.4, "unit": "oz"},
    "ciabatta": {"quantity": 4, "unit": "x 4 inches"},
    "cilantro": {"quantity": 0.4, "unit": "oz"},
    "coconut milk": {"quantity": 6.09, "unit": "fl oz"},
    "coleslaw": {"quantity": 3, "unit": "TBSP"},
    "corn": {"quantity": 15.25, "unit": "oz"},
    "corn starch": {"quantity": 1, "unit": "TBSP"},
    "cranberries": {"quantity": 1, "unit": "oz"},
    "cream cheese": {"quantity": 2, "unit": "TBSP"},
    "cream sauce base": {"quantity": 4, "unit": "oz"},
    "crispy fried onions": {"quantity": 1, "unit": "oz"},
    "curry powder": {"quantity": 1, "unit": "TBSP"},
    "dijon honey mustard dressing": {"quantity": 1.5, "unit": "oz"},
    "dijon mustard": {"quantity": 0.25, "unit": "oz"},
    "dried thyme": {"quantity": 1, "unit": "tsp"},
    "farro": {"quantity": 0.75, "unit": "cup"},
    "flour tortillas": {"quantity": 6, "unit": "(6\")"},
    "frank's hot sauce": {"quantity": 0.25, "unit": "oz"},
    "frank's seasoning blend": {"quantity": 0.25, "unit": "oz"},
    "fry seasoning": {"quantity": 0.25, "unit": "oz"},
    "garlic powder": {"quantity": 1, "unit": "tsp"},
    "ginger": {"quantity": 0.5, "unit": "oz"},
    "green beans": {"quantity": 6, "unit": "oz"},
    "hoisin sauce": {"quantity": 1, "unit": "fl oz"},
    "honey": {"quantity": 0.5, "unit": "oz"},
    "israeli couscous": {"quantity": 0.5, "unit": "cup"},
    "italian seasoning": {"quantity": 1, "unit": "TBSP"},
    "jasmine rice": {"quantity": 0.75, "unit": "cup"},
    "linguine pasta": {"quantity": 6, "unit": "oz"},
    "marinara sauce": {"quantity": 2.5, "unit": "oz"},
    "oregano": {"quantity": 1, "unit": "tsp"},
    "orzo": {"quantity": 6, "unit": "oz"},
    "panko breadcrumbs": {"quantity": 0.5, "unit": "cup"},
    "paprika": {"quantity": 1, "unit": "tsp"},
    "parsley": {"quantity": 0.25, "unit": "oz"},
    "peanuts": {"quantity": 1, "unit": "oz"},
    "ponzu sauce": {"quantity": 2, "unit": "tsp"},
    "reduced fat milk": {"quantity": 8, "unit": "oz"},
    "scallions": {"quantity": 2, "unit": ""},
    "shredded cheddar": {"quantity": 2, "unit": "oz"},
    "shredded monterey jack": {"quantity": 1, "unit": "oz"},
    "shredded mozzarella": {"quantity": 2, "unit": "oz"},
    "shredded parmesan": {"quantity": 0.75, "unit": "oz"},
    "shredded pepper jack": {"quantity": 2, "unit": "oz"},
    "smoked paprika": {"quantity": 1, "unit": "tsp"},
    "smoky red pepper crema": {"quantity": 2, "unit": "TBSP"},
    "sour cream": {"quantity": 1, "unit": "oz"},
    "southwest spice blend": {"quantity": 1, "unit": "TBSP"},
    "soy sauce": {"quantity": 0.34, "unit": "oz"},
    "spinach": {"quantity": 5, "unit": "oz"},
    "sugar snap peas": {"quantity": 4, "unit": "oz"},
    "sweet thai chili sauce": {"quantity": 2, "unit": "TBSP"},
    "tex-mex paste": {"quantity": 1, "unit": "oz"},
    "tomato paste": {"quantity": 1.5, "unit": "oz"},
    "turkish spice blend": {"quantity": 1, "unit": "TBSP"},
    "tuscan heat spice": {"quantity": 1, "unit": "TBSP"},
    "veggie stock concentrate": {"quantity": 0.34, "unit": "oz"},
    "wasabi": {"quantity": 0.15, "unit": "oz"},
    "white rice": {"quantity": 0.75, "unit": "cup"},
    "white wine vinegar": {"quantity": 25, "unit": "mL"},
    "yogurt": {"quantity": 1, "unit": "oz"}
}

def find_unit_ingredients():
    """Find all ingredients with 'unit' measurement across all weeks."""
    docs_dir = Path(__file__).parent / "docs"
    weeks_dir = docs_dir / "weeks"
    
    unit_ingredients = defaultdict(int)  # ingredient_name -> count
    
    # Check all week files
    if weeks_dir.exists():
        for week_file in sorted(weeks_dir.glob("*.json")):
            try:
                with open(week_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    
                for meal in data.get("meals", []):
                    for ing in meal.get("ingredients", []):
                        unit = ing.get("unit", "").strip().lower()
                        ingredient = ing.get("ingredient", "").strip()
                        
                        if unit == "unit" and ingredient:
                            unit_ingredients[ingredient] += 1
                            
            except Exception as e:
                print(f"Error reading {week_file.name}: {e}")
    
    return unit_ingredients

def main():
    print("=" * 80)
    print("INGREDIENT UNIT MISMATCH ANALYSIS")
    print("=" * 80)
    print()
    
    unit_ingredients = find_unit_ingredients()
    
    if not unit_ingredients:
        print("No ingredients with 'unit' measurement found.")
        return
    
    print(f"Found {len(unit_ingredients)} unique ingredients with 'unit' measurement:\n")
    
    missing_conversions = []
    has_conversions = []
    
    for ingredient, count in sorted(unit_ingredients.items(), key=lambda x: x[1], reverse=True):
        ingredient_key = ingredient.lower()
        
        if ingredient_key in UNIT_CONVERSIONS:
            has_conversions.append((ingredient, count))
        else:
            missing_conversions.append((ingredient, count))
    
    # Print ingredients WITH conversions
    if has_conversions:
        print("✓ Ingredients WITH conversions:")
        print("-" * 80)
        for ingredient, count in has_conversions:
            conversion = UNIT_CONVERSIONS[ingredient.lower()]
            print(f"  {ingredient:<45} (used {count}x) → {conversion['quantity']} {conversion['unit']}")
        print()
    
    # Print ingredients MISSING conversions
    if missing_conversions:
        print("✗ Ingredients MISSING conversions:")
        print("-" * 80)
        for ingredient, count in missing_conversions:
            ingredient_lower = ingredient.lower()
            
            # Try to find similar names in conversion table
            similar = []
            for key in UNIT_CONVERSIONS.keys():
                if key in ingredient_lower or ingredient_lower in key:
                    similar.append(key)
            
            print(f"  {ingredient:<45} (used {count}x)")
            if similar:
                print(f"    → Possible matches: {', '.join(similar)}")
        print()
        
        print(f"\nTotal: {len(missing_conversions)} ingredients need conversions added")
        print("\nSuggested additions for app.js:")
        print("-" * 80)
        for ingredient, _ in missing_conversions:
            safe_key = ingredient.lower()
            print(f'    "{safe_key}": {{ quantity: 1, unit: "unit" }},  // TODO: Add proper conversion')
    
    print("\n" + "=" * 80)
    print(f"Summary: {len(has_conversions)} matched, {len(missing_conversions)} missing")
    print("=" * 80)

if __name__ == "__main__":
    main()
