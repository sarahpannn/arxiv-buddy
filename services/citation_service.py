"""
Citation analysis service for extracting and resolving citations from papers
Integrates with existing LaTeX parser and arXiv metadata fetching
"""

import json
import re
import requests
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import asdict

from models import citations_network, papers_metadata, papers_citation_analysis
from latex_parser import LaTeXParser
from config import supabase, claude_client, claude_msg


class CitationAnalysisService:
    """Main service for citation extraction and analysis"""

    def __init__(self):
        self.arxiv_api_base = "http://export.arxiv.org/api/query"
        self.cache_ttl_days = 30  # Cache arXiv metadata for 30 days

    async def analyze_paper_citations(
        self, arxiv_id: str, source_dir: str
    ) -> Dict[str, Any]:
        """
        Main entry point for citation analysis of a paper

        Args:
            arxiv_id: arXiv paper ID (e.g., "2309.15028")
            source_dir: Path to LaTeX source files

        Returns:
            Complete citation analysis including resolved citations and metrics
        """
        print(f"[INFO] starting citation analysis for paper {arxiv_id}")

        try:
            # 1. Extract citations from LaTeX source
            citation_data = await self._extract_citations_from_latex(
                arxiv_id, source_dir
            )

            # 2. Resolve citations to arXiv papers
            resolved_citations = await self._resolve_citations_batch(
                citation_data["citations"], citation_data["references"]
            )

            # 3. Fetch metadata for resolved papers
            metadata_results = await self._fetch_papers_metadata_batch(
                resolved_citations
            )

            # 4. Calculate influence and relevance metrics
            metrics = self._calculate_citation_metrics(
                resolved_citations, metadata_results
            )

            # 5. Store results in database
            await self._store_citation_analysis(
                arxiv_id,
                {
                    "citations": resolved_citations,
                    "metadata": metadata_results,
                    "metrics": metrics,
                    "citation_data": citation_data,
                },
            )

            print(f"[PASS] citation analysis completed for {arxiv_id}")
            return {
                "arxiv_id": arxiv_id,
                "total_citations": len(citation_data["citations"]),
                "resolved_citations": len(resolved_citations),
                "most_influential": metrics["most_influential_papers"][:10],
                "most_relevant": metrics["most_relevant_papers"][:10],
                "influence_score": metrics["overall_influence_score"],
                "analysis_summary": metrics["analysis_summary"],
            }

        except Exception as e:
            print(f"[ERROR] citation analysis failed for {arxiv_id}: {e}")
            import traceback

            traceback.print_exc()
            return {"error": str(e), "arxiv_id": arxiv_id}

    async def _extract_citations_from_latex(
        self, arxiv_id: str, source_dir: str
    ) -> Dict[str, Any]:
        """Extract citations using existing LaTeX parser"""
        print(f"[INFO] extracting citations from latex source in {source_dir}")

        try:
            parser = LaTeXParser(source_dir)
            citation_data = parser.parse_paper()

            print(
                f"[PASS] found {len(citation_data['citations'])} citations and {len(citation_data['references'])} references"
            )
            return citation_data

        except Exception as e:
            print(f"[ERROR] latex parsing failed: {e}")
            raise

    async def _resolve_citations_batch(
        self, citations: List[Dict], references: Dict[str, Dict]
    ) -> List[Dict]:
        """
        Resolve citation keys to actual arXiv papers using AI and pattern matching

        Args:
            citations: List of citation objects from LaTeX parser
            references: Dictionary of reference objects from LaTeX parser

        Returns:
            List of resolved citations with arXiv IDs when found
        """
        print(f"[INFO] resolving {len(citations)} citations using AI assistance")

        resolved_citations = []

        for citation in citations:
            citation_key = citation["key"]

            # Get the reference entry for this citation
            reference = references.get(citation_key, {})
            if not reference:
                print(f"[WARNING] no reference found for citation key: {citation_key}")
                continue

            # Try to resolve this citation to an arXiv ID
            resolved_arxiv_id = await self._resolve_single_citation(reference)

            resolved_citation = {
                "citation_key": citation_key,
                "citation_context": citation.get("context", ""),
                "citation_command": citation.get("command", ""),
                "raw_reference": reference.get("raw_entry", ""),
                "file_name": citation.get("file_name", ""),
                "line_number": citation.get("line_number", 0),
                "resolved_arxiv_id": resolved_arxiv_id,
                "confidence_score": 0.0,  # Will be updated by resolution process
                "resolution_method": "unknown",
            }

            resolved_citations.append(resolved_citation)

        print(
            f"[PASS] resolved {sum(1 for c in resolved_citations if c['resolved_arxiv_id'])} out of {len(resolved_citations)} citations"
        )
        return resolved_citations

    async def _resolve_single_citation(self, reference: Dict) -> Optional[str]:
        """
        Resolve a single reference to an arXiv ID using multiple strategies

        Args:
            reference: Reference object from LaTeX parser

        Returns:
            arXiv ID if found, None otherwise
        """
        raw_entry = reference.get("raw_entry", "")
        title = reference.get("title", "")
        authors = reference.get("authors", "")

        # Strategy 1: Look for arXiv ID patterns in raw entry
        arxiv_patterns = [
            r"arXiv:(\d{4}\.\d{4,5})",
            r"arxiv\.org/abs/(\d{4}\.\d{4,5})",
            r"(\d{4}\.\d{4,5})",  # Simple pattern as fallback
        ]

        for pattern in arxiv_patterns:
            matches = re.findall(pattern, raw_entry, re.IGNORECASE)
            if matches:
                arxiv_id = matches[0]
                # Validate format
                if re.match(r"\d{4}\.\d{4,5}", arxiv_id):
                    print(f"[PASS] found arxiv id via pattern: {arxiv_id}")
                    return arxiv_id

        # TODO: Add more sophisticated citation resolution methods
        # - DOI lookup and resolution
        # - Title/author matching against arXiv database
        # - Venue/conference paper matching
        # - Citation database lookup (Semantic Scholar, CrossRef, etc.)

        print(f"[WARNING] could not resolve reference: {raw_entry[:100]}...")
        return None

    async def _fetch_papers_metadata_batch(
        self, resolved_citations: List[Dict]
    ) -> Dict[str, Dict]:
        """
        Fetch metadata for all resolved arXiv papers

        Args:
            resolved_citations: List of citations with resolved arXiv IDs

        Returns:
            Dictionary mapping arXiv IDs to their metadata
        """
        # Get unique arXiv IDs that were successfully resolved
        arxiv_ids = list(
            set(
                c["resolved_arxiv_id"]
                for c in resolved_citations
                if c["resolved_arxiv_id"]
            )
        )

        if not arxiv_ids:
            print("[WARNING] no arxiv ids to fetch metadata for")
            return {}

        print(f"[INFO] fetching metadata for {len(arxiv_ids)} unique papers")

        metadata_results = {}
        for arxiv_id in arxiv_ids:
            try:
                metadata = await self._fetch_single_paper_metadata(arxiv_id)
                if metadata:
                    metadata_results[arxiv_id] = metadata
            except Exception as e:
                print(f"[ERROR] failed to fetch metadata for {arxiv_id}: {e}")
                continue

        print(
            f"[PASS] successfully fetched metadata for {len(metadata_results)} papers"
        )
        return metadata_results

    async def _fetch_single_paper_metadata(self, arxiv_id: str) -> Optional[Dict]:
        """
        Fetch metadata for a single arXiv paper, using cache when possible

        Args:
            arxiv_id: arXiv paper ID

        Returns:
            Paper metadata dictionary or None if failed
        """
        # Check if we have recent cached data
        cached_data = self._get_cached_metadata(arxiv_id)
        if cached_data:
            print(f"[PASS] using cached metadata for {arxiv_id}")
            return cached_data

        # Fetch from arXiv API
        try:
            print(f"[INFO] fetching fresh metadata for {arxiv_id}")

            # Query arXiv API
            params = {"search_query": f"id:{arxiv_id}", "start": 0, "max_results": 1}

            response = requests.get(self.arxiv_api_base, params=params, timeout=10)
            response.raise_for_status()

            # Parse XML response (simplified - you might want to use xml.etree.ElementTree)
            content = response.text

            # Extract basic info (this is a simplified parser - consider using xml.etree.ElementTree)
            metadata = self._parse_arxiv_xml_response(content, arxiv_id)

            if metadata:
                # Cache the result
                self._cache_metadata(arxiv_id, metadata)
                return metadata

        except Exception as e:
            print(f"[ERROR] failed to fetch metadata for {arxiv_id}: {e}")

        return None

    def _parse_arxiv_xml_response(
        self, xml_content: str, arxiv_id: str
    ) -> Optional[Dict]:
        """
        Parse arXiv API XML response to extract paper metadata
        (Simplified version - consider using xml.etree.ElementTree for production)
        """
        try:
            # Extract title
            title_match = re.search(
                r"<title>([^<]+)</title>", xml_content, re.IGNORECASE
            )
            title = title_match.group(1).strip() if title_match else ""

            # Extract summary/abstract
            summary_match = re.search(
                r"<summary>([^<]+)</summary>", xml_content, re.IGNORECASE
            )
            abstract = summary_match.group(1).strip() if summary_match else ""

            # Extract authors (simplified)
            authors_pattern = r"<name>([^<]+)</name>"
            authors = re.findall(authors_pattern, xml_content, re.IGNORECASE)

            # Extract published date
            published_match = re.search(
                r"<published>([^<]+)</published>", xml_content, re.IGNORECASE
            )
            published_date = published_match.group(1).strip() if published_match else ""

            # Extract categories
            category_pattern = r'<category term="([^"]+)"'
            categories = re.findall(category_pattern, xml_content, re.IGNORECASE)

            if title:  # At minimum we need a title
                return {
                    "arxiv_id": arxiv_id,
                    "title": title,
                    "authors": json.dumps(authors),
                    "abstract": abstract,
                    "categories": json.dumps(categories),
                    "published_date": published_date,
                    "updated_date": "",
                    "doi": "",
                    "journal_ref": "",
                    "comment": "",
                    "fetched_at": datetime.now().isoformat(),
                    "is_active": True,
                }

        except Exception as e:
            print(f"[ERROR] failed to parse arxiv xml for {arxiv_id}: {e}")

        return None

    def _get_cached_metadata(self, arxiv_id: str) -> Optional[Dict]:
        """Check if we have recent cached metadata for this paper"""
        try:
            cached = papers_metadata(where=f"arxiv_id = '{arxiv_id}'")
            if cached:
                cached_entry = cached[0]
                # Convert to dict if it's not already
                if hasattr(cached_entry, "__dict__"):
                    cached_dict = cached_entry.__dict__
                elif hasattr(cached_entry, "_asdict"):
                    cached_dict = cached_entry._asdict()
                else:
                    cached_dict = dict(cached_entry)

                fetched_at = datetime.fromisoformat(cached_dict["fetched_at"])

                # Check if cache is still valid
                if datetime.now() - fetched_at < timedelta(days=self.cache_ttl_days):
                    return cached_dict

        except Exception as e:
            print(f"[WARNING] error checking cache for {arxiv_id}: {e}")

        return None

    def _cache_metadata(self, arxiv_id: str, metadata: Dict):
        """Store metadata in cache"""
        try:
            # Use upsert to handle existing records
            papers_metadata.upsert(metadata, pk="arxiv_id")
            print(f"[PASS] cached metadata for {arxiv_id}")
        except Exception as e:
            print(f"[WARNING] failed to cache metadata for {arxiv_id}: {e}")

    def _calculate_citation_metrics(
        self, resolved_citations: List[Dict], metadata_results: Dict[str, Dict]
    ) -> Dict[str, Any]:
        """
        Calculate influence and relevance metrics for cited papers

        Args:
            resolved_citations: List of resolved citations
            metadata_results: Metadata for resolved papers

        Returns:
            Dictionary with calculated metrics and rankings
        """
        print(
            f"[INFO] calculating citation metrics for {len(resolved_citations)} citations"
        )

        # Count citations per paper
        citation_counts = {}
        for citation in resolved_citations:
            arxiv_id = citation.get("resolved_arxiv_id")
            if arxiv_id:
                citation_counts[arxiv_id] = citation_counts.get(arxiv_id, 0) + 1

        # Create paper rankings
        papers_with_metrics = []

        for arxiv_id, local_citation_count in citation_counts.items():
            metadata = metadata_results.get(arxiv_id, {})

            # Calculate metrics
            title = metadata.get("title", "Unknown Title")
            authors = json.loads(metadata.get("authors", "[]"))
            published_date = metadata.get("published_date", "")
            categories = json.loads(metadata.get("categories", "[]"))

            # Calculate recency bonus (newer papers get slight boost)
            recency_score = self._calculate_recency_score(published_date)

            # Calculate category relevance (papers in ML/CS get boost for now)
            category_score = self._calculate_category_relevance(categories)

            # Hybrid influence score: local citations + recency + category relevance
            influence_score = (
                local_citation_count * 2.0  # Local citation count (most important)
                + recency_score * 0.3  # Recency bonus
                + category_score * 0.2  # Category relevance
            )

            # Relevance score: how often cited + context diversity
            relevance_score = local_citation_count * 1.5 + recency_score * 0.5

            papers_with_metrics.append(
                {
                    "arxiv_id": arxiv_id,
                    "title": title,
                    "authors": authors,
                    "local_citations": local_citation_count,
                    "influence_score": influence_score,
                    "relevance_score": relevance_score,
                    "published_date": published_date,
                    "categories": categories,
                    "abstract": (
                        metadata.get("abstract", "")[:300] + "..."
                        if metadata.get("abstract")
                        else ""
                    ),
                }
            )

        # Sort by different metrics
        most_influential = sorted(
            papers_with_metrics, key=lambda x: x["influence_score"], reverse=True
        )
        most_relevant = sorted(
            papers_with_metrics, key=lambda x: x["relevance_score"], reverse=True
        )
        most_cited_locally = sorted(
            papers_with_metrics, key=lambda x: x["local_citations"], reverse=True
        )

        # Calculate overall influence score for the citing paper
        overall_influence = sum(
            p["influence_score"] for p in papers_with_metrics
        ) / max(len(papers_with_metrics), 1)

        analysis_summary = {
            "total_unique_papers_cited": len(papers_with_metrics),
            "most_cited_locally": (
                most_cited_locally[0]["local_citations"] if most_cited_locally else 0
            ),
            "average_citations_per_paper": sum(citation_counts.values())
            / max(len(citation_counts), 1),
            "citation_diversity": len(
                citation_counts
            ),  # How many different papers cited
        }

        print(f"[PASS] calculated metrics for {len(papers_with_metrics)} papers")

        return {
            "most_influential_papers": most_influential,
            "most_relevant_papers": most_relevant,
            "most_cited_locally": most_cited_locally,
            "overall_influence_score": overall_influence,
            "analysis_summary": analysis_summary,
        }

    def _calculate_recency_score(self, published_date: str) -> float:
        """Calculate recency score (newer papers get higher scores)"""
        try:
            if not published_date:
                return 0.0

            # Parse date (simplified - assumes YYYY-MM-DD format)
            pub_date = datetime.fromisoformat(published_date.split("T")[0])
            years_old = (datetime.now() - pub_date).days / 365.0

            # Recency score: 1.0 for current year, decreasing by 0.1 per year
            return max(0.0, 1.0 - years_old * 0.1)

        except Exception:
            return 0.0

    def _calculate_category_relevance(self, categories: List[str]) -> float:
        """Calculate category relevance score"""
        # Define relevant categories (this could be made configurable)
        high_relevance = ["cs.LG", "cs.AI", "cs.CL", "cs.CV", "stat.ML"]
        medium_relevance = ["cs.IR", "cs.NE", "cs.HC", "cs.RO"]

        score = 0.0
        for category in categories:
            if category in high_relevance:
                score += 1.0
            elif category in medium_relevance:
                score += 0.5
            else:
                score += 0.1  # Small bonus for any category

        return min(score, 2.0)  # Cap at 2.0

    async def _store_citation_analysis(self, arxiv_id: str, analysis_data: Dict):
        """Store citation analysis results in database"""
        try:
            analysis_record = {
                "arxiv_id": arxiv_id,
                "total_citations_found": len(analysis_data["citations"]),
                "resolved_citations": len(
                    [
                        c
                        for c in analysis_data["citations"]
                        if c.get("resolved_arxiv_id")
                    ]
                ),
                "analysis_data": json.dumps(analysis_data),
                "influence_score": analysis_data["metrics"]["overall_influence_score"],
                "relevance_metrics": json.dumps(
                    analysis_data["metrics"]["analysis_summary"]
                ),
                "computed_at": datetime.now().isoformat(),
                "latex_parsed": True,
            }

            # Use upsert to handle existing records
            papers_citation_analysis.upsert(analysis_record, pk="arxiv_id")

            # Store individual citation relationships
            for citation in analysis_data["citations"]:
                if citation.get("resolved_arxiv_id"):
                    citation_record = {
                        "citing_paper_id": arxiv_id,
                        "cited_paper_id": citation["resolved_arxiv_id"],
                        "citation_key": citation["citation_key"],
                        "citation_context": citation["citation_context"],
                        "citation_command": citation["citation_command"],
                        "raw_reference": citation["raw_reference"],
                        "confidence_score": citation.get("confidence_score", 0.0),
                        "resolved_at": datetime.now().isoformat(),
                        "file_name": citation["file_name"],
                        "line_number": citation["line_number"],
                    }

                    # Use upsert for citation relationships (they should be unique by combination)
                    # Note: citations_network doesn't have a simple primary key, so we use insert with ignore
                    try:
                        citations_network.insert(citation_record)
                    except Exception:
                        # Skip if already exists (duplicate citation relationship)
                        pass

            print(f"[PASS] stored citation analysis for {arxiv_id}")

        except Exception as e:
            print(f"[ERROR] failed to store citation analysis: {e}")
            import traceback

            traceback.print_exc()


# Singleton instance
citation_service = CitationAnalysisService()


async def get_paper_citation_analysis(arxiv_id: str, source_dir: str) -> Dict[str, Any]:
    """
    Main entry point for getting citation analysis for a paper

    Args:
        arxiv_id: arXiv paper ID
        source_dir: Path to LaTeX source files

    Returns:
        Citation analysis results
    """
    return await citation_service.analyze_paper_citations(arxiv_id, source_dir)


async def get_most_influential_papers(arxiv_id: str, limit: int = 10) -> List[Dict]:
    """
    Get most influential papers cited by a given paper

    Args:
        arxiv_id: arXiv paper ID
        limit: Maximum number of papers to return

    Returns:
        List of most influential cited papers
    """
    try:
        # Get cached analysis
        cached = papers_citation_analysis(where=f"arxiv_id = '{arxiv_id}'")
        if not cached:
            return []

        cached_entry = cached[0]
        # Convert to dict if it's not already
        if hasattr(cached_entry, "__dict__"):
            cached_dict = cached_entry.__dict__
        elif hasattr(cached_entry, "_asdict"):
            cached_dict = cached_entry._asdict()
        else:
            cached_dict = dict(cached_entry)

        analysis_data = json.loads(cached_dict["analysis_data"])
        most_influential = analysis_data["metrics"]["most_influential_papers"]

        return most_influential[:limit]

    except Exception as e:
        print(f"[ERROR] failed to get influential papers: {e}")
        return []


async def get_most_relevant_papers(arxiv_id: str, limit: int = 10) -> List[Dict]:
    """
    Get most relevant papers cited by a given paper

    Args:
        arxiv_id: arXiv paper ID
        limit: Maximum number of papers to return

    Returns:
        List of most relevant cited papers
    """
    try:
        # Get cached analysis
        cached = papers_citation_analysis(where=f"arxiv_id = '{arxiv_id}'")
        if not cached:
            return []

        cached_entry = cached[0]
        # Convert to dict if it's not already
        if hasattr(cached_entry, "__dict__"):
            cached_dict = cached_entry.__dict__
        elif hasattr(cached_entry, "_asdict"):
            cached_dict = cached_entry._asdict()
        else:
            cached_dict = dict(cached_entry)

        analysis_data = json.loads(cached_dict["analysis_data"])
        most_relevant = analysis_data["metrics"]["most_relevant_papers"]

        return most_relevant[:limit]

    except Exception as e:
        print(f"[ERROR] failed to get relevant papers: {e}")
        return []
