import firebase_admin
from firebase_admin import credentials, firestore
import os

if not firebase_admin._apps:
    cred = credentials.Certificate(
        os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
    )
    firebase_admin.initialize_app(cred)

db = firestore.client()