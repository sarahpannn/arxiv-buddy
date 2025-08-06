"""
Citation analysis routes for arxiv-buddy
Provides endpoints for citation network analysis and paper recommendations
"""

import json
import os
from starlette.responses import JSONResponse
from fasthtml.common import *

from services.citation_service import (
    get_paper_citation_analysis,
    get_most_influential_papers,
    get_most_relevant_papers,
)
from source_manager import get_source_manager
from models import papers_citation_analysis


def register_citation_routes(rt):
    """Register citation analysis routes"""

    @rt("/api/citations/{paper_id}/extract", methods=["POST"])
    async def extract_paper_citations(request):
        """
        Extract citation data from LaTeX source - simplified for frontend processing

        Returns: Raw citation and reference data from LaTeX parser
        """
        print(f"=== CITATION EXTRACTION ROUTE ===")

        try:
            path_params = request.path_params
            paper_id = path_params.get("paper_id")

            if not paper_id:
                return JSONResponse({"error": "paper_id required"}, status_code=400)

            print(f"extracting citations for paper: {paper_id}")

            # Get source directory for this paper
            source_manager = get_source_manager()
            source_dir = os.path.join(source_manager.sources_dir, paper_id)

            # Check if source files exist
            if not os.path.exists(source_dir):
                return JSONResponse(
                    {
                        "error": "source files not found",
                        "message": f"no latex source available for paper {paper_id}. please load the paper first to extract sources.",
                    },
                    status_code=404,
                )

            # Just extract LaTeX data - let frontend handle resolution
            from latex_parser import LaTeXParser

            parser = LaTeXParser(source_dir)
            citation_data = parser.parse_paper()

            return JSONResponse(
                {"success": True, "paper_id": paper_id, "citation_data": citation_data}
            )

        except Exception as e:
            print(f"[ERROR] citation extraction failed: {e}")
            import traceback

            traceback.print_exc()
            return JSONResponse({"error": str(e)}, status_code=500)

    # Note: Influential and relevant papers routes are deprecated
    # Citation analysis is now handled entirely in the frontend using
    # the existing citation_mapping data from window.latexData

    @rt("/api/citations/{paper_id}/summary", methods=["GET"])
    async def get_citation_summary(request):
        """
        Get citation analysis summary for a paper

        Returns: High-level metrics and analysis status
        """
        print(f"=== GET CITATION SUMMARY ===")

        try:
            path_params = request.path_params
            paper_id = path_params.get("paper_id")

            if not paper_id:
                return JSONResponse({"error": "paper_id required"}, status_code=400)

            print(f"getting citation summary for: {paper_id}")

            # Check if we have cached analysis
            cached_analysis = papers_citation_analysis(where=f"arxiv_id = '{paper_id}'")

            if not cached_analysis:
                return JSONResponse(
                    {
                        "success": True,
                        "paper_id": paper_id,
                        "has_analysis": False,
                        "message": "no citation analysis available. run analysis first.",
                    }
                )

            analysis_record = cached_analysis[0]
            # Convert to dict if it's not already
            if hasattr(analysis_record, "__dict__"):
                record_dict = analysis_record.__dict__
            elif hasattr(analysis_record, "_asdict"):
                record_dict = analysis_record._asdict()
            else:
                record_dict = dict(analysis_record)

            analysis_data = json.loads(record_dict["analysis_data"])

            summary = {
                "success": True,
                "paper_id": paper_id,
                "has_analysis": True,
                "computed_at": record_dict["computed_at"],
                "total_citations_found": record_dict["total_citations_found"],
                "resolved_citations": record_dict["resolved_citations"],
                "influence_score": record_dict["influence_score"],
                "analysis_summary": json.loads(record_dict["relevance_metrics"]),
                "top_influential": analysis_data["metrics"]["most_influential_papers"][
                    :3
                ],
                "top_relevant": analysis_data["metrics"]["most_relevant_papers"][:3],
            }

            return JSONResponse(summary)

        except Exception as e:
            print(f"[ERROR] getting citation summary failed: {e}")
            return JSONResponse({"error": str(e)}, status_code=500)

    @rt("/api/citations/{paper_id}/network", methods=["GET"])
    async def get_citation_network_data(request):
        """
        Get citation network data for visualization

        Returns: Nodes and edges for network visualization
        """
        print(f"=== GET CITATION NETWORK DATA ===")

        try:
            path_params = request.path_params
            paper_id = path_params.get("paper_id")

            if not paper_id:
                return JSONResponse({"error": "paper_id required"}, status_code=400)

            print(f"getting citation network data for: {paper_id}")

            # Get cached analysis
            cached_analysis = papers_citation_analysis(where=f"arxiv_id = '{paper_id}'")

            if not cached_analysis:
                return JSONResponse(
                    {"success": False, "error": "no citation analysis available"},
                    status_code=404,
                )

            analysis_record = cached_analysis[0]
            # Convert to dict if it's not already
            if hasattr(analysis_record, "__dict__"):
                record_dict = analysis_record.__dict__
            elif hasattr(analysis_record, "_asdict"):
                record_dict = analysis_record._asdict()
            else:
                record_dict = dict(analysis_record)

            analysis_data = json.loads(record_dict["analysis_data"])

            # Build network data for visualization
            nodes = []
            edges = []

            # Add the main paper as central node
            nodes.append(
                {
                    "id": paper_id,
                    "label": f"Paper {paper_id}",
                    "type": "main_paper",
                    "influence_score": record_dict["influence_score"],
                    "citations_count": record_dict["total_citations_found"],
                }
            )

            # Add cited papers as nodes
            for paper in analysis_data["metrics"]["most_influential_papers"]:
                nodes.append(
                    {
                        "id": paper["arxiv_id"],
                        "label": (
                            paper["title"][:50] + "..."
                            if len(paper["title"]) > 50
                            else paper["title"]
                        ),
                        "type": "cited_paper",
                        "influence_score": paper["influence_score"],
                        "local_citations": paper["local_citations"],
                        "published_date": paper["published_date"],
                    }
                )

                # Add edge from main paper to cited paper
                edges.append(
                    {
                        "source": paper_id,
                        "target": paper["arxiv_id"],
                        "weight": paper["local_citations"],
                        "type": "citation",
                    }
                )

            network_data = {
                "success": True,
                "paper_id": paper_id,
                "nodes": nodes,
                "edges": edges,
                "stats": {
                    "total_nodes": len(nodes),
                    "total_edges": len(edges),
                    "max_citations": (
                        max(edge["weight"] for edge in edges) if edges else 0
                    ),
                },
            }

            return JSONResponse(network_data)

        except Exception as e:
            print(f"[ERROR] getting citation network data failed: {e}")
            return JSONResponse({"error": str(e)}, status_code=500)
