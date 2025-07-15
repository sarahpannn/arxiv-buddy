import os
import argparse
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv
import google.auth
from googleapiclient.discovery import build
from youtube_transcript_api import YouTubeTranscriptApi
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
import openai
from supabase import create_client, Client
from tqdm import tqdm

# --- configuration ---
logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")


# --- environment loading ---
def load_environment():
    """load environment variables from .env file."""
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        logging.warning(
            "youtube api key not found in environment variables. using default credentials."
        )
    return api_key


# --- youtube data retriever ---
class YouTubeDataRetriever:
    """fetches video data from youtube."""

    def __init__(self, api_key):
        if api_key:
            self.youtube = build("youtube", "v3", developerKey=api_key)
        else:
            credentials, project = google.auth.default()
            self.youtube = build("youtube", "v3", credentials=credentials)

    def get_channel_videos(self, channel_id):
        """get all video ids and titles from a channel."""
        logging.info(f"retrieving videos from channel: {channel_id}")

        # get channel details and uploads playlist id
        res = (
            self.youtube.channels()
            .list(id=channel_id, part="contentDetails,snippet")
            .execute()
        )
        if not res.get("items"):
            logging.error("channel not found.")
            return None, []

        channel_title = res["items"][0]["snippet"]["title"]
        playlist_id = res["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]

        videos = []
        next_page_token = None
        while True:
            res = (
                self.youtube.playlistItems()
                .list(
                    playlistId=playlist_id,
                    part="snippet",
                    maxResults=50,
                    pageToken=next_page_token,
                )
                .execute()
            )
            for item in res["items"]:
                videos.append(
                    {
                        "id": item["snippet"]["resourceId"]["videoId"],
                        "title": item["snippet"]["title"],
                        "published_at": item["snippet"]["publishedAt"],
                    }
                )
            next_page_token = res.get("nextPageToken")
            if next_page_token is None:
                break

        logging.info(f"found {len(videos)} videos in channel '{channel_title}'.")
        return channel_title, videos


# --- hybrid search module ---
class HybridSearch:
    """performs hybrid search using tf-idf and vector search."""

    def __init__(self, openai_api_key):
        self.openai_client = openai.OpenAI(api_key=openai_api_key)
        self.vectorizer = TfidfVectorizer(stop_words="english")

    def get_embeddings(self, texts, model="text-embedding-3-small"):
        """get embeddings for a list of texts."""
        if not texts:
            return []

        # filter out empty or invalid texts
        valid_texts = [text.strip() for text in texts if text and text.strip()]
        if not valid_texts:
            return []

        try:
            res = self.openai_client.embeddings.create(input=valid_texts, model=model)
            return [embedding.embedding for embedding in res.data]
        except Exception as e:
            logging.error(f"failed to get embeddings: {e}")
            return []

    def search(self, query, videos, k, alpha):
        """perform hybrid search and return top k video ids."""
        logging.info(f"performing hybrid search for query: '{query}'")
        titles = [video["title"] for video in videos]

        # filter out empty titles
        valid_videos = [
            video for video in videos if video["title"] and video["title"].strip()
        ]
        valid_titles = [video["title"] for video in valid_videos]

        if not valid_titles:
            logging.error("no valid video titles found")
            return []

        # keyword search (tf-idf)
        tfidf_matrix = self.vectorizer.fit_transform(valid_titles)
        query_tfidf = self.vectorizer.transform([query])
        keyword_scores = cosine_similarity(query_tfidf, tfidf_matrix).flatten()

        # vector search (openai embeddings)
        title_embeddings = self.get_embeddings(valid_titles)
        query_embedding = self.get_embeddings([query])

        if not title_embeddings or not query_embedding:
            logging.warning("could not generate embeddings. using keyword search only.")
            vector_scores = np.zeros(len(valid_titles))
            alpha = 0.0  # disable vector search
        else:
            vector_scores = cosine_similarity(
                [query_embedding[0]], title_embeddings
            ).flatten()

        # fusion
        hybrid_scores = (1 - alpha) * keyword_scores + alpha * vector_scores

        # get top k results
        top_k_indices = np.argsort(hybrid_scores)[-k:][::-1]

        top_k_videos = [valid_videos[i] for i in top_k_indices]
        logging.info(f"selected top {len(top_k_videos)} videos based on hybrid search.")
        return top_k_videos


# --- transcript fetcher ---
class TranscriptFetcher:
    """fetches and processes video transcripts."""

    def get_transcript(self, video_id):
        """get transcript for a single video."""
        try:
            transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
            return " ".join([d["text"] for d in transcript_list])
        except Exception as e:
            logging.warning(f"could not fetch transcript for video {video_id}: {e}")
            return None


# --- supabase storage ---
class SupabaseStorage:
    """handles storage of video data in supabase."""

    def __init__(self, supabase_url, supabase_key):
        self.client: Client = create_client(supabase_url, supabase_key)

    def upsert_video(self, video_data):
        """upsert a single video record to supabase."""
        try:
            self.client.table("debug_podcast_sources").upsert(
                video_data, on_conflict="id"
            ).execute()
        except Exception as e:
            logging.error(f"failed to upsert video {video_data.get('id')}: {e}")


# --- main workflow ---
def process_video(
    video, channel_id, platform_name, transcript_fetcher, search_module, storage
):
    """process a single video: fetch transcript, get embedding, and store."""
    transcript = transcript_fetcher.get_transcript(video["id"])
    if transcript:
        # for now, we won't generate embeddings for the whole transcript to save costs
        # embedding = search_module.get_embeddings([transcript])[0]
        embedding = None  # placeholder

        if True:  # simplified condition
            video_data = {
                "source_name": video["title"],
                "source_type": "lecture_transcript",
                "url": f"https://www.youtube.com/watch?v={video['id']}",
                "chunked": {"processed": True, "chunk_count": 1},
                "content": transcript,
                "youtube_id": video["id"],
                "metadata": {
                    "title": video["title"],
                    "published_at": video["published_at"],
                    "channel_id": channel_id,
                    # 'embedding': embedding, # skipping embedding for now
                },
                "platform_name": platform_name,
            }
            storage.upsert_video(video_data)
            return video["id"]  # return youtube id for logging
    return None


def index_channel(channel_id, query, k, alpha):
    """main function to index a youtube channel."""
    api_key = load_environment()
    openai_api_key = os.getenv("OPENAI_API_KEY")
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")

    if not all([openai_api_key, supabase_url, supabase_key]):
        logging.error("missing one or more required environment variables.")
        return

    # initialize components
    retriever = YouTubeDataRetriever(api_key)
    search = HybridSearch(openai_api_key)
    transcripts = TranscriptFetcher()
    storage = SupabaseStorage(supabase_url, supabase_key)

    # workflow
    channel_title, videos = retriever.get_channel_videos(channel_id)
    if not videos:
        return

    top_videos = search.search(query, videos, k, alpha)

    logging.info(f"fetching transcripts and indexing {len(top_videos)} videos...")

    successful_uploads = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        with tqdm(total=len(top_videos), desc="indexing videos") as pbar:
            futures = [
                executor.submit(
                    process_video,
                    video,
                    channel_id,
                    channel_title,
                    transcripts,
                    search,
                    storage,
                )
                for video in top_videos
            ]
            for future in as_completed(futures):
                result = future.result()
                if result:
                    successful_uploads.append(result)
                pbar.update(1)

    logging.info(
        f"successfully indexed {len(successful_uploads)} videos: {successful_uploads}"
    )


def main():
    """command-line interface."""
    parser = argparse.ArgumentParser(description="index youtube channel transcripts.")
    parser.add_argument("--channel_id", required=True, help="youtube channel id.")
    parser.add_argument(
        "--query", required=True, help="query to select relevant videos."
    )
    parser.add_argument(
        "--k", type=int, default=10, help="number of top videos to index."
    )
    parser.add_argument(
        "--alpha", type=float, default=0.5, help="weight for vector search (0 to 1)."
    )
    args = parser.parse_args()

    index_channel(args.channel_id, args.query, args.k, args.alpha)


if __name__ == "__main__":
    main()
