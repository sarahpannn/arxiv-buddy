// Reference extraction functionality

// Function to extract reference text at a specific destination
window.extractReferenceAtDestination = async function(textContent, dest, page, citingLastName) {
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