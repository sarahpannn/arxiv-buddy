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
        # oauth_link = google_client.login_link(redirect_uri="https://wonderful-ruby-divides-86r.pla.sh/")  # type: ignore
        print(f"Generated OAuth link: {oauth_link}")
    except Exception as e:
        print(f"Error generating OAuth link: {e}")
        oauth_link = "#"
    
    return Titled("Login - Arxiv Buddy",
        Div(
            H1("Welcome to Arxiv Buddy"),
            P("Sign in with your Google account to access your personal arXiv library."),
            Div(
                Button("Sign in with Passkey", 
                       id="passkey-signin-btn",
                       onclick="signInWithPasskey()",
                       style="display: inline-block; padding: 16px 32px; background: #6366f1; color: white; border: none; border-radius: 8px; font-size: 1.1rem; font-weight: 500; box-shadow: 0 2px 8px rgba(99,102,241,0.2); cursor: pointer;"),
                Div(id="passkey-signin-status", style="margin-top: 10px;"),
                style="margin: 30px 0; text-align: center;"
            ),
            Div(
                A("Sign in with Google", 
                  href=oauth_link,
                  style="display: inline-block; padding: 16px 32px; background: #4285f4; color: white; text-decoration: none; border-radius: 8px; font-size: 1.1rem; font-weight: 500; box-shadow: 0 2px 8px rgba(66,133,244,0.2);"),
                style="margin: 30px 0; text-align: center;"
            ),
            
            Div(
                P("Or register with your email:", 
                  style="color: #666; margin-bottom: 1rem; font-size: 1rem;"),
                Form(
                    Input(
                        placeholder="Enter your email address",
                        name="email",
                        type="email",
                        required=True,
                        style="width: 100%; max-width: 400px; padding: 16px 18px; margin-bottom: 18px; font-size: 1.1rem; border-radius: 8px; border: 1.5px solid #ccc; background: #fafbfc;",
                    ),
                    Button(
                        "Create Account",
                        type="submit",
                        style="padding: 14px 32px; font-size: 1.1rem; border-radius: 8px; background: #10b981; color: white; border: none; font-weight: 500; cursor: pointer; box-shadow: 0 2px 8px rgba(16,185,129,0.08);",
                    ),
                    action="/magiclink/send",
                    method="post",
                    style="margin-bottom: 0;",
                ),
                style="margin: 30px 0; text-align: center;"
            ),
            P("Your papers will be saved to your personal library for easy access.", 
              style="color: #666; text-align: center; font-size: 0.9rem;"),
            A("Back to Home", href="/", style="color: #666; text-decoration: none; margin-top: 20px; display: inline-block;"),
            style="max-width: 500px; margin: 50px auto; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.07); text-align: center;"
        ),
        Script("""
            async function signInWithPasskey() {
                const statusDiv = document.getElementById('passkey-signin-status');
                const signinBtn = document.getElementById('passkey-signin-btn');
                
                try {
                    signinBtn.disabled = true;
                    signinBtn.textContent = 'Signing in...';
                    statusDiv.innerHTML = '<div style="color: #3b82f6; font-size: 0.875rem;">🔐 Starting passkey authentication...</div>';
                    
                    // Step 1: Get authentication options
                    const beginResponse = await fetch('/passkey/auth/begin');
                    if (!beginResponse.ok) throw new Error('Failed to start passkey authentication');
                    
                    const options = await beginResponse.json();
                    
                    // Convert challenge from base64url to Uint8Array
                    options.challenge = Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
                    
                    // Step 2: Get credential from authenticator
                    const credential = await navigator.credentials.get({
                        publicKey: options
                    });
                    
                    // Step 3: Send assertion to server
                    const completeResponse = await fetch('/passkey/auth/complete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: credential.id,
                            rawId: Array.from(new Uint8Array(credential.rawId)),
                            response: {
                                authenticatorData: Array.from(new Uint8Array(credential.response.authenticatorData)),
                                clientDataJSON: Array.from(new Uint8Array(credential.response.clientDataJSON)),
                                signature: Array.from(new Uint8Array(credential.response.signature))
                            },
                            type: credential.type
                        })
                    });
                    
                    const result = await completeResponse.json();
                    
                    if (completeResponse.ok && result.success) {
                        statusDiv.innerHTML = '<div style="color: #10b981; font-size: 0.875rem;">✅ Signed in successfully!</div>';
                        setTimeout(() => window.location.href = result.redirect || '/library', 1000);
                    } else {
                        // Check if it's a "user not found" case that should redirect to magic link
                        if (completeResponse.status === 404 && result.redirect) {
                            statusDiv.innerHTML = '<div style="color: #f59e0b; font-size: 0.875rem;">⚠️ Passkey not found. Redirecting to registration...</div>';
                            setTimeout(() => window.location.href = result.redirect, 1500);
                            return;
                        }
                        throw new Error(result.error || 'Authentication failed');
                    }
                    
                } catch (error) {
                    statusDiv.innerHTML = '<div style="color: #ef4444; font-size: 0.875rem;">❌ Failed to sign in with passkey. Please try again.</div>';
                    signinBtn.disabled = false;
                    signinBtn.textContent = 'Sign in with Passkey';
                    console.error('Passkey signin error:', error);
                    
                    // Show helpful message if no passkeys found
                    if (error.name === 'NotAllowedError') {
                        statusDiv.innerHTML = '<div style="color: #f59e0b; font-size: 0.875rem;">⚠️ No passkeys found. You may need to register a passkey first.</div>';
                    }
                }
            }
        """)
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