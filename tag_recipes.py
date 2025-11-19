#!/usr/bin/env python3
"""
Recipe Tagging Script
Analyzes all recipe JSON files and assigns tags for cuisine, protein, meal type, etc.
"""

import json
import os
from pathlib import Path
from collections import defaultdict

# Tag classification rules
CUISINE_KEYWORDS = {
    "Mexican": ["taco", "burrito", "enchilada", "quesadilla", "fajita", "salsa", "tortilla", "chipotle", "poblano", "jalapeño", "cilantro lime", "mexican", "nacho", "guacamole", "queso"],
    "Italian": ["pasta", "spaghetti", "penne", "rigatoni", "linguine", "fettuccine", "lasagna", "ravioli", "tortellini", "agnolotti", "pizza", "marinara", "pesto", "parmesan", "mozzarella", "italian", "risotto", "gnocchi", "caprese", "bruschetta"],
    "Asian": ["stir fry", "fried rice", "lo mein", "ramen", "soy sauce", "sesame", "ginger", "teriyaki", "asian", "wok", "noodle bowl", "pad thai", "pho", "miso", "kimchi", "sriracha", "hoisin"],
    "Chinese": ["orange chicken", "kung pao", "sweet and sour", "szechuan", "cashew chicken", "chow mein", "egg roll", "dumpling", "wonton"],
    "Thai": ["thai", "curry", "coconut", "lemongrass", "basil", "pad thai", "tom yum"],
    "Indian": ["curry", "tikka", "tandoori", "masala", "naan", "indian", "chutney", "samosa", "biryani", "korma", "vindaloo"],
    "Mediterranean": ["greek", "mediterranean", "feta", "olive", "hummus", "tzatziki", "gyro", "pita", "couscous", "tahini", "falafel"],
    "American": ["burger", "bbq", "barbecue", "pulled pork", "brisket", "mac and cheese", "hot dog", "wings", "fried chicken", "meatloaf", "pot roast", "chili"],
    "Southern": ["cajun", "creole", "gumbo", "jambalaya", "po boy", "biscuit", "gravy", "fried", "southern"],
    "French": ["french", "provencal", "bourguignon", "ratatouille", "quiche", "crepe", "croissant"],
    "Latin American": ["latin", "cuban", "peruvian", "brazilian", "empanada", "arepa", "chimichurri"],
}

PROTEIN_KEYWORDS = {
    "Chicken": ["chicken", "poultry"],
    "Beef": ["beef", "steak", "brisket", "sirloin", "ground beef", "meatball"],
    "Pork": ["pork", "bacon", "ham", "sausage", "chorizo", "pulled pork", "pork chop"],
    "Turkey": ["turkey", "ground turkey"],
    "Seafood": ["fish", "salmon", "tuna", "cod", "tilapia", "shrimp", "prawn", "crab", "lobster", "scallop", "seafood", "clam", "mussel"],
    "Vegetarian": ["vegetarian", "veggie", "meatless"],
    "Vegan": ["vegan", "plant-based"],
    "Lamb": ["lamb"],
}

MEAL_TYPE_KEYWORDS = {
    "Lunch": ["lunch", "sandwich", "wrap", "salad bowl"],
    "Breakfast": ["breakfast", "pancake", "waffle", "omelette", "scramble", "french toast", "bagel", "muffin"],
    "Appetizer": ["appetizer", "starter", "dip", "finger food"],
    "Side Dish": ["side", "sides"],
    "Soup": ["soup", "stew", "chowder", "bisque"],
    "Salad": ["salad"],
    "Pasta": ["pasta", "spaghetti", "penne", "linguine", "noodle"],
    "Rice Bowl": ["rice bowl", "bowl"],
    "Sandwich": ["sandwich", "burger", "wrap", "panini", "sub"],
}

PREP_TIME_KEYWORDS = {
    "Quick": ["quick", "easy", "simple", "20 min", "30 min", "one pot", "sheet pan", "skillet"],
    "Medium": [],  # Default if not quick or long
    "Long": ["slow cooker", "crockpot", "braised", "roasted", "baked chicken", "baked fish"],
}

DIETARY_KEYWORDS = {
    "Low-Carb": ["low carb", "keto", "cauliflower rice", "zoodle"],
    "Gluten-Free": ["gluten free", "gluten-free"],
    "Dairy-Free": ["dairy free", "dairy-free"],
    "Spicy": ["spicy", "hot", "jalapeño", "chipotle", "sriracha", "cayenne"],
}

def normalize_text(text):
    """Normalize text for matching (lowercase, strip)"""
    if not text:
        return ""
    return text.lower().strip()

def check_keywords(text, keyword_dict):
    """Check if any keywords match in the text"""
    normalized = normalize_text(text)
    matches = []
    for category, keywords in keyword_dict.items():
        for keyword in keywords:
            if normalize_text(keyword) in normalized:
                matches.append(category)
                break
    return matches

def classify_recipe(meal):
    """Classify a single recipe and return tags"""
    tags = {
        "cuisine": [],
        "protein": [],
        "meal_type": [],
        "prep_time": [],
        "dietary": []
    }
    
    # Combine title and subtitle for better matching
    title = meal.get("title", "")
    subtitle = meal.get("subtitle", "")
    search_text = f"{title} {subtitle}"
    
    # Get ingredient names
    ingredients = meal.get("ingredients", [])
    ingredient_text = " ".join([ing.get("ingredient", "") for ing in ingredients])
    
    # Combine all text
    full_text = f"{search_text} {ingredient_text}"
    
    # Classify cuisine
    tags["cuisine"] = check_keywords(full_text, CUISINE_KEYWORDS)
    
    # Classify protein - but exclude vegetarian/vegan from here as they're dietary
    protein_tags = check_keywords(full_text, PROTEIN_KEYWORDS)
    # Remove dietary classifications from protein tags
    tags["protein"] = [tag for tag in protein_tags if tag not in ["Vegetarian", "Vegan"]]
    
    # Classify meal type
    tags["meal_type"] = check_keywords(full_text, MEAL_TYPE_KEYWORDS)
    
    # Classify prep time
    prep_tags = check_keywords(full_text, PREP_TIME_KEYWORDS)
    if "Quick" in prep_tags:
        tags["prep_time"] = ["Quick"]
    elif "Long" in prep_tags:
        tags["prep_time"] = ["Long"]
    else:
        tags["prep_time"] = ["Medium"]
    
    # Classify dietary - including vegetarian/vegan logic
    dietary_tags = check_keywords(full_text, DIETARY_KEYWORDS)
    
    # Check for vegetarian/vegan based on absence of meat, not just keywords
    meat_keywords = []
    for category in ["Chicken", "Beef", "Pork", "Turkey", "Seafood", "Lamb"]:
        meat_keywords.extend(PROTEIN_KEYWORDS[category])
    
    has_meat = any(normalize_text(keyword) in normalize_text(ingredient_text) for keyword in meat_keywords)
    
    if not has_meat:
        # No meat found in ingredients - can be vegetarian
        dietary_tags.append("Vegetarian")
        # Also check for vegan (no animal products)
        dairy_keywords = ["milk", "cheese", "butter", "cream", "yogurt", "sour cream", "parmesan", "mozzarella", "cheddar", "feta", "gouda"]
        egg_keywords = ["egg", "eggs"]
        has_dairy = any(normalize_text(keyword) in normalize_text(ingredient_text) for keyword in dairy_keywords)
        has_eggs = any(normalize_text(keyword) in normalize_text(ingredient_text) for keyword in egg_keywords)
        if not has_dairy and not has_eggs:
            dietary_tags.append("Vegan")
    
    tags["dietary"] = dietary_tags
    
    # Remove duplicates
    for key in tags:
        tags[key] = list(set(tags[key]))
    
    return tags

def main():
    # Find all week JSON files
    docs_path = Path(__file__).parent / "docs"
    weeks_path = docs_path / "weeks"
    
    if not weeks_path.exists():
        print(f"❌ Weeks directory not found: {weeks_path}")
        return
    
    all_tags = {}
    stats = defaultdict(lambda: defaultdict(int))
    
    week_files = sorted(weeks_path.glob("*.json"))
    print(f"📂 Found {len(week_files)} week files")
    
    for week_file in week_files:
        print(f"\n📄 Processing {week_file.name}...")
        
        try:
            with open(week_file, 'r', encoding='utf-8') as f:
                week_data = json.load(f)
            
            meals = week_data.get("meals", [])
            # Filter to only meals with PDFs (actual recipes)
            meals = [m for m in meals if m.get("pdf") and isinstance(m.get("pdf"), str) and m["pdf"].strip()]
            
            for meal in meals:
                url = meal.get("url", "")
                if not url:
                    continue
                
                # Classify this recipe
                tags = classify_recipe(meal)
                all_tags[url] = tags
                
                # Update stats
                for tag_type, tag_list in tags.items():
                    for tag in tag_list:
                        stats[tag_type][tag] += 1
                
                # Print recipe info
                title = meal.get("title", "Unknown")
                cuisine_str = ", ".join(tags["cuisine"]) if tags["cuisine"] else "None"
                protein_str = ", ".join(tags["protein"]) if tags["protein"] else "None"
                print(f"  ✓ {title[:50]:<50} | Cuisine: {cuisine_str:<20} | Protein: {protein_str}")
        
        except Exception as e:
            print(f"  ❌ Error processing {week_file.name}: {e}")
    
    # Save tags to JSON
    output_file = docs_path / "recipe_tags.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_tags, f, indent=2)
    
    print(f"\n✅ Tags saved to {output_file}")
    print(f"📊 Total recipes tagged: {len(all_tags)}")
    
    # Print statistics
    print("\n📈 Tag Statistics:")
    for tag_type in ["cuisine", "protein", "meal_type", "prep_time", "dietary"]:
        print(f"\n{tag_type.upper()}:")
        for tag, count in sorted(stats[tag_type].items(), key=lambda x: x[1], reverse=True):
            print(f"  {tag}: {count}")

if __name__ == "__main__":
    main()
