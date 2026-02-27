/**
 * Authentication utilities
 * Basic password hashing and user storage for prototype
 */

// Simple password hashing using Web Crypto API
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Verify password against stored hash
export async function verifyPassword(password, hashedPassword) {
  const passwordHash = await hashPassword(password);
  return passwordHash === hashedPassword;
}

// User storage in localStorage (prototype-level)
const USERS_STORAGE_KEY = 'helix_users';
const CURRENT_USER_KEY = 'helix_current_user';

export function getStoredUsers() {
  try {
    const users = localStorage.getItem(USERS_STORAGE_KEY);
    return users ? JSON.parse(users) : [];
  } catch (error) {
    console.error('Error reading users from storage:', error);
    return [];
  }
}

export function saveUser(user) {
  try {
    const users = getStoredUsers();
    // Check if user with this email already exists
    const existingUserIndex = users.findIndex(u => u.email === user.email);
    
    if (existingUserIndex >= 0) {
      // Update existing user
      users[existingUserIndex] = user;
    } else {
      // Add new user
      users.push(user);
    }
    
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    return true;
  } catch (error) {
    console.error('Error saving user to storage:', error);
    return false;
  }
}

export function getUserByEmail(email) {
  const users = getStoredUsers();
  return users.find(u => u.email === email);
}

export function setCurrentUser(user) {
  try {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    return true;
  } catch (error) {
    console.error('Error setting current user:', error);
    return false;
  }
}

export function getCurrentUser() {
  try {
    const user = localStorage.getItem(CURRENT_USER_KEY);
    return user ? JSON.parse(user) : null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

export function clearCurrentUser() {
  try {
    localStorage.removeItem(CURRENT_USER_KEY);
    return true;
  } catch (error) {
    console.error('Error clearing current user:', error);
    return false;
  }
}

