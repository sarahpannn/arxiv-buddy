from typing import List, Tuple

import numpy as np
from functools import lru_cache

# Use sentence-transformers for local embeddings to avoid external API keys
MODEL_NAME = "all-MiniLM-L6-v2"


@lru_cache(maxsize=1)
def _get_model():
    from sentence_transformers import (
        SentenceTransformer,
    )  # local import to defer heavy load

    print("[PASS] >>> loading embedding model", MODEL_NAME)
    return SentenceTransformer(MODEL_NAME)


def get_embedding(text: str) -> Tuple[List[float], int]:
    """Return embedding vector and token count for given text."""
    model = _get_model()
    # sentence-transformers automatically truncates >512 tokens; okay for our use-case
    vec = model.encode([text], show_progress_bar=False)[0]
    return vec.tolist(), len(text.split())


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Compute cosine similarity between two lists."""
    v1 = np.array(vec1)
    v2 = np.array(vec2)
    if np.linalg.norm(v1) == 0 or np.linalg.norm(v2) == 0:
        return 0.0
    return float(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2)))
