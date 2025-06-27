import os
from datetime import datetime
from fasthtml.common import *
from fasthtml.oauth import GoogleAppClient, OAuth
from models import db, users, User

print("=== AUTH.PY MODULE LOADED ===")

# Google OAuth client (set these up in your environment variables)
client_id = os.getenv("GOOGLE_CLIENT_ID")
client_secret = os.getenv("GOOGLE_CLIENT_SECRET")

print(f"Initializing Google OAuth client...")
print(f"Client ID: {client_id}")
print(f"Client Secret: {'SET' if client_secret else 'NOT SET'}")

try:
    google_client = GoogleAppClient(client_id, client_secret)
    print(f"Google OAuth client created successfully: {google_client}")
except Exception as e:
    print(f"Error creating Google OAuth client: {e}")
    google_client = None

class Auth(OAuth):
    def get_auth(self, info, ident, session, state):
        """Handle Google OAuth authentication"""
        print(f"=== OAUTH MIDDLEWARE AUTH CALLED ===")
        print(f"User info: {info}")
        print(f"User ID: {ident}")
        print(f"Session before: {session}")
        print(f"Session type: {type(session)}")
        print(f"State: {state}")
        
        # Extract user info from Google
        email = info.email or ''
        username = info.name or email.split('@')[0]
        
        # Check if user exists, create if not
        if ident not in users:
            users.insert(
                id=ident,
                email=email,
                username=username,
                provider='google',
                created_at=datetime.now().isoformat()
            )
            print(f"Created new user: {username}")
        else:
            print(f"User already exists: {username}")
        
        # Store user ID in session
        session['user_id'] = ident
        session['provider'] = 'google'
        print(f"Session after setting user_id: {session}")
        
        print(f"=== END OAUTH MIDDLEWARE AUTH ===")
        
        # Redirect to library
        return RedirectResponse('/library', status_code=303)

# Create OAuth instance (will be initialized in main.py)
oauth = None

def login_page():
    """Login page with Google OAuth"""
    print("=== LOGIN PAGE CALLED ===")
    
    try:
        # Use the OAuth middleware's default redirect path
        oauth_link = google_client.login_link(redirect_uri="http://localhost:5002/")  # type: ignore
        print(f"Generated OAuth link: {oauth_link}")
    except Exception as e:
        print(f"Error generating OAuth link: {e}")
        oauth_link = "#"
    
    return Titled("Login - Arxiv Buddy",
        Div(
            H1("Welcome to Arxiv Buddy"),
            P("Sign in with your Google account to access your personal arXiv library."),
            Div(
                A("Sign in with Google", 
                  href=oauth_link,
                  style="display: inline-block; padding: 16px 32px; background: #4285f4; color: white; text-decoration: none; border-radius: 8px; font-size: 1.1rem; font-weight: 500; box-shadow: 0 2px 8px rgba(66,133,244,0.2);"),
                style="margin: 30px 0; text-align: center;"
            ),
            P("Your papers will be saved to your personal library for easy access.", 
              style="color: #666; text-align: center; font-size: 0.9rem;"),
            A("Back to Home", href="/", style="color: #666; text-decoration: none; margin-top: 20px; display: inline-block;"),
            style="max-width: 500px; margin: 50px auto; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.07); text-align: center;"
        )
    )

def logout(session):
    """Log out user"""
    print("=== LOGOUT CALLED ===")
    print(f"Session before logout: {session}")
    print(f"Session keys before: {list(session.keys()) if session else 'No session'}")
    
    if session:
        session.pop('user_id', None)
        session.pop('provider', None)
        # Clear the session completely
        session.clear()
        
    print(f"Session after logout: {session}")
    print(f"Session keys after: {list(session.keys()) if session else 'No session'}")
    
    return RedirectResponse('/', status_code=303)

def require_auth(request, session):
    """Middleware to require authentication"""
    user_id = session.get('user_id')
    if not user_id:
        print("Require auth: No user_id in session, redirecting to login")
        return RedirectResponse('/login', status_code=303)
    return None 