import json
import re

# Load your saved dictionary
with open("ingredient_categories.json", "r") as f:
    category_map = json.load(f)

# Flatten dictionary into keyword → category lookup
keyword_to_category = {}
for category, items in category_map.items():
    for item in items:
        keyword_to_category[item.lower()] = category

# Input list (your provided test case)
ingredients = """15.75 tablespoon Sour Cream
150 ounce Potatoes
10 unit Onion
66 ounce Carrots
2.75 cup Mozzarella Cheese
5.50 unit Beef Stock Concentrate
65 ounce Chicken Cutlets
2 unit Green Bell Pepper
2 tablespoon Fry Seasoning
18 ounce Ground Beef
1.50 cup Pepper Jack Cheese
1 slice White Bread
2 teaspoon Dijon Mustard
4.50 ounce Lo Mein Noodles
8 tablespoon Sweet Soy Glaze
7 unit Lime
26 clove Garlic
10 ounce Ground Pork
18 unit Scallions
4 ounce Coleslaw Mix
4 thumb Ginger
12 ounce Green Beans
2 unit Apricot Jam
11 unit Soy Sauce
6 tablespoon Sesame Seeds
60 ounce Pork Chops
2.25 cup Jasmine Rice
6 teaspoon Sriracha
10 ounce Bavette Steak
5 unit Tomato
20 unit Flour Tortillas
8 tablespoon Guacamole
1 tablespoon Mexican Spice Blend
0.75 ounce Cilantro
5 tablespoon Cornstarch
30 ounce Chicken Thighs
7 ounce Sweet Thai Chili Sauce
2.25 cup White Rice
7 unit Chicken Stock Concentrate
3 unit Lemon
7 unit Sweet Potato
0.75 ounce Parsley
6 ounce Cavatappi Pasta
16 ounce Peas
16 ounce Cream Sauce Base
6 unit Mushroom Stock Concentrate
8.75 teaspoon Garlic Powder
8 ounce Button Mushrooms
20 ounce Chopped Chicken Breast
3 unit Long Green Pepper
0.50 cup Monterey Jack Cheese
1 unit Tex-Mex Paste
2 cup Panko Breadcrumbs
5 unit Broccoli
20 ounce Ground Chicken
15 teaspoon Rice Wine Vinegar
2 teaspoon Korean Chili Flakes
4 unit Mini Cucumber
4 unit Veggie Stock Concentrate
10 ounce Shrimp
1 tablespoon Sesame Oil
6 ounce Udon Noodles
0.50 ounce Peanuts
24 ounce Brussels Sprouts
1 unit Tofu
2 tablespoon Umami Ginger Sauce
6 teaspoon Honey
1 unit Crispy Fried Onions
2.25 teaspoon Chipotle Powder
1 unit Jalapeño
0.25 ounce Thyme
6 ounce Buttermilk Biscuits
8 tablespoon Cream Cheese
8 tablespoon Pesto
2.67 tablespoon Italian Seasoning
3 unit Parmesan Cheese Block
6 ounce Spaghetti
8 ounce Bacon
4 ounce Shredded Carrots
4 unit Demi-Baguette
3 ounce Honey Dijon Dressing
4 ounce Shredded Red Cabbage
6 ounce Italian Pork Sausage
3 ounce Sweet Thai Heat Sauce
1 cup Cheddar Cheese
1 unit Crushed Tomatoes
4 slice Sourdough Bread
2 unit Zucchini
10 ounce Ranch Steak
0.50 ounce Sliced Almonds
2 unit Potato Buns
2.50 ounce Marinara Sauce
9 ounce Tortelloni""".splitlines()

def normalize(text):
    # remove numbers/units, lowercase
    return re.sub(r"[^a-zA-Z ]", "", text).lower().strip()

grouped = {cat: [] for cat in category_map}
unmatched = []

for item in ingredients:
    norm = normalize(item)
    matched = False
    for keyword, category in keyword_to_category.items():
        if keyword in norm:
            grouped[category].append(item)
            matched = True
            break
    if not matched:
        unmatched.append(item)

# Print results
print("=== Grouped Ingredients ===")
for cat, items in grouped.items():
    if items:
        print(f"\n{cat.upper()}:")
        for i in items:
            print("  -", i)

print("\n=== Unmatched Ingredients ===")
for i in unmatched:
    print("  -", i)

print(f"\nTotal: {len(ingredients)} | Matched: {len(ingredients)-len(unmatched)} | Unmatched: {len(unmatched)}")
