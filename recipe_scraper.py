from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from bs4 import BeautifulSoup
import json
import time
import re

# Unicode fraction to float
UNICODE_FRAC_TO_FLOAT = {
    "½": 0.5,
    "¼": 0.25,
    "¾": 0.75,
    "⅓": 1/3,
    "⅔": 2/3,
    "⅛": 0.125,
    "⅜": 0.375,
    "⅝": 0.625,
    "⅞": 0.875,
}

# ASCII fraction to Unicode
ASCII_TO_UNICODE = {
    "1/2": "½",
    "1/4": "¼",
    "3/4": "¾",
    "1/3": "⅓",
    "2/3": "⅔",
    "1/8": "⅛",
    "3/8": "⅜",
    "5/8": "⅝",
    "7/8": "⅞",
}

# Unit normalization (singular preferred)
UNIT_NORMALIZATION = {
    "ounces": "ounce",
    "ounce": "ounce",
    "oz": "ounce",
    "milliliter": "milliliter",
    "milliliters": "milliliter",
    "ml": "milliliter",
    "cup": "cup",
    "cups": "cup",
    "teaspoon": "teaspoon",
    "teaspoons": "teaspoon",
    "tsp": "teaspoon",
    "tablespoon": "tablespoon",
    "tablespoons": "tablespoon",
    "tbsp": "tablespoon",
    "clove": "clove",
    "cloves": "clove",
    "unit": "unit",
    "units": "unit",
}

def normalize_amount_text(amount: str) -> str:
    """Clean 'Measurement:' and replace ASCII fractions with Unicode."""
    amount = amount.replace("Measurement:", "").strip()
    for s, u in ASCII_TO_UNICODE.items():
        amount = amount.replace(s, u)
    return amount

def parse_quantity_unit(amount: str):
    """
    Parse amount into (quantity_float, quantity_display, unit).
    Handles cases like:
      '3 ounce' -> (3.0, '3', 'ounce')
      '¾ cup' -> (0.75, '¾', 'cup')
      '1½ cup' -> (1.5, '1½', 'cup')
      '1 unit' -> (1.0, '1', 'unit')
      '2 clove' -> (2.0, '2', 'clove')
    """
    amt = amount.strip()

    # Split tokens
    tokens = amt.split()
    if not tokens:
        return None, None, None

    # Detect Unicode fraction presence in first or second token
    def frac_value(token):
        # If token contains a unicode fraction (possibly combined like '1½')
        total = 0.0
        # Extract leading integer if any
        m_int = re.match(r"^(\d+)", token)
        if m_int:
            total += float(m_int.group(1))
            token = token[m_int.end():]
        # Extract any unicode fraction char
        for ch in token:
            if ch in UNICODE_FRAC_TO_FLOAT:
                total += UNICODE_FRAC_TO_FLOAT[ch]
        return total if total > 0.0 else None

    qty_float = None
    qty_display = None
    unit = None

    # Case A: first token is a number (int)
    if re.match(r"^\d+$", tokens[0]):
        qty_float = float(tokens[0])
        qty_display = tokens[0]
        unit_candidate = tokens[1] if len(tokens) > 1 else None
        unit = UNIT_NORMALIZATION.get((unit_candidate or "").lower(), unit_candidate)

    # Case B: first token includes a unicode fraction or combined like '1½'
    elif any(ch in UNICODE_FRAC_TO_FLOAT for ch in tokens[0]):
        val = frac_value(tokens[0])
        if val is not None:
            qty_float = val
            qty_display = tokens[0]
            unit_candidate = tokens[1] if len(tokens) > 1 else None
            unit = UNIT_NORMALIZATION.get((unit_candidate or "").lower(), unit_candidate)

    # Case C: first token is something else; try second token (e.g., 'about ¾ cup')
    elif len(tokens) > 1 and any(ch in UNICODE_FRAC_TO_FLOAT for ch in tokens[1]):
        val = frac_value(tokens[1])
        if val is not None:
            qty_float = val
            qty_display = tokens[1]
            unit_candidate = tokens[2] if len(tokens) > 2 else None
            unit = UNIT_NORMALIZATION.get((unit_candidate or "").lower(), unit_candidate)

    # Fallback: no quantity found, treat entire amount as unit or note
    if qty_float is None:
        # Try to find a unit word
        for t in tokens:
            normalized = UNIT_NORMALIZATION.get(t.lower())
            if normalized:
                unit = normalized
                break
        qty_display = amt  # keep original
        qty_float = None

    return qty_float, qty_display, unit

def scrape_ingredients(url):
    print("[1] Launching browser...")
    options = Options()
    options.add_argument("--headless=new")
    driver = webdriver.Chrome(options=options)

    print("[2] Navigating to page...")
    driver.get(url)

    print("[3] Waiting for JS to render...")
    time.sleep(5)

    print("[4] Grabbing page source...")
    html = driver.page_source
    driver.quit()

    print("[5] Parsing with BeautifulSoup...")
    soup = BeautifulSoup(html, "html.parser")

    print("[6] Looking for ingredient container...")
    container = soup.select_one('div[data-recipe-ingredients="true"]')
    if not container:
        print("[!] No ingredient container found")
        return []

    print("[7] Extracting ingredient blocks...")
    items = container.select('div[data-test-id="recipe-ingredient"]')
    print(f"    Found {len(items)} ingredient blocks.")

    result = []
    for idx, item in enumerate(items, start=1):
        print(f"    - [{idx}] Extracting name/amount...")
        p_tags = item.select("p")
        if not p_tags:
            print(f"      [skip] No <p> tags")
            continue

        name = p_tags[0].get_text(strip=True)
        raw_amount = p_tags[1].get_text(strip=True) if len(p_tags) > 1 else ""

        cleaned_amount = normalize_amount_text(raw_amount)
        qty_float, qty_display, unit = parse_quantity_unit(cleaned_amount)

        print(f"      name='{name}' raw_amount='{raw_amount}' cleaned='{cleaned_amount}' qty_display='{qty_display}' unit='{unit}' qty_float={qty_float}")

        result.append({
            "ingredient": name,
            "amount": cleaned_amount,      # human‑readable (e.g., '¾ cup')
            "quantity_display": qty_display,  # e.g., '¾' or '1½' or '3'
            "quantity": qty_float,            # float (e.g., 0.75, 1.5, 3.0)
            "unit": unit                      # normalized unit (e.g., 'cup', 'ounce', 'clove', 'unit')
        })

    print(f"[8] Done. Extracted {len(result)} ingredients.")
    return result

if __name__ == "__main__":
    url = "https://www.everyplate.com/recipes/beef-banh-mi-bowls-68d646cc681e58ed6e5b0a8a"
    data = scrape_ingredients(url)
    print(json.dumps(data, indent=2, ensure_ascii=False))
