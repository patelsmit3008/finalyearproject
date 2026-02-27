import { useState, useEffect, useMemo, useRef } from 'react';
import { Bell, CheckCircle2, Send, Trash2 } from 'lucide-react';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import {
  getConversationsSubscription,
  getConversationMessagesSubscription,
  sendConversationMessage,
  resolveConversation,
  softDeleteConversation,
} from '../services/conversationsService';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
];

function formatStatus(s) {
  if (!s) return 'Open';
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
 * HR Inbox - Two-pane chat layout. Left: conversation list. Right: thread + composer.
 */
const HRInbox = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const sub = getConversationsSubscription((data) => {
      setConversations(data);
      setLoading(false);
    });
    const unsubscribe = onSnapshot(sub.query, sub.onNext, sub.onError);
    return () => unsubscribe();
  }, []);

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

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      if ((c.deletedFor || []).includes(user?.uid)) return false;
      if (filterStatus && c.status !== filterStatus) return false;
      return true;
    });
  }, [conversations, filterStatus, user?.uid]);

  const getOtherParticipantName = (conversation) => {
    const currentUserId = user?.uid;
    const entries = Object.entries(conversation.participantsInfo || {});
    const other = entries.find(([uid]) => uid !== currentUserId);
    if (other) return other[1].name ?? 'Unknown';
    return conversation.employeeName ?? 'Employee';
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!selectedConversation?.id || !replyText.trim() || sending) return;
    setSending(true);
    try {
      await sendConversationMessage(selectedConversation.id, {
        senderRole: 'hr',
        text: replyText.trim(),
        senderName: user?.name ?? 'HR',
        senderId: user?.uid,
      });
      setReplyText('');
    } catch (err) {
      console.error('Error sending reply:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply(e);
    }
  };

  const handleMarkResolved = async () => {
    if (!selectedConversation?.id) return;
    try {
      await resolveConversation(selectedConversation.id);
      setSelectedConversation((prev) => (prev ? { ...prev, status: 'resolved' } : null));
    } catch (err) {
      console.error('Error resolving conversation:', err);
    }
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

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-black">Inbox</h1>
        <p className="text-sm text-gray-600">Conversations with employees</p>
      </div>

      <div className="chat-container">
        <aside className="chat-sidebar">
          <div className="p-3 border-b border-gray-200 bg-white">
            <label htmlFor="hr-filter-status" className="sr-only">Status</label>
            <select
              id="hr-filter-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="chat-sidebar-list">
            {loading ? (
              <div className="p-8 text-center text-sm text-gray-500">Loading...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-600">No conversations</p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
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
                {selectedConversation.employeeName && (
                  <span className="text-sm text-gray-500 truncate ml-2">{selectedConversation.employeeName}</span>
                )}
              </header>

              <div className="chat-messages">
                {messages.map((msg) => {
                  const isSender = msg.sender === 'hr';
                  const wrapClass = msg.sender === 'system' ? 'system' : isSender ? 'sender' : 'receiver';
                  const msgColorClass = msg.sender === 'hr' ? 'hr' : msg.sender === 'employee' ? 'employee' : 'system';
                  const label = msg.sender === 'hr' ? 'HR' : msg.sender === 'system' ? null : 'Employee';
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
                <>
                  <form onSubmit={handleSendReply} className="chat-input-bar">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message..."
                      rows={1}
                      disabled={sending}
                    />
                    <button type="submit" disabled={sending || !replyText.trim()} className="chat-send-btn">
                      <Send className="w-4 h-4" />
                      Send
                    </button>
                  </form>
                  <div className="chat-resolve-bar">
                    <button type="button" onClick={handleMarkResolved}>
                      <CheckCircle2 className="w-4 h-4" />
                      Mark resolved
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default HRInbox;
