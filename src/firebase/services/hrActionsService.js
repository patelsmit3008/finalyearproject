/**
 * HR Actions Service (firebase/services) - Firestore "hr_actions" collection.
 * Used by escalationsService and other firebase services. Same schema as src/services/hrActionsService.
 */

import { db } from "../config";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

/** Categories for HR Action Center tabs */
export const HR_ACTION_CATEGORIES = {
  COMPLIANCE: "compliance",
  EMPLOYEE_LIFECYCLE: "employee_lifecycle",
  INBOX_ESCALATION: "inbox_escalation",
  AI_SUGGESTED: "ai_suggested",
};

/** Source of the action */
export const HR_ACTION_SOURCES = {
  EMPLOYEE_MESSAGE: "employee_message",
  LEAVE_REQUEST: "leave_request",
  NEW_EMPLOYEE: "new_employee",
  AI_ESCALATION: "ai_escalation",
  SYSTEM: "system",
};

/**
 * Create an HR Action Center document in Firestore.
 * @param {Object} actionData - { title, description, category, priority?, status?, source, employeeId?, employeeName?, dueDate?, linkedConversationId?, aiSuggestionReason? }
 * @returns {Promise<string|null>} Document ID or null
 */
export async function createHrAction(actionData) {
  const {
    title,
    description,
    category,
    priority = "Medium",
    status = "Pending",
    source,
    employeeId = null,
    employeeName = null,
    dueDate = null,
    linkedConversationId = null,
    aiSuggestionReason = null,
  } = actionData || {};

  if (!title || !category || !source) {
    console.warn("[hrActionsService] createHrAction: missing title, category, or source");
    return null;
  }
  try {
    const col = collection(db, "hr_actions");
    const data = {
      title: String(title).trim(),
      description: String(description ?? "").trim(),
      category: String(category).trim(),
      priority: String(priority ?? "Medium").trim(),
      status: String(status ?? "Pending").trim(),
      source: String(source).trim(),
      createdAt: serverTimestamp(),
    };
    if (employeeId) data.employeeId = String(employeeId);
    if (employeeName) data.employeeName = String(employeeName).trim();
    if (dueDate) data.dueDate = dueDate instanceof Date ? dueDate : dueDate?.toDate?.() ?? dueDate;
    if (linkedConversationId) data.linkedConversationId = String(linkedConversationId);
    if (aiSuggestionReason) data.aiSuggestionReason = String(aiSuggestionReason).trim();
    const ref = await addDoc(col, data);
    return ref.id;
  } catch (err) {
    console.error("[hrActionsService] createHrAction error:", err);
    return null;
  }
}
