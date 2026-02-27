import { useState, useEffect, useMemo, useRef } from 'react';
import { Users, Filter, X, Award, TrendingUp, Briefcase, FileCheck } from 'lucide-react';
import { onSnapshot } from 'firebase/firestore';
import { getUsersSubscription } from '../../services/hrDashboardService';
import { getProjectInterestsSubscription } from '../../services/projectInterestService';
import { getEmployeeSkillProfilesSubscription, getProjectsSubscription } from '../../services/employeeService';
import { upsertEmployeeSkillGrowth, LEVELS } from '../../firebase/services/skillGrowthService';
import { addPerformanceReview } from '../../firebase/services/performanceReviewsService';
import { useAuth } from '../../contexts/AuthContext';

/** Merge user (from users collection) with optional skill profile for card display. No project_interests data. */
function mergeUserWithProfile(user, profile) {
  if (!user) return null;
  return {
    id: user.id,
    uid: user.id,
    name: user.name ?? 'Unknown',
    department: user.department ?? '',
    email: user.email,
    role: user.role,
    skills: profile?.skills ?? [],
    overallHelixScore: profile?.overallHelixScore ?? 0,
    helixPoints: profile?.helixPoints ?? profile?.totalPoints ?? 0,
    totalPoints: profile?.totalPoints ?? 0,
  };
}

export default function EmployeePool() {
  const { user: authUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [projectInterests, setProjectInterests] = useState([]);
  const [projects, setProjects] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [minHelixScore, setMinHelixScore] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [skillGrowthModal, setSkillGrowthModal] = useState(null);
  const [skillGrowthForm, setSkillGrowthForm] = useState({
    skillName: '',
    progress: 50,
    level: 'Intermediate',
    pmNote: '',
    projectId: null,
    projectName: null,
  });
  const [skillGrowthSaving, setSkillGrowthSaving] = useState(false);
  const [skillGrowthSuccess, setSkillGrowthSuccess] = useState(false);
  const [performanceReviewModal, setPerformanceReviewModal] = useState(null);
  const [performanceReviewForm, setPerformanceReviewForm] = useState({
    overallScore: '',
    technical: '',
    communication: '',
    delivery: '',
    teamwork: '',
    notes: '',
  });
  const [performanceReviewSaving, setPerformanceReviewSaving] = useState(false);
  const dataReceivedRef = useRef({ users: false, projectInterests: false, projects: false });

  useEffect(() => {
    const maybeDone = () => {
      const r = dataReceivedRef.current;
      if (r.users && r.projectInterests && r.projects) setLoading(false);
    };
    const subUsers = getUsersSubscription((list) => {
      setUsers(list);
      dataReceivedRef.current.users = true;
      maybeDone();
    });
    const subInterests = getProjectInterestsSubscription((list) => {
      setProjectInterests(list);
      dataReceivedRef.current.projectInterests = true;
      maybeDone();
    });
    const subProjects = getProjectsSubscription((list) => {
      setProjects(list);
      dataReceivedRef.current.projects = true;
      maybeDone();
    });
    const subProfiles = getEmployeeSkillProfilesSubscription((list) => {
      setProfiles(list);
    });
    const unsubUsers = onSnapshot(subUsers.query, subUsers.onNext, subUsers.onError);
    const unsubInterests = onSnapshot(subInterests.query, subInterests.onNext, subInterests.onError);
    const unsubProjects = onSnapshot(subProjects.query, subProjects.onNext, subProjects.onError);
    const unsubProfiles = onSnapshot(subProfiles.query, subProfiles.onNext, subProfiles.onError);
    return () => {
      unsubUsers();
      unsubInterests();
      unsubProjects();
      unsubProfiles();
    };
  }, []);

  const usersById = useMemo(() => {
    const map = new Map();
    (users || []).forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  const profilesById = useMemo(() => {
    const map = new Map();
    (profiles || []).forEach((p) => map.set(p.id, p));
    return map;
  }, [profiles]);

  const approvedByProjectId = useMemo(() => {
    const map = new Map();
    (projectInterests || [])
      .filter((i) => (i.status || '').toLowerCase() === 'approved' && i.projectId && i.employeeId)
      .forEach((i) => {
        if (!map.has(i.projectId)) map.set(i.projectId, new Set());
        map.get(i.projectId).add(i.employeeId);
      });
    return map;
  }, [projectInterests]);

  const allAssignedUids = useMemo(() => {
    const set = new Set();
    approvedByProjectId.forEach((uids) => uids.forEach((uid) => set.add(uid)));
    return set;
  }, [approvedByProjectId]);

  const projectIdToName = useMemo(() => {
    const map = new Map();
    (projects || []).forEach((p) => map.set(p.id, p.name ?? p.projectName ?? 'Unnamed Project'));
    return map;
  }, [projects]);

  /** Group users under project headings using approved project_interests only. Each card is a real user merged with optional profile. */
  const projectGroups = useMemo(() => {
    const groups = [];
    (projects || []).forEach((project) => {
      const uids = approvedByProjectId.get(project.id);
      if (!uids || uids.size === 0) return;
      const assignedEmployees = [];
      uids.forEach((uid) => {
        const user = usersById.get(uid);
        if (!user) return;
        const profile = profilesById.get(uid);
        assignedEmployees.push(mergeUserWithProfile(user, profile));
      });
      if (assignedEmployees.length === 0) return;
      groups.push({
        projectId: project.id,
        projectName: project.name ?? project.projectName ?? 'Unnamed Project',
        assignedEmployees,
      });
    });
    return groups;
  }, [projects, approvedByProjectId, usersById, profilesById]);

  const unassignedEmployees = useMemo(() => {
    return (users || [])
      .filter((u) => !allAssignedUids.has(u.id))
      .map((u) => mergeUserWithProfile(u, profilesById.get(u.id)));
  }, [users, allAssignedUids, profilesById]);

  const allSkills = useMemo(() => {
    const skills = new Set();
    (profiles || []).forEach((p) => (p.skills || []).forEach((s) => skills.add(s.name)));
    return Array.from(skills).sort();
  }, [profiles]);

  const allDepartments = useMemo(() => {
    const depts = new Set((users || []).map((u) => u.department).filter(Boolean));
    return Array.from(depts).sort();
  }, [users]);

  const filterEmployee = (emp) => {
    if (selectedDepartment && emp.department !== selectedDepartment) return false;
    if (selectedSkill) {
      const hasSkill = (emp.skills || []).some((s) => s.name === selectedSkill);
      if (!hasSkill) return false;
      if (minHelixScore) {
        const skill = (emp.skills || []).find((s) => s.name === selectedSkill);
        if (!skill || skill.helixScore < parseInt(minHelixScore, 10)) return false;
      }
    } else if (minHelixScore) {
      const score = emp.overallHelixScore ?? (emp.skills?.length ? emp.skills.reduce((sum, s) => sum + s.helixScore, 0) / emp.skills.length : 0);
      if (score < parseInt(minHelixScore, 10)) return false;
    }
    return true;
  };

  const clearFilters = () => {
    setSelectedSkill('');
    setSelectedDepartment('');
    setMinHelixScore('');
  };

  const hasActiveFilters = selectedSkill || selectedDepartment || minHelixScore;

  const openSkillGrowthModal = (employee, projectId = null, projectName = null) => {
    setSkillGrowthModal(employee);
    setSkillGrowthForm({
      skillName: (employee.skills?.[0]?.name) || '',
      progress: 50,
      level: 'Intermediate',
      pmNote: '',
      projectId: projectId ?? null,
      projectName: projectName ?? null,
    });
    setSkillGrowthSuccess(false);
  };

  const closeSkillGrowthModal = () => {
    setSkillGrowthModal(null);
    setSkillGrowthSaving(false);
  };

  const handleSaveSkillGrowth = async () => {
    if (!skillGrowthModal?.id || !skillGrowthForm.skillName?.trim()) return;
    setSkillGrowthSaving(true);
    setSkillGrowthSuccess(false);
    try {
      await upsertEmployeeSkillGrowth(skillGrowthModal.id, {
        skillName: skillGrowthForm.skillName.trim(),
        progress: skillGrowthForm.progress,
        level: skillGrowthForm.level,
        pmNote: skillGrowthForm.pmNote.trim(),
        projectId: skillGrowthForm.projectId ?? null,
        projectName: skillGrowthForm.projectName ?? null,
      });
      setSkillGrowthSuccess(true);
      setTimeout(() => closeSkillGrowthModal(), 1500);
    } catch (err) {
      console.error('[EmployeePool] Skill growth save error:', err);
    } finally {
      setSkillGrowthSaving(false);
    }
  };

  const openPerformanceReviewModal = (employee) => {
    setPerformanceReviewModal(employee);
    setPerformanceReviewForm({
      overallScore: '',
      technical: '',
      communication: '',
      delivery: '',
      teamwork: '',
      notes: '',
    });
  };

  const handlePerformanceReviewNumericChange = (field, e) => {
    const value = e.target.value;
    if (value === '') {
      setPerformanceReviewForm((f) => ({ ...f, [field]: '' }));
      return;
    }
    const n = Number(value);
    if (!Number.isNaN(n)) {
      const clamped = Math.min(100, Math.max(0, n));
      setPerformanceReviewForm((f) => ({ ...f, [field]: clamped }));
    }
  };

  const closePerformanceReviewModal = () => {
    setPerformanceReviewModal(null);
  };

  const handleSavePerformanceReview = async () => {
    if (!performanceReviewModal?.id || !authUser?.uid) return;
    const toNum = (v) => (v === '' ? 0 : Math.min(100, Math.max(0, Number(v))));
    setPerformanceReviewSaving(true);
    try {
      await addPerformanceReview({
        employeeId: performanceReviewModal.id,
        reviewedBy: authUser.uid,
        overallScore: toNum(performanceReviewForm.overallScore),
        technical: toNum(performanceReviewForm.technical),
        communication: toNum(performanceReviewForm.communication),
        delivery: toNum(performanceReviewForm.delivery),
        teamwork: toNum(performanceReviewForm.teamwork),
        notes: (performanceReviewForm.notes ?? '').trim(),
      });
      closePerformanceReviewModal();
    } catch (err) {
      console.error('[EmployeePool] Performance review save error:', err);
    } finally {
      setPerformanceReviewSaving(false);
    }
  };

  const skillOptions = useMemo(() => {
    const names = new Set();
    (profiles || []).forEach((p) => (p.skills || []).forEach((s) => names.add(s.name)));
    return Array.from(names).sort();
  }, [profiles]);

  const getInitials = (name) => {
    if (!name) return '?';
    return name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const renderEmployeeCard = (employee, projectId, projectName) => {
    const primarySkills = (employee.skills || []).slice(0, 3);
    const overallScore = employee.overallHelixScore ?? (primarySkills.length
      ? Math.round(primarySkills.reduce((sum, s) => sum + s.helixScore, 0) / primarySkills.length)
      : 0);
    if (!filterEmployee(employee)) return null;
    return (
      <div
        key={employee.id}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-lg">
              {getInitials(employee.name)}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{employee.name}</h3>
              <p className="text-sm text-gray-600">{employee.department}</p>
            </div>
          </div>
        </div>
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600">Overall Helix Score</span>
            <span className="text-sm font-semibold text-gray-900">{overallScore}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full"
              style={{ width: `${Math.min(100, overallScore)}%` }}
            />
          </div>
        </div>
        <div className="space-y-2 mb-4">
          <p className="text-xs font-medium text-gray-600">Primary Skills</p>
          {primarySkills.length > 0 ? (
            primarySkills.map((skill) => (
              <div key={skill.name} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{skill.name}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${
                        skill.helixScore >= 60 ? 'bg-green-500' :
                        skill.helixScore >= 40 ? 'bg-blue-500' :
                        'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(100, skill.helixScore)}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-600 w-10 text-right">
                    {skill.helixScore}%
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500">No skills listed</p>
          )}
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-gray-200 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            <span className="text-sm text-gray-600">
              <span className="font-medium">{(employee.helixPoints ?? employee.totalPoints ?? 0).toLocaleString()}</span> total points
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openPerformanceReviewModal(employee)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1e3a5f] bg-[#1e3a5f]/10 rounded-lg hover:bg-[#1e3a5f]/20 border border-[#1e3a5f]/20"
            >
              <FileCheck className="w-3.5 h-3.5" />
              Add Performance Review
            </button>
            <button
              type="button"
              onClick={() => openSkillGrowthModal(employee, projectId, projectName)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1e3a5f] bg-[#1e3a5f]/10 rounded-lg hover:bg-[#1e3a5f]/20 border border-[#1e3a5f]/20"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Skill Growth
            </button>
          </div>
        </div>
      </div>
    );
  };

  const totalFilteredCount = useMemo(() => {
    let n = 0;
    projectGroups.forEach((g) => g.assignedEmployees.forEach((e) => { if (filterEmployee(e)) n++; }));
    unassignedEmployees.forEach((e) => { if (filterEmployee(e)) n++; });
    return n;
  }, [projectGroups, unassignedEmployees, selectedSkill, selectedDepartment, minHelixScore]);

  return (
    <div className="w-full max-w-full box-border px-4 sm:px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employee Pool</h1>
          <p className="text-sm text-gray-600 mt-1">Browse assigned and unassigned employees</p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Filter className="w-4 h-4" />
          <span>Filters</span>
        </button>
      </div>

      {showFilters && (
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6 border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Skill</label>
              <select
                value={selectedSkill}
                onChange={(e) => setSelectedSkill(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Skills</option>
                {allSkills.map((skill) => (
                  <option key={skill} value={skill}>{skill}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Departments</option>
                {allDepartments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Min Helix Score (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={minHelixScore}
                onChange={(e) => setMinHelixScore(e.target.value)}
                placeholder="e.g., 45"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-4 flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700"
            >
              <X className="w-4 h-4" />
              <span>Clear all filters</span>
            </button>
          )}
        </div>
      )}

      <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
        <Users className="w-4 h-4" />
        <span>{totalFilteredCount} employee{totalFilteredCount !== 1 ? 's' : ''} found</span>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 animate-pulse">
                <div className="h-4 w-32 bg-gray-200 rounded mb-4" />
                <div className="h-24 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {projectGroups
            .filter((g) => g.assignedEmployees.length > 0)
            .map((g) => (
              <section key={g.projectId}>
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-[#1e3a5f]" />
                  {g.projectName}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {g.assignedEmployees
                    .filter(filterEmployee)
                    .map((emp) => renderEmployeeCard(emp, g.projectId, g.projectName))}
                </div>
              </section>
            ))}

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-500" />
              Unassigned Employees
            </h2>
            {unassignedEmployees.filter(filterEmployee).length === 0 ? (
              <div className="text-center py-8 bg-white rounded-lg border border-gray-200">
                <p className="text-sm text-gray-500">No unassigned employees.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {unassignedEmployees
                  .filter(filterEmployee)
                  .map((emp) => renderEmployeeCard(emp, null, null))}
              </div>
            )}
          </section>
        </div>
      )}

      {skillGrowthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">Add Skill Growth</h3>
              <button type="button" onClick={closeSkillGrowthModal} className="p-1 text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-1">Employee: <span className="font-semibold">{skillGrowthModal.name}</span></p>
            {skillGrowthForm.projectName && (
              <p className="text-sm text-gray-500 mb-4">Project: <span className="font-medium">{skillGrowthForm.projectName}</span></p>
            )}
            {!skillGrowthForm.projectName && <p className="text-sm text-gray-500 mb-4">Project: Unassigned</p>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Skill</label>
                <select
                  value={skillGrowthForm.skillName}
                  onChange={(e) => setSkillGrowthForm((f) => ({ ...f, skillName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                >
                  <option value="">Select skill</option>
                  {skillOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
                <select
                  value={skillGrowthForm.level}
                  onChange={(e) => setSkillGrowthForm((f) => ({ ...f, level: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                >
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Progress %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={skillGrowthForm.progress}
                  onChange={(e) => setSkillGrowthForm((f) => ({ ...f, progress: Number(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PM Note</label>
                <textarea
                  value={skillGrowthForm.pmNote}
                  onChange={(e) => setSkillGrowthForm((f) => ({ ...f, pmNote: e.target.value }))}
                  placeholder="How the employee improved in this skill..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={handleSaveSkillGrowth}
                disabled={skillGrowthSaving || !skillGrowthForm.skillName?.trim()}
                className="flex-1 px-4 py-2 bg-[#1e3a5f] text-white font-medium rounded-lg hover:bg-[#1e3a5f]/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {skillGrowthSaving ? 'Saving...' : skillGrowthSuccess ? 'Saved' : 'Save'}
              </button>
              <button
                type="button"
                onClick={closeSkillGrowthModal}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {performanceReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">Add Performance Review</h3>
              <button type="button" onClick={closePerformanceReviewModal} className="p-1 text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">Employee: <span className="font-semibold">{performanceReviewModal.name}</span></p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Overall Score (0–100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={performanceReviewForm.overallScore}
                  onChange={(e) => handlePerformanceReviewNumericChange('overallScore', e)}
                  placeholder="0 - 100"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Technical (0–100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={performanceReviewForm.technical}
                  onChange={(e) => handlePerformanceReviewNumericChange('technical', e)}
                  placeholder="0 - 100"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Communication (0–100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={performanceReviewForm.communication}
                  onChange={(e) => handlePerformanceReviewNumericChange('communication', e)}
                  placeholder="0 - 100"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Delivery (0–100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={performanceReviewForm.delivery}
                  onChange={(e) => handlePerformanceReviewNumericChange('delivery', e)}
                  placeholder="0 - 100"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teamwork (0–100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={performanceReviewForm.teamwork}
                  onChange={(e) => handlePerformanceReviewNumericChange('teamwork', e)}
                  placeholder="0 - 100"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={performanceReviewForm.notes}
                  onChange={(e) => setPerformanceReviewForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={handleSavePerformanceReview}
                disabled={performanceReviewSaving}
                className="flex-1 px-4 py-2 bg-[#1e3a5f] text-white font-medium rounded-lg hover:bg-[#1e3a5f]/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {performanceReviewSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={closePerformanceReviewModal}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
