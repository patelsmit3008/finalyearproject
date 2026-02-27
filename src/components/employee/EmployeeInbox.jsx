import { useState, useEffect, useRef, useMemo } from 'react';
import { Bell, MessageSquarePlus, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { onSnapshot } from 'firebase/firestore';
import {
  getEmployeeConversationsSubscription,
  getConversationMessagesSubscription,
  createConversation,
  sendConversationMessage,
  softDeleteConversation,
} from '../../services/conversationsService';

const CATEGORIES = ['General', 'Payroll', 'Leave', 'Benefits', 'Other'];

function formatStatus(s) {
  return s === 'resolved' ? 'Resolved' : 'Open';
}

function formatTimestamp(date) {
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

/**
 * Employee Inbox - Two-pane chat layout. Left: conversation list. Right: thread + composer.
 */
export default function EmployeeInbox() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [messageForm, setMessageForm] = useState({ subject: '', category: 'General', message: '' });
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      setConversations([]);
      setLoadError(null);
      return;
    }
    setLoadError(null);
    const sub = getEmployeeConversationsSubscription(user.uid, (data) => {
      setConversations(data);
      setLoading(false);
      setLoadError(null);
    });
    if (!sub) {
      setLoading(false);
      return;
    }
    const handleError = (err) => {
      console.error('[EmployeeInbox] conversations listener error:', err);
      setLoadError(err?.message || 'Could not load conversations.');
      setConversations([]);
      setLoading(false);
    };
    const unsubscribe = onSnapshot(sub.query, sub.onNext, handleError);
    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!selectedConversation?.id) {
      setMessages([]);
      return;
    }
    const sub = getConversationMessagesSubscription(selectedConversation.id, setMessages);
    if (!sub) return;
    const unsubscribe = onSnapshot(sub.query, sub.onNext, sub.onError);
    return () => unsubscribe();
  }, [selectedConversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const visibleConversations = useMemo(() => {
    return conversations.filter((c) => !(c.deletedFor || []).includes(user?.uid));
  }, [conversations, user?.uid]);

  const getOtherParticipantName = (conversation) => {
    const currentUserId = user?.uid;
    const entries = Object.entries(conversation.participantsInfo || {});
    const other = entries.find(([uid]) => uid !== currentUserId);
    return other ? (other[1].name ?? 'Unknown') : 'HR';
  };

  const handleDeleteConversation = async (e, conversationId) => {
    e.stopPropagation();
    const confirmDelete = window.confirm('Delete this conversation?');
    if (!confirmDelete) return;
    if (!user?.uid) return;
    try {
      await softDeleteConversation(conversationId, user.uid);
      if (selectedConversation?.id === conversationId) setSelectedConversation(null);
    } catch (err) {
      console.error('Error deleting conversation:', err);
    }
  };

  const showSuccessToast = () => {
    setToast('Message sent to HR');
    setTimeout(() => setToast(null), 3000);
  };

  const handleSendNewMessage = async (e) => {
    e.preventDefault();
    if (!user?.uid || !messageForm.subject.trim() || !messageForm.message.trim()) return;
    setSending(true);
    try {
      await createConversation({
        employeeId: user.uid,
        employeeName: user.name ?? 'Unknown',
        subject: messageForm.subject.trim(),
        message: messageForm.message.trim(),
        category: messageForm.category,
        priority: 'medium',
      });
      setShowMessageModal(false);
      setMessageForm({ subject: '', category: 'General', message: '' });
      showSuccessToast();
    } catch (err) {
      console.error('Error sending message to HR:', err);
    } finally {
      setSending(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!selectedConversation?.id || !replyText.trim() || sendingReply) return;
    if (selectedConversation.status === 'resolved') return;
    setSendingReply(true);
    try {
      await sendConversationMessage(selectedConversation.id, {
        senderRole: 'employee',
        text: replyText.trim(),
        senderName: user?.name ?? 'You',
      });
      setReplyText('');
    } catch (err) {
      console.error('Error sending reply:', err);
    } finally {
      setSendingReply(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply(e);
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black">Inbox</h1>
          <p className="text-sm text-gray-600">Your conversations with HR</p>
        </div>
        <button
          type="button"
          onClick={() => setShowMessageModal(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1e3a5f] text-white font-semibold rounded-xl hover:bg-[#1e3a5f]/90 transition-colors shrink-0"
        >
          <MessageSquarePlus className="w-5 h-5" />
          + Message HR
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-green-600 text-white font-medium rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {showMessageModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/50" onClick={() => !sending && setShowMessageModal(false)}>
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-black">Message HR</h2>
              <button type="button" onClick={() => !sending && setShowMessageModal(false)} className="text-gray-400 hover:text-black p-1 rounded-lg hover:bg-gray-100" aria-label="Close">
                ×
              </button>
            </div>
            <form onSubmit={handleSendNewMessage} className="space-y-4">
              <div>
                <label htmlFor="msg-subject" className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  id="msg-subject"
                  type="text"
                  value={messageForm.subject}
                  onChange={(e) => setMessageForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="Brief subject"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]"
                  disabled={sending}
                />
              </div>
              <div>
                <label htmlFor="msg-category" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  id="msg-category"
                  value={messageForm.category}
                  onChange={(e) => setMessageForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] bg-white"
                  disabled={sending}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="msg-body" className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  id="msg-body"
                  value={messageForm.message}
                  onChange={(e) => setMessageForm((f) => ({ ...f, message: e.target.value }))}
                  placeholder="Your message..."
                  required
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] resize-y"
                  disabled={sending}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={sending} className="flex-1 py-2.5 bg-[#1e3a5f] text-white font-semibold rounded-lg hover:bg-[#1e3a5f]/90 disabled:opacity-60">
                  {sending ? 'Sending...' : 'Send'}
                </button>
                <button type="button" onClick={() => !sending && setShowMessageModal(false)} className="px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50" disabled={sending}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="chat-container">
        <aside className="chat-sidebar">
          <div className="chat-sidebar-list">
            {loading ? (
              <div className="p-8 text-center text-sm text-gray-500">Loading...</div>
            ) : loadError ? (
              <div className="p-8 text-center">
                <p className="text-sm font-medium text-red-600">Could not load conversations</p>
                <p className="text-xs text-gray-500 mt-1">{loadError}</p>
              </div>
            ) : visibleConversations.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-600">No conversations yet</p>
                <p className="text-xs text-gray-500 mt-1">Use &quot;+ Message HR&quot; to start a request.</p>
              </div>
            ) : (
              visibleConversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`conversation-row chat-sidebar-row ${selectedConversation?.id === conv.id ? 'selected' : ''}`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedConversation(conv)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedConversation(conv)}
                    className="conversation-info"
                  >
                    <div className="row-top">
                      <h4 className="chat-user-name">{getOtherParticipantName(conv)}</h4>
                      <span className="row-time">{formatTimestamp(conv.updatedAt)}</span>
                    </div>
                    <p className="last-message">{conv.lastMessage || '—'}</p>
                    <div className="row-meta">
                      <span className={`row-status ${conv.status === 'resolved' ? 'resolved' : 'open'}`}>{formatStatus(conv.status)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="delete-btn"
                    onClick={(e) => handleDeleteConversation(e, conv.id)}
                    aria-label="Delete conversation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <div className="chat-thread">
          {!selectedConversation ? (
            <div className="chat-thread-placeholder">
              Select a conversation to start chatting
            </div>
          ) : (
            <>
              <header className="chat-header">
                <div className="flex items-center min-w-0 flex-1">
                  <span className="chat-header-title">{selectedConversation.subject || selectedConversation.lastMessage || 'Conversation'}</span>
                  <span className={`chat-header-badge ${selectedConversation.status === 'resolved' ? 'resolved' : 'open'}`}>
                    {formatStatus(selectedConversation.status)}
                  </span>
                </div>
              </header>

              <div className="chat-messages">
                {messages.map((msg) => {
                  const isSender = msg.sender === 'employee';
                  const wrapClass = msg.sender === 'system' ? 'system' : isSender ? 'sender' : 'receiver';
                  const msgColorClass = msg.sender === 'hr' ? 'hr' : msg.sender === 'employee' ? 'employee' : 'system';
                  const label = msg.sender === 'employee' ? 'You' : msg.sender === 'hr' ? 'HR' : null;
                  return (
                    <div key={msg.id} className={`msg-wrap ${wrapClass}`}>
                      <div className={`msg ${msgColorClass}`}>
                        {label && <div className="msg-label">{label}</div>}
                        <div className="msg-text">{msg.text}</div>
                        <div className="msg-time">{formatTimestamp(msg.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {selectedConversation.status !== 'resolved' && (
                <form onSubmit={handleSendReply} className="chat-input-bar">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    rows={1}
                    disabled={sendingReply}
                  />
                  <button type="submit" disabled={sendingReply || !replyText.trim()} className="chat-send-btn">
                    <Send className="w-4 h-4" />
                    Send
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
