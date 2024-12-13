const STRIPE_PUBLIC_KEY = 'your_stripe_public_key';
const stripe = Stripe(STRIPE_PUBLIC_KEY);

// Product IDs from Stripe
const PRODUCTS = {
  CAPTURE_CREDITS: 'price_credits20',
  UNLIMITED_SUB: 'price_unlimited'
};

class SubscriptionManager {
  constructor() {
    this.initializeStripe();
    this.loadUserStatus();
  }

  async initializeStripe() {
    // Initialize Stripe
  }

  async loadUserStatus() {
    const status = await chrome.storage.sync.get(['trialCaptures', 'subscription']);
    if (!status.trialCaptures) {
      // First time user
      await chrome.storage.sync.set({ trialCaptures: 5 });
    }
    this.updateUI(status);
  }

  async updateUI(status) {
    const counter = document.getElementById('remainingCaptures');
    const upgradeOptions = document.querySelector('.upgrade-options');
    
    if (status.subscription && status.subscription.active) {
      counter.parentElement.innerHTML = '✨ Unlimited Subscription Active';
      upgradeOptions.style.display = 'none';
    } else {
      counter.textContent = status.trialCaptures;
      if (status.trialCaptures <= 0) {
        upgradeOptions.style.display = 'flex';
        document.getElementById('captureBtn').disabled = true;
      }
    }
  }

  async decrementTrialCaptures() {
    const status = await chrome.storage.sync.get(['trialCaptures']);
    if (status.trialCaptures > 0) {
      await chrome.storage.sync.set({ 
        trialCaptures: status.trialCaptures - 1 
      });
      this.updateUI({ trialCaptures: status.trialCaptures - 1 });
    }
  }

  async handlePurchaseCredits() {
    const session = await this.createCheckoutSession(PRODUCTS.CAPTURE_CREDITS);
    stripe.redirectToCheckout({ sessionId: session.id });
  }

  async handleSubscribe() {
    const session = await this.createCheckoutSession(PRODUCTS.UNLIMITED_SUB);
    stripe.redirectToCheckout({ sessionId: session.id });
  }

  async createCheckoutSession(priceId) {
    const response = await fetch('https://us-central1-espensivo.cloudfunctions.net/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceId,
        extensionId: chrome.runtime.id
      })
    });
    return response.json();
  }
} 