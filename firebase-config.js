// Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyAHP9_XPQE3Y2kKAHscnoYLUDyYoBPKqYc",
  authDomain: "espensivo.firebaseapp.com",
  projectId: "espensivo",
  storageBucket: "espensivo.appspot.com",
  messagingSenderId: "282331992610",
  appId: "1:282331992610:web:06ecf1fb019f24427c307b"
};

// Create a singleton instance
let authInstance = null;

function getAuth() {
  if (authInstance) {
    console.log('Returning existing auth instance');
    return authInstance;
  }

  console.log('Creating new auth instance');
  if (!firebase.apps.length) {
    console.log('Initializing new Firebase app');
    firebase.initializeApp(firebaseConfig);
  } else {
    console.log('Using existing Firebase app');
  }

  authInstance = firebase.auth();
  return authInstance;
}

// Export the auth instance getter
export const auth = getAuth();