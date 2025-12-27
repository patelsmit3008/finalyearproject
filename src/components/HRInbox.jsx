import { useState } from 'react';
import { 
  Bell, 
  User, 
  Bot, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  X,
  FileText,
  Calendar,
  DollarSign,
  Home,
  Check,
  Edit,
  MessageSquare
} from 'lucide-react';
import { inboxItems } from '../data/mockData';

/**
 * HRInbox - Centralized notification and action center for HR users
 * Displays system alerts, employee requests, and AI chatbot escalations
 */
const HRInbox = () => {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedItem, setSelectedItem] = useState(null);
  const [items, setItems] = useState(inboxItems);
  const [editingAIResponse, setEditingAIResponse] = useState(false);
  const [editedResponse, setEditedResponse] = useState('');

  // Check if user is HR (for access control)
  const isHRUser = true; // In real app, this would come from auth context

  const tabs = [
    { id: 'all', label: 'All', count: items.length },
    { id: 'system-alert', label: 'System Alerts', count: items.filter(i => i.type === 'system-alert').length },
    { id: 'employee-request', label: 'Employee Requests', count: items.filter(i => i.type === 'employee-request').length },
    { id: 'ai-escalation', label: 'AI Escalations', count: items.filter(i => i.type === 'ai-escalation').length },
  ];

  const filteredItems = activeTab === 'all' 
    ? items 
    : items.filter(item => item.type === activeTab);

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
      case 'Unread':
        return 'bg-indigo-100 text-indigo-800';
      case 'In Review':
        return 'bg-yellow-100 text-yellow-800';
      case 'Resolved':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getSourceIcon = (source) => {
    switch (source) {
      case 'System':
        return <Bell className="w-4 h-4" />;
      case 'Employee':
        return <User className="w-4 h-4" />;
      case 'AI Chatbot':
        return <Bot className="w-4 h-4" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins} minutes ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hours ago`;
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const handleAction = (itemId, action) => {
    if (action === 'edit-ai') {
      setEditingAIResponse(true);
      setEditedResponse(selectedItem.details.aiResponse);
      return;
    }

    if (action === 'save-ai-edit') {
      setItems(items.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            status: 'Resolved',
            details: {
              ...item.details,
              aiResponse: editedResponse,
              editedBy: 'Smit Patel',
              editedAt: new Date().toISOString(),
            }
          };
        }
        return item;
      }));
      setEditingAIResponse(false);
      setSelectedItem(null);
      return;
    }

    setItems(items.map(item => {
      if (item.id === itemId) {
        let newStatus = item.status;
        if (action === 'approve' || action === 'approve-ai' || action === 'acknowledge') {
          newStatus = 'Resolved';
        } else if (action === 'reject') {
          newStatus = 'Resolved';
        }
        return { ...item, status: newStatus };
      }
      return item;
    }));
    
    // Close detail panel after action
    setSelectedItem(null);
  };

  const handleItemClick = (item) => {
    setSelectedItem(item);
    // Mark as "In Review" if unread
    if (item.status === 'Unread') {
      setItems(items.map(i => 
        i.id === item.id ? { ...i, status: 'In Review' } : i
      ));
    }
  };

  if (!isHRUser) {
    return null; // Don't render for non-HR users
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
        <p className="text-sm text-gray-600 mt-1">Review and manage notifications, requests, and escalations</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Content Area */}
        <div className={`flex-1 ${selectedItem ? 'lg:max-w-[calc(100%-26rem)]' : ''}`}>
          {/* Tabs */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4">
            <div className="flex border-b border-gray-200">
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
                  {tab.count > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                      activeTab === tab.id
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Inbox Items List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {filteredItems.length === 0 ? (
              <div className="p-12 text-center">
                <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No items in this category</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                      item.status === 'Unread' ? 'bg-indigo-50/30' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`mt-1 p-1.5 rounded ${
                          item.source === 'System' ? 'text-blue-600 bg-blue-50' :
                          item.source === 'Employee' ? 'text-green-600 bg-green-50' :
                          'text-purple-600 bg-purple-50'
                        }`}>
                          {getSourceIcon(item.source)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900">{item.title}</h3>
                            {item.status === 'Unread' && (
                              <span className="w-2 h-2 bg-indigo-600 rounded-full"></span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{item.summary}</p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            {item.employeeName && (
                              <>
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {item.employeeName}
                                </span>
                                <span>•</span>
                              </>
                            )}
                            <span>{item.department}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatTimestamp(item.timestamp)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2 py-1 rounded text-xs font-medium border ${getPriorityColor(item.priority)}`}>
                          {item.priority}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(item.status)}`}>
                          {item.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail View Panel */}
        {selectedItem && (
          <div className="w-full lg:w-96 bg-white rounded-lg shadow-lg border border-gray-200 lg:sticky lg:top-6 h-fit max-h-[calc(100vh-3rem)] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`p-1.5 rounded ${
                      selectedItem.source === 'System' ? 'text-blue-600 bg-blue-50' :
                      selectedItem.source === 'Employee' ? 'text-green-600 bg-green-50' :
                      'text-purple-600 bg-purple-50'
                    }`}>
                      {getSourceIcon(selectedItem.source)}
                    </div>
                    <span className="text-sm font-medium text-gray-600">{selectedItem.source}</span>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">{selectedItem.title}</h2>
                  <p className="text-sm text-gray-600">{selectedItem.summary}</p>
                </div>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Metadata */}
              <div className="mb-6 space-y-3 p-4 bg-gray-50 rounded-lg">
                {selectedItem.employeeName && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Employee:</span>
                    <span className="font-medium text-gray-900">{selectedItem.employeeName}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Department:</span>
                  <span className="font-medium text-gray-900">{selectedItem.department}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Priority:</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium border ${getPriorityColor(selectedItem.priority)}`}>
                    {selectedItem.priority}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Status:</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(selectedItem.status)}`}>
                    {selectedItem.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Time:</span>
                  <span className="font-medium text-gray-900">{formatTimestamp(selectedItem.timestamp)}</span>
                </div>
              </div>

              {/* Details based on type */}
              <div className="mb-6">
                {selectedItem.type === 'employee-request' && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900 mb-3">Request Details</h3>
                    {selectedItem.details.requestType === 'Annual Leave' && (
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">Start Date:</span>
                          <span className="font-medium text-gray-900">{selectedItem.details.startDate}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">End Date:</span>
                          <span className="font-medium text-gray-900">{selectedItem.details.endDate}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">Duration:</span>
                          <span className="font-medium text-gray-900">{selectedItem.details.days} days</span>
                        </div>
                        <div className="mt-3 p-3 bg-gray-50 rounded">
                          <p className="text-xs text-gray-600 mb-1">Reason:</p>
                          <p className="text-sm text-gray-900">{selectedItem.details.reason}</p>
                        </div>
                      </div>
                    )}
                    {selectedItem.details.requestType === 'Expense Reimbursement' && (
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">Amount:</span>
                          <span className="font-medium text-gray-900">${selectedItem.details.amount.toFixed(2)}</span>
                        </div>
                        <div className="mt-3 p-3 bg-gray-50 rounded">
                          <p className="text-xs text-gray-600 mb-1">Description:</p>
                          <p className="text-sm text-gray-900">{selectedItem.details.description}</p>
                        </div>
                      </div>
                    )}
                    {selectedItem.details.requestType === 'Remote Work' && (
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Home className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">Type:</span>
                          <span className="font-medium text-gray-900">{selectedItem.details.requestTypeDetail}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">Start Date:</span>
                          <span className="font-medium text-gray-900">{selectedItem.details.startDate}</span>
                        </div>
                        <div className="mt-3 p-3 bg-gray-50 rounded">
                          <p className="text-xs text-gray-600 mb-1">Reason:</p>
                          <p className="text-sm text-gray-900">{selectedItem.details.reason}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {selectedItem.type === 'system-alert' && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900 mb-3">Alert Details</h3>
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-gray-900">{selectedItem.details.alertType}</p>
                      {selectedItem.details.dueDate && (
                        <p className="text-xs text-gray-600 mt-1">Due: {selectedItem.details.dueDate}</p>
                      )}
                      {selectedItem.details.currentScore && (
                        <p className="text-xs text-gray-600 mt-1">
                          Current Score: {selectedItem.details.currentScore} (Threshold: {selectedItem.details.threshold})
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {selectedItem.type === 'ai-escalation' && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900 mb-3">AI Chatbot Escalation</h3>
                    
                    {/* Employee Question */}
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <User className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-medium text-blue-900">Employee Question</span>
                      </div>
                      <p className="text-sm text-gray-900">{selectedItem.details.employeeQuestion}</p>
                    </div>

                    {/* AI Response */}
                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Bot className="w-4 h-4 text-purple-600" />
                        <span className="text-xs font-medium text-purple-900">AI Generated Response</span>
                      </div>
                      {editingAIResponse ? (
                        <textarea
                          value={editedResponse}
                          onChange={(e) => setEditedResponse(e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded text-sm text-gray-900 bg-white min-h-[120px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Edit the AI response..."
                        />
                      ) : (
                        <p className="text-sm text-gray-900">{selectedItem.details.aiResponse}</p>
                      )}
                    </div>

                    {/* Source Document */}
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-600" />
                        <span className="text-xs text-gray-600">Source Document:</span>
                        <span className="text-xs font-medium text-gray-900">{selectedItem.details.sourceDocument}</span>
                      </div>
                    </div>

                    {selectedItem.details.approvedBy && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2 text-xs">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          <span className="text-green-800">
                            Approved by {selectedItem.details.approvedBy} on {new Date(selectedItem.details.approvedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              {selectedItem.actions && selectedItem.actions.length > 0 && (
                <div className="flex flex-col gap-2 pt-4 border-t border-gray-200">
                  {selectedItem.actions.includes('approve') && (
                    <button
                      onClick={() => handleAction(selectedItem.id, 'approve')}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      Approve
                    </button>
                  )}
                  {selectedItem.actions.includes('reject') && (
                    <button
                      onClick={() => handleAction(selectedItem.id, 'reject')}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                  )}
                  {selectedItem.actions.includes('acknowledge') && (
                    <button
                      onClick={() => handleAction(selectedItem.id, 'acknowledge')}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Acknowledge
                    </button>
                  )}
                  {selectedItem.actions.includes('approve-ai') && (
                    <button
                      onClick={() => handleAction(selectedItem.id, 'approve-ai')}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      Approve AI Response
                    </button>
                  )}
                  {selectedItem.actions.includes('edit-ai') && !editingAIResponse && (
                    <button
                      onClick={() => handleAction(selectedItem.id, 'edit-ai')}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                      Edit AI Response
                    </button>
                  )}
                  {editingAIResponse && (
                    <>
                      <button
                        onClick={() => handleAction(selectedItem.id, 'save-ai-edit')}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <Check className="w-4 h-4" />
                        Save & Approve
                      </button>
                      <button
                        onClick={() => {
                          setEditingAIResponse(false);
                          setEditedResponse('');
                        }}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                      >
                        <X className="w-4 h-4" />
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HRInbox;

