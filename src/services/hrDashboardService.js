/**
 * HR Dashboard Service - Firestore real-time subscriptions for HR Admin Dashboard.
 * Data sources: users, employee_skill_profiles, resumes, project_interests, user_progress.
 * Call onSnapshot inside useEffect and return unsubscribe in cleanup.
 */

import { db } from '../firebase/config';
import { collection } from 'firebase/firestore';

/**
 * Get query and callbacks for "users" collection. Use inside useEffect with onSnapshot; return unsubscribe in cleanup.
 */
export function getUsersSubscription(callback) {
  const q = collection(db, 'users');
  const onNext = (snapshot) => {
    const users = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        name: data.name ?? null,
        email: data.email ?? null,
        role: data.role ?? null,
        department: data.department ?? null,
        assignedProjects: Array.isArray(data.assignedProjects) ? data.assignedProjects : [],
      };
    });
    callback(users);
  };
  const onError = (err) => {
    console.error('[HR Dashboard] subscribeToUsers error:', err);
    callback([]);
  };
  return { query: q, onNext, onError };
}

/**
 * Get query and callbacks for "resumes" collection. Use inside useEffect with onSnapshot; return unsubscribe in cleanup.
 */
export function getResumesSubscription(callback) {
  const q = collection(db, 'resumes');
  const onNext = (snapshot) => {
    const userIds = snapshot.docs.map((d) => d.id);
    callback(userIds);
  };
  const onError = (err) => {
    console.error('[HR Dashboard] subscribeToResumes error:', err);
    callback([]);
  };
  return { query: q, onNext, onError };
}

/**
 * Get query and callbacks for "user_progress" collection. Use inside useEffect with onSnapshot; return unsubscribe in cleanup.
 */
export function getUserProgressSubscription(callback) {
  const q = collection(db, 'user_progress');
  const onNext = (snapshot) => {
    const docs = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        userId: data.userId ?? docSnap.id,
        overallScore: typeof data.overallScore === 'number' ? data.overallScore : Number(data.overallScore) || 0,
        updatedAt: data.updatedAt ?? null,
        createdAt: data.createdAt ?? null,
        month: data.month ?? null,
      };
    });
    callback(docs);
  };
  const onError = (err) => {
    console.error('[HR Dashboard] subscribeToUserProgress error:', err);
    callback([]);
  };
  return { query: q, onNext, onError };
}
