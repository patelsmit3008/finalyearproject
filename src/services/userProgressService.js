/**
 * User Progress Service - Fetches user progress data from FastAPI backend
 * 
 * Handles fetching user progress data including recommended projects
 * stored in user_progress/{userId}
 */

const API_BASE_URL = 'http://localhost:8000';

/**
 * Fetch user progress data including recommended projects
 * 
 * @param {string} userId - Employee user ID (Firebase UID)
 * @returns {Promise<Object>} Progress data with structure:
 *   {
 *     success: boolean,
 *     progress: {
 *       userId: string,
 *       recommendedProjects: Array<{
 *         projectId: string,
 *         projectName: string,
 *         matchPercentage: number,
 *         matchedSkills: string[],
 *         missingSkills: string[],
 *         requiredSkills: string[],
 *         status: string,
 *         minimumHelixScore: number,
 *         description: string,
 *         domain: string
 *       }>,
 *       recommendationsUpdatedAt: string,
 *       createdAt: string
 *     } | null,
 *     message: string | null
 *   }
 */
export const getUserProgress = async (userId) => {
  try {
    console.log('[User Progress Service] Fetching progress for user:', userId);
    
    if (!userId) {
      console.warn('[User Progress Service] No userId provided');
      return {
        success: false,
        progress: null,
        message: 'User ID is required to fetch progress.'
      };
    }
    
    const response = await fetch(`${API_BASE_URL}/api/user-progress/${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[User Progress Service] Received progress:', data);
    
    return {
      success: data.success !== false,
      progress: data.progress || null,
      message: data.message || null
    };
  } catch (error) {
    console.error('[User Progress Service] Error fetching progress:', error);
    return {
      success: false,
      progress: null,
      message: 'Failed to fetch user progress. Please try again later.'
    };
  }
};

