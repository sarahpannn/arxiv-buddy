// Reference resolution and destination handling

// Function to find and display reference for internal links
window.findAndDisplayReference = async function(annotation, pdf) {
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
                    
                    // Show immediate feedback
                    window.displayReferenceInfo(
                        `Following Citation Link...`,
                        `Navigating to page ${destPageNum} to find the reference text...`,
                        'Following the internal PDF link using pdf.getDestinations().'
                    );
                    
                    // Extract the actual reference text from the destination location
                    const referenceText = await extractReferenceAtDestination(textContent, targetDestination, page);
                    
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

// Function to extract reference text at a specific destination
async function extractReferenceAtDestination(textContent, dest, page) {
    try {
        const textItems = textContent.items;
        
        // Get destination coordinates if available
        let targetY = null;
        if (dest.length > 2 && typeof dest[2] === 'number') {
            targetY = dest[2]; // Y coordinate of destination
            console.log('Target Y coordinate:', targetY);
        }
        
        // Find text items near the destination coordinates
        let candidateRefs = [];
        
        for (let i = 0; i < textItems.length; i++) {
            const item = textItems[i];
            const text = item.str;
            
            // Look for reference number patterns
            if (text.match(/^\[\d+\]/) || text.match(/^\d+\./) || text.match(/^\(\d+\)/)) {
                console.log('Found reference starter:', text, 'at Y:', item.transform[5]);
                
                // If we have a target Y, check if this is close to it
                let isNearTarget = true;
                if (targetY !== null && item.transform && item.transform[5]) {
                    const itemY = item.transform[5];
                    const distance = Math.abs(itemY - targetY);
                    isNearTarget = distance < 50; // Within 50 units
                    console.log(`Y distance: ${distance}, near target: ${isNearTarget}`);
                }
                
                if (isNearTarget) {
                    // Collect this and following text to form complete reference
                    let fullRef = text;
                    for (let j = i + 1; j < Math.min(i + 50, textItems.length); j++) {
                        const nextItem = textItems[j];
                        const nextText = nextItem.str;
                        
                        // Stop if we hit the next reference number
                        if (nextText.match(/^\[\d+\]/) || nextText.match(/^\d+\./) || nextText.match(/^\(\d+\)/)) {
                            break;
                        }
                        
                        // Stop if we move too far down the page
                        if (targetY !== null && nextItem.transform && nextItem.transform[5]) {
                            const nextY = nextItem.transform[5];
                            if (Math.abs(nextY - targetY) > 100) {
                                break;
                            }
                        }
                        
                        fullRef += ' ' + nextText;
                        if (fullRef.length > 1000) break; // Reasonable limit
                    }
                    
                    candidateRefs.push({
                        text: fullRef.trim(),
                        distance: targetY !== null && item.transform ? Math.abs(item.transform[5] - targetY) : 0
                    });
                }
            }
        }
        
        // Return the reference closest to the target coordinates
        if (candidateRefs.length > 0) {
            candidateRefs.sort((a, b) => a.distance - b.distance);
            console.log('Found', candidateRefs.length, 'candidate references, using closest');
            return candidateRefs[0].text;
        }
        
        // Fallback: return the first substantial reference-like text on the page
        return findBestReferenceOnPage(textContent);
        
    } catch (error) {
        console.error('Error extracting reference at destination:', error);
        return null;
    }
}

// Function to find the best reference on a page (fallback)
function findBestReferenceOnPage(textContent) {
    const textItems = textContent.items;
    
    // Look for the longest reference-like text block
    let bestRef = '';
    let currentRef = '';
    
    for (let i = 0; i < textItems.length; i++) {
        const item = textItems[i];
        const text = item.str;
        
        // Start of a new reference
        if (text.match(/^\[\d+\]/) || text.match(/^\d+\./)) {
            // Save previous reference if it was substantial
            if (currentRef.length > bestRef.length && currentRef.length > 50) {
                bestRef = currentRef.trim();
            }
            currentRef = text;
        } else if (currentRef) {
            // Continue building current reference
            currentRef += ' ' + text;
            if (currentRef.length > 1000) {
                // Save this reference and start fresh
                if (currentRef.length > bestRef.length) {
                    bestRef = currentRef.trim();
                }
                currentRef = '';
            }
        }
    }
    
    // Check the last reference
    if (currentRef.length > bestRef.length && currentRef.length > 50) {
        bestRef = currentRef.trim();
    }
    
    return bestRef || 'Could not extract reference text from this page.';
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