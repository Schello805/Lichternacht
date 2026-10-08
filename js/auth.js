import { state } from './state.js';
import { showToast } from './utils.js?v=1.4.185';
import { loadData } from './data.js?v=1.4.185';
import { refreshMapMarkers } from './maplibre-map.js?v=1.4.185';
import { renderTimeline } from './ui.js?v=1.4.185';

function setLoginError(message = '') {
    const errorElement = document.getElementById('login-error');
    if (!errorElement) return;
    errorElement.textContent = message;
    errorElement.classList.toggle('hidden', !message);
}

export async function performLogin() {
    console.log("performLogin called");
    const email = document.getElementById('admin-email').value;
    const pass = document.getElementById('admin-pass').value;

    setLoginError();
    if (!email || !pass) {
        setLoginError('Bitte E-Mail und Passwort eingeben.');
        return;
    }

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
            if (window.pendingAdminOpen && window.toggleAdminPanel) {
                window.pendingAdminOpen = false;
                window.toggleAdminPanel();
            }
            return;
        }

        setLoginError('Anmeldung ist gerade nicht verfügbar. Bitte Verbindung prüfen und erneut versuchen.');
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
            setLoginError();
            console.log("Modal closed");
        } else {
            console.error("Login modal not found");
        }

        showToast('Erfolgreich angemeldet', 'success');
    } catch (e) {
        console.error("Login error:", e);
        const message = e?.code === 'auth/invalid-credential'
            ? 'E-Mail oder Passwort ist nicht korrekt.'
            : 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.';
        setLoginError(message);
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
    const adminOnlineDot = document.getElementById('admin-online-dot');
    if (state.isAdmin) {
        document.body.classList.add('admin-mode');
        document.getElementById('admin-bar').classList.remove('hidden');
        document.getElementById('lock-icon').classList.replace('ph-lock-key', 'ph-lock-key-open');
        document.getElementById('lock-icon').classList.add('text-green-500');
        adminOnlineDot?.classList.remove('hidden');
    } else {
        if (window.closeAdminPage) window.closeAdminPage();
        document.body.classList.remove('admin-mode');
        document.getElementById('admin-bar').classList.add('hidden');
        document.getElementById('lock-icon').classList.replace('ph-lock-key-open', 'ph-lock-key');
        document.getElementById('lock-icon').classList.remove('text-green-500');
        adminOnlineDot?.classList.add('hidden');
    }
    if (window.updateAdminUiAvailability) window.updateAdminUiAvailability();
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
                await loadData();
                return;
            }

            // Authenticated Users (Admins)
            const { doc, getDoc, setDoc, serverTimestamp } = state.fb;
            const userRef = doc(state.db, 'artifacts', state.appId, 'public', 'data', 'users', user.uid);
            const globalAdminRef = doc(state.db, 'globalAdmins', user.uid);
            
            try {
                const [userSnap, globalAdminSnap] = await Promise.all([
                    getDoc(userRef),
                    getDoc(globalAdminRef)
                ]);
                
                if (globalAdminSnap.exists() || userSnap.exists()) {
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
                    if (window.pendingAdminOpen && window.toggleAdminPanel) {
                        window.pendingAdminOpen = false;
                        window.toggleAdminPanel();
                    }
                } else {
                    // Invalid User (Not in Firestore whitelist)
                    console.warn("User not found in whitelist. Logging out.");
                    await state.fb.signOut(state.auth);
                    showToast("Zugriff verweigert (Nicht autorisiert)", 'error');
                }
            } catch (e) {
                console.error("Auth Check Error", e);
                setAdminState(false);
                await state.fb.signOut(state.auth);
                showToast("Admin-Berechtigung konnte nicht geprüft werden.", 'error');
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

    if (window.updateAdminUiAvailability) window.updateAdminUiAvailability();

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
