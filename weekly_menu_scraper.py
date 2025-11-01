from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import datetime

def current_week_url():
    # Build URL like https://www.everyplate.com/weekly-menu/2025-W45
    today = datetime.date.today()
    year, week, _ = today.isocalendar()
    return f"https://www.everyplate.com/weekly-menu/{year}-W{week:02d}"

def scrape_weekly_menu():
    # Chrome setup for CI (GitHub Actions)
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    service = Service("/usr/local/bin/chromedriver")
    driver = webdriver.Chrome(service=service, options=options)

    url = current_week_url()
    print(f"[Weekly] Navigating to {url}")
    driver.get(url)

    # Wait until recipe links show up (more robust than a fixed sleep)
    try:
        WebDriverWait(driver, 20).until(
            EC.presence_of_all_elements_located(
                (By.CSS_SELECTOR, "a[href*='/recipes/'][href*='week=']")
            )
        )
    except Exception as e:
        print(f"[Weekly] Warning: explicit wait timed out: {e}")

    soup = BeautifulSoup(driver.page_source, "html.parser")
    driver.quit()

    recipes = []
    cards = soup.select("a[href*='/recipes/'][href*='week=']")
    seen = set()
    for card in cards:
        href = card.get("href")
        if not href:
            continue
        if not href.startswith("http"):
            href = "https://www.everyplate.com" + href
        if href in seen:
            continue
        seen.add(href)

        title = card.find("h3").get_text(strip=True) if card.find("h3") else ""
        subtitle = card.find("p").get_text(strip=True) if card.find("p") else ""
        img_tag = card.find("img")
        image = img_tag["src"] if img_tag and img_tag.has_attr("src") else ""

        recipes.append({
            "url": href,
            "title": title,
            "subtitle": subtitle,
            "image": image
        })

    print(f"[Weekly] Found {len(recipes)} recipes")
    return recipes

if __name__ == "__main__":
    data = scrape_weekly_menu()
    for r in data[:5]:
        print(r["title"], r["url"])
    print(f"... total: {len(data)}")
