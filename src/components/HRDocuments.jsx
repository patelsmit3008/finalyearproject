import { useState } from 'react';
import { FileText, Upload, Trash2, Archive, Replace, X, CheckCircle2, File } from 'lucide-react';

/**
 * HRDocuments - Document management panel for HR users
 * Allows uploading, viewing, archiving, and managing HR documents
 */
const HRDocuments = () => {
  const [documents, setDocuments] = useState([
    {
      id: 1,
      name: 'Employee Handbook 2024.pdf',
      uploadDate: '2024-01-15',
      uploadedBy: 'Smit Patel',
      status: 'Active',
      fileType: 'pdf',
      size: '2.4 MB',
    },
    {
      id: 2,
      name: 'Leave Policy.docx',
      uploadDate: '2024-02-20',
      uploadedBy: 'Smit Patel',
      status: 'Active',
      fileType: 'docx',
      size: '156 KB',
    },
    {
      id: 3,
      name: 'Code of Conduct.txt',
      uploadDate: '2023-12-10',
      uploadedBy: 'Smit Patel',
      status: 'Archived',
      fileType: 'txt',
      size: '45 KB',
    },
    {
      id: 4,
      name: 'Benefits Guide 2024.pdf',
      uploadDate: '2024-03-05',
      uploadedBy: 'Smit Patel',
      status: 'Active',
      fileType: 'pdf',
      size: '1.8 MB',
    },
  ]);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState('');

  // Check if user is HR (for access control)
  const isHRUser = true; // In real app, this would come from auth context

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

  const handleUpload = () => {
    if (!selectedFile) return;

    const newDocument = {
      id: documents.length + 1,
      name: selectedFile.name,
      uploadDate: new Date().toISOString().split('T')[0],
      uploadedBy: 'Smit Patel',
      status: 'Active',
      fileType: selectedFile.type.includes('pdf') ? 'pdf' : selectedFile.type.includes('word') ? 'docx' : 'txt',
      size: (selectedFile.size / (1024 * 1024)).toFixed(2) + ' MB',
    };

    setDocuments([newDocument, ...documents]);
    setSelectedFile(null);
    setShowUploadModal(false);
    setUploadError('');
    
    // In real app, here you would:
    // 1. Upload file to server
    // 2. Extract text content
    // 3. Store metadata and embeddings for RAG
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this document?')) {
      setDocuments(documents.filter(doc => doc.id !== id));
    }
  };

  const handleArchive = (id) => {
    setDocuments(documents.map(doc => 
      doc.id === id 
        ? { ...doc, status: doc.status === 'Active' ? 'Archived' : 'Active' }
        : doc
    ));
  };

  const handleReplace = (id) => {
    // Trigger file input for replacement
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.docx,.txt';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        setDocuments(documents.map(doc => 
          doc.id === id 
            ? { 
                ...doc, 
                name: file.name,
                uploadDate: new Date().toISOString().split('T')[0],
                size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
              }
            : doc
        ));
      }
    };
    input.click();
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

  if (!isHRUser) {
    return null; // Don't render for non-HR users
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HR Documents</h1>
          <p className="text-sm text-gray-600 mt-1">Manage and organize HR documents</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Upload className="w-4 h-4" />
          <span>Upload Document</span>
        </button>
      </div>

      {/* Documents List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6">
          <div className="space-y-4">
            {documents.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No documents uploaded yet</p>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="mt-4 text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  Upload your first document
                </button>
              </div>
            ) : (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="shrink-0">
                      {getFileIcon(doc.fileType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">{doc.name}</h3>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                        <span>Uploaded: {doc.uploadDate}</span>
                        <span>•</span>
                        <span>By: {doc.uploadedBy}</span>
                        <span>•</span>
                        <span>{doc.size}</span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          doc.status === 'Active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {doc.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <button
                      onClick={() => handleReplace(doc.id)}
                      className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Replace document"
                    >
                      <Replace className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleArchive(doc.id)}
                      className="p-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                      title={doc.status === 'Active' ? 'Archive' : 'Unarchive'}
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete document"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Upload Document</h2>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setSelectedFile(null);
                  setUploadError('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select File (PDF, DOCX, TXT - Max 10MB)
              </label>
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
              {uploadError && (
                <p className="mt-2 text-sm text-red-600">{uploadError}</p>
              )}
              {selectedFile && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-green-800 font-medium">{selectedFile.name}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleUpload}
                disabled={!selectedFile}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Upload
              </button>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setSelectedFile(null);
                  setUploadError('');
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
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

