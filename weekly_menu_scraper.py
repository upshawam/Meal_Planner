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
    """Return the base weekly menu URL which redirects to the actual current week."""
    return "https://www.everyplate.com/weekly-menu"

def _make_driver():
    options = Options()
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
    options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
    )
    driver = webdriver.Chrome(options=options)
    return driver

def extract_img_title(tag):
    """Return img alt or aria-label if present."""
    img = None
    if getattr(tag, "name", "") == "a":
        img = tag.find("img")
    else:
        img = tag.select_one("img")
    if not img:
        return ""
    return (img.get("aria-label") or img.get("alt") or "").strip()

def looks_like_product_path(href):
    if not href:
        return False
    href_l = href.lower()
    for p in ("/products/", "/shop/", "/store/"):
        if p in href_l:
            return True
    return False

def looks_like_price_or_badge(text):
    if not text:
        return False
    t = text.strip()
    # price-only like "$4.99" or numeric-only badges
    if re.fullmatch(r"[\$\£\€]?\s*\d+(\.\d{1,2})?", t):
        return True
    return False

def scrape_weekly_menu():
    """
    Return a tuple: (year, week, list_of_candidate_recipes)
    Each recipe is a dict: {"url","title","subtitle","image","pdf"}
    This function tries to be permissive on candidate collection (keeps hrefs with ?week=)
    and uses image alt/aria as title fallback.
    """
    driver = _make_driver()
    url = current_week_url()
    print(f"[Weekly] Navigating to {url}")
    driver.get(url)

    # Wait for page ready; allow client-side rendering
    try:
        WebDriverWait(driver, 20).until(lambda d: d.execute_script("return document.readyState") == "complete")
    except Exception as e:
        print(f"[Weekly] Warning: document.readyState wait timed out: {e}")

    # trigger lazy-load
    try:
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(1.5)
    except Exception:
        pass

    # wait for at least one candidate
    try:
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "a[href*='/recipes/'], div[data-recipe-card]"))
        )
    except Exception as e:
        print(f"[Weekly] Warning: recipe element wait timed out: {e}")

    soup = BeautifulSoup(driver.page_source, "html.parser")
    final_url = driver.current_url
    
    # Extract year and week from multiple sources
    year, week = None, None
    
    # Try 1: URL pattern
    match = re.search(r'/weekly-menu/(\d{4})-W(\d{2})', final_url)
    if match:
        year, week = int(match.group(1)), int(match.group(2))
        print(f"[Weekly] Detected week from URL: {year}-W{week:02d}")
    
    # Try 2: Recipe URLs contain ?week= parameter
    if not year or not week:
        recipe_links = soup.select("a[href*='?week=']")
        for link in recipe_links[:5]:  # Check first 5
            href = link.get('href', '')
            week_match = re.search(r'\?week=(\d{4})-W(\d{2})', href)
            if week_match:
                year, week = int(week_match.group(1)), int(week_match.group(2))
                print(f"[Weekly] Detected week from recipe URL: {year}-W{week:02d}")
                break
    
    # Try 3: Look for week text in page
    if not year or not week:
        for h in soup.find_all(['h1', 'h2', 'h3']):
            text = h.get_text()
            week_match = re.search(r'Week\s+(\d+)', text, re.IGNORECASE)
            if week_match:
                week = int(week_match.group(1))
                year = datetime.date.today().year
                print(f"[Weekly] Detected week from heading: {year}-W{week:02d}")
                break
    
    # Fallback to current ISO week
    if not year or not week:
        today = datetime.date.today()
        year, week, _ = today.isocalendar()
        print(f"[Weekly] Could not detect week, using ISO week: {year}-W{week:02d}")
    
    driver.quit()

    recipes = []
    seen = set()

    # Find meals header if present
    meals_header = None
    for h3 in soup.find_all("h3"):
        if h3.string and "meals" in h3.string.strip().lower():
            meals_header = h3
            break

    # Try to scope to the container near the header, otherwise whole page
    cards = []
    if meals_header:
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
        print("[Weekly] Could not locate Meals container, falling back to whole page")
        cards = soup.select("div[data-recipe-card]") or soup.select("a[href*='/recipes/']")

    if not cards:
        try:
            with open("debug_week_page_source.html", "w", encoding="utf-8") as f:
                f.write(str(soup))
            print("[Weekly] Saved debug_week_page_source.html for inspection")
        except Exception:
            pass

    for card in cards:
        # Normalize anchor and visible text
        if card.name == "a" and card.has_attr("href"):
            anchor = card
            href = anchor["href"]
            visible_text = anchor.get_text(" ", strip=True) or ""
            card_soup = anchor
        else:
            anchor = card.select_one("a[href*='/recipes/']") or None
            if anchor and anchor.has_attr("href"):
                href = anchor["href"]
                visible_text = anchor.get_text(" ", strip=True) or card.get_text(" ", strip=True) or ""
            else:
                href = card.get("data-url") or ""
                visible_text = card.get_text(" ", strip=True) or ""
            card_soup = card

        if not href:
            continue

        if not href.startswith("http"):
            href = "https://www.everyplate.com" + href

        if href in seen:
            continue

        # Early exclude clear product/shop pages
        if looks_like_product_path(href):
            # don't add
            continue

        # Extract fields with fallbacks
        title_el = card_soup.select_one("h2[data-recipe-card-title='true']") or card_soup.select_one("h2")
        subtitle_el = card_soup.select_one("p[data-recipe-card-headline='true']") or card_soup.select_one("p")
        img_tag = card_soup.select_one("img[data-recipe-card-image='true']") or card_soup.select_one("img")
        pdf_tag = card_soup.select_one("a[title='Download Recipe Card'][href$='.pdf']")

        if title_el:
            title = title_el.get_text(strip=True)
        else:
            title = extract_img_title(card_soup) or visible_text or ""

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

    print(f"[Weekly] Found {len(recipes)} candidate cards (unverified)")
    return year, week, recipes

if __name__ == "__main__":
    data = scrape_weekly_menu()
    for r in data[:50]:
        print(f"- {r['title'] or '(no title)'} | {r['url']} | PDF: {r['pdf']}")
