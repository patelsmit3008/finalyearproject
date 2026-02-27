/**
 * Skill Confidence Service - Firestore operations for employee skill confidence
 * 
 * Handles storage and retrieval of skill confidence data
 * Used by Module 4B (initialization) and Module 4E (updates)
 */

import { db } from "../config";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Initialize skill confidence from resume (Module 4B)
 * 
 * @param {string} employeeId - Employee UID
 * @param {Array} skillConfidenceList - List of skill confidence objects from Module 4B
 * @returns {Promise<boolean>} Success status
 */
export const initializeSkillConfidence = async (employeeId, skillConfidenceList) => {
  try {
    if (!employeeId || !skillConfidenceList || skillConfidenceList.length === 0) {
      console.error("Skill Confidence: Missing employeeId or skillConfidenceList");
      return false;
    }

    const confidenceDoc = {
      employeeId: employeeId,
      skills: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Convert list to object format
    skillConfidenceList.forEach((skillConf) => {
      confidenceDoc.skills[skillConf.skill] = {
        confidence: skillConf.confidence,
        source: skillConf.source || 'resume',
        status: skillConf.status || 'baseline',
        initializedAt: serverTimestamp(),
      };
    });

    await setDoc(doc(db, "skill_confidence", employeeId), confidenceDoc);
    console.log(`Skill confidence initialized for employee: ${employeeId}`);
    return true;
  } catch (error) {
    console.error("Error initializing skill confidence:", error);
    return false;
  }
};

/**
 * Get current skill confidence for an employee
 * 
 * @param {string} employeeId - Employee UID
 * @returns {Promise<Object|null>} Skill confidence object or null
 */
export const getSkillConfidence = async (employeeId) => {
  try {
    if (!employeeId) {
      console.error("Skill Confidence: employeeId is required");
      return null;
    }

    const docRef = doc(db, "skill_confidence", employeeId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        employeeId: data.employeeId,
        skills: data.skills || {},
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
      };
    }

    return null;
  } catch (error) {
    console.error("Error fetching skill confidence:", error);
    return null;
  }
};

/**
 * Update skill confidence from validated contribution (Module 4E)
 * 
 * @param {string} employeeId - Employee UID
 * @param {string} skill - Skill name
 * @param {number} oldConfidence - Previous confidence value
 * @param {number} newConfidence - New confidence value
 * @param {string} sourceContributionId - ID of contribution that triggered update
 * @param {Object} contributionData - Additional contribution data for audit
 * @returns {Promise<boolean>} Success status
 */
export const updateSkillConfidence = async (
  employeeId,
  skill,
  oldConfidence,
  newConfidence,
  sourceContributionId,
  contributionData = {}
) => {
  try {
    if (!employeeId || !skill || oldConfidence === undefined || newConfidence === undefined) {
      console.error("Skill Confidence: Missing required fields");
      return false;
    }

    // Validate confidence bounds
    if (newConfidence < 0 || newConfidence > 100) {
      console.error(`Skill Confidence: Invalid confidence value: ${newConfidence}`);
      return false;
    }

    // Get current document
    const docRef = doc(db, "skill_confidence", employeeId);
    const docSnap = await getDoc(docRef);

    let skills = {};
    if (docSnap.exists()) {
      skills = docSnap.data().skills || {};
    }

    // Get previous confidence history
    const previousHistory = skills[skill]?.history || [];

    // Update skill confidence
    skills[skill] = {
      confidence: newConfidence,
      source: 'project_contribution',
      status: 'validated',
      updatedAt: serverTimestamp(),
      history: [
        ...previousHistory,
        {
          oldConfidence: oldConfidence,
          newConfidence: newConfidence,
          increment: newConfidence - oldConfidence,
          sourceContributionId: sourceContributionId,
          contributionLevel: contributionData.contributionLevel,
          role: contributionData.role,
          appliedAt: serverTimestamp(),
        }
      ],
      // Preserve initialization data if exists
      initializedAt: skills[skill]?.initializedAt || serverTimestamp(),
    };

    // Update document
    await updateDoc(docRef, {
      skills: skills,
      updatedAt: serverTimestamp(),
    });

    // Log confidence update
    await logConfidenceUpdate({
      employeeId,
      skill,
      oldConfidence,
      newConfidence,
      sourceContributionId,
      contributionData,
    });

    console.log(`Skill confidence updated: ${employeeId} - ${skill}: ${oldConfidence}% -> ${newConfidence}%`);
    return true;
  } catch (error) {
    console.error("Error updating skill confidence:", error);
    return false;
  }
};

/**
 * Mark contribution as applied to confidence
 * 
 * @param {string} contributionId - Contribution document ID
 * @returns {Promise<boolean>} Success status
 */
export const markContributionAsApplied = async (contributionId) => {
  try {
    if (!contributionId) {
      console.error("Skill Confidence: contributionId is required");
      return false;
    }

    const contribRef = doc(db, "project_skill_contributions", contributionId);
    await updateDoc(contribRef, {
      appliedToConfidence: true,
      appliedAt: serverTimestamp(),
    });

    console.log(`Contribution marked as applied: ${contributionId}`);
    return true;
  } catch (error) {
    console.error("Error marking contribution as applied:", error);
    return false;
  }
};

/**
 * Log confidence update for audit trail
 * 
 * @param {Object} updateData - Update data
 * @returns {Promise<boolean>} Success status
 */
const logConfidenceUpdate = async (updateData) => {
  try {
    await addDoc(collection(db, "confidence_update_logs"), {
      employeeId: updateData.employeeId,
      skill: updateData.skill,
      oldConfidence: updateData.oldConfidence,
      newConfidence: updateData.newConfidence,
      increment: updateData.newConfidence - updateData.oldConfidence,
      sourceContributionId: updateData.sourceContributionId,
      contributionLevel: updateData.contributionData?.contributionLevel,
      role: updateData.contributionData?.role,
      appliedAt: serverTimestamp(),
    });

    return true;
  } catch (error) {
    console.error("Error logging confidence update:", error);
    return false;
  }
};

/**
 * Get confidence update history for an employee
 * 
 * @param {string} employeeId - Employee UID
 * @param {string} skill - Optional skill filter
 * @returns {Promise<Array>} Array of update log records
 */
export const getConfidenceUpdateHistory = async (employeeId, skill = null) => {
  try {
    if (!employeeId) {
      console.error("Skill Confidence: employeeId is required");
      return [];
    }

    let q = query(
      collection(db, "confidence_update_logs"),
      where("employeeId", "==", employeeId),
      orderBy("appliedAt", "desc")
    );

    if (skill) {
      q = query(
        collection(db, "confidence_update_logs"),
        where("employeeId", "==", employeeId),
        where("skill", "==", skill),
        orderBy("appliedAt", "desc")
      );
    }

    const querySnapshot = await getDocs(q);
    const logs = [];

    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      logs.push({
        id: docSnapshot.id,
        ...data,
        appliedAt: data.appliedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      });
    });

    return logs;
  } catch (error) {
    console.error("Error fetching confidence update history:", error);
    return [];
  }
};

