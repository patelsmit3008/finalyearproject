/**
 * Project Contributions Service - Firestore operations for skill contribution tracking
 * 
 * Handles CRUD operations for project_skill_contributions collection
 * Used by Module 4C (tracking) and Module 4D (validation)
 */

import { db } from "../config";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Create a new project skill contribution record
 * 
 * @param {Object} contributionData - Contribution data
 * @returns {Promise<string|null>} Document ID or null on failure
 */
export const createProjectContribution = async (contributionData) => {
  try {
    // Extract skill and role (support both field names for compatibility)
    const skillUsed = contributionData.skillUsed || contributionData.skill;
    const roleInProject = contributionData.roleInProject || contributionData.role || "Contributor";
    
    // Validate required fields
    if (!contributionData.employeeId || !contributionData.projectId || !skillUsed) {
      console.error("Project Contribution: Missing required fields (employeeId, projectId, skillUsed)");
      return null;
    }

    const contribution = {
      employeeId: contributionData.employeeId,
      employeeName: contributionData.employeeName || "Unknown",
      projectId: contributionData.projectId,
      projectName: contributionData.projectName || "Unknown Project",
      skillUsed: skillUsed, // Exact field name as per requirements
      roleInProject: roleInProject, // Exact field name as per requirements
      contributionLevel: contributionData.contributionLevel || "Moderate",
      confidenceImpact: contributionData.confidenceImpact || 0.0,
      status: "Pending", // Always start as Pending
      submittedAt: serverTimestamp(),
      validatedAt: null,
      validatedBy: null,
      managerComment: null,
    };

    const docRef = await addDoc(collection(db, "project_skill_contributions"), contribution);
    console.log("Project contribution created:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Error creating project contribution:", error);
    return null;
  }
};

/**
 * Fetch pending contributions (for PM validation) - One-time query
 * 
 * @returns {Promise<Array>} Array of pending contribution records
 */
export const getPendingContributions = async () => {
  try {
    const q = query(
      collection(db, "project_skill_contributions"),
      where("status", "==", "Pending"),
      orderBy("submittedAt", "desc")
    );

    const querySnapshot = await getDocs(q);
    const contributions = [];

    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      contributions.push({
        id: docSnapshot.id,
        ...data,
        submittedAt: data.submittedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        validatedAt: data.validatedAt?.toDate?.()?.toISOString() || null,
      });
    });

    return contributions;
  } catch (error) {
    console.error("Error fetching pending contributions:", error);
    return [];
  }
};

/**
 * Get query and callbacks for pending contributions. Use inside useEffect with onSnapshot; return unsubscribe in cleanup.
 * @param {Function} callback - Callback function that receives contributions array
 * @returns {{ query: Query, onNext: (querySnapshot) => void, onError: (error) => void }}
 */
export const getPendingContributionsSubscription = (callback) => {
  const q = query(
    collection(db, "project_skill_contributions"),
    where("status", "==", "Pending"),
    orderBy("submittedAt", "desc")
  );
  const onNext = (querySnapshot) => {
    const contributions = [];
    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      contributions.push({
        id: docSnapshot.id,
        employeeId: data.employeeId,
        employeeName: data.employeeName || "Unknown",
        projectId: data.projectId,
        projectName: data.projectName || "Unknown Project",
        skillUsed: data.skillUsed || data.skill,
        roleInProject: data.roleInProject || data.role,
        contributionLevel: data.contributionLevel || "Moderate",
        confidenceImpact: data.confidenceImpact || 0,
        status: data.status,
        submittedAt: data.submittedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        validatedAt: data.validatedAt?.toDate?.()?.toISOString() || null,
        validatedBy: data.validatedBy || null,
        managerComment: data.managerComment || null,
        managerNote: data.managerNote || null,
        rejectionFeedback: data.rejectionFeedback || null,
      });
    });
    callback(contributions);
  };
  const onError = (error) => {
    console.error("[PM Portal] ❌ Error in pending contributions listener:", error);
    if (error.code === 'failed-precondition') {
      console.error("[PM Portal] ⚠️ Firestore index missing! Fields: status (Ascending), submittedAt (Descending)");
    }
    callback([]);
  };
  return { query: q, onNext, onError };
};

/**
 * Fetch all contributions for an employee - One-time query
 * 
 * @param {string} employeeId - Employee UID
 * @param {string} status - Optional status filter
 * @returns {Promise<Array>} Array of contribution records
 */
export const getEmployeeContributions = async (employeeId, status = null) => {
  try {
    if (!employeeId) {
      console.error("Project Contribution: employeeId is required");
      return [];
    }

    let q = query(
      collection(db, "project_skill_contributions"),
      where("employeeId", "==", employeeId),
      orderBy("submittedAt", "desc")
    );

    if (status) {
      q = query(
        collection(db, "project_skill_contributions"),
        where("employeeId", "==", employeeId),
        where("status", "==", status),
        orderBy("submittedAt", "desc")
      );
    }

    const querySnapshot = await getDocs(q);
    const contributions = [];

    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      contributions.push({
        id: docSnapshot.id,
        ...data,
        submittedAt: data.submittedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        validatedAt: data.validatedAt?.toDate?.()?.toISOString() || null,
      });
    });

    return contributions;
  } catch (error) {
    console.error("Error fetching employee contributions:", error);
    return [];
  }
};

/**
 * Get query and callbacks for employee contributions. Use inside useEffect with onSnapshot; return unsubscribe in cleanup.
 * @param {string} employeeId - Employee UID
 * @param {Function} callback - Callback function that receives contributions array
 * @param {string} status - Optional status filter
 * @returns {{ query: Query, onNext: (querySnapshot) => void, onError: (error) => void } | null} null if no employeeId
 */
export const getEmployeeContributionsSubscription = (employeeId, callback, status = null) => {
  if (!employeeId) {
    console.error("[Employee Contributions] employeeId is required");
    callback([]);
    return null;
  }
  let q = query(
    collection(db, "project_skill_contributions"),
    where("employeeId", "==", employeeId),
    orderBy("submittedAt", "desc")
  );
  if (status) {
    q = query(
      collection(db, "project_skill_contributions"),
      where("employeeId", "==", employeeId),
      where("status", "==", status),
      orderBy("submittedAt", "desc")
    );
  }
  const onNext = (querySnapshot) => {
    const contributions = [];
    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      contributions.push({
        id: docSnapshot.id,
        employeeId: data.employeeId,
        employeeName: data.employeeName || "Unknown",
        projectId: data.projectId,
        projectName: data.projectName || "Unknown Project",
        skillUsed: data.skillUsed || data.skill,
        roleInProject: data.roleInProject || data.role,
        contributionLevel: data.contributionLevel || "Moderate",
        confidenceImpact: data.confidenceImpact || 0,
        status: data.status,
        submittedAt: data.submittedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        validatedAt: data.validatedAt?.toDate?.()?.toISOString() || null,
        validatedBy: data.validatedBy || null,
        managerComment: data.managerComment || null,
        managerNote: data.managerNote || null,
        rejectionFeedback: data.rejectionFeedback || null,
      });
    });
    callback(contributions);
  };
  const onError = (error) => {
    console.error("[Employee Contributions] ❌ Error in Firestore listener:", error);
    if (error.code === 'failed-precondition') {
      console.error("[Employee Contributions] ⚠️ Firestore index missing! Fields: employeeId (Ascending), submittedAt (Descending)");
    }
    callback([]);
  };
  return { query: q, onNext, onError };
};

/**
 * Validate or reject a contribution (Module 4D)
 * 
 * @param {string} contributionId - Contribution document ID
 * @param {string} validatedBy - PM UID or name
 * @param {boolean} approved - True for validated, false for rejected
 * @param {string} managerComment - Optional comment from PM (deprecated, use rejectionFeedback for rejections, managerNote for validations)
 * @param {string} rejectionFeedback - Rejection feedback message (for rejections)
 * @param {string} pmUserId - PM user ID for rejectionFeedback.createdBy
 * @param {string} managerNote - Manager note (for validations, visible to employee)
 * @returns {Promise<boolean>} Success status
 */
export const validateContribution = async (
  contributionId,
  validatedBy,
  approved = true,
  managerComment = null,
  rejectionFeedback = null,
  pmUserId = null,
  managerNote = null
) => {
  try {
    if (!contributionId || !validatedBy) {
      console.error("Project Contribution: contributionId and validatedBy are required");
      return false;
    }

    const updateData = {
      status: approved ? "Validated" : "Rejected",
      validatedBy: validatedBy,
      validatedAt: serverTimestamp(),
    };

    // For validations, store manager note
    if (approved && managerNote) {
      updateData.managerNote = managerNote.trim();
    }

    // For rejections, store structured rejection feedback
    if (!approved && rejectionFeedback) {
      updateData.rejectionFeedback = {
        message: rejectionFeedback.trim(),
        createdAt: serverTimestamp(),
        createdBy: pmUserId || validatedBy,
      };
    }

    // Legacy support: managerComment for backward compatibility
    if (managerComment) {
      updateData.managerComment = managerComment.trim();
    }

    await updateDoc(doc(db, "project_skill_contributions", contributionId), updateData);
    console.log(`Contribution ${contributionId} ${approved ? 'validated' : 'rejected'} by ${validatedBy}`);
    return true;
  } catch (error) {
    console.error("Error validating contribution:", error);
    return false;
  }
};

/**
 * Fetch contributions by project
 * 
 * @param {string} projectId - Project identifier
 * @returns {Promise<Array>} Array of contribution records
 */
export const getProjectContributions = async (projectId) => {
  try {
    if (!projectId) {
      console.error("Project Contribution: projectId is required");
      return [];
    }

    const q = query(
      collection(db, "project_skill_contributions"),
      where("projectId", "==", projectId),
      orderBy("submittedAt", "desc")
    );

    const querySnapshot = await getDocs(q);
    const contributions = [];

    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      contributions.push({
        id: docSnapshot.id,
        ...data,
        submittedAt: data.submittedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        validatedAt: data.validatedAt?.toDate?.()?.toISOString() || null,
      });
    });

    return contributions;
  } catch (error) {
    console.error("Error fetching project contributions:", error);
    return [];
  }
};

