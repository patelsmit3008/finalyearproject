import { db, storage } from "../config";
import { 
  collection, 
  addDoc, 
  getDocs, 
  getDoc,
  doc, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp 
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

/**
 * Step 2B: Upload HR document (crash-safe, production-ready)
 * 
 * Safety measures:
 * - Comprehensive input validation before any async operations
 * - Deterministic storage path with category organization
 * - Firestore write only after successful storage upload
 * - Automatic cleanup of orphaned files if Firestore fails
 * - Never throws synchronously - returns null on failure
 * - Always returns success object or null - safe for UI
 */
export const uploadHrDocument = async ({
  file,
  title,
  category,
  uploadedByUid,
  uploadedByName,
}) => {
  // Validate inputs synchronously before any async operations
  try {
    // Validate file
    if (!file) {
      console.error('Step 2B: File is required');
      return null;
    }

    // Validate file type (allowed: PDF, DOCX, TXT)
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc (legacy)
      'text/plain',
    ];
    const allowedExtensions = ['.pdf', '.docx', '.doc', '.txt'];
    const fileExtension = file.name.toLowerCase().split('.').pop();
    const isValidType = allowedTypes.includes(file.type) || 
                        allowedExtensions.includes(`.${fileExtension}`);
    
    if (!isValidType) {
      console.error('Step 2B: Invalid file type. Allowed: PDF, DOCX, TXT');
      return null;
    }

    // Validate file size (max 10MB)
    const maxSizeBytes = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSizeBytes) {
      console.error(`Step 2B: File size exceeds 10MB limit (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      return null;
    }

    // Validate title
    if (!title || !title.trim()) {
      console.error('Step 2B: Title is required');
      return null;
    }

    // Validate category
    const validCategories = ['LEAVE_POLICY', 'HR_POLICY', 'BENEFITS', 'PAYROLL', 'OTHER'];
    if (!category || !validCategories.includes(category)) {
      console.error(`Step 2B: Invalid category. Must be one of: ${validCategories.join(', ')}`);
      return null;
    }

    // Validate uploadedByUid
    if (!uploadedByUid) {
      console.error('Step 2B: uploadedByUid is required');
      return null;
    }

    // Normalize inputs
    const normalizedTitle = title.trim();
    const normalizedCategory = category.toUpperCase();
    const normalizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_'); // Sanitize filename
    const timestamp = Date.now();
    
    // Determine file type from extension or MIME type
    let fileType = 'pdf'; // default
    if (fileExtension === 'docx' || fileExtension === 'doc') {
      fileType = 'docx';
    } else if (fileExtension === 'txt') {
      fileType = 'txt';
    } else if (file.type === 'application/pdf') {
      fileType = 'pdf';
    }

    // Calculate file size in human-readable format
    const sizeInKB = file.size / 1024;
    const sizeInMB = sizeInKB / 1024;
    const sizeDisplay = sizeInMB >= 1 
      ? `${sizeInMB.toFixed(2)} MB` 
      : `${sizeInKB.toFixed(2)} KB`;

    // 1️⃣ Upload file to Storage with deterministic path
    // Path format: hr-documents/{category}/{timestamp}_{originalFilename}
    const storageFileName = `${timestamp}_${normalizedFileName}`;
    const storagePath = `hr-documents/${normalizedCategory}/${storageFileName}`;
    const storageRef = ref(storage, storagePath);

    console.log('Step 2B: Uploading file to Storage...', { storagePath, size: sizeDisplay });
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);
    console.log('Step 2B: File uploaded successfully to Storage');

    // 2️⃣ Store metadata in Firestore (only after successful storage upload)
    let docRef;
    try {
      const uploadDate = new Date().toISOString();
      const firestoreData = {
        title: normalizedTitle,
        category: normalizedCategory,
        fileType: fileType,
        fileName: normalizedFileName,
        storagePath: storagePath,
        downloadURL: downloadURL,
        uploadedByUid: uploadedByUid,
        uploadedByName: uploadedByName || uploadedByUid, // Fallback to UID if name not provided
        uploadDate: uploadDate,
        size: sizeDisplay,
        isActive: true,
        status: 'Active', // For backward compatibility
        version: 1,
        createdAt: serverTimestamp(),
      };

      console.log('Step 2B: Writing metadata to Firestore...');
      docRef = await addDoc(collection(db, "hr_documents"), firestoreData);
      console.log('Step 2B: Metadata saved successfully to Firestore', { documentId: docRef.id });

      // Return success object
      return {
        id: docRef.id,
        title: normalizedTitle,
        category: normalizedCategory,
        fileType: fileType,
        fileName: normalizedFileName,
        downloadURL: downloadURL,
        storagePath: storagePath,
        size: sizeDisplay,
        uploadDate: uploadDate,
      };
    } catch (firestoreError) {
      // Firestore write failed - clean up orphaned file from Storage
      console.error('Step 2B: Firestore write failed, cleaning up orphaned file...', {
        error: firestoreError,
        message: firestoreError?.message,
        storagePath: storagePath,
      });

      try {
        await deleteObject(storageRef);
        console.log('Step 2B: Orphaned file deleted from Storage');
      } catch (cleanupError) {
        console.error('Step 2B: Failed to delete orphaned file from Storage', {
          error: cleanupError,
          storagePath: storagePath,
        });
        // Continue - we've logged the error, but don't throw
      }

      return null; // Return null instead of throwing
    }
  } catch (error) {
    // Catch any unexpected errors (shouldn't happen with proper validation)
    console.error('Step 2B: Unexpected error during upload:', {
      error,
      message: error?.message,
      stack: error?.stack,
    });
    return null; // Never throw - always return null on failure
  }
};

/**
 * Step 2A: Fetch active HR documents (crash-safe)
 * 
 * This function is designed to be crash-safe and future-proof:
 * - Always returns an array (empty on failure) - never throws
 * - Handles both isActive and status fields for backward compatibility
 * - Normalizes data with safe fallbacks for missing fields
 * - Safe to call in useEffect without blocking rendering
 * - Logs errors with "Step 2A" prefix for easy debugging
 */
export const getActiveHrDocuments = async () => {
  try {
    // Fetch documents with isActive === true
    const activeQuery = query(
      collection(db, "hr_documents"),
      where("isActive", "==", true),
      orderBy("createdAt", "desc")
    );

    // Fetch documents with status === "Active" (legacy support)
    const statusQuery = query(
      collection(db, "hr_documents"),
      where("status", "==", "Active"),
      orderBy("createdAt", "desc")
    );

    // Execute both queries in parallel
    const [activeSnapshot, statusSnapshot] = await Promise.all([
      getDocs(activeQuery).catch((err) => {
        console.warn("Step 2A: Error fetching isActive documents:", err);
        return { forEach: () => {} }; // Return empty snapshot-like object
      }),
      getDocs(statusQuery).catch((err) => {
        console.warn("Step 2A: Error fetching status documents:", err);
        return { forEach: () => {} }; // Return empty snapshot-like object
      }),
    ]);

    // Collect unique documents (by ID) to avoid duplicates
    const documentsMap = new Map();

    // Helper function to normalize document data
    const normalizeDocument = (docSnapshot, fromStatusQuery = false) => {
      try {
        const data = docSnapshot.data();
        const docId = docSnapshot.id;

        // Determine if document is active
        // For isActive query: isActive must be explicitly true
        // For status query: status must be "Active" AND isActive must not be explicitly false
        let isActive = false;
        if (!fromStatusQuery) {
          // From isActive query - must be explicitly true
          isActive = data.isActive === true;
        } else {
          // From status query - legacy documents
          isActive = data.status === 'Active' && data.isActive !== false;
        }
        
        // Only include if truly active
        if (!isActive) {
          return null;
        }

        return {
          id: docId,
          title: data.title || data.name || 'Untitled Document',
          category: data.category || 'OTHER',
          fileType: data.fileType || (data.storagePath?.split('.').pop()?.toLowerCase() || 'pdf'),
          uploadedBy: data.uploadedByName || data.uploadedBy || 'Unknown',
          uploadDate: data.createdAt?.toDate?.()?.toISOString()?.split('T')[0] || new Date().toISOString().split('T')[0],
          storagePath: data.storagePath || '',
          isActive: true, // Normalized to true since we filtered
        };
      } catch (docError) {
        console.warn(`Step 2A: Error normalizing document ${docSnapshot.id}:`, docError);
        return null;
      }
    };

    // Process isActive documents
    if (activeSnapshot && typeof activeSnapshot.forEach === 'function') {
      activeSnapshot.forEach((docSnapshot) => {
        const normalized = normalizeDocument(docSnapshot);
        if (normalized) {
          documentsMap.set(normalized.id, normalized);
        }
      });
    }

    // Process status documents (legacy) - only add if not already in map
    if (statusSnapshot && typeof statusSnapshot.forEach === 'function') {
      statusSnapshot.forEach((docSnapshot) => {
        const docId = docSnapshot.id;
        // Only add if not already processed (isActive query takes precedence)
        if (!documentsMap.has(docId)) {
          const normalized = normalizeDocument(docSnapshot, true);
          if (normalized) {
            documentsMap.set(normalized.id, normalized);
          }
        }
      });
    }

    // Convert map to array
    const documents = Array.from(documentsMap.values());

    return documents;
  } catch (error) {
    // Never throw - always return empty array on failure
    console.error("Step 2A: Error fetching active HR documents:", {
      error,
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    });
    return [];
  }
};

/**
 * Get all HR documents
 */
export const getHrDocuments = async () => {
  try {
    const q = query(
      collection(db, "hr_documents"),
      orderBy("createdAt", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    const documents = [];
    
    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      
      // Handle both new structure (title, category) and legacy structure (name, fileType, size)
      const name = data.title || data.name || 'Untitled Document';
      const fileType = data.fileType || (data.storagePath?.split('.').pop()?.toLowerCase() || 'pdf');
      const size = data.size || 'Unknown';
      const status = data.isActive === false ? 'Archived' : (data.status || 'Active');
      
      documents.push({
        id: docSnapshot.id,
        name,
        title: data.title,
        category: data.category,
        fileType,
        size,
        uploadDate: data.createdAt?.toDate?.()?.toISOString()?.split('T')[0] || new Date().toISOString().split('T')[0],
        uploadedBy: data.uploadedByName || 'Unknown',
        status,
        downloadURL: data.downloadURL,
        storagePath: data.storagePath,
      });
    });
    
    return documents;
  } catch (error) {
    console.error('Error fetching HR documents:', error);
    throw error;
  }
};

/**
 * Delete HR document (removes from Storage and Firestore)
 */
export const deleteHrDocument = async (documentId, storagePath) => {
  try {
    // Delete from Storage
    if (storagePath) {
      const storageRef = ref(storage, storagePath);
      try {
        await deleteObject(storageRef);
      } catch (storageError) {
        console.warn('Error deleting file from Storage:', storageError);
        // Continue with Firestore deletion even if Storage deletion fails
      }
    }

    // Delete from Firestore
    await deleteDoc(doc(db, "hr_documents", documentId));
  } catch (error) {
    console.error('Error deleting HR document:', error);
    throw error;
  }
};

/**
 * Archive/Unarchive HR document
 */
export const archiveHrDocument = async (documentId, isArchived) => {
  try {
    const docRef = doc(db, "hr_documents", documentId);
    await updateDoc(docRef, {
      isActive: !isArchived,
      status: isArchived ? 'Archived' : 'Active', // Keep for backward compatibility
    });
  } catch (error) {
    console.error('Error archiving HR document:', error);
    throw error;
  }
};

/**
 * Step 2C: Replace & Version HR document (crash-safe, versioning support)
 * 
 * Version safety measures:
 * - Validates inputs before any async operations
 * - Reads current document to get version number
 * - Archives old version metadata before replacing
 * - Uploads new file to versioned path
 * - Updates main document only after successful upload
 * - Deletes old file only after successful Firestore update
 * - Never throws synchronously - returns null on failure
 */
export const replaceHrDocument = async ({
  documentId,
  oldStoragePath,
  file,
  uploadedByUid,
  uploadedByName,
}) => {
  try {
    // Validate inputs synchronously before any async operations
    if (!documentId) {
      console.error('Step 2C: documentId is required');
      return null;
    }

    if (!oldStoragePath) {
      console.error('Step 2C: oldStoragePath is required');
      return null;
    }

    if (!file) {
      console.error('Step 2C: New file is required');
      return null;
    }

    // Validate file type (same as upload)
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ];
    const allowedExtensions = ['.pdf', '.docx', '.doc', '.txt'];
    const fileExtension = file.name.toLowerCase().split('.').pop();
    const isValidType = allowedTypes.includes(file.type) || 
                        allowedExtensions.includes(`.${fileExtension}`);
    
    if (!isValidType) {
      console.error('Step 2C: Invalid file type. Allowed: PDF, DOCX, TXT');
      return null;
    }

    // Validate file size (max 10MB)
    const maxSizeBytes = 10 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      console.error(`Step 2C: File size exceeds 10MB limit (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      return null;
    }

    if (!uploadedByUid) {
      console.error('Step 2C: uploadedByUid is required');
      return null;
    }

    // 1️⃣ Read current document to get version and metadata
    console.log('Step 2C: Reading current document...', { documentId });
    const docRef = doc(db, "hr_documents", documentId);
    let currentDoc;
    try {
      currentDoc = await getDoc(docRef);
      if (!currentDoc.exists()) {
        console.error('Step 2C: Document not found', { documentId });
        return null;
      }
    } catch (readError) {
      console.error('Step 2C: Error reading current document:', {
        error: readError,
        documentId,
      });
      return null;
    }

    const currentData = currentDoc.data();
    const currentVersion = currentData.version || 1; // Default to 1 if not set
    const nextVersion = currentVersion + 1;

    // 2️⃣ Archive old version metadata to subcollection
    // Store old version info before replacing
    const oldVersionData = {
      version: currentVersion,
      storagePath: oldStoragePath,
      downloadURL: currentData.downloadURL || '',
      fileName: currentData.fileName || currentData.name || 'unknown',
      fileType: currentData.fileType || 'pdf',
      size: currentData.size || 'Unknown',
      replacedAt: serverTimestamp(),
      replacedByUid: uploadedByUid,
      replacedByName: uploadedByName || uploadedByUid,
    };

    try {
      console.log('Step 2C: Archiving old version metadata...', { version: currentVersion });
      const versionsCollectionRef = collection(db, "hr_documents", documentId, "versions");
      await addDoc(versionsCollectionRef, oldVersionData);
      console.log('Step 2C: Old version archived successfully');
    } catch (archiveError) {
      // Log but don't fail - versioning is nice-to-have, replacement should still work
      console.warn('Step 2C: Failed to archive old version (continuing anyway):', {
        error: archiveError,
        documentId,
      });
    }

    // 3️⃣ Upload new file to versioned storage path
    // Path format: hr-documents/versions/{documentId}/v{nextVersion}_{filename}
    const normalizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const versionedFileName = `v${nextVersion}_${normalizedFileName}`;
    const newStoragePath = `hr-documents/versions/${documentId}/${versionedFileName}`;
    const newStorageRef = ref(storage, newStoragePath);

    // Determine file type
    let fileType = 'pdf';
    if (fileExtension === 'docx' || fileExtension === 'doc') {
      fileType = 'docx';
    } else if (fileExtension === 'txt') {
      fileType = 'txt';
    } else if (file.type === 'application/pdf') {
      fileType = 'pdf';
    }

    // Calculate file size
    const sizeInKB = file.size / 1024;
    const sizeInMB = sizeInKB / 1024;
    const sizeDisplay = sizeInMB >= 1 
      ? `${sizeInMB.toFixed(2)} MB` 
      : `${sizeInKB.toFixed(2)} KB`;

    console.log('Step 2C: Uploading new file to Storage...', {
      storagePath: newStoragePath,
      version: nextVersion,
      size: sizeDisplay,
    });

    let downloadURL;
    try {
      await uploadBytes(newStorageRef, file);
      downloadURL = await getDownloadURL(newStorageRef);
      console.log('Step 2C: New file uploaded successfully');
    } catch (uploadError) {
      console.error('Step 2C: Failed to upload new file:', {
        error: uploadError,
        storagePath: newStoragePath,
      });
      return null;
    }

    // 4️⃣ Update Firestore document with new version
    const replacedAt = new Date().toISOString();
    const updateData = {
      storagePath: newStoragePath,
      downloadURL: downloadURL,
      version: nextVersion,
      fileName: normalizedFileName,
      fileType: fileType,
      size: sizeDisplay,
      replacedAt: replacedAt,
      replacedByUid: uploadedByUid,
      replacedByName: uploadedByName || uploadedByUid,
      updatedAt: serverTimestamp(),
    };

    try {
      console.log('Step 2C: Updating Firestore document...', { version: nextVersion });
      await updateDoc(docRef, updateData);
      console.log('Step 2C: Firestore document updated successfully');
    } catch (updateError) {
      // Firestore update failed - clean up uploaded file
      console.error('Step 2C: Firestore update failed, cleaning up uploaded file...', {
        error: updateError,
        storagePath: newStoragePath,
      });

      try {
        await deleteObject(newStorageRef);
        console.log('Step 2C: Uploaded file deleted from Storage');
      } catch (cleanupError) {
        console.error('Step 2C: Failed to delete uploaded file from Storage', {
          error: cleanupError,
          storagePath: newStoragePath,
        });
      }

      return null;
    }

    // 5️⃣ Delete old file from Storage (only after successful Firestore update)
    if (oldStoragePath) {
      try {
        console.log('Step 2C: Deleting old file from Storage...', { oldStoragePath });
        const oldStorageRef = ref(storage, oldStoragePath);
        await deleteObject(oldStorageRef);
        console.log('Step 2C: Old file deleted successfully');
      } catch (deleteError) {
        // Log but don't fail - old file deletion is cleanup, not critical
        console.warn('Step 2C: Failed to delete old file (non-critical):', {
          error: deleteError,
          oldStoragePath,
        });
      }
    }

    // Return success object
    return {
      id: documentId,
      title: currentData.title || 'Untitled Document',
      category: currentData.category || 'OTHER',
      fileName: normalizedFileName,
      fileType: fileType,
      size: sizeDisplay,
      downloadURL: downloadURL,
      storagePath: newStoragePath,
      version: nextVersion,
      replacedAt: replacedAt,
    };
  } catch (error) {
    // Catch any unexpected errors
    console.error('Step 2C: Unexpected error during document replacement:', {
      error,
      message: error?.message,
      stack: error?.stack,
      documentId,
    });
    return null; // Never throw - always return null on failure
  }
};

/**
 * Step 2D: Get download URL for HR document (crash-safe)
 * 
 * Safety measures:
 * - Validates storagePath before any async operations
 * - Never throws synchronously - returns null on failure
 * - Safe to call from UI without try/catch wrapper
 */
export const getHrDocumentDownloadUrl = async (storagePath) => {
  try {
    // Validate input synchronously
    if (!storagePath || typeof storagePath !== 'string' || !storagePath.trim()) {
      console.error('Step 2D: Invalid storagePath provided', { storagePath });
      return null;
    }

    // Get download URL from Firebase Storage
    const storageRef = ref(storage, storagePath);
  const downloadURL = await getDownloadURL(storageRef);

    return downloadURL;
  } catch (error) {
    console.error('Step 2D: Error getting download URL:', {
      error,
      message: error?.message,
      code: error?.code,
      storagePath,
    });
    return null; // Never throw - always return null on failure
  }
};

/**
 * Step 2D: Download HR document (crash-safe, forces direct download)
 * 
 * Safety measures:
 * - Validates inputs before any async operations
 * - Gets download URL from Firebase Storage safely
 * - Fetches file as Blob to bypass Firebase Storage inline disposition
 * - Creates Blob URL to force download (not preview)
 * - Never uses window.open (which would open preview)
 * - Preserves original filename
 * - Cleans up Blob URL and DOM elements after download
 * 
 * Why fetch as Blob?
 * Firebase Storage serves PDFs with inline Content-Disposition, causing browsers
 * to open them in preview mode. By fetching as Blob and using a Blob URL, we
 * force the browser to download the file instead of previewing it.
 */
export const downloadHrDocument = async (storagePath, fileName) => {
  try {
    // Validate inputs synchronously
    if (!storagePath || typeof storagePath !== 'string' || !storagePath.trim()) {
      console.error('Step 2D: Invalid storagePath provided', { storagePath });
      return null;
    }

    // Get download URL from Firebase Storage (this function handles its own errors)
    const downloadURL = await getHrDocumentDownloadUrl(storagePath);
    if (!downloadURL) {
      console.error('Step 2D: Failed to get download URL', { storagePath });
      return null;
    }

    // Fetch file as Blob to force download (bypasses Firebase Storage inline disposition)
    try {
      const response = await fetch(downloadURL);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      
      // Create Blob URL (this forces download instead of preview)
      const blobURL = URL.createObjectURL(blob);
      
      // Create temporary anchor element with download attribute
      const link = document.createElement('a');
      link.href = blobURL;
      link.download = fileName || 'document'; // Set download attribute with filename
      link.style.display = 'none'; // Hide the link
      
      // Append to body, click to trigger download, then remove
      document.body.appendChild(link);
      link.click();
      
      // Cleanup: remove link and revoke Blob URL after a short delay
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(blobURL); // Free up memory
      }, 100);
      
      return true; // Success
    } catch (downloadError) {
      console.error('Step 2D: Error during download:', {
        error: downloadError,
        message: downloadError?.message,
    downloadURL,
        fileName,
        storagePath,
      });
      return null;
    }
  } catch (error) {
    // Catch any unexpected errors
    console.error('Step 2D: Unexpected error during download:', {
      error,
      message: error?.message,
      stack: error?.stack,
      storagePath,
      fileName,
    });
    return null; // Never throw - always return null on failure
  }
};