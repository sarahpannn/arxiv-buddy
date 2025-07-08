from typing import List, Dict
import requests
from xml.etree import ElementTree as ET

from embeddings import get_embedding, cosine_similarity
from scrapers import SCRAPER_REGISTRY


def _fetch_arxiv_meta(paper_id: str) -> Dict:
    url = f"https://export.arxiv.org/api/query?search_query=id:{paper_id}&max_results=1"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    root = ET.fromstring(resp.text)
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    entry = root.find("atom:entry", ns)
    if entry is None:
        raise ValueError("paper not found on arXiv")
    title = entry.find("atom:title", ns).text.strip().replace("\n", " ")
    summary = entry.find("atom:summary", ns).text.strip().replace("\n", " ")
    return {"title": title, "summary": summary}


def get_recommendations(paper_id: str, top_n: int = 10) -> List[Dict]:
    """Return list of recommendation dicts sorted by similarity."""
    paper_meta = _fetch_arxiv_meta(paper_id)
    paper_embedding, _ = get_embedding(
        paper_meta["title"] + "\n" + paper_meta["summary"]
    )

    candidates: List[Dict] = []
    for source_name, scraper in SCRAPER_REGISTRY.items():
        try:
            metas = scraper.fetch_index()
        except Exception as e:
            print(f"[ERROR] >>> scraper {source_name} failed: {e}")
            continue
        for meta in metas:
            emb, _ = get_embedding(meta.title + "\n" + meta.summary)
            score = cosine_similarity(paper_embedding, emb)
            candidates.append(
                {
                    "source": source_name,
                    "id": meta.id,
                    "title": meta.title,
                    "url": meta.url,
                    "summary": meta.summary,
                    "score": score,
                }
            )

    # sort by score descending
    ranked = sorted(candidates, key=lambda x: x["score"], reverse=True)[:top_n]
    print(f"[PASS] >>> generated {len(ranked)} recommendations for paper {paper_id}")
    return ranked
