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
import json
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

print("=== MAIN.PY MODULE LOADED ===")

# Import our modules
from models import db, users, library, scratchpad_notes, User, LibraryItem, ScratchpadNote
from auth import google_client, Auth, login_page, logout, require_auth
from library import library_page, add_paper_page, add_paper, remove_paper
from source_manager import download_paper_content, extract_paper_id_from_url, get_source_manager

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
    # Extract paper ID and use new hybrid download system
    paper_id = extract_paper_id_from_url(arxiv_url)
    
    # Use new source manager for downloading
    source_manager = get_source_manager()
    download_result = download_paper_content(paper_id, source_manager)
    
    # Use the paper_id from download result (cleaned)
    paper_id = download_result['paper_id']
    
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
    
    # Add source processing status for debugging
    source_info = ""
    if download_result['strategy'] == 'source' and download_result['source_structure']:
        if download_result['parsed_latex']:
            stats = download_result['parsed_latex']['stats']
            source_info = Span(f"📄 Source: {stats['total_citations']} citations, {stats['total_figures']} figures", 
                             style="color: #007bff; font-weight: 500; margin: 8px;")
        else:
            source_info = Span("📄 Source files available", style="color: #007bff; font-weight: 500; margin: 8px;")
    elif download_result['errors']:
        source_info = Span("⚠ Using PDF fallback", style="color: #ffc107; font-weight: 500; margin: 8px;")
    
    return Div(
        # Add debug info
        Script("""console.log('PDF loading response received');"""),
        
        # Library status area
        Div(
            library_status,
            source_info,
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
                
                # Citation Modal
                Div(
                    Div(
                        Div(
                            H3("Citation Details", id="citation-modal-title"),
                            Button("×", 
                                class_="citation-modal-close",
                                onclick="closeCitationModal()")
                        , class_="citation-modal-header"),
                        Div(id="citation-modal-content", class_="citation-modal-body")
                    , class_="citation-modal-content"),
                    id="citation-modal",
                    class_="citation-modal",
                    onclick="closeCitationModal(event)"
                ),
                
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
                Script(src='/static/scratchpad.js'),
                Script(src='/static/pdf-viewer.js', type='module'),
                Script(f"""
                    console.log('🚀 MAIN: Setting up global variables');
                    
                    // Set global LaTeX data for the paper
                    window.latexData = {json.dumps(download_result.get('parsed_latex', None))};
                    window.paperStrategy = '{download_result['strategy']}';
                    window.currentPaperId = '{paper_id}';
                    
                    console.log('🚀 MAIN: Global variables set:', {{
                        hasLatexData: !!window.latexData,
                        strategy: window.paperStrategy,
                        paperId: window.currentPaperId
                    }});
                    
                    // Debug function to check scratchpad status
                    window.debugScratchpad = function() {{
                        console.log('=== SCRATCHPAD DEBUG ===');
                        console.log('Scratchpad instance:', window.scratchpad);
                        console.log('FAB element:', document.querySelector('.scratchpad-fab'));
                        console.log('Panel element:', document.querySelector('.scratchpad-panel'));
                        console.log('Current paper ID:', window.currentPaperId);
                        console.log('=========================');
                    }};
                    
                    // Manual function to force-create scratchpad
                    window.forceScratchpad = function() {{
                        console.log('🔧 FORCE: Creating scratchpad manually');
                        if (!window.scratchpad) {{
                            console.log('🔧 FORCE: No scratchpad instance, creating new one');
                            initializeScratchpad();
                        }} else {{
                            console.log('🔧 FORCE: Scratchpad exists, recreating UI');
                            window.scratchpad.createScratchpadUI();
                        }}
                    }};
                    
                    // Test function to open scratchpad panel manually
                    window.testScratchpadPanel = function() {{
                        console.log('🔧 TEST: Testing scratchpad panel opening');
                        if (window.scratchpad) {{
                            window.scratchpad.openPanel();
                            console.log('✅ TEST: Scratchpad panel opening triggered');
                        }} else {{
                            console.log('❌ TEST: No scratchpad instance found');
                        }}
                    }};
                    
                    // Test function to create a simple working context menu
                    window.testWorkingContextMenu = function() {{
                        console.log('🔧 TEST: Creating simple working context menu');
                        
                        // Remove any existing test menu
                        const existing = document.querySelector('#test-context-menu');
                        if (existing) existing.remove();
                        
                        const menu = document.createElement('div');
                        menu.id = 'test-context-menu';
                        menu.style.cssText = `
                            position: fixed !important;
                            left: 300px !important;
                            top: 200px !important;
                            background: white !important;
                            border: 2px solid red !important;
                            border-radius: 8px !important;
                            padding: 12px !important;
                            z-index: 99999 !important;
                            display: flex !important;
                            gap: 8px !important;
                        `;
                        
                        const btn1 = document.createElement('button');
                        btn1.textContent = 'Test 1';
                        btn1.style.cssText = 'padding: 8px; background: blue; color: white; border: none; cursor: pointer;';
                        btn1.addEventListener('click', () => {{
                            console.log('✅ TEST: Test button 1 clicked!');
                            alert('Test button 1 works!');
                        }});
                        
                        const btn2 = document.createElement('button');
                        btn2.textContent = 'Test 2';
                        btn2.style.cssText = 'padding: 8px; background: green; color: white; border: none; cursor: pointer;';
                        btn2.addEventListener('click', () => {{
                            console.log('✅ TEST: Test button 2 clicked!');
                            window.scratchpad.openPanel();
                        }});
                        
                        const btnClose = document.createElement('button');
                        btnClose.textContent = 'Close';
                        btnClose.style.cssText = 'padding: 8px; background: red; color: white; border: none; cursor: pointer;';
                        btnClose.addEventListener('click', () => {{
                            console.log('✅ TEST: Close button clicked!');
                            menu.remove();
                        }});
                        
                        menu.appendChild(btn1);
                        menu.appendChild(btn2);
                        menu.appendChild(btnClose);
                        document.body.appendChild(menu);
                        
                        console.log('✅ TEST: Working context menu created');
                    }};
                    
                    
                    // Modal control functions
                    window.showCitationModal = function() {{
                        const modal = document.getElementById('citation-modal');
                        if (modal) {{
                            modal.classList.add('show');
                        }}
                    }};
                    
                    window.closeCitationModal = function(event) {{
                        // Only close if clicking the backdrop or close button
                        if (event && event.target !== document.getElementById('citation-modal') && 
                            !event.target.classList.contains('citation-modal-close')) {{
                            return;
                        }}
                        
                        const modal = document.getElementById('citation-modal');
                        if (modal) {{
                            modal.classList.remove('show');
                        }}
                    }};
                    
                    // Close modal with ESC key
                    document.addEventListener('keydown', function(e) {{
                        if (e.key === 'Escape') {{
                            closeCitationModal();
                        }}
                    }});
                    
                    // Debug the LaTeX data loading
                    console.log('🚀 LATEX DATA LOADED:', {{
                        hasData: !!window.latexData,
                        strategy: window.paperStrategy,
                        paperId: window.currentPaperId,
                        citationCount: window.latexData ? Object.keys(window.latexData.citation_mapping || {{}}).length : 0,
                        figureCount: window.latexData ? Object.keys(window.latexData.figures || {{}}).length : 0
                    }});
                    
                    // Wait for the page to load, then call renderPDF
                    window.addEventListener('load', function() {{
                        console.log('🚀 PAGE LOADED - LaTeX data status:', {{
                            hasData: !!window.latexData,
                            strategy: window.paperStrategy
                        }});
                        
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

@rt("/api/paper/{paper_id}/latex", methods=["GET"])
def get_latex_data_route(paper_id: str):
    """API endpoint to get parsed LaTeX data for a paper"""
    try:
        source_manager = get_source_manager()
        parsed_data = source_manager.parse_latex_content(paper_id)
        
        if parsed_data:
            return {
                "success": True,
                "paper_id": paper_id,
                "data": parsed_data
            }
        else:
            return {
                "success": False,
                "paper_id": paper_id,
                "error": "No LaTeX data available (paper may not have source files)"
            }
    except Exception as e:
        return {
            "success": False,
            "paper_id": paper_id,
            "error": str(e)
        }

# Scratchpad API endpoints
@rt("/api/scratchpad/test")
def test_scratchpad_api():
    """Test endpoint to verify scratchpad API is working"""
    print("🚀 SCRATCHPAD API: Test endpoint called")
    return {"success": True, "message": "Scratchpad API is working", "test": True}

@rt("/api/scratchpad/{paper_id}", methods=["GET"])
def get_scratchpad_notes(paper_id: str, session):
    """Get all scratchpad notes for a paper"""
    print(f"🚀 SCRATCHPAD API: GET /api/scratchpad/{paper_id}")
    print(f"🚀 SCRATCHPAD API: Session: {session}")
    
    user_id = session.get('user_id') if session else None
    print(f"🚀 SCRATCHPAD API: User ID: {user_id}")
    
    if not user_id:
        print("❌ SCRATCHPAD API: No user_id - authentication required")
        return {"success": False, "error": "Authentication required"}
    
    try:
        query = f"user_id = '{user_id}' AND paper_id = '{paper_id}' AND is_deleted = 0"
        print(f"🚀 SCRATCHPAD API: Query: {query}")
        
        notes = scratchpad_notes(where=query, order_by="position ASC")
        notes_list = list(notes)
        print(f"🚀 SCRATCHPAD API: Found {len(notes_list)} notes")
        
        result = {
            "success": True,
            "notes": [
                {
                    "id": note.id,
                    "content": note.content,
                    "note_type": note.note_type,
                    "anchor_data": json.loads(note.anchor_data) if note.anchor_data else None,
                    "created_at": note.created_at,
                    "updated_at": note.updated_at,
                    "position": note.position
                }
                for note in notes_list
            ]
        }
        print(f"✅ SCRATCHPAD API: Returning result: {result}")
        return result
    except Exception as e:
        print(f"❌ SCRATCHPAD API: Error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

@rt("/api/scratchpad", methods=["POST"])
async def create_scratchpad_note(request):
    """Create a new scratchpad note"""
    session = request.session if hasattr(request, 'session') else {}
    user_id = session.get('user_id')
    if not user_id:
        return {"success": False, "error": "Authentication required"}
    
    try:
        data = await request.json()
        
        # Get next position
        existing_notes = scratchpad_notes(where=f"user_id = '{user_id}' AND paper_id = '{data['paper_id']}' AND is_deleted = 0")
        next_position = len(list(existing_notes))
        
        note_id = scratchpad_notes.insert(
            user_id=user_id,
            paper_id=data['paper_id'],
            content=data.get('content', ''),
            note_type=data.get('note_type', 'unanchored'),
            anchor_data=json.dumps(data.get('anchor_data')) if data.get('anchor_data') else None,
            created_at=datetime.now().isoformat(),
            updated_at=datetime.now().isoformat(),
            position=next_position,
            is_deleted=False
        )
        
        return {"success": True, "note_id": note_id}
    except Exception as e:
        return {"success": False, "error": str(e)}

@rt("/api/scratchpad/{note_id}", methods=["PUT"])
async def update_scratchpad_note(note_id: int, request):
    """Update a scratchpad note"""
    session = request.session if hasattr(request, 'session') else {}
    user_id = session.get('user_id')
    if not user_id:
        return {"success": False, "error": "Authentication required"}
    
    try:
        data = await request.json()
        
        # Verify ownership
        notes = list(scratchpad_notes(where=f"id = {note_id}"))
        if not notes:
            return {"success": False, "error": "Note not found"}
        
        note = notes[0]
        if note.user_id != user_id:
            return {"success": False, "error": "Access denied"}
        
        # Update note
        update_data = {
            "updated_at": datetime.now().isoformat()
        }
        
        if 'content' in data:
            update_data['content'] = data['content']
        if 'note_type' in data:
            update_data['note_type'] = data['note_type']
        if 'anchor_data' in data:
            update_data['anchor_data'] = json.dumps(data['anchor_data']) if data['anchor_data'] else None
        if 'position' in data:
            update_data['position'] = data['position']
        
        scratchpad_notes.update(id=note_id, **update_data)
        
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

@rt("/api/scratchpad/{note_id}", methods=["DELETE"])
def delete_scratchpad_note(note_id: int, session):
    """Delete a scratchpad note (soft delete)"""
    print(f"🗑️ DELETE API: Called with note_id={note_id}, type={type(note_id)}")
    print(f"🗑️ DELETE API: Session={session}")
    
    user_id = session.get('user_id') if session else None
    print(f"🗑️ DELETE API: User ID={user_id}")
    
    if not user_id:
        return {"success": False, "error": "Authentication required"}
    
    try:
        print(f"🗑️ DELETE API: Querying for note with id={note_id}")
        
        # Verify ownership
        notes = list(scratchpad_notes(where=f"id = {note_id}"))
        print(f"🗑️ DELETE API: Found {len(notes)} notes")
        
        if not notes:
            return {"success": False, "error": "Note not found"}
        
        note = notes[0]
        print(f"🗑️ DELETE API: Note found, user_id={note.user_id}")
        
        if note.user_id != user_id:
            return {"success": False, "error": "Access denied"}
        
        print(f"🗑️ DELETE API: Attempting to update note {note_id}")
        
        # Soft delete
        scratchpad_notes.update(id=note_id, is_deleted=True, updated_at=datetime.now().isoformat())
        
        print(f"✅ DELETE API: Note {note_id} marked as deleted")
        return {"success": True}
    except Exception as e:
        print(f"❌ DELETE API: Error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

@rt("/api/scratchpad/{paper_id}/export", methods=["GET"])
def export_scratchpad(paper_id: str, session, format: str = "markdown"):
    """Export scratchpad notes in various formats"""
    user_id = session.get('user_id') if session else None
    if not user_id:
        return {"success": False, "error": "Authentication required"}
    
    try:
        notes = scratchpad_notes(where=f"user_id = '{user_id}' AND paper_id = '{paper_id}' AND is_deleted = 0", order_by="position ASC")
        
        if format == "markdown":
            content = f"# Scratchpad Notes for Paper {paper_id}\n\n"
            for note in notes:
                content += f"## Note {note.position + 1}\n"
                if note.note_type == "anchored" and note.anchor_data:
                    anchor = json.loads(note.anchor_data)
                    content += f"**Anchored to:** \"{anchor.get('selection_text', '')}\"\n\n"
                content += f"{note.content}\n\n"
                content += f"*Created: {note.created_at}*\n\n---\n\n"
        
        elif format == "json":
            content = json.dumps([
                {
                    "id": note.id,
                    "content": note.content,
                    "note_type": note.note_type,
                    "anchor_data": json.loads(note.anchor_data) if note.anchor_data else None,
                    "created_at": note.created_at,
                    "position": note.position
                }
                for note in notes
            ], indent=2)
        
        else:  # plain text
            content = f"Scratchpad Notes for Paper {paper_id}\n" + "="*50 + "\n\n"
            for note in notes:
                content += f"Note {note.position + 1}:\n"
                if note.note_type == "anchored" and note.anchor_data:
                    anchor = json.loads(note.anchor_data)
                    content += f"Anchored to: \"{anchor.get('selection_text', '')}\"\n\n"
                content += f"{note.content}\n\n"
                content += f"Created: {note.created_at}\n\n" + "-"*30 + "\n\n"
        
        return {
            "success": True,
            "content": content,
            "format": format
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

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
