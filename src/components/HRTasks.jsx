import { useState } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Bot, 
  Calendar, 
  User, 
  FileText, 
  X,
  Check,
  Play,
  Filter,
  Sparkles
} from 'lucide-react';
import { tasks } from '../data/mockData';

/**
 * HRTasks - Task management page for HR users
 * Displays actionable HR responsibilities from system events, employee requests, and AI insights
 */
const HRTasks = () => {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskList, setTaskList] = useState(tasks);
  const [sortBy, setSortBy] = useState('dueDate');

  // Check if user is HR (for access control)
  const isHRUser = true; // In real app, this would come from auth context

  const tabs = [
    { id: 'all', label: 'All Tasks' },
    { id: 'Compliance', label: 'Compliance' },
    { id: 'Performance', label: 'Performance' },
    { id: 'AI Suggested', label: 'AI Suggested' },
  ];

  // Calculate quick stats
  const stats = {
    pending: taskList.filter(t => t.status === 'Pending').length,
    overdue: taskList.filter(t => {
      if (t.status === 'Completed') return false;
      const dueDate = new Date(t.dueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return dueDate < today;
    }).length,
    aiSuggested: taskList.filter(t => t.source === 'AI').length,
  };

  // Filter tasks by active tab
  const filteredTasks = activeTab === 'all'
    ? taskList
    : activeTab === 'AI Suggested'
    ? taskList.filter(task => task.source === 'AI')
    : taskList.filter(task => task.category === activeTab);

  // Sort tasks
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (sortBy === 'priority') {
      const priorityOrder = { High: 3, Medium: 2, Low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    } else if (sortBy === 'dueDate') {
      return new Date(a.dueDate) - new Date(b.dueDate);
    } else if (sortBy === 'category') {
      return a.category.localeCompare(b.category);
    }
    return 0;
  });

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'Medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Low':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pending':
        return 'bg-gray-100 text-gray-800';
      case 'In Progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'Completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getSourceIcon = (source) => {
    switch (source) {
      case 'System':
        return <AlertCircle className="w-4 h-4" />;
      case 'AI':
        return <Bot className="w-4 h-4" />;
      case 'Manual':
        return <User className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const isOverdue = (dueDate, status) => {
    if (status === 'Completed') return false;
    const due = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
  };

  const handleStatusChange = (taskId, newStatus) => {
    setTaskList(taskList.map(task => {
      if (task.id === taskId) {
        return {
          ...task,
          status: newStatus,
          ...(newStatus === 'Completed' && { completedAt: new Date().toISOString() }),
        };
      }
      return task;
    }));
    setSelectedTask(null);
  };

  if (!isHRUser) {
    return null; // Don't render for non-HR users
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
        <p className="text-sm text-gray-600 mt-1">Manage and track HR responsibilities and actions</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending Tasks</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.pending}</p>
            </div>
            <div className="p-3 bg-yellow-50 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Overdue Tasks</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{stats.overdue}</p>
            </div>
            <div className="p-3 bg-red-50 rounded-lg">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">AI Suggested</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">{stats.aiSuggested}</p>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <Sparkles className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Content Area */}
        <div className={`flex-1 ${selectedTask ? 'lg:max-w-[calc(100%-26rem)]' : ''}`}>
          {/* Tabs and Sort */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4">
            <div className="flex items-center justify-between border-b border-gray-200">
              {/* Tabs */}
              <div className="flex flex-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative min-w-0 ${
                      activeTab === tab.id
                        ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <span className="truncate">{tab.label}</span>
                  </button>
                ))}
              </div>
              
              {/* Sort Dropdown */}
              <div className="px-4 border-l border-gray-200">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="text-sm border-0 bg-transparent text-gray-700 focus:outline-none focus:ring-0 cursor-pointer"
                  >
                    <option value="dueDate">Sort by Due Date</option>
                    <option value="priority">Sort by Priority</option>
                    <option value="category">Sort by Category</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Tasks List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {sortedTasks.length === 0 ? (
              <div className="p-12 text-center">
                <CheckCircle2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No tasks in this category</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {sortedTasks.map((task) => {
                  const overdue = isOverdue(task.dueDate, task.status);
                  return (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`mt-1 p-1.5 rounded ${
                            task.source === 'System' ? 'text-blue-600 bg-blue-50' :
                            task.source === 'AI' ? 'text-purple-600 bg-purple-50' :
                            'text-green-600 bg-green-50'
                          }`}>
                            {getSourceIcon(task.source)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-gray-900">{task.title}</h3>
                              {task.source === 'AI' && (
                                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                                  AI Suggested
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
                              <span className="flex items-center gap-1">
                                <Calendar className={`w-3 h-3 ${overdue ? 'text-red-600' : ''}`} />
                                <span className={overdue ? 'text-red-600 font-semibold' : ''}>
                                  Due: {formatDate(task.dueDate)}
                                  {overdue && ' (Overdue)'}
                                </span>
                              </span>
                              {task.linkedEmployee && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    {task.linkedEmployee}
                                  </span>
                                </>
                              )}
                              {task.linkedDepartment && (
                                <>
                                  <span>•</span>
                                  <span>{task.linkedDepartment}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-1 rounded text-xs font-medium border ${getPriorityColor(task.priority)}`}>
                            {task.priority}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(task.status)}`}>
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

        {/* Detail View Panel */}
        {selectedTask && (
          <div className="w-full lg:w-96 bg-white rounded-lg shadow-lg border border-gray-200 lg:sticky lg:top-6 h-fit max-h-[calc(100vh-3rem)] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`p-1.5 rounded ${
                      selectedTask.source === 'System' ? 'text-blue-600 bg-blue-50' :
                      selectedTask.source === 'AI' ? 'text-purple-600 bg-purple-50' :
                      'text-green-600 bg-green-50'
                    }`}>
                      {getSourceIcon(selectedTask.source)}
                    </div>
                    <span className="text-sm font-medium text-gray-600">{selectedTask.source}</span>
                    {selectedTask.source === 'AI' && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                        AI Suggested
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">{selectedTask.title}</h2>
                </div>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Metadata */}
              <div className="mb-6 space-y-3 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Category:</span>
                  <span className="font-medium text-gray-900">{selectedTask.category}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Priority:</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium border ${getPriorityColor(selectedTask.priority)}`}>
                    {selectedTask.priority}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Status:</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(selectedTask.status)}`}>
                    {selectedTask.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Due Date:</span>
                  <span className={`font-medium ${isOverdue(selectedTask.dueDate, selectedTask.status) ? 'text-red-600' : 'text-gray-900'}`}>
                    {formatDate(selectedTask.dueDate)}
                    {isOverdue(selectedTask.dueDate, selectedTask.status) && ' (Overdue)'}
                  </span>
                </div>
                {selectedTask.linkedEmployee && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Employee:</span>
                    <span className="font-medium text-gray-900">{selectedTask.linkedEmployee}</span>
                  </div>
                )}
                {selectedTask.linkedDepartment && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Department:</span>
                    <span className="font-medium text-gray-900">{selectedTask.linkedDepartment}</span>
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
                <p className="text-sm text-gray-700 leading-relaxed">{selectedTask.description}</p>
              </div>

              {/* AI Suggestion Reason */}
              {selectedTask.source === 'AI' && selectedTask.aiSuggestionReason && (
                <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-medium text-purple-900">Why this was suggested:</span>
                  </div>
                  <p className="text-sm text-gray-900">{selectedTask.aiSuggestionReason}</p>
                </div>
              )}

              {/* Linked Resources */}
              {(selectedTask.linkedInboxItem || selectedTask.linkedDocument) && (
                <div className="mb-6">
                  <h3 className="font-semibold text-gray-900 mb-2">Related Resources</h3>
                  <div className="space-y-2">
                    {selectedTask.linkedInboxItem && (
                      <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                        <AlertCircle className="w-4 h-4 text-blue-600" />
                        <span className="text-gray-700">Linked to Inbox Item #{selectedTask.linkedInboxItem}</span>
                      </div>
                    )}
                    {selectedTask.linkedDocument && (
                      <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded text-sm">
                        <FileText className="w-4 h-4 text-green-600" />
                        <span className="text-gray-700">Reference: Document #{selectedTask.linkedDocument}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {selectedTask.status !== 'Completed' && (
                <div className="flex flex-col gap-2 pt-4 border-t border-gray-200">
                  {selectedTask.status === 'Pending' && (
                    <button
                      onClick={() => handleStatusChange(selectedTask.id, 'In Progress')}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      Mark as In Progress
                    </button>
                  )}
                  <button
                    onClick={() => handleStatusChange(selectedTask.id, 'Completed')}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
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
                      <span className="text-green-800">
                        Completed on {formatDate(selectedTask.completedAt)}
                      </span>
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

