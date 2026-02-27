import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { getResumeData } from '../services/resumeService';

const ResumeContext = createContext(null);

export function ResumeProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [resume, setResumeState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch resume from Firestore
  const fetchResume = useCallback(async (userId) => {
    if (!userId) {
      setResumeState(null);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const result = await getResumeData(userId);
      
      if (result.success && result.resume) {
        setResumeState(result.resume);
        console.log('[ResumeContext] ✅ Resume fetched successfully');
      } else {
        setResumeState(null);
        console.log('[ResumeContext] No resume data found');
      }
    } catch (err) {
      console.error('[ResumeContext] Error fetching resume:', err);
      setError(err.message || 'Failed to fetch resume data');
      setResumeState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Set resume data (used after successful upload/analysis)
  const setResume = useCallback((resumeData) => {
    setResumeState(resumeData);
    setError(null);
    console.log('[ResumeContext] ✅ Resume data updated');
  }, []);

  // Fetch resume when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user?.uid) {
      fetchResume(user.uid);
    } else {
      // Clear resume when user logs out
      setResumeState(null);
      setLoading(false);
      setError(null);
    }
  }, [isAuthenticated, user?.uid, fetchResume]);

  const value = {
    resume,
    loading,
    error,
    fetchResume,
    setResume,
  };

  return (
    <ResumeContext.Provider value={value}>
      {children}
    </ResumeContext.Provider>
  );
}

export function useResume() {
  const context = useContext(ResumeContext);
  if (!context) {
    throw new Error('useResume must be used within ResumeProvider');
  }
  return context;
}

