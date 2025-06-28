// Function to display figure information in the right panel
window.displayFigureInfo = async function(figureInfo) {
    console.log('=== DISPLAYING FIGURE INFO ===');
    console.log('Figure info received:', figureInfo);
    console.log('Figure info area:', figureInfo.area);
    console.log('Has imageDataUrl:', !!(figureInfo.area && figureInfo.area.imageDataUrl));
    if (figureInfo.area && figureInfo.area.imageDataUrl) {
        console.log('Image data URL preview:', figureInfo.area.imageDataUrl.substring(0, 50) + '...');
    }
    
    // Skip source image search - just use PDF extraction
    
    const rightPane = document.getElementById('info-pane');
    console.log('Right pane element:', rightPane);
    
    if (!rightPane) {
        console.error('Could not find info-pane element!');
        return;
    }
    
    try {
        const typeLabel = (figureInfo.type || 'figure').charAt(0).toUpperCase() + (figureInfo.type || 'figure').slice(1);
        const html = `
            <div style="padding: 20px; font-family: Arial, sans-serif;">
                <h3 style="margin: 0 0 15px 0; color: #333; border-bottom: 2px solid #007acc; padding-bottom: 10px;">
                    ${typeLabel} ${figureInfo.number || 'Unknown'}
                </h3>
                
                <div style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                    <div style="position: relative;">
                        <div style="width: 100%; max-width: 100%; height: 400px; background: #e9ecef; border-radius: 4px; margin-bottom: 10px; overflow: auto; border: 2px solid #ddd; position: relative; box-sizing: border-box;" 
                             id="figure-container-${figureInfo.number || 'unknown'}">
                            ${figureInfo.area && figureInfo.area.imageDataUrl ? 
                                `<img src="${figureInfo.area.imageDataUrl}" 
                                      id="figure-image-${figureInfo.number || 'unknown'}"
                                      style="display: block; max-width: 100%; height: auto; box-sizing: border-box; transform-origin: top left; transition: transform 0.2s ease;" 
                                      alt="Figure ${figureInfo.number || 'Unknown'}" 
                                      title="PDF extraction - pinch to zoom, scroll to pan" />
                                 <div style="position: absolute; top: 5px; right: 5px; background: rgba(108,117,125,0.8); color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px;">
                                     📄 PDF
                                 </div>` :
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
                    <strong>💡 Note:</strong> Figure extracted from PDF page. Use scrollbars to view the complete image if it extends beyond the preview area. Alpha v0 figure grabbing might be buggy. Feedback graciously appreciated @spantacular on X.
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

// Function to find actual image files in source directories
async function findSourceImageForFigure(figureInfo) {
    try {
        // Extract paper ID from current URL or global context
        const paperId = getCurrentPaperId();
        if (!paperId) {
            console.log('📄 No paper ID available for source search');
            return null;
        }
        
        console.log('🔍 Searching for source images for paper:', paperId);
        console.log('🔍 Figure info:', {
            label: figureInfo.number,
            caption: figureInfo.caption?.substring(0, 50) + '...'
        });
        
        // PRIMARY STRATEGY: Parse LaTeX files for exact includegraphics path
        const latexResult = await findImageInLatexSource(paperId, figureInfo.number);
        if (latexResult) {
            console.log('✅ Found image path in LaTeX source:', latexResult.url);
            return latexResult;
        }
        
        // FALLBACK: Try generic approaches if LaTeX parsing fails
        console.log('⚠️ LaTeX parsing failed, trying fallback strategies');
        const fallbackStrategies = [
            () => findImageByFilename(paperId, figureInfo.number),
            () => findFirstAvailableImage(paperId)
        ];
        
        for (const strategy of fallbackStrategies) {
            const result = await strategy();
            if (result) {
                console.log('✅ Found source image using fallback strategy');
                return result;
            }
        }
        
        console.log('❌ No source image found');
        return null;
        
    } catch (error) {
        console.error('Error finding source image:', error);
        return null;
    }
}

// Helper function to get current paper ID
function getCurrentPaperId() {
    // Try to extract from URL or window location
    const url = window.location.href;
    const match = url.match(/\/(\d{4}\.\d{4,5}(?:v\d+)?)/);
    if (match) return match[1];
    
    // Try to get from global window object if available
    if (window.currentPaperId) return window.currentPaperId;
    
    // Try to extract from static file paths
    const staticMatch = document.querySelector('script[src*="static/"]');
    if (staticMatch) {
        const src = staticMatch.src;
        const pathMatch = src.match(/\/(\d{4}\.\d{4,5}(?:v\d+)?)/);
        if (pathMatch) return pathMatch[1];
    }
    
    return null;
}

// Find image by exact label match
async function findImageByLabel(paperId, label) {
    if (!label) return null;
    
    const imageExtensions = ['png', 'jpg', 'jpeg', 'pdf', 'eps'];
    const possiblePaths = [
        `/static/sources/${paperId}/images/${label}.png`,
        `/static/sources/${paperId}/images/${label}.jpg`,
        `/static/sources/${paperId}/images/${label}.jpeg`,
        `/static/sources/${paperId}/figures/${label}.png`,
        `/static/sources/${paperId}/figures/${label}.jpg`,
        `/static/sources/${paperId}/${label}.png`,
        `/static/sources/${paperId}/${label}.jpg`
    ];
    
    for (const path of possiblePaths) {
        if (await checkImageExists(path)) {
            return {
                url: path,
                filename: path.split('/').pop(),
                source: 'label_match'
            };
        }
    }
    
    return null;
}

// Find image by searching caption for filename hints
async function findImageByCaption(paperId, caption) {
    if (!caption) return null;
    
    // Look for filename patterns in caption
    const filenamePattern = /([a-zA-Z0-9_-]+\.(png|jpg|jpeg|pdf|eps))/gi;
    const matches = caption.match(filenamePattern);
    
    if (matches) {
        for (const filename of matches) {
            const possiblePaths = [
                `/static/sources/${paperId}/images/${filename}`,
                `/static/sources/${paperId}/figures/${filename}`,
                `/static/sources/${paperId}/${filename}`
            ];
            
            for (const path of possiblePaths) {
                if (await checkImageExists(path)) {
                    return {
                        url: path,
                        filename: filename,
                        source: 'caption_match'
                    };
                }
            }
        }
    }
    
    return null;
}

// Find image by common filename patterns
async function findImageByFilename(paperId, figureNumber) {
    if (!figureNumber) return null;
    
    // Extract number from figure label
    const numberMatch = figureNumber.match(/(\d+)/);
    const num = numberMatch ? numberMatch[1] : '1';
    
    const commonPatterns = [
        `figure${num}`,
        `fig${num}`,
        `image${num}`,
        `figure_${num}`,
        `fig_${num}`,
        num
    ];
    
    const extensions = ['png', 'jpg', 'jpeg'];
    const directories = ['images', 'figures', ''];
    
    for (const pattern of commonPatterns) {
        for (const ext of extensions) {
            for (const dir of directories) {
                const path = dir ? 
                    `/static/sources/${paperId}/${dir}/${pattern}.${ext}` :
                    `/static/sources/${paperId}/${pattern}.${ext}`;
                
                if (await checkImageExists(path)) {
                    return {
                        url: path,
                        filename: `${pattern}.${ext}`,
                        source: 'filename_pattern'
                    };
                }
            }
        }
    }
    
    return null;
}

// Find any available image as fallback
async function findFirstAvailableImage(paperId) {
    const directories = ['images', 'figures'];
    const extensions = ['png', 'jpg', 'jpeg'];
    
    for (const dir of directories) {
        for (const ext of extensions) {
            // Try common filenames
            const commonNames = ['figure1', 'fig1', 'image1', 'teaser', 'overview'];
            
            for (const name of commonNames) {
                const path = `/static/sources/${paperId}/${dir}/${name}.${ext}`;
                if (await checkImageExists(path)) {
                    return {
                        url: path,
                        filename: `${name}.${ext}`,
                        source: 'fallback_search'
                    };
                }
            }
        }
    }
    
    return null;
}

// Check if an image exists at the given URL
async function checkImageExists(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        return false;
    }
}

// Find image by parsing LaTeX source files for exact includegraphics path
async function findImageInLatexSource(paperId, figureLabel) {
    try {
        console.log('🔍 Parsing LaTeX source files for figure:', figureLabel);
        
        // Get list of .tex files in the source directory
        const texFiles = await getTexFiles(paperId);
        if (!texFiles || texFiles.length === 0) {
            console.log('📄 No .tex files found in source directory');
            return null;
        }
        
        console.log('📄 Found .tex files:', texFiles);
        
        // Parse each .tex file to find the figure with the matching label
        for (const texFile of texFiles) {
            const content = await fetchTexFileContent(paperId, texFile);
            if (!content) continue;
            
            const imagePath = extractImagePathFromLatex(content, figureLabel);
            if (imagePath) {
                // Try to construct the full path and verify existence
                const fullImagePath = await constructAndVerifyImagePath(paperId, imagePath);
                if (fullImagePath) {
                    console.log('✅ Found exact image in LaTeX source:', fullImagePath);
                    return {
                        url: fullImagePath,
                        filename: imagePath.split('/').pop(),
                        source: 'latex_source',
                        original_path: imagePath,
                        found_in_file: texFile
                    };
                }
            }
        }
        
        console.log('❌ No matching image found in LaTeX source files');
        return null;
        
    } catch (error) {
        console.error('Error parsing LaTeX source files:', error);
        return null;
    }
}

// Get list of .tex files from the source directory
async function getTexFiles(paperId) {
    try {
        // Try to get the file listing from the API or directory endpoint
        // For now, try common .tex filenames and check which exist
        const commonTexFiles = [
            'main.tex',
            'paper.tex',
            `${paperId}.tex`,
            'manuscript.tex',
            'article.tex',
            'submission.tex'
        ];
        
        const existingFiles = [];
        
        for (const filename of commonTexFiles) {
            const exists = await checkTexFileExists(paperId, filename);
            if (exists) {
                existingFiles.push(filename);
            }
        }
        
        // Also try to find any .tex files by checking a few patterns
        const additionalPatterns = ['introduction.tex', 'conclusion.tex', 'methods.tex', 'results.tex'];
        for (const filename of additionalPatterns) {
            const exists = await checkTexFileExists(paperId, filename);
            if (exists) {
                existingFiles.push(filename);
            }
        }
        
        return existingFiles;
        
    } catch (error) {
        console.error('Error getting .tex files:', error);
        return [];
    }
}

// Check if a .tex file exists
async function checkTexFileExists(paperId, filename) {
    try {
        const url = `/static/sources/${paperId}/${filename}`;
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        return false;
    }
}

// Fetch content of a .tex file
async function fetchTexFileContent(paperId, filename) {
    try {
        const url = `/static/sources/${paperId}/${filename}`;
        const response = await fetch(url);
        if (response.ok) {
            return await response.text();
        }
        return null;
    } catch (error) {
        console.error(`Error fetching ${filename}:`, error);
        return null;
    }
}

// Extract image path from LaTeX content for a specific figure label
function extractImagePathFromLatex(content, figureLabel) {
    try {
        console.log('🔍 Searching for figure label:', figureLabel);
        
        // Remove comments from LaTeX content
        const cleanContent = content.replace(/^%.*$/gm, '');
        
        // Find figure environments
        const figureRegex = /\\begin\{figure\*?\}(.*?)\\end\{figure\*?\}/gs;
        const figureMatches = cleanContent.matchAll(figureRegex);
        
        for (const match of figureMatches) {
            const figureContent = match[1];
            
            // Check if this figure has the target label
            const labelRegex = /\\label\{([^}]+)\}/g;
            const labelMatches = figureContent.matchAll(labelRegex);
            
            for (const labelMatch of labelMatches) {
                const label = labelMatch[1];
                
                // Check if this label matches our target (try various formats)
                if (isLabelMatch(label, figureLabel)) {
                    console.log('✅ Found matching figure environment with label:', label);
                    
                    // Extract includegraphics path
                    const imagePath = extractIncludeGraphicsPath(figureContent);
                    if (imagePath) {
                        console.log('✅ Found includegraphics path:', imagePath);
                        return imagePath;
                    }
                }
            }
        }
        
        // Also check table environments
        const tableRegex = /\\begin\{table\*?\}(.*?)\\end\{table\*?\}/gs;
        const tableMatches = cleanContent.matchAll(tableRegex);
        
        for (const match of tableMatches) {
            const tableContent = match[1];
            
            const labelMatches = tableContent.matchAll(labelRegex);
            for (const labelMatch of labelMatches) {
                const label = labelMatch[1];
                
                if (isLabelMatch(label, figureLabel)) {
                    console.log('✅ Found matching table environment with label:', label);
                    const imagePath = extractIncludeGraphicsPath(tableContent);
                    if (imagePath) {
                        return imagePath;
                    }
                }
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('Error extracting image path from LaTeX:', error);
        return null;
    }
}

// Check if a label matches the target figure label
function isLabelMatch(label, targetLabel) {
    // Normalize both labels for comparison
    const normalizeLabel = (l) => l.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    const normalizedLabel = normalizeLabel(label);
    const normalizedTarget = normalizeLabel(targetLabel);
    
    // Direct match
    if (normalizedLabel === normalizedTarget) return true;
    
    // Check if target is just a number and label contains it
    if (/^\d+$/.test(targetLabel)) {
        return normalizedLabel.includes(targetLabel);
    }
    
    // Check common figure label patterns
    const patterns = [
        `fig${targetLabel}`,
        `figure${targetLabel}`,
        `tab${targetLabel}`,
        `table${targetLabel}`
    ];
    
    for (const pattern of patterns) {
        if (normalizedLabel.includes(pattern)) return true;
    }
    
    return false;
}

// Extract includegraphics path from figure/table content
function extractIncludeGraphicsPath(content) {
    // Look for \includegraphics commands
    const includeGraphicsPatterns = [
        /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g,
        /\\includegraphics\*(?:\[[^\]]*\])?\{([^}]+)\}/g
    ];
    
    for (const pattern of includeGraphicsPatterns) {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
            let imagePath = match[1].trim();
            
            // Clean up the path
            imagePath = imagePath.replace(/^["']|["']$/g, ''); // Remove quotes
            
            // If path doesn't have extension, try common ones
            if (!imagePath.includes('.')) {
                const commonExtensions = ['png', 'jpg', 'jpeg', 'pdf', 'eps'];
                for (const ext of commonExtensions) {
                    // We'll return the base path and let constructAndVerifyImagePath try extensions
                    return imagePath;
                }
            }
            
            return imagePath;
        }
    }
    
    return null;
}

// Construct full path and verify image exists
async function constructAndVerifyImagePath(paperId, imagePath) {
    try {
        // Clean up the image path
        let cleanPath = imagePath.replace(/^\.\//, ''); // Remove leading ./
        
        // Common directory structures in LaTeX projects
        const basePaths = [
            `/static/sources/${paperId}/${cleanPath}`,
            `/static/sources/${paperId}/figures/${cleanPath}`,
            `/static/sources/${paperId}/images/${cleanPath}`,
            `/static/sources/${paperId}/imgs/${cleanPath}`,
            `/static/sources/${paperId}/graphics/${cleanPath}`,
            `/static/sources/${paperId}/figs/${cleanPath}`
        ];
        
        // Common extensions to try if none specified
        const extensions = ['', '.png', '.jpg', '.jpeg', '.pdf', '.eps'];
        
        for (const basePath of basePaths) {
            for (const ext of extensions) {
                const fullPath = basePath + ext;
                
                if (await checkImageExists(fullPath)) {
                    console.log('✅ Verified image exists at:', fullPath);
                    return fullPath;
                }
            }
        }
        
        console.log('❌ Image not found at any expected path for:', imagePath);
        return null;
        
    } catch (error) {
        console.error('Error constructing image path:', error);
        return null;
    }
}