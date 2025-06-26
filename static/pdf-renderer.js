// Set the worker source for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs';

// Store canvas data for responsive resizing
window.pdfCanvases = window.pdfCanvases || [];

// Function to render PDF with given URL
window.renderPDF = async function(pdfUrl) {
    console.log('PDF URL:', pdfUrl);
    
    try {
        // Get the PDF document
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        
        // Get total number of pages
        const numPages = pdf.numPages;
        console.log('Total pages:', numPages);
        
        // Clear existing link overlays and canvas data before loading new PDF
        if (window.clearLinkOverlays) {
            window.clearLinkOverlays();
        }
        window.pdfCanvases = [];
        
        // Get the container and clear existing content
        const container = document.body;
        container.innerHTML = '';
        
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
        
        // Create right pane for future content
        const rightPane = document.createElement('div');
        rightPane.id = 'info-pane';
        rightPane.style.width = '40%';
        rightPane.style.height = '100%';
        rightPane.style.overflow = 'auto';
        rightPane.style.backgroundColor = '#fff';
        rightPane.style.display = 'block';
        rightPane.style.padding = '20px';
        rightPane.innerHTML = `<div style="max-width: 90%; margin: 0 auto; text-align: center; font-family: 'Inter', 'Roboto', 'Segoe UI', 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif; word-break: break-word;">
            <h3 style='font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: -1px; color: #23272f;'>What are we reading today?</h3>
            <p style='color: #666; font-size: 1.1rem; margin-top: 0;'>Click on in-page links to see details here...</p>
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
                /* Reset text layer styles for PDF.js 4.3+ */
                .textLayer {
                    position: absolute;
                    text-align: initial;
                    left: 0;
                    top: 0;
                    right: 0;
                    bottom: 0;
                    overflow: hidden;
                    opacity: 1;
                    line-height: 1;
                    text-size-adjust: none;
                    forced-color-adjust: none;
                    transform-origin: 0 0;
                    z-index: 2;
                    caret-color: auto;
                }
                
                .textLayer :is(span, br) {
                    color: transparent;
                    position: absolute;
                    white-space: pre;
                    cursor: text;
                    transform-origin: 0% 0%;
                }
                
                /* Fix for selection visibility */
                .textLayer span::selection {
                    background: rgba(0, 0, 255, 0.3);
                    color: transparent;
                }
                
                .textLayer span::-moz-selection {
                    background: rgba(0, 0, 255, 0.3);
                    color: transparent;
                }
                
                /* Ensure proper text selection */
                .textLayer {
                    user-select: text;
                    -webkit-user-select: text;
                    -moz-user-select: text;
                    -ms-user-select: text;
                }
                
                .textLayer .highlight {
                    margin: -1px;
                    padding: 1px;
                    background-color: rgba(180, 0, 170, 0.2);
                    border-radius: 4px;
                }
                
                .textLayer .highlight.appended {
                    position: initial;
                }
                
                .textLayer .highlight.begin {
                    border-radius: 4px 0 0 4px;
                }
                
                .textLayer .highlight.end {
                    border-radius: 0 4px 4px 0;
                }
                
                .textLayer .highlight.middle {
                    border-radius: 0;
                }
                
                .textLayer .highlight.selected {
                    background-color: rgba(0, 100, 0, 0.2);
                }
                
                .textLayer .endOfContent {
                    display: block;
                    position: absolute;
                    left: 0;
                    top: 100%;
                    right: 0;
                    bottom: 0;
                    z-index: -1;
                    cursor: default;
                    user-select: none;
                }
                
                .textLayer .endOfContent.active {
                    top: 0;
                }
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
            
            // Debug: Check what PDF.js actually rendered
            console.log(`Page ${pageNum} text layer rendered. First few spans:`, 
                Array.from(textLayerDiv.querySelectorAll('span')).slice(0, 3).map(span => ({
                    text: span.textContent,
                    fontSize: window.getComputedStyle(span).fontSize,
                    transform: window.getComputedStyle(span).transform
                }))
            );

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
            console.log(`Page ${pageNum} annotations:`, annotations);

            // Process annotations and create clickable overlays
            if (window.createLinkOverlays) {
                createLinkOverlays(annotations, pageContainer, canvas, displayViewport, pdf, pageNum, textContent);
            }

            // Add pattern-based citation detection fallback
            if (window.addPatternBasedCitationDetection) {
                addPatternBasedCitationDetection(textLayerDiv, pdf);
            }
            
            console.log(`Rendered page ${pageNum}`);
        }

    } catch (error) {
        console.error('Error rendering PDF:', error);
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