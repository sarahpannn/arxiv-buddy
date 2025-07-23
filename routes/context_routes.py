from starlette.responses import JSONResponse
from recommender import get_recommendations
from context_manager import get_context_manager
from meta.scrapers import get_scraper


def register_context_routes(rt):
    """Register context and recommendation routes"""
    
    @rt("/api/recommendations/{paper_id}")
    def recommendations_route(paper_id: str):
        try:
            recs = get_recommendations(paper_id)
            return JSONResponse(recs)
        except Exception as e:
            print(f"[ERROR] >>> recommendations failed: {e}")
            return JSONResponse({"error": str(e)}, status_code=500)

    @rt("/api/context/add", methods=["POST"])
    async def add_context_route(request):
        data = await request.json()
        items = data.get("items", [])
        if not isinstance(items, list):
            return JSONResponse({"error": "items must be a list"}, status_code=400)

        cm = get_context_manager()
        added = 0
        for item in items:
            source = item.get("source")
            url = item.get("url")
            ref_id = item.get("id")
            title = item.get("title")
            if not all([source, url, ref_id, title]):
                continue
            scraper = get_scraper(source)
            if scraper is None:
                print(f"[ERROR] >>> unknown scraper {source}")
                continue
            try:
                content = scraper.fetch_article(url)
            except Exception as e:
                print(f"[ERROR] >>> failed fetching article {url}: {e}")
                continue
            from embeddings import get_embedding

            emb, _ = get_embedding(content[:4096])  # truncate long content for embedding
            cm.add_item(source, ref_id, title, url, content, emb)
            added += 1

        return JSONResponse({"added": added})

    @rt("/api/get_title")
    def get_title_route(source: str, url: str):
        scraper = get_scraper(source)
        if scraper is None:
            return JSONResponse({"error": "unknown source"}, status_code=400)
        try:
            title = scraper.fetch_title(url)
            return {"title": title}
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=500)