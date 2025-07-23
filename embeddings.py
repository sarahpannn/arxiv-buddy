from typing import List, Tuple
import numpy as np


def get_embedding(text: str, model: str = "text-embedding-3-small") -> Tuple[List[float], int]:
    """Return OpenAI embedding vector and token count for given text."""
    from config import openai_client
    
    if not openai_client:
        print("⚠️ OpenAI client not available for embeddings")
        return [], 0
    
    try:
        # Clean and truncate text if needed
        text = text.replace("\n", " ").strip()
        if len(text) > 8000:  # OpenAI's token limit buffer
            text = text[:8000]
        
        response = openai_client.embeddings.create(
            input=text,
            model=model
        )
        
        embedding = response.data[0].embedding
        token_count = response.usage.total_tokens
        
        print(f"✅ Generated OpenAI embedding ({token_count} tokens)")
        return embedding, token_count
        
    except Exception as e:
        print(f"❌ Failed to generate OpenAI embedding: {e}")
        return [], 0


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Compute cosine similarity between two lists."""
    v1 = np.array(vec1)
    v2 = np.array(vec2)
    if np.linalg.norm(v1) == 0 or np.linalg.norm(v2) == 0:
        return 0.0
    return float(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2)))
