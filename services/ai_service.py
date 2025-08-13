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
) -> str:
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
        claude_msg = Chat('claude-sonnet-4-20250514', tools=[search_vectorized_sources])
        if not claude_msg:
            return "Claude client not available"
        
        # Clear sources from previous conversations
        _current_sources_used = []
        
        # Create a simple prompt that Claude can answer directly
        simple_prompt = f"""You are an AI assistant helping a researcher understand a paper. 

The user has written this note: "{note_content}"

Please provide a helpful, thoughtful, and concise response (around 50 words). If you need to search for information to provide a better answer, use the search_vectorized_sources tool.

{context_section.strip() if 'context_section' in locals() else ''}"""

        # Use toolloop but extract just the final response
        response = claude_msg.toolloop(simple_prompt)
        
        # Extract the final assistant response from the toolloop
        response_text = _extract_final_response(response, claude_msg)
        print(f"[DEBUG] Extracted response text: {response_text[:200]}...")
        print(f"[DEBUG] Sources used: {len(_current_sources_used)}")
        
        # Format with sources that were used during tool calls
        formatted_response = _format_response_with_sources(response_text, _current_sources_used)
        
        return formatted_response
        
    except Exception as e:
        print(f"[ERROR] ai reply generation error: {e}")
        return f"ai reply generation failed: {str(e)}"


def _extract_final_response(toolloop_response, claude_msg):
    """Extract just the final LLM response from toolloop, ignoring tool calls"""
    try:
        # Get the conversation history from the chat object
        if hasattr(claude_msg, 'h') and claude_msg.h:
            messages = claude_msg.h
            
            # Look for the last assistant message that's not a tool call
            for message in reversed(messages):
                if (hasattr(message, 'role') and message.role == 'assistant' and 
                    hasattr(message, 'content') and message.content and
                    not hasattr(message, 'tool_calls')):
                    
                    # Extract text content
                    if isinstance(message.content, list):
                        # Content is a list of content blocks
                        text_content = ""
                        for block in message.content:
                            if hasattr(block, 'text'):
                                text_content += block.text
                            elif hasattr(block, 'type') and block.type == 'text':
                                text_content += str(block.text if hasattr(block, 'text') else block)
                        if text_content.strip():
                            return text_content.strip()
                    elif isinstance(message.content, str):
                        return message.content.strip()
                    else:
                        return str(message.content).strip()
        
        # Fallback: if we can't parse the conversation, look at the response directly
        if toolloop_response:
            if hasattr(toolloop_response, '__iter__') and not isinstance(toolloop_response, str):
                response_str = ' '.join(str(part) for part in toolloop_response)
            else:
                response_str = str(toolloop_response)
            
            # Try to extract just the assistant's final response from the string
            # Look for patterns that indicate the final response
            lines = response_str.split('\n')
            for i, line in enumerate(lines):
                # Skip tool-related lines
                if ('ToolUseBlock' in line or 'tool_use' in line or 
                    'search_vectorized_sources' in line or 'role=' in line):
                    continue
                # Look for actual response content
                if line.strip() and not line.startswith('[') and not line.startswith('{'):
                    # This might be the start of the actual response
                    remaining_lines = lines[i:]
                    clean_response = []
                    for remaining_line in remaining_lines:
                        if ('ToolUseBlock' in remaining_line or 'role=' in remaining_line or 
                            remaining_line.strip().startswith('{')):
                            break
                        if remaining_line.strip():
                            clean_response.append(remaining_line.strip())
                    
                    if clean_response:
                        return ' '.join(clean_response)
            
            return response_str
        
        return "Unable to generate response"
    
    except Exception as e:
        print(f"[DEBUG] Error extracting final response: {e}")
        # Ultimate fallback
        if toolloop_response:
            if hasattr(toolloop_response, '__iter__') and not isinstance(toolloop_response, str):
                return ' '.join(str(part) for part in toolloop_response)
            else:
                return str(toolloop_response)
        return "Error generating response"


def _format_response_with_sources(response_text, sources_used):
    """Format the response with clean source citations at the bottom"""
    if not sources_used:
        return response_text
    
    # Deduplicate sources by URL
    unique_sources = {}
    for source in sources_used:
        if isinstance(source, dict) and 'url' in source:
            url = source['url']
            if url not in unique_sources:
                unique_sources[url] = source
    
    if not unique_sources:
        return response_text
    
    # Format the response with sources
    formatted_response = response_text.strip()
    
    if unique_sources:
        formatted_response += "\n\n**Sources:**\n"
        for i, (url, source) in enumerate(unique_sources.items(), 1):
            source_name = source.get('source_name', 'Unknown Source')
            # Clean up the URL (remove query parameters for cleaner display)
            clean_url = url.split('?')[0] if '?' in url else url
            formatted_response += f"{i}. {source_name}: {clean_url}\n"
    
    return formatted_response