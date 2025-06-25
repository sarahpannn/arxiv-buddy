// Reference resolution and destination handling

// Function to find and display reference for internal links
window.findAndDisplayReference = async function(annotation, pdf, citingLastName) {
    try {
        const dest = annotation.dest;
        
        if (dest && dest.length > 0) {
            // Get all destinations from the PDF
            const destinations = await pdf.getDestinations();
            
            let targetDestination = null;
            
            // If dest[0] is a string (named destination), look it up
            if (typeof dest === 'string') {
                const destName = dest;
                targetDestination = destinations[destName];
            } else {
                // Use the destination array directly
                targetDestination = dest;
            }
            
            if (targetDestination && targetDestination.length > 0) {
                // Find the destination page
                const destPageNum = await findDestinationPageFromArray(targetDestination, pdf);
                
                if (destPageNum) {
                    // Get the destination page content
                    const page = await pdf.getPage(destPageNum);
                    const textContent = await page.getTextContent();
                    
                    console.log('📍 CITATION TRACKING:');
                    console.log('  Destination page:', destPageNum);
                    console.log('  Link destination coords (PDF space):', targetDestination);
                    
                    // Check if this is a figure reference by analyzing the destination content
                    const figureInfo = await detectFigureAtDestination(textContent, targetDestination, page, pdf, destPageNum);
                    
                    if (figureInfo) {
                        window.displayFigureInfo(figureInfo);
                    } else {
                        // Extract the actual reference text from the destination location
                        const referenceText = await extractReferenceAtDestination(textContent, targetDestination, page, citingLastName);
                        
                        if (referenceText && referenceText.length > 20) {
                            window.displayReferenceInfo(
                                `Reference (Page ${destPageNum})`,
                                referenceText,
                                'Found by following the citation link to the bibliography.'
                            );
                        } else {
                            const allRefs = extractAllReferencesFromPage(textContent);
                            window.displayReferenceInfo(
                                `References Page ${destPageNum}`,
                                allRefs,
                                'Located the references page but could not isolate the specific reference.'
                            );
                        }
                    }
                } else {
                    console.log('Could not find destination page from array:', targetDestination);
                    window.displayReferenceInfo(
                        'Citation Link Error',
                        `Destination array: ${JSON.stringify(targetDestination)}`,
                        'Could not locate the destination page for this citation link.'
                    );
                }
            } else {
                console.log('Could not resolve destination');
                window.displayReferenceInfo(
                    'Citation Link Error',
                    `Original dest: ${JSON.stringify(dest)}`,
                    'Could not resolve the destination for this citation link.'
                );
            }
        } else {
            console.log('No destination found in annotation');
            window.displayReferenceInfo(
                'Citation Error',
                'This citation does not contain a valid internal link destination.',
                'The PDF annotation is missing destination information.'
            );
        }
    } catch (error) {
        console.error('Error following citation link:', error);
        window.displayReferenceInfo(
            'Citation Link Error',
            error.message || 'Unknown error',
            'There was an error trying to follow the citation link.'
        );
    }
}

// Function to find destination page from PDF destination array (improved)
async function findDestinationPageFromArray(dest, pdf) {
    try {
        // The destination format can vary, but usually the first element is the page reference
        if (dest[0] && typeof dest[0] === 'object' && dest[0].num) {
            // Page reference object
            const pageRef = dest[0];
            const pageIndex = await pdf.getPageIndex(pageRef);
            return pageIndex + 1; // Convert 0-based to 1-based
        } else if (typeof dest[0] === 'number') {
            // Direct page number
            return dest[0];
        } else if (typeof dest[0] === 'string') {
            // Named destination - should have been resolved already
            return null;
        }
    } catch (error) {
        console.error('Error finding destination page from array:', error);
    }
    return null;
}

// Function to detect if destination is content (figure, table, algorithm, equation, appendix) and extract information
async function detectFigureAtDestination(textContent, dest, page, pdf, pageNum) {
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
}

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

// Function to extract images from a PDF page
async function extractImagesFromPage(page) {
    try {
        const images = [];
        
        // Get the operator list which contains all drawing operations
        const operatorList = await page.getOperatorList();
        const ops = operatorList.fnArray;
        const args = operatorList.argsArray;
        
        console.log('Page has', ops.length, 'drawing operations');
        
        // Look for image operations
        for (let i = 0; i < ops.length; i++) {
            const op = ops[i];
            const arg = args[i];
            
            // PDF.js operation codes for images
            if (op === pdfjsLib.OPS.paintImageXObject || op === pdfjsLib.OPS.paintInlineImageXObject) {
                console.log('Found image operation:', op, arg);
                
                try {
                    // Get the image object
                    const imgName = arg[0];
                    
                    // Access the image from page objects
                    let imgObj = null;
                    if (page.objs.has(imgName)) {
                        imgObj = await new Promise((resolve) => {
                            page.objs.get(imgName, resolve);
                        });
                    } else if (page.commonObjs.has(imgName)) {
                        imgObj = await new Promise((resolve) => {
                            page.commonObjs.get(imgName, resolve);
                        });
                    }
                    
                    if (imgObj) {
                        console.log('Retrieved image object:', imgObj);
                        
                        // Convert image to data URL
                        console.log('Converting image to data URL...');
                        const dataUrl = await convertImageToDataUrl(imgObj);
                        console.log('Conversion result:', dataUrl ? 'Success' : 'Failed', dataUrl ? dataUrl.substring(0, 50) + '...' : 'null');
                        
                        // Try to get transform matrix for positioning
                        let x = 0, y = 0, width = 100, height = 100;
                        
                        // Look for transform operations before this image
                        for (let j = Math.max(0, i - 5); j < i; j++) {
                            if (ops[j] === pdfjsLib.OPS.transform) {
                                const transform = args[j];
                                x = transform[4] || 0;
                                y = transform[5] || 0;
                                width = Math.abs(transform[0]) || width;
                                height = Math.abs(transform[3]) || height;
                                break;
                            }
                        }
                        
                        images.push({
                            dataUrl,
                            x,
                            y,
                            width,
                            height,
                            name: imgName
                        });
                    }
                } catch (imgError) {
                    console.warn('Error processing image:', imgError);
                }
            }
        }
        
        return images;
    } catch (error) {
        console.error('Error extracting images from page:', error);
        return [];
    }
}

// Function to convert PDF.js image object to data URL
async function convertImageToDataUrl(imgObj) {
    try {
        if (imgObj instanceof HTMLImageElement) {
            // If it's already an image element
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = imgObj.width;
            canvas.height = imgObj.height;
            ctx.drawImage(imgObj, 0, 0);
            return canvas.toDataURL();
        } else if (imgObj instanceof HTMLCanvasElement) {
            // If it's a canvas
            return imgObj.toDataURL();
        } else if (imgObj && imgObj.data) {
            // If it's image data, create a canvas
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = imgObj.width || 100;
            canvas.height = imgObj.height || 100;
            
            // Create ImageData and put it on canvas
            const imageData = new ImageData(imgObj.data, canvas.width, canvas.height);
            ctx.putImageData(imageData, 0, 0);
            return canvas.toDataURL();
        }
        
        return null;
    } catch (error) {
        console.error('Error converting image to data URL:', error);
        return null;
    }
}


// Function to identify figure areas based on text content analysis
async function identifyFigureAreasFromText(textContent, canvas, targetY) {
    try {
        const regions = [];
        const textItems = textContent.items;
        
        // Look for figure captions and estimate figure locations
        for (let i = 0; i < textItems.length; i++) {
            const item = textItems[i];
            const text = item.str.toLowerCase();
            
            if (text.includes('figure') || text.includes('fig.')) {
                console.log('Found figure text for region detection:', item.str);
                
                // Estimate figure location based on caption position
                const transform = item.transform;
                if (transform) {
                    const textY = transform[5];
                    const textX = transform[4];
                    
                    // Estimate figure area (typically above or below caption) - made larger
                    const figureHeight = 600; // Increased figure height
                    const figureWidth = 800;  // Increased figure width
                    
                    // Try both above and below the caption
                    const figureY = textY - figureHeight - 20; // Assume figure is above caption
                    
                    regions.push({
                        x: Math.max(0, textX - 50),
                        y: Math.max(0, figureY),
                        width: Math.min(figureWidth, canvas.width - textX + 50),
                        height: Math.min(figureHeight, canvas.height - figureY),
                        confidence: 0.7,
                        source: 'text-analysis'
                    });
                }
            }
        }
        
        return regions;
        
    } catch (error) {
        console.error('Error identifying figure areas from text:', error);
        return [];
    }
}

// Function to get a smart crop region when no specific figures are detected
function getSmartCropRegion(canvas, targetY, scale) {
    const width = canvas.width;
    const height = canvas.height;
    
    if (targetY !== null) {
        // Use target Y coordinate to guide cropping - made much larger
        const scaledTargetY = targetY * scale;
        const cropHeight = Math.min(800 * scale, height * 0.8); // Use 80% of page height max
        const cropWidth = Math.min(1000 * scale, width * 0.9);  // Use 90% of page width max
        
        const cropY = Math.max(0, Math.min(scaledTargetY - cropHeight/2, height - cropHeight));
        const cropX = Math.max(0, (width - cropWidth) / 2); // Center horizontally
        
        const result = {
            x: cropX,
            y: cropY,
            width: cropWidth,
            height: cropHeight
        };
        console.log('Smart crop calculation:', {
            canvasSize: `${width}x${height}`,
            targetY: targetY,
            scaledTargetY: scaledTargetY,
            cropRegion: result,
            percentages: `${(cropWidth/width*100).toFixed(1)}% x ${(cropHeight/height*100).toFixed(1)}%`
        });
        return result;
    } else {
        // Default: crop the middle portion of the page - made much larger
        const cropHeight = Math.min(800 * scale, height * 0.7);
        const cropWidth = Math.min(1000 * scale, width * 0.85);
        
        return {
            x: (width - cropWidth) / 2,
            y: (height - cropHeight) / 2,
            width: cropWidth,
            height: cropHeight
        };
    }
}

// Function to display figure information in the right panel
window.displayFigureInfo = function(figureInfo) {
    console.log('=== DISPLAYING FIGURE INFO ===');
    console.log('Figure info received:', figureInfo);
    console.log('Figure info area:', figureInfo.area);
    console.log('Has imageDataUrl:', !!(figureInfo.area && figureInfo.area.imageDataUrl));
    if (figureInfo.area && figureInfo.area.imageDataUrl) {
        console.log('Image data URL preview:', figureInfo.area.imageDataUrl.substring(0, 50) + '...');
    }
    
    const rightPane = document.getElementById('info-pane');
    console.log('Right pane element:', rightPane);
    
    if (!rightPane) {
        console.error('Could not find info-pane element!');
        return;
    }
    
    try {
        const html = `
            <div style="padding: 20px; font-family: Arial, sans-serif;">
                <h3 style="margin: 0 0 15px 0; color: #333; border-bottom: 2px solid #007acc; padding-bottom: 10px;">
                    Figure ${figureInfo.number || 'Unknown'}
                </h3>
                
                <div style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                    <div style="position: relative;">
                        <div style="width: 100%; height: 400px; background: #e9ecef; border-radius: 4px; margin-bottom: 10px; overflow: auto; border: 2px solid #ddd; position: relative;" 
                             id="figure-container-${figureInfo.number || 'unknown'}">
                            ${figureInfo.area && figureInfo.area.imageDataUrl ? 
                                `<img src="${figureInfo.area.imageDataUrl}" 
                                      id="figure-image-${figureInfo.number || 'unknown'}"
                                      style="display: block; max-width: none; height: auto; min-width: 100%; transform-origin: top left; transition: transform 0.2s ease;" 
                                      alt="Figure ${figureInfo.number || 'Unknown'}" 
                                      title="Pinch to zoom, scroll to pan" />` :
                                `<div style="display: flex; align-items: center; justify-content: center; height: 100%; text-align: center; color: #6c757d; font-size: 14px;">
                                    📊 Figure Preview<br>
                                    <small>(No image found or extraction failed)</small>
                                 </div>`
                            }
                        </div>
                        ${figureInfo.area && figureInfo.area.imageDataUrl ? 
                            `<div style="display: flex; gap: 5px; align-items: center; margin-bottom: 5px;">
                                <button onclick="window.zoomFigure('${figureInfo.number || 'unknown'}', 0.8)" 
                                        style="background: #6c757d; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">
                                    🔍−
                                </button>
                                <button onclick="window.zoomFigure('${figureInfo.number || 'unknown'}', 1.25)" 
                                        style="background: #6c757d; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">
                                    🔍+
                                </button>
                                <button onclick="window.resetFigureZoom('${figureInfo.number || 'unknown'}')" 
                                        style="background: #007acc; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">
                                    Reset
                                </button>
                                <span style="font-size: 11px; color: #666; margin-left: 10px;">
                                    Pinch to zoom • Scroll to pan
                                </span>
                            </div>` : ''
                        }
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <strong style="color: #495057;">Caption:</strong>
                        <p style="margin: 5px 0 0 0; color: #6c757d; line-height: 1.4;">
                            ${figureInfo.caption || 'No caption found'}
                        </p>
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <strong style="color: #495057;">Location:</strong>
                        <span style="color: #6c757d; margin-left: 10px;">Page ${figureInfo.pageNumber}</span>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <strong style="color: #495057;">Referenced from:</strong>
                        <span style="color: #6c757d; margin-left: 10px;">Current location</span>
                    </div>
                    
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="window.jumpToFigure(${figureInfo.pageNumber})" 
                                style="background: #007acc; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px;">
                            Jump to Figure
                        </button>
                        <button onclick="window.viewFullSize('${figureInfo.number}')" 
                                style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px;">
                            View Full Size
                        </button>
                    </div>
                </div>
                
                <div style="background: #e8f4fd; border: 1px solid #bee5eb; border-radius: 4px; padding: 10px; font-size: 12px; color: #0c5460;">
                    <strong>💡 Note:</strong> Figure extracted from PDF page. Use scrollbars to view the complete image if it extends beyond the preview area.
                </div>
            </div>
        `;
        
        console.log('Setting innerHTML...');
        rightPane.innerHTML = html;
        console.log('Figure info display completed successfully');
        
        // Set up zoom functionality after the HTML is inserted
        if (figureInfo.area && figureInfo.area.imageDataUrl) {
            setupFigureZoom(figureInfo.number || 'unknown');
        }
        
    } catch (error) {
        console.error('Error setting figure info HTML:', error);
        rightPane.innerHTML = `
            <div style="padding: 20px; color: red;">
                <h3>Error displaying figure</h3>
                <p>There was an error displaying the figure information.</p>
                <pre>${error.message}</pre>
            </div>
        `;
    }
}

// Function to jump to figure location
window.jumpToFigure = function(pageNumber) {
    const targetCanvas = document.getElementById(`pdf-canvas-${pageNumber}`);
    if (targetCanvas) {
        targetCanvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Add temporary highlight effect
        const originalBorder = targetCanvas.style.border;
        targetCanvas.style.border = '3px solid #007acc';
        setTimeout(() => {
            targetCanvas.style.border = originalBorder;
        }, 2000);
    }
}

// Function to view full size (placeholder)
window.viewFullSize = function(figureNumber) {
    alert(`Full size view for Figure ${figureNumber} - Coming soon!`);
}

// Zoom functionality for figure images
let figureZoomStates = {};

window.zoomFigure = function(figureId, factor) {
    const img = document.getElementById(`figure-image-${figureId}`);
    if (!img) return;
    
    if (!figureZoomStates[figureId]) {
        figureZoomStates[figureId] = { scale: 1 };
    }
    
    figureZoomStates[figureId].scale *= factor;
    
    // Limit zoom range
    figureZoomStates[figureId].scale = Math.max(0.1, Math.min(5, figureZoomStates[figureId].scale));
    
    img.style.transform = `scale(${figureZoomStates[figureId].scale})`;
}

window.resetFigureZoom = function(figureId) {
    const img = document.getElementById(`figure-image-${figureId}`);
    if (!img) return;
    
    figureZoomStates[figureId] = { scale: 1 };
    img.style.transform = 'scale(1)';
}

function setupFigureZoom(figureId) {
    const container = document.getElementById(`figure-container-${figureId}`);
    const img = document.getElementById(`figure-image-${figureId}`);
    
    if (!container || !img) return;
    
    // Initialize zoom state
    figureZoomStates[figureId] = { scale: 1 };
    
    // Touch zoom variables
    let initialDistance = 0;
    let initialScale = 1;
    let isZooming = false;
    
    // Touch start handler
    container.addEventListener('touchstart', function(e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            isZooming = true;
            
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            initialDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            initialScale = figureZoomStates[figureId].scale;
        }
    }, { passive: false });
    
    // Touch move handler (pinch zoom)
    container.addEventListener('touchmove', function(e) {
        if (e.touches.length === 2 && isZooming) {
            e.preventDefault();
            
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const currentDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            
            const scale = initialScale * (currentDistance / initialDistance);
            
            // Limit zoom range
            figureZoomStates[figureId].scale = Math.max(0.1, Math.min(5, scale));
            img.style.transform = `scale(${figureZoomStates[figureId].scale})`;
        }
    }, { passive: false });
    
    // Touch end handler
    container.addEventListener('touchend', function(e) {
        if (e.touches.length < 2) {
            isZooming = false;
        }
    });
    
    // Mouse wheel zoom (for desktop)
    container.addEventListener('wheel', function(e) {
        if (e.ctrlKey) {
            e.preventDefault();
            
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            window.zoomFigure(figureId, factor);
        }
    }, { passive: false });
}

// Test function to manually test figure display
window.testFigureDisplay = function() {
    console.log('Testing figure display...');
    const testFigureInfo = {
        type: 'figure',
        number: '1',
        caption: 'This is a test figure caption to verify the UI is working correctly.',
        pageNumber: 1,
        area: { 
            x: 0, 
            y: 0, 
            width: 400, 
            height: 200,
            imageDataUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzMzMyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkZha2UgRmlndXJlPC90ZXh0Pjwvc3ZnPg=='
        }
    };
    window.displayFigureInfo(testFigureInfo);
}

// Test function to open extracted image in new window
window.openExtractedImage = function(dataUrl) {
    if (dataUrl) {
        const newWindow = window.open('');
        newWindow.document.write(`
            <html>
                <head><title>Extracted Figure</title></head>
                <body style="margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f0f0f0;">
                    <img src="${dataUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
                </body>
            </html>
        `);
    } else {
        alert('No image data available');
    }
}

// Test function to manually test canvas extraction on current page
window.testCanvasExtraction = async function(pageNum = 1) {
    try {
        console.log('Testing canvas extraction on page', pageNum);
        
        // Get the current PDF from global scope (you might need to adjust this)
        const canvas = document.getElementById(`pdf-canvas-${pageNum}`);
        if (!canvas) {
            console.error('Could not find canvas for page', pageNum);
            return;
        }
        
        // Create test canvas and copy from existing canvas
        const testCanvas = document.createElement('canvas');
        const testCtx = testCanvas.getContext('2d');
        testCanvas.width = canvas.width;
        testCanvas.height = canvas.height;
        testCtx.drawImage(canvas, 0, 0);
        
        const dataUrl = testCanvas.toDataURL();
        console.log('Test canvas extraction result:', dataUrl ? 'Success' : 'Failed');
        console.log('Data URL length:', dataUrl.length);
        console.log('Data URL preview:', dataUrl.substring(0, 50) + '...');
        
        // Display it in a test figure
        const testFigureInfo = {
            type: 'figure',
            number: 'Test',
            caption: 'Test extracted from existing canvas on page ' + pageNum,
            pageNumber: pageNum,
            area: { 
                x: 0, 
                y: 0, 
                width: 400, 
                height: 300,
                imageDataUrl: dataUrl
            }
        };
        window.displayFigureInfo(testFigureInfo);
        
    } catch (error) {
        console.error('Error testing canvas extraction:', error);
    }
}

// Function to extract reference text at a specific destination
async function extractReferenceAtDestination(textContent, dest, page, citingLastName) {
    try {
        const textItems = textContent.items;

        // Get destination coordinates if available
        let targetY = null;
        console.log('  Destination array analysis:');
        console.log('    Length:', dest.length);
        console.log('    [0] (page ref):', dest[0]);
        console.log('    [1] (type):', dest[1]);
        console.log('    [2] (X coord):', dest[2]);
        console.log('    [3] (Y coord):', dest[3]);
        console.log('    [4] (zoom):', dest[4]);
        
        if (dest[1] === 'XYZ' && dest.length > 3 && typeof dest[3] === 'number') {
            targetY = dest[3];
            console.log('  Using Y from position [3]:', targetY);
        } else if (dest[1] && dest[1].name === 'XYZ' && dest.length > 3 && typeof dest[3] === 'number') {
            targetY = dest[3];
            console.log('  Using Y from position [3] (object format):', targetY);
        } else {
            console.log('  No valid Y coordinate found in destination');
        }

        console.log('  Final Target Y coordinate (PDF space):', targetY);

        // --- New heuristic ---
        if (targetY !== null) {
            // Find the text item closest to the target Y position
            let closestIndex = -1;
            let closestDist = Infinity;

            for (let i = 0; i < textItems.length; i++) {
                const item = textItems[i];
                if (!item.transform) continue;
                const itemY = item.transform[5];
                const dist = Math.abs(itemY - targetY);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestIndex = i;
                }
            }

            if (closestIndex !== -1 && closestDist < 60) {
                let refText = textItems[closestIndex].str;
                const baseY = textItems[closestIndex].transform[5];

                for (let j = closestIndex + 1; j < textItems.length; j++) {
                    const nextItem = textItems[j];
                    if (!nextItem.transform) break;

                    const nextY = nextItem.transform[5];
                    if (Math.abs(nextY - baseY) > 70) break;

                    refText += ' ' + nextItem.str;
                    if (refText.length > 800) break;
                }

                console.log('  Found text around coords:', refText.trim().substring(0, 100) + '...');
                
                // Check if this looks like an arXiv reference
                const arxivMatch = refText.match(/(arXiv:\d{4}\.\d{4,5}v?\d*)/i);
                if (arxivMatch) {
                    console.log('  🎯 ArXiv link found:', arxivMatch[1]);
                } else {
                    console.log('  ❌ No arXiv link detected in reference text');
                }

                if (refText.trim().length > 20) {
                    return refText.trim();
                }
            }
        }

        // --- Fallback: previous number-based logic ---
        let candidateRefs = [];

        for (let i = 0; i < textItems.length; i++) {
            const item = textItems[i];
            const text = item.str;

            // Look for reference number patterns
            if (text.match(/^\[\d+\]/) || text.match(/^\d+\./) || text.match(/^\(\d+\)/)) {
                let isNearTarget = true;
                if (targetY !== null && item.transform && item.transform[5]) {
                    const itemY = item.transform[5];
                    const distance = Math.abs(itemY - targetY);
                    isNearTarget = distance < 50;
                }

                if (isNearTarget) {
                    let fullRef = text;
                    for (let j = i + 1; j < Math.min(i + 50, textItems.length); j++) {
                        const nextItem = textItems[j];
                        const nextText = nextItem.str;

                        if (nextText.match(/^\[\d+\]/) || nextText.match(/^\d+\./) || nextText.match(/^\(\d+\)/)) {
                            break;
                        }

                        if (targetY !== null && nextItem.transform && nextItem.transform[5]) {
                            const nextY = nextItem.transform[5];
                            if (Math.abs(nextY - targetY) > 100) {
                                break;
                            }
                        }

                        fullRef += ' ' + nextText;
                        if (fullRef.length > 1000) break;
                    }

                    candidateRefs.push({
                        text: fullRef.trim(),
                        distance: targetY !== null && item.transform ? Math.abs(item.transform[5] - targetY) : 0
                    });
                }
            }
        }

        if (candidateRefs.length > 0) {
            if (citingLastName) {
                const lowerName = citingLastName.toLowerCase();
                for (const ref of candidateRefs) {
                    if (ref.text.toLowerCase().includes(lowerName)) {
                        console.log('  Found text around coords:', ref.text.substring(0, 100) + '...');
                        
                        // Check if this looks like an arXiv reference
                        const arxivMatch = ref.text.match(/(arXiv:\d{4}\.\d{4,5}v?\d*)/i);
                        if (arxivMatch) {
                            console.log('  🎯 ArXiv link found:', arxivMatch[1]);
                        } else {
                            console.log('  ❌ No arXiv link detected in reference text');
                        }
                        
                        return ref.text;
                    }
                }
            }
            candidateRefs.sort((a, b) => a.distance - b.distance);
            
            if (candidateRefs.length > 0) {
                console.log('  Found text around coords:', candidateRefs[0].text.substring(0, 100) + '...');
                
                // Check if this looks like an arXiv reference
                const arxivMatch = candidateRefs[0].text.match(/(arXiv:\d{4}\.\d{4,5}v?\d*)/i);
                if (arxivMatch) {
                    console.log('  🎯 ArXiv link found:', arxivMatch[1]);
                } else {
                    console.log('  ❌ No arXiv link detected in reference text');
                }
            }
            
            return candidateRefs[0].text;
        }

        // Final fallback: return best reference-like text on the page
        return findBestReferenceOnPage(textContent, citingLastName);

    } catch (error) {
        console.error('Error extracting reference at destination:', error);
        return null;
    }
}

// Function to find the best reference on a page (fallback)
function findBestReferenceOnPage(textContent, citingLastName) {
    const textItems = textContent.items;

    // Reconstruct lines based on Y position
    let lines = [];
    let currentLine = '';
    let lastY = null;

    for (let i = 0; i < textItems.length; i++) {
        const item = textItems[i];
        if (!item.transform) continue;
        const y = item.transform[5];

        if (lastY !== null && Math.abs(y - lastY) > 15) {
            if (currentLine.trim().length > 0) {
                lines.push(currentLine.trim());
            }
            currentLine = item.str;
        } else {
            currentLine += ' ' + item.str;
        }

        lastY = y;
    }

    if (currentLine.trim().length > 0) {
        lines.push(currentLine.trim());
    }

    if (citingLastName) {
        const lowerName = citingLastName.toLowerCase();
        for (const line of lines) {
            if (line.toLowerCase().includes(lowerName)) {
                return line;
            }
        }
    }

    lines.sort((a, b) => b.length - a.length);
    return lines[0] || 'Could not extract reference text from this page.';
}

// Function to extract all references from a page for debugging
function extractAllReferencesFromPage(textContent) {
    const textItems = textContent.items;
    let allText = '';
    
    // Concatenate all text to see what's on the page
    for (let i = 0; i < textItems.length; i++) {
        const item = textItems[i];
        allText += item.str + ' ';
        if (allText.length > 3000) break; // Limit output
    }
    
    return allText.trim() || 'No text found on this page.';
}

// Function to find reference by citation numbers
window.findReferenceByNumbers = async function(citationNumbers, pdf) {
    try {
        console.log('Looking for citation numbers:', citationNumbers);
        
        // Search through pages for references section
        const numPages = pdf.numPages;
        let foundReferences = [];
        
        // Usually references are in the last few pages
        const startPage = Math.max(1, numPages - 5);
        
        for (let pageNum = startPage; pageNum <= numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            // Look for reference patterns matching our citation numbers
            for (const citNum of citationNumbers) {
                const refText = findReferenceByNumber(textContent, citNum);
                if (refText) {
                    foundReferences.push(`[${citNum}] ${refText}`);
                }
            }
        }
        
        if (foundReferences.length > 0) {
            window.displayReferenceInfo(
                `References (${citationNumbers.join(', ')})`,
                foundReferences.join('\n\n'),
                'References found by searching for citation numbers in the document.'
            );
        } else {
            window.displayReferenceInfo(
                `Citation ${citationNumbers.join(', ')}`,
                'Reference text not found',
                'Could not locate the specific reference text for these citation numbers.'
            );
        }
        
    } catch (error) {
        console.error('Error finding references by numbers:', error);
        window.displayReferenceInfo(
            'Reference Search Error',
            'Unable to search for references',
            'There was an error trying to find references for these citations.'
        );
    }
}

// Function to find a specific reference by number in text content
function findReferenceByNumber(textContent, citationNumber) {
    const textItems = textContent.items;
    
    for (let i = 0; i < textItems.length; i++) {
        const item = textItems[i];
        const text = item.str;
        
        // Look for reference number patterns
        if (text === `[${citationNumber}]` || text === `${citationNumber}.` || text.startsWith(`[${citationNumber}]`)) {
            // Found the reference number, collect the following text
            let refText = '';
            for (let j = i + 1; j < Math.min(i + 30, textItems.length); j++) {
                const nextText = textItems[j].str;
                
                // Stop if we hit the next reference number
                if (nextText.match(/^\[\d+\]/) || nextText.match(/^\d+\./)) {
                    break;
                }
                
                refText += nextText + ' ';
                if (refText.length > 800) break; // Reasonable limit
            }
            
            return refText.trim();
        }
    }
    
    return null;
}