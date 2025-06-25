// Figure detection and display functionality

// Function to detect if destination is content (figure, table, algorithm, equation, appendix) and extract information
window.detectFigureAtDestination = async function(textContent, dest, page, pdf, pageNum) {
    try {
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