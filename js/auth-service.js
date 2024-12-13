import { initializeApp } from 'firebase/app';
import { getAuth, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, onAuthStateChanged, signOut } from 'firebase/auth';
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Auth state observer
let currentUser = null;
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  updateLoginStatus();
});

// Update login status across extension
function updateLoginStatus() {
  const event = new CustomEvent('loginStatusChanged', {
    detail: { isLoggedIn: !!currentUser }
  });
  document.dispatchEvent(event);
}

// Send sign-in link
export async function sendLoginLink(email) {
  try {
    // Configure action code settings
    const actionCodeSettings = {
      url: 'https://www.espensivo.com/auth-redirect',
      handleCodeInApp: true
    };
    
    // Save the email in Chrome storage
    await chrome.storage.sync.set({ pendingEmail: email });
    
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    return { success: true };
  } catch (error) {
    console.error('Error sending sign-in link:', error);
    return { success: false, error: error.message };
  }
}

// Complete sign-in with email link
export async function completeSignIn(url) {
  try {
    if (isSignInWithEmailLink(auth, url)) {
      // Get email from Chrome storage
      const { pendingEmail } = await chrome.storage.sync.get(['pendingEmail']);
      if (!pendingEmail) {
        throw new Error('Could not find email. Please try signing in again.');
      }

      const result = await signInWithEmailLink(auth, pendingEmail, url);
      
      // Clear stored email
      await chrome.storage.sync.remove(['pendingEmail']);
      
      return { success: true, user: result.user };
    }
  } catch (error) {
    console.error('Error completing sign-in:', error);
    return { success: false, error: error.message };
  }
}

// Sign out
export async function signOutUser() {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    console.error('Error signing out:', error);
    return { success: false, error: error.message };
  }
}

// Get current user
export function getCurrentUser() {
  return currentUser;
}

// Check if user is logged in
export function isLoggedIn() {
  return !!currentUser;
} 