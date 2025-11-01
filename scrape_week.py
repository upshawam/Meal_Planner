import json, datetime
from weekly_menu_scraper import scrape_weekly_menu
from recipe_scraper import scrape_ingredients

def scrape_week():
    meals = scrape_weekly_menu()
    for meal in meals:
        print(f"Scraping: {meal['title']}")
        meal["ingredients"] = scrape_ingredients(meal["url"])
    return meals

if __name__ == "__main__":
    data = {
        "week": datetime.date.today().isocalendar()[1],
        "meals": scrape_week()
    }
    with open("docs/week.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("✅ Saved docs/week.json")

