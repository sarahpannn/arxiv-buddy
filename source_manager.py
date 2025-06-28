"""
Source file management for arXiv papers
Handles downloading, extracting, and organizing LaTeX source files
"""

import os
import requests
import subprocess
import tarfile
import shutil
import json
import re
from datetime import datetime
from typing import Dict, List, Optional, Tuple


class SourceManager:
    """Manages arXiv source file operations"""
    
    def __init__(self, base_dir: str = "static"):
        self.base_dir = base_dir
        self.sources_dir = os.path.join(base_dir, "sources")
        self.papers_dir = os.path.join(base_dir, "papers")
        
        # Create directories
        os.makedirs(self.sources_dir, exist_ok=True)
        os.makedirs(self.papers_dir, exist_ok=True)
    
    def check_source_availability(self, paper_id: str) -> bool:
        """Check if source files are available for given arXiv paper"""
        clean_id = self._clean_paper_id(paper_id)
        source_url = f"https://arxiv.org/e-print/{clean_id}"
        
        try:
            response = requests.head(source_url, timeout=10)
            return response.status_code == 200
        except requests.RequestException:
            return False
    
    def get_paper_processing_strategy(self, paper_id: str) -> str:
        """Determine whether to use source or PDF approach"""
        if self.check_source_availability(paper_id):
            return "source"
        return "pdf_fallback"
    
    def download_arxiv_source(self, paper_id: str) -> Dict:
        """Download and extract arXiv source files using curl"""
        clean_id = self._clean_paper_id(paper_id)
        source_dir = os.path.join(self.sources_dir, clean_id)
        os.makedirs(source_dir, exist_ok=True)
        
        # Download using curl
        tar_path = os.path.join(source_dir, f"{clean_id}.tar.gz")
        curl_cmd = f"curl -L -o {tar_path} https://arxiv.org/e-print/{clean_id}"
        
        result = subprocess.run(curl_cmd, shell=True, capture_output=True, text=True)
        if result.returncode != 0:
            raise Exception(f"Failed to download source: {result.stderr}")
        
        # Handle different file types and extract
        return self._extract_source_files(tar_path, source_dir, clean_id)
    
    def _extract_source_files(self, tar_path: str, extract_dir: str, paper_id: str) -> Dict:
        """Extract and organize source files"""
        try:
            # Try as tar.gz first
            with tarfile.open(tar_path, 'r:gz') as tar:
                tar.extractall(extract_dir)
            # Remove the tar file after extraction
            os.remove(tar_path)
        except (tarfile.TarError, EOFError):
            # Handle single .tex files (some papers come as single files)
            tex_path = os.path.join(extract_dir, "main.tex")
            shutil.move(tar_path, tex_path)
        
        return self._analyze_source_structure(extract_dir, paper_id)
    
    def _analyze_source_structure(self, source_dir: str, paper_id: str) -> Dict:
        """Analyze extracted files and identify main components"""
        try:
            files = os.listdir(source_dir)
        except OSError:
            files = []
        
        structure = {
            'paper_id': paper_id,
            'source_dir': source_dir,
            'main_tex': self._find_main_tex_file(files, source_dir),
            'bbl_files': [f for f in files if f.endswith('.bbl')],
            'bib_files': [f for f in files if f.endswith('.bib')],
            'figure_files': [f for f in files if f.endswith(('.png', '.jpg', '.jpeg', '.pdf', '.eps'))],
            'all_tex_files': [f for f in files if f.endswith('.tex')],
            'other_files': [f for f in files if not f.endswith(('.tex', '.bbl', '.bib', '.png', '.jpg', '.jpeg', '.pdf', '.eps'))],
            'extracted_at': datetime.now().isoformat()
        }
        
        # Save metadata for future use
        self._save_source_metadata(source_dir, structure)
        
        return structure
    
    def _find_main_tex_file(self, files: List[str], source_dir: str) -> Optional[str]:
        """Identify the main LaTeX file using multiple heuristics"""
        tex_files = [f for f in files if f.endswith('.tex')]
        
        if not tex_files:
            return None
        
        # Priority order for main file detection
        priorities = ['main.tex', 'paper.tex', 'manuscript.tex', 'document.tex']
        
        for priority in priorities:
            if priority in tex_files:
                return priority
        
        # If no obvious main file, look for \documentclass
        for tex_file in tex_files:
            try:
                with open(os.path.join(source_dir, tex_file), 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read(2000)  # Read first 2000 chars
                    if '\\documentclass' in content:
                        return tex_file
            except (IOError, OSError):
                continue
        
        # Fallback to first .tex file
        return tex_files[0] if tex_files else None
    
    def _save_source_metadata(self, source_dir: str, structure: Dict) -> None:
        """Save analysis results to metadata file"""
        metadata_path = os.path.join(source_dir, "metadata.json")
        try:
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(structure, f, indent=2)
        except (IOError, OSError) as e:
            print(f"Warning: Could not save metadata: {e}")
    
    def parse_latex_content(self, paper_id: str) -> Optional[Dict]:
        """Parse LaTeX content if source files are available"""
        clean_id = self._clean_paper_id(paper_id)
        source_dir = os.path.join(self.sources_dir, clean_id)
        
        if not os.path.exists(source_dir):
            return None
        
        # Check if parsing results already exist
        parsed_path = os.path.join(source_dir, "parsed_latex.json")
        if os.path.exists(parsed_path):
            try:
                with open(parsed_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except (IOError, OSError, json.JSONDecodeError):
                pass  # Fall through to re-parse
        
        # Parse LaTeX content
        try:
            from latex_parser import parse_latex_paper
            parsed_data = parse_latex_paper(source_dir)
            
            # Save parsed results for future use
            try:
                with open(parsed_path, 'w', encoding='utf-8') as f:
                    json.dump(parsed_data, f, indent=2, ensure_ascii=False)
                print(f"LaTeX parsing results saved to: {parsed_path}")
            except (IOError, OSError) as e:
                print(f"Warning: Could not save parsed LaTeX data: {e}")
            
            return parsed_data
            
        except Exception as e:
            print(f"Error parsing LaTeX content for {paper_id}: {e}")
            return None
    
    def load_source_metadata(self, paper_id: str) -> Optional[Dict]:
        """Load previously saved source metadata"""
        clean_id = self._clean_paper_id(paper_id)
        metadata_path = os.path.join(self.sources_dir, clean_id, "metadata.json")
        
        try:
            with open(metadata_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (IOError, OSError, json.JSONDecodeError):
            return None
    
    def robust_source_download(self, paper_id: str) -> Dict:
        """Handle various edge cases in source download"""
        clean_id = self._clean_paper_id(paper_id)
        
        # Try multiple URL patterns if needed
        urls = [
            f"https://arxiv.org/e-print/{clean_id}",
            f"https://arxiv.org/src/{clean_id}",  # Alternative endpoint
        ]
        
        last_error = None
        for url in urls:
            try:
                return self._attempt_download(url, clean_id)
            except Exception as e:
                last_error = e
                continue
        
        raise Exception(f"All download attempts failed. Last error: {last_error}")
    
    def _attempt_download(self, url: str, paper_id: str) -> Dict:
        """Attempt download from specific URL"""
        source_dir = os.path.join(self.sources_dir, paper_id)
        os.makedirs(source_dir, exist_ok=True)
        
        tar_path = os.path.join(source_dir, f"{paper_id}.tar.gz")
        curl_cmd = f"curl -L -o {tar_path} {url}"
        
        result = subprocess.run(curl_cmd, shell=True, capture_output=True, text=True)
        if result.returncode != 0:
            raise Exception(f"Curl failed: {result.stderr}")
        
        return self._extract_source_files(tar_path, source_dir, paper_id)
    
    def _clean_paper_id(self, paper_id: str) -> str:
        """Clean and normalize paper ID"""
        # Remove common prefixes and version suffixes
        clean_id = paper_id.replace('arXiv:', '').replace('arxiv:', '')
        clean_id = re.sub(r'v\d+$', '', clean_id)  # Remove version numbers like v1, v2
        return clean_id.strip()
    
    def has_source_files(self, paper_id: str) -> bool:
        """Check if source files already exist locally"""
        clean_id = self._clean_paper_id(paper_id)
        source_dir = os.path.join(self.sources_dir, clean_id)
        metadata_path = os.path.join(source_dir, "metadata.json")
        return os.path.exists(metadata_path)


def download_paper_content(paper_id: str, source_manager: SourceManager = None) -> Dict:
    """
    Unified function that tries source first, falls back to PDF
    Returns comprehensive result with both source and PDF info
    """
    if source_manager is None:
        source_manager = SourceManager()
    
    clean_id = source_manager._clean_paper_id(paper_id)
    strategy = source_manager.get_paper_processing_strategy(clean_id)
    
    result = {
        'paper_id': clean_id,
        'strategy': strategy,
        'pdf_path': None,
        'source_structure': None,
        'parsed_latex': None,
        'success': False,
        'errors': []
    }
    
    try:
        if strategy == "source":
            # Try source download
            print(f"Attempting source download for {clean_id}")
            result['source_structure'] = source_manager.download_arxiv_source(clean_id)
            result['success'] = True
            print(f"Source download successful for {clean_id}")
            
            # Parse LaTeX content
            print(f"Parsing LaTeX content for {clean_id}")
            result['parsed_latex'] = source_manager.parse_latex_content(clean_id)
            if result['parsed_latex']:
                print(f"LaTeX parsing successful: {result['parsed_latex']['stats']['total_citations']} citations, {result['parsed_latex']['stats']['total_figures']} figures")
            
        # Always try to get PDF for display (whether source worked or not)
        try:
            from main import download_arxiv_pdf  # Import to avoid circular dependency
            pdf_path = download_arxiv_pdf(f"https://arxiv.org/abs/{clean_id}")
            result['pdf_path'] = pdf_path
        except Exception as pdf_error:
            result['errors'].append(f"PDF download failed: {pdf_error}")
            
    except Exception as e:
        print(f"Source download failed for {clean_id}: {e}")
        result['errors'].append(f"Source download failed: {e}")
        
        # Ultimate fallback to PDF-only
        if strategy == "source":
            try:
                from main import download_arxiv_pdf
                pdf_path = download_arxiv_pdf(f"https://arxiv.org/abs/{clean_id}")
                result['pdf_path'] = pdf_path
                result['strategy'] = "pdf_fallback"
                result['success'] = True
                print(f"Fell back to PDF-only for {clean_id}")
            except Exception as fallback_error:
                result['errors'].append(f"PDF fallback failed: {fallback_error}")
    
    return result


# Convenience functions for external use
def get_source_manager() -> SourceManager:
    """Get a configured SourceManager instance"""
    return SourceManager()


def extract_paper_id_from_url(url: str) -> str:
    """Extract paper ID from arXiv URL"""
    # Extract paper ID from URL
    paper_id = re.search(r'arxiv\.org/abs/([^/]+)', url)
    if not paper_id:
        paper_id = re.search(r'arxiv\.org/pdf/([^/]+)', url)
    
    if not paper_id:
        raise ValueError("Invalid ArXiv URL")
    
    return paper_id.group(1)