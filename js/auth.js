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

    try {
        console.log("Attempting sign in...");
        await state.fb.signInWithEmailAndPassword(state.auth, email, pass);
        console.log("Sign in successful");
        const modal = document.getElementById('login-modal');
        if (modal) modal.classList.add('hidden');
        else console.error("Login modal not found in DOM");
        showToast('Erfolgreich angemeldet', 'success');
    } catch (e) {
        console.error("Login error:", e);
        showToast('Login fehlgeschlagen: ' + e.message, 'error');
    }
}

export async function logoutAdmin() {
    try {
        await state.fb.signOut(state.auth);
        showToast('Abgemeldet', 'info');
    } catch (e) {
        console.error(e);
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

    state.fb.onAuthStateChanged(state.auth, async (user) => {
        if (user) {
            if (user.isAnonymous) {
                console.log("User is anonymous");
                setAdminState(false);
            } else if (user.email === "michael@schellenberger.biz") {
                console.log("User is admin (" + user.email + ")");
                setAdminState(true);
            } else {
                console.log("User is authenticated but not admin");
                setAdminState(false);
            }
            btn.innerText = "Online";
            btn.classList.replace('text-gray-500', 'text-green-500');
            showToast('Online-Modus aktiviert', 'success');
            await loadData();
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

function enableOfflineMode(btn) {
    state.useLocalStorage = true;
    btn.innerText = "Lokal";
    btn.title = "Daten werden nur im Browser gespeichert";
    showToast('Lokal-Modus (kein Server)', 'info');
    loadData();
}
