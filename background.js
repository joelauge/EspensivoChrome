// Import Firebase and config
importScripts('lib/firebase-bundle.js');
importScripts('firebase-config-sw.js');

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// Listen for auth state changes
auth.onAuthStateChanged((user) => {
  if (user) {
    console.log('User signed in:', user.email);
    // Update extension badge or state as needed
    chrome.action.setBadgeText({ text: '✓' });
    
    // Store auth state
    chrome.storage.local.set({ isLoggedIn: true });
  } else {
    console.log('User signed out');
    chrome.action.setBadgeText({ text: '' });
    chrome.storage.local.set({ isLoggedIn: false });
  }
});

// Listen for messages from the auth redirect page
chrome.runtime.onMessageExternal.addListener(
  async (message, sender, sendResponse) => {
    if (message.type === 'complete_auth' && sender.origin === 'https://www.espensivo.com') {
      try {
        // Get the stored email
        const { pendingEmail } = await chrome.storage.sync.get(['pendingEmail']);
        if (!pendingEmail) {
          throw new Error('No pending email found');
        }

        // Complete the sign-in
        await auth.signInWithEmailLink(pendingEmail, message.url);
        
        // Clear stored email
        await chrome.storage.sync.remove(['pendingEmail']);
        
        // Instead of opening popup, send success response
        sendResponse({ success: true });
        
        // Create notification to guide user
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'images/icon128.png',
          title: 'Successfully Signed In',
          message: 'Click the Espensivo icon to continue with your purchase.'
        });
      } catch (error) {
        console.error('Error completing auth:', error);
        sendResponse({ success: false, error: error.message });
      }
      return true; // Keep the message channel open for async response
    }
  }
);

// Handle auth errors
auth.onAuthStateChanged((user, error) => {
  if (error) {
    console.error('Auth state error:', error);
  }
});