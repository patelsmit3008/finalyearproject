/**
 * HR Tasks Service - Firestore collection "hr_tasks" for HR Action Center.
 * People-operations only: compliance, employee lifecycle, inbox escalations, AI-suggested actions.
 * Fields: title, description, type, employeeId, employeeName?, priority, status, dueDate, createdAt, completedAt?
 */

import { db } from '../firebase/config';
import {
  collection,
  query,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

/** Task type enum for HR Action Center (no project delivery / PM tasks) */
export const HR_TASK_TYPES = {
  COMPLIANCE: 'compliance',
  EMPLOYEE_LIFECYCLE: 'employee_lifecycle',
  INBOX_ESCALATION: 'inbox_escalation',
  AI_SUGGESTED: 'ai_suggested',
};

/**
 * Subscribe to hr_tasks ordered by createdAt desc. Use with onSnapshot in useEffect.
 */
export function getHrTasksSubscription(callback) {
  const q = query(
    collection(db, 'hr_tasks'),
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
        type: d.type ?? HR_TASK_TYPES.COMPLIANCE,
        employeeId: d.employeeId ?? null,
        employeeName: d.employeeName ?? null,
        priority: d.priority ?? 'Medium',
        status: d.status ?? 'Pending',
        dueDate,
        createdAt,
        completedAt,
        aiSuggestionReason: d.aiSuggestionReason ?? null,
        linkedConversationId: d.linkedConversationId ?? null,
      };
    });
    callback(list);
  };
  const onError = (err) => {
    console.error('[hrTasksService] getHrTasksSubscription error:', err);
    callback([]);
  };
  return { query: q, onNext, onError };
}

/**
 * Update task status. Sets completedAt when status is 'Completed'.
 */
export async function updateHrTaskStatus(taskId, status) {
  if (!taskId || !status) return;
  const ref = doc(db, 'hr_tasks', taskId);
  const payload = { status };
  if (status === 'Completed') {
    payload.completedAt = serverTimestamp();
  }
  await updateDoc(ref, payload);
}
