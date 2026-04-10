import os
from pathlib import Path
from dotenv import load_dotenv
from firecrawl import V1FirecrawlApp

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")


def get_firecrawl_app() -> V1FirecrawlApp:
    api_key = os.getenv("FIRECRAWL_API_KEY", "").strip()
    if not api_key:
        raise ValueError("FIRECRAWL_API_KEY is not set or empty")
    return V1FirecrawlApp(api_key=api_key)
