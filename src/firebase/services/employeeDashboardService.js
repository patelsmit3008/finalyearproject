/**
 * Employee Dashboard Service - Firestore-backed stats for the Employee Dashboard.
 * Aggregates from: tasks, projects (+ project_interests), performance_reviews, skills, points_transactions.
 */

import { db } from "../config";
import { collection, getDocs, query, where } from "firebase/firestore";
import { getHelixPoints } from "./helixPointsService";
import { getSkillConfidence } from "./skillConfidenceService";

function normalizeStatus(s) {
  if (!s) return "";
  return String(s).toLowerCase().replace(/\s+/g, " ");
}

/**
 * Get dashboard stats for an employee.
 * - completedTasks: count from "tasks" where assigneeId/employeeId == userId and status completed
 * - totalTasks: count all tasks for user (for completion rate)
 * - activeProjectsCount: projects assigned via project_interests with status approved and project status In Progress
 * - averagePerformanceScore: average of scores from "performance_reviews"
 * - performanceScores: array of { score, reviewDate } for chart, oldest first
 * - skillsCount: count from "skills" collection or skill_confidence doc
 * - totalPoints: sum from "points_transactions" or helix_points.totalPoints
 * - completionRate: (completedTasks / totalTasks) * 100 or 0
 * - benchmark: reference score for charts (default 85)
 *
 * @param {string} userId - Employee UID
 * @returns {Promise<{
 *   completedTasks: number,
 *   totalTasks: number,
 *   activeProjectsCount: number,
 *   averagePerformanceScore: number,
 *   performanceScores: Array<{ score: number, reviewDate: string }>,
 *   skillsCount: number,
 *   totalPoints: number,
 *   completionRate: number,
 *   benchmark: number
 * }>}
 */
const DEFAULT_BENCHMARK = 85;

export async function getEmployeeDashboardStats(userId) {
  const empty = {
    completedTasks: 0,
    totalTasks: 0,
    activeProjectsCount: 0,
    averagePerformanceScore: 0,
    performanceScores: [],
    skillsCount: 0,
    totalPoints: 0,
    completionRate: 0,
    benchmark: DEFAULT_BENCHMARK,
  };

  if (!userId) return empty;

  try {
    const [
      tasksSnap,
      projectInterestsSnap,
      projectsSnap,
      reviewsSnap,
      skillsSnap,
      pointsTxSnap,
    ] = await Promise.all([
      getTasksForUser(userId),
      getProjectInterestsForUser(userId),
      getDocs(collection(db, "projects")),
      getPerformanceReviewsForUser(userId),
      getSkillsCountForUser(userId),
      getPointsTransactionsForUser(userId),
    ]);

    const completedTasks = tasksSnap.completed;
    const totalTasks = tasksSnap.total;
    const activeProjectsCount = countActiveProjectsForUser(
      projectInterestsSnap,
      projectsSnap
    );
    const { averageScore, scoresArray } = parsePerformanceReviews(reviewsSnap);
    const skillsCount = skillsSnap;
    const totalPoints = pointsTxSnap ?? (await getHelixPointsTotal(userId));
    const completionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      completedTasks,
      totalTasks,
      activeProjectsCount,
      averagePerformanceScore: averageScore,
      performanceScores: scoresArray,
      skillsCount,
      totalPoints,
      completionRate,
      benchmark: DEFAULT_BENCHMARK,
    };
  } catch (err) {
    console.error("[employeeDashboardService] getEmployeeDashboardStats error:", err);
    return empty;
  }
}

async function getTasksForUser(userId) {
  try {
    let snap = await getDocs(
      query(collection(db, "tasks"), where("assigneeId", "==", userId))
    ).catch(() => null);
    if (!snap || snap.empty) {
      snap = await getDocs(
        query(collection(db, "tasks"), where("employeeId", "==", userId))
      ).catch(() => ({ empty: true }));
    }
    if (!snap?.docs?.length) return { total: 0, completed: 0 };
    let total = 0;
    let completed = 0;
    snap.docs.forEach((d) => {
      total += 1;
      const s = normalizeStatus(d.data().status);
      if (s === "completed" || s === "done") completed += 1;
    });
    return { total, completed };
  } catch {
    return { total: 0, completed: 0 };
  }
}

async function getProjectInterestsForUser(userId) {
  try {
    const q = query(
      collection(db, "project_interests"),
      where("employeeId", "==", userId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

function countActiveProjectsForUser(interests, projectsSnap) {
  const approved = interests.filter(
    (i) => normalizeStatus(i.status) === "approved"
  );
  const projectIds = new Set(approved.map((i) => i.projectId).filter(Boolean));
  if (projectIds.size === 0) return 0;
  let count = 0;
  projectsSnap.docs.forEach((d) => {
    if (!projectIds.has(d.id)) return;
    const s = normalizeStatus(d.data().status);
    if (s === "in progress") count += 1;
  });
  return count;
}

async function getPerformanceReviewsForUser(userId) {
  try {
    const q = query(
      collection(db, "performance_reviews"),
      where("employeeId", "==", userId)
    );
    const snap = await getDocs(q).catch(() => ({ empty: true, docs: [] }));
    if (!snap?.docs?.length) return { empty: true, docs: [] };
    const docs = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const da = a.reviewDate?.toDate?.() ?? a.reviewDate ?? 0;
        const db_ = b.reviewDate?.toDate?.() ?? b.reviewDate ?? 0;
        return (da.valueOf?.() ?? da) - (db_.valueOf?.() ?? db_);
      });
    return { docs };
  } catch {
    return { docs: [] };
  }
}

function parsePerformanceReviews(snap) {
  const docs = snap.docs ?? [];
  if (!docs.length) return { averageScore: 0, scoresArray: [] };
  const scoresArray = [];
  let sum = 0;
  docs.forEach((d) => {
    const data = typeof d.data === "function" ? d.data() : d;
    const score = data.overallScore ?? data.score ?? data.rating ?? 0;
    const rawDate = data.reviewDate;
    const reviewDate = rawDate?.toDate?.()
      ? rawDate.toDate().toISOString()
      : typeof rawDate === "string"
        ? rawDate
        : "";
    scoresArray.push({ score: Number(score), reviewDate });
    sum += Number(score);
  });
  const averageScore =
    scoresArray.length > 0 ? Math.round(sum / scoresArray.length) : 0;
  return { averageScore, scoresArray };
}

async function getSkillsCountForUser(userId) {
  try {
    const q = query(
      collection(db, "skills"),
      where("employeeId", "==", userId)
    );
    const snap = await getDocs(q).catch(() => null);
    if (snap && !snap.empty) return snap.docs.length;
    const confidence = await getSkillConfidence(userId);
    const skills = confidence?.skills ?? {};
    return Object.keys(skills).length;
  } catch {
    return 0;
  }
}

async function getPointsTransactionsForUser(userId) {
  try {
    const q = query(
      collection(db, "points_transactions"),
      where("employeeId", "==", userId)
    );
    const snap = await getDocs(q).catch(() => null);
    if (!snap || snap.empty) return null;
    let sum = 0;
    snap.docs.forEach((d) => {
      const data = d.data();
      sum += Number(data.points ?? data.amount ?? 0);
    });
    return sum;
  } catch {
    return null;
  }
}

async function getHelixPointsTotal(userId) {
  const doc = await getHelixPoints(userId);
  return doc?.totalPoints ?? 0;
}
