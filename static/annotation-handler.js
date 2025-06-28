// PDF annotation and link handling functionality

// Store link overlays for repositioning on resize
window.linkOverlays = window.linkOverlays || [];

// Function to create link overlays with proper positioning
window.createLinkOverlays = function(annotations, pageContainer, canvas, viewport, pdf, pageNum, textContent) {
    // Process annotations and create clickable overlays
    annotations.forEach(annotation => {
        if (annotation.subtype === 'Link') {
            const linkElement = document.createElement('div');
            linkElement.style.position = 'absolute';
            linkElement.style.backgroundColor = 'rgba(0, 0, 255, 0.1)';
            linkElement.style.border = '1px solid rgba(0, 0, 255, 0.3)';
            linkElement.style.cursor = 'pointer';
            linkElement.style.zIndex = '10';
            
            // Store data needed for repositioning
            const linkData = {
                element: linkElement,
                annotation: annotation,
                pageContainer: pageContainer,
                canvas: canvas,
                viewport: viewport,
                pageNum: pageNum
            };
            
            // Position the link overlay
            positionLinkOverlay(linkData);
            
            // Store in global array for resize handling
            window.linkOverlays.push(linkData);
            
            // Add click handler for the annotation
            linkElement.addEventListener('click', function(event) {
                event.preventDefault();

                if (annotation.url) {
                    // External URL - use the URL directly for enhanced preview
                    window.displayReferenceInfoFromUrl(annotation.url);
                } else if (annotation.dest) {
                    // Internal link (like to references)
                    const lastName = extractLastNameNearAnnotation(annotation, textContent.items);
                    const citationKey = extractCitationKeyFromAnnotation(annotation, textContent.items);
                    console.log('🔍 Extracted citation key:', citationKey);
                    window.findAndDisplayReference(annotation, pdf, lastName, citationKey);
                } else if (annotation.action) {
                    // Action-based link
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
        // const matches = text.match(/\d+/g);
        // numbers.push(...matches.map(n => parseInt(n)));
        const matches = text.match(/\d+/g);
        numbers.push(...matches.map(n => parseInt(n, 10)));
    } else if (text.match(/^\(\d+\)$/)) {
        // Parenthetical like (5)
        numbers.push(parseInt(text.match(/\d+/)[0]));
    }
    
    return numbers;
}

// Helper to grab a likely author last name near the citation
function extractLastNameNearAnnotation(annotation, textItems) {
    if (!annotation.rect || !textItems) return null;
    const [x1, y1, x2, y2] = annotation.rect;
    const centerY = (y1 + y2) / 2;
    let line = '';

    for (const item of textItems) {
        if (!item.transform) continue;
        const y = item.transform[5];
        if (Math.abs(y - centerY) < 10) {
            line += ' ' + item.str;
        }
    }

    line = line.trim();
    if (line.length === 0) return null;

    const match = line.match(/([A-Z][a-zA-Z]{2,})/);
    return match ? match[1] : null;
}

// Helper to extract the actual citation key/text that was clicked
function extractCitationKeyFromAnnotation(annotation, textItems) {
    if (!annotation.rect || !textItems) return null;
    
    const [x1, y1, x2, y2] = annotation.rect;
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    
    console.log('🔍 Looking for citation text at coordinates:', { centerX, centerY });
    
    // Find text items that overlap with the annotation rectangle
    let citationText = '';
    let closestDistance = Infinity;
    
    for (const item of textItems) {
        if (!item.transform) continue;
        
        const itemX = item.transform[4];
        const itemY = item.transform[5];
        
        // Check if this text item is within the annotation bounds
        const distance = Math.sqrt(Math.pow(itemX - centerX, 2) + Math.pow(itemY - centerY, 2));
        
        if (distance < 50 && distance < closestDistance) { // Within 50 pixels
            closestDistance = distance;
            citationText = item.str.trim();
        }
    }
    
    if (citationText) {
        console.log('🔍 Found citation text:', citationText);
        
        // Try to extract citation patterns from the text
        // Pattern 1: [author_year] format
        let match = citationText.match(/\[([^\]]+)\]/);
        if (match) {
            return match[1];
        }
        
        // Pattern 2: \cite{key} format (if raw LaTeX somehow visible)
        match = citationText.match(/\\cite\{([^}]+)\}/);
        if (match) {
            return match[1];
        }
        
        // Pattern 3: Just return the text if it looks like a citation key
        if (citationText.match(/^[a-zA-Z][a-zA-Z0-9_]*$/)) {
            return citationText;
        }
        
        // Pattern 4: Author names or numbers - extract meaningful parts
        if (citationText.match(/^\d+$/)) {
            return citationText; // Numbered citation
        }
        
        // Pattern 5: Return the raw text for further processing
        return citationText;
    }
    
    console.log('❌ No citation text found near annotation');
    return null;
}

// Function to position a single link overlay
function positionLinkOverlay(linkData) {
    const { element, annotation, pageContainer, canvas, viewport } = linkData;
    const rect = annotation.rect;
    const [x1, y1, x2, y2] = rect;
    
    // Calculate the canvas's position within its container (accounting for centering)
    const containerWidth = pageContainer.offsetWidth;
    const canvasDisplayWidth = canvas.offsetWidth;
    const canvasDisplayHeight = canvas.offsetHeight;
    const canvasOffsetX = (containerWidth - canvasDisplayWidth) / 2;
    
    // Simple approach: scale annotation coordinates directly to display size
    // PDF base size = viewport.width / viewport.scale, viewport.height / viewport.scale
    const pdfBaseWidth = viewport.width / viewport.scale;
    const pdfBaseHeight = viewport.height / viewport.scale;
    
    const scaleX = canvasDisplayWidth / pdfBaseWidth;
    const scaleY = canvasDisplayHeight / pdfBaseHeight;
    
    // PDF coordinates are from bottom-left, we need top-left relative to canvas
    const left = canvasOffsetX + (x1 * scaleX);
    const top = (pdfBaseHeight - y2) * scaleY;
    const width = (x2 - x1) * scaleX;
    const height = (y2 - y1) * scaleY;
    
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
}

// Function to reposition all link overlays (called on window resize)
window.repositionLinkOverlays = function() {
    if (window.linkOverlays) {
        window.linkOverlays.forEach(linkData => {
            positionLinkOverlay(linkData);
        });
    }
}

// Function to clear all link overlays (called when loading new PDF)
window.clearLinkOverlays = function() {
    if (window.linkOverlays) {
        window.linkOverlays.forEach(linkData => {
            if (linkData.element && linkData.element.parentNode) {
                linkData.element.parentNode.removeChild(linkData.element);
            }
        });
        window.linkOverlays = [];
    }
}

// Add window resize listener to reposition overlays
if (!window.resizeListenerAdded) {
    window.addEventListener('resize', function() {
        // Debounce the resize event to avoid excessive calls
        clearTimeout(window.resizeTimeout);
        window.resizeTimeout = setTimeout(() => {
            window.repositionLinkOverlays();
        }, 100);
    });
    window.resizeListenerAdded = true;
}
