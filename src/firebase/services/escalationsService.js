/**
 * Escalations Service - AI chatbot escalations now use the shared "conversations" collection.
 * createEscalation creates a conversation and an HR Action Center item. No usage of ai_escalations.
 */

import { createConversation } from "./conversationsService";
import { createHrAction, HR_ACTION_CATEGORIES, HR_ACTION_SOURCES } from "./hrActionsService";

/**
 * Create an escalation as a conversation (appears in HR Inbox). No write to ai_escalations.
 *
 * @param {Object} escalationData - Escalation data
 * @param {string} escalationData.question - Employee's question
 * @param {string} escalationData.employeeId - Employee UID
 * @param {string} escalationData.employeeName - Employee name
 * @param {string} escalationData.department - Employee department (unused in conversation)
 * @param {number} escalationData.confidence - Confidence score (unused)
 * @param {string} escalationData.category - Question category (optional)
 * @param {string} escalationData.aiResponse - AI-generated response (optional, not stored in conversation)
 * @returns {Promise<string|null>} Conversation ID or null on failure
 */
export const createEscalation = async (escalationData) => {
  try {
    if (!escalationData.question || !escalationData.employeeId) {
      console.error("Escalation: Missing required fields (question, employeeId)");
      return null;
    }

    const subject = `Helix escalation: ${escalationData.question.trim().slice(0, 50)}${escalationData.question.length > 50 ? '…' : ''}`;
    const message = escalationData.question.trim();
    const convId = await createConversation({
      employeeId: escalationData.employeeId,
      employeeName: escalationData.employeeName || 'Unknown',
      subject,
      message,
      skipHrAction: true,
    });
    if (convId) {
      console.log('Escalation created as conversation:', convId);
      try {
        await createHrAction({
          title: subject,
          description: escalationData.question.trim().slice(0, 500),
          category: HR_ACTION_CATEGORIES.AI_SUGGESTED,
          priority: 'High',
          status: 'Pending',
          source: HR_ACTION_SOURCES.AI_ESCALATION,
          employeeId: escalationData.employeeId,
          employeeName: escalationData.employeeName || 'Unknown',
          linkedConversationId: convId,
          aiSuggestionReason: escalationData.reason || escalationData.aiResponse || null,
        });
      } catch (e) {
        console.warn('createHrAction for escalation failed:', e);
      }
    }
    return convId;
  } catch (error) {
    console.error('Error creating escalation (conversation):', error);
    return null;
  }
};

/**
 * @deprecated Escalations now use conversations. Returns [].
 */
export const getEscalations = async () => {
  return [];
};

/**
 * @deprecated Escalations now use conversations. Use resolveConversation in conversationsService. Returns false.
 */
export const updateEscalationStatus = async () => {
  return false;
};

/**
 * @deprecated Escalations now use conversations. Use sendConversationMessage in conversationsService. Returns false.
 */
export const updateEscalationResponse = async () => {
  return false;
};
