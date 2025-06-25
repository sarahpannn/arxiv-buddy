// Test utilities for debugging and development

// Test function to open extracted image in new window
window.openExtractedImage = function(dataUrl) {
    if (dataUrl) {
        const newWindow = window.open('');
        newWindow.document.write(`
            <html>
                <head><title>Extracted Figure</title></head>
                <body style="margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f0f0f0;">
                    <img src="${dataUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
                </body>
            </html>
        `);
    } else {
        alert('No image data available');
    }
}

// Test function to manually test canvas extraction on current page
window.testCanvasExtraction = async function(pageNum = 1) {
    try {
        console.log('Testing canvas extraction on page', pageNum);
        
        // Get the current PDF from global scope (you might need to adjust this)
        const canvas = document.getElementById(`pdf-canvas-${pageNum}`);
        if (!canvas) {
            console.error('Could not find canvas for page', pageNum);
            return;
        }
        
        // Create test canvas and copy from existing canvas
        const testCanvas = document.createElement('canvas');
        const testCtx = testCanvas.getContext('2d');
        testCanvas.width = canvas.width;
        testCanvas.height = canvas.height;
        testCtx.drawImage(canvas, 0, 0);
        
        const dataUrl = testCanvas.toDataURL();
        console.log('Test canvas extraction result:', dataUrl ? 'Success' : 'Failed');
        console.log('Data URL length:', dataUrl.length);
        console.log('Data URL preview:', dataUrl.substring(0, 50) + '...');
        
        // Display it in a test figure
        const testFigureInfo = {
            type: 'figure',
            number: 'Test',
            caption: 'Test extracted from existing canvas on page ' + pageNum,
            pageNumber: pageNum,
            area: { 
                x: 0, 
                y: 0, 
                width: 400, 
                height: 300,
                imageDataUrl: dataUrl
            }
        };
        window.displayFigureInfo(testFigureInfo);
        
    } catch (error) {
        console.error('Error testing canvas extraction:', error);
    }
}