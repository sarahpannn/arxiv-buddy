// PDF annotation and link handling functionality

// Function to create link overlays with proper positioning
window.createLinkOverlays = function(annotations, pageContainer, canvas, viewport, pdf) {
    // Process annotations and create clickable overlays
    annotations.forEach(annotation => {
        if (annotation.subtype === 'Link') {
            const linkElement = document.createElement('div');
            linkElement.style.position = 'absolute';
            linkElement.style.backgroundColor = 'rgba(0, 0, 255, 0.1)';
            linkElement.style.border = '1px solid rgba(0, 0, 255, 0.3)';
            linkElement.style.cursor = 'pointer';
            linkElement.style.zIndex = '10';
            
            // Transform annotation coordinates to viewport coordinates
            const rect = annotation.rect;
            const [x1, y1, x2, y2] = rect;
            
            // Calculate scaling factors based on actual canvas size vs viewport
            const scaleX = canvas.offsetWidth / viewport.width;
            const scaleY = canvas.offsetHeight / viewport.height;
            
            // Calculate the canvas's position within its container (accounting for centering)
            const containerWidth = pageContainer.offsetWidth;
            const canvasWidth = canvas.offsetWidth;
            const canvasOffsetX = (containerWidth - canvasWidth) / 2;
            
            // PDF coordinates are from bottom-left, we need top-left relative to canvas
            const left = canvasOffsetX + (x1 * scaleX);
            const top = (viewport.height - y2) * scaleY;
            const width = (x2 - x1) * scaleX;
            const height = (y2 - y1) * scaleY;
            
            linkElement.style.left = `${left}px`;
            linkElement.style.top = `${top}px`;
            linkElement.style.width = `${width}px`;
            linkElement.style.height = `${height}px`;
            
            // Add click handler for the annotation
            linkElement.addEventListener('click', function(event) {
                event.preventDefault();
                console.log('PDF Link clicked:', annotation);
                
                if (annotation.url) {
                    // External URL - use the URL directly for enhanced preview
                    console.log('External URL clicked:', annotation.url);
                    window.displayReferenceInfoFromUrl(annotation.url);
                } else if (annotation.dest) {
                    // Internal link (like to references)
                    console.log('Internal link destination:', annotation.dest);
                    window.findAndDisplayReference(annotation, pdf);
                } else if (annotation.action) {
                    // Action-based link
                    console.log('Link action:', annotation.action);
                    window.displayReferenceInfo('Link Action', JSON.stringify(annotation.action), 'This is a PDF action link.');
                }
                
                // Visual feedback
                linkElement.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
                setTimeout(() => {
                    linkElement.style.backgroundColor = 'rgba(0, 0, 255, 0.1)';
                }, 300);
            });
            
            // Add hover effects
            linkElement.addEventListener('mouseenter', function() {
                linkElement.style.backgroundColor = 'rgba(0, 0, 255, 0.2)';
                linkElement.style.borderColor = 'rgba(0, 0, 255, 0.5)';
            });
            
            linkElement.addEventListener('mouseleave', function() {
                linkElement.style.backgroundColor = 'rgba(0, 0, 255, 0.1)';
                linkElement.style.borderColor = 'rgba(0, 0, 255, 0.3)';
            });
            
            // Add the link overlay to the page container
            pageContainer.appendChild(linkElement);
        }
    });
}

// Function to add pattern-based citation detection for PDFs without proper annotations
window.addPatternBasedCitationDetection = function(textLayerDiv, pdf) {
    textLayerDiv.addEventListener('click', function(event) {
        const clickedElement = event.target;
        const text = clickedElement.textContent;
        
        // Only use pattern matching if no annotation was clicked
        if (text && !event.target.closest('[data-annotation-link]') && (
            text.match(/^\[\d+\]$/) ||           // [1], [12], etc.
            text.match(/^\[\d+[-–]\d+\]$/) ||    // [1-3], [5–7], etc.
            text.match(/^\[\d+(,\s*\d+)*\]$/) || // [1,2,3], [1, 5, 9], etc.
            text.match(/^\(\d+\)$/)              // (1), (12), etc.
        )) {
            console.log('Pattern-matched citation clicked:', text);
            
            // Extract citation numbers and find references
            const citationNumbers = window.extractCitationNumbers(text);
            window.findReferenceByNumbers(citationNumbers, pdf);
        }
    });
}

// Function to extract citation numbers from text patterns
window.extractCitationNumbers = function(text) {
    const numbers = [];
    
    if (text.match(/^\[\d+\]$/)) {
        // Single citation like [5]
        numbers.push(parseInt(text.match(/\d+/)[0]));
    } else if (text.match(/^\[\d+[-–]\d+\]$/)) {
        // Range like [5-8] or [5–8]
        const match = text.match(/\[(\d+)[-–](\d+)\]/);
        const start = parseInt(match[1]);
        const end = parseInt(match[2]);
        for (let i = start; i <= end; i++) {
            numbers.push(i);
        }
    } else if (text.match(/^\[\d+(,\s*\d+)*\]$/)) {
        // Multiple like [1,3,5] or [1, 3, 5]
        const matches = text.match(/\d+/g);
        numbers.push(...matches.map(n => parseInt(n)));
    } else if (text.match(/^\(\d+\)$/)) {
        // Parenthetical like (5)
        numbers.push(parseInt(text.match(/\d+/)[0]));
    }
    
    return numbers;
}