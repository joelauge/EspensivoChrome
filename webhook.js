const functions = require('firebase-functions');

// Get environment variables
const stripeSecretKey = functions.config().stripe.secret_key;
const webhookSecret = functions.config().stripe.webhook_secret;

const stripe = require('stripe')(stripeSecretKey);

const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

const eventHandler = async (event) => {
  console.log('Processing webhook event:', event.type);
  const eventType = event.type;
  const eventData = event.data;

  switch (eventType) {
    case 'checkout.session.completed': {
      const session = eventData.object;
      const extensionId = session.metadata.extensionId;
      
      console.log('Processing completed checkout for:', extensionId);
      
      // Get the product details
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      const productId = lineItems.data[0].price.product;
      
      console.log('Product purchased:', productId);
      
      // Update user data based on product
      switch(productId) {
        case 'capture_pack10': {
          console.log('Adding 10 credits to:', extensionId);
          await db.collection('users').doc(extensionId).set({
            extensionId: extensionId,
            trialCaptures: admin.firestore.FieldValue.increment(10),
            hasUnlimitedSubscription: false,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            totalCaptures: admin.firestore.FieldValue.increment(10)
          }, { merge: true });
          break;
        }
        case 'capture_pack100': {
          console.log('Adding 100 credits to:', extensionId);
          await db.collection('users').doc(extensionId).set({
            extensionId: extensionId,
            trialCaptures: admin.firestore.FieldValue.increment(100),
            hasUnlimitedSubscription: false,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            totalCaptures: admin.firestore.FieldValue.increment(100)
          }, { merge: true });
          break;
        }
        case 'unlimited_sub': {
          console.log('Activating unlimited subscription for:', extensionId);
          await db.collection('users').doc(extensionId).set({
            extensionId: extensionId,
            hasUnlimitedSubscription: true,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          break;
        }
      }
      
      console.log('Successfully updated user data');
      break;
    }
  }
};

module.exports = {
  eventHandler
};