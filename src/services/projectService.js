/**
 * Project Service - Fetches projects from FastAPI backend and Firestore
 * - getActiveProjects, getProjectMatches: API (Employee Portal)
 * - subscribeToProjects: Firestore real-time listener for PM Dashboard
 */

import { db } from '../firebase/config';
import { collection, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const API_BASE_URL = 'http://localhost:8000';

/**
 * Get query and callbacks for "projects" collection. Use inside useEffect with onSnapshot; return unsubscribe in cleanup.
 * @param {(projects: Array) => void} callback
 * @returns {{ query: Query, onNext: (snapshot) => void, onError: (err) => void }}
 */
export function getProjectsSubscription(callback) {
  const q = collection(db, 'projects');
  const onNext = (snapshot) => {
    const projects = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        name: data.name ?? data.projectName ?? data.title ?? 'Untitled Project',
        requiredSkills: Array.isArray(data.requiredSkills)
          ? data.requiredSkills
          : data.requiredSkill
            ? [data.requiredSkill]
            : [],
        minHelixScore: data.minHelixScore ?? data.minimumHelixScore ?? 0,
        status: data.status ?? 'Planning',
        updatedAt: data.updatedAt ?? data.createdAt ?? null,
      };
    });
    callback(projects);
  };
  const onError = (err) => {
    console.error('[Project Service] subscribeToProjects error:', err);
    callback([]);
  };
  return { query: q, onNext, onError };
}

/**
 * Update a project's status in Firestore. Also sets updatedAt.
 * Real-time listeners (e.g. subscribeToProjects, onSnapshot in Projects.jsx) will refresh automatically.
 *
 * @param {string} projectId - Firestore project document ID
 * @param {string} status - One of: Planning, Upcoming, In Progress, On Hold, Completed
 * @returns {Promise<void>}
 */
export async function updateProjectStatus(projectId, status) {
  if (!projectId || !status) return;
  const ref = doc(db, 'projects', projectId);
  await updateDoc(ref, { status, updatedAt: serverTimestamp() });
}

/**
 * Fetch active projects from the API
 * 
 * Returns only projects with status "In Progress" or "Planning"
 * 
 * @returns {Promise<Array>} Array of project objects
 */
export const getActiveProjects = async () => {
  try {
    console.log('[Project Service] Fetching active projects from API...');
    
    const response = await fetch(`${API_BASE_URL}/api/projects/active`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const projects = await response.json();
    console.log('[Project Service] Received projects:', projects.length);
    console.log('[Project Service] Projects:', projects.map(p => ({
      projectId: p.projectId,
      projectName: p.projectName,
      requiredSkills: p.requiredSkills,
      status: p.status,
    })));
    
    return projects || [];
  } catch (error) {
    console.error('[Project Service] Error fetching projects:', error);
    return [];
  }
};

/**
 * Fetch project matches for an employee based on their resume
 * 
 * @param {string} userId - Employee user ID (Firebase UID)
 * @returns {Promise<Object>} Match results with structure:
 *   {
 *     success: boolean,
 *     matches: Array<{
 *       projectId: string,
 *       title: string,
 *       matchScore: number,
 *       matchLevel: string,
 *       matchedSkills: string[],
 *       missingSkills: string[]
 *     }>,
 *     message: string | null
 *   }
 */
export const getProjectMatches = async (userId) => {
  try {
    console.log('[Project Service] Fetching project matches for user:', userId);
    
    if (!userId) {
      console.warn('[Project Service] No userId provided');
      return {
        success: true,
        matches: [],
        message: 'User ID is required to fetch project matches.'
      };
    }
    
    const response = await fetch(`${API_BASE_URL}/projects/match/${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[Project Service] Received project matches:', data);
    
    return {
      success: data.success !== false,
      matches: data.matches || [],
      message: data.message || null
    };
  } catch (error) {
    console.error('[Project Service] Error fetching project matches:', error);
    return {
      success: false,
      matches: [],
      message: 'Failed to fetch project matches. Please try again later.'
    };
  }
};

