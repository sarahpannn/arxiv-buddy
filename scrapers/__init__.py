"""Scraper registry to discover and use different source scrapers."""

from typing import Dict, List

SCRAPER_REGISTRY: Dict[str, "BaseScraper"] = {}


def register_scraper(name: str):
    """Decorator to register a scraper class"""

    def decorator(cls):
        SCRAPER_REGISTRY[name] = cls()
        return cls

    return decorator


def get_scraper(name: str):
    return SCRAPER_REGISTRY.get(name)


# Import built-in scrapers so they self-register
from . import lilianweng  # noqa: E402,F401
from . import hunch  # noqa: E402,F401
