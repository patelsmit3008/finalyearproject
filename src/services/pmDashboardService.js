/**
 * PM Dashboard Service – fetches dashboard data from Firestore (projects owned by PM).
 * Uses collection "projects". Matches projects by ownerId or createdBy (existing schema).
 */

import { db } from '../firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';

/**
 * Normalize status for counting (supports both spec and existing schema).
 */
function normalizeStatus(status) {
  if (!status) return 'planning';
  const s = String(status).toLowerCase().replace(/\s+/g, '_');
  if (s === 'in_progress' || s === 'in progress') return 'in_progress';
  if (s === 'upcoming' || s === 'planning') return 'upcoming';
  if (s === 'completed') return 'completed';
  if (s === 'planning') return 'upcoming';
  return s;
}

/**
 * Get dashboard stats and recent projects for a Project Manager.
 * Queries projects where ownerId == pmId or createdBy == pmId (no schema change).
 *
 * @param {string} pmId - Current PM user id (Firebase UID)
 * @returns {Promise<{ stats: { activeProjects, upcomingProjects, completedProjects, totalAssignments }, recentProjects: Array }>}
 */
export async function getPMDashboardData(pmId) {
  const defaultResult = {
    stats: {
      activeProjects: 0,
      upcomingProjects: 0,
      completedProjects: 0,
      totalAssignments: 0,
    },
    recentProjects: [],
  };

  if (!pmId) {
    console.warn('[PM Dashboard Service] getPMDashboardData: no pmId');
    return defaultResult;
  }

  try {
    const projectsRef = collection(db, 'projects');
    const seenIds = new Set();
    const projects = [];

    // Query by ownerId (spec) and createdBy (existing schema) and merge
    const queries = [
      query(projectsRef, where('ownerId', '==', pmId)),
      query(projectsRef, where('createdBy', '==', pmId)),
    ];

    for (const q of queries) {
      let snapshot;
      try {
        snapshot = await getDocs(q);
      } catch (e) {
        if (e?.code === 'failed-precondition') continue; // index missing for this field
        throw e;
      }
      snapshot.docs.forEach((docSnap) => {
        if (seenIds.has(docSnap.id)) return;
        seenIds.add(docSnap.id);
        const data = docSnap.data();
        const id = docSnap.id;
        const status = normalizeStatus(data.status);
        const assignedEmployees = Array.isArray(data.assignedEmployees) ? data.assignedEmployees : [];
        const assignedCount = assignedEmployees.length;

        projects.push({
          id,
          title: data.title ?? data.projectName ?? data.name ?? 'Untitled Project',
          status: data.status ?? 'Planning',
          statusNormalized: status,
          minHelixScore: data.minimumHelixScore ?? data.minHelixScore ?? 0,
          requiredSkills: Array.isArray(data.requiredSkills)
            ? data.requiredSkills
            : data.requiredSkill
              ? [data.requiredSkill]
              : [],
          assignedCount,
          assignedEmployees,
          createdAt: data.createdAt,
          raw: data,
        });
      });
    }

    // Sort by createdAt desc (newest first)
    projects.sort((a, b) => {
      const tA = a.createdAt?.toMillis?.() ?? a.createdAt ?? 0;
      const tB = b.createdAt?.toMillis?.() ?? b.createdAt ?? 0;
      return tB - tA;
    });

    // Stats
    let activeProjects = 0;
    let upcomingProjects = 0;
    let completedProjects = 0;
    let totalAssignments = 0;

    projects.forEach((p) => {
      totalAssignments += p.assignedCount;
      switch (p.statusNormalized) {
        case 'in_progress':
          activeProjects += 1;
          break;
        case 'upcoming':
        case 'planning':
          upcomingProjects += 1;
          break;
        case 'completed':
          completedProjects += 1;
          break;
        default:
          upcomingProjects += 1;
      }
    });

    // Latest 5 for recent list
    const recentProjects = projects.slice(0, 5).map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      minHelixScore: p.minHelixScore,
      requiredSkills: p.requiredSkills,
      assignedCount: p.assignedCount,
    }));

    return {
      stats: {
        activeProjects,
        upcomingProjects,
        completedProjects,
        totalAssignments,
      },
      recentProjects,
    };
  } catch (err) {
    console.error('[PM Dashboard Service] getPMDashboardData error:', err);
    return defaultResult;
  }
}
