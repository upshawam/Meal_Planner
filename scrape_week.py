#!/usr/bin/env python3
"""
scrape_week.py

Option A workflow (verify each candidate by scraping its recipe page):

- Collect candidate recipe cards via weekly_menu_scraper.scrape_weekly_menu()
- For each candidate, verify by scraping recipe page with recipe_scraper.scrape_ingredients()
- Keep only candidates that return at least 2 ingredients (to exclude single-ingredient add-ons)
- Save docs/week.json (latest) and archive to docs/weeks/YYYY-Www.json
- Maintain docs/weeks_index.json

This version includes a small verification cache (docs/.verify_cache.json) to avoid re-verifying
the same recipe URLs across runs. Adjust REQUEST_DELAY_SECONDS to be polite.

New: generate EveryPlate PDF links from recipe URLs and store in meal["pdf"] when applicable.
"""
import json
import datetime
import time
import os
import argparse
import re
from weekly_menu_scraper import scrape_weekly_menu
from recipe_scraper import scrape_ingredients

ARCHIVE_DIR = "docs/weeks"
LATEST_PATH = "docs/week.json"
INDEX_PATH = "docs/weeks_index.json"
VERIFY_CACHE_PATH = "docs/.verify_cache.json"

# polite delay between per-recipe verification requests
REQUEST_DELAY_SECONDS = 0.5

def ensure_dir(path):
    if path and not os.path.exists(path):
        os.makedirs(path, exist_ok=True)

def load_json_safe(path):
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[IO] Warning: failed to load JSON from {path}: {e}")
        return None

def save_json_atomic(path, data):
    tmp_path = path + ".tmp"
    ensure_dir(os.path.dirname(path) or ".")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, path)

def make_archive_filename(year, week):
    return f"{year}-W{week:02d}.json"

def update_weeks_index(archive_relpath, year, week):
    index = load_json_safe(INDEX_PATH) or []
    for e in index:
        if e.get("year") == year and e.get("week") == week:
            e["path"] = archive_relpath
            e["archived_at"] = int(time.time())
            break
    else:
        index.append({
            "year": year,
            "week": week,
            "path": archive_relpath,
            "archived_at": int(time.time())
        })
    index.sort(key=lambda x: (x["year"], x["week"]), reverse=True)
    save_json_atomic(INDEX_PATH, index)
    print(f"[Index] Updated weeks index with {archive_relpath}")

def generate_everyplate_pdf(url):
    """
    Given an EveryPlate recipe URL like:
      https://www.everyplate.com/recipes/...-65e55de93251bf1977c048bd?week=2025-W45
    generate the PDF recipecard link:
      https://www.everyplate.com/recipecards/card/65e55de93251bf1977c048bd-en-US.pdf

    Returns the pdf url string if matched, otherwise empty string.
    """
    if not url:
        return ""
    try:
        # strip query params and trailing slashes
        base = url.split("?", 1)[0].rstrip("/")
        # take the last path segment and pull the trailing hyphen token
        last_seg = base.split("/")[-1]
        # find the ID after the last hyphen
        if "-" in last_seg:
            candidate_id = last_seg.rsplit("-", 1)[-1]
        else:
            candidate_id = last_seg

        # basic validation: look for hex-like id of reasonable length (>=8)
        if re.fullmatch(r"[0-9a-fA-F]{8,}", candidate_id):
            return f"https://www.everyplate.com/recipecards/card/{candidate_id}-en-US.pdf"
    except Exception:
        pass
    return ""

def verify_and_enrich_meals(candidates, verbose=True):
    """
    Given candidate meals, verify by scraping their recipe pages. Returns verified list.
    Uses a small cache to skip re-verification of URLs that were already verified.
    Requirement: at least 2 ingredients to be considered a valid recipe (excludes single-ingredient add-ons)
    Also attempts to generate EveryPlate pdf links when the URL matches the expected pattern.
    """
    ensure_dir(os.path.dirname(VERIFY_CACHE_PATH) or ".")
    cache = load_json_safe(VERIFY_CACHE_PATH) or {}

    verified = []
    total = len(candidates)
    for i, meal in enumerate(candidates, start=1):
        url = meal.get("url")
        title = meal.get("title") or "(no title)"
        print(f"[Verify] ({i}/{total}) Checking {title} -> {url}")

        # Generate pdf link when possible (even if cached)
        pdf_link = generate_everyplate_pdf(url)
        if pdf_link:
            meal["pdf"] = pdf_link
            if verbose:
                print(f"[Verify] ℹ️ Generated PDF link: {pdf_link}")
        else:
            # ensure the field exists (preserve existing value if present)
            meal.setdefault("pdf", "")

        # Use cached result if present
        cached = cache.get(url)
        if cached is not None:
            if cached.get("verified"):
                # cached verified includes ingredients (may be used downstream)
                meal["ingredients"] = cached.get("ingredients", [])
                # ensure pdf is present (regenerate if cache predates this change)
                if not meal.get("pdf"):
                    meal["pdf"] = generate_everyplate_pdf(url)
                verified.append(meal)
                print(f"[Verify] ✅ Cached verified ({len(meal['ingredients'])} ingredients)")
            else:
                print("[Verify] ⛔ Cached not a recipe")
            continue

        # Not cached: run recipe scraper
        try:
            ingredients = scrape_ingredients(url)
        except Exception as e:
            print(f"[Verify] Error scraping ingredients for {url}: {e}")
            ingredients = []

        # Polite delay
        time.sleep(REQUEST_DELAY_SECONDS)

        # New rule: require at least 2 ingredients to be considered a recipe
        if ingredients and isinstance(ingredients, list) and len(ingredients) >= 2:
            meal["ingredients"] = ingredients
            # ensure pdf field is set (may have been set above)
            meal["pdf"] = meal.get("pdf", "") or generate_everyplate_pdf(url)
            verified.append(meal)
            cache[url] = {"verified": True, "ingredients": ingredients, "checked_at": int(time.time())}
            print(f"[Verify] ✅ Verified recipe: {title} ({len(ingredients)} ingredients)")
        else:
            cache[url] = {"verified": False, "ingredients": ingredients if isinstance(ingredients, list) else [], "checked_at": int(time.time())}
            print(f"[Verify] ⛔ Skipping non-recipe / addon: {title} ({url}) — ingredients found: {len(ingredients) if isinstance(ingredients, list) else 0}")

        # Save cache incrementally to survive long runs / CI
        try:
            save_json_atomic(VERIFY_CACHE_PATH, cache)
        except Exception as e:
            print(f"[Verify] Warning: failed to write cache: {e}")

    return verified

def run(force=False, verbose=True):
    # 1) gather candidates
    candidates = scrape_weekly_menu()
    print(f"[Main] Collected {len(candidates)} candidate cards")

    # 2) verify candidates by scraping recipe pages
    meals = verify_and_enrich_meals(candidates, verbose=verbose)
    print(f"[Main] Verified {len(meals)} recipes after checking recipe pages")

    # 3) build payload
    now = datetime.date.today()
    year, week, _ = now.isocalendar()
    payload = {
        "week": week,
        "year": year,
        "meals": meals
    }

    # 4) write archive + latest
    ensure_dir(ARCHIVE_DIR)
    archive_name = make_archive_filename(year, week)
    archive_path = os.path.join(ARCHIVE_DIR, archive_name)
    archive_relpath = os.path.join("weeks", archive_name)

    if os.path.exists(archive_path) and not force:
        print(f"[Archive] Archive for {year}-W{week:02d} already exists at {archive_path}. Use --force to overwrite.")
    else:
        print(f"[Archive] Saving archived week to {archive_path}")
        save_json_atomic(archive_path, payload)
        update_weeks_index(archive_relpath, year, week)
        print(f"[Archive] Written {archive_path}")

    print(f"[Latest] Writing latest week file to {LATEST_PATH}")
    save_json_atomic(LATEST_PATH, payload)

    print(f"✅ Saved {LATEST_PATH} with {len(payload['meals'])} meals (archived at {archive_relpath})")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scrape weekly menu, verify recipes and archive by week")
    parser.add_argument("--force", action="store_true", help="Overwrite existing archive for this week")
    parser.add_argument("--no-verify-cache", action="store_true", help="Ignore cached verification results (not implemented)")
    args = parser.parse_args()
