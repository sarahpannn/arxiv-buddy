"""
LaTeX parsing engine for extracting citations, figures, and bibliography
Handles various LaTeX citation packages and environments
"""

import re
import os
import json
from typing import Dict, List, Optional, Tuple, Set
from dataclasses import dataclass, asdict
from collections import defaultdict


@dataclass
class Citation:
    """Represents a citation in the text"""
    key: str
    command: str  # cite, citep, citet, etc.
    context: str  # surrounding text
    line_number: int
    file_name: str
    page_estimate: int = 0


@dataclass
class Reference:
    """Represents a bibliography entry"""
    key: str
    title: str = ""
    authors: str = ""
    year: str = ""
    venue: str = ""
    raw_entry: str = ""
    doi: str = ""
    arxiv_id: str = ""
    url: str = ""


@dataclass
class Figure:
    """Represents a figure, table, or algorithm"""
    label: str
    caption: str
    figure_type: str  # figure, table, algorithm, equation
    file_name: str
    line_number: int
    raw_environment: str = ""
    subfigures: List[str] = None


@dataclass
class FigureReference:
    """Represents a reference to a figure"""
    ref_key: str
    command: str  # ref, autoref, etc.
    context: str
    line_number: int
    file_name: str


class LaTeXParser:
    """Main LaTeX parsing engine"""
    
    def __init__(self, source_dir: str):
        self.source_dir = source_dir
        self.citations = []
        self.references = {}
        self.figures = {}
        self.figure_references = []
        self.tex_files = []
        
        # Citation command patterns
        self.citation_patterns = [
            r'\\cite(?:p|t|author|year|alp|num)?(?:\[[^\]]*\])?\{([^}]+)\}',
            r'\\citep?(?:\[[^\]]*\])?\{([^}]+)\}',
            r'\\citet?(?:\[[^\]]*\])?\{([^}]+)\}',
            r'\\citeyear(?:\[[^\]]*\])?\{([^}]+)\}',
            r'\\citeauthor(?:\[[^\]]*\])?\{([^}]+)\}',
            r'\\cite\*?(?:\[[^\]]*\])?\{([^}]+)\}'
        ]
        
        # Figure reference patterns
        self.ref_patterns = [
            r'\\ref\{([^}]+)\}',
            r'\\autoref\{([^}]+)\}',
            r'\\cref\{([^}]+)\}',
            r'\\Cref\{([^}]+)\}',
            r'\\eqref\{([^}]+)\}',
            r'\\pageref\{([^}]+)\}'
        ]
    
    def parse_paper(self) -> Dict:
        """Parse entire paper and return structured data"""
        print(f"Parsing LaTeX source in: {self.source_dir}")
        
        # Find all .tex files
        self._find_tex_files()
        
        # Parse citations and references
        self._parse_citations()
        self._parse_figures()
        self._parse_bibliography()
        
        # Create mappings
        citation_map = self._create_citation_mapping()
        figure_map = self._create_figure_mapping()
        
        return {
            'citations': [asdict(c) for c in self.citations],
            'references': {k: asdict(v) for k, v in self.references.items()},
            'figures': {k: asdict(v) for k, v in self.figures.items()},
            'figure_references': [asdict(fr) for fr in self.figure_references],
            'citation_mapping': citation_map,
            'figure_mapping': figure_map,
            'stats': {
                'total_citations': len(self.citations),
                'total_references': len(self.references),
                'total_figures': len(self.figures),
                'tex_files_parsed': len(self.tex_files)
            }
        }
    
    def _find_tex_files(self):
        """Find all .tex files in source directory"""
        for root, dirs, files in os.walk(self.source_dir):
            for file in files:
                if file.endswith('.tex'):
                    file_path = os.path.join(root, file)
                    self.tex_files.append(file_path)
        
        print(f"Found {len(self.tex_files)} .tex files")
    
    def _parse_citations(self):
        """Extract all citations from .tex files"""
        for tex_file in self.tex_files:
            try:
                with open(tex_file, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                
                self._extract_citations_from_content(content, tex_file)
                
            except (IOError, OSError) as e:
                print(f"Error reading {tex_file}: {e}")
    
    def _extract_citations_from_content(self, content: str, file_name: str):
        """Extract citations from file content"""
        lines = content.split('\n')
        
        for line_num, line in enumerate(lines, 1):
            # Skip comments
            if line.strip().startswith('%'):
                continue
            
            # Remove inline comments
            comment_pos = line.find('%')
            if comment_pos != -1:
                line = line[:comment_pos]
            
            # Search for citation patterns
            for pattern in self.citation_patterns:
                for match in re.finditer(pattern, line, re.IGNORECASE):
                    command = match.group(0).split('{')[0].replace('\\', '')
                    cite_keys = match.group(1)
                    
                    # Handle multiple keys in one citation
                    for key in cite_keys.split(','):
                        key = key.strip()
                        if key:
                            # Get context (surrounding text)
                            start = max(0, match.start() - 50)
                            end = min(len(line), match.end() + 50)
                            context = line[start:end].strip()
                            
                            citation = Citation(
                                key=key,
                                command=command,
                                context=context,
                                line_number=line_num,
                                file_name=os.path.basename(file_name)
                            )
                            self.citations.append(citation)
    
    def _parse_figures(self):
        """Extract all figures, tables, algorithms from .tex files"""
        for tex_file in self.tex_files:
            try:
                with open(tex_file, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                
                self._extract_figures_from_content(content, tex_file)
                self._extract_figure_references_from_content(content, tex_file)
                
            except (IOError, OSError) as e:
                print(f"Error reading {tex_file}: {e}")
    
    def _extract_figures_from_content(self, content: str, file_name: str):
        """Extract figure environments and their metadata"""
        # Environment patterns
        env_patterns = [
            (r'\\begin\{figure\*?\}(.*?)\\end\{figure\*?\}', 'figure'),
            (r'\\begin\{table\*?\}(.*?)\\end\{table\*?\}', 'table'),
            (r'\\begin\{algorithm\}(.*?)\\end\{algorithm\}', 'algorithm'),
            (r'\\begin\{equation\}(.*?)\\end\{equation\}', 'equation'),
            (r'\\begin\{align\}(.*?)\\end\{align\}', 'equation')
        ]
        
        for pattern, fig_type in env_patterns:
            for match in re.finditer(pattern, content, re.DOTALL | re.IGNORECASE):
                env_content = match.group(1)
                
                # Extract label
                label_match = re.search(r'\\label\{([^}]+)\}', env_content)
                if not label_match:
                    continue
                
                label = label_match.group(1)
                
                # Extract caption
                caption_match = re.search(r'\\caption\{([^}]+)\}', env_content)
                caption = caption_match.group(1) if caption_match else ""
                
                # Handle nested braces in caption
                if caption_match:
                    caption = self._extract_balanced_braces(env_content, caption_match.start())
                
                # Find line number
                line_num = content[:match.start()].count('\n') + 1
                
                figure = Figure(
                    label=label,
                    caption=caption,
                    figure_type=fig_type,
                    file_name=os.path.basename(file_name),
                    line_number=line_num,
                    raw_environment=match.group(0)
                )
                
                self.figures[label] = figure
    
    def _extract_figure_references_from_content(self, content: str, file_name: str):
        """Extract references to figures"""
        lines = content.split('\n')
        
        for line_num, line in enumerate(lines, 1):
            # Skip comments
            if line.strip().startswith('%'):
                continue
            
            # Remove inline comments
            comment_pos = line.find('%')
            if comment_pos != -1:
                line = line[:comment_pos]
            
            # Search for reference patterns
            for pattern in self.ref_patterns:
                for match in re.finditer(pattern, line, re.IGNORECASE):
                    command = match.group(0).split('{')[0].replace('\\', '')
                    ref_key = match.group(1)
                    
                    # Get context
                    start = max(0, match.start() - 30)
                    end = min(len(line), match.end() + 30)
                    context = line[start:end].strip()
                    
                    fig_ref = FigureReference(
                        ref_key=ref_key,
                        command=command,
                        context=context,
                        line_number=line_num,
                        file_name=os.path.basename(file_name)
                    )
                    self.figure_references.append(fig_ref)
    
    def _parse_bibliography(self):
        """Parse bibliography from .bbl and .bib files"""
        # Parse .bbl files (compiled bibliography)
        bbl_files = [f for f in os.listdir(self.source_dir) if f.endswith('.bbl')]
        for bbl_file in bbl_files:
            self._parse_bbl_file(os.path.join(self.source_dir, bbl_file))
        
        # Parse .bib files (raw bibliography)
        bib_files = [f for f in os.listdir(self.source_dir) if f.endswith('.bib')]
        for bib_file in bib_files:
            self._parse_bib_file(os.path.join(self.source_dir, bib_file))
    
    def _parse_bbl_file(self, bbl_path: str):
        """Parse .bbl file for bibliography entries"""
        try:
            with open(bbl_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # Pattern for \bibitem entries
            pattern = r'\\bibitem(?:\[([^\]]*)\])?\{([^}]+)\}(.*?)(?=\\bibitem|\Z)'
            
            for match in re.finditer(pattern, content, re.DOTALL):
                optional = match.group(1) or ""
                key = match.group(2)
                entry_text = match.group(3).strip()
                
                reference = Reference(
                    key=key,
                    raw_entry=entry_text,
                    **self._extract_reference_metadata(entry_text)
                )
                
                self.references[key] = reference
                
        except (IOError, OSError) as e:
            print(f"Error reading .bbl file {bbl_path}: {e}")
    
    def _parse_bib_file(self, bib_path: str):
        """Parse .bib file for bibliography entries"""
        try:
            with open(bib_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # Pattern for BibTeX entries
            pattern = r'@(\w+)\s*\{\s*([^,]+)\s*,(.*?)(?=@\w+\s*\{|\Z)'
            
            for match in re.finditer(pattern, content, re.DOTALL):
                entry_type = match.group(1)
                key = match.group(2).strip()
                fields_text = match.group(3)
                
                # Parse BibTeX fields
                fields = self._parse_bibtex_fields(fields_text)
                
                reference = Reference(
                    key=key,
                    title=fields.get('title', ''),
                    authors=fields.get('author', ''),
                    year=fields.get('year', ''),
                    venue=fields.get('journal', fields.get('booktitle', '')),
                    doi=fields.get('doi', ''),
                    url=fields.get('url', ''),
                    raw_entry=match.group(0)
                )
                
                # Extract arXiv ID if present
                if 'arxiv' in fields.get('eprint', '').lower():
                    reference.arxiv_id = fields.get('eprint', '')
                
                self.references[key] = reference
                
        except (IOError, OSError) as e:
            print(f"Error reading .bib file {bib_path}: {e}")
    
    def _parse_bibtex_fields(self, fields_text: str) -> Dict[str, str]:
        """Parse BibTeX field assignments"""
        fields = {}
        
        # Pattern for field = {value} or field = "value"
        pattern = r'(\w+)\s*=\s*[{"]([^}"]*)[}"]'
        
        for match in re.finditer(pattern, fields_text):
            field_name = match.group(1).lower()
            field_value = match.group(2)
            fields[field_name] = field_value
        
        return fields
    
    def _extract_reference_metadata(self, entry_text: str) -> Dict[str, str]:
        """Extract metadata from bibliography entry text"""
        metadata = {}
        
        # Simple heuristics for common patterns
        # Title (often in italics or quotes)
        title_patterns = [
            r'["\u201c]([^"\u201d]+)["\u201d]',  # Quoted titles
            r'\\textit\{([^}]+)\}',  # Italic titles
            r'\\emph\{([^}]+)\}'     # Emphasized titles
        ]
        
        for pattern in title_patterns:
            match = re.search(pattern, entry_text)
            if match:
                metadata['title'] = match.group(1)
                break
        
        # Year (4 digits)
        year_match = re.search(r'\b(19|20)\d{2}\b', entry_text)
        if year_match:
            metadata['year'] = year_match.group(0)
        
        # DOI
        doi_match = re.search(r'doi:?\s*(10\.\d+/[^\s]+)', entry_text, re.IGNORECASE)
        if doi_match:
            metadata['doi'] = doi_match.group(1)
        
        # arXiv ID
        arxiv_match = re.search(r'arxiv:?\s*(\d+\.\d+)', entry_text, re.IGNORECASE)
        if arxiv_match:
            metadata['arxiv_id'] = arxiv_match.group(1)
        
        return metadata
    
    def _extract_balanced_braces(self, text: str, start_pos: int) -> str:
        """Extract content with balanced braces starting from position"""
        brace_count = 0
        i = start_pos
        
        # Find opening brace
        while i < len(text) and text[i] != '{':
            i += 1
        
        if i >= len(text):
            return ""
        
        start = i + 1
        i += 1
        brace_count = 1
        
        while i < len(text) and brace_count > 0:
            if text[i] == '{':
                brace_count += 1
            elif text[i] == '}':
                brace_count -= 1
            i += 1
        
        return text[start:i-1] if brace_count == 0 else ""
    
    def _create_citation_mapping(self) -> Dict:
        """Create mapping between citations and references"""
        mapping = {}
        
        for citation in self.citations:
            if citation.key in self.references:
                mapping[citation.key] = {
                    'reference': asdict(self.references[citation.key]),
                    'citations': []
                }
        
        # Group citations by key
        citation_groups = defaultdict(list)
        for citation in self.citations:
            citation_groups[citation.key].append(asdict(citation))
        
        for key, citations in citation_groups.items():
            if key in mapping:
                mapping[key]['citations'] = citations
        
        return mapping
    
    def _create_figure_mapping(self) -> Dict:
        """Create mapping between figure references and figures"""
        mapping = {}
        
        for fig_ref in self.figure_references:
            if fig_ref.ref_key in self.figures:
                if fig_ref.ref_key not in mapping:
                    mapping[fig_ref.ref_key] = {
                        'figure': asdict(self.figures[fig_ref.ref_key]),
                        'references': []
                    }
                mapping[fig_ref.ref_key]['references'].append(asdict(fig_ref))
        
        return mapping


def parse_latex_paper(source_dir: str) -> Dict:
    """Convenience function to parse a LaTeX paper"""
    parser = LaTeXParser(source_dir)
    return parser.parse_paper()


def save_parsed_data(parsed_data: Dict, output_path: str):
    """Save parsed data to JSON file"""
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(parsed_data, f, indent=2, ensure_ascii=False)
        print(f"Parsed data saved to: {output_path}")
    except (IOError, OSError) as e:
        print(f"Error saving parsed data: {e}")


def load_parsed_data(input_path: str) -> Optional[Dict]:
    """Load previously parsed data from JSON file"""
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (IOError, OSError, json.JSONDecodeError) as e:
        print(f"Error loading parsed data: {e}")
        return None