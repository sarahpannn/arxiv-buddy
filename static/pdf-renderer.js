// Set the worker source for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs';

// Store canvas data for responsive resizing
window.pdfCanvases = window.pdfCanvases || [];

// Function to render PDF with given URL
window.renderPDF = async function(pdfUrl) {
    try {
        // Get the PDF document
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        
        // Get total number of pages
        const numPages = pdf.numPages;
        
        // Clear existing link overlays and canvas data before loading new PDF
        if (window.clearLinkOverlays) {
            window.clearLinkOverlays();
        }
        window.pdfCanvases = [];
        
        // Get the container and clear existing content
        const container = document.body;
        container.innerHTML = '';
        
        // Add back button
        const backButton = document.createElement('button');
        backButton.id = 'back-button';
        backButton.innerHTML = '← Back';
        backButton.onclick = function() {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = '/';
            }
        };
        backButton.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            z-index: 9999;
            background: #6c757d;
            color: white;
            border: none;
            border-radius: 6px;
            padding: 10px 20px;
            font-size: 14px;
            cursor: pointer;
            font-weight: 500;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            transition: background 0.2s, transform 0.2s;
        `;
        
        // Add hover effect
        backButton.addEventListener('mouseenter', function() {
            this.style.background = '#5a6268';
            this.style.boxShadow = '0 4px 12px rgba(108, 117, 125, 0.3)';
            this.style.transform = 'translateY(-1px)';
        });
        
        backButton.addEventListener('mouseleave', function() {
            this.style.background = '#6c757d';
            this.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            this.style.transform = 'translateY(0)';
        });
        
        container.appendChild(backButton);
        
        // Create main layout container
        const mainLayout = document.createElement('div');
        mainLayout.style.display = 'flex';
        mainLayout.style.height = '100vh';
        mainLayout.style.fontFamily = 'Arial, sans-serif';
        
        // Create left pane for PDF
        const leftPane = document.createElement('div');
        leftPane.id = 'pdf-pane';
        leftPane.style.width = '60%';
        leftPane.style.height = '100%';
        leftPane.style.overflow = 'auto';
        leftPane.style.backgroundColor = '#f5f5f5';
        leftPane.style.borderRight = '2px solid #ddd';
        leftPane.style.padding = '0 8px 0 0';
        leftPane.style.position = 'relative';
        
        // Create right pane for future content
        const rightPane = document.createElement('div');
        rightPane.id = 'info-pane';
        rightPane.style.width = '40%';
        rightPane.style.height = '100%';
        rightPane.style.overflow = 'auto';
        rightPane.style.backgroundColor = '#fff';
        rightPane.style.display = 'block';
        rightPane.style.padding = '20px';
        rightPane.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; text-align: center; font-family: 'Inter', 'Roboto', 'Segoe UI', 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif;">
            <div style="max-width: 90%;">
                <h3 style='font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: -1px; color: #23272f;'>What are we reading today?</h3>
                <p style='color: #666; font-size: 1.1rem; margin-top: 0;'>Click on in-page links to see details here...</p>
            </div>
        </div>`;
        
        // Create PDF title
        const title = document.createElement('h2');
        title.textContent = `${pdfUrl.slice(8, -4)} (${numPages} pages)`;
        title.style.textAlign = 'center';
        title.style.margin = '30px 0 20px 0';
        leftPane.appendChild(title);

        // Add panes to main layout
        mainLayout.appendChild(leftPane);
        mainLayout.appendChild(rightPane);
        container.appendChild(mainLayout);

        // Add critical CSS for text layer if not already present
        if (!document.getElementById('pdf-text-layer-styles')) {
            const style = document.createElement('style');
            style.id = 'pdf-text-layer-styles';
            style.textContent = `
            /* Updated text-layer rules for PDF.js ≥ 4.3 — keeps glyph metrics intact */
            .textLayer{
            position:absolute;
            inset:0;                    /* shorthand for top/right/bottom/left:0 */
            overflow:clip;              /* avoids scrollbars but doesn’t hide transforms */
            opacity:1;
            line-height:1;
            text-size-adjust:none;
            forced-color-adjust:none;
            transform-origin:0 0;
            caret-color:CanvasText;
            z-index:2;                  /* 2 = above canvas, below any UI chrome */
            }

            /* When the viewer enters “highlighting” mode (e.g. during find) */
            .textLayer.highlighting{
            touch-action:none;
            }

            /* Every glyph is an absolutely-positioned span */
            .textLayer span,
            .textLayer br{
            color:transparent;          /* canvas shows through */
            position:absolute;
            white-space:pre;
            cursor:text;
            transform-origin:0 0;
            }

            /* Chrome quirk: empty marked-content spans mustn’t stretch */
            .textLayer span.markedContent{
            top:0;
            height:0;
            }
            .textLayer span[role="img"]{
            user-select:none;
            cursor:default;
            }

            /* ========== Selection & highlight visuals ========== */
            .textLayer ::selection{
            background:rgba(0,0,255,.25);
            }
            .textLayer br::selection{
            background:transparent;     /* fixes blue bars in Chrome */
            }

            .textLayer .highlight{
            margin:-1px;
            padding:1px;
            background:rgba(180,0,170,.25);
            border-radius:4px;
            }
            .textLayer .highlight.appended{position:initial;}
            .textLayer .highlight.begin  {border-radius:4px 0 0 4px;}
            .textLayer .highlight.end    {border-radius:0 4px 4px 0;}
            .textLayer .highlight.middle {border-radius:0;}
            .textLayer .highlight.selected{
            background:rgba(0,100,0,.25);
            }

            /* Sentinel added by TextLayerBuilder so the cursor can reach the end */
            .textLayer .endOfContent{
            display:block;
            position:absolute;
            inset:100% 0 0;             /* pushes it just below the page */
            z-index:0;
            cursor:default;
            user-select:none;
            }
            .textLayer.selecting .endOfContent{top:0;}
            `;

            document.head.appendChild(style);
        }

        // Render each page
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            
            // Calculate display scale first
            const baseViewport = page.getViewport({ scale: 1 });
            const targetW = leftPane.clientWidth * 0.90;
            const rawDisplayScale = targetW / baseViewport.width;
            const displayScale = Math.max(0.2, Math.min(2.0, rawDisplayScale));
            
            // Set render scale for high-DPI displays
            const outputScale = window.devicePixelRatio || 1;
            const renderScale = displayScale * outputScale;
            
            // Create viewports
            const displayViewport = page.getViewport({ scale: displayScale });
            const renderViewport = page.getViewport({ scale: renderScale });

            // Add page number label
            const pageLabel = document.createElement('p');
            pageLabel.textContent = `Page ${pageNum}`;
            pageLabel.style.textAlign = 'center';
            pageLabel.style.margin = '10px 0 5px 0';
            pageLabel.style.fontSize = '14px';
            pageLabel.style.color = '#666';
            leftPane.appendChild(pageLabel);

            // Create page container with relative positioning
            const pageContainer = document.createElement('div');
            pageContainer.className = 'page';
            pageContainer.style.position = 'relative';
            pageContainer.style.display = 'block';
            pageContainer.style.margin = '0 0 15px 0';
            pageContainer.style.textAlign = 'center';
            
            // Create canvas wrapper for proper containment
            const canvasWrapper = document.createElement('div');
            canvasWrapper.className = 'canvasWrapper';
            canvasWrapper.style.position = 'relative';
            canvasWrapper.style.overflow = 'hidden';
            canvasWrapper.style.display = 'inline-block';
            canvasWrapper.style.margin = '0 auto';
            canvasWrapper.style.width = displayViewport.width + 'px';
            canvasWrapper.style.height = displayViewport.height + 'px';

            // Create canvas for this page
            const canvas = document.createElement('canvas');
            canvas.id = `pdf-canvas-${pageNum}`;
            const context = canvas.getContext('2d');

            // Set the canvas dimensions for high-DPI rendering
            canvas.height = renderViewport.height;
            canvas.width = renderViewport.width;
            
            // Apply display sizing
            canvas.style.width = displayViewport.width + 'px';
            canvas.style.height = displayViewport.height + 'px';
            canvas.style.display = 'block';
            canvas.style.margin = '0 auto';
            canvas.style.border = '1px solid #ccc';
            canvas.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
            
            // Add canvas to wrapper and wrapper to page container
            canvasWrapper.appendChild(canvas);
            pageContainer.appendChild(canvasWrapper);
            leftPane.appendChild(pageContainer);

            // Render the PDF page on the canvas
            const renderContext = {
                canvasContext: context,
                viewport: renderViewport
            };
            await page.render(renderContext).promise;

            // Create text layer div
            const textLayerDiv = document.createElement('div');
            textLayerDiv.className = 'textLayer';
            
            // Apply viewport transform to text layer container
            const [scaleX, scaleY] = [displayViewport.scale, displayViewport.scale];
            textLayerDiv.style.width = `${displayViewport.width}px`;
            textLayerDiv.style.height = `${displayViewport.height}px`;
            
            canvasWrapper.appendChild(textLayerDiv);

            // Get text content
            const textContent = await page.getTextContent();
            
            // Ensure fonts are ready before rendering text layer
            if (document.fonts) {
                await document.fonts.ready;
            }
            
            // Use the new TextLayer class (PDF.js 4.3+)
            const textLayer = new pdfjsLib.TextLayer({
                container: textLayerDiv,
                viewport: displayViewport,
                textContentSource: textContent
            });

            // Render the text layer
            await textLayer.render();
            

            // Store canvas data for responsive resizing
            const canvasData = {
                canvas: canvas,
                textLayerDiv: textLayerDiv,
                textLayer: textLayer,
                page: page,
                viewport: displayViewport,
                baseViewport: baseViewport,
                renderViewport: renderViewport,
                displayScale: displayScale,
                outputScale: outputScale,
                leftPane: leftPane,
                canvasWrapper: canvasWrapper
            };
            window.pdfCanvases.push(canvasData);

            // Get PDF annotations (links, etc.) for this page
            const annotations = await page.getAnnotations();

            // Process annotations and create clickable overlays
            if (window.createLinkOverlays) {
                createLinkOverlays(annotations, pageContainer, canvas, displayViewport, pdf, pageNum, textContent);
            }

            // Add pattern-based citation detection fallback
            if (window.addPatternBasedCitationDetection) {
                addPatternBasedCitationDetection(textLayerDiv, pdf);
            }
            
        }

        // All pages rendered - initialize scratchpad
        
        if (window.initializeScratchpad) {
            window.initializeScratchpad();
        } else if (window.scratchpad) {
            window.scratchpad.createScratchpadUI();
        }

    } catch (error) {
    }
};

// Function to resize a single canvas and its text layer
function resizeCanvas(canvasData) {
    const { canvas, textLayerDiv, textLayer, page, baseViewport, leftPane, canvasWrapper, outputScale } = canvasData;
    
    // Calculate responsive display scale
    const targetW = leftPane.clientWidth * 0.90;
    const rawDisplayScale = targetW / baseViewport.width;
    const displayScale = Math.max(0.2, Math.min(2.0, rawDisplayScale));
    const newDisplayViewport = page.getViewport({ scale: displayScale });
    const newRenderViewport = page.getViewport({ scale: displayScale * outputScale });
    
    // Update canvas wrapper dimensions
    if (canvasWrapper) {
        canvasWrapper.style.width = newDisplayViewport.width + 'px';
        canvasWrapper.style.height = newDisplayViewport.height + 'px';
    }
    
    // Update canvas display size
    canvas.style.width = newDisplayViewport.width + 'px';
    canvas.style.height = newDisplayViewport.height + 'px';
    
    // Re-render canvas at new size
    canvas.width = newRenderViewport.width;
    canvas.height = newRenderViewport.height;
    
    const renderContext = {
        canvasContext: canvas.getContext('2d'),
        viewport: newRenderViewport
    };
    
    page.render(renderContext).promise.then(async () => {
        // Update text layer dimensions
        textLayerDiv.style.width = `${newDisplayViewport.width}px`;
        textLayerDiv.style.height = `${newDisplayViewport.height}px`;
        
        // Clear existing text layer content
        textLayerDiv.innerHTML = '';
        
        // Get fresh text content
        const textContent = await page.getTextContent();
        
        // Create new text layer with updated viewport
        const newTextLayer = new pdfjsLib.TextLayer({
            container: textLayerDiv,
            viewport: newDisplayViewport,
            textContentSource: textContent
        });
        
        // Render the new text layer
        await newTextLayer.render();
        
        // Update stored references
        canvasData.textLayer = newTextLayer;
        canvasData.viewport = newDisplayViewport;
        canvasData.renderViewport = newRenderViewport;
        canvasData.displayScale = displayScale;
    });
}

// Function to resize all PDF canvases (called on window resize)
window.resizePDFCanvases = function() {
    if (window.pdfCanvases) {
        window.pdfCanvases.forEach(canvasData => {
            resizeCanvas(canvasData);
        });
    }
}

// Add window resize listener for PDF canvases
if (!window.pdfResizeListenerAdded) {
    window.addEventListener('resize', function() {
        // Debounce the resize event to avoid excessive calls
        clearTimeout(window.pdfResizeTimeout);
        window.pdfResizeTimeout = setTimeout(() => {
            window.resizePDFCanvases();
            // Also reposition link overlays if the function exists
            if (window.repositionLinkOverlays) {
                window.repositionLinkOverlays();
            }
        }, 100);
    });
    window.pdfResizeListenerAdded = true;
}

