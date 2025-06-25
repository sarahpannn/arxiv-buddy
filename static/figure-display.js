// Function to display figure information in the right panel
window.displayFigureInfo = function(figureInfo) {
    console.log('=== DISPLAYING FIGURE INFO ===');
    console.log('Figure info received:', figureInfo);
    console.log('Figure info area:', figureInfo.area);
    console.log('Has imageDataUrl:', !!(figureInfo.area && figureInfo.area.imageDataUrl));
    if (figureInfo.area && figureInfo.area.imageDataUrl) {
        console.log('Image data URL preview:', figureInfo.area.imageDataUrl.substring(0, 50) + '...');
    }
    
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
                    <div style="position: relative;">
                        <div style="width: 100%; height: 400px; background: #e9ecef; border-radius: 4px; margin-bottom: 10px; overflow: auto; border: 2px solid #ddd; position: relative;" 
                             id="figure-container-${figureInfo.number || 'unknown'}">
                            ${figureInfo.area && figureInfo.area.imageDataUrl ? 
                                `<img src="${figureInfo.area.imageDataUrl}" 
                                      id="figure-image-${figureInfo.number || 'unknown'}"
                                      style="display: block; max-width: none; height: auto; min-width: 100%; transform-origin: top left; transition: transform 0.2s ease;" 
                                      alt="Figure ${figureInfo.number || 'Unknown'}" 
                                      title="Pinch to zoom, scroll to pan" />` :
                                `<div style="display: flex; align-items: center; justify-content: center; height: 100%; text-align: center; color: #6c757d; font-size: 14px;">
                                    📊 Figure Preview<br>
                                    <small>(No image found or extraction failed)</small>
                                 </div>`
                            }
                        </div>
                        ${figureInfo.area && figureInfo.area.imageDataUrl ? 
                            `<div style="display: flex; gap: 5px; align-items: center; margin-bottom: 5px;">
                                <button onclick="window.zoomFigure('${figureInfo.number || 'unknown'}', 0.8)" 
                                        style="background: #6c757d; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">
                                    🔍−
                                </button>
                                <button onclick="window.zoomFigure('${figureInfo.number || 'unknown'}', 1.25)" 
                                        style="background: #6c757d; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">
                                    🔍+
                                </button>
                                <button onclick="window.resetFigureZoom('${figureInfo.number || 'unknown'}')" 
                                        style="background: #007acc; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">
                                    Reset
                                </button>
                                <span style="font-size: 11px; color: #666; margin-left: 10px;">
                                    Pinch to zoom • Scroll to pan
                                </span>
                            </div>` : ''
                        }
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
                    <strong>💡 Note:</strong> Figure extracted from PDF page. Use scrollbars to view the complete image if it extends beyond the preview area.
                </div>
            </div>
        `;
        
        console.log('Setting innerHTML...');
        rightPane.innerHTML = html;
        console.log('Figure info display completed successfully');
        
        // Set up zoom functionality after the HTML is inserted
        if (figureInfo.area && figureInfo.area.imageDataUrl) {
            setupFigureZoom(figureInfo.number || 'unknown');
        }
        
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

// Zoom functionality for figure images
let figureZoomStates = {};

window.zoomFigure = function(figureId, factor) {
    const img = document.getElementById(`figure-image-${figureId}`);
    if (!img) return;
    
    if (!figureZoomStates[figureId]) {
        figureZoomStates[figureId] = { scale: 1 };
    }
    
    figureZoomStates[figureId].scale *= factor;
    
    // Limit zoom range
    figureZoomStates[figureId].scale = Math.max(0.1, Math.min(5, figureZoomStates[figureId].scale));
    
    img.style.transform = `scale(${figureZoomStates[figureId].scale})`;
}

window.resetFigureZoom = function(figureId) {
    const img = document.getElementById(`figure-image-${figureId}`);
    if (!img) return;
    
    figureZoomStates[figureId] = { scale: 1 };
    img.style.transform = 'scale(1)';
}

function setupFigureZoom(figureId) {
    const container = document.getElementById(`figure-container-${figureId}`);
    const img = document.getElementById(`figure-image-${figureId}`);
    
    if (!container || !img) return;
    
    // Initialize zoom state
    figureZoomStates[figureId] = { scale: 1 };
    
    // Touch zoom variables
    let initialDistance = 0;
    let initialScale = 1;
    let isZooming = false;
    
    // Touch start handler
    container.addEventListener('touchstart', function(e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            isZooming = true;
            
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            initialDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            initialScale = figureZoomStates[figureId].scale;
        }
    }, { passive: false });
    
    // Touch move handler (pinch zoom)
    container.addEventListener('touchmove', function(e) {
        if (e.touches.length === 2 && isZooming) {
            e.preventDefault();
            
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const currentDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            
            const scale = initialScale * (currentDistance / initialDistance);
            
            // Limit zoom range
            figureZoomStates[figureId].scale = Math.max(0.1, Math.min(5, scale));
            img.style.transform = `scale(${figureZoomStates[figureId].scale})`;
        }
    }, { passive: false });
    
    // Touch end handler
    container.addEventListener('touchend', function(e) {
        if (e.touches.length < 2) {
            isZooming = false;
        }
    });
    
    // Mouse wheel zoom (for desktop)
    container.addEventListener('wheel', function(e) {
        if (e.ctrlKey) {
            e.preventDefault();
            
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            window.zoomFigure(figureId, factor);
        }
    }, { passive: false });
}

// Test function to manually test figure display
window.testFigureDisplay = function() {
    console.log('Testing figure display...');
    const testFigureInfo = {
        type: 'figure',
        number: '1',
        caption: 'This is a test figure caption to verify the UI is working correctly.',
        pageNumber: 1,
        area: { 
            x: 0, 
            y: 0, 
            width: 400, 
            height: 200,
            imageDataUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzMzMyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkZha2UgRmlndXJlPC90ZXh0Pjwvc3ZnPg=='
        }
    };
    window.displayFigureInfo(testFigureInfo);
}