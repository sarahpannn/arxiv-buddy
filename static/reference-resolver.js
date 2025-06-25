// Reference resolution and destination handling

// Function to find and display reference for internal links
window.findAndDisplayReference = async function(annotation, pdf, citingLastName) {
    try {
        const dest = annotation.dest;
        console.log('Citation clicked - destination:', dest);
        
        if (dest && dest.length > 0) {
            // Get all destinations from the PDF
            const destinations = await pdf.getDestinations();
            console.log('Available destinations:', Object.keys(destinations));
            
            let targetDestination = null;
            
            // If dest[0] is a string (named destination), look it up
            if (typeof dest === 'string') {
                const destName = dest;
                console.log('Looking up named destination:', destName);
                targetDestination = destinations[destName];
                console.log('Found named destination:', targetDestination);
            } else {
                // Use the destination array directly
                targetDestination = dest;
                console.log('Using direct destination array:', targetDestination);
            }
            
            if (targetDestination && targetDestination.length > 0) {
                // Find the destination page
                const destPageNum = await findDestinationPageFromArray(targetDestination, pdf);
                
                if (destPageNum) {
                    console.log(`Following link to page ${destPageNum}`);
                    
                    // Get the destination page content
                    const page = await pdf.getPage(destPageNum);
                    const textContent = await page.getTextContent();
                    
                    // Check if this is a figure reference by analyzing the destination content
                    const figureInfo = await detectFigureAtDestination(textContent, targetDestination, page, pdf, destPageNum);
                    
                    if (figureInfo) {
                        console.log('Detected figure reference:', figureInfo);
                        window.displayFigureInfo(figureInfo);
                    } else {
                        // Show immediate feedback for non-figure references
                        window.displayReferenceInfo(
                            `Following Citation Link...`,
                            `Navigating to page ${destPageNum} to find the reference text...`,
                            'Following the internal PDF link using pdf.getDestinations().'
                        );
                        
                        // Extract the actual reference text from the destination location
                        const referenceText = await extractReferenceAtDestination(textContent, targetDestination, page, citingLastName);
                        
                        if (referenceText && referenceText.length > 20) {
                            console.log('Found reference text:', referenceText.substring(0, 100) + '...');
                            window.displayReferenceInfo(
                                `Reference (Page ${destPageNum})`,
                                referenceText,
                                'Found by following the citation link to the bibliography.'
                            );
                        } else {
                            console.log('Could not extract specific reference, showing page content');
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
        console.log('Finding page from destination array:', dest);
        
        // The destination format can vary, but usually the first element is the page reference
        if (dest[0] && typeof dest[0] === 'object' && dest[0].num) {
            // Page reference object
            console.log('Using page reference object:', dest[0]);
            const pageRef = dest[0];
            const pageIndex = await pdf.getPageIndex(pageRef);
            console.log('Page index found:', pageIndex);
            return pageIndex + 1; // Convert 0-based to 1-based
        } else if (typeof dest[0] === 'number') {
            // Direct page number
            console.log('Using direct page number:', dest[0]);
            return dest[0];
        } else if (typeof dest[0] === 'string') {
            // Named destination - should have been resolved already
            console.log('Unexpected string destination in array:', dest[0]);
            return null;
        }
        
        console.log('Could not determine page from destination array');
    } catch (error) {
        console.error('Error finding destination page from array:', error);
    }
    return null;
}

// Function to detect if destination is a figure and extract figure information
async function detectFigureAtDestination(textContent, dest, page, pdf, pageNum) {
    try {
        console.log('=== FIGURE DETECTION DEBUG ===');
        console.log('Page:', pageNum);
        console.log('Destination:', dest);
        
        const textItems = textContent.items;
        console.log('Total text items on page:', textItems.length);
        
        // Get destination coordinates if available
        let targetY = null;
        if (dest.length > 2 && typeof dest[2] === 'number') {
            targetY = dest[2];
            console.log('Target Y coordinate:', targetY);
        }
        
        // First, let's see ALL text on the page for debugging
        console.log('--- ALL TEXT ON PAGE ---');
        const allPageText = textItems.map(item => item.str).join(' ');
        console.log('Page text preview:', allPageText.substring(0, 300) + '...');
        
        // Look for ANY figure-related text on the entire page (more permissive)
        let figureNumber = '';
        let figureCaption = '';
        let foundFigure = false;
        
        for (let i = 0; i < textItems.length; i++) {
            const item = textItems[i];
            const text = item.str.trim();
            const lowerText = text.toLowerCase();
            
            console.log(`Checking text item ${i}: "${text}"`);
            
            // Look for figure indicators with various patterns
            if (lowerText.includes('figure') || lowerText.includes('fig.') || lowerText.includes('fig ')) {
                console.log('*** FOUND FIGURE TEXT:', text);
                
                // Try multiple regex patterns to match figure references
                const patterns = [
                    /(?:Figure|Fig\.?)\s*(\d+)[:\.]?\s*(.*)/i,
                    /(?:Figure|Fig\.?)\s*(\d+)/i,
                    /Fig\.\s*(\d+)/i,
                    /Figure\s*(\d+)/i
                ];
                
                for (const pattern of patterns) {
                    const figMatch = text.match(pattern);
                    if (figMatch) {
                        console.log('*** PATTERN MATCHED:', pattern, figMatch);
                        figureNumber = figMatch[1];
                        figureCaption = figMatch[2] || '';
                        foundFigure = true;
                        
                        // Collect caption text from surrounding items
                        const startIdx = Math.max(0, i - 5);
                        const endIdx = Math.min(textItems.length, i + 15);
                        
                        let contextText = '';
                        for (let j = startIdx; j <= endIdx; j++) {
                            if (j !== i) {
                                contextText += ' ' + textItems[j].str;
                            }
                        }
                        
                        figureCaption = (figureCaption + ' ' + contextText).trim();
                        if (figureCaption.length > 500) {
                            figureCaption = figureCaption.substring(0, 500) + '...';
                        }
                        
                        break;
                    }
                }
                
                if (foundFigure) break;
            }
        }
        
        if (foundFigure) {
            console.log('*** FIGURE DETECTED ***');
            console.log('Number:', figureNumber);
            console.log('Caption:', figureCaption);
            
            const figureArea = await extractFigureArea(page, targetY);
            
            return {
                type: 'figure',
                number: figureNumber,
                caption: figureCaption,
                pageNumber: pageNum,
                area: figureArea
            };
        }
        
        console.log('--- NO FIGURE DETECTED ---');
        return null;
    } catch (error) {
        console.error('Error detecting figure at destination:', error);
        return null;
    }
}

// Function to extract figure area information (simplified)
async function extractFigureArea(page, targetY) {
    try {
        // This is a simplified approach - in a full implementation,
        // you would analyze the page's drawing operations or images
        const viewport = page.getViewport({ scale: 1.0 });
        
        // Estimate figure area based on common academic paper layouts
        const estimatedHeight = 200; // Approximate figure height
        const estimatedWidth = 400;  // Approximate figure width
        
        return {
            x: 50,
            y: targetY ? targetY - estimatedHeight / 2 : viewport.height / 2,
            width: estimatedWidth,
            height: estimatedHeight
        };
    } catch (error) {
        console.error('Error extracting figure area:', error);
        return null;
    }
}

// Function to display figure information in the right panel
window.displayFigureInfo = function(figureInfo) {
    console.log('=== DISPLAYING FIGURE INFO ===');
    console.log('Figure info received:', figureInfo);
    
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
                    <div style="width: 100%; height: 200px; background: #e9ecef; border-radius: 4px; display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
                        <div style="text-align: center; color: #6c757d; font-size: 14px;">
                            📊 Figure Preview<br>
                            <small>(Image extraction not yet implemented)</small>
                        </div>
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
                    <strong>💡 Note:</strong> Figure detection is based on text analysis. Image extraction and enhanced preview features are coming soon.
                </div>
            </div>
        `;
        
        console.log('Setting innerHTML...');
        rightPane.innerHTML = html;
        console.log('Figure info display completed successfully');
        
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

// Test function to manually test figure display
window.testFigureDisplay = function() {
    console.log('Testing figure display...');
    const testFigureInfo = {
        type: 'figure',
        number: '1',
        caption: 'This is a test figure caption to verify the UI is working correctly.',
        pageNumber: 1,
        area: { x: 0, y: 0, width: 400, height: 200 }
    };
    window.displayFigureInfo(testFigureInfo);
}

// Function to extract reference text at a specific destination
async function extractReferenceAtDestination(textContent, dest, page, citingLastName) {
    try {
        const textItems = textContent.items;

        // Get destination coordinates if available
        let targetY = null;
        if (dest.length > 2 && typeof dest[2] === 'number') {
            targetY = dest[2]; // Y coordinate of destination
            console.log('Target Y coordinate:', targetY);
        }

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
                console.log('Found reference starter:', text, 'at Y:', item.transform[5]);

                let isNearTarget = true;
                if (targetY !== null && item.transform && item.transform[5]) {
                    const itemY = item.transform[5];
                    const distance = Math.abs(itemY - targetY);
                    isNearTarget = distance < 50;
                    console.log(`Y distance: ${distance}, near target: ${isNearTarget}`);
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
                        return ref.text;
                    }
                }
            }
            candidateRefs.sort((a, b) => a.distance - b.distance);
            console.log('Found', candidateRefs.length, 'candidate references, using closest');
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