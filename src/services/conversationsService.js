/**
 * Conversations Service - Single Firestore collection for HR and Employee inboxes.
 * Collection: conversations
 *   - employeeId, employeeName, status ("open" | "resolved"), lastMessage, updatedAt
 *   - subject (optional, for list display)
 * Subcollection: conversations/{id}/messages
 *   - sender ("employee" | "hr" | "system"), text, createdAt
 * No usage of hr_notifications, employee_notifications, or ai_escalations.
 */

import { db } from '../firebase/config';
import { createHrAction } from './hrActionsService';
import { HR_ACTION_CATEGORIES, HR_ACTION_SOURCES } from './hrActionsService';
import {
  collection,
  query,
  orderBy,
  where,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';

/**
 * Create a new conversation with the first message (employee request).
 * @param {{ employeeId: string, employeeName?: string, subject?: string, message: string }} opts
 * @returns {Promise<string|null>} Conversation ID
 */
export async function createConversation({ employeeId, employeeName, subject, message, priority = 'medium', category, skipHrAction = false }) {
  if (!employeeId || !message?.trim()) {
    console.warn('[Conversations] createConversation: missing employeeId or message');
    return null;
  }
  const col = collection(db, 'conversations');
  const empName = String(employeeName ?? 'Unknown').trim();
  const conversationData = {
    employeeId: String(employeeId),
    employeeName: empName,
    status: 'open',
    lastMessage: String(message).trim().slice(0, 200),
    updatedAt: serverTimestamp(),
    deletedFor: [],
    participantsInfo: {
      [String(employeeId)]: { name: empName, role: 'employee' },
    },
    ...(subject?.trim() ? { subject: String(subject).trim() } : {}),
  };
  const convRef = await addDoc(col, conversationData);
  const messagesCol = collection(db, 'conversations', convRef.id, 'messages');
  await addDoc(messagesCol, {
    sender: 'employee',
    text: String(message).trim(),
    createdAt: serverTimestamp(),
  });
  if (!skipHrAction) {
    const subjectTrim = subject?.trim() || '';
    const isLeaveRequest = (category || '').toLowerCase() === 'leave';
    try {
      await createHrAction({
        title: subjectTrim || 'Message from employee',
        description: String(message).trim().slice(0, 500),
        category: HR_ACTION_CATEGORIES.INBOX_ESCALATION,
        priority: 'Medium',
        status: 'Pending',
        source: isLeaveRequest ? HR_ACTION_SOURCES.LEAVE_REQUEST : HR_ACTION_SOURCES.EMPLOYEE_MESSAGE,
        employeeId: String(employeeId),
        employeeName: empName,
        linkedConversationId: convRef.id,
      });
    } catch (e) {
      console.warn('[Conversations] createHrAction failed:', e);
    }
  }
  return convRef.id;
}

/**
 * All conversations for HR. orderBy updatedAt desc. Use with onSnapshot in useEffect.
 */
export function getConversationsSubscription(callback) {
  const q = query(
    collection(db, 'conversations'),
    orderBy('updatedAt', 'desc')
  );
  const onNext = (snapshot) => {
    const list = snapshot.docs.map((docSnap) => {
      const d = docSnap.data();
      const updatedAt = d.updatedAt?.toDate?.() ?? (d.updatedAt ? new Date(d.updatedAt) : new Date());
      return {
        id: docSnap.id,
        employeeId: d.employeeId ?? null,
        employeeName: d.employeeName ?? null,
        status: d.status ?? 'open',
        lastMessage: d.lastMessage ?? '',
        updatedAt,
        subject: d.subject ?? '',
        deletedFor: Array.isArray(d.deletedFor) ? d.deletedFor : [],
        participantsInfo: typeof d.participantsInfo === 'object' && d.participantsInfo !== null ? d.participantsInfo : {},
      };
    });
    callback(list);
  };
  const onError = (err) => {
    console.error('[Conversations] getConversationsSubscription error:', err);
    callback([]);
  };
  return { query: q, onNext, onError };
}

/**
 * Conversations where employeeId == currentUser.uid. Sorted by updatedAt desc in memory (no composite index required).
 */
export function getEmployeeConversationsSubscription(employeeId, callback) {
  if (!employeeId) {
    callback([]);
    return null;
  }
  const q = query(
    collection(db, 'conversations'),
    where('employeeId', '==', employeeId)
  );
  const onNext = (snapshot) => {
    const list = snapshot.docs.map((docSnap) => {
      const d = docSnap.data();
      const updatedAt = d.updatedAt?.toDate?.() ?? (d.updatedAt ? new Date(d.updatedAt) : new Date());
      return {
        id: docSnap.id,
        employeeId: d.employeeId ?? null,
        employeeName: d.employeeName ?? null,
        status: d.status ?? 'open',
        lastMessage: d.lastMessage ?? '',
        updatedAt,
        subject: d.subject ?? '',
        deletedFor: Array.isArray(d.deletedFor) ? d.deletedFor : [],
        participantsInfo: typeof d.participantsInfo === 'object' && d.participantsInfo !== null ? d.participantsInfo : {},
      };
    });
    list.sort((a, b) => (b.updatedAt?.getTime?.() ?? 0) - (a.updatedAt?.getTime?.() ?? 0));
    callback(list);
  };
  const onError = (err) => {
    console.error('[Conversations] getEmployeeConversationsSubscription error:', err);
    callback([]);
  };
  return { query: q, onNext, onError };
}

/**
 * Messages subcollection: conversations/{id}/messages. orderBy createdAt asc. Use with onSnapshot.
 */
export function getConversationMessagesSubscription(conversationId, callback) {
  if (!conversationId) {
    callback([]);
    return null;
  }
  const messagesCol = collection(db, 'conversations', conversationId, 'messages');
  const q = query(messagesCol, orderBy('createdAt', 'asc'));
  const onNext = (snapshot) => {
    const list = snapshot.docs.map((docSnap) => {
      const d = docSnap.data();
      const createdAt = d.createdAt?.toDate?.() ?? (d.createdAt ? new Date(d.createdAt) : new Date());
      return {
        id: docSnap.id,
        sender: d.sender ?? 'employee',
        text: d.text ?? '',
        createdAt,
      };
    });
    callback(list);
  };
  const onError = (err) => {
    console.error('[Conversations] getConversationMessagesSubscription error:', err);
    callback([]);
  };
  return { query: q, onNext, onError };
}

/**
 * Send message and update conversation. When HR sends (senderRole 'hr' + senderId), merges HR into participantsInfo.
 */
export async function sendConversationMessage(conversationId, { senderRole, text, senderName, senderId }) {
  if (!conversationId || !text?.trim()) return;
  const messagesCol = collection(db, 'conversations', conversationId, 'messages');
  const sender = senderRole === 'hr' ? 'hr' : 'employee';
  await addDoc(messagesCol, {
    sender,
    text: String(text).trim(),
    createdAt: serverTimestamp(),
  });
  const convRef = doc(db, 'conversations', conversationId);
  const snippet = String(text).trim().slice(0, 200);
  const updatePayload = {
    lastMessage: snippet,
    updatedAt: serverTimestamp(),
  };
  if (senderRole === 'hr' && senderId) {
    const snap = await getDoc(convRef);
    const existing = snap.data() || {};
    const participantsInfo = { ...(existing.participantsInfo || {}), [String(senderId)]: { name: senderName ?? 'HR', role: 'hr' } };
    updatePayload.participantsInfo = participantsInfo;
  }
  await updateDoc(convRef, updatePayload);
}

/**
 * Mark conversation resolved; add system message to thread.
 */
export async function resolveConversation(conversationId) {
  if (!conversationId) return;
  const convRef = doc(db, 'conversations', conversationId);
  await updateDoc(convRef, {
    status: 'resolved',
    lastMessage: 'Your request has been resolved',
    updatedAt: serverTimestamp(),
  });
  const messagesCol = collection(db, 'conversations', conversationId, 'messages');
  await addDoc(messagesCol, {
    sender: 'system',
    text: 'Your request has been resolved',
    createdAt: serverTimestamp(),
  });
}

/**
 * Soft-delete: add current user to conversation.deletedFor so it disappears from their list only.
 * @param {string} conversationId
 * @param {string} userId - currentUser.uid
 */
export async function softDeleteConversation(conversationId, userId) {
  if (!conversationId || !userId) return;
  const convRef = doc(db, 'conversations', conversationId);
  await updateDoc(convRef, {
    deletedFor: arrayUnion(userId),
  });
}
