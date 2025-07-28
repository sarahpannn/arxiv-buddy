from fasthtml.common import *
from starlette.responses import RedirectResponse, Response
from models import users
from passkeys import get_passkey_for_auth, add_passkey_credential, update_passkey_counter
from webauthn import (generate_registration_options, options_to_json, verify_registration_response,
    generate_authentication_options, verify_authentication_response)
from webauthn.helpers.structs import (RegistrationCredential, AuthenticationCredential, AuthenticatorSelectionCriteria,
    ResidentKeyRequirement, UserVerificationRequirement, AuthenticatorAttestationResponse, AuthenticatorAssertionResponse)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url


def register_passkey_routes(rt):
    
    @rt("/passkey/setup")
    def passkey_setup_page(session):
        user_id = session.get("user_id")
        if not user_id:
            return RedirectResponse("/login", status_code=303)
        
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
                    style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem;"
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
                        
                        const beginResponse = await fetch('/passkey/register/begin');
                        if (!beginResponse.ok) throw new Error('Failed to start passkey setup');
                        
                        const options = await beginResponse.json();
                        
                        // WebAuthn requires Uint8Array for challenge and user ID
                        options.challenge = Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
                        options.user.id = Uint8Array.from(atob(options.user.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
                        
                        const credential = await navigator.credentials.create({
                            publicKey: options
                        });
                        
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
    
    
    @rt("/passkey/register/begin")
    def passkey_register_begin(request, session):
        user_id = session.get("user_id")
        if not user_id:
            return {"error": "Not authenticated"}, 401
        
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
        
        session["registration_challenge"] = bytes_to_base64url(options.challenge)
        
        return options_to_json(options)
    
    @rt("/passkey/register/complete")
    async def passkey_register_complete(request, session):
        try:
            user_id = session.get("user_id")
            if not user_id:
                return {"error": "Not authenticated"}, 401
            
            expected_challenge_str = session.get("registration_challenge")
            if not expected_challenge_str:
                return {"error": "No registration challenge found"}, 400
            
            expected_challenge = base64url_to_bytes(expected_challenge_str)
            
            registration_data = await request.json()
            
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
            
            verification = verify_registration_response(
                credential=credential,
                expected_challenge=expected_challenge,
                expected_origin="http://localhost:5002",
                expected_rp_id="localhost",
            )
            
            print(f"Registration verification completed successfully")

            add_passkey_credential(
                uid=user_id,
                credential_id=bytes_to_base64url(credential.raw_id),
                public_key=bytes_to_base64url(verification.credential_public_key),
                counter=verification.sign_count
            )
            
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
        options = generate_authentication_options(
            rp_id=request.url.hostname or "localhost",
            timeout=60000,
            user_verification=UserVerificationRequirement.PREFERRED,
        )
        
        session["auth_challenge"] = bytes_to_base64url(options.challenge)
        
        return options_to_json(options)
    
    @rt("/passkey/auth/complete")
    async def passkey_auth_complete(request, session):
        try:
            expected_challenge_str = session.get("auth_challenge")
            if not expected_challenge_str:
                return {"error": "No authentication challenge found"}, 400
            
            expected_challenge = base64url_to_bytes(expected_challenge_str)
            
            auth_data = await request.json()
            
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
            
            credential_id_str = bytes_to_base64url(credential.raw_id)
            cred = get_passkey_for_auth(credential_id_str)
            
            if not cred:
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
            
            update_passkey_counter(credential_id_str, verification.new_sign_count)
            
            session["user_id"] = cred['uid']
            session["provider"] = "passkey"
            
            session.pop("auth_challenge", None)
            
            return {"success": True, "redirect": "/library"}
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return {"error": "Authentication failed"}, 400
        