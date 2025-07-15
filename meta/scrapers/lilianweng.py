import re
from typing import List
import requests
from bs4 import BeautifulSoup
from .base import BaseScraper, ScrapedMeta
from . import register_scraper


BASE_URL = "https://lilianweng.github.io"
ARCHIVE_URL = BASE_URL  # homepage already lists posts chronologically


@register_scraper("lilianweng")
class LilianWengScraper(BaseScraper):
    def __init__(self):
        super().__init__()

    def fetch_index(self) -> List[ScrapedMeta]:
        if self.scraped_metas:
            return self.scraped_metas  # cache

        resp = requests.get(ARCHIVE_URL, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        articles = soup.find_all("article")
        for art in articles:
            a_tag = art.find("a")
            if not a_tag:
                continue
            url = a_tag.get("href")
            if not url:
                continue
            if not url.startswith("http"):
                url = BASE_URL.rstrip("/") + url
            title = a_tag.text.strip()
            # summary = first paragraph inside article if exists
            summary = ""
            p_tag = art.find("p")
            if p_tag:
                summary = p_tag.text.strip()
            # derive id from url
            ref_id = re.sub(r"[^a-zA-Z0-9_-]", "", url.split("/")[-1])
            meta = ScrapedMeta(
                id=ref_id,
                title=title,
                url=url,
                summary=summary,
                date=None,
                source="lilianweng",
            )
            self.scraped_metas.append(meta)
        print(
            f"[PASS] >>> scraped {len(self.scraped_metas)} posts from lilianweng blog"
        )
        return self.scraped_metas

    def fetch_article(self, url: str) -> str:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        # Basic clean: keep only main article content
        content_div = soup.find("article") or soup
        # Remove scripts/styles
        for tag in content_div(["script", "style", "noscript", "img", "svg", "figure"]):
            tag.decompose()
        text = content_div.get_text("\n", strip=True)
        return text

    def fetch_title(self, url: str) -> str:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        title = soup.find("h1").text.strip()
        return title
