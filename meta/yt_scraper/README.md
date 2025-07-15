# YouTube Channel Transcript Indexer

This script indexes video transcripts from a YouTube channel based on a query. It retrieves video metadata, performs a hybrid search to find relevant videos, fetches their transcripts, and stores everything in a Supabase database.

## 1. Setup

### Prerequisites

- Python 3.8+
- Conda or another virtual environment manager

### Installation

1.  **Clone the repository and navigate to the project directory.**

2.  **Create and activate the conda environment:**

    ```bash
    conda create -n arxiv-buddy python=3.9
    conda activate arxiv-buddy
    ```

3.  **Install the required dependencies:**

    ```bash
    pip install -r yt_scraper/requirements.txt
    ```

4.  **Set up environment variables:**

    Create a `.env` file inside the `yt_scraper` directory by copying the example file:

    ```bash
    cp yt_scraper/.env.example yt_scraper/.env
    ```

    Then, edit `yt_scraper/.env` and fill in your credentials for the following services:

    - `YOUTUBE_API_KEY`
    - `OPENAI_API_KEY`
    - `SUPABASE_URL`
    - `SUPABASE_KEY`

5.  **Set up Supabase Table**

    In your Supabase project, run the following SQL to create the `info-database-v0` table.

    ```sql
    -- Create the info-database-v0 table
    create table public."info-database-v0" (
        id text not null,
        source_name text null,
        source_type text null,
        url text null,
        chunked jsonb null,
        content text null,
        metadata jsonb null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        platform_name text null,
        constraint "info-database-v0_pkey" primary key (id)
    );

    -- Create a trigger to automatically update the updated_at timestamp
    create trigger handle_updated_at before
    update on public."info-database-v0" for each row
    execute function moddatetime(updated_at);
    ```

## 2. Usage

Run the indexer from the root of the project directory:

```bash
python -m yt_scraper/indexer --channel_id "UCYO_jab_esuFRV4b17AJCLA" --query "attention mechanism" --k 5
```

### Arguments

- `--channel_id`: The ID of the YouTube channel to search within.
- `--query`: The search query to find relevant videos.
- `--k`: The number of top videos to retrieve and index.
- `--alpha`: (Optional) The weight for vector search in the hybrid search formula. Defaults to 0.5.
- `--chunk_size`: (Optional) The size of transcript chunks for embedding. Defaults to 1000.
- `--chunk_overlap`: (Optional) The overlap between transcript chunks. Defaults to 200.

---

_This project is based on the provided specification._
