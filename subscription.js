import { authService } from './auth-service.js';

class SubscriptionManager {
  constructor() {
    this.setupAuthUI();
    this.setupSubscriptionButtons();
    this.loadUserStatus();
  }

  showMessage(message, type = 'error') {
    const container = document.getElementById('messageContainer');
    if (!container) return;

    // Clear any existing messages
    container.innerHTML = '';

    // Create message element
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    messageElement.textContent = message;
    container.appendChild(messageElement);

    // Auto-hide after 5 seconds
    setTimeout(() => {
      messageElement.remove();
    }, 5000);
  }

  setupSubscriptionButtons() {
    const buyCreditsBtn = document.getElementById('buyCreditsBtn');
    const subscribeBtn = document.getElementById('subscribeBtn');

    if (buyCreditsBtn) {
      buyCreditsBtn.addEventListener('click', () => this.handlePurchaseCredits());
    }
    if (subscribeBtn) {
      subscribeBtn.addEventListener('click', () => this.handleSubscribe());
    }
  }

  setupAuthUI() {
    const authModal = document.getElementById('authModal');
    const authForm = document.getElementById('authForm');
    const authClose = document.querySelector('.auth-close');

    if (authForm) {
      authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const result = await authService.signIn();
        if (result.success) {
          this.showMessage('Successfully signed in!', 'success');
          authModal.classList.remove('active');
          this.loadUserStatus();
        } else {
          this.showMessage('Failed to sign in. Please try again.');
        }
      });
    }

    if (authClose) {
      authClose.addEventListener('click', () => {
        authModal.classList.remove('active');
      });
    }
  }

  async loadUserStatus() {
    const status = await chrome.storage.sync.get(['trialCaptures', 'subscription']);
    if (!status.trialCaptures) {
      await chrome.storage.sync.set({ trialCaptures: 5 });
    }
    this.updateUI(status);
  }

  async updateUI(status) {
    const capturesLeft = document.getElementById('capturesLeft');
    const trialSection = document.getElementById('trialSection');
    
    if (status.subscription && status.subscription.active) {
      if (trialSection) {
        trialSection.innerHTML = '<div class="trial-counter">✨ Unlimited Subscription Active</div>';
      }
    } else if (capturesLeft) {
      capturesLeft.textContent = status.trialCaptures || 0;
    }
  }

  async handlePurchaseCredits() {
    if (!authService.getCurrentUser()) {
      this.showMessage('Please sign in to purchase credits');
      document.getElementById('authModal').classList.add('active');
      return;
    }
    await this.createCheckoutSession('credits');
  }

  async handleSubscribe() {
    if (!authService.getCurrentUser()) {
      this.showMessage('Please sign in to subscribe');
      document.getElementById('authModal').classList.add('active');
      return;
    }
    await this.createCheckoutSession('subscription');
  }

  async createCheckoutSession(type) {
    try {
      const user = authService.getCurrentUser();
      if (!user) {
        this.showMessage('Please sign in to continue');
        document.getElementById('authModal').classList.add('active');
        return;
      }

      const priceId = type === 'subscription' ? 'price_sub' : 'price_credits';
      
      // Create checkout session
      const response = await fetch('https://us-central1-espensivo.cloudfunctions.net/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId,
          extensionId: chrome.runtime.id,
          userId: user.uid,
          returnUrl: chrome.runtime.getURL('checkout-complete.html')
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const { url } = await response.json();
      
      // Open checkout in a new window
      chrome.windows.create({
        url: url,
        type: 'popup',
        width: 500,
        height: 700
      });

    } catch (error) {
      console.error('Checkout error:', error);
      this.showMessage('Failed to start purchase process. Please try again.');
    }
  }
}

// Initialize subscription manager
const subscriptionManager = new SubscriptionManager();
export default subscriptionManager; 