import { state } from './state.js';
import { initializeLocalBackend } from './local-backend.js?v=1.4.301';

async function request(action, data = {}) {
    const response = await fetch(`./api/local-auth/${action}`, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();
    if (!response.ok) {
        const error = new Error(result.error || 'Lokale Anmeldung fehlgeschlagen');
        error.code = response.status === 401 ? 'auth/invalid-credential' : 'auth/unavailable';
        throw error;
    }
    return result;
}

function reference(...parts) {
    const path = parts.flatMap(part => typeof part === 'string' ? [part] : part?.path ? [part.path] : []).join('/');
    return { path, id: path.split('/').at(-1) };
}

function showResetForm(token) {
    history.replaceState(null, '', location.pathname + location.search);
    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 z-[5000] flex items-center justify-center bg-black/60 p-4';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Passwort zurücksetzen');
    dialog.innerHTML = '<form class="w-full max-w-md rounded-2xl bg-white p-6 text-gray-900"><h2 class="mb-4 text-xl font-bold">Neues Passwort</h2><label class="block">Mindestens 12 Zeichen<input name="password" type="password" minlength="12" maxlength="1024" required autocomplete="new-password" class="my-3 w-full rounded border p-3"></label><label class="block">Passwort wiederholen<input name="confirmation" type="password" minlength="12" maxlength="1024" required autocomplete="new-password" class="my-3 w-full rounded border p-3"></label><p role="status" class="my-3 text-sm"></p><button type="submit" class="rounded bg-blue-600 px-4 py-2 text-white">Passwort speichern</button><button type="button" class="ml-3 rounded border px-4 py-2">Schließen</button></form>';
    const form = dialog.querySelector('form');
    dialog.querySelector('[type="button"]').onclick = () => dialog.remove();
    form.onsubmit = async event => {
        event.preventDefault();
        const password = form.elements.password.value;
        const status = form.querySelector('[role="status"]');
        if (password !== form.elements.confirmation.value) {
            status.textContent = 'Die Passwörter stimmen nicht überein.';
            return;
        }
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        try {
            await request('reset', { token, password });
            form.elements.password.value = '';
            form.elements.confirmation.value = '';
            status.textContent = 'Passwort geändert. Du kannst dich jetzt neu anmelden.';
        } catch (error) {
            status.textContent = error.message;
            submit.disabled = false;
        }
    };
    document.body.append(dialog);
    form.elements.password.focus();
}

export async function initializeLocalAuth() {
    let required = false;
    try { required = localStorage.getItem('local_auth_enabled') === 'true'; } catch {}
    const response = await fetch('./api/local-auth/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (response.status === 404) {
        if (required) throw new Error('Lokale Anmeldung deaktiviert. Automatischer Anbieterwechsel wurde verhindert.');
        return false;
    }
    if (!response.ok) throw new Error('Lokale Anmeldung nicht erreichbar');
    const session = await response.json();
    if (!session.enabled) throw new Error('Ungültige lokale Anmeldung');
    const observers = new Set();
    const auth = { currentUser: null };
    let revision = 0;
    let authQueue = Promise.resolve();
    const setUser = user => {
        revision += 1;
        auth.currentUser = user ? { ...user, getIdToken: async () => 'local-session' } : null;
        for (const observer of observers) Promise.resolve().then(() => observer(auth.currentUser)).catch(error => console.error('Anmeldestatus konnte nicht aktualisiert werden', error));
    };
    const mutateAuth = (action, data = {}) => {
        const operation = authQueue.then(async () => {
            if (action === 'anonymous' && auth.currentUser) return { user: auth.currentUser };
            const result = await request(action, data);
            setUser(result.user || null);
            return { user: auth.currentUser };
        });
        authQueue = operation.catch(() => {});
        return operation;
    };
    setUser(session.user);
    state.auth = auth;
    state.localAuth = true;
    try { localStorage.setItem('local_auth_enabled', 'true'); } catch {}
    state.db = { local: true };
    state.fb = {
        doc: reference, collection: reference,
        onAuthStateChanged: (_auth, observer) => {
            observers.add(observer);
            Promise.resolve().then(() => { if (observers.has(observer)) return observer(auth.currentUser); }).catch(error => console.error('Anmeldestatus konnte nicht aktualisiert werden', error));
            return () => observers.delete(observer);
        },
        signInWithEmailAndPassword: (_auth, email, password) => mutateAuth('login', { email, password }),
        signInAnonymously: () => mutateAuth('anonymous'),
        signOut: () => mutateAuth('logout'),
        createUserWithEmailAndPassword: async (_auth, email, password) => request('create-admin', { email, password }),
        deleteLocalAdmin: async uid => request('delete-admin', { uid }),
        sendPasswordResetEmail: async (_auth, email) => request('request-reset', { email })
    };
    if (!await initializeLocalBackend()) throw new Error('Lokale Anmeldung benötigt die lokale Datenbank');
    state.useLocalStorage = false;
    const handleRecovery = () => {
        const recovery = new URLSearchParams(location.hash.slice(1)).get('reset-password');
        if (recovery) showResetForm(recovery);
    };
    handleRecovery();
    window.addEventListener('hashchange', handleRecovery);
    const updateSession = async () => {
        if (document.visibilityState === 'hidden') return;
        const requestRevision = revision;
        try {
            const result = await fetch('./api/local-auth/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000) });
            if (!result.ok) return;
            const current = (await result.json()).user;
            if (requestRevision !== revision) return;
            if (current?.uid !== auth.currentUser?.uid || Boolean(current?.isAdmin) !== Boolean(auth.currentUser?.isAdmin)) setUser(current);
        } catch {}
    };
    window.addEventListener('focus', updateSession);
    window.setInterval(updateSession, 60000);
    document.getElementById('local-password-reset-btn')?.classList.remove('hidden');
    return true;
}

export async function requestLocalPasswordReset() {
    const email = document.getElementById('admin-email')?.value.trim();
    const status = document.getElementById('login-error');
    if (!email) {
        if (status) { status.textContent = 'Bitte zuerst deine E-Mail-Adresse eingeben.'; status.classList.remove('hidden'); }
        return;
    }
    try {
        await request('request-reset', { email });
        if (status) status.textContent = 'Falls ein Konto existiert, erhältst du einen Link zum Zurücksetzen.';
    } catch (error) { if (status) status.textContent = error.message; }
    status?.classList.remove('hidden');
}
