/**
 * Employee Profile Service - Fetches employee skill profile from FastAPI backend
 * 
 * Handles fetching the persistent employee skill profile which is the single source of truth
 * for skills, experience, and domains. Updated after resume analysis.
 */

const API_BASE_URL = 'http://localhost:8000';

/**
 * Fetch employee skill profile
 * 
 * @param {string} userId - Employee user ID (Firebase UID)
 * @returns {Promise<Object>} Profile data with structure:
 *   {
 *     success: boolean,
 *     profile: {
 *       userId: string,
 *       skills: string[],
 *       domains: string[],
 *       experience_years: number,
 *       text_length: number,
 *       file_type: string,
 *       analyzed_at: string,
 *       created_at: string,
 *       updated_at: string
 *     } | null,
 *     message: string | null
 *   }
 */
export const getEmployeeSkillProfile = async (userId) => {
  try {
    console.log('[Employee Profile Service] Fetching profile for user:', userId);
    
    if (!userId) {
      console.warn('[Employee Profile Service] No userId provided');
      return {
        success: false,
        profile: null,
        message: 'User ID is required to fetch profile.'
      };
    }
    
    const response = await fetch(`${API_BASE_URL}/api/employee/profile/${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[Employee Profile Service] Received profile:', data);
    
    return {
      success: data.success !== false,
      profile: data.profile || null,
      message: data.message || null
    };
  } catch (error) {
    console.error('[Employee Profile Service] Error fetching profile:', error);
    return {
      success: false,
      profile: null,
      message: 'Failed to fetch employee profile. Please try again later.'
    };
  }
};

