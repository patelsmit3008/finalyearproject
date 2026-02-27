/**
 * Conversations service (firebase/services) - creates conversations in Firestore.
 * Used by escalationsService. Same schema as src/services/conversationsService (conversations + messages subcollection).
 */

import { db } from "../config";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

/**
 * Create a conversation and first message in Firestore.
 * @param {{ employeeId: string, employeeName?: string, subject?: string, message: string }} opts
 * @returns {Promise<string|null>} Conversation ID or null
 */
export async function createConversation({ employeeId, employeeName, subject, message }) {
  if (!employeeId || !message?.trim()) {
    console.warn("[Conversations] createConversation: missing employeeId or message");
    return null;
  }
  const col = collection(db, "conversations");
  const empName = String(employeeName ?? "Unknown").trim();
  const conversationData = {
    employeeId: String(employeeId),
    employeeName: empName,
    status: "open",
    lastMessage: String(message).trim().slice(0, 200),
    updatedAt: serverTimestamp(),
    deletedFor: [],
    participantsInfo: {
      [String(employeeId)]: { name: empName, role: "employee" },
    },
    ...(subject?.trim() ? { subject: String(subject).trim() } : {}),
  };
  const convRef = await addDoc(col, conversationData);
  const messagesCol = collection(db, "conversations", convRef.id, "messages");
  await addDoc(messagesCol, {
    sender: "employee",
    text: String(message).trim(),
    createdAt: serverTimestamp(),
  });
  return convRef.id;
}
