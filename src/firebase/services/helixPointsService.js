/**
 * Helix Points Service - Firestore operations for Helix Points
 * 
 * Handles storage and retrieval of Helix Points data
 * Used by Module 4F (Helix Points Engine)
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
  increment,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Initialize Helix Points for an employee
 * 
 * @param {string} employeeId - Employee UID
 * @param {number} initialPoints - Initial points (default: 0)
 * @returns {Promise<boolean>} Success status
 */
export const initializeHelixPoints = async (employeeId, initialPoints = 0) => {
  try {
    if (!employeeId) {
      console.error("Helix Points: employeeId is required");
      return false;
    }

    const pointsDoc = {
      employeeId: employeeId,
      totalPoints: initialPoints,
      skillPoints: {},  // Per-skill points tracking
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, "helix_points", employeeId), pointsDoc);
    console.log(`Helix Points initialized for employee: ${employeeId}`);
    return true;
  } catch (error) {
    console.error("Error initializing Helix Points:", error);
    return false;
  }
};

/**
 * Get current Helix Points for an employee
 * 
 * @param {string} employeeId - Employee UID
 * @returns {Promise<Object|null>} Helix Points object or null
 */
export const getHelixPoints = async (employeeId) => {
  try {
    if (!employeeId) {
      console.error("Helix Points: employeeId is required");
      return null;
    }

    const docRef = doc(db, "helix_points", employeeId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        employeeId: data.employeeId,
        totalPoints: data.totalPoints || 0,
        skillPoints: data.skillPoints || {},
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
      };
    }

    return null;
  } catch (error) {
    console.error("Error fetching Helix Points:", error);
    return null;
  }
};

/**
 * Award Helix Points from validated contribution (Module 4F)
 * 
 * @param {string} employeeId - Employee UID
 * @param {string} skill - Skill name
 * @param {number} pointsAwarded - Points to award
 * @param {string} sourceContributionId - ID of contribution that triggered award
 * @param {Object} awardData - Additional award data for audit
 * @returns {Promise<boolean>} Success status
 */
export const awardHelixPoints = async (
  employeeId,
  skill,
  pointsAwarded,
  sourceContributionId,
  awardData = {}
) => {
  try {
    if (!employeeId || !skill || pointsAwarded === undefined || !sourceContributionId) {
      console.error("Helix Points: Missing required fields");
      return false;
    }

    if (pointsAwarded <= 0) {
      console.error("Helix Points: pointsAwarded must be positive");
      return false;
    }

    // Get current document
    const docRef = doc(db, "helix_points", employeeId);
    const docSnap = await getDoc(docRef);

    let currentTotal = 0;
    let skillPoints = {};

    if (docSnap.exists()) {
      currentTotal = docSnap.data().totalPoints || 0;
      skillPoints = docSnap.data().skillPoints || {};
    } else {
      // Initialize if doesn't exist
      await initializeHelixPoints(employeeId, 0);
    }

    // Update total points
    const newTotal = currentTotal + pointsAwarded;

    // Update skill points
    const currentSkillPoints = skillPoints[skill] || 0;
    skillPoints[skill] = currentSkillPoints + pointsAwarded;

    // Update document
    await updateDoc(docRef, {
      totalPoints: newTotal,
      skillPoints: skillPoints,
      updatedAt: serverTimestamp(),
    });

    // Mark contribution as points awarded
    await markContributionPointsAwarded(sourceContributionId);

    // Log point award
    await logPointAward({
      employeeId,
      skill,
      pointsAwarded,
      sourceContributionId,
      totalPointsAfter: newTotal,
      awardData,
    });

    console.log(`Helix Points awarded: ${employeeId} - ${skill}: +${pointsAwarded} (Total: ${newTotal})`);
    return true;
  } catch (error) {
    console.error("Error awarding Helix Points:", error);
    return false;
  }
};

/**
 * Mark contribution as having points awarded
 * 
 * @param {string} contributionId - Contribution document ID
 * @returns {Promise<boolean>} Success status
 */
export const markContributionPointsAwarded = async (contributionId) => {
  try {
    if (!contributionId) {
      console.error("Helix Points: contributionId is required");
      return false;
    }

    const contribRef = doc(db, "project_skill_contributions", contributionId);
    await updateDoc(contribRef, {
      pointsAwarded: true,
      pointsAwardedAt: serverTimestamp(),
    });

    console.log(`Contribution marked as points awarded: ${contributionId}`);
    return true;
  } catch (error) {
    console.error("Error marking contribution as points awarded:", error);
    return false;
  }
};

/**
 * Log point award for audit trail
 * 
 * @param {Object} awardData - Award data
 * @returns {Promise<boolean>} Success status
 */
const logPointAward = async (awardData) => {
  try {
    await addDoc(collection(db, "helix_points_logs"), {
      employeeId: awardData.employeeId,
      skill: awardData.skill,
      pointsAwarded: awardData.pointsAwarded,
      sourceContributionId: awardData.sourceContributionId,
      totalPointsAfter: awardData.totalPointsAfter,
      contributionLevel: awardData.awardData?.contributionLevel,
      role: awardData.awardData?.role,
      confidenceDelta: awardData.awardData?.confidenceDelta,
      awardedAt: serverTimestamp(),
    });

    return true;
  } catch (error) {
    console.error("Error logging point award:", error);
    return false;
  }
};

/**
 * Get point award history for an employee
 * 
 * @param {string} employeeId - Employee UID
 * @param {string} skill - Optional skill filter
 * @returns {Promise<Array>} Array of point award log records
 */
export const getPointAwardHistory = async (employeeId, skill = null) => {
  try {
    if (!employeeId) {
      console.error("Helix Points: employeeId is required");
      return [];
    }

    let q = query(
      collection(db, "helix_points_logs"),
      where("employeeId", "==", employeeId),
      orderBy("awardedAt", "desc")
    );

    if (skill) {
      q = query(
        collection(db, "helix_points_logs"),
        where("employeeId", "==", employeeId),
        where("skill", "==", skill),
        orderBy("awardedAt", "desc")
      );
    }

    const querySnapshot = await getDocs(q);
    const logs = [];

    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      logs.push({
        id: docSnapshot.id,
        ...data,
        awardedAt: data.awardedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      });
    });

    return logs;
  } catch (error) {
    console.error("Error fetching point award history:", error);
    return [];
  }
};

/**
 * Get top employees by Helix Points
 * 
 * @param {number} limit - Number of top employees to return
 * @returns {Promise<Array>} Array of employee point records
 */
export const getTopEmployeesByPoints = async (limit = 10) => {
  try {
    const q = query(
      collection(db, "helix_points"),
      orderBy("totalPoints", "desc")
    );

    const querySnapshot = await getDocs(q);
    const employees = [];

    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      employees.push({
        employeeId: data.employeeId,
        totalPoints: data.totalPoints || 0,
        skillPoints: data.skillPoints || {},
      });
    });

    return employees.slice(0, limit);
  } catch (error) {
    console.error("Error fetching top employees:", error);
    return [];
  }
};

