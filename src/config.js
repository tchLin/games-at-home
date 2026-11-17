// Supplied at build time; never commit a live key here.
// This browser key is still visible in the deployed bundle. Security relies on
// Firebase rules and its API/website restrictions, not on hiding this value.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "gaming-at-home.firebaseapp.com",
  databaseURL: "https://gaming-at-home-default-rtdb.firebaseio.com",
  projectId: "gaming-at-home",
  appId: "1:486979260350:web:a702690b206d5f8d8933ef",
};
