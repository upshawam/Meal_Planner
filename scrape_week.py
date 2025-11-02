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
"""
import json
import datetime
import time
import os
import argparse
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

def verify_and_enrich_meals(candidates, verbose=True):
    """
    Given candidate meals, verify by scraping their recipe pages. Returns verified list.
    Uses a small cache to skip re-verification of URLs that were already verified.
    Requirement: at least 2 ingredients to be considered a valid recipe (excludes single-ingredient add-ons)
    """
    ensure_dir(os.path.dirname(VERIFY_CACHE_PATH) or ".")
    cache = load_json_safe(VERIFY_CACHE_PATH) or {}

    verified = []
    total = len(candidates)
    for i, meal in enumerate(candidates, start=1):
        url = meal.get("url")
        title = meal.get("title") or "(no title)"
        print(f"[Verify] ({i}/{total}) Checking {title} -> {url}")

        # Use cached result if present
        cached = cache.get(url)
        if cached is not None:
            if cached.get("verified"):
                # cached verified includes ingredients (may be used downstream)
                meal["ingredients"] = cached.get("ingredients", [])
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

    print(f"[Latest] Writing latest week file to {LATEST_PATH}")
    save_json_atomic(LATEST_PATH, payload)

    print(f"✅ Saved {LATEST_PATH} with {len(payload['meals'])} meals (archived at {archive_relpath})")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scrape weekly menu, verify recipes and archive by week")
    parser.add_argument("--force", action="store_true", help="Overwrite existing archive for this week")
    parser.add_argument("--no-verify-cache", action="store_true", help="Ignore cached verification results (not implemented)")
    args = parser.parse_args()
    run(force=args.force, verbose=True)