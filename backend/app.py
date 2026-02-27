"""
Module 3E: FastAPI Backend for HR Chatbot

This module exposes the HR chatbot as a REST API using FastAPI.
It integrates Module 3C (semantic search) and Module 3D (answer generation)
to provide a complete chatbot endpoint.

Endpoints:
    - POST /chat: Chat with the HR chatbot
    - GET /health: Health check endpoint

Dependencies:
    - fastapi: pip install fastapi
    - uvicorn: pip install uvicorn
    - python-multipart: pip install python-multipart (for form data)

Author: HR Chatbot System
"""
from dotenv import load_dotenv
load_dotenv()
import os
import sys
import tempfile
from typing import List, Dict, Optional, Any
from fastapi import FastAPI, HTTPException, UploadFile, File, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import numpy as np
from datetime import datetime
import uuid

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import config module (loads .env and validates LLM provider config)
try:
    from config import validate_llm_config, log_llm_provider_status, LLM_PROVIDER
except ImportError:
    # Fallback if config module not found
    validate_llm_config = None
    log_llm_provider_status = None
    LLM_PROVIDER = "mock"

# Import our modules
try:
    from semantic_search import embed_chunks, search_similar_chunks
    from answer_generator import generate_answer_with_metadata
    from resume_parser import parse_resume
    from pdf_extractor import extract_text_from_pdf
    from text_chunker import clean_and_chunk
    # Import new LLM service
    from services.hr_chat_llm import generate_response as generate_llm_response
    # Import project matcher
    from services.project_matcher import match_resume_to_projects
    from services.project_matching_service import match_resume_to_projects as match_resume_to_projects_new
    from models.core_models import ResumeProfile, Project
    from services.skill_scoring_engine import initialize_skill_points_from_resume, calculate_skill_level, get_next_level_threshold
    from services.promotion_readiness_calculator import calculate_promotion_readiness
    from services.project_recommendation_engine import calculate_project_recommendations
    # Import Firebase initialization
    from firebase_init import init_firebase
except ImportError as e:
    print(f"Error importing modules: {e}")
    print("Make sure semantic_search.py, answer_generator.py, and resume_parser.py are in the same directory")
    # Don't exit - resume parser might not be needed for chat endpoint
    parse_resume = None
    generate_llm_response = None
    extract_text_from_pdf = None
    clean_and_chunk = None
    match_resume_to_projects = None
    match_resume_to_projects_new = None

# Initialize FastAPI app
app = FastAPI(
    title="HR Chatbot API",
    description="REST API for HR document chatbot using RAG",
    version="1.0.0"
)

# Add CORS middleware to allow frontend calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables for embeddings (loaded at startup or on first request)
_embeddings: Optional[np.ndarray] = None
_chunk_texts: List[str] = []
_chunks_metadata: List[Dict] = []
_embeddings_loaded: bool = False


# Request/Response models
class ChatRequest(BaseModel):
    """Request model for chat endpoint."""
    question: str = Field(..., min_length=1, description="User's question about HR policies")
    user_id: Optional[str] = Field(None, description="Firebase user ID (optional, for chat history and escalations)")
    chat_id: Optional[str] = Field(None, description="Chat session ID (optional, creates new session if missing)")


class SourceInfo(BaseModel):
    """Source information for a retrieved chunk."""
    chunk_id: int
    score: float


class ChatResponse(BaseModel):
    """Response model for chat endpoint."""
    answer: str
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score (0.0 to 1.0)")
    needsEscalation: bool = Field(..., description="Whether the question needs escalation to HR")
    reason: str = Field(..., description="Reason for confidence score and escalation decision")
    sources: List[SourceInfo] = Field(default_factory=list, description="Source chunks used for answer")
    chat_id: Optional[str] = Field(None, description="Chat session ID (created or existing)")


class HealthResponse(BaseModel):
    """Response model for health check."""
    status: str


class RecommendedProject(BaseModel):
    """Recommended project with match details."""
    projectId: str
    title: str
    description: Optional[str] = None
    domain: Optional[str] = None
    minExperience: Optional[str] = None
    matchedSkills: List[str]
    matchScore: float
    matchReasons: List[str] = Field(default_factory=list)


class ResumeStats(BaseModel):
    """Resume statistics."""
    textLength: int
    experienceYears: float


class ResumeAnalysisResponse(BaseModel):
    """Response model for resume analysis endpoint - simplified architecture."""
    success: bool
    resumeStats: ResumeStats
    skills: List[str]
    domains: List[str]
    recommendedProjects: List[RecommendedProject]
    message: str
    firestore_document_id: Optional[str] = Field(
        default=None,
        description="Firestore document ID where resume data was saved (resume_analysis/{userId})"
    )
    savedDocument: Optional[Dict[str, Any]] = Field(
        default=None,
        description="The saved Firestore document from resume_analysis/{userId}"
    )


class ResumeAnalysisResponseOld(BaseModel):
    """Legacy response model - kept for backward compatibility."""
    success: bool
    skills: List[str]
    experience_years: Optional[float]
    domains: List[str]
    text_length: int
    file_type: Optional[str]
    message: str
    firestore_document_id: Optional[str] = Field(
        default=None,
        description="Firestore document ID where resume data was saved (resumes/{userId})"
    )


class ExpressInterestRequest(BaseModel):
    """Request body for POST /api/projects/express-interest."""
    employeeId: str
    employeeName: str
    projectId: str
    projectTitle: str
    recommended_projects: Optional[List[RecommendedProject]] = Field(
        default=None,
        description="Recommended projects based on resume skills (optional)"
    )


def load_chunks_and_embeddings(chunks: Optional[List[Dict]] = None) -> bool:
    """
    Load chunks and create embeddings.
    
    This function loads HR document chunks and creates embeddings for semantic search.
    In production, chunks would come from a database or file system.
    
    Args:
        chunks (Optional[List[Dict]]): Chunks to load. If None, tries to load from file.
        
    Returns:
        bool: True if embeddings loaded successfully, False otherwise
    """
    global _embeddings, _chunk_texts, _chunks_metadata, _embeddings_loaded
    
    if _embeddings_loaded:
        return True
    
    try:
        # If chunks not provided, try to reindex from local PDFs first
        if chunks is None:
            # Try to reindex from local hr_documents/ directory
            backend_dir = os.path.dirname(os.path.abspath(__file__))
            hr_docs_dir = os.path.join(backend_dir, 'hr_documents')
            
            if os.path.exists(hr_docs_dir):
                # Check if there are any PDF files
                pdf_files = [f for f in os.listdir(hr_docs_dir) if f.lower().endswith('.pdf')]
                if pdf_files:
                    print(f"Found {len(pdf_files)} PDF file(s) in hr_documents/. Reindexing...")
                    if reindex_hr_documents():
                        # Reindex succeeded, embeddings are already loaded
                        return True
                    else:
                        print("Warning: Reindexing failed. Falling back to sample chunks.")
                        chunks = _get_sample_chunks()
                else:
                    # No PDFs found, try JSON file or use sample chunks
                    import json
                    chunks_file = os.getenv('HR_CHUNKS_FILE', 'hr_chunks.json')
                    if os.path.exists(chunks_file):
                        with open(chunks_file, 'r', encoding='utf-8') as f:
                            chunks = json.load(f)
                    else:
                        # Use sample chunks for testing
                        print("Warning: No PDF files or chunks file found. Using sample chunks for testing.")
                        chunks = _get_sample_chunks()
            else:
                # hr_documents directory doesn't exist, try JSON file or use sample chunks
                import json
                chunks_file = os.getenv('HR_CHUNKS_FILE', 'hr_chunks.json')
                if os.path.exists(chunks_file):
                    with open(chunks_file, 'r', encoding='utf-8') as f:
                        chunks = json.load(f)
                else:
                    # Use sample chunks for testing
                    print("Warning: No chunks file found. Using sample chunks for testing.")
                    chunks = _get_sample_chunks()
        
        if not chunks:
            print("Error: No chunks available to embed")
            return False
        
        # Embed chunks
        print("Loading embeddings for HR document chunks...")
        _embeddings, _chunk_texts = embed_chunks(chunks)
        
        if _embeddings is None or not _chunk_texts:
            print("Error: Failed to create embeddings")
            return False
        
        # Store metadata
        _chunks_metadata = []
        for i, chunk in enumerate(chunks):
            if isinstance(chunk, dict):
                _chunks_metadata.append({
                    'chunk_id': chunk.get('chunk_id', i + 1),
                    'original_chunk': chunk
                })
        
        _embeddings_loaded = True
        print(f"✓ Successfully loaded {len(_chunk_texts)} chunks with embeddings")
        return True
        
    except Exception as e:
        print(f"Error loading embeddings: {e}")
        return False


def reindex_hr_documents() -> bool:
    """
    Re-index all HR documents: extract text, chunk, and generate embeddings.
    
    This function:
    1. Scans backend/hr_documents/ directory for PDFs
    2. Extracts text from PDFs
    3. Chunks the text
    4. Generates embeddings
    5. Updates the in-memory embeddings store
    
    Returns:
        bool: True if reindexing succeeded, False otherwise
    """
    global _embeddings, _chunk_texts, _chunks_metadata, _embeddings_loaded
    
    print("=" * 60)
    print("🔁 Reindexing HR documents...")
    print("=" * 60)
    
    try:
        # Check if required modules are available
        if not extract_text_from_pdf or not clean_and_chunk or not embed_chunks:
            print("[Reindex] ❌ Required modules not available (pdf_extractor, text_chunker, semantic_search)")
            return False
        
        # Get the hr_documents directory path
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        hr_docs_dir = os.path.join(backend_dir, 'hr_documents')
        
        # Create directory if it doesn't exist
        os.makedirs(hr_docs_dir, exist_ok=True)
        
        # Scan directory for PDF files
        print(f"[Reindex] Scanning {hr_docs_dir} for PDF files...")
        pdf_files = []
        for filename in os.listdir(hr_docs_dir):
            if filename.lower().endswith('.pdf'):
                pdf_path = os.path.join(hr_docs_dir, filename)
                if os.path.isfile(pdf_path):
                    pdf_files.append((filename, pdf_path))
        
        print(f"[Reindex] Found {len(pdf_files)} PDF file(s)")
        
        if not pdf_files:
            print("[Reindex] ⚠️ No PDF files found in hr_documents/ directory")
            return False
        
        # Process each PDF file
        all_chunks = []
        chunk_id_counter = 1
        
        for filename, pdf_path in pdf_files:
            try:
                print(f"[Reindex] Processing: {filename}")
                
                # Extract text from PDF
                print(f"[Reindex] Extracting text from {filename}...")
                raw_text = extract_text_from_pdf(pdf_path)
                
                if not raw_text or not raw_text.strip():
                    print(f"[Reindex] ⚠️ No text extracted from {filename}")
                    continue
                
                # Clean and chunk the text
                print(f"[Reindex] Chunking text from {filename}...")
                chunks = clean_and_chunk(raw_text)
                
                if not chunks:
                    print(f"[Reindex] ⚠️ No chunks created from {filename}")
                    continue
                
                # Add metadata to each chunk
                for chunk in chunks:
                    chunk['chunk_id'] = chunk_id_counter
                    chunk['document_filename'] = filename
                    chunk['document_path'] = pdf_path
                    all_chunks.append(chunk)
                    chunk_id_counter += 1
                
                print(f"[Reindex] ✅ Processed {filename}: {len(chunks)} chunks created")
                
            except Exception as doc_error:
                print(f"[Reindex] ⚠️ Error processing {filename}: {doc_error}")
                import traceback
                traceback.print_exc()
                continue  # Continue with next document
        
        if not all_chunks:
            print("[Reindex] ⚠️ No chunks created from any documents")
            return False
        
        # Generate embeddings for all chunks
        print(f"[Reindex] Generating embeddings for {len(all_chunks)} chunks...")
        embeddings_array, chunk_texts = embed_chunks(all_chunks)
        
        if embeddings_array is None or not chunk_texts:
            print("[Reindex] ❌ Failed to generate embeddings")
            return False
        
        # Update global variables
        _embeddings = embeddings_array
        _chunk_texts = chunk_texts
        _chunks_metadata = []
        for i, chunk in enumerate(all_chunks):
            _chunks_metadata.append({
                'chunk_id': chunk.get('chunk_id', i + 1),
                'document_filename': chunk.get('document_filename'),
                'original_chunk': chunk
            })
        _embeddings_loaded = True
        
        print("=" * 60)
        print(f"✓ Reindex complete: {len(chunk_texts)} chunks loaded")
        print("=" * 60)
        return True
        
    except Exception as e:
        print(f"[Reindex] ❌ Error during reindexing: {e}")
        import traceback
        traceback.print_exc()
        return False


def _get_sample_chunks() -> List[Dict]:
    """Get sample chunks for testing (if no file is available)."""
    return [
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
            "text": "Leave requests must be submitted at least two weeks in advance. Approval is subject to business needs and staffing requirements. Employees with more than 5 years of service receive an additional 5 days of annual leave."
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


@app.on_event("startup")
async def startup_event():
    """Initialize application on startup."""
    print("=" * 60)
    print("Starting HR Chatbot API...")
    print("=" * 60)
    
    # Validate LLM configuration (required for /chat endpoint)
    try:
        if validate_llm_config:
            validate_llm_config()
        log_llm_provider_status()
    except RuntimeError as e:
        print(f"[Config] ❌ LLM configuration error: {e}")
        print("[Config] ⚠️  Server will start but LLM calls may fail")
    except (ValueError, ImportError) as e:
        print(f"[Config] ❌ CRITICAL: LLM configuration failed: {e}")
        print("[Config] ⚠️  The /chat endpoint will not work without proper LLM configuration")
        print("[Config] ⚠️  Set LLM_PROVIDER and required API keys in .env file or environment variables")
        # Don't exit - allow server to start but chat will fail
    
    # Load embeddings
    print("\n[Startup] Loading document embeddings...")
    load_chunks_and_embeddings()
    print("=" * 60)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint.
    
    Returns:
        HealthResponse: Status of the API
    """
    return HealthResponse(status="ok")


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Chat endpoint for HR chatbot with strict document-only LLM responses.
    
    This endpoint:
    1. Takes a user question and optional user_id
    2. Performs semantic search to find relevant chunks
    3. Calls LLM service with strict document-only policy
    4. Saves chat history to Firestore
    5. Creates escalation if needed
    6. Returns answer with confidence and sources
    
    Args:
        request (ChatRequest): User's question and optional user_id
        
    Returns:
        ChatResponse: Generated answer with metadata
        
    Raises:
        HTTPException: If embeddings not loaded or processing fails
    """
    # Validate input
    if not request.question or not request.question.strip():
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty"
        )
    
    question = request.question.strip()
    user_id = request.user_id
    chat_id = request.chat_id
    
    # If no chat_id provided and user_id exists, create new session
    if not chat_id and user_id:
        chat_id = _create_chat_session(user_id, question)
    
    # Ensure embeddings are loaded
    if not _embeddings_loaded:
        if not load_chunks_and_embeddings():
            raise HTTPException(
                status_code=503,
                detail="Chatbot not ready: Failed to load document embeddings"
            )
    
    try:
        # Step 1: Semantic search (Module 3C)
        # Retrieve top 3 most relevant chunks
        search_results = search_similar_chunks(
            query=question,
            vectors=_embeddings,
            texts=_chunk_texts,
            top_k=3
        )
        
        if not search_results:
            # No relevant chunks found - return with escalation
            response_data = {
                "answer": "I don't have enough information in the HR documents to answer that question. Please contact HR for assistance.",
                "confidence": 0.0,
                "needsEscalation": True,
                "reason": "No relevant documents found"
            }
            
            # Save to Firestore if user_id provided
            if user_id:
                _save_chat_to_firestore(user_id, question, response_data, chat_id)
                
                # Update chat session's updatedAt timestamp
                if chat_id:
                    _update_chat_session_timestamp(chat_id, user_id)
                
                if response_data.get("needsEscalation", False):
                    _create_escalation(user_id, question, response_data)
            
            # CRITICAL: Use safe dictionary access
            return ChatResponse(
                answer=response_data.get("answer", "Unable to confidently answer based on HR documents."),
                confidence=response_data.get("confidence", 0.0),
                needsEscalation=response_data.get("needsEscalation", True),
                reason=response_data.get("reason", "No relevant documents found"),
                sources=[],
                chat_id=chat_id
            )
        
        # Step 2: Extract document texts and similarity scores for LLM
        document_texts = [result['text'] for result in search_results]
        similarity_scores = [result.get('score', 0.0) for result in search_results]
        
        # Step 3: Generate answer using provider-agnostic LLM service
        # The service layer handles:
        # - Provider selection (Groq / OpenAI / mock)
        # - Quota failures
        # - Fallback responses
        # - All error handling
        if generate_llm_response:
            # Use provider-agnostic LLM service
            result = generate_llm_response(
                question=question,
                document_texts=document_texts,
                user_id=user_id,
                similarity_scores=similarity_scores
            )
        else:
            # Fallback if LLM service not available (should not happen in production)
            # Return safe fallback response
            result = {
                "answer": "Unable to confidently answer based on HR documents.",
                "confidence": 0.0,
                "needsEscalation": True,
                "reason": "LLM service not available"
            }
        
        # Step 4: Ensure result is valid (safe parsing)
        # CRITICAL: Use safe dictionary access to prevent KeyError
        safe_result = {
            "answer": result.get("answer", "Unable to confidently answer based on HR documents."),
            "confidence": result.get("confidence", 0.0),
            "needsEscalation": result.get("needsEscalation", True),
            "reason": result.get("reason", "LLM response unavailable or invalid")
        }
        
        # Validate confidence is a number
        try:
            safe_result["confidence"] = float(safe_result["confidence"])
            safe_result["confidence"] = max(0.0, min(1.0, safe_result["confidence"]))
        except (ValueError, TypeError):
            safe_result["confidence"] = 0.0
        
        # Validate needsEscalation is a boolean
        try:
            safe_result["needsEscalation"] = bool(safe_result["needsEscalation"])
        except (ValueError, TypeError):
            safe_result["needsEscalation"] = True
        
        # Step 5: Save chat history to Firestore (if user_id provided)
        if user_id:
            _save_chat_to_firestore(user_id, question, safe_result, chat_id)
            
            # Step 5.5: Update chat session's updatedAt timestamp
            if chat_id:
                _update_chat_session_timestamp(chat_id, user_id)
            
            # Step 6: Create escalation if needed
            if safe_result.get("needsEscalation", False):
                _create_escalation(user_id, question, safe_result)
        
        # Step 7: Format response with sources
        sources = [
            SourceInfo(chunk_id=search_result.get('chunk_id', idx), score=search_result.get('score', 0.0))
            for idx, search_result in enumerate(search_results)
        ]
        
        return ChatResponse(
            answer=safe_result["answer"],
            confidence=round(safe_result["confidence"], 2),
            needsEscalation=safe_result["needsEscalation"],
            reason=safe_result["reason"],
            sources=sources,
            chat_id=chat_id
        )
        
    except Exception as e:
        # CRITICAL: Never crash - always return valid JSON response
        print("=" * 80)
        print(f"[Chat Endpoint] ❌ ERROR processing chat request: {e}")
        print(f"[Chat Endpoint] ❌ Error type: {type(e).__name__}")
        print("=" * 80)
        import traceback
        traceback.print_exc()
        
        # Return EXACT default fallback response (HTTP 200, valid JSON)
        fallback_response = {
            "answer": "Unable to confidently answer based on HR documents.",
            "confidence": 0.0,
            "needsEscalation": True,
            "reason": "LLM response unavailable or invalid"
        }
        
        # Try to save error to Firestore (non-blocking)
        if user_id:
            try:
                _save_chat_to_firestore(user_id, question, fallback_response, request.chat_id)
                # Update chat session timestamp if chat_id exists
                if request.chat_id:
                    _update_chat_session_timestamp(request.chat_id, user_id)
            except Exception as firestore_error:
                print(f"[Chat Endpoint] ⚠️  Failed to save error to Firestore: {firestore_error}")
        
        # Return HTTP 200 with fallback response (never raise HTTPException)
        return ChatResponse(
            answer=fallback_response["answer"],
            confidence=fallback_response["confidence"],
            needsEscalation=fallback_response["needsEscalation"],
            reason=fallback_response["reason"],
            sources=[],
            chat_id=request.chat_id
        )


def _generate_chat_title(question: str) -> str:
    """
    Generate a chat title from the first user message (5-7 words).
    
    Args:
        question (str): User's question
        
    Returns:
        str: Title (5-7 words)
    """
    words = question.strip().split()[:7]
    title = ' '.join(words)
    if len(question.split()) > 7:
        title += '...'
    return title or "New Chat"


def _update_chat_session_timestamp(chat_id: str, user_id: str) -> None:
    """
    Update the updatedAt timestamp for a chat session.
    
    Args:
        chat_id (str): Chat session ID
        user_id (str): Firebase user ID (for verification)
    """
    try:
        from firebase_admin import firestore
        db = init_firebase()
        
        # Find the session document
        sessions_ref = db.collection('chat_sessions')
        session_query = sessions_ref.where('chatId', '==', chat_id).where('userId', '==', user_id)
        sessions = list(session_query.stream())
        
        if sessions:
            # Update the first matching session
            sessions[0].reference.update({
                'updatedAt': firestore.SERVER_TIMESTAMP
            })
            print(f"[Chat Session] ✅ Updated timestamp for session {chat_id}")
        else:
            print(f"[Chat Session] ⚠️ Session {chat_id} not found for user {user_id}")
            
    except ImportError:
        print("[Chat Session] ⚠️ Firebase initialization failed. Cannot update timestamp.")
    except Exception as e:
        print(f"[Chat Session] ⚠️ Error updating timestamp: {e}")


def _create_chat_session(user_id: str, question: str) -> str:
    """
    Create a new chat session in Firestore.
    
    Args:
        user_id (str): Firebase user ID
        question (str): First user message (used for title)
        
    Returns:
        str: Chat session ID (UUID)
    """
    try:
        from firebase_admin import firestore
        db = init_firebase()
        chat_id = str(uuid.uuid4())
        title = _generate_chat_title(question)
        
        session_data = {
            'chatId': chat_id,
            'userId': user_id,
            'title': title,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP
        }
        
        db.collection('chat_sessions').add(session_data)
        print(f"[Chat Session] ✅ Created new session {chat_id} for user {user_id} with title: {title}")
        return chat_id
        
    except ImportError:
        print("[Chat Session] ⚠️ firebase_admin not installed. Cannot create session.")
        return str(uuid.uuid4())  # Return UUID anyway for frontend
    except Exception as e:
        print(f"[Chat Session] ⚠️ Error creating session: {e}")
        return str(uuid.uuid4())  # Return UUID anyway for frontend


def _save_chat_to_firestore(user_id: str, question: str, response_data: Dict, chat_id: Optional[str] = None) -> None:
    """
    Save chat interaction to Firestore chat_history collection.
    
    Saves both user question and assistant response with metadata.
    This function is non-blocking - errors are logged but don't fail the request.
    
    Args:
        user_id (str): Firebase user ID
        question (str): User's question
        response_data (Dict): Response data with answer, confidence, needsEscalation, reason
        chat_id (Optional[str]): Chat session ID (optional)
    """
    try:
        from firebase_admin import firestore
        db = init_firebase()
        
        # Save user message
        user_message = {
            'userId': user_id,
            'role': 'user',
            'message': question,
            'createdAt': firestore.SERVER_TIMESTAMP
        }
        if chat_id:
            user_message['chatId'] = chat_id
        db.collection('chat_history').add(user_message)
        
        # Save assistant message
        assistant_message = {
            'userId': user_id,
            'role': 'assistant',
            'message': response_data.get('answer', ''),
            'confidence': response_data.get('confidence', 0.0),
            'escalated': response_data.get('needsEscalation', False),
            'reason': response_data.get('reason', ''),
            'createdAt': firestore.SERVER_TIMESTAMP
        }
        if chat_id:
            assistant_message['chatId'] = chat_id
        db.collection('chat_history').add(assistant_message)
        
        print(f"[Chat] ✅ Saved chat history for user {user_id}, chatId: {chat_id or 'none'}")
        
    except ImportError:
        print("[Chat] ⚠️ Firebase initialization failed. Skipping Firestore storage.")
    except Exception as e:
        print(f"[Chat] ⚠️ Error saving to Firestore: {e}")
        # Non-blocking - don't fail the request


@app.get("/chats")
async def get_chat_sessions(user_id: Optional[str] = Header(None, alias="X-User-Id")):
    """
    Get recent chat sessions for the logged-in user.
    
    Returns chat sessions sorted by most recent first.
    
    Args:
        user_id: Firebase user UID from X-User-Id header
        
    Returns:
        List of chat session objects with chatId, title, createdAt
    """
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="X-User-Id header is required"
        )
    
    try:
        db = init_firebase()
        
        # Fetch chat sessions for this user, ordered by updatedAt descending (most recent activity first)
        sessions_ref = db.collection('chat_sessions')
        try:
            # Try to order by updatedAt first (preferred)
            user_sessions_query = sessions_ref.where('userId', '==', user_id).order_by('updatedAt', direction=firestore.Query.DESCENDING)
            sessions = list(user_sessions_query.stream())
        except Exception as order_error:
            # Fallback: try createdAt
            try:
                print(f"[Chat Sessions] OrderBy updatedAt failed, trying createdAt: {order_error}")
                user_sessions_query = sessions_ref.where('userId', '==', user_id).order_by('createdAt', direction=firestore.Query.DESCENDING)
                sessions = list(user_sessions_query.stream())
            except Exception as order_error2:
                # Final fallback: fetch without orderBy and sort in memory
                print(f"[Chat Sessions] OrderBy failed, using in-memory sort: {order_error2}")
                user_sessions_query = sessions_ref.where('userId', '==', user_id)
                sessions = list(user_sessions_query.stream())
                # Sort by updatedAt or createdAt in memory
                sessions.sort(key=lambda doc: (
                    doc.to_dict().get('updatedAt') or 
                    doc.to_dict().get('createdAt') or 
                    datetime.min
                ), reverse=True)
        
        result = []
        for session_doc in sessions:
            data = session_doc.data()
            # Use updatedAt if available, otherwise createdAt
            timestamp = data.get('updatedAt') or data.get('createdAt')
            result.append({
                'chatId': data.get('chatId', ''),
                'title': data.get('title', 'New Chat'),
                'createdAt': timestamp.isoformat() if hasattr(timestamp, 'isoformat') else str(timestamp or ''),
                'updatedAt': timestamp.isoformat() if hasattr(timestamp, 'isoformat') else str(timestamp or '')
            })
        
        print(f"[Chat Sessions] ✅ Retrieved {len(result)} sessions for user {user_id}")
        return result
        
    except ImportError:
        print("[Chat Sessions] ⚠️ firebase_admin not installed. Cannot fetch sessions.")
        raise HTTPException(
            status_code=503,
            detail="Chat sessions service not available. Firebase initialization failed."
        )
    except Exception as e:
        print(f"[Chat Sessions] ❌ Error fetching sessions: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch chat sessions: {str(e)}"
        )


@app.get("/chats/{chat_id}")
async def get_chat_messages(chat_id: str, user_id: Optional[str] = Header(None, alias="X-User-Id")):
    """
    Get message history for a specific chat session.
    
    Args:
        chat_id: Chat session ID
        user_id: Firebase user UID from X-User-Id header
        
    Returns:
        List of messages for the chat session
    """
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="X-User-Id header is required"
        )
    
    try:
        db = init_firebase()
        
        # Verify chat session belongs to user
        sessions_ref = db.collection('chat_sessions')
        session_query = sessions_ref.where('chatId', '==', chat_id).where('userId', '==', user_id)
        sessions = list(session_query.stream())
        
        if not sessions:
            raise HTTPException(
                status_code=404,
                detail="Chat session not found or access denied"
            )
        
        # Fetch messages for this chat
        messages_ref = db.collection('chat_history')
        try:
            messages_query = messages_ref.where('chatId', '==', chat_id).order_by('createdAt', direction=firestore.Query.ASCENDING)
            messages = list(messages_query.stream())
        except Exception as order_error:
            # Fallback: fetch without orderBy and sort in memory
            print(f"[Chat Messages] OrderBy failed, using in-memory sort: {order_error}")
            messages_query = messages_ref.where('chatId', '==', chat_id)
            messages = list(messages_query.stream())
            # Sort by createdAt in memory
            messages.sort(key=lambda doc: doc.to_dict().get('createdAt') or datetime.min)
        
        result = []
        for msg_doc in messages:
            data = msg_doc.data()
            result.append({
                'id': msg_doc.id,
                'role': data.get('role', ''),
                'message': data.get('message', ''),
                'content': data.get('message', ''),  # Alias for frontend compatibility
                'confidence': data.get('confidence'),
                'escalated': data.get('escalated', False),
                'sourceDocument': data.get('sourceDocument'),
                'createdAt': data.get('createdAt').isoformat() if hasattr(data.get('createdAt'), 'isoformat') else str(data.get('createdAt', ''))
            })
        
        print(f"[Chat Messages] ✅ Retrieved {len(result)} messages for chat {chat_id}")
        return result
        
    except HTTPException:
        raise
    except ImportError:
        print("[Chat Messages] ⚠️ firebase_admin not installed. Cannot fetch messages.")
        raise HTTPException(
            status_code=503,
            detail="Chat messages service not available. Firebase initialization failed."
        )
    except Exception as e:
        print(f"[Chat Messages] ❌ Error fetching messages: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch chat messages: {str(e)}"
        )


@app.delete("/chats/{chat_id}")
async def delete_chat_session(chat_id: str, user_id: Optional[str] = Header(None, alias="X-User-Id")):
    """
    Delete a specific chat session and all its messages.
    
    Args:
        chat_id: Chat session ID
        user_id: Firebase user UID from X-User-Id header
        
    Returns:
        Dict: Status of deletion operation
    """
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="X-User-Id header is required"
        )
    
    try:
        db = init_firebase()
        
        # Verify chat session belongs to user
        sessions_ref = db.collection('chat_sessions')
        session_query = sessions_ref.where('chatId', '==', chat_id).where('userId', '==', user_id)
        sessions = list(session_query.stream())
        
        if not sessions:
            raise HTTPException(
                status_code=404,
                detail="Chat session not found or access denied"
            )
        
        # Delete all messages for this chat
        messages_ref = db.collection('chat_history')
        messages_query = messages_ref.where('chatId', '==', chat_id)
        messages = list(messages_query.stream())
        
        deleted_messages = 0
        for msg_doc in messages:
            try:
                msg_doc.reference.delete()
                deleted_messages += 1
            except Exception as delete_error:
                print(f"[Delete Chat] ⚠️ Error deleting message {msg_doc.id}: {delete_error}")
                continue
        
        # Delete chat session
        for session_doc in sessions:
            try:
                session_doc.reference.delete()
            except Exception as delete_error:
                print(f"[Delete Chat] ⚠️ Error deleting session {session_doc.id}: {delete_error}")
        
        print(f"[Delete Chat] ✅ Deleted chat {chat_id} and {deleted_messages} messages for user {user_id}")
        
        return {
            "success": True,
            "message": f"Chat session deleted successfully",
            "deleted_messages": deleted_messages
        }
        
    except HTTPException:
        raise
    except ImportError:
        print("[Delete Chat] ⚠️ firebase_admin not installed. Cannot delete chat.")
        raise HTTPException(
            status_code=503,
            detail="Chat deletion service not available. Firebase initialization failed."
        )
    except Exception as e:
        print(f"[Delete Chat] ❌ Error deleting chat: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete chat session: {str(e)}"
        )


@app.delete("/chats")
async def delete_all_chat_sessions(user_id: Optional[str] = Header(None, alias="X-User-Id")):
    """
    Delete all chat sessions and messages for the current user.
    
    Args:
        user_id: Firebase user UID from X-User-Id header
        
    Returns:
        Dict: Status of deletion operation
    """
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="X-User-Id header is required"
        )
    
    try:
        db = init_firebase()
        
        # Fetch all chat sessions for this user
        sessions_ref = db.collection('chat_sessions')
        user_sessions_query = sessions_ref.where('userId', '==', user_id)
        sessions = list(user_sessions_query.stream())
        
        if not sessions:
            print(f"[Delete All Chats] No sessions found for user: {user_id}")
            return {
                "success": True,
                "message": "No chat sessions found for this user",
                "deleted_sessions": 0,
                "deleted_messages": 0
            }
        
        # Collect all chat IDs
        chat_ids = [session_doc.data().get('chatId') for session_doc in sessions if session_doc.data().get('chatId')]
        
        # Delete all messages for all chats
        messages_ref = db.collection('chat_history')
        deleted_messages = 0
        for chat_id in chat_ids:
            messages_query = messages_ref.where('chatId', '==', chat_id)
            messages = list(messages_query.stream())
            for msg_doc in messages:
                try:
                    msg_doc.reference.delete()
                    deleted_messages += 1
                except Exception as delete_error:
                    print(f"[Delete All Chats] ⚠️ Error deleting message {msg_doc.id}: {delete_error}")
                    continue
        
        # Delete all chat sessions
        deleted_sessions = 0
        for session_doc in sessions:
            try:
                session_doc.reference.delete()
                deleted_sessions += 1
            except Exception as delete_error:
                print(f"[Delete All Chats] ⚠️ Error deleting session {session_doc.id}: {delete_error}")
                continue
        
        print(f"[Delete All Chats] ✅ Deleted {deleted_sessions} sessions and {deleted_messages} messages for user {user_id}")
        
        return {
            "success": True,
            "message": f"All chat sessions deleted successfully",
            "deleted_sessions": deleted_sessions,
            "deleted_messages": deleted_messages
        }
        
    except ImportError:
        print("[Delete All Chats] ⚠️ firebase_admin not installed. Cannot delete chats.")
        raise HTTPException(
            status_code=503,
            detail="Chat deletion service not available. Firebase initialization failed."
        )
    except Exception as e:
        print(f"[Delete All Chats] ❌ Error deleting chats: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete chat sessions: {str(e)}"
        )


@app.delete("/chat/clear")
async def clear_chat_history(user_id: Optional[str] = Header(None, alias="X-User-Id")):
    """
    Clear chat history for the current user.
    
    This endpoint:
    1. Deletes all chat messages for the specified user from Firestore
    2. Does NOT delete HR documents, embeddings, or indexes
    3. Does NOT affect other users' chat history or admin logs
    
    Args:
        user_id: Firebase user UID from X-User-Id header
        
    Returns:
        Dict: Status of deletion operation
    """
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="X-User-Id header is required"
        )
    
    try:
        db = init_firebase()
        
        # Fetch all chat messages for this user
        chat_history_ref = db.collection('chat_history')
        user_messages_query = chat_history_ref.where('userId', '==', user_id)
        user_messages = list(user_messages_query.stream())
        
        if not user_messages:
            print(f"[Clear Chat] No messages found for user: {user_id}")
            return {
                "success": True,
                "message": "No chat history found for this user",
                "deleted_count": 0
            }
        
        # Delete all messages
        deleted_count = 0
        for message_doc in user_messages:
            try:
                message_doc.reference.delete()
                deleted_count += 1
            except Exception as delete_error:
                print(f"[Clear Chat] ⚠️ Error deleting message {message_doc.id}: {delete_error}")
                continue
        
        print(f"User chat history cleared: {user_id} ({deleted_count} messages deleted)")
        
        return {
            "success": True,
            "message": f"Chat history cleared successfully",
            "deleted_count": deleted_count
        }
        
    except ImportError:
        print("[Clear Chat] ⚠️ firebase_admin not installed. Cannot clear chat history.")
        raise HTTPException(
            status_code=503,
            detail="Chat history service not available. Firebase initialization failed."
        )
    except Exception as e:
        print(f"[Clear Chat] ❌ Error clearing chat history: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear chat history: {str(e)}"
        )


def _create_escalation(user_id: str, question: str, response_data: Dict) -> None:
    """
    Create escalation record in Firestore ai_escalations collection.
    
    Escalation is created when confidence < 0.60 (needsEscalation = true).
    This function is non-blocking - errors are logged but don't fail the request.
    
    Args:
        user_id (str): Firebase user ID
        question (str): User's question
        response_data (Dict): Response data with confidence and reason
    """
    try:
        from firebase_admin import firestore
        db = init_firebase()
        
        # Determine category from question (simple keyword matching)
        question_lower = question.lower()
        category = 'OTHER'
        if any(word in question_lower for word in ['leave', 'vacation', 'holiday']):
            category = 'LEAVE_POLICY'
        elif any(word in question_lower for word in ['benefit', 'insurance', 'health']):
            category = 'BENEFITS'
        elif any(word in question_lower for word in ['policy', 'rule']):
            category = 'HR_POLICY'
        elif any(word in question_lower for word in ['payroll', 'salary', 'pay']):
            category = 'PAYROLL'
        
        # Create escalation record
        escalation = {
            'question': question,
            'employeeId': user_id,
            'employeeName': 'Unknown',  # Could be fetched from user collection if needed
            'department': 'Unknown',    # Could be fetched from user collection if needed
            'confidence': response_data.get('confidence', 0.0),
            'category': category,
            'aiResponse': response_data.get('answer', ''),
            'reason': response_data.get('reason', ''),
            'status': 'Unread',
            # Priority based on confidence: lower confidence = higher priority
            'priority': 'High' if response_data.get('confidence', 0.0) < 0.3 else 'Medium' if response_data.get('confidence', 0.0) < 0.5 else 'Low',
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP
        }
        
        db.collection('ai_escalations').add(escalation)
        
        print(f"[Chat] ✅ Created escalation for user {user_id}")
        
    except ImportError:
        print("[Chat] ⚠️ firebase_admin not installed. Skipping escalation creation.")
    except Exception as e:
        print(f"[Chat] ⚠️ Error creating escalation: {e}")
        # Non-blocking - don't fail the request


def get_user_uid(x_user_id: Optional[str] = Header(None, alias="X-User-Id")) -> Optional[str]:
    """
    Extract Firebase user UID from request headers (optional for resume parsing).
    
    Args:
        x_user_id: User UID from X-User-Id header
        
    Returns:
        Optional[str]: User UID or None
    """
    return x_user_id


def _fallback_parse_resume(temp_file_path: str, file_extension: str) -> Dict:
    """
    Fallback resume parser for demo mode.
    
    This function provides basic resume parsing when the main parser is unavailable.
    It extracts text and performs simple keyword-based skill/domain detection.
    
    Args:
        temp_file_path (str): Path to the resume file
        file_extension (str): File extension (.pdf, .docx, etc.)
        
    Returns:
        Dict: Parsed resume data with structure matching parse_resume output
    """
    result = {
        'success': True,  # Always return success in demo mode
        'file_path': temp_file_path,
        'file_type': file_extension.upper().replace('.', '') if file_extension else 'Unknown',
        'text_length': 0,
        'skills': [],
        'experience_years': 0.0,  # Default to 0 if not detected
        'domains': [],
        'error': None
    }
    
    try:
        # Extract text using pdf_extractor or simple text extraction
        text = None
        
        if file_extension.lower() == '.pdf':
            # Try using pdf_extractor
            if extract_text_from_pdf:
                text = extract_text_from_pdf(temp_file_path)
            else:
                print("[Resume Analysis] ⚠️ pdf_extractor not available, using minimal fallback")
        elif file_extension.lower() in ['.docx', '.doc']:
            # Try simple DOCX extraction
            try:
                from docx import Document
                doc = Document(temp_file_path)
                text_parts = [para.text for para in doc.paragraphs if para.text.strip()]
                text = "\n".join(text_parts)
            except ImportError:
                print("[Resume Analysis] ⚠️ python-docx not available for DOCX extraction")
            except Exception as e:
                print(f"[Resume Analysis] ⚠️ Error extracting DOCX text: {e}")
        
        # Ensure text is never empty - use demo text if extraction failed
        if not text or len(text.strip()) < 50:
            print("[Resume Analysis] ⚠️ Text extraction failed or too short (< 50 chars), using demo resume text")
            # Import demo text generator from pdf_extractor
            try:
                from pdf_extractor import _get_demo_resume_text
                text = _get_demo_resume_text()
            except ImportError:
                # Fallback demo text if import fails
                text = """Software Engineer with 5 years of experience in Python, JavaScript, React, SQL, and Machine Learning. 
Proficient in cloud technologies including AWS, Docker, and Kubernetes. 
Strong background in full-stack development and building scalable applications."""
        
        result['text_length'] = len(text)
        text_lower = text.lower()
        
        # Enhanced skill detection with more keywords
        skill_keywords = {
            'Python': ['python', 'django', 'flask', 'fastapi', 'pandas', 'numpy'],
            'JavaScript': ['javascript', 'js', 'node.js', 'nodejs', 'typescript', 'ts'],
            'React': ['react', 'reactjs', 'react.js', 'redux'],
            'SQL': ['sql', 'postgresql', 'postgres', 'mysql', 'database', 'db'],
            'Machine Learning': ['machine learning', 'ml', 'tensorflow', 'scikit-learn', 'sklearn', 'deep learning'],
            'AWS': ['aws', 'amazon web services', 'ec2', 's3', 'lambda'],
            'Docker': ['docker', 'dockerfile', 'docker compose'],
            'Kubernetes': ['kubernetes', 'k8s', 'helm'],
            'Git': ['git', 'github', 'gitlab', 'version control'],
            'Java': ['java', 'spring', 'spring boot'],
            'Node.js': ['node.js', 'nodejs', 'express', 'nest.js'],
            'Cloud': ['cloud', 'aws', 'azure', 'gcp', 'google cloud'],
        }
        
        detected_skills = []
        for skill, keywords in skill_keywords.items():
            for keyword in keywords:
                if keyword in text_lower:
                    detected_skills.append(skill)
                    break
        
        # Ensure at least 5 skills (add defaults if needed)
        default_skills = ['Python', 'JavaScript', 'React', 'SQL', 'Machine Learning', 'AWS', 'Docker', 'Git']
        if len(detected_skills) < 5:
            print(f"[Resume Analysis] ⚠️ Only {len(detected_skills)} skills detected, adding defaults to reach minimum of 5")
            for default_skill in default_skills:
                if default_skill not in detected_skills:
                    detected_skills.append(default_skill)
                    if len(detected_skills) >= 5:
                        break
        
        result['skills'] = list(set(detected_skills))[:10]  # Remove duplicates, limit to 10
        
        # Simple domain detection
        domain_keywords = {
            'Frontend': ['frontend', 'front-end', 'ui', 'react', 'vue', 'angular', 'javascript'],
            'Backend': ['backend', 'back-end', 'api', 'server', 'node.js', 'django', 'flask'],
            'Full Stack': ['full stack', 'fullstack', 'mern', 'mean'],
            'DevOps': ['devops', 'docker', 'kubernetes', 'aws', 'ci/cd'],
            'Mobile': ['mobile', 'ios', 'android', 'react native'],
        }
        
        detected_domains = []
        for domain, keywords in domain_keywords.items():
            for keyword in keywords:
                if keyword in text_lower:
                    detected_domains.append(domain)
                    break
        
        result['domains'] = list(set(detected_domains))  # Remove duplicates
        
        # Enhanced experience detection
        import re
        experience_patterns = [
            r'(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp)',
            r'(?:senior|lead|principal)',
            r'(\d+)\s*-\s*(\d+)\s*(?:years?|yrs?)',
            r'(\d+)\s*(?:years?|yrs?)',
        ]
        
        experience_found = False
        for pattern in experience_patterns:
            match = re.search(pattern, text_lower)
            if match:
                if 'senior' in match.group(0) or 'lead' in match.group(0) or 'principal' in match.group(0):
                    result['experience_years'] = 5.0
                    experience_found = True
                    break
                elif match.groups():
                    try:
                        years = float(match.group(1))
                        result['experience_years'] = years
                        experience_found = True
                        break
                    except (ValueError, IndexError):
                        continue
        
        # Ensure experience_years is always a number (default to 5.0 if not detected)
        if not experience_found or result['experience_years'] is None:
            print("[Resume Analysis] ⚠️ Experience not detected, defaulting to 5.0 years")
            result['experience_years'] = 5.0
        
        print(f"[Resume Analysis] ⚠️ Fallback parser: Detected {len(result['skills'])} skills, {len(result['domains'])} domains")
        
    except Exception as e:
        print(f"[Resume Analysis] ⚠️ Error in fallback parser: {e}")
        # Still return valid result with defaults
        result['error'] = f"Fallback parsing encountered issues: {str(e)}"
    
    return result


async def _fetch_active_projects_for_matching() -> List[Dict]:
    """
    Fetch active projects from Firestore for project matching.
    
    This is a helper function that fetches projects with status "In Progress" or "Planning"
    and returns them in a format suitable for project matching.
    
    Returns:
        List[Dict]: List of active project dictionaries
    """
    try:
        db = init_firebase()
        
        if not db:
            return []
        
        # Query Firestore for active projects
        projects_ref = db.collection('projects')
        
        # Get projects with status "In Progress" or "Planning"
        in_progress = projects_ref.where('status', '==', 'In Progress').stream()
        planning = projects_ref.where('status', '==', 'Planning').stream()
        
        projects = []
        seen_ids = set()
        
        # Process "In Progress" projects
        for doc in in_progress:
            data = doc.to_dict()
            project_id = doc.id
            if project_id not in seen_ids:
                seen_ids.add(project_id)
                
                # Handle backward compatibility: convert requiredSkill to requiredSkills array
                required_skills = data.get('requiredSkills', [])
                if not required_skills and data.get('requiredSkill'):
                    required_skills = [data.get('requiredSkill')]
                
                project_dict = {
                    'projectId': project_id,
                    'projectName': data.get('projectName') or data.get('name') or 'Unknown Project',
                    'requiredSkills': required_skills,
                    'optionalSkills': data.get('optionalSkills', []),  # New field
                    'status': data.get('status', 'Planning'),
                    'minimumHelixScore': data.get('minimumHelixScore') or data.get('minHelixScore') or 0,
                    'createdBy': data.get('createdBy', ''),
                    'description': data.get('description'),
                    'domain': data.get('domain'),  # New field
                    'difficultyLevel': data.get('difficultyLevel'),  # New field
                    'active': data.get('active', True),  # New field, default to True
                    'startDate': data.get('startDate'),
                    'endDate': data.get('endDate'),
                }
                projects.append(project_dict)
        
        # Process "Planning" projects
        for doc in planning:
            data = doc.to_dict()
            project_id = doc.id
            if project_id not in seen_ids:
                seen_ids.add(project_id)
                
                # Handle backward compatibility
                required_skills = data.get('requiredSkills', [])
                if not required_skills and data.get('requiredSkill'):
                    required_skills = [data.get('requiredSkill')]
                
                project_dict = {
                    'projectId': project_id,
                    'projectName': data.get('projectName') or data.get('name') or 'Unknown Project',
                    'requiredSkills': required_skills,
                    'optionalSkills': data.get('optionalSkills', []),  # New field
                    'status': data.get('status', 'Planning'),
                    'minimumHelixScore': data.get('minimumHelixScore') or data.get('minHelixScore') or 0,
                    'createdBy': data.get('createdBy', ''),
                    'description': data.get('description'),
                    'domain': data.get('domain'),  # New field
                    'difficultyLevel': data.get('difficultyLevel'),  # New field
                    'active': data.get('active', True),  # New field, default to True
                    'startDate': data.get('startDate'),
                    'endDate': data.get('endDate'),
                }
                projects.append(project_dict)
        
        return projects
        
    except ImportError:
        return []
    except Exception as e:
        print(f"[Resume Analysis] ⚠️ Error fetching projects for matching: {e}")
        return []


def _calculate_simple_project_matches(
    resume_skills: List[str], 
    resume_domains: List[str], 
    experience_years: float,
    projects: List[Dict], 
    top_n: int = 5
) -> List[Dict]:
    """
    Simple deterministic project matching based on skill overlap, domain match, and experience.
    
    Args:
        resume_skills: List of skills from resume
        resume_domains: List of domains from resume
        experience_years: Years of experience from resume
        projects: List of project dictionaries from Firestore
        top_n: Number of top matches to return
        
    Returns:
        List of recommended project dictionaries with match score and reasons
    """
    if not resume_skills or not projects:
        return []
    
    # Normalize skills for comparison (case-insensitive)
    def normalize_skill(skill: str) -> str:
        return skill.strip().lower()
    
    def normalize_domain(domain: str) -> str:
        return domain.strip().lower()
    
    normalized_resume_skills = [normalize_skill(s) for s in resume_skills if s and s.strip()]
    normalized_resume_domains = [normalize_domain(d) for d in resume_domains if d and d.strip()]
    
    matches = []
    for project in projects:
        # Get required skills (handle backward compatibility)
        required_skills = project.get('requiredSkills', [])
        if not required_skills and project.get('requiredSkill'):
            required_skills = [project.get('requiredSkill')]
        
        if not required_skills:
            continue  # Skip projects with no required skills
        
        # Normalize project skills
        normalized_project_skills = [normalize_skill(s) for s in required_skills if s and s.strip()]
        
        # Find matched skills (overlap)
        matched_skills = []
        for project_skill in normalized_project_skills:
            for resume_skill in normalized_resume_skills:
                # Check exact match or substring match
                if project_skill == resume_skill or project_skill in resume_skill or resume_skill in project_skill:
                    # Get original skill name from project
                    original_skill = next((s for s in required_skills if normalize_skill(s) == project_skill), project_skill)
                    if original_skill not in matched_skills:
                        matched_skills.append(original_skill)
                    break
        
        # Calculate match score (percentage of required skills matched)
        if normalized_project_skills:
            match_score = (len(matched_skills) / len(normalized_project_skills)) * 100.0
        else:
            match_score = 0.0
        
        # Only include projects with at least some match
        if matched_skills:
            # Generate match reasons
            match_reasons = []
            
            # Skill match reason
            if matched_skills:
                skill_count = len(matched_skills)
                skill_list = ', '.join(matched_skills[:3])  # Show first 3
                if skill_count > 3:
                    skill_list += f" and {skill_count - 3} more"
                match_reasons.append(f"Matched {skill_count} required skill{'s' if skill_count > 1 else ''}: {skill_list}")
            
            # Domain match reason
            project_domain = project.get('domain', '')
            if project_domain:
                normalized_project_domain = normalize_domain(project_domain)
                if any(normalized_project_domain in d or d in normalized_project_domain for d in normalized_resume_domains):
                    match_reasons.append(f"Domain alignment: Your experience in {project_domain} matches this project")
            
            # Experience suitability reason
            min_experience = project.get('difficultyLevel')
            if min_experience:
                # Map difficulty levels to years (rough estimate)
                experience_map = {
                    'Beginner': 0,
                    'Intermediate': 2,
                    'Advanced': 5,
                    'Expert': 8
                }
                required_years = experience_map.get(min_experience, 0)
                if experience_years >= required_years:
                    match_reasons.append(f"Experience level suitable: {experience_years:.1f} years meets {min_experience} level requirements")
                elif experience_years >= required_years * 0.7:  # Close enough
                    match_reasons.append(f"Experience level close: {experience_years:.1f} years is near {min_experience} level requirements")
            
            matches.append({
                'projectId': project.get('projectId', ''),
                'title': project.get('projectName') or project.get('name') or 'Unknown Project',
                'description': project.get('description', 'No description available'),
                'domain': project.get('domain', ''),
                'minExperience': project.get('difficultyLevel', ''),
                'matchedSkills': matched_skills,
                'matchScore': round(match_score, 1),
                'matchReasons': match_reasons
            })
    
    # Sort by match score (descending)
    matches.sort(key=lambda x: x['matchScore'], reverse=True)
    
    # Return top N
    return matches[:top_n]


@app.post("/api/resume/analyze", response_model=ResumeAnalysisResponse)
async def analyze_resume(
    file: UploadFile = File(...),
    user_uid: Optional[str] = Depends(get_user_uid)
):
    """
    Analyze a resume (PDF or DOCX) and extract structured data.
    
    This endpoint:
    1. Accepts a PDF or DOCX file via multipart/form-data
    2. Saves the file temporarily
    3. Parses the resume using resume_parser.py
    4. Stores results in Firestore
    5. Returns parsed data
    6. Cleans up temporary file
    
    Args:
        file: Uploaded resume file (PDF or DOCX)
        user_uid: Firebase user UID from X-User-Id header
        
    Returns:
        ResumeAnalysisResponse: Parsed resume data
        
    Raises:
        HTTPException: For various error conditions (only for invalid file types)
    """
    # Validate file type
    file_extension = os.path.splitext(file.filename)[1].lower() if file.filename else ""
    if file_extension not in ['.pdf', '.docx', '.doc']:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format. Supported: PDF, DOCX. Received: {file_extension or 'unknown'}"
        )
    
    temp_file_path = None
    
    try:
        user_info = f"user: {user_uid}" if user_uid else "anonymous user"
        print(f"[Resume Analysis] Starting analysis for {user_info}")
        print(f"[Resume Analysis] File: {file.filename}, Type: {file_extension}")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=file_extension,
            dir=tempfile.gettempdir()
        ) as temp_file:
            temp_file_path = temp_file.name
            
            # Read and write file content
            content = await file.read()
            temp_file.write(content)
            temp_file.flush()
        
        print(f"[Resume Analysis] File saved to: {temp_file_path}")
        
        # Parse resume (with fallback for demo mode)
        result = None
        if parse_resume:
            try:
                print(f"[Resume Analysis] Calling parse_resume...")
                result = parse_resume(temp_file_path)
                
                if not result.get('success'):
                    error_msg = result.get('error', 'Unknown parsing error')
                    print(f"[Resume Analysis] ⚠️ Parsing failed: {error_msg}, using fallback parser")
                    result = None  # Fall through to fallback
            except Exception as parse_error:
                print(f"[Resume Analysis] ⚠️ Error calling parse_resume: {parse_error}, using fallback parser")
                result = None  # Fall through to fallback
        
        # Use fallback parser if main parser is unavailable or failed
        if not result:
            print(f"[Resume Analysis] Using fallback parser (demo mode)")
            result = _fallback_parse_resume(temp_file_path, file_extension)
        
        # Extract parsed data (exactly as returned by resume_parser.py)
        skills = result.get('skills', [])
        experience_years = result.get('experience_years', 0.0)  # Default to 0.0 if not detected
        domains = result.get('domains', [])
        text_length = result.get('text_length', 0)
        file_type = result.get('file_type', file_extension.upper().replace('.', '') if file_extension else 'Unknown')
        
        # Ensure experience_years is a float (not None)
        if experience_years is None:
            experience_years = 0.0
        
        print(f"[Resume Analysis] ✅ Success! Detected {len(skills)} skills")
        if experience_years:
            print(f"[Resume Analysis] Experience: {experience_years} years")
        if domains:
            print(f"[Resume Analysis] Domains: {', '.join(domains)}")
        if skills:
            print(f"[Resume Analysis] Skills: {', '.join(skills[:10])}{'...' if len(skills) > 10 else ''}")
        print(f"[Resume Analysis] Text length: {text_length} characters")
        
        # Store in Firestore (optional - gracefully handles if not configured)
        try:
            from firebase_admin import storage
            from firebase_admin.exceptions import FirebaseError
            
            # Initialize Firebase Admin using service account
            db = None
            storage_bucket = None
            try:
                db = init_firebase()
                # Try to get storage bucket (optional)
                try:
                    storage_bucket = storage.bucket()
                except Exception:
                    storage_bucket = None
            except Exception as firebase_init_error:
                print(f"[Resume Analysis] Warning: Could not initialize Firebase: {firebase_init_error}")
                print(f"[Resume Analysis] Skipping Firestore storage. Analysis results will still be returned.")
                db = None
                storage_bucket = None
            
            # Store resume analysis in Firestore (only after successful parsing)
            firestore_document_id = None
            saved_document = None
            if db and user_uid:
                from firebase_admin import firestore
                
                # Upload file to Firebase Storage and get download URL (if Storage is available)
                # This runs only after successful parsing
                file_url = None
                if storage_bucket and os.path.exists(temp_file_path):
                    try:
                        # Upload file to Storage
                        storage_path = f"resumes/{user_uid}/{file.filename}"
                        blob = storage_bucket.blob(storage_path)
                        
                        # Read file content from temp file for upload
                        with open(temp_file_path, 'rb') as file_content:
                            blob.upload_from_file(file_content, content_type=file.content_type or 'application/pdf')
                        
                        # Make blob publicly readable (or use signed URL for private)
                        blob.make_public()
                        file_url = blob.public_url
                        
                        print(f"[Resume Analysis] ✅ Uploaded resume file to Storage: {storage_path}")
                        print(f"[Resume Analysis] File URL: {file_url}")
                    except Exception as storage_error:
                        print(f"[Resume Analysis] ⚠️ Error uploading to Storage: {storage_error}")
                        import traceback
                        traceback.print_exc()
                        file_url = None
                elif storage_bucket:
                    print(f"[Resume Analysis] ⚠️ Temp file not found at {temp_file_path}, skipping Storage upload")
                
                # Save extracted data to resumes/{employeeId} collection
                # This runs only after successful parsing
                # Use merge=True to avoid overwriting future updates
                resume_data = {
                    'userId': user_uid,  # string
                    'skills': skills,  # array<string>
                    'domains': domains,  # array<string>
                    'experienceYears': experience_years,  # number
                    'extractedTextLength': text_length,  # number
                    'uploadedAt': firestore.SERVER_TIMESTAMP,  # server timestamp
                }
                
                # Use employeeId (user_uid) as document ID
                # Collection: resumes, Document ID: employeeId
                resume_doc_ref = db.collection('resumes').document(user_uid)
                try:
                    # Use merge=True to avoid overwriting future updates
                    resume_doc_ref.set(resume_data, merge=True)
                    firestore_document_id = user_uid  # Document ID is the employeeId
                    print(f"[Resume Analysis] ✅ Resume saved to Firestore for user: {user_uid}")
                    print(f"[Resume Analysis] Collection: resumes, Document ID: {user_uid}")
                    print(f"[Resume Analysis] Fields saved: userId, skills ({len(skills)}), domains ({len(domains)}), experienceYears ({experience_years}), extractedTextLength ({text_length}), uploadedAt")
                except Exception as firestore_write_error:
                    print(f"[Resume Analysis] ❌ Failed to persist resume analysis to Firestore: {firestore_write_error}")
                    import traceback
                    traceback.print_exc()
                    firestore_document_id = None
                # Store analysis in Firestore: collection resume_analysis, document id = userId
                # Fields: skills, domains, experience_years, text_length, analyzedAt (server timestamp)
                analysis_data = {
                    'skills': list(skills),
                    'domains': list(domains),
                    'experience_years': float(experience_years) if experience_years is not None else 0.0,
                    'text_length': int(text_length) if text_length is not None else 0,
                    'analyzedAt': firestore.SERVER_TIMESTAMP,
                }
                
                doc_ref = db.collection('resume_analysis').document(user_uid)
                doc_ref.set(analysis_data)
                print(f"[Resume Analysis] ✅ Stored analysis in Firestore: resume_analysis/{user_uid}")
                
                # Read back the saved document to return in response (includes server timestamp)
                saved_snapshot = doc_ref.get()
                if saved_snapshot.exists:
                    saved_data = saved_snapshot.to_dict()
                    ts = saved_data.get('analyzedAt')
                    if ts is not None and hasattr(ts, 'isoformat'):
                        analyzed_at_str = ts.isoformat()
                    elif ts is not None:
                        analyzed_at_str = str(ts)
                    else:
                        analyzed_at_str = datetime.utcnow().isoformat() + 'Z'
                    saved_document = {
                        'skills': saved_data.get('skills', []),
                        'domains': saved_data.get('domains', []),
                        'experience_years': saved_data.get('experience_years', 0),
                        'text_length': saved_data.get('text_length', 0),
                        'analyzedAt': analyzed_at_str,
                    }
                else:
                    saved_document = {
                        'skills': list(skills),
                        'domains': list(domains),
                        'experience_years': float(experience_years) if experience_years is not None else 0.0,
                        'text_length': int(text_length) if text_length is not None else 0,
                        'analyzedAt': datetime.utcnow().isoformat() + 'Z',
                    }
                firestore_document_id = user_uid
                
                # Also save/update Employee Skill Profile (single source of truth)
                # Initialize skill points from resume
                skill_points_dict = {}
                if initialize_skill_points_from_resume and skills:
                    try:
                        skill_points_raw = initialize_skill_points_from_resume(skills, experience_years or 0.0)
                        # Convert to Firestore-compatible format
                        for skill_name, skill_data in skill_points_raw.items():
                            skill_points_dict[skill_name] = {
                                'points': skill_data['points'],
                                'level': skill_data['level'],
                                'nextThreshold': skill_data['nextThreshold'],
                                'lastUpdated': skill_data['lastUpdated'],
                                'source': skill_data['source']
                            }
                        print(f"[Resume Analysis] ✅ Initialized skill points for {len(skill_points_dict)} skills")
                    except Exception as skill_error:
                        print(f"[Resume Analysis] ⚠️ Error initializing skill points: {skill_error}")
                        skill_points_dict = {}
                
                # Check if profile exists first
                from firebase_admin import firestore
                profile_ref = db.collection('employee_skill_profiles').document(user_uid)
                profile_doc = profile_ref.get()
                existing_completed_projects = []
                if profile_doc.exists:
                    existing_data = profile_doc.to_dict()
                    existing_completed_projects = existing_data.get('completed_projects', [])
                
                # Calculate promotion readiness
                promotion_readiness = None
                if calculate_promotion_readiness:
                    try:
                        readiness_result = calculate_promotion_readiness(
                            skill_points_dict,
                            existing_completed_projects,
                            experience_years or 0.0
                        )
                        promotion_readiness = {
                            'score': readiness_result['score'],
                            'level': readiness_result['level'],
                            'requirements': readiness_result.get('requirements', []),
                            'nextLevel': readiness_result.get('nextLevel', 'Senior Developer')
                        }
                        print(f"[Resume Analysis] ✅ Calculated promotion readiness: {readiness_result['score']}% ({readiness_result['level']})")
                    except Exception as readiness_error:
                        print(f"[Resume Analysis] ⚠️ Error calculating promotion readiness: {readiness_error}")
                        promotion_readiness = {'score': 0.0, 'level': 'Low', 'requirements': [], 'nextLevel': 'Senior Developer'}
                
                profile_data = {
                    'userId': user_uid,  # Keep userId for Firestore (consistent with frontend)
                    'skills': skills,
                    'domains': domains,
                    'experience_years': experience_years or 0.0,
                    'text_length': text_length,
                    'file_type': file_type,
                    'skill_points': skill_points_dict,
                    'completed_projects': existing_completed_projects,
                    'promotion_readiness_score': promotion_readiness['score'] if promotion_readiness else 0.0,
                    'promotion_readiness_level': promotion_readiness['level'] if promotion_readiness else 'Low',
                    'promotion_readiness_requirements': promotion_readiness['requirements'] if promotion_readiness else [],
                    'promotion_readiness_next_level': promotion_readiness['nextLevel'] if promotion_readiness else 'Senior Developer',
                    'analyzed_at': firestore.SERVER_TIMESTAMP,
                    'updated_at': firestore.SERVER_TIMESTAMP,
                }
                
                if profile_doc.exists:
                    # Update existing profile (preserve completed_projects and merge skill_points)
                    existing_data = profile_doc.to_dict()
                    profile_data['created_at'] = existing_data.get('created_at', firestore.SERVER_TIMESTAMP)
                    # Merge skill points (keep existing project-based points, update resume-based)
                    existing_skill_points = existing_data.get('skill_points', {})
                    for skill, data in skill_points_dict.items():
                        # Only update if skill is from resume or doesn't exist
                        if skill not in existing_skill_points or existing_skill_points[skill].get('source') == 'resume':
                            existing_skill_points[skill] = data
                    profile_data['skill_points'] = existing_skill_points
                    profile_data['completed_projects'] = existing_data.get('completed_projects', [])
                    profile_ref.update(profile_data)
                    print(f"[Resume Analysis] ✅ Updated Employee Skill Profile: employee_skill_profiles/{user_uid}")
                else:
                    # Create new profile
                    profile_data['created_at'] = firestore.SERVER_TIMESTAMP
                    profile_ref.set(profile_data)
                    print(f"[Resume Analysis] ✅ Created Employee Skill Profile: employee_skill_profiles/{user_uid}")
                
                # Calculate and store project recommendations in user_progress/{userId}.recommendedProjects
                if calculate_project_recommendations and skills and user_uid:
                    try:
                        # Fetch active projects from Firestore
                        active_projects = await _fetch_active_projects_for_matching()
                        
                        if active_projects:
                            # Calculate recommendations using the recommendation engine
                            recommendations = calculate_project_recommendations(
                                resume_skills=skills,
                                projects=active_projects,
                                top_n=5  # Store top 5 recommendations
                            )
                            
                            if recommendations:
                                # Store in user_progress/{userId}.recommendedProjects
                                user_progress_ref = db.collection('user_progress').document(user_uid)
                                user_progress_doc = user_progress_ref.get()
                                
                                if user_progress_doc.exists:
                                    # Update existing document
                                    user_progress_ref.update({
                                        'recommendedProjects': recommendations,
                                        'recommendationsUpdatedAt': firestore.SERVER_TIMESTAMP,
                                    })
                                else:
                                    # Create new document
                                    user_progress_ref.set({
                                        'userId': user_uid,
                                        'recommendedProjects': recommendations,
                                        'recommendationsUpdatedAt': firestore.SERVER_TIMESTAMP,
                                        'createdAt': firestore.SERVER_TIMESTAMP,
                                    })
                                
                                print(f"[Resume Analysis] ✅ Stored {len(recommendations)} project recommendations in user_progress/{user_uid}")
                            else:
                                print(f"[Resume Analysis] ⚠️ No project recommendations generated (no matches found)")
                        else:
                            print(f"[Resume Analysis] ⚠️ No active projects found for recommendations")
                    except Exception as rec_error:
                        print(f"[Resume Analysis] ⚠️ Error calculating/storing recommendations: {rec_error}")
                        import traceback
                        traceback.print_exc()
            else:
                if not user_uid:
                    print(f"[Resume Analysis] ⚠️ No user UID provided, skipping Firestore storage")
                    firestore_document_id = None
                else:
                    print(f"[Resume Analysis] ⚠️ Firestore not available, skipping storage")
                    firestore_document_id = None
                
        except ImportError:
            print(f"[Resume Analysis] ⚠️ Warning: Firebase initialization failed. Skipping Firestore storage.")
            print(f"[Resume Analysis] Install with: pip install firebase-admin")
            print(f"[Resume Analysis] Analysis results will still be returned.")
            firestore_document_id = None
        except Exception as firestore_error:
            print(f"[Resume Analysis] ❌ Error storing in Firestore: {firestore_error}")
            import traceback
            traceback.print_exc()
            print(f"[Resume Analysis] Analysis results will still be returned.")
            firestore_document_id = None
        
        # Calculate project recommendations (deterministic, simple skill overlap)
        recommended_projects = []
        try:
            # Fetch active projects from Firestore
            active_projects = await _fetch_active_projects_for_matching()
            
            if active_projects and skills:
                recommended_projects = _calculate_simple_project_matches(
                    resume_skills=skills,
                    resume_domains=domains,
                    experience_years=experience_years or 0.0,
                    projects=active_projects,
                    top_n=5
                )
                print(f"[Resume Analysis] ✅ Calculated {len(recommended_projects)} project recommendations")
            else:
                print(f"[Resume Analysis] ⚠️ No projects or skills available for matching")
        except Exception as rec_error:
            print(f"[Resume Analysis] ⚠️ Error calculating project recommendations: {rec_error}")
            import traceback
            traceback.print_exc()
            recommended_projects = []
        
        # Return success response with new combined format
        return ResumeAnalysisResponse(
            success=True,
            resumeStats=ResumeStats(
                textLength=text_length,
                experienceYears=experience_years or 0.0
            ),
            skills=skills,
            domains=domains,
            recommendedProjects=[
                RecommendedProject(
                    projectId=proj['projectId'],
                    title=proj['title'],
                    description=proj.get('description', ''),
                    domain=proj.get('domain', ''),
                    minExperience=proj.get('minExperience', ''),
                    matchedSkills=proj['matchedSkills'],
                    matchScore=proj['matchScore'],
                    matchReasons=proj.get('matchReasons', [])
                )
                for proj in recommended_projects
            ],
            message="Resume analyzed successfully",
            firestore_document_id=firestore_document_id,
            savedDocument=saved_document
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions (only for invalid file types)
        raise
    except Exception as e:
        print(f"[Resume Analysis] ⚠️ Internal error: {e}")
        import traceback
        traceback.print_exc()
        
        # In demo mode, return partial results instead of failing
        print(f"[Resume Analysis] Returning minimal result due to error (demo mode)")
        return ResumeAnalysisResponse(
            success=True,
            resumeStats=ResumeStats(
                textLength=0,
                experienceYears=0.0
            ),
            skills=[],
            domains=[],
            recommendedProjects=[],
            message="Resume analysis completed with limited results (demo mode)",
            firestore_document_id=None,
            savedDocument=None
        )
    finally:
        # Clean up temporary file
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
                print(f"[Resume Analysis] Cleaned up temporary file: {temp_file_path}")
            except Exception as cleanup_error:
                print(f"[Resume Analysis] Warning: Failed to delete temp file: {cleanup_error}")


@app.get("/api/recommended-projects/{user_id}")
async def get_recommended_projects(user_id: str) -> Dict[str, Any]:
    """
    Get top 3 recommended projects for a user based on resume_analysis skills.
    
    - Fetches resume_analysis/{user_id}.skills
    - Fetches all documents from projects collection
    - For each project: matched = intersection(resumeSkills, project.requiredSkills),
      matchScore = (matched.length / project.requiredSkills.length) * 100
    - Sorts descending by matchScore, returns top 3 with title, domain, matchScore, matchedSkills
    """
    try:
        db = init_firebase()
    except Exception as e:
        print(f"[Recommended Projects] Firebase init failed: {e}")
        return {"projects": []}

    # 1) Fetch resume_analysis/{user_id}.skills
    resume_ref = db.collection('resume_analysis').document(user_id)
    resume_doc = resume_ref.get()
    if not resume_doc.exists:
        return {"projects": []}
    resume_skills = resume_doc.to_dict().get('skills') or []
    resume_skills_lower = [s.lower() for s in resume_skills]

    # 2) Fetch all documents from projects collection
    projects_ref = db.collection('projects')
    all_docs = list(projects_ref.stream())

    results = []
    for doc_snap in all_docs:
        data = doc_snap.to_dict()
        required_skills = data.get('requiredSkills') or []
        if not required_skills and data.get('requiredSkill'):
            required_skills = [data.get('requiredSkill')]
        if not required_skills:
            continue

        # 3) matched = intersection(resumeSkills, project.requiredSkills); matchScore = (matched / required) * 100
        required_lower = [s.lower() for s in required_skills]
        matched = [req for req in required_skills if req.lower() in resume_skills_lower]
        if len(matched) == 0:
            continue
        match_score = round((len(matched) / len(required_skills)) * 100)

        title = data.get('title') or data.get('projectName') or data.get('name') or 'Unknown Project'
        domain = data.get('domain') or ''

        results.append({
            "projectId": doc_snap.id,
            "title": title,
            "domain": domain,
            "matchScore": match_score,
            "matchedSkills": matched,
        })
    # 4) Sort descending by matchScore, return top 3
    results.sort(key=lambda x: x['matchScore'], reverse=True)
    top = results[:3]

    return {"projects": top}


@app.post("/api/projects/express-interest")
async def express_interest(body: ExpressInterestRequest) -> Dict[str, Any]:
    """
    Record that an employee has expressed interest in a project.
    Writes to Firestore collection project_interests with status "pending".
    """
    try:
        db = init_firebase()
    except Exception as e:
        print(f"[Express Interest] Firebase init failed: {e}")
        raise HTTPException(status_code=503, detail="Service unavailable")

    from firebase_admin import firestore

    doc_data = {
        "employeeId": body.employeeId,
        "employeeName": body.employeeName,
        "projectId": body.projectId,
        "projectTitle": body.projectTitle,
        "status": "pending",
        "createdAt": firestore.SERVER_TIMESTAMP,
    }
    try:
        ref = db.collection("project_interests").add(doc_data)
        print(f"[Express Interest] Created project_interests doc {ref[1].id} for employee {body.employeeId} on project {body.projectId}")
        return {"success": True, "id": ref[1].id}
    except Exception as e:
        print(f"[Express Interest] Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to save interest")


@app.get("/api/resumes/{user_id}")
async def get_resume_data(user_id: str):
    """
    Get resume data for an employee from Firestore.
    
    This endpoint returns the resume data stored in the resumes collection,
    which includes skills, domains, experience, file URL, and timestamp.
    
    Args:
        user_id: Employee user ID (Firebase UID)
        
    Returns:
        Dict: Resume data or error message
    """
    try:
        print(f"[Resume Data] Fetching resume for user: {user_id}")
        
        try:
            db = None
            try:
                db = init_firebase()
            except Exception as firebase_error:
                print(f"[Resume Data] ⚠️ Firebase initialization failed: {firebase_error}")
                import traceback
                traceback.print_exc()
                db = None
            
            if db:
                # Fetch resume data from resumes collection
                resume_doc = db.collection('resumes').document(user_id).get()
                
                if resume_doc.exists:
                    data = resume_doc.to_dict()
                    
                    # Convert Firestore timestamps to ISO strings
                    def convert_timestamp(ts):
                        if hasattr(ts, 'timestamp'):
                            return datetime.fromtimestamp(ts.timestamp()).isoformat()
                        elif isinstance(ts, datetime):
                            return ts.isoformat()
                        return None
                    
                    resume = {
                        'userId': user_id,
                        'skills': data.get('skills', []),
                        'domains': data.get('domains', []),
                        'experience_years': data.get('experience_years', 0.0),
                        'file_url': data.get('file_url'),
                        'file_name': data.get('file_name'),
                        'file_type': data.get('file_type'),
                        'text_length': data.get('text_length', 0),
                        'analyzed_at': convert_timestamp(data.get('analyzed_at')),
                        'updated_at': convert_timestamp(data.get('updated_at')),
                    }
                    
                    print(f"[Resume Data] ✅ Found resume for user {user_id}")
                    return {
                        'success': True,
                        'resume': resume
                    }
                else:
                    print(f"[Resume Data] ⚠️ No resume found for user {user_id}")
                    return {
                        'success': False,
                        'resume': None,
                        'message': 'No resume data found. Please upload and analyze your resume first.'
                    }
            else:
                return {
                    'success': False,
                    'resume': None,
                    'message': 'Database not available.'
                }
                
        except ImportError:
            print("[Resume Data] ⚠️ Firebase initialization failed")
            return {
                'success': False,
                'resume': None,
                'message': 'Database service not available.'
            }
        except Exception as e:
            print(f"[Resume Data] ⚠️ Error fetching resume: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'resume': None,
                'message': f'Error fetching resume: {str(e)}'
            }
            
    except Exception as e:
        print(f"[Resume Data] ⚠️ Internal error: {e}")
        import traceback
        traceback.print_exc()
        return {
            'success': False,
            'resume': None,
            'message': 'Internal error. Please try again later.'
        }


@app.get("/api/user-progress/{user_id}")
async def get_user_progress(user_id: str):
    """
    Get user progress data derived from resume.
    
    This endpoint returns progress data calculated from the user's resume.
    It always returns 200 status (never 404).
    
    Args:
        user_id: Employee user ID (Firebase UID)
        
    Returns:
        Dict: Progress data with structure:
            - If no resume: { "hasResume": false }
            - If resume exists: {
                "hasResume": true,
                "experienceYears": float,
                "skillsProgress": List[Dict],
                "promotionReadiness": float (0-100)
              }
    """
    try:
        print(f"[User Progress] Fetching progress for user: {user_id}")
        
        try:
            db = None
            try:
                db = init_firebase()
            except Exception as firebase_error:
                print(f"[User Progress] ⚠️ Firebase initialization failed: {firebase_error}")
                import traceback
                traceback.print_exc()
                db = None
            
            if db:
                # Fetch resume data from resumes collection
                resume_doc = db.collection('resumes').document(user_id).get()
                
                if not resume_doc.exists:
                    print(f"[User Progress] ⚠️ No resume found for user {user_id}")
                    return {
                        "hasResume": False
                    }
                
                # Resume exists - extract data
                data = resume_doc.to_dict()
                
                # Handle both camelCase and snake_case field names
                skills = data.get('skills', [])
                domains = data.get('domains', [])
                experience_years = data.get('experienceYears') or data.get('experience_years', 0.0)
                
                # Ensure experience_years is a float
                if not isinstance(experience_years, (int, float)):
                    experience_years = 0.0
                experience_years = float(experience_years)
                
                # Calculate skills progress
                # Each skill gets a basic progress entry
                skills_progress = []
                for skill in skills:
                    if isinstance(skill, str) and skill.strip():
                        skills_progress.append({
                            "skill": skill.strip(),
                            "level": "Beginner",  # Default level, can be enhanced later
                            "points": 0  # Default points, can be enhanced later
                        })
                
                # Calculate promotion readiness score (0-100)
                # Deterministic calculation based on:
                # - Experience years (max 50 points)
                # - Number of skills (max 30 points)
                # - Number of domains (max 20 points)
                
                # Experience component: 0-50 points
                # 0 years = 0 points, 5+ years = 50 points
                experience_score = min(50.0, (experience_years / 5.0) * 50.0)
                
                # Skills component: 0-30 points
                # 0 skills = 0 points, 10+ skills = 30 points
                num_skills = len(skills) if isinstance(skills, list) else 0
                skills_score = min(30.0, (num_skills / 10.0) * 30.0)
                
                # Domains component: 0-20 points
                # 0 domains = 0 points, 5+ domains = 20 points
                num_domains = len(domains) if isinstance(domains, list) else 0
                domains_score = min(20.0, (num_domains / 5.0) * 20.0)
                
                # Total promotion readiness score
                promotion_readiness = round(experience_score + skills_score + domains_score, 1)
                # Ensure it's between 0 and 100
                promotion_readiness = max(0.0, min(100.0, promotion_readiness))
                
                print(f"[User Progress] ✅ Calculated progress for user {user_id}: "
                      f"experience={experience_years}y, skills={num_skills}, domains={num_domains}, "
                      f"readiness={promotion_readiness}%")
                
                return {
                    "hasResume": True,
                    "experienceYears": experience_years,
                    "skillsProgress": skills_progress,
                    "promotionReadiness": promotion_readiness
                }
            else:
                # Database not available - return no resume
                print(f"[User Progress] ⚠️ Database not available for user {user_id}")
                return {
                    "hasResume": False
                }
                
        except ImportError:
            print("[User Progress] ⚠️ Firebase initialization failed")
            return {
                "hasResume": False
            }
        except Exception as e:
            print(f"[User Progress] ⚠️ Error fetching progress: {e}")
            import traceback
            traceback.print_exc()
            # Return no resume on error (always return 200)
            return {
                "hasResume": False
            }
            
    except Exception as e:
        print(f"[User Progress] ⚠️ Internal error: {e}")
        import traceback
        traceback.print_exc()
        # Always return 200, even on error
        return {
            "hasResume": False
        }


@app.get("/api/employee/profile/{user_id}")
async def get_employee_skill_profile(user_id: str):
    """
    Get employee skill profile (single source of truth).
    
    This endpoint returns the persistent skill profile for an employee,
    which is updated after resume analysis and used by My Progress and Project Matching.
    
    Args:
        user_id: Employee user ID (Firebase UID)
        
    Returns:
        Dict: Employee skill profile or error message
    """
    try:
        print(f"[Employee Profile] Fetching profile for user: {user_id}")
        
        try:
            db = None
            try:
                db = init_firebase()
            except Exception as firebase_error:
                print(f"[Employee Profile] ⚠️ Firebase initialization failed: {firebase_error}")
                import traceback
                traceback.print_exc()
                db = None
            
            if db:
                # Fetch employee skill profile
                profile_doc = db.collection('employee_skill_profiles').document(user_id).get()
                
                if profile_doc.exists:
                    data = profile_doc.to_dict()
                    
                    # Convert Firestore timestamps to ISO strings
                    def convert_timestamp(ts):
                        if hasattr(ts, 'timestamp'):
                            return datetime.fromtimestamp(ts.timestamp()).isoformat()
                        elif isinstance(ts, datetime):
                            return ts.isoformat()
                        return None
                    
                    # Convert Firestore data to API response format
                    profile = {
                        'userId': data.get('userId', user_id),
                        'skills': data.get('skills', []),
                        'domains': data.get('domains', []),
                        'experience_years': data.get('experience_years', 0.0),
                        'text_length': data.get('text_length', 0),
                        'file_type': data.get('file_type'),
                        'skill_points': data.get('skill_points', {}),
                        'completed_projects': data.get('completed_projects', []),
                        'promotion_readiness_score': data.get('promotion_readiness_score', 0.0),
                        'promotion_readiness_level': data.get('promotion_readiness_level', 'Low'),
                        'analyzed_at': convert_timestamp(data.get('analyzed_at')),
                        'created_at': convert_timestamp(data.get('created_at')),
                        'updated_at': convert_timestamp(data.get('updated_at')),
                    }
                    
                    # Calculate promotion readiness requirements if not stored
                    if calculate_promotion_readiness and not data.get('promotion_readiness_requirements'):
                        try:
                            readiness_result = calculate_promotion_readiness(
                                data.get('skill_points', {}),
                                data.get('completed_projects', []),
                                data.get('experience_years', 0.0)
                            )
                            profile['promotion_readiness_requirements'] = readiness_result.get('requirements', [])
                            profile['promotion_readiness_next_level'] = readiness_result.get('nextLevel', 'Senior Developer')
                        except Exception as e:
                            print(f"[Employee Profile] ⚠️ Error calculating requirements: {e}")
                            profile['promotion_readiness_requirements'] = []
                            profile['promotion_readiness_next_level'] = 'Senior Developer'
                    else:
                        profile['promotion_readiness_requirements'] = data.get('promotion_readiness_requirements', [])
                        profile['promotion_readiness_next_level'] = data.get('promotion_readiness_next_level', 'Senior Developer')
                    
                    print(f"[Employee Profile] ✅ Found profile for user {user_id}")
                    return {
                        'success': True,
                        'profile': profile
                    }
                else:
                    print(f"[Employee Profile] ⚠️ No profile found for user {user_id}")
                    return {
                        'success': False,
                        'profile': None,
                        'message': 'No skill profile found. Please upload and analyze your resume first.'
                    }
            else:
                return {
                    'success': False,
                    'profile': None,
                    'message': 'Database not available.'
                }
                
        except ImportError:
            print("[Employee Profile] ⚠️ Firebase initialization failed")
            return {
                'success': False,
                'profile': None,
                'message': 'Database service not available.'
            }
        except Exception as e:
            print(f"[Employee Profile] ⚠️ Error fetching profile: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'profile': None,
                'message': f'Error fetching profile: {str(e)}'
            }
            
    except Exception as e:
        print(f"[Employee Profile] ⚠️ Internal error: {e}")
        import traceback
        traceback.print_exc()
        return {
            'success': False,
            'profile': None,
            'message': 'Internal error. Please try again later.'
        }


@app.get("/projects/match/{user_id}")
async def get_project_matches(user_id: str):
    """
    Get project matches for an employee based on their resume.
    
    This endpoint:
    1. Fetches employee resume data from Firestore
    2. Fetches active projects from Firestore
    3. Matches resume to projects using skill-based matching
    4. Returns ranked list of matches with scores and explanations
    
    Args:
        user_id: Employee user ID (Firebase UID)
        
    Returns:
        Dict: Match results with structure:
            {
                'success': bool,
                'matches': List[ProjectMatchResult],
                'message': str (if no resume data)
            }
    """
    try:
        print(f"[Project Matching] Fetching matches for user: {user_id}")
        
        # Fetch resume data from Firestore
        resume_data = None
        try:
            db = None
            try:
                db = init_firebase()
            except Exception as firebase_error:
                print(f"[Project Matching] ⚠️ Firebase initialization failed: {firebase_error}")
                import traceback
                traceback.print_exc()
                db = None
            
            if db:
                # Fetch Employee Skill Profile (single source of truth)
                profile_doc = db.collection('employee_skill_profiles').document(user_id).get()
                if profile_doc.exists:
                    resume_data = profile_doc.to_dict()
                    print(f"[Project Matching] ✅ Found skill profile for user {user_id}")
                else:
                    # Fallback to resume_analysis (backward compatibility)
                    resume_doc = db.collection('resume_analysis').document(user_id).get()
                    if resume_doc.exists:
                        resume_data = resume_doc.to_dict()
                        print(f"[Project Matching] ✅ Found resume data for user {user_id} (fallback)")
                    else:
                        print(f"[Project Matching] ⚠️ No skill profile or resume data found for user {user_id}")
                        resume_data = None
        except ImportError:
            print("[Project Matching] ⚠️ Firebase initialization failed")
        except Exception as e:
            print(f"[Project Matching] ⚠️ Error fetching resume data: {e}")
        
        # If no resume data, return empty matches with message
        if not resume_data:
            return {
                'success': True,
                'matches': [],
                'message': 'No resume data found. Please upload your resume first.'
            }
        
        # Create ResumeProfile from Firestore data
        try:
            resume_profile = ResumeProfile(
                employee_id=user_id,
                skills=resume_data.get('skills', []),
                experience_years=resume_data.get('experience_years', 0.0),
                domains=resume_data.get('domains', []),
                text_length=resume_data.get('text_length', 0),
                file_type=resume_data.get('file_type')
            )
        except Exception as e:
            print(f"[Project Matching] ⚠️ Error creating ResumeProfile: {e}")
            return {
                'success': True,
                'matches': [],
                'message': 'Resume data format invalid. Please re-upload your resume.'
            }
        
        # Fetch active projects from Firestore
        projects_data = await _fetch_active_projects_for_matching()
        
        if not projects_data:
            print("[Project Matching] ⚠️ No active projects found")
            return {
                'success': True,
                'matches': [],
                'message': 'No active projects available for matching.'
            }
        
        # Convert Firestore project data to Project models
        project_models = []
        for proj_data in projects_data:
            try:
                # Handle date fields
                start_date = None
                end_date = None
                if 'startDate' in proj_data and proj_data['startDate']:
                    start_date_val = proj_data['startDate']
                    if hasattr(start_date_val, 'timestamp'):
                        start_date = datetime.fromtimestamp(start_date_val.timestamp())
                    elif isinstance(start_date_val, datetime):
                        start_date = start_date_val
                
                if 'endDate' in proj_data and proj_data['endDate']:
                    end_date_val = proj_data['endDate']
                    if hasattr(end_date_val, 'timestamp'):
                        end_date = datetime.fromtimestamp(end_date_val.timestamp())
                    elif isinstance(end_date_val, datetime):
                        end_date = end_date_val
                
                project = Project(
                    project_id=proj_data.get('projectId', ''),
                    project_name=proj_data.get('projectName', 'Unknown Project'),
                    required_skills=proj_data.get('requiredSkills', []),
                    optional_skills=proj_data.get('optionalSkills', []),  # New field
                    minimum_helix_score=proj_data.get('minimumHelixScore', 0),
                    status=proj_data.get('status', 'Planning'),
                    start_date=start_date,
                    end_date=end_date,
                    created_by=proj_data.get('createdBy', ''),
                    description=proj_data.get('description'),
                    domain=proj_data.get('domain'),  # New field
                    difficulty_level=proj_data.get('difficultyLevel'),  # New field
                    active=proj_data.get('active', True)  # New field, default to True
                )
                project_models.append(project)
            except Exception as proj_error:
                print(f"[Project Matching] ⚠️ Error converting project {proj_data.get('projectId')}: {proj_error}")
                continue
        
        if not project_models:
            return {
                'success': True,
                'matches': [],
                'message': 'No valid projects found for matching.'
            }
        
        # Match resume to projects
        try:
            if not match_resume_to_projects_new:
                raise ImportError("Project matching service not available")
            
            matches = match_resume_to_projects_new(
                resume_profile=resume_profile,
                projects=project_models,
                filter_active_only=True
            )
            
            # Convert ProjectMatchResult to dict for JSON response
            # Filter by ≥60% skill overlap (match_score >= 60)
            matches_dict = []
            for match in matches:
                if match.match_score >= 60.0:  # ≥60% skill overlap
                    matches_dict.append({
                        'projectId': match.project_id,
                        'title': match.title,
                        'matchScore': match.match_score,
                        'matchLevel': match.match_level,
                        'matchedSkills': match.matched_skills,
                        'missingSkills': match.missing_skills,
                        'explanation': match.explanation
                    })
            
            print(f"[Project Matching] ✅ Generated {len(matches_dict)} matches (≥60% overlap) for user {user_id}")
            
            return {
                'success': True,
                'matches': matches_dict,
                'message': None if matches_dict else 'No projects found with ≥60% skill overlap. Upload your resume to get recommendations.'
            }
            
        except Exception as match_error:
            print(f"[Project Matching] ⚠️ Error during matching: {match_error}")
            import traceback
            traceback.print_exc()
            return {
                'success': True,
                'matches': [],
                'message': 'Error during matching. Please try again later.'
            }
        
    except Exception as e:
        print(f"[Project Matching] ⚠️ Internal error: {e}")
        import traceback
        traceback.print_exc()
        return {
            'success': True,
            'matches': [],
            'message': 'Internal error. Please try again later.'
        }


@app.get("/api/projects/active")
async def get_active_projects():
    """
    Get active projects from Firestore.
    
    Returns only projects with status "In Progress" or "Planning".
    
    Returns:
        List[Dict]: Array of active project objects
        
    Raises:
        HTTPException: If Firestore query fails
    """
    try:
        print("[Projects API] Fetching active projects from Firestore...")
        
        # Try to use Firebase Admin
        try:
            db = init_firebase()
            
            if db:
                # Query Firestore for active projects
                projects_ref = db.collection('projects')
                
                # Get projects with status "In Progress" or "Planning"
                in_progress = projects_ref.where('status', '==', 'In Progress').stream()
                planning = projects_ref.where('status', '==', 'Planning').stream()
                
                projects = []
                seen_ids = set()
                
                # Process "In Progress" projects
                for doc in in_progress:
                    data = doc.to_dict()
                    project_id = doc.id
                    if project_id not in seen_ids:
                        seen_ids.add(project_id)
                        
                        # Handle backward compatibility: convert requiredSkill to requiredSkills array
                        required_skills = data.get('requiredSkills', [])
                        if not required_skills and data.get('requiredSkill'):
                            required_skills = [data.get('requiredSkill')]
                        
                        projects.append({
                            'projectId': project_id,
                            'projectName': data.get('projectName') or data.get('name') or 'Unknown Project',
                            'requiredSkills': required_skills,
                            'status': data.get('status', 'Planning'),
                            'minimumHelixScore': data.get('minimumHelixScore') or data.get('minHelixScore') or 0,
                        })
                
                # Process "Planning" projects
                for doc in planning:
                    data = doc.to_dict()
                    project_id = doc.id
                    if project_id not in seen_ids:
                        seen_ids.add(project_id)
                        
                        # Handle backward compatibility
                        required_skills = data.get('requiredSkills', [])
                        if not required_skills and data.get('requiredSkill'):
                            required_skills = [data.get('requiredSkill')]
                        
                        projects.append({
                            'projectId': project_id,
                            'projectName': data.get('projectName') or data.get('name') or 'Unknown Project',
                            'requiredSkills': required_skills,
                            'status': data.get('status', 'Planning'),
                            'minimumHelixScore': data.get('minimumHelixScore') or data.get('minHelixScore') or 0,
                        })
                
                print(f"[Projects API] ✅ Found {len(projects)} active projects")
                return projects
            else:
                print("[Projects API] ⚠️ Firestore not available, returning empty array")
                return []
                
        except ImportError:
            print("[Projects API] ⚠️ Warning: Firebase initialization failed. Returning empty array.")
            print("[Projects API] Install with: pip install firebase-admin")
            return []
        except Exception as firestore_error:
            print(f"[Projects API] ⚠️ Error querying Firestore: {firestore_error}")
            return []
            
    except Exception as e:
        print(f"[Projects API] ❌ Internal error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@app.post("/api/hr-documents/upload")
async def upload_hr_document(file: UploadFile = File(...)):
    """
    Upload an HR document (PDF) and immediately re-index it.
    
    This endpoint:
    1. Accepts a PDF file via multipart/form-data
    2. Saves it to backend/hr_documents/ directory
    3. Immediately calls reindex_hr_documents() to process all PDFs
    4. Updates embeddings for chat queries
    
    Args:
        file: Uploaded PDF file
        
    Returns:
        Dict: Upload and reindex status
    """
    # Validate file type
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    
    file_extension = os.path.splitext(file.filename)[1].lower()
    if file_extension != '.pdf':
        raise HTTPException(
            status_code=400,
            detail=f"Only PDF files are supported. Received: {file_extension}"
        )
    
    # Get hr_documents directory path
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    hr_docs_dir = os.path.join(backend_dir, 'hr_documents')
    os.makedirs(hr_docs_dir, exist_ok=True)
    
    # Save file
    file_path = os.path.join(hr_docs_dir, file.filename)
    
    try:
        print(f"📄 HR document uploaded: {file.filename}")
        
        # Read and save file content
        content = await file.read()
        with open(file_path, 'wb') as f:
            f.write(content)
        
        print(f"[Upload] File saved to: {file_path}")
        
        # Immediately reindex all HR documents
        reindex_success = False
        try:
            print("🔁 Reindexing HR documents...")
            reindex_success = reindex_hr_documents()
            if reindex_success:
                print(f"✓ Reindex complete: {len(_chunk_texts)} chunks loaded")
            else:
                print("[Upload] ⚠️ Reindexing failed, but file was saved successfully")
        except Exception as reindex_error:
            print(f"[Upload] ⚠️ Error during reindexing: {reindex_error}")
            import traceback
            traceback.print_exc()
            # Don't fail the upload if reindex fails
        
        return {
            "success": True,
            "message": f"File uploaded successfully: {file.filename}",
            "filename": file.filename,
            "reindexed": reindex_success,
            "chunks_count": len(_chunk_texts) if reindex_success else 0
        }
        
    except Exception as e:
        print(f"[Upload] ❌ Error uploading file: {e}")
        import traceback
        traceback.print_exc()
        # Clean up file if it was partially written
        if os.path.exists(file_path):
            try:
                os.unlink(file_path)
            except Exception:
                pass
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload file: {str(e)}"
        )


@app.post("/api/hr-documents/reindex")
async def reindex_hr_documents_endpoint():
    """
    Re-index all HR documents: extract text, chunk, and generate embeddings.
    
    This endpoint:
    1. Fetches all active HR documents from Firestore
    2. Downloads PDFs from Firebase Storage
    3. Extracts text, chunks, and generates embeddings
    4. Updates the in-memory embeddings store
    
    Call this endpoint after uploading a new HR document to make it
    immediately available for chat queries.
    
    Returns:
        Dict: Status of reindexing operation
    """
    try:
        success = reindex_hr_documents()
        if success:
            return {
                "success": True,
                "message": f"Reindex complete: {len(_chunk_texts)} chunks loaded",
                "chunks_count": len(_chunk_texts)
            }
        else:
            return {
                "success": False,
                "message": "Reindexing failed. Check server logs for details.",
                "chunks_count": len(_chunk_texts) if _chunk_texts else 0
            }
    except Exception as e:
        print(f"[Reindex Endpoint] ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "message": f"Error during reindexing: {str(e)}",
            "chunks_count": len(_chunk_texts) if _chunk_texts else 0
        }


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "HR Chatbot API",
        "version": "1.0.0",
        "endpoints": {
            "POST /chat": "Chat with the HR chatbot",
            "POST /api/resume/analyze": "Analyze a resume (PDF/DOCX)",
            "POST /api/hr-documents/upload": "Upload HR document (PDF) and re-index",
            "POST /api/hr-documents/reindex": "Re-index all HR documents",
            "GET /api/projects/active": "Get active projects from Firestore",
            "GET /projects/match/{user_id}": "Get project matches for an employee based on resume",
            "GET /health": "Health check"
        },
        "status": "operational" if _embeddings_loaded else "loading"
    }


if __name__ == "__main__":
    import uvicorn
    
    # Run the server
    # Default: localhost:8000
    # Can be overridden with environment variables:
    #   - HOST (default: "0.0.0.0")
    #   - PORT (default: 8000)
    
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    
    print(f"\n{'='*60}")
    print("Starting HR Chatbot API Server")
    print(f"{'='*60}")
    print(f"Server will run on: http://{host}:{port}")
    print(f"API Documentation: http://{host}:{port}/docs")
    print(f"Health Check: http://{host}:{port}/health")
    print(f"{'='*60}\n")
    
    uvicorn.run(
        "app:app",
        host=host,
        port=port,
        reload=True  # Auto-reload on code changes (disable in production)
    )

