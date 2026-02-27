import { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Bot,
  Calendar,
  User,
  X,
  Check,
  Play,
  Filter,
  Sparkles,
  FileCheck,
  UserPlus,
  Inbox,
} from 'lucide-react';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { getHrActionsSubscription, updateHrActionStatus, HR_ACTION_CATEGORIES } from '../services/hrActionsService';

/**
 * HR Action Center - People operations only: compliance, employee lifecycle, inbox escalations, AI-suggested actions.
 * Loads from Firestore hr_actions in real time. Items are auto-created when employees message HR, leave request, new employee, AI escalation.
 */
const HRTasks = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('all');
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskList, setTaskList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('dueDate');

  const isHRUser = user?.role === 'HR';

  const tabs = [
    { id: 'all', label: 'All Actions' },
    { id: HR_ACTION_CATEGORIES.COMPLIANCE, label: 'Compliance' },
    { id: HR_ACTION_CATEGORIES.EMPLOYEE_LIFECYCLE, label: 'Employee Lifecycle' },
    { id: HR_ACTION_CATEGORIES.INBOX_ESCALATION, label: 'Inbox Escalations' },
    { id: HR_ACTION_CATEGORIES.AI_SUGGESTED, label: 'AI Suggested' },
  ];

  useEffect(() => {
    if (!isHRUser) {
      setLoading(false);
      setTaskList([]);
      return;
    }
    const sub = getHrActionsSubscription((data) => {
      setTaskList(data);
      setLoading(false);
    });
    const unsubscribe = onSnapshot(sub.query, sub.onNext, sub.onError);
    return () => unsubscribe();
  }, [isHRUser]);

  const stats = useMemo(() => ({
    pending: taskList.filter((t) => t.status === 'Pending').length,
    overdue: taskList.filter((t) => {
      if (t.status === 'Completed') return false;
      const due = t.dueDate ? new Date(t.dueDate) : null;
      if (!due) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return due < today;
    }).length,
    aiSuggested: taskList.filter((t) => t.category === HR_ACTION_CATEGORIES.AI_SUGGESTED).length,
  }), [taskList]);

  const filteredTasks = useMemo(() => {
    if (activeTab === 'all') return taskList;
    return taskList.filter((task) => task.category === activeTab);
  }, [taskList, activeTab]);

  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      if (sortBy === 'priority') {
        const order = { High: 3, Medium: 2, Low: 1 };
        return (order[b.priority] ?? 2) - (order[a.priority] ?? 2);
      }
      if (sortBy === 'dueDate') {
        const da = a.dueDate ? new Date(a.dueDate) : new Date(0);
        const db = b.dueDate ? new Date(b.dueDate) : new Date(0);
        return da - db;
      }
      if (sortBy === 'category') {
        return (a.category || '').localeCompare(b.category || '');
      }
      return 0;
    });
  }, [filteredTasks, sortBy]);

  const getPriorityColor = (priority) => {
    const p = (priority || 'Medium').toLowerCase();
    if (p === 'high') return 'bg-red-100 text-red-800 border-red-200';
    if (p === 'medium') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (p === 'low') return 'bg-blue-100 text-blue-800 border-blue-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getStatusColor = (status) => {
    const s = (status || 'Pending').toLowerCase();
    if (s === 'pending') return 'bg-gray-100 text-gray-800';
    if (s === 'in progress') return 'bg-yellow-100 text-yellow-800';
    if (s === 'completed') return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case HR_ACTION_CATEGORIES.COMPLIANCE:
        return <FileCheck className="w-4 h-4" />;
      case HR_ACTION_CATEGORIES.EMPLOYEE_LIFECYCLE:
        return <UserPlus className="w-4 h-4" />;
      case HR_ACTION_CATEGORIES.INBOX_ESCALATION:
        return <Inbox className="w-4 h-4" />;
      case HR_ACTION_CATEGORIES.AI_SUGGESTED:
        return <Bot className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  const getCategoryIconBg = (category) => {
    switch (category) {
      case HR_ACTION_CATEGORIES.COMPLIANCE:
        return 'text-blue-600 bg-blue-50';
      case HR_ACTION_CATEGORIES.EMPLOYEE_LIFECYCLE:
        return 'text-green-600 bg-green-50';
      case HR_ACTION_CATEGORIES.INBOX_ESCALATION:
        return 'text-amber-600 bg-amber-50';
      case HR_ACTION_CATEGORIES.AI_SUGGESTED:
        return 'text-purple-600 bg-purple-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getCategoryLabel = (category) => {
    const t = tabs.find((tab) => tab.id === category);
    return t ? t.label : category;
  };

  const formatDate = (date) => {
    if (!date) return '—';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const isOverdue = (dueDate, status) => {
    if (status === 'Completed') return false;
    if (!dueDate) return false;
    const due = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
  };

  const handleStatusChange = async (actionId, newStatus) => {
    try {
      await updateHrActionStatus(actionId, newStatus);
      setTaskList((prev) =>
        prev.map((task) =>
          task.id === actionId
            ? {
                ...task,
                status: newStatus,
                ...(newStatus === 'Completed' && { completedAt: new Date() }),
              }
            : task
        )
      );
      setSelectedTask(null);
    } catch (err) {
      console.error('Error updating task status:', err);
    }
  };

  if (!isHRUser) {
    return null;
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 pb-16">
      <div className="mb-8 space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold text-black">HR Action Center</h1>
        <p className="text-sm text-gray-600 font-medium">Compliance, employee lifecycle, inbox escalations, and AI-suggested people operations</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <div className="bg-white rounded-xl p-7 shadow-sm border-2 border-gray-200 hover:shadow-md transition-all duration-200 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#1e3a5f]" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pending</p>
              <p className="text-3xl font-bold text-black leading-tight">{stats.pending}</p>
            </div>
            <div className="p-3.5 bg-yellow-50 rounded-xl">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-7 shadow-sm border-2 border-gray-200 hover:shadow-md transition-all duration-200 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#1e3a5f]" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Overdue</p>
              <p className="text-3xl font-bold text-red-600 leading-tight">{stats.overdue}</p>
            </div>
            <div className="p-3.5 bg-red-50 rounded-xl">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-7 shadow-sm border-2 border-gray-200 hover:shadow-md transition-all duration-200 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#1e3a5f]" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI Suggested</p>
              <p className="text-3xl font-bold text-purple-600 leading-tight">{stats.aiSuggested}</p>
            </div>
            <div className="p-3.5 bg-purple-50 rounded-xl">
              <Sparkles className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <div className={`flex-1 ${selectedTask ? 'lg:max-w-[calc(100%-26rem)]' : ''}`}>
          <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 mb-6">
            <div className="flex items-center justify-between border-b-2 border-gray-200">
              <div className="flex flex-1 flex-wrap">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 min-w-0 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold transition-all duration-200 relative ${
                      activeTab === tab.id
                        ? 'text-[#1e3a5f] border-b-2 border-[#1e3a5f] bg-[#1e3a5f]/10'
                        : 'text-gray-600 hover:text-[#1e3a5f] hover:bg-gray-50'
                    }`}
                  >
                    <span className="truncate">{tab.label}</span>
                  </button>
                ))}
              </div>
              <div className="px-4 border-l-2 border-gray-200">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="text-sm border-0 bg-transparent text-gray-700 font-semibold focus:outline-none focus:ring-0 cursor-pointer"
                  >
                    <option value="dueDate">Sort by Due Date</option>
                    <option value="priority">Sort by Priority</option>
                    <option value="category">Sort by Category</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200">
            {loading ? (
              <div className="p-12 text-center text-gray-500 font-medium">Loading actions...</div>
            ) : sortedTasks.length === 0 ? (
              <div className="p-12 text-center">
                <CheckCircle2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">
                  {activeTab === 'all' ? 'No people-operations actions yet' : 'No HR actions in this category'}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {activeTab === 'all'
                    ? 'Compliance, lifecycle, inbox escalations, and AI-suggested tasks will appear here.'
                    : 'Tasks from Inbox, compliance workflows, or AI suggestions will show under their category.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {sortedTasks.map((task) => {
                  const overdue = isOverdue(task.dueDate, task.status);
                  return (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className="p-5 cursor-pointer hover:bg-gray-50 hover:border-l-4 hover:border-l-[#1e3a5f] transition-all duration-200"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`mt-1 p-1.5 rounded ${getCategoryIconBg(task.category)}`}>
                            {getCategoryIcon(task.category)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-gray-900">{task.title}</h3>
                              {task.category === HR_ACTION_CATEGORIES.AI_SUGGESTED && (
                                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                                  AI Suggested
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500 mb-2 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Calendar className={overdue ? 'text-red-600' : ''} />
                                <span className={overdue ? 'text-red-600 font-semibold' : ''}>
                                  Due: {formatDate(task.dueDate)}
                                  {overdue && ' (Overdue)'}
                                </span>
                              </span>
                              {task.employeeName && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    {task.employeeName}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 ${getPriorityColor(task.priority)}`}>
                            {task.priority}
                          </span>
                          <span className={`px-3 py-1.5 rounded-lg text-xs font-bold ${getStatusColor(task.status)}`}>
                            {task.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {selectedTask && (
          <div className="w-full lg:w-96 bg-white rounded-xl shadow-lg border-2 border-gray-200 lg:sticky lg:top-6 h-fit max-h-[calc(100vh-3rem)] overflow-y-auto">
            <div className="p-8">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`p-2 rounded-xl ${getCategoryIconBg(selectedTask.category)}`}>
                      {getCategoryIcon(selectedTask.category)}
                    </div>
                    <span className="text-sm font-bold text-gray-600">{getCategoryLabel(selectedTask.category)}</span>
                    {selectedTask.category === HR_ACTION_CATEGORIES.AI_SUGGESTED && (
                      <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded-lg border border-purple-200">
                        AI Suggested
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-black mb-1">{selectedTask.title}</h2>
                </div>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="text-gray-400 hover:text-black transition-colors p-1 hover:bg-gray-100 rounded-lg"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-8 space-y-3 p-5 bg-gray-50 rounded-xl border-2 border-gray-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Category:</span>
                  <span className="font-medium text-gray-900">{getCategoryLabel(selectedTask.category)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Priority:</span>
                  <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 ${getPriorityColor(selectedTask.priority)}`}>
                    {selectedTask.priority}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 font-semibold">Status:</span>
                  <span className={`px-3 py-1.5 rounded-lg text-xs font-bold ${getStatusColor(selectedTask.status)}`}>
                    {selectedTask.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Due Date:</span>
                  <span className={isOverdue(selectedTask.dueDate, selectedTask.status) ? 'text-red-600 font-medium' : 'font-medium text-gray-900'}>
                    {formatDate(selectedTask.dueDate)}
                    {isOverdue(selectedTask.dueDate, selectedTask.status) && ' (Overdue)'}
                  </span>
                </div>
                {selectedTask.employeeName && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Employee:</span>
                    <span className="font-medium text-gray-900">{selectedTask.employeeName}</span>
                  </div>
                )}
              </div>

              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
                <p className="text-sm text-gray-700 leading-relaxed">{selectedTask.description || '—'}</p>
              </div>

              {selectedTask.category === HR_ACTION_CATEGORIES.AI_SUGGESTED && selectedTask.aiSuggestionReason && (
                <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-medium text-purple-900">Why this was suggested:</span>
                  </div>
                  <p className="text-sm text-gray-900">{selectedTask.aiSuggestionReason}</p>
                </div>
              )}

              {selectedTask.status !== 'Completed' && (
                <div className="flex flex-col gap-3 pt-6 border-t-2 border-gray-200">
                  {selectedTask.status === 'Pending' && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(selectedTask.id, 'In Progress')}
                      className="flex items-center justify-center gap-2 px-5 py-3 bg-yellow-600 text-white rounded-xl hover:bg-yellow-700 transition-all duration-200 font-semibold shadow-sm hover:shadow-md"
                    >
                      <Play className="w-4 h-4" />
                      Mark as In Progress
                    </button>
                  )}
                  <button
                    onClick={() => handleStatusChange(selectedTask.id, 'Completed')}
                    type="button"
                    className="flex items-center justify-center gap-2 px-5 py-3 bg-[#1e3a5f] text-white rounded-xl hover:bg-[#1e3a5f]/90 transition-all duration-200 font-semibold shadow-sm hover:shadow-md"
                  >
                    <Check className="w-4 h-4" />
                    Mark as Completed
                  </button>
                </div>
              )}

              {selectedTask.status === 'Completed' && selectedTask.completedAt && (
                <div className="pt-4 border-t border-gray-200">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-green-800">Completed on {formatDate(selectedTask.completedAt)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HRTasks;
