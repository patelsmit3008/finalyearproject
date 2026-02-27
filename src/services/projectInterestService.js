/**
 * Project Interest Service - Firestore real-time listener for project_interests.
 * Used by PM Dashboard to compute total assignments and assigned count per project.
 * Call onSnapshot inside useEffect and return unsubscribe in cleanup.
 */

import { db } from '../firebase/config';
import { collection } from 'firebase/firestore';

/**
 * Get query and callbacks for "project_interests" collection. Use inside useEffect with onSnapshot; return unsubscribe in cleanup.
 * @param {(interests: Array) => void} callback
 * @returns {{ query: Query, onNext: (snapshot) => void, onError: (err) => void }}
 */
export function getProjectInterestsSubscription(callback) {
  const q = collection(db, 'project_interests');
  const onNext = (snapshot) => {
    const interests = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        projectId: data.projectId ?? null,
        employeeId: data.employeeId ?? null,
        employeeName: data.employeeName ?? null,
        status: (data.status ?? 'pending').toLowerCase(),
      };
    });
    callback(interests);
  };
  const onError = (err) => {
    console.error('[Project Interest Service] subscribeToProjectInterests error:', err);
    callback([]);
  };
  return { query: q, onNext, onError };
}
