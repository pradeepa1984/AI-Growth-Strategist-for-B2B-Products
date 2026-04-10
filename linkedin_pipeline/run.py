"""
run.py — Entry point.

Usage
-----
    # From the project root (AI_Growth_Strategist/):
    cd linkedin_pipeline
    python run.py

Options (edit config.py to change defaults, or use env-vars):
    SCRAPE_ENABLED=false python run.py   # skip scraping, classify only
"""

import sys
from pathlib import Path

# Allow imports from this directory without installing as a package
sys.path.insert(0, str(Path(__file__).parent))

from pipeline import run

if __name__ == "__main__":
    # Optional: pass a custom input file path as the first CLI argument
    input_file = sys.argv[1] if len(sys.argv) > 1 else None
    run(input_file)
