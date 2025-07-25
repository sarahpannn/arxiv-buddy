from fasthtml.common import *
from starlette.responses import RedirectResponse, Response
from datetime import datetime
from auth import login_page, logout
from models import users, db
from passkeys import get_passkey_for_auth, add_passkey_credential
from webauthn import (generate_registration_options, options_to_json, verify_registration_response,
    generate_authentication_options, verify_authentication_response)
from webauthn.helpers.structs import (RegistrationCredential, AuthenticationCredential, AuthenticatorSelectionCriteria,
    ResidentKeyRequirement, UserVerificationRequirement, AuthenticatorAttestationResponse, AuthenticatorAssertionResponse)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from base64 import urlsafe_b64decode, urlsafe_b64encode
from json import dumps,loads
import secrets


def register_auth_routes(rt, google_client):
    """Register authentication routes"""
    
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
    
    @rt("/magiclink/register")
    def magiclink_register_page():
        """Magic link registration page for users without passkeys"""
        return Titled("Register - Arxiv Buddy",
            Div(
                H1("Create Your Account", style="margin-bottom: 1rem;"),
                P("It looks like you don't have a passkey registered yet. Enter your email to create an account and get started:", 
                  style="color: #666; margin-bottom: 2rem; text-align: center;"),
                
                Form(
                    Input(
                        placeholder="Enter your email address",
                        name="email",
                        type="email",
                        required=True,
                        style="width: 100%; padding: 16px 18px; margin-bottom: 18px; font-size: 1.1rem; border-radius: 8px; border: 1.5px solid #ccc; background: #fafbfc;",
                    ),
                    Button(
                        "Send Magic Link",
                        type="submit",
                        style="width: 100%; padding: 16px 32px; font-size: 1.1rem; border-radius: 8px; background: #4285f4; color: white; border: none; font-weight: 500; cursor: pointer;",
                    ),
                    action="/magiclink/send",
                    method="post",
                    style="margin-bottom: 2rem;",
                ),
                
                P("We'll send you a secure link to create your account and set up a passkey.", 
                  style="color: #888; font-size: 0.9rem; text-align: center; margin-bottom: 2rem;"),
                
                A("Back to Sign In", href="/login", 
                  style="color: #666; text-decoration: none; font-size: 0.9rem;"),
                
                style="max-width: 400px; margin: 100px auto; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.07); text-align: center;"
            )
        )
    
    @rt('/magiclink/send')
    async def magiclink_send(request):
        """Send magic link to user's email"""
        form_data = await request.form()
        email = form_data.get('email')
        if not email:
            return {"error": "Email is required"}, 400
        
        # Generate a random auth ID
        auth_id = secrets.token_hex(16)
        
        # Store the auth ID in database with expiration (30 minutes)
        from datetime import datetime, timedelta
        now = datetime.now()
        expires_at = now + timedelta(minutes=30)
        
        from models import magic_auth_tokens
        magic_auth_tokens.insert(
            auth_id=auth_id,
            email=email,
            created_at=int(now.timestamp()),
            expires_at=int(expires_at.timestamp()),
            used=False
        )
        
        # Send the email
        from magiclink import send_email
        try:
            send_email(to_email=email, from_email="arxiv-bud@answer.ai", 
                       subject="Your Arxiv Buddy Magic Link", 
                       body=f"Click the link below to create your account and set up a passkey:\n\n"
                            f"http://localhost:5002/magiclink/verify?auth_id={auth_id}&email={email}")
            print(f"Sent magic link to {email} with auth_id {auth_id}")
        except Exception as e:
            print(f"Error sending magic link: {e}")
            return {"error": "Failed to send email"}, 500
        
        # Redirect to "check email" page
        return RedirectResponse(f"/magiclink/check-email?email={email}", status_code=303)
    
    @rt("/magiclink/check-email")
    def magiclink_check_email(email: str = None):
        """Show 'check your email' page"""
        return Titled("Check Your Email - Arxiv Buddy",
            Div(
                Div("📧", style="font-size: 4rem; margin-bottom: 1rem;"),
                H1("Check Your Email", style="margin-bottom: 1rem; color: #333;"),
                P(f"We've sent a magic link to:", style="color: #666; margin-bottom: 0.5rem;"),
                P(email or "your email address", 
                  style="font-weight: 600; color: #4285f4; margin-bottom: 2rem; font-size: 1.1rem;"),
                
                P("Click the link in your email to create your account and set up a passkey.", 
                  style="color: #666; margin-bottom: 1rem; line-height: 1.5;"),
                
                P("The link will expire in 30 minutes.", 
                  style="color: #888; font-size: 0.9rem; margin-bottom: 2rem;"),
                
                Div(
                    P("Didn't receive the email?", style="color: #666; margin-bottom: 1rem;"),
                    A("Send another magic link", 
                      href="/magiclink/register",
                      style="color: #4285f4; text-decoration: none; font-weight: 500;"),
                    style="margin-bottom: 2rem;"
                ),
                
                A("← Back to Sign In", 
                  href="/login",
                  style="color: #666; text-decoration: none; font-size: 0.9rem;"),
                
                style="max-width: 450px; margin: 100px auto; padding: 50px 40px; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.07); text-align: center;"
            )
        )
    
    @rt("/magiclink/verify")
    def magiclink_verify(auth_id: str, email: str, session):
        """Verify magic link and create user account"""
        from models import magic_auth_tokens, users
        from datetime import datetime
        
        # Look up the auth token
        try:
            token = magic_auth_tokens[auth_id]
        except KeyError:
            # Token not found in database - redirect to general error page
            return RedirectResponse("/magiclink/error?reason=invalid", status_code=303)
        except Exception as e:
            # Unexpected database error
            print(f"Database error during magic link verification: {e}")
            return RedirectResponse("/magiclink/error?reason=database", status_code=303)
        
        # Verify token hasn't been used and hasn't expired
        now = int(datetime.now().timestamp())
        if token.used or now > token.expires_at or token.email != email:
            # Mark as used to prevent reuse
            magic_auth_tokens.update(dict(auth_id=auth_id, used=True))
            
            return Titled("Expired Link - Arxiv Buddy",
                Div(
                    Div("⏳", style="font-size: 4rem; margin-bottom: 1rem;"), 
                    H1("Magic Link Expired", style="color: #f59e0b; margin-bottom: 1rem;"),
                    P("This magic link has expired or already been used.", 
                      style="color: #666; margin-bottom: 2rem;"),
                    A("Get a new magic link", href="/magiclink/register",
                      style="color: #4285f4; text-decoration: none; font-weight: 500;"),
                    style="max-width: 400px; margin: 100px auto; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.07); text-align: center;"
                )
            )
        
        # Create user account
        try:
            username = email.split('@')[0]  # Use email prefix as username
            user_id = f"magic_{auth_id[:8]}"  # Create unique user ID
            
            # Check if user already exists (shouldn't happen, but safety check)
            if user_id not in users:
                users.insert(
                    id=user_id,
                    email=email,
                    username=username,
                    provider="magiclink",
                    created_at=datetime.now().isoformat()
                )
                print(f"Created new user via magic link: {username} ({email})")
            
            # Mark token as used
            magic_auth_tokens.update(dict(auth_id=auth_id, used=True))
            
            # Set up session (user is now logged in)
            session["user_id"] = user_id
            session["provider"] = "magiclink"
            
            print(f"Magic link authentication successful for user: {username}")
            
            # Redirect to passkey setup page instead of library
            return RedirectResponse("/passkey/setup", status_code=303)
            
        except Exception as e:
            # Something went wrong during user creation
            print(f"Error creating user account: {e}")
            return RedirectResponse("/magiclink/error?reason=creation", status_code=303)
    
    @rt("/magiclink/error")
    def magiclink_error(reason: str = "unknown"):
        """Generic error page for magic link issues"""
        
        # Customize message based on error reason
        if reason in ("database", "invalid"):
            title = "Hmm, Something Went Wrong"
            message = "Your authentication token is invalid or has expired."
            emoji = "🤔"
            color = "#f59e0b"
        elif reason == "creation":
            title = "Account Creation Failed"
            message = "We had trouble creating your account. This might be a temporary issue."
            emoji = "⚠️"
            color = "#f59e0b"
        else:
            title = "Hmm, Something Must Have Gone Wrong"
            message = "We encountered an unexpected issue. Don't worry, this isn't your fault!"
            emoji = "🤔"
            color = "#6b7280"
        
        return Titled(f"{title} - Arxiv Buddy",
            Div(
                Div(emoji, style="font-size: 4rem; margin-bottom: 1rem;"),
                H1(title, style=f"color: {color}; margin-bottom: 1rem;"),
                P(message, 
                  style="color: #666; margin-bottom: 2rem; line-height: 1.5; max-width: 400px; margin-left: auto; margin-right: auto;"),
                
                Div(
                    A("Try sending another magic link", 
                      href="/magiclink/register",
                      style="display: inline-block; padding: 12px 24px; background: #4285f4; color: white; text-decoration: none; border-radius: 8px; font-weight: 500; margin: 8px;"),
                    Br(),
                    A("← Back to Sign In", 
                      href="/login",
                      style="color: #666; text-decoration: none; font-size: 0.9rem; margin-top: 1rem; display: inline-block;"),
                    style="margin-bottom: 2rem;"
                ),
                
                P("If this problem persists, please contact support.", 
                  style="color: #888; font-size: 0.85rem;"),
                
                style="max-width: 500px; margin: 100px auto; padding: 50px 40px; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.07); text-align: center;"
            )
        )
    
    @rt("/passkey/setup")
    def passkey_setup_page(session):
        """Intermediate page asking user if they want to add a passkey"""
        user_id = session.get("user_id")
        if not user_id:
            return RedirectResponse("/login", status_code=303)
        
        from models import users
        user = users[user_id]
        
        return Titled("Set Up Passkey - Arxiv Buddy",
            Div(
                Div("🔐", style="font-size: 4rem; margin-bottom: 1rem;"),
                H1("Welcome to Arxiv Buddy!", style="margin-bottom: 1rem; color: #333;"),
                P(f"Hi {user.username}! Your account has been created successfully.", 
                  style="color: #666; margin-bottom: 1.5rem; font-size: 1.1rem;"),
                
                P("Would you like to set up a passkey for faster, more secure sign-ins?", 
                  style="color: #666; margin-bottom: 2rem; line-height: 1.5;"),
                
                Div(
                    P("✨ Sign in with just your fingerprint, face, or security key", style="color: #10b981; margin-bottom: 0.5rem; text-align: left;"),
                    P("🚀 Faster than passwords", style="color: #10b981; margin-bottom: 0.5rem; text-align: left;"),
                    P("🔒 More secure than traditional logins", style="color: #10b981; margin-bottom: 2rem; text-align: left;"),
                    style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 1.5rem; margin-bottom: 2rem;"
                ),
                
                Div(
                    Button("Set Up Passkey", 
                           id="setup-passkey-btn",
                           onclick="setupPasskey()",
                           style="display: inline-block; padding: 16px 32px; background: #4285f4; color: white; border: none; border-radius: 8px; font-size: 1.1rem; font-weight: 500; cursor: pointer; margin: 8px;"),
                    Br(),
                    A("Skip for now", 
                      href="/library",
                      style="color: #666; text-decoration: none; font-size: 0.9rem; margin-top: 1rem; display: inline-block;"),
                    style="margin-bottom: 2rem;"
                ),
                
                Div(id="passkey-setup-status", style="margin-top: 1rem;"),
                
                style="max-width: 500px; margin: 100px auto; padding: 50px 40px; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.07); text-align: center;"
            ),
            Script("""
                async function setupPasskey() {
                    const statusDiv = document.getElementById('passkey-setup-status');
                    const setupBtn = document.getElementById('setup-passkey-btn');
                    
                    try {
                        setupBtn.disabled = true;
                        setupBtn.textContent = 'Setting up...';
                        statusDiv.innerHTML = '<div style="color: #3b82f6; font-size: 0.875rem;">🔐 Starting passkey setup...</div>';
                        
                        // Step 1: Get registration options
                        const beginResponse = await fetch('/passkey/register/begin');
                        if (!beginResponse.ok) throw new Error('Failed to start passkey setup');
                        
                        const options = await beginResponse.json();
                        
                        // Convert challenge and user.id from base64url to Uint8Array
                        options.challenge = Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
                        options.user.id = Uint8Array.from(atob(options.user.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
                        
                        // Step 2: Create credential
                        const credential = await navigator.credentials.create({
                            publicKey: options
                        });
                        
                        // Step 3: Send credential to server
                        const completeResponse = await fetch('/passkey/register/complete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: credential.id,
                                rawId: Array.from(new Uint8Array(credential.rawId)),
                                response: {
                                    attestationObject: Array.from(new Uint8Array(credential.response.attestationObject)),
                                    clientDataJSON: Array.from(new Uint8Array(credential.response.clientDataJSON))
                                },
                                type: credential.type
                            })
                        });
                        
                        if (completeResponse.ok) {
                            statusDiv.innerHTML = '<div style="color: #10b981; font-size: 0.875rem;">✅ Passkey set up successfully! Redirecting...</div>';
                            setTimeout(() => window.location.href = '/library', 2000);
                        } else {
                            throw new Error('Failed to complete passkey setup');
                        }
                        
                    } catch (error) {
                        statusDiv.innerHTML = '<div style="color: #ef4444; font-size: 0.875rem;">❌ Failed to set up passkey. <a href="/library" style="color: #4285f4;">Continue to library</a></div>';
                        setupBtn.disabled = false;
                        setupBtn.textContent = 'Try Again';
                        console.error('Passkey setup error:', error);
                    }
                }
            """)
        )
    
    @rt("/passkey/register")
    def passkey_register_page(email: str = None):
        """Direct passkey registration page for new users"""
        if not email:
            return RedirectResponse("/login", status_code=303)
        
        return Titled("Register with Passkey - Arxiv Buddy",
            Div(
                Div("🔐", style="font-size: 4rem; margin-bottom: 1rem;"),
                H1("Create Your Account", style="margin-bottom: 1rem; color: #333;"),
                P(f"Setting up your account for: {email}", 
                  style="color: #666; margin-bottom: 1.5rem; font-size: 1.1rem;"),
                
                P("We'll create your account and set up a passkey in one step!", 
                  style="color: #666; margin-bottom: 2rem; line-height: 1.5;"),
                
                Div(
                    P("✨ Sign in with just your fingerprint, face, or security key", style="color: #10b981; margin-bottom: 0.5rem; text-align: left;"),
                    P("🚀 No passwords to remember", style="color: #10b981; margin-bottom: 0.5rem; text-align: left;"),
                    P("🔒 More secure than traditional logins", style="color: #10b981; margin-bottom: 2rem; text-align: left;"),
                    style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 1.5rem; margin-bottom: 2rem;"
                ),
                
                Div(
                    Button("Create Account with Passkey", 
                           id="create-account-btn",
                           onclick=f"createAccountWithPasskey('{email}')",
                           style="display: inline-block; padding: 16px 32px; background: #10b981; color: white; border: none; border-radius: 8px; font-size: 1.1rem; font-weight: 500; cursor: pointer; margin: 8px;"),
                    Br(),
                    A("← Back to Sign In", 
                      href="/login",
                      style="color: #666; text-decoration: none; font-size: 0.9rem; margin-top: 1rem; display: inline-block;"),
                    style="margin-bottom: 2rem;"
                ),
                
                Div(id="account-creation-status", style="margin-top: 1rem;"),
                
                style="max-width: 500px; margin: 100px auto; padding: 50px 40px; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.07); text-align: center;"
            ),
            Script(f"""
                async function createAccountWithPasskey(email) {{
                    const statusDiv = document.getElementById('account-creation-status');
                    const createBtn = document.getElementById('create-account-btn');
                    
                    try {{
                        createBtn.disabled = true;
                        createBtn.textContent = 'Creating account...';
                        statusDiv.innerHTML = '<div style="color: #3b82f6; font-size: 0.875rem;">🔐 Creating your account and passkey...</div>';
                        
                        // Step 1: Create user account first
                        const createResponse = await fetch('/passkey/create-account', {{
                            method: 'POST',
                            headers: {{ 'Content-Type': 'application/json' }},
                            body: JSON.stringify({{ email: email }})
                        }});
                        
                        if (!createResponse.ok) {{
                            const error = await createResponse.json();
                            throw new Error(error.error || 'Failed to create account');
                        }}
                        
                        statusDiv.innerHTML = '<div style="color: #3b82f6; font-size: 0.875rem;">🔐 Setting up your passkey...</div>';
                        
                        // Step 2: Set up passkey (same as the setup page)
                        const beginResponse = await fetch('/passkey/register/begin');
                        if (!beginResponse.ok) throw new Error('Failed to start passkey setup');
                        
                        const options = await beginResponse.json();
                        
                        // Convert challenge and user.id from base64url to Uint8Array
                        options.challenge = Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
                        options.user.id = Uint8Array.from(atob(options.user.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
                        
                        // Step 3: Create credential
                        const credential = await navigator.credentials.create({{
                            publicKey: options
                        }});
                        
                        // Step 4: Send credential to server
                        const completeResponse = await fetch('/passkey/register/complete', {{
                            method: 'POST',
                            headers: {{ 'Content-Type': 'application/json' }},
                            body: JSON.stringify({{
                                id: credential.id,
                                rawId: Array.from(new Uint8Array(credential.rawId)),
                                response: {{
                                    attestationObject: Array.from(new Uint8Array(credential.response.attestationObject)),
                                    clientDataJSON: Array.from(new Uint8Array(credential.response.clientDataJSON))
                                }},
                                type: credential.type
                            }})
                        }});
                        
                        if (completeResponse.ok) {{
                            statusDiv.innerHTML = '<div style="color: #10b981; font-size: 0.875rem;">✅ Account created and passkey set up! Redirecting...</div>';
                            setTimeout(() => window.location.href = '/library', 2000);
                        }} else {{
                            throw new Error('Failed to complete passkey setup');
                        }}
                        
                    }} catch (error) {{
                        statusDiv.innerHTML = '<div style="color: #ef4444; font-size: 0.875rem;">❌ Failed to create account. <a href="/login" style="color: #4285f4;">Try again</a></div>';
                        createBtn.disabled = false;
                        createBtn.textContent = 'Try Again';
                        console.error('Account creation error:', error);
                    }}
                }}
            """)
        )
    
    @rt("/passkey/create-account")
    async def passkey_create_account(request, session):
        """Create user account for direct passkey registration"""
        try:
            data = await request.json()
            email = data.get('email')
            
            if not email or '@' not in email:
                return {"error": "Valid email is required"}, 400
            
            # Create user account
            from datetime import datetime
            username = email.split('@')[0]
            user_id = f"passkey_{secrets.token_hex(8)}"
            
            users.insert(
                id=user_id,
                email=email,
                username=username,
                provider="passkey_direct",
                created_at=datetime.now().isoformat()
            )
            
            # Set up session
            session["user_id"] = user_id
            session["provider"] = "passkey_direct"
            
            print(f"Created direct passkey user: {username} ({email})")
            return {"success": True, "user_id": user_id}
            
        except Exception as e:
            print(f"Error creating passkey account: {e}")
            return {"error": "Failed to create account"}, 500
    
    @rt("/passkey/register/begin")
    def passkey_register_begin(request, session):
        """Start passkey registration - generate options"""
        user_id = session.get("user_id")
        if not user_id:
            return {"error": "Not authenticated"}, 401
        
        from models import users
        user = users[user_id]
        
        options = generate_registration_options(
            rp_id=request.url.hostname or "localhost",
            rp_name="Arxiv Buddy",
            user_id=user_id.encode('utf-8'),
            user_name=user.email,
            user_display_name=user.username,
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.PREFERRED,
                user_verification=UserVerificationRequirement.PREFERRED
            )
        )
        
        # Store challenge in session for verification
        session["registration_challenge"] = bytes_to_base64url(options.challenge)
        
        return options_to_json(options)
    
    @rt("/passkey/register/complete")
    async def passkey_register_complete(request, session):
        """Complete passkey registration - store credential"""
        try:
            user_id = session.get("user_id")
            if not user_id:
                return {"error": "Not authenticated"}, 401
            
            # Get the challenge from session
            expected_challenge_str = session.get("registration_challenge")
            if not expected_challenge_str:
                return {"error": "No registration challenge found"}, 400
            
            expected_challenge = base64url_to_bytes(expected_challenge_str)
            
            registration_data = await request.json()
            
            # Parse the registration credential
            # Convert the response data to proper format
            response = AuthenticatorAttestationResponse(
                client_data_json=bytes(registration_data['response']['clientDataJSON']) if isinstance(registration_data['response']['clientDataJSON'], list) else registration_data['response']['clientDataJSON'],
                attestation_object=bytes(registration_data['response']['attestationObject']) if isinstance(registration_data['response']['attestationObject'], list) else registration_data['response']['attestationObject']
            )
            
            credential = RegistrationCredential(
                id=registration_data['id'],
                raw_id=bytes(registration_data['rawId']) if isinstance(registration_data['rawId'], list) else registration_data['rawId'],
                response=response,
                type=registration_data['type']
            )
            
            # Verify the registration response
            verification = verify_registration_response(
                credential=credential,
                expected_challenge=expected_challenge,
                expected_origin="http://localhost:5002",
                expected_rp_id="localhost",
            )
            
            # Check if registration was successful - we just check if we got a valid response
            # VerifiedRegistration doesn't have a simple success/fail flag, but if we get here, it succeeded
            print(f"Registration verification completed successfully")

            add_passkey_credential(
                uid=user_id,
                credential_id=bytes_to_base64url(credential.raw_id),  # Convert to base64url string
                public_key=bytes_to_base64url(verification.credential_public_key),
                counter=verification.sign_count
            )
            
            # Clear the challenge
            session.pop("registration_challenge", None)
            
            print(f"Passkey registered successfully for user: {user_id}")
            return {"success": True}
            
        except Exception as e:
            print(f"Passkey registration error: {e}")
            import traceback
            traceback.print_exc()
            return {"error": "Registration failed"}, 400
    
    @rt("/passkey/auth/begin")
    def passkey_auth_begin(request, session):
        """Start passkey authentication - generate challenge"""
        options = generate_authentication_options(
            rp_id=request.url.hostname or "localhost",
            timeout=60000,
            user_verification=UserVerificationRequirement.PREFERRED,
        )
        
        # Store challenge in session for verification (convert bytes to base64url string)
        session["auth_challenge"] = bytes_to_base64url(options.challenge)
        
        return options_to_json(options)
    
    @rt("/passkey/auth/complete")
    async def passkey_auth_complete(request, session):
        """Complete passkey authentication - verify assertion"""
        try:
            expected_challenge_str = session.get("auth_challenge")
            if not expected_challenge_str:
                return {"error": "No authentication challenge found"}, 400
            
            expected_challenge = base64url_to_bytes(expected_challenge_str)
            
            auth_data = await request.json()
            
            # Parse the authentication credential from client
            # webauthn 2.6.0 uses dataclasses, not Pydantic
            # Convert the response data to proper format
            response = AuthenticatorAssertionResponse(
                client_data_json=bytes(auth_data['response']['clientDataJSON']) if isinstance(auth_data['response']['clientDataJSON'], list) else auth_data['response']['clientDataJSON'],
                authenticator_data=bytes(auth_data['response']['authenticatorData']) if isinstance(auth_data['response']['authenticatorData'], list) else auth_data['response']['authenticatorData'],
                signature=bytes(auth_data['response']['signature']) if isinstance(auth_data['response']['signature'], list) else auth_data['response']['signature']
            )
            
            credential = AuthenticationCredential(
                id=auth_data['id'],
                raw_id=bytes(auth_data['rawId']) if isinstance(auth_data['rawId'], list) else auth_data['rawId'],
                response=response,
                type=auth_data['type']
            )
            
            # Get stored credential from database
            credential_id_str = bytes_to_base64url(credential.raw_id)
            print(f"Looking for credential with raw_id: {credential.raw_id}")
            print(f"Looking for credential with base64url ID: {credential_id_str}")
            cred = get_passkey_for_auth(credential_id_str)
            print(f"Found credential: {cred}")
            
            if not cred:
                # User doesn't exist - redirect to magic link registration
                print("No credential found - redirecting to magic link registration")
                return Response(
                    content='{"error": "User not found", "redirect": "/magiclink/register"}',
                    status_code=404,
                    headers={"Content-Type": "application/json"}
                )

            # Verify the authentication response
            try:
                verification = verify_authentication_response(
                    credential=credential,
                    expected_challenge=expected_challenge,
                    expected_origin="http://localhost:5002",  # Your domain
                    expected_rp_id="localhost",
                    credential_public_key=base64url_to_bytes(cred['public_key']),
                    credential_current_sign_count=cred['counter'],
                    require_user_verification=False,
                )
                print(f"Authentication verification completed successfully")
            except Exception as e:
                print(f"Authentication verification failed: {e}")
                return {"error": "Authentication verification failed"}, 400
            
            # Update the sign count in database
            from passkeys import update_passkey_counter
            update_passkey_counter(credential_id_str, verification.new_sign_count)
            
            # Successfully authenticated - set up session
            session["user_id"] = cred['uid']
            session["provider"] = "passkey"
            
            session.pop("auth_challenge", None)
            
            return {"success": True, "redirect": "/library"}
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return {"error": "Authentication failed"}, 400

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