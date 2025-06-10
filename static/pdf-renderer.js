// PDF rendering and layout functionality

// Set the worker source for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs';

// Function to render PDF with given URL
window.renderPDF = async function(pdfUrl) {
    console.log('PDF URL:', pdfUrl);
    
    try {
        // Get the PDF document
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        
        // Get total number of pages
        const numPages = pdf.numPages;
        console.log('Total pages:', numPages);
        
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
        leftPane.style.padding = '20px';
        
        // Create right pane for future content
        const rightPane = document.createElement('div');
        rightPane.id = 'info-pane';
        rightPane.style.width = '40%';
        rightPane.style.height = '100%';
        rightPane.style.overflow = 'auto';
        rightPane.style.backgroundColor = '#fff';
        rightPane.style.padding = '20px';
        rightPane.innerHTML = '<h3>Document Info</h3><p>Click on citations to see details here...</p>';
        
        // Create PDF title
        const title = document.createElement('h2');
        title.textContent = `PDF Document (${numPages} pages)`;
        title.style.textAlign = 'center';
        title.style.margin = '0 0 20px 0';
        leftPane.appendChild(title);
        
        // Add panes to main layout
        mainLayout.appendChild(leftPane);
        mainLayout.appendChild(rightPane);
        container.appendChild(mainLayout);

        // Render each page
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            
            // Set the scale for rendering
            const scale = 1.0;
            const viewport = page.getViewport({ scale });

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
            pageContainer.style.position = 'relative';
            pageContainer.style.display = 'inline-block';
            pageContainer.style.margin = '0 auto 20px auto';
            pageContainer.style.display = 'block';
            pageContainer.style.textAlign = 'center';

            // Create canvas for this page
            const canvas = document.createElement('canvas');
            canvas.id = `pdf-canvas-${pageNum}`;
            const context = canvas.getContext('2d');

            // Set the canvas dimensions
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            // Style the canvas
            canvas.style.maxWidth = '700px';
            canvas.style.maxHeight = '900px';
            canvas.style.width = 'auto';
            canvas.style.height = 'auto';
            canvas.style.display = 'block';
            canvas.style.margin = '0 auto';
            canvas.style.border = '1px solid #ccc';
            canvas.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';

            // Create text layer container
            const textLayerDiv = document.createElement('div');
            textLayerDiv.className = 'textLayer';
            textLayerDiv.style.position = 'absolute';
            textLayerDiv.style.left = '0';
            textLayerDiv.style.top = '0';
            textLayerDiv.style.right = '0';
            textLayerDiv.style.bottom = '0';
            textLayerDiv.style.overflow = 'hidden';
            textLayerDiv.style.opacity = '0.25';
            textLayerDiv.style.lineHeight = '1.0';
            textLayerDiv.style.maxWidth = '600px';
            textLayerDiv.style.maxHeight = '900px';
            textLayerDiv.style.width = 'auto';
            textLayerDiv.style.height = 'auto';
            textLayerDiv.style.margin = '0 auto';

            // Add canvas and text layer to page container
            pageContainer.appendChild(canvas);
            pageContainer.appendChild(textLayerDiv);
            leftPane.appendChild(pageContainer);

            // Render the PDF page on the canvas
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            await page.render(renderContext).promise;

            // Get text content and render text layer
            const textContent = await page.getTextContent();
            
            // Render text layer for selectable text
            const textLayer = new pdfjsLib.TextLayer({
                textContentSource: textContent,
                container: textLayerDiv,
                viewport: viewport
            });
            
            await textLayer.render();

            // Get PDF annotations (links, etc.) for this page
            const annotations = await page.getAnnotations();
            console.log(`Page ${pageNum} annotations:`, annotations);

            // Process annotations and create clickable overlays
            createLinkOverlays(annotations, pageContainer, canvas, viewport, pdf);

            // Add pattern-based citation detection fallback
            addPatternBasedCitationDetection(textLayerDiv, pdf);
            
            console.log(`Rendered page ${pageNum}`);
        }

    } catch (error) {
        console.error('Error rendering PDF:', error);
    }
};