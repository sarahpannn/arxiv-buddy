from typing import List, Dict
from fasthtml.common import database
import json
import os
from datetime import datetime

DB_PATH = "data/context.db"

# Ensure data directory exists
os.makedirs("data", exist_ok=True)

db = database(DB_PATH)

contexts = db.t.contexts
if contexts not in db.t:
    contexts.create(
        dict(
            id=int,  # auto-increment primary key
            source=str,
            ref_id=str,  # unique id within source
            title=str,
            url=str,
            content=str,
            embedding=str,  # JSON list
            added_at=str,
        ),
        pk="id",
    )

ContextItem = contexts.dataclass()


class ContextManager:
    """Handles storage and retrieval of context items for the working LLM."""

    def __init__(self):
        self.table = contexts

    def add_item(
        self,
        source: str,
        ref_id: str,
        title: str,
        url: str,
        content: str,
        embedding: List[float],
    ):
        if self._exists(source, ref_id):
            print("[PASS] >>> context item already exists, skipping")
            return
        self.table.insert(
            source=source,
            ref_id=ref_id,
            title=title,
            url=url,
            content=content,
            embedding=json.dumps(embedding),
            added_at=datetime.now().isoformat(),
        )
        print(f"[PASS] >>> added context item {title[:50]}… from {source}")

    def add_items(self, items: List[Dict]):
        for item in items:
            self.add_item(**item)

    def _exists(self, source: str, ref_id: str) -> bool:
        return bool(
            self.table.where(lambda r: r.source == source and r.ref_id == ref_id)
        )

    def list_items(self) -> List[ContextItem]:
        return [ContextItem(**r) for r in self.table]


# Singleton accessor
_context_manager = ContextManager()


def get_context_manager() -> ContextManager:
    return _context_manager
