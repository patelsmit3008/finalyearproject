import { useState, useEffect } from 'react';
import { FileText, Upload, Trash2, Archive, Replace, X, CheckCircle2, File, Eye, Download } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { 
  uploadHrDocument, 
  getHrDocuments,
  getActiveHrDocuments,
  deleteHrDocument, 
  archiveHrDocument,
  replaceHrDocument,
  getHrDocumentDownloadUrl,
  downloadHrDocument
} from '../firebase/services/hrDocumentsService';

/**
 * Step 2E: HRDocuments - Role-based document management
 * 
 * Access control:
 * - HR users: Full access (upload, replace, archive, delete, preview, download)
 * - Non-HR users: Read-only access (preview & download active documents only)
 * 
 * Safety:
 * - Safely defaults to non-HR if role is missing
 * - Never blocks rendering due to missing role
 * - Uses derived boolean `isHRUser` for consistent checks
 */
const HRDocuments = () => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [metadata, setMetadata] = useState({
    title: '',
    category: '',
  });

  // Step 2E: Role-based access control
  // Safely defaults to non-HR if role is missing (never crashes UI)
  const isHRUser = user?.role === 'HR';

  // Step 2E: Fetch documents on mount for all authenticated users
  // HR users see all documents, non-HR users see only active documents
  useEffect(() => {
    if (user) {
      loadDocuments();
    }
  }, [user, isHRUser]);

  /**
   * Step 2E: Load documents based on user role
   * - HR users: Fetch all documents (including archived)
   * - Non-HR users: Fetch only active documents (Step 2A logic)
   */
  const loadDocuments = async () => {
    try {
      setIsLoading(true);
      // Use role-appropriate fetch function
      const docs = isHRUser 
        ? await getHrDocuments()  // HR: all documents
        : await getActiveHrDocuments(); // Non-HR: active documents only
      setDocuments(docs);
    } catch (error) {
      console.error('Step 2E: Error loading documents:', error);
      setUploadError('Failed to load documents. Please refresh the page.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Only PDF, DOCX, and TXT files are allowed');
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setUploadError('File size must be less than 10MB');
      return;
    }

    setSelectedFile(file);
    setUploadError('');
  };

  const handleMetadataChange = (e) => {
    const { name, value } = e.target;
    setMetadata(prev => ({
      ...prev,
      [name]: value,
    }));
    // Clear error when user starts typing
    if (uploadError) setUploadError('');
  };

  const handleUpload = async () => {
    if (!selectedFile || !user) return;

    // Validate metadata
    if (!metadata.title || !metadata.title.trim()) {
      setUploadError('Title is required');
      return;
    }
    if (!metadata.category) {
      setUploadError('Category is required');
      return;
    }

    try {
      setIsUploading(true);
      setUploadError('');

      await uploadHrDocument({
        file: selectedFile,
        title: metadata.title,
        category: metadata.category,
        uploadedByUid: user.uid,
        uploadedByName: user.name,
      });

      // Refresh documents list
      await loadDocuments();
      
      // Show success message
      setUploadSuccess(true);
      setUploadError('');
      
      // Reset form and close modal after short delay
      setTimeout(() => {
        setSelectedFile(null);
        setMetadata({ title: '', category: '' });
        setShowUploadModal(false);
        setUploadSuccess(false);
      }, 1500);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(error.message || 'Failed to upload document. Please try again.');
      setUploadSuccess(false);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (document) => {
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      await deleteHrDocument(document.id, document.storagePath);
      await loadDocuments();
    } catch (error) {
      console.error('Delete error:', error);
      setUploadError('Failed to delete document. Please try again.');
    }
  };

  const handleArchive = async (document) => {
    try {
      const isArchived = document.status === 'Active' || document.isActive !== false;
      await archiveHrDocument(document.id, isArchived);
      await loadDocuments();
    } catch (error) {
      console.error('Archive error:', error);
      setUploadError('Failed to archive document. Please try again.');
    }
  };

  const handleReplace = async (doc) => {
    // Trigger file input for replacement
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.docx,.txt';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file || !user) return;

      // Validate file type
      const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
      if (!allowedTypes.includes(file.type)) {
        setUploadError('Only PDF, DOCX, and TXT files are allowed');
        return;
      }

      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        setUploadError('File size must be less than 10MB');
        return;
      }

      try {
        setIsUploading(true);
        setUploadError('');

        const result = await replaceHrDocument({
          documentId: doc.id,
          oldStoragePath: doc.storagePath,
          file,
          uploadedByUid: user.uid,
          uploadedByName: user.name,
        });

        // Check if replace succeeded (returns null on failure)
        if (result === null) {
          setUploadError('Failed to replace document. Please try again.');
          return;
        }

        await loadDocuments();
        setUploadError('');
      } catch (error) {
        console.error('Replace error:', error);
        setUploadError(error.message || 'Failed to replace document. Please try again.');
      } finally {
        setIsUploading(false);
      }
    };
    input.click();
  };

  /**
   * Step 2D: Preview document (crash-safe)
   * Opens document in new browser tab
   */
  const handlePreview = async (doc) => {
    if (!doc.storagePath) {
      console.error('Step 2D: Cannot preview - storagePath is missing', { docId: doc.id });
      setUploadError('Cannot preview document: storage path is missing.');
      return;
    }

    try {
      const downloadURL = await getHrDocumentDownloadUrl(doc.storagePath);
      if (!downloadURL) {
        setUploadError('Failed to get preview URL. Please try again.');
        return;
      }

      // Open in new tab (browser will handle PDF preview, DOCX/TXT will download)
      window.open(downloadURL, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Step 2D: Preview error:', error);
      setUploadError('Failed to preview document. Please try again.');
    }
  };

  /**
   * Step 2D: Download document (crash-safe)
   * Triggers browser download with original filename
   */
  const handleDownload = async (doc) => {
    if (!doc.storagePath) {
      console.error('Step 2D: Cannot download - storagePath is missing', { docId: doc.id });
      setUploadError('Cannot download document: storage path is missing.');
      return;
    }

    try {
      const fileName = doc.fileName || doc.name || `${doc.title || 'document'}.${doc.fileType || 'pdf'}`;
      const result = await downloadHrDocument(doc.storagePath, fileName);
      
      if (!result) {
        setUploadError('Failed to download document. Please try again.');
      }
    } catch (error) {
      console.error('Step 2D: Download error:', error);
      setUploadError('Failed to download document. Please try again.');
    }
  };

  const getFileIcon = (fileType) => {
    switch (fileType) {
      case 'pdf':
        return <FileText className="w-5 h-5 text-red-600" />;
      case 'docx':
        return <FileText className="w-5 h-5 text-blue-600" />;
      case 'txt':
        return <File className="w-5 h-5 text-gray-600" />;
      default:
        return <File className="w-5 h-5 text-gray-600" />;
    }
  };

  // Step 2E: Render for all authenticated users (HR and non-HR)
  // Access control is handled via conditional UI elements, not early returns
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 pb-16">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-black">HR Documents</h1>
          <p className="text-sm text-gray-600 font-medium">
            {isHRUser 
              ? 'Manage and organize HR documents' 
              : 'View and download HR documents'}
          </p>
        </div>
        {/* Step 2E: Upload button - only visible to HR users */}
        {isHRUser && (
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a5f] text-white rounded-xl hover:bg-[#1e3a5f]/90 transition-all duration-200 font-semibold shadow-sm hover:shadow-md"
          >
            <Upload className="w-5 h-5" />
            <span>Upload Document</span>
          </button>
        )}
      </div>

      {/* Documents List */}
      <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200">
        <div className="p-8">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]"></div>
              <p className="mt-4 text-gray-600 font-medium">Loading documents...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {documents.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">
                  {isHRUser 
                    ? 'No documents uploaded yet' 
                    : 'No active documents available'}
                </p>
                {/* Step 2E: Upload button in empty state - only for HR users */}
                {isHRUser && (
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="mt-4 text-[#1e3a5f] hover:text-black font-bold px-4 py-2 hover:bg-[#1e3a5f]/10 rounded-lg transition-colors"
                  >
                    Upload your first document
                  </button>
                )}
              </div>
            ) : (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-5 border-2 border-gray-200 rounded-xl hover:bg-gray-50 hover:border-[#1e3a5f] hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="shrink-0">
                      {getFileIcon(doc.fileType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">{doc.title || doc.name}</h3>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                        {doc.category && (
                          <>
                            <span className="px-3 py-1 bg-[#1e3a5f]/10 text-[#1e3a5f] rounded-lg text-xs font-bold border border-[#1e3a5f]/20">
                              {doc.category.replace(/_/g, ' ')}
                            </span>
                            <span>•</span>
                          </>
                        )}
                        <span>Uploaded: {doc.uploadDate}</span>
                        <span>•</span>
                        <span>By: {doc.uploadedBy}</span>
                        {doc.size && (
                          <>
                            <span>•</span>
                            <span>{doc.size}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <span
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 ${
                          (doc.status === 'Active' || doc.isActive !== false)
                            ? 'bg-green-100 text-green-800 border-green-200'
                            : 'bg-gray-100 text-gray-800 border-gray-200'
                        }`}
                      >
                        {doc.status || (doc.isActive !== false ? 'Active' : 'Archived')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    {/* Step 2D: Preview button - visible to all users */}
                    <button
                      onClick={() => handlePreview(doc)}
                      disabled={!doc.storagePath}
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-gray-600 disabled:hover:bg-transparent"
                      title={doc.storagePath ? "Preview document" : "Preview unavailable - storage path missing"}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {/* Step 2D: Download button - visible to all users */}
                    <button
                      onClick={() => handleDownload(doc)}
                      disabled={!doc.storagePath}
                      className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-gray-600 disabled:hover:bg-transparent"
                      title={doc.storagePath ? "Download document" : "Download unavailable - storage path missing"}
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    {/* Step 2E: Replace button - only visible to HR users */}
                    {isHRUser && (
                      <button
                        onClick={() => handleReplace(doc)}
                        className="p-2.5 text-gray-600 hover:text-[#1e3a5f] hover:bg-[#1e3a5f]/10 rounded-xl transition-all duration-200"
                        title="Replace document"
                      >
                        <Replace className="w-4 h-4" />
                      </button>
                    )}
                    {/* Step 2E: Archive button - only visible to HR users */}
                    {isHRUser && (
                      <button
                        onClick={() => handleArchive(doc)}
                        className="p-2.5 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-all duration-200"
                        title={(doc.status === 'Active' || doc.isActive !== false) ? 'Archive' : 'Unarchive'}
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    )}
                    {/* Step 2E: Delete button - only visible to HR users */}
                    {isHRUser && (
                      <button
                        onClick={() => handleDelete(doc)}
                        className="p-2.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200"
                        title="Delete document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-xl border-2 border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-black">Upload Document</h2>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setSelectedFile(null);
                  setMetadata({ title: '', category: '' });
                  setUploadError('');
                }}
                className="text-gray-400 hover:text-black transition-colors p-1 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metadata Form */}
            <div className="space-y-4 mb-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  id="title"
                  name="title"
                  type="text"
                  value={metadata.title}
                  onChange={handleMetadataChange}
                  required
                  placeholder="e.g., Employee Handbook 2024"
                  className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] text-sm"
                  disabled={isUploading}
                />
              </div>

              <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  id="category"
                  name="category"
                  value={metadata.category}
                  onChange={handleMetadataChange}
                  required
                  className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] text-sm appearance-none bg-white"
                  disabled={isUploading}
                >
                  <option value="">Select a category</option>
                  <option value="LEAVE_POLICY">Leave Policy</option>
                  <option value="HR_POLICY">HR Policy</option>
                  <option value="BENEFITS">Benefits</option>
                  <option value="PAYROLL">Payroll</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>

            {/* File Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select File (PDF, DOCX, TXT - Max 10MB)
              </label>
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={handleFileSelect}
                disabled={isUploading}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 disabled:opacity-50"
              />
              {uploadError && (
                <p className="mt-2 text-sm text-red-600">{uploadError}</p>
              )}
              {uploadSuccess && (
                <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-green-800 font-medium">Document uploaded successfully!</span>
                </div>
              )}
              {selectedFile && !uploadSuccess && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <span className="text-sm text-blue-800 font-medium">{selectedFile.name}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleUpload}
                disabled={!selectedFile || !metadata.title.trim() || !metadata.category || isUploading}
                className="flex-1 px-5 py-2.5 bg-[#1e3a5f] text-white rounded-xl hover:bg-[#1e3a5f]/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 font-semibold shadow-sm hover:shadow-md"
              >
                {isUploading ? 'Uploading...' : 'Upload'}
              </button>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setSelectedFile(null);
                  setMetadata({ title: '', category: '' });
                  setUploadError('');
                  setUploadSuccess(false);
                }}
                disabled={isUploading}
                className="px-5 py-2.5 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 hover:border-[#1e3a5f] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HRDocuments;

