"""
Firebase Admin initialization for Helix AI backend.

This module provides centralized Firebase Admin initialization using a service account file.
It ensures Firebase is initialized only once and uses explicit credentials instead of ADC.

Usage:
    from firebase_init import init_firebase
    
    db = init_firebase()
"""

import firebase_admin
from firebase_admin import credentials, firestore
import os

_initialized = False


def init_firebase():
    """
    Initialize Firebase Admin SDK using service account file.
    
    This function:
    - Checks if Firebase is already initialized (safe to call multiple times)
    - Uses FIREBASE_SERVICE_ACCOUNT_PATH environment variable
    - Falls back to default path if env var not set
    - Raises RuntimeError if path is not set and default doesn't exist
    - Returns a Firestore client
    
    Returns:
        firestore.Client: Initialized Firestore client
        
    Raises:
        RuntimeError: If service account file cannot be found
        Exception: If Firebase initialization fails
    """
    global _initialized
    
    # Check if Firebase is already initialized
    if not firebase_admin._apps:
        # Try environment variable first
        service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
        
        # Fallback to default path if env var not set
        if not service_account_path:
            # Get the directory of this file (firebase_init.py is in backend/)
            current_dir = os.path.dirname(os.path.abspath(__file__))
            default_path = os.path.join(current_dir, "keys", "firebase_service_account.json")
            # Ensure absolute path
            default_path = os.path.abspath(default_path)
            
            if os.path.exists(default_path):
                service_account_path = default_path
                print(f"[Firebase Init] Using default service account path: {service_account_path}")
            else:
                # Try alternative: if running from project root, try backend/keys/...
                alt_path = os.path.join(os.getcwd(), "backend", "keys", "firebase_service_account.json")
                alt_path = os.path.abspath(alt_path)
                if os.path.exists(alt_path):
                    service_account_path = alt_path
                    print(f"[Firebase Init] Using alternative service account path: {service_account_path}")
                else:
                    raise RuntimeError(
                        "FIREBASE_SERVICE_ACCOUNT_PATH environment variable is not set and "
                        f"default paths not found:\n"
                        f"  - {default_path}\n"
                        f"  - {alt_path}\n"
                        "Please set FIREBASE_SERVICE_ACCOUNT_PATH or place the service account file at one of the above locations."
                    )
        
        # Ensure absolute path for env var path too
        if service_account_path and not os.path.isabs(service_account_path):
            service_account_path = os.path.abspath(service_account_path)
        
        if not os.path.exists(service_account_path):
            raise RuntimeError(
                f"Firebase service account file not found at: {service_account_path} (absolute: {os.path.abspath(service_account_path) if service_account_path else 'N/A'}). "
                "Please check that the path is correct."
            )
        
        # Initialize Firebase with explicit service account credentials
        try:
            cred = credentials.Certificate(service_account_path)
            firebase_admin.initialize_app(cred)
            _initialized = True
            print(f"✅ Firebase initialized with service account: {service_account_path}")
        except Exception as e:
            raise RuntimeError(
                f"Failed to initialize Firebase with service account at {service_account_path}: {str(e)}"
            )
    
    return firestore.client()

