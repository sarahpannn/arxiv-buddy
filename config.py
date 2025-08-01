import os
from dotenv import load_dotenv
from supabase import create_client, Client
from claudette import *
from openai import OpenAI

# Load environment variables
load_dotenv()

print("=== CONFIG MODULE LOADED ===")

# Environment variables
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
openai_api_key = os.getenv("OPENAI_API_KEY")
session_secret = os.getenv("SESSION_SECRET", "dev-secret-change-in-production")

# Initialize Supabase client
if supabase_url and supabase_key:
    supabase: Client = create_client(supabase_url, supabase_key)
    print("✅ Supabase client initialized")
else:
    supabase = None
    print("⚠️ Supabase credentials not found")

# Initialize Claude client (without tools initially to avoid circular import)
if anthropic_api_key:
    claude_msg = None  # Will be initialized later with tools
    print("✅ Claude client base initialized")
else:
    claude_client = None
    claude_msg = None
    print("⚠️ Anthropic API key not found")

# Function to initialize Claude with tools (called after ai_service is imported)
def initialize_claude_with_tools():
    global claude_msg
    if anthropic_api_key and claude_msg is None:
        from services.ai_service import search_vectorized_sources
        claude_msg = Chat('claude-sonnet-4-20250514', anthropic_api_key, tools=[search_vectorized_sources])
        print("✅ Claude client initialized with tools")
        return claude_msg
    return claude_msg

# Getter function for claude_msg (ensures it's initialized)
def get_claude_msg():
    global claude_msg
    if claude_msg is None:
        return initialize_claude_with_tools()
    return claude_msg

# Initialize OpenAI client (for embeddings)
if openai_api_key:
    openai_client = OpenAI(api_key=openai_api_key)
    print("✅ OpenAI client initialized (for embeddings)")
else:
    openai_client = None
    print("⚠️ OpenAI API key not found (needed for embeddings)")

# CORS origins
CORS_ORIGINS = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    # add your real front-end origin(s) here
]