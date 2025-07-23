import json
from datetime import datetime
from starlette.responses import JSONResponse
from models import scratchpad_notes
from services.ai_service import search_vectorized_sources, generate_ai_reply


def get_scratchpad_context(user_id: str, paper_id: str, exclude_note_id: int = None) -> str:
    """Get formatted scratchpad context for AI, excluding AI replies and optionally a specific note"""
    try:
        where_clause = f"user_id = '{user_id}' AND paper_id = '{paper_id}' AND is_deleted = 0 AND note_type != 'ai_reply'"
        if exclude_note_id:
            where_clause += f" AND id != {exclude_note_id}"
            
        notes = scratchpad_notes(
            where=where_clause,
            order_by="position ASC, created_at ASC"
        )
        
        context = ""
        for note in notes:
            context += f"• "
            if note.note_type == "anchored" and note.anchor_data:
                try:
                    anchor = json.loads(note.anchor_data)
                    context += f"[Anchored to: \"{anchor.get('selection_text', '')[:50]}...\"] "
                except:
                    pass
            context += f"{note.content}\n"
        
        return context.strip() if context else None
    except Exception as e:
        print(f"❌ Error getting scratchpad context: {e}")
        return None


def register_scratchpad_routes(rt):
    """Register scratchpad-related routes"""
    
    @rt("/api/scratchpad/test")
    def test_scratchpad_api():
        """Test endpoint to verify scratchpad API is working"""
        return {"success": True, "message": "Scratchpad API is working", "test": True}

    @rt("/api/scratchpad/{paper_id}", methods=["GET"])
    def get_scratchpad_notes(paper_id: str, session):
        """Get all scratchpad notes for a paper with threaded replies"""

        user_id = session.get("user_id") if session else None

        if not user_id: return {"success": False, "error": "Authentication required"}

        try:
            query = f"user_id = '{user_id}' AND paper_id = '{paper_id}' AND is_deleted = 0"
            notes = scratchpad_notes(where=query, order_by="position ASC, created_at ASC")
            notes_list = list(notes)

            # organize notes hierarchically with replies
            def format_note(note):
                return {
                    "id": note.id,
                    "content": note.content,
                    "note_type": note.note_type,
                    "anchor_data": (
                        json.loads(note.anchor_data) if note.anchor_data else None
                    ),
                    "created_at": note.created_at,
                    "updated_at": note.updated_at,
                    "position": note.position,
                    "parent_note_id": getattr(note, "parent_note_id", None),
                    "reply_type": getattr(note, "reply_type", None),
                    "ai_metadata": (
                        json.loads(note.ai_metadata)
                        if getattr(note, "ai_metadata", None)
                        else None
                    ),
                    "replies": [],
                }

            # separate root notes and replies
            root_notes = []
            replies_by_parent = {}

            for note in notes_list:
                formatted_note = format_note(note)
                parent_id = getattr(note, "parent_note_id", None)

                if parent_id is None:
                    root_notes.append(formatted_note)
                else:
                    if parent_id not in replies_by_parent:
                        replies_by_parent[parent_id] = []
                    replies_by_parent[parent_id].append(formatted_note)

            # attach replies to their parent notes
            for note in root_notes:
                note_id = note["id"]
                if note_id in replies_by_parent:
                    note["replies"] = replies_by_parent[note_id]

            result = {
                "success": True,
                "notes": root_notes,
            }
            print(f"✅ SCRATCHPAD API: Returning result with {len(root_notes)} root notes")
            return result
        except Exception as e:
            print(f"❌ SCRATCHPAD API: Error: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}

    @rt("/api/scratchpad", methods=["POST"])
    async def create_scratchpad_note(request):
        """Create a new scratchpad note or reply"""
        session = request.session if hasattr(request, "session") else {}
        user_id = session.get("user_id")
        if not user_id:
            return {"success": False, "error": "Authentication required"}

        try:
            data = await request.json()

            # check if this is a reply
            parent_note_id = data.get("parent_note_id")
            reply_type = data.get("reply_type")

            # get next position (only for root notes)
            if not parent_note_id:
                existing_notes = scratchpad_notes(
                    where=f"user_id = '{user_id}' AND paper_id = '{data['paper_id']}' AND is_deleted = 0 AND parent_note_id IS NULL"
                )
                next_position = len(list(existing_notes))
            else:
                next_position = 0  # replies don't need position ordering

            note_id = scratchpad_notes.insert(
                user_id=user_id,
                paper_id=data["paper_id"],
                content=data.get("content", ""),
                note_type=data.get("note_type", "unanchored"),
                anchor_data=(
                    json.dumps(data.get("anchor_data")) if data.get("anchor_data") else None
                ),
                created_at=datetime.now().isoformat(),
                updated_at=datetime.now().isoformat(),
                position=next_position,
                is_deleted=False,
                parent_note_id=parent_note_id,
                reply_type=reply_type,
                ai_metadata=(
                    json.dumps(data.get("ai_metadata")) if data.get("ai_metadata") else None
                ),
            )

            return {"success": True, "note_id": note_id}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @rt("/api/scratchpad/{note_id}", methods=["PUT"])
    async def update_scratchpad_note(note_id: int, request):
        """Update a scratchpad note"""
        session = request.session if hasattr(request, "session") else {}
        user_id = session.get("user_id")
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
            update_data = {"updated_at": datetime.now().isoformat()}

            if "content" in data:
                update_data["content"] = data["content"]
            if "note_type" in data:
                update_data["note_type"] = data["note_type"]
            if "anchor_data" in data:
                update_data["anchor_data"] = (
                    json.dumps(data["anchor_data"]) if data["anchor_data"] else None
                )
            if "position" in data:
                update_data["position"] = data["position"]

            scratchpad_notes.update(id=note_id, **update_data)

            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @rt("/api/scratchpad/{note_id}", methods=["DELETE"])
    def delete_scratchpad_note(note_id: int, session):
        """Delete a scratchpad note (soft delete)"""
        user_id = session.get("user_id") if session else None

        if not user_id:
            return {"success": False, "error": "Authentication required"}

        try:
            # Verify ownership
            notes = list(scratchpad_notes(where=f"id = {note_id}"))
            if not notes:
                return {"success": False, "error": "Note not found"}

            note = notes[0]
            print(f"🗑️ DELETE API: Note found, user_id={note.user_id}")

            if note.user_id != user_id:
                return {"success": False, "error": "Access denied"}

            print(f"🗑️ DELETE API: Attempting to update note {note_id}")

            # Soft delete
            scratchpad_notes.update(
                id=note_id, is_deleted=True, updated_at=datetime.now().isoformat()
            )

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
        user_id = session.get("user_id") if session else None
        if not user_id:
            return {"success": False, "error": "Authentication required"}

        try:
            notes = scratchpad_notes(
                where=f"user_id = '{user_id}' AND paper_id = '{paper_id}' AND is_deleted = 0",
                order_by="position ASC",
            )

            if format == "markdown":
                content = f"# Scratchpad Notes for Paper {paper_id}\n\n"
                for note in notes:
                    content += f"## Note {note.position + 1}\n"
                    if note.note_type == "anchored" and note.anchor_data:
                        anchor = json.loads(note.anchor_data)
                        content += (
                            f"**Anchored to:** \"{anchor.get('selection_text', '')}\"\n\n"
                        )
                    content += f"{note.content}\n\n"
                    content += f"*Created: {note.created_at}*\n\n---\n\n"

            elif format == "json":
                content = json.dumps(
                    [
                        {
                            "id": note.id,
                            "content": note.content,
                            "note_type": note.note_type,
                            "anchor_data": (
                                json.loads(note.anchor_data) if note.anchor_data else None
                            ),
                            "created_at": note.created_at,
                            "position": note.position,
                        }
                        for note in notes
                    ],
                    indent=2,
                )

            else:  # plain text
                content = f"Scratchpad Notes for Paper {paper_id}\n" + "=" * 50 + "\n\n"
                for note in notes:
                    content += f"Note {note.position + 1}:\n"
                    if note.note_type == "anchored" and note.anchor_data:
                        anchor = json.loads(note.anchor_data)
                        content += (
                            f"Anchored to: \"{anchor.get('selection_text', '')}\"\n\n"
                        )
                    content += f"{note.content}\n\n"
                    content += f"Created: {note.created_at}\n\n" + "-" * 30 + "\n\n"

            return {"success": True, "content": content, "format": format}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @rt("/api/scratchpad/{note_id}/ai-reply", methods=["POST"])
    async def create_ai_reply(note_id: int, request):
        """Generate an AI reply for a specific note"""
        session = request.session if hasattr(request, "session") else {}
        user_id = session.get("user_id")
        if not user_id:
            return {"success": False, "error": "Authentication required"}

        try:
            # get the original note
            notes = list(scratchpad_notes(where=f"id = {note_id}"))
            if not notes:
                return {"success": False, "error": "Note not found"}

            note = notes[0]
            if note.user_id != user_id:
                return {"success": False, "error": "Access denied"}

            # perform RAG search
            search_results = await search_vectorized_sources(note.content, limit=3)

            # Use direct arXiv HTTPS URL for PDF context
            pdf_url = f"https://arxiv.org/pdf/{note.paper_id}"

            # Get scratchpad context using helper function
            scratchpad_context = get_scratchpad_context(user_id, note.paper_id, note_id)

            # Handle anchored notes
            anchor = ""
            if note.note_type == "anchored" and note.anchor_data:
                anchor = f"Anchored to: \"{json.loads(note.anchor_data).get('selection_text', '')}\"\n\n"
                
            # generate AI reply with PDF context from arXiv
            ai_reply_content = await generate_ai_reply(
                note_content=anchor + note.content if anchor else note.content,
                pdf_url=pdf_url,
                scratchpad_context=scratchpad_context
            )

            # create the AI reply note
            ai_metadata = {
                "model": "claude-3-5-sonnet-20241022",
                "pdf_context": True,
                "pdf_url": pdf_url,
            }

            reply_id = scratchpad_notes.insert(
                user_id=user_id,
                paper_id=note.paper_id,
                content=ai_reply_content,
                note_type="ai_reply",
                anchor_data=None,
                created_at=datetime.now().isoformat(),
                updated_at=datetime.now().isoformat(),
                position=0,
                is_deleted=False,
                parent_note_id=note_id,
                reply_type="ai",
                ai_metadata=json.dumps(ai_metadata),
            )

            return {
                "success": True,
                "reply_id": reply_id,
                "content": ai_reply_content,
                "ai_metadata": ai_metadata,
            }
        except Exception as e:
            print(f"❌ AI reply error: {e}")
            return {"success": False, "error": str(e)}

    @rt("/api/scratchpad/{note_id}/reply", methods=["POST"])
    async def create_user_reply(note_id: int, request):
        """Create a user reply to a specific note"""
        session = request.session if hasattr(request, "session") else {}
        user_id = session.get("user_id")
        if not user_id:
            return {"success": False, "error": "Authentication required"}

        try:
            data = await request.json()

            # get the original note
            notes = list(scratchpad_notes(where=f"id = {note_id}"))
            if not notes:
                return {"success": False, "error": "Note not found"}

            note = notes[0]
            if note.user_id != user_id:
                return {"success": False, "error": "Access denied"}

            # create the user reply
            reply_id = scratchpad_notes.insert(
                user_id=user_id,
                paper_id=note.paper_id,
                content=data.get("content", ""),
                note_type="user_reply",
                anchor_data=None,
                created_at=datetime.now().isoformat(),
                updated_at=datetime.now().isoformat(),
                position=0,
                is_deleted=False,
                parent_note_id=note_id,
                reply_type="user",
                ai_metadata=None,
            )

            return {"success": True, "reply_id": reply_id}
        except Exception as e:
            print(f"❌ User reply error: {e}")
            return {"success": False, "error": str(e)}