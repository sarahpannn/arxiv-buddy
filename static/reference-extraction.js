// Reference extraction functionality

// Function to extract reference text at a specific destination
window.extractReferenceAtDestination = async function(textContent, dest, page, citingLastName) {
    try {
        const textItems = textContent.items;
        let targetY = null;
        if (dest[1] === 'XYZ' && dest.length > 3 && typeof dest[3] === 'number') {
            targetY = dest[3];
        } else if (dest[1] && dest[1].name === 'XYZ' && dest.length > 3 && typeof dest[3] === 'number') {
            targetY = dest[3];
        }

        if (targetY !== null) {
            // Sort text items by Y (PDF space: higher Y is higher on page)
            const itemsSorted = textItems.slice().sort((a, b) => b.transform[5] - a.transform[5]);
            // Find the first item below the Y coordinate
            let startIndex = -1;
            for (let i = 0; i < itemsSorted.length; i++) {
                const item = itemsSorted[i];
                if (!item.transform) continue;
                const itemY = item.transform[5];
                if (itemY < targetY) {
                    startIndex = i;
                    break;
                }
            }
            if (startIndex !== -1) {
                // Collect lines until a big line spacing jump is detected
                let refLines = [itemsSorted[startIndex].str];
                let prevY = itemsSorted[startIndex].transform[5];
                let spacings = [];
                for (let j = startIndex + 1; j < itemsSorted.length; j++) {
                    const item = itemsSorted[j];
                    if (!item.transform) break;
                    const currY = item.transform[5];
                    const spacing = Math.abs(currY - prevY);
                    if (spacing > 0) spacings.push(spacing);
                    // Compute average spacing so far
                    const avgSpacing = spacings.length > 0 ? spacings.reduce((a, b) => a + b, 0) / spacings.length : 0;
                    // If this spacing is much larger than average, stop
                    if (avgSpacing > 0 && spacing > 2 * avgSpacing) break;
                    refLines.push(item.str);
                    prevY = currY;
                }
                const refText = refLines.join(' ').trim();
                if (refText.length > 20) {
                    return refText;
                }
            }
        }
        // --- Fallback: previous number-based logic ---
        let candidateRefs = [];
        for (let i = 0; i < textItems.length; i++) {
            const item = textItems[i];
            const text = item.str;
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
            if (candidateRefs.length > 0) {
                return candidateRefs[0].text;
            }
        }
        // Final fallback: return best reference-like text on the page
        return findBestReferenceOnPage(textContent, citingLastName);
    } catch (error) {
        console.error('Error extracting reference at destination:', error);
        return null;
    }
};

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
window.extractAllReferencesFromPage = function(textContent) {
    const textItems = textContent.items;
    let allText = '';
    
    // Concatenate all text to see what's on the page
    for (let i = 0; i < textItems.length; i++) {
        const item = textItems[i];
        allText += item.str + ' ';
        if (allText.length > 3000) break; // Limit output
    }
    
    return allText.trim() || 'No text found on this page.';
};

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