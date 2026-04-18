import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence, collection, doc, setDoc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAX_COMiCzAqTB_ScMvHD2p0hpTYHlzSU0",
  authDomain: "nepal-mavi-attendance.firebaseapp.com",
  projectId: "nepal-mavi-attendance",
  storageBucket: "nepal-mavi-attendance.firebasestorage.app",
  messagingSenderId: "6616294188",
  appId: "1:6616294188:web:73dd5c00b4fdce43aa4289",
  measurementId: "G-JQFPJQF8V8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Enable offline caching (critical for offline-first usage)
enableIndexedDbPersistence(db)
  .catch((err) => {
      if (err.code === 'failed-precondition') {
          console.warn('Multiple tabs open, offline persistence disabled for this tab.');
      } else if (err.code === 'unimplemented') {
          console.warn('Browser does not support offline persistence.');
      }
  });

// Expose Firebase functions to window global so our traditional db.js can access them
window.FirestoreDB = db;
window.FirestoreFns = { collection, doc, setDoc, getDoc, getDocs };

console.log('🔥 Firebase Initialized with Offline Persistence Enabled');
