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

def looks_like_addon_text(visible_text: str):
    """Detect product/add-on style visible text patterns."""
    if not visible_text:
        return False
    t = visible_text.lower()
    # common product card patterns: "all-purpose protein.", "all purpose protein", "premium steak", "sides", "extras"
    if "all-purpose" in t or "all purpose" in t:
        return True
    if "serving" in t:  # "1-2 Servings"
        return True
    # short time badges like "10 Min" or "15 Min"
    if re.search(r"\b\d+\s*min\b", t):
        return True
    # price-only or badge-only text (e.g., "$4.99")
    if re.fullmatch(r"[\$\£\€]?\s*\d+(\.\d{1,2})?", t.strip()):
        return True
    # product-size patterns like "10 oz", "12 oz (2 Servings)"
    if re.search(r"\b\d+\s*(oz|ounce|ounces|lb|lbs|g|kg)\b", t):
        return True
    return False

def anchor_is_image_only(anchor_tag):
    """
    Return True if the <a> element appears to be image-only (no visible title/subtitle inside).
    The EveryPlate add-on examples you provided are anchors that only contain an image element,
    and the textual title is rendered elsewhere (or not at all). We treat such image-only anchors
    as likely product/add-on unless there's other recipe metadata nearby.
    """
    # If anchor has any textual nodes besides whitespace, consider it not image-only.
    texts = [s for s in anchor_tag.stripped_strings]
    # If the only stripped string is the img's alt/aria-label (often short product name), that still counts as image-only.
    # So we prefer to detect presence of explicit title elements (h2) or descriptive paragraphs (p) inside/nearby.
    has_h2 = bool(anchor_tag.select_one("h2") or anchor_tag.find_parent().select_one("h2") if anchor_tag.find_parent() else False)
    has_p = bool(anchor_tag.select_one("p") or anchor_tag.find_parent().select_one("p") if anchor_tag.find_parent() else False)
    # Check if anchor contains an <img> and no other meaningful text nodes
    img = anchor_tag.find("img")
    # Count non-empty text pieces that are not the img alt/aria-label
    non_img_texts = []
    for s in anchor_tag.stripped_strings:
        # if string equals image alt/aria we skip it from counting
        if img and (s == (img.get("alt") or "") or s == (img.get("aria-label") or "")):
            continue
        non_img_texts.append(s)
    if img and not non_img_texts and not has_h2 and not has_p:
        return True
    return False

def is_addon_candidate(href: str, visible_text: str, card_soup):
    """
    Heuristic: return True if the card looks like an add-on (non-recipe).
    Aggressive exclusions based on href, visible text patterns, and structure (image-only anchors).
    """
    href_l = (href or "").lower()
    text_l = (visible_text or "").lower()

    # Exclude obvious product/shop/addon paths
    shop_patterns = [r"addon", r"add-?on", r"add-?ons", r"/products/", r"/shop/", r"/store/", r"/sides", r"/extras"]
    for p in shop_patterns:
        if re.search(p, href_l) or re.search(p, text_l):
            return True

    # Visible-text patterns that indicate add-ons (e.g., "All purpose protein. | 1-2 Servings", "10 Min")
    if looks_like_addon_text(visible_text):
        return True

    # If the anchor/card is image-only (no h2/p nearby), it's likely a product add-on
    # Some EveryPlate recipe cards include titles; the add-on anchors you showed appear to be image-only anchors.
    try:
        # If card_soup is an <a> element, check it directly; otherwise try to find the anchor inside the card.
        anchor_tag = None
        if getattr(card_soup, "name", "") == "a":
            anchor_tag = card_soup
        else:
            anchor_tag = card_soup.select_one("a") or None
        if anchor_tag and anchor_is_image_only(anchor_tag):
            return True
    except Exception:
        # don't fail here; proceed to other heuristics
        pass

    # If the card text is extremely short (1-3 words) and contains size/duration tokens, it's likely a product
    if len(text_l.split()) <= 3 and re.search(r"\b(min|serving|servings|oz|ounce|lb|lbs|g|kg)\b", text_l):
        return True

    # If there is no recipe title element and no PDF and href doesn't include the week param, treat as likely addon
    has_recipe_title = bool(card_soup.select_one("h2[data-recipe-card-title='true']") or card_soup.select_one("h2"))
    has_pdf = bool(card_soup.select_one("a[title='Download Recipe Card'][href$='.pdf']"))
    href_has_week = "?week=" in (href or "")

    # If href lacks week and there is no PDF and title is missing, treat as addon
    if not href_has_week and not has_pdf and not has_recipe_title:
        return True

    # Additional heuristic: if title exists but visible text contains addon markers, exclude
    if has_recipe_title and looks_like_addon_text(visible_text):
        return True

    return False

def scrape_weekly_menu():
    driver = _make_driver()
    url = current_week_url()
    print(f"[Weekly] Navigating to {url}")
    driver.get(url)

    # Wait for the page to become 'complete' and try to allow client-side rendering
    try:
        WebDriverWait(driver, 20).until(lambda d: d.execute_script("return document.readyState") == "complete")
    except Exception as e:
        print(f"[Weekly] Warning: document.readyState wait timed out: {e}")

    # Trigger lazy-load by scrolling
    try:
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(1.5)
    except Exception:
        pass

    # Wait for at least one recipe anchor or card to appear (best-effort)
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

    # Try to find the 'Meals' header flexibly
    meals_header = None
    for h3 in soup.find_all("h3"):
        if h3.string and "meals" in h3.string.strip().lower():
            meals_header = h3
            break

    # Locate candidate cards near the Meals header, otherwise scan the whole page
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
        print("[Weekly] Could not locate Meals container or it had no cards, falling back to whole page search")
        cards = soup.select("div[data-recipe-card]") or soup.select("a[href*='/recipes/']")

    for idx, card in enumerate(cards):
        # card may be <a> or a container div
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
                # Try to capture visible text from the link (title may be rendered elsewhere but usually linked)
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

        # Strong recipe signals
        href_has_week = "?week=" in href
        pdf_tag = card_soup.select_one("a[title='Download Recipe Card'][href$='.pdf']")
        has_pdf = bool(pdf_tag)
        title_el = card_soup.select_one("h2[data-recipe-card-title='true']") or card_soup.select_one("h2")
        has_recipe_title = bool(title_el)

        # Run add-on heuristics (more aggressive)
        if is_addon_candidate(href, visible_text, card_soup):
            if len(recipes) < 12:  # print a few examples for tuning
                print(f"[Weekly] Skipping addon-like item: href={href} text='{visible_text[:120]}'")
            continue

        # If none of the strong recipe signals exist, skip to reduce false positives
        if not (href_has_week or has_pdf or has_recipe_title):
            print(f"[Weekly] Skipping ambiguous item (no week/pdf/title): href={href} text='{visible_text[:120]}'")
            continue

        # Extract fields with fallbacks
        subtitle_el = card_soup.select_one("p[data-recipe-card-headline='true']") or card_soup.select_one("p")
        img_tag = card_soup.select_one("img[data-recipe-card-image='true']") or card_soup.select_one("img")

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
    for r in data[:200]:
        print(f"- {r['title'] or '(no title)'} | {r['url']} | PDF: {r['pdf']}")
