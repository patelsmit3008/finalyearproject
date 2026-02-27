/**
 * Performance Reviews - Firestore collection `performance_reviews`.
 * Documents: employeeId, reviewedBy, cycle, overallScore, technical, communication, delivery, teamwork, notes, createdAt.
 */

import { db } from "../config";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

const COLLECTION = "performance_reviews";

/**
 * Add a performance review.
 * @param {Object} data
 * @param {string} data.employeeId - Employee user UID
 * @param {string} data.reviewedBy - PM/reviewer user UID
 * @param {string} [data.cycle] - Review cycle label (e.g. "Q1 2025")
 * @param {number} data.overallScore
 * @param {number} [data.technical]
 * @param {number} [data.communication]
 * @param {number} [data.delivery]
 * @param {number} [data.teamwork]
 * @param {string} [data.notes]
 * @returns {Promise<string>} Document ID
 */
export async function addPerformanceReview(data) {
  const ref = collection(db, COLLECTION);
  const docData = {
    employeeId: data.employeeId,
    reviewedBy: data.reviewedBy,
    cycle: data.cycle ?? "",
    overallScore: Number(data.overallScore) ?? 0,
    technical: data.technical != null ? Number(data.technical) : null,
    communication: data.communication != null ? Number(data.communication) : null,
    delivery: data.delivery != null ? Number(data.delivery) : null,
    teamwork: data.teamwork != null ? Number(data.teamwork) : null,
    notes: data.notes ?? "",
    createdAt: serverTimestamp(),
  };
  const snap = await addDoc(ref, docData);
  return snap.id;
}

/**
 * Fetch all performance reviews for an employee, sorted by createdAt ascending.
 * @param {string} employeeId - User UID
 * @returns {Promise<Array<{ id: string, employeeId: string, reviewedBy: string, cycle: string, overallScore: number, technical?: number, communication?: number, delivery?: number, teamwork?: number, notes: string, createdAt: any }>>}
 */
export async function getPerformanceReviewsByEmployeeId(employeeId) {
  if (!employeeId) return [];
  try {
    const ref = collection(db, COLLECTION);
    const q = query(ref, where("employeeId", "==", employeeId));
    const snapshot = await getDocs(q);
    const list = snapshot.docs.map((d) => {
      const data = d.data();
      const createdAt = data.createdAt?.toDate?.() ?? data.createdAt ?? null;
      return {
        id: d.id,
        employeeId: data.employeeId ?? "",
        reviewedBy: data.reviewedBy ?? "",
        cycle: data.cycle ?? "",
        overallScore: data.overallScore != null ? Number(data.overallScore) : 0,
        technical: data.technical != null ? Number(data.technical) : null,
        communication: data.communication != null ? Number(data.communication) : null,
        delivery: data.delivery != null ? Number(data.delivery) : null,
        teamwork: data.teamwork != null ? Number(data.teamwork) : null,
        notes: data.notes ?? "",
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
    console.error("[performanceReviewsService] getPerformanceReviewsByEmployeeId error:", err);
    return [];
  }
}
