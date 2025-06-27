from fasthtml.common import *
from fasthtml.oauth import GoogleAppClient
from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import RedirectResponse
import requests
import re
import os
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

print("=== MAIN.PY MODULE LOADED ===")

# Import our modules
from models import db, users, library, User, LibraryItem
from auth import google_client, Auth, login_page, logout, require_auth
from library import library_page, add_paper_page, add_paper, remove_paper

# Create static directory if it doesn't exist
os.makedirs("static", exist_ok=True)
os.makedirs("data", exist_ok=True)

# Create the FastAPI app instance first
app = FastAPI()

# Add session middleware with secret key
session_secret = os.getenv("SESSION_SECRET", "dev-secret-change-in-production")
app.add_middleware(SessionMiddleware, secret_key=session_secret)

origins = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    # add your real front-end origin(s) here
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,        # or ["*"] for anything (dev only!)
    allow_credentials=True,
    allow_methods=["*"],          # GET, POST, PUT, etc.
    allow_headers=["*"],          # Authorization, Content-Type, …
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Create fast_app with our FastAPI instance
app, rt = fast_app(app=app)

# Initialize OAuth - but we're handling OAuth manually, so just create the client
# oauth = Auth(app, google_client, skip=['/', '/test', '/login', '/logout', '/static'], redir_path='/auth_redirect')

# Add auth routes
@rt("/login")
def login_route():
    print("=== LOGIN ROUTE REGISTERED ===")
    return login_page()

@rt("/test")
def test_route():
    print("=== TEST ROUTE CALLED ===")
    return "Test route working!"

@rt("/logout")
def logout_route(session):
    print("=== LOGOUT ROUTE CALLED ===")
    print(f"Session in logout route: {session}")
    return logout(session)

@rt("/")
def get(session=None, code: str = None):
    print("=== MAIN ROUTE CALLED ===")
    print("Session:", session)
    print("Session type:", type(session))
    print("Code parameter:", code)
    
    # Handle OAuth callback
    if code:
        print("=== HANDLING OAUTH CALLBACK ===")
        try:
            # Use retr_info to combine token exchange and user info retrieval
            # user_info = google_client.retr_info(code, redirect_uri="https://wonderful-ruby-divides-86r.pla.sh/")
            user_info = google_client.retr_info(code, redirect_uri="http://localhost:5002/")  # type: ignore
            
            print(f"User info: {user_info}")
            
            # Extract user details (user_info is a dict)
            user_id = user_info['sub']  # 'sub' is the Google user ID
            email = user_info.get('email', '')
            username = user_info.get('name', '') or email.split('@')[0]
            
            # Create/update user in database
            if user_id not in users:
                users.insert(
                    id=user_id,
                    email=email,
                    username=username,
                    provider='google',
                    created_at=datetime.now().isoformat()
                )
                print(f"Created new user: {username}")
            else:
                print(f"User already exists: {username}")
            
            # Set session
            session['user_id'] = user_id
            session['provider'] = 'google'
            print(f"Session after OAuth: {session}")
            
            # Redirect to library
            return RedirectResponse('/library', status_code=303)
            
        except Exception as e:
            print(f"OAuth error: {e}")
            import traceback
            traceback.print_exc()
            return RedirectResponse('/login?error=oauth_failed', status_code=303)
    
    if session:
        print("Session keys:", list(session.keys()) if hasattr(session, 'keys') else 'No keys method')
        print("User ID in session:", session.get('user_id'))
    user_id = session.get('user_id') if session else None
    
    return Titled("Arxiv Buddy", 
        Script(src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"),
        Link(rel="stylesheet", href="/static/style.css"),
        
        Div(
            Div(
                H1("Arxiv Buddy", style="font-size: 2.2rem; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: -1px;"),
                P("Welcome to the V0 Alpha of Arxiv Buddy.", Br(), "Graciously accepting feedback at ", A('@spantacular on X', href='https://x.com/spantacular'), style="color: #666; font-size: 1.1rem; margin-bottom: 2rem;"),
                
                # Show different content based on login status
                _render_main_content(user_id),
                
                style="background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.07); padding: 44px 40px 36px 40px; max-width: 900px; margin: 0 auto;"
            ),
            Div(
                Div(
                    P("Arxiv Buddy gives you a nicer way to read arXiv papers in your browser. Enter an arXiv URL above to get started!", 
                      style="text-align: center; color: #888; font-size: 1.1rem;"),
                    id="pdf-viewer-content",
                    style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; min-height: 120px;"
                ),
                id="viewer-container",
                style="border: 1px solid #eee; border-radius: 10px; margin-top: 24px; min-height: 150px; background: #fafbfc; max-width: 630px; margin-left: auto; margin-right: auto;"
            ),
            style="min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; background: none; padding: 0; text-align: center;"
        ),
        Script("""
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        """)
    )

def _render_main_content(user_id):
    """Render different content based on login status"""
    if user_id:
        # User is logged in
        user = users[user_id]
        return Div(
            P(f"Welcome back, {user.username}!", style="color: #4285f4; font-weight: 500; margin-bottom: 1rem;"),
            A("View My Library", href="/library", 
              style="display: inline-block; padding: 12px 24px; background: #4285f4; color: white; text-decoration: none; border-radius: 8px; margin: 8px; font-weight: 500;"),
            A("Logout", href="/logout", 
              style="display: inline-block; padding: 8px 16px; background: #666; color: white; text-decoration: none; border-radius: 6px; margin: 8px;"),
            Br(), Br(),
            Form(
                Input(placeholder="Enter ArXiv URL (e.g., https://arxiv.org/abs/2309.15028)", 
                      name="arxiv_url", 
                      type="url", 
                      required=True,
                      style="width: 100%; max-width: 700px; padding: 16px 18px; margin-bottom: 18px; font-size: 1.1rem; border-radius: 8px; border: 1.5px solid #ccc; background: #fafbfc;"),
                Button("Load PDF", type="submit", style="padding: 14px 32px; font-size: 1.1rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(66,133,244,0.08); font-weight: 600;"),
                action="/load_paper", 
                method="post",
                style="margin-bottom: 0;"
            )
        )
    else:
        # User is not logged in
        return Div(
            P("Sign in to save papers to your personal library!", style="color: #666; margin-bottom: 1.5rem;"),
            A("Sign in with Google", href="/login", 
              style="display: inline-block; padding: 16px 32px; background: #4285f4; color: white; text-decoration: none; border-radius: 8px; font-size: 1.1rem; font-weight: 500; box-shadow: 0 2px 8px rgba(66,133,244,0.2);"),
            Br(), Br(),
            P("Or try it out without signing in:", style="color: #666; margin-top: 2rem; margin-bottom: 1rem;"),
            Form(
                Input(placeholder="Enter ArXiv URL (e.g., https://arxiv.org/abs/2309.15028)", 
                      name="arxiv_url", 
                      type="url", 
                      required=True,
                      style="width: 100%; max-width: 700px; padding: 16px 18px; margin-bottom: 18px; font-size: 1.1rem; border-radius: 8px; border: 1.5px solid #ccc; background: #fafbfc;"),
                Button("Load PDF", type="submit", style="padding: 14px 32px; font-size: 1.1rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(66,133,244,0.08); font-weight: 600;"),
                action="/load_paper", 
                method="post",
                style="margin-bottom: 0;"
            )
        )

@rt("/load_paper", methods=["GET", "POST"])
async def load_paper_route(request):
    """Handle both GET (from library) and POST (from main form)"""
    print(f"=== LOAD PAPER ROUTE ===")
    print(f"Method: {request.method}")
    
    session = request.session if hasattr(request, 'session') else {}
    
    if request.method == "GET":
        # From library - expecting arxiv_id in query params
        arxiv_id = request.query_params.get('arxiv_id')
        print(f"GET - arXiv ID: {arxiv_id}")
        
        if arxiv_id:
            arxiv_url = f"https://arxiv.org/abs/{arxiv_id}"
            return load_paper_content(arxiv_url, session)
        else:
            return "No arXiv ID provided"
    
    elif request.method == "POST":
        # From main form - expecting arxiv_url in form data
        try:
            form_data = await request.form()
            arxiv_url = form_data.get('arxiv_url')
            print(f"POST - arXiv URL: {arxiv_url}")
            
            if arxiv_url:
                return load_paper_content(arxiv_url, session)
            else:
                return "No arXiv URL provided"
        except Exception as e:
            print(f"Error getting form data: {e}")
            return f"Error: {e}"

def load_paper_content(arxiv_url: str, session=None):
    """Common function to load paper content"""
    paper_id = download_arxiv_pdf(arxiv_url)
    
    # If user is logged in, automatically add to library
    user_id = session.get('user_id') if session else None
    library_status = ""
    
    if user_id:
        # Check if already in library
        existing = library(where=f"user_id = '{user_id}' AND arxiv_id = '{paper_id}'")
        if not existing:
            # Automatically add to library
            try:
                library.insert(
                    user_id=user_id,
                    arxiv_id=paper_id,
                    added_at=datetime.now().isoformat(),
                    title="",  # Can be fetched later
                    notes=""
                )
                print(f"Automatically added paper {paper_id} to {user_id}'s library")
                library_status = Span("✓ Added to your library", style="color: #28a745; font-weight: 500; margin: 8px;")
            except Exception as e:
                print(f"Error auto-adding to library: {e}")
                library_status = Span("⚠ Could not add to library", style="color: #ffc107; font-weight: 500; margin: 8px;")
        else:
            library_status = Span("✓ Already in your library", style="color: #28a745; font-weight: 500; margin: 8px;")
    
    return Div(
        # Add debug info
        Script("""console.log('PDF loading response received');"""),
        
        # Library status area
        Div(
            library_status,
            id="library-status",
            style="text-align: center; margin-bottom: 20px;"
        ),
        
        # Empty PDF viewer content div - will be populated by JavaScript
        Div(
            id="pdf-viewer-content",  # Match the ID from root route
            style="width: 100%; padding: 20px; background-color: #f9f9f9; border-radius: 5px;"
        ),

        Html(
            Head(
                Meta(charset='UTF-8'),
                Meta(name='viewport', content='width=device-width, initial-scale=1.0'),
                Title('Minimal PDF.js Implementation'),
                Style('body {\r\n            background-color: #f0f0f0;\r\n            display: flex;\r\n            justify-content: center;\r\n            align-items: center;\r\n            height: 100vh;\r\n            margin: 0;\r\n        }\r\n        #pdf-canvas {\r\n            border: 1px solid black;\r\n            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);\r\n        }')
            ),
            Body(
                Canvas(id='pdf-canvas'),
                Script(src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.min.mjs', type='module'),
                Link(rel="stylesheet", href="/static/text_layer_builder.css"),
                Script(src='/static/ui_utils.js', type='module'),
                Script(src='/static/text_highlighter.js', type='module'),
                Script(src='/static/text_layer_builder.js', type='module'), 
                Script(src='/static/pdf_link_service.js', type='module'),
                Script(src='/static/pdf-renderer.js', type='module'),
                Script(src='/static/annotation-handler.js', type='module'),
                Script(src='/static/destination-handler.js', type='module'),
                Script(src='/static/figure-detection.js', type='module'),
                Script(src='/static/reference-extraction.js', type='module'),
                Script(src='/static/figure-display.js', type='module'),
                Script(src='/static/reference-resolver.js', type='module'),
                Script(src='/static/paper-preview.js', type='module'),
                Script(src='/static/test-utilities.js', type='module'),
                Script(src='/static/pdf-viewer.js', type='module'),
                Script(f"""
                    // Wait for the page to load, then call renderPDF
                    window.addEventListener('load', function() {{
                        if (window.renderPDF) {{
                            renderPDF('/static/{paper_id}.pdf');
                        }} else {{
                            console.error('renderPDF function not available');
                        }}
                    }});
                """, type='module')
            ),
            lang='en'
        )
    )

# Add library routes
@rt("/library")
def library_route(session):
    return library_page(session)

@rt("/add_paper", methods=["GET", "POST"])
async def add_paper_route(request):
    print(f"=== ADD PAPER ROUTE CALLED ===")
    print(f"Request method: {request.method}")
    
    if request.method == "GET":
        print("Handling GET request")
        session = request.session if hasattr(request, 'session') else {}
        return add_paper_page(session)
    
    elif request.method == "POST":
        print("=== HANDLING POST REQUEST ===")
        
        # For FastHTML, we need to handle form data differently
        # Let's try to get form data from the request
        try:
            # Check if it's a FastHTML request with form data
            if hasattr(request, 'form'):
                form_data = await request.form()
                arxiv_url = form_data.get('arxiv_url')
                notes = form_data.get('notes', '')
            else:
                # Try to get from query params as fallback
                arxiv_url = request.query_params.get('arxiv_url')
                notes = request.query_params.get('notes', '')
                
            print(f"ArXiv URL: {arxiv_url}")
            print(f"Notes: {notes}")
            
            session = request.session if hasattr(request, 'session') else {}
            print(f"Session: {session}")
            
            if not arxiv_url:
                print("No arxiv_url provided")
                return "No ArXiv URL provided"
            
            return add_paper(arxiv_url, notes, session)
            
        except Exception as e:
            print(f"Error handling POST: {e}")
            import traceback
            traceback.print_exc()
            return f"Error: {e}"

@rt("/library/{item_id}", methods=["DELETE"])
def remove_paper_route(item_id: int, session):
    return remove_paper(item_id, session)

if __name__ == "__main__":
    serve(host="localhost", port=5002)
    # serve()

def download_arxiv_pdf(arxiv_url):
    """Download PDF from ArXiv URL"""
    # Extract paper ID from URL
    paper_id = re.search(r'arxiv\.org/abs/([^/]+)', arxiv_url)
    if not paper_id:
        paper_id = re.search(r'arxiv\.org/pdf/([^/]+)', arxiv_url)
    
    if not paper_id:
        raise ValueError("Invalid ArXiv URL")
    
    paper_id = paper_id.group(1)
    pdf_url = f"https://arxiv.org/pdf/{paper_id}.pdf"
    
    response = requests.get(pdf_url)
    response.raise_for_status()
    
    # Save to static directory so it can be served
    pdf_path = f"static/{paper_id}.pdf"
    with open(pdf_path, 'wb') as f:
        f.write(response.content)
    
    return paper_id

print("=== ROUTES REGISTERED ===")
