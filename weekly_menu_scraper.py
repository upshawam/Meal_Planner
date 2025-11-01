import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from bs4 import BeautifulSoup

def current_week_url():
    today = datetime.date.today()
    year, week, _ = today.isocalendar()
    return f"https://www.everyplate.com/weekly-menu/{year}-W{week:02d}"

def scrape_weekly_menu(url=None):
    if not url:
        url = current_week_url()

    options = Options()
    options.add_argument("--headless=new")
    driver = webdriver.Chrome(options=options)
    driver.get(url)

    html = driver.page_source
    driver.quit()

    soup = BeautifulSoup(html, "html.parser")
    meals = []

    # Each recipe card is an <a> linking to /recipes/... with week param
    for card in soup.select("a[href*='/recipes/'][href*='week=']"):
        href = card.get("href")
        if not href:
            continue
        if not href.startswith("http"):
            href = "https://www.everyplate.com" + href

        # Title and subtitle (structure may vary; these fallbacks are robust)
        title = None
        subtitle = None
        title_tag = card.find(["h3", "h2"])
        if title_tag:
            title = title_tag.get_text(strip=True)
        # First <p> inside card often holds the subtitle
        subtitle_tag = card.find("p")
        if subtitle_tag:
            subtitle = subtitle_tag.get_text(strip=True)

        # Thumbnail image
        img_tag = card.find("img")
        image = img_tag.get("src") if img_tag else None

        # Skip if we failed to capture title or image; adjust if needed
        meals.append({
            "title": title or "Untitled",
            "subtitle": subtitle or "",
            "url": href,
            "image": image
        })

    return meals

