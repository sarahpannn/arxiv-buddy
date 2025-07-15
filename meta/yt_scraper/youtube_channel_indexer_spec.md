## YouTube Channel Transcript Indexer

### 1. Objective

Design and implement a Python-based pipeline to:

1. Retrieve all video IDs and titles from a specified YouTube channel efficiently.
2. Perform hybrid keyword and vector search over the video titles to identify the top *K* relevant videos for a given query.
3. Fetch transcripts for the selected videos via `youtube-transcript-api`.
4. Store video metadata, transcripts, and embeddings in Supabase for further querying and indexing.

---

### 2. Prerequisites

- **Environment Variables**

  - `YOUTUBE_API_KEY`: Google API key with YouTube Data API v3 enabled
  - `OPENAI_API_KEY`: API key for embedding generation
  - `SUPABASE_URL`, `SUPABASE_KEY`: Credentials for Supabase project

- **Python Dependencies** (install via `pip`):

  ```bash
  google-api-python-client
  youtube-transcript-api
  openai
  supabase
  sklearn
  numpy
  ```

---

### 3. System Components

1. **YouTube Data Retriever**

   - Fetch uploads playlist ID for channel (`channels.list`)
   - Page through playlist items to collect video IDs and titles (`playlistItems.list`)
   - Quota: \~1 + ceil(M/50) calls

2. **Hybrid Search Module**

   - **Keyword Search**: TF-IDF vectorizer on titles
   - **Vector Search**: OpenAI embeddings + cosine similarity
   - **Fusion Strategy**: Weighted sum or reciprocal rank fusion
   - Configurable parameters: `K` (number of videos), `alpha` (weight)

3. **Transcript Fetcher**

   - `YouTubeTranscriptApi.get_transcript(video_id)`
   - Error handling for missing/disabled transcripts
   - Text normalization & optional chunking

4. **Supabase Storage**

   - Table schema: `videos(id TEXT PK, title TEXT, published_at TIMESTAMP, transcript TEXT, embedding VECTOR, content_tsv TSVECTOR)`
   - Upsert logic using Supabase Python client
   - Postgres indices: `GIST(embedding)` and `GIN(content_tsv)`

5. **User API / CLI**

   - CLI interface or function call: `index_channel(channel_id, query, K, alpha)`
   - Returns list of stored video records

---

### 4. Workflow

1. **Initialization**

   - Load environment variables
   - Initialize YouTube, OpenAI, and Supabase clients

2. **Channel Indexing**

   1. Retrieve uploads playlist ID
   2. Collect all video IDs & titles
   3. Precompute embeddings for titles

3. **Query & Selection**

   1. Accept user query
   2. Compute keyword and vector scores
   3. Fuse scores and select top *K*

4. **Data Ingestion**

   1. Fetch transcripts for each selected video
   2. Generate transcript embeddings
   3. Upsert records into Supabase

5. **Result Delivery**

   - Return or print summary of stored videos (IDs, titles)

---

### 5. Quota Estimation

- **channels.list**: 1 unit
- **playlistItems.list**: 1 unit × ceil(M/50)
- **videos.list**: (optional batch metadata) 1 unit × ceil(M/50)
- Total ≈ 1 + 2·ceil(M/50) units per full index

---

### 6. Extensions & Considerations

- **Parallelization**: Use `concurrent.futures` for transcript and embedding fetches
- **Chunking**: Split long transcripts for granular embeddings
- **CLI Tooling**: Argparse for command-line usage
- **Testing**: Unit tests for each module
- **Logging & Monitoring**: Track API usage and error rates

---

*End of specification.*

