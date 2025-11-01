from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import datetime

def current_week_url():
    """Build the URL for the current ISO week."""
    today = datetime.date.today()
    year, week, _ = today.isocalendar()
    return f"https://www.everyplate.com/weekly-menu/{year}-W{week:02d}"

def scrape_weekly_menu():
    # Headless Chrome setup (Selenium Manager will handle the driver)
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")

    driver = webdriver.Chrome(options=options)

    url = current_week_url()
    print(f"[Weekly] Navigating to {url}")
    driver.get(url)

    # Wait until main recipe cards are present (exclude add-ons)
    try:
        WebDriverWait(driver, 25).until(
            EC.presence_of_all_elements_located(
                (By.CSS_SELECTOR, "div[data-test-id='recipe-card']")
            )
        )
    except Exception as e:
        print(f"[Weekly] Warning: explicit wait timed out: {e}")

    soup = BeautifulSoup(driver.page_source, "html.parser")
    driver.quit()

    recipes = []
    seen = set()

    # ✅ Only select main recipe cards; skip add-ons
    cards = soup.select("div[data-test-id='recipe-card'] a[href*='/recipes/']")
    for card in cards:
        href = card.get("href")
        if not href:
            continue
        if not href.startswith("http"):
            href = "https://www.everyplate.com" + href
        if href in seen:
            continue
        seen.add(href)

        # Title/subtitle: prefer data-test-id attributes, fallback to h3/p
        title = ""
        subtitle = ""

        title_el = card.select_one("[data-test-id='recipe-title']")
        if title_el:
            title = title_el.get_text(strip=True)
        else:
            h3 = card.find("h3")
            if h3:
                title = h3.get_text(strip=True)

        subtitle_el = card.select_one("[data-test-id='recipe-subtitle']")
        if subtitle_el:
            subtitle = subtitle_el.get_text(strip=True)
        else:
            p = card.find("p")
            if p:
                subtitle = p.get_text(strip=True)

        # Image: prefer data-src, fallback to src
        image = ""
        img_tag = card.find("img")
        if img_tag:
            if img_tag.has_attr("data-src"):
                image = img_tag["data-src"]
            elif img_tag.has_attr("src"):
                image = img_tag["src"]

        recipes.append({
            "url": href,
            "title": title,
            "subtitle": subtitle,
            "image": image
        })

    print(f"[Weekly] Found {len(recipes)} recipes (excluding add-ons)")
    return recipes

if __name__ == "__main__":
    data = scrape_weekly_menu()
    for r in data[:10]:
        print(f"- {r['title'] or '(no title)'} | {r['url']}")
    print(f"... total: {len(data)}")
