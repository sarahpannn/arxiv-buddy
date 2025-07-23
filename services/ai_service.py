from config import supabase, claude_client, claude_msg
from embeddings import get_embedding


async def search_vectorized_sources(query: str, limit: int = 5, match_threshold: float = -0.7):
    """Search through vectorized sources using vector similarity"""
    if not supabase:
        print("⚠️ Supabase client not available")
        return []

    try:
        print(f"🔍 Searching vectorized sources for: {query}")

        # Generate query embedding
        query_embedding, _ = get_embedding(query)
        if not query_embedding:
            print("❌ Failed to generate query embedding")
            return []

        # Perform vector search using your RPC function
        try:
            result = supabase.rpc(
                'match_documents',
                {
                    'query_embedding': query_embedding,
                    'match_threshold': match_threshold,
                    'match_count': limit
                }
            ).execute()

            if result.data:
                print(f"✅ Found {len(result.data)} results using vector search")
                return result.data
            else:
                print("ℹ️ No vector search results found")
                return []

        except Exception as e:
            print(f"❌ Vector search error: {e}")
            return []

    except Exception as e:
        print(f"❌ RAG search error: {e}")
        return []


async def generate_ai_reply(note_content: str, pdf_url: str = None, scratchpad_context: str = None) -> str:
    """Generate AI reply based on note content and PDF context"""
    if not claude_client:
        return "ai reply functionality requires anthropic api key"

    try:
        # Build message content with text and optional PDF
        content_list = []

        if pdf_url:
            content_list.append({"type": "document", "source": {"type": "url", "url": pdf_url}})
        
        # Build context-aware prompt
        context_section = ""
        if scratchpad_context:
            context_section = f"""Here are the user's other notes on this paper:

{scratchpad_context}

"""

        prompt = f"""You are an AI assistant helping a researcher understand a paper. {context_section}The user has written the following new note:

"{note_content}"

Provide a helpful response that is thoughtful but concise. Only reference other notes if they directly relate to the current note. Aim for around 50 words."""

        content_list.append({"type": "text", "text": prompt})
        
        # Add PDF if available
        
        message = claude_msg("user", content_list)
        response = claude_client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=350,
            messages=[message]
        )
        
        return response.content[0].text.strip()
    except Exception as e:
        print(f"❌ AI reply generation error: {e}")
        return f"ai reply generation failed: {str(e)}"