/**
 * Chat History Service - Firestore operations for HR chatbot conversation history
 * 
 * Handles saving and retrieving chat messages per employee with session support
 */

import { db } from "../config";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  deleteDoc,
  doc,
} from "firebase/firestore";

/**
 * Save a chat message to history
 * 
 * @param {Object} messageData - Message data
 * @param {string} messageData.userId - Employee UID
 * @param {string} messageData.role - 'user' or 'assistant'
 * @param {string} messageData.message - Message text
 * @param {string} messageData.chatId - Chat session ID (optional)
 * @param {number} messageData.confidence - Confidence score (optional, for assistant messages)
 * @param {boolean} messageData.escalated - Whether message was escalated (optional)
 * @param {string} messageData.sourceDocument - Source document name (optional)
 * @returns {Promise<string|null>} Document ID or null on failure
 */
export const saveChatMessage = async (messageData) => {
  try {
    // Validate required fields
    if (!messageData.userId || !messageData.role || !messageData.message) {
      console.error("Chat History: Missing required fields (userId, role, message)");
      return null;
    }

    const message = {
      userId: messageData.userId,
      role: messageData.role, // 'user' or 'assistant'
      message: messageData.message.trim(),
      confidence: messageData.confidence || null,
      escalated: messageData.escalated || false,
      sourceDocument: messageData.sourceDocument || null,
      createdAt: serverTimestamp(),
    };

    // Add chatId if provided
    if (messageData.chatId) {
      message.chatId = messageData.chatId;
    }

    const docRef = await addDoc(collection(db, "chat_history"), message);
    return docRef.id;
  } catch (error) {
    console.error("Error saving chat message:", error);
    return null;
  }
};

/**
 * Fetch chat history for a specific user (legacy - for backward compatibility)
 * 
 * @param {string} userId - Employee UID
 * @param {number} limit - Maximum number of messages to fetch (optional, default: 50)
 * @returns {Promise<Array>} Array of message objects with id, sorted by timestamp
 */
export const getChatHistory = async (userId, limit = 50) => {
  try {
    if (!userId) {
      console.error("Chat History: userId is required");
      return [];
    }

    // Try query with orderBy first (requires composite index)
    let querySnapshot;
    try {
      const q = query(
        collection(db, "chat_history"),
        where("userId", "==", userId),
        orderBy("createdAt", "asc") // Oldest first for chronological display
      );
      querySnapshot = await getDocs(q);
    } catch (indexError) {
      // If index doesn't exist, fallback to query without orderBy and sort in memory
      console.warn("Chat History: Composite index may not exist, falling back to in-memory sort:", indexError.message);
      const q = query(
        collection(db, "chat_history"),
        where("userId", "==", userId)
      );
      querySnapshot = await getDocs(q);
    }

    const messages = [];

    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      const timestamp = data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString();
      messages.push({
        id: docSnapshot.id,
        role: data.role,
        content: data.message,
        confidence: data.confidence || null,
        sourceDocument: data.sourceDocument || null,
        escalated: data.escalated || false,
        timestamp: timestamp,
        _sortKey: data.createdAt?.toMillis?.() || new Date(timestamp).getTime(), // For in-memory sorting
      });
    });

    // Sort by timestamp if orderBy wasn't used (fallback case)
    if (messages.length > 0 && messages[0]._sortKey) {
      messages.sort((a, b) => (a._sortKey || 0) - (b._sortKey || 0));
    }

    // Remove temporary sort key
    const cleanedMessages = messages.map(({ _sortKey, ...msg }) => msg);

    // Limit results if needed
    return limit ? cleanedMessages.slice(-limit) : cleanedMessages;
  } catch (error) {
    console.error("Error fetching chat history:", error);
    // Return empty array on error to prevent UI crash
    return [];
  }
};

/**
 * Fetch chat sessions for a user
 * 
 * @param {string} userId - Employee UID
 * @returns {Promise<Array>} Array of chat session objects
 */
export const getChatSessions = async (userId) => {
  try {
    if (!userId) {
      console.error("Chat Sessions: userId is required");
      return [];
    }

    const response = await fetch('http://localhost:8000/chats', {
      method: 'GET',
      headers: {
        'X-User-Id': userId,
      },
    });

    if (!response.ok) {
      console.error(`[Chat Sessions] API error: ${response.status}`);
      return [];
    }

    const sessions = await response.json();
    return sessions;
  } catch (error) {
    console.error("Error fetching chat sessions:", error);
    return [];
  }
};

/**
 * Fetch messages for a specific chat session
 * 
 * @param {string} userId - Employee UID
 * @param {string} chatId - Chat session ID
 * @returns {Promise<Array>} Array of message objects
 */
export const getChatMessages = async (userId, chatId) => {
  try {
    if (!userId || !chatId) {
      console.error("Chat Messages: userId and chatId are required");
      return [];
    }

    const response = await fetch(`http://localhost:8000/chats/${chatId}`, {
      method: 'GET',
      headers: {
        'X-User-Id': userId,
      },
    });

    if (!response.ok) {
      console.error(`[Chat Messages] API error: ${response.status}`);
      return [];
    }

    const messages = await response.json();
    return messages;
  } catch (error) {
    console.error("Error fetching chat messages:", error);
    return [];
  }
};

/**
 * Delete a chat session
 * 
 * @param {string} userId - Employee UID
 * @param {string} chatId - Chat session ID
 * @returns {Promise<boolean>} Success status
 */
export const deleteChatSession = async (userId, chatId) => {
  try {
    if (!userId || !chatId) {
      console.error("Delete Chat: userId and chatId are required");
      return false;
    }

    const response = await fetch(`http://localhost:8000/chats/${chatId}`, {
      method: 'DELETE',
      headers: {
        'X-User-Id': userId,
      },
    });

    if (!response.ok) {
      console.error(`[Delete Chat] API error: ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error deleting chat session:", error);
    return false;
  }
};

/**
 * Delete all chat sessions for a user
 * 
 * @param {string} userId - Employee UID
 * @returns {Promise<boolean>} Success status
 */
export const deleteAllChatSessions = async (userId) => {
  try {
    if (!userId) {
      console.error("Delete All Chats: userId is required");
      return false;
    }

    const response = await fetch('http://localhost:8000/chats', {
      method: 'DELETE',
      headers: {
        'X-User-Id': userId,
      },
    });

    if (!response.ok) {
      console.error(`[Delete All Chats] API error: ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error deleting all chat sessions:", error);
    return false;
  }
};

/**
 * Clear chat history for a user (deletes all chat sessions)
 * 
 * Deletes all chat sessions and messages for the specified user.
 * This does NOT affect HR documents, embeddings, or other users' chat history.
 * 
 * @param {string} userId - Employee UID
 * @returns {Promise<boolean>} Success status
 */
export const clearChatHistory = async (userId) => {
  try {
    if (!userId) {
      console.error("Chat History: userId is required");
      return false;
    }

    console.log(`[Chat History] Clearing all chat history for user: ${userId}`);

    // Use the delete all chats endpoint
    return await deleteAllChatSessions(userId);
  } catch (error) {
    console.error("Error clearing chat history:", error);
    return false;
  }
};

