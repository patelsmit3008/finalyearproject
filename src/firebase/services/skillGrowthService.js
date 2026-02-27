/**
 * Skill Growth Service - employees/{employeeId}/skillGrowth/{skillId}
 * PM can add progress % and note; employee sees progress bar + note.
 */

import { db } from "../config";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

const LEVELS = ["Beginner", "Intermediate", "Advanced"];

function toSkillId(skillName) {
  if (!skillName || typeof skillName !== "string") return "unknown";
  return skillName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "") || "skill";
}

/**
 * Get all skill growth records for an employee. Sorted by updatedAt desc.
 * @param {string} employeeId - Employee UID
 * @returns {Promise<Array<{ id: string, skillName: string, level: string, progress: number, pmNote: string, projectId?: string, projectName?: string, updatedAt: any }>>}
 */
export async function getEmployeeSkillGrowth(employeeId) {
  if (!employeeId) return [];
  try {
    const colRef = collection(db, "employees", employeeId, "skillGrowth");
    const snap = await getDocs(colRef);
    const list = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        skillName: data.skillName ?? "",
        level: data.level ?? "Beginner",
        progress: data.progress != null ? Number(data.progress) : 0,
        pmNote: data.pmNote ?? "",
        projectId: data.projectId ?? null,
        projectName: data.projectName ?? null,
        updatedAt: data.updatedAt ?? null,
      };
    });
    list.sort((a, b) => {
      const tA = a.updatedAt?.toDate?.()?.getTime?.() ?? 0;
      const tB = b.updatedAt?.toDate?.()?.getTime?.() ?? 0;
      return tB - tA;
    });
    return list;
  } catch (err) {
    console.error("[skillGrowthService] getEmployeeSkillGrowth error:", err);
    return [];
  }
}

/**
 * Create or update a skill growth record.
 * @param {string} employeeId - Employee UID
 * @param {{ skillName: string, level?: string, progress?: number, pmNote?: string, projectId?: string | null, projectName?: string | null }} skillData
 * @returns {Promise<void>}
 */
export async function upsertEmployeeSkillGrowth(employeeId, skillData) {
  if (!employeeId || !skillData?.skillName) {
    console.warn("[skillGrowthService] upsert: missing employeeId or skillName");
    return;
  }
  try {
    const skillId = toSkillId(skillData.skillName);
    const ref = doc(db, "employees", employeeId, "skillGrowth", skillId);
    const level = LEVELS.includes(skillData.level)
      ? skillData.level
      : "Beginner";
    const progress = Math.min(100, Math.max(0, Number(skillData.progress ?? 0)));
    const payload = {
      skillName: String(skillData.skillName).trim(),
      level,
      progress,
      pmNote: String(skillData.pmNote ?? "").trim(),
      updatedAt: serverTimestamp(),
    };
    if (skillData.projectId != null && skillData.projectId !== "") {
      payload.projectId = String(skillData.projectId);
    }
    if (skillData.projectName != null && skillData.projectName !== "") {
      payload.projectName = String(skillData.projectName).trim();
    }
    await setDoc(ref, payload, { merge: true });
  } catch (err) {
    console.error("[skillGrowthService] upsertEmployeeSkillGrowth error:", err);
    throw err;
  }
}

export { LEVELS };
