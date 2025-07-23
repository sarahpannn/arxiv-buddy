import json
import requests
import re
from datetime import datetime
from fasthtml.common import *
from source_manager import (
    download_paper_content,
    extract_paper_id_from_url,
    get_source_manager,
)
from models import library


def load_paper_content(arxiv_url: str, session=None):
    """Common function to load paper content"""
    # Extract paper ID and use new hybrid download system
    paper_id = extract_paper_id_from_url(arxiv_url)

    # Use new source manager for downloading
    source_manager = get_source_manager()
    download_result = download_paper_content(paper_id, source_manager)

    # Use the paper_id from download result (cleaned)
    paper_id = download_result["paper_id"]

    # If user is logged in, automatically add to library
    user_id = session.get("user_id") if session else None
    library_status = ""

    if user_id:
        # Check if already in library
        existing = library(where=f"user_id = '{user_id}' AND arxiv_id = '{paper_id}'")
        if not existing:
            # Automatically add to library
            try:
                library.insert(
                    user_id=user_id,
                    arxiv_id=paper_id,
                    added_at=datetime.now().isoformat(),
                    title="",  # Can be fetched later
                    notes="",
                )
                print(f"Automatically added paper {paper_id} to {user_id}'s library")
                library_status = Span(
                    "✓ Added to your library",
                    style="color: #28a745; font-weight: 500; margin: 8px;",
                )
            except Exception as e:
                print(f"Error auto-adding to library: {e}")
                library_status = Span(
                    "⚠ Could not add to library",
                    style="color: #ffc107; font-weight: 500; margin: 8px;",
                )
        else:
            library_status = Span(
                "✓ Already in your library",
                style="color: #28a745; font-weight: 500; margin: 8px;",
            )

    # Add source processing status for debugging
    source_info = ""
    if download_result["strategy"] == "source" and download_result["source_structure"]:
        if download_result["parsed_latex"]:
            stats = download_result["parsed_latex"]["stats"]
            source_info = Span(
                f"📄 Source: {stats['total_citations']} citations, {stats['total_figures']} figures",
                style="color: #007bff; font-weight: 500; margin: 8px;",
            )
        else:
            source_info = Span(
                "📄 Source files available",
                style="color: #007bff; font-weight: 500; margin: 8px;",
            )
    elif download_result["errors"]:
        source_info = Span(
            "⚠ Using PDF fallback",
            style="color: #ffc107; font-weight: 500; margin: 8px;",
        )

    return Div(
        # Add debug info
        Script("""console.log('PDF loading response received');"""),
        # Library status area
        Div(
            library_status,
            source_info,
            id="library-status",
            style="text-align: center; margin-bottom: 20px;",
        ),
        # Empty PDF viewer content div - will be populated by JavaScript
        Div(
            id="pdf-viewer-content",  # Match the ID from root route
            style="width: 100%; padding: 20px; background-color: #f9f9f9; border-radius: 5px;",
        ),
        Html(
            Head(
                Meta(charset="UTF-8"),
                Meta(name="viewport", content="width=device-width, initial-scale=1.0"),
                Title("Minimal PDF.js Implementation"),
                Style(
                    "body {\r\n            background-color: #f0f0f0;\r\n            display: flex;\r\n            justify-content: center;\r\n            align-items: center;\r\n            height: 100vh;\r\n            margin: 0;\r\n        }\r\n        #pdf-canvas {\r\n            border: 1px solid black;\r\n            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);\r\n        }"
                ),
            ),
            Body(
                Canvas(id="pdf-canvas"),
                # Citation Modal
                Div(
                    Div(
                        Div(
                            H3("Citation Details", id="citation-modal-title"),
                            Button(
                                "×",
                                class_="citation-modal-close",
                                onclick="closeCitationModal()",
                            ),
                            class_="citation-modal-header",
                        ),
                        Div(id="citation-modal-content", class_="citation-modal-body"),
                        class_="citation-modal-content",
                    ),
                    id="citation-modal",
                    class_="citation-modal",
                    onclick="closeCitationModal(event)",
                ),
                Script(
                    src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.min.mjs",
                    type="module",
                ),
                Link(rel="stylesheet", href="/static/text_layer_builder.css"),
                Script(src="/static/ui_utils.js", type="module"),
                Script(src="/static/text_highlighter.js", type="module"),
                Script(src="/static/text_layer_builder.js", type="module"),
                Script(src="/static/pdf_link_service.js", type="module"),
                Script(src="/static/pdf-renderer.js", type="module"),
                Script(src="/static/annotation-handler.js", type="module"),
                Script(src="/static/destination-handler.js", type="module"),
                Script(src="/static/figure-detection.js", type="module"),
                Script(src="/static/reference-extraction.js", type="module"),
                Script(src="/static/figure-display.js", type="module"),
                Script(src="/static/reference-resolver.js", type="module"),
                Script(src="/static/paper-preview.js", type="module"),
                Script(src="/static/test-utilities.js", type="module"),
                Script(src="/static/scratchpad.js"),
                Script(src="/static/pdf-viewer.js", type="module"),
                Script(
                    f"""
                    console.log('🚀 MAIN: Setting up global variables');
                    
                    // Set global LaTeX data for the paper
                    window.latexData = {json.dumps(download_result.get('parsed_latex', None))};
                    window.paperStrategy = '{download_result['strategy']}';
                    window.currentPaperId = '{paper_id}';
                    
                    console.log('🚀 MAIN: Global variables set:', {{
                        hasLatexData: !!window.latexData,
                        strategy: window.paperStrategy,
                        paperId: window.currentPaperId
                    }});
                    
                    // Debug function to check scratchpad status
                    window.debugScratchpad = function() {{
                        console.log('=== SCRATCHPAD DEBUG ===');
                        console.log('Scratchpad instance:', window.scratchpad);
                        console.log('FAB element:', document.querySelector('.scratchpad-fab'));
                        console.log('Panel element:', document.querySelector('.scratchpad-panel'));
                        console.log('Current paper ID:', window.currentPaperId);
                        console.log('=========================');
                    }};
                    
                    // Manual function to force-create scratchpad
                    window.forceScratchpad = function() {{
                        console.log('🔧 FORCE: Creating scratchpad manually');
                        if (!window.scratchpad) {{
                            console.log('🔧 FORCE: No scratchpad instance, creating new one');
                            initializeScratchpad();
                        }} else {{
                            console.log('🔧 FORCE: Scratchpad exists, recreating UI');
                            window.scratchpad.createScratchpadUI();
                        }}
                    }};
                    
                    // Test function to open scratchpad panel manually
                    window.testScratchpadPanel = function() {{
                        console.log('🔧 TEST: Testing scratchpad panel opening');
                        if (window.scratchpad) {{
                            window.scratchpad.openPanel();
                            console.log('✅ TEST: Scratchpad panel opening triggered');
                        }} else {{
                            console.log('❌ TEST: No scratchpad instance found');
                        }}
                    }};
                    
                    // Test function to create a simple working context menu
                    window.testWorkingContextMenu = function() {{
                        console.log('🔧 TEST: Creating simple working context menu');
                        
                        // Remove any existing test menu
                        const existing = document.querySelector('#test-context-menu');
                        if (existing) existing.remove();
                        
                        const menu = document.createElement('div');
                        menu.id = 'test-context-menu';
                        menu.style.cssText = `
                            position: fixed !important;
                            left: 300px !important;
                            top: 200px !important;
                            background: white !important;
                            border: 2px solid red !important;
                            border-radius: 8px !important;
                            padding: 12px !important;
                            z-index: 99999 !important;
                            display: flex !important;
                            gap: 8px !important;
                        `;
                        
                        const btn1 = document.createElement('button');
                        btn1.textContent = 'Test 1';
                        btn1.style.cssText = 'padding: 8px; background: blue; color: white; border: none; cursor: pointer;';
                        btn1.addEventListener('click', () => {{
                            console.log('✅ TEST: Test button 1 clicked!');
                            alert('Test button 1 works!');
                        }});
                        
                        const btn2 = document.createElement('button');
                        btn2.textContent = 'Test 2';
                        btn2.style.cssText = 'padding: 8px; background: green; color: white; border: none; cursor: pointer;';
                        btn2.addEventListener('click', () => {{
                            console.log('✅ TEST: Test button 2 clicked!');
                            window.scratchpad.openPanel();
                        }});
                        
                        const btnClose = document.createElement('button');
                        btnClose.textContent = 'Close';
                        btnClose.style.cssText = 'padding: 8px; background: red; color: white; border: none; cursor: pointer;';
                        btnClose.addEventListener('click', () => {{
                            console.log('✅ TEST: Close button clicked!');
                            menu.remove();
                        }});
                        
                        menu.appendChild(btn1);
                        menu.appendChild(btn2);
                        menu.appendChild(btnClose);
                        document.body.appendChild(menu);
                        
                        console.log('✅ TEST: Working context menu created');
                    }};
                    
                    
                    // Modal control functions
                    window.showCitationModal = function() {{
                        const modal = document.getElementById('citation-modal');
                        if (modal) {{
                            modal.classList.add('show');
                        }}
                    }};
                    
                    window.closeCitationModal = function(event) {{
                        // Only close if clicking the backdrop or close button
                        if (event && event.target !== document.getElementById('citation-modal') && 
                            !event.target.classList.contains('citation-modal-close')) {{
                            return;
                        }}
                        
                        const modal = document.getElementById('citation-modal');
                        if (modal) {{
                            modal.classList.remove('show');
                        }}
                    }};
                    
                    // Close modal with ESC key
                    document.addEventListener('keydown', function(e) {{
                        if (e.key === 'Escape') {{
                            closeCitationModal();
                        }}
                    }});
                    
                    // Debug the LaTeX data loading
                    console.log('🚀 LATEX DATA LOADED:', {{
                        hasData: !!window.latexData,
                        strategy: window.paperStrategy,
                        paperId: window.currentPaperId,
                        citationCount: window.latexData ? Object.keys(window.latexData.citation_mapping || {{}}).length : 0,
                        figureCount: window.latexData ? Object.keys(window.latexData.figures || {{}}).length : 0
                    }});
                    
                    // Wait for the page to load, then call renderPDF
                    window.addEventListener('load', function() {{
                        console.log('🚀 PAGE LOADED - LaTeX data status:', {{
                            hasData: !!window.latexData,
                            strategy: window.paperStrategy
                        }});
                        
                        if (window.renderPDF) {{
                            renderPDF('/static/{paper_id}.pdf');
                        }} else {{
                            console.error('renderPDF function not available');
                        }}
                    }});

                    // expose paper id for context menu js
                    window.PAPER_ID = '{paper_id}';
                """,
                    type="module",
                ),
                # Drawer container
                Div(id="context-drawer"),
            ),
            lang="en",
        ),
    )


def download_arxiv_pdf(arxiv_url):
    """Download PDF from ArXiv URL"""
    # Extract paper ID from URL
    paper_id = re.search(r"arxiv\.org/abs/([^/]+)", arxiv_url)
    if not paper_id:
        paper_id = re.search(r"arxiv\.org/pdf/([^/]+)", arxiv_url)

    if not paper_id:
        raise ValueError("Invalid ArXiv URL")

    paper_id = paper_id.group(1)
    pdf_url = f"https://arxiv.org/pdf/{paper_id}.pdf"

    response = requests.get(pdf_url)
    response.raise_for_status()

    # Save to static directory so it can be served
    pdf_path = f"static/{paper_id}.pdf"
    with open(pdf_path, "wb") as f:
        f.write(response.content)

    return paper_id