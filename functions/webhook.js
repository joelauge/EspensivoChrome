const admin = require('firebase-admin');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = admin.firestore();

exports.stripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error(`⚠️ Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const extensionId = session.metadata.extensionId;
        
        // Get the product details
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
        const productId = lineItems.data[0].price.product;
        
        // Get customer details
        const customer = await stripe.customers.retrieve(session.customer);
        
        // Update user credits/subscription based on product
        switch(productId) {
          case 'capture_pack10': {
            await db.collection('users').doc(extensionId).set({
              credits: admin.firestore.FieldValue.increment(10),
              lastPurchase: admin.firestore.FieldValue.serverTimestamp(),
              email: customer.email
            }, { merge: true });
            break;
          }
          case 'capture_pack100': {
            await db.collection('users').doc(extensionId).set({
              credits: admin.firestore.FieldValue.increment(100),
              lastPurchase: admin.firestore.FieldValue.serverTimestamp(),
              email: customer.email
            }, { merge: true });
            break;
          }
          case 'unlimited_sub': {
            await db.collection('users').doc(extensionId).set({
              subscription: {
                status: 'active',
                startDate: admin.firestore.FieldValue.serverTimestamp(),
                type: 'unlimited',
                stripeCustomerId: session.customer
              },
              email: customer.email
            }, { merge: true });
            break;
          }
        }
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        
        // Find user by stripeCustomerId
        const usersRef = db.collection('users');
        const snapshot = await usersRef
          .where('subscription.stripeCustomerId', '==', subscription.customer)
          .get();
        
        if (!snapshot.empty) {
          const userId = snapshot.docs[0].id;
          await usersRef.doc(userId).update({
            'subscription.status': 'cancelled',
            'subscription.endDate': admin.firestore.FieldValue.serverTimestamp()
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        
        // Find user by stripeCustomerId
        const usersRef = db.collection('users');
        const snapshot = await usersRef
          .where('subscription.stripeCustomerId', '==', invoice.customer)
          .get();
        
        if (!snapshot.empty) {
          const userId = snapshot.docs[0].id;
          await usersRef.doc(userId).update({
            'subscription.status': 'payment_failed'
          });
        }
        break;
      }

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error(`Error processing webhook: ${err.message}`);
    return res.status(500).send(`Server Error: ${err.message}`);
  }
}; 