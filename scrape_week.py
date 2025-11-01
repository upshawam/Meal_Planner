import json
import datetime
from weekly_menu_scraper import scrape_weekly_menu
from recipe_scraper import scrape_ingredients

def scrape_week():
    meals = scrape_weekly_menu()
    for meal in meals:
        print(f"[Week] Scraping ingredients for: {meal['title']}")
        try:
            meal["ingredients"] = scrape_ingredients(meal["url"])
        except Exception as e:
            print(f"[Week] Error scraping {meal['url']}: {e}")
            meal["ingredients"] = []
    return meals

if __name__ == "__main__":
    data = {
        "week": datetime.date.today().isocalendar()[1],
        "year": datetime.date.today().year,
        "meals": scrape_week()
    }

    out_path = "docs/week.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"✅ Saved {out_path} with {len(data['meals'])} meals")
