/**
 * Progress Service - Firestore-backed employee progress data.
 * Collections: employees, employeeSkills/{id}/skills, employeeProjects/{id}/projects, performanceReviews/{id}/reviews.
 */

import { db } from "../config";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";

/**
 * Get employee overview from employees/{employeeId}.
 * @param {string} employeeId
 * @returns {Promise<{ name?: string, role?: string, department?: string, performanceScore?: number, completionRate?: number }>}
 */
export async function getEmployeeOverview(employeeId) {
  if (!employeeId) return {};
  try {
    const ref = doc(db, "employees", employeeId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return {};
    const data = snap.data();
    return {
      name: data.name ?? null,
      role: data.role ?? null,
      department: data.department ?? null,
      performanceScore: data.performanceScore != null ? Number(data.performanceScore) : null,
      completionRate: data.completionRate != null ? Number(data.completionRate) : null,
    };
  } catch (err) {
    console.error("[progressService] getEmployeeOverview error:", err);
    return {};
  }
}

/**
 * Get skills from employeeSkills/{employeeId}/skills subcollection.
 * @param {string} employeeId
 * @returns {Promise<Array<{ id: string, name?: string, level?: string, progress?: number }>>}
 */
export async function getEmployeeSkills(employeeId) {
  if (!employeeId) return [];
  try {
    const colRef = collection(db, "employeeSkills", employeeId, "skills");
    const snap = await getDocs(colRef);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name ?? "",
        level: data.level ?? "",
        progress: data.progress != null ? Number(data.progress) : 0,
      };
    });
  } catch (err) {
    console.error("[progressService] getEmployeeSkills error:", err);
    return [];
  }
}

/**
 * Get projects from employeeProjects/{employeeId}/projects subcollection.
 * @param {string} employeeId
 * @returns {Promise<Array<{ id: string, name?: string, status?: string, progress?: number }>>}
 */
export async function getEmployeeProjects(employeeId) {
  if (!employeeId) return [];
  try {
    const colRef = collection(db, "employeeProjects", employeeId, "projects");
    const snap = await getDocs(colRef);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name ?? "",
        status: (data.status ?? "active").toLowerCase(),
        progress: data.progress != null ? Number(data.progress) : 0,
      };
    });
  } catch (err) {
    console.error("[progressService] getEmployeeProjects error:", err);
    return [];
  }
}

/**
 * Get performance review history from performanceReviews/{employeeId}/reviews subcollection.
 * @param {string} employeeId
 * @returns {Promise<Array<{ id: string, score: number, createdAt: any }>>}
 */
export async function getPerformanceHistory(employeeId) {
  if (!employeeId) return [];
  try {
    const colRef = collection(db, "performanceReviews", employeeId, "reviews");
    const snap = await getDocs(colRef);
    const list = (snap.docs || []).map((d) => {
      const data = d.data();
      const createdAt = data.createdAt?.toDate?.() ?? data.createdAt ?? null;
      return {
        id: d.id,
        score: data.score != null ? Number(data.score) : 0,
        createdAt,
      };
    });
    list.sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tA - tB;
    });
    return list;
  } catch (err) {
    console.error("[progressService] getPerformanceHistory error:", err);
    return [];
  }
}
