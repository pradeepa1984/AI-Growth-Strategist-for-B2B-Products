import re
from urllib.parse import urlparse, urlunparse


def normalize_url(url: str) -> str:
    """
    Normalize a URL for use as a consistent cache key.
    - Strips whitespace
    - Lowercases the domain
    - Removes www. prefix
    - Ensures https scheme
    - Removes trailing slashes from path
    - Drops query params and fragments
    """
    url = url.strip()

    if not re.match(r"^https?://", url, re.IGNORECASE):
        url = "https://" + url

    parsed = urlparse(url)
    netloc = parsed.netloc.lower().removeprefix("www.")
    path   = parsed.path.rstrip("/")

    return urlunparse(("https", netloc, path or "/", "", "", ""))
