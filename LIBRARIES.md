# Major Libraries Used in Helix AI Project

## 📱 Frontend (React/JavaScript)

### Core Framework & Build Tools
- **React** (`^19.2.0`) - UI library
- **React DOM** (`^19.2.0`) - React rendering
- **Vite** (`^7.2.4`) - Build tool and dev server
- **React Router DOM** (`^7.11.0`) - Client-side routing

### UI & Styling
- **Tailwind CSS** (`^4.1.18`) - Utility-first CSS framework
- **PostCSS** (`^8.5.6`) - CSS processing
- **Autoprefixer** (`^10.4.23`) - CSS vendor prefixing
- **Lucide React** (`^0.562.0`) - Icon library

### Data Visualization
- **Recharts** (`^3.6.0`) - Chart library for React

### Firebase (Frontend SDK)
- **Firebase** (`^12.7.0`) - Firebase JavaScript SDK
  - Authentication
  - Firestore (NoSQL database)
  - Storage (file uploads)

### Development Tools
- **ESLint** (`^9.39.1`) - Code linting
- **TypeScript Types** - Type definitions for React

---

## 🐍 Backend (Python)

### Web Framework
- **FastAPI** - Modern, fast web framework for building APIs
- **Uvicorn** - ASGI server for running FastAPI
- **Python Multipart** - For handling file uploads (FormData)

### Data Validation & Models
- **Pydantic** - Data validation using Python type annotations
- **BaseModel** - For request/response models

### Firebase (Backend Admin SDK)
- **firebase-admin** - Firebase Admin SDK for Python
  - Firestore database operations
  - Storage management
  - Authentication management

### AI/ML & NLP
- **sentence-transformers** - For semantic search and embeddings
- **numpy** - Numerical computing
- **torch** (PyTorch) - Deep learning framework (required by sentence-transformers)
- **transformers** - Hugging Face transformers library

### LLM Integration
- **openai** - OpenAI API client for GPT models
- **python-dotenv** - Environment variable management

### Document Processing
- **PyMuPDF** (fitz) - PDF text extraction
- **pdfplumber** - Alternative PDF extraction library
- **python-docx** - DOCX file parsing

### Utilities
- **uuid** - Unique identifier generation
- **datetime** - Date and time handling
- **typing** - Type hints for Python

---

## 🔧 Development & Build Tools

### Frontend
- **@vitejs/plugin-react** - Vite plugin for React
- **ESLint plugins** - React hooks and refresh plugins
- **globals** - ESLint configuration

### Backend
- **python-dotenv** - Environment variable loading
- **tempfile** - Temporary file handling

---

## 📊 Summary by Category

### Frontend Core
1. React 19.2.0
2. Vite 7.2.4
3. React Router DOM 7.11.0

### Frontend UI
1. Tailwind CSS 4.1.18
2. Lucide React 0.562.0
3. Recharts 3.6.0

### Backend Framework
1. FastAPI
2. Uvicorn
3. Pydantic

### Database & Storage
1. Firebase Admin SDK (Python)
2. Firebase JavaScript SDK (Frontend)
3. Firestore
4. Firebase Storage

### AI/ML Stack
1. sentence-transformers
2. PyTorch (torch)
3. NumPy
4. OpenAI API
5. Hugging Face Transformers

### Document Processing
1. PyMuPDF
2. pdfplumber
3. python-docx

---

## 🚀 Key Technology Stack

**Frontend Stack:**
- React + Vite + Tailwind CSS
- Firebase SDK for real-time data
- Recharts for data visualization

**Backend Stack:**
- FastAPI for REST API
- Firebase Admin for database operations
- Sentence Transformers for semantic search
- OpenAI for LLM integration

**Architecture:**
- RAG (Retrieval-Augmented Generation) pipeline
- Semantic search for document retrieval
- LLM-based answer generation
- Real-time Firestore updates


