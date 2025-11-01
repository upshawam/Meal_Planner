from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from bs4 import BeautifulSoup
import re

# Unicode fraction to float
UNICODE_FRAC_TO_FLOAT = {
    "½": 0.5, "¼": 0.25, "¾": 0.75,
    "⅓": 1/3, "⅔": 2/3,
    "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
}

# ASCII -> Unicode fraction
ASCII_TO_UNICODE = {
    "1/2": "½", "1/4": "¼", "3/4": "¾",
    "1/3": "⅓", "2/3": "⅔",
    "1/8": "⅛", "3/8": "⅜", "5/8": "⅝", "7/8": "⅞",
}

# Unit normalization
UNIT_NORMALIZATION = {
    "ounces": "ounce", "ounce": "ounce", "oz": "ounce",
    "milliliter": "milliliter", "milliliters": "milliliter", "ml": "milliliter",
    "cup": "cup", "cups": "cup",
    "teaspoon": "teaspoon", "teaspoons": "teaspoon", "tsp": "teaspoon",
    "tablespoon": "tablespoon", "tablespoons": "tablespoon", "tbsp": "tablespoon",
    "clove": "clove", "cloves": "clove",
    "unit": "unit", "units": "unit",
}

def normalize_amount_text(amount: str) -> str:
    """Remove 'Measurement:' and replace ASCII fractions with Unicode."""
    if not amount:
        return ""
    amount = amount.replace("Measurement:", "").strip()
    for s, u in ASCII_TO_UNICODE.items():
        amount = amount.replace(s, u)
    return amount

def parse_quantity_unit(amount: str):
    """
    Parse amount into (quantity_float, quantity_display, unit).
    Supports:
      '3 ounce' -> (3.0, '3', 'ounce')
      '¾ cup' -> (0.75, '¾', 'cup')
      '1½ cup' -> (1.5, '1½', 'cup')
      '1 unit' -> (1.0, '1', 'unit')
    """
    amt = amount.strip()
    if not amt:
        return None, None, None

    tokens = amt.split()
    if not tokens:
        return None, None, None

    def frac_value(token):
        total = 0.0
        m_int = re.match(r"^(\d+)", token)
        if m_int:
            total += float(m_int.group(1))
            token = token[m_int.end():]
        for ch in token:
            if ch in UNICODE_FRAC_TO_FLOAT:
                total += UNICODE_FRAC_TO_FLOAT[ch]
        return total if total > 0.0 else None

    qty_float = None
    qty_display = None
    unit = None

    # Case A: pure integer first token
    if re.match(r"^\d+$", tokens[0]):
        qty_float = float(tokens[0])
        qty_display = tokens[0]
        unit_candidate = tokens[1] if len(tokens) > 1 else None
        unit = UNIT_NORMALIZATION.get((unit_candidate or "").lower(), unit_candidate)

    # Case B: first token includes unicode fraction or combined like '1½'
    elif any(ch in UNICODE_FRAC_TO_FLOAT for ch in tokens[0]):
        val = frac_value(tokens[0])
        if val is not None:
            qty_float = val
            qty_display = tokens[0]
            unit_candidate = tokens[1] if len(tokens) > 1 else None
            unit = UNIT_NORMALIZATION.get((unit_candidate or "").lower(), unit_candidate)

    # Case C: mixed strings, try second token
    elif len(tokens) > 1 and any(ch in UNICODE_FRAC_TO_FLOAT for ch in tokens[1]):
        val = frac_value(tokens[1])
        if val is not None:
            qty_float = val
            qty_display = tokens[1]
            unit_candidate = tokens[2] if len(tokens) > 2 else None
            unit = UNIT_NORMALIZATION.get((unit_candidate or "").lower(), unit_candidate)

    # Fallback
    if qty_float is None:
        # Look for unit words
        for t in tokens:
            normalized = UNIT_NORMALIZATION.get(t.lower())
            if normalized:
                unit = normalized
                break
        qty_display = amt
        qty_float = None

    return qty_float, qty_display, unit

def scrape_ingredients(url):
    # Headless browser load (JS-rendered page)
    options = Options()
    options.add_argument("--headless=new")
    driver = webdriver.Chrome(options=options)

    driver.get(url)

    # Let JS render; adjust or switch to explicit waits if needed
    driver.implicitly_wait(5)

    html = driver.page_source
    driver.quit()

    soup = BeautifulSoup(html, "html.parser")

    # Ingredient container and blocks
    container = soup.select_one('div[data-recipe-ingredients="true"]')
    if not container:
        return []

    items = container.select('div[data-test-id="recipe-ingredient"]')

    result = []
    for item in items:
        p_tags = item.select("p")
        if not p_tags:
            continue
        name = p_tags[0].get_text(strip=True)
        raw_amount = p_tags[1].get_text(strip=True) if len(p_tags) > 1 else ""

        cleaned_amount = normalize_amount_text(raw_amount)
        qty_float, qty_display, unit = parse_quantity_unit(cleaned_amount)

        result.append({
            "ingredient": name,
            "amount": cleaned_amount,         # human-readable (e.g., '¾ cup')
            "quantity_display": qty_display,  # e.g., '¾', '1½', '3'
            "quantity": qty_float,            # float for scaling (e.g., 0.75, 1.5, 3.0)
            "unit": unit                      # normalized unit
        })

    return result

