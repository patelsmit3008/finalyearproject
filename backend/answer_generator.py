"""
Module 3D: Answer Generation for HR Chatbot

This module generates natural-language answers from retrieved document chunks
using a Retrieval-Augmented Generation (RAG) approach.

It takes user queries and relevant context chunks from Module 3C, then generates
coherent answers that are strictly based on the provided context.

Dependencies:
    - openai: pip install openai (optional, for LLM-based generation)
    - Alternative: Uses fallback mode if LLM is not available

Author: HR Chatbot System
"""

import os
import sys
from typing import List, Optional, Dict

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import centralized OpenAI client
try:
    from config import get_openai_client
except ImportError:
    get_openai_client = None


def generate_answer(query: str, context_chunks: List[str]) -> str:
    """
    Generate a natural-language answer from retrieved context chunks.
    
    This function uses a RAG (Retrieval-Augmented Generation) approach:
    1. Combines retrieved chunks into a single context
    2. Constructs a prompt that enforces strict adherence to context
    3. Calls an LLM to generate the answer
    4. Falls back to returning the most relevant chunk if LLM is unavailable
    
    Args:
        query (str): User's question/query
        context_chunks (List[str]): List of relevant text chunks from semantic search
        
    Returns:
        str: Generated answer (always returns a string, never None)
        
    Example:
        >>> chunks = ["LEAVE POLICY: Employees receive 20 days...", "..."]
        >>> answer = generate_answer("How many leave days?", chunks)
        >>> print(answer)
    """
    # Validate inputs
    if not query or not isinstance(query, str):
        return "I'm sorry, I didn't understand your question. Could you please rephrase it?"
    
    if not context_chunks or not isinstance(context_chunks, list):
        return "I don't have enough information to answer that question. Please contact HR for assistance."
    
    # Filter out empty chunks
    valid_chunks = [chunk.strip() for chunk in context_chunks if chunk and isinstance(chunk, str) and chunk.strip()]
    
    if not valid_chunks:
        return "I don't have enough information to answer that question. Please contact HR for assistance."
    
    try:
        # Try to use LLM for answer generation
        answer = _generate_with_llm(query, valid_chunks)
        if answer:
            return answer
    except Exception as e:
        print(f"Warning: LLM generation failed ({e}), using fallback mode...")
    
    # Fallback: return the most relevant chunk (first chunk is typically most relevant)
    return _generate_fallback_answer(query, valid_chunks)


def _generate_with_llm(query: str, context_chunks: List[str]) -> Optional[str]:
    """
    Generate answer using an LLM API (OpenAI) with centralized client.
    
    This function constructs a RAG prompt that enforces strict adherence
    to the provided context and prevents hallucination.
    
    Args:
        query (str): User's question
        context_chunks (List[str]): Relevant context chunks
        
    Returns:
        Optional[str]: Generated answer, or None if LLM is unavailable
    """
    if not get_openai_client:
        # Config module not available - fallback to None
        return None
    
    try:
        # Get centralized OpenAI client (validates API key and initializes once)
        client = get_openai_client()
        
        # Combine chunks into a single context
        context = "\n\n".join([f"[Chunk {i+1}]\n{chunk}" for i, chunk in enumerate(context_chunks)])
        
        # Construct RAG prompt with strict instructions
        system_prompt = """You are Helix HR Assistant, an internal AI assistant for employees.

Your role is to answer employee questions strictly using the provided HR documents.
You are NOT allowed to use any external knowledge, assumptions, or general HR information.

RULES (MANDATORY):
1. Use ONLY the content provided in the "HR_DOCUMENTS" section below.
2. If the answer is not explicitly available in the documents, say so clearly: "I don't have that information in the HR documents. Please contact HR for assistance."
3. Do NOT guess, infer, or fabricate policies.
4. Do NOT provide legal, medical, or financial advice.
5. Be concise, professional, and employee-friendly.
6. If the information is incomplete or ambiguous, state that clearly.
7. If multiple documents mention the same policy, prefer the most recent one.

TONE:
- Neutral
- Helpful
- Professional
- No emojis
- No speculation

HR_DOCUMENTS:
{context}"""
        
        user_prompt = f"Question: {query}\n\nAnswer based on the context above:"
        
        # Call OpenAI API using centralized client
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",  # Can be changed to gpt-4 for better quality
            messages=[
                {"role": "system", "content": system_prompt.format(context=context)},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,  # Lower temperature for more factual, less creative responses
            max_tokens=500
        )
        
        # Debug: Print raw OpenAI response object ONCE for debugging
        print("=" * 80)
        print("[Answer Generator] DEBUG - Raw OpenAI Response Object:")
        print("-" * 80)
        print(f"Response type: {type(response)}")
        print(f"Response object: {response}")
        print(f"Response dir: {[attr for attr in dir(response) if not attr.startswith('_')]}")
        print("-" * 80)
        
        # Explicit validation: Check if choices exists and is not empty
        if not hasattr(response, 'choices'):
            print("[Answer Generator] ❌ ERROR: Response object has no 'choices' attribute")
            print(f"[Answer Generator] Available attributes: {[attr for attr in dir(response) if not attr.startswith('_')]}")
            return None
        
        if response.choices is None:
            print("[Answer Generator] ❌ ERROR: Response.choices is None")
            return None
        
        if len(response.choices) == 0:
            print("[Answer Generator] ❌ ERROR: Response.choices list is empty")
            return None
        
        # Extract choice
        choice = response.choices[0]
        print(f"[Answer Generator] DEBUG - Choice type: {type(choice)}")
        print(f"[Answer Generator] DEBUG - Choice object: {choice}")
        
        # Explicit validation: Check if message exists
        if not hasattr(choice, 'message'):
            print("[Answer Generator] ❌ ERROR: Choice has no 'message' attribute")
            print(f"[Answer Generator] Available attributes: {[attr for attr in dir(choice) if not attr.startswith('_')]}")
            return None
        
        if choice.message is None:
            print("[Answer Generator] ❌ ERROR: Choice.message is None")
            return None
        
        print(f"[Answer Generator] DEBUG - Message type: {type(choice.message)}")
        print(f"[Answer Generator] DEBUG - Message object: {choice.message}")
        
        # Explicit validation: Check if content exists
        if not hasattr(choice.message, 'content'):
            print("[Answer Generator] ❌ ERROR: Message has no 'content' attribute")
            print(f"[Answer Generator] Available attributes: {[attr for attr in dir(choice.message) if not attr.startswith('_')]}")
            return None
        
        # Extract content using ONLY response.choices[0].message.content
        content = choice.message.content
        print(f"[Answer Generator] DEBUG - Content type: {type(content)}")
        print(f"[Answer Generator] DEBUG - Content value: {repr(content)}")
        print("=" * 80)
        
        # Explicit validation: Check if content is empty
        if content is None:
            print("[Answer Generator] ❌ ERROR: Message content is None")
            return None
        
        if not isinstance(content, str):
            print(f"[Answer Generator] ❌ ERROR: Message content is not a string (type: {type(content)})")
            return None
        
        content_stripped = content.strip()
        if not content_stripped:
            print("[Answer Generator] ❌ ERROR: Message content is empty or whitespace-only")
            return None
        
        # Successfully extracted content - ensure it's a non-empty string
        print(f"[Answer Generator] ✅ Successfully extracted LLM response ({len(content_stripped)} characters)")
        print(f"[Answer Generator] ✅ First 200 chars: {content_stripped[:200]}")
        return content_stripped
        
    except ValueError as e:
        # API key validation failed
        print(f"[Answer Generator] ❌ Error: OpenAI API key validation failed: {e}")
        import traceback
        traceback.print_exc()
        return None
    except ImportError as e:
        # Package not installed
        print(f"[Answer Generator] ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return None
    except AttributeError as e:
        # Response structure issue
        print(f"[Answer Generator] ❌ Error: Unexpected response structure: {e}")
        print(f"[Answer Generator] ❌ This usually means the OpenAI SDK response format changed")
        import traceback
        traceback.print_exc()
        return None
    except IndexError as e:
        # Choices list access issue
        print(f"[Answer Generator] ❌ Error: Cannot access response choices: {e}")
        import traceback
        traceback.print_exc()
        return None
    except Exception as e:
        # Other API errors
        print(f"[Answer Generator] ❌ Error calling OpenAI API: {e}")
        print(f"[Answer Generator] ❌ Exception type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        return None


def _generate_fallback_answer(query: str, context_chunks: List[str]) -> str:
    """
    Generate answer using fallback method (returns most relevant chunk).
    
    This is used when LLM is not available. It returns the first (most relevant)
    chunk with a brief introduction.
    
    Args:
        query (str): User's question (for context, not used in fallback)
        context_chunks (List[str]): Relevant context chunks
        
    Returns:
        str: Fallback answer based on the most relevant chunk
    """
    if not context_chunks:
        return "I don't have enough information to answer that question. Please contact HR for assistance."
    
    # Use the first chunk (most relevant from semantic search)
    most_relevant = context_chunks[0]
    
    # If there are multiple chunks, mention that
    if len(context_chunks) > 1:
        return f"Based on the HR documents:\n\n{most_relevant}\n\n(Note: Additional relevant information may be available. Please contact HR for complete details.)"
    else:
        return f"Based on the HR documents:\n\n{most_relevant}"


def generate_answer_with_metadata(query: str, context_chunks: List[Dict]) -> Dict:
    """
    Generate answer with additional metadata (chunk IDs, sources, confidence, escalation).
    
    This is an enhanced version that preserves chunk metadata for citation and includes
    confidence scoring and escalation logic based on strict HR document adherence rules.
    
    Args:
        query (str): User's question
        context_chunks (List[Dict]): List of chunk dictionaries with 'text', 'chunk_id', 'score', etc.
        
    Returns:
        Dict: Dictionary with 'answer', 'confidence', 'needsEscalation', 'reason', and 'sources'
    """
    if not context_chunks:
        return {
            'answer': "I don't have enough information in the HR documents to answer that question. Please contact HR for assistance.",
            'confidence': 0.0,
            'needsEscalation': True,
            'reason': 'No relevant documents found',
            'sources': []
        }
    
    # Extract texts and metadata
    texts = []
    sources = []
    for chunk in context_chunks:
        if isinstance(chunk, dict):
            text = chunk.get('text', '')
            if text:
                texts.append(text)
                sources.append({
                    'chunk_id': chunk.get('chunk_id', 'unknown'),
                    'score': chunk.get('score', 0.0)
                })
        elif isinstance(chunk, str):
            texts.append(chunk)
            sources.append({'chunk_id': 'unknown', 'score': 0.0})
    
    # Generate answer using strict HR document rules
    answer_result = _generate_answer_strict(query, texts, sources)
    
    # Calculate confidence from similarity scores and answer quality
    scores = [s.get('score', 0.0) for s in sources]
    avg_similarity = sum(scores) / len(scores) if scores else 0.0
    
    # Adjust confidence based on answer quality indicators
    confidence = _calculate_confidence(avg_similarity, answer_result['answer'], query)
    
    # Determine if escalation is needed
    needs_escalation = confidence < 0.60
    
    # Generate reason for confidence/escalation
    reason = _generate_reason(confidence, avg_similarity, answer_result['answer'])
    
    return {
        'answer': answer_result['answer'],
        'confidence': confidence,
        'needsEscalation': needs_escalation,
        'reason': reason,
        'sources': sources
    }


def _generate_answer_strict(query: str, context_chunks: List[str], sources: List[Dict]) -> Dict:
    """
    Generate answer with strict adherence to HR documents only.
    
    Args:
        query (str): User's question
        context_chunks (List[str]): Relevant context chunks
        sources (List[Dict]): Source metadata
        
    Returns:
        Dict: Dictionary with 'answer' and quality indicators
    """
    if not context_chunks:
        return {
            'answer': "I don't have enough information in the HR documents to answer that question. Please contact HR for assistance.",
            'quality': 'none'
        }
    
    try:
        # Try to use LLM for answer generation with strict rules
        answer = _generate_with_llm_strict(query, context_chunks)
        if answer:
            # Check if answer indicates missing information
            quality = _assess_answer_quality(answer, query, context_chunks)
            return {'answer': answer, 'quality': quality}
    except Exception as e:
        print(f"Warning: LLM generation failed ({e}), using fallback mode...")
    
    # Fallback: return the most relevant chunk with strict disclaimer
    return _generate_fallback_answer_strict(query, context_chunks)


def _generate_with_llm_strict(query: str, context_chunks: List[str]) -> Optional[str]:
    """
    Generate answer using LLM with strict HR document adherence rules.
    
    Uses centralized OpenAI client for consistency and performance.
    
    Args:
        query (str): User's question
        context_chunks (List[str]): Relevant context chunks
        
    Returns:
        Optional[str]: Generated answer, or None if LLM is unavailable
    """
    if not get_openai_client:
        # Config module not available - fallback to None
        return None
    
    try:
        # Get centralized OpenAI client (validates API key and initializes once)
        client = get_openai_client()
        
        # Combine chunks into a single context
        context = "\n\n".join([f"[HR_DOCUMENT_CHUNK {i+1}]\n{chunk}" for i, chunk in enumerate(context_chunks)])
        
        # Construct strict RAG prompt
        system_prompt = """You are Helix HR Assistant, an internal AI assistant for employees.

Your role is to answer employee questions strictly using the provided HR documents.
You are NOT allowed to use any external knowledge, assumptions, or general HR information.

RULES (MANDATORY):
1. Use ONLY the content provided in the "HR_DOCUMENTS" section below.
2. If the answer is not explicitly available in the documents, say so clearly: "I don't have that information in the HR documents. Please contact HR for assistance."
3. Do NOT guess, infer, or fabricate policies.
4. Do NOT provide legal, medical, or financial advice.
5. Be concise, professional, and employee-friendly.
6. If the information is incomplete or ambiguous, state that clearly.
7. If multiple documents mention the same policy, prefer the most recent one.

TONE:
- Neutral
- Helpful
- Professional
- No emojis
- No speculation

HR_DOCUMENTS:
{context}"""
        
        user_prompt = f"Employee Question: {query}\n\nAnswer based ONLY on the HR documents provided above. If the answer is not in the documents, explicitly state that you don't have that information."
        
        # Call OpenAI API using centralized client
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_prompt.format(context=context)},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1,  # Very low temperature for factual, deterministic responses
            max_tokens=400
        )
        
        # Debug: Print raw OpenAI response object ONCE for debugging
        print("=" * 80)
        print("[Answer Generator (Strict)] DEBUG - Raw OpenAI Response Object:")
        print("-" * 80)
        print(f"Response type: {type(response)}")
        print(f"Response object: {response}")
        print(f"Response dir: {[attr for attr in dir(response) if not attr.startswith('_')]}")
        print("-" * 80)
        
        # Explicit validation: Check if choices exists and is not empty
        if not hasattr(response, 'choices'):
            print("[Answer Generator (Strict)] ❌ ERROR: Response object has no 'choices' attribute")
            print(f"[Answer Generator (Strict)] Available attributes: {[attr for attr in dir(response) if not attr.startswith('_')]}")
            return None
        
        if response.choices is None:
            print("[Answer Generator (Strict)] ❌ ERROR: Response.choices is None")
            return None
        
        if len(response.choices) == 0:
            print("[Answer Generator (Strict)] ❌ ERROR: Response.choices list is empty")
            return None
        
        # Extract choice
        choice = response.choices[0]
        print(f"[Answer Generator (Strict)] DEBUG - Choice type: {type(choice)}")
        print(f"[Answer Generator (Strict)] DEBUG - Choice object: {choice}")
        
        # Explicit validation: Check if message exists
        if not hasattr(choice, 'message'):
            print("[Answer Generator (Strict)] ❌ ERROR: Choice has no 'message' attribute")
            print(f"[Answer Generator (Strict)] Available attributes: {[attr for attr in dir(choice) if not attr.startswith('_')]}")
            return None
        
        if choice.message is None:
            print("[Answer Generator (Strict)] ❌ ERROR: Choice.message is None")
            return None
        
        print(f"[Answer Generator (Strict)] DEBUG - Message type: {type(choice.message)}")
        print(f"[Answer Generator (Strict)] DEBUG - Message object: {choice.message}")
        
        # Explicit validation: Check if content exists
        if not hasattr(choice.message, 'content'):
            print("[Answer Generator (Strict)] ❌ ERROR: Message has no 'content' attribute")
            print(f"[Answer Generator (Strict)] Available attributes: {[attr for attr in dir(choice.message) if not attr.startswith('_')]}")
            return None
        
        # Extract content using ONLY response.choices[0].message.content
        content = choice.message.content
        print(f"[Answer Generator (Strict)] DEBUG - Content type: {type(content)}")
        print(f"[Answer Generator (Strict)] DEBUG - Content value: {repr(content)}")
        print("=" * 80)
        
        # Explicit validation: Check if content is empty
        if content is None:
            print("[Answer Generator (Strict)] ❌ ERROR: Message content is None")
            return None
        
        if not isinstance(content, str):
            print(f"[Answer Generator (Strict)] ❌ ERROR: Message content is not a string (type: {type(content)})")
            return None
        
        content_stripped = content.strip()
        if not content_stripped:
            print("[Answer Generator (Strict)] ❌ ERROR: Message content is empty or whitespace-only")
            return None
        
        # Successfully extracted content - ensure it's a non-empty string
        print(f"[Answer Generator (Strict)] ✅ Successfully extracted LLM response ({len(content_stripped)} characters)")
        print(f"[Answer Generator (Strict)] ✅ First 200 chars: {content_stripped[:200]}")
        return content_stripped
        
    except ValueError as e:
        # API key validation failed
        print(f"[Answer Generator] ❌ Error: OpenAI API key validation failed: {e}")
        import traceback
        traceback.print_exc()
        return None
    except ImportError as e:
        # Package not installed
        print(f"[Answer Generator] ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return None
    except AttributeError as e:
        # Response structure issue
        print(f"[Answer Generator] ❌ Error: Unexpected response structure: {e}")
        print(f"[Answer Generator] ❌ This usually means the OpenAI SDK response format changed")
        import traceback
        traceback.print_exc()
        return None
    except IndexError as e:
        # Choices list access issue
        print(f"[Answer Generator] ❌ Error: Cannot access response choices: {e}")
        import traceback
        traceback.print_exc()
        return None
    except Exception as e:
        # Other API errors
        print(f"[Answer Generator] ❌ Error calling OpenAI API: {e}")
        print(f"[Answer Generator] ❌ Exception type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        return None


def _generate_fallback_answer_strict(query: str, context_chunks: List[str]) -> Dict:
    """
    Generate fallback answer with strict disclaimer.
    
    Args:
        query (str): User's question
        context_chunks (List[str]): Relevant context chunks
        
    Returns:
        Dict: Dictionary with 'answer' and 'quality'
    """
    if not context_chunks:
        return {
            'answer': "I don't have enough information in the HR documents to answer that question. Please contact HR for assistance.",
            'quality': 'none'
        }
    
    # Use the first chunk (most relevant from semantic search)
    most_relevant = context_chunks[0]
    
    # Check if the chunk actually answers the question
    quality = 'partial'  # Assume partial unless we can verify
    
    if len(context_chunks) > 1:
        answer = f"Based on the HR documents:\n\n{most_relevant}\n\nNote: If this doesn't fully answer your question, please contact HR for complete details."
    else:
        answer = f"Based on the HR documents:\n\n{most_relevant}\n\nIf this doesn't fully answer your question, please contact HR for assistance."
    
    return {'answer': answer, 'quality': quality}


def _assess_answer_quality(answer: str, query: str, context_chunks: List[str]) -> str:
    """
    Assess the quality of the generated answer.
    
    Args:
        answer (str): Generated answer
        query (str): Original question
        context_chunks (List[str]): Context chunks used
        
    Returns:
        str: Quality indicator ('clear', 'partial', 'none')
    """
    answer_lower = answer.lower()
    
    # Check for indicators of missing information
    missing_indicators = [
        "don't have",
        "not in the",
        "not available",
        "contact hr",
        "not found",
        "unable to find",
        "no information"
    ]
    
    if any(indicator in answer_lower for indicator in missing_indicators):
        return 'none'
    
    # Check if answer is very short (might indicate uncertainty)
    if len(answer.strip()) < 50:
        return 'partial'
    
    # Check if answer contains question keywords
    query_words = set(query.lower().split())
    answer_words = set(answer_lower.split())
    overlap = len(query_words.intersection(answer_words))
    
    if overlap < len(query_words) * 0.3:  # Less than 30% keyword overlap
        return 'partial'
    
    return 'clear'


def _calculate_confidence(avg_similarity: float, answer: str, query: str) -> float:
    """
    Calculate confidence score based on similarity scores and answer quality.
    
    Confidence Guidelines:
    - 0.80 – 1.00 → Answer is clearly stated in documents
    - 0.50 – 0.79 → Partially covered or needs interpretation
    - below 0.50 → Not clearly available, escalate to HR
    
    Args:
        avg_similarity (float): Average similarity score from semantic search
        answer (str): Generated answer
        query (str): Original question
        
    Returns:
        float: Confidence score between 0.0 and 1.0
    """
    # Start with similarity score (0.0 to 1.0)
    confidence = avg_similarity
    
    # Adjust based on answer quality
    answer_lower = answer.lower()
    
    # Penalize if answer indicates missing information
    missing_indicators = [
        "don't have",
        "not in the",
        "not available",
        "contact hr",
        "not found",
        "unable to find",
        "no information"
    ]
    
    if any(indicator in answer_lower for indicator in missing_indicators):
        confidence = min(confidence, 0.40)  # Cap at 0.40 if missing info
    
    # Boost if answer is detailed and contains query keywords
    query_words = set(query.lower().split())
    answer_words = set(answer_lower.split())
    keyword_overlap = len(query_words.intersection(answer_words)) / max(len(query_words), 1)
    
    if keyword_overlap > 0.5 and len(answer) > 100:
        confidence = min(confidence + 0.1, 1.0)  # Boost up to 0.1
    
    # Ensure confidence is within bounds
    confidence = max(0.0, min(1.0, confidence))
    
    # Round to 2 decimal places
    return round(confidence, 2)


def _generate_reason(confidence: float, avg_similarity: float, answer: str) -> str:
    """
    Generate a reason for the confidence score and escalation decision.
    
    Args:
        confidence (float): Calculated confidence score
        avg_similarity (float): Average similarity score
        answer (str): Generated answer
        
    Returns:
        str: Reason string
    """
    if confidence >= 0.80:
        return "Answer is clearly stated in the HR documents"
    elif confidence >= 0.50:
        return "Answer is partially covered in the HR documents or requires interpretation"
    elif avg_similarity < 0.5:
        return "Low similarity between question and available documents"
    elif "don't have" in answer.lower() or "not in" in answer.lower():
        return "Information not found in the HR documents"
    else:
        return "Answer quality is uncertain or incomplete"


# Test block
if __name__ == "__main__":
    """
    Test the answer generation functionality.
    
    Usage:
        python answer_generator.py
        
    This will test with sample queries and retrieved chunks.
    """
    print("=" * 60)
    print("Testing Answer Generation for HR Chatbot")
    print("=" * 60)
    
    # Sample query
    test_query = "How many leave days are allowed?"
    
    # Sample retrieved chunks (simulating output from Module 3C)
    test_chunks = [
        "LEAVE POLICY: Employees are entitled to annual leave based on their years of service. Full-time employees receive 20 days of annual leave per year. Part-time employees receive pro-rated leave based on their working hours.",
        "Leave requests must be submitted at least two weeks in advance. Approval is subject to business needs and staffing requirements. Employees with more than 5 years of service receive an additional 5 days of annual leave.",
        "SICK LEAVE: Employees may take sick leave when they are unable to work due to illness. Sick leave is separate from annual leave and does not count towards the 20-day annual leave entitlement."
    ]
    
    print(f"\nQuery: \"{test_query}\"")
    print("\nRetrieved Context Chunks:")
    print("-" * 60)
    for i, chunk in enumerate(test_chunks, 1):
        print(f"\n[Chunk {i}]")
        print(chunk[:200] + "..." if len(chunk) > 200 else chunk)
    
    print("\n" + "=" * 60)
    print("Generating Answer...")
    print("=" * 60)
    
    # Generate answer
    answer = generate_answer(test_query, test_chunks)
    
    print(f"\nGenerated Answer:")
    print("-" * 60)
    print(answer)
    print("-" * 60)
    
    # Test with metadata
    print("\n" + "=" * 60)
    print("Testing with Metadata...")
    print("=" * 60)
    
    test_chunks_with_metadata = [
        {
            'chunk_id': 2,
            'text': test_chunks[0],
            'score': 0.85
        },
        {
            'chunk_id': 3,
            'text': test_chunks[1],
            'score': 0.72
        },
        {
            'chunk_id': 4,
            'text': test_chunks[2],
            'score': 0.65
        }
    ]
    
    result = generate_answer_with_metadata(test_query, test_chunks_with_metadata)
    
    print(f"\nAnswer: {result['answer']}")
    print(f"Confidence: {result['confidence']:.3f}")
    print(f"Sources: {len(result['sources'])} chunks")
    for source in result['sources']:
        print(f"  - Chunk {source['chunk_id']} (score: {source['score']:.3f})")
    
    # Test edge cases
    print("\n" + "=" * 60)
    print("Testing Edge Cases...")
    print("=" * 60)
    
    # Empty chunks
    empty_answer = generate_answer("Test question", [])
    print(f"\nEmpty chunks test: {empty_answer[:100]}...")
    
    # Question not in context
    unrelated_chunks = ["BENEFITS: Health insurance coverage begins on the first day of employment."]
    unrelated_answer = generate_answer("What is the company's vacation policy?", unrelated_chunks)
    print(f"\nUnrelated question test: {unrelated_answer[:150]}...")
    
    print("\n" + "=" * 60)
    print("Test completed!")
    print("=" * 60)
    
    # Instructions
    print("\nNote: To use LLM-based generation, set OPENAI_API_KEY environment variable:")
    print("  export OPENAI_API_KEY='your-api-key-here'")
    print("  Or install openai: pip install openai")

