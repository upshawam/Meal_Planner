from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from bs4 import BeautifulSoup
import re, time

UNICODE_FRAC_TO_FLOAT = {
    "½": 0.5, "¼": 0.25, "¾": 0.75,
    "⅓": 1/3, "⅔": 2/3,
    "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
}

ASCII_TO_UNICODE = {
    "1/2": "½", "1/4": "¼", "3/4": "¾",
    "1/3": "⅓", "2/3": "⅔",
    "1/8": "⅛", "3/8": "⅜", "5/8": "⅝", "7/8": "⅞",
}

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
    if not amount:
        return ""
    amount = amount.replace("Measurement:", "").strip()
    for s, u in ASCII_TO_UNICODE.items():
        amount = amount.replace(s, u)
    return amount

def parse_quantity_unit(amount: str):
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

    qty_float, qty_display, unit = None, None, None

    if re.match(r"^\d+$", tokens[0]):
        qty_float = float(tokens[0])
        qty_display = tokens[0]
        unit_candidate = tokens[1] if len(tokens) > 1 else None
        unit = UNIT_NORMALIZATION.get((unit_candidate or "").lower(), unit_candidate)
    elif any(ch in UNICODE_FRAC_TO_FLOAT for ch in tokens[0]):
        val = frac_value(tokens[0])
        if val is not None:
            qty_float = val
            qty_display = tokens[0]
            unit_candidate = tokens[1] if len(tokens) > 1 else None
            unit = UNIT_NORMALIZATION.get((unit_candidate or "").lower(), unit_candidate)
    elif len(tokens) > 1 and any(ch in UNICODE_FRAC_TO_FLOAT for ch in tokens[1]):
        val = frac_value(tokens[1])
        if val is not None:
            qty_float = val
            qty_display = tokens[1]
            unit_candidate = tokens[2] if len(tokens) > 2 else None
            unit = UNIT_NORMALIZATION.get((unit_candidate or "").lower(), unit_candidate)

    if qty_float is None:
        for t in tokens:
            normalized = UNIT_NORMALIZATION.get(t.lower())
            if normalized:
                unit = normalized
                break
        qty_display = amt
        qty_float = None

    return qty_float, qty_display, unit

def scrape_ingredients(url):
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")

    service = Service("/usr/local/bin/chromedriver")
    driver = webdriver.Chrome(service=service, options=options)

    driver.get(url)
    time.sleep(5)  # wait for JS

    soup = BeautifulSoup(driver.page_source, "html.parser")
    driver.quit()

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
            "amount": cleaned_amount,
            "quantity_display": qty_display,
            "quantity": qty_float,
            "unit": unit
        })
    return result

if __name__ == "__main__":
    test_url = "https://www.everyplate.com/recipes/beef-banh-mi-bowls-68d646cc681e58ed6e5b0a8a"
    data = scrape_ingredients(test_url)
    import json
    print(json.dumps(data, indent=2, ensure_ascii=False))
