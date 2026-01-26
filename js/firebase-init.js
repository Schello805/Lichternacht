import { state } from './state.js';

export async function initFirebase() {
    if (typeof __firebase_config === 'undefined') {
        console.warn("No Firebase Config found.");
        return false;
    }

    let firebaseConfig;
    try {
        firebaseConfig = JSON.parse(__firebase_config);
    } catch (e) {
        console.warn("Invalid Firebase Config (JSON parse failed).");
        return false;
    }

    const apiKey = (firebaseConfig && typeof firebaseConfig.apiKey === 'string') ? firebaseConfig.apiKey.trim() : '';
    const isPlaceholderKey = apiKey === '' || apiKey === 'API_KEY_HIER' || apiKey === 'DEIN_API_KEY';
    if (isPlaceholderKey) {
        console.warn("Firebase Config present, but apiKey is not configured. Skipping Firebase init.");
        return false;
    }

    try {
        const fbApp = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js");
        const fbAuth = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js");
        const fbStore = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
        console.log("Firebase Firestore loaded:", Object.keys(fbStore));

        // Make all Firebase exports available (avoids missing functions like doc/query in some call sites)
        Object.assign(state.fb, fbAuth, fbStore);

        const app = fbApp.initializeApp(firebaseConfig);
        state.auth = fbAuth.getAuth(app);
        state.db = fbStore.getFirestore(app);

        // Bind functions to state.fb
        state.fb.signInWithEmailAndPassword = fbAuth.signInWithEmailAndPassword;
        state.fb.createUserWithEmailAndPassword = fbAuth.createUserWithEmailAndPassword;
        state.fb.signInAnonymously = fbAuth.signInAnonymously;
        state.fb.signOut = fbAuth.signOut;
        state.fb.onAuthStateChanged = fbAuth.onAuthStateChanged;

        state.fb.collection = fbStore.collection;
        state.fb.doc = fbStore.doc;
        state.fb.getDocs = fbStore.getDocs;
        state.fb.getDoc = fbStore.getDoc;
        state.fb.setDoc = fbStore.setDoc;
        state.fb.updateDoc = fbStore.updateDoc;
        state.fb.deleteDoc = fbStore.deleteDoc;
        state.fb.onSnapshot = fbStore.onSnapshot; // Added
        state.fb.serverTimestamp = fbStore.serverTimestamp;
        state.fb.increment = fbStore.increment;
        state.fb.query = fbStore.query;
        state.fb.where = fbStore.where;
        state.fb.getCountFromServer = fbStore.getCountFromServer;
        state.fb.writeBatch = fbStore.writeBatch;

        state.useLocalStorage = false;

        return true;
    } catch (e) {
        console.error("Firebase Init Error", e);
        return false;
    }
}
