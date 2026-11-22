let active = false;
let hasSubscription = false;
let config = null;
let registration = null;
let retryTimer = null;
let busy = false;
let generation = 0;
let current = { active: false, available: false, code: 'loading', message: 'Web Push wird geprüft …' };
const listeners = new Set();
const DELETE_KEY = 'program_push_pending_delete_v1';

export function isProgramPushActive() {
    return active;
}

function publish(code, message, available = Boolean(config?.available)) {
    current = { active, available, code, message };
    for (const listener of listeners) listener(current);
    window.dispatchEvent(new CustomEvent('program-push-status', { detail: { ...current } }));
    return current;
}

function supportIssue() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const installed = navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (ios && !installed) return ['install-required', 'Auf iPhone/iPad zuerst zum Home-Bildschirm hinzufügen und als Web-App öffnen.'];
    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return ['unsupported', 'Web Push wird hier nicht unterstützt (HTTPS und kompatibler Browser erforderlich).'];
    }
    return null;
}

async function request(action, data) {
    const response = await fetch(`/api/program-push/${action}`, {
        credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000),
        ...(data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    });
    if (!response.ok) {
        const error = new Error('Web Push konnte nicht bestätigt werden.');
        error.status = response.status;
        throw error;
    }
    return response.json();
}

function pendingDeletes() {
    try {
        const value = JSON.parse(localStorage.getItem(DELETE_KEY) || '[]');
        return Array.isArray(value) ? value.filter(endpoint => typeof endpoint === 'string').slice(0, 10) : [];
    } catch { return []; }
}

function saveDeletes(endpoints) {
    localStorage.setItem(DELETE_KEY, JSON.stringify([...new Set(endpoints)].slice(-10)));
}

async function flushDeletes() {
    for (const endpoint of pendingDeletes()) {
        await request('unsubscribe', { endpoint });
        saveDeletes(pendingDeletes().filter(value => value !== endpoint));
    }
}

function scheduleRetry() {
    if (retryTimer) return;
    retryTimer = setTimeout(() => { retryTimer = null; void initProgramPush(); }, 15000);
}

export async function initProgramPush() {
    if (busy) return current;
    const attempt = ++generation;
    const issue = supportIssue();
    if (issue) return publish(...issue, false);
    try {
        const loadedConfig = await request('config');
        const worker = await navigator.serviceWorker.getRegistration('/');
        if (attempt !== generation || busy) return current;
        config = loadedConfig;
        registration = worker;
        if (!worker?.active) {
            if (!config.available) return publish('unavailable', 'Server-Web-Push ist nicht eingerichtet; lokale Erinnerungen bleiben unverändert.', false);
            scheduleRetry();
            return publish('worker-pending', 'Service Worker noch nicht bereit.', false);
        }
        const subscription = await registration.pushManager.getSubscription();
        if (attempt !== generation || busy) return current;
        hasSubscription = Boolean(subscription);
        if (pendingDeletes().length) await flushDeletes();
        if (attempt !== generation || busy) return current;
        active = false;
        if (!config.available) return publish('unavailable', 'Server-Web-Push ist nicht eingerichtet; lokale Erinnerungen bleiben unverändert.', false);
        if (subscription && Notification.permission === 'granted') {
            const result = await request('status', { endpoint: subscription.endpoint });
            if (attempt !== generation || busy) return current;
            active = result.active === true;
        }
        if (Notification.permission === 'denied') return publish('denied', 'Benachrichtigungen sind in den Browser-Einstellungen blockiert.');
        return publish(active ? 'active' : 'ready', active
            ? 'Web Push für alle Programmpunkte ist aktiv – auch bei geschlossener Seite. Zustellung kann verzögert sein.'
            : 'Freiwillig: alle Programmpunkte 15 Minuten vorher per Web Push erinnern, auch bei geschlossener Seite.');
    } catch (error) {
        if (attempt !== generation || busy) return current;
        active = false;
        scheduleRetry();
        return publish(error.status === 401 ? 'auth-pending' : 'error', error.status === 401
            ? 'Anmeldung wird vorbereitet. Web Push wird erneut geprüft.'
            : 'Web Push nicht bestätigt. Erneuter Versuch folgt; lokale Erinnerungen bleiben verfügbar.', false);
    }
}

function publicKeyBytes(value) {
    return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), character => character.charCodeAt(0));
}

export async function enableProgramPush() {
    if (busy || !config?.available || !registration?.active || supportIssue()) return current;
    const permissionPromise = Notification.permission === 'default'
        ? Notification.requestPermission() : Promise.resolve(Notification.permission);
    busy = true;
    generation++;
    publish('working', 'Web Push wird aktiviert …');
    let subscription;
    try {
        if (await permissionPromise !== 'granted') return publish('denied', 'Keine Einwilligung: Web Push bleibt deaktiviert.');
        await flushDeletes();
        subscription = await registration.pushManager.getSubscription();
        if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKeyBytes(config.publicKey) });
        hasSubscription = true;
        const result = await request('subscribe', { consent: true, scope: 'all-program-events', subscription: subscription.toJSON() });
        active = result.active === true;
        return publish(active ? 'active' : 'error', active
            ? 'Web Push für alle Programmpunkte ist aktiv – auch bei geschlossener Seite. Zustellung kann verzögert sein.'
            : 'Das Server-Abonnement wurde nicht bestätigt.');
    } catch {
        active = false;
        if (subscription) {
            try { saveDeletes([...pendingDeletes(), subscription.endpoint]); } catch {}
            try { if (await subscription.unsubscribe()) hasSubscription = false; } catch {}
        }
        scheduleRetry();
        return publish('error', 'Aktivierung nicht bestätigt. Bitte erneut versuchen.');
    } finally { busy = false; }
}

export async function disableProgramPush() {
    if (busy) return current;
    busy = true;
    generation++;
    publish('working', 'Web Push wird abgemeldet …');
    try {
        const worker = registration || await navigator.serviceWorker.getRegistration('/');
        const subscription = await worker?.pushManager.getSubscription();
        let persistenceFailed = false;
        if (subscription) {
            try { saveDeletes([...pendingDeletes(), subscription.endpoint]); } catch { persistenceFailed = true; }
            const localRemoved = await subscription.unsubscribe();
            if (!localRemoved) throw new Error('Lokale Abmeldung fehlgeschlagen');
            hasSubscription = false;
            active = false;
            await request('unsubscribe', { endpoint: subscription.endpoint });
            if (!persistenceFailed) saveDeletes(pendingDeletes().filter(value => value !== subscription.endpoint));
        }
        await flushDeletes();
        active = false;
        return publish('ready', 'Web Push ist abgemeldet. Geräte-Abonnement und Versandjobs wurden gelöscht.');
    } catch {
        scheduleRetry();
        return publish('delete-pending', 'Abmeldung nicht vollständig bestätigt; Server-Löschung wird erneut versucht.');
    } finally { busy = false; }
}

export function bindProgramPush({ button = document.getElementById('program-push-toggle'), status = document.getElementById('program-push-status') } = {}) {
    const render = value => {
        if (status) status.textContent = value.message;
        if (button) {
            button.textContent = active || hasSubscription ? 'Web Push abmelden' : 'Web Push für alle Programmpunkte aktivieren';
            button.disabled = value.code === 'working' || (!active && !hasSubscription && (!value.available || value.code === 'denied'));
            button.setAttribute('aria-pressed', String(active));
        }
    };
    const click = () => { void (active || hasSubscription ? disableProgramPush() : enableProgramPush()); };
    const refresh = () => { if (!document.hidden) void initProgramPush(); };
    listeners.add(render);
    render(current);
    button?.addEventListener('click', click);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
        listeners.delete(render);
        button?.removeEventListener('click', click);
        window.removeEventListener('online', refresh);
        document.removeEventListener('visibilitychange', refresh);
    };
}
