// Figure detection and display functionality

// Function to detect if destination is content (figure, table, algorithm, equation, appendix) and extract information
window.detectFigureAtDestination = async function(textContent, dest, page, pdf, pageNum) {
    try {
        console.log('🔬 FIGURE DETECTION DEBUG: detectFigureAtDestination called');
        console.log('🔬 Page number:', pageNum);
        console.log('🔬 LaTeX data check:', {
            hasLatexData: !!window.latexData,
            paperStrategy: window.paperStrategy,
            shouldUseLaTeX: window.latexData && window.paperStrategy === 'source'
        });
        
        // Check if we have LaTeX data available for fast lookup
        if (window.latexData && window.paperStrategy === 'source') {
            console.log('🔬 LaTeX-based figure lookup available');
            const latexResult = findFigureInLatexData(dest, pageNum);
            if (latexResult) {
                console.log('✅ Found figure in LaTeX data:', latexResult.label);
                const contentArea = await extractFigureArea(page, null);
                return {
                    type: latexResult.figure.figure_type,
                    number: latexResult.label,
                    caption: latexResult.figure.caption,
                    pageNumber: pageNum,
                    area: contentArea,
                    latex_data: latexResult
                };
            } else {
                console.log('⚠️ No figure match in LaTeX data, falling back to PDF extraction');
            }
        } else {
            console.log('🔬 Using PDF figure detection (no LaTeX data or wrong strategy)');
        }
        const textItems = textContent.items;
        
        // Get destination coordinates if available
        let targetY = null;
        if (dest[1] === 'XYZ' && dest.length > 3 && typeof dest[3] === 'number') {
            targetY = dest[3];
        } else if (dest.length > 2 && typeof dest[2] === 'number') {
            targetY = dest[2];
        }

        // First, let's see ALL text on the page for debugging
        console.log('--- ALL TEXT ON PAGE ---');
        const allPageText = textItems.map(item => item.str).join(' ');
        console.log('Page text preview:', allPageText.substring(0, 300) + '...');
        
        // Check if this is a citation/reference (we want to exclude these)
        const isCitation = allPageText.toLowerCase().includes('reference') || 
                          allPageText.toLowerCase().includes('bibliograph') ||
                          allPageText.toLowerCase().includes('citation') ||
                          /\[\d+\]/.test(allPageText) && allPageText.length < 1000; // Short pages with citation patterns
        
        if (isCitation) {
            console.log('--- DETECTED CITATION/REFERENCE PAGE - SKIPPING ---');
            return null;
        }
        
        // Look for content indicators (figures, tables, algorithms, equations, appendix)
        let contentType = null;
        let contentNumber = '';
        let contentCaption = '';
        let foundContent = false;
        
        const contentPatterns = [
            { type: 'figure', patterns: [
                /(?:Figure|Fig\.?)\s*(\d+)[:\.]?\s*(.*)/i,
                /(?:Figure|Fig\.?)\s*(\d+)/i,
                /Fig\.\s*(\d+)/i,
                /Figure\s*(\d+)/i
            ]},
            { type: 'table', patterns: [
                /(?:Table|Tab\.?)\s*(\d+)[:\.]?\s*(.*)/i,
                /(?:Table|Tab\.?)\s*(\d+)/i,
                /Tab\.\s*(\d+)/i,
                /Table\s*(\d+)/i
            ]},
            { type: 'algorithm', patterns: [
                /(?:Algorithm|Alg\.?)\s*(\d+)[:\.]?\s*(.*)/i,
                /(?:Algorithm|Alg\.?)\s*(\d+)/i,
                /Alg\.\s*(\d+)/i,
                /Algorithm\s*(\d+)/i
            ]},
            { type: 'equation', patterns: [
                /(?:Equation|Eq\.?)\s*(\d+)[:\.]?\s*(.*)/i,
                /(?:Equation|Eq\.?)\s*(\d+)/i,
                /Eq\.\s*(\d+)/i,
                /Equation\s*(\d+)/i,
                /\(\d+\)/
            ]},
            { type: 'appendix', patterns: [
                /(?:Appendix|App\.?)\s*([A-Z])[:\.]?\s*(.*)/i,
                /(?:Appendix|App\.?)\s*([A-Z])/i,
                /App\.\s*([A-Z])/i,
                /Appendix\s*([A-Z])/i
            ]}
        ];
        
        for (let i = 0; i < textItems.length; i++) {
            const item = textItems[i];
            const text = item.str.trim();
            const lowerText = text.toLowerCase();
            
            // Check each content type
            for (const contentDef of contentPatterns) {
                const hasKeyword = contentDef.type === 'figure' ? 
                    (lowerText.includes('figure') || lowerText.includes('fig.') || lowerText.includes('fig ')) :
                    contentDef.type === 'table' ?
                    (lowerText.includes('table') || lowerText.includes('tab.')) :
                    contentDef.type === 'algorithm' ?
                    (lowerText.includes('algorithm') || lowerText.includes('alg.')) :
                    contentDef.type === 'equation' ?
                    (lowerText.includes('equation') || lowerText.includes('eq.') || /\(\d+\)/.test(text)) :
                    contentDef.type === 'appendix' ?
                    (lowerText.includes('appendix') || lowerText.includes('app.')) :
                    false;
                
                if (hasKeyword) {
                    console.log(`*** FOUND ${contentDef.type.toUpperCase()} TEXT:`, text);
                    
                    for (const pattern of contentDef.patterns) {
                        const match = text.match(pattern);
                        if (match) {
                            console.log('*** PATTERN MATCHED:', pattern, match);
                            
                            // Check if this is a citation (reference TO a figure) rather than an actual figure caption
                            if (isCitationNotCaption(textItems, i, contentDef.type, match[1])) {
                                console.log('*** SKIPPING - This appears to be a citation, not a caption');
                                continue;
                            }
                            
                            contentType = contentDef.type;
                            contentNumber = match[1];
                            contentCaption = match[2] || '';
                            foundContent = true;
                            
                            // Collect caption text from surrounding items
                            const startIdx = Math.max(0, i - 5);
                            const endIdx = Math.min(textItems.length, i + 15);
                            
                            let contextText = '';
                            for (let j = startIdx; j <= endIdx; j++) {
                                if (j !== i) {
                                    contextText += ' ' + textItems[j].str;
                                }
                            }
                            
                            contentCaption = (contentCaption + ' ' + contextText).trim();
                            if (contentCaption.length > 1000) {
                                contentCaption = contentCaption.substring(0, 1000) + '...';
                            }
                            
                            break;
                        }
                    }
                    
                    if (foundContent) break;
                }
            }
            
            if (foundContent) break;
        }
        
        if (foundContent) {
            console.log(`*** ${contentType.toUpperCase()} DETECTED ***`);
            console.log('Number:', contentNumber);
            console.log('Caption:', contentCaption);
            
            const contentArea = await extractFigureArea(page, targetY);
            
            return {
                type: contentType,
                number: contentNumber,
                caption: contentCaption,
                pageNumber: pageNum,
                area: contentArea
            };
        }
        
        console.log('--- NO CONTENT DETECTED ---');
        return null;
    } catch (error) {
        console.error('Error detecting content at destination:', error);
        return null;
    }
};

async function renderFullPageToImage(page, scale = 2) {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    return {
        dataUrl: canvas.toDataURL('image/png'),
        width: viewport.width,
        height: viewport.height,
    };
}

// Function to extract figure area and images from the page
async function extractFigureArea(page, targetY) {
    const pageIndex = page._pageIndex ?? (await page.getPageIndex(page));
    const domCanvas = document.getElementById(`pdf-canvas-${pageIndex + 1}`);

    if (domCanvas) {
        const clone = document.createElement('canvas');
        clone.width = domCanvas.width;
        clone.height = domCanvas.height;
        clone.getContext('2d').drawImage(domCanvas, 0, 0);

        return {
            x: 0,
            y: 0,
            width: domCanvas.width,
            height: domCanvas.height,
            imageDataUrl: clone.toDataURL('image/png'),
        };
    }

    try {
        const { dataUrl, width, height } = await renderFullPageToImage(page, 2);
        return { x: 0, y: 0, width, height, imageDataUrl: dataUrl };
    } catch (err) {
        console.error('Error rendering full page to image:', err);
        return {
            x: 0,
            y: 0,
            width: page.getViewport({ scale: 1 }).width,
            height: page.getViewport({ scale: 1 }).height,
            imageDataUrl: null
        };
    }
}

// Function to determine if a figure/table reference is a citation rather than an actual caption
function isCitationNotCaption(textItems, currentIndex, contentType, contentNumber) {
    const currentItem = textItems[currentIndex];
    if (!currentItem.transform) return false;
    
    const currentY = currentItem.transform[5];
    const currentX = currentItem.transform[4];
    
    // Look at surrounding context (both before and after)
    const contextRange = 10;
    let contextText = '';
    
    // Collect text from surrounding items on the same line/paragraph
    for (let i = Math.max(0, currentIndex - contextRange); i <= Math.min(textItems.length - 1, currentIndex + contextRange); i++) {
        const item = textItems[i];
        if (!item.transform) continue;
        
        const itemY = item.transform[5];
        // Only include text from roughly the same line (within 20 pixels vertically)
        if (Math.abs(itemY - currentY) <= 20) {
            contextText += ' ' + item.str;
        }
    }
    
    contextText = contextText.toLowerCase().trim();
    console.log('*** CONTEXT TEXT:', contextText);
    
    // Citation indicators - phrases that suggest this is referencing a figure, not defining one
    const citationIndicators = [
        'see figure', 'see fig', 'in figure', 'in fig', 'shown in figure', 'shown in fig',
        'as shown', 'as seen', 'depicted in', 'illustrated in', 'presented in',
        'refer to', 'according to', 'based on', 'from figure', 'from fig',
        'see table', 'in table', 'shown in table', 'from table',
        'see algorithm', 'in algorithm', 'see equation', 'in equation',
        'see appendix', 'in appendix', 'see section', 'in section'
    ];
    
    // Check if any citation indicators are present
    for (const indicator of citationIndicators) {
        if (contextText.includes(indicator)) {
            console.log('*** CITATION INDICATOR FOUND:', indicator);
            return true;
        }
    }
    
    // Check for parenthetical references - often citations
    const figureRef = `${contentType} ${contentNumber}`;
    const figRefPattern = new RegExp(`\\(.*${contentType}.*${contentNumber}.*\\)`, 'i');
    if (figRefPattern.test(contextText)) {
        console.log('*** PARENTHETICAL REFERENCE DETECTED');
        return true;
    }
    
    // Check if the reference appears mid-sentence (likely a citation)
    // Captions usually start at the beginning of a line or after significant whitespace
    let beforeText = '';
    for (let i = Math.max(0, currentIndex - 5); i < currentIndex; i++) {
        const item = textItems[i];
        if (!item.transform) continue;
        const itemY = item.transform[5];
        if (Math.abs(itemY - currentY) <= 10) { // Same line
            beforeText += ' ' + item.str;
        }
    }
    
    // If there's substantial text before the figure reference on the same line, it's likely a citation
    if (beforeText.trim().length > 20 && !beforeText.trim().match(/^\s*$/)) {
        // Check if it doesn't end with a period (which would suggest start of new sentence)
        if (!beforeText.trim().endsWith('.') && !beforeText.trim().endsWith(':')) {
            console.log('*** MID-SENTENCE REFERENCE DETECTED');
            return true;
        }
    }
    
    // Additional heuristic: Check font size or positioning
    // Captions are often in smaller font or positioned differently than body text
    // This is harder to detect reliably in PDF.js text extraction
    
    console.log('*** APPEARS TO BE ACTUAL CAPTION');
    return false;
}

// LaTeX-based figure lookup functions
function findFigureInLatexData(dest, pageNum) {
    if (!window.latexData || !window.latexData.figure_mapping) {
        return null;
    }
    
    console.log('🔍 Searching LaTeX figures on page:', pageNum);
    
    // Try to find any figure on this page or just return a figure for demonstration
    for (const [label, mapping] of Object.entries(window.latexData.figure_mapping)) {
        const figure = mapping.figure;
        
        console.log('📊 Found LaTeX figure:', label, 'type:', figure.figure_type);
        return {
            label: label,
            figure: figure,
            references: mapping.references
        };
    }
    
    // If no figure mapping, check direct figures
    if (window.latexData.figures) {
        const firstFigure = Object.entries(window.latexData.figures)[0];
        if (firstFigure) {
            const [label, figure] = firstFigure;
            console.log('📊 Using first available figure:', label);
            return {
                label: label,
                figure: figure,
                references: []
            };
        }
    }
    
    return null;
}