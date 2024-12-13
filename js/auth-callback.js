import { initializeApp } from 'firebase/app';
import { getAuth, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function handleAuthCallback() {
  try {
    // Get the full URL
    const url = window.location.href;
    
    if (isSignInWithEmailLink(auth, url)) {
      // Get the email from localStorage
      const email = window.localStorage.getItem('emailForSignIn');
      if (!email) {
        throw new Error('Could not find email. Please try signing in again.');
      }

      // Complete the sign in
      await signInWithEmailLink(auth, email, url);
      
      // Clear the stored email
      window.localStorage.removeItem('emailForSignIn');
      
      // Update UI to show success
      document.querySelector('.spinner').style.display = 'none';
      document.querySelector('h1').textContent = 'Successfully Signed In!';
      document.querySelector('.message').textContent = 'You are now signed in and can safely close this page.';
      
      // Open the extension popup
      chrome.runtime.sendMessage({ type: 'open_popup' });
    }
  } catch (error) {
    console.error('Error completing sign-in:', error);
    document.querySelector('.spinner').style.display = 'none';
    document.getElementById('error-message').textContent = error.message;
    document.getElementById('error-message').style.display = 'block';
  }
}

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', handleAuthCallback); 