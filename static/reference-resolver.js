// Reference resolution and destination handling

// Function to find and display reference for internal links
window.findAndDisplayReference = async function(annotation, pdf, citingLastName) {
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
                    
                    console.log('📍 CITATION TRACKING:');
                    console.log('  Destination page:', destPageNum);
                    console.log('  Link destination coords (PDF space):', targetDestination);
                    
                    // Check if this is a figure reference by analyzing the destination content
                    const figureInfo = await detectFigureAtDestination(textContent, targetDestination, page, pdf, destPageNum);
                    
                    if (figureInfo) {
                        window.displayFigureInfo(figureInfo);
                    } else {
                        // Extract the actual reference text from the destination location
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