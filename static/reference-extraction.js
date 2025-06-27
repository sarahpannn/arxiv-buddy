// Reference extraction functionality

// Function to extract reference text at a specific destination
window.extractReferenceAtDestination = async function(textContent, dest, page, citingLastName, pdf = null) {
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
                let reachedPageEnd = false;
                
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
                    
                    // Check if we're at the last item on the page
                    if (j === itemsSorted.length - 1) {
                        reachedPageEnd = true;
                    }
                }
                
                let refText = refLines.join(' ').trim();
                
                console.log('🔍 CROSS-PAGE DEBUG: Initial reference text:', refText.substring(0, 200) + '...');
                console.log('🔍 CROSS-PAGE DEBUG: reachedPageEnd:', reachedPageEnd);
                console.log('🔍 CROSS-PAGE DEBUG: pdf available:', !!pdf);
                console.log('🔍 CROSS-PAGE DEBUG: text length:', refText.length);
                console.log('🔍 CROSS-PAGE DEBUG: ends with period:', !!refText.match(/\.\s*$/));
                console.log('🔍 CROSS-PAGE DEBUG: includes doi:', refText.includes('doi:'));
                
                // If the reference looks incomplete (doesn't end with period and no DOI),
                // try to continue on the next page
                if (pdf && refText.length > 20 && !refText.match(/\.\s*$/) && !refText.includes('doi:')) {
                    console.log('🔍 CROSS-PAGE DEBUG: Reference may continue on next page, checking...');
                    const continuationText = await getContinuationFromNextPage(page, pdf, refText);
                    if (continuationText) {
                        console.log('🔍 CROSS-PAGE DEBUG: Extended reference with next page content:', continuationText);
                        refText += ' ' + continuationText;
                    } else {
                        console.log('🔍 CROSS-PAGE DEBUG: No valid continuation found on next page');
                    }
                } else {
                    console.log('🔍 CROSS-PAGE DEBUG: Not checking next page - conditions not met');
                }
                
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

// Function to get continuation text from the next page
async function getContinuationFromNextPage(currentPage, pdf, partialRefText) {
    try {
        const currentPageNum = currentPage.pageNumber;
        const totalPages = pdf.numPages;
        
        console.log('📄 NEXT-PAGE DEBUG: Current page:', currentPageNum, 'Total pages:', totalPages);
        
        // Don't try to go beyond the last page
        if (currentPageNum >= totalPages) {
            console.log('📄 NEXT-PAGE DEBUG: Already on last page, cannot continue');
            return null;
        }
        
        const nextPage = await pdf.getPage(currentPageNum + 1);
        const nextPageTextContent = await nextPage.getTextContent();
        const nextPageItems = nextPageTextContent.items;
        
        console.log('📄 NEXT-PAGE DEBUG: Next page has', nextPageItems?.length || 0, 'text items');
        
        if (!nextPageItems || nextPageItems.length === 0) {
            console.log('📄 NEXT-PAGE DEBUG: No text items on next page');
            return null;
        }
        
        // Sort by Y coordinate (top to bottom)
        const sortedItems = nextPageItems.slice().sort((a, b) => b.transform[5] - a.transform[5]);
        
        console.log('📄 NEXT-PAGE DEBUG: First few items on next page:');
        for (let i = 0; i < Math.min(5, sortedItems.length); i++) {
            console.log(`  ${i}: "${sortedItems[i].str}"`);
        }
        
        // Look for continuation at the top of the next page
        let continuationText = '';
        let foundValidContinuation = false;
        
        // Start from the top and collect text until we hit what looks like a new reference
        for (let i = 0; i < Math.min(20, sortedItems.length); i++) {
            const item = sortedItems[i];
            const text = item.str.trim();
            
            if (!text) continue;
            
            console.log(`📄 NEXT-PAGE DEBUG: Processing item ${i}: "${text}"`);
            
            // Stop if we encounter a new reference number pattern
            if (text.match(/^\[\d+\]/) || text.match(/^\d+\./) || text.match(/^\(\d+\)/)) {
                console.log('📄 NEXT-PAGE DEBUG: Found new reference pattern, stopping');
                break;
            }
            
            // Skip if this looks like a header/footer/page number
            if (text.match(/^\d+$/) || text.length < 3) {
                console.log('📄 NEXT-PAGE DEBUG: Skipping header/footer/short text');
                continue;
            }
            
            continuationText += text + ' ';
            foundValidContinuation = true;
            console.log('📄 NEXT-PAGE DEBUG: Added to continuation:', text);
            
            // Stop if we find a period followed by uppercase (likely end of reference)
            if (text.includes('.') && text.match(/\.\s*[A-Z]/)) {
                console.log('📄 NEXT-PAGE DEBUG: Found end of reference pattern');
                break;
            }
            
            // Stop if we find DOI or URL (likely end of reference)
            if (text.includes('doi:') || text.includes('http')) {
                console.log('📄 NEXT-PAGE DEBUG: Found DOI/URL, likely end of reference');
                break;
            }
            
            // Reasonable length limit
            if (continuationText.length > 500) {
                console.log('📄 NEXT-PAGE DEBUG: Hit length limit');
                break;
            }
        }
        
        console.log('📄 NEXT-PAGE DEBUG: Collected continuation text:', continuationText);
        console.log('📄 NEXT-PAGE DEBUG: Found valid continuation:', foundValidContinuation);
        
        // Only return continuation if it looks valid and makes sense
        if (foundValidContinuation && continuationText.trim().length > 10) {
            // Basic sanity check: does this continuation make sense?
            const combined = partialRefText + ' ' + continuationText;
            
            console.log('📄 NEXT-PAGE DEBUG: Combined text contains doi:', combined.includes('doi:'));
            console.log('📄 NEXT-PAGE DEBUG: Combined text contains arXiv:', combined.includes('arXiv'));
            console.log('📄 NEXT-PAGE DEBUG: Combined text contains abs/:', combined.includes('abs/'));
            
            // If the combined text has proper reference indicators, it's likely valid
            if (combined.includes('doi:') || combined.includes('arXiv') || combined.includes('abs/')) {
                console.log('📄 NEXT-PAGE DEBUG: Returning valid continuation');
                return continuationText.trim();
            } else {
                console.log('📄 NEXT-PAGE DEBUG: No reference indicators found, rejecting continuation');
            }
        } else {
            console.log('📄 NEXT-PAGE DEBUG: No valid continuation found (length or validity check failed)');
        }
        
        return null;
        
    } catch (error) {
        console.error('📄 NEXT-PAGE DEBUG: Error getting continuation from next page:', error);
        return null;
    }
}