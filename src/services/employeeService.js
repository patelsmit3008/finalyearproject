/**
 * Employee Service - Firestore real-time listeners for employee_skill_profiles and projects.
 * Used by PM Employee Pool. Assignments are derived only from projects.assignedEmployees.
 * Call onSnapshot inside useEffect and return unsubscribe in cleanup.
 */

import { db } from '../firebase/config';
import { collection } from 'firebase/firestore';

/**
 * Get query and callbacks for employee_skill_profiles. Use inside useEffect with onSnapshot; return unsubscribe in cleanup.
 * @param {(employees: Array) => void} callback
 * @returns {{ query: Query, onNext: (snapshot) => void, onError: (err) => void }}
 */
export function getEmployeeSkillProfilesSubscription(callback) {
  const q = collection(db, 'employee_skill_profiles');
  const onNext = (snapshot) => {
    const employees = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const primarySkills = Array.isArray(data.primarySkills) ? data.primarySkills : [];
      const skills = primarySkills.map((p) => ({
        name: p.skill ?? p.name ?? 'Skill',
        helixScore: typeof p.score === 'number' ? p.score : Number(p.score) || 0,
      }));
      const rawDept = data.department;
      const department = (rawDept && String(rawDept).trim()) || (() => { console.warn('[Employee Service] Profile missing department, defaulting to Engineering:', docSnap.id); return 'Engineering'; })();
      return {
        id: docSnap.id,
        name: data.name ?? 'Unknown',
        department,
        overallHelixScore: typeof data.overallHelixScore === 'number' ? data.overallHelixScore : Number(data.overallHelixScore) || 0,
        primarySkills,
        totalPoints: typeof data.totalPoints === 'number' ? data.totalPoints : Number(data.totalPoints) || 0,
        skills,
        helixPoints: typeof data.totalPoints === 'number' ? data.totalPoints : Number(data.totalPoints) || 0,
      };
    });
    callback(employees);
  };
  const onError = (err) => {
    console.error('[Employee Service] subscribeToEmployeeSkillProfiles error:', err);
    callback([]);
  };
  return { query: q, onNext, onError };
}

/**
 * Get query and callbacks for projects collection. Assignments come from project.assignedEmployees only (not user.assignedProjects).
 * @param {(projects: Array<{ id, projectId, name, projectName, status, assignedEmployees }>) => void} callback
 * @returns {{ query: Query, onNext: (snapshot) => void, onError: (err) => void }}
 */
export function getProjectsSubscription(callback) {
  const q = collection(db, 'projects');
  const onNext = (snapshot) => {
    const list = snapshot.docs.map((d) => {
      const data = d.data();
      const raw = Array.isArray(data.assignedEmployees) ? data.assignedEmployees : [];
      return {
        id: d.id,
        projectId: d.id,
        name: data.name ?? data.projectName ?? 'Unnamed Project',
        projectName: data.name ?? data.projectName ?? 'Unnamed Project',
        status: data.status ?? '',
        assignedEmployees: raw,
      };
    });
    callback(list);
  };
  const onError = (err) => {
    console.error('[Employee Service] getProjectsSubscription error:', err);
    callback([]);
  };
  return { query: q, onNext, onError };
}
