from fasthtml.common import *
from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import requests
import re
import os

# Create static directory if it doesn't exist
os.makedirs("static", exist_ok=True)

# Create the FastAPI app instance first
app = FastAPI()

origins = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    # add your real front-end origin(s) here
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,        # or ["*"] for anything (dev only!)
    allow_credentials=True,
    allow_methods=["*"],          # GET, POST, PUT, etc.
    allow_headers=["*"],          # Authorization, Content-Type, …
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Create fast_app with our FastAPI instance
app, rt = fast_app(app=app)

def download_arxiv_pdf(arxiv_url):
    """Download PDF from ArXiv URL"""
    # Extract paper ID from URL
    paper_id = re.search(r'arxiv\.org/abs/([^/]+)', arxiv_url)
    if not paper_id:
        paper_id = re.search(r'arxiv\.org/pdf/([^/]+)', arxiv_url)
    
    if not paper_id:
        raise ValueError("Invalid ArXiv URL")
    
    paper_id = paper_id.group(1)
    pdf_url = f"https://arxiv.org/pdf/{paper_id}.pdf"
    
    response = requests.get(pdf_url)
    response.raise_for_status()
    
    # Save to static directory so it can be served
    pdf_path = f"static/{paper_id}.pdf"
    with open(pdf_path, 'wb') as f:
        f.write(response.content)
    
    return paper_id

@rt("/")
def get():
    return Titled("", 
        Script(src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"),
        Link(rel="stylesheet", href="/static/style.css"),
        
        Div(
            Div(
                H1("Arxiv Buddy", style="font-size: 2.2rem; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: -1px;"),
                P("Welcome to the V0 Alpha of Arxiv Buddy.", Br(), "Graciously accepting feedback at ", A('@spantacular on X', href='https://x.com/spantacular'), style="color: #666; font-size: 1.1rem; margin-bottom: 2rem;"),
                Form(
                    Input(placeholder="Enter ArXiv URL (e.g., https://arxiv.org/abs/2309.15028)", 
                          name="arxiv_url", 
                          type="url", 
                          required=True,
                          style="width: 100%; max-width: 700px; padding: 16px 18px; margin-bottom: 18px; font-size: 1.1rem; border-radius: 8px; border: 1.5px solid #ccc; background: #fafbfc;"),
                    Button("Load PDF", type="submit", style="padding: 14px 32px; font-size: 1.1rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(66,133,244,0.08); font-weight: 600;"),
                    action="/load_paper", 
                    method="post",
                    style="margin-bottom: 0;"
                ),
                style="background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.07); padding: 44px 40px 36px 40px; max-width: 900px; margin: 0 auto;"
            ),
            Div(
                Div(
                    P("Arxiv Buddy gives you a nicer way to read arXiv papers in your browser. Enter an arXiv URL above to get started!", 
                      style="text-align: center; color: #888; font-size: 1.1rem;"),
                    id="pdf-viewer-content",
                    style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; min-height: 120px;"
                ),
                id="viewer-container",
                style="border: 1px solid #eee; border-radius: 10px; margin-top: 24px; min-height: 150px; background: #fafbfc; max-width: 630px; margin-left: auto; margin-right: auto;"
            ),
            style="min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; background: none; padding: 0; text-align: center;"
        ),
        Script("""
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        """)
    )

@rt("/load_paper", methods=["POST"])
def load_paper(arxiv_url: str):
    paper_id = download_arxiv_pdf(arxiv_url)
    
    return Div(
        # Add debug info
        Script("""console.log('PDF loading response received');"""),
        
        # Empty PDF viewer content div - will be populated by JavaScript
        Div(
            id="pdf-viewer-content",  # Match the ID from root route
            style="width: 100%; padding: 20px; background-color: #f9f9f9; border-radius: 5px;"
        ),

        Html(
            Head(
                Meta(charset='UTF-8'),
                Meta(name='viewport', content='width=device-width, initial-scale=1.0'),
                Title('Minimal PDF.js Implementation'),
                Style('body {\r\n            background-color: #f0f0f0;\r\n            display: flex;\r\n            justify-content: center;\r\n            align-items: center;\r\n            height: 100vh;\r\n            margin: 0;\r\n        }\r\n        #pdf-canvas {\r\n            border: 1px solid black;\r\n            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);\r\n        }')
            ),
            Body(
                Canvas(id='pdf-canvas'),
                Script(src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.min.mjs', type='module'),
                Link(rel="stylesheet", href="/static/text_layer_builder.css"),
                Script(src='/static/ui_utils.js', type='module'),
                Script(src='/static/text_highlighter.js', type='module'),
                Script(src='/static/text_layer_builder.js', type='module'), 
                Script(src='/static/pdf_link_service.js', type='module'),
                Script(src='/static/pdf-renderer.js', type='module'),
                Script(src='/static/annotation-handler.js', type='module'),
                Script(src='/static/destination-handler.js', type='module'),
                Script(src='/static/figure-detection.js', type='module'),
                Script(src='/static/reference-extraction.js', type='module'),
                Script(src='/static/figure-display.js', type='module'),
                Script(src='/static/reference-resolver.js', type='module'),
                Script(src='/static/paper-preview.js', type='module'),
                Script(src='/static/test-utilities.js', type='module'),
                Script(src='/static/pdf-viewer.js', type='module'),
                Script(f"""
                    // Wait for the page to load, then call renderPDF
                    window.addEventListener('load', function() {{
                        if (window.renderPDF) {{
                            renderPDF('/static/{paper_id}.pdf');
                        }} else {{
                            console.error('renderPDF function not available');
                        }}
                    }});
                """, type='module')
            ),
            lang='en'
        )
        
        
    )

if __name__ == "__main__":
    serve()
