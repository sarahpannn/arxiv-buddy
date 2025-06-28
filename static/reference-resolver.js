// Reference resolution and destination handling

// Function to find and display reference for internal links
window.findAndDisplayReference = async function(annotation, pdf, citingLastName, citationKey) {
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
                    
                    // Extract citation key from annotation destination
                    const citationKeyFromDest = extractCitationKeyFromDestination(dest);
                    const keyToLookup = citationKeyFromDest || citationKey;
                    
                    if (keyToLookup) {
                        const bibliographyMatch = findCitationByKey(keyToLookup);
                        
                        if (bibliographyMatch) {
                            await handleCitationDisplay(textContent, targetDestination, page, citingLastName, destPageNum, bibliographyMatch);
                            return;
                        }
                    }
                    
                    // Fallback: Simple page display for figures or unknown destinations
                    const figureInfo = await detectFigureAtDestination(textContent, targetDestination, page, pdf, destPageNum);
                    
                    if (figureInfo) {
                        await window.displayFigureInfo(figureInfo);
                    } else {
                        await handleCitationDisplay(textContent, targetDestination, page, citingLastName, destPageNum);
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


// Helper function to get text near a destination
function getTextNearDestination(textContent, targetDestination, radius = 100) {
    if (!targetDestination || targetDestination.length < 4) return '';
    
    const targetY = targetDestination[3];
    const targetX = targetDestination[2];
    
    let nearbyText = '';
    
    for (const item of textContent.items) {
        if (!item.transform) continue;
        
        const itemY = item.transform[5];
        const itemX = item.transform[4];
        
        // Check if item is within radius
        const distance = Math.sqrt(Math.pow(itemX - targetX, 2) + Math.pow(itemY - targetY, 2));
        if (distance <= radius) {
            nearbyText += ' ' + item.str;
        }
    }
    
    return nearbyText.trim();
}

// Extract citation key from annotation destination
function extractCitationKeyFromDestination(dest) {
    if (!dest) return null;
    
    // Handle both string destinations and array destinations
    let destString = '';
    if (typeof dest === 'string') {
        destString = dest;
    } else if (Array.isArray(dest) && dest.length > 0 && typeof dest[0] === 'string') {
        destString = dest[0];
    }
    
    if (!destString) return null;
    
    // Look for citation patterns in the destination
    // Pattern 1: cite.keyname (like "cite.sosa2023self")
    let match = destString.match(/^cite\.(.+)$/);
    if (match) {
        return match[1];
    }
    
    // Pattern 2: Just the key name if it looks like a citation key
    if (destString.match(/^[a-zA-Z][a-zA-Z0-9_]*\d{4}[a-zA-Z0-9_]*$/)) {
        return destString;
    }
    
    // Pattern 3: bib.keyname
    match = destString.match(/^bib\.(.+)$/);
    if (match) {
        return match[1];
    }
    
    // Pattern 4: ref.keyname  
    match = destString.match(/^ref\.(.+)$/);
    if (match) {
        return match[1];
    }
    return null;
}

// Simple function to find citation by key in LaTeX data
function findCitationByKey(citationKey) {
    if (!window.latexData || !window.latexData.citation_mapping) {
        return null;
    }
    
    // Direct key match
    if (window.latexData.citation_mapping[citationKey]) {
        return {
            key: citationKey,
            mapping: window.latexData.citation_mapping[citationKey]
        };
    }
    
    // Try case-insensitive match
    for (const [key, mapping] of Object.entries(window.latexData.citation_mapping)) {
        if (key.toLowerCase() === citationKey.toLowerCase()) {
            return { key, mapping };
        }
    }
    
    return null;
}

// Function to check if destination matches bibliography entries (LEGACY - keeping for fallback)
async function findInBibliography(textContent, targetDestination, citingLastName, destPageNum) {
    try {
        console.log('🔍 Checking bibliography for matches...');
        
        // STRATEGY 1: Use LaTeX data if available
        if (window.latexData && window.latexData.citation_mapping) {
            console.log('📚 Using LaTeX bibliography data');
            
            // Get text near the destination
            const destinationText = getTextNearDestination(textContent, targetDestination, 300);
            console.log('📍 Text near destination:', destinationText.substring(0, 100) + '...');
            
            // Try to find matches in citation mapping
            for (const [key, mapping] of Object.entries(window.latexData.citation_mapping)) {
                const reference = mapping.reference;
                
                // Check if destination text contains reference elements
                const matchScore = calculateBibliographyMatchScore(destinationText, reference, key);
                
                if (matchScore > 2) { // Threshold for confident match
                    console.log('✅ Strong bibliography match found:', key, 'score:', matchScore);
                    return { key, reference, score: matchScore };
                }
            }
        }
        
        // STRATEGY 2: Look for classic bibliography patterns in the destination text
        const allPageText = textContent.items.map(item => item.str).join(' ').toLowerCase();
        
        // Check for bibliography indicators
        const bibliographyIndicators = [
            'references',
            'bibliography', 
            'works cited',
            'literature cited'
        ];
        
        for (const indicator of bibliographyIndicators) {
            if (allPageText.includes(indicator)) {
                console.log('✅ Found bibliography indicator:', indicator);
                
                // Additional checks for numbered references like [1], [2], etc.
                if (/\[\d+\]/.test(allPageText) || /^\d+\./.test(allPageText)) {
                    console.log('✅ Found numbered reference patterns');
                    return { type: 'numbered_bibliography', indicator };
                }
                
                // Check for author-year patterns
                if (/\b\d{4}\b/.test(allPageText) && citingLastName) {
                    console.log('✅ Found year patterns with author context');
                    return { type: 'author_year_bibliography', indicator };
                }
            }
        }
        
        // STRATEGY 3: Check page structure - bibliography pages tend to have specific patterns
        const textItems = textContent.items;
        let hasMultipleEntries = 0;
        let hasAuthorPatterns = 0;
        
        for (const item of textItems) {
            const text = item.str;
            
            // Count potential bibliography entries (lines starting with citations)
            if (/^\[\d+\]/.test(text) || /^\d+\./.test(text)) {
                hasMultipleEntries++;
            }
            
            // Count author-like patterns
            if (/^[A-Z][a-z]+,\s*[A-Z]/.test(text)) {
                hasAuthorPatterns++;
            }
        }
        
        if (hasMultipleEntries >= 3 || hasAuthorPatterns >= 2) {
            console.log('✅ Page structure suggests bibliography:', { hasMultipleEntries, hasAuthorPatterns });
            return { type: 'structured_bibliography', hasMultipleEntries, hasAuthorPatterns };
        }
        
        console.log('❌ No bibliography match found');
        return null;
        
    } catch (error) {
        console.error('Error checking bibliography:', error);
        return null;
    }
}

// Calculate match score between destination text and bibliography reference
function calculateBibliographyMatchScore(destinationText, reference, key) {
    let score = 0;
    
    const lowerDestText = destinationText.toLowerCase();
    
    // Check for citation key match
    if (lowerDestText.includes(key.toLowerCase())) {
        score += 5;
    }
    
    // Check for author matches
    if (reference.authors) {
        const authors = reference.authors.toLowerCase();
        const authorWords = authors.split(/[,\s]+/).filter(word => word.length > 2);
        
        for (const author of authorWords) {
            if (lowerDestText.includes(author)) {
                score += 2;
            }
        }
    }
    
    // Check for title matches
    if (reference.title) {
        const titleWords = reference.title.toLowerCase().split(/\s+/).filter(word => word.length > 3);
        
        for (const word of titleWords.slice(0, 5)) { // Only check first 5 words
            if (lowerDestText.includes(word)) {
                score += 1;
            }
        }
    }
    
    // Check for year match
    if (reference.year && lowerDestText.includes(reference.year)) {
        score += 3;
    }
    
    // Check for venue/journal match
    if (reference.venue && lowerDestText.includes(reference.venue.toLowerCase())) {
        score += 2;
    }
    
    return score;
}

// Helper function to handle citation display
async function handleCitationDisplay(textContent, targetDestination, page, citingLastName, destPageNum, bibliographyMatch = null) {
    try {
        if (bibliographyMatch) {
            // Use the direct bibliography match
            const ref = bibliographyMatch.mapping.reference;
            const citations = bibliographyMatch.mapping.citations;
            
            // Format the reference nicely
            let formattedRef = '';
            if (ref.authors) formattedRef += `${ref.authors}. `;
            if (ref.title) formattedRef += `"${ref.title}". `;
            if (ref.venue) formattedRef += `${ref.venue}. `;
            if (ref.year) formattedRef += `${ref.year}.`;
            
            // Show the standard reference info first
            window.displayReferenceInfo(
                `Reference [${bibliographyMatch.key}]`,
                formattedRef || ref.raw_entry || 'Reference found in LaTeX source',
                `Enhanced from LaTeX source data. Cited ${citations.length} time(s) in this paper.`
            );
            
            // Check if we can get an abstract from ArXiv and add it to existing display
            const arxivId = extractArxivId(ref);
            if (arxivId) {
                // Add loading indicator to existing display
                addAbstractLoadingIndicator();
                
                // Fetch and append abstract
                try {
                    const abstract = await fetchArxivAbstract(arxivId);
                    if (abstract) {
                        appendAbstractToExistingDisplay(abstract, arxivId, ref);
                    } else {
                        removeAbstractLoadingIndicator();
                    }
                } catch (error) {
                    removeAbstractLoadingIndicator();
                }
            }
        } else {
            // Fallback to PDF text extraction
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
    } catch (error) {
        console.error('Error handling citation display:', error);
        window.displayReferenceInfo(
            'Citation Error',
            error.message || 'Unknown error',
            'There was an error processing this citation.'
        );
    }
}

// Extract ArXiv ID from reference data
function extractArxivId(ref) {
    // Check for explicit arxiv_id field
    if (ref.arxiv_id) {
        return ref.arxiv_id;
    }
    
    // Check in raw_entry for ArXiv patterns
    if (ref.raw_entry) {
        const arxivPatterns = [
            /arXiv[:\s]*([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i,
            /abs\/([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i,
            /arxiv\.org\/abs\/([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i,
            /ARXIV\.([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i,
            /\b([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)\b/
        ];
        
        for (const pattern of arxivPatterns) {
            const match = ref.raw_entry.match(pattern);
            if (match) {
                return match[1];
            }
        }
    }
    
    // Check in URL field
    if (ref.url) {
        const match = ref.url.match(/arxiv\.org\/abs\/([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i);
        if (match) {
            return match[1];
        }
    }
    
    // Check in DOI field for ArXiv DOIs
    if (ref.doi) {
        const match = ref.doi.match(/ARXIV\.([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i);
        if (match) {
            return match[1];
        }
    }
    return null;
}

// Fetch abstract from ArXiv API
async function fetchArxivAbstract(arxivId) {
    try {
        const response = await fetch(`https://export.arxiv.org/api/query?id_list=${arxivId}`);
        
        if (!response.ok) {
            return null;
        }
        
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        const entry = xmlDoc.querySelector('entry');
        if (!entry) {
            return null;
        }
        
        const summary = entry.querySelector('summary');
        if (!summary) {
            return null;
        }
        
        return summary.textContent.trim();
        
    } catch (error) {
        return null;
    }
}

// Add loading indicator for abstract
function addAbstractLoadingIndicator() {
    const rightPane = document.getElementById('info-pane');
    if (!rightPane) return;
    
    // Add loading div at the end of existing content
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'abstract-loading';
    loadingDiv.innerHTML = `
        <div style="margin-top: 15px; padding: 12px; background: #fff3e0; border: 1px solid #ffcc02; border-radius: 4px; display: flex; align-items: center;">
            <div style="margin-right: 10px;">🔍</div>
            <div style="color: #e65100;">Fetching abstract from ArXiv...</div>
        </div>
    `;
    
    rightPane.appendChild(loadingDiv);
}

// Remove loading indicator
function removeAbstractLoadingIndicator() {
    const loadingDiv = document.getElementById('abstract-loading');
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

// Append abstract to existing display
function appendAbstractToExistingDisplay(abstract, arxivId, ref) {
    const rightPane = document.getElementById('info-pane');
    if (!rightPane) return;
    
    // Remove loading indicator first
    removeAbstractLoadingIndicator();
    
    // Look for the abstract placeholder first (for LaTeX enhanced display)
    const abstractPlaceholder = rightPane.querySelector('#abstract-placeholder');
    
    // Create abstract content
    const abstractContent = `
        <div style="margin: 15px 0; padding: 15px; background: #e3f2fd; border: 1px solid #2196f3; border-radius: 8px;">
            <strong style="color: #1976d2; margin-bottom: 8px; display: block;">📄 Abstract:</strong>
            <div style="color: #333; line-height: 1.5; font-size: 14px; max-height: 200px; overflow-y: auto; margin-bottom: 15px;">
                ${abstract}
            </div>
            
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <a href="https://arxiv.org/abs/${arxivId}" target="_blank" 
                   style="display: inline-block; padding: 6px 12px; background: #007acc; color: white; text-decoration: none; border-radius: 4px; font-size: 13px;">
                    📖 View on ArXiv
                </a>
                ${ref.url ? `<a href="${ref.url}" target="_blank" 
                               style="display: inline-block; padding: 6px 12px; background: #6c757d; color: white; text-decoration: none; border-radius: 4px; font-size: 13px;">
                                🔗 Original Link
                             </a>` : ''}
            </div>
        </div>
    `;
    
    if (abstractPlaceholder) {
        // Use the placeholder for LaTeX enhanced display
        abstractPlaceholder.innerHTML = abstractContent;
    } else {
        // Fallback for regular displays
        const existingHr = rightPane.querySelector('hr');
        const existingP = rightPane.querySelector('p[style*="italic"]');
        
        const abstractDiv = document.createElement('div');
        abstractDiv.innerHTML = abstractContent;
        
        if (existingP) {
            rightPane.insertBefore(abstractDiv, existingP);
        } else if (existingHr) {
            rightPane.insertBefore(abstractDiv, existingHr);
        } else {
            rightPane.appendChild(abstractDiv);
        }
    }
}