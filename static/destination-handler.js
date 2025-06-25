// Destination handling functionality

// Function to find destination page from PDF destination array (improved)
window.findDestinationPageFromArray = async function(dest, pdf) {
    try {
        // The destination format can vary, but usually the first element is the page reference
        if (dest[0] && typeof dest[0] === 'object' && dest[0].num) {
            // Page reference object
            const pageRef = dest[0];
            const pageIndex = await pdf.getPageIndex(pageRef);
            return pageIndex + 1; // Convert 0-based to 1-based
        } else if (typeof dest[0] === 'number') {
            // Direct page number
            return dest[0];
        } else if (typeof dest[0] === 'string') {
            // Named destination - should have been resolved already
            return null;
        }
    } catch (error) {
        console.error('Error finding destination page from array:', error);
    }
    return null;
};