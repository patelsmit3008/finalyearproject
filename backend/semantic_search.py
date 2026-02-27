"""
Module 3C: Semantic Search for HR Chatbot

This module provides semantic search capabilities over HR document chunks.
It uses sentence-transformers to create embeddings and performs cosine similarity
search to find the most relevant chunks for user queries.

This is part of a RAG (Retrieval-Augmented Generation) pipeline for the HR chatbot.

Dependencies:
    - sentence-transformers: pip install sentence-transformers
    - numpy: pip install numpy
    - torch: pip install torch (required by sentence-transformers)

Author: HR Chatbot System
"""

import numpy as np
from typing import List, Dict, Tuple, Optional
import warnings

# Suppress warnings for cleaner output
warnings.filterwarnings('ignore')


def embed_chunks(chunks: List[Dict]) -> Tuple[Optional[np.ndarray], List[str]]:
    """
    Embed text chunks using sentence-transformers.
    
    This function takes chunks from Module 3B and converts them into
    dense vector embeddings that capture semantic meaning. These embeddings
    can then be used for semantic similarity search.
    
    Args:
        chunks (List[Dict]): List of chunk dictionaries with 'chunk_id' and 'text'
                           from Module 3B
        
    Returns:
        Tuple[Optional[np.ndarray], List[str]]: 
            - Embedding vectors (numpy array of shape [num_chunks, embedding_dim])
            - Original chunk texts (list of strings)
            Returns (None, []) on failure
        
    Example:
        >>> chunks = [{"chunk_id": 1, "text": "HR policy text..."}]
        >>> vectors, texts = embed_chunks(chunks)
        >>> print(f"Embedded {len(texts)} chunks into {vectors.shape} vectors")
    """
    if not chunks or not isinstance(chunks, list):
        print("Error: Invalid chunks input (must be a non-empty list)")
        return None, []
    
    try:
        from sentence_transformers import SentenceTransformer
        
        # Initialize the model (downloads on first use)
        print("Loading sentence-transformers model (all-MiniLM-L6-v2)...")
        model = SentenceTransformer('all-MiniLM-L6-v2')
        
        # Extract texts from chunks
        texts = []
        for chunk in chunks:
            if isinstance(chunk, dict) and 'text' in chunk:
                text = chunk['text']
                if text and isinstance(text, str) and text.strip():
                    texts.append(text.strip())
            elif isinstance(chunk, str):
                # Handle case where chunks are just strings
                if chunk.strip():
                    texts.append(chunk.strip())
        
        if not texts:
            print("Error: No valid text found in chunks")
            return None, []
        
        # Generate embeddings
        print(f"Embedding {len(texts)} chunks...")
        embeddings = model.encode(
            texts,
            convert_to_numpy=True,
            show_progress_bar=False,
            normalize_embeddings=True  # Normalize for cosine similarity
        )
        
        print(f"✓ Successfully embedded {len(texts)} chunks")
        return embeddings, texts
        
    except ImportError:
        print("Error: sentence-transformers not installed.")
        print("Please install: pip install sentence-transformers")
        return None, []
    except Exception as e:
        print(f"Error embedding chunks: {e}")
        return None, []


def search_similar_chunks(
    query: str,
    vectors: np.ndarray,
    texts: List[str],
    top_k: int = 3
) -> List[Dict[str, any]]:
    """
    Search for chunks most similar to a query using cosine similarity.
    
    This function embeds the query and computes cosine similarity with
    all chunk embeddings to find the most relevant chunks.
    
    Args:
        query (str): User query/question to search for
        vectors (np.ndarray): Pre-computed chunk embeddings (from embed_chunks)
        texts (List[str]): Original chunk texts (from embed_chunks)
        top_k (int): Number of top results to return (default: 3)
        
    Returns:
        List[Dict[str, any]]: List of dictionaries with:
            - 'chunk_id': Original chunk ID (if available) or index
            - 'text': Chunk text
            - 'score': Similarity score (0-1, higher is more similar)
        Returns empty list on failure
        
    Example:
        >>> results = search_similar_chunks(
        ...     "How many leave days are allowed?",
        ...     vectors,
        ...     texts,
        ...     top_k=3
        ... )
        >>> for result in results:
        ...     print(f"Score: {result['score']:.3f} - {result['text'][:100]}...")
    """
    if not query or not isinstance(query, str) or not query.strip():
        print("Error: Invalid query (must be a non-empty string)")
        return []
    
    if vectors is None or len(vectors) == 0:
        print("Error: No embedding vectors provided")
        return []
    
    if not texts or len(texts) == 0:
        print("Error: No chunk texts provided")
        return []
    
    if len(vectors) != len(texts):
        print(f"Error: Mismatch between vectors ({len(vectors)}) and texts ({len(texts)})")
        return []
    
    if top_k <= 0:
        print("Error: top_k must be positive")
        return []
    
    try:
        from sentence_transformers import SentenceTransformer
        
        # Initialize the same model used for chunking
        model = SentenceTransformer('all-MiniLM-L6-v2')
        
        # Embed the query
        query_embedding = model.encode(
            query,
            convert_to_numpy=True,
            normalize_embeddings=True  # Normalize for cosine similarity
        )
        
        # Compute cosine similarity (dot product since embeddings are normalized)
        # Cosine similarity = dot product when vectors are normalized
        similarities = np.dot(vectors, query_embedding)
        
        # Get top_k indices (highest similarity scores)
        top_k = min(top_k, len(similarities))
        top_indices = np.argsort(similarities)[::-1][:top_k]
        
        # Build results
        results = []
        for idx in top_indices:
            score = float(similarities[idx])
            text = texts[idx]
            
            results.append({
                'chunk_id': idx + 1,  # 1-indexed for readability
                'text': text,
                'score': score
            })
        
        return results
        
    except ImportError:
        print("Error: sentence-transformers not installed.")
        print("Please install: pip install sentence-transformers")
        return []
    except Exception as e:
        print(f"Error searching chunks: {e}")
        return []


def create_search_index(chunks: List[Dict]) -> Tuple[Optional[np.ndarray], List[str], Dict]:
    """
    Create a searchable index from chunks (convenience function).
    
    This is a convenience function that combines embedding and stores
    metadata for easier searching.
    
    Args:
        chunks (List[Dict]): List of chunk dictionaries from Module 3B
        
    Returns:
        Tuple containing:
            - Embedding vectors (np.ndarray)
            - Chunk texts (List[str])
            - Metadata dictionary with chunk IDs
    """
    vectors, texts = embed_chunks(chunks)
    
    if vectors is None:
        return None, [], {}
    
    # Build metadata mapping
    metadata = {}
    for i, chunk in enumerate(chunks):
        if isinstance(chunk, dict):
            chunk_id = chunk.get('chunk_id', i + 1)
            metadata[i] = {
                'chunk_id': chunk_id,
                'original_chunk': chunk
            }
    
    return vectors, texts, metadata


# Test block
if __name__ == "__main__":
    """
    Test the semantic search functionality.
    
    Usage:
        python semantic_search.py
        
    This will test with sample HR document chunks.
    """
    print("=" * 60)
    print("Testing Semantic Search for HR Chatbot")
    print("=" * 60)
    
    # Sample chunks (simulating output from Module 3B)
    sample_chunks = [
        {
            "chunk_id": 1,
            "text": "PURPOSE: This document outlines the company's human resources policies and procedures. All employees are expected to familiarize themselves with these policies."
        },
        {
            "chunk_id": 2,
            "text": "LEAVE POLICY: Employees are entitled to annual leave based on their years of service. Full-time employees receive 20 days of annual leave per year. Part-time employees receive pro-rated leave based on their working hours."
        },
        {
            "chunk_id": 3,
            "text": "Leave requests must be submitted at least two weeks in advance. Approval is subject to business needs and staffing requirements."
        },
        {
            "chunk_id": 4,
            "text": "SICK LEAVE: Employees may take sick leave when they are unable to work due to illness. A medical certificate may be required for absences exceeding three days."
        },
        {
            "chunk_id": 5,
            "text": "BENEFITS: The company offers a comprehensive benefits package including health insurance, retirement plans, and professional development opportunities. Health insurance coverage begins on the first day of employment."
        },
        {
            "chunk_id": 6,
            "text": "POLICY STATEMENT: The company is committed to providing a fair and equitable work environment. We value diversity and inclusion in all aspects of our operations."
        },
        {
            "chunk_id": 7,
            "text": "Employees can choose from several health insurance plan options to suit their needs. The company contributes 80% of the premium cost."
        },
        {
            "chunk_id": 8,
            "text": "RETIREMENT PLANS: Employees are eligible to participate in the 401(k) retirement plan after 90 days of employment. The company matches employee contributions up to 5% of salary."
        }
    ]
    
    print(f"\n1. Loading {len(sample_chunks)} sample chunks...")
    
    # Step 1: Embed chunks
    print("\n2. Embedding chunks...")
    vectors, texts = embed_chunks(sample_chunks)
    
    if vectors is None or len(texts) == 0:
        print("✗ Failed to embed chunks. Exiting test.")
        exit(1)
    
    print(f"   ✓ Embedding shape: {vectors.shape}")
    print(f"   ✓ Number of chunks: {len(texts)}")
    
    # Step 2: Test queries
    test_queries = [
        "How many leave days are allowed?",
        "What is the sick leave policy?",
        "When does health insurance start?",
        "What is the company's diversity policy?",
        "How much does the company contribute to health insurance?"
    ]
    
    print("\n3. Testing semantic search queries...")
    print("=" * 60)
    
    for query in test_queries:
        print(f"\nQuery: \"{query}\"")
        print("-" * 60)
        
        results = search_similar_chunks(query, vectors, texts, top_k=3)
        
        if results:
            print(f"Top {len(results)} results:")
            for i, result in enumerate(results, 1):
                print(f"\n  [{i}] Score: {result['score']:.4f}")
                print(f"      Chunk ID: {result['chunk_id']}")
                print(f"      Text: {result['text'][:150]}...")
        else:
            print("  No results found")
    
    print("\n" + "=" * 60)
    print("Test completed successfully!")
    print("=" * 60)
    
    # Additional statistics
    print(f"\nStatistics:")
    print(f"  - Total chunks indexed: {len(texts)}")
    print(f"  - Embedding dimension: {vectors.shape[1]}")
    print(f"  - Model: all-MiniLM-L6-v2")

