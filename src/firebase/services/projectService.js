/**
 * Firebase Project Service - Employee-facing project queries.
 * Uses "projects" collection + "project_interests" for approved assignments.
 * Active = project status "In Progress" AND user approved in project_interests.
 * Completed = project status "Completed" AND user approved in project_interests.
 */

import { db } from "../config";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";

function normalizeProjectStatus(s) {
  if (!s) return "";
  return String(s).toLowerCase().replace(/\s+/g, " ").replace(/_/g, " ");
}

/**
 * Get projects where the employee is approved (from project_interests).
 * - Active: project.status is "In Progress" and interest.status is "approved"
 * - Completed: project.status is "Completed" and interest.status is "approved"
 * Single source of truth: projects collection.
 *
 * @param {string} uid - Current user (employee) UID
 * @returns {Promise<{ activeProjects: Array<{ id: string, name: string, status: string, progress: number }>, completedProjects: Array<{ id: string, name: string, status: string, progress: number }> }>}
 */
export async function getEmployeeProjects(uid) {
  const empty = { activeProjects: [], completedProjects: [] };
  if (!uid) return empty;

  try {
    // 1. Fetch approved interests for this user
    const interestsRef = collection(db, "project_interests");
    const q = query(
      interestsRef,
      where("employeeId", "==", uid),
      where("status", "==", "approved")
    );
    const interestsSnap = await getDocs(q);
    const projectIds = interestsSnap.docs
      .map((d) => d.data().projectId)
      .filter(Boolean);

    if (projectIds.length === 0) {
      return empty;
    }

    // 2. Fetch each project from projects collection (single source of truth)
    const activeProjects = [];
    const completedProjects = [];

    for (const projectId of projectIds) {
      const projectRef = doc(db, "projects", projectId);
      const projectSnap = await getDoc(projectRef);
      if (!projectSnap.exists()) continue;

      const data = projectSnap.data();
      const status = normalizeProjectStatus(data.status ?? "");
      const name = data.name ?? data.projectName ?? data.title ?? "Untitled Project";
      const progress = data.progress != null ? Number(data.progress) : 0;
      const rawStatus = data.status ?? "";

      const project = {
        id: projectSnap.id,
        name,
        status: rawStatus,
        progress,
      };

      if (status === "completed") {
        completedProjects.push(project);
      } else if (status === "in progress" || status === "in_progress" || status === "active") {
        activeProjects.push(project);
      }
    }

    return { activeProjects, completedProjects };
  } catch (err) {
    console.error("[projectService] getEmployeeProjects error:", err);
    return empty;
  }
}
