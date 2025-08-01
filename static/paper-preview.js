// Paper preview and enhancement functionality

// Function to display reference information in the right pane
// Helper function to preserve scratchpad button when updating right pane
window.updateRightPaneContent = function(newContent) {
    const rightPane = document.getElementById('info-pane');
    if (!rightPane) return;
    
    // Check if scratchpad toggle button exists
    const scratchpadToggle = rightPane.querySelector('.scratchpad-toggle');
    const scratchpadIntegrated = rightPane.querySelector('.scratchpad-integrated');
    
    // Update the content
    rightPane.innerHTML = newContent;
    
    // Re-append scratchpad elements if they existed
    if (scratchpadToggle) {
        rightPane.appendChild(scratchpadToggle);
    }
    if (scratchpadIntegrated) {
        rightPane.appendChild(scratchpadIntegrated);
    }
}

window.displayReferenceInfo = function(title, content, description) {
    
    const rightPane = document.getElementById('info-pane');
    if (rightPane) {
        // Check if we have LaTeX data for enhanced display
        if (window.latexData && window.paperStrategy === 'source') {
            displayEnhancedReferenceInfo(title, content, description);
            return;
        }
        
        // Show loading state first using helper function
        window.updateRightPaneContent(`
            <h3>${title}</h3>
            <div id="paper-preview" style="margin-top: 10px;">
                <div style="display: flex; align-items: center; padding: 10px; background: #e3f2fd; border-radius: 5px;">
                    <div style="margin-right: 10px;">🔍</div>
                    <div>Loading paper preview...</div>
                </div>
            </div>
            <div style="margin: 10px 0; padding: 4px 10px; background: #f9f9f9; border-left: 3px solid #ddd; border-radius: 3px;">
                <div style="font-size: 11px; color: #888; margin-bottom: 4px;">CITATION:</div>
                <div style="font-size: 12px; line-height: 1.1; color: #666; max-height: 45px; overflow-y: auto; overflow-x: hidden;">
                    ${content}
                </div>
            </div>
            <p style="color: #666; font-style: italic; margin-top: 15px;">${description}</p>
            <hr style="margin: 20px 0;">
            <small style="color: #999;">Click on other citations to see their references here.</small>
        `);
        
        // Parse and enhance the reference
        enhanceReferenceWithPreview(content);
    }
}

// Function to display reference info directly from a URL
window.displayReferenceInfoFromUrl = async function(url) {
    const rightPane = document.getElementById('info-pane');
    if (rightPane) {
        // Show loading state using helper function
        window.updateRightPaneContent(`
            <h3>External Citation</h3>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0;">
                <strong>Link URL:</strong><br>
                <div style="margin-top: 8px; font-size: 14px; line-height: 1.4;">
                    <a href="${url}" target="_blank" style="color: #1976d2; word-break: break-all;">${url}</a>
                </div>
            </div>
            <div id="paper-preview" style="margin-top: 20px; max-height: 200px; overflow: hidden;">
                <div style="display: flex; align-items: center; padding: 10px; background: #e3f2fd; border-radius: 5px;">
                    <div style="margin-right: 10px;">🔍</div>
                    <div>Analyzing URL and fetching paper info...</div>
                </div>
            </div>
            <p style="color: #666; font-style: italic; margin-top: 15px;">Extracting paper information from the linked URL.</p>
            <hr style="margin: 20px 0;">
            <small style="color: #999;">Click on other citations to see their references here.</small>
        `);
        
        // Extract paper info from URL and enhance
        await enhanceReferenceFromUrl(url);
    }
}

// Function to enhance reference with paper preview
async function enhanceReferenceWithPreview(referenceText) {
    try {
        const paperInfo = parseReferenceText(referenceText);
        console.log('Parsed paper info:', paperInfo);
        
        let previewHtml = generatePaperPreview(paperInfo);
        
        // Try to fetch additional information from external sources
        if (paperInfo.arxivId || paperInfo.doi || paperInfo.title) {
            const additionalInfo = await fetchAdditionalPaperInfo(paperInfo);
            if (additionalInfo) {
                previewHtml = generateEnhancedPaperPreview(paperInfo, additionalInfo);
            }
        }
        
        // Update the preview section
        const previewDiv = document.getElementById('paper-preview');
        if (previewDiv) {
            previewDiv.innerHTML = previewHtml;
        }
        
    } catch (error) {
        console.error('Error enhancing reference:', error);
        const previewDiv = document.getElementById('paper-preview');
        if (previewDiv) {
            previewDiv.innerHTML = `
                <div style="padding: 10px; background: #ffebee; border-radius: 5px; color: #c62828;">
                    <strong>⚠️ Preview Error:</strong> Could not generate paper preview.
                </div>
            `;
        }
    }
}

// Function to enhance reference from URL
async function enhanceReferenceFromUrl(url) {
    try {
        console.log('Analyzing URL:', url);
        const paperInfo = extractPaperInfoFromUrl(url);
        console.log('Extracted paper info from URL:', paperInfo);
        
        let previewHtml = generatePaperPreview(paperInfo);
        
        // Try to fetch additional information from external sources
        if (paperInfo.arxivId || paperInfo.doi || paperInfo.title) {
            const additionalInfo = await fetchAdditionalPaperInfo(paperInfo);
            if (additionalInfo) {
                previewHtml = generateEnhancedPaperPreview(paperInfo, additionalInfo);
            }
        }
        
        // Update the preview section
        const previewDiv = document.getElementById('paper-preview');
        if (previewDiv) {
            previewDiv.innerHTML = previewHtml;
        }
        
    } catch (error) {
        console.error('Error enhancing reference from URL:', error);
        const previewDiv = document.getElementById('paper-preview');
        if (previewDiv) {
            previewDiv.innerHTML = `
                <div style="padding: 10px; background: #ffebee; border-radius: 5px; color: #c62828;">
                    <strong>⚠️ URL Analysis Error:</strong> Could not extract paper information from this URL.
                </div>
            `;
        }
    }
}

// Function to extract paper information from URL
function extractPaperInfoFromUrl(url) {
    const info = {
        title: null,
        authors: [],
        year: null,
        journal: null,
        arxivId: null,
        doi: null,
        url: url,
        abstract: null
    };
    
    // Extract ArXiv ID from URL
    const arxivUrlMatch = url.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/i);
    if (arxivUrlMatch) {
        info.arxivId = arxivUrlMatch[1];
        console.log('Found ArXiv ID in URL:', info.arxivId);
        return info;
    }
    
    // Extract DOI from URL
    const doiUrlMatch = url.match(/doi\.org\/(.+)|dx\.doi\.org\/(.+)/i);
    if (doiUrlMatch) {
        info.doi = doiUrlMatch[1] || doiUrlMatch[2];
        console.log('Found DOI in URL:', info.doi);
        return info;
    }
    
    // Check for other academic platforms
    if (url.includes('semanticscholar.org')) {
        console.log('Semantic Scholar URL detected');
    } else if (url.includes('acm.org') || url.includes('ieee.org')) {
        console.log('ACM/IEEE URL detected');
    } else if (url.includes('springer.com') || url.includes('nature.com')) {
        console.log('Springer/Nature URL detected');
    }
    
    return info;
}

// Function to parse reference text and extract paper information
function parseReferenceText(text) {
    const info = {
        title: null,
        authors: [],
        year: null,
        journal: null,
        arxivId: null,
        doi: null,
        url: null,
        abstract: null
    };
    
    // Extract ArXiv ID - handle multiple references in concatenated text
    let targetArxivId = null;
    
    // If text contains multiple references, try to find the most relevant one
    // Split by common reference separators and analyze each potential reference
    const potentialRefs = text.split(/(?:\.\s+[A-Z][a-z]+\s+[A-Z])|(?:\.\s*\n\s*[A-Z])|(?:\.\s{2,}[A-Z])/);
    
    for (const refSection of potentialRefs) {
        // Try different arXiv patterns in order of preference
        let arxivMatch = null;
        
        // Try abs/xxxx.xxxxx format first (most specific to CoRR format)
        arxivMatch = refSection.match(/abs\/([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i);
        if (arxivMatch) {
            // Check if this section also contains the corresponding DOI
            const hasCorrespondingDoi = refSection.match(new RegExp(`ARXIV\\.${arxivMatch[1].replace('.', '\\.')}`, 'i'));
            if (hasCorrespondingDoi) {
                targetArxivId = arxivMatch[1];
                break;
            }
        }
        
        // Try ARXIV.xxxx.xxxxx in DOI format
        if (!arxivMatch) {
            arxivMatch = refSection.match(/ARXIV\.([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i);
            if (arxivMatch) {
                targetArxivId = arxivMatch[1];
                break;
            }
        }
        
        // Try standard arXiv patterns
        if (!arxivMatch) {
            arxivMatch = refSection.match(/arXiv(?:\s+preprint)?\s*arXiv[:\s]*([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i);
            if (!arxivMatch) {
                arxivMatch = refSection.match(/arXiv[:\s]*([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i);
            }
            if (arxivMatch) {
                targetArxivId = arxivMatch[1];
                break;
            }
        }
    }
    
    // Fallback: if no specific match found, use the first occurrence
    if (!targetArxivId) {
        const fallbackMatch = text.match(/\b([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)\b(?!\s*\/)/);
        if (fallbackMatch) {
            targetArxivId = fallbackMatch[1];
        }
    }
    
    if (targetArxivId) {
        info.arxivId = targetArxivId;
    }
    
    // Extract DOI
    const doiMatch = text.match(/doi[:\s]*([0-9\.]+\/[^\s,]+)/i);
    if (doiMatch) {
        info.doi = doiMatch[1];
    }
    
    // Extract URL
    const urlMatch = text.match(/(https?:\/\/[^\s,]+)/);
    if (urlMatch) {
        info.url = urlMatch[1];
    }
    
    // Extract year (4 digits)
    const yearMatch = text.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
        info.year = yearMatch[0];
    }
    
    // Extract title (usually in quotes or after authors before year)
    const titleMatch = text.match(/"([^"]+)"/);
    if (titleMatch) {
        info.title = titleMatch[1];
    } else {
        // Try to extract title from pattern: Author et al. Title. Journal Year
        const titlePattern = text.match(/(?:et al\.?\s+)([^.]+)\./);
        if (titlePattern) {
            info.title = titlePattern[1].trim();
        }
    }
    
    // Extract authors (usually at the beginning)
    const authorMatch = text.match(/^([^.]+(?:et al\.?)?)/);
    if (authorMatch) {
        const authorText = authorMatch[1];
        // Simple author extraction - split by 'and' or ','
        info.authors = authorText.split(/\s+and\s+|,\s+/)
            .map(author => author.trim())
            .filter(author => author.length > 2 && !author.includes('et al'));
    }
    
    // Extract journal/venue (after title, before year)
    if (info.title && info.year) {
        const journalPattern = new RegExp(`${escapeRegExp(info.title)}[^.]*\\.\\s*([^.]+?)\\s*,?\\s*${info.year}`, 'i');
        const journalMatch = text.match(journalPattern);
        if (journalMatch) {
            info.journal = journalMatch[1].trim();
        }
    }
    
    return info;
}

// Function to escape special regex characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Function to fetch additional paper information
async function fetchAdditionalPaperInfo(paperInfo) {
    try {
        // Try ArXiv API first if we have an ArXiv ID
        if (paperInfo.arxivId) {
            console.log('Fetching ArXiv info for:', paperInfo.arxivId);
            const arxivInfo = await fetchArXivInfo(paperInfo.arxivId);
            if (arxivInfo) {
                return arxivInfo;
            }
        }
        
        // Could add other APIs here (Semantic Scholar, CrossRef, etc.)
        
        return null;
    } catch (error) {
        console.error('Error fetching additional paper info:', error);
        return null;
    }
}

// Function to fetch information from ArXiv API
async function fetchArXivInfo(arxivId) {
    try {
        const response = await fetch(`https://export.arxiv.org/api/query?id_list=${arxivId}`);
        const xmlText = await response.text();
        
        // Parse XML response
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        const entry = xmlDoc.querySelector('entry');
        if (!entry) return null;
        
        const title = entry.querySelector('title')?.textContent?.trim();
        const summary = entry.querySelector('summary')?.textContent?.trim();
        const authors = Array.from(entry.querySelectorAll('author name')).map(name => name.textContent?.trim());
        const published = entry.querySelector('published')?.textContent?.trim();
        const categories = Array.from(entry.querySelectorAll('category')).map(cat => cat.getAttribute('term'));
        
        return {
            title,
            abstract: summary,
            authors,
            published: published ? new Date(published).getFullYear().toString() : null,
            categories,
            source: 'ArXiv'
        };
        
    } catch (error) {
        console.error('Error fetching ArXiv info:', error);
        return null;
    }
}

// Function to generate basic paper preview
function generatePaperPreview(paperInfo) {
    let html = '<div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; background: white;">';
    
    // Title
    if (paperInfo.title) {
        html += `<h4 style="margin: 0 0 10px 0; color: #1976d2; line-height: 1.3;">${paperInfo.title}</h4>`;
    } else {
        html += `<h4 style="margin: 0 0 10px 0; color: #666;">📄 Paper Preview</h4>`;
    }
    
    // Authors
    if (paperInfo.authors && paperInfo.authors.length > 0) {
        const authorText = paperInfo.authors.length > 3 
            ? `${paperInfo.authors.slice(0, 3).join(', ')} et al.`
            : paperInfo.authors.join(', ');
        html += `<p style="margin: 5px 0; color: #555;"><strong>Authors:</strong> ${authorText}</p>`;
    }
    
    // Publication info
    let pubInfo = [];
    if (paperInfo.journal) pubInfo.push(paperInfo.journal);
    if (paperInfo.year) pubInfo.push(paperInfo.year);
    
    if (pubInfo.length > 0) {
        html += `<p style="margin: 5px 0; color: #555;"><strong>Published:</strong> ${pubInfo.join(', ')}</p>`;
    }
    
    // Identifiers
    let identifiers = [];
    if (paperInfo.arxivId) {
        identifiers.push(`<a href="https://arxiv.org/abs/${paperInfo.arxivId}" target="_blank" style="color: #1976d2; text-decoration: none;">ArXiv: ${paperInfo.arxivId}</a>`);
    }
    if (paperInfo.doi) {
        identifiers.push(`<a href="https://doi.org/${paperInfo.doi}" target="_blank" style="color: #1976d2; text-decoration: none;">DOI: ${paperInfo.doi}</a>`);
    }
    if (paperInfo.url) {
        identifiers.push(`<a href="${paperInfo.url}" target="_blank" style="color: #1976d2; text-decoration: none;">🔗 Link</a>`);
    }
    
    if (identifiers.length > 0) {
        html += `<p style="margin: 10px 0 5px 0; font-size: 13px;">${identifiers.join(' | ')}</p>`;
    }
    
    html += '</div>';
    return html;
}

// Function to generate enhanced paper preview with additional info
function generateEnhancedPaperPreview(paperInfo, additionalInfo) {
    let html = '<div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; background: white;">';
    
    // Title (prefer additional info)
    const title = additionalInfo.title || paperInfo.title;
    if (title) {
        html += `<h4 style="margin: 0 0 10px 0; color: #1976d2; line-height: 1.3;">${title}</h4>`;
    }
    
    // Authors (prefer additional info)
    const authors = additionalInfo.authors && additionalInfo.authors.length > 0 
        ? additionalInfo.authors 
        : paperInfo.authors;
    
    if (authors && authors.length > 0) {
        const authorText = authors.length > 3 
            ? `${authors.slice(0, 3).join(', ')} et al.`
            : authors.join(', ');
        html += `<p style="margin: 5px 0; color: #555;"><strong>Authors:</strong> ${authorText}</p>`;
    }
    
    // Publication info
    const year = additionalInfo.published || paperInfo.year;
    const journal = paperInfo.journal;
    
    let pubInfo = [];
    if (journal) pubInfo.push(journal);
    if (year) pubInfo.push(year);
    
    if (pubInfo.length > 0) {
        html += `<p style="margin: 5px 0; color: #555;"><strong>Published:</strong> ${pubInfo.join(', ')}</p>`;
    }
    
    // Categories (from ArXiv)
    if (additionalInfo.categories && additionalInfo.categories.length > 0) {
        const categoryText = additionalInfo.categories.slice(0, 3).join(', ');
        html += `<p style="margin: 5px 0; color: #555;"><strong>Categories:</strong> ${categoryText}</p>`;
    }
    
    // Abstract
    if (additionalInfo.abstract) {
        html += `
            <div style="margin: 15px 0; padding: 12px; background: #f8f9fa; border-left: 4px solid #1976d2; border-radius: 4px;">
                <strong style="color: #1976d2;">Abstract:</strong><br>
                <div style="margin-top: 8px; line-height: 1.4; color: #333; font-size: 14px; max-height: none; overflow: visible;">
                    ${additionalInfo.abstract}
                </div>
            </div>
        `;
    }
    
    // Identifiers and links
    let identifiers = [];
    if (paperInfo.arxivId) {
        identifiers.push(`<a href="https://arxiv.org/abs/${paperInfo.arxivId}" target="_blank" style="color: #1976d2; text-decoration: none;">📖 ArXiv</a>`);
    }
    if (paperInfo.doi) {
        identifiers.push(`<a href="https://doi.org/${paperInfo.doi}" target="_blank" style="color: #1976d2; text-decoration: none;">🔗 DOI</a>`);
    }
    // if (paperInfo.url) {
    //     identifiers.push(`<a href="${paperInfo.url}" target="_blank" style="color: #1976d2; text-decoration: none;">🌐 Link</a>`);
    // }
    
    if (identifiers.length > 0) {
        html += `<p style="margin: 15px 0 5px 0; font-size: 13px; border-top: 1px solid #eee; padding-top: 10px;">${identifiers.join(' | ')}</p>`;
    }
    
    // Source attribution
    if (additionalInfo.source) {
        html += `<p style="margin: 10px 0 0 0; font-size: 12px; color: #999; text-align: right;">Enhanced with ${additionalInfo.source} API</p>`;
    }
    
    html += '</div>';
    return html;
}

// Enhanced function to display reference info using LaTeX data
function displayEnhancedReferenceInfo(title, content, description) {
    
    const rightPane = document.getElementById('info-pane');
    if (!rightPane) return;
    
    // Try to extract citation key or find matching reference in LaTeX data
    const latexReference = findBestLatexReference(content);
    
    if (latexReference) {
        
        const ref = latexReference.reference;
        const citations = latexReference.citations;
        
        window.updateRightPaneContent(`
            <h3>${title}</h3>
            
            ${generateLatexReferencePreview(ref, latexReference.key)}
            
            <div id="abstract-placeholder" style="margin: 0;"></div>
            
            <div style="margin: 15px 0; padding: 10px; background: #f8f9fa; border-left: 3px solid #28a745; border-radius: 3px;">
                <div style="font-size: 11px; color: #888; margin-bottom: 4px;">📊 CITATION ANALYSIS:</div>
                <div style="font-size: 13px; color: #333;">
                    <strong>Cited ${citations.length} time(s)</strong> in this paper
                </div>
                ${generateCitationContexts(citations)}
            </div>
            
            <p style="color: #666; font-style: italic; margin-top: 15px;">${description} Enhanced with LaTeX source data.</p>
            <hr style="margin: 20px 0;">
            <small style="color: #999;">Click on other citations to see their references here.</small>
        `);
    } else {
        showLatexCitationBrowser(title, content, description);
    }
}

// Function to find best matching LaTeX reference
function findBestLatexReference(content) {
    if (!window.latexData || !window.latexData.citation_mapping) {
        return null;
    }
    
    // Try to extract meaningful words from the content for matching
    const words = content.toLowerCase().match(/\b\w{3,}\b/g) || [];
    const searchTerms = words.filter(word => 
        !['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use'].includes(word)
    );
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const [key, mapping] of Object.entries(window.latexData.citation_mapping)) {
        const reference = mapping.reference;
        let score = 0;
        
        // Search in title, authors, and other text
        const searchText = [
            reference.title || '',
            reference.authors || '',
            reference.venue || '',
            reference.raw_entry || ''
        ].join(' ').toLowerCase();
        
        // Count matching terms
        for (const term of searchTerms) {
            if (searchText.includes(term)) {
                score += 1;
            }
        }
        
        // Bonus for exact key matches or year matches
        if (content.includes(key)) {
            score += 10;
        }
        
        if (reference.year && content.includes(reference.year)) {
            score += 3;
        }
        
        if (score > bestScore) {
            bestScore = score;
            bestMatch = {
                key: key,
                reference: reference,
                citations: mapping.citations,
                score: score
            };
        }
    }
    
    return bestScore > 0 ? bestMatch : null;
}

// Function to generate LaTeX reference preview
function generateLatexReferencePreview(ref, key) {
    let html = '<div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; background: white; margin: 10px 0;">';
    
    // Title
    if (ref.title) {
        html += `<h4 style="margin: 0 0 10px 0; color: #1976d2; line-height: 1.3;">${ref.title}</h4>`;
    } else {
        html += `<h4 style="margin: 0 0 10px 0; color: #666;">📄 Reference [${key}]</h4>`;
    }
    
    // Authors
    if (ref.authors) {
        html += `<p style="margin: 5px 0; color: #555;"><strong>Authors:</strong> ${ref.authors}</p>`;
    }
    
    // Publication info
    let pubInfo = [];
    if (ref.venue) pubInfo.push(ref.venue);
    if (ref.year) pubInfo.push(ref.year);
    
    if (pubInfo.length > 0) {
        html += `<p style="margin: 5px 0; color: #555;"><strong>Published:</strong> ${pubInfo.join(', ')}</p>`;
    }
    
    // Identifiers
    let identifiers = [];
    if (ref.arxiv_id) {
        identifiers.push(`<a href="https://arxiv.org/abs/${ref.arxiv_id}" target="_blank" style="color: #1976d2; text-decoration: none;">📖 ArXiv: ${ref.arxiv_id}</a>`);
    }
    if (ref.doi) {
        identifiers.push(`<a href="https://doi.org/${ref.doi}" target="_blank" style="color: #1976d2; text-decoration: none;">🔗 DOI: ${ref.doi}</a>`);
    }
    if (ref.url) {
        identifiers.push(`<a href="${ref.url}" target="_blank" style="color: #1976d2; text-decoration: none;">🌐 Link</a>`);
    }
    
    if (identifiers.length > 0) {
        html += `<p style="margin: 10px 0 5px 0; font-size: 13px;">${identifiers.join(' | ')}</p>`;
    }
    
    html += '</div>';
    return html;
}

// Function to generate citation contexts
function generateCitationContexts(citations) {
    if (!citations || citations.length === 0) {
        return '';
    }
    
    let html = '<div style="margin-top: 10px; max-height: 120px; overflow-y: auto;">';
    
    citations.slice(0, 3).forEach((citation, i) => {
        html += `
            <div style="margin: 8px 0; padding: 8px; background: white; border-radius: 4px; border-left: 3px solid #81c784;">
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
                    <strong>Context ${i + 1}:</strong> ${citation.file_name}:${citation.line_number} (${citation.command})
                </div>
                <div style="font-size: 11px; color: #333; line-height: 1.3;">
                    "${citation.context.substring(0, 150)}..."
                </div>
            </div>
        `;
    });
    
    if (citations.length > 3) {
        html += `<div style="margin-top: 8px; font-size: 12px; color: #666; text-align: center;">... and ${citations.length - 3} more citations</div>`;
    }
    
    html += '</div>';
    return html;
}

// Function to show LaTeX citation browser when no specific match
function showLatexCitationBrowser(title, content, description) {
    const rightPane = document.getElementById('info-pane');
    if (!rightPane) return;
    
    const totalCitations = Object.keys(window.latexData.citation_mapping || {}).length;
    const totalFigures = Object.keys(window.latexData.figures || {}).length;
    
    window.updateRightPaneContent(`
        <h3>${title}</h3>
        
        <div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; background: #f8f9fa; margin: 10px 0;">
            <h4 style="margin: 0 0 10px 0; color: #1976d2;">📚 LaTeX Source Analysis</h4>
            <p style="margin: 5px 0; color: #555;"><strong>Total Citations:</strong> ${totalCitations}</p>
            <p style="margin: 5px 0; color: #555;"><strong>Total Figures:</strong> ${totalFigures}</p>
            <p style="margin: 10px 0 5px 0; font-size: 13px; color: #666;">
                This paper has LaTeX source data available. Click on specific citations or figures for detailed information.
            </p>
        </div>
        
        <div style="margin: 10px 0; padding: 4px 10px; background: #fff3e0; border-left: 3px solid #ff9800; border-radius: 3px;">
            <div style="font-size: 11px; color: #888; margin-bottom: 4px;">ORIGINAL CITATION:</div>
            <div style="font-size: 12px; line-height: 1.1; color: #666; max-height: 45px; overflow-y: auto; overflow-x: hidden;">
                ${content}
            </div>
        </div>
        
        <p style="color: #666; font-style: italic; margin-top: 15px;">${description}</p>
        <hr style="margin: 20px 0;">
        <small style="color: #999;">LaTeX-enhanced citation system active. Click citations for instant lookup.</small>
    `);
}