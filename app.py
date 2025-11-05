from flask import Flask, render_template, request
from weekly_menu_scraper import scrape_weekly_menu
from recipe_scraper import scrape_ingredients
from aggregator import aggregate_ingredients
import os
import json

app = Flask(__name__)

def load_archive_by_path(relpath):
    # relpath expected like "weeks/2025-W44.json" relative to docs/
    path = os.path.join("docs", relpath)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("meals", [])
    except Exception:
        return None

def load_archive_by_year_week(year, week):
    name = f"{int(year)}-W{int(week):02d}.json"
    relpath = os.path.join("weeks", name)
    return load_archive_by_path(relpath)

@app.route("/", methods=["GET", "POST"])
def index():
    # If archive query param provided, attempt to load local archived week
    archive_param = request.args.get("archive")
    year = request.args.get("year")
    week = request.args.get("week")

    if archive_param:
        meals = load_archive_by_path(archive_param) or []
    elif year and week:
        meals = load_archive_by_year_week(year, week) or []
    else:
        # Default: load weekly menu (live scrape)
        meals = scrape_weekly_menu()

    selected_meals = []
    grocery_list = []

    if request.method == "POST":
        selected_urls = request.form.getlist("meals")

        # Scrape and scale only the selected meals
        all_ingredients = []
        for url in selected_urls:
            portion = int(request.form.get(f"portion_{url}", 2))  # default base 2
            ingredients = scrape_ingredients(url)

            # Scale quantities relative to base 2 servings
            for ing in ingredients:
                if ing.get("quantity") is not None:
                    ing["quantity"] = ing["quantity"] * (portion / 2.0)
            all_ingredients.extend(ingredients)

        # Aggregate duplicates and format quantities for display
        grocery_list = aggregate_ingredients(all_ingredients)

        # Show only selected meals in "My Week"
        selected_meals = [m for m in meals if m["url"] in selected_urls]
        meals = selected_meals

    return render_template(
        "index.html",
        meals=meals,
        grocery_list=grocery_list,
        selected_meals=selected_meals
    )

if __name__ == "__main__":
