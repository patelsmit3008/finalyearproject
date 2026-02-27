/**
 * HR Actions Service - Firestore collection "hr_actions" for HR Action Center.
 * Documents: title, description, category, priority, status, source, employeeId, createdAt.
 * Optional: employeeName, dueDate, completedAt, linkedConversationId.
 * Auto-created when: employee messages HR, leave request, new employee, AI escalation, etc.
 */

import { db } from '../firebase/config';
import {
  collection,
  query,
  orderBy,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

/** Categories for tabs (people-operations only) */
export const HR_ACTION_CATEGORIES = {
  COMPLIANCE: 'compliance',
  EMPLOYEE_LIFECYCLE: 'employee_lifecycle',
  INBOX_ESCALATION: 'inbox_escalation',
  AI_SUGGESTED: 'ai_suggested',
};

/** Source of the action */
export const HR_ACTION_SOURCES = {
  EMPLOYEE_MESSAGE: 'employee_message',
  LEAVE_REQUEST: 'leave_request',
  NEW_EMPLOYEE: 'new_employee',
  AI_ESCALATION: 'ai_escalation',
  SYSTEM: 'system',
};

/**
 * Create an HR Action Center item. Call when: employee messages HR, leave request, new employee, AI escalation.
 * @param {{
 *   title: string,
 *   description: string,
 *   category: string,
 *   priority?: string,
 *   status?: string,
 *   source: string,
 *   employeeId?: string,
 *   employeeName?: string,
 *   dueDate?: Date | object,
 *   linkedConversationId?: string,
 *   aiSuggestionReason?: string
 * }} opts
 * @returns {Promise<string|null>} Document ID or null
 */
export async function createHrAction({
  title,
  description,
  category,
  priority = 'Medium',
  status = 'Pending',
  source,
  employeeId = null,
  employeeName = null,
  dueDate = null,
  linkedConversationId = null,
  aiSuggestionReason = null,
}) {
  if (!title || !category || !source) {
    console.warn('[hrActionsService] createHrAction: missing title, category, or source');
    return null;
  }
  try {
    const col = collection(db, 'hr_actions');
    const data = {
      title: String(title).trim(),
      description: String(description ?? '').trim(),
      category: String(category).trim(),
      priority: String(priority ?? 'Medium').trim(),
      status: String(status ?? 'Pending').trim(),
      source: String(source).trim(),
      createdAt: serverTimestamp(),
    };
    if (employeeId) data.employeeId = String(employeeId);
    if (employeeName) data.employeeName = String(employeeName).trim();
    if (dueDate) data.dueDate = dueDate instanceof Date ? dueDate : (dueDate?.toDate?.() ?? dueDate);
    if (linkedConversationId) data.linkedConversationId = String(linkedConversationId);
    if (aiSuggestionReason) data.aiSuggestionReason = String(aiSuggestionReason).trim();
    const ref = await addDoc(col, data);
    return ref.id;
  } catch (err) {
    console.error('[hrActionsService] createHrAction error:', err);
    return null;
  }
}

/**
 * Subscribe to hr_actions ordered by createdAt desc. Use with onSnapshot in useEffect.
 */
export function getHrActionsSubscription(callback) {
  const q = query(
    collection(db, 'hr_actions'),
    orderBy('createdAt', 'desc')
  );
  const onNext = (snapshot) => {
    const list = snapshot.docs.map((docSnap) => {
      const d = docSnap.data();
      const createdAt = d.createdAt?.toDate?.() ?? (d.createdAt ? new Date(d.createdAt) : new Date());
      const dueDate = d.dueDate?.toDate?.() ?? (d.dueDate ? new Date(d.dueDate) : null);
      const completedAt = d.completedAt?.toDate?.() ?? (d.completedAt ? new Date(d.completedAt) : null);
      return {
        id: docSnap.id,
        title: d.title ?? '',
        description: d.description ?? '',
        category: d.category ?? HR_ACTION_CATEGORIES.COMPLIANCE,
        priority: d.priority ?? 'Medium',
        status: d.status ?? 'Pending',
        source: d.source ?? HR_ACTION_SOURCES.SYSTEM,
        employeeId: d.employeeId ?? null,
        employeeName: d.employeeName ?? null,
        createdAt,
        dueDate,
        completedAt,
        linkedConversationId: d.linkedConversationId ?? null,
        aiSuggestionReason: d.aiSuggestionReason ?? null,
      };
    });
    callback(list);
  };
  const onError = (err) => {
    console.error('[hrActionsService] getHrActionsSubscription error:', err);
    callback([]);
  };
  return { query: q, onNext, onError };
}

/**
 * Update action status. Sets completedAt when status is 'Completed'.
 */
export async function updateHrActionStatus(actionId, status) {
  if (!actionId || !status) return;
  const ref = doc(db, 'hr_actions', actionId);
  const payload = { status: String(status) };
  if (String(status).toLowerCase() === 'completed') {
    payload.completedAt = serverTimestamp();
  }
  await updateDoc(ref, payload);
}
