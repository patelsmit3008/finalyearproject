import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, AlertCircle, Loader2, Info, FileText, HelpCircle, Bell, Trash2, X, MessageSquare, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getHrDocuments } from '../../firebase/services/hrDocumentsService';
import { createEscalation } from '../../firebase/services/escalationsService';
import { getChatHistory, saveChatMessage, clearChatHistory, getChatSessions, getChatMessages, deleteChatSession } from '../../firebase/services/chatHistoryService';

export default function HelixChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const [hoveredBadge, setHoveredBadge] = useState(null);
  const [recentDocuments, setRecentDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [chatSessions, setChatSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  // Get confidence level and styling
  const getConfidenceLevel = (confidence) => {
    if (confidence === null || confidence === undefined) return null;
    if (confidence >= 0.8) {
      return {
        level: 'High',
        color: 'green',
        bgColor: 'bg-green-50',
        textColor: 'text-green-700',
        borderColor: 'border-green-200',
        tooltip: 'High confidence: Response is based on reliable information from HR documents.'
      };
    } else if (confidence >= 0.5) {
      return {
        level: 'Medium',
        color: 'amber',
        bgColor: 'bg-amber-50',
        textColor: 'text-amber-700',
        borderColor: 'border-amber-200',
        tooltip: 'Medium confidence: Response may need verification. Consider contacting HR for complex matters.'
      };
    } else {
      return {
        level: 'Low',
        color: 'red',
        bgColor: 'bg-red-50',
        textColor: 'text-red-700',
        borderColor: 'border-red-200',
        tooltip: 'Low confidence: This question has been escalated to HR. You will receive a response within 24 hours.'
      };
    }
  };

  const scrollToBottom = (force = false) => {
    if (!force && userHasScrolled) return; // Don't auto-scroll if user scrolled up
    
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUserHasScrolled(false);
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    
    // Check if user is near the bottom (within 100px)
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setUserHasScrolled(!isNearBottom);
  };

  useEffect(() => {
    // Auto-scroll when new messages are added (only if user hasn't scrolled up)
    const timer = setTimeout(() => {
      if (!userHasScrolled) {
        scrollToBottom(true);
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [messages, isLoading]);

  // Load chat sessions on component mount (session-based approach)
  useEffect(() => {
    if (!user?.uid) {
      // If no user, show welcome message
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: "Hello! I'm Helix AI, your HR assistant. I can help answer questions about company policies, benefits, leave, and more. How can I help you today?",
          confidence: null,
        },
      ]);
      setHistoryLoading(false);
      return;
    }

    // Start with welcome message (new chat)
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: "Hello! I'm Helix AI, your HR assistant. I can help answer questions about company policies, benefits, leave, and more. How can I help you today?",
        confidence: null,
      },
    ]);
    setHistoryLoading(false);
    
    // Load chat sessions
    loadChatSessions();
  }, [user?.uid]);

  // Load chat sessions from backend
  // This fetches all persisted chat sessions for the user
  const loadChatSessions = async () => {
    if (!user?.uid) {
      console.log('[Chat Sessions] No user ID, skipping load');
      return;
    }
    
    try {
      setSessionsLoading(true);
      console.log('[Chat Sessions] Fetching sessions for user:', user.uid);
      const sessions = await getChatSessions(user.uid);
      console.log(`[Chat Sessions] ✅ Loaded ${sessions.length} sessions from backend`);
      console.log('[Chat Sessions] Session titles:', sessions.map(s => s.title));
      setChatSessions(sessions);
    } catch (error) {
      console.error('[Chat Sessions] ❌ Error loading chat sessions:', error);
      setChatSessions([]); // Set empty array on error
    } finally {
      setSessionsLoading(false);
    }
  };

  // Load messages for a specific chat session
  const loadChatMessages = async (chatId) => {
    if (!user?.uid || !chatId) return;
    
    try {
      setHistoryLoading(true);
      const messages = await getChatMessages(user.uid, chatId);
      
      if (messages.length > 0) {
        const transformedMessages = messages.map((msg) => ({
          id: msg.id || `msg-${Date.now()}-${Math.random()}`,
          role: msg.role,
          content: msg.content || msg.message,
          confidence: msg.confidence,
          sourceDocument: msg.sourceDocument,
          escalated: msg.escalated,
        }));
        setMessages(transformedMessages);
      } else {
        setMessages([
          {
            id: 'welcome',
            role: 'assistant',
            content: "Hello! I'm Helix AI, your HR assistant. I can help answer questions about company policies, benefits, leave, and more. How can I help you today?",
            confidence: null,
          },
        ]);
      }
      
      setCurrentChatId(chatId);
      setSelectedSessionId(chatId);
    } catch (error) {
      console.error('Error loading chat messages:', error);
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: "Hello! I'm Helix AI, your HR assistant. I can help answer questions about company policies, benefits, leave, and more. How can I help you today?",
          confidence: null,
        },
      ]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Handle new chat - ONLY switches context, does NOT delete anything
  // The current chat is already saved by backend (session created on first message)
  // This function ONLY resets UI state for a fresh conversation
  const handleNewChat = () => {
    console.log('[New Chat] Switching to new chat context. Current chat is already saved.');
    
    // Simply reset UI state - current chat is already saved by backend
    // Do NOT delete messages or clear backend data
    // Do NOT call any delete endpoints
    setCurrentChatId(null);
    setSelectedSessionId(null);
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: "Hello! I'm Helix AI, your HR assistant. I can help answer questions about company policies, benefits, leave, and more. How can I help you today?",
        confidence: null,
      },
    ]);
    
    // Reload chat sessions to show the previous chat in Recent Chats
    // This ensures the chat that was just created appears in the list
    if (user?.uid) {
      loadChatSessions();
    }
  };

  // Handle chat session selection
  const handleSelectChat = (chatId) => {
    loadChatMessages(chatId);
  };

  // Handle delete chat session
  const handleDeleteChat = async (chatId, e) => {
    e.stopPropagation(); // Prevent triggering chat selection
    
    if (!user?.uid || !chatId) return;
    
    if (!window.confirm('Are you sure you want to delete this chat? This action cannot be undone.')) {
      return;
    }
    
    try {
      const success = await deleteChatSession(user.uid, chatId);
      if (success) {
        // Reload sessions
        await loadChatSessions();
        
        // If deleted chat was current, reset to new chat
        if (chatId === currentChatId) {
          handleNewChat();
        }
      } else {
        alert('Failed to delete chat. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
      alert('An error occurred while deleting the chat.');
    }
  };

  // Fetch recent HR documents on component mount (includes both active and archived)
  useEffect(() => {
    const loadRecentDocuments = async () => {
      try {
        setDocumentsLoading(true);
        // Fetch all documents (active and archived) sorted by date
        const documents = await getHrDocuments();
        
        // Transform and limit to 5 most recent (already sorted by createdAt desc)
        const recent = documents
          .slice(0, 5)
          .map((doc) => ({
            id: doc.id,
            name: doc.title || doc.name || 'Untitled Document',
            updated: doc.uploadDate || new Date().toISOString().split('T')[0],
            status: doc.status || (doc.isActive === false ? 'Archived' : 'Active'),
            isArchived: doc.status === 'Archived' || doc.isActive === false,
          }));
        
        setRecentDocuments(recent);
      } catch (error) {
        console.error('Error loading recent documents:', error);
        setRecentDocuments([]); // Set empty array on error
      } finally {
        setDocumentsLoading(false);
      }
    };

    loadRecentDocuments();
  }, []);

  /**
   * Call the backend API to get AI-generated answer
   * 
   * @param {string} question - User's question
   * @returns {Promise<{response: string, confidence: number, sourceDocument: string|null}>}
   */
  const callChatAPI = async (question) => {
    const API_URL = 'http://localhost:8000/chat';
    
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          question,
          user_id: user?.uid || null,
          chat_id: currentChatId || null,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Extract answer, confidence, and escalation info from API response
      const answer = data.answer || "I'm sorry, I couldn't generate a response. Please try again.";
      const confidence = data.confidence || 0.5;
      const needsEscalation = data.needsEscalation !== undefined ? data.needsEscalation : (confidence < 0.60);
      const reason = data.reason || 'Answer generated from HR documents';
      const chatId = data.chat_id || null;
      
      // Extract source document from sources array (use first source if available)
      const sourceDocument = data.sources && data.sources.length > 0 
        ? `Chunk ${data.sources[0].chunk_id}` 
        : null;

      return { response: answer, confidence, needsEscalation, reason, sourceDocument, chatId };
      
    } catch (error) {
      console.error('Error calling chat API:', error);
      
      // Return fallback response on network/API errors
      return {
        response: "I'm having trouble connecting to the HR knowledge base right now. Please try again in a moment, or message HR via the Helix Inbox for urgent matters.",
        confidence: 0.0,
        needsEscalation: true,
        reason: 'API connection error',
        sourceDocument: null,
      };
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    
    // Trim and validate input
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    const userMessage = trimmedInput;
    setInput('');
    setIsLoading(true);

    // Add user message to chat history (UI)
    const newUserMessage = {
      id: Date.now(),
      role: 'user',
      content: userMessage,
      confidence: null,
    };
    setMessages((prev) => [...prev, newUserMessage]);

    try {
      // Call backend API to get AI response
      // Backend will:
      // 1. Create chat session if chat_id is null (first message)
      // 2. Save user message with chatId
      // 3. Save assistant response with chatId
      // 4. Return chatId in response
      const { response, confidence, needsEscalation, reason, sourceDocument, chatId } = await callChatAPI(userMessage);
      
      // CRITICAL: Set chatId immediately when received from backend
      // Backend has already:
      // 1. Created chat session (if first message) - PERSISTED to Firestore
      // 2. Saved user message with chatId - PERSISTED to Firestore
      // 3. Saved assistant message with chatId - PERSISTED to Firestore
      // 4. Updated chat session updatedAt timestamp - PERSISTED to Firestore
      // Setting chatId here ensures UI tracks the session, even if user clicks "New Chat" immediately
      if (chatId) {
        if (!currentChatId) {
          // New chat session was created - set it immediately
          console.log('[Chat] ✅ New chat session created and saved:', chatId);
          setCurrentChatId(chatId);
          setSelectedSessionId(chatId);
          // Reload chat sessions to show the new chat in Recent Chats
          // This ensures the chat appears even if user clicks "New Chat" before next message
          // Backend has already persisted everything, so it will appear in Recent Chats
          loadChatSessions();
        } else if (currentChatId !== chatId) {
          // ChatId changed (shouldn't happen, but guard against it)
          console.log('[Chat] ⚠️ Chat ID changed:', currentChatId, '->', chatId);
          setCurrentChatId(chatId);
          setSelectedSessionId(chatId);
        } else {
          // ChatId matches - session is already tracked, but reload to update updatedAt
          loadChatSessions();
        }
      }

      // Create escalation if backend indicates escalation is needed
      if (needsEscalation && user) {
        try {
          // Determine category from question (simple keyword matching)
          const questionLower = userMessage.toLowerCase();
          let category = 'OTHER';
          if (questionLower.includes('leave') || questionLower.includes('vacation') || questionLower.includes('holiday')) {
            category = 'LEAVE_POLICY';
          } else if (questionLower.includes('benefit') || questionLower.includes('insurance') || questionLower.includes('health')) {
            category = 'BENEFITS';
          } else if (questionLower.includes('policy') || questionLower.includes('rule')) {
            category = 'HR_POLICY';
          } else if (questionLower.includes('payroll') || questionLower.includes('salary') || questionLower.includes('pay')) {
            category = 'PAYROLL';
          }

          await createEscalation({
            question: userMessage,
            employeeId: user.uid,
            employeeName: user.name || 'Unknown Employee',
            department: user.department || 'Unknown', // Fallback if department not in user object
            confidence: confidence,
            category: category,
            aiResponse: response,
            sourceDocument: sourceDocument,
            reason: reason, // Include reason from backend
          });
          console.log('Escalation created for low confidence response');
        } catch (escalationError) {
          // Log but don't block chat - escalation is non-critical
          console.error('Error creating escalation:', escalationError);
        }
      }
      
      // Add AI response to chat history (UI)
      const aiMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: response,
        confidence,
        sourceDocument,
      };

      setMessages((prev) => [...prev, aiMessage]);

      // Backend has already:
      // 1. Created chat session (if first message)
      // 2. Saved user message with chatId
      // 3. Saved assistant message with chatId
      // No additional frontend persistence needed - backend is source of truth
    } catch (error) {
      console.error('Error in handleSend:', error);
      
      // Add error message to chat
      const errorMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: "I'm sorry, I encountered an error while processing your question. Please try again or message HR via the Helix Inbox for assistance.",
        confidence: 0.0,
        sourceDocument: null,
      };
      
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Suggested questions for quick access
  const suggestedQuestions = [
    "What is our leave policy?",
    "How do I request time off?",
    "What benefits are available?",
    "Can I work remotely?",
    "How do I submit expenses?",
    "What is the performance review process?",
  ];


  // HR notices
  const hrNotices = [
    { type: 'info', message: 'Q2 Performance Reviews starting soon' },
    { type: 'update', message: 'Benefits enrollment period: March 1-15' },
  ];

  const handleSuggestedQuestion = (question) => {
    setInput(question);
    // Auto-focus input
    setTimeout(() => {
      document.querySelector('input[type="text"]')?.focus();
    }, 100);
  };

  const handleClearChat = async () => {
    if (!user?.uid) {
      console.warn('Cannot clear chat: user not authenticated');
      return;
    }

    setIsClearing(true);
    try {
      // Clear from Firestore using service
      const success = await clearChatHistory(user.uid);
      
      if (success) {
        // Also call backend endpoint for logging
        try {
          await fetch('http://localhost:8000/chat/clear', {
            method: 'DELETE',
            headers: {
              'X-User-Id': user.uid,
            },
          });
        } catch (backendError) {
          console.warn('Backend clear endpoint failed (non-critical):', backendError);
          // Non-blocking - Firestore clear already succeeded
        }

        // Reset chat state locally - show welcome message
        setMessages([
          {
            id: 'welcome',
            role: 'assistant',
            content: "Hello! I'm Helix AI, your HR assistant. I can help answer questions about company policies, benefits, leave, and more. How can I help you today?",
            confidence: null,
          },
        ]);
        
        console.log('Chat history cleared successfully');
      } else {
        console.error('Failed to clear chat history');
        alert('Failed to clear chat history. Please try again.');
      }
    } catch (error) {
      console.error('Error clearing chat history:', error);
      alert('An error occurred while clearing chat history. Please try again.');
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16 box-border">
      <div className="mb-8 w-full flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-black">Helix HR Chat</h1>
          <p className="text-sm text-gray-600 font-medium">
            Ask questions about HR policies, benefits, leave, and more. Answers are AI-generated from HR documents.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* New Chat Button */}
          {user?.uid && (
            <button
              onClick={handleNewChat}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#1e3a5f] rounded-xl hover:bg-[#1e3a5f]/90 transition-all duration-200 shadow-sm hover:shadow-md"
              title="Start a new chat"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>
          )}
          {/* Clear Chat Button - Only show if there are real messages (not just welcome) */}
          {user?.uid && messages.length > 0 && messages.some(msg => msg.id !== 'welcome') && (
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={isClearing}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-black bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-[#1e3a5f] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              title="Clear all chat history"
            >
              <Trash2 className="w-4 h-4" />
              {isClearing ? 'Clearing...' : 'Clear All'}
            </button>
          )}
        </div>
      </div>

      {/* Clear Chat Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Clear Chat History</h3>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  disabled={isClearing}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-6">
                Are you sure you want to clear your chat history? This action cannot be undone. 
                Your messages will be permanently deleted, but this will not affect HR documents or other users.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  disabled={isClearing}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearChat}
                  disabled={isClearing}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isClearing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Clearing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Clear Chat
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[65%_35%] gap-8">
        {/* Left Column - Chat Container */}
        <div className="w-full max-w-[900px]">
          {/* Chat Container - Fixed height with internal scrolling */}
          <div className="bg-white rounded-xl shadow-lg border-2 border-gray-200 flex flex-col" style={{ height: '70vh', maxHeight: '720px', minHeight: '420px' }}>
            {/* Messages Area - Scrollable */}
            <div 
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-6 py-6 scroll-smooth"
              style={{ minHeight: 0 }}
            >
              {/* Centered container with max-width for balanced layout */}
              <div className="max-w-4xl mx-auto">
                {historyLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                    <span className="ml-3 text-sm text-gray-600">Loading chat history...</span>
                  </div>
                ) : (
                  <div className="space-y-[16px]">
                    {messages.map((message) => {
            const isEscalated = message.escalated === true;
            const confidenceInfo = getConfidenceLevel(message.confidence);
            
            return (
              <div
                key={message.id}
                className={`flex items-start gap-4 w-full ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {/* Bot Avatar - Left side (only for bot messages) */}
                {message.role === 'assistant' && (
                  <div className="w-9 h-9 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5 text-[#1e3a5f]" />
                  </div>
                )}
                
                {/* Message Bubble */}
                <div className={`relative min-w-0 ${
                  message.role === 'user' ? 'max-w-[75%]' : 'max-w-[70%]'
                }`}>
                  {/* User Message - Right aligned, no tail */}
                  {message.role === 'user' && (
                    <div className="bg-[#1e3a5f] text-white rounded-2xl px-6 py-3.5 shadow-sm">
                      <p className="text-sm whitespace-pre-wrap leading-relaxed text-white">
                        {message.content}
                      </p>
                    </div>
                  )}
                  
                  {/* Bot Message - Left aligned with tail */}
                  {message.role === 'assistant' && !isEscalated && (
                    <>
                      <div className="bg-gray-50 text-gray-900 border border-gray-200 rounded-2xl rounded-tl-none px-5 py-3.5 shadow-sm relative">
                        <p className="text-sm whitespace-pre-wrap leading-relaxed text-gray-800">
                          {message.content}
                        </p>
                        {/* Tail on left */}
                        <div className="absolute left-0 top-3.5 w-0 h-0 border-r-[8px] border-r-gray-50 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent transform -translate-x-full"></div>
                        <div className="absolute left-0 top-3.5 w-0 h-0 border-r-[9px] border-r-gray-200 border-t-[9px] border-t-transparent border-b-[9px] border-b-transparent transform -translate-x-full -z-10"></div>
                      </div>
                      {/* Confidence Badge */}
                      {message.confidence !== null && (
                        <div className="mt-2 ml-1 flex items-center gap-2 flex-wrap">
                          <div 
                            className="relative"
                            onMouseEnter={() => setHoveredBadge(message.id)}
                            onMouseLeave={() => setHoveredBadge(null)}
                          >
                            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border ${confidenceInfo.bgColor} ${confidenceInfo.textColor} ${confidenceInfo.borderColor} cursor-help`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                              {confidenceInfo.level} Confidence
                              <Info className="w-3 h-3 opacity-70" />
                            </span>
                            {hoveredBadge === message.id && (
                              <div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl z-20">
                                <p className="font-semibold mb-1">{confidenceInfo.tooltip}</p>
                                {message.sourceDocument && (
                                  <p className="text-gray-300 mt-1">Source: {message.sourceDocument}</p>
                                )}
                                <div className="absolute -bottom-1 left-4 w-2 h-2 bg-gray-900 rotate-45"></div>
                              </div>
                            )}
                          </div>
                          {message.sourceDocument && confidenceInfo.level !== 'Low' && (
                            <span className="text-xs text-gray-500">
                              Source: {message.sourceDocument}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  
                  {/* Escalation Message - System style */}
                  {message.role === 'assistant' && isEscalated && (
                    <>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-3.5 shadow-sm">
                        <p className="text-sm whitespace-pre-wrap leading-relaxed text-gray-700 mb-2">
                          {message.content}
                        </p>
                      </div>
                      {/* Confidence Badge for Escalated Messages */}
                      {message.confidence !== null && (
                        <div className="mt-2 ml-1 flex items-center gap-2">
                          <div 
                            className="relative"
                            onMouseEnter={() => setHoveredBadge(message.id)}
                            onMouseLeave={() => setHoveredBadge(null)}
                          >
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border bg-red-50 text-red-700 border-red-200 cursor-help">
                              <AlertCircle className="w-3 h-3" />
                              Low Confidence - Escalated to HR
                              <Info className="w-3 h-3 opacity-70" />
                            </span>
                            {hoveredBadge === message.id && (
                              <div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl z-20">
                                <p className="font-semibold mb-1">{confidenceInfo.tooltip}</p>
                                <p className="text-gray-300 mt-1">Your question has been forwarded to the HR team for review.</p>
                                <div className="absolute -bottom-1 left-4 w-2 h-2 bg-gray-900 rotate-45"></div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
                
                {/* User Avatar - Right side (only for user messages) */}
                {message.role === 'user' && (
                  <div className="w-9 h-9 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-[#1e3a5f]" />
                  </div>
                )}
              </div>
            );
            })}
                  </div>
                )}
              </div>
              {/* Typing Indicator */}
              {isLoading && (
              <div className="max-w-[90%] mx-auto">
              <div className="flex gap-4 justify-start items-start">
              <div className="w-9 h-9 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5 text-[#1e3a5f]" />
              </div>
              <div className="relative">
                <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-tl-none px-5 py-4 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span 
                      className="w-2 h-2 bg-gray-500 rounded-full" 
                      style={{ 
                        animation: 'typing-dot 1.4s infinite',
                        animationDelay: '0ms'
                      }}
                    ></span>
                    <span 
                      className="w-2 h-2 bg-gray-500 rounded-full" 
                      style={{ 
                        animation: 'typing-dot 1.4s infinite',
                        animationDelay: '200ms'
                      }}
                    ></span>
                    <span 
                      className="w-2 h-2 bg-gray-500 rounded-full" 
                      style={{ 
                        animation: 'typing-dot 1.4s infinite',
                        animationDelay: '400ms'
                      }}
                    ></span>
                  </div>
                </div>
                {/* Tail on left for typing indicator */}
                <div className="absolute left-0 top-4 w-0 h-0 border-r-[8px] border-r-gray-50 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent transform -translate-x-full"></div>
                <div className="absolute left-0 top-4 w-0 h-0 border-r-[9px] border-r-gray-200 border-t-[9px] border-t-transparent border-b-[9px] border-b-transparent transform -translate-x-full -z-10"></div>
              </div>
            </div>
              </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area - Fixed at bottom */}
            <div className="border-t-2 border-gray-200 bg-white rounded-b-xl px-6 pt-5 pb-6 shrink-0">
              <form onSubmit={handleSend} className="flex gap-3 mb-4">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question about HR policies, benefits, leave..."
                  className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] text-sm"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="px-6 py-3 bg-[#1e3a5f] text-white rounded-xl disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 shadow-sm hover:shadow-md font-semibold min-w-[100px]"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
              <p className="text-xs text-gray-500 text-center">
                Responses are AI-generated and may not always be accurate. For urgent matters, use the Helix Inbox to message HR.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column - Contextual Information Panel */}
        <div className="space-y-8">
          {/* Recent Chats */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-7">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-[#1e3a5f]/10 rounded-lg">
                <MessageSquare className="w-5 h-5 text-[#1e3a5f]" />
              </div>
              <h3 className="text-lg font-bold text-black">Recent Chats</h3>
            </div>
            {sessionsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                <span className="ml-2 text-sm text-gray-500">Loading chats...</span>
              </div>
            ) : chatSessions.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">No recent chats</p>
                <p className="text-xs text-gray-400 mt-1">Start a new conversation to see it here</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {chatSessions.map((session) => (
                  <div
                    key={session.chatId}
                    onClick={() => handleSelectChat(session.chatId)}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                      selectedSessionId === session.chatId
                        ? 'bg-[#1e3a5f]/10 border-[#1e3a5f] shadow-sm'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-[#1e3a5f]/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {session.title || 'New Chat'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {session.updatedAt || session.createdAt 
                            ? new Date(session.updatedAt || session.createdAt).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })
                            : 'Just now'}
                        </p>
                      </div>
                      <button
                        onClick={(e) => handleDeleteChat(session.chatId, e)}
                        className="text-gray-400 hover:text-red-600 transition-colors p-1"
                        title="Delete chat"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Suggested Questions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-7">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-[#1e3a5f]/10 rounded-lg">
                <HelpCircle className="w-5 h-5 text-[#1e3a5f]" />
              </div>
              <h3 className="text-lg font-bold text-black">Suggested Questions</h3>
            </div>
            <div className="space-y-3">
              {suggestedQuestions.map((question, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestedQuestion(question)}
                  className="w-full text-left px-4 py-3 text-sm font-medium text-black hover:bg-[#1e3a5f]/10 hover:text-[#1e3a5f] rounded-xl transition-all duration-200 border-2 border-transparent hover:border-[#1e3a5f]/20"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>

          {/* Recent HR Documents */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-7">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-[#1e3a5f]/10 rounded-lg">
                <FileText className="w-5 h-5 text-[#1e3a5f]" />
              </div>
              <h3 className="text-lg font-bold text-black">Recent Documents</h3>
            </div>
            {documentsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                <span className="ml-2 text-sm text-gray-500">Loading documents...</span>
              </div>
            ) : recentDocuments.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">No documents available</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentDocuments.map((doc) => (
                  <div 
                    key={doc.id} 
                    className={`flex items-start gap-3 p-2 rounded-lg transition-colors ${
                      doc.isArchived 
                        ? 'hover:bg-gray-50 opacity-75' 
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <FileText className={`w-4 h-4 mt-0.5 shrink-0 ${
                      doc.isArchived ? 'text-gray-300' : 'text-gray-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm font-medium truncate ${
                          doc.isArchived ? 'text-gray-500' : 'text-gray-900'
                        }`}>
                          {doc.name}
                        </p>
                        {doc.isArchived && (
                          <span className="text-xs text-gray-400 font-normal">(Archived)</span>
                        )}
                      </div>
                      <p className={`text-xs ${
                        doc.isArchived ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        Updated {new Date(doc.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* HR Notices */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-7">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-[#1e3a5f]/10 rounded-lg">
                <Bell className="w-5 h-5 text-[#1e3a5f]" />
              </div>
              <h3 className="text-lg font-bold text-black">HR Notices</h3>
            </div>
            <div className="space-y-3">
              {hrNotices.map((notice, index) => (
                <div 
                  key={index} 
                  className={`p-4 rounded-xl border-2 ${
                    notice.type === 'info' 
                      ? 'bg-[#1e3a5f]/10 border-[#1e3a5f]/20' 
                      : 'bg-amber-50 border-amber-200'
                  }`}
                >
                  <p className={`text-sm font-medium ${
                    notice.type === 'info' ? 'text-[#1e3a5f]' : 'text-amber-900'
                  }`}>
                    {notice.message}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

