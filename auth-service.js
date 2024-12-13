import { auth } from './firebase-config.js';

// Singleton instance
let instance = null;

export class AuthService {
  constructor() {
    if (instance) {
      console.log('Returning existing AuthService instance');
      return instance;
    }
    
    console.log('Creating new AuthService instance');
    instance = this;

    // Listen for auth state changes
    auth.onAuthStateChanged((user) => {
      console.log('Auth state changed:', user ? 'logged in' : 'logged out');
      if (user) {
        // Store user ID in sync storage
        chrome.storage.sync.set({ 
          userId: user.uid,
          userEmail: user.email,
          isLoggedIn: true
        });
        
        // Update UI in current page
        this.updateUI(true, user.email);
      } else {
        // Clear user data from sync storage
        chrome.storage.sync.remove(['userId', 'userEmail', 'isLoggedIn']);
        
        // Update UI in current page
        this.updateUI(false);
      }
    });

    return instance;
  }

  async signOut() {
    try {
      await auth.signOut();
      return { success: true };
    } catch (error) {
      console.error('Error signing out:', error);
      return { success: false, error: error.message };
    }
  }

  getCurrentUser() {
    return auth.currentUser;
  }

  async sendSignInLink(email, purchaseIntent = null) {
    console.log('Starting sign-in process for:', email);
    
    try {
      // Store email and purchase intent in sync storage
      await chrome.storage.sync.set({
        pendingEmail: email,
        purchaseIntent: purchaseIntent ? JSON.stringify(purchaseIntent) : null
      });

      // Create the sign-in URL with the extension's callback
      const redirectUrl = `chrome-extension://${chrome.runtime.id}/auth-callback.html`;
      console.log('Using redirect URL:', redirectUrl);

      // Send the sign-in link with minimal configuration
      await auth.sendSignInLinkToEmail(email, {
        url: redirectUrl,
        handleCodeInApp: true
      });

      console.log('Sign-in link sent successfully');
      return true;
    } catch (error) {
      console.error('Error sending sign-in link:', error);
      throw error;
    }
  }

  // Changed from static to instance method
  updateUI(isLoggedIn, email = null) {
    const loginStatus = document.getElementById('loginStatus');
    if (!loginStatus) return;

    const loginIndicator = loginStatus.querySelector('.login-indicator');
    const loginText = loginStatus.querySelector('span') || loginStatus.querySelector('#loginText');
    const userEmail = document.getElementById('userEmail');
    const logoutSection = document.getElementById('logoutSection');
    
    loginStatus.style.display = 'flex';
    
    if (isLoggedIn) {
      loginStatus.classList?.remove('not-logged-in');
      loginIndicator.style.backgroundColor = '#059669';
      loginText.textContent = 'Logged In';
      if (userEmail) userEmail.textContent = `Signed in as ${email}`;
      if (logoutSection) logoutSection.style.display = 'block';
      if (loginStatus.onclick) loginStatus.onclick = null;
    } else {
      loginStatus.classList?.add('not-logged-in');
      loginIndicator.style.backgroundColor = '#6b7280';
      loginText.textContent = 'Sign In';
      if (userEmail) userEmail.textContent = '';
      if (logoutSection) logoutSection.style.display = 'none';
      if (typeof showAuthModal === 'function') {
        loginStatus.onclick = showAuthModal;
      }
    }
  }
}

// Create a single instance
export const authService = new AuthService();

// Listen for auth state messages
window.addEventListener('message', (event) => {
  if (event.data.type === 'auth_state_changed') {
    authService.updateUI(
      event.data.data.isLoggedIn,
      event.data.data.email
    );
  }
}); 