import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase/config";
import { createHrAction, HR_ACTION_CATEGORIES, HR_ACTION_SOURCES } from "../services/hrActionsService";

const AuthContext = createContext(null);

// Valid roles enum
const VALID_ROLES = ['EMPLOYEE', 'HR', 'PROJECT_MANAGER'];
// Valid departments for employee signup
const VALID_DEPARTMENTS = ['Engineering', 'Finance', 'Marketing', 'Operations', 'Sales'];
const DEFAULT_DEPARTMENT = 'Engineering';

// Map Firebase errors to user-friendly messages
const getErrorMessage = (error) => {
  const code = error?.code || '';
  const message = error?.message || '';

  console.error('Firebase Error:', { code, message, error });

  // Firebase Auth errors
  if (code === 'auth/email-already-in-use') {
    return 'This email is already registered. Please use a different email or try logging in.';
  }
  if (code === 'auth/invalid-email') {
    return 'Invalid email address. Please enter a valid email.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Email/password accounts are not enabled. Please contact support.';
  }
  if (code === 'auth/weak-password') {
    return 'Password is too weak. Please use a stronger password (at least 6 characters).';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error. Please check your internet connection and try again.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many requests. Please wait a moment and try again.';
  }

  // Firestore errors
  if (code === 'permission-denied') {
    return 'Permission denied. You do not have access to perform this operation.';
  }
  if (code === 'unavailable') {
    return 'Service temporarily unavailable. Please try again later.';
  }

  // Generic fallback
  return message || 'An error occurred during registration. Please try again.';
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Listen to Firebase auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setUser(null);
          setIsLoading(false);
          return;
        }

        const userRef = doc(db, "users", firebaseUser.uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
          const data = userDoc.data();
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            name: data.name,
            role: data.role,
            department: data.department ?? null,
          });
        } else {
          console.warn('Firestore user document not found for authenticated user:', firebaseUser.uid);
          setUser(null);
        }
      } catch (error) {
        console.error('Error in auth state listener:', error);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // REGISTER: register({ name, email, password, role, department })
  const register = async ({ name, email, password, role, department }) => {
    let firebaseUser = null;
    
    try {
      // Validate inputs
      if (!name || !name.trim()) {
        throw new Error('Name is required');
      }
      if (!email || !email.trim()) {
        throw new Error('Email is required');
      }
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }
      if (!role || !VALID_ROLES.includes(role)) {
        throw new Error(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);
      }
      const resolvedDepartment = department && VALID_DEPARTMENTS.includes(department)
        ? department
        : DEFAULT_DEPARTMENT;

      console.log('Starting registration:', { email, role, department: resolvedDepartment });

      // Step 1: Create Firebase Auth user (password is automatically hashed by Firebase)
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      firebaseUser = cred.user;
      console.log('Firebase Auth user created:', firebaseUser.uid);

      // Step 2: Update Firebase Auth profile
      await updateProfile(firebaseUser, { displayName: name });
      console.log('Firebase Auth profile updated');

      // Step 3: Create Firestore user document using UID as document ID
      const userRef = doc(db, "users", firebaseUser.uid);
      const userData = {
        uid: firebaseUser.uid,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: role,
        department: resolvedDepartment,
        createdAt: new Date(),
      };

      try {
        await setDoc(userRef, userData);
        console.log('Firestore user document created successfully:', firebaseUser.uid);
        
        // Verify document was created
        const verifyDoc = await getDoc(userRef);
        if (!verifyDoc.exists()) {
          throw new Error('Failed to create user document in Firestore');
        }
        console.log('Firestore user document verified:', firebaseUser.uid);

        if (role === 'EMPLOYEE') {
          try {
            await createHrAction({
              title: 'New employee onboarded',
              description: `${name.trim()} (${email.trim().toLowerCase()}) joined as ${resolvedDepartment}.`,
              category: HR_ACTION_CATEGORIES.EMPLOYEE_LIFECYCLE,
              priority: 'Medium',
              status: 'Pending',
              source: HR_ACTION_SOURCES.NEW_EMPLOYEE,
              employeeId: firebaseUser.uid,
              employeeName: name.trim(),
            });
          } catch (hrActionErr) {
            console.warn('HR Action Center create failed (non-blocking):', hrActionErr);
          }
        }
      } catch (firestoreError) {
        console.error('Firestore document creation failed:', firestoreError);
        // If Firestore creation fails, we should still allow the user to proceed
        // but log the error for debugging
        throw new Error('Failed to create user profile. Please contact support.');
      }

      // Step 4: Set app-level user state
      setUser({
        uid: firebaseUser.uid,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: role,
        department: resolvedDepartment,
      });

      return true;
    } catch (error) {
      console.error('Registration error details:', {
        code: error?.code,
        message: error?.message,
        stack: error?.stack,
        error,
      });

      // If Firebase Auth user was created but Firestore failed, 
      // the user will need to contact support or we could auto-create on next login
      if (firebaseUser && error.message.includes('Firestore')) {
        console.warn('Firebase Auth user exists but Firestore document creation failed:', firebaseUser.uid);
      }

      // Re-throw with user-friendly message
      const friendlyMessage = getErrorMessage(error);
      const registrationError = new Error(friendlyMessage);
      registrationError.code = error?.code;
      throw registrationError;
    }
  };

  // LOGIN: login(email, password)
  const login = async (email, password) => {
    try {
      if (!email || !email.trim()) {
        throw new Error('Email is required');
      }
      if (!password) {
        throw new Error('Password is required');
      }

      console.log('Starting login:', { email });

      // Step 1: Authenticate with Firebase Auth first
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;
      console.log('Firebase Auth login successful:', uid);

      // Step 2: Fetch Firestore profile using the UID
      const userRef = doc(db, "users", uid);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        console.warn('Firestore user document not found for authenticated user:', uid);
        console.log('Attempting to auto-create Firestore document from Firebase Auth profile...');
        
        // Auto-create Firestore document from Firebase Auth profile
        // This handles cases where registration succeeded but Firestore write failed
        const displayName = cred.user.displayName || cred.user.email?.split('@')[0] || 'User';
        const defaultRole = 'EMPLOYEE'; // Default role if not specified
        
        const userData = {
          uid: uid,
          name: displayName,
          email: cred.user.email || email.trim().toLowerCase(),
          role: defaultRole,
          department: DEFAULT_DEPARTMENT,
          createdAt: new Date(),
          autoCreated: true, // Flag to indicate this was auto-created
        };

        try {
          await setDoc(userRef, userData);
          console.log('Auto-created Firestore user document:', uid);
          
          setUser({
            uid: uid,
            email: cred.user.email,
            name: displayName,
            role: defaultRole,
            department: DEFAULT_DEPARTMENT,
          });

          return true;
        } catch (createError) {
          console.error('Failed to auto-create Firestore document:', createError);
          throw new Error('User profile not found and could not be created. Please contact support or sign up again.');
        }
      }

      // Step 3: User document exists, use it
      const data = userDoc.data();
      console.log('Firestore user data retrieved:', { uid, role: data.role });

      // Validate required fields
      if (!data.role || !VALID_ROLES.includes(data.role)) {
        console.warn('Invalid or missing role in Firestore document:', data.role);
        // Update with default role
        await setDoc(userRef, { ...data, role: data.role || 'EMPLOYEE' }, { merge: true });
      }

      setUser({
        uid: uid,
        email: cred.user.email,
        name: data.name || cred.user.displayName || email.split('@')[0],
        role: data.role || 'EMPLOYEE',
        department: data.department ?? null,
      });

      return true;
    } catch (error) {
      console.error('Login error details:', {
        code: error?.code,
        message: error?.message,
        stack: error?.stack,
        error,
      });

      // Map Firebase Auth errors
      const code = error?.code || '';
      if (code === 'auth/user-not-found') {
        throw new Error('No account found with this email. Please check your email or sign up.');
      }
      if (code === 'auth/wrong-password') {
        throw new Error('Incorrect password. Please try again.');
      }
      if (code === 'auth/invalid-email') {
        throw new Error('Invalid email address.');
      }
      if (code === 'auth/user-disabled') {
        throw new Error('This account has been disabled. Please contact support.');
      }
      if (code === 'auth/too-many-requests') {
        throw new Error('Too many failed attempts. Please wait a moment and try again.');
      }

      throw error;
    }
  };

  // LOGOUT
  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
      setUser(null);
    }
  };

  const isAuthenticated = !!user;

  const value = {
    user,
    isLoading,
    isAuthenticated,
    register,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!isLoading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}