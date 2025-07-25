from fasthtml.common import *

# Initialize database
db = database("data/arxiv_buddy.db")

# User table
users = db.t.users
if users not in db.t:
    users.create(
        dict(
            id=str,  # OAuth provider ID or username
            email=str,  # User's email
            username=str,  # Display name
            provider=str,  # 'local', 'google', 'github', etc.
            created_at=str,  # ISO timestamp
        ),
        pk="id",
    )

# WebAuthn credentials table
webauthncredentials = db.t.webauthncredentials
if webauthncredentials not in db.t:
    webauthncredentials.create(
        dict(
            id=str,  # Unique ID for this credential
            uid=str,  # User ID (references users.id)
            credential_id=str,  # Base64-encoded credential ID
            public_key=str,  # Base64-encoded public key
            counter=int,  # Counter for passkey usage
            created_at=int,  # Timestamp when this credential was created
        ),
        pk="id",
    )

# Library table (arXiv IDs for each user)
library = db.t.library
if library not in db.t:
    library.create(
        dict(
            id=int,  # Auto-incrementing ID
            user_id=str,  # References users.id
            arxiv_id=str,  # arXiv paper ID (e.g., "2309.15028")
            added_at=str,  # ISO timestamp
            title=str,  # Paper title (optional, can be fetched later)
            notes=str,  # User notes (optional)
        ),
        pk="id",
    )

# Scratchpad notes table
scratchpad_notes = db.t.scratchpad_notes
if scratchpad_notes not in db.t:
    scratchpad_notes.create(
        dict(
            id=int,  # Auto-incrementing ID
            user_id=str,  # References users.id
            paper_id=str,  # arXiv paper ID (e.g., "2309.15028")
            content=str,  # Note content (markdown supported)
            note_type=str,  # 'unanchored', 'anchored', 'highlight'
            anchor_data=str,  # JSON: {selection_text, coordinates, context}
            created_at=str,  # ISO timestamp
            updated_at=str,  # ISO timestamp
            position=int,  # For ordering notes (0-based)
            is_deleted=bool,  # Soft delete flag
            parent_note_id=int,  # References scratchpad_notes.id for replies
            reply_type=str,  # 'user' or 'ai' - null for regular notes
            ai_metadata=str,  # JSON: {model, sources, confidence, etc.}
        ),
        pk="id",
    )

# Add columns to existing table if they don't exist
try:
    db.execute("ALTER TABLE scratchpad_notes ADD COLUMN parent_note_id INTEGER")
except:
    pass  # Column already exists

try:
    db.execute("ALTER TABLE scratchpad_notes ADD COLUMN reply_type TEXT")
except:
    pass  # Column already exists

try:
    db.execute("ALTER TABLE scratchpad_notes ADD COLUMN ai_metadata TEXT")
except:
    pass  # Column already exists

# Magic link auth tokens table
magic_auth_tokens = db.t.magic_auth_tokens
if magic_auth_tokens not in db.t:
    magic_auth_tokens.create(
        dict(
            auth_id=str,  # The magic link token
            email=str,  # User's email
            created_at=int,  # Timestamp when created
            expires_at=int,  # Expiration timestamp
            used=bool,  # Whether the token has been used
        ),
        pk="auth_id",
    )

# Dataclasses for easy access
User = users.dataclass()
LibraryItem = library.dataclass()
ScratchpadNote = scratchpad_notes.dataclass()
MagicAuthToken = magic_auth_tokens.dataclass()
