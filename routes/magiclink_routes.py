from fasthtml.common import *
from starlette.responses import RedirectResponse
from datetime import datetime, timedelta
from models import users, magic_auth_tokens, webauthncredentials
import secrets


def register_magiclink_routes(rt):
    
    @rt("/magiclink/register")
    def magiclink_register_page():
        return Titled("Register or Sign In - Arxiv Buddy",
            Div(
                H1("Sign In with Email", style="margin-bottom: 1rem;"),
                P("Enter your email to sign in to your existing account or create a new one:", 
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
                
                P("We'll send you a secure link to sign in or create your account.", 
                  style="color: #888; font-size: 0.9rem; text-align: center; margin-bottom: 2rem;"),
                
                A("Back to Sign In", href="/login", 
                  style="color: #666; text-decoration: none; font-size: 0.9rem;"),
                
                style="max-width: 400px; margin: 100px auto; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.07); text-align: center;"
            )
        )
    
    @rt('/magiclink/send')
    async def magiclink_send(request):
        form_data = await request.form()
        email = form_data.get('email')
        if not email:
            return {"error": "Email is required"}, 400
        
        auth_id = secrets.token_hex(16)
        
        now = datetime.now()
        expires_at = now + timedelta(minutes=30)
        
        magic_auth_tokens.insert(
            auth_id=auth_id,
            email=email,
            created_at=int(now.timestamp()),
            expires_at=int(expires_at.timestamp()),
            used=False
        )
        
        from magiclink import send_email
        try:
            send_email(to_email=email, from_email="arxiv-bud@answer.ai", 
                       subject="Your Arxiv Buddy Sign In Link", 
                       body=f"Click the link below to sign in to your Arxiv Buddy account:\n\n"
                            f"http://localhost:5002/magiclink/verify?auth_id={auth_id}&email={email}\n\n"
                            f"If you don't have an account yet, this link will create one for you.")
            print(f"Sent magic link to {email} with auth_id {auth_id}")
        except Exception as e:
            print(f"Error sending magic link: {e}")
            return {"error": "Failed to send email"}, 500
        
        return RedirectResponse(f"/magiclink/check-email?email={email}", status_code=303)
    
    @rt("/magiclink/check-email")
    def magiclink_check_email(email: str = None):
        return Titled("Check Your Email - Arxiv Buddy",
            Div(
                Div("📧", style="font-size: 4rem; margin-bottom: 1rem;"),
                H1("Check Your Email", style="margin-bottom: 1rem; color: #333;"),
                P(f"We've sent a magic link to:", style="color: #666; margin-bottom: 0.5rem;"),
                P(email or "your email address", 
                  style="font-weight: 600; color: #4285f4; margin-bottom: 2rem; font-size: 1.1rem;"),
                
                P("Click the link in your email to sign in to your account.", 
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
        try:
            token = magic_auth_tokens[auth_id]
        except KeyError:
            return RedirectResponse("/magiclink/error?reason=invalid", status_code=303)
        except Exception as e:
            print(f"Database error during magic link verification: {e}")
            return RedirectResponse("/magiclink/error?reason=database", status_code=303)
        
        now = int(datetime.now().timestamp())
        if token.used or now > token.expires_at or token.email != email:
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
        
        try:
            print(f"Checking for existing user with email: {email}")
            existing_user = None
            
            try:
                matching_users = users(where=f"email = '{email}'")
                if matching_users:
                    user = matching_users[0]
                    existing_user = (user.id, user)
            except Exception as lookup_error:
                print(f"Error during user lookup: {lookup_error}")
            
            if existing_user:
                user_id, user = existing_user
                
                session["user_id"] = user_id
                session["provider"] = user.provider  
                
                magic_auth_tokens.update(dict(auth_id=auth_id, used=True))

                return RedirectResponse("/passkey/setup", status_code=303)
            else:
                print(f"Creating new user for email: {email}")
                username = email.split('@')[0]
                user_id = f"magic_{auth_id[:8]}"
                
                users.insert(
                    id=user_id,
                    email=email,
                    username=username,
                    provider="magiclink",
                    created_at=datetime.now().isoformat()
                )
                
                print(f"New user created via magic link: {username} ({email})")
                
                magic_auth_tokens.update(dict(auth_id=auth_id, used=True))
                
                session["user_id"] = user_id
                session["provider"] = "magiclink"
                            
                return RedirectResponse("/passkey/setup", status_code=303)
            
        except Exception as e:
            print(f"Error in magiclink_verify: {e}")
            import traceback
            traceback.print_exc()
            return RedirectResponse("/magiclink/error?reason=creation", status_code=303)
    
    @rt("/magiclink/error")
    def magiclink_error(reason: str = "unknown"):        
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