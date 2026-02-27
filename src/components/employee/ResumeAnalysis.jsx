import { useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, TrendingUp, Target, BookOpen, Loader2, Briefcase, ExternalLink, X, Info, Sparkles, Rocket, CheckCircle, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { db, storage } from '../../firebase/config';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function ResumeAnalysis() {
  const { user } = useAuth();
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [firestoreData, setFirestoreData] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReAnalyzing, setIsReAnalyzing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showReAnalyzeUI, setShowReAnalyzeUI] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [recommendedProjects, setRecommendedProjects] = useState([]);
  const [loadingRecommendedProjects, setLoadingRecommendedProjects] = useState(false);
  const [expressingInterestFor, setExpressingInterestFor] = useState(null);
  const [submittedProjects, setSubmittedProjects] = useState([]);

  // Fetch resume analysis data from Firestore
  const fetchResumeAnalysis = async () => {
    if (!user?.uid) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const docRef = doc(db, 'resume_analysis', user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setFirestoreData({
          skills: data.skills || [],
          domains: data.domains || [],
          experience_years: data.experience_years || 0,
          text_length: data.text_length || 0,
          analyzedAt: data.analyzedAt?.toDate?.() || null,
        });
      } else {
        setFirestoreData(null);
      }
    } catch (error) {
      console.error('[Resume Analysis] Error fetching from Firestore:', error);
      setApiError('Failed to load resume analysis data.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch data on mount and when user changes
  useEffect(() => {
    fetchResumeAnalysis();
  }, [user?.uid]);

  // Fetch recommended projects when user is available (and refetch when firestoreData updates)
  useEffect(() => {
    if (!user?.uid) return;

    const fetchRecommendedProjects = async () => {
      setLoadingRecommendedProjects(true);
      try {
        const res = await fetch(`http://localhost:8000/api/recommended-projects/${user.uid}`);
        if (!res.ok) {
          setRecommendedProjects([]);
          return;
        }
        const data = await res.json();
        setRecommendedProjects(data.projects || []);
      } catch (err) {
        console.error('[Resume Analysis] Failed to fetch recommended projects:', err);
        setRecommendedProjects([]);
      } finally {
        setLoadingRecommendedProjects(false);
      }
    };

    fetchRecommendedProjects();
  }, [user?.uid, firestoreData?.skills]);

  // On mount: fetch project_interests for current user and store projectIds in submittedProjects
  useEffect(() => {
    if (!user?.uid) return;

    const fetchSubmittedInterests = async () => {
      try {
        const q = query(
          collection(db, 'project_interests'),
          where('employeeId', '==', user.uid)
        );
        const snap = await getDocs(q);
        const ids = snap.docs.map((d) => d.data().projectId).filter(Boolean);
        setSubmittedProjects(ids);
      } catch (err) {
        console.error('[Resume Analysis] Failed to fetch project interests:', err);
        setSubmittedProjects([]);
      }
    };

    fetchSubmittedInterests();
  }, [user?.uid]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Only PDF and DOCX files are allowed');
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

  const handleAnalyze = async () => {
    if (!selectedFile) return;

    setIsAnalyzing(true);
    setIsReAnalyzing(showReAnalyzeUI);
    setApiError(null);

    try {
      // 1. Firebase Storage upload (runs before resume text extraction)
      let resumeStorageFailed = false;
      if (user?.uid && selectedFile) {
        try {
          const storageRef = ref(storage, `resumes/${user.uid}/${selectedFile.name}`);
          console.log('[Resume Upload] Uploading resume to:', storageRef.fullPath);
          await uploadBytes(storageRef, selectedFile);
          const downloadURL = await getDownloadURL(storageRef);
          console.log('[Resume Upload] Resume uploaded successfully, download URL obtained');
          await setDoc(doc(db, 'resumes', user.uid), {
            resumeUrl: downloadURL,
            fileName: selectedFile.name,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          console.log('[Resume Upload] Firestore resumes/%s updated with resumeUrl', user.uid);
        } catch (storageErr) {
          console.error('[Resume Analysis] Resume storage save failed:', storageErr);
          setApiError('Resume file upload failed. Please try again.');
          resumeStorageFailed = true;
        }
      }

      // 2. Resume text extraction (existing parsing logic – unchanged)
      console.log('[Resume Analysis] Starting API call to /api/resume/analyze');
      console.log('[Resume Analysis] File:', selectedFile.name, 'Size:', selectedFile.size);
      if (showReAnalyzeUI) {
        console.log('[Resume Analysis] Re-analysis mode - will overwrite existing document');
      }

      const formData = new FormData();
      formData.append('file', selectedFile);

      const headers = {};
      if (user?.uid) {
        headers['X-User-Id'] = user.uid;
        console.log('[Resume Analysis] Including user UID in headers:', user.uid);
      }

      const API_URL = 'http://localhost:8000/api/resume/analyze';
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: headers,
        body: formData,
      });

      console.log('[Resume Analysis] API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[Resume Analysis] API response received:', data);

      await new Promise(resolve => setTimeout(resolve, 1000));
      await fetchResumeAnalysis();

      // Create or update employee_skill_profiles for PM Employee Pool (setDoc with merge)
      if (user?.uid) {
        try {
          const analysisRef = doc(db, 'resume_analysis', user.uid);
          const analysisSnap = await getDoc(analysisRef);
          const analysisData = analysisSnap.exists() ? analysisSnap.data() : {};
          const skillsRaw = analysisData.skills || [];
          const experienceYears = Number(analysisData.experience_years) || 0;

          const primarySkills = skillsRaw.map((s) => {
            if (typeof s === 'string') return { skill: s, score: 50 };
            if (s && typeof s === 'object' && ('skill' in s || 'name' in s)) {
              return { skill: s.skill ?? s.name ?? String(s), score: typeof s.score === 'number' ? s.score : 50 };
            }
            return { skill: String(s), score: 50 };
          });

          const skillsCount = primarySkills.length;
          const overallHelixScore = Math.min(100, Math.round(skillsCount * 5 + experienceYears * 10));

          const profileRef = doc(db, 'employee_skill_profiles', user.uid);
          const profileSnap = await getDoc(profileRef);
          const isNew = !profileSnap.exists();

          const existing = profileSnap.exists() ? profileSnap.data() : {};
          // Prefer department from Firestore users doc (set at signup), then existing profile, then default
          const userDocSnap = await getDoc(doc(db, 'users', user.uid));
          const userDepartment = userDocSnap.exists() ? userDocSnap.data()?.department : null;
          const department = (userDepartment && String(userDepartment).trim()) || (existing.department && String(existing.department).trim()) || 'Engineering';
          const payload = {
            name: user.name || existing.name || 'Unknown',
            department,
            overallHelixScore,
            totalPoints: typeof existing.totalPoints === 'number' ? existing.totalPoints : 0,
            primarySkills,
            updatedAt: serverTimestamp(),
          };
          if (isNew) payload.createdAt = serverTimestamp();

          await setDoc(profileRef, payload, { merge: true });
          console.log(`Employee skill profile ${isNew ? 'created' : 'updated'} for UID: ${user.uid}`);
        } catch (profileErr) {
          console.error('[Resume Analysis] Employee skill profile write failed:', profileErr);
        }
      }

      setSelectedFile(null);
      setShowReAnalyzeUI(false);
      setIsReAnalyzing(false);

      if (!resumeStorageFailed) {
        setSuccessMessage(showReAnalyzeUI ? 'Resume re-analyzed successfully!' : 'Resume analyzed successfully!');
        setTimeout(() => setSuccessMessage(null), 5000);
      }
    } catch (error) {
      console.error('[Resume Analysis] Error calling API:', error);
      setApiError(error.message || 'Failed to analyze resume. Please try again.');
      setIsReAnalyzing(false);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setUploadError('');
    setApiError(null);
  };

  // Handle re-analysis - show upload UI to re-upload and analyze
  const handleReAnalyze = () => {
    setShowReAnalyzeUI(true);
    setSelectedFile(null);
    setUploadError('');
    setApiError(null);
  };

  // Handle upload new resume - delete existing document and reset
  const handleUploadNewResume = async () => {
    if (!user?.uid) return;

    // Confirm deletion
    const confirmed = window.confirm(
      'Are you sure you want to delete your current resume analysis? This action cannot be undone.'
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setApiError(null);

    try {
      // Delete Firestore document
      const docRef = doc(db, 'resume_analysis', user.uid);
      await deleteDoc(docRef);
      console.log('[Resume Analysis] Document deleted successfully');

      // Clear local state
      setFirestoreData(null);
      setSelectedFile(null);
      setUploadError('');
      setShowReAnalyzeUI(false);
      
      // Show success feedback
      setSuccessMessage('Resume analysis deleted. You can now upload a new resume.');
      setTimeout(() => setSuccessMessage(null), 5000);
      console.log('[Resume Analysis] Reset complete - ready for new upload');
    } catch (error) {
      console.error('[Resume Analysis] Error deleting document:', error);
      setApiError('Failed to delete resume analysis. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Compute skill strength percentages dynamically
  const computeSkillStrength = (skillName) => {
    if (!firestoreData?.skills) return 0;
    
    const skills = firestoreData.skills.map(s => s.toLowerCase());
    const experienceYears = firestoreData.experience_years || 0;
    
    // Check if skill is present
    const skillPresent = skills.some(s => s.includes(skillName.toLowerCase()));
    if (!skillPresent) return 0;
    
    // Base percentage from presence (40%) + experience bonus (up to 60%)
    const basePercentage = 40;
    const experienceBonus = Math.min(60, experienceYears * 12); // 12% per year, capped at 60%
    return Math.min(100, Math.round(basePercentage + experienceBonus));
  };

  // Compute career readiness percentage
  const computeCareerReadiness = () => {
    if (!firestoreData) return 0;
    const skillsCount = firestoreData.skills?.length || 0;
    const experienceYears = firestoreData.experience_years || 0;
    return Math.min(100, Math.round(skillsCount * 5 + experienceYears * 10));
  };

  const handleExpressInterest = async (project) => {
    const projectId = project.projectId || project.id;
    if (!user?.uid || !user?.name || !projectId || !project.title) return;
    if (submittedProjects.includes(projectId)) return;
    setExpressingInterestFor(projectId);
    try {
      // 1. Fetch resumeUrl from resumes/{userId}
      let resumeUrl = null;
      try {
        const resumeSnap = await getDoc(doc(db, 'resumes', user.uid));
        resumeUrl = resumeSnap.data()?.resumeUrl ?? null;
      } catch (_) {}
      // 2. Create project_interests with resumeUrl (null allowed; interest still submitted)
      await addDoc(collection(db, 'project_interests'), {
        employeeId: user.uid,
        employeeName: user.name,
        projectId,
        projectTitle: project.title,
        matchScore: project.matchScore ?? null,
        matchedSkills: Array.isArray(project.matchedSkills) ? project.matchedSkills : [],
        resumeUrl: resumeUrl ?? null,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      // 3. Add employee to project's interestedEmployees for PM assignment flow
      try {
        await updateDoc(doc(db, 'projects', projectId), {
          interestedEmployees: arrayUnion(user.uid),
        });
      } catch (projectErr) {
        console.warn('[Resume Analysis] Update project interestedEmployees:', projectErr);
      }
      setSubmittedProjects((prev) => [...prev, projectId]);
      setSuccessMessage('Interest submitted successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
      setSelectedProject(null);
    } catch (e) {
      console.error('[Resume Analysis] Express interest failed:', e);
      setApiError(e.message || 'Failed to submit interest');
    } finally {
      setExpressingInterestFor(null);
    }
  };

  // Show upload UI if no Firestore document exists OR if re-analyzing
  const showUploadUI = (!firestoreData && !isLoading) || showReAnalyzeUI;

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16 box-border" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 80px)' }}>
      <div className="mb-8 w-full space-y-1">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-black">Resume Analysis</h1>
            <p className="text-sm text-gray-600 font-medium">
              Upload your resume to get AI-powered insights on skill matching, career readiness, and learning paths.
            </p>
          </div>
          {/* Action Buttons - Show when analysis exists and not in re-analyze mode */}
          {!isLoading && firestoreData && !showReAnalyzeUI && (
            <div className="flex items-center gap-3 ml-4">
              <button
                onClick={handleReAnalyze}
                disabled={isDeleting}
                className="px-4 py-2 bg-[#1e3a5f] text-white rounded-xl hover:bg-[#1e3a5f]/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 font-semibold shadow-sm hover:shadow-md text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Re-Analyze Resume</span>
              </button>
              <button
                onClick={handleUploadNewResume}
                disabled={isDeleting || isAnalyzing}
                className="px-4 py-2 bg-white text-[#1e3a5f] border-2 border-[#1e3a5f] rounded-xl hover:bg-[#1e3a5f]/10 disabled:bg-gray-100 disabled:border-gray-300 disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 font-semibold shadow-sm hover:shadow-md text-sm"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Upload New Resume</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#1e3a5f] animate-spin mb-4" />
          <p className="text-sm text-gray-600 font-medium">Loading resume analysis...</p>
        </div>
      )}

      {/* Upload Section - Show if no Firestore document exists OR if re-analyzing */}
      {!isLoading && showUploadUI && (
        <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-black">
                {showReAnalyzeUI ? 'Re-Analyze Resume' : 'Upload Resume'}
              </h2>
              {showReAnalyzeUI && (
                <p className="text-sm text-gray-600 font-medium mt-1">
                  Upload a new file to re-run the analysis. This will update your existing analysis.
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {showReAnalyzeUI && (
                <button
                  onClick={() => {
                    setShowReAnalyzeUI(false);
                    setSelectedFile(null);
                    setUploadError('');
                  }}
                  className="text-sm font-semibold text-gray-600 hover:text-black transition-colors px-3 py-1"
                >
                  Cancel
                </button>
              )}
              {selectedFile && (
                <button
                  onClick={handleClear}
                  className="text-sm font-semibold text-gray-600 hover:text-black transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {!selectedFile ? (
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-[#1e3a5f] transition-colors">
              <Upload className="w-16 h-16 text-gray-400 mx-auto mb-6" />
              <p className="text-base font-medium text-gray-600 mb-4">Upload your resume (PDF or DOCX)</p>
              <label className="inline-block">
                <input
                  type="file"
                  accept=".pdf,.docx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <span className="px-6 py-3 bg-[#1e3a5f] text-white rounded-xl hover:bg-[#1e3a5f]/90 cursor-pointer inline-block font-semibold shadow-sm hover:shadow-md transition-all duration-200">
                  Choose File
                </span>
              </label>
              {uploadError && (
                <p className="mt-4 text-sm font-medium text-red-600">{uploadError}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between p-6 bg-green-50 border-2 border-green-200 rounded-xl">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-xl">
                  <FileText className="w-10 h-10 text-green-600" />
                </div>
                <div>
                  <p className="font-bold text-black text-lg">{selectedFile.name}</p>
                  <p className="text-sm text-gray-600 font-medium">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="px-6 py-3 bg-[#1e3a5f] text-white rounded-xl hover:bg-[#1e3a5f]/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 font-semibold shadow-sm hover:shadow-md"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{isReAnalyzing ? 'Re-Analyzing...' : 'Analyzing...'}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>{showReAnalyzeUI ? 'Re-Analyze Resume' : 'Analyze Resume'}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="mb-8 p-5 bg-green-50 border-2 border-green-200 rounded-xl flex items-start gap-4">
          <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-bold text-green-900">Success</p>
            <p className="text-sm text-green-700 font-medium">{successMessage}</p>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-green-700 hover:text-green-900"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* API Error Message */}
      {apiError && (
        <div className="mb-8 p-5 bg-red-50 border-2 border-red-200 rounded-xl flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-bold text-red-900">Error</p>
            <p className="text-sm text-red-700 font-medium">{apiError}</p>
          </div>
          <button
            onClick={() => setApiError(null)}
            className="text-red-700 hover:text-red-900"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Analysis Results - All sections rendered from Firestore data (hide during re-analysis) */}
      {!isLoading && firestoreData && !showReAnalyzeUI && (
        <div className="space-y-8">
          {/* Resume Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-7 relative overflow-hidden hover:shadow-md transition-all duration-200">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#1e3a5f]"></div>
              <div className="flex items-center gap-3 mb-5">
                <div className="p-3 bg-[#1e3a5f]/10 rounded-xl">
                  <FileText className="w-6 h-6 text-[#1e3a5f]" />
                </div>
                <h3 className="text-xl font-bold text-black">Resume Stats</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Text Length</p>
                  <p className="text-lg font-bold text-black">
                    {firestoreData.text_length?.toLocaleString() || 0} characters
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Experience</p>
                  <p className="text-lg font-bold text-black">
                    {firestoreData.experience_years?.toFixed(1) || '0.0'} years
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-7 relative overflow-hidden hover:shadow-md transition-all duration-200">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#1e3a5f]"></div>
              <div className="flex items-center gap-3 mb-5">
                <div className="p-3 bg-[#1e3a5f]/10 rounded-xl">
                  <TrendingUp className="w-6 h-6 text-[#1e3a5f]" />
                </div>
                <h3 className="text-xl font-bold text-black">Skills Detected</h3>
              </div>
              <div className="text-center">
                <div className="text-5xl font-bold text-[#1e3a5f] mb-2">
                  {firestoreData.skills?.length || 0}
                </div>
                <p className="text-sm text-gray-600 font-medium">Total Skills</p>
              </div>
            </div>
          </div>

          {/* Extracted Skills */}
          {firestoreData.skills && firestoreData.skills.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-8">
              <h3 className="text-xl font-bold text-black mb-6">Extracted Skills</h3>
              <div className="flex flex-wrap gap-3">
                {firestoreData.skills.map((skill, index) => (
                  <span
                    key={index}
                    className="px-4 py-2 bg-[#1e3a5f]/10 text-[#1e3a5f] rounded-xl text-sm font-semibold border border-[#1e3a5f]/20"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Detected Domains */}
          {firestoreData.domains && firestoreData.domains.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-8">
              <h3 className="text-xl font-bold text-black mb-6">Detected Domains</h3>
              <div className="flex flex-wrap gap-3">
                {firestoreData.domains.map((domain, index) => (
                  <span
                    key={index}
                    className="px-4 py-2 bg-green-50 text-green-700 rounded-xl text-sm font-semibold border border-green-200"
                  >
                    {domain}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Skill Strength Overview */}
          <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-[#1e3a5f]/10 rounded-xl">
                <TrendingUp className="w-6 h-6 text-[#1e3a5f]" />
              </div>
              <h3 className="text-xl font-bold text-black">📊 Skill Strength Overview</h3>
            </div>
            <div className="space-y-4">
              {['React', 'Python', 'Node.js', 'AWS'].map((skillName) => {
                const progress = computeSkillStrength(skillName);
                let level = 'Beginner';
                if (progress >= 70) level = 'Advanced';
                else if (progress >= 40) level = 'Intermediate';

                const getLevelBadge = (level) => {
                  switch (level) {
                    case 'Advanced':
                      return { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' };
                    case 'Intermediate':
                      return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' };
                    case 'Beginner':
                      return { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' };
                    default:
                      return { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' };
                  }
                };
                const badgeStyle = getLevelBadge(level);
                const progressColor = level === 'Advanced' ? 'bg-purple-500' : level === 'Intermediate' ? 'bg-blue-500' : 'bg-yellow-500';

                return (
                  <div key={skillName} className="border-2 border-gray-200 rounded-xl p-5 hover:border-[#1e3a5f] hover:shadow-md transition-all duration-200 bg-white">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-black text-lg">{skillName}</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border-2 ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}>
                          {level}
                        </span>
                      </div>
                      <span className="text-base font-bold text-black">{progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
                      <div
                        className={`h-3 rounded-full transition-all duration-500 ${progressColor}`}
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-gray-600 font-medium">Based on skill presence and experience level</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Career Readiness Snapshot */}
          <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-[#1e3a5f]/10 rounded-xl">
                <Rocket className="w-6 h-6 text-[#1e3a5f]" />
              </div>
              <h3 className="text-xl font-bold text-black">🚀 Career Readiness Snapshot</h3>
            </div>
            <div className="space-y-4">
              {/* Readiness Percentage */}
              <div className="p-5 bg-white border-2 border-gray-200 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-700">Overall Readiness</span>
                  <span className="text-xl font-bold text-[#1e3a5f]">{computeCareerReadiness()}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3.5">
                  <div
                    className="bg-[#1e3a5f] h-3.5 rounded-full transition-all duration-500"
                    style={{ width: `${computeCareerReadiness()}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Calculated from skills count and experience years</p>
              </div>
            </div>
          </div>

          {/* Recommended Projects */}
          <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-[#1e3a5f]/10 rounded-xl">
                <Briefcase className="w-6 h-6 text-[#1e3a5f]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-black">📦 Recommended Projects</h3>
                <p className="text-sm text-gray-500 font-medium">
                  Based on your resume skills and current company projects
                </p>
              </div>
            </div>

            {loadingRecommendedProjects ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-[#1e3a5f] animate-spin mb-3" />
                <p className="text-sm text-gray-600">Loading recommended projects...</p>
              </div>
            ) : (() => {
              const displayProjects = recommendedProjects.filter((p) => p.matchScore > 0);
              return displayProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-4 rounded-full bg-gray-100 mb-4">
                  <Sparkles className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-900 mb-1">No suitable project matches yet.</p>
                <p className="text-xs text-gray-500 max-w-sm">
                  New projects will appear automatically when available.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {displayProjects.map((project, index) => {
                    // Determine match level badge styling (green if ≥80%, yellow if 60-79%)
                    const getMatchLevelBadge = (score) => {
                      if (score >= 80) {
                        return {
                          bg: 'bg-green-100',
                          text: 'text-green-700',
                          border: 'border-green-200',
                          label: 'Strong Match',
                          progressColor: 'bg-green-500'
                        };
                      } else if (score >= 60) {
                        return {
                          bg: 'bg-yellow-100',
                          text: 'text-yellow-700',
                          border: 'border-yellow-200',
                          label: 'Good Match',
                          progressColor: 'bg-yellow-500'
                        };
                      } else {
                        return {
                          bg: 'bg-gray-100',
                          text: 'text-gray-700',
                          border: 'border-gray-200',
                          label: 'Skill Gap Match',
                          progressColor: 'bg-gray-400'
                        };
                      }
                    };

                    const badgeStyle = getMatchLevelBadge(project.matchScore);

                    return (
                      <div
                        key={`${project.title}-${index}`}
                        className="border-2 border-gray-200 rounded-xl p-6 hover:border-[#1e3a5f] hover:shadow-lg transition-all duration-200 flex flex-col bg-white"
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-gray-900 mb-1 truncate">{project.title}</h4>
                            {project.domain && (
                              <p className="text-xs text-gray-500 mb-2">{project.domain}</p>
                            )}
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}>
                                {badgeStyle.label}
                              </span>
                              <span className="text-xs text-gray-500">
                                {project.matchScore.toFixed(1)}% match
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Description - optional from API */}
                        {project.description && (
                          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                            {project.description}
                          </p>
                        )}

                        {/* Match Score Progress Bar */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs text-gray-600">Match Score</span>
                            <span className="text-xs font-semibold text-gray-900">{project.matchScore.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                            <div
                              className={`h-2.5 rounded-full transition-all duration-500 ${badgeStyle.progressColor}`}
                              style={{ width: `${Math.min(project.matchScore, 100)}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Matched Skills */}
                        {project.matchedSkills && project.matchedSkills.length > 0 && (
                          <div className="mb-4">
                            <p className="text-xs font-medium text-gray-700 mb-2">Matched Skills</p>
                            <div className="flex flex-wrap gap-1.5">
                              {project.matchedSkills.map((skill, idx) => (
                                <span
                                  key={idx}
                                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#1e3a5f]/10 text-[#1e3a5f] border border-[#1e3a5f]/20"
                                >
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Why this project? - derived from matched skills when no matchReasons from API */}
                        {(project.matchReasons && project.matchReasons.length > 0) || (project.matchedSkills && project.matchedSkills.length > 0) ? (
                          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                            <div className="flex items-center gap-2 mb-2">
                              <Info className="w-4 h-4 text-blue-600" />
                              <p className="text-xs font-semibold text-blue-900">Why this project?</p>
                            </div>
                            {project.matchReasons && project.matchReasons.length > 0 ? (
                              <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                                {project.matchReasons.map((reason, idx) => (
                                  <li key={idx}>{reason}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-xs text-blue-800">
                                {project.matchedSkills.length} matched skill{project.matchedSkills.length !== 1 ? 's' : ''}: {project.matchedSkills.join(', ')}
                              </p>
                            )}
                          </div>
                        ) : null}

                        {/* Action Buttons */}
                        <div className="flex gap-2 mt-auto">
                          <button
                            onClick={() => setSelectedProject(project)}
                            className="flex-1 px-4 py-2.5 text-sm font-semibold text-[#1e3a5f] bg-[#1e3a5f]/10 hover:bg-[#1e3a5f]/20 rounded-xl border-2 border-[#1e3a5f]/20 hover:border-[#1e3a5f] transition-all duration-200 flex items-center justify-center gap-2"
                          >
                            <span>View Details</span>
                            <ExternalLink className="w-4 h-4" />
                          </button>
                          {submittedProjects.includes(project.projectId || project.id) ? (
                            <button
                              disabled
                              className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-xl cursor-default flex items-center justify-center gap-2"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Interest Submitted
                            </button>
                          ) : (
                            <button
                              onClick={() => handleExpressInterest(project)}
                              disabled={expressingInterestFor === (project.projectId || project.id)}
                              className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                              {expressingInterestFor === (project.projectId || project.id) ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Submitting...
                                </>
                              ) : (
                                'Express Interest'
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Empty State for Skills */}
          {(!firestoreData?.skills || firestoreData.skills.length === 0) && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Skills Detected</h3>
              <p className="text-sm text-gray-600">
                The resume parser could not extract skills from your resume. This may be due to:
              </p>
              <ul className="text-sm text-gray-600 mt-2 text-left max-w-md mx-auto list-disc list-inside">
                <li>Resume format not fully supported</li>
                <li>Skills not mentioned in standard format</li>
                <li>Text extraction issues</li>
              </ul>
            </div>
          )}

          {/* Footer Note */}
          <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6">
            <p className="text-sm text-gray-600 text-center font-medium italic">
              These recommendations are generated for internal guidance and skill development. Final project assignments are handled by managers.
            </p>
          </div>

        </div>
      )}

      {/* Project Details Modal */}
      {selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">{selectedProject.title}</h3>
              <button
                onClick={() => setSelectedProject(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Domain */}
              {selectedProject.domain && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Domain</p>
                  <p className="text-sm text-gray-900">{selectedProject.domain}</p>
                </div>
              )}

              {/* Description */}
              {selectedProject.description && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Description</p>
                  <p className="text-sm text-gray-900">{selectedProject.description}</p>
                </div>
              )}

              {/* Match Score */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Match Score</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-3 rounded-full transition-all ${
                        selectedProject.matchScore >= 80
                          ? 'bg-green-500'
                          : selectedProject.matchScore >= 60
                          ? 'bg-yellow-500'
                          : 'bg-gray-400'
                      }`}
                      style={{ width: `${Math.min(selectedProject.matchScore, 100)}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">
                    {selectedProject.matchScore.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Matched Skills */}
              {selectedProject.matchedSkills && selectedProject.matchedSkills.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Matched Skills</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedProject.matchedSkills.map((skill, idx) => (
                      <span
                        key={idx}
                          className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium"
                        >
                          {skill}
                        </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Why this project? */}
              {selectedProject.matchReasons && selectedProject.matchReasons.length > 0 && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="w-5 h-5 text-blue-600" />
                    <p className="text-sm font-semibold text-blue-900">Why this project?</p>
                  </div>
                  <ul className="text-sm text-blue-800 space-y-2 list-disc list-inside">
                    {selectedProject.matchReasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Minimum Experience */}
              {selectedProject.minExperience && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Required Experience Level</p>
                  <p className="text-sm text-gray-900">{selectedProject.minExperience}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                {submittedProjects.includes(selectedProject?.projectId || selectedProject?.id) ? (
                  <button
                    disabled
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg cursor-default flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Interest Submitted
                  </button>
                ) : (
                  <button
                    onClick={() => handleExpressInterest(selectedProject)}
                    disabled={expressingInterestFor === (selectedProject?.projectId || selectedProject?.id)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                  >
                    {expressingInterestFor === (selectedProject?.projectId || selectedProject?.id) ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Express Interest'
                    )}
                  </button>
                )}
                <button
                  onClick={() => setSelectedProject(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
