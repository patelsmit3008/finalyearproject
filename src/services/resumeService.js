/**
 * Resume Service - Fetches resume data from FastAPI backend and Firestore resume URLs
 *
 * - getResumeData: API-based resume analysis data
 * - getResumeByUserId: Firestore resumes/{userId} → resumeUrl for PM View Resume
 */

import { db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';

const API_BASE_URL = 'http://localhost:8000';

/**
 * Get resume download URL from Firestore for a user (PM View Resume).
 * Reads document resumes/{userId}. Does NOT throw; returns null if missing or on error.
 *
 * @param {string} userId - Employee Firebase UID
 * @returns {Promise<string|null>} resumeUrl if exists, otherwise null
 */
export const getResumeByUserId = async (userId) => {
  if (!userId) {
    console.log('[Resume Service] getResumeByUserId: no userId');
    return null;
  }
  try {
    const snap = await getDoc(doc(db, 'resumes', userId));
    if (!snap.exists()) {
      console.log('[Resume Service] getResumeByUserId: no document for', userId);
      return null;
    }
    const url = snap.data().resumeUrl ?? null;
    if (url) console.log('[Resume Service] getResumeByUserId: found resumeUrl for', userId);
    return url;
  } catch (err) {
    console.error('[Resume Service] getResumeByUserId error:', err);
    return null;
  }
};

/**
 * Fetch resume data for an employee
 * 
 * @param {string} userId - Employee user ID (Firebase UID)
 * @returns {Promise<Object>} Resume data with structure:
 *   {
 *     success: boolean,
 *     resume: {
 *       userId: string,
 *       skills: string[],
 *       domains: string[],
 *       experience_years: number,
 *       file_url: string | null,
 *       file_name: string,
 *       file_type: string,
 *       text_length: number,
 *       analyzed_at: string,
 *       updated_at: string
 *     } | null,
 *     message: string | null
 *   }
 */
export const getResumeData = async (userId) => {
  try {
    console.log('[Resume Service] Fetching resume for user:', userId);
    
    if (!userId) {
      console.warn('[Resume Service] No userId provided');
      return {
        success: false,
        resume: null,
        message: 'User ID is required to fetch resume.'
      };
    }
    
    const response = await fetch(`${API_BASE_URL}/api/resumes/${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[Resume Service] Received resume:', data);
    
    return {
      success: data.success !== false,
      resume: data.resume || null,
      message: data.message || null
    };
  } catch (error) {
    console.error('[Resume Service] Error fetching resume:', error);
    return {
      success: false,
      resume: null,
      message: 'Failed to fetch resume data. Please try again later.'
    };
  }
};

