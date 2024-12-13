import { auth } from './firebase-config.js';
import { authService } from './auth-service.js';

console.log('Extension ID:', chrome.runtime.id);

const DEFAULT_CATEGORIES = [
  'Meals & Entertainment',
  'Travel',
  'Office Supplies',
  'Software & Subscriptions',
  'Professional Services',
  'Utilities',
  'Marketing',
  'Equipment',
  'Training & Education',
  'Other'
];

const TRIAL_LIMIT = 5;
const TRIAL_CAPTURES = 5;
const CAPTURE_PACK_PRICE = 1000; // $10.00 in cents
const SUBSCRIPTION_PRICE = 495;   // $4.95 in cents

// Stripe configuration
const STRIPE_PUBLIC_KEY = 'pk_test_51QPa562SWDYVKZGEn38t3a0WI4eBgS2QfvQMqVvgWc486sjZdlu8eElWyeDEG2Tve3gb0voSaPA66IK78kWFNoNe0073lH8w9m';
const STRIPE_PRICES = {
  credits: 'price_1QV5FS2SWDYVKZGE4sGo3Xdl',
  subscription: 'price_1QV5GN2SWDYVKZGESjBLWzeA'
};

// Wait for DOM to be loaded before initializing
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize auth state
  auth.onAuthStateChanged((user) => {
    if (user) {
      console.log('Auth state changed: logged in');
      updateLoginStatus(true, user.email);
    } else {
      console.log('Auth state changed: logged out');
      updateLoginStatus(false);
    }
  });

  // Initialize trial captures if not set
  const status = await chrome.storage.sync.get(['trialCaptures']);
  if (typeof status.trialCaptures === 'undefined') {
    await chrome.storage.sync.set({ trialCaptures: TRIAL_CAPTURES });
  }

  // Update trial UI
  updateTrialUI();

  // Add event listeners
  document.getElementById('buyCreditsBtn')?.addEventListener('click', handlePurchaseCredits);
  document.getElementById('subscribeBtn')?.addEventListener('click', handleSubscription);
  document.getElementById('captureBtn')?.addEventListener('click', startCapture);
  document.getElementById('loginStatus')?.addEventListener('click', showAuthModal);
  document.getElementById('authForm')?.addEventListener('submit', handleAuthSubmit);
  document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
  document.getElementById('settingsLink')?.addEventListener('click', openSettings);

  // Set up auth modal close handlers
  const authModal = document.getElementById('authModal');
  const authCloseBtn = document.querySelector('.auth-close');
  
  if (authCloseBtn) {
    authCloseBtn.addEventListener('click', () => {
      authModal?.classList.remove('active');
    });
  }

  if (authModal) {
    authModal.addEventListener('click', (e) => {
      if (e.target === authModal) {
        authModal.classList.remove('active');
      }
    });
  }

  // Set up image modal close handlers
  const imageModal = document.getElementById('imageModal');
  const modalClose = imageModal?.querySelector('.modal-close');
  
  if (modalClose) {
    modalClose.addEventListener('click', () => {
      imageModal?.classList.remove('active');
    });
  }

  if (imageModal) {
    imageModal.addEventListener('click', (e) => {
      if (e.target === imageModal) {
        imageModal.classList.remove('active');
      }
    });
  }

  // Load initial state
  await loadReceipts();
  updateCapturesLeft();
});

// ... rest of the code ...