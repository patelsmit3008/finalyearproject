import { useState, useEffect } from 'react';
import { FolderKanban, Plus, Users, X, CheckCircle2, Clock, Calendar, Loader2, FileText } from 'lucide-react';
import { employeesWithHelixScores } from '../../data/mockData';
import { db } from '../../firebase/config';
import { collection, doc, addDoc, updateDoc, onSnapshot, serverTimestamp, Timestamp, getDocs, arrayUnion, arrayRemove, setDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { getResumeByUserId } from '../../services/resumeService';
import { updateProjectStatus } from '../../services/projectService';

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectInterests, setProjectInterests] = useState([]);
  const [resumeUrlByEmployeeId, setResumeUrlByEmployeeId] = useState({});
  const [updatingInterestId, setUpdatingInterestId] = useState(null);
  const [updatingStatusProjectId, setUpdatingStatusProjectId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    requiredSkills: [],
    minHelixScore: '',
    startDate: '',
    endDate: '',
  });

  // Fetch projects from Firestore
  useEffect(() => {
    console.log('[PM Projects] Setting up Firestore listener for projects...');
    setProjectsLoading(true);

    const unsubscribe = onSnapshot(
      collection(db, 'projects'),
      (snapshot) => {
        console.log(`[PM Projects] Projects snapshot size: ${snapshot.size}`);
        
        const projectsList = snapshot.docs.map((doc) => {
          const data = doc.data();
          
          // Backward compatibility: normalize requiredSkills
          let requiredSkills = data.requiredSkills || [];
          if (!Array.isArray(requiredSkills) || requiredSkills.length === 0) {
            if (data.requiredSkill) {
              requiredSkills = [data.requiredSkill];
            }
          }

          return {
            id: doc.id,
            projectId: doc.id,
            projectName: data.projectName || data.name || 'Unknown Project',
            requiredSkills: requiredSkills,
            minimumHelixScore: data.minimumHelixScore || data.minHelixScore || 0,
            status: data.status || 'Planning',
            startDate: data.startDate,
            endDate: data.endDate,
            createdAt: data.createdAt,
          };
        });

        // Sort by projectName
        projectsList.sort((a, b) => {
          const nameA = (a.projectName || '').toLowerCase();
          const nameB = (b.projectName || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });

        console.log(`[PM Projects] Loaded ${projectsList.length} projects`);
        setProjects(projectsList);
        setProjectsLoading(false);
      },
      (error) => {
        console.error('[PM Projects] Error fetching projects:', error);
        setProjects([]);
        setProjectsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Real-time listener for project_interests
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'project_interests'),
      (snapshot) => {
        setProjectInterests(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (e) => {
        console.error('[PM Projects] project_interests listener error:', e);
        setProjectInterests([]);
      }
    );
    return () => unsubscribe();
  }, []);

  // For each interested employee, fetch resume URL from Firestore resumes/{employeeId} and attach to list
  useEffect(() => {
    const employeeIds = [...new Set(projectInterests.map((i) => i.employeeId).filter(Boolean))];
    if (employeeIds.length === 0) {
      setResumeUrlByEmployeeId({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const map = {};
        await Promise.all(
          employeeIds.map(async (eid) => {
            const url = await getResumeByUserId(eid);
            if (!cancelled) map[eid] = url ?? null;
          })
        );
        if (!cancelled) setResumeUrlByEmployeeId(map);
      } catch (err) {
        console.error('[PM Projects] Error fetching resume URLs:', err);
        if (!cancelled) setResumeUrlByEmployeeId({});
      }
    };
    load();
    return () => { cancelled = true; };
  }, [projectInterests]);

  const interestsByProjectId = projectInterests.reduce((acc, i) => {
    const pid = i.projectId;
    if (!acc[pid]) acc[pid] = [];
    acc[pid].push(i);
    return acc;
  }, {});

  const handleApproveInterest = async (interest) => {
    if (!interest?.id || !interest?.projectId || !interest?.employeeId) return;
    setUpdatingInterestId(interest.id);
    const projectId = interest.projectId;
    const userId = interest.employeeId;
    try {
      await updateDoc(doc(db, 'project_interests', interest.id), { status: 'approved' });
      setProjectInterests((prev) =>
        prev.map((i) => (i.id === interest.id ? { ...i, status: 'approved' } : i))
      );

      const assignment = {
        uid: userId,
        name: interest.employeeName ?? 'Unknown',
        status: 'approved',
      };
      try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
          assignedProjects: arrayUnion(projectId),
        });
        const projectRef = doc(db, 'projects', projectId);
        await updateDoc(projectRef, {
          assignedEmployees: arrayRemove(userId),
          interestedEmployees: arrayRemove(userId),
          updatedAt: serverTimestamp(),
        });
        await updateDoc(projectRef, {
          assignedEmployees: arrayUnion(assignment),
        });
        console.log('[PM Projects] Approval persisted: user', userId, 'assignedProjects updated; project', projectId, 'assignedEmployees (uid/name/status) updated.');
      } catch (persistErr) {
        if (persistErr?.code === 'not-found' || persistErr?.message?.includes('No document to update')) {
          const userRef = doc(db, 'users', userId);
          await setDoc(userRef, { assignedProjects: [projectId] }, { merge: true });
          const projectRef = doc(db, 'projects', projectId);
          await updateDoc(projectRef, {
            assignedEmployees: arrayRemove(userId),
            interestedEmployees: arrayRemove(userId),
            updatedAt: serverTimestamp(),
          });
          await updateDoc(projectRef, {
            assignedEmployees: arrayUnion(assignment),
          });
          console.log('[PM Projects] Approval persisted (user doc created): user', userId, 'project', projectId);
        } else {
          console.error('[PM Projects] Approval Firestore persist error:', persistErr);
          throw persistErr;
        }
      }

      await addDoc(collection(db, 'notifications'), {
        employeeId: userId,
        title: 'Project application approved',
        message: `You have been selected for this project: ${interest.projectTitle || 'Project'}.`,
        createdAt: serverTimestamp(),
        read: false,
      });
    } catch (e) {
      console.error('[PM Projects] Approve interest failed:', e);
    } finally {
      setUpdatingInterestId(null);
    }
  };

  const handleRejectInterest = async (interest) => {
    if (!interest?.id) return;
    setUpdatingInterestId(interest.id);
    try {
      await updateDoc(doc(db, 'project_interests', interest.id), { status: 'rejected' });
      setProjectInterests((prev) =>
        prev.map((i) => (i.id === interest.id ? { ...i, status: 'rejected' } : i))
      );
      if (interest.projectId) {
        await updateDoc(doc(db, 'projects', interest.projectId), { updatedAt: serverTimestamp() });
      }
      if (interest.employeeId) {
        await addDoc(collection(db, 'notifications'), {
          employeeId: interest.employeeId,
          title: 'Project application update',
          message: `Not selected for this project: ${interest.projectTitle || 'Project'}.`,
          createdAt: serverTimestamp(),
          read: false,
        });
      }
    } catch (e) {
      console.error('[PM Projects] Reject interest failed:', e);
    } finally {
      setUpdatingInterestId(null);
    }
  };

  const allSkills = Array.from(
    new Set(employeesWithHelixScores.flatMap(emp => emp.skills.map(s => s.name)))
  ).sort();

  const handleSkillToggle = (skill) => {
    const currentSkills = newProject.requiredSkills || [];
    if (currentSkills.includes(skill)) {
      setNewProject({
        ...newProject,
        requiredSkills: currentSkills.filter(s => s !== skill),
      });
    } else {
      setNewProject({
        ...newProject,
        requiredSkills: [...currentSkills, skill],
      });
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    
    if (!newProject.name.trim()) {
      alert('Please enter a project name');
      return;
    }

    if (!newProject.requiredSkills || newProject.requiredSkills.length === 0) {
      alert('Please select at least one required skill');
      return;
    }

    if (!newProject.minHelixScore || parseInt(newProject.minHelixScore) < 0) {
      alert('Please enter a valid minimum Helix score');
      return;
    }

    if (!newProject.startDate || !newProject.endDate) {
      alert('Please select start and end dates');
      return;
    }

    try {
      setCreating(true);

      // Convert date strings to Firestore Timestamps
      const startDateTimestamp = Timestamp.fromDate(new Date(newProject.startDate));
      const endDateTimestamp = Timestamp.fromDate(new Date(newProject.endDate));

      const projectData = {
        projectName: newProject.name.trim(),
        requiredSkills: newProject.requiredSkills,
        minimumHelixScore: parseInt(newProject.minHelixScore),
        status: 'Planning',
        startDate: startDateTimestamp,
        endDate: endDateTimestamp,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user?.uid || user?.name || 'PM',
      };

      await addDoc(collection(db, 'projects'), projectData);
      
      console.log('[PM Projects] Project created successfully');
      
      // Reset form and close modal
      setNewProject({ name: '', requiredSkills: [], minHelixScore: '', startDate: '', endDate: '' });
      setShowCreateModal(false);
    } catch (error) {
      console.error('[PM Projects] Error creating project:', error);
      alert('Failed to create project. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'In Progress':
        return <CheckCircle2 className="w-4 h-4 text-blue-600" />;
      case 'Planning':
        return <Clock className="w-4 h-4 text-amber-600" />;
      default:
        return <Calendar className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Planning':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'Upcoming':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'In Progress':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'On Hold':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'Completed':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const STATUS_OPTIONS = ['Planning', 'Upcoming', 'In Progress', 'On Hold', 'Completed'];

  const handleStatusChange = async (projectId, newStatus) => {
    if (!projectId || !newStatus) return;
    setUpdatingStatusProjectId(projectId);
    try {
      await updateProjectStatus(projectId, newStatus);
    } catch (err) {
      console.error('[PM Projects] Failed to update project status:', err);
    } finally {
      setUpdatingStatusProjectId(null);
    }
  };

  return (
    <div className="w-full max-w-full box-border px-4 sm:px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-600 mt-1">Manage projects and their requirements</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </button>
      </div>

      {/* Projects List */}
      {projectsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
          <span className="ml-3 text-sm text-gray-600">Loading projects...</span>
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <FolderKanban className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Projects</h3>
          <p className="text-sm text-gray-600">Create your first project to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => {
            // Backward compatibility: normalize requiredSkills
            const requiredSkills = Array.isArray(project.requiredSkills) 
              ? project.requiredSkills 
              : project.requiredSkill 
                ? [project.requiredSkill] 
                : [];

            const startDate = project.startDate?.toDate?.() || (project.startDate ? new Date(project.startDate) : null);
            const endDate = project.endDate?.toDate?.() || (project.endDate ? new Date(project.endDate) : null);

            return (
              <div
                key={project.id || project.projectId}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <FolderKanban className="w-5 h-5 text-indigo-600" />
                      <h3 className="text-lg font-semibold text-gray-900">
                        {project.projectName || project.name}
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-1">Required Skills</p>
                        <div className="flex flex-wrap gap-1.5">
                          {requiredSkills.length > 0 ? (
                            requiredSkills.map((skill, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-md"
                              >
                                {skill}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-gray-500">No skills specified</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-1">Minimum Helix Score</p>
                        <p className="text-sm text-gray-900 font-medium">
                          {project.minimumHelixScore || project.minHelixScore || 0}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-1">Start Date</p>
                        <p className="text-sm text-gray-900">
                          {startDate ? startDate.toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-1">End Date</p>
                        <p className="text-sm text-gray-900">
                          {endDate ? endDate.toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <select
                      value={project.status || 'Planning'}
                      onChange={(e) => handleStatusChange(project.id || project.projectId, e.target.value)}
                      disabled={updatingStatusProjectId === (project.id || project.projectId)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 cursor-pointer min-w-[140px] appearance-none bg-no-repeat bg-right pr-8 ${getStatusColor(project.status)} disabled:opacity-70 disabled:cursor-not-allowed`}
                      style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundSize: '1rem' }}
                      aria-label="Project status"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Interested employees (from project_interests) */}
                {(interestsByProjectId[project.id] || interestsByProjectId[project.projectId] || []).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      Interested employees
                    </p>
                    <div className="interest-grid">
                      {(interestsByProjectId[project.id] || interestsByProjectId[project.projectId] || []).map((interest) => {
                        const name = interest.employeeName || 'Unknown';
                        const initial = name.charAt(0).toUpperCase();
                        const status = (interest.status || 'pending').toLowerCase();
                        const statusLabel = status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Pending';
                        const cardClass = status === 'approved' ? 'approved-card' : status === 'rejected' ? 'rejected-card' : 'pending-card';
                        const isUpdating = updatingInterestId === interest.id;
                        const matchScore = interest.matchScore != null ? interest.matchScore : null;
                        const resumeUrl = interest.resumeUrl ?? resumeUrlByEmployeeId[interest.employeeId] ?? null;
                        return (
                          <div key={interest.id} className={`interest-card ${cardClass}`}>
                            <div className="avatar">{initial}</div>
                            <div className="flex-1 min-w-0">
                              <div className="name">{name}</div>
                              {matchScore != null && (
                                <div className="text-xs text-gray-600 mt-0.5">Match: {matchScore}%</div>
                              )}
                              <span className={`status ${status}`}>{statusLabel}</span>
                              <div className="flex flex-wrap gap-2 mt-2">
                                <button
                                  type="button"
                                  className="view-resume-btn"
                                  onClick={() => resumeUrl && window.open(resumeUrl, '_blank')}
                                  disabled={!resumeUrl}
                                  title={resumeUrl ? 'Open resume in new tab' : 'Resume not uploaded'}
                                  aria-label={resumeUrl ? 'View resume (opens in new tab)' : 'Resume not uploaded'}
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  View Resume
                                </button>
                                {status === 'pending' && (
                                  <>
                                    <button
                                      type="button"
                                      className="approve-btn"
                                      onClick={() => handleApproveInterest(interest)}
                                      disabled={isUpdating}
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      className="reject-btn"
                                      onClick={() => handleRejectInterest(interest)}
                                      disabled={isUpdating}
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Create New Project</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Project Name</label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., Customer Portal Redesign"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Required Skills <span className="text-red-500">*</span>
                </label>
                <div className="border border-gray-300 rounded-lg p-3 max-h-48 overflow-y-auto">
                  {allSkills.length === 0 ? (
                    <p className="text-sm text-gray-500">No skills available</p>
                  ) : (
                    <div className="space-y-2">
                      {allSkills.map(skill => (
                        <label
                          key={skill}
                          className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={newProject.requiredSkills?.includes(skill) || false}
                            onChange={() => handleSkillToggle(skill)}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                          />
                          <span className="text-sm text-gray-700">{skill}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {newProject.requiredSkills && newProject.requiredSkills.length > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    {newProject.requiredSkills.length} skill{newProject.requiredSkills.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Helix Score (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={newProject.minHelixScore}
                  onChange={(e) => setNewProject({ ...newProject, minHelixScore: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., 45"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={newProject.startDate}
                    onChange={(e) => setNewProject({ ...newProject, startDate: e.target.value })}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                  <input
                    type="date"
                    value={newProject.endDate}
                    onChange={(e) => setNewProject({ ...newProject, endDate: e.target.value })}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Project'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

