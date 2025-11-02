from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import datetime
import time
import re

def current_week_url():
    """Build the URL for the current ISO week."""
    today = datetime.date.today()
    year, week, _ = today.isocalendar()
    return f"https://www.everyplate.com/weekly-menu/{year}-W{week:02d}"

def _make_driver():
    options = Options()
    # Try modern headless flag but ensure fallback to classic for older environments
    try:
        options.add_argument("--headless=new")
    except Exception:
        pass
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("start-maximized")
    options.add_argument("disable-infobars")
    options.add_argument("--disable-extensions")
    # Set a common UA to reduce naive headless detection
    options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
    )
    driver = webdriver.Chrome(options=options)
    return driver

def is_addon_candidate(href: str, visible_text: str, card_soup):
    """
    Heuristic function to decide whether a candidate card is an add-on (non-recipe).
    Returns True if it looks like an add-on and should be excluded.
    """
    if not href and not visible_text:
        return True

    href_l = (href or "").lower()
    text_l = (visible_text or "").lower()

    # Common keyword patterns for add-ons / sides / extras
    addon_patterns = [
        r"addon", r"add-?on", r"add-?ons", r"\bside(s)?\b", r"\bextra(s)?\b",
        r"/sides", r"/extras", r"/products/", r"/shop/", r"/store/"
    ]
    for p in addon_patterns:
        if re.search(p, href_l) or re.search(p, text_l):
            return True

    # If the element contains only a price and no title, consider it an add-on/product.
    # Price-like patterns: $4.99, 4.99, £, €
    text_only = text_l.strip()
    if text_only and re.fullmatch(r"[\$\£\€]?\s*\d+(\.\d{1,2})?", text_only):
        return True

    # If there is no recipe title and no PDF link, it's likely an add-on.
    has_recipe_title = bool(card_soup.select_one("h2[data-recipe-card-title='true']") or card_soup.select_one("h2"))
    has_pdf = bool(card_soup.select_one("a[title='Download Recipe Card'][href$='.pdf']"))
    if not has_recipe_title and not has_pdf:
        # Some add-ons will still have titles (e.g., "Premium Steak") so this is heuristic.
        # We'll still treat absence of both as a strong signal of non-recipe.
        return True

    return False

def scrape_weekly_menu():
    driver = _make_driver()
    url = current_week_url()
    print(f"[Weekly] Navigating to {url}")
    driver.get(url)

    # Wait for document.readyState or a recipe anchor to appear
    try:
        WebDriverWait(driver, 20).until(lambda d: d.execute_script("return document.readyState") == "complete")
    except Exception as e:
        print(f"[Weekly] Warning: document.readyState wait timed out: {e}")

    # Try to trigger lazy-loading
    try:
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(1.5)
    except Exception:
        pass

    try:
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "a[href*='/recipes/'], div[data-recipe-card]"))
        )
    except Exception as e:
        print(f"[Weekly] Warning: recipe element wait timed out: {e}")

    soup = BeautifulSoup(driver.page_source, "html.parser")
    driver.quit()

    recipes = []
    seen = set()

    # --- Find flexible "Meals" header ---
    meals_header = None
    for h3 in soup.find_all("h3"):
        if h3.string and "meals" in h3.string.strip().lower():
            meals_header = h3
            break

    cards = []
    if meals_header:
        # Walk up a few levels to find a parent that actually contains recipe candidates
        parent = meals_header
        for _ in range(6):
            parent = parent.find_parent()
            if not parent:
                break
            candidate_cards = parent.select("div[data-recipe-card]") or parent.select("a[href*='/recipes/']")
            if candidate_cards:
                cards = candidate_cards
                break

    if not cards:
        print("[Weekly] Could not locate Meals container or it had no cards, falling back to whole page search")
        cards = soup.select("div[data-recipe-card]") or soup.select("a[href*='/recipes/']")

    # If cards are anchors (flat list), we process anchors; if container divs, we inspect children.
    for idx, card in enumerate(cards):
        # card may be a Tag for <a> or a container div
        link_tag = None
        href = ""
        visible_text = ""

        if card.name == "a" and card.has_attr("href"):
            link_tag = card
            href = link_tag["href"]
            visible_text = link_tag.get_text(" ", strip=True)
            card_soup = card
        else:
            link_tag = card.select_one("a[href*='/recipes/']")
            if link_tag and link_tag.has_attr("href"):
                href = link_tag["href"]
                visible_text = link_tag.get_text(" ", strip=True)
            else:
                # fallback: some containers embed the link in data attributes
                if card.has_attr("data-url"):
                    href = card["data-url"]
                visible_text = card.get_text(" ", strip=True)
            card_soup = card

        if not href:
            continue

        # Normalize relative hrefs
        if not href.startswith("http"):
            href = "https://www.everyplate.com" + href

        # Skip duplicates
        if href in seen:
            continue

        # Run add-on heuristics
        if is_addon_candidate(href, visible_text, card_soup):
            # debug log for CI tuning (will show a few excluded examples)
            if len(recipes) < 5:  # avoid spamming but show some excluded samples
                print(f"[Weekly] Skipping addon-like item: href={href} text='{visible_text[:60]}'")
            continue

        # Extract fields with fallbacks
        title_el = card_soup.select_one("h2[data-recipe-card-title='true']") or card_soup.select_one("h2") or link_tag
        subtitle_el = card_soup.select_one("p[data-recipe-card-headline='true']") or card_soup.select_one("p")
        img_tag = card_soup.select_one("img[data-recipe-card-image='true']") or card_soup.select_one("img")
        pdf_tag = card_soup.select_one("a[title='Download Recipe Card'][href$='.pdf']")

        title = title_el.get_text(strip=True) if title_el else ""
        subtitle = subtitle_el.get_text(strip=True) if subtitle_el else ""
        image = img_tag["src"] if img_tag and img_tag.has_attr("src") else ""
        pdf_url = pdf_tag["href"] if pdf_tag and pdf_tag.has_attr("href") else ""

        seen.add(href)
        recipes.append({
            "url": href,
            "title": title,
            "subtitle": subtitle,
            "image": image,
            "pdf": pdf_url
        })

    print(f"[Weekly] Found {len(recipes)} recipes (filtered)")
    return recipes

if __name__ == "__main__":
    data = scrape_weekly_menu()
    for r in data[:50]:
        print(f"- {r['title'] or '(no title)'} | {r['url']} | PDF: {r['pdf']}")
