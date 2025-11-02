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
    # Headless Chrome setup
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")

    driver = webdriver.Chrome(options=options)

    url = current_week_url()
    print(f"[Weekly] Navigating to {url}")
    driver.get(url)

    # Wait until at least one recipe card is present
    try:
        WebDriverWait(driver, 30).until(
            EC.presence_of_all_elements_located(
                (By.CSS_SELECTOR, "div[data-recipe-card]")
            )
        )
    except Exception as e:
        print(f"[Weekly] Warning: wait timed out: {e}")

    soup = BeautifulSoup(driver.page_source, "html.parser")
    driver.quit()

    recipes = []
    seen = set()

    # --- Scope to Meals section only ---
    meals_header = soup.find("h3", string="Meals")
    if not meals_header:
        print("[Weekly] Could not find Meals section header, falling back to all cards")
        cards = soup.select("div[data-recipe-card]")
    else:
        # The parent container that holds the recipe cards
        meals_container = meals_header.find_parent("div", class_="sc-54d3413f-0")
        if not meals_container:
            print("[Weekly] Could not locate Meals container, falling back to all cards")
            cards = soup.select("div[data-recipe-card]")
        else:
            cards = meals_container.select("div[data-recipe-card]")

    for card in cards:
        link_tag = card.select_one("a[href*='/recipes/'][href*='week=']")
        if not link_tag:
            continue
        href = link_tag["href"]
        if not href.startswith("http"):
            href = "https://www.everyplate.com" + href
        if href in seen:
            continue
        seen.add(href)

        title_el = card.select_one("h2[data-recipe-card-title='true']")
        subtitle_el = card.select_one("p[data-recipe-card-headline='true']")
        img_tag = card.select_one("img[data-recipe-card-image='true']")
        pdf_tag = card.select_one("a[title='Download Recipe Card'][href$='.pdf']")

        title = title_el.get_text(strip=True) if title_el else ""
        subtitle = subtitle_el.get_text(strip=True) if subtitle_el else ""
        image = img_tag["src"] if img_tag and img_tag.has_attr("src") else ""
        pdf_url = pdf_tag["href"] if pdf_tag and pdf_tag.has_attr("href") else ""

        recipes.append({
            "url": href,
            "title": title,
            "subtitle": subtitle,
            "image": image,
            "pdf": pdf_url
        })

    print(f"[Weekly] Found {len(recipes)} recipes (Meals only)")
    return recipes

if __name__ == "__main__":
    data = scrape_weekly_menu()
    for r in data[:10]:
        print(f"- {r['title'] or '(no title)'} | {r['url']} | PDF: {r['pdf']}")
    print(f"... total: {len(data)}")
