import { auth } from './firebase-config.js';
import { authService } from './auth-service.js';

// Handle auth state changes
auth.onAuthStateChanged((user) => {
  if (!user) {
    // Redirect to popup if not logged in
    window.location.href = 'popup.html';
  }
});

// Handle logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    await authService.signOut();
    // The onAuthStateChanged handler will handle the redirect
  } catch (error) {
    console.error('Logout error:', error);
    alert('Failed to log out. Please try again.');
  }
}); 