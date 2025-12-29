import { state } from './state.js';

export async function initFirebase() {
    if (typeof __firebase_config === 'undefined') {
        console.warn("No Firebase Config found.");
        return false;
    }

    try {
        const fbApp = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js");
        const fbAuth = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js");
        const fbStore = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");

        const firebaseConfig = JSON.parse(__firebase_config);
        if (firebaseConfig.apiKey === "API_KEY_HIER") throw new Error("No Configured API Key");

        const app = fbApp.initializeApp(firebaseConfig);
        state.auth = fbAuth.getAuth(app);
        state.db = fbStore.getFirestore(app);

        // Bind functions to state.fb
        state.fb.signInWithEmailAndPassword = fbAuth.signInWithEmailAndPassword;
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

        return true;
    } catch (e) {
        console.error("Firebase Init Error", e);
        return false;
    }
}
