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


async def generate_ai_reply(note_content: str, search_results: list) -> str:
    """Generate AI reply based on note content and search results"""
    if not claude_client:
        return "ai reply functionality requires anthropic api key"

    try:
        # prepare context from search results
        if search_results:
            context = "Here are some relevant sources from the database:\n\n"
            for i, result in enumerate(search_results[:3], 1):
                source_name = result.get("source_name", "Unknown Source")
                content = result.get("content", "")[:400]
                context += f"{i}. **{source_name}**\n   {content}...\n\n"
        else:
            context = "No specific matching sources were found in the database for this query."

        prompt = f"""
        You are an AI assistant helping a researcher with their notes. A user has written the following note:

        "{note_content}"

        {context}

        Please provide a helpful, concise response that addresses the user's note. If relevant sources were found, reference them specifically. If no relevant sources were found, provide thoughtful guidance based on the note content itself. Keep your response under 200 words and be practical and specific.
        """

        message = claude_msg("user", prompt)
        response = claude_client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=300,
            messages=[message]
        )
        
        return response.content[0].text.strip()
    except Exception as e:
        print(f"❌ AI reply generation error: {e}")
        return f"ai reply generation failed: {str(e)}"