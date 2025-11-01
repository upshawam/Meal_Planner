from flask import Flask, render_template, request
from weekly_menu_scraper import scrape_weekly_menu
from recipe_scraper import scrape_ingredients
from aggregator import aggregate_ingredients

app = Flask(__name__)

@app.route("/", methods=["GET", "POST"])
def index():
    # Load weekly menu cards (title, subtitle, image, recipe URL)
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
    app.run(debug=True)

