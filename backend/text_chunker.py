"""
Module 3B: Text Cleaning and Chunking for HR Documents

This module cleans and chunks extracted PDF text for use in a chatbot RAG pipeline.
It removes noise (headers, footers, TOC) and splits text into manageable chunks
with overlap for better context retention.

Author: HR Chatbot System
"""

import re
from typing import List, Dict, Optional


def clean_text(raw_text: str) -> str:
    """
    Clean extracted PDF text by removing headers, footers, and formatting noise.
    
    Args:
        raw_text (str): Raw text extracted from PDF
        
    Returns:
        str: Cleaned text with normalized whitespace
    """
    if not raw_text or not isinstance(raw_text, str):
        return ""
    
    try:
        text = raw_text
        
        # Remove common page number patterns (e.g., "Page 1", "1 of 10", "Page 1 of 10")
        text = re.sub(r'\bPage\s+\d+\s+of\s+\d+\b', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\bPage\s+\d+\b', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\b\d+\s+of\s+\d+\b', '', text)
        
        # Remove repeated headers/footers (lines that appear 5+ times)
        # This is more conservative to avoid removing actual content
        lines = text.split('\n')
        line_counts = {}
        for line in lines:
            stripped = line.strip()
            # Only count short lines (likely headers/footers, not content paragraphs)
            if 5 < len(stripped) < 50:  # Headers/footers are usually short
                line_counts[stripped] = line_counts.get(stripped, 0) + 1
        
        # Remove lines that appear too frequently (likely headers/footers)
        # Require 5+ occurrences to be more conservative
        frequent_lines = {line for line, count in line_counts.items() if count >= 5}
        cleaned_lines = []
        for line in lines:
            stripped = line.strip()
            # Only remove if it's a frequent short line (header/footer pattern)
            if stripped in frequent_lines and len(stripped) < 50:
                continue
            cleaned_lines.append(line)
        text = '\n'.join(cleaned_lines)
        
        # Remove table of contents patterns
        # Look for patterns like "1. Section Name ................ 5" (only if they appear at the start)
        # Only remove if it's clearly a TOC entry (has dots and page number)
        text = re.sub(r'^\s*\d+\.\s+.*?\.{3,}\s+\d+\s*$', '', text, flags=re.MULTILINE)
        # Remove "Table of Contents" header and following entries (more conservative)
        # Only remove if it's at the beginning and followed by TOC-style entries
        if re.search(r'(?i)^\s*table\s+of\s+contents', text, flags=re.MULTILINE):
            # Find TOC section and remove it (up to first real content)
            toc_match = re.search(r'(?i)(table\s+of\s+contents).*?(\n\n[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*$)', text, flags=re.DOTALL)
            if toc_match:
                # Only remove if we found a clear TOC section
                text = text[:toc_match.start()] + text[toc_match.end():]
        
        # Remove excessive whitespace while preserving paragraph structure
        # Replace multiple spaces with single space
        text = re.sub(r' +', ' ', text)
        # Replace 3+ newlines with double newline (paragraph break)
        text = re.sub(r'\n{3,}', '\n\n', text)
        # Remove leading/trailing whitespace from each line
        lines = text.split('\n')
        lines = [line.strip() for line in lines]
        text = '\n'.join(lines)
        
        # Remove empty lines at start and end
        text = text.strip()
        
        return text
        
    except Exception as e:
        print(f"Error cleaning text: {e}")
        # Return original text if cleaning fails
        return raw_text if raw_text else ""


def split_into_sentences(text: str) -> List[str]:
    """
    Split text into sentences using simple heuristics.
    
    Args:
        text (str): Text to split
        
    Returns:
        List[str]: List of sentences
    """
    if not text:
        return []
    
    # Split on sentence endings (., !, ?) followed by space and capital letter
    # This is a simple approach; for production, consider using NLTK or spaCy
    sentences = re.split(r'([.!?])\s+(?=[A-Z])', text)
    
    # Recombine sentences with their punctuation
    result = []
    for i in range(0, len(sentences) - 1, 2):
        if i + 1 < len(sentences):
            sentence = sentences[i] + sentences[i + 1]
            if sentence.strip():
                result.append(sentence.strip())
        else:
            if sentences[i].strip():
                result.append(sentences[i].strip())
    
    # Add last sentence if it exists
    if len(sentences) % 2 == 1 and sentences[-1].strip():
        result.append(sentences[-1].strip())
    
    return result if result else [text]


def count_words(text: str) -> int:
    """
    Count words in text.
    
    Args:
        text (str): Text to count
        
    Returns:
        int: Word count
    """
    if not text:
        return 0
    return len(text.split())


def chunk_text(cleaned_text: str, 
               target_chunk_size: int = 400,
               min_chunk_size: int = 300,
               max_chunk_size: int = 500,
               overlap_words: int = 50) -> List[Dict[str, any]]:
    """
    Chunk cleaned text into overlapping segments for RAG pipeline.
    
    Chunks are created with the following priorities:
    1. Split on paragraph boundaries when possible
    2. Avoid cutting sentences in half
    3. Maintain target chunk size (300-500 words or ~1000 chars)
    4. Add overlap between chunks for context retention
    
    Args:
        cleaned_text (str): Cleaned text to chunk
        target_chunk_size (int): Target words per chunk (default: 400)
        min_chunk_size (int): Minimum words per chunk (default: 300)
        max_chunk_size (int): Maximum words per chunk (default: 500)
        overlap_words (int): Number of words to overlap between chunks (default: 50)
        
    Returns:
        List[Dict[str, any]]: List of chunk dictionaries with 'chunk_id' and 'text'
    """
    if not cleaned_text or not isinstance(cleaned_text, str):
        return []
    
    try:
        # Split into paragraphs first
        paragraphs = [p.strip() for p in cleaned_text.split('\n\n') if p.strip()]
        
        if not paragraphs:
            return []
        
        chunks = []
        current_chunk = []
        current_word_count = 0
        chunk_id = 1
        
        for para_idx, paragraph in enumerate(paragraphs):
            para_word_count = count_words(paragraph)
            
            # If paragraph alone exceeds max size, split it by sentences
            if para_word_count > max_chunk_size:
                # First, finalize current chunk if it exists
                if current_chunk:
                    chunk_text = ' '.join(current_chunk)
                    chunks.append({
                        "chunk_id": chunk_id,
                        "text": chunk_text
                    })
                    chunk_id += 1
                    current_chunk = []
                    current_word_count = 0
                
                # Split large paragraph into sentences
                sentences = split_into_sentences(paragraph)
                for sentence in sentences:
                    sent_word_count = count_words(sentence)
                    
                    # If adding this sentence exceeds max, finalize current chunk
                    if current_word_count + sent_word_count > max_chunk_size and current_chunk:
                        chunk_text = ' '.join(current_chunk)
                        chunks.append({
                            "chunk_id": chunk_id,
                            "text": chunk_text
                        })
                        chunk_id += 1
                        
                        # Start new chunk with overlap (last N words from previous chunk)
                        if chunks and overlap_words > 0:
                            prev_words = chunks[-1]["text"].split()
                            overlap_text = ' '.join(prev_words[-overlap_words:])
                            current_chunk = [overlap_text, sentence]
                            current_word_count = count_words(overlap_text) + sent_word_count
                        else:
                            current_chunk = [sentence]
                            current_word_count = sent_word_count
                    else:
                        current_chunk.append(sentence)
                        current_word_count += sent_word_count
            else:
                # Check if adding this paragraph would exceed max size
                if current_word_count + para_word_count > max_chunk_size and current_chunk:
                    # Finalize current chunk
                    chunk_text = ' '.join(current_chunk)
                    chunks.append({
                        "chunk_id": chunk_id,
                        "text": chunk_text
                    })
                    chunk_id += 1
                    
                    # Start new chunk with overlap
                    if overlap_words > 0 and chunks:
                        prev_words = chunks[-1]["text"].split()
                        overlap_text = ' '.join(prev_words[-overlap_words:])
                        current_chunk = [overlap_text, paragraph]
                        current_word_count = count_words(overlap_text) + para_word_count
                    else:
                        current_chunk = [paragraph]
                        current_word_count = para_word_count
                else:
                    # Add paragraph to current chunk
                    current_chunk.append(paragraph)
                    current_word_count += para_word_count
                    
                    # If we've reached target size, finalize chunk
                    if current_word_count >= target_chunk_size:
                        chunk_text = ' '.join(current_chunk)
                        chunks.append({
                            "chunk_id": chunk_id,
                            "text": chunk_text
                        })
                        chunk_id += 1
                        current_chunk = []
                        current_word_count = 0
        
        # Add final chunk if it exists and meets minimum size
        if current_chunk:
            chunk_text = ' '.join(current_chunk)
            if count_words(chunk_text) >= min_chunk_size or len(chunks) == 0:
                chunks.append({
                    "chunk_id": chunk_id,
                    "text": chunk_text
                })
        
        return chunks
        
    except Exception as e:
        print(f"Error chunking text: {e}")
        # Return at least one chunk with all text if chunking fails
        return [{"chunk_id": 1, "text": cleaned_text}] if cleaned_text else []


def clean_and_chunk(raw_text: str,
                   target_chunk_size: int = 400,
                   min_chunk_size: int = 300,
                   max_chunk_size: int = 500,
                   overlap_words: int = 50) -> List[Dict[str, any]]:
    """
    Complete pipeline: clean and chunk extracted PDF text.
    
    This is the main function to use for processing extracted PDF text.
    It combines cleaning and chunking into a single operation.
    
    Args:
        raw_text (str): Raw text extracted from PDF
        target_chunk_size (int): Target words per chunk (default: 400)
        min_chunk_size (int): Minimum words per chunk (default: 300)
        max_chunk_size (int): Maximum words per chunk (default: 500)
        overlap_words (int): Number of words to overlap between chunks (default: 50)
        
    Returns:
        List[Dict[str, any]]: List of chunk dictionaries with 'chunk_id' and 'text'
        
    Example:
        >>> chunks = clean_and_chunk(extracted_text)
        >>> print(f"Created {len(chunks)} chunks")
    """
    if not raw_text:
        return []
    
    try:
        # Step 1: Clean the text
        cleaned_text = clean_text(raw_text)
        
        if not cleaned_text:
            return []
        
        # Step 2: Chunk the cleaned text
        chunks = chunk_text(
            cleaned_text,
            target_chunk_size=target_chunk_size,
            min_chunk_size=min_chunk_size,
            max_chunk_size=max_chunk_size,
            overlap_words=overlap_words
        )
        
        return chunks
        
    except Exception as e:
        print(f"Error in clean_and_chunk: {e}")
        return []


# Test block
if __name__ == "__main__":
    """
    Test the text cleaning and chunking functions.
    
    Usage:
        python text_chunker.py [path_to_text_file]
        
    If no file is provided, uses sample text for testing.
    """
    import sys
    import os
    
    # Sample text for testing (if no file provided)
    sample_text = """
    TABLE OF CONTENTS
    
    Introduction ................ 1
    Purpose ...................... 2
    Policy Statement ............ 3
    
    Page 1 of 10
    
    HR POLICY DOCUMENT
    
    PURPOSE
    
    This document outlines the company's human resources policies and procedures.
    All employees are expected to familiarize themselves with these policies.
    
    Page 2 of 10
    
    HR POLICY DOCUMENT
    
    POLICY STATEMENT
    
    The company is committed to providing a fair and equitable work environment.
    We value diversity and inclusion in all aspects of our operations.
    
    Page 3 of 10
    
    HR POLICY DOCUMENT
    
    LEAVE POLICY
    
    Employees are entitled to annual leave based on their years of service.
    Full-time employees receive 20 days of annual leave per year.
    Part-time employees receive pro-rated leave based on their working hours.
    
    Leave requests must be submitted at least two weeks in advance.
    Approval is subject to business needs and staffing requirements.
    
    SICK LEAVE
    
    Employees may take sick leave when they are unable to work due to illness.
    A medical certificate may be required for absences exceeding three days.
    
    Page 4 of 10
    
    HR POLICY DOCUMENT
    
    BENEFITS
    
    The company offers a comprehensive benefits package including health insurance,
    retirement plans, and professional development opportunities.
    
    Health insurance coverage begins on the first day of employment.
    Employees can choose from several plan options to suit their needs.
    
    Page 5 of 10
    """
    
    # Get text from file or use sample
    if len(sys.argv) > 1:
        text_file_path = sys.argv[1]
        if os.path.exists(text_file_path):
            print(f"Loading text from: {text_file_path}")
            with open(text_file_path, 'r', encoding='utf-8') as f:
                test_text = f.read()
        else:
            print(f"File not found: {text_file_path}")
            print("Using sample text for testing...")
            test_text = sample_text
    else:
        print("No file provided. Using sample text for testing...")
        test_text = sample_text
    
    print("\n" + "=" * 60)
    print("Testing Text Cleaning and Chunking")
    print("=" * 60)
    
    # Test cleaning
    print("\n1. Cleaning text...")
    cleaned = clean_text(test_text)
    print(f"   Original length: {len(test_text)} characters")
    print(f"   Cleaned length: {len(cleaned)} characters")
    print(f"   Reduction: {len(test_text) - len(cleaned)} characters")
    
    # Test chunking
    print("\n2. Chunking text...")
    chunks = clean_and_chunk(test_text)
    print(f"   Created {len(chunks)} chunks")
    
    if chunks:
        # Show statistics
        word_counts = [count_words(chunk["text"]) for chunk in chunks]
        char_counts = [len(chunk["text"]) for chunk in chunks]
        
        print(f"\n   Chunk statistics:")
        print(f"   - Word count range: {min(word_counts)} - {max(word_counts)} words")
        print(f"   - Character count range: {min(char_counts)} - {max(char_counts)} chars")
        print(f"   - Average words per chunk: {sum(word_counts) / len(word_counts):.1f}")
        print(f"   - Average chars per chunk: {sum(char_counts) / len(char_counts):.1f}")
        
        # Show first 2 chunks
        print("\n" + "=" * 60)
        print("First 2 Chunks:")
        print("=" * 60)
        
        for i, chunk in enumerate(chunks[:2], 1):
            print(f"\n--- Chunk {chunk['chunk_id']} ({count_words(chunk['text'])} words, {len(chunk['text'])} chars) ---")
            print(chunk['text'][:500])
            if len(chunk['text']) > 500:
                print("... (truncated)")
        
        if len(chunks) > 2:
            print(f"\n... ({len(chunks) - 2} more chunks)")
    else:
        print("   No chunks created (text may be too short or empty)")
    
    print("\n" + "=" * 60)
    print("Test completed successfully!")
    print("=" * 60)

