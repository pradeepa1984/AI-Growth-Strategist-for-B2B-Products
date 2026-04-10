from utils.firecrawl_client import get_firecrawl_app


def crawl_website(url: str) -> dict:
    app = get_firecrawl_app()

    result = app.scrape_url(url, formats=["markdown"])

    markdown = result.markdown or ""
    title = result.title or ""
    page_url = result.url or url
    preview = markdown[:500]

    return {
        "url": page_url,
        "title": title,
        "markdown": markdown,
        "preview": preview,
    }
