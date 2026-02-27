/**
 * Helix Points Processor - Integration layer for Module 4F
 * 
 * This module processes validated contributions with applied confidence updates
 * and awards Helix Points accordingly.
 */

import { getValidatedUnappliedContributions } from './confidenceUpdateProcessor';
import { getConfidenceUpdateHistory } from './skillConfidenceService';
import { getHelixPoints, awardHelixPoints } from './helixPointsService';
import { db } from '../config';
import { collection, query, where, getDocs } from 'firebase/firestore';

/**
 * Process Helix Points awards for a specific employee
 * 
 * This function:
 * 1. Fetches validated contributions that have been applied to confidence
 * 2. Fetches corresponding confidence updates
 * 3. Calculates points using backend logic principles
 * 4. Awards points to employee
 * 5. Marks contributions as points awarded
 * 
 * @param {string} employeeId - Employee UID
 * @returns {Promise<Object>} Processing result
 */
export const processEmployeePointAwards = async (employeeId) => {
  try {
    if (!employeeId) {
      return {
        success: false,
        error: "employeeId is required",
        awards: [],
      };
    }

    // Get validated contributions that have been applied to confidence but not awarded points
    const contributions = await getValidatedContributionsForPoints(employeeId);

    if (contributions.length === 0) {
      return {
        success: true,
        message: "No contributions ready for point awards",
        awards: [],
      };
    }

    // Get confidence update history to match with contributions
    const confidenceHistory = await getConfidenceUpdateHistory(employeeId);

    // Create lookup map: contribution_id -> confidence_update
    const confidenceUpdateMap = {};
    confidenceHistory.forEach(update => {
      const contribId = update.sourceContributionId;
      if (contribId) {
        confidenceUpdateMap[contribId] = update;
      }
    });

    // Get current Helix Points to track monthly caps
    const currentPoints = await getHelixPoints(employeeId);
    const skillPoints = currentPoints?.skillPoints || {};

    // Process each contribution
    const awards = [];
    const errors = [];
    let totalPointsAwarded = 0;

    for (const contrib of contributions) {
      try {
        const contribId = contrib.id;
        const skill = contrib.skill;
        const contributionLevel = contrib.contributionLevel || 'Moderate';
        const role = contrib.role || 'Contributor';

        // Find matching confidence update
        const confidenceUpdate = confidenceUpdateMap[contribId];
        if (!confidenceUpdate) {
          errors.push(`No confidence update found for contribution ${contribId}`);
          continue;
        }

        const confidenceDelta = confidenceUpdate.increment || 0;

        // Calculate points (simplified version of backend logic)
        const basePoints = getBasePoints(contributionLevel);
        const roleMultiplier = getRoleMultiplier(role);
        const confidenceMultiplier = getConfidenceMultiplier(confidenceDelta);

        let calculatedPoints = Math.round(basePoints * roleMultiplier * confidenceMultiplier);
        
        // Apply bounds
        calculatedPoints = Math.max(5, Math.min(calculatedPoints, 150));

        // Check monthly cap (simplified - uses current skill points as proxy)
        const currentSkillPoints = skillPoints[skill] || 0;
        const monthlyCap = 200;
        if (currentSkillPoints >= monthlyCap) {
          errors.push(`Monthly cap reached for skill ${skill}`);
          continue;
        }

        // Award points
        const success = await awardHelixPoints(
          employeeId,
          skill,
          calculatedPoints,
          contribId,
          {
            contributionLevel: contributionLevel,
            role: role,
            confidenceDelta: confidenceDelta,
          }
        );

        if (success) {
          awards.push({
            skill: skill,
            pointsAwarded: calculatedPoints,
            sourceContributionId: contribId,
            contributionLevel: contributionLevel,
            role: role,
            confidenceDelta: confidenceDelta,
          });

          totalPointsAwarded += calculatedPoints;
          
          // Update skill points tracking
          skillPoints[skill] = (skillPoints[skill] || 0) + calculatedPoints;
        } else {
          errors.push(`Failed to award points for contribution ${contribId}`);
        }
      } catch (err) {
        console.error(`Error processing contribution ${contrib.id}:`, err);
        errors.push(`Error processing contribution ${contrib.id}: ${err.message}`);
      }
    }

    return {
      success: errors.length === 0,
      awards: awards,
      totalPointsAwarded: totalPointsAwarded,
      errors: errors,
    };
  } catch (error) {
    console.error("Error processing employee point awards:", error);
    return {
      success: false,
      error: error.message,
      awards: [],
    };
  }
};

/**
 * Get validated contributions ready for point awards
 * 
 * @param {string} employeeId - Employee UID
 * @returns {Promise<Array>} Array of contributions ready for points
 */
const getValidatedContributionsForPoints = async (employeeId) => {
  try {
    const q = query(
      collection(db, "project_skill_contributions"),
      where("employeeId", "==", employeeId),
      where("status", "==", "Validated"),
      where("appliedToConfidence", "==", true)
    );

    const querySnapshot = await getDocs(q);
    const contributions = [];

    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      // Only include contributions that haven't been awarded points yet
      if (!data.pointsAwarded) {
        contributions.push({
          id: docSnapshot.id,
          ...data,
        });
      }
    });

    return contributions;
  } catch (error) {
    console.error("Error fetching contributions for points:", error);
    return [];
  }
};

/**
 * Get base points for contribution level
 */
const getBasePoints = (level) => {
  const basePointsMap = {
    'Minor': 10,
    'Moderate': 25,
    'Significant': 50,
  };
  return basePointsMap[level] || 25;
};

/**
 * Get role multiplier
 */
const getRoleMultiplier = (role) => {
  const multipliers = {
    'Assistant': 0.7,
    'Contributor': 1.0,
    'Lead': 1.3,
    'Architect': 1.43,
  };
  return multipliers[role] || 1.0;
};

/**
 * Get confidence delta multiplier
 */
const getConfidenceMultiplier = (delta) => {
  if (delta <= 0) return 1.0;
  if (delta >= 5.0) {
    const factor = (delta / 5.0) * 1.1;
    return Math.min(factor, 2.0);
  }
  return 1.0;
};

/**
 * Process point awards for all employees
 * 
 * This can be called from a scheduled job
 * 
 * @returns {Promise<Object>} Processing summary
 */
export const processAllPointAwards = async () => {
  try {
    // Get all validated contributions that are ready for points
    const q = query(
      collection(db, "project_skill_contributions"),
      where("status", "==", "Validated"),
      where("appliedToConfidence", "==", true)
    );

    const querySnapshot = await getDocs(q);
    const contributionsByEmployee = {};

    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      if (!data.pointsAwarded) {
        const empId = data.employeeId;
        if (!contributionsByEmployee[empId]) {
          contributionsByEmployee[empId] = [];
        }
        contributionsByEmployee[empId].push({
          id: docSnapshot.id,
          ...data,
        });
      }
    });

    // Process each employee
    const results = {
      totalEmployees: Object.keys(contributionsByEmployee).length,
      totalAwards: 0,
      totalPointsAwarded: 0,
      totalErrors: 0,
      employeeResults: [],
    };

    for (const [employeeId, contribs] of Object.entries(contributionsByEmployee)) {
      const result = await processEmployeePointAwards(employeeId);
      results.totalAwards += result.awards?.length || 0;
      results.totalPointsAwarded += result.totalPointsAwarded || 0;
      results.totalErrors += result.errors?.length || 0;
      results.employeeResults.push({
        employeeId: employeeId,
        ...result,
      });
    }

    return results;
  } catch (error) {
    console.error("Error processing all point awards:", error);
    return {
      success: false,
      error: error.message,
      totalEmployees: 0,
      totalAwards: 0,
      totalPointsAwarded: 0,
      totalErrors: 0,
      employeeResults: [],
    };
  }
};

