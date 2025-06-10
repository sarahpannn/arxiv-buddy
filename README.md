# ArXiv Buddy 📄

A modern web-based PDF viewer specifically designed for academic papers from ArXiv, featuring interactive citations, reference previews, and enhanced paper exploration.

## Features ✨

### 🎯 **Smart PDF Viewing**
- **Two-pane layout** - PDF on the left, reference details on the right
- **Full-page rendering** - View complete academic papers with proper formatting
- **Selectable text** - Highlight and copy text from PDFs
- **Responsive design** - Works on different screen sizes

### 🔗 **Interactive Citations**
- **Clickable in-text citations** - Click on `[1]`, `(2)`, etc. to see reference details
- **Real citation following** - Uses PDF's internal link structure like a proper PDF reader
- **Pattern-based fallback** - Detects citations even when PDF annotations are missing
- **Visual link highlights** - See clickable areas with subtle blue overlays

### 📚 **Enhanced Reference Previews**
- **Rich paper information** - Shows titles, authors, publication details
- **Abstract previews** - Displays paper abstracts when available
- **ArXiv integration** - Automatically fetches enhanced details from ArXiv API
- **External links** - Direct links to ArXiv, DOI, and original sources
- **Smart parsing** - Extracts information from various citation formats

### 🚀 **Easy Paper Loading**
- **Simple URL input** - Just paste an ArXiv URL and go
- **Automatic PDF download** - Fetches and serves PDFs seamlessly
- **Multiple format support** - Works with ArXiv URLs in various formats

## Quick Start 🏃‍♂️

### Prerequisites
- Python 3.7+
- pip

### Installation

1. **Clone or download the project**
   ```bash
   git clone <your-repo-url>
   cd arxiv-buddy
   ```

2. **Install dependencies**
   ```bash
   pip install fasthtml fastapi requests
   ```

3. **Run the application**
   ```bash
   python main.py
   ```

4. **Open your browser**
   - Navigate to `http://localhost:8000`
   - Paste an ArXiv URL (e.g., `https://arxiv.org/abs/2309.15028`)
   - Click "Load PDF" and start exploring!

## Usage 📖

### Loading a Paper
1. Copy an ArXiv URL from arxiv.org
2. Paste it into the input field on the homepage
3. Click "Load PDF"
4. The paper will load in the left pane

### Exploring Citations
1. **Click on citations** in the paper text (like `[1]`, `(2)`, etc.)
2. **Reference details appear** in the right pane with:
   - Full reference text
   - Paper title and authors
   - Abstract (when available)
   - Direct links to the paper
3. **External links** open in new tabs for further exploration

### Supported Citation Formats
- `[1]`, `[12]` - Bracketed references
- `[1-3]`, `[5–7]` - Citation ranges
- `[1,2,3]`, `[1, 5, 9]` - Multiple citations
- `(1)`, `(12)` - Parenthetical citations

## Architecture 🏗️

### Backend (Python)
- **FastHTML + FastAPI** - Modern Python web framework
- **Static file serving** - Efficient PDF delivery
- **CORS enabled** - Ready for frontend integration

### Frontend (JavaScript)
- **Modular architecture** - Clean, maintainable code split across modules:
  - `pdf-renderer.js` - Core PDF rendering and layout
  - `annotation-handler.js` - Link processing and interaction
  - `reference-resolver.js` - Citation following and resolution
  - `paper-preview.js` - Enhanced reference display
  - `pdf-viewer.js` - Main entry point

### PDF Processing
- **PDF.js integration** - Mozilla's robust PDF rendering library
- **Text layer rendering** - Enables text selection and interaction
- **Annotation processing** - Uses PDF's built-in link structure
- **Coordinate-based precision** - Accurate citation-to-reference mapping

## File Structure 📁

```
arxiv-buddy/
├── main.py                 # FastHTML/FastAPI server
├── static/
│   ├── pdf-renderer.js     # PDF rendering & layout
│   ├── annotation-handler.js # Link processing
│   ├── reference-resolver.js # Citation resolution
│   ├── paper-preview.js    # Reference display
│   ├── pdf-viewer.js       # Main entry point
│   ├── style.css          # Styling
│   └── *.pdf              # Downloaded papers
├── node_modules/           # Dependencies
├── package.json           # Node.js dependencies
└── README.md              # This file
```

## API Integration 🌐

### ArXiv API
- **Automatic enhancement** - Fetches paper details, abstracts, and metadata
- **Category information** - Shows ArXiv subject classifications
- **Author details** - Complete author lists
- **Publication dates** - Accurate timing information

### Future Integrations
- Semantic Scholar API
- CrossRef DOI resolution
- Google Scholar integration

## Development 🛠️

### Adding New Features
1. **Citation handlers** - Extend `annotation-handler.js`
2. **Reference parsing** - Enhance `reference-resolver.js`
3. **Display improvements** - Modify `paper-preview.js`
4. **New APIs** - Add to `paper-preview.js`

### Debugging
- **Browser console** - Extensive logging for troubleshooting
- **Network tab** - Monitor API calls and PDF loading
- **Citation coordinates** - Visual debugging for link positioning

## Known Limitations ⚠️

- **PDF-dependent** - Citation links require properly formatted PDFs
- **ArXiv focus** - Optimized for ArXiv papers (other sources may work with limitations)
- **Browser compatibility** - Requires modern browsers with ES6 module support

## Contributing 🤝

Contributions are welcome! Areas for improvement:
- Additional citation format support
- More academic database integrations
- Enhanced reference parsing
- Mobile optimization
- Performance improvements

## License 📝

[Your chosen license - e.g., MIT, Apache 2.0, etc.]

## Acknowledgments 🙏

- **PDF.js** - Mozilla's excellent PDF rendering library
- **FastHTML** - Modern Python web framework
- **ArXiv** - For providing the amazing arXiv API
- **Academic community** - For making knowledge freely accessible

---

**Happy paper reading! 📚✨**

For questions, issues, or suggestions, please open an issue on GitHub.