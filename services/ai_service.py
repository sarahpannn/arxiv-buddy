from config import supabase, claude_client, claude_msg


async def search_vectorized_sources(query: str, limit: int = 5):
    """Search through vectorized sources using RAG"""
    if not supabase:
        print("⚠️ Supabase client not available")
        return []

    try:
        print(f"🔍 Searching vectorized sources for: {query}")

        # Use ilike search for content matching (textSearch doesn't exist in supabase-py)
        try:
            response = (
                supabase.table("vectorized_sources")
                .select("*")
                .ilike("content", f"%{query}%")
                .limit(limit)
                .execute()
            )

            if response.data:
                print(f"✅ Found {len(response.data)} results using content search")
                return response.data
        except Exception as e:
            print(f"⚠️ content search failed: {e}")

        # Try searching in source_name as backup
        try:
            response = (
                supabase.table("vectorized_sources")
                .select("*")
                .ilike("source_name", f"%{query}%")
                .limit(limit)
                .execute()
            )

            if response.data:
                print(f"✅ Found {len(response.data)} results using source_name search")
                return response.data
        except Exception as e:
            print(f"⚠️ source_name search failed: {e}")

        # If no specific matches, return a few random recent entries for context
        try:
            response = (
                supabase.table("vectorized_sources")
                .select("*")
                .order("created_at", desc=True)
                .limit(3)
                .execute()
            )

            if response.data:
                print(f"✅ Returning {len(response.data)} recent entries as fallback")
                return response.data
        except Exception as e:
            print(f"⚠️ fallback search failed: {e}")

        print("❌ No results found")
        return []

    except Exception as e:
        print(f"❌ RAG search error: {e}")
        return []


async def generate_ai_reply(note_content: str, pdf_url: str = None) -> str:
    """Generate AI reply based on note content and PDF context"""
    if not claude_client:
        return "ai reply functionality requires anthropic api key"

    try:
        # Build message content with text and optional PDF
        content_list = []

        if pdf_url:
            content_list.append({"type": "document", "source": {"type": "url", "url": pdf_url}})
        
        prompt = f"""You are an AI assistant helping a researcher understand a paper. A user has written the following note:

"{note_content}"

Provide a helpful response that is thoughtful but concise, over anything. Aim for around 50 words."""

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