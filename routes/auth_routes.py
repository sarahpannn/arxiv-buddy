from fasthtml.common import *
from starlette.responses import RedirectResponse
from datetime import datetime
from auth import login_page, logout
from models import users
from .magiclink_routes import register_magiclink_routes
from .passkey_routes import register_passkey_routes


def register_auth_routes(rt, google_client):
    """Register authentication routes"""
    
    # Register auth-specific routes
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
    
    # Register routes from other modules
    register_magiclink_routes(rt)
    register_passkey_routes(rt)

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
                user_info = google_client.retr_info(code, redirect_uri="http://localhost:5002/")

                print(f"User info: {user_info}")

                # Extract user details
                user_id = user_info["sub"]
                email = user_info.get("email", "")
                username = user_info.get("name", "") or email.split("@")[0]

                # Create/update user in database
                if user_id not in users:
                    users.insert(
                        id=user_id,
                        email=email,
                        username=username,
                        provider="google",
                        created_at=datetime.now().isoformat(),
                    )
                    print(f"Created new user: {username}")
                else:
                    print(f"User already exists: {username}")

                # Set session
                session["user_id"] = user_id
                session["provider"] = "google"
                print(f"Session after OAuth: {session}")

                # Redirect to library
                return RedirectResponse("/library", status_code=303)

            except Exception as e:
                print(f"OAuth error: {e}")
                import traceback
                traceback.print_exc()
                return RedirectResponse("/login?error=oauth_failed", status_code=303)

        if session:
            print(
                "Session keys:",
                list(session.keys()) if hasattr(session, "keys") else "No keys method",
            )
            print("User ID in session:", session.get("user_id"))
        user_id = session.get("user_id") if session else None

        return Titled(
            "Arxiv Buddy",
            Script(src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"),
            Link(rel="stylesheet", href="/static/style.css"),
            Div(
                Div(
                    H1(
                        "Arxiv Buddy",
                        style="font-size: 2.2rem; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: -1px;",
                    ),
                    P(
                        "Welcome to the V0 Alpha of Arxiv Buddy.",
                        Br(),
                        "Graciously accepting feedback at ",
                        A("@spantacular on X", href="https://x.com/spantacular"),
                        style="color: #666; font-size: 1.1rem; margin-bottom: 2rem;",
                    ),
                    # Show different content based on login status
                    _render_main_content(user_id),
                    style="background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.07); padding: 44px 40px 36px 40px; max-width: 900px; margin: 0 auto;",
                ),
                Div(
                    Div(
                        P(
                            "Arxiv Buddy gives you a nicer way to read arXiv papers in your browser. Enter an arXiv URL above to get started!",
                            style="text-align: center; color: #888; font-size: 1.1rem;",
                        ),
                        id="pdf-viewer-content",
                        style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; min-height: 120px;",
                    ),
                    id="viewer-container",
                    style="border: 1px solid #eee; border-radius: 10px; margin-top: 24px; min-height: 150px; background: #fafbfc; max-width: 630px; margin-left: auto; margin-right: auto;",
                ),
                style="min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; background: none; padding: 0; text-align: center;",
            ),
            Script(
                """
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            """
            ),
        )


def _render_main_content(user_id):
    """Render different content based on login status"""
    from models import users
    
    if user_id:
        # User is logged in
        user = users[user_id]
        return Div(
            P(
                f"Welcome back, {user.username}!",
                style="color: #4285f4; font-weight: 500; margin-bottom: 1rem;",
            ),
            A(
                "View My Library",
                href="/library",
                style="display: inline-block; padding: 12px 24px; background: #4285f4; color: white; text-decoration: none; border-radius: 8px; margin: 8px; font-weight: 500;",
            ),
            A(
                "Logout",
                href="/logout",
                style="display: inline-block; padding: 8px 16px; background: #666; color: white; text-decoration: none; border-radius: 6px; margin: 8px;",
            ),
            Br(),
            Br(),
            Form(
                Input(
                    placeholder="Enter ArXiv URL (e.g., https://arxiv.org/abs/2309.15028)",
                    name="arxiv_url",
                    type="url",
                    required=True,
                    style="width: 100%; max-width: 700px; padding: 16px 18px; margin-bottom: 18px; font-size: 1.1rem; border-radius: 8px; border: 1.5px solid #ccc; background: #fafbfc;",
                ),
                Button(
                    "Load PDF",
                    type="submit",
                    style="padding: 14px 32px; font-size: 1.1rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(66,133,244,0.08); font-weight: 600;",
                ),
                action="/load_paper",
                method="post",
                style="margin-bottom: 0;",
            ),
        )
    else:
        # User is not logged in
        return Div(
            P(
                "Sign in to save papers to your personal library!",
                style="color: #666; margin-bottom: 1.5rem;",
            ),
            A(
                "Sign in",
                href="/login",
                style="display: inline-block; padding: 16px 32px; background: #4285f4; color: white; text-decoration: none; border-radius: 8px; font-size: 1.1rem; font-weight: 500; box-shadow: 0 2px 8px rgba(66,133,244,0.2);",
            ),
            Br(),
            P(
                "Or try it out without signing in:",
                style="color: #666; margin-top: 2rem; margin-bottom: 1rem;",
            ),
            Form(
                Input(
                    placeholder="Enter ArXiv URL (e.g., https://arxiv.org/abs/2309.15028)",
                    name="arxiv_url",
                    type="url",
                    required=True,
                    style="width: 100%; max-width: 700px; padding: 16px 18px; margin-bottom: 18px; font-size: 1.1rem; border-radius: 8px; border: 1.5px solid #ccc; background: #fafbfc;",
                ),
                Button(
                    "Load PDF",
                    type="submit",
                    style="padding: 14px 32px; font-size: 1.1rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(66,133,244,0.08); font-weight: 600;",
                ),
                action="/load_paper",
                method="post",
                style="margin-bottom: 0;",
            ),
        )