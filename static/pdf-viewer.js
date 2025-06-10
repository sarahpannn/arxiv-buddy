// Main PDF viewer entry point - loads all modules

// This file serves as the main entry point and module loader
// All functionality has been split into separate modules for better organization

console.log('PDF Viewer modules loading...');

// The actual rendering function is defined in pdf-renderer.js
// Other modules (annotation-handler.js, reference-resolver.js, paper-preview.js) 
// are loaded via script tags in the HTML and provide their functions globally