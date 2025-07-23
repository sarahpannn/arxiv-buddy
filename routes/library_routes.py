from library import library_page, add_paper_page, add_paper, remove_paper


def register_library_routes(rt):
    """Register library-related routes"""
    
    @rt("/library")
    def library_route(session):
        return library_page(session)

    @rt("/add_paper", methods=["GET", "POST"])
    async def add_paper_route(request):
        print(f"=== ADD PAPER ROUTE CALLED ===")
        print(f"Request method: {request.method}")

        if request.method == "GET":
            print("Handling GET request")
            session = request.session if hasattr(request, "session") else {}
            return add_paper_page(session)

        elif request.method == "POST":
            print("=== HANDLING POST REQUEST ===")

            try:
                # Check if it's a FastHTML request with form data
                if hasattr(request, "form"):
                    form_data = await request.form()
                    arxiv_url = form_data.get("arxiv_url")
                    notes = form_data.get("notes", "")
                else:
                    # Try to get from query params as fallback
                    arxiv_url = request.query_params.get("arxiv_url")
                    notes = request.query_params.get("notes", "")

                print(f"ArXiv URL: {arxiv_url}")
                print(f"Notes: {notes}")

                session = request.session if hasattr(request, "session") else {}
                print(f"Session: {session}")

                if not arxiv_url:
                    print("No arxiv_url provided")
                    return "No ArXiv URL provided"

                return add_paper(arxiv_url, notes, session)

            except Exception as e:
                print(f"Error handling POST: {e}")
                import traceback
                traceback.print_exc()
                return f"Error: {e}"

    @rt("/library/{item_id}", methods=["DELETE"])
    def remove_paper_route(item_id: int, session):
        return remove_paper(item_id, session)