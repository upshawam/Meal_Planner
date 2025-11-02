from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import datetime
import time

def current_week_url():
    """Build the URL for the current ISO week."""
    today = datetime.date.today()
    year, week, _ = today.isocalendar()
    return f"https://www.everyplate.com/weekly-menu/{year}-W{week:02d}"

def _make_driver():
    options = Options()
    # Use the older widely-compatible flag if the environment doesn't support the new flag.
    # CI images sometimes need the classic --headless
    try:
        options.add_argument("--headless=new")
    except Exception:
        pass
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    # reduce bot detection surface
    options.add_argument("start-maximized")
    options.add_argument("disable-infobars")
    options.add_argument("--disable-extensions")
    # set a common user-agent to avoid naive headless detection
    options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
    )
    driver = webdriver.Chrome(options=options)
    return driver

def scrape_weekly_menu():
    driver = _make_driver()
    url = current_week_url()
    print(f"[Weekly] Navigating to {url}")
    driver.get(url)

    # Wait for a likely indicator that the page finished basic render.
    # We can't rely on a single attribute name; wait for body to be non-empty then a short sleep.
    try:
        WebDriverWait(driver, 20).until(lambda d: d.execute_script("return document.readyState") == "complete")
    except Exception as e:
        print(f"[Weekly] Warning: document.readyState wait timed out: {e}")

    # Give time for client-side rendering / lazy-load; also scroll to trigger lazy load
    try:
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(1.5)
    except Exception:
        pass

    # Best-effort try to wait until at least one recipe link is in the DOM
    try:
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "a[href*='/recipes/']"))
        )
    except Exception as e:
        print(f"[Weekly] Warning: recipe link wait timed out: {e}")

    soup = BeautifulSoup(driver.page_source, "html.parser")
    driver.quit()

    recipes = []
    seen = set()

    # --- Find the Meals header flexibly (case-insensitive substring) ---
    meals_header = None
    for h3 in soup.find_all("h3"):
        if h3.string and "meals" in h3.string.strip().lower():
            meals_header = h3
            break

    # If we find header, walk up to find a parent that contains recipe cards.
    cards = []
    if meals_header:
        parent = meals_header
        for _ in range(6):
            parent = parent.find_parent()
            if not parent:
                break
            candidate_cards = parent.select("div[data-recipe-card], a[href*='/recipes/']")
            if candidate_cards:
                # prefer div cards but accept anchors if that's how the page renders
                cards = parent.select("div[data-recipe-card]") or parent.select("a[href*='/recipes/']")
                break

    if not cards:
        print("[Weekly] Could not find Meals container or it had no cards, falling back to whole page search")
        # Look for divs with data-recipe-card OR anchors that look like recipe links
        cards = soup.select("div[data-recipe-card]") or soup.select("a[href*='/recipes/']")

    # Normalize: if we found anchors as "cards", wrap them as soup elements to process similarly
    for card in cards:
        # card might be an <a> element or a container with children
        if card.name == "a" and card.has_attr("href"):
            href = card["href"]
            if not href.startswith("http"):
                href = "https://www.everyplate.com" + href
            if href in seen:
                continue
            seen.add(href)
            title = card.get_text(strip=True) or ""
            recipes.append({"url": href, "title": title, "subtitle": "", "image": "", "pdf": ""})
            continue

        # Otherwise it's a container (div) with internal anchors/images
        link_tag = card.select_one("a[href*='/recipes/']")
        if not link_tag or not link_tag.has_attr("href"):
            # fallback: maybe the parent container itself is clickable via data-url attribute
            if card.has_attr("data-url"):
                href = card["data-url"]
            else:
                continue
        else:
            href = link_tag["href"]

        if not href.startswith("http"):
            href = "https://www.everyplate.com" + href
        if href in seen:
            continue
        seen.add(href)

        # Try a few title selectors so we don't break if data-* attrs are removed
        title_el = card.select_one("h2[data-recipe-card-title='true']") or card.select_one("h2") or link_tag
        subtitle_el = card.select_one("p[data-recipe-card-headline='true']") or card.select_one("p")
        img_tag = card.select_one("img[data-recipe-card-image='true']") or card.select_one("img")
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
