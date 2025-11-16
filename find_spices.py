import json
import os

spice_keywords = ['spice', 'seasoning', 'blend', 'heat']
found_spices = set()

weeks_dir = 'docs/weeks'
for filename in os.listdir(weeks_dir):
    if filename.endswith('.json'):
        filepath = os.path.join(weeks_dir, filename)
        with open(filepath, 'r') as f:
            data = json.load(f)
            for meal in data.get('meals', []):
                for ing in meal.get('ingredients', []):
                    ingredient = ing.get('ingredient', '')
                    if any(keyword in ingredient.lower() for keyword in spice_keywords):
                        found_spices.add(ingredient)

print("All spice/seasoning/blend ingredients found:")
for spice in sorted(found_spices):
    print(f"  - {spice}")
