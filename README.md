# ArXiv Buddy

A rich, web-based PDF viewer for academic papers.

## Features

- **Interactive citations** - Click in-text citations to instantly view reference details
- **Enhanced reference previews** - Rich paper information with abstracts and metadata
- **Intelligent PDF rendering** - Full-page academic papers with selectable text
- **Real-time ArXiv integration** - Automatic fetching of enhanced paper details

## Quick Start

### Prerequisites
- Python 3.7+
- pip

Create a `.env` file in the root directory with the following content:

```bash
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
```

### Installation

```bash
git clone https://github.com/AnswerDotAI/arxiv-buddy.git
cd arxiv-buddy
pip install fasthtml fastapi requests
python main.py
```

Navigate to `http://localhost:5002`, paste an ArXiv URL, and start exploring.

## Usage

1. Paste an ArXiv URL into the input field
2. Click "Load PDF" to render the paper
3. Click on citations (e.g., `[1]`, `(2)`) to view reference details
4. Access direct links to ArXiv, DOI, and original sources

## Technical Architecture

- **Backend**: FastHTML + FastAPI for efficient PDF serving
- **Frontend**: Modular JavaScript architecture with PDF.js integration
- **API Integration**: Real-time ArXiv API for enhanced metadata
- **Citation Processing**: Coordinate-based precision mapping
