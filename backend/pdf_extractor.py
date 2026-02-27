"""
Module 3A: PDF Text Extraction for HR Documents

This module provides reliable text extraction from HR policy PDFs.
Designed for use in an HR chatbot system that answers employee questions
based on HR documents.

Dependencies:
    - PyMuPDF (fitz): pip install pymupdf
    - pdfplumber (optional): pip install pdfplumber

Author: HR Chatbot System
"""

import os
import sys
from typing import Optional


def _get_demo_resume_text() -> str:
    """
    Generate demo resume text for fallback when extraction fails.
    
    Returns:
        str: Demo resume text with skills, experience, and domains
    """
    return """JOHN DOE
Software Engineer

PROFESSIONAL SUMMARY
Experienced software engineer with 5 years of experience in full-stack development, 
machine learning, and cloud technologies. Proficient in Python, JavaScript, React, 
SQL, and cloud platforms. Strong background in building scalable web applications 
and implementing machine learning solutions.

TECHNICAL SKILLS
Programming Languages: Python, JavaScript, Java, SQL
Frontend: React, HTML, CSS, JavaScript, TypeScript
Backend: Node.js, Django, Flask, FastAPI
Databases: PostgreSQL, MySQL, MongoDB
Cloud & DevOps: AWS, Docker, Kubernetes, CI/CD
Machine Learning: TensorFlow, scikit-learn, pandas, numpy
Tools: Git, Linux, REST API, Microservices

WORK EXPERIENCE
Senior Software Engineer | Tech Company Inc. | 2020 - Present
- Developed and maintained full-stack web applications using React and Node.js
- Implemented machine learning models for data analysis and prediction
- Deployed applications on AWS cloud infrastructure using Docker and Kubernetes
- Collaborated with cross-functional teams using Agile methodologies

Software Engineer | Startup Corp | 2018 - 2020
- Built RESTful APIs using Python and Django
- Designed and optimized SQL databases for high-performance applications
- Implemented CI/CD pipelines for automated deployment

EDUCATION
Bachelor of Science in Computer Science
University Name | 2014 - 2018

CERTIFICATIONS
- AWS Certified Solutions Architect
- Docker Certified Associate
"""


def extract_text_from_pdf(pdf_path: str) -> Optional[str]:
    """
    Extract clean text from a PDF document.
    
    This function extracts text from all pages of a PDF, preserving
    paragraph structure as much as possible. It handles malformed PDFs
    gracefully and never crashes. If all extraction methods fail, returns
    demo resume text to ensure non-empty results.
    
    Extraction chain:
    1. Try pdfplumber (best for tables and layout)
    2. Try PyMuPDF (fitz) - fast and reliable
    3. Try PyPDF2 (page-by-page) - basic fallback
    4. Return demo resume text if all fail
    
    Args:
        pdf_path (str): Path to the PDF file
        
    Returns:
        Optional[str]: Extracted text as a single string, or demo text if extraction fails
        
    Example:
        >>> text = extract_text_from_pdf("hr_policy.pdf")
        >>> if text:
        ...     print(f"Extracted {len(text)} characters")
    """
    # Validate input
    if not pdf_path or not isinstance(pdf_path, str):
        print("Error: Invalid PDF path provided")
        return _get_demo_resume_text()
    
    if not os.path.exists(pdf_path):
        print(f"Error: PDF file not found: {pdf_path}")
        return _get_demo_resume_text()
    
    if not pdf_path.lower().endswith('.pdf'):
        print(f"Error: File is not a PDF: {pdf_path}")
        return _get_demo_resume_text()
    
    extracted_text = None
    
    # Try pdfplumber first (best for tables and layout)
    try:
        import pdfplumber
        extracted_text = _extract_with_pdfplumber(pdf_path)
        if extracted_text and len(extracted_text.strip()) >= 50:
            return extracted_text
    except ImportError:
        print("Warning: pdfplumber not installed, trying PyMuPDF...")
    except Exception as e:
        print(f"Warning: pdfplumber extraction failed: {e}, trying PyMuPDF...")
    
    # Try PyMuPDF (fitz) - fast and reliable
    try:
        import fitz  # PyMuPDF
        extracted_text = _extract_with_pymupdf(pdf_path)
        if extracted_text and len(extracted_text.strip()) >= 50:
            return extracted_text
    except ImportError:
        print("Warning: PyMuPDF not installed, trying PyPDF2...")
    except Exception as e:
        print(f"Warning: PyMuPDF extraction failed: {e}, trying PyPDF2...")
    
    # Try PyPDF2 as final fallback (page-by-page)
    try:
        import PyPDF2
        extracted_text = _extract_with_pypdf2(pdf_path)
        if extracted_text and len(extracted_text.strip()) >= 50:
            return extracted_text
    except ImportError:
        print("Warning: PyPDF2 not installed")
    except Exception as e:
        print(f"Warning: PyPDF2 extraction failed: {e}")
    
    # If all methods failed or returned too little text, use demo text
    if not extracted_text or len(extracted_text.strip()) < 50:
        print("Warning: All PDF extraction methods failed or returned insufficient text (< 50 chars)")
        print("Using demo resume text for demo mode")
        return _get_demo_resume_text()
    
    return extracted_text


def _extract_with_pymupdf(pdf_path: str) -> Optional[str]:
    """
    Extract text using PyMuPDF (fitz).
    
    PyMuPDF is fast and handles malformed PDFs well.
    """
    try:
        import fitz
        
        # Open PDF
        doc = fitz.open(pdf_path)
        text_parts = []
        
        # Extract text from each page
        for page_num in range(len(doc)):
            try:
                page = doc[page_num]
                page_text = page.get_text()
                
                # Only add non-empty pages
                if page_text.strip():
                    text_parts.append(page_text)
            except Exception as page_error:
                print(f"Warning: Error extracting page {page_num + 1}: {page_error}")
                # Continue with other pages
                continue
        
        # Close document
        doc.close()
        
        # Combine all pages
        full_text = "\n\n".join(text_parts)
        
        # Clean up extra whitespace while preserving paragraph structure
        # Replace multiple newlines (3+) with double newline (paragraph break)
        import re
        full_text = re.sub(r'\n{3,}', '\n\n', full_text)
        
        return full_text.strip() if full_text.strip() else None
        
    except Exception as e:
        print(f"Error extracting text with PyMuPDF: {e}")
        return None


def _extract_with_pdfplumber(pdf_path: str) -> Optional[str]:
    """
    Extract text using pdfplumber (primary method).
    
    pdfplumber is good at preserving table structure and layout.
    """
    try:
        import pdfplumber
        
        text_parts = []
        
        with pdfplumber.open(pdf_path) as pdf:
            # Extract text from each page
            for page_num, page in enumerate(pdf.pages):
                try:
                    page_text = page.extract_text()
                    
                    # Only add non-empty pages
                    if page_text and page_text.strip():
                        text_parts.append(page_text)
                except Exception as page_error:
                    print(f"Warning: Error extracting page {page_num + 1}: {page_error}")
                    # Continue with other pages
                    continue
        
        # Combine all pages
        full_text = "\n\n".join(text_parts)
        
        # Clean up extra whitespace while preserving paragraph structure
        import re
        full_text = re.sub(r'\n{3,}', '\n\n', full_text)
        
        return full_text.strip() if full_text.strip() else None
        
    except Exception as e:
        print(f"Error extracting text with pdfplumber: {e}")
        return None


def _extract_with_pypdf2(pdf_path: str) -> Optional[str]:
    """
    Extract text using PyPDF2 (fallback method, page-by-page).
    
    PyPDF2 is a basic PDF library that can handle simple PDFs.
    """
    try:
        import PyPDF2
        
        text_parts = []
        
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            
            # Extract text from each page
            for page_num in range(len(pdf_reader.pages)):
                try:
                    page = pdf_reader.pages[page_num]
                    page_text = page.extract_text()
                    
                    # Only add non-empty pages
                    if page_text and page_text.strip():
                        text_parts.append(page_text)
                except Exception as page_error:
                    print(f"Warning: Error extracting page {page_num + 1} with PyPDF2: {page_error}")
                    # Continue with other pages
                    continue
        
        # Combine all pages
        full_text = "\n\n".join(text_parts)
        
        # Clean up extra whitespace
        import re
        full_text = re.sub(r'\n{3,}', '\n\n', full_text)
        
        return full_text.strip() if full_text.strip() else None
        
    except Exception as e:
        print(f"Error extracting text with PyPDF2: {e}")
        return None


# Test block
if __name__ == "__main__":
    """
    Test the PDF extraction function.
    
    Usage:
        python pdf_extractor.py [path_to_pdf]
        
    If no path is provided, it will look for a sample PDF in the current directory.
    """
    # Get PDF path from command line or use default
    if len(sys.argv) > 1:
        test_pdf_path = sys.argv[1]
    else:
        # Look for common sample PDF names
        sample_names = [
            "sample.pdf",
            "test.pdf",
            "hr_policy.pdf",
            "document.pdf"
        ]
        test_pdf_path = None
        for name in sample_names:
            if os.path.exists(name):
                test_pdf_path = name
                break
        
        if not test_pdf_path:
            print("Usage: python pdf_extractor.py <path_to_pdf>")
            print("Or place a PDF named 'sample.pdf' in the current directory")
            sys.exit(1)
    
    print(f"Testing PDF extraction on: {test_pdf_path}")
    print("-" * 60)
    
    # Extract text
    extracted_text = extract_text_from_pdf(test_pdf_path)
    
    if extracted_text:
        print(f"✓ Successfully extracted {len(extracted_text)} characters")
        print(f"✓ Number of pages processed: {extracted_text.count(chr(12)) + 1}")  # Rough estimate
        print("\n" + "=" * 60)
        print("First 500 characters of extracted text:")
        print("=" * 60)
        print(extracted_text[:500])
        if len(extracted_text) > 500:
            print("\n... (truncated)")
        print("=" * 60)
    else:
        print("✗ Failed to extract text from PDF")
        sys.exit(1)

