import re
from datetime import datetime
from fasthtml.common import *
from models import db, users, library, User, LibraryItem

def library_page(session):
    """User's library page"""
    print(f"Library page called with session: {session}")
    
    user_id = session.get('user_id')
    print(f"User ID from session: {user_id}")
    
    if not user_id:
        print("No user_id in session, redirecting to login")
        return RedirectResponse('/login', status_code=303)
    
    # Get user info
    user = users[user_id]
    print(f"Found user: {user.username}")
    
    # Get user's library items
    user_library = library(where=f"user_id = '{user_id}'")
    print(f"User library has {len(user_library)} items")
    
    return Titled("My Library - Arxiv Buddy",
        Div(
            Div(
                H1(f"Welcome, {user.username}!"),
                P(f"Your arXiv Library ({len(user_library)} papers)"),
                A("Add New Paper", href="/add_paper", 
                  style="display: inline-block; padding: 12px 24px; background: #4285f4; color: white; text-decoration: none; border-radius: 6px; margin: 8px 0;"),
                A("Logout", href="/logout", 
                  style="display: inline-block; padding: 8px 16px; background: #666; color: white; text-decoration: none; border-radius: 4px; margin-left: 16px;"),
                style="margin-bottom: 30px;"
            ),
            Div(
                _render_library_items(user_library),
                id="library-items"
            ),
            A("Back to Home", href="/", style="color: #666; text-decoration: none; margin-top: 20px; display: inline-block;"),
            style="max-width: 800px; margin: 50px auto; padding: 30px; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.07);"
        )
    )

def _render_library_items(library_items):
    """Render library items as HTML"""
    if not library_items:
        return Div(
            P("Your library is empty. Add your first paper!"),
            style="text-align: center; color: #666; padding: 40px;"
        )
    
    items = []
    for item in library_items:
        items.append(
            Div(
                Div(
                    H3(item.title or f"arXiv:{item.arxiv_id}"),
                    P(f"Added: {item.added_at[:10]}"),
                    P(f"Notes: {item.notes or 'No notes'}", style="color: #666; font-size: 0.9em;"),
                    style="flex: 1;"
                ),
                Div(
                    A("Read", href=f"/load_paper?arxiv_id={item.arxiv_id}", 
                      style="display: inline-block; padding: 8px 16px; background: #4285f4; color: white; text-decoration: none; border-radius: 4px; margin: 4px;"),
                    Button("Remove", 
                           hx_delete=f"/library/{item.id}",
                           hx_target="#library-items",
                           style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; margin: 4px; cursor: pointer;"),
                    style="display: flex; flex-direction: column;"
                ),
                style="display: flex; justify-content: space-between; align-items: center; padding: 16px; border: 1px solid #eee; border-radius: 8px; margin-bottom: 12px; background: #fafbfc;"
            )
        )
    
    return Div(*items)

def add_paper_page(session):
    """Page to add a new paper to library"""
    user_id = session.get('user_id')
    if not user_id:
        print("No user_id in session, redirecting to login")
        return RedirectResponse('/login', status_code=303)
    
    return Titled("Add Paper - Arxiv Buddy",
        Div(
            H1("Add Paper to Library"),
            Form(
                Input(placeholder="Enter ArXiv URL (e.g., https://arxiv.org/abs/2309.15028)", 
                      name="arxiv_url", 
                      type="url", 
                      required=True,
                      style="width: 100%; padding: 12px; margin-bottom: 16px; border: 1px solid #ccc; border-radius: 6px;"),
                Textarea(placeholder="Optional notes about this paper...", 
                        name="notes",
                        style="width: 100%; padding: 12px; margin-bottom: 16px; border: 1px solid #ccc; border-radius: 6px; height: 100px; resize: vertical;"),
                Button("Add to Library", type="submit", 
                       style="padding: 12px 24px; background: #4285f4; color: white; border: none; border-radius: 6px; cursor: pointer;"),
                action="/add_paper", 
                method="post"
            ),
            A("Back to Library", href="/library", style="color: #666; text-decoration: none; margin-top: 20px; display: inline-block;"),
            style="max-width: 500px; margin: 50px auto; padding: 30px; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.07);"
        )
    )

def add_paper(arxiv_url: str, notes: str = "", session=None):
    """Add a paper to user's library"""
    print(f"=== ADD PAPER CALLED ===")
    print(f"ArXiv URL: {arxiv_url}")
    print(f"Notes: {notes}")
    print(f"Session: {session}")
    
    user_id = session.get('user_id') if session else None
    print(f"User ID: {user_id}")
    
    if not user_id:
        print("No user_id in session, redirecting to login. Hi from add_paper!")
        return RedirectResponse('/login', status_code=303)
    
    # Extract arXiv ID from URL
    paper_id = re.search(r'arxiv\.org/abs/([^/]+)', arxiv_url)
    if not paper_id:
        paper_id = re.search(r'arxiv\.org/pdf/([^/]+)', arxiv_url)
    
    if not paper_id:
        print(f"Failed to extract paper ID from URL: {arxiv_url}")
        return Div("Invalid ArXiv URL", style="color: red;")
    
    arxiv_id = paper_id.group(1)
    print(f"Extracted arXiv ID: {arxiv_id}")
    
    # Check if already in library
    existing = library(where=f"user_id = '{user_id}' AND arxiv_id = '{arxiv_id}'")
    print(f"Existing papers found: {len(existing) if existing else 0}")
    
    if existing:
        print("Paper already in library, redirecting")
        return RedirectResponse('/library', status_code=303)
    
    # Add to library
    print("Adding paper to library...")
    try:
        result = library.insert(
            user_id=user_id,
            arxiv_id=arxiv_id,
            added_at=datetime.now().isoformat(),
            title="",  # Can be fetched later
            notes=notes
        )
        print(f"Insert result: {result}")
        print("Paper added successfully!")
    except Exception as e:
        print(f"Error adding paper: {e}")
        import traceback
        traceback.print_exc()
        return Div(f"Error adding paper: {e}", style="color: red;")
    
    return RedirectResponse('/library', status_code=303)

def remove_paper(item_id: int, session):
    """Remove a paper from user's library"""
    user_id = session.get('user_id')
    if not user_id:
        print("No user_id in session, redirecting to login. Hi from remove_paper!")
        return RedirectResponse('/login', status_code=303)
    
    # Get the item and verify ownership
    item = library[item_id]
    if not item or item.user_id != user_id:
        return "Not found", 404
    
    # Remove the item
    library.delete(item_id)
    
    # Return updated library
    user_library = library(where=f"user_id = '{user_id}'")
    return _render_library_items(user_library) 