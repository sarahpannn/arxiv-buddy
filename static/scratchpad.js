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
        // Check if elements already exist
        if (document.querySelector('.scratchpad-fab')) {
            return;
        }
        
        try {
            // Create floating action button
            const fab = document.createElement('button');
            fab.className = 'scratchpad-fab';
            fab.innerHTML = '📝';
            fab.title = 'Open Scratchpad';
            fab.onclick = () => this.togglePanel();
            
            // Force inline styles to ensure visibility
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
            
            // Create scratchpad panel with forced styles for debugging
            const panel = document.createElement('div');
            panel.className = 'scratchpad-panel';
            
            // Force visible styles for debugging
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
            
        } catch (error) {
            console.error('Failed to create scratchpad UI:', error);
        }
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
    
    createNoteElement(note) {
        const div = document.createElement('div');
        div.className = `scratchpad-note ${note.note_type}`;
        div.setAttribute('data-note-id', note.id);
        
        // Apply box styling to each note
        div.style.cssText = `
            background: white !important;
            border: 1px solid #e0e0e0 !important;
            border-radius: 8px !important;
            margin-bottom: 16px !important;
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
                ">${note.note_type}</span>
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
        `;
        
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
    
    togglePanel() {
        if (this.isOpen) {
            this.closePanel();
        } else {
            this.openPanel();
        }
    }
    
    openPanel() {
        console.log('🚀 SCRATCHPAD: Opening panel');
        if (this.panel) {
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
        if (this.panel) {
            this.panel.style.transform = 'translateX(100%)';
            this.isOpen = false;
            console.log('✅ SCRATCHPAD: Panel closed');
        } else {
            console.error('❌ SCRATCHPAD: Panel not found when trying to close');
        }
    }
    
    updateFAB() {
        if (this.notes && this.notes.length > 0) {
            this.fab.classList.add('has-notes');
            this.fab.title = `Scratchpad (${this.notes.length} notes)`;
        } else {
            this.fab.classList.remove('has-notes');
            this.fab.title = 'Scratchpad';
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