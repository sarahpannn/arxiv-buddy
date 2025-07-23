import os
from dotenv import load_dotenv
from supabase import create_client, Client
import anthropic
from msglm import AnthropicMsg

# Load environment variables
load_dotenv()

print("=== CONFIG MODULE LOADED ===")

# Environment variables
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
session_secret = os.getenv("SESSION_SECRET", "dev-secret-change-in-production")

# Initialize Supabase client
if supabase_url and supabase_key:
    supabase: Client = create_client(supabase_url, supabase_key)
    print("✅ Supabase client initialized")
else:
    supabase = None
    print("⚠️ Supabase credentials not found")

# Initialize Claude client
if anthropic_api_key:
    claude_client = anthropic.Anthropic(api_key=anthropic_api_key)
    claude_msg = AnthropicMsg()
    print("✅ Claude client initialized")
else:
    claude_client = None
    claude_msg = None
    print("⚠️ Anthropic API key not found")

# CORS origins
CORS_ORIGINS = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    # add your real front-end origin(s) here
]