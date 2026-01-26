import { state } from './state.js';
import { showToast } from './utils.js';
import { loadData } from './data.js';
import { refreshMapMarkers } from './map.js';
import { renderTimeline } from './ui.js';

export async function performLogin() {
    console.log("performLogin called");
    const email = document.getElementById('admin-email').value;
    const pass = document.getElementById('admin-pass').value;

    if (!email || !pass) { showToast('Bitte Email und Passwort eingeben', 'error'); return; }

    if (!state.fb || typeof state.fb.signInWithEmailAndPassword !== 'function') {
        // Local-dev fallback: allow enabling admin mode without Firebase so you can test station creation.
        // This is intentionally limited to localhost environments.
        const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (isLocalhost) {
            state.useLocalStorage = true;
            setAdminState(true);
            const modal = document.getElementById('login-modal');
            if (modal) modal.classList.add('hidden');
            showToast('Lokaler Admin-Modus aktiviert (ohne Firebase Sync)', 'info');
            return;
        }

        showToast('Fehler: Firebase nicht initialisiert (config.js fehlt?)', 'error');
        console.error("Firebase auth functions missing in state.fb");
        return;
    }

    try {
        console.log("Attempting sign in...");
        await state.fb.signInWithEmailAndPassword(state.auth, email, pass);
        console.log("Sign in successful");

        const modal = document.getElementById('login-modal');
        if (modal) {
            modal.classList.add('hidden');
            console.log("Modal closed");
        } else {
            console.error("Login modal not found");
        }

        showToast('Erfolgreich angemeldet', 'success');
    } catch (e) {
        console.error("Login error:", e);
        showToast('Login fehlgeschlagen: ' + e.message, 'error');
    }
}

export async function logoutAdmin() {
    try {
        if (!state.fb || typeof state.fb.signOut !== 'function') {
            setAdminState(false);
            showToast('Abgemeldet', 'info');
            return;
        }
        await state.fb.signOut(state.auth);
        showToast('Abgemeldet', 'info');
    } catch (e) {
        console.error(e);
    }
}

export async function createNewUser(email, pass) {
    if (!confirm(`Achtung: Das Erstellen eines neuen Benutzers (${email}) loggt dich sofort als dieser Benutzer ein. Du verlierst temporär den Admin-Zugriff. Fortfahren?`)) return;

    if (!state.fb || typeof state.fb.createUserWithEmailAndPassword !== 'function') {
        showToast('Nicht verfügbar ohne Firebase (config.js fehlt?)', 'error');
        return;
    }

    try {
        await state.fb.createUserWithEmailAndPassword(state.auth, email, pass);
        showToast(`Benutzer ${email} erstellt und eingeloggt`, 'success');
        // Admin state will automatically update via onAuthStateChanged
    } catch (e) {
        console.error("Create User Error:", e);
        showToast('Fehler: ' + e.message, 'error');
    }
}

export function setAdminState(admin) {
    state.isAdmin = admin;
    if (state.isAdmin) {
        document.body.classList.add('admin-mode');
        document.getElementById('admin-bar').classList.remove('hidden');
        document.getElementById('lock-icon').classList.replace('ph-lock-key', 'ph-lock-key-open');
        document.getElementById('lock-icon').classList.add('text-green-500');
    } else {
        document.body.classList.remove('admin-mode');
        document.getElementById('admin-bar').classList.add('hidden');
        document.getElementById('lock-icon').classList.replace('ph-lock-key-open', 'ph-lock-key');
        document.getElementById('lock-icon').classList.remove('text-green-500');
    }
    refreshMapMarkers();
    renderTimeline();
}

export function initAuthListener() {
    const btn = document.getElementById('status-indicator');

    if (!state.fb || typeof state.fb.onAuthStateChanged !== 'function') {
        enableOfflineMode(btn);
        return;
    }

    state.fb.onAuthStateChanged(state.auth, async (user) => {
        if (user) {
            // Anonymous users are always allowed (read-only usually)
            if (user.isAnonymous) {
                console.log("User is anonymous");
                setAdminState(false);
                btn.innerText = "Online";
                btn.classList.replace('text-gray-500', 'text-green-500');
                showToast('Online-Modus aktiviert', 'success');
                await loadData();
                return;
            }

            // Authenticated Users (Admins)
            const { doc, getDoc, setDoc, serverTimestamp } = state.fb;
            const userRef = doc(state.db, 'artifacts', state.appId, 'public', 'data', 'users', user.uid);
            
            // Super Admin Hardcoded Bypass
            const isSuperAdmin = (user.email === "michael@schellenberger.biz");
            
            try {
                const userSnap = await getDoc(userRef);
                
                if (isSuperAdmin || userSnap.exists()) {
                    // Valid User -> Update Metadata
                    await setDoc(userRef, {
                        email: user.email,
                        lastSeen: serverTimestamp(),
                        uid: user.uid
                    }, { merge: true });

                    console.log(`User ${user.email} logged in.`);
                    setAdminState(true);
                    
                    btn.innerText = "Admin";
                    btn.classList.replace('text-gray-500', 'text-green-500');
                    showToast(`Hallo ${user.email}!`, 'success');
                    await loadData();
                } else {
                    // Invalid User (Not in Firestore whitelist)
                    console.warn("User not found in whitelist. Logging out.");
                    await state.fb.signOut(state.auth);
                    showToast("Zugriff verweigert (Nicht autorisiert)", 'error');
                }
            } catch (e) {
                console.error("Auth Check Error", e);
                // Fallback for safety
                if(isSuperAdmin) {
                     setAdminState(true);
                     await loadData();
                }
            }

        } else {
            // No user, reset admin state immediately
            setAdminState(false);

            // Sign in anonymously
            state.fb.signInAnonymously(state.auth).catch(e => {
                console.error("Anon Auth Error", e);
                enableOfflineMode(btn);
            });
        }
    });
}

let logoutTimer;
function resetLogoutTimer() {
    if (!state.isAdmin) return;
    
    if (logoutTimer) clearTimeout(logoutTimer);
    
    // Auto-logout after 60 minutes (3600000 ms)
    logoutTimer = setTimeout(() => {
        if (state.isAdmin) {
            console.log("Auto-logout due to inactivity");
            logoutAdmin();
            alert("Du wurdest automatisch ausgeloggt (60 Min. Inaktivität).");
        }
    }, 60 * 60 * 1000);
}

// Attach listeners for activity
['click', 'mousemove', 'keydown', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, resetLogoutTimer);
});

function enableOfflineMode(btn) {
    state.useLocalStorage = true;
    btn.innerText = "Lokal";
    btn.title = "Daten werden nur im Browser gespeichert";
    showToast('Lokal-Modus (kein Server)', 'info');

    const userCountEl = document.getElementById('user-count');
    if (userCountEl) {
        const span = userCountEl.querySelector('span');
        if (span) span.innerText = '1';
        userCountEl.classList.remove('hidden');
        userCountEl.classList.add('flex');
        userCountEl.title = 'Aktive Nutzer: nur dieses Gerät (Offline)';
    }
    loadData();
}
