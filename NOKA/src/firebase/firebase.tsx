// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from 'firebase/firestore';
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBxiOVXohLIJZqSxYACrLxJZQrFa2HDgmw",
  authDomain: "nokajjb.firebaseapp.com",
  projectId: "nokajjb",
  storageBucket: "nokajjb.firebasestorage.app",
  messagingSenderId: "928531829189",
  appId: "1:928531829189:web:212d1682f564da8f247bac"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export const auth = getAuth(app);
export { db }; 
export default app;