#!/usr/bin/env python3
"""
enrich_and_download_pdfs.py

Read docs/week.json (or a specified input file), derive EveryPlate PDF URLs from each
recipe URL, download PDFs into docs/pdfs/, update the meal entry pdf field to point
to the local archive path (./pdfs/<filename>.pdf) and write an enriched JSON file.

Improvements over the quick prototype:
- CLI arguments for input/output paths and locale
- Retries with backoff on transient network errors
- Content-Type check and a lightweight content sniff fallback
- Respectful delays (rate limiting) and User-Agent header
- Robust filename handling and optional "force" overwrite
"""
from __future__ import annotations
import argparse
import json
import os
import time
import shutil
from typing import Optional
from urllib.parse import urlparse
import requests
from requests import RequestException

DEFAULT_OUT_DIR = "docs/pdfs"
DEFAULT_INPUT = "docs/week.json"
DEFAULT_OUTPUT = "docs/week_with_pdfs.json"
USER_AGENT = "Mozilla/5.0 (compatible; MealPlanner/1.0; +https://github.com/upshawam/Meal_Planner)"

def extract_recipe_id(recipe_url: str) -> Optional[str]:
    """Pull the unique recipe ID from the URL path."""
    try:
        path = urlparse(recipe_url).path
        last_segment = path.rstrip("/").split("/")[-1]
        if "-" in last_segment:
            # Example: french-onion-chicken-67ce3070c2f2c4b379aaeac5
            candidate = last_segment.split("-")[-1]
            # basic validation: hex-like and length > 8
            if all(c.isalnum() for c in candidate) and len(candidate) >= 8:
                return candidate
    except Exception:
        pass
    return None

def build_pdf_url(recipe_id: str, locale: str = "en-US") -> str:
    return f"https://www.everyplate.com/recipecards/card/{recipe_id}-{locale}.pdf"

def safe_filename_from_url(url: str) -> str:
    # remove query string and use basename
    base = os.path.basename(url.split("?", 1)[0])
    return base or "recipe.pdf"

def download_pdf(pdf_url: str, out_dir: str = DEFAULT_OUT_DIR, timeout: int = 20,
                 max_retries: int = 3, backoff: float = 1.0, force: bool = False) -> Optional[str]:
    """Download the PDF to out_dir. Return local path if successful."""
    os.makedirs(out_dir, exist_ok=True)
    filename = safe_filename_from_url(pdf_url)
    dest = os.path.join(out_dir, filename)

    if os.path.exists(dest) and not force:
        print(f"⤴ Skipping existing {dest}")
        return dest

    headers = {"User-Agent": USER_AGENT, "Accept": "application/pdf,*/*;q=0.1"}

    attempt = 0
    while attempt < max_retries:
        attempt += 1
        try:
            with requests.get(pdf_url, stream=True, timeout=timeout, headers=headers) as r:
                status = r.status_code
                ct = r.headers.get("Content-Type", "")
                if status != 200:
                    print(f"❌ {pdf_url} -> HTTP {status}")
                    return None

                # Accept application/pdf, or fall back to checking a few bytes for "%PDF"
                if "pdf" in ct.lower() or "application/octet-stream" in ct.lower() or "application/pdf" in ct.lower():
                    # write file
                    with open(dest + ".tmp", "wb") as f:
                        for chunk in r.iter_content(1024 * 64):
                            if chunk:
                                f.write(chunk)
                    shutil.move(dest + ".tmp", dest)
                    print(f"✅ Saved {dest}")
                    return dest
                else:
                    # Fallback: read first 2048 bytes to look for PDF magic "%PDF"
                    head = r.raw.read(2048) if hasattr(r.raw, "read") else b""
                    # reset stream: re-request to download if head matched
                    if head and b"%PDF" in head:
                        # re-download fully
                        r.close()
                        # second fetch for full content
                        with requests.get(pdf_url, stream=True, timeout=timeout, headers=headers) as r2:
                            if r2.status_code == 200:
                                with open(dest + ".tmp", "wb") as f:
                                    for chunk in r2.iter_content(1024 * 64):
                                        if chunk:
                                            f.write(chunk)
                                shutil.move(dest + ".tmp", dest)
                                print(f"✅ Saved {dest} (content-sniffed)")
                                return dest
                    print(f"❌ {pdf_url} -> unexpected Content-Type: {ct!r} (attempt {attempt})")
                    # treat as non-fatal retryable unless we've exhausted attempts
        except RequestException as e:
            print(f"⚠️ network error on attempt {attempt} for {pdf_url}: {e}")
        except Exception as e:
            print(f"⚠️ error downloading {pdf_url} on attempt {attempt}: {e}")

        # retry/backoff
        if attempt < max_retries:
            wait = backoff * (2 ** (attempt - 1))
            time.sleep(wait)
        else:
            break
    print(f"❌ Failed to download {pdf_url} after {max_retries} attempts")
    return None

def enrich_with_pdfs(input_file: str = DEFAULT_INPUT, output_file: str = DEFAULT_OUTPUT,
                     out_dir: str = DEFAULT_OUT_DIR, locale: str = "en-US",
                     delay: float = 0.5, force: bool = False):
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"Input file not found: {input_file}")

    with open(input_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    if "meals" not in data or not isinstance(data["meals"], list):
        raise ValueError("Input JSON does not contain a 'meals' array")

    for recipe in data["meals"]:
        url = recipe.get("url") or ""
        rid = extract_recipe_id(url)
        if not rid:
            print(f"⚠️ Could not extract ID from {url!r}, skipping")
            # leave existing pdf field untouched or blank
            recipe["pdf"] = recipe.get("pdf", "")
            continue

        pdf_url = build_pdf_url(rid, locale)
        local_path = download_pdf(pdf_url, out_dir=out_dir, force=force)
        if local_path:
            # Update to a path relative to docs/ so front-end can embed: "./pdfs/<name>"
            recipe["pdf"] = os.path.join("./pdfs", os.path.basename(local_path))
        else:
            # optionally keep the external PDF URL as fallback (uncomment if desired)
            # recipe["pdf"] = pdf_url
            recipe["pdf"] = ""

        # polite delay between requests
        time.sleep(delay)

    # write enriched JSON
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\nEnriched JSON written to {output_file}")

def main():
    p = argparse.ArgumentParser(description="Enrich week.json with local PDFs by downloading EveryPlate recipe cards.")
    p.add_argument("--input", "-i", default=DEFAULT_INPUT, help="Path to input JSON (default: docs/week.json)")
    p.add_argument("--output", "-o", default=DEFAULT_OUTPUT, help="Path for enriched output JSON")
    p.add_argument("--out-dir", "-d", default=DEFAULT_OUT_DIR, help="Directory to save PDFs")
    p.add_argument("--locale", default="en-US", help="Locale suffix for PDF filename (default: en-US)")
    p.add_argument("--delay", type=float, default=0.5, help="Polite delay between downloads (seconds)")
    p.add_argument("--force", action="store_true", help="Re-download PDFs even if they exist")
    args = p.parse_args()

    enrich_with_pdfs(input_file=args.input, output_file=args.output, out_dir=args.out_dir,
                     locale=args.locale, delay=args.delay, force=args.force)

if __name__ == "__main__":
    main()
