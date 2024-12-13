// Firebase configuration for service worker
const firebaseConfig = {
  apiKey: "AIzaSyAHP9_XPQE3Y2kKAHscnoYLUDyYoBPKqYc",
  authDomain: "espensivo.firebaseapp.com",
  projectId: "espensivo",
  storageBucket: "espensivo.appspot.com",
  messagingSenderId: "282331992610",
  appId: "1:282331992610:web:06ecf1fb019f24427c307b"
};

console.log('Initializing Firebase in service worker');

// Initialize Firebase only if not already initialized
let app;
try {
  if (firebase.apps?.length) {
    console.log('Firebase already initialized in SW, getting existing app');
    app = firebase.app();
  } else {
    console.log('Initializing new Firebase app in SW');
    app = firebase.initializeApp(firebaseConfig);
  }
} catch (error) {
  console.error('Error initializing Firebase in SW:', error);
  throw error;
}

// Get auth instance and attach to self
self.auth = firebase.auth(app); 