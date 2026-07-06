import logging
import re

from ddgs import DDGS

from app.services import usage_tracker

logger = logging.getLogger("civilai.websearch")

# The frontend prefixes chat messages with e.g. "[Context: Predictive Analytics] "
# so the LLM knows which page the user is on. That tag is noise for a web search —
# it skews DuckDuckGo results toward the page name instead of the actual question.
_CONTEXT_TAG_RE = re.compile(r"^\[Context:[^\]]*\]\s*", re.IGNORECASE)


def build_search_query(message: str) -> str:
    """Strip the frontend's `[Context: ...]` page-tag prefix so the search query reflects only the user's actual question."""
    return _CONTEXT_TAG_RE.sub("", message).strip()


def search_web(query: str, max_results: int = 5) -> list[dict]:
    """Run a DuckDuckGo web search. Returns [{title, url, snippet}, ...] — never raises, returns [] on failure."""
    if not query or not query.strip():
        return []

    usage_tracker.add_web_search_call()
    try:
        results = DDGS().text(query, max_results=max_results)
    except Exception as exc:
        logger.warning("Web search failed for %r: %s", query, exc)
        return []

    return [
        {"title": r.get("title", ""), "url": r.get("href", ""), "snippet": r.get("body", "")}
        for r in results
        if r.get("href")
    ]


_MD_LINK_URL_RE = re.compile(r"\]\((https?://[^\s)]+)\)")


def filter_cited_sources(response_text: str, web_results: list[dict]) -> list[dict]:
    """
    Keep only the search results the model actually cited (as a markdown link) in its
    response — the model is instructed to silently ignore irrelevant results, so a raw
    result the model didn't cite is one it judged unrelated and shouldn't surface as a
    "source" chip in the UI.
    """
    cited_urls = set(_MD_LINK_URL_RE.findall(response_text))
    if not cited_urls:
        return []
    return [{"title": r["title"], "url": r["url"]} for r in web_results if r["url"] in cited_urls]
