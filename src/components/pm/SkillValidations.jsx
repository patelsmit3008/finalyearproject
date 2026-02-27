import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Clock, Loader2, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { onSnapshot } from 'firebase/firestore';
import { getPendingContributionsSubscription, validateContribution } from '../../firebase/services/projectContributionsService';

export default function SkillValidations() {
  const { user } = useAuth();
  const [contributions, setContributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(null); // ID of contribution being validated
  const [error, setError] = useState(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingContribution, setRejectingContribution] = useState(null);
  const [rejectionFeedback, setRejectionFeedback] = useState('');
  const [validateModalOpen, setValidateModalOpen] = useState(false);
  const [validatingContribution, setValidatingContribution] = useState(null);
  const [managerNote, setManagerNote] = useState('');

  // Set up real-time listener for pending contributions
  useEffect(() => {
    console.log('[SkillValidations] Component mounted, setting up Firestore listener...');
    setLoading(true);
    setError(null);

    const subscription = getPendingContributionsSubscription((contribs) => {
      setContributions(contribs);
      setLoading(false);
      if (contribs.length === 0) {
        console.warn('[SkillValidations] No pending contributions found. Check Firestore console for data.');
      }
    });
    const unsubscribe = onSnapshot(subscription.query, subscription.onNext, subscription.onError);

    return () => {
      console.log('[SkillValidations] Component unmounting, cleaning up listener...');
      unsubscribe();
    };
  }, []);

  const handleValidateClick = (contribution) => {
    // Generate default validation note
    const defaultNote = `Hello ${contribution.employeeName || 'there'}, your contribution for ${contribution.skillUsed || contribution.skill} on ${contribution.projectName} has been validated. Great work!`;
    
    setValidatingContribution(contribution);
    setManagerNote(defaultNote);
    setValidateModalOpen(true);
  };

  const handleValidateConfirm = async () => {
    if (!validatingContribution) {
      setError('No contribution selected');
      return;
    }

    try {
      setValidating(validatingContribution.id);
      setError(null);

      const success = await validateContribution(
        validatingContribution.id,
        user.uid || user.name || 'PM',
        true, // approved = true (validate)
        null, // managerComment (legacy)
        null, // rejectionFeedback (not used for validation)
        null, // pmUserId (not needed for validation)
        managerNote.trim() || null // managerNote
      );

      if (success) {
        // Close modal and reset state
        setValidateModalOpen(false);
        setValidatingContribution(null);
        setManagerNote('');
        console.log(`Contribution ${validatingContribution.id} validated with note`);
      } else {
        setError('Failed to validate contribution');
      }
    } catch (err) {
      console.error('Error validating contribution:', err);
      setError('Failed to validate contribution');
    } finally {
      setValidating(null);
    }
  };

  const handleValidateCancel = () => {
    setValidateModalOpen(false);
    setValidatingContribution(null);
    setManagerNote('');
  };

  const handleRejectClick = (contribution) => {
    // Generate default rejection message
    const defaultMessage = `Hello ${contribution.employeeName || 'there'}, your contribution for ${contribution.skillUsed || contribution.skill} on ${contribution.projectName} was reviewed. The team recommends improving this skill further before validation.`;
    
    setRejectingContribution(contribution);
    setRejectionFeedback(defaultMessage);
    setRejectModalOpen(true);
  };

  const handleRejectConfirm = async () => {
    if (!rejectingContribution || !rejectionFeedback.trim()) {
      setError('Please provide rejection feedback');
      return;
    }

    try {
      setValidating(rejectingContribution.id);
      setError(null);

      const success = await validateContribution(
        rejectingContribution.id,
        user.uid || user.name || 'PM',
        false, // approved = false (reject)
        null, // managerComment (legacy)
        rejectionFeedback.trim(), // rejectionFeedback message
        user.uid // pmUserId for rejectionFeedback.createdBy
      );

      if (success) {
        // Close modal and reset state
        setRejectModalOpen(false);
        setRejectingContribution(null);
        setRejectionFeedback('');
        console.log(`Contribution ${rejectingContribution.id} rejected with feedback`);
      } else {
        setError('Failed to reject contribution');
      }
    } catch (err) {
      console.error('Error rejecting contribution:', err);
      setError('Failed to reject contribution');
    } finally {
      setValidating(null);
    }
  };

  const handleRejectCancel = () => {
    setRejectModalOpen(false);
    setRejectingContribution(null);
    setRejectionFeedback('');
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

  const getRoleColor = (role) => {
    const roleValue = role || '';
    switch (roleValue) {
      case 'Architect':
        return 'text-purple-700 font-semibold';
      case 'Lead':
        return 'text-indigo-700 font-semibold';
      case 'Contributor':
        return 'text-blue-700';
      case 'Assistant':
        return 'text-gray-600';
      default:
        return 'text-gray-700';
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
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-12 box-border">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Skill Validations</h1>
        <p className="text-sm text-gray-600 mt-1">
          Review and validate employee skill contributions from projects
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
          <span className="ml-3 text-sm text-gray-600">Loading pending contributions...</span>
        </div>
      ) : contributions.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Pending Validations</h3>
          <p className="text-sm text-gray-600">
            All skill contributions have been reviewed. New submissions will appear here.
          </p>
        </div>
      ) : (
        /* Contributions Table */
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Skill
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Level
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Impact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Submitted
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {contributions.map((contribution) => (
                  <tr key={contribution.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {contribution.employeeName || 'Unknown'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {contribution.employeeId?.substring(0, 8)}...
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{contribution.projectName}</div>
                      <div className="text-xs text-gray-500">{contribution.projectId}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-sm font-medium text-indigo-700 bg-indigo-50 rounded-md">
                        {contribution.skillUsed || contribution.skill}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm ${getRoleColor(contribution.roleInProject || contribution.role)}`}>
                        {contribution.roleInProject || contribution.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium border rounded-md ${getContributionLevelColor(contribution.contributionLevel)}`}>
                        {contribution.contributionLevel || 'Moderate'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {contribution.confidenceImpact ? `+${contribution.confidenceImpact}%` : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(contribution.submittedAt || contribution.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleValidateClick(contribution)}
                          disabled={validating === contribution.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Validate
                        </button>
                        <button
                          onClick={() => handleRejectClick(contribution)}
                          disabled={validating === contribution.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
                        >
                          <XCircle className="w-3 h-3" />
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary */}
      {!loading && contributions.length > 0 && (
        <div className="mt-4 text-sm text-gray-600">
          <span className="font-medium">{contributions.length}</span> pending validation{contributions.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Rejection Feedback Modal */}
      {rejectModalOpen && rejectingContribution && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Reject Contribution</h2>
              <button
                onClick={handleRejectCancel}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={validating === rejectingContribution.id}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Contribution Details */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="text-sm">
                  <span className="font-medium text-gray-700">Employee:</span>{' '}
                  <span className="text-gray-900">{rejectingContribution.employeeName || 'Unknown'}</span>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-gray-700">Project:</span>{' '}
                  <span className="text-gray-900">{rejectingContribution.projectName}</span>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-gray-700">Skill:</span>{' '}
                  <span className="text-gray-900">{rejectingContribution.skillUsed || rejectingContribution.skill}</span>
                </div>
              </div>

              {/* Rejection Feedback Textarea */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rejection Feedback <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectionFeedback}
                  onChange={(e) => setRejectionFeedback(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm resize-none"
                  placeholder="Enter rejection feedback for the employee..."
                />
                <p className="mt-2 text-xs text-gray-500">
                  This message will be stored with the rejection and can be viewed by the employee.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={handleRejectCancel}
                  disabled={validating === rejectingContribution.id}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectConfirm}
                  disabled={validating === rejectingContribution.id || !rejectionFeedback.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {validating === rejectingContribution.id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Rejecting...
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4" />
                      Confirm Reject
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Validation Note Modal */}
      {validateModalOpen && validatingContribution && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Validate Contribution</h2>
              <button
                onClick={handleValidateCancel}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={validating === validatingContribution.id}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Contribution Details */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="text-sm">
                  <span className="font-medium text-gray-700">Employee:</span>{' '}
                  <span className="text-gray-900">{validatingContribution.employeeName || 'Unknown'}</span>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-gray-700">Project:</span>{' '}
                  <span className="text-gray-900">{validatingContribution.projectName}</span>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-gray-700">Skill:</span>{' '}
                  <span className="text-gray-900">{validatingContribution.skillUsed || validatingContribution.skill}</span>
                </div>
              </div>

              {/* Manager Note Textarea */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Manager Note <span className="text-gray-500 text-xs">(visible to employee)</span>
                </label>
                <textarea
                  value={managerNote}
                  onChange={(e) => setManagerNote(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm resize-none"
                  placeholder="Enter a note for the employee (optional)..."
                />
                <p className="mt-2 text-xs text-gray-500">
                  This note will be visible to the employee and can be used to provide feedback or recognition.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={handleValidateCancel}
                  disabled={validating === validatingContribution.id}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleValidateConfirm}
                  disabled={validating === validatingContribution.id}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {validating === validatingContribution.id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Confirm Validate
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

