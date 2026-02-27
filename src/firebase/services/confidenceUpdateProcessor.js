/**
 * Confidence Update Processor - Integration layer for Module 4E
 * 
 * This module processes validated contributions and updates skill confidence
 * Integrates backend logic (skill_confidence_updater.py) with Firestore
 */

import { getPendingContributions, getEmployeeContributions } from './projectContributionsService';
import { getSkillConfidence, updateSkillConfidence, markContributionAsApplied } from './skillConfidenceService';
import { db } from '../config';
import { collection, query, where, getDocs } from 'firebase/firestore';

/**
 * Get all validated contributions that haven't been applied yet
 * 
 * @returns {Promise<Array>} Array of validated, unapplied contributions
 */
export const getValidatedUnappliedContributions = async () => {
  try {
    // Fetch all validated contributions
    const q = query(
      collection(db, "project_skill_contributions"),
      where("status", "==", "Validated")
    );

    const querySnapshot = await getDocs(q);
    const contributions = [];

    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      // Only include contributions that haven't been applied
      if (!data.appliedToConfidence) {
        contributions.push({
          id: docSnapshot.id,
          ...data,
          submittedAt: data.submittedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          validatedAt: data.validatedAt?.toDate?.()?.toISOString() || null,
        });
      }
    });

    return contributions;
  } catch (error) {
    console.error("Error fetching validated unapplied contributions:", error);
    return [];
  }
};

/**
 * Process confidence updates for a specific employee
 * 
 * This function:
 * 1. Fetches validated contributions for the employee
 * 2. Gets current skill confidence
 * 3. Calculates updates (using backend logic principles)
 * 4. Applies updates to Firestore
 * 5. Marks contributions as applied
 * 
 * @param {string} employeeId - Employee UID
 * @returns {Promise<Object>} Processing result
 */
export const processEmployeeConfidenceUpdates = async (employeeId) => {
  try {
    if (!employeeId) {
      return {
        success: false,
        error: "employeeId is required",
        updates: [],
      };
    }

    // Get validated contributions for this employee
    const contributions = await getEmployeeContributions(employeeId, 'Validated');
    const unappliedContributions = contributions.filter(c => !c.appliedToConfidence);

    if (unappliedContributions.length === 0) {
      return {
        success: true,
        message: "No unapplied validated contributions found",
        updates: [],
      };
    }

    // Get current skill confidence
    const currentConfidenceDoc = await getSkillConfidence(employeeId);
    const currentConfidence = currentConfidenceDoc?.skills || {};

    // Convert to simple object format for processing
    const currentConfidenceMap = {};
    Object.keys(currentConfidence).forEach(skill => {
      currentConfidenceMap[skill] = currentConfidence[skill].confidence || 0;
    });

    // Process updates (simplified version of backend logic)
    const updates = [];
    const appliedIds = [];
    const errors = [];

    // Group contributions by skill
    const skillContributions = {};
    unappliedContributions.forEach(contrib => {
      const skill = contrib.skill;
      if (!skillContributions[skill]) {
        skillContributions[skill] = [];
      }
      skillContributions[skill].push(contrib);
    });

    // Process each skill
    for (const [skill, contribs] of Object.entries(skillContributions)) {
      let currentConf = currentConfidenceMap[skill] || 0;
      let existingCount = 0; // Count of already applied contributions for diminishing returns

      for (const contrib of contribs) {
        try {
          // Calculate increment with diminishing returns
          const baseImpact = contrib.confidenceImpact || 0;
          const role = contrib.role || 'Contributor';
          const contributionLevel = contrib.contributionLevel || 'Moderate';

          // Role multipliers
          const roleMultipliers = {
            'Architect': 1.2,
            'Lead': 1.1,
            'Contributor': 1.0,
            'Assistant': 0.8
          };
          const roleMultiplier = roleMultipliers[role] || 1.0;

          // Diminishing returns factor
          const diminishingFactor = Math.pow(0.8, existingCount);

          // Calculate increment
          let increment = baseImpact * roleMultiplier * diminishingFactor;
          increment = Math.round(increment * 100) / 100; // Round to 2 decimals

          // Apply monthly cap (simplified - 15% per month)
          const monthlyCap = 15;
          const oldConf = currentConf;
          const newConf = Math.min(100, Math.max(0, currentConf + increment));

          // Ensure we don't exceed monthly cap
          const actualIncrement = Math.min(newConf - oldConf, monthlyCap - (currentConf - (currentConfidenceMap[skill] || 0)));

          if (actualIncrement > 0) {
            const finalNewConf = oldConf + actualIncrement;

            // Update in Firestore
            const updateSuccess = await updateSkillConfidence(
              employeeId,
              skill,
              oldConf,
              finalNewConf,
              contrib.id,
              {
                contributionLevel: contributionLevel,
                role: role,
              }
            );

            if (updateSuccess) {
              // Mark contribution as applied
              await markContributionAsApplied(contrib.id);

              updates.push({
                skill: skill,
                oldConfidence: oldConf,
                newConfidence: finalNewConf,
                increment: actualIncrement,
                sourceContributionId: contrib.id,
              });

              appliedIds.push(contrib.id);
              currentConf = finalNewConf;
              existingCount++;
            } else {
              errors.push(`Failed to update confidence for ${skill} from contribution ${contrib.id}`);
            }
          }
        } catch (err) {
          console.error(`Error processing contribution ${contrib.id}:`, err);
          errors.push(`Error processing contribution ${contrib.id}: ${err.message}`);
        }
      }
    }

    return {
      success: errors.length === 0,
      updates: updates,
      appliedContributionIds: appliedIds,
      errors: errors,
    };
  } catch (error) {
    console.error("Error processing employee confidence updates:", error);
    return {
      success: false,
      error: error.message,
      updates: [],
    };
  }
};

/**
 * Process confidence updates for all employees with validated contributions
 * 
 * This can be called from a scheduled job or admin function
 * 
 * @returns {Promise<Object>} Processing summary
 */
export const processAllConfidenceUpdates = async () => {
  try {
    // Get all validated, unapplied contributions
    const contributions = await getValidatedUnappliedContributions();

    // Group by employee
    const employeeContributions = {};
    contributions.forEach(contrib => {
      const empId = contrib.employeeId;
      if (!employeeContributions[empId]) {
        employeeContributions[empId] = [];
      }
      employeeContributions[empId].push(contrib);
    });

    // Process each employee
    const results = {
      totalEmployees: Object.keys(employeeContributions).length,
      totalUpdates: 0,
      totalErrors: 0,
      employeeResults: [],
    };

    for (const [employeeId, contribs] of Object.entries(employeeContributions)) {
      const result = await processEmployeeConfidenceUpdates(employeeId);
      results.totalUpdates += result.updates?.length || 0;
      results.totalErrors += result.errors?.length || 0;
      results.employeeResults.push({
        employeeId: employeeId,
        ...result,
      });
    }

    return results;
  } catch (error) {
    console.error("Error processing all confidence updates:", error);
    return {
      success: false,
      error: error.message,
      totalEmployees: 0,
      totalUpdates: 0,
      totalErrors: 0,
      employeeResults: [],
    };
  }
};

