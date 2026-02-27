"""
Backend Configuration Module

Centralizes environment variable loading, validation, and LLM provider initialization.
This module ensures:
- .env file is loaded exactly once at startup
- Required environment variables are validated
- LLM provider is explicitly selected via LLM_PROVIDER env var
- Clear error messages if configuration is missing
"""

import os
from typing import Optional, Literal
from dotenv import load_dotenv

# Load .env file once at module import
# This happens when the module is first imported
load_dotenv()

# Single source of truth for provider selection
LLM_PROVIDER: Literal["groq", "openai", "mock"] = os.getenv("LLM_PROVIDER", "mock").lower()

# Validate provider value
if LLM_PROVIDER not in ["groq", "openai", "mock"]:
    print(f"[Config] ⚠️  Invalid LLM_PROVIDER='{LLM_PROVIDER}', defaulting to 'mock'")
    LLM_PROVIDER = "mock"

# OpenAI client instance (initialized on first use)
_openai_client: Optional[object] = None

# Groq client instance (initialized on first use)
_groq_client: Optional[object] = None


def get_openai_api_key() -> str:
    """
    Get OpenAI API key from environment variables.
    
    Returns:
        str: OpenAI API key
        
    Raises:
        ValueError: If OPENAI_API_KEY is not set
    """
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key or not api_key.strip():
        raise ValueError(
            "OPENAI_API_KEY is not set. "
            "Please set it in your .env file or environment variables. "
            "The /chat endpoint requires this key to function."
        )
    return api_key.strip()


def get_openai_client():
    """
    Get or create a singleton OpenAI client instance.
    
    This function initializes the OpenAI client once and reuses it
    for all subsequent calls, improving performance and consistency.
    
    Returns:
        OpenAI client instance
        
    Raises:
        ValueError: If OPENAI_API_KEY is not set
        ImportError: If openai package is not installed
    """
    global _openai_client
    
    if _openai_client is not None:
        return _openai_client
    
    # Validate API key exists
    api_key = get_openai_api_key()
    
    # Import OpenAI (will raise ImportError if not installed)
    try:
        from openai import OpenAI
    except ImportError:
        raise ImportError(
            "openai package is not installed. "
            "Install it with: pip install openai"
        )
    
    # Initialize client
    _openai_client = OpenAI(api_key=api_key)
    return _openai_client


def validate_openai_config() -> bool:
    """
    Validate that OpenAI configuration is available.
    
    This function checks:
    1. OPENAI_API_KEY is set
    2. openai package is installed
    
    Returns:
        bool: True if configuration is valid
        
    Raises:
        ValueError: If OPENAI_API_KEY is not set
        ImportError: If openai package is not installed
    """
    # Check API key
    api_key = get_openai_api_key()
    
    # Check package installation
    try:
        import openai
    except ImportError:
        raise ImportError(
            "openai package is not installed. "
            "Install it with: pip install openai"
        )
    
    return True


def get_groq_api_key() -> str:
    """
    Get Groq API key from environment variables.
    
    Returns:
        str: Groq API key
        
    Raises:
        ValueError: If GROQ_API_KEY is not set
    """
    api_key = os.getenv('GROQ_API_KEY')
    if not api_key or not api_key.strip():
        raise ValueError(
            "GROQ_API_KEY is not set. "
            "Please set it in your .env file or environment variables."
        )
    return api_key.strip()


def get_groq_client():
    """
    Get or create a singleton Groq client instance.
    
    Returns:
        Groq client instance
        
    Raises:
        ValueError: If GROQ_API_KEY is not set
        ImportError: If groq package is not installed
    """
    global _groq_client
    
    if _groq_client is not None:
        return _groq_client
    
    # Validate API key exists
    api_key = get_groq_api_key()
    
    # Import Groq (will raise ImportError if not installed)
    try:
        from groq import Groq
    except ImportError:
        raise ImportError(
            "groq package is not installed. "
            "Install it with: pip install groq"
        )
    
    # Initialize client
    _groq_client = Groq(api_key=api_key)
    return _groq_client


def validate_llm_config():
    """
    Validate LLM configuration based on LLM_PROVIDER.
    
    This function:
    1. Checks if the selected provider's API key is set
    2. Checks if the required package is installed
    3. Raises RuntimeError if provider is set but API key is missing
    
    Raises:
        RuntimeError: If provider is set but API key is missing
        ImportError: If required package is not installed
    """
    if LLM_PROVIDER == "groq":
        try:
            api_key = get_groq_api_key()
            # Check package
            try:
                from groq import Groq
            except ImportError:
                raise RuntimeError(
                    "LLM_PROVIDER=groq but groq package is not installed. "
                    "Install it with: pip install groq"
                )
        except ValueError as e:
            raise RuntimeError(f"GROQ_API_KEY missing while LLM_PROVIDER=groq. {e}")
    
    elif LLM_PROVIDER == "openai":
        try:
            api_key = get_openai_api_key()
            # Check package
            try:
                from openai import OpenAI
            except ImportError:
                raise RuntimeError(
                    "LLM_PROVIDER=openai but openai package is not installed. "
                    "Install it with: pip install openai"
                )
        except ValueError as e:
            raise RuntimeError(f"OPENAI_API_KEY missing while LLM_PROVIDER=openai. {e}")
    
    # mock mode doesn't need validation


def log_llm_provider_status():
    """
    Log LLM provider status at startup.
    
    This function logs which provider is active and its configuration status.
    """
    if LLM_PROVIDER == "groq":
        try:
            api_key = get_groq_api_key()
            key_length = len(api_key) if api_key else 0
            try:
                from groq import Groq
                print(f"[Config] ✅ Groq LLM enabled (API key: {key_length} chars, package available)")
            except ImportError:
                print("[Config] ⚠️  Groq LLM enabled but groq package not installed")
        except ValueError:
            print("[Config] ❌ Groq LLM enabled but GROQ_API_KEY not set")
    
    elif LLM_PROVIDER == "openai":
        try:
            api_key = get_openai_api_key()
            key_length = len(api_key) if api_key else 0
            try:
                from openai import OpenAI
                print(f"[Config] ✅ OpenAI LLM enabled (API key: {key_length} chars, package available)")
            except ImportError:
                print("[Config] ⚠️  OpenAI LLM enabled but openai package not installed")
        except ValueError:
            print("[Config] ❌ OpenAI LLM enabled but OPENAI_API_KEY not set")
    
    else:
        print("[Config] ⚠️  Mock LLM mode enabled (no external API calls)")


def log_openai_status():
    """
    Log OpenAI configuration status (without printing the API key).
    
    DEPRECATED: Use log_llm_provider_status() instead.
    This function is kept for backward compatibility.
    """
    log_llm_provider_status()

