/**
 * useHRDashboardData - Real-time HR Admin Dashboard data from Firestore.
 * Subscribes to users, employee_skill_profiles, resumes, project_interests, user_progress.
 * Derives KPIs, department distribution, performance trend, top employees, status overview.
 */

import { useState, useEffect, useMemo } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { getUsersSubscription, getResumesSubscription, getUserProgressSubscription } from '../services/hrDashboardService';
import { getEmployeeSkillProfilesSubscription } from '../services/employeeService';
import { getProjectInterestsSubscription } from '../services/projectInterestService';

const DEPT_COLORS = ['#3b82f6', '#10b981', '#84cc16', '#6366f1', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'];
/** Consistent color per department across all charts; least share gets red instead */
const DEPT_COLOR_MAP = {
  Engineering: '#3b82f6',
  Finance: '#f59e0b',
  Marketing: '#8b5cf6',
  Operations: '#10b981',
  Sales: '#06b6d4',
};
const LEAST_DEPT_COLOR = '#ef4444';
const STATUS_COLORS = { high: '#3b82f6', average: '#10b981', needsImprovement: '#f59e0b' };
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isEmployeeRole(role) {
  const r = (role || '').toString().toLowerCase();
  return r === 'employee';
}

/**
 * Group user_progress by month and compute average overallScore. Build trend array (last 12 months).
 */
function buildPerformanceTrendData(userProgressDocs) {
  const byMonth = new Map(); // monthKey -> { sum, count }
  for (const doc of userProgressDocs) {
    const score = doc.overallScore ?? 0;
    let date = doc.updatedAt || doc.createdAt;
    if (date?.toDate) date = date.toDate();
    else if (typeof date === 'string') date = new Date(date);
    else if (!(date instanceof Date)) date = new Date();
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth.has(monthKey)) byMonth.set(monthKey, { sum: 0, count: 0 });
    const cell = byMonth.get(monthKey);
    cell.sum += score;
    cell.count += 1;
  }
  const sortedKeys = [...byMonth.keys()].sort();
  const trend = sortedKeys.slice(-12).map((key) => {
    const { sum, count } = byMonth.get(key);
    const [y, m] = key.split('-').map(Number);
    const monthLabel = MONTH_LABELS[m - 1] || key;
    return { month: monthLabel, overallScore: count ? Math.round((sum / count) * 10) / 10 : 0 };
  });
  return trend.length ? trend : [{ month: 'Current', overallScore: 0 }];
}

export function useHRDashboardData() {
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [resumeUserIds, setResumeUserIds] = useState([]);
  const [projectInterests, setProjectInterests] = useState([]);
  const [userProgressDocs, setUserProgressDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const subUsers = getUsersSubscription(setUsers);
    const subProfiles = getEmployeeSkillProfilesSubscription(setProfiles);
    const subResumes = getResumesSubscription(setResumeUserIds);
    const subInterests = getProjectInterestsSubscription(setProjectInterests);
    const subProgress = getUserProgressSubscription(setUserProgressDocs);
    const unsubscribeUsers = onSnapshot(subUsers.query, subUsers.onNext, subUsers.onError);
    const unsubscribeProfiles = onSnapshot(subProfiles.query, subProfiles.onNext, subProfiles.onError);
    const unsubscribeResumes = onSnapshot(subResumes.query, subResumes.onNext, subResumes.onError);
    const unsubscribeInterests = onSnapshot(subInterests.query, subInterests.onNext, subInterests.onError);
    const unsubscribeProgress = onSnapshot(subProgress.query, subProgress.onNext, subProgress.onError);
    setLoading(false);
    return () => {
      unsubscribeUsers();
      unsubscribeProfiles();
      unsubscribeResumes();
      unsubscribeInterests();
      unsubscribeProgress();
    };
  }, []);

  const derived = useMemo(() => {
    const employeeUsers = users.filter((u) => isEmployeeRole(u.role));
    const totalEmployees = employeeUsers.length;
    const employeeIdsSet = new Set(employeeUsers.map((u) => u.id));

    const approvedEmployeeIds = new Set(
      projectInterests.filter((i) => (i.status || '').toLowerCase() === 'approved').map((i) => i.employeeId).filter(Boolean)
    );
    const hasResumeSet = new Set(resumeUserIds);
    const hasProgressSet = new Set(userProgressDocs.map((d) => d.userId || d.id));

    let activeEmployees = 0;
    employeeIdsSet.forEach((id) => {
      if (approvedEmployeeIds.has(id) || hasResumeSet.has(id) || hasProgressSet.has(id)) activeEmployees += 1;
    });

    const scores = profiles.map((p) => p.overallHelixScore ?? 0);
    const avgPerformance = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
    const totalHelixPoints = profiles.reduce((acc, p) => acc + (p.totalPoints ?? 0), 0);
    const engagementRate = totalEmployees ? Math.round((activeEmployees / totalEmployees) * 1000) / 10 : 0;

    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const deptCounts = {};
    const defaultDept = 'Engineering';
    employeeUsers.forEach((u) => {
      const raw = (u.department && String(u.department).trim()) || (profileById.get(u.id)?.department && String(profileById.get(u.id).department).trim());
      const dept = raw || (() => { console.warn('[HR Dashboard] User document missing department, defaulting to Engineering:', u.id); return defaultDept; })();
      deptCounts[dept] = (deptCounts[dept] || 0) + 1;
    });
    const totalForPct = totalEmployees || 1;
    const departmentDistribution = Object.entries(deptCounts).map(([name]) => ({
      name,
      value: Math.round((deptCounts[name] / totalForPct) * 1000) / 10,
      color: DEPT_COLOR_MAP[name] ?? DEPT_COLORS[0],
    }));
    const minDeptValue = Math.min(...departmentDistribution.map((d) => d.value));
    departmentDistribution.forEach((d) => {
      if (d.value === minDeptValue) d.color = LEAST_DEPT_COLOR;
      else d.color = DEPT_COLOR_MAP[d.name] ?? DEPT_COLORS[0];
    });

    const performanceTrendData = buildPerformanceTrendData(userProgressDocs);

    const deptWithFallback = (p, id) => {
      const d = (p.department && String(p.department).trim()) || null;
      if (d) return d;
      console.warn('[HR Dashboard] User/Profile missing department, defaulting to Engineering:', id);
      return 'Engineering';
    };
    const topEmployees = [...profiles]
      .sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0))
      .slice(0, 5)
      .map((p) => ({
        name: p.name ?? 'Unknown',
        department: deptWithFallback(p, p.id),
        helixPoints: p.totalPoints ?? 0,
      }));

    let high = 0,
      avg = 0,
      needs = 0;
    profiles.forEach((p) => {
      const s = p.overallHelixScore ?? 0;
      if (s >= 80) high += 1;
      else if (s >= 50) avg += 1;
      else needs += 1;
    });
    const employeeStatusData = [
      { status: 'High Performing', count: high, color: STATUS_COLORS.high },
      { status: 'Average', count: avg, color: STATUS_COLORS.average },
      { status: 'Needs Improvement', count: needs, color: STATUS_COLORS.needsImprovement },
    ];

    const employeesWithSkills = profiles.map((p) => {
      const primarySkills = Array.isArray(p.primarySkills) ? p.primarySkills : [];
      const skills = primarySkills.map((s) => ({
        name: s.skill ?? s.name ?? 'Skill',
        enabled: true,
      }));
      const name = p.name ?? 'Unknown';
      const initials = name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
      const empDept = (p.department && String(p.department).trim()) || (() => { console.warn('[HR Dashboard] Profile missing department, defaulting to Engineering:', p.id); return 'Engineering'; })();
      return {
        id: p.id,
        name,
        department: empDept,
        helixPoints: p.totalPoints ?? 0,
        avatar: initials,
        joinDate: p.joinDate ?? null,
        previousExperience: p.previousExperience ?? 0,
        skills,
      };
    });

    return {
      kpiData: {
        totalEmployees,
        activeEmployees,
        avgPerformance,
        totalHelixPoints,
        avgHelixPoints: totalEmployees ? Math.round(totalHelixPoints / totalEmployees) : 0,
        engagementRate,
      },
      departmentDistribution,
      performanceTrendData,
      topEmployees,
      employeeStatusData,
      employeesWithSkills,
    };
  }, [users, profiles, resumeUserIds, projectInterests, userProgressDocs]);

  return {
    loading,
    error: null,
    ...derived,
  };
}
