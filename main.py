from fasthtml.common import *
from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import os

print("=== MAIN.PY MODULE LOADED ===")

# Import configuration
from config import session_secret, CORS_ORIGINS

# Import our modules
from auth import google_client

# Import route registrations
from routes.auth_routes import register_auth_routes
from routes.library_routes import register_library_routes
from routes.paper_routes import register_paper_routes
from routes.scratchpad_routes import register_scratchpad_routes
from routes.context_routes import register_context_routes

# Create static directory if it doesn't exist
os.makedirs("static", exist_ok=True)
os.makedirs("data", exist_ok=True)

# Create the FastAPI app instance first
app = FastAPI()

# Add session middleware with secret key
app.add_middleware(SessionMiddleware, secret_key=session_secret)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"], 
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Create fast_app with our FastAPI instance
app, rt = fast_app(app=app)

# Register all routes
register_auth_routes(rt, google_client)
register_library_routes(rt)
register_paper_routes(rt)
register_scratchpad_routes(rt)
register_context_routes(rt)

if __name__ == "__main__":
    serve(host="localhost", port=5002)
    # serve()

print("=== ROUTES REGISTERED ===")