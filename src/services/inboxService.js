/**
 * Inbox Service - Firestore real-time listener and updates for HR Inbox.
 * Collection: inbox_items
 * Fields: title, message, type, priority, status, employeeId?, department?, createdAt
 */

import { db } from '../firebase/config';
import {
  collection,
  query,
  orderBy,
  where,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * Get query and callbacks for inbox_items (HR). Call onSnapshot inside useEffect and return unsubscribe in cleanup.
 * @param {(items: Array<InboxItem>) => void} callback
 * @returns {{ query: Query, onNext: (snapshot) => void, onError: (err) => void }}
 */
export function getInboxItemsSubscription(callback) {
  const q = query(
    collection(db, 'inbox_items'),
    orderBy('createdAt', 'desc')
  );
  const onNext = (snapshot) => {
    const items = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const createdAt = data.createdAt?.toDate?.() ?? (data.createdAt ? new Date(data.createdAt) : new Date());
      return {
        id: docSnap.id,
        title: data.title ?? '',
        message: data.message ?? '',
        type: normalizeType(data.type),
        priority: normalizePriority(data.priority),
        status: normalizeStatus(data.status),
        employeeId: data.employeeId ?? null,
        department: data.department ?? null,
        createdAt,
        createdAtRaw: data.createdAt,
      };
    });
    callback(items);
  };
  const onError = (err) => {
    console.error('[Inbox Service] subscribeToInboxItems error:', err);
    callback([]);
  };
  return { query: q, onNext, onError };
}

/**
 * Get query and callbacks for employee inbox. Call onSnapshot inside useEffect and return unsubscribe in cleanup.
 * @param {string} employeeId - Current user uid
 * @param {(items: Array<EmployeeInboxItem>) => void} callback
 * @returns {{ query: Query, onNext: (snapshot) => void, onError: (err) => void } | null} null if no employeeId
 */
export function getEmployeeInboxSubscription(employeeId, callback) {
  if (!employeeId) {
    callback([]);
    return null;
  }
  const q = query(
    collection(db, 'inbox_items'),
    where('recipientRole', '==', 'employee'),
    where('recipientId', '==', employeeId),
    orderBy('createdAt', 'desc')
  );
  const onNext = (snapshot) => {
    const items = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const createdAt = data.createdAt?.toDate?.() ?? (data.createdAt ? new Date(data.createdAt) : new Date());
      return {
        id: docSnap.id,
        title: data.title ?? '',
        message: data.message ?? '',
        type: normalizeType(data.type),
        priority: normalizePriority(data.priority),
        status: normalizeStatus(data.status),
        senderRole: data.senderRole ?? null,
        createdAt,
        createdAtRaw: data.createdAt,
      };
    });
    callback(items);
  };
  const onError = (err) => {
    console.error('[Inbox Service] subscribeToEmployeeInbox error:', err);
    callback([]);
  };
  return { query: q, onNext, onError };
}

function normalizeType(t) {
  const v = (t ?? '').toString().toLowerCase().replace(/-/g, '_');
  if (v === 'system') return 'system';
  if (v === 'employee_request') return 'employee_request';
  if (v === 'ai_escalation') return 'ai_escalation';
  return 'system';
}

function normalizePriority(p) {
  const v = (p ?? '').toString().toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high') return v;
  return 'medium';
}

function normalizeStatus(s) {
  const v = (s ?? '').toString().toLowerCase().replace(/\s+/g, '_');
  if (v === 'unread' || v === 'in_review' || v === 'resolved') return v;
  return 'unread';
}

/**
 * Update an inbox item's status (e.g. in_review when opened, resolved when closed).
 * @param {string} id - Document ID
 * @param {string} status - "unread" | "in_review" | "resolved"
 */
export async function updateInboxItemStatus(id, status) {
  const ref = doc(db, 'inbox_items', id);
  await updateDoc(ref, {
    status: normalizeStatus(status),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Create an inbox notification for an employee (e.g. when HR approves/rejects/resolves).
 * Document appears in Employee Inbox (recipientRole === "employee", recipientId === recipientId).
 * @param {Object} opts
 * @param {string} opts.recipientId - Employee UID
 * @param {string} opts.title - Short action title
 * @param {string} opts.message - Human-readable explanation
 * @param {string} [opts.priority] - "low" | "medium" | "high" (default "medium")
 * @param {string} [opts.type] - "system" | "employee_request" | "ai_escalation" (default "system")
 * @param {string} [opts.senderRole] - e.g. "hr" (default "hr")
 */
export async function createEmployeeInboxNotification({
  recipientId,
  title,
  message,
  priority = 'medium',
  type = 'system',
  senderRole = 'hr',
}) {
  if (!recipientId || !title || !message) {
    console.warn('[Inbox Service] createEmployeeInboxNotification: missing recipientId, title, or message');
    return null;
  }
  const col = collection(db, 'inbox_items');
  const docData = {
    recipientRole: 'employee',
    recipientId: String(recipientId),
    title: String(title).trim(),
    message: String(message).trim(),
    status: 'unread',
    priority: normalizePriority(priority),
    type: normalizeType(type),
    senderRole: String(senderRole).toLowerCase().trim() || 'hr',
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(col, docData);
  return ref.id;
}

// --- hr_inbox (employee → HR messages) ---

/**
 * Send a message from an employee to HR. Creates a document in Firestore collection hr_inbox.
 * @param {{ senderId: string, senderName: string, category: string, subject: string, message: string }} opts
 * @returns {Promise<string|null>} Document ID or null
 */
export async function sendMessageToHR({ senderId, senderName, category, subject, message }) {
  if (!senderId || !subject?.trim() || !message?.trim()) {
    console.warn('[Inbox Service] sendMessageToHR: missing senderId, subject, or message');
    return null;
  }
  const col = collection(db, 'hr_inbox');
  const docData = {
    senderId: String(senderId),
    senderName: String(senderName ?? 'Unknown').trim(),
    category: String(category ?? 'General').trim(),
    subject: String(subject).trim(),
    message: String(message).trim(),
    status: 'unread',
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(col, docData);
  return ref.id;
}

/**
 * Get query and callbacks for hr_inbox (employee requests to HR). Use inside useEffect with onSnapshot; return unsubscribe in cleanup.
 * Maps to same shape as inbox_items for unified HR Inbox (type: employee_request, title: subject, etc.).
 * @param {(items: Array<InboxItem & { _source: 'hr_inbox' }>) => void} callback
 * @returns {{ query: Query, onNext: (snapshot) => void, onError: (err) => void }}
 */
export function getHrInboxSubscription(callback) {
  const q = query(
    collection(db, 'hr_inbox'),
    orderBy('createdAt', 'desc')
  );
  const onNext = (snapshot) => {
    const items = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const createdAt = data.createdAt?.toDate?.() ?? (data.createdAt ? new Date(data.createdAt) : new Date());
      return {
        id: docSnap.id,
        title: data.subject ?? '',
        message: data.message ?? '',
        type: 'employee_request',
        priority: 'medium',
        status: normalizeStatus(data.status),
        employeeId: data.senderId ?? null,
        department: data.department ?? null,
        createdAt,
        createdAtRaw: data.createdAt,
        _source: 'hr_inbox',
        _category: data.category ?? 'General',
        _senderName: data.senderName ?? null,
      };
    });
    callback(items);
  };
  const onError = (err) => {
    console.error('[Inbox Service] getHrInboxSubscription error:', err);
    callback([]);
  };
  return { query: q, onNext, onError };
}

/**
 * Update an hr_inbox document's status (e.g. in_review, resolved).
 * @param {string} id - Document ID in hr_inbox
 * @param {string} status - "unread" | "in_review" | "resolved"
 */
export async function updateHrInboxItemStatus(id, status) {
  const ref = doc(db, 'hr_inbox', id);
  await updateDoc(ref, {
    status: normalizeStatus(status),
    updatedAt: serverTimestamp(),
  });
}
