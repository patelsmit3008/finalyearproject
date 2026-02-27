import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "../firebase/config";

/**
 * Fetch active HR documents from Firestore
 * @param {string|null} category - Optional category filter (LEAVE_POLICY, HR_POLICY, BENEFITS, PAYROLL, OTHER)
 * @returns {Promise<Array>} Array of document objects with { id, ...data }
 */
export const fetchActiveHRDocuments = async (category = null) => {
  try {
    // Base query: collection and isActive filter
    let q = query(
      collection(db, "hr_documents"),
      where("isActive", "==", true),
      orderBy("createdAt", "desc")
    );

    // Add category filter if provided
    if (category) {
      q = query(
        collection(db, "hr_documents"),
        where("isActive", "==", true),
        where("category", "==", category),
        orderBy("createdAt", "desc")
      );
    }

    // Execute query
    const querySnapshot = await getDocs(q);
    
    // Transform documents to array with id
    const documents = [];
    querySnapshot.forEach((docSnapshot) => {
      documents.push({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      });
    });

    return documents;
  } catch (error) {
    console.error("Error fetching active HR documents:", {
      error,
      message: error.message,
      code: error.code,
      category,
    });
    throw error;
  }
};

