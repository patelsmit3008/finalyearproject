import { useState, useEffect } from 'react';
import { Briefcase, Plus, Clock, CheckCircle2, XCircle, Loader2, AlertCircle, X, Info } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { getEmployeeContributionsSubscription, createProjectContribution } from '../../firebase/services/projectContributionsService';
import { db } from '../../firebase/config';

export default function ProjectContributions() {
  const { user } = useAuth();
  const [contributions, setContributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    projectId: '',
    projectName: '',
    skill: '',
    role: 'Contributor',
    contributionLevel: 'Moderate',
    notes: '',
  });

  // Projects state - fetched from Firestore
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  // Set up real-time Firestore listener for ALL projects (NO status filtering)
  useEffect(() => {
    console.log('[Employee Modal] Setting up Firestore listener for ALL projects');
    console.log('[Employee Modal] NO status filtering - fetching all projects');
    setProjectsLoading(true);

    // Fetch ALL projects - NO status filter, NO assignment filter
    // NO where() clauses - fetch all documents from projects collection
    const projectsQuery = collection(db, 'projects');

    const unsubscribe = onSnapshot(
      projectsQuery,
      (snapshot) => {
        console.log(`[Employee Modal] Projects snapshot size: ${snapshot.size}`);
        console.log(`[Employee Modal] Snapshot empty: ${snapshot.empty}`);

        // Map snapshot directly to projects array
        const projects = snapshot.docs.map((doc) => {
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
            ...data,
            requiredSkills: requiredSkills, // Ensure it's always an array
          };
        });

        // Sort by projectName for consistent ordering
        projects.sort((a, b) => {
          const nameA = (a.projectName || a.name || '').toLowerCase();
          const nameB = (b.projectName || b.name || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });

        console.log('[Employee Modal] Projects fetched:', projects.length);
        console.log('[Employee Modal] Project names:', projects.map(p => ({
          name: p.projectName || p.name || 'Unknown',
          status: p.status || 'Unknown',
        })));

        setProjects(projects);
        setProjectsLoading(false);
      },
      (error) => {
        console.error('[Employee Modal] Error in projects listener:', error);
        console.error('[Employee Modal] Error code:', error.code);
        console.error('[Employee Modal] Error message:', error.message);
        setProjects([]);
        setProjectsLoading(false);
      }
    );

    // Cleanup listener on unmount
    return () => {
      console.log('[Employee Modal] Cleaning up projects listener...');
      unsubscribe();
    };
  }, []);

  // Set up real-time listener for employee contributions
  useEffect(() => {
    if (!user?.uid) {
      console.log('[Employee Contributions] No auth.currentUser.uid, clearing contributions');
      setContributions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const subscription = getEmployeeContributionsSubscription(user.uid, (contribs) => {
      setContributions(contribs);
      setLoading(false);
    });
    if (!subscription) return;
    const unsubscribe = onSnapshot(subscription.query, subscription.onNext, subscription.onError);

    return () => {
      unsubscribe();
    };
  }, [user?.uid]);

  const handleOpenModal = () => {
    setShowModal(true);
    setError(null);
    setSuccess(null);
    setFormData({
      projectId: '',
      projectName: '',
      skill: '',
      role: 'Contributor',
      contributionLevel: 'Moderate',
      notes: '',
    });
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setError(null);
    setSuccess(null);
  };

  const handleProjectChange = (e) => {
    const projectId = e.target.value;
    const project = projects.find(p => (p.id || p.projectId) === projectId);
    
    // Reset skill when project changes
    setFormData({
      ...formData,
      projectId: projectId,
      projectName: project ? project.projectName : '',
      skill: '', // Reset skill selection
    });
  };

  // Get available skills for selected project
  const getAvailableSkills = () => {
    if (!formData.projectId) return [];
    const project = projects.find(p => (p.id || p.projectId) === formData.projectId);
    if (!project) return [];
    
    // Backward compatibility: normalize requiredSkills
    let requiredSkills = project.requiredSkills || [];
    if (!Array.isArray(requiredSkills) || requiredSkills.length === 0) {
      if (project.requiredSkill) {
        requiredSkills = [project.requiredSkill];
      }
    }
    
    return requiredSkills;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!user?.uid) {
      setError('User not authenticated');
      return;
    }

    // Validate form
    if (!formData.projectId || !formData.skill.trim()) {
      setError('Please select a project and skill');
      return;
    }

    // Validate skill is from project's requiredSkills
    const selectedProject = projects.find(p => (p.id || p.projectId) === formData.projectId);
    if (selectedProject && !selectedProject.requiredSkills.includes(formData.skill)) {
      setError('Selected skill must be one of the project\'s required skills');
      return;
    }

    // Validate role
    const validRoles = ['Assistant', 'Contributor', 'Lead', 'Architect'];
    if (!validRoles.includes(formData.role)) {
      setError('Invalid role selected');
      return;
    }

    // Validate contribution level
    const validLevels = ['Minor', 'Moderate', 'Significant'];
    if (!validLevels.includes(formData.contributionLevel)) {
      setError('Invalid contribution level');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);

      // Calculate suggested confidence impact (for display, not applied)
      const confidenceImpact = calculateSuggestedConfidenceImpact(
        formData.contributionLevel,
        formData.role
      );

      // Create contribution in Firestore
      // Note: Service will map 'skill' to 'skillUsed' and 'role' to 'roleInProject'
      const contribId = await createProjectContribution({
        employeeId: user.uid,
        employeeName: user.name || 'Unknown',
        projectId: formData.projectId,
        projectName: formData.projectName,
        skillUsed: formData.skill.trim(), // Exact field name for Firestore
        roleInProject: formData.role, // Exact field name for Firestore
        contributionLevel: formData.contributionLevel,
        confidenceImpact: confidenceImpact,
      });

      if (contribId) {
        console.log('[Employee Contributions] Submission complete, waiting for snapshot update');
        setSuccess('Contribution submitted successfully! It will be reviewed by your Project Manager.');
        // Do NOT manually append data - rely on Firestore onSnapshot to update UI
        // Close modal after short delay
        setTimeout(() => {
          handleCloseModal();
        }, 2000);
      } else {
        setError('Failed to submit contribution. Please try again.');
      }
    } catch (err) {
      console.error('Error submitting contribution:', err);
      setError('Failed to submit contribution. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
      case 'Validated':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
            <CheckCircle2 className="w-3 h-3" />
            Validated
          </span>
        );
      case 'Rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
            {status}
          </span>
        );
    }
  };

  const getContributionLevelColor = (level) => {
    switch (level) {
      case 'Significant':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Moderate':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Minor':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  // Calculate suggested confidence impact (simplified JavaScript version)
  const calculateSuggestedConfidenceImpact = (level, role) => {
    const levelImpact = {
      'Minor': 2.0,
      'Moderate': 5.0,
      'Significant': 10.0,
    };
    const roleMultiplier = {
      'Assistant': 0.5,
      'Contributor': 1.0,
      'Lead': 1.5,
      'Architect': 2.0,
    };
    const baseImpact = levelImpact[level] || 5.0;
    const multiplier = roleMultiplier[role] || 1.0;
    return Math.min(baseImpact * multiplier, 20.0);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16 box-border">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-black">Project Skill Contributions</h1>
          <p className="text-sm text-gray-600 font-medium">
            Track your skill usage across internal projects and validation status.
          </p>
        </div>
        <button
          onClick={handleOpenModal}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1e3a5f] text-white rounded-xl hover:bg-[#1e3a5f]/90 transition-all duration-200 font-semibold text-sm shadow-sm hover:shadow-md"
        >
          <Plus className="w-4 h-4" />
          Submit New Contribution
        </button>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-6 p-5 bg-red-50 border-2 border-red-200 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 p-5 bg-green-50 border-2 border-green-200 rounded-xl flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <p className="text-sm font-medium text-green-800">{success}</p>
        </div>
      )}

      {/* Contributions Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-[#1e3a5f] animate-spin" />
          <span className="ml-3 text-sm font-medium text-gray-600">Loading contributions...</span>
        </div>
      ) : contributions.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-12 text-center">
          <Briefcase className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-black mb-2">No Project Contributions Submitted Yet</h3>
          <p className="text-sm text-gray-600 mb-6 font-medium">
            Start tracking your skill contributions by submitting your first contribution.
          </p>
          <button
            onClick={handleOpenModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1e3a5f] text-white rounded-xl hover:bg-[#1e3a5f]/90 transition-all duration-200 font-semibold text-sm shadow-sm hover:shadow-md"
          >
            <Plus className="w-4 h-4" />
            Submit Your First Contribution
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#1e3a5f]/10 border-b-2 border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#1e3a5f] uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#1e3a5f] uppercase tracking-wider">
                    Skill
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#1e3a5f] uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#1e3a5f] uppercase tracking-wider">
                    Level
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#1e3a5f] uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#1e3a5f] uppercase tracking-wider">
                    Submitted
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#1e3a5f] uppercase tracking-wider">
                    Validated By
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {contributions.map((contrib) => (
                  <tr key={contrib.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-5">
                      <div className="text-sm font-bold text-black">{contrib.projectName}</div>
                      <div className="text-xs text-gray-500 font-medium">{contrib.projectId}</div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <span className="px-3 py-1.5 text-sm font-semibold text-[#1e3a5f] bg-[#1e3a5f]/10 rounded-lg border border-[#1e3a5f]/20">
                        {contrib.skillUsed || contrib.skill || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {contrib.roleInProject || contrib.role || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium border rounded-md ${getContributionLevelColor(contrib.contributionLevel)}`}>
                        {contrib.contributionLevel}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(contrib.status)}
                        {(() => {
                          // Only show button if there's a note/feedback to display
                          let hasNote = false;
                          let feedback = null;
                          
                          if (contrib.status === 'Rejected') {
                            feedback = contrib.rejectionFeedback?.message || contrib.managerComment || null;
                            hasNote = !!feedback;
                          } else if (contrib.status === 'Validated') {
                            feedback = contrib.managerNote || contrib.managerComment || null;
                            hasNote = !!feedback;
                          }
                          
                          if (!hasNote) return null;
                          
                          return (
                            <button
                              onClick={() => {
                                setSelectedFeedback(feedback);
                                setFeedbackModalOpen(true);
                              }}
                              className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                                contrib.status === 'Rejected'
                                  ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                                  : 'text-green-600 hover:text-green-700 hover:bg-green-50'
                              }`}
                              title={contrib.status === 'Rejected' ? 'View manager feedback' : 'View manager note'}
                            >
                              <Info className="w-3.5 h-3.5" />
                              {contrib.status === 'Rejected' ? 'View Feedback' : 'View Note'}
                            </button>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(contrib.submittedAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {contrib.validatedBy ? (
                        <div>
                          <div className="text-gray-900">{contrib.validatedBy}</div>
                          {contrib.validatedAt && (
                            <div className="text-xs text-gray-500">{formatDate(contrib.validatedAt)}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Submission Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Submit New Contribution</h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Project Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Project <span className="text-red-500">*</span>
                </label>
                {projectsLoading ? (
                  <div className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    <span className="text-sm text-gray-500">Loading projects...</span>
                  </div>
                ) : (
                  <select
                    value={formData.projectId}
                    onChange={handleProjectChange}
                    required
                    disabled={projectsLoading}
                    className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] text-sm disabled:bg-gray-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Select a project</option>
                    {projects.map((project) => {
                      const projectId = project.id || project.projectId;
                      const projectName = project.projectName || project.name || 'Unknown Project';
                      const projectStatus = project.status || 'Unknown';
                      return (
                        <option key={projectId} value={projectId}>
                          {projectName} ({projectStatus})
                        </option>
                      );
                    })}
                  </select>
                )}
                {!projectsLoading && projects.length === 0 && (
                  <p className="mt-1 text-xs text-gray-500">No projects found. Contact your manager to create a project.</p>
                )}
              </div>

              {/* Skill Dropdown - Dynamic based on selected project */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Skill Used <span className="text-red-500">*</span>
                </label>
                {!formData.projectId ? (
                  <div className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-500">
                    Please select a project first
                  </div>
                ) : (
                  <select
                    value={formData.skill}
                    onChange={(e) => setFormData({ ...formData, skill: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] text-sm"
                  >
                    <option value="">Select a skill</option>
                    {getAvailableSkills().map((skill) => (
                      <option key={skill} value={skill}>
                        {skill}
                      </option>
                    ))}
                  </select>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  {formData.projectId 
                    ? `Select from the skills required for this project`
                    : 'Select a project to see available skills'}
                </p>
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role in Project
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                >
                  <option value="Assistant">Assistant</option>
                  <option value="Contributor">Contributor</option>
                  <option value="Lead">Lead</option>
                  <option value="Architect">Architect</option>
                </select>
              </div>

              {/* Contribution Level */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contribution Level
                </label>
                <select
                  value={formData.contributionLevel}
                  onChange={(e) => setFormData({ ...formData, contributionLevel: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                >
                  <option value="Minor">Minor</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Significant">Significant</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Minor: Small tasks, Moderate: Regular contributions, Significant: Major features/leadership
                </p>
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Add any additional context about your contribution..."
                  rows={4}
                  className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] text-sm resize-none"
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                  {error}
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                  {success}
                </div>
              )}

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formData.projectId || !formData.skill.trim()}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-[#1e3a5f] rounded-xl hover:bg-[#1e3a5f]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 shadow-sm hover:shadow-md"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Submit Contribution
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manager Feedback Modal */}
      {feedbackModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Manager Note</h2>
              <button
                onClick={() => {
                  setFeedbackModalOpen(false);
                  setSelectedFeedback(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {selectedFeedback ? (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {selectedFeedback}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No feedback was provided.</p>
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => {
                    setFeedbackModalOpen(false);
                    setSelectedFeedback(null);
                  }}
                  className="px-5 py-2.5 bg-[#1e3a5f] text-white rounded-xl hover:bg-[#1e3a5f]/90 transition-all duration-200 font-semibold shadow-sm hover:shadow-md"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

