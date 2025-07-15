import re
from typing import List
import requests
from bs4 import BeautifulSoup
from .base import BaseScraper, ScrapedMeta
from . import register_scraper


BASE_URL = "https://hunch.net"
ARCHIVE_URL = BASE_URL  # homepage lists posts chronologically


@register_scraper("hunch")
class HunchScraper(BaseScraper):
    def __init__(self):
        super().__init__()

    def fetch_index(self) -> List[ScrapedMeta]:
        if self.scraped_metas:
            return self.scraped_metas  # cache

        resp = requests.get(ARCHIVE_URL, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # find all post articles on the main page
        articles = soup.find_all("article")

        for art in articles:
            # get the post title and link
            header = art.find("header", class_="entry-header")
            if not header:
                continue

            # look for h3 title (not h2)
            title_elem = header.find("h3")
            if not title_elem:
                continue

            # find the link to the post
            a_tag = header.find("a")
            if not a_tag:
                continue

            url = a_tag.get("href")
            if not url:
                continue

            # ensure full url
            if not url.startswith("http"):
                url = BASE_URL.rstrip("/") + url

            title = title_elem.text.strip()

            # get post date from time element
            date_elem = art.find("time")
            date = date_elem.get("datetime") if date_elem else None

            # get summary from first paragraph of content
            summary = ""
            content_div = art.find("div", class_="entry-content")
            if content_div:
                p_tag = content_div.find("p")
                if p_tag:
                    summary = (
                        p_tag.text.strip()[:200] + "..."
                        if len(p_tag.text.strip()) > 200
                        else p_tag.text.strip()
                    )

            # derive id from url parameters
            ref_id = ""
            if "?p=" in url:
                ref_id = url.split("?p=")[-1]
            else:
                ref_id = re.sub(r"[^a-zA-Z0-9_-]", "", url.split("/")[-1])

            if not ref_id:
                ref_id = re.sub(r"[^a-zA-Z0-9_-]", "", title.lower().replace(" ", "-"))

            meta = ScrapedMeta(
                id=ref_id,
                title=title,
                url=url,
                summary=summary,
                date=date,
                source="hunch",
            )
            self.scraped_metas.append(meta)

        print(f"[PASS] >>> scraped {len(self.scraped_metas)} posts from hunch.net")
        return self.scraped_metas

    def fetch_article(self, url: str) -> str:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # find main article content
        content_div = soup.find("div", class_="entry-content") or soup.find("article")
        if not content_div:
            content_div = soup

        # remove scripts, styles, and other non-content elements
        for tag in content_div(
            [
                "script",
                "style",
                "noscript",
                "img",
                "svg",
                "figure",
                "nav",
                "footer",
                "header",
            ]
        ):
            tag.decompose()

        # also remove comment sections and navigation
        for tag in content_div(
            ["div"], class_=["nav-links", "comments", "wp-block-navigation"]
        ):
            tag.decompose()

        text = content_div.get_text("\n", strip=True)
        return text

    def fetch_title(self, url: str) -> str:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # try to find title in various places
        title_elem = (
            soup.find("h1", class_="entry-title")
            or soup.find("h1")
            or soup.find("title")
        )

        if title_elem:
            title = title_elem.text.strip()
            # clean up title if it contains site name
            if " – " in title:
                title = title.split(" – ")[0].strip()
            return title

        return "Untitled"
