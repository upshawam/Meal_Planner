#!/usr/bin/env python3
"""
match_pdfs_to_week.py

Scan docs/pdfs/ for downloaded EveryPlate recipe card PDFs and update docs/week.json
so each meal's "pdf" field points to the local archived PDF when a matching ID is found.
"""

import os
import json
import argparse
from urllib.parse import urlparse

def extract_recipe_id_from_url(url: str) -> str | None:
    """Extract the recipe ID from a recipe URL."""
    path = urlparse(url).path
    last_segment = path.rstrip("/").split("/")[-1]
    if "-" in last_segment:
        return last_segment.split("-")[-1]
    return None

def build_pdf_index(pdf_dir="./docs/pdfs"):
    """Return a dict mapping recipe_id -> filename for all PDFs in pdf_dir."""
    index = {}
    for fname in os.listdir(pdf_dir):
        if fname.endswith(".pdf") and "-" in fname:
            recipe_id = fname.split("-")[0]  # e.g. 66f0bfb888e18f7212d3e640-en-US.pdf
            index[recipe_id] = fname
    return index

def match_pdfs(input_file, output_file, pdf_dir="./docs/pdfs"):
    with open(input_file) as f:
        data = json.load(f)

    pdf_index = build_pdf_index(pdf_dir)

    # Handle both single-week object and list of weeks
    weeks = []
    if isinstance(data, dict) and "meals" in data:
        weeks = [data]
    elif isinstance(data, list):
        weeks = data
    else:
        raise ValueError("Unexpected JSON structure")

    for week in weeks:
        for meal in week["meals"]:
            rid = extract_recipe_id_from_url(meal["url"])
            if rid and rid in pdf_index:
                meal["pdf"] = f"./pdfs/{pdf_index[rid]}"

    with open(output_file, "w") as f:
        json.dump(data, f, indent=2)

    print(f"✅ Updated {output_file} with local PDF links")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="input_file", default="docs/week.json")
    parser.add_argument("--out", dest="output_file", default="docs/week_with_pdfs.json")
    parser.add_argument("--pdfdir", dest="pdf_dir", default="docs/pdfs")
    args = parser.parse_args()

    match_pdfs(args.input_file, args.output_file, args.pdf_dir)
