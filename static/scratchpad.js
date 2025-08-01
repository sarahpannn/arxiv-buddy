// Scratchpad functionality for ArXiv Buddy

class ScratchpadManager {
    constructor() {
        this.notes = [];
        this.isOpen = false;
        this.currentPaperId = null;
        this.selectedText = null;
        this.selectedRange = null;
        this.debounceTimer = null;
        this.justCreatedContextMenu = false;
        
        this.init();
    }
    
    init() {
        try {
            this.createScratchpadUI();
            this.bindEvents();
            this.loadNotes();
        } catch (error) {
            console.error('Scratchpad initialization failed:', error);
        }
    }
    
    createScratchpadUI() {
        // Check if we're already integrated
        if (document.querySelector('.scratchpad-integrated')) {
            return;
        }
        
        try {
            // Find the right pane to integrate into
            const rightPane = document.getElementById('info-pane');
            if (!rightPane) {
                console.error('Right pane not found - falling back to overlay mode');
                this.createOverlayUI();
                return;
            }
            
            // Store original right pane content
            this.originalRightPaneContent = rightPane.innerHTML;
            this.isIntegrated = false;
            
            // Create toggle button in top-right corner of right pane
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'scratchpad-toggle';
            toggleBtn.innerHTML = '📝';
            toggleBtn.title = 'Toggle Scratchpad';
            toggleBtn.onclick = () => this.toggleIntegration();
            
            toggleBtn.style.cssText = `
                position: absolute !important;
                bottom: 20px !important;
                right: 20px !important;
                width: 52px !important;
                height: 52px !important;
                background: #1976d2 !important;
                color: white !important;
                border: none !important;
                border-radius: 50% !important;
                font-size: 27px !important;
                cursor: pointer !important;
                z-index: 100 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                box-shadow: 0 2px 8px rgba(25, 118, 210, 0.4) !important;
                transition: all 0.2s !important;
            `;
            
            // Make right pane relative positioned for absolute button
            rightPane.style.position = 'relative';
            rightPane.appendChild(toggleBtn);
            this.toggleBtn = toggleBtn;
            
            // Create scratchpad content (initially hidden)
            this.createScratchpadContent();
            
        } catch (error) {
            console.error('Failed to create integrated scratchpad UI:', error);
            this.createOverlayUI(); // Fallback to overlay
        }
    }
    
    createScratchpadContent() {
        const scratchpadContent = document.createElement('div');
        scratchpadContent.className = 'scratchpad-integrated';
        scratchpadContent.style.cssText = `
            display: none !important;
            height: 100% !important;
            flex-direction: column !important;
            background: white !important;
        `;
        
        scratchpadContent.innerHTML = `
            <div class="scratchpad-header" style="
                padding: 20px 60px 20px 20px !important;
                border-bottom: 1px solid #e0e0e0 !important;
                background: #f8f9fa !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
            ">
                <h3 style="margin: 0; color: #1976d2; font-size: 1.2rem;">📝 Scratchpad</h3>
                <button class="scratchpad-minimize" onclick="window.scratchpad.toggleIntegration()" style="
                    background: none !important;
                    border: none !important;
                    font-size: 20px !important;
                    cursor: pointer !important;
                    color: #666 !important;
                    position: absolute !important;
                    top: 15px !important;
                    right: 15px !important;
                    width: 30px !important;
                    height: 30px !important;
                    border-radius: 50% !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                ">×</button>
            </div>
            <div class="scratchpad-content" id="scratchpad-content" style="
                flex: 1 !important;
                overflow-y: auto !important;
                padding: 20px !important;
            ">
                <div class="scratchpad-add-note" onclick="window.scratchpad.addNote()" style="
                    margin-top: 16px !important;
                    padding: 12px !important;
                    border: 2px dashed #ccc !important;
                    border-radius: 8px !important;
                    text-align: center !important;
                    cursor: pointer !important;
                    color: #666 !important;
                ">
                    + Add Note
                </div>
            </div>
        `;
        
        const rightPane = document.getElementById('info-pane');
        rightPane.appendChild(scratchpadContent);
        this.scratchpadContent = scratchpadContent;
    }
    
    createOverlayUI() {
        // Fallback to original overlay implementation
        // Create floating action button
        const fab = document.createElement('button');
        fab.className = 'scratchpad-fab';
        fab.innerHTML = '📝';
        fab.title = 'Open Scratchpad';
        fab.onclick = () => this.togglePanel();
        
        fab.style.cssText = `
            position: fixed !important;
            bottom: 20px !important;
            right: 20px !important;
            width: 56px !important;
            height: 56px !important;
            background: #1976d2 !important;
            color: white !important;
            border: none !important;
            border-radius: 50% !important;
            font-size: 24px !important;
            cursor: pointer !important;
            z-index: 9999 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-shadow: 0 4px 12px rgba(25, 118, 210, 0.4) !important;
        `;
        
        document.body.appendChild(fab);
        this.fab = fab;
        
        // Create overlay panel
        const panel = document.createElement('div');
        panel.className = 'scratchpad-panel';
        
        panel.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            right: 0 !important;
            width: 400px !important;
            height: 100vh !important;
            background: white !important;
            border-left: 2px solid #ccc !important;
            z-index: 10000 !important;
            transform: translateX(100%) !important;
            transition: transform 0.3s ease !important;
            display: flex !important;
            flex-direction: column !important;
            box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15) !important;
        `;
        
        panel.innerHTML = `
            <div class="scratchpad-header" style="padding: 20px; border-bottom: 1px solid #e0e0e0; background: #f8f9fa; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; color: #1976d2; font-size: 1.2rem;">📝 Scratchpad</h3>
                <button class="scratchpad-close" onclick="window.scratchpad.closePanel()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">×</button>
            </div>
            <div class="scratchpad-content" id="scratchpad-content" style="flex: 1; overflow-y: auto; padding: 20px;">
                <div class="scratchpad-add-note" onclick="window.scratchpad.addNote()" style="margin-top: 16px; padding: 12px; border: 2px dashed #ccc; border-radius: 8px; text-align: center; cursor: pointer; color: #666;">
                    + Add Note
                </div>
            </div>
        `;
        
        document.body.appendChild(panel);
        this.panel = panel;
    }
    
    bindEvents() {
        
        // Text selection for anchoring - show context menu instead of auto-creating
        document.addEventListener('mouseup', (e) => {
            if (this.contextMenu && e.target.closest('.selection-context-menu')) {
                return;
            }

            const selection = window.getSelection();
            const selectedText = selection.toString().trim();
            
            if (selectedText && this.isValidSelectionContext(selection)) {
                this.justCreatedContextMenu = true;
                this.showSelectionContextMenu(selection, e);
  
            } else {
                this.hideSelectionContextMenu();
            }
        });
        
        // Click on anchored text highlights - ONLY process clicks when no context menu exists
        document.addEventListener('click', (e) => {
            // Ignore clicks immediately after creating context menu (from text selection)
            if (this.justCreatedContextMenu) {
                return;
            }
            
            // If we have a context menu, only handle clicks ON the context menu
            if (this.contextMenu) {
                if (e.target.closest('.selection-context-menu')) {
                    return; // Let button event handlers handle this
                } else {
                    this.hideSelectionContextMenu();
                    return;
                }
            }
            
            
            if (e.target.classList.contains('text-selection-highlight') && 
                e.target.classList.contains('has-note')) {
                this.showNotePreview(e);
            }
        });
        
        // ESC key to close panel and context menu
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.contextMenu) {
                    this.hideSelectionContextMenu();
                } else if (this.isOpen) {
                    this.closePanel();
                }
            }
        });
    }
    
    isValidSelectionContext(selection) {
        // Check if selection is within PDF text layer
        try {
            const range = selection.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const parentElement = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
            
            const isInTextLayer = parentElement.closest('.textLayer');
            const isInPDFCanvas = parentElement.closest('#pdf-canvas');
            const isInCanvasWrapper = parentElement.closest('.canvasWrapper');
            
            
            return isInTextLayer || isInPDFCanvas || isInCanvasWrapper;
        } catch (error) {
            console.error('Error checking selection context:', error);
            return false;
        }
    }
    
    showSelectionContextMenu(selection, event) {
        const text = selection.toString().trim();
        if (text.length < 3) return; // Ignore very short selections
        
        this.selectedText = text;
        this.selectedRange = selection.getRangeAt(0).cloneRange();
        
        // Remove existing context menu
        this.hideSelectionContextMenu();
        
        // Create context menu
        const contextMenu = document.createElement('div');
        contextMenu.className = 'selection-context-menu';
        contextMenu.style.cssText = `
            position: fixed !important;
            background: white !important;
            border: 1px solid #ccc !important;
            border-radius: 8px !important;
            padding: 8px !important;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
            z-index: 10001 !important;
            display: flex !important;
            gap: 8px !important;
            font-size: 14px !important;
        `;
        
        // Position near the selection
        const rect = this.selectedRange.getBoundingClientRect();
        const leftPos = Math.min(window.innerWidth - 200, rect.left);
        const topPos = rect.bottom + 5;
        
        
        contextMenu.style.left = leftPos + 'px';
        contextMenu.style.top = topPos + 'px';
        
        // Create buttons with proper event listeners
        const addNoteBtn = document.createElement('button');
        addNoteBtn.className = 'context-menu-btn';
        addNoteBtn.textContent = '📝 Add Note';
        addNoteBtn.style.cssText = `
            background: #1976d2 !important;
            color: white !important;
            border: none !important;
            padding: 6px 12px !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            font-size: 12px !important;
        `;
        addNoteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.addSelectedNote();
        });
        
        const highlightBtn = document.createElement('button');
        highlightBtn.className = 'context-menu-btn';
        highlightBtn.textContent = '🖍️ Highlight';
        highlightBtn.style.cssText = `
            background: #ff9800 !important;
            color: white !important;
            border: none !important;
            padding: 6px 12px !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            font-size: 12px !important;
        `;
        highlightBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.highlightSelected();
        });
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'context-menu-btn';
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: #666 !important;
            color: white !important;
            border: none !important;
            padding: 6px 12px !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            font-size: 12px !important;
        `;
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hideSelectionContextMenu();
        });
        
        // Add buttons to context menu
        contextMenu.appendChild(addNoteBtn);
        contextMenu.appendChild(highlightBtn);
        contextMenu.appendChild(closeBtn);
        
        
        document.body.appendChild(contextMenu);
        this.contextMenu = contextMenu;
        
    }
    
    hideSelectionContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.remove();
            this.contextMenu = null;
        }
    }
    
    addSelectedNote() {
        if (this.selectedText && this.selectedRange) {
            this.createAnchoredNote(this.selectedText, this.selectedRange);
            this.hideSelectionContextMenu();
            
            // Open scratchpad panel after adding note
            setTimeout(() => {
                this.openPanel();
            }, 500); // Small delay to let the note be created first
        }
        window.getSelection().removeAllRanges(); // Clear selection after adding note
    }
    
    highlightSelected() {
        if (this.selectedRange) {
            try {
                // Clone the range to avoid modifying the original
                const range = this.selectedRange.cloneRange();
                
                // Create highlight span
                const span = document.createElement('span');
                span.className = 'text-selection-highlight';
                span.style.cssText = `
                    background: rgba(255, 235, 59, 0.5) !important;
                    border-radius: 2px !important;
                    padding: 1px 2px !important;
                `;
                span.title = 'Highlighted text: ' + this.selectedText;
                
                // Try to surround the contents
                range.surroundContents(span);
                
            } catch (error) {
                
                // Alternative method: extract and replace
                try {
                    const range = this.selectedRange.cloneRange();
                    const contents = range.extractContents();
                    
                    const span = document.createElement('span');
                    span.className = 'text-selection-highlight';
                    span.style.cssText = `
                        background: rgba(255, 235, 59, 0.5) !important;
                        border-radius: 2px !important;
                        padding: 1px 2px !important;
                    `;
                    span.title = 'Highlighted text: ' + this.selectedText;
                    span.appendChild(contents);
                    
                    range.insertNode(span);
                } catch (altError) {
                    console.error('Failed to highlight text:', altError);
                }
            }
            this.hideSelectionContextMenu();
        }
    }
    
    async createAnchoredNote(selectedText, range) {
        console.log('🚀 SCRATCHPAD: Creating anchored note with data:', {
            selectedText: selectedText.substring(0, 50) + '...',
            paperId: window.currentPaperId,
            hasRange: !!range
        });
        
        const anchorData = {
            selection_text: selectedText,
            start_offset: range ? range.startOffset : 0,
            end_offset: range ? range.endOffset : 0,
            context: range ? this.getSelectionContext(range) : ''
        };
        
        try {
            const requestData = {
                paper_id: window.currentPaperId || 'unknown',
                content: `Note for: "${selectedText.substring(0, 100)}${selectedText.length > 100 ? '...' : ''}"`, // Pre-fill with selection
                note_type: 'anchored',
                anchor_data: anchorData
            };
            
            console.log('🚀 SCRATCHPAD: Sending note creation request:', requestData);
            
            const response = await fetch('/api/scratchpad', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });
            
            console.log('🚀 SCRATCHPAD: Note creation response status:', response.status);
            
            const result = await response.json();
            console.log('🚀 SCRATCHPAD: Note creation result:', result);
            
            if (result.success) {
                console.log('✅ SCRATCHPAD: Note created successfully with ID:', result.note_id);
                
                // Highlight the selected text if range exists
                if (range) {
                    this.highlightText(range, result.note_id);
                }
                
                // Reload notes to show the new one
                await this.loadNotes();
                console.log('✅ SCRATCHPAD: Notes reloaded after creation');
            } else {
                console.error('❌ SCRATCHPAD: Failed to create note:', result.error);
            }
        } catch (error) {
            console.error('❌ SCRATCHPAD: Error creating anchored note:', error);
        }
    }
    
    getSelectionContext(range) {
        // Get surrounding text for context
        const container = range.commonAncestorContainer;
        const textContent = container.textContent || container.innerText || '';
        const start = Math.max(0, range.startOffset - 50);
        const end = Math.min(textContent.length, range.endOffset + 50);
        return textContent.substring(start, end);
    }
    
    highlightText(range, noteId) {
        try {
            const span = document.createElement('span');
            span.className = 'text-selection-highlight has-note';
            span.setAttribute('data-note-id', noteId);
            span.title = 'Click to view note';
            
            range.surroundContents(span);
        } catch (error) {
            console.warn('Could not highlight text:', error);
        }
    }
    
    async loadNotes() {
        console.log('🚀 SCRATCHPAD: Loading notes for paper:', window.currentPaperId);
        
        if (!window.currentPaperId) {
            console.log('⚠️ SCRATCHPAD: No currentPaperId available yet');
            return;
        }
        
        try {
            const url = `/api/scratchpad/${window.currentPaperId}`;
            console.log('🚀 SCRATCHPAD: Fetching from:', url);
            
            const response = await fetch(url);
            console.log('🚀 SCRATCHPAD: Response status:', response.status);
            
            const result = await response.json();
            console.log('🚀 SCRATCHPAD: API result:', result);
            
            if (result.success) {
                this.notes = result.notes;
                console.log('✅ SCRATCHPAD: Loaded', result.notes.length, 'notes');
                this.renderNotes();
                this.updateFAB();
            } else {
                console.error('❌ SCRATCHPAD: API error:', result.error);
            }
        } catch (error) {
            console.error('❌ SCRATCHPAD: Failed to load notes:', error);
        }
    }
    
    renderNotes() {
        const content = document.getElementById('scratchpad-content');
        const addButton = content.querySelector('.scratchpad-add-note');
        
        // Clear existing notes
        const existingNotes = content.querySelectorAll('.scratchpad-note');
        existingNotes.forEach(note => note.remove());
        
        // Render notes
        this.notes.forEach(note => {
            const noteElement = this.createNoteElement(note);
            content.insertBefore(noteElement, addButton);
        });
    }
    
    createNoteElement(note, isReply = false) {
        const div = document.createElement('div');
        div.className = `scratchpad-note ${note.note_type} ${isReply ? 'reply' : ''}`;
        div.setAttribute('data-note-id', note.id);
        
        // Apply box styling to each note with reply indentation
        const marginLeft = isReply ? '20px' : '0';
        const backgroundColor = isReply && note.reply_type === 'ai' ? '#f0f8ff' : 'white';
        const borderLeft = isReply && note.reply_type === 'ai' ? '4px solid #4CAF50' : '1px solid #e0e0e0';
        
        div.style.cssText = `
            background: ${backgroundColor} !important;
            border: 1px solid #e0e0e0 !important;
            border-left: ${borderLeft} !important;
            border-radius: 8px !important;
            margin-bottom: 16px !important;
            margin-left: ${marginLeft} !important;
            padding: 16px !important;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
        `;
        
        let anchorHtml = '';
        if (note.note_type === 'anchored' && note.anchor_data) {
            anchorHtml = `
                <div class="scratchpad-anchor-text" style="
                    border-left: 4px solid #1976d2 !important;
                    padding-left: 12px !important;
                    margin-bottom: 12px !important;
                    font-style: italic !important;
                    color: #666 !important;
                    background: #f8f9fa !important;
                    padding: 8px 12px !important;
                    border-radius: 4px !important;
                ">
                    "${note.anchor_data.selection_text}"
                </div>
            `;
        }
        
        // AI reply indicator
        let aiIndicator = '';
        if (note.reply_type === 'ai') {
            const sources = note.ai_metadata?.sources || [];
            const sourcesText = sources.length > 0 ? `Sources: ${sources.join(', ')}` : 'AI Generated';
            aiIndicator = `
                <div class="ai-indicator" style="
                    background: #e8f5e8 !important;
                    border: 1px solid #4CAF50 !important;
                    border-radius: 4px !important;
                    padding: 6px 10px !important;
                    margin-bottom: 10px !important;
                    font-size: 11px !important;
                    color: #2e7d32 !important;
                ">
                    🤖 ${sourcesText}
                </div>
            `;
        }
        
        // Reply controls for non-reply notes
        let replyControls = '';
        if (!isReply) {
            replyControls = `
                <div class="scratchpad-reply-controls" style="
                    display: flex !important;
                    gap: 8px !important;
                    margin-top: 12px !important;
                    padding-top: 12px !important;
                ">
                    <button class="scratchpad-reply-btn" onclick="window.scratchpad.showReplyBox(${note.id})" title="Reply" style="
                        background: #f5f5f5 !important;
                        border: 1px solid #ddd !important;
                        font-size: 12px !important;
                        padding: 4px 8px !important;
                        border-radius: 4px !important;
                        cursor: pointer !important;
                        color: #666 !important;
                    ">💬 Reply</button>
                    <button class="scratchpad-ai-btn" onclick="window.scratchpad.createAiReply(${note.id})" title="Ask AI" style="
                        background: #e8f5e8 !important;
                        border: 1px solid #4CAF50 !important;
                        font-size: 12px !important;
                        padding: 4px 8px !important;
                        border-radius: 4px !important;
                        cursor: pointer !important;
                        color: #2e7d32 !important;
                    ">🤖 Ask AI</button>
                </div>
            `;
        }
        
        div.innerHTML = `
            <div class="scratchpad-note-header" style="
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                margin-bottom: 12px !important;
            ">
                <span class="scratchpad-note-type" style="
                    font-size: 12px !important;
                    color: #666 !important;
                    text-transform: uppercase !important;
                    font-weight: 500 !important;
                ">${note.note_type}${note.reply_type ? ` (${note.reply_type})` : ''}</span>
                <div class="scratchpad-note-actions" style="
                    display: flex !important;
                    gap: 4px !important;
                ">
                    <button class="scratchpad-note-action" onclick="window.scratchpad.editNote(${note.id})" title="Edit" style="
                        background: none !important;
                        border: none !important;
                        font-size: 14px !important;
                        cursor: pointer !important;
                        padding: 4px !important;
                        border-radius: 4px !important;
                        opacity: 0.7 !important;
                    ">✏️</button>
                    <button class="scratchpad-note-action" onclick="window.scratchpad.deleteNote(${note.id})" title="Delete" style="
                        background: none !important;
                        border: none !important;
                        font-size: 14px !important;
                        cursor: pointer !important;
                        padding: 4px !important;
                        border-radius: 4px !important;
                        opacity: 0.7 !important;
                    ">🗑️</button>
                </div>
            </div>
            ${anchorHtml}
            ${aiIndicator}
            <div class="scratchpad-note-content" data-note-id="${note.id}" style="
                min-height: 40px !important;
                line-height: 1.5 !important;
                color: #333 !important;
                cursor: text !important;
                padding: 8px !important;
                border-radius: 4px !important;
                border: 1px solid transparent !important;
            ">
                ${note.content || 'Click to add note...'}
            </div>
            ${replyControls}
        `;
        
        // Add replies if they exist
        if (note.replies && note.replies.length > 0) {
            const repliesContainer = document.createElement('div');
            repliesContainer.className = 'scratchpad-replies';
            repliesContainer.style.cssText = `
                margin-top: 16px !important;
                padding-top: 12px !important;
            `;
            
            note.replies.forEach(reply => {
                const replyElement = this.createNoteElement(reply, true);
                repliesContainer.appendChild(replyElement);
            });
            
            div.appendChild(repliesContainer);
        }
        
        return div;
    }
    
    async addNote() {
        try {
            const response = await fetch('/api/scratchpad', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    paper_id: window.currentPaperId || 'unknown',
                    content: '',
                    note_type: 'unanchored'
                })
            });
            
            const result = await response.json();
            if (result.success) {
                await this.loadNotes();
                this.focusNote(result.note_id);
            }
        } catch (error) {
            console.error('Failed to create note:', error);
        }
    }
    
    editNote(noteId) {
        const noteContent = document.querySelector(`[data-note-id="${noteId}"].scratchpad-note-content`);
        if (noteContent) {
            noteContent.contentEditable = true;
            noteContent.focus();
            
            // Add editing styles
            noteContent.style.border = '1px solid #1976d2';
            noteContent.style.background = '#f8f9fa';
            noteContent.style.outline = 'none';
            
            const saveNote = () => {
                noteContent.contentEditable = false;
                // Reset styles
                noteContent.style.border = '1px solid transparent';
                noteContent.style.background = 'transparent';
                this.saveNote(noteId, noteContent.textContent);
                noteContent.removeEventListener('blur', saveNote);
                noteContent.removeEventListener('keydown', handleKeydown);
            };
            
            const handleKeydown = (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    saveNote();
                }
                if (e.key === 'Escape') {
                    noteContent.contentEditable = false;
                    // Reset styles
                    noteContent.style.border = '1px solid transparent';
                    noteContent.style.background = 'transparent';
                    this.loadNotes(); // Reload to discard changes
                    noteContent.removeEventListener('blur', saveNote);
                    noteContent.removeEventListener('keydown', handleKeydown);
                }
            };
            
            noteContent.addEventListener('blur', saveNote);
            noteContent.addEventListener('keydown', handleKeydown);
        }
    }
    
    async saveNote(noteId, content) {
        // Debounced save
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(async () => {
            try {
                await fetch(`/api/scratchpad/${noteId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ content })
                });
            } catch (error) {
                console.error('Failed to save note:', error);
            }
        }, 1000);
    }
    
    async deleteNote(noteId) {
        if (!confirm('Delete this note?')) return;
        
        try {
            const response = await fetch(`/api/scratchpad/${noteId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Remove highlight if it exists
                const highlight = document.querySelector(`[data-note-id="${noteId}"]`);
                if (highlight && highlight.classList.contains('text-selection-highlight')) {
                    const parent = highlight.parentNode;
                    parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
                    parent.normalize();
                }
                
                // Refresh the notes list
                await this.loadNotes();
            } else {
                console.error('Failed to delete note:', result.error);
            }
        } catch (error) {
            console.error('Failed to delete note:', error);
        }
    }
    
    focusNote(noteId) {
        const noteContent = document.querySelector(`[data-note-id="${noteId}"].scratchpad-note-content`);
        if (noteContent) {
            this.editNote(noteId);
        }
    }
    
    showNotePreview(event) {
        const highlight = event.target;
        const noteId = highlight.getAttribute('data-note-id');
        const note = this.notes.find(n => n.id == noteId);
        
        if (!note || !note.content) return;
        
        // Remove existing popup
        const existingPopup = document.querySelector('.note-preview-popup');
        if (existingPopup) existingPopup.remove();
        
        // Create popup
        const popup = document.createElement('div');
        popup.className = 'note-preview-popup';
        popup.textContent = note.content;
        
        // Position popup
        const rect = highlight.getBoundingClientRect();
        popup.style.left = rect.left + 'px';
        popup.style.top = (rect.top - 60) + 'px';
        
        document.body.appendChild(popup);
        
        // Remove popup after delay or on click
        setTimeout(() => popup.remove(), 3000);
        popup.addEventListener('click', () => popup.remove());
    }
    
    toggleIntegration() {
        console.log('🚀 SCRATCHPAD: Toggling integration');
        const rightPane = document.getElementById('info-pane');
        
        if (!this.isIntegrated) {
            // Show scratchpad, hide original content
            this.scratchpadContent.style.display = 'flex';
            this.toggleBtn.style.display = 'none';
            
            // Hide all other children of right pane except scratchpad
            Array.from(rightPane.children).forEach(child => {
                if (!child.classList.contains('scratchpad-integrated') && 
                    !child.classList.contains('scratchpad-toggle')) {
                    child.style.display = 'none';
                }
            });
            
            this.isIntegrated = true;
            this.loadNotes();
            console.log('✅ SCRATCHPAD: Integrated into right pane');
        } else {
            // Hide scratchpad, show original content
            this.scratchpadContent.style.display = 'none';
            this.toggleBtn.style.display = 'flex';
            
            // Show all other children of right pane
            Array.from(rightPane.children).forEach(child => {
                if (!child.classList.contains('scratchpad-integrated')) {
                    child.style.display = '';
                }
            });
            
            this.isIntegrated = false;
            console.log('✅ SCRATCHPAD: Minimized from right pane');
        }
    }
    
    togglePanel() {
        // For compatibility with overlay mode
        if (this.scratchpadContent) {
            this.toggleIntegration();
        } else if (this.panel) {
            if (this.isOpen) {
                this.closePanel();
            } else {
                this.openPanel();
            }
        }
    }
    
    openPanel() {
        console.log('🚀 SCRATCHPAD: Opening panel');
        if (this.scratchpadContent) {
            this.toggleIntegration();
        } else if (this.panel) {
            this.panel.style.transform = 'translateX(0)';
            this.isOpen = true;
            this.loadNotes();
            console.log('✅ SCRATCHPAD: Panel opened');
        } else {
            console.error('❌ SCRATCHPAD: Panel not found when trying to open');
        }
    }
    
    closePanel() {
        console.log('🚀 SCRATCHPAD: Closing panel');
        if (this.scratchpadContent && this.isIntegrated) {
            this.toggleIntegration();
        } else if (this.panel) {
            this.panel.style.transform = 'translateX(100%)';
            this.isOpen = false;
            console.log('✅ SCRATCHPAD: Panel closed');
        } else {
            console.error('❌ SCRATCHPAD: Panel not found when trying to close');
        }
    }
    
    updateFAB() {
        const hasNotes = this.notes && this.notes.length > 0;
        
        // Update toggle button if using integrated mode
        if (this.toggleBtn) {
            if (hasNotes) {
                this.toggleBtn.style.background = '#1976d2';
                this.toggleBtn.title = `Scratchpad (${this.notes.length} notes)`;
            } else {
                this.toggleBtn.style.background = '#1976d2';
                this.toggleBtn.title = 'Scratchpad';
            }
        }
        
        // Update FAB if using overlay mode
        if (this.fab) {
            if (hasNotes) {
                this.fab.classList.add('has-notes');
                this.fab.title = `Scratchpad (${this.notes.length} notes)`;
            } else {
                this.fab.classList.remove('has-notes');
                this.fab.title = 'Scratchpad';
            }
        }
    }
    
    showReplyBox(noteId) {
        // Check if reply box already exists
        const existingBox = document.querySelector(`[data-reply-to="${noteId}"]`);
        if (existingBox) {
            existingBox.remove();
            return;
        }
        
        // Create reply input box
        const replyBox = document.createElement('div');
        replyBox.className = 'scratchpad-reply-box';
        replyBox.setAttribute('data-reply-to', noteId);
        
        replyBox.style.cssText = `
            margin: 10px 0 10px 20px !important;
            padding: 12px !important;
            border: 2px solid #1976d2 !important;
            border-radius: 8px !important;
            background: #f8f9fa !important;
        `;
        
        replyBox.innerHTML = `
            <div style="margin-bottom: 8px; font-size: 12px; color: #666;">replying to note...</div>
            <textarea placeholder="write your reply..." style="
                width: 100% !important;
                min-height: 60px !important;
                border: 1px solid #ddd !important;
                border-radius: 4px !important;
                padding: 8px !important;
                font-family: inherit !important;
                resize: vertical !important;
                box-sizing: border-box !important;
            "></textarea>
            <div style="margin-top: 8px; text-align: right;">
                <button onclick="window.scratchpad.cancelReply(${noteId})" style="
                    background: #f5f5f5 !important;
                    border: 1px solid #ddd !important;
                    padding: 4px 12px !important;
                    border-radius: 4px !important;
                    cursor: pointer !important;
                    margin-right: 8px !important;
                    font-size: 12px !important;
                ">cancel</button>
                <button onclick="window.scratchpad.submitReply(${noteId})" style="
                    background: #1976d2 !important;
                    color: white !important;
                    border: 1px solid #1976d2 !important;
                    padding: 4px 12px !important;
                    border-radius: 4px !important;
                    cursor: pointer !important;
                    font-size: 12px !important;
                ">reply</button>
            </div>
        `;
        
        // Insert after the note
        const noteElement = document.querySelector(`[data-note-id="${noteId}"]`);
        if (noteElement) {
            noteElement.insertAdjacentElement('afterend', replyBox);
            const textarea = replyBox.querySelector('textarea');
            textarea.focus();
        }
    }
    
    cancelReply(noteId) {
        const replyBox = document.querySelector(`[data-reply-to="${noteId}"]`);
        if (replyBox) {
            replyBox.remove();
        }
    }
    
    async submitReply(noteId) {
        const replyBox = document.querySelector(`[data-reply-to="${noteId}"]`);
        if (!replyBox) return;
        
        const textarea = replyBox.querySelector('textarea');
        const content = textarea.value.trim();
        
        if (!content) {
            alert('please enter a reply');
            return;
        }
        
        try {
            const response = await fetch(`/api/scratchpad/${noteId}/reply`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content })
            });
            
            const result = await response.json();
            if (result.success) {
                replyBox.remove();
                await this.loadNotes();
            } else {
                alert('failed to create reply: ' + result.error);
            }
        } catch (error) {
            console.error('failed to create reply:', error);
            alert('failed to create reply');
        }
    }
    
    async createAiReply(noteId) {
        const aiBtn = document.querySelector(`[data-note-id="${noteId}"] .scratchpad-ai-btn`);
        if (aiBtn) {
            aiBtn.textContent = '🤖 generating...';
            aiBtn.disabled = true;
        }
        
        try {
            const response = await fetch(`/api/scratchpad/${noteId}/ai-reply`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({})
            });
            
            const result = await response.json();
            if (result.success) {
                await this.loadNotes();
            } else {
                alert('failed to generate ai reply: ' + result.error);
            }
        } catch (error) {
            console.error('failed to generate ai reply:', error);
            alert('failed to generate ai reply');
        } finally {
            if (aiBtn) {
                aiBtn.textContent = '🤖 Ask AI';
                aiBtn.disabled = false;
            }
        }
    }
    
}

// Initialize scratchpad - called by PDF renderer when PDF is fully loaded
let scratchpad;

console.log('🚀 SCRATCHPAD: Script loaded');

window.initializeScratchpad = function() {
    console.log('🚀 SCRATCHPAD: Initializing scratchpad manager');
    try {
        // Only create if doesn't exist
        if (!scratchpad) {
            scratchpad = new ScratchpadManager();
            window.scratchpad = scratchpad;
            console.log('✅ SCRATCHPAD: Scratchpad manager created and assigned to window');
        } else {
            // Just recreate UI if scratchpad already exists
            scratchpad.createScratchpadUI();
            console.log('✅ SCRATCHPAD: Recreated scratchpad UI');
        }
        
    } catch (error) {
        console.error('❌ SCRATCHPAD: Failed to initialize:', error);
    }
};