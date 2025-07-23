from starlette.responses import JSONResponse
from source_manager import get_source_manager
from services.paper_service import load_paper_content


def register_paper_routes(rt):
    """Register paper-related routes"""
    
    @rt("/load_paper", methods=["GET", "POST"])
    async def load_paper_route(request):
        """Handle both GET (from library) and POST (from main form)"""
        print(f"=== LOAD PAPER ROUTE ===")
        print(f"Method: {request.method}")

        session = request.session if hasattr(request, "session") else {}

        if request.method == "GET":
            # From library - expecting arxiv_id in query params
            arxiv_id = request.query_params.get("arxiv_id")
            print(f"GET - arXiv ID: {arxiv_id}")

            if arxiv_id:
                arxiv_url = f"https://arxiv.org/abs/{arxiv_id}"
                return load_paper_content(arxiv_url, session)
            else:
                return "No arXiv ID provided"

        elif request.method == "POST":
            # From main form - expecting arxiv_url in form data
            try:
                form_data = await request.form()
                arxiv_url = form_data.get("arxiv_url")
                print(f"POST - arXiv URL: {arxiv_url}")

                if arxiv_url:
                    return load_paper_content(arxiv_url, session)
                else:
                    return "No arXiv URL provided"
            except Exception as e:
                print(f"Error getting form data: {e}")
                return f"Error: {e}"

    @rt("/api/paper/{paper_id}/latex", methods=["GET"])
    def get_latex_data_route(paper_id: str):
        """API endpoint to get parsed LaTeX data for a paper"""
        try:
            source_manager = get_source_manager()
            parsed_data = source_manager.parse_latex_content(paper_id)

            if parsed_data:
                return {"success": True, "paper_id": paper_id, "data": parsed_data}
            else:
                return {
                    "success": False,
                    "paper_id": paper_id,
                    "error": "No LaTeX data available (paper may not have source files)",
                }
        except Exception as e:
            return {"success": False, "paper_id": paper_id, "error": str(e)}