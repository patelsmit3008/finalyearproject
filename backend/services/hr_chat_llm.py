"""
HR Chat LLM Service

This service handles LLM-based answer generation for the HR chatbot with strict
document-only responses. LLM output is treated as plain text (NO JSON parsing).

Responsibilities:
- Accept user question and retrieved HR document text
- Inject documents into LLM prompt with strict rules
- Call LLM and extract plain text output
- Compute confidence from similarity scores
- Enforce escalation rules based on confidence
- Return clean Python dict with answer, confidence, needsEscalation, reason

Safety:
- No hallucinated HR policies
- No speculative language
- No markdown or emojis
- LLM output treated as plain text end-to-end (no JSON parsing)
"""

import os
import json
import re
from typing import Dict, List, Optional
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import LLM provider configuration
try:
    from config import LLM_PROVIDER, get_groq_client, get_openai_client
except ImportError:
    LLM_PROVIDER = "mock"
    get_groq_client = None
    get_openai_client = None

# Import Groq client class (lazy import - only when needed)
_groq_available = False
try:
    from groq import Groq
    _groq_available = True
except ImportError:
    Groq = None
    _groq_available = False

# Import OpenAI client class (lazy import - only when needed)
_openai_available = False
try:
    from openai import OpenAI
    _openai_available = True
except ImportError:
    OpenAI = None
    _openai_available = False

# Groq model configuration
GROQ_MODEL_NAME = "llama-3.1-8b-instant"

# Strict system prompt constant - enforces document-only responses
HR_LLM_SYSTEM_PROMPT = """You are an HR Policy Assistant.

You must answer employee questions STRICTLY using ONLY the provided HR document excerpts below.
You must NEVER use external knowledge, assumptions, or general HR information.

CRITICAL RULES:
1. Answer ONLY using the provided HR document excerpts
2. If the answer is not clearly present in the documents, explicitly state: "I don't have that information in the HR documents. Please contact HR for assistance."
3. Do NOT guess, infer, or fabricate policies
4. Do NOT provide legal, medical, or financial advice
5. Be concise, professional, and employee-friendly
6. If information is incomplete or ambiguous, state that clearly

OUTPUT FORMAT (MANDATORY):
You MUST output ONLY valid JSON. Never include markdown, explanations, or text outside the JSON object.

Required JSON structure:
{{
  "answer": "string - your answer based on documents",
  "confidence": 0.0-1.0,
  "needsEscalation": true or false,
  "reason": "string - explanation for confidence and escalation"
}}

CONFIDENCE RULES:
- 0.80 - 1.00: Answer is explicitly stated in documents
- 0.50 - 0.79: Answer is partially stated or requires inference
- Below 0.50: Answer is unclear or missing from documents

ESCALATION RULE:
- needsEscalation = true when confidence < 0.60

TONE:
- Neutral
- Helpful
- Professional
- No emojis
- No speculation

HR DOCUMENT EXCERPTS:
{documents}"""


def _get_fallback_response(reason: str = "LLM response unavailable or invalid") -> Dict:
    """
    Get the default fallback response structure.
    
    This is the EXACT fallback response that must be returned when LLM fails.
    
    Args:
        reason (str): Reason for fallback
        
    Returns:
        Dict: Default fallback response
    """
    return {
        "answer": "Unable to confidently answer based on HR documents.",
        "confidence": 0.0,
        "needsEscalation": True,
        "reason": reason
    }


def _ensure_valid_response(response: Dict) -> Dict:
    """
    Ensure response dict has all required fields with safe defaults.
    
    This function guarantees a valid response structure even if the LLM
    returns incomplete or malformed data.
    
    Args:
        response (Dict): Response dict (may be incomplete)
        
    Returns:
        Dict: Valid response dict with all required fields
    """
    if not isinstance(response, dict):
        print(f"[Safe Response] ⚠️  Response is not a dict: {type(response)}")
        return _get_fallback_response("Response is not a dictionary")
    
    # Extract fields with safe defaults
    answer = response.get("answer", "")
    if not answer or not isinstance(answer, str):
        answer = "Unable to confidently answer based on HR documents."
    
    confidence = response.get("confidence", 0.0)
    try:
        confidence = float(confidence)
        confidence = max(0.0, min(1.0, confidence))  # Clamp to [0.0, 1.0]
    except (ValueError, TypeError):
        confidence = 0.0
    
    needs_escalation = response.get("needsEscalation", True)
    try:
        needs_escalation = bool(needs_escalation)
    except (ValueError, TypeError):
        needs_escalation = True  # Default to escalation on error
    
    reason = response.get("reason", "")
    if not reason or not isinstance(reason, str):
        reason = "LLM response unavailable or invalid"
    
    return {
        "answer": answer.strip() if answer else "Unable to confidently answer based on HR documents.",
        "confidence": round(confidence, 2),
        "needsEscalation": needs_escalation,
        "reason": reason.strip() if reason else "LLM response unavailable or invalid"
    }


def generate_response(
    question: str,
    document_texts: List[str],
    user_id: Optional[str] = None,
    similarity_scores: Optional[List[float]] = None
) -> Dict:
    """
    Generate HR chatbot response using LLM with strict document-only policy.
    
    Args:
        question (str): Employee's question
        document_texts (List[str]): Retrieved HR document text chunks
        user_id (Optional[str]): User ID for logging (optional)
        
    Returns:
        Dict: Structured response with:
            - answer (str): Generated answer
            - confidence (float): Confidence score 0.0-1.0
            - needsEscalation (bool): Whether to escalate to HR
            - reason (str): Explanation for confidence/escalation
            
    Safety:
        - Always returns valid dict structure
        - Falls back safely on LLM errors or invalid JSON
        - Enforces confidence bounds
        - Enforces escalation rules
    """
    # Validate inputs
    if not question or not isinstance(question, str) or not question.strip():
        return _get_fallback_response("Invalid question provided")
    
    if not document_texts or not isinstance(document_texts, list) or len(document_texts) == 0:
        # No documents available - low confidence, escalate
        return {
            "answer": "I don't have enough information in the HR documents to answer that question. Please contact HR for assistance.",
            "confidence": 0.0,
            "needsEscalation": True,
            "reason": "No relevant HR documents found"
        }
    
    # Filter out empty document texts
    valid_docs = [doc.strip() for doc in document_texts if doc and isinstance(doc, str) and doc.strip()]
    if not valid_docs:
        return {
            "answer": "I don't have enough information in the HR documents to answer that question. Please contact HR for assistance.",
            "confidence": 0.0,
            "needsEscalation": True,
            "reason": "No valid document content available"
        }
    
    # Combine documents into context
    documents_context = "\n\n".join([f"[Document Excerpt {i+1}]\n{doc}" for i, doc in enumerate(valid_docs)])
    
    try:
        # Call LLM with strict prompt
        llm_response = _call_llm(question, documents_context)
        
        # Explicit validation: Ensure llm_response is a non-empty string before fallback logic
        # Only return "LLM did not return a response" if content is truly empty
        if llm_response is None:
            print("[LLM Response] ❌ ERROR: LLM call returned None - Groq API did not return any content (falling back to Mock LLM Mode)")
            return {
                "answer": "I'm having trouble generating a response right now. Please contact HR for assistance.",
                "confidence": 0.0,
                "needsEscalation": True,
                "reason": "LLM did not return a response"
            }
        
        if not isinstance(llm_response, str):
            print(f"[LLM Response] ❌ ERROR: LLM call returned non-string type: {type(llm_response)}")
            print(f"[LLM Response] ❌ ERROR: Value: {repr(llm_response)}")
            return {
                "answer": "I'm having trouble generating a response right now. Please contact HR for assistance.",
                "confidence": 0.0,
                "needsEscalation": True,
                "reason": "LLM returned invalid response type"
            }
        
        llm_response_stripped = llm_response.strip()
        if not llm_response_stripped:
            print("[LLM Response] ❌ ERROR: LLM call returned empty or whitespace-only response")
            print(f"[LLM Response] ❌ ERROR: Original length: {len(llm_response)}, Stripped length: {len(llm_response_stripped)}")
            return {
                "answer": "I'm having trouble generating a response right now. Please contact HR for assistance.",
                "confidence": 0.0,
                "needsEscalation": True,
                "reason": "LLM returned empty response"
            }
        
        # LLM response is valid non-empty string - treat as plain text
        print(f"[LLM Response] ✅ LLM returned valid response ({len(llm_response_stripped)} characters)")
        
        # Log LLM text output
        print("=" * 80)
        print("LLM TEXT:", llm_response_stripped)
        print("=" * 80)
        
        # Compute average similarity score for confidence calculation
        computed_confidence = 0.6  # Default fallback
        if similarity_scores and len(similarity_scores) > 0:
            computed_confidence = sum(similarity_scores) / len(similarity_scores)
            computed_confidence = max(0.0, min(1.0, computed_confidence))  # Clamp to [0.0, 1.0]
        
        # Capture RAW LLM response as string and log it BEFORE any parsing
        raw_llm_response = llm_response_stripped
        
        # CRITICAL: Log the RAW LLM response string BEFORE parsing
        print("=" * 80)
        print("[LLM Response] RAW LLM RESPONSE STRING (BEFORE PARSING):")
        print("-" * 80)
        print(repr(raw_llm_response))  # Use repr() to show exact string including newlines
        print("-" * 80)
        print(f"Type: {type(raw_llm_response)}")
        print(f"Length: {len(raw_llm_response)} characters")
        print("=" * 80)
        
        # Stop assuming the response is valid JSON
        # Treat the LLM response as plain text first
        # Safely parse LLM response (may be JSON-like or plain text)
        parsed_result = safe_parse_llm_json(raw_llm_response, computed_confidence)
        
        # Extract parsed fields with fallbacks
        answer = parsed_result.get("answer", raw_llm_response)  # Fallback to raw text if parsing failed
        confidence = parsed_result.get("confidence", computed_confidence)
        needs_escalation = parsed_result.get("needsEscalation", confidence < 0.6)
        reason = parsed_result.get("reason", "")
        
        # Generate reason if not provided by parsing
        if not reason:
            if confidence >= 0.80:
                reason = "Answer is explicitly stated in the HR documents"
            elif confidence >= 0.50:
                reason = "Answer is partially stated in the HR documents or requires interpretation"
            else:
                reason = "Answer is unclear or missing from the HR documents"
        
        # Construct the final API response manually
        # Always return valid ChatResponse schema
        response_dict = {
            "answer": answer,
            "confidence": round(confidence, 2),
            "needsEscalation": needs_escalation,
            "reason": reason
            # Note: sources are added in app.py from search_results
        }
        
        # CRITICAL: Ensure response is valid before returning
        return _ensure_valid_response(response_dict)
        
    except Exception as e:
        # Catch any unexpected errors and fallback safely
        # Log the error with full context
        print("=" * 80)
        print(f"[LLM Response] ❌ ERROR in generate_response: {e}")
        print(f"[LLM Response] ❌ Error type: {type(e).__name__}")
        print(f"[LLM Response] ❌ Raw LLM response was: {repr(raw_llm_response) if 'raw_llm_response' in locals() else 'N/A'}")
        print("=" * 80)
        import traceback
        traceback.print_exc()
        # Return EXACT default fallback response (do NOT crash)
        return _get_fallback_response(f"Error processing response: {str(e)}")


def _call_llm(question: str, documents_context: str) -> Optional[str]:
    """
    Call LLM API with strict prompt using the configured provider.
    
    Routes LLM calls based on LLM_PROVIDER:
    - groq → _call_groq_llm()
    - openai → _call_openai_llm()
    - mock → return deterministic document-based mock response
    
    Args:
        question (str): User's question
        documents_context (str): Combined HR document excerpts
        
    Returns:
        Optional[str]: LLM response text, or None on failure
    """
    # Route ALL LLM calls based on LLM_PROVIDER (single source of truth)
    # Get provider dynamically from config
    try:
        from config import LLM_PROVIDER as current_provider
    except ImportError:
        current_provider = "mock"
    
    provider = current_provider.lower() if current_provider else "mock"
    
    # Log provider name once per LLM request (debug level)
    print(f"[LLM] Using provider: {provider}")
    
    if provider == "groq":
        return _call_groq_llm(question, documents_context)
    elif provider == "openai":
        return _call_openai_llm(question, documents_context)
    else:
        # mock mode - return deterministic document-based mock response
        return _call_mock_llm(question, documents_context)


def _call_groq_llm(question: str, documents_context: str) -> Optional[str]:
    """
    Call Groq LLM API.
    
    Args:
        question (str): User's question
        documents_context (str): Combined HR document excerpts
        
    Returns:
        Optional[str]: LLM response text, or None on failure
    """
    # Ensure no Groq code path is executed unless LLM_PROVIDER="groq"
    try:
        from config import LLM_PROVIDER as current_provider
    except ImportError:
        current_provider = "mock"
    
    if current_provider.lower() != "groq":
        print(f"[Groq] ❌ Error: Groq called but LLM_PROVIDER={current_provider}")
        return None
    
    # Check if Groq is available
    if not _groq_available or get_groq_client is None:
        print("[Groq] ❌ Error: Groq package not available")
        return None
    
    try:
        # Get Groq client
        client = get_groq_client()
        
        # Format system prompt with documents
        system_prompt = HR_LLM_SYSTEM_PROMPT.format(documents=documents_context)
        
        # User prompt - plain text response (no JSON requirement)
        user_prompt = f"""Employee Question: {question}

Please provide a clear, helpful answer based on the HR documents provided above."""
        
        # Debug: Log before Groq call
        print("=" * 80)
        print("[Groq] ENTERING GROQ LLM CALL")
        print("-" * 80)
        print(f"Question: {question[:100]}...")
        print(f"Model: {GROQ_MODEL_NAME}")
        print("-" * 80)
        
        # Call Groq API using Chat Completions API
        response = client.chat.completions.create(
            model=GROQ_MODEL_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.2,  # Low temperature for factual, deterministic responses
            max_tokens=1024   # Reasonable token limit
        )
        
        # Debug: Print raw Groq response
        print("=" * 80)
        print("[Groq] RAW GROQ RESPONSE:")
        print("-" * 80)
        print(f"Response type: {type(response)}")
        print(f"Response object: {response}")
        print("-" * 80)
        
        # Extract content using ONLY completion.choices[0].message.content
        if not hasattr(response, 'choices') or not response.choices or len(response.choices) == 0:
            print("[Groq] ❌ ERROR: Response.choices is empty")
            return None
        
        choice = response.choices[0]
        if not hasattr(choice, 'message') or not choice.message:
            print("[Groq] ❌ ERROR: Choice.message is missing")
            return None
        
        if not hasattr(choice.message, 'content'):
            print("[Groq] ❌ ERROR: Message.content is missing")
            return None
        
        content = choice.message.content
        
        # Debug: Print extracted llm_text
        print("=" * 80)
        print("[Groq] EXTRACTED LLM_TEXT:")
        print("-" * 80)
        print(f"Content type: {type(content)}")
        print(f"Content value: {repr(content)}")
        print(f"Content length: {len(content) if content else 0} characters")
        if content:
            print(f"Content preview: {content[:200]}...")
        print("=" * 80)
        
        # Validate content
        if content is None or not isinstance(content, str):
            print("[Groq] ❌ ERROR: Invalid content type")
            return None
        
        content_stripped = content.strip()
        if not content_stripped:
            print("[Groq] ❌ ERROR: Content is empty")
            return None
        
        # Successfully extracted content
        print("[Groq] ✅ LLM call successful")
        print(f"[Groq] Raw response: {content_stripped[:200]}...")
        print(f"[Groq] ✅ Successfully extracted LLM response ({len(content_stripped)} characters)")
        return content_stripped
        
    except Exception as e:
        # If Groq API fails, return None (will fall back to mock)
        print(f"[Groq] ❌ Error calling Groq API: {e}")
        print(f"[Groq] Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        return None


def _call_openai_llm(question: str, documents_context: str) -> Optional[str]:
    """
    Call OpenAI LLM API.
    
    Args:
        question (str): User's question
        documents_context (str): Combined HR document excerpts
        
    Returns:
        Optional[str]: LLM response text, or None on failure
    """
    # Ensure no OpenAI code path is executed unless LLM_PROVIDER="openai"
    try:
        from config import LLM_PROVIDER as current_provider
    except ImportError:
        current_provider = "mock"
    
    if current_provider.lower() != "openai":
        print(f"[OpenAI] ❌ Error: OpenAI called but LLM_PROVIDER={current_provider}")
        return None
    
    # Check if OpenAI is available
    if not _openai_available or get_openai_client is None:
        print("[OpenAI] ❌ Error: OpenAI package not available")
        return None
    
    try:
        # Get OpenAI client
        client = get_openai_client()
        
        # Format system prompt with documents
        system_prompt = HR_LLM_SYSTEM_PROMPT.format(documents=documents_context)
        
        # User prompt - plain text response (no JSON requirement)
        user_prompt = f"""Employee Question: {question}

Please provide a clear, helpful answer based on the HR documents provided above."""
        
        # Debug: Log before OpenAI call
        print("=" * 80)
        print("[OpenAI] ENTERING OPENAI LLM CALL")
        print("-" * 80)
        print(f"Question: {question[:100]}...")
        print(f"Model: gpt-3.5-turbo")
        print("-" * 80)
        
        # Call OpenAI API using Chat Completions API
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1,  # Very low temperature for factual, deterministic responses
            max_tokens=400   # Limit tokens to prevent verbose responses
        )
        
        # Debug: Print raw OpenAI response
        print("=" * 80)
        print("[OpenAI] RAW OPENAI RESPONSE:")
        print("-" * 80)
        print(f"Response type: {type(response)}")
        print(f"Response object: {response}")
        print("-" * 80)
        
        # Extract content using ONLY response.choices[0].message.content
        if not hasattr(response, 'choices') or not response.choices or len(response.choices) == 0:
            print("[OpenAI] ❌ ERROR: Response.choices is empty")
            return None
        
        choice = response.choices[0]
        if not hasattr(choice, 'message') or not choice.message:
            print("[OpenAI] ❌ ERROR: Choice.message is missing")
            return None
        
        if not hasattr(choice.message, 'content'):
            print("[OpenAI] ❌ ERROR: Message.content is missing")
            return None
        
        content = choice.message.content
        
        # Debug: Print extracted llm_text
        print("=" * 80)
        print("[OpenAI] EXTRACTED LLM_TEXT:")
        print("-" * 80)
        print(f"Content type: {type(content)}")
        print(f"Content value: {repr(content)}")
        print(f"Content length: {len(content) if content else 0} characters")
        if content:
            print(f"Content preview: {content[:200]}...")
        print("=" * 80)
        
        # Validate content
        if content is None or not isinstance(content, str):
            print("[OpenAI] ❌ ERROR: Invalid content type")
            return None
        
        content_stripped = content.strip()
        if not content_stripped:
            print("[OpenAI] ❌ ERROR: Content is empty")
            return None
        
        # Successfully extracted content
        print("[OpenAI] ✅ LLM call successful")
        print(f"[OpenAI] Raw response: {content_stripped[:200]}...")
        print(f"[OpenAI] ✅ Successfully extracted LLM response ({len(content_stripped)} characters)")
        return content_stripped
        
    except Exception as e:
        # If OpenAI API fails, return None (will fall back to mock)
        print(f"[OpenAI] ❌ Error calling OpenAI API: {e}")
        print(f"[OpenAI] Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        return None


def _call_mock_llm(question: str, documents_context: str) -> Optional[str]:
    """
    Return deterministic document-based mock response.
    
    This function provides a mock LLM response based on the documents
    without making any external API calls. Used when LLM_PROVIDER="mock".
    
    Args:
        question (str): User's question
        documents_context (str): Combined HR document excerpts
        
    Returns:
        str: Mock response based on documents
    """
    print("[Mock LLM] Generating deterministic document-based response")
    
    # Simple keyword-based response generation from documents
    question_lower = question.lower()
    documents_lower = documents_context.lower()
    
    # Check if question keywords appear in documents
    keywords = question_lower.split()
    relevant_keywords = [kw for kw in keywords if len(kw) > 3 and kw in documents_lower]
    
    if relevant_keywords:
        # Generate a simple response based on document content
        # Extract a relevant sentence from documents
        sentences = documents_context.split('.')
        relevant_sentences = [s.strip() for s in sentences if any(kw in s.lower() for kw in relevant_keywords)]
        
        if relevant_sentences:
            # Return first relevant sentence (truncated if too long)
            response = relevant_sentences[0]
            if len(response) > 300:
                response = response[:300] + "..."
            return response
    
    # Fallback: return a generic response
    return f"Based on the HR documents provided, I can help answer your question about '{question}'. Please review the relevant policy sections in the documents above for detailed information."


def safe_parse_llm_json(response_text: str, default_confidence: float = 0.6) -> Dict:
    """
    Safely parse LLM response that may be JSON-like or plain text.
    
    Handles cases where LLM returns:
    - Raw JSON: {"answer": "...", "confidence": 0.8}
    - JSON with code fences: ```json\n{"answer": "..."}\n```
    - JSON with leading/trailing text: "Here's the answer:\n{\"answer\": \"...\"}"
    - Plain text: "The answer is..."
    
    Args:
        response_text (str): Raw LLM response text
        default_confidence (float): Default confidence if not found in JSON (0.0-1.0)
        
    Returns:
        Dict: Always returns valid response dict with:
            - answer (str): Parsed answer or entire response if JSON parsing failed
            - confidence (float): Parsed confidence or default_confidence
            - needsEscalation (bool): Parsed escalation flag or computed from confidence
            - reason (str): Parsed reason or empty string
    """
    if not response_text or not isinstance(response_text, str):
        # Empty or invalid input - return safe fallback
        return {
            "answer": "Unable to generate a response. Please contact HR for assistance.",
            "confidence": 0.0,
            "needsEscalation": True,
            "reason": "Empty or invalid LLM response"
        }
    
    # Step 1: Treat the LLM response as plain text (no assumptions)
    # Remove markdown code fences if present
    text_clean = response_text.strip()
    
    # Remove markdown code blocks
    if text_clean.startswith("```json"):
        text_clean = text_clean[7:].strip()
        print("[Safe Parse] Removed ```json code fence")
    elif text_clean.startswith("```"):
        text_clean = text_clean[3:].strip()
        print("[Safe Parse] Removed ``` code fence")
    
    if text_clean.endswith("```"):
        text_clean = text_clean[:-3].strip()
        print("[Safe Parse] Removed trailing ```")
    
    # Step 2: Extract the first { ... } JSON block using regex
    # This is the safe JSON extraction method
    print(f"[Safe Parse] Attempting to extract JSON from text ({len(text_clean)} chars)")
    json_text = _extract_json_from_text(text_clean)
    
    # Step 3: Only then call json.loads() on the extracted block
    if json_text:
        try:
            # CRITICAL: Never directly call json.loads() on raw LLM response
            # Only parse the extracted JSON text block
            print(f"[Safe Parse] Attempting to parse extracted JSON ({len(json_text)} chars)")
            parsed = json.loads(json_text)
            print("[Safe Parse] ✅ JSON parsing successful")
            
            # Validate structure
            if not isinstance(parsed, dict):
                # Not a dict - treat entire response as plain text
                print("[Safe Parse] ⚠️  Extracted JSON is not a dictionary, treating entire response as plain text")
                return {
                    "answer": text_clean,
                    "confidence": max(0.0, min(1.0, default_confidence)),
                    "needsEscalation": default_confidence < 0.6,
                    "reason": ""
                }
            
            # Extract fields with safe defaults
            answer = parsed.get("answer", "")
            if not answer or not isinstance(answer, str):
                # Answer field missing or invalid - use entire response as answer
                answer = text_clean
            
            # Extract confidence with validation
            confidence = parsed.get("confidence", default_confidence)
            try:
                confidence = float(confidence)
                confidence = max(0.0, min(1.0, confidence))  # Clamp to [0.0, 1.0]
            except (ValueError, TypeError):
                # Invalid confidence - use default
                confidence = max(0.0, min(1.0, default_confidence))
            
            # Extract needsEscalation with validation
            needs_escalation = parsed.get("needsEscalation", confidence < 0.6)
            try:
                needs_escalation = bool(needs_escalation)
            except (ValueError, TypeError):
                # Invalid needsEscalation - use confidence-based rule
                needs_escalation = confidence < 0.6
            
            # Extract reason
            reason = parsed.get("reason", "")
            if not isinstance(reason, str):
                reason = ""
            
            print("[Safe Parse] ✅ Successfully parsed JSON response")
            return {
                "answer": answer.strip(),
                "confidence": round(confidence, 2),
                "needsEscalation": needs_escalation,
                "reason": reason.strip()
            }
            
        except json.JSONDecodeError as e:
            # JSON parsing failed even after extraction - treat entire response as plain text
            print(f"[Safe Parse] ⚠️  JSON parse error: {e}")
            print(f"[Safe Parse] ⚠️  Treating entire response as plain text answer")
            
            return {
                "answer": text_clean,
                "confidence": max(0.0, min(1.0, default_confidence)),
                "needsEscalation": default_confidence < 0.6,
                "reason": ""
            }
        
        except Exception as e:
            # Any other error during JSON parsing - treat entire response as plain text
            print(f"[Safe Parse] ⚠️  Unexpected error parsing JSON: {e}")
            print(f"[Safe Parse] ⚠️  Treating entire response as plain text answer")
            
            return {
                "answer": text_clean,
                "confidence": max(0.0, min(1.0, default_confidence)),
                "needsEscalation": default_confidence < 0.6,
                "reason": ""
            }
    
    else:
        # No JSON found in response - treat entire output as plain text
        print("[Safe Parse] ℹ️  No JSON object found in response, treating as plain text answer")
        
        return {
            "answer": text_clean,
            "confidence": max(0.0, min(1.0, default_confidence)),
            "needsEscalation": default_confidence < 0.6,
            "reason": ""
        }


def _extract_json_from_text(text: str) -> Optional[str]:
    """
    Extract JSON object from text using regex or first { ... } block detection.
    
    This function implements a safe JSON extraction method:
    - Treats input as plain text (no assumptions)
    - Removes markdown code fences if present
    - Extracts the first { ... } JSON block using regex
    - Only then validates it's valid JSON
    
    Args:
        text (str): Text that may contain JSON
        
    Returns:
        Optional[str]: Extracted JSON string, or None if not found
    """
    if not text or not isinstance(text, str):
        return None
    
    # Remove markdown code blocks if present
    text_clean = text.strip()
    if text_clean.startswith("```json"):
        text_clean = text_clean[7:].strip()
    elif text_clean.startswith("```"):
        text_clean = text_clean[3:].strip()
    
    if text_clean.endswith("```"):
        text_clean = text_clean[:-3].strip()
    
    # Remove leading/trailing whitespace and newlines
    text_clean = text_clean.strip()
    
    # Method 1: Find first { and match closing } (most reliable for nested JSON)
    brace_start = text_clean.find('{')
    if brace_start != -1:
        brace_count = 0
        brace_end = -1
        for i in range(brace_start, len(text_clean)):
            if text_clean[i] == '{':
                brace_count += 1
            elif text_clean[i] == '}':
                brace_count -= 1
                if brace_count == 0:
                    brace_end = i
                    break
        
        if brace_end != -1:
            json_candidate = text_clean[brace_start:brace_end + 1].strip()
            # Validate it's actually valid JSON before returning
            try:
                json.loads(json_candidate)
                print(f"[Extract JSON] ✅ Found valid JSON block: {len(json_candidate)} chars")
                return json_candidate
            except json.JSONDecodeError as e:
                print(f"[Extract JSON] ⚠️  JSON block found but invalid: {e}")
                # Continue to try other methods
    
    # Method 2: Try to find first complete JSON object using regex
    # Match { ... } with balanced braces (handles nested objects)
    json_pattern = r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}'
    matches = re.findall(json_pattern, text_clean, re.DOTALL)
    
    if matches:
        # Try each match until we find valid JSON
        for match in matches:
            match_clean = match.strip()
            try:
                # Validate it's actually JSON
                json.loads(match_clean)
                print(f"[Extract JSON] ✅ Found valid JSON via regex: {len(match_clean)} chars")
                return match_clean
            except json.JSONDecodeError:
                continue
    
    # Method 3: Try parsing the entire cleaned text as JSON
    try:
        json.loads(text_clean)
        print(f"[Extract JSON] ✅ Entire text is valid JSON: {len(text_clean)} chars")
        return text_clean
    except json.JSONDecodeError:
        pass
    
    print("[Extract JSON] ❌ No valid JSON object found in text")
    return None


def _parse_llm_json_safe(llm_response: str, similarity_score: float = 0.6) -> Dict:
    """
    Safely parse LLM response with graceful fallback to plain text.
    
    This function attempts to extract and parse JSON but never crashes. 
    If parsing fails, it treats the entire LLM output as the answer and
    computes confidence from similarity scores.
    
    Args:
        llm_response (str): Raw LLM response text
        similarity_score (float): Average similarity score from semantic search (0.0-1.0)
        
    Returns:
        Dict: Always returns a valid response dict with:
            - answer (str): Parsed answer or entire LLM output if JSON parsing failed
            - confidence (float): Parsed confidence or computed from similarity score
            - needsEscalation (bool): Parsed escalation flag or computed from confidence
            - reason (str): Parsed reason or default message
    """
    if not llm_response or not isinstance(llm_response, str):
        # Empty or invalid input - return safe fallback
        return {
            "answer": "Unable to generate a response. Please contact HR for assistance.",
            "confidence": 0.0,
            "needsEscalation": True,
            "reason": "Empty or invalid LLM response"
        }
    
    # Capture raw response for fallback
    raw_response = llm_response.strip()
    
    # Try to extract JSON from response using multiple methods
    json_text = _extract_json_from_text(llm_response)
    
    # Attempt JSON parsing if JSON was extracted
    if json_text:
        try:
            parsed = json.loads(json_text)
        
            # Validate structure
            if not isinstance(parsed, dict):
                # Not a dict - treat entire response as plain text
                print("[LLM Response] ⚠️  Extracted JSON is not a dictionary, treating entire response as plain text")
                # Use entire raw response as answer
                computed_confidence = max(0.0, min(1.0, similarity_score))
                return {
                    "answer": raw_response,
                    "confidence": round(computed_confidence, 2),
                    "needsEscalation": computed_confidence < 0.60,
                    "reason": "Answer generated but JSON structure missing"
                }
            
            # Validate and extract fields with safe defaults
            answer = parsed.get("answer", "")
            if not answer or not isinstance(answer, str):
                # Answer field missing or invalid - use entire raw response
                answer = raw_response
        
            # Extract confidence with validation
            confidence = parsed.get("confidence", similarity_score)
            try:
                confidence = float(confidence)
                confidence = max(0.0, min(1.0, confidence))  # Clamp to [0.0, 1.0]
            except (ValueError, TypeError):
                # Invalid confidence - use similarity score
                confidence = max(0.0, min(1.0, similarity_score))
        
            # Extract needsEscalation with validation
            needs_escalation = parsed.get("needsEscalation", confidence < 0.60)
            try:
                needs_escalation = bool(needs_escalation)
            except (ValueError, TypeError):
                # Invalid needsEscalation - use confidence-based rule
                needs_escalation = confidence < 0.60
            
            # Extract reason
            reason = parsed.get("reason", "")
            if not reason or not isinstance(reason, str):
                # Generate default reason based on confidence
                if confidence >= 0.80:
                    reason = "Answer is explicitly stated in the HR documents"
                elif confidence >= 0.50:
                    reason = "Answer is partially stated in the HR documents or requires interpretation"
                else:
                    reason = "Answer is unclear or missing from the HR documents"
            
            print("[LLM Response] ✅ Successfully parsed JSON response")
            return {
                "answer": answer.strip(),
                "confidence": round(confidence, 2),
                "needsEscalation": needs_escalation,
                "reason": reason.strip()
            }
            
        except json.JSONDecodeError as e:
            # JSON parsing failed even after extraction - treat entire response as plain text
            print(f"[LLM Response] ⚠️  JSON parse error: {e}")
            print(f"[LLM Response] ⚠️  Treating entire LLM output as plain text answer")
            
            # Use entire raw response as the answer
            computed_confidence = max(0.0, min(1.0, similarity_score))
            return {
                "answer": raw_response,
                "confidence": round(computed_confidence, 2),
                "needsEscalation": computed_confidence < 0.60,
                "reason": "Answer generated but JSON structure missing"
            }
        
        except Exception as e:
            # Any other error during JSON parsing - treat entire response as plain text
            print(f"[LLM Response] ⚠️  Unexpected error parsing JSON: {e}")
            print(f"[LLM Response] ⚠️  Treating entire LLM output as plain text answer")
            
            # Use entire raw response as the answer
            computed_confidence = max(0.0, min(1.0, similarity_score))
            return {
                "answer": raw_response,
                "confidence": round(computed_confidence, 2),
                "needsEscalation": computed_confidence < 0.60,
                "reason": "Answer generated but JSON structure missing"
            }
    
    else:
        # No JSON found in response - treat entire output as plain text
        print("[LLM Response] ⚠️  No JSON object found in response, treating entire output as plain text answer")
        
        # Use entire raw response as the answer
        computed_confidence = max(0.0, min(1.0, similarity_score))
        return {
            "answer": raw_response,
            "confidence": round(computed_confidence, 2),
            "needsEscalation": computed_confidence < 0.60,
            "reason": "Answer generated but JSON structure missing"
        }


def _parse_llm_json(llm_response: str) -> Optional[Dict]:
    """
    Parse LLM JSON response with safety checks (legacy function, kept for compatibility).
    
    This function is deprecated in favor of _parse_llm_json_safe which never crashes.
    
    Args:
        llm_response (str): Raw LLM response text
        
    Returns:
        Optional[Dict]: Parsed JSON dict, or None if invalid
    """
    # Delegate to safe parser and convert None to Optional return
    result = _parse_llm_json_safe(llm_response)
    # Only return None if it's a true error case (shouldn't happen with safe parser)
    if result.get("confidence", 0.0) == 0.0 and result.get("needsEscalation", False) and "invalid" in result.get("reason", "").lower():
        return None
    return result




# Test block
if __name__ == "__main__":
    """
    Test the HR Chat LLM service.
    
    Usage:
        python -m backend.services.hr_chat_llm
    """
    print("=" * 60)
    print("Testing HR Chat LLM Service")
    print("=" * 60)
    
    # Sample test
    test_question = "How many leave days am I entitled to?"
    test_documents = [
        "LEAVE POLICY: Employees are entitled to annual leave based on their years of service. Full-time employees receive 20 days of annual leave per year.",
        "Leave requests must be submitted at least two weeks in advance. Approval is subject to business needs and staffing requirements."
    ]
    
    print(f"\nQuestion: {test_question}")
    print(f"\nDocuments: {len(test_documents)} excerpts")
    
    result = generate_response(test_question, test_documents)
    
    print("\n" + "=" * 60)
    print("Result:")
    print("=" * 60)
    print(f"Answer: {result['answer']}")
    print(f"Confidence: {result['confidence']}")
    print(f"Needs Escalation: {result['needsEscalation']}")
    print(f"Reason: {result['reason']}")
    print("=" * 60)

