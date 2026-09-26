// 1. Create a free project at https://console.firebase.google.com
// 2. Add a Web App to it, and enable "Realtime Database" (start in test mode).
// 3. Paste the config object it gives you below, replacing this placeholder.
// See README.md for the full walkthrough.

const firebaseConfig = {
  apiKey: "AIzaSyCBb8QIgSYWRau6h3AibFTno98EDS2rJMU",
  authDomain: "flaggame-60a0e.firebaseapp.com",
  databaseURL: "https://flaggame-60a0e-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "flaggame-60a0e",
  storageBucket: "flaggame-60a0e.firebasestorage.app",
  messagingSenderId: "461123384638",
  appId: "1:461123384638:web:8879ae0f7b85e82ffb286f",
};

let db = null;
let firebaseReady = false;

try {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY") {
    firebaseReady = false;
  } else {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    firebaseReady = true;
  }
} catch (e) {
  console.warn("Firebase not configured yet:", e);
  firebaseReady = false;
}
