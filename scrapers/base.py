from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Dict


@dataclass
class ScrapedMeta:
    id: str
    title: str
    url: str
    summary: str
    date: str | None = None
    source: str | None = None


class BaseScraper(ABC):
    """Abstract base class for scrapers."""

    @abstractmethod
    def fetch_index(self) -> List[ScrapedMeta]:
        """Return a list of post metadata objects."""

    @abstractmethod
    def fetch_article(self, url: str) -> str:
        """Given a URL, return cleaned full article text."""

    @abstractmethod
    def fetch_title(self, url: str) -> str:
        """Given a URL, return the title of the article."""

    def __init__(self):
        self.scraped_metas = []

    def add_scraped_meta(self, meta: ScrapedMeta):
        """Add a new ScrapedMeta object to the scraper's list."""
        self.scraped_metas.append(meta)

    def get_scraped_metas(self) -> List[ScrapedMeta]:
        """Get the list of ScrapedMeta objects stored in the scraper."""
        return self.scraped_metas
