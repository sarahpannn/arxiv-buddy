/**
 * Citation Analysis Frontend for arxiv-buddy
 * Handles citation analysis UI and API interactions
 */

class CitationAnalysisModal {
    constructor() {
        this.currentPaperId = null;
        this.analysisData = null;
        this.isAnalyzing = false;
        
        console.log('[citation] citation analysis modal module loaded');
    }
    
    /**
     * Initialize citation analysis for a paper
     * @param {string} paperId - arXiv paper ID
     */
    async initialize(paperId) {
        this.currentPaperId = paperId;
        console.log(`[citation] initializing citation analysis for ${paperId}`);
        
        // Create citation panel if it doesn't exist
        this.createCitationPanel();
        
        // Check if we have existing analysis
        await this.loadExistingAnalysis();
    }
    
    /**
     * Create the citation analysis UI within the modal
     */
    createCitationPanel() {
        // Find the modal content area
        const modalContent = document.getElementById('citation-analysis-content');
        if (!modalContent) {
            console.error('[citation] modal content area not found');
            return;
        }
        
        // Create citation panel content
        modalContent.innerHTML = `
            <div class="citation-modal-content">
                <div id="citation-status" class="citation-status">
                    <p>click "analyze citations" to extract and analyze citations from this paper</p>
                </div>
                <div class="citation-controls">
                    <button id="analyze-citations-btn" class="btn btn-primary">analyze citations</button>
                </div>
                <div id="citation-results" class="citation-results" style="display: none;">
                    <!-- Results will be populated here -->
                </div>
            </div>
        `;
        
        // Add event listeners
        this.setupEventListeners();
        
        console.log('[citation] citation panel created in modal');
    }
    
    /**
     * Setup event listeners for citation panel
     */
    setupEventListeners() {
        // Analyze citations button
        const analyzeBtn = document.getElementById('analyze-citations-btn');
        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', () => {
                this.startCitationAnalysis();
            });
        }
    }
    
    /**
     * Load existing citation analysis if available
     */
    async loadExistingAnalysis() {
        if (!this.currentPaperId) return;
        
        try {
            console.log(`[citation] checking for existing analysis for ${this.currentPaperId}`);
            
            const response = await fetch(`/api/citations/${this.currentPaperId}/summary`);
            const data = await response.json();
            
            if (data.success && data.has_analysis) {
                console.log('[citation] found existing analysis');
                this.displayAnalysisSummary(data);
                
                // Load full results
                await this.loadFullResults();
            } else {
                console.log('[citation] no existing analysis found');
                this.showNoAnalysisMessage();
            }
            
        } catch (error) {
            console.error('[citation] error loading existing analysis:', error);
            this.showError('failed to load existing analysis');
        }
    }
    
    /**
     * Start citation analysis process using existing citation mapping
     */
    async startCitationAnalysis() {
        if (!this.currentPaperId || this.isAnalyzing) return;
        
        this.isAnalyzing = true;
        this.showAnalyzingState();
        
        try {
            console.log(`[citation] starting analysis for ${this.currentPaperId}`);
            
            // Check if citation mapping is available
            if (!window.latexData || !window.latexData.citation_mapping) {
                throw new Error('No citation data available. Please ensure LaTeX source is loaded.');
            }
            
            const citationMapping = window.latexData.citation_mapping;
            const totalCitations = Object.keys(citationMapping).length;
            
            console.log(`[citation] found ${totalCitations} citations in mapping`);
            
            // Process citations using existing data
            const resolvedCitations = await this.processCitationMapping(citationMapping);
            
            const resolvedCount = resolvedCitations.length;
            
            // Display analysis results
            this.displayAnalysisResults({
                total_citations: totalCitations,
                resolved_citations: resolvedCount,
                influence_score: this.calculateOverallInfluence(resolvedCitations)
            });
            
            // Load and display full results
            const analysisResults = this.calculateCitationMetrics(resolvedCitations);
            this.displayPaperLists(analysisResults.influential, analysisResults.relevant);
            
        } catch (error) {
            console.error('[citation] analysis error:', error);
            this.showError(error.message || 'failed to analyze citations');
        } finally {
            this.isAnalyzing = false;
        }
    }
    
    /**
     * Calculate overall influence score for the paper
     */
    calculateOverallInfluence(resolvedCitations) {
        if (resolvedCitations.length === 0) return 0;
        
        const totalInfluence = resolvedCitations.reduce((sum, citation) => {
            return sum + citation.localCitationCount;
        }, 0);
        
        return totalInfluence / resolvedCitations.length;
    }
    
    /**
     * Extract arXiv ID from reference data with LaTeX href support
     */
    extractArxivId(ref) {
        console.log('[extractArxivId] checking reference:', ref);
        
        // Check for explicit arxiv_id field
        if (ref.arxiv_id) {
            console.log('[extractArxivId] found explicit arxiv_id:', ref.arxiv_id);
            return ref.arxiv_id;
        }
        
        // Check in raw_entry for ArXiv patterns
        if (ref.raw_entry) {
            console.log('[extractArxivId] checking raw_entry:', ref.raw_entry.substring(0, 200));
            const arxivPatterns = [
                /arXiv[:\s]*([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i,
                /abs\/([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i,
                /arxiv\.org\/abs\/([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i,
                /ARXIV\.([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i,
                // LaTeX href pattern for arXiv URLs
                /\\href\s*\{\s*https?:\/\/arxiv\.org\/abs\/([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i,
                /\b([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)\b/
            ];
            
            for (const pattern of arxivPatterns) {
                const match = ref.raw_entry.match(pattern);
                if (match) {
                    console.log('[extractArxivId] found arxiv ID in raw_entry:', match[1]);
                    return match[1];
                }
            }
            console.log('[extractArxivId] no patterns matched in raw_entry');
        }
        
        // Check in URL field
        if (ref.url) {
            console.log('[extractArxivId] checking URL field:', ref.url);
            const match = ref.url.match(/arxiv\.org\/abs\/([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i);
            if (match) {
                console.log('[extractArxivId] found arxiv ID in URL:', match[1]);
                return match[1];
            }
        }
        
        // Check in DOI field for ArXiv DOIs
        if (ref.doi) {
            console.log('[extractArxivId] checking DOI field:', ref.doi);
            const match = ref.doi.match(/ARXIV\.([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i);
            if (match) {
                console.log('[extractArxivId] found arxiv ID in DOI:', match[1]);
                return match[1];
            }
        }
        
        console.log('[extractArxivId] no arxiv ID found in any field');
        return null;
    }
    
    /**
     * Load full citation results using existing citation mapping
     */
    async loadFullResults() {
        try {
            // Use existing citation mapping instead of backend service
            if (!window.latexData || !window.latexData.citation_mapping) {
                console.log('[citation] no latex citation data available');
                this.showError('No citation data available. Please ensure LaTeX source is loaded.');
                return;
            }
            
            console.log('[citation] analyzing citations from existing mapping');
            const citationMapping = window.latexData.citation_mapping;
            
            // Process citations using existing reference resolver logic
            const resolvedCitations = await this.processCitationMapping(citationMapping);
            
            // Calculate metrics and display results
            const analysisResults = this.calculateCitationMetrics(resolvedCitations);
            this.displayPaperLists(analysisResults.influential, analysisResults.relevant);
            
        } catch (error) {
            console.error('[citation] error loading full results:', error);
        }
    }
    
    /**
     * Process existing citation mapping to resolve papers
     */
    async processCitationMapping(citationMapping) {
        const resolvedCitations = [];
        
        for (const [key, mapping] of Object.entries(citationMapping)) {
            const reference = mapping.reference;
            const citations = mapping.citations;
            
            // Debug the reference data structure
            console.log(`[citation] processing ${key}:`, {
                reference,
                hasArxivId: !!reference.arxiv_id,
                hasUrl: !!reference.url,
                hasDoi: !!reference.doi,
                hasRawEntry: !!reference.raw_entry,
                urlValue: reference.url,
                rawEntrySnippet: reference.raw_entry?.substring(0, 100)
            });
            
            // Extract arXiv ID using our enhanced function with LaTeX href support
            const arxivId = this.extractArxivId(reference);
            console.log(`[citation] processing ${key}: arxivId=${arxivId}`);
            
            // Only process papers with arXiv IDs for now
            if (arxivId) {
                const paperInfo = await this.fetchArxivMetadata(arxivId);
                
                if (paperInfo) {
                    resolvedCitations.push({
                        key,
                        reference,
                        citations,
                        paperInfo,
                        localCitationCount: citations.length
                    });
                }
            } else {
                console.log(`[citation] skipping ${key}: no arXiv ID found`);
            }
        }
        
        return resolvedCitations;
    }
    
    /**
     * Calculate citation metrics from resolved citations
     */
    calculateCitationMetrics(resolvedCitations) {
        // Sort by local citation frequency and other metrics
        const sortedByFrequency = [...resolvedCitations].sort((a, b) => 
            b.localCitationCount - a.localCitationCount
        );
        
        const sortedByInfluence = [...resolvedCitations].sort((a, b) => {
            // Simple influence scoring based on local citation frequency
            return b.localCitationCount - a.localCitationCount;
        });
        
        return {
            influential: sortedByInfluence.slice(0, 10).map(c => this.formatPaperForDisplay(c)),
            relevant: sortedByFrequency.slice(0, 10).map(c => this.formatPaperForDisplay(c))
        };
    }
    
    /**
     * Fetch arXiv metadata using the existing arXiv API
     */
    async fetchArxivMetadata(arxivId) {
        try {
            const response = await fetch(`https://export.arxiv.org/api/query?id_list=${arxivId}`);
            if (!response.ok) return null;
            
            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            
            const entry = xmlDoc.querySelector('entry');
            if (!entry) return null;
            
            const title = entry.querySelector('title')?.textContent?.trim() || '';
            const summary = entry.querySelector('summary')?.textContent?.trim() || '';
            const published = entry.querySelector('published')?.textContent?.trim() || '';
            
            const authors = Array.from(entry.querySelectorAll('author name')).map(name => 
                name.textContent.trim()
            );
            
            return {
                arxiv_id: arxivId,
                title,
                authors,
                abstract: summary,
                published_date: published,
                // arXiv doesn't provide citation count, so we don't include it
                source: 'arxiv'
            };
        } catch (error) {
            console.error('[citation] error fetching arxiv metadata:', error);
            return null;
        }
    }
    

    
    /**
     * Format paper data for display in the UI
     */
    formatPaperForDisplay(resolvedCitation) {
        const paper = resolvedCitation.paperInfo;
        const reference = resolvedCitation.reference;
        
        return {
            arxiv_id: paper.arxiv_id || null,
            title: paper.title || reference.title || 'Unknown Title',
            authors: paper.authors || (reference.authors ? reference.authors.split(',').map(a => a.trim()) : []),
            abstract: paper.abstract || '',
            local_citations: resolvedCitation.localCitationCount,
            influence_score: resolvedCitation.localCitationCount, // Simple scoring for arXiv papers
            relevance_score: resolvedCitation.localCitationCount * 1.5,
            published_date: paper.published_date || reference.year || '',
            source: 'arxiv'
        };
    }
    
    /**
     * Display analysis summary
     */
    displayAnalysisSummary(data) {
        const statusDiv = document.getElementById('citation-status');
        if (!statusDiv) return;
        
        statusDiv.innerHTML = `
            <div class="analysis-summary">
                <p><strong>analysis completed:</strong> ${new Date(data.computed_at).toLocaleDateString()}</p>
                <p><strong>citations found:</strong> ${data.total_citations_found}</p>
                <p><strong>resolved to arxiv:</strong> ${data.resolved_citations}</p>
                <p><strong>influence score:</strong> ${data.influence_score.toFixed(2)}</p>
            </div>
        `;
        
        // Show results section
        const resultsDiv = document.getElementById('citation-results');
        if (resultsDiv) {
            resultsDiv.style.display = 'block';
        }
    }
    
    /**
     * Display full analysis results
     */
    displayAnalysisResults(analysis) {
        const statusDiv = document.getElementById('citation-status');
        if (!statusDiv) return;
        
        statusDiv.innerHTML = `
            <div class="analysis-summary">
                <p><strong>analysis completed!</strong></p>
                <p><strong>total citations:</strong> ${analysis.total_citations}</p>
                <p><strong>resolved citations:</strong> ${analysis.resolved_citations}</p>
                <p><strong>influence score:</strong> ${analysis.influence_score?.toFixed(2) || 'calculating...'}</p>
            </div>
        `;
        
        // Show results section
        const resultsDiv = document.getElementById('citation-results');
        if (resultsDiv) {
            resultsDiv.style.display = 'block';
        }
    }
    
    /**
     * Display lists of influential and relevant papers
     */
    displayPaperLists(influentialPapers, relevantPapers) {
        const resultsDiv = document.getElementById('citation-results');
        if (!resultsDiv) return;
        
        resultsDiv.innerHTML = `
            <div class="citation-lists">
                <div class="paper-list">
                    <h4>most influential cited papers</h4>
                    <div class="papers">
                        ${this.renderPaperList(influentialPapers, 'influence')}
                    </div>
                </div>
                
                <div class="paper-list">
                    <h4>most relevant cited papers</h4>
                    <div class="papers">
                        ${this.renderPaperList(relevantPapers, 'relevance')}
                    </div>
                </div>
            </div>
        `;
        
        // Add event listeners for load paper buttons
        this.addPaperActionListeners();
    }
    
    /**
     * Render a list of papers
     */
    renderPaperList(papers, scoreType) {
        if (!papers || papers.length === 0) {
            return '<p>no papers found</p>';
        }
        
        return papers.map(paper => {
            const score = scoreType === 'influence' ? paper.influence_score : paper.relevance_score;
            const citations = paper.local_citations;
            
            return `
                <div class="paper-item" data-arxiv-id="${paper.arxiv_id}">
                    <div class="paper-header">
                        <h5 class="paper-title">${paper.title}</h5>
                        <div class="paper-metrics">
                            <span class="metric">${scoreType}: ${score.toFixed(2)}</span>
                            <span class="metric">cited ${citations}x</span>
                        </div>
                    </div>
                    <div class="paper-details">
                        <p class="paper-authors">${paper.authors.join(', ')}</p>
                        <p class="paper-abstract">${paper.abstract}</p>
                        <div class="paper-actions">
                            <a href="https://arxiv.org/abs/${paper.arxiv_id}" target="_blank" class="arxiv-link">
                                view on arxiv
                            </a>
                            <button class="load-paper-btn" data-arxiv-id="${paper.arxiv_id}">
                                load in arxiv-buddy
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    /**
     * Show analyzing state
     */
    showAnalyzingState() {
        const statusDiv = document.getElementById('citation-status');
        const analyzeBtn = document.getElementById('analyze-citations-btn');
        
        if (statusDiv) {
            statusDiv.innerHTML = `
                <div class="analyzing-state">
                    <p>🔍 analyzing citations...</p>
                    <p>extracting citations from latex source, resolving to arxiv papers, and calculating metrics</p>
                    <div class="progress-indicator">
                        <div class="progress-bar"></div>
                    </div>
                </div>
            `;
        }
        
        if (analyzeBtn) {
            analyzeBtn.disabled = true;
            analyzeBtn.textContent = 'analyzing...';
        }
    }
    
    /**
     * Show no analysis message
     */
    showNoAnalysisMessage() {
        const statusDiv = document.getElementById('citation-status');
        const analyzeBtn = document.getElementById('analyze-citations-btn');
        
        if (statusDiv) {
            statusDiv.innerHTML = `
                <p>no citation analysis available for this paper.</p>
                <p>click "analyze citations" to extract and analyze citations from the latex source.</p>
            `;
        }
        
        if (analyzeBtn) {
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = 'analyze citations';
        }
    }
    
    /**
     * Show error message
     */
    showError(message) {
        const statusDiv = document.getElementById('citation-status');
        const analyzeBtn = document.getElementById('analyze-citations-btn');
        
        if (statusDiv) {
            statusDiv.innerHTML = `
                <div class="error-message">
                    <p>❌ error: ${message}</p>
                    <p>make sure the paper has been loaded and latex source is available.</p>
                </div>
            `;
        }
        
        if (analyzeBtn) {
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = 'retry analysis';
        }
    }
    
    /**
     * Add event listeners for paper action buttons
     */
    addPaperActionListeners() {
        // Add listeners for "load paper" buttons
        const loadButtons = document.querySelectorAll('.load-paper-btn');
        loadButtons.forEach(button => {
            button.addEventListener('click', async (e) => {
                const arxivId = e.target.getAttribute('data-arxiv-id');
                if (arxivId) {
                    console.log(`[citation] loading paper ${arxivId}`);
                    
                    // Update button state
                    const originalText = e.target.textContent;
                    e.target.textContent = 'loading...';
                    e.target.disabled = true;
                    
                    try {
                        // Navigate to the paper (same as the main paper loading functionality)
                        const arxivUrl = `https://arxiv.org/abs/${arxivId}`;
                        const response = await fetch('/load_paper', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                            },
                            body: `arxiv_url=${encodeURIComponent(arxivUrl)}`
                        });
                        
                        if (response.ok) {
                            // Redirect to the new paper
                            window.location.href = response.url;
                        } else {
                            throw new Error('failed to load paper');
                        }
                        
                    } catch (error) {
                        console.error('[citation] error loading paper:', error);
                        e.target.textContent = 'error loading';
                        setTimeout(() => {
                            e.target.textContent = originalText;
                            e.target.disabled = false;
                        }, 2000);
                    }
                }
            });
        });
    }
}

// Global citation analysis modal instance
window.CitationAnalysisModal = new CitationAnalysisModal();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CitationAnalysisModal;
}