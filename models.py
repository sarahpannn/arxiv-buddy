from fasthtml.common import *

# Initialize database
db = database('data/arxiv_buddy.db')

# User table
users = db.t.users
if users not in db.t:
    users.create(dict(
        id=str,           # OAuth provider ID or username
        email=str,        # User's email
        username=str,     # Display name
        provider=str,     # 'local', 'google', 'github', etc.
        created_at=str    # ISO timestamp
    ), pk='id')

# Library table (arXiv IDs for each user)
library = db.t.library
if library not in db.t:
    library.create(dict(
        id=int,           # Auto-incrementing ID
        user_id=str,      # References users.id
        arxiv_id=str,     # arXiv paper ID (e.g., "2309.15028")
        added_at=str,     # ISO timestamp
        title=str,        # Paper title (optional, can be fetched later)
        notes=str         # User notes (optional)
    ), pk='id')

# Scratchpad notes table
scratchpad_notes = db.t.scratchpad_notes
if scratchpad_notes not in db.t:
    scratchpad_notes.create(dict(
        id=int,              # Auto-incrementing ID
        user_id=str,         # References users.id
        paper_id=str,        # arXiv paper ID (e.g., "2309.15028")
        content=str,         # Note content (markdown supported)
        note_type=str,       # 'unanchored', 'anchored', 'highlight'
        anchor_data=str,     # JSON: {selection_text, coordinates, context}
        created_at=str,      # ISO timestamp
        updated_at=str,      # ISO timestamp
        position=int,        # For ordering notes (0-based)
        is_deleted=bool      # Soft delete flag
    ), pk='id')

# Dataclasses for easy access
User = users.dataclass()
LibraryItem = library.dataclass()
ScratchpadNote = scratchpad_notes.dataclass() 