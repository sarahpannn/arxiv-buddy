from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from config import supabase, get_claude_msg
from embeddings import get_embedding
from claudette import Chat
from msglm import mk_msg

# Simple in-memory cache for search results
_search_cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_MINUTES = 15
MAX_CACHE_SIZE = 100

# Track sources used in the current conversation
_current_sources_used = []


def _get_cache_key(query: str, limit: int, match_threshold: float) -> str:
    """Generate cache key for search parameters"""
    return f"{query.lower().strip()}:{limit}:{match_threshold}"


def _is_cache_valid(timestamp: datetime) -> bool:
    """Check if cached result is still valid"""
    return datetime.now() - timestamp < timedelta(minutes=CACHE_TTL_MINUTES)


def _clean_cache():
    """Remove expired entries and limit cache size"""
    global _search_cache
    current_time = datetime.now()

    # Remove expired entries
    _search_cache = {
        k: v for k, v in _search_cache.items() if _is_cache_valid(v["timestamp"])
    }

    # Limit cache size (remove oldest entries)
    if len(_search_cache) > MAX_CACHE_SIZE:
        sorted_items = sorted(_search_cache.items(), key=lambda x: x[1]["timestamp"])
        _search_cache = dict(sorted_items[-MAX_CACHE_SIZE:])


def search_vectorized_sources(
    query: str,
    limit: int = 5,
    match_threshold: float = -0.7,
    use_approximate: bool = True,
    timeout_seconds: int = 15,  # Increased timeout
) -> List[Dict[str, Any]]:
    """
    Search through vectorized sources using pgvector with approximate nearest neighbor.

    Features:
    - Fast HNSW approximate nearest neighbor search for performance
    - Timeout handling with graceful fallback
    - Result caching to avoid repeated searches
    - Fallback to keyword search if vector search fails

    Args:
        query: Search query string
        limit: Maximum number of results to return
        match_threshold: Similarity threshold (lower = more strict)
        use_approximate: Use approximate search (HNSW/IVFFlat) vs exact search
        timeout_seconds: Maximum time to wait for vector search (increased for IVFFlat)
    """
    if not supabase:
        print("[WARNING] supabase client not available")
        return []

    # Check cache first
    cache_key = _get_cache_key(query, limit, match_threshold)
    if cache_key in _search_cache and _is_cache_valid(
        _search_cache[cache_key]["timestamp"]
    ):
        print(f"[PASS] returning cached results for query: {query}")
        return _search_cache[cache_key]["results"]

    try:
        print(f"[INFO] searching vectorized sources for: {query}")
        _clean_cache()  # Clean cache periodically

        # Generate query embedding
        query_embedding, token_count = get_embedding(query)
        if not query_embedding:
            print("[ERROR] failed to generate query embedding")
            return _fallback_keyword_search(query, limit)

        print(f"[INFO] generated embedding with {token_count} tokens")

        # Try pgvector approximate nearest neighbor search with timeout
        vector_results = _try_vector_search_with_timeout(
            query_embedding, limit, match_threshold, use_approximate, timeout_seconds
        )

        if vector_results:
            # Cache successful results
            _search_cache[cache_key] = {
                "results": vector_results,
                "timestamp": datetime.now(),
            }
            # Track sources for current conversation
            _current_sources_used.extend(vector_results)
            return vector_results

        # Fallback to keyword search if vector search failed
        print("[INFO] vector search failed, falling back to keyword search")
        fallback_results = _fallback_keyword_search(query, limit)
        if fallback_results:
            _current_sources_used.extend(fallback_results)
        return fallback_results

    except Exception as e:
        print(f"[ERROR] search error: {e}")
        fallback_results = _fallback_keyword_search(query, limit)
        if fallback_results:
            _current_sources_used.extend(fallback_results)
        return fallback_results


def _try_vector_search_with_timeout(
    query_embedding: List[float],
    limit: int,
    match_threshold: float,
    use_approximate: bool,
    timeout_seconds: int,  # Kept for API compatibility even though not used
) -> Optional[List[Dict[str, Any]]]:
    """Try vector search with error handling"""
    try:
        if use_approximate:
            # Use pgvector's native operators for approximate search
            # This assumes vectorized_sources has an embedding column of type vector
            result = _pgvector_approximate_search(
                query_embedding, limit, match_threshold
            )
        else:
            # Fall back to exact search (your original RPC)
            result = _exact_vector_search(query_embedding, limit, match_threshold)

        return result

    except Exception as e:
        print(f"[ERROR] vector search error: {e}")
        return None


def _pgvector_approximate_search(
    query_embedding: List[float], limit: int, match_threshold: float
) -> List[Dict[str, Any]]:
    """
    Use pgvector's native operators for approximate nearest neighbor search.
    This requires that vectorized_sources table has:
    1. An 'embedding' column of type 'vector'
    2. An HNSW or IVFFlat index on the embedding column for performance
    """
    try:
        # Use RPC function to avoid URI length limits with large embedding vectors
        # Parameter order: match_count, match_threshold, query_embedding
        result = supabase.rpc(
            "search_vectorized_sources_hnsw",
            {
                "match_count": limit,
                "match_threshold": match_threshold,
                "query_embedding": query_embedding,
            },
        ).execute()

        if result.data:
            print(
                f"[PASS] pgvector approximate search found {len(result.data)} results"
            )

            # NOTE: Show details of each result
            print("[DEBUG] pgvector search results:")
            for i, row in enumerate(result.data, 1):
                # Extract key fields for debugging
                title = row.get("source_name", "N/A")
                content_preview = (
                    (row.get("content", "") or "")[:100] + "..."
                    if row.get("content")
                    else "N/A"
                )
                similarity = row.get("similarity", "N/A")
                url = row.get("url", "N/A")

                print(f"[DEBUG]   {i}. Title: {title}")
                print(f"[DEBUG]      Similarity: {similarity}")
                print(f"[DEBUG]      URL: {url}")
                print(f"[DEBUG]      Content: {content_preview}")
                print(f"[DEBUG]      ---")

            return result.data
        else:
            print("[INFO] no pgvector search results found")
            return []

    except Exception as e:
        print(f"[ERROR] pgvector search failed: {e}")
        print(
            "[INFO] falling back to exact search - run migration steps 1-3 to enable fast search"
        )
        # Fall back to exact search if HNSW RPC doesn't exist
        return _exact_vector_search(query_embedding, limit, match_threshold)


def _exact_vector_search(
    query_embedding: List[float], limit: int, match_threshold: float
) -> List[Dict[str, Any]]:
    """Fallback to exact vector search using RPC function"""
    result = supabase.rpc(
        "match_documents",
        {
            "query_embedding": query_embedding,
            "match_threshold": match_threshold,
            "match_count": limit,
        },
    ).execute()

    if result.data:
        print(f"[PASS] exact vector search found {len(result.data)} results")
        return result.data
    else:
        print("[INFO] no exact vector search results found")
        return []


def _fallback_keyword_search(query: str, limit: int) -> List[Dict[str, Any]]:
    """Fallback to simple keyword search when vector search fails"""
    try:
        print(f"[INFO] performing keyword fallback search for: {query}")

        # Try content search first
        response = (
            supabase.table("vectorized_sources")
            .select("id, source_name, content, url, metadata, created_at")
            .ilike("content", f"%{query}%")
            .limit(limit)
            .execute()
        )

        if response.data:
            print(f"[PASS] keyword search found {len(response.data)} results")
            return response.data

        # Try source_name search as backup
        response = (
            supabase.table("vectorized_sources")
            .select("id, source_name, content, url, metadata, created_at")
            .ilike("source_name", f"%{query}%")
            .limit(limit)
            .execute()
        )

        if response.data:
            print(f"[PASS] source name search found {len(response.data)} results")
            return response.data

        print("[INFO] no keyword search results found")
        return []

    except Exception as e:
        print(f"[ERROR] keyword search failed: {e}")
        return []


def generate_ai_reply(
    note_content: str, pdf_url: str = None, scratchpad_context: str = None
):
    """Generate AI reply based on note content and PDF context"""
    global _current_sources_used

    try:
        # Build message content with text and optional PDF
        content_list = []

        if pdf_url:
            content_list.append(
                {"type": "document", "source": {"type": "url", "url": pdf_url}}
            )

        # Build context-aware prompt
        context_section = ""
        if scratchpad_context:
            context_section = f"""Here are the user's other notes on this paper:

{scratchpad_context}

"""

        prompt = f"""You are an AI assistant helping a researcher understand a paper {context_section}The user has written the following new note:

"{note_content}"

Provide a helpful response that is thoughtful but concise. Only reference other notes if they directly relate to the current note. Aim for around 50 words."""

        content_list.append({"type": "text", "text": prompt})

        # Get the configured Claude client with tools
        # claude_msg = get_claude_msg()
        claude_msg = Chat("claude-sonnet-4-20250514", tools=[search_vectorized_sources])
        if not claude_msg:
            return "Claude client not available"
        
        final_msg = mk_msg(content_list,)
        # Use the synchronous toolloop
        response = claude_msg.toolloop(final_msg)
        
        # Convert response to string if it's a generator or other type
        if hasattr(response, '__iter__') and not isinstance(response, str):
            response = ' '.join(str(part) for part in response)
        
        return str(response)
        
    except Exception as e:
        print(f"[ERROR] ai reply generation error: {e}")
        return f"ai reply generation failed: {str(e)}"